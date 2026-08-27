import { ConflictSeverity, ResolutionState } from '@breeyo/types';

/**
 * D-10: lighter-weight operational review for queue/inventory conflicts,
 * deliberately far less ceremony than EMR's `clinicalConflict.service.ts`
 * (no three-way field diff, no safe-merge computation, no mandatory named
 * clinician owner) -- inventory mismatches are a stock-truth reconciliation
 * problem, not a medical-record dispute. Mirrors the shape of
 * `queueOfflineReplay.service.ts`'s own inline `createOperationalReviewTask`
 * helper, pulled into its own file per this plan's explicit file list so the
 * mismatch-summary logic can be tested and reused independently of the
 * replay dispatch flow in `inventoryOfflineReplay.service.ts`.
 */

export type InventoryMismatchOperationType = 'RECEIVE' | 'DISPENSE' | 'ADJUST' | 'RETURN';

export interface InventoryMismatchInput {
  operationType: InventoryMismatchOperationType;
  itemId: string;
  errorCode: string;
  errorMessage: string;
  requestedQuantity?: number;
  availableQuantity?: number;
}

/**
 * D-22: FIFO auto-select is the pragmatic default, but the system cannot
 * silently pick a different batch or quantity on a live mismatch -- a vet
 * has to. `MANUAL_BATCH_CHOICE` is reserved for exactly the case where the
 * live batch/stock state can no longer satisfy what the offline device
 * queued (insufficient stock); everything else that stops a replay from
 * applying cleanly (item/movement no longer exists, a validation rule the
 * live state now violates) surfaces as a plain `MANUAL_REVIEW` instead of a
 * guessed automatic retry.
 */
export type InventoryRecommendedAction = 'MANUAL_BATCH_CHOICE' | 'MANUAL_REVIEW';

export interface InventoryMismatchSummary {
  summary: string;
  recommendedAction: InventoryRecommendedAction;
  details: Record<string, unknown>;
}

export interface InventoryReviewTaskStore {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface InventoryConflictReviewContext {
  clinicId: string;
  userId: string;
  deviceId: string;
}

export interface CreateInventoryReviewTaskInput {
  operationId: string;
  itemId: string;
  mismatch: InventoryMismatchInput;
}

export class InventoryConflictReviewService {
  constructor(private readonly reviewTasks: InventoryReviewTaskStore) {}

  /**
   * Produces a short, staff-readable summary of what diverged and a
   * recommended next action -- never a merged/guessed resolution, per D-10's
   * "review before overwrite" posture applied at inventory's lighter weight.
   */
  summarizeMismatch(input: InventoryMismatchInput): InventoryMismatchSummary {
    if (input.errorCode === 'INSUFFICIENT_STOCK') {
      return {
        summary: `Offline ${input.operationType.toLowerCase()} for item ${input.itemId} requested ${input.requestedQuantity ?? '?'} units, but only ${input.availableQuantity ?? 0} are available now. Pick a different batch or adjust the quantity.`,
        recommendedAction: 'MANUAL_BATCH_CHOICE',
        details: {
          requestedQuantity: input.requestedQuantity,
          availableQuantity: input.availableQuantity,
        },
      };
    }

    return {
      summary: `Offline ${input.operationType.toLowerCase()} for item ${input.itemId} could not be applied on reconnect: ${input.errorMessage}`,
      recommendedAction: 'MANUAL_REVIEW',
      details: { errorCode: input.errorCode },
    };
  }

  /**
   * Persists the mismatch into the SAME `SyncConflictRecord` table the
   * shared replay ingress and `queueOfflineReplay.service.ts` use --
   * `severity: OPERATIONAL` (never `SAFETY_CRITICAL`) is what keeps this on
   * the lighter review flow per D-10 rather than the clinical resolution
   * sheet. The originating user owns the first (guided) retry (D-22), same
   * as every other operational conflict.
   */
  async createInventoryReviewTask(
    context: InventoryConflictReviewContext,
    input: CreateInventoryReviewTaskInput,
  ): Promise<string> {
    const summary = this.summarizeMismatch(input.mismatch);

    const task = await this.reviewTasks.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId: input.operationId,
        domain: 'inventory',
        entityType: 'INVENTORY_ITEM',
        entityId: input.itemId,
        severity: ConflictSeverity.OPERATIONAL,
        localPayloadJson: { note: summary.summary, recommendedAction: summary.recommendedAction, ...summary.details },
        serverPayloadJson: { note: summary.summary, recommendedAction: summary.recommendedAction, ...summary.details },
        recommendedOwnerUserId: null,
        resolutionOwnerUserId: null,
        originatingUserId: context.userId,
        currentOwnerUserId: context.userId,
        resolutionState: ResolutionState.OPEN,
      },
    });
    return task.id;
  }
}
