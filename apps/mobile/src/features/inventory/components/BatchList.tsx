import React, { useState } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { EmptyState } from '@breeyo/ui';
import type { StockBatch } from '@breeyo/types';

export interface BatchListProps {
  batches: StockBatch[];
  unit: string;
  onDispose: (batchId: string) => void;
  testID?: string;
}

const COLORS = {
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  onSurfaceVariant: '#49454F',
} as const;

function formatDate(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function isBatchExpired(batch: StockBatch): boolean {
  if (batch.isExpired) return true;
  if (!batch.expiryDate) return false;
  const expiry = typeof batch.expiryDate === 'string' ? new Date(batch.expiryDate) : batch.expiryDate;
  return expiry.getTime() <= Date.now();
}

function BatchRow({
  batch,
  unit,
  onDispose,
}: {
  batch: StockBatch;
  unit: string;
  onDispose: (batchId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const expired = isBatchExpired(batch);
  const receivedDate = formatDate(batch.receivedAt);
  const expiryDate = formatDate(batch.expiryDate);

  return (
    <View style={styles.row} testID={`batch-row-${batch.id}`}>
      <View style={styles.rowHeader}>
        <Text variant="titleMedium" style={styles.lotNumber}>
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

      <Text variant="bodyLarge" style={styles.quantity}>
        {batch.currentQty} / {batch.initialQty} {unit}
      </Text>

      <Text variant="bodySmall" style={styles.detailLine}>
        {expiryDate ? `Exp: ${expiryDate}` : 'No expiry'}
      </Text>

      {batch.purchasePrice != null && (
        <Text variant="bodySmall" style={styles.detailLine}>
          Rs {batch.purchasePrice} / {unit}
        </Text>
      )}

      {batch.supplier && (
        <Text variant="bodySmall" style={styles.detailLine}>
          From: {batch.supplier}
        </Text>
      )}

      {receivedDate && (
        <Text variant="bodySmall" style={styles.detailLine}>
          Received: {receivedDate}
        </Text>
      )}

      {expired && !confirming && (
        <Pressable
          onPress={() => setConfirming(true)}
          style={styles.disposeButton}
          accessibilityRole="button"
          testID={`batch-dispose-${batch.id}`}
        >
          <Text variant="bodySmall" style={styles.disposeText}>
            Dispose
          </Text>
        </Pressable>
      )}

      {confirming && (
        <View style={styles.confirmBox} testID={`batch-dispose-confirm-${batch.id}`}>
          <Text variant="bodySmall" style={styles.confirmTitle}>
            Dispose expired batch?
          </Text>
          <Text variant="bodySmall" style={styles.confirmBody}>
            {batch.currentQty} {unit} (Lot: {batch.lotNumber ?? 'N/A'}) will be removed from
            inventory with &apos;expired disposal&apos; reason.
          </Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setConfirming(false)} testID={`batch-dispose-cancel-${batch.id}`}>
              <Text variant="bodySmall" style={styles.cancelText}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirming(false);
                onDispose(batch.id);
              }}
              testID={`batch-dispose-confirm-button-${batch.id}`}
            >
              <Text variant="bodySmall" style={styles.disposeConfirmText}>
                Dispose
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

export function BatchList({ batches, unit, onDispose, testID }: BatchListProps) {
  if (batches.length === 0) {
    return (
      <EmptyState
        title="No active batches"
        description="No active batches. Receive stock to add a batch."
        testID="batch-list-empty"
      />
    );
  }

  return (
    <FlatList
      data={batches}
      keyExtractor={(batch) => batch.id}
      scrollEnabled={false}
      renderItem={({ item }) => <BatchRow batch={item} unit={unit} onDispose={onDispose} />}
      testID={testID}
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
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lotNumber: {
    color: '#1C1B1F',
  },
  expiredBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.errorContainer,
  },
  quantity: {
    color: '#1C1B1F',
    marginTop: 2,
  },
  detailLine: {
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  disposeButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  disposeText: {
    color: COLORS.error,
    fontWeight: '600',
  },
  confirmBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.errorContainer,
  },
  confirmTitle: {
    fontWeight: '700',
    color: COLORS.onErrorContainer,
  },
  confirmBody: {
    color: COLORS.onErrorContainer,
    marginTop: 4,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
  },
  cancelText: {
    color: COLORS.onSurfaceVariant,
  },
  disposeConfirmText: {
    color: COLORS.error,
    fontWeight: '700',
  },
});
