import { EXPIRY_REQUIRED_CATEGORIES } from '@breeyo/types';
import { stockReceiptSchema } from '@breeyo/validators';
import type { StockReceiptSchemaInput } from '@breeyo/validators';

/**
 * Pure stock-receipt validation/submission logic (D-01, D-03, D-09, D-11, D-27),
 * deliberately kept free of any React/React Native import so it's directly
 * unit-testable in this repo's vitest "node" environment without mocking a whole
 * component's import graph (react-native/react-native-paper/@breeyo/ui/expo-router
 * all fail to load untransformed here -- see 05-04-SUMMARY.md finding #5 on
 * react-test-renderer being broken, and useBarcodeScan.test.ts/
 * useItemPhotoUpload.test.ts for the amount of mocking a component-level import
 * graph otherwise requires). `StockReceiptForm.tsx` and `StockReceiptScreen.tsx`
 * both import from here rather than duplicating this logic.
 */

// --- D-27: category-conditional expiry requirement ---

/** D-27: expiry date is mandatory when the item's category is medicine, vaccine, or lab_consumable. */
export function isExpiryRequiredForCategory(category: string): boolean {
  return EXPIRY_REQUIRED_CATEGORIES.includes(category);
}

export const EXPIRY_REQUIRED_NOTE = 'Required for Medicine/Vaccine/Consumable';

/**
 * Verify-fix 10.2 (D-04, D-10, D-19): queued-for-sync toast copy when a
 * stock receipt's online request fails with a genuine network failure and
 * falls through to `useOfflineStockActions.receiveStock` instead. Distinct
 * wording from the online success toast so staff can tell "this happened"
 * from "this happened, but only on this device until reconnect" -- the same
 * calm, non-blocking confirmation posture `QueueCardItem.tsx`'s pending-sync
 * marker established for queue (D-03, D-19 to D-21).
 */
export function getStockReceiptQueuedToast(quantity: number, unit: string, itemName: string): string {
  return `${quantity} ${unit} of ${itemName} received -- will sync when back online`;
}

// --- Form data shape ---

export interface StockReceiptFormData {
  quantity: string;
  lotNumber: string;
  expiryDate: string;
  purchasePrice: string;
  supplier: string;
}

export const EMPTY_STOCK_RECEIPT_FORM: StockReceiptFormData = {
  quantity: '',
  lotNumber: '',
  expiryDate: '',
  purchasePrice: '',
  supplier: '',
};

export interface StockReceiptFormErrors {
  quantity?: string;
  lotNumber?: string;
  expiryDate?: string;
  purchasePrice?: string;
  supplier?: string;
}

export type StockReceiptSubmissionResult =
  | { success: true; payload: StockReceiptSchemaInput }
  | { success: false; errors: StockReceiptFormErrors };

function buildErrorsFromZodIssues(
  issues: Array<{ path: (string | number)[]; message: string }>,
): StockReceiptFormErrors {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'quantity');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Validates + builds the stock-receipt API payload from raw form strings.
 *
 * Two validation passes, mirroring the API's own layering:
 *  1. The D-27 category-conditional expiry requirement (`stockReceiptSchema` has
 *     no knowledge of the item's category, so this client-side check exists
 *     purely to produce the UI-SPEC's category-aware message before the request
 *     ever goes out -- the API's `StockReceiptService.receiveStock()` enforces
 *     the same rule server-side as defense-in-depth).
 *  2. `stockReceiptSchema` itself (quantity positivity/format, expiry
 *     future-date check, price/format checks).
 *  3. A distinct "Enter the quantity received" message for a blank quantity,
 *     since the schema's own positive-number message ("Quantity must be
 *     greater than 0") doesn't match the UI-SPEC's required-field copy.
 */
export function buildStockReceiptSubmission(
  data: StockReceiptFormData,
  category: string,
): StockReceiptSubmissionResult {
  const preErrors: StockReceiptFormErrors = {};

  if (!data.quantity.trim()) {
    preErrors.quantity = 'Enter the quantity received';
  }

  if (isExpiryRequiredForCategory(category) && !data.expiryDate.trim()) {
    preErrors.expiryDate = `Expiry date is required for ${category} items`;
  }

  if (Object.keys(preErrors).length > 0) {
    return { success: false, errors: preErrors };
  }

  const payload = {
    quantity: Number(data.quantity),
    lotNumber: data.lotNumber.trim() || null,
    expiryDate: data.expiryDate.trim() || null,
    purchasePrice: data.purchasePrice.trim() ? Number(data.purchasePrice) : null,
    supplier: data.supplier.trim() || null,
  };

  const validation = stockReceiptSchema.safeParse(payload);
  if (!validation.success) {
    return { success: false, errors: buildErrorsFromZodIssues(validation.error.issues) };
  }

  return { success: true, payload: validation.data };
}
