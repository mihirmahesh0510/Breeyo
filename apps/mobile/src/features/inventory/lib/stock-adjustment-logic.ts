import { stockAdjustmentSchema } from '@breeyo/validators';
import type { StockAdjustmentSchemaInput } from '@breeyo/validators';

/**
 * Pure stock-adjustment validation/submission logic (D-04), deliberately free
 * of any React/React Native import for the same reason as
 * `stock-receipt-logic.ts` -- directly unit-testable without mocking a whole
 * component's import graph. `StockAdjustmentSheet.tsx` imports from here
 * rather than duplicating this logic.
 */

export type AdjustmentType = 'add' | 'remove';

export interface StockAdjustmentFormErrors {
  quantity?: string;
  reason?: string;
  notes?: string;
}

/** D-04: signed quantity delta -- positive for Add, negative for Remove. */
export function computeSignedAdjustmentQuantity(type: AdjustmentType, quantity: number): number {
  return type === 'add' ? quantity : -quantity;
}

/** UI-SPEC: distinct success toast copy for add vs. remove. */
export function getAdjustmentSuccessToast(
  type: AdjustmentType,
  quantity: number,
  unit: string,
  itemName: string,
): string {
  return type === 'add'
    ? `${quantity} ${unit} added to ${itemName}`
    : `${quantity} ${unit} removed from ${itemName}`;
}

/**
 * Verify-fix 10.2 (D-04, D-10, D-19): queued-for-sync toast copy when a
 * stock adjustment's online request fails with a genuine network failure
 * and falls through to `useOfflineStockActions.adjustStock` instead.
 * Distinct wording from the online success toast so staff can tell "this
 * happened" from "this happened, but only on this device until reconnect"
 * -- the same calm, non-blocking confirmation posture `QueueCardItem.tsx`'s
 * pending-sync marker established for queue (D-03, D-19 to D-21).
 */
export function getAdjustmentQueuedToast(
  type: AdjustmentType,
  quantity: number,
  unit: string,
  itemName: string,
): string {
  return type === 'add'
    ? `${quantity} ${unit} added to ${itemName} -- will sync when back online`
    : `${quantity} ${unit} removed from ${itemName} -- will sync when back online`;
}

export type StockAdjustmentSubmissionResult =
  | { success: true; payload: StockAdjustmentSchemaInput }
  | { success: false; errors: StockAdjustmentFormErrors };

/**
 * Validates + builds the stock-adjustment API payload from raw form state.
 * D-04 requires a reason from the preset list, enforced here before the
 * shared `stockAdjustmentSchema` (which also enforces it, defense-in-depth,
 * matching the API layer's own double-validation convention).
 */
export function buildStockAdjustmentSubmission(
  quantityInput: string,
  type: AdjustmentType,
  reason: string,
  notes: string,
): StockAdjustmentSubmissionResult {
  const preErrors: StockAdjustmentFormErrors = {};

  if (!quantityInput.trim()) {
    preErrors.quantity = 'Enter quantity';
  }
  if (!reason) {
    preErrors.reason = 'Select a reason for this adjustment';
  }

  if (Object.keys(preErrors).length > 0) {
    return { success: false, errors: preErrors };
  }

  const payload = {
    quantity: Number(quantityInput),
    type,
    reason,
    notes: notes.trim() || null,
  };

  const validation = stockAdjustmentSchema.safeParse(payload);
  if (!validation.success) {
    const out: StockAdjustmentFormErrors = {};
    for (const issue of validation.error.issues) {
      const key = String(issue.path[0] ?? 'quantity') as keyof StockAdjustmentFormErrors;
      if (!out[key]) out[key] = issue.message;
    }
    return { success: false, errors: out };
  }

  return { success: true, payload: validation.data };
}
