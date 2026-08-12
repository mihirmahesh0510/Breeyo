import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../../../../../src/providers/AuthProvider';
import { useInventoryItem } from '../../../../../src/features/inventory/hooks/useInventoryApi';
import { StockAdjustmentSheet } from '../../../../../src/features/inventory/screens/StockAdjustmentSheet';

/**
 * Route wrapper for StockAdjustmentSheet (D-04) -- the component itself is a
 * controlled bottom sheet (`visible`/`itemId`/`itemName`/`unit`/
 * `currentStock`/`onDismiss`), not a route-param-reading screen like the
 * other inventory screens, so this route fetches the item (for
 * itemName/unit/currentStock) and renders it as an always-visible modal
 * page, dismissing back to the item detail screen on close.
 *
 * Note: `?batchId=&reason=` (used by InventoryItemDetailScreen's "Dispose
 * expired batch?" confirmation, D-57) are not yet consumed here --
 * StockAdjustmentSheet.tsx (Plan 05-06, out of this plan's file list) has
 * no prefill props for batch/reason. Left as a documented gap rather than
 * modifying that file's props outside this plan's scope.
 */
export default function InventoryAdjustRoute() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const itemQuery = useInventoryItem(activeClinicId, itemId);

  if (itemQuery.isLoading || !itemQuery.data) {
    return (
      <View style={styles.centered} testID="inventory-adjust-loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <StockAdjustmentSheet
      visible
      itemId={itemId}
      itemName={itemQuery.data.name}
      unit={itemQuery.data.unit}
      currentStock={itemQuery.data.currentStock}
      onDismiss={() => router.back()}
      testID="inventory-adjust-sheet"
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
});
