import { Prisma } from '@prisma/client';
import { offlineOperationEnvelopeSchema, syncConflictEnvelopeSchema } from '@breeyo/validators';
import { ReplayPriority, ResolutionState, SyncVisibilityState, type SyncConflictEnvelope } from '@breeyo/types';
import { ReplayBroadcastService } from './replayBroadcast.service.js';
import { QueuePreemptionService } from '../../queue/services/queuePreemption.service.js';

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
  /**
   * Verify-fix 10.3: `broadcast` defaults to a no-op instance (`io: null`)
   * matching `BrowserSyncService`'s own convention -- every existing/test
   * caller that does not pass one keeps working unchanged, while
   * `routes.ts` wires a real `ReplayBroadcastService(fastify.io)` in for
   * production so a browser tab watching the affected clinic actually hears
   * about a replayed mobile write instead of the push being dead code.
   *
   * Verify-fix 10.7: `queuePreemption` defaults to a real
   * `QueuePreemptionService` instance (it is stateless, same convention) so
   * every existing/test caller that does not pass one keeps working
   * unchanged, while every real call site gets genuine server-side D-12 to
   * D-14 enforcement without having to remember to wire it in.
   */
  constructor(
    private readonly db: ReplayIngestPrismaClient,
    private readonly broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
    private readonly queuePreemption: QueuePreemptionService = new QueuePreemptionService(),
  ) {}

  async ingest(context: AuthenticatedReplayContext, input: ReplayIngestInput): Promise<ReplayAckResult> {
    const acknowledgedOperationIds: string[] = [];
    const deferredOperationIds: string[] = [];
    const failureTaskIds: string[] = [];
    const conflictsCreated: SyncConflictEnvelope[] = [];

    const rawOperations = Array.isArray(input.operations) ? input.operations : [];

    // Verify-fix 10.7 (T-10-05, D-12 to D-14): this shared ingress is the one
    // path any client -- including one bypassing the mobile coordinator's own
    // tier-ordering, or bypassing the queue-specific `/queue/sync/replay`
    // endpoint entirely -- can reach for ANY domain, including 'queue'. Start
    // from "every QUEUE_HIGH envelope in this clinic-scoped batch counts as
    // not-yet-acknowledged" and only shrink the set once that operation is
    // actually acknowledged below, so `pauseLowerTierReplayForQueue` (built
    // in Plan 10-02 but never called by anything until this fix) has a real,
    // server-computed `queueHighPendingCount` to enforce against instead of
    // trusting the submitting device's own ordering.
    const queueHighPending = new Set<string>();
    for (const raw of rawOperations) {
      const parsed = offlineOperationEnvelopeSchema.safeParse(raw);
      if (parsed.success && parsed.data.priority === ReplayPriority.QUEUE_HIGH) {
        // A QUEUE_HIGH envelope that already has a receipt (a duplicate or
        // flapping resend of already-acknowledged work) must not count as
        // outstanding backlog -- otherwise a harmless duplicate resend in
        // the same batch would needlessly defer an unrelated lower-tier
        // operation that appears earlier in the array.
        // eslint-disable-next-line no-await-in-loop -- small, bounded
        // pre-scan; correctness here matters more than batching these.
        const existing = await this.db.syncReplayReceipt.findUnique({
          where: {
            clinicId_deviceId_operationId: {
              clinicId: context.clinicId,
              deviceId: context.deviceId,
              operationId: parsed.data.operationId,
            },
          },
        });
        if (!existing) queueHighPending.add(parsed.data.operationId);
      }
    }

    for (const raw of rawOperations) {
      // eslint-disable-next-line no-await-in-loop -- idempotency/conflict
      // checks must happen in submission order within one batch.
      await this.ingestOneOperation(
        context,
        raw,
        queueHighPending,
        acknowledgedOperationIds,
        deferredOperationIds,
        failureTaskIds,
      );
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
    queueHighPending: Set<string>,
    acknowledgedOperationIds: string[],
    deferredOperationIds: string[],
    failureTaskIds: string[],
  ): Promise<void> {
    const parsed = offlineOperationEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      const taskId = await this.createFailureTask(
        context,
        stringField(raw, 'operationId'),
        stringField(raw, 'domain'),
        stringField(raw, 'entityId'),
        message,
      );
      failureTaskIds.push(taskId);
      return;
    }

    const envelope = parsed.data;

    // Verify-fix 10.7 (T-10-05, D-12 to D-14, D-37): genuine server-side
    // enforcement of queue-first replay, independent of the mobile
    // coordinator's own ordering -- a lower-tier operation is deferred
    // (never applied) while QUEUE_HIGH work is still outstanding for this
    // clinic-scoped batch. `pauseLowerTierReplayForQueue` has no severity
    // parameter at all (D-37), so this cannot be bypassed by a
    // SAFETY_CRITICAL envelope either.
    if (envelope.priority !== ReplayPriority.QUEUE_HIGH) {
      const preemption = this.queuePreemption.pauseLowerTierReplayForQueue({
        currentTierPriority: envelope.priority,
        queueHighPendingCount: queueHighPending.size,
      });
      if (preemption.shouldPause) {
        deferredOperationIds.push(envelope.operationId);
        return;
      }
    }

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
      queueHighPending.delete(envelope.operationId);
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
      // again after the conflict resolves. Deliberately NOT removed from
      // `queueHighPending` here even if this is itself a QUEUE_HIGH
      // envelope: an unresolved conflict means the queue-tier operation is
      // still not acknowledged, so lower tiers must keep waiting on it too.
      deferredOperationIds.push(envelope.operationId);
      return;
    }

    try {
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
    } catch (err) {
      // Verify-fix 10.9: the `findUnique` above and this `create` are not
      // transactional, so a genuinely concurrent duplicate replay (two
      // requests for the same clinicId+deviceId+operationId racing each
      // other) can both see no existing receipt and both attempt to create
      // one. The `[clinicId, deviceId, operationId]` unique constraint lets
      // exactly one of them win; the loser hits P2002 here. Matching this
      // repo's established pattern (`inventory-item.repository.ts`,
      // `invoice.service.ts`): treat that as "already acknowledged by the
      // request that won the race" and return the real receipt's ack
      // envelope, instead of letting a genuine concurrent duplicate 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const racedReceipt = await this.db.syncReplayReceipt.findUnique({
          where: {
            clinicId_deviceId_operationId: {
              clinicId: context.clinicId,
              deviceId: context.deviceId,
              operationId: envelope.operationId,
            },
          },
        });
        if (racedReceipt) {
          acknowledgedOperationIds.push(envelope.operationId);
          queueHighPending.delete(envelope.operationId);
          return;
        }
      }
      throw err;
    }

    acknowledgedOperationIds.push(envelope.operationId);
    queueHighPending.delete(envelope.operationId);

    // Verify-fix 10.3: a browser tab watching this entity should hear about
    // the applied mobile replay without waiting for its own next fetch.
    this.broadcast.emitReplayApplied({
      clinicId: context.clinicId,
      domain: envelope.domain,
      entityIds: [envelope.entityId],
    });
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
      const taskId = await this.createFailureTask(
        context,
        stringField(raw, 'operationId'),
        stringField(raw, 'domain'),
        stringField(raw, 'entityId'),
        message,
      );
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

    // Verify-fix 10.3: D-05/D-08 -- a new unresolved conflict is exactly the
    // case an already-open browser tab must not silently keep rendering
    // stale/disputed state for.
    this.broadcast.emitReplayConflictOpened({
      clinicId: context.clinicId,
      domain: conflict.domain,
      entityIds: [conflict.entityId],
    });
  }

  private async createFailureTask(
    context: AuthenticatedReplayContext,
    operationId: string,
    domain: string,
    entityId: string,
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

    // Verify-fix 10.3: D-20 -- a failed replay must escalate into an
    // actionable, visible failure rather than a push that only exists in
    // the database with no live notice for an open tab.
    this.broadcast.emitReplayFailureEscalated({
      clinicId: context.clinicId,
      domain,
      entityIds: [entityId],
    });

    return task.id;
  }
}
