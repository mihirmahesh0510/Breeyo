import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Button } from '@breeyo/ui';
import type { StockBatch } from '@breeyo/types';
import { formatExpiryDate } from '../lib/fifo-dispense-logic';

export interface FifoBatchDisplayProps {
  batch: StockBatch;
  unit: string;
  isOverridden: boolean;
  onOverride: () => void;
  testID?: string;
}

/**
 * Shows the batch currently in use for a dispense -- either the FIFO
 * auto-selected oldest non-expired batch (D-22 smart default) or the
 * vet-picked override batch (D-22 manual override, e.g. an opened vial
 * taking priority). `DispenseScreen` decides which batch this is and just
 * passes it + the `isOverridden` flag; this component only renders it.
 */
export function FifoBatchDisplay({ batch, unit, isOverridden, onOverride, testID }: FifoBatchDisplayProps) {
  const expiry = formatExpiryDate(batch.expiryDate);

  return (
    <View style={styles.container} testID={testID}>
      <Text variant="bodySmall" style={styles.caption} testID={testID ? `${testID}-caption` : undefined}>
        {isOverridden ? 'Override active' : 'Oldest batch selected (FIFO)'}
      </Text>

      <Text variant="bodyLarge" style={styles.batchLine} testID={testID ? `${testID}-batch-info` : undefined}>
        From batch: {batch.lotNumber ?? 'N/A'}, Exp: {expiry ?? 'No expiry'}
      </Text>

      <Text variant="bodyMedium" style={styles.availableLine} testID={testID ? `${testID}-available` : undefined}>
        {batch.currentQty} {unit} available
      </Text>

      <Button
        variant="text"
        label="Use different batch"
        onPress={onOverride}
        testID={testID ? `${testID}-override-toggle` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CAC4D0',
    backgroundColor: '#F5F0EB',
  },
  caption: {
    color: '#49454F',
  },
  batchLine: {
    color: '#1C1B1F',
    marginTop: 4,
  },
  availableLine: {
    color: '#49454F',
    marginTop: 2,
    marginBottom: 4,
  },
});
