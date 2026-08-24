import { z } from 'zod';
import { dispenseSchema, stockReceiptSchema, stockAdjustmentSchema } from '@breeyo/validators';
import { offlineOperationEnvelopeSchema } from '@breeyo/validators';
import type { DispenseResult } from '@breeyo/types';
import { InventoryConflictReviewService, type InventoryMismatchOperationType } from './inventoryConflictReview.service.js';

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
    private readonly now: () => Date = () => new Date(),
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
  ): Promise<void> {
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
  }

  /**
   * Runs a gateway mutation, recording a receipt and returning `APPLIED` on
   * success. If the gateway throws a KNOWN mismatch error (stock/batch/item
   * state genuinely diverged), a lighter operational review is created
   * instead of the mismatch propagating as a raw failure (D-10) -- a
   * receipt is still recorded so a future flapping replay of this exact
   * operationId resolves as an idempotent no-op rather than creating a
   * second review task. Any OTHER (unexpected) error is rethrown unchanged
   * -- this service must never swallow a genuine infrastructure failure
   * into a false "reviewed" state.
   */
  private async applyOrReview(
    context: InventoryOfflineReplayContext,
    operationId: string,
    entityType: string,
    itemId: string,
    run: () => Promise<void>,
  ): Promise<InventoryReplayOutcome> {
    try {
      await run();
      await this.recordReceipt(context, operationId, entityType, itemId);
      return { operationId, status: 'APPLIED', itemId };
    } catch (error) {
      if (!isKnownMismatchError(error)) {
        throw error;
      }

      await this.recordReceipt(context, operationId, entityType, itemId);
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
