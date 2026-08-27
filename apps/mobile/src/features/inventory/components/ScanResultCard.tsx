import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Card, colors as COLORS } from '@breeyo/ui';
import { getStockLevelStatus } from '@breeyo/types';
import type { ScanResultItemView } from '../hooks/useBarcodeScan';

// --- Constants ---

const STOCK_STATUS_COLOR: Record<string, string> = {
  healthy: COLORS.primary,
  warning: COLORS.tertiary,
  critical: COLORS.error,
  no_par_level: COLORS.onSurfaceVariant,
};

const STOCK_STATUS_ICON: Record<string, string> = {
  healthy: 'check-circle',
  warning: 'alert-circle-outline',
  critical: 'alert-circle',
  no_par_level: 'information-outline',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// --- Component ---

export interface ScanResultCardProps {
  /**
   * Deviation from the plan's literal `item: InventoryItem` prop sketch --
   * see 05-05-SUMMARY.md Task 2. Neither the online barcode-lookup response
   * nor the offline cache maps 1:1 onto `@breeyo/types`' `InventoryItem`
   * (batches live on a separate `InventoryItemDetail`, and the offline
   * cache's reduced shape has neither `parLevel` nor batches at all); this
   * view type is what `useBarcodeScan` normalizes both sources into.
   */
  item: ScanResultItemView;
  onAddStock: (itemId: string) => void;
  onDispense: (itemId: string) => void;
  onViewDetails: (itemId: string) => void;
  testID?: string;
}

export function ScanResultCard({ item, onAddStock, onDispense, onViewDetails, testID }: ScanResultCardProps) {
  const status = getStockLevelStatus(item.currentStock, item.parLevel);
  const stockColor = STOCK_STATUS_COLOR[status];
  const isOutOfStock = item.currentStock === 0;
  const nearestExpiry = formatDate(item.nearestExpiry);

  return (
    <Card variant="elevated" testID={testID}>
      <Card.Body>
        <Text variant="titleMedium" style={styles.name}>
          {item.itemName}
        </Text>

        <View style={styles.row}>
          <MaterialCommunityIcons
            name={STOCK_STATUS_ICON[status] as any}
            size={16}
            color={stockColor}
          />
          <Text variant="bodySmall" style={[styles.stockText, { color: stockColor }]}>
            {isOutOfStock ? 'Out of stock' : `In stock: ${item.currentStock} ${item.unit}`}
          </Text>
        </View>

        {item.batchCount !== null ? (
          <Text variant="bodySmall" style={styles.batchText}>
            {item.batchCount} {item.batchCount === 1 ? 'batch' : 'batches'}
            {nearestExpiry ? ` · Exp: ${nearestExpiry}` : ''}
          </Text>
        ) : (
          <Text variant="bodySmall" style={styles.batchText}>
            Batch details unavailable offline
          </Text>
        )}
      </Card.Body>
      <Card.Actions>
        <Button variant="outlined" size="small" label="Add Stock" onPress={() => onAddStock(item.itemId)} />
        <Button variant="filled" size="small" label="Dispense" onPress={() => onDispense(item.itemId)} />
        <Button variant="text" size="small" label="View Details" onPress={() => onViewDetails(item.itemId)} />
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  name: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockText: {
    fontWeight: '500',
  },
  batchText: {
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
});
