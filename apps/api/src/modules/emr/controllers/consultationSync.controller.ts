import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReplayPriority } from '@breeyo/types';
import type { TenantPrismaClient } from '../../../lib/prisma-rls.js';
import { EmrRepository } from '../emr.repository.js';
import { QueuePreemptionService } from '../../queue/services/queuePreemption.service.js';
import { resolveQueueHighPendingCount } from '../../sync/services/queueHighPendingLookup.service.js';
import {
  ConsultationOfflineReplayService,
  type ConsultationOfflineReplayContext,
  type ConsultationOfflineReplayGateway,
  type ConsultationReplayReceiptStore,
  type ClinicalConflictRecordStore,
  type PermissionsProvider,
} from '../services/consultationOfflineReplay.service.js';
import {
  ConsultationConflictResolutionService,
  CONSULTATION_CONFLICT_RESOLUTION_ACTIONS,
  type ConsultationConflictResolutionGateway,
  type ConflictResolutionRecordStore,
} from '../services/consultationConflictResolution.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';
import type { OnDutyRosterProvider } from '../../sync/services/retryEscalation.service.js';

/**
 * Top-level shape check only, matching `queueSync.controller.ts`'s
 * convention -- each individual envelope is validated inside
 * `ConsultationOfflineReplayService.replayConsultationDraft` (via the
 * shared `offlineOperationEnvelopeSchema` plus the consultation-draft
 * payload schema), so one malformed envelope in a batch surfaces as a
 * `REJECTED` outcome for that item alone instead of a blanket 400 for the
 * whole reconnect batch.
 *
 * WR-10: `pendingQueueHighOperationIds` is the calling device's own claim
 * (mobile's `listPendingSyncOperationsByPriority(db, ReplayPriority.QUEUE_HIGH)`)
 * of which QUEUE_HIGH operationIds it still has queued locally -- see
 * `inventorySync.controller.ts`'s identical field for the full rationale
 * (this endpoint only ever receives CLINICAL_MEDIUM envelopes itself, so it
 * cannot pre-scan a mixed batch the way the generic ingress does).
 * `resolveQueueHighPendingCount` verifies this claim against the real
 * `SyncReplayReceipt` ledger rather than trusting it verbatim.
 */
const consultationReplayRequestBodySchema = z.object({
  deviceId: z.string().trim().min(1),
  operations: z.array(z.unknown()).default([]),
  pendingQueueHighOperationIds: z.array(z.string().trim().min(1)).default([]),
});

/**
 * Verify-fix 10.5: params for `POST
 * /consultations/:consultationId/conflicts/:conflictId/resolve`. The sheet's
 * four actions are whole-conflict choices (D-08) -- no per-field selection
 * data exists in the request body because the UI never offers per-field
 * granularity (`ClinicalConflictResolutionSheet.tsx` has no per-field
 * controls, only the four buttons this schema's `action` enum mirrors).
 */
const conflictResolveParamsSchema = z.object({
  consultationId: z.string().min(1),
  conflictId: z.string().min(1),
});

const conflictResolveBodySchema = z.object({
  action: z.enum(CONSULTATION_CONFLICT_RESOLUTION_ACTIONS),
});

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(', '),
    },
  });
}

function readOperationId(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'operationId' in raw) {
    const value = (raw as Record<string, unknown>).operationId;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

export function buildConsultationOfflineReplayService(
  db: TenantPrismaClient,
  // AC-3: required, no default -- `emr.routes.ts` wires in the same
  // plugin-scope `PermissionService` its `editHandler`/`viewHandler`
  // preHandlers use, matching `dispense.routes.ts`'s
  // `buildInventoryOfflineReplayService(db, permissionService, ...)` call.
  permissionsProvider: PermissionsProvider,
  broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
): ConsultationOfflineReplayService {
  return new ConsultationOfflineReplayService(
    // `EmrRepository`'s public method names/signatures (`getConsultation`,
    // `loadDraft`, `saveDraft`) satisfy `ConsultationOfflineReplayGateway`
    // structurally at the method-name level; `loadDraft`'s Prisma-generated
    // return type is the broader `Prisma.JsonValue` (the column is a JSON
    // blob) rather than the narrower `SaveDraftInput` this service works
    // with, so the cast below is needed the same way `db.syncReplayReceipt
    // as unknown as ...` is needed just below it -- the JSON blob's actual
    // runtime shape is always `SaveDraftInput`-shaped because
    // `EmrRepository.saveDraft` is the only writer of that column and it is
    // always called with a `saveDraftSchema`-validated payload.
    new EmrRepository(db) as unknown as ConsultationOfflineReplayGateway,
    db.syncReplayReceipt as unknown as ConsultationReplayReceiptStore,
    db.syncConflictRecord as unknown as ClinicalConflictRecordStore,
    permissionsProvider,
    broadcast,
  );
}

/**
 * Verify-fix 10.5: same construction convention as
 * `buildConsultationOfflineReplayService` just above -- `EmrRepository`'s
 * public method names/signatures satisfy `ConsultationConflictResolutionGateway`
 * structurally, and `db.syncConflictRecord`'s generated Prisma delegate
 * satisfies `ConflictResolutionRecordStore` structurally (`findFirst`/
 * `update` are both real Prisma Client methods).
 */
export function buildConsultationConflictResolutionService(
  db: TenantPrismaClient,
  broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
  // Verify-fix 10.6: optional, defaulting to `undefined` -- ESCALATE only
  // ever reaches `resolveNextOnDutyClinicianId` when a real provider is
  // wired in from `emr.routes.ts`. Every other action (KEEP_LOCAL/
  // KEEP_SERVER/MERGE_SAFE_FIELDS) never touches this.
  onDutyRosterProvider?: OnDutyRosterProvider,
): ConsultationConflictResolutionService {
  return new ConsultationConflictResolutionService(
    new EmrRepository(db) as unknown as ConsultationConflictResolutionGateway,
    db.syncConflictRecord as unknown as ConflictResolutionRecordStore,
    broadcast,
    onDutyRosterProvider,
  );
}

/**
 * D-30: takes a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped,
 * RLS-bound client) instead of sharing one admin client across all clinics.
 *
 * WR-10: also takes a `preemption` service (stateless, same default-instance
 * convention as `createQueueSyncController`/`createInventorySyncController`)
 * so this endpoint -- the real one mobile calls for consultation-draft
 * reconnect/replay -- genuinely enforces D-12 to D-14 instead of only the
 * unreachable generic `/sync/replay` ingress doing so.
 */
export function createConsultationSyncController(
  buildReplayService: (db: TenantPrismaClient) => ConsultationOfflineReplayService,
  buildResolutionService: (db: TenantPrismaClient) => ConsultationConflictResolutionService,
  preemption: QueuePreemptionService = new QueuePreemptionService(),
) {
  return {
    async replayHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = consultationReplayRequestBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const replayService = buildReplayService(request.db);
      const context: ConsultationOfflineReplayContext = {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        deviceId: body.data.deviceId,
        // Verify-fix 10.1: same `(request as any).userName ?? 'Unknown'`
        // fallback `emr.controller.ts`'s live `addAddendumHandler` already
        // uses -- needed here too now that a late replay against an
        // already-finalized consultation can author a real addendum.
        userName: (request as any).userName ?? 'Unknown',
      };

      const acknowledgedOperationIds: string[] = [];
      const conflictIds: string[] = [];
      const rejectedOperations: { operationId: string; message?: string }[] = [];
      const deferredOperationIds: string[] = [];

      // WR-10: computed once for the whole batch -- every operation this
      // endpoint ever receives is CLINICAL_MEDIUM tier, so the pause
      // decision does not change operation-to-operation within one call.
      const queueHighPendingCount = await resolveQueueHighPendingCount(request.db, {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        candidateOperationIds: body.data.pendingQueueHighOperationIds,
      });
      const preemptionResult = preemption.pauseLowerTierReplayForQueue({
        currentTierPriority: ReplayPriority.CLINICAL_MEDIUM,
        queueHighPendingCount,
      });

      for (const raw of body.data.operations) {
        // WR-10: genuine queue-first preemption for the endpoint real
        // clients call -- deferred here means never applied, no receipt
        // written, left for the device to resend once QUEUE_HIGH clears.
        // D-37: no severity check here at all -- a SAFETY_CRITICAL draft
        // conflict still waits its own CLINICAL_MEDIUM turn.
        if (preemptionResult.shouldPause) {
          deferredOperationIds.push(readOperationId(raw));
          // eslint-disable-next-line no-continue
          continue;
        }

        // eslint-disable-next-line no-await-in-loop -- idempotency and
        // conflict-creation decisions must be evaluated in submission order
        // within one batch, exactly like the shared replay ingress does.
        const outcome = await replayService.replayConsultationDraft(context, raw);

        switch (outcome.status) {
          case 'APPLIED':
          case 'ACKNOWLEDGED_DUPLICATE':
            acknowledgedOperationIds.push(outcome.operationId);
            break;
          case 'CONFLICT_CREATED':
            // The operation itself is acknowledged (it will not be resent
            // as-is), but this batch is NOT a plain success -- a structured
            // conflict envelope now needs clinician review (D-05, D-08).
            acknowledgedOperationIds.push(outcome.operationId);
            if (outcome.conflictId) conflictIds.push(outcome.conflictId);
            break;
          case 'REJECTED':
          default:
            rejectedOperations.push({ operationId: outcome.operationId, message: outcome.message });
            break;
        }
      }

      const responseBody = {
        data: {
          acknowledgedOperationIds,
          conflictIds,
          rejectedOperations,
          deferredOperationIds,
          processedAt: new Date().toISOString(),
        },
      };

      // Per the plan: return conflict envelopes instead of a plain success
      // when review is required -- a 409 makes it impossible for a client
      // to mistake "your batch was accepted" for "your draft is clean and
      // synced" when a SAFETY_CRITICAL conflict is sitting in it.
      if (conflictIds.length > 0) {
        return reply.status(409).send(responseBody);
      }

      return reply.status(200).send(responseBody);
    },

    /**
     * POST /consultations/:consultationId/conflicts/:conflictId/resolve
     * (verify-fix 10.5). Any error the service throws (not-found, already
     * resolved) carries `.statusCode`/`.code` and is left to propagate to
     * the centralized `error-handler.ts`, the same convention
     * `EmrService.addAddendum` already uses -- no try/catch here.
     */
    async resolveHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = conflictResolveParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = conflictResolveBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const resolutionService = buildResolutionService(request.db);
      const context = {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        userName: (request as any).userName ?? 'Unknown',
      };

      const outcome = await resolutionService.resolveConflict(
        context,
        params.data.consultationId,
        params.data.conflictId,
        body.data.action,
      );

      return reply.status(200).send({ data: outcome });
    },
  };
}
