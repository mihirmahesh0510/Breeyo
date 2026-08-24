import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReplayPriority } from '@breeyo/types';
import type { TenantPrismaClient } from '../../../lib/prisma-rls.js';
import { QueueRepository } from '../queue.repository.js';
import {
  QueueOfflineReplayService,
  type QueueOfflineReplayContext,
  type QueueReplayReceiptStore,
  type QueueOperationalReviewTaskStore,
} from '../services/queueOfflineReplay.service.js';
import { QueuePreemptionService } from '../services/queuePreemption.service.js';

/**
 * Top-level shape check only, matching `apps/api/src/modules/sync/routes.ts`'s
 * convention: each individual envelope is validated inside
 * `QueueOfflineReplayService.replayQueueOperation` (via the shared
 * `offlineOperationEnvelopeSchema`), so one malformed envelope in a batch
 * surfaces as a `REJECTED` outcome for that item alone instead of a blanket
 * 400 for the whole reconnect batch.
 */
const queueReplayRequestBodySchema = z.object({
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

function readOperationId(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'operationId' in raw) {
    const value = (raw as Record<string, unknown>).operationId;
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

function readPriority(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'priority' in raw) {
    return (raw as Record<string, unknown>).priority;
  }
  return undefined;
}

export function buildQueueOfflineReplayService(db: TenantPrismaClient): QueueOfflineReplayService {
  return new QueueOfflineReplayService(
    // `QueueRepository`'s public method names/signatures satisfy
    // `QueueOfflineReplayGateway` structurally -- no adapter needed.
    new QueueRepository(db),
    db.syncReplayReceipt as unknown as QueueReplayReceiptStore,
    db.syncConflictRecord as unknown as QueueOperationalReviewTaskStore,
  );
}

/**
 * D-30: takes factories/a shared preemption service rather than prebuilt
 * instances, so every handler resolves its Prisma handle from `request.db`
 * (the tenant-scoped, RLS-bound client) instead of sharing one admin client
 * across all clinics.
 */
export function createQueueSyncController(
  buildReplayService: (db: TenantPrismaClient) => QueueOfflineReplayService,
  preemption: QueuePreemptionService = new QueuePreemptionService(),
) {
  return {
    async replayHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = queueReplayRequestBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const replayService = buildReplayService(request.db);
      const context: QueueOfflineReplayContext = {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        deviceId: body.data.deviceId,
      };

      const acknowledgedOperationIds: string[] = [];
      const mergedOperationIds: string[] = [];
      const reviewTaskIds: string[] = [];
      const rejectedOperations: { operationId: string; message?: string }[] = [];
      const deferredOperationIds: string[] = [];

      for (const raw of body.data.operations) {
        const priority = readPriority(raw);

        // T-10-05 / D-12 to D-14: this endpoint is queue-first by
        // construction. It never "helpfully" absorbs a non-QUEUE_HIGH
        // envelope into its own processing (that would let queue replay
        // capacity get spent on lower-tier work), and it never downgrades
        // queue replay into a shared/generic tier either -- a mis-routed
        // lower-tier envelope is deferred back untouched, for the
        // domain-appropriate replay path to pick up.
        if (priority !== undefined && priority !== ReplayPriority.QUEUE_HIGH) {
          deferredOperationIds.push(readOperationId(raw));
          // eslint-disable-next-line no-continue
          continue;
        }

        // eslint-disable-next-line no-await-in-loop -- idempotency and D-34
        // merge decisions must be evaluated in submission order within one
        // batch, exactly like the shared replay ingress does.
        const outcome = await replayService.replayQueueOperation(context, raw);

        switch (outcome.status) {
          case 'APPLIED':
          case 'ACKNOWLEDGED_DUPLICATE':
            acknowledgedOperationIds.push(outcome.operationId);
            break;
          case 'MERGED_DUPLICATE_CHECK_IN':
            acknowledgedOperationIds.push(outcome.operationId);
            mergedOperationIds.push(outcome.operationId);
            if (outcome.reviewTaskId) reviewTaskIds.push(outcome.reviewTaskId);
            break;
          case 'REVIEW_CREATED':
            // T-10-06: the operation is acknowledged (it will not be
            // resent), but a review task -- not silent overwrite -- is what
            // actually resolves the mismatch on the queue board.
            acknowledgedOperationIds.push(outcome.operationId);
            if (outcome.reviewTaskId) reviewTaskIds.push(outcome.reviewTaskId);
            break;
          case 'REJECTED':
          default:
            rejectedOperations.push({ operationId: outcome.operationId, message: outcome.message });
            break;
        }
      }

      return reply.status(200).send({
        data: {
          acknowledgedOperationIds,
          mergedOperationIds,
          reviewTaskIds,
          rejectedOperations,
          deferredOperationIds,
          // D-12: exposed explicitly so a client (or a future cross-domain
          // orchestrator) never has to guess whether queue replay is
          // gated on anything else -- it never is.
          canRunQueueReplayNow: preemption.canRunQueueReplayNow(),
          processedAt: new Date().toISOString(),
        },
      });
    },
  };
}

