import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text, TextInput as PaperTextInput } from 'react-native-paper';
import { Button } from '@breeyo/ui';
import { getStockLevelStatus } from '@breeyo/types';
import type { ScanResultItemView } from '../hooks/useBarcodeScan';
import type { ScannerMode } from '../stores/scanner.store';

// --- Constants ---

const COLORS = {
  primary: '#2E7D32',
  tertiary: '#E65100',
  error: '#BA1A1A',
  onSurfaceVariant: '#49454F',
  outlineVariant: '#CAC4D0',
} as const;

const STOCK_STATUS_COLOR: Record<string, string> = {
  healthy: COLORS.primary,
  warning: COLORS.tertiary,
  critical: COLORS.error,
  no_par_level: COLORS.onSurfaceVariant,
};

function discrepancyColor(diff: number): string {
  if (diff === 0) return COLORS.primary;
  if (diff > 0) return COLORS.tertiary;
  return COLORS.error;
}

function formatDiscrepancy(diff: number): string {
  return diff > 0 ? `+${diff}` : String(diff);
}

// --- Row ---

interface ContinuousScanRowProps {
  item: ScanResultItemView;
  mode: ScannerMode;
  actualCount?: string;
  onUpdateCount?: (itemId: string, value: string) => void;
  onAddStock?: (itemId: string) => void;
  onDispense?: (itemId: string) => void;
  onViewDetails?: (itemId: string) => void;
}

function ContinuousScanRow({
  item,
  mode,
  actualCount,
  onUpdateCount,
  onAddStock,
  onDispense,
  onViewDetails,
}: ContinuousScanRowProps) {
  const status = getStockLevelStatus(item.currentStock, item.parLevel);
  const stockColor = STOCK_STATUS_COLOR[status];
  const isOutOfStock = item.currentStock === 0;

  const parsedActual = actualCount !== undefined && actualCount.trim() !== '' ? Number(actualCount) : null;
  const discrepancy =
    parsedActual !== null && !Number.isNaN(parsedActual) ? parsedActual - item.currentStock : null;

  return (
    <View style={styles.row} testID={`scan-row-${item.itemId}`}>
      <View style={styles.rowHeader}>
        <Text variant="bodyLarge" style={styles.itemName} numberOfLines={1}>
          {item.itemName}
        </Text>
        <Text variant="bodySmall" style={[styles.stockText, { color: stockColor }]}>
          {isOutOfStock ? 'Out of stock' : `${item.currentStock} ${item.unit}`}
        </Text>
      </View>

      {mode === 'stockTake' ? (
        <View style={styles.stockTakeRow}>
          <Text variant="bodySmall" style={styles.systemQty}>
            System: {item.currentStock} {item.unit}
          </Text>
          <PaperTextInput
            label="Actual Count"
            placeholder="Enter count"
            keyboardType="number-pad"
            mode="outlined"
            dense
            value={actualCount ?? ''}
            onChangeText={(text) => onUpdateCount?.(item.itemId, text)}
            style={styles.countInput}
            testID={`actual-count-${item.itemId}`}
          />
          {discrepancy !== null && (
            <Text variant="bodySmall" style={{ color: discrepancyColor(discrepancy) }}>
              {formatDiscrepancy(discrepancy)}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.actionsRow}>
          <Button variant="outlined" size="small" label="Add Stock" onPress={() => onAddStock?.(item.itemId)} />
          <Button variant="filled" size="small" label="Dispense" onPress={() => onDispense?.(item.itemId)} />
          <Button variant="text" size="small" label="View Details" onPress={() => onViewDetails?.(item.itemId)} />
        </View>
      )}
    </View>
  );
}

// --- List ---

export interface ContinuousScanListProps {
  items: ScanResultItemView[];
  mode: ScannerMode;
  /** D-38: keyed by itemId, only rendered when `mode === 'stockTake'`. */
  actualCounts?: Record<string, string>;
  onUpdateCount?: (itemId: string, value: string) => void;
  onAddStock?: (itemId: string) => void;
  onDispense?: (itemId: string) => void;
  onViewDetails?: (itemId: string) => void;
  testID?: string;
}

/** D-18/D-38: accumulated scan results for continuous/stock-take mode. */
export function ContinuousScanList({
  items,
  mode,
  actualCounts = {},
  onUpdateCount,
  onAddStock,
  onDispense,
  onViewDetails,
  testID,
}: ContinuousScanListProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text variant="titleMedium" style={styles.header}>
        Scanned Items ({items.length})
      </Text>
      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.itemId}-${item.code}-${index}`}
        renderItem={({ item }) => (
          <ContinuousScanRow
            item={item}
            mode={mode}
            actualCount={actualCounts[item.itemId]}
            onUpdateCount={onUpdateCount}
            onAddStock={onAddStock}
            onDispense={onDispense}
            onViewDetails={onViewDetails}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text variant="bodySmall" style={styles.empty}>
            No items scanned yet.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginBottom: 8,
  },
  row: {
    paddingVertical: 8,
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    marginRight: 8,
  },
  stockText: {
    fontWeight: '500',
  },
  stockTakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  systemQty: {
    color: COLORS.onSurfaceVariant,
  },
  countInput: {
    flex: 1,
    height: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.outlineVariant,
  },
  empty: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
