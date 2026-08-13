/**
 * Inventory feature barrel -- the public surface other features (namely
 * Phase 4's EMR/prescription code) are expected to import from, rather than
 * reaching into `features/inventory/screens|hooks|stores/*` directly.
 *
 * D-49 cross-phase hook: `navigateToInventoryDispense` lets the EMR
 * prescription screen (`apps/mobile/src/features/prescription/`) navigate
 * straight into the real dispense flow with the consultation/pet context
 * already attached, following the same `navigateToX(router, params)`
 * convention `apps/mobile/src/navigation/consultation-navigator.ts` already
 * established for Phase 4's own cross-screen navigation. As of this plan,
 * `MedicationForm.tsx` still hardcodes `inventoryItemId: null` (D-58's
 * fuzzy-match-to-inventory wiring was never completed in Phase 4) -- wiring
 * the EMR side to actually call this function is Phase 4/6 scope, not
 * Phase 5's; this export is the hook Phase 4 needs when that lands.
 */
export type { NavigateToInventoryDispenseParams } from '../../navigation/inventory-navigation';
export { navigateToInventoryDispense } from '../../navigation/inventory-navigation';

export { InventoryNavigator } from '../../navigation/InventoryNavigator';

export { InventoryListScreen } from './screens/InventoryListScreen';
export { InventoryItemDetailScreen } from './screens/InventoryItemDetailScreen';
export { ItemFormScreen } from './screens/ItemFormScreen';
export { BarcodeScannerScreen } from './screens/BarcodeScannerScreen';
export { StockReceiptScreen } from './screens/StockReceiptScreen';
export { DispenseScreen } from './screens/DispenseScreen';
export { StockAdjustmentSheet } from './screens/StockAdjustmentSheet';
export { StockTakeScreen } from './screens/StockTakeScreen';
export { WantListScreen } from './screens/WantListScreen';
