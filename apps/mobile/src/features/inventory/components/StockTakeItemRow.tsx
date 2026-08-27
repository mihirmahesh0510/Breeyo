import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text, TextInput as PaperTextInput } from 'react-native-paper';
import type { StockTakeEntryState } from '../stores/stock-take.store';
import { getDiscrepancy, getDiscrepancyStatus, formatSignedQuantity } from '../lib/stock-take-logic';
import { colors as COLORS } from '@breeyo/ui';

export interface StockTakeItemRowProps {
  entry: StockTakeEntryState;
  onCountChange: (itemId: string, actualCount: number) => void;
  testID?: string;
}

const STATUS_COLOR: Record<string, string> = {
  match: COLORS.success,
  over: COLORS.tertiary,
  under: COLORS.error,
};

const STATUS_HIGHLIGHT: Record<string, string> = {
  match: COLORS.primaryContainer,
  over: COLORS.tertiaryContainer,
  under: COLORS.errorContainer,
};

/**
 * Stock-take row (D-37/D-38) -- 56px, compact 8px internal padding per
 * UI-SPEC. Shows the system quantity, an editable "Actual Count" input, and
 * an auto-calculated, color-coded discrepancy (match/over/under). A 200ms
 * highlight fade plays whenever the discrepancy status changes.
 */
export function StockTakeItemRow({ entry, onCountChange, testID }: StockTakeItemRowProps) {
  const { itemId, itemName, unit, systemQty, actualCount } = entry;
  const discrepancy = getDiscrepancy(actualCount, systemQty);
  const status = getDiscrepancyStatus(actualCount, systemQty);

  const highlight = useRef(new Animated.Value(0)).current;
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      highlight.setValue(1);
      Animated.timing(highlight, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [status, highlight]);

  const backgroundColor = highlight.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', STATUS_HIGHLIGHT[status]],
  });

  const [text, setText] = React.useState(String(actualCount));
  useEffect(() => {
    setText(String(actualCount));
  }, [actualCount]);

  const handleChangeText = (value: string) => {
    setText(value);
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onCountChange(itemId, parsed);
    }
  };

  return (
    <Animated.View style={[styles.row, { backgroundColor }]} testID={testID}>
      <View style={styles.infoColumn}>
        <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
          {itemName}
        </Text>
        <Text variant="bodySmall" style={styles.systemQty}>
          System: {systemQty} {unit}
        </Text>
      </View>

      <PaperTextInput
        mode="outlined"
        dense
        keyboardType="number-pad"
        value={text}
        onChangeText={handleChangeText}
        style={styles.input}
        testID={testID ? `${testID}-count-input` : undefined}
      />

      <Text
        variant="bodyMedium"
        style={[styles.discrepancy, { color: STATUS_COLOR[status] }]}
        testID={testID ? `${testID}-discrepancy` : undefined}
      >
        {status === 'match' ? '✓' : formatSignedQuantity(discrepancy)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 56,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  infoColumn: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#1C1B1F',
    fontWeight: '600',
  },
  systemQty: {
    color: COLORS.onSurfaceVariant,
  },
  input: {
    width: 72,
    height: 40,
  },
  discrepancy: {
    width: 40,
    textAlign: 'right',
    fontWeight: '700',
  },
});
