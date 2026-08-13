/**
 * Inventory Feature Navigator (Plan 05-07)
 *
 * This repo's navigation is 100% Expo Router (file-based) -- there is no
 * `BottomTabNavigator.tsx`/`AppNavigator.tsx` using `@react-navigation`
 * directly anywhere (confirmed: `apps/mobile/app/(app)/(tabs)/_layout.tsx`
 * uses expo-router's `<Tabs>`, `apps/mobile/app/(app)/_layout.tsx` uses
 * expo-router's `<Stack>`). Expo Router's `<Stack>`/`<Stack.Screen>` *is*
 * a thin wrapper around `@react-navigation/native-stack`, so this component
 * genuinely is "a React Navigation stack with all inventory screens" (the
 * must_haves key_link this file satisfies) -- it's just authored the way
 * this codebase's other feature navigator (`consultation-navigator.ts`)
 * and every existing screen already use `expo-router`, not a bare
 * react-navigation `NavigationContainer`.
 *
 * Because Expo Router requires layouts to live in the `app/` filesystem
 * tree, this component is re-exported as the default from
 * `apps/mobile/app/(app)/(tabs)/inventory/_layout.tsx`, which is what
 * actually wires it into the route tree, under the "Inventory" bottom tab
 * (see the `Tabs.Screen name="inventory"` entry added to
 * `app/(app)/(tabs)/_layout.tsx`).
 *
 * Route file map (all under app/(app)/(tabs)/inventory/):
 *   index.tsx              -> InventoryListScreen   (tab landing, D-30/D-31/D-32)
 *   add.tsx                -> ItemFormScreen         (create; ?prefilledBarcode= from scan, D-14/D-20)
 *   scan.tsx                -> BarcodeScannerScreen   (full-screen modal, all 3 modes, D-17)
 *   stock-take.tsx          -> StockTakeScreen        (D-37/D-38/D-40)
 *   want-list.tsx           -> WantListScreen         (D-06/D-24/D-28)
 *   [itemId]/index.tsx      -> InventoryItemDetailScreen (D-33)
 *   [itemId]/edit.tsx       -> ItemFormScreen (edit mode -- itemId comes from the segment)
 *   [itemId]/receive.tsx    -> StockReceiptScreen     (D-01/D-03/D-09/D-11/D-27)
 *   [itemId]/dispense.tsx   -> DispenseScreen         (D-22/D-25/D-49/D-52/D-60)
 *   [itemId]/adjust.tsx     -> StockAdjustmentSheet   (wrapped as a modal-presented screen, D-04)
 */
import React from 'react';
import { Stack } from 'expo-router';

const HEADER_OPTIONS = {
  headerShown: true,
  headerStyle: { backgroundColor: '#FFFBF5' },
  headerTintColor: '#1C1B1F',
} as const;

export function InventoryNavigator() {
  return (
    <Stack screenOptions={HEADER_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'Inventory', headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add Item' }} />
      <Stack.Screen
        name="scan"
        options={{
          title: '',
          headerTransparent: true,
          headerTintColor: '#FFFFFF',
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen name="stock-take" options={{ title: 'Stock-Take' }} />
      <Stack.Screen name="want-list" options={{ title: 'Want List' }} />
      <Stack.Screen name="[itemId]/index" options={{ title: 'Item Details' }} />
      <Stack.Screen name="[itemId]/edit" options={{ title: 'Edit Item' }} />
      <Stack.Screen name="[itemId]/receive" options={{ title: 'Receive Stock' }} />
      <Stack.Screen name="[itemId]/dispense" options={{ title: 'Dispense' }} />
      <Stack.Screen name="[itemId]/adjust" options={{ title: 'Adjust Stock', presentation: 'modal' }} />
    </Stack>
  );
}

export default InventoryNavigator;
