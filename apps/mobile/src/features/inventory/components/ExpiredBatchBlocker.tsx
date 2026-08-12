import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { formatExpiryDate, getExpiredBatchError } from '../lib/fifo-dispense-logic';

export interface ExpiredBatchBlockerProps {
  expiryDate: Date | string | null;
  testID?: string;
}

/**
 * D-25 safety banner: shown whenever the batch currently in use for a
 * dispense (FIFO auto-selected or manually overridden) turns out to be
 * expired -- e.g. every batch is expired so `selectFifoBatch` has nothing
 * valid to offer, or an override selection somehow lands on an expired row.
 * `formatExpiryDate`/`getExpiredBatchError` are the same pure helpers
 * `buildDispenseSubmission` uses to reject the request server-side-mirrored,
 * so the banner text and the validation error always agree: exactly
 * "Cannot dispense -- batch expired on [DD MMM YYYY]" per the UI-SPEC.
 */
export function ExpiredBatchBlocker({ expiryDate, testID }: ExpiredBatchBlockerProps) {
  const message = getExpiredBatchError(expiryDate);
  const formatted = formatExpiryDate(expiryDate);

  return (
    <View style={styles.container} testID={testID} accessibilityRole="alert">
      <Text variant="bodyMedium" style={styles.text} testID={testID ? `${testID}-message` : undefined}>
        {message}
      </Text>
      {!formatted && (
        <Text variant="bodySmall" style={styles.text}>
          Dispose this batch via Adjust Stock ("Expired Disposal") before dispensing from it.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFDAD6',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  text: {
    color: '#410002',
    fontWeight: '600',
  },
});
