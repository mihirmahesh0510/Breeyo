/**
 * Cross-phase EMR -> Inventory Navigation Hook (D-49)
 *
 * Mirrors `consultation-navigator.ts`'s `navigateToX(router, params)`
 * convention (the one non-component navigation-helper pattern already
 * established in this repo), rather than living inside
 * `InventoryNavigator.tsx` (which is the layout *component* itself, per
 * Expo Router's requirement that a `_layout.tsx` re-export a real Stack).
 *
 * Phase 4's EMR prescription screen (`apps/mobile/src/features/prescription/`)
 * is expected to import `navigateToInventoryDispense` from
 * `apps/mobile/src/features/inventory` (the feature barrel, see
 * `features/inventory/index.ts`) to jump straight into the real dispense
 * flow with the consultation/pet context attached, once "Dispense from
 * inventory?" is wired up on the EMR side (D-49's matching logic, D-58) --
 * that EMR-side wiring is out of Phase 5's scope (Phase 4 already shipped;
 * `MedicationForm.tsx` still hardcodes `inventoryItemId: null`), but this
 * export is the exact hook it needs when that lands.
 */
import type { Router } from 'expo-router';

export interface NavigateToInventoryDispenseParams {
  itemId: string;
  consultationId?: string;
  petName?: string;
}

/**
 * Navigates to DispenseScreen (`[itemId]/dispense.tsx`) with the
 * consultation/pet context attached. `DispenseScreen` shows "Linked to
 * consultation: [Pet Name]" whenever `consultationId` is present (D-49),
 * and treats a call with no `consultationId` as a standalone/counter-sale
 * dispense (D-52).
 */
export function navigateToInventoryDispense(
  router: Router,
  params: NavigateToInventoryDispenseParams,
): void {
  router.push({
    pathname: '/(app)/(tabs)/inventory/[itemId]/dispense' as const,
    params: {
      itemId: params.itemId,
      ...(params.consultationId ? { consultationId: params.consultationId } : {}),
      ...(params.petName ? { petName: params.petName } : {}),
    },
  });
}
