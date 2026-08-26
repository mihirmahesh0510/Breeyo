import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantPrismaClient } from '../../../lib/prisma-rls.js';
import { EmrRepository } from '../emr.repository.js';
import {
  ConsultationOfflineReplayService,
  type ConsultationOfflineReplayContext,
  type ConsultationOfflineReplayGateway,
  type ConsultationReplayReceiptStore,
  type ClinicalConflictRecordStore,
} from '../services/consultationOfflineReplay.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

/**
 * Top-level shape check only, matching `queueSync.controller.ts`'s
 * convention -- each individual envelope is validated inside
 * `ConsultationOfflineReplayService.replayConsultationDraft` (via the
 * shared `offlineOperationEnvelopeSchema` plus the consultation-draft
 * payload schema), so one malformed envelope in a batch surfaces as a
 * `REJECTED` outcome for that item alone instead of a blanket 400 for the
 * whole reconnect batch.
 */
const consultationReplayRequestBodySchema = z.object({
  deviceId: z.string().trim().min(1),
  operations: z.array(z.unknown()).default([]),
});

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((issue) => issue.message).join(', '),
    },
  });
}

export function buildConsultationOfflineReplayService(
  db: TenantPrismaClient,
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
    broadcast,
  );
}

/**
 * D-30: takes a factory rather than a prebuilt service, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped,
 * RLS-bound client) instead of sharing one admin client across all clinics.
 */
export function createConsultationSyncController(
  buildReplayService: (db: TenantPrismaClient) => ConsultationOfflineReplayService,
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

      for (const raw of body.data.operations) {
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
  };
}
