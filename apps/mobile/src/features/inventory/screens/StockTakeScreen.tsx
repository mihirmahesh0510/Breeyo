import React, { useCallback, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter, Stack } from 'expo-router';
import { Button, EmptyState, SearchBar, showToast, BottomSheet } from '@breeyo/ui';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItems } from '../hooks/useInventoryApi';
import { useInventorySearch } from '../hooks/useInventorySearch';
import { useStockTakeSession } from '../hooks/useStockTakeSession';
import { StockTakeItemRow } from '../components/StockTakeItemRow';
import { StockTakeSummary } from '../components/StockTakeSummary';
import type { StockTakeEntryState } from '../stores/stock-take.store';
import type { StockTakeSummary as StockTakeSummaryType } from '@breeyo/types';

type ScreenState = 'empty' | 'counting' | 'reviewing' | 'saving';

const COLORS = {
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
} as const;

/**
 * Stock-take screen (D-37, D-38, D-40) -- scan or select items, enter actual
 * counts, complete to see a discrepancy summary, save (POST
 * /inventory/stock-take) or discard. Entries live in the shared
 * `useStockTakeStore` (via `useStockTakeSession`), which
 * `useBarcodeScan`/BarcodeScannerScreen (mode="stockTake") also write into
 * when the vet uses "Scan Barcode" instead of "Select Item".
 */
export function StockTakeScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();

  const {
    entries,
    addEntry,
    updateCount,
    submitStockTake,
    getPreviewSummary,
    cancelStockTake,
    isSubmitting,
  } = useStockTakeSession();

  const [previewSummary, setPreviewSummary] = useState<StockTakeSummaryType | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const { searchTerm, setSearchTerm, debouncedSearch } = useInventorySearch();
  const itemsQuery = useInventoryItems(activeClinicId, { search: debouncedSearch, limit: 20 });

  const entryList: StockTakeEntryState[] = Array.from(entries.values());

  const screenState: ScreenState = previewSummary
    ? 'reviewing'
    : isSubmitting
      ? 'saving'
      : entryList.length === 0
        ? 'empty'
        : 'counting';

  const handleScanBarcode = useCallback(() => {
    router.push('/(app)/(tabs)/inventory/scan?mode=stockTake' as any);
  }, [router]);

  const handleSelectItemPicked = useCallback(
    (item: { id: string; name: string; unit: string; currentStock: number; sellingPrice: number }) => {
      addEntry(item.id, item.name, item.unit, item.currentStock, item.sellingPrice);
      setPickerVisible(false);
      setSearchTerm('');
    },
    [addEntry, setSearchTerm],
  );

  // D-40: "Complete Stock-Take" shows a review summary computed client-side
  // (see computeClientSummary) -- nothing is persisted yet. The actual
  // POST /inventory/stock-take only runs when "Save Stock-Take" is tapped
  // inside StockTakeSummary, since that endpoint has no dry-run mode.
  const handleComplete = useCallback(() => {
    setPreviewSummary(getPreviewSummary());
  }, [getPreviewSummary]);

  const handleSave = useCallback(async () => {
    try {
      const summary = await submitStockTake();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('success', `Stock-take saved. ${summary.discrepancies} adjustments applied.`);
      router.back();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('error', 'Could not save stock-take. Please try again.');
    }
  }, [submitStockTake, router]);

  const handleDiscard = useCallback(() => {
    cancelStockTake();
    setPreviewSummary(null);
    router.back();
  }, [cancelStockTake, router]);

  const handleCancel = useCallback(() => {
    cancelStockTake();
    router.back();
  }, [cancelStockTake, router]);

  if (screenState === 'reviewing' && previewSummary) {
    return (
      <View style={styles.container} testID="stock-take-screen">
        <Stack.Screen options={{ title: 'Stock-Take' }} />
        <StockTakeSummary
          summary={previewSummary}
          onSave={handleSave}
          onDiscard={handleDiscard}
          isSaving={isSubmitting}
          testID="stock-take-summary"
        />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="stock-take-screen">
      <Stack.Screen options={{ title: 'Stock-Take' }} />

      <Text variant="bodyMedium" style={styles.instruction}>
        Scan or select items and enter the actual count.
      </Text>

      <View style={styles.entryButtonsRow}>
        <Button variant="outlined" label="Scan Barcode" icon="barcode-scan" onPress={handleScanBarcode} testID="stock-take-scan-button" />
        <Button variant="outlined" label="Select Item" icon="plus" onPress={() => setPickerVisible(true)} testID="stock-take-select-item-button" />
      </View>

      {screenState === 'empty' ? (
        <EmptyState
          title="No items counted yet"
          description="Scan a barcode or select an item to start counting."
          testID="stock-take-empty-state"
        />
      ) : (
        <FlatList
          data={entryList}
          keyExtractor={(entry) => entry.itemId}
          renderItem={({ item }) => (
            <StockTakeItemRow entry={item} onCountChange={updateCount} testID={`stock-take-row-${item.itemId}`} />
          )}
          contentContainerStyle={styles.listContent}
          testID="stock-take-item-list"
        />
      )}

      <View style={styles.footer}>
        <Button
          variant="filled"
          label="Complete Stock-Take"
          onPress={handleComplete}
          disabled={entryList.length === 0 || isSubmitting}
          loading={isSubmitting}
          testID="stock-take-complete-button"
        />

        {!confirmingCancel ? (
          <Text
            variant="bodyMedium"
            style={styles.cancelTrigger}
            onPress={() => setConfirmingCancel(true)}
            testID="stock-take-cancel-trigger"
          >
            Cancel Stock-Take
          </Text>
        ) : (
          <View style={styles.confirmBox} testID="stock-take-cancel-confirm">
            <Text variant="bodySmall" style={styles.confirmText}>
              Discard this stock-take session? All counts entered so far will be lost.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirmingCancel(false)} testID="stock-take-cancel-dismiss">
                <Text variant="bodySmall" style={styles.confirmDismissText}>Keep Counting</Text>
              </Pressable>
              <Pressable onPress={handleCancel} testID="stock-take-cancel-confirm-button">
                <Text variant="bodySmall" style={styles.confirmDestructiveText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <BottomSheet visible={pickerVisible} onDismiss={() => setPickerVisible(false)} title="Select Item" testID="stock-take-item-picker">
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search by name or barcode"
          testID="stock-take-item-search"
        />
        <FlatList
          data={itemsQuery.data?.items ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.pickerRow}
              onPress={() => handleSelectItemPicked(item)}
              testID={`stock-take-picker-item-${item.id}`}
            >
              <Text variant="bodyLarge">{item.name}</Text>
              <Text variant="bodySmall" style={styles.pickerRowMeta}>
                {item.currentStock} {item.unit}
              </Text>
            </Pressable>
          )}
          testID="stock-take-picker-list"
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  instruction: {
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  entryButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  footer: {
    padding: 16,
    gap: 8,
  },
  cancelTrigger: {
    textAlign: 'center',
    color: COLORS.onSurfaceVariant,
  },
  confirmBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FFDAD6',
  },
  confirmText: {
    color: '#410002',
    marginBottom: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  confirmDismissText: {
    color: COLORS.onSurfaceVariant,
  },
  confirmDestructiveText: {
    color: COLORS.error,
    fontWeight: '700',
  },
  pickerRow: {
    height: 56,
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  pickerRowMeta: {
    color: COLORS.onSurfaceVariant,
  },
});
