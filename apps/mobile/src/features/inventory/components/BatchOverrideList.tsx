import React from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { EmptyState, colors as COLORS } from '@breeyo/ui';
import type { StockBatch } from '@breeyo/types';
import { sortBatchesByReceivedAt, isBatchExpired, formatExpiryDate } from '../lib/fifo-dispense-logic';

export interface BatchOverrideListProps {
  batches: StockBatch[];
  unit: string;
  selectedBatchId: string | null;
  onSelect: (batchId: string) => void;
  testID?: string;
}

/**
 * All batches for the item, sorted oldest-first (same order FIFO auto-select
 * uses), for the D-22 manual-override picker. Expired batches (D-25) are
 * shown but disabled -- tapping them does nothing, matching the server-side
 * rejection FifoDispenseService would otherwise return.
 */
export function BatchOverrideList({ batches, unit, selectedBatchId, onSelect, testID }: BatchOverrideListProps) {
  const sorted = sortBatchesByReceivedAt(batches);

  if (sorted.length === 0) {
    return <EmptyState title="No batches" description="No batches available for this item." testID={testID ? `${testID}-empty` : undefined} />;
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={(batch) => batch.id}
      scrollEnabled={false}
      testID={testID}
      renderItem={({ item: batch }) => {
        const expired = isBatchExpired(batch);
        const selected = batch.id === selectedBatchId;
        const receivedDate = formatExpiryDate(batch.receivedAt);
        const expiryDate = formatExpiryDate(batch.expiryDate);

        return (
          <Pressable
            onPress={() => {
              if (expired) return;
              onSelect(batch.id);
            }}
            disabled={expired}
            accessibilityRole="button"
            accessibilityState={{ disabled: expired, selected }}
            style={[styles.row, selected && styles.rowSelected, expired && styles.rowDisabled]}
            testID={testID ? `${testID}-batch-${batch.id}` : undefined}
          >
            <View style={styles.rowHeader}>
              <Text variant="titleMedium" style={expired ? styles.textDisabled : styles.text}>
                {batch.lotNumber ? `Lot: ${batch.lotNumber}` : 'No lot number'}
              </Text>
              {expired && (
                <View style={styles.expiredBadge}>
                  <Text variant="labelSmall" style={{ color: COLORS.onErrorContainer }}>
                    EXPIRED
                  </Text>
                </View>
              )}
            </View>

            <Text variant="bodyMedium" style={expired ? styles.textDisabled : styles.text}>
              {batch.currentQty} {unit}
            </Text>
            <Text variant="bodySmall" style={styles.detailLine}>
              {expiryDate ? `Exp: ${expiryDate}` : 'No expiry'}
            </Text>
            <Text variant="bodySmall" style={styles.detailLine}>
              {receivedDate ? `Received: ${receivedDate}` : 'Received: unknown'}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  rowSelected: {
    backgroundColor: COLORS.primaryContainer,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: {
    color: '#1C1B1F',
  },
  textDisabled: {
    color: COLORS.onSurfaceVariant,
  },
  expiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.errorContainer,
  },
  detailLine: {
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
});
