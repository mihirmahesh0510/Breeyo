import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ReplayPriority } from '@breeyo/types';
import type { TenantPrismaClient } from '../../../lib/prisma-rls.js';
import { StockReceiptService } from '../stock-receipt.service.js';
import { FifoDispenseService } from '../fifo-dispense.service.js';
import { StockAdjustmentService } from '../stock-adjustment.service.js';
import { StockMovementService } from '../stock-movement.service.js';
import {
  InventoryOfflineReplayService,
  type InventoryOfflineReplayContext,
  type InventoryOfflineReplayGateway,
  type InventoryReplayReceiptStore,
} from '../services/inventoryOfflineReplay.service.js';
import { InventoryConflictReviewService, type InventoryReviewTaskStore } from '../services/inventoryConflictReview.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

/**
 * Top-level shape check only, matching `queueSync.controller.ts`'s /
 * `consultationSync.controller.ts`'s own convention: each individual
 * envelope is validated inside `InventoryOfflineReplayService.replayInventoryOperation`
 * (via the shared `offlineOperationEnvelopeSchema` plus the per-entityType
 * payload schema), so one malformed envelope in a batch surfaces as a
 * `REJECTED` outcome for that item alone instead of a blanket 400 for the
 * whole reconnect batch.
 */
const inventoryReplayRequestBodySchema = z.object({
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

/**
 * Composes an `InventoryOfflineReplayGateway` from the three EXISTING
 * FIFO/batch-aware stock-mutation services -- unlike `QueueRepository`
 * (which already matches `QueueOfflineReplayGateway` 1:1), no single
 * inventory class owns receive+dispense+adjust+return together, so this
 * factory is a thin adapter rather than a direct pass-through. No behavior
 * is duplicated here: every method delegates straight to the real service
 * the online `/receive`, `/dispense`, `/adjust`, `/movements/:id/return`
 * routes already use.
 */
export function buildInventoryOfflineReplayGateway(db: TenantPrismaClient): InventoryOfflineReplayGateway {
  const stockMovementService = new StockMovementService(db);
  const stockReceiptService = new StockReceiptService(db);
  const fifoDispenseService = new FifoDispenseService(db, stockMovementService);
  const stockAdjustmentService = new StockAdjustmentService(db, stockMovementService);

  return {
    receiveStock: (clinicId, itemId, userId, userName, data) =>
      stockReceiptService.receiveStock(clinicId, itemId, userId, userName ?? 'Unknown', data),
    dispense: (clinicId, itemId, userId, userName, data) =>
      fifoDispenseService.dispense(clinicId, itemId, userId, userName ?? 'Unknown', data),
    adjust: (clinicId, itemId, userId, userName, data) =>
      stockAdjustmentService.adjust(clinicId, itemId, userId, userName ?? 'Unknown', data),
    returnToStock: (clinicId, movementId, userId, userName) =>
      fifoDispenseService.returnToStock(clinicId, movementId, userId, userName ?? 'Unknown'),
  };
}

export function buildInventoryOfflineReplayService(
  db: TenantPrismaClient,
  broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
): InventoryOfflineReplayService {
  return new InventoryOfflineReplayService(
    buildInventoryOfflineReplayGateway(db),
    db.syncReplayReceipt as unknown as InventoryReplayReceiptStore,
    new InventoryConflictReviewService(db.syncConflictRecord as unknown as InventoryReviewTaskStore),
    () => new Date(),
    broadcast,
  );
}

/**
 * D-30: takes a factory rather than a prebuilt instance, so every handler
 * resolves its Prisma handle from `request.db` (the tenant-scoped,
 * RLS-bound client `tenantContext` installs) instead of sharing one admin
 * client across all clinics -- same shape as `createQueueSyncController`.
 */
export function createInventorySyncController(buildReplayService: (db: TenantPrismaClient) => InventoryOfflineReplayService) {
  return {
    async replayHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = inventoryReplayRequestBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const replayService = buildReplayService(request.db);
      const context: InventoryOfflineReplayContext = {
        clinicId: request.user.activeClinicId,
        userId: request.user.id,
        deviceId: body.data.deviceId,
        userName: (request as unknown as { userName?: string }).userName,
      };

      const acknowledgedOperationIds: string[] = [];
      const reviewTaskIds: string[] = [];
      const rejectedOperations: { operationId: string; message?: string }[] = [];
      const deferredOperationIds: string[] = [];

      for (const raw of body.data.operations) {
        const priority = readPriority(raw);

        // T-10-07 / D-12 to D-14: this endpoint only ever processes
        // INVENTORY_MEDIUM work -- a mis-routed higher- or lower-tier
        // envelope is deferred back untouched rather than absorbed into
        // inventory's own tier, mirroring `queueSync.controller.ts`'s exact
        // discipline for the queue-first ladder.
        if (priority !== undefined && priority !== ReplayPriority.INVENTORY_MEDIUM) {
          deferredOperationIds.push(readOperationId(raw));
          // eslint-disable-next-line no-continue
          continue;
        }

        // eslint-disable-next-line no-await-in-loop -- idempotency checks
        // must happen in submission order within one batch, exactly like
        // the shared replay ingress and queue's own replay dispatch do.
        const outcome = await replayService.replayInventoryOperation(context, raw);

        switch (outcome.status) {
          case 'APPLIED':
          case 'ACKNOWLEDGED_DUPLICATE':
            acknowledgedOperationIds.push(outcome.operationId);
            break;
          case 'REVIEW_CREATED':
            // T-10-09: the operation is acknowledged (it will not be
            // resent), but a lighter operational review task -- not silent
            // overwrite -- is what actually resolves the stock-truth
            // mismatch (D-10).
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
          reviewTaskIds,
          rejectedOperations,
          deferredOperationIds,
          processedAt: new Date().toISOString(),
        },
      });
    },
  };
}
