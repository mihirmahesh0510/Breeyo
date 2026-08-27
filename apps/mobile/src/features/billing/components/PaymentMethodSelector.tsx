import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@breeyo/ui';
import type { PaymentMethod } from '@breeyo/types';
import {
  PAYMENT_COLLECTION_COPY,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHOD_ROW_HEIGHT,
} from '../lib/payment-collection';

export interface PaymentMethodSelectorProps {
  selectedMethod: PaymentMethod;
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
  testID?: string;
}

const COLORS = {
  primary: colors.primary,
  primaryContainer: colors.primaryContainer,
  onPrimaryContainer: colors.onPrimaryContainer,
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#CAC4D0',
  surface: '#FFFBF5',
} as const;

/**
 * The Cash / UPI / Card row (D-10).
 *
 * The option set and its order come from `PAYMENT_METHOD_OPTIONS`, which is
 * asserted against 06-UI-SPEC's copy table — a list typed into this file would
 * be a list no test can reach, since `apps/mobile` cannot render a React Native
 * component under test.
 *
 * Rows are 56px on the short axis (`height: 56`, 06-UI-SPEC "Spacing Scale"),
 * comfortably past the 44pt accessibility floor: this is a control someone taps
 * while holding a card machine in the other hand.
 */
export function PaymentMethodSelector({
  selectedMethod,
  onSelect,
  disabled = false,
  testID,
}: PaymentMethodSelectorProps) {
  return (
    <View style={styles.container} testID={testID ?? 'payment-method-selector'}>
      <Text variant="labelLarge" style={styles.sectionHeader}>
        {PAYMENT_COLLECTION_COPY.methodSectionHeader}
      </Text>

      {PAYMENT_METHOD_OPTIONS.map((option) => {
        const isSelected = option.method === selectedMethod;

        return (
          <Pressable
            key={option.method}
            onPress={() => onSelect(option.method)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={option.label}
            testID={`payment-method-${option.method}`}
            style={({ pressed }) => [
              styles.row,
              isSelected ? styles.rowSelected : null,
              pressed ? styles.pressed : null,
              disabled ? styles.disabled : null,
            ]}
          >
            <MaterialCommunityIcons
              name={option.icon as never}
              size={24}
              color={isSelected ? COLORS.onPrimaryContainer : COLORS.onSurfaceVariant}
            />
            <Text
              variant="bodyLarge"
              style={isSelected ? styles.labelSelected : styles.label}
            >
              {option.label}
            </Text>
            {isSelected ? (
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={COLORS.primary}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  sectionHeader: {
    color: COLORS.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: PAYMENT_METHOD_ROW_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
  rowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  // 100ms out-ease on the background transition, per 06-UI-SPEC's motion table.
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    flex: 1,
    color: COLORS.onSurface,
  },
  labelSelected: {
    flex: 1,
    color: COLORS.onPrimaryContainer,
    fontWeight: '600',
  },
});
