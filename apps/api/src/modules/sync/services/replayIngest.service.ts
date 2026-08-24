import { offlineOperationEnvelopeSchema, syncConflictEnvelopeSchema } from '@breeyo/validators';
import { ResolutionState, SyncVisibilityState, type SyncConflictEnvelope } from '@breeyo/types';

/**
 * Minimal Prisma delegate surface this service needs, kept as a local
 * interface rather than importing the generated `PrismaClient`/`TenantPrismaClient`
 * type directly -- matches the `PermissionsProvider` convention in
 * `apps/api/src/modules/inventory/sync-operation.service.ts`. The concrete
 * `SyncReplayReceipt`/`SyncConflictRecord`/`SyncFailureTask` delegates only
 * exist on the generated client after Task 3's blocking `prisma generate`
 * runs, which is deliberately NOT part of this task -- this interface lets
 * the service and its tests be written and proven correct now, with
 * `routes.ts` wiring the real `request.db` in once Task 3 regenerates it.
 */
export interface ReplayIngestPrismaClient {
  syncReplayReceipt: {
    findUnique(args: {
      where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
    }): Promise<{ operationId: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ operationId: string }>;
  };
  syncConflictRecord: {
    findUnique(args: {
      where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
    }): Promise<{ id: string } | null>;
    findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  syncFailureTask: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

/** Values the replay ingress derives from the authenticated request -- never
 *  from the replayed payload itself (T-10-01: mobile replay payloads are
 *  untrusted input crossing into trusted persistence). */
export interface AuthenticatedReplayContext {
  clinicId: string;
  userId: string;
  deviceId: string;
}

export interface ReplayIngestInput {
  /** Raw, unvalidated operation envelopes -- validated per-item below so one
   *  malformed envelope in a batch cannot fail the whole replay. */
  operations: unknown[];
  /** Raw, unvalidated conflict envelopes a domain adapter already detected
   *  (e.g. a mismatch between the offline device's local state and the
   *  server's current state) and wants persisted for review (D-05 to D-10)
   *  instead of silently overwritten. */
  conflicts?: unknown[];
}

export interface ReplayAckResult {
  acknowledgedOperationIds: string[];
  deferredOperationIds: string[];
  conflictsCreated: SyncConflictEnvelope[];
  failureTaskIds: string[];
  processedAt: string;
  visibilityState: SyncVisibilityState;
}

const OPEN_CONFLICT_STATES = [ResolutionState.OPEN, ResolutionState.GUIDED_RETRY, ResolutionState.ESCALATED];

function stringField(raw: unknown, field: string): string {
  if (raw && typeof raw === 'object' && field in raw) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

/**
 * Server-side replay ingress (PLT-03, T-10-01 to T-10-03). This is the trust
 * boundary where untrusted mobile replay payloads cross into trusted
 * persistence: every envelope is parsed with the shared zod schemas from
 * `@breeyo/validators` before anything is written, idempotency is enforced
 * on `deviceId + operationId + clinicId` so a duplicate or flapping replay
 * is a no-op rather than a duplicate write, and conflicts/failures are
 * persisted explicitly instead of silently applying last-write-wins.
 *
 * `clinicId` and `userId` always come from `AuthenticatedReplayContext`
 * (derived server-side from the authenticated session by the route handler)
 * -- values on the envelope itself are ignored for persistence, even if
 * present, so a compromised or buggy client cannot write into another
 * clinic's tenant space by spoofing those fields.
 */
export class ReplayIngestService {
  constructor(private readonly db: ReplayIngestPrismaClient) {}

  async ingest(context: AuthenticatedReplayContext, input: ReplayIngestInput): Promise<ReplayAckResult> {
    const acknowledgedOperationIds: string[] = [];
    const deferredOperationIds: string[] = [];
    const failureTaskIds: string[] = [];
    const conflictsCreated: SyncConflictEnvelope[] = [];

    const rawOperations = Array.isArray(input.operations) ? input.operations : [];
    for (const raw of rawOperations) {
      // eslint-disable-next-line no-await-in-loop -- idempotency/conflict
      // checks must happen in submission order within one batch.
      await this.ingestOneOperation(context, raw, acknowledgedOperationIds, deferredOperationIds, failureTaskIds);
    }

    const rawConflicts = Array.isArray(input.conflicts) ? input.conflicts : [];
    for (const raw of rawConflicts) {
      // eslint-disable-next-line no-await-in-loop
      await this.ingestOneConflict(context, raw, conflictsCreated, failureTaskIds);
    }

    return {
      acknowledgedOperationIds,
      deferredOperationIds,
      conflictsCreated,
      failureTaskIds,
      processedAt: new Date().toISOString(),
      visibilityState: this.deriveVisibilityState(failureTaskIds, conflictsCreated, deferredOperationIds),
    };
  }

  private deriveVisibilityState(
    failureTaskIds: string[],
    conflictsCreated: SyncConflictEnvelope[],
    deferredOperationIds: string[],
  ): SyncVisibilityState {
    if (failureTaskIds.length > 0) return SyncVisibilityState.FAILED;
    if (conflictsCreated.length > 0) return SyncVisibilityState.CONFLICT;
    if (deferredOperationIds.length > 0) return SyncVisibilityState.PENDING;
    return SyncVisibilityState.CAUGHT_UP;
  }

  private async ingestOneOperation(
    context: AuthenticatedReplayContext,
    raw: unknown,
    acknowledgedOperationIds: string[],
    deferredOperationIds: string[],
    failureTaskIds: string[],
  ): Promise<void> {
    const parsed = offlineOperationEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      const taskId = await this.createFailureTask(context, stringField(raw, 'operationId'), stringField(raw, 'domain'), message);
      failureTaskIds.push(taskId);
      return;
    }

    const envelope = parsed.data;

    const existingReceipt = await this.db.syncReplayReceipt.findUnique({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId: envelope.operationId,
        },
      },
    });

    if (existingReceipt) {
      // Idempotent no-op (T-10-03): a duplicate or flapping replay of an
      // already-acknowledged operation must not create a second receipt or
      // re-apply any side effect.
      acknowledgedOperationIds.push(envelope.operationId);
      return;
    }

    const openConflict = await this.db.syncConflictRecord.findFirst({
      where: {
        clinicId: context.clinicId,
        domain: envelope.domain,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
        resolutionState: { in: OPEN_CONFLICT_STATES },
      },
    });

    if (openConflict) {
      // D-05: review before overwrite -- do not stack another write on an
      // entity that already has an unresolved conflict. The operation stays
      // in the mobile backlog (not dropped) and is expected to be replayed
      // again after the conflict resolves.
      deferredOperationIds.push(envelope.operationId);
      return;
    }

    await this.db.syncReplayReceipt.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId: envelope.operationId,
        // Server-derived, never the envelope's own userId (T-10-01).
        userId: context.userId,
        domain: envelope.domain,
        entityType: envelope.entityType,
        entityId: envelope.entityId,
      },
    });

    acknowledgedOperationIds.push(envelope.operationId);
  }

  private async ingestOneConflict(
    context: AuthenticatedReplayContext,
    raw: unknown,
    conflictsCreated: SyncConflictEnvelope[],
    failureTaskIds: string[],
  ): Promise<void> {
    const parsed = syncConflictEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      const taskId = await this.createFailureTask(context, stringField(raw, 'operationId'), stringField(raw, 'domain'), message);
      failureTaskIds.push(taskId);
      return;
    }

    const conflict = parsed.data;

    const existingConflict = await this.db.syncConflictRecord.findUnique({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId: conflict.operationId,
        },
      },
    });

    if (existingConflict) {
      // Idempotent no-op: the same conflict must not be persisted twice.
      return;
    }

    // D-09, D-22: the originating user owns first attempt; a
    // SAFETY_CRITICAL conflict already carries an explicit
    // `resolutionOwnerUserId` (enforced by the zod schema), so the current
    // owner is that named clinician, falling back to a recommended owner,
    // falling back to the originating user for operational conflicts with
    // neither.
    const currentOwnerUserId = conflict.resolutionOwnerUserId ?? conflict.recommendedOwnerUserId ?? context.userId;

    await this.db.syncConflictRecord.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId: conflict.operationId,
        domain: conflict.domain,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        severity: conflict.severity,
        localPayloadJson: conflict.localPayload,
        serverPayloadJson: conflict.serverPayload,
        recommendedOwnerUserId: conflict.recommendedOwnerUserId ?? null,
        resolutionOwnerUserId: conflict.resolutionOwnerUserId ?? null,
        originatingUserId: context.userId,
        currentOwnerUserId,
        resolutionState: ResolutionState.OPEN,
      },
    });

    conflictsCreated.push({ ...conflict, clinicId: context.clinicId, deviceId: context.deviceId });
  }

  private async createFailureTask(
    context: AuthenticatedReplayContext,
    operationId: string,
    domain: string,
    validationMessage: string,
  ): Promise<string> {
    const task = await this.db.syncFailureTask.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId,
        domain,
        // D-22: the originating user owns the first (guided) retry.
        originatingUserId: context.userId,
        currentOwnerUserId: context.userId,
        guidedRetryCount: 0,
        resolutionState: ResolutionState.OPEN,
        nextSuggestedAction: `Fix and resend: ${validationMessage}`,
        lastAttemptedAt: new Date(),
      },
    });
    return task.id;
  }
}
