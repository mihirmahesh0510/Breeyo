import { dispenseSchema } from '@breeyo/validators';
import type { DispenseSchemaInput } from '@breeyo/validators';
import type { StockBatch } from '@breeyo/types';

/**
 * Pure FIFO-dispense logic (D-22 auto-select + override, D-25 expired-batch
 * blocking), deliberately free of any React/React Native import -- same
 * rationale as `stock-receipt-logic.ts`/`stock-adjustment-logic.ts` (Plan 06
 * Task 1): directly unit-testable in this repo's vitest "node" environment
 * without mocking react-native/react-native-paper/@breeyo/ui/expo-router.
 * `QuantityStepper.tsx`, `FifoBatchDisplay.tsx`, `BatchOverrideList.tsx`,
 * `ExpiredBatchBlocker.tsx`, and `DispenseScreen.tsx` all import from here
 * rather than duplicating this logic.
 */

// --- Expiry detection (D-25) ---

/** A batch is expired if the server-computed flag is set, or its expiryDate has passed. */
export function isBatchExpired(batch: StockBatch): boolean {
  if (batch.isExpired) return true;
  if (!batch.expiryDate) return false;
  const expiry = typeof batch.expiryDate === 'string' ? new Date(batch.expiryDate) : batch.expiryDate;
  return expiry.getTime() <= Date.now();
}

// --- FIFO ordering + auto-selection (D-22) ---

/** FIFO order: oldest `receivedAt` first. Does not mutate the input array. */
export function sortBatchesByReceivedAt(batches: StockBatch[]): StockBatch[] {
  return [...batches].sort((a, b) => {
    const aTime = new Date(a.receivedAt).getTime();
    const bTime = new Date(b.receivedAt).getTime();
    return aTime - bTime;
  });
}

/**
 * D-22: auto-select the oldest non-expired batch that still has stock.
 * Returns null when no batch qualifies (all expired or all depleted) --
 * callers must handle that case (D-25 blocks dispensing entirely then).
 */
export function selectFifoBatch(batches: StockBatch[]): StockBatch | null {
  const sorted = sortBatchesByReceivedAt(batches);
  return sorted.find((batch) => !isBatchExpired(batch) && batch.currentQty > 0) ?? null;
}

// --- Quantity clamping ---

/**
 * Clamp a quantity into [min, max]. If max < min (e.g. zero stock with a
 * min of 1), falls back to min rather than producing an inverted range --
 * the resulting quantity is still expected to fail `getInsufficientStockError`
 * downstream, which is the actual signal the UI should block on.
 */
export function clampQuantity(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const upper = Math.max(min, max);
  return Math.min(Math.max(value, min), upper);
}

// --- Date formatting (DD MMM YYYY, matching BatchList.tsx's convention) ---

export function formatExpiryDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// --- Error copy (exact UI-SPEC strings) ---

export function getInsufficientStockError(quantity: number, available: number, unit: string): string | null {
  if (quantity > available) {
    return `Only ${available} ${unit} available. Enter a smaller quantity.`;
  }
  return null;
}

export function getExpiredBatchError(expiryDate: Date | string | null | undefined): string {
  const formatted = formatExpiryDate(expiryDate) ?? 'unknown date';
  return `Cannot dispense -- batch expired on ${formatted}`;
}

// --- Submission building ---

export interface DispenseFormErrors {
  quantity?: string;
  batch?: string;
}

export interface BuildDispenseParams {
  quantity: number;
  available: number;
  unit: string;
  selectedBatch: StockBatch | null;
  fifoBatchId: string | null;
  consultationId?: string | null;
  invoiceId?: string | null;
  ownerId?: string | null;
}

export type DispenseSubmissionResult =
  | { success: true; payload: DispenseSchemaInput }
  | { success: false; errors: DispenseFormErrors };

/**
 * Validates + builds the dispense API payload from screen state.
 *
 * Two pre-checks before the shared `dispenseSchema` itself (mirroring the
 * receipt/adjustment logic modules' layering):
 *  1. D-25: block whenever the batch actually in use (override or FIFO) is
 *     expired -- this is the client-side mirror of FifoDispenseService's own
 *     server-side expired-batch rejection.
 *  2. Insufficient-stock check with the UI-SPEC's exact copy.
 *
 * `overrideBatchId` is only included in the payload when the selected batch
 * differs from the FIFO auto-selected one -- dispensing from the FIFO batch
 * itself is the default path and needs no override marker.
 */
export function buildDispenseSubmission(params: BuildDispenseParams): DispenseSubmissionResult {
  const { quantity, available, unit, selectedBatch, fifoBatchId, consultationId, invoiceId, ownerId } = params;
  const errors: DispenseFormErrors = {};

  if (!selectedBatch) {
    errors.batch = 'No available batch to dispense from.';
  } else if (isBatchExpired(selectedBatch)) {
    errors.batch = getExpiredBatchError(selectedBatch.expiryDate);
  }

  const insufficient = getInsufficientStockError(quantity, available, unit);
  if (insufficient) {
    errors.quantity = insufficient;
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const payload: Record<string, unknown> = { quantity };
  if (selectedBatch && selectedBatch.id !== fifoBatchId) {
    payload.overrideBatchId = selectedBatch.id;
  }
  payload.consultationId = consultationId ?? null;
  payload.invoiceId = invoiceId ?? null;
  payload.ownerId = ownerId ?? null;

  const validation = dispenseSchema.safeParse(payload);
  if (!validation.success) {
    const out: DispenseFormErrors = {};
    for (const issue of validation.error.issues) {
      out.quantity = issue.message;
    }
    return { success: false, errors: out };
  }

  return { success: true, payload: validation.data };
}
