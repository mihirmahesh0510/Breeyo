import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Card, Button } from '@breeyo/ui';
import type { StockTakeSummary as StockTakeSummaryType } from '@breeyo/types';

export interface StockTakeSummaryProps {
  summary: StockTakeSummaryType;
  onSave: () => void;
  onDiscard: () => void;
  isSaving?: boolean;
  testID?: string;
}

const COLORS = {
  error: '#BA1A1A',
  onSurfaceVariant: '#49454F',
} as const;

function formatOverUnderQty(results: StockTakeSummaryType['results'], sign: 1 | -1): number {
  return results
    .filter((r) => (sign > 0 ? r.difference > 0 : r.difference < 0))
    .reduce((sum, r) => sum + r.difference, 0);
}

/**
 * Stock-take summary (D-40) -- shown after "Complete Stock-Take" submits.
 * Items counted / matches / discrepancies / over / under / value difference,
 * plus Save (filled primary) and Discard (text error, inline confirmation --
 * matching BatchList.tsx's dispose-confirmation convention rather than a
 * native Alert) actions.
 */
export function StockTakeSummary({ summary, onSave, onDiscard, isSaving, testID }: StockTakeSummaryProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const overQty = formatOverUnderQty(summary.results, 1);
  const underQty = formatOverUnderQty(summary.results, -1);

  return (
    <Card variant="elevated" testID={testID}>
      <Card.Header>
        <Text variant="titleMedium" style={styles.title}>
          Stock-Take Summary
        </Text>
      </Card.Header>
      <Card.Body>
        <SummaryLine label="Items Counted" value={String(summary.itemsCounted)} />
        <SummaryLine label="Matches" value={String(summary.matches)} />
        <SummaryLine label="Discrepancies" value={String(summary.discrepancies)} />
        <SummaryLine
          label="Over"
          value={`${summary.overCount} items (+${overQty})`}
        />
        <SummaryLine
          label="Under"
          value={`${summary.underCount} items (${underQty})`}
          valueColor={COLORS.error}
        />
        <SummaryLine
          label="Value Difference"
          value={`Rs ${summary.totalValueDifference.toFixed(2)}`}
        />

        <View style={styles.actions}>
          <Button
            variant="filled"
            label="Save Stock-Take"
            onPress={onSave}
            loading={isSaving}
            disabled={isSaving}
            testID={testID ? `${testID}-save` : undefined}
          />

          {!confirmingDiscard ? (
            <Button
              variant="text"
              label="Discard"
              onPress={() => setConfirmingDiscard(true)}
              disabled={isSaving}
              testID={testID ? `${testID}-discard-trigger` : undefined}
            />
          ) : (
            <View style={styles.confirmBox} testID={testID ? `${testID}-discard-confirm` : undefined}>
              <Text variant="bodySmall" style={styles.confirmText}>
                Discard this stock-take? All counts will be lost.
              </Text>
              <View style={styles.confirmActions}>
                <Text
                  variant="bodySmall"
                  style={styles.cancelText}
                  onPress={() => setConfirmingDiscard(false)}
                  testID={testID ? `${testID}-discard-cancel` : undefined}
                >
                  Cancel
                </Text>
                <Text
                  variant="bodySmall"
                  style={styles.discardConfirmText}
                  onPress={onDiscard}
                  testID={testID ? `${testID}-discard-confirm-button` : undefined}
                >
                  Discard
                </Text>
              </View>
            </View>
          )}
        </View>
      </Card.Body>
    </Card>
  );
}

function SummaryLine({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.line}>
      <Text variant="bodyMedium" style={styles.lineLabel}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={[styles.lineValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: '700',
    color: '#1C1B1F',
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  lineLabel: {
    color: COLORS.onSurfaceVariant,
  },
  lineValue: {
    fontWeight: '600',
    color: '#1C1B1F',
  },
  actions: {
    marginTop: 16,
    gap: 8,
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
  cancelText: {
    color: COLORS.onSurfaceVariant,
  },
  discardConfirmText: {
    color: COLORS.error,
    fontWeight: '700',
  },
});
