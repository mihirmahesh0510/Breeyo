import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { dispenseSchema, stockReceiptSchema, stockAdjustmentSchema } from '@breeyo/validators';
import { offlineOperationEnvelopeSchema } from '@breeyo/validators';
import type { DispenseResult } from '@breeyo/types';
import { InventoryConflictReviewService, type InventoryMismatchOperationType } from './inventoryConflictReview.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

/** Domain-specific `entityType` values this service dispatches on. Inventory
 *  envelopes always carry `domain: 'inventory'` and one of these four
 *  shapes -- every other `entityType` is rejected rather than silently
 *  ignored, matching `queueOfflineReplay.service.ts`'s own convention. */
export const STOCK_RECEIVE_ENTITY_TYPE = 'STOCK_RECEIVE';
export const STOCK_DISPENSE_ENTITY_TYPE = 'STOCK_DISPENSE';
export const STOCK_ADJUST_ENTITY_TYPE = 'STOCK_ADJUST';
export const STOCK_RETURN_ENTITY_TYPE = 'STOCK_RETURN';

/** Return-to-stock has no shared online zod schema to reuse (the online
 *  route takes `movementId` as a URL param with no request body) -- a small
 *  local schema, same convention `queueOfflineReplay.service.ts` uses for
 *  its own payload shapes. */
const stockReturnPayloadSchema = z.object({
  movementId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
  quantity: z.number().int().positive(),
});

export interface ReceiptResult {
  batch: { id: string };
  movement: { id: string };
}

export interface AdjustResult {
  movement: { id: string };
  item: { id: string; currentStock: number };
}

export interface ReturnResult {
  id: string;
}

/**
 * Minimal shape this service needs from the three existing stock-mutation
 * services (`StockReceiptService.receiveStock`, `FifoDispenseService.dispense`
 * /`returnToStock`, `StockAdjustmentService.adjust`). Method signatures
 * intentionally match those real services exactly so
 * `inventorySync.controller.ts` can compose a real gateway from them with no
 * behavior duplicated here -- this service's only job is idempotency +
 * review-instead-of-overwrite, never re-implementing FIFO/batch/expiry logic
 * that already lives (and is already tested) in those services.
 */
export interface InventoryOfflineReplayGateway {
  receiveStock(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string | undefined,
    data: unknown,
  ): Promise<ReceiptResult>;
  dispense(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string | undefined,
    data: unknown,
  ): Promise<DispenseResult>;
  adjust(
    clinicId: string,
    itemId: string,
    userId: string,
    userName: string | undefined,
    data: unknown,
  ): Promise<AdjustResult>;
  returnToStock(
    clinicId: string,
    movementId: string,
    userId: string,
    userName: string | undefined,
  ): Promise<ReturnResult>;
}

/**
 * Same shape as `ReplayIngestPrismaClient['syncReplayReceipt']` /
 * `QueueReplayReceiptStore` -- reads/writes the SAME `SyncReplayReceipt`
 * table (Plan 10-01's shared idempotency ledger) rather than inventing a
 * second one.
 */
export interface InventoryReplayReceiptStore {
  findUnique(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<{ operationId: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ operationId: string }>;
  delete(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<unknown>;
}

export interface InventoryOfflineReplayContext {
  clinicId: string;
  userId: string;
  deviceId: string;
  /** Not carried by the offline replay envelope/context (mirrors
   *  `queueOfflineReplay.service.ts`'s own context, which has no userName
   *  either) -- resolved by the controller from the authenticated request
   *  when available, `undefined` otherwise. Purely a display label on the
   *  resulting StockMovement row, never used for authorization. */
  userName?: string;
}

export type InventoryReplayOutcomeStatus = 'APPLIED' | 'ACKNOWLEDGED_DUPLICATE' | 'REVIEW_CREATED' | 'REJECTED';

export interface InventoryReplayOutcome {
  operationId: string;
  status: InventoryReplayOutcomeStatus;
  itemId?: string;
  reviewTaskId?: string;
  message?: string;
}

const KNOWN_MISMATCH_CODES = new Set(['ITEM_NOT_FOUND', 'INSUFFICIENT_STOCK', 'VALIDATION_ERROR', 'MOVEMENT_NOT_FOUND']);

interface KnownMismatchError extends Error {
  code: string;
  itemId?: string;
  requested?: number;
  available?: number;
}

function isKnownMismatchError(error: unknown): error is KnownMismatchError {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    KNOWN_MISMATCH_CODES.has((error as { code: string }).code)
  );
}

function stringField(raw: unknown, field: string): string {
  if (raw && typeof raw === 'object' && field in raw) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

const ENTITY_TYPE_TO_OPERATION: Record<string, InventoryMismatchOperationType> = {
  [STOCK_RECEIVE_ENTITY_TYPE]: 'RECEIVE',
  [STOCK_DISPENSE_ENTITY_TYPE]: 'DISPENSE',
  [STOCK_ADJUST_ENTITY_TYPE]: 'ADJUST',
  [STOCK_RETURN_ENTITY_TYPE]: 'RETURN',
};

/**
 * D-41-D-44: same permission code each entityType's equivalent ONLINE route
 * already enforces at registration (`inventory.routes.ts`'s `/receive`,
 * `dispense.routes.ts`'s `/dispense`|`/adjust`|`/movements/:id/return`) --
 * mirrors `sync-operation.service.ts`'s `SYNC_OPERATION_PERMISSIONS` map,
 * since Fastify's route-level preHandler can't vary by envelope entityType.
 */
const ENTITY_TYPE_TO_PERMISSION: Record<string, string> = {
  [STOCK_RECEIVE_ENTITY_TYPE]: 'MANAGE_INVENTORY_STOCK',
  [STOCK_DISPENSE_ENTITY_TYPE]: 'DISPENSE_INVENTORY',
  [STOCK_ADJUST_ENTITY_TYPE]: 'MANAGE_INVENTORY_STOCK',
  [STOCK_RETURN_ENTITY_TYPE]: 'DISPENSE_INVENTORY',
};

/** Minimal shape this service needs from PermissionService -- kept as a
 *  local interface instead of importing the concrete class, matching
 *  `sync-operation.service.ts`'s own `PermissionsProvider`. */
export interface PermissionsProvider {
  getUserPermissions(userId: string, clinicId: string): Promise<string[]>;
}

function forbiddenError(entityType: string, requiredPermission: string): Error & { statusCode: number; code: string } {
  const error = new Error(`Permission denied: ${entityType} requires ${requiredPermission}`) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

/**
 * Server-side reconciliation for offline inventory mutations (PLT-03, D-04,
 * D-10, T-10-07, T-10-08). Sits one layer below `inventorySync.controller.ts`:
 * idempotency is enforced against the shared `SyncReplayReceipt` ledger
 * (Plan 10-01), and every mutation is applied through the SAME
 * FIFO/batch/expiry-aware services (`FifoDispenseService`,
 * `StockAdjustmentService`, `StockReceiptService`) the online routes use --
 * this class never re-implements or bypasses that logic, so a replay can
 * never apply a stock change the live online path could not also apply.
 *
 * D-10: when live state has moved on since the device went offline (the
 * live FIFO/batch state can no longer satisfy a queued dispense/return, an
 * item/movement no longer exists, or a stock-truth rule the live figure now
 * violates), the mismatch is NOT silently overwritten -- it routes into
 * `InventoryConflictReviewService` for a lighter-weight operational review
 * (D-10) than EMR's `clinicalConflict.service.ts` ever uses.
 */
export class InventoryOfflineReplayService {
  constructor(
    private readonly gateway: InventoryOfflineReplayGateway,
    private readonly replayReceipts: InventoryReplayReceiptStore,
    private readonly conflictReview: InventoryConflictReviewService,
    private readonly permissionsProvider: PermissionsProvider,
    private readonly now: () => Date = () => new Date(),
    // Verify-fix 10.3: defaults to a no-op broadcast, matching the other
    // three domain replay services' convention; `inventorySync.controller.ts`
    // wires a real `ReplayBroadcastService(fastify.io)` in for production.
    private readonly broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
  ) {}

  async replayInventoryOperation(context: InventoryOfflineReplayContext, raw: unknown): Promise<InventoryReplayOutcome> {
    const parsedEnvelope = offlineOperationEnvelopeSchema.safeParse(raw);
    if (!parsedEnvelope.success) {
      return {
        operationId: stringField(raw, 'operationId'),
        status: 'REJECTED',
        message: parsedEnvelope.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const envelope = parsedEnvelope.data;

    const requiredPermission = ENTITY_TYPE_TO_PERMISSION[envelope.entityType];
    if (requiredPermission === undefined) {
      return {
        operationId: envelope.operationId,
        status: 'REJECTED',
        message: `Unsupported inventory replay entityType: ${envelope.entityType}`,
      };
    }

    // D-41-D-44: enforced here rather than as a route-level preHandler --
    // the required permission varies per replayed operation's entityType,
    // which Fastify's route-level preHandler can't inspect (same reasoning
    // as `sync-operation.service.ts`'s `SyncOperationService.execute()`).
    const userPermissions = await this.permissionsProvider.getUserPermissions(context.userId, context.clinicId);
    if (!userPermissions.includes(requiredPermission)) {
      throw forbiddenError(envelope.entityType, requiredPermission);
    }

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
      // T-10-03/T-10-07: a duplicate or flapping replay of an
      // already-acknowledged operation is a no-op, not a second write.
      return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE' };
    }

    switch (envelope.entityType) {
      case STOCK_RECEIVE_ENTITY_TYPE:
        return this.replayReceive(context, envelope.operationId, envelope.entityId, envelope.payload);
      case STOCK_DISPENSE_ENTITY_TYPE:
        return this.replayDispense(context, envelope.operationId, envelope.entityId, envelope.payload);
      case STOCK_ADJUST_ENTITY_TYPE:
        return this.replayAdjust(context, envelope.operationId, envelope.entityId, envelope.payload);
      case STOCK_RETURN_ENTITY_TYPE:
        return this.replayReturn(context, envelope.operationId, envelope.entityId, envelope.payload);
      default:
        return {
          operationId: envelope.operationId,
          status: 'REJECTED',
          message: `Unsupported inventory replay entityType: ${envelope.entityType}`,
        };
    }
  }

  private async recordReceipt(
    context: InventoryOfflineReplayContext,
    operationId: string,
    entityType: string,
    itemId: string,
  ): Promise<{ raced: boolean }> {
    try {
      await this.replayReceipts.create({
        data: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId,
          userId: context.userId,
          domain: 'inventory',
          entityType,
          entityId: itemId,
        },
      });
      return { raced: false };
    } catch (err) {
      // WR-1: the `findUnique` in `replayInventoryOperation` and this
      // `create` are not transactional, so a genuinely concurrent duplicate
      // replay of the same operationId can both see no existing receipt and
      // both reach here. `applyOrReview` calls this BEFORE running any
      // gateway mutation, so the `[clinicId, deviceId, operationId]` unique
      // constraint lets exactly one of them win the reservation; the loser
      // hits P2002 here and never runs the mutation at all. Matching
      // `replayIngest.service.ts`'s "Verify-fix 10.9" pattern: treat that as
      // "already acknowledged by the request that won the race" and let the
      // caller return an idempotent-duplicate outcome instead of this
      // surfacing as an unhandled 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const racedReceipt = await this.replayReceipts.findUnique({
          where: {
            clinicId_deviceId_operationId: {
              clinicId: context.clinicId,
              deviceId: context.deviceId,
              operationId,
            },
          },
        });
        if (racedReceipt) {
          return { raced: true };
        }
      }
      throw err;
    }
  }

  /**
   * WR-1: releases a receipt this same request just reserved (in
   * `applyOrReview`, below) after its gateway mutation turned out to fail
   * with an unexpected error -- so a legitimate later retry of this exact
   * operationId is not permanently and incorrectly told "already handled"
   * for a mutation that never actually applied.
   */
  private async releaseReceipt(context: InventoryOfflineReplayContext, operationId: string): Promise<void> {
    await this.replayReceipts.delete({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId,
        },
      },
    });
  }

  /**
   * WR-1: reserves this operationId's receipt FIRST -- before the gateway
   * mutation ever runs -- so two genuinely concurrent replays of the same
   * operationId cannot both pass the earlier `findUnique` check and both
   * execute `run()` (e.g. both dispense stock). Only the request that wins
   * the receipt-create race proceeds to run the mutation at all; the loser
   * returns `ACKNOWLEDGED_DUPLICATE` immediately, untouched.
   *
   * If the gateway then throws a KNOWN mismatch error (stock/batch/item
   * state genuinely diverged), the already-reserved receipt is kept (so a
   * future flapping replay of this exact operationId resolves as an
   * idempotent no-op rather than creating a second review task) and a
   * lighter operational review is created instead of the mismatch
   * propagating as a raw failure (D-10). Any OTHER (unexpected) error
   * releases the reservation and rethrows unchanged -- this service must
   * never swallow a genuine infrastructure failure into a false "reviewed"
   * state, nor permanently lock out a retry of a mutation that never ran.
   */
  private async applyOrReview(
    context: InventoryOfflineReplayContext,
    operationId: string,
    entityType: string,
    itemId: string,
    run: () => Promise<void>,
  ): Promise<InventoryReplayOutcome> {
    const reservation = await this.recordReceipt(context, operationId, entityType, itemId);
    if (reservation.raced) {
      // WR-1: lost the race to reserve this operationId's receipt -- a
      // concurrent replay of the SAME operation already won it and is the
      // request of record, so this request acknowledges without ever
      // running the mutation.
      return { operationId, status: 'ACKNOWLEDGED_DUPLICATE', itemId };
    }

    try {
      await run();
      // Verify-fix 10.3: an open browser inventory view watching this item
      // should hear about the applied replay without waiting for its own poll.
      this.broadcast.emitReplayApplied({ clinicId: context.clinicId, domain: 'inventory', entityIds: [itemId] });
      return { operationId, status: 'APPLIED', itemId };
    } catch (error) {
      if (!isKnownMismatchError(error)) {
        await this.releaseReceipt(context, operationId);
        throw error;
      }

      const reviewTaskId = await this.conflictReview.createInventoryReviewTask(context, {
        operationId,
        itemId,
        mismatch: {
          operationType: ENTITY_TYPE_TO_OPERATION[entityType] ?? 'ADJUST',
          itemId,
          errorCode: error.code,
          errorMessage: error.message,
          requestedQuantity: error.requested,
          availableQuantity: error.available,
        },
      });
      // Verify-fix 10.3: D-05/D-10 -- a known mismatch produced a new
      // unresolved review task, not a silent overwrite.
      this.broadcast.emitReplayConflictOpened({ clinicId: context.clinicId, domain: 'inventory', entityIds: [itemId] });
      return { operationId, status: 'REVIEW_CREATED', itemId, reviewTaskId };
    }
  }

  private async replayReceive(
    context: InventoryOfflineReplayContext,
    operationId: string,
    itemId: string,
    rawPayload: unknown,
  ): Promise<InventoryReplayOutcome> {
    const parsedPayload = stockReceiptSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return { operationId, status: 'REJECTED', message: parsedPayload.error.issues.map((i) => i.message).join(', ') };
    }

    return this.applyOrReview(context, operationId, STOCK_RECEIVE_ENTITY_TYPE, itemId, async () => {
      await this.gateway.receiveStock(context.clinicId, itemId, context.userId, context.userName, parsedPayload.data);
    });
  }

  private async replayDispense(
    context: InventoryOfflineReplayContext,
    operationId: string,
    itemId: string,
    rawPayload: unknown,
  ): Promise<InventoryReplayOutcome> {
    const parsedPayload = dispenseSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return { operationId, status: 'REJECTED', message: parsedPayload.error.issues.map((i) => i.message).join(', ') };
    }

    // T-10-08: `FifoDispenseService.dispense` re-checks the live batch/expiry
    // state (row-locked, `FOR UPDATE`) itself before applying anything --
    // this call is exactly where a stale offline decision meets the
    // authoritative current stock truth. This service adds nothing extra on
    // top of that re-check other than deciding what happens when it fails.
    return this.applyOrReview(context, operationId, STOCK_DISPENSE_ENTITY_TYPE, itemId, async () => {
      await this.gateway.dispense(context.clinicId, itemId, context.userId, context.userName, parsedPayload.data);
    });
  }

  private async replayAdjust(
    context: InventoryOfflineReplayContext,
    operationId: string,
    itemId: string,
    rawPayload: unknown,
  ): Promise<InventoryReplayOutcome> {
    const parsedPayload = stockAdjustmentSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return { operationId, status: 'REJECTED', message: parsedPayload.error.issues.map((i) => i.message).join(', ') };
    }

    return this.applyOrReview(context, operationId, STOCK_ADJUST_ENTITY_TYPE, itemId, async () => {
      await this.gateway.adjust(context.clinicId, itemId, context.userId, context.userName, parsedPayload.data);
    });
  }

  private async replayReturn(
    context: InventoryOfflineReplayContext,
    operationId: string,
    itemId: string,
    rawPayload: unknown,
  ): Promise<InventoryReplayOutcome> {
    const parsedPayload = stockReturnPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      return { operationId, status: 'REJECTED', message: parsedPayload.error.issues.map((i) => i.message).join(', ') };
    }
    const payload = parsedPayload.data;

    return this.applyOrReview(context, operationId, STOCK_RETURN_ENTITY_TYPE, itemId, async () => {
      await this.gateway.returnToStock(context.clinicId, payload.movementId, context.userId, context.userName);
    });
  }
}
