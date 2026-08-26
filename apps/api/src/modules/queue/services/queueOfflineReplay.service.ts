import { z } from 'zod';
import { offlineOperationEnvelopeSchema } from '@breeyo/validators';
import { ConflictSeverity, QueueStatus, ResolutionState, isValidTransition } from '@breeyo/types';
import { getTodayIST } from '../../../lib/ist-date.js';
import type { CreateEntryParams } from '../queue.types.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

/** Domain-specific `entityType` values this service dispatches on. Queue
 *  envelopes always carry `domain: 'queue'` and one of these two shapes --
 *  every other `entityType` is rejected rather than silently ignored. */
export const QUEUE_CHECK_IN_ENTITY_TYPE = 'QUEUE_CHECK_IN';
export const QUEUE_STATUS_TRANSITION_ENTITY_TYPE = 'QUEUE_STATUS_TRANSITION';

/**
 * Mobile's offline check-in payload. `checkedInAt` is the offline device's
 * OWN check-in instant (not the replay instant) -- see `replayCheckIn`'s
 * use of it as `queuePriorityAt` for why this must survive the trip.
 */
const queueCheckInPayloadSchema = z.object({
  petId: z.string().trim().min(1),
  visitReason: z.string().trim().min(1).optional(),
  isEmergency: z.boolean().optional().default(false),
  checkedInAt: z.string().min(1),
});

/** Covers status transition, no-show (status=NO_SHOW), and a locally-chosen
 *  call-next (status=IN_CONSULT on the entry the device picked as "next"
 *  from its own local projection) -- all three are just a target status on
 *  an existing entry id from the mobile hook's point of view. */
const queueStatusTransitionPayloadSchema = z.object({
  entryId: z.string().trim().min(1),
  status: z.nativeEnum(QueueStatus),
});

/**
 * Minimal shape this service needs from a queue entry row. Deliberately not
 * the generated Prisma `QueueEntry` model type -- keeps this service (and
 * its tests) independent of `@prisma/client` and lets a plain in-memory
 * fake stand in for `QueueRepository` in tests without a database.
 */
export interface QueueEntryRecord {
  id: string;
  clinicId: string;
  petId: string;
  checkedInBy: string;
  status: string;
  position: number;
  isEmergency: boolean;
  visitReason?: string | null;
  checkedInAt: Date;
  queuePriorityAt: Date;
  calledAt?: Date | null;
  completedAt?: Date | null;
  archivedAt?: Date | null;
  appointmentId?: string | null;
}

/**
 * The subset of `QueueRepository`'s public surface this service depends on.
 * Method names/signatures intentionally match `QueueRepository` exactly
 * (see `apps/api/src/modules/queue/queue.repository.ts`) so a real
 * `QueueRepository` instance satisfies this interface structurally with no
 * adapter needed once `queueSync.controller.ts` wires it in.
 */
export interface QueueOfflineReplayGateway {
  findPetInClinic(clinicId: string, petId: string): Promise<{ id: string } | null>;
  findTodayActiveEntryForPet(clinicId: string, petId: string, today: Date): Promise<QueueEntryRecord | null>;
  findEntryById(entryId: string): Promise<QueueEntryRecord | null>;
  createEntry(data: CreateEntryParams): Promise<QueueEntryRecord>;
  updateEntry(entryId: string, data: Record<string, unknown>): Promise<QueueEntryRecord>;
  countWaiting(clinicId: string, today: Date): Promise<number>;
}

/**
 * Same shape as `ReplayIngestPrismaClient['syncReplayReceipt']` in
 * `apps/api/src/modules/sync/services/replayIngest.service.ts` -- this
 * service reads/writes the SAME `SyncReplayReceipt` table (Plan 10-01's
 * shared idempotency ledger) rather than inventing a second one, per the
 * 10-02-PLAN.md instruction to build on the shared foundation instead of
 * duplicating it.
 */
export interface QueueReplayReceiptStore {
  findUnique(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<{ operationId: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ operationId: string }>;
}

/**
 * Backed by the same `SyncConflictRecord` table the shared replay ingress
 * uses for clinical/inventory conflicts (D-05 to D-10) -- created here with
 * `severity: OPERATIONAL` so a queue mismatch surfaces through the existing
 * lightweight operational review flow (D-10) instead of a second bespoke
 * "queue review task" table.
 */
export interface QueueOperationalReviewTaskStore {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface QueueOfflineReplayContext {
  clinicId: string;
  userId: string;
  deviceId: string;
}

export type QueueReplayOutcomeStatus =
  | 'APPLIED'
  | 'ACKNOWLEDGED_DUPLICATE'
  | 'MERGED_DUPLICATE_CHECK_IN'
  | 'REVIEW_CREATED'
  | 'REJECTED';

export interface QueueReplayOutcome {
  operationId: string;
  status: QueueReplayOutcomeStatus;
  entryId?: string;
  reviewTaskId?: string;
  message?: string;
}

function stringField(raw: unknown, field: string): string {
  if (raw && typeof raw === 'object' && field in raw) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

/**
 * Server-side reconciliation for offline queue mutations (PLT-03, D-01 to
 * D-03, D-10, D-34). Sits one layer below `queueSync.controller.ts`:
 * idempotency is enforced against the shared `SyncReplayReceipt` ledger
 * (Plan 10-01), and every mutation is applied through the SAME state-machine
 * and position rules `queue.service.ts` uses online (`isValidTransition`,
 * `treatingVetId`/`calledAt`/`completedAt` stamping, `countWaiting`-based
 * position assignment) so an offline replay can never produce a queue state
 * the live online path could not also produce.
 *
 * D-34: replaying a check-in for a pet that already has an active entry
 * today (necessarily created by a different operation, since this
 * operation's own id was just proven new by the receipt check) auto-merges
 * into that existing entry instead of creating a second live row -- no
 * blocking conflict, no staff action required before the merge takes
 * effect, just a lightweight OPERATIONAL review note (D-10) left behind for
 * visibility.
 */
export class QueueOfflineReplayService {
  constructor(
    private readonly gateway: QueueOfflineReplayGateway,
    private readonly replayReceipts: QueueReplayReceiptStore,
    private readonly reviewTasks: QueueOperationalReviewTaskStore,
    private readonly now: () => Date = () => new Date(),
    // Verify-fix 10.3: defaults to a no-op broadcast (matches
    // `ReplayIngestService`'s own convention) so every existing caller/test
    // that does not pass one keeps working; `queueSync.controller.ts` wires
    // a real `ReplayBroadcastService(fastify.io)` in for production.
    private readonly broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
  ) {}

  async replayQueueOperation(context: QueueOfflineReplayContext, raw: unknown): Promise<QueueReplayOutcome> {
    const parsedEnvelope = offlineOperationEnvelopeSchema.safeParse(raw);
    if (!parsedEnvelope.success) {
      return {
        operationId: stringField(raw, 'operationId'),
        status: 'REJECTED',
        message: parsedEnvelope.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const envelope = parsedEnvelope.data;

    const existingReceipt = await this.replayReceipts.findUnique({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId: envelope.operationId,
        },
      },
    });

    if (existingReceipt) {
      // T-10-03: a duplicate or flapping replay of an already-acknowledged
      // operation is a no-op, not a second write.
      return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE' };
    }

    if (envelope.entityType === QUEUE_CHECK_IN_ENTITY_TYPE) {
      return this.replayCheckIn(context, envelope.operationId, envelope.payload);
    }

    if (envelope.entityType === QUEUE_STATUS_TRANSITION_ENTITY_TYPE) {
      return this.replayStatusTransition(context, envelope.operationId, envelope.payload);
    }

    return {
      operationId: envelope.operationId,
      status: 'REJECTED',
      message: `Unsupported queue replay entityType: ${envelope.entityType}`,
    };
  }

  /**
   * Records a lightweight operational review note (D-10) for a queue replay
   * mismatch -- a merged duplicate check-in (D-34), a status change aimed at
   * an entry that no longer exists or already archived, or a transition the
   * server's current state no longer allows. `OPERATIONAL` severity (as
   * opposed to `SAFETY_CRITICAL`) is what keeps this on the lighter review
   * flow rather than the clinical resolution sheet.
   */
  async createOperationalReviewTask(
    context: QueueOfflineReplayContext,
    input: { operationId: string; entryId: string; note: string },
  ): Promise<string> {
    const task = await this.reviewTasks.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId: input.operationId,
        domain: 'queue',
        entityType: 'QUEUE_ENTRY',
        entityId: input.entryId,
        severity: ConflictSeverity.OPERATIONAL,
        localPayloadJson: { note: input.note },
        serverPayloadJson: { note: input.note },
        recommendedOwnerUserId: null,
        resolutionOwnerUserId: null,
        originatingUserId: context.userId,
        currentOwnerUserId: context.userId,
        resolutionState: ResolutionState.OPEN,
      },
    });
    return task.id;
  }

  private async recordReceipt(
    context: QueueOfflineReplayContext,
    operationId: string,
    domain: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.replayReceipts.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId,
        userId: context.userId,
        domain,
        entityType,
        entityId,
      },
    });
  }

  private async replayCheckIn(
    context: QueueOfflineReplayContext,
    operationId: string,
    rawPayload: unknown,
  ): Promise<QueueReplayOutcome> {
    const parsedPayload = queueCheckInPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return {
        operationId,
        status: 'REJECTED',
        message: parsedPayload.error.issues.map((issue) => issue.message).join(', '),
      };
    }
    const payload = parsedPayload.data;

    const pet = await this.gateway.findPetInClinic(context.clinicId, payload.petId);
    if (!pet) {
      return { operationId, status: 'REJECTED', message: 'Pet not found for this clinic.' };
    }

    const today = getTodayIST(this.now());
    const existingActive = await this.gateway.findTodayActiveEntryForPet(context.clinicId, payload.petId, today);

    if (existingActive) {
      // D-34: auto-merge into the earlier-created entry -- keep its
      // check-in time and position, discard the duplicate. This operation
      // still gets its own replay receipt so a future flapping replay of
      // THIS operationId also resolves as an idempotent no-op rather than
      // re-merging (harmlessly) or, worse, re-creating a review task.
      await this.recordReceipt(context, operationId, 'queue', QUEUE_CHECK_IN_ENTITY_TYPE, existingActive.id);
      const reviewTaskId = await this.createOperationalReviewTask(context, {
        operationId,
        entryId: existingActive.id,
        note: `Duplicate offline check-in for the same patient merged into existing queue entry ${existingActive.id} (D-34).`,
      });
      // Verify-fix 10.3: a merge still leaves a review note behind (D-10) --
      // treated as a conflict-opened broadcast, not an applied one, so an
      // open browser tab surfaces it for review rather than silently
      // refreshing as if nothing needed a second look.
      this.broadcast.emitReplayConflictOpened({
        clinicId: context.clinicId,
        domain: 'queue',
        entityIds: [existingActive.id],
      });
      return {
        operationId,
        status: 'MERGED_DUPLICATE_CHECK_IN',
        entryId: existingActive.id,
        reviewTaskId,
      };
    }

    const waitingCount = await this.gateway.countWaiting(context.clinicId, today);
    const entry = await this.gateway.createEntry({
      clinicId: context.clinicId,
      petId: payload.petId,
      checkedInBy: context.userId,
      status: 'WAITING' as CreateEntryParams['status'],
      position: waitingCount + 1,
      isEmergency: payload.isEmergency,
      visitReason: payload.visitReason,
      // D-03: the offline entry is operationally real from the moment the
      // device recorded it, so its priority time is that original instant,
      // not "now" (the replay instant) -- otherwise an offline check-in
      // from 40 minutes ago would unfairly jump behind patients who checked
      // in (online) more recently but before this replay ran.
      queuePriorityAt: new Date(payload.checkedInAt),
    });

    await this.recordReceipt(context, operationId, 'queue', QUEUE_CHECK_IN_ENTITY_TYPE, entry.id);

    // Verify-fix 10.3: an open browser queue board watching this entity
    // should hear about the applied replay without waiting for its own poll.
    this.broadcast.emitReplayApplied({ clinicId: context.clinicId, domain: 'queue', entityIds: [entry.id] });

    return { operationId, status: 'APPLIED', entryId: entry.id };
  }

  private async replayStatusTransition(
    context: QueueOfflineReplayContext,
    operationId: string,
    rawPayload: unknown,
  ): Promise<QueueReplayOutcome> {
    const parsedPayload = queueStatusTransitionPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return {
        operationId,
        status: 'REJECTED',
        message: parsedPayload.error.issues.map((issue) => issue.message).join(', '),
      };
    }
    const payload = parsedPayload.data;

    const entry = await this.gateway.findEntryById(payload.entryId);

    if (!entry) {
      return this.reviewInsteadOfOverwrite(context, operationId, payload.entryId, {
        note: `Offline status change targeted queue entry ${payload.entryId}, which no longer exists.`,
      });
    }

    if (entry.archivedAt) {
      return this.reviewInsteadOfOverwrite(context, operationId, entry.id, {
        note: `Offline status change to ${payload.status} arrived after queue entry ${entry.id} was already archived.`,
      });
    }

    const fromStatus = entry.status as QueueStatus;
    const toStatus = payload.status;

    if (!isValidTransition(fromStatus, toStatus)) {
      // D-05, D-10: the server's live state moved on (e.g. another device
      // already completed or no-showed this entry) while this device was
      // offline -- review, don't silently overwrite.
      return this.reviewInsteadOfOverwrite(context, operationId, entry.id, {
        note: `Offline status change requested ${fromStatus} -> ${toStatus} for queue entry ${entry.id}, which is not a valid transition from its current server state.`,
      });
    }

    const updateData: Record<string, unknown> = { status: toStatus };

    if (toStatus === QueueStatus.IN_CONSULT) {
      // Mirrors `QueueService.updateStatus`: whichever staff device's
      // replay lands this transition owns the consult.
      updateData.treatingVetId = context.userId;
      updateData.calledAt = this.now();
    }

    if (toStatus === QueueStatus.WAITING) {
      // Mirrors `QueueService.updateStatus`'s EXPECTED -> WAITING handling:
      // stamp the real arrival instant and give the entry a real position
      // at the back of today's WAITING queue.
      updateData.checkedInAt = this.now();
      const today = getTodayIST(this.now());
      const waitingCount = await this.gateway.countWaiting(entry.clinicId, today);
      updateData.position = waitingCount + 1;
    }

    if (toStatus === QueueStatus.DONE || toStatus === QueueStatus.NO_SHOW) {
      updateData.completedAt = this.now();
    }

    const updated = await this.gateway.updateEntry(entry.id, updateData);
    await this.recordReceipt(context, operationId, 'queue', QUEUE_STATUS_TRANSITION_ENTITY_TYPE, updated.id);

    // Verify-fix 10.3: same broadcast the check-in path fires above.
    this.broadcast.emitReplayApplied({ clinicId: context.clinicId, domain: 'queue', entityIds: [updated.id] });

    return { operationId, status: 'APPLIED', entryId: updated.id };
  }

  private async reviewInsteadOfOverwrite(
    context: QueueOfflineReplayContext,
    operationId: string,
    entryId: string,
    { note }: { note: string },
  ): Promise<QueueReplayOutcome> {
    await this.recordReceipt(context, operationId, 'queue', QUEUE_STATUS_TRANSITION_ENTITY_TYPE, entryId);
    const reviewTaskId = await this.createOperationalReviewTask(context, { operationId, entryId, note });
    // Verify-fix 10.3: D-05 review-before-overwrite -- a browser tab
    // watching this entry needs the conflict prompt, not a stale render.
    this.broadcast.emitReplayConflictOpened({ clinicId: context.clinicId, domain: 'queue', entityIds: [entryId] });
    return { operationId, status: 'REVIEW_CREATED', entryId, reviewTaskId };
  }
}
