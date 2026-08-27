import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { colors as COLORS } from '@breeyo/ui';
import type { DiscountType } from '@breeyo/types';
import { BUILDER_COPY } from '../lib/builder-copy';
import { parseDiscountInput } from '../lib/builder-state';

export interface LineItemDiscountInputProps {
  /** The currently selected mode. Defaults to a percentage. */
  type: DiscountType;
  onTypeChange: (type: DiscountType) => void;
  /**
   * Reports a valid entry upward in the unit the shared schema expects: a whole
   * percentage for `percent`, integer paise for `flat`. `null` clears it.
   */
  onChange: (type: DiscountType, value: number | null) => void;
  /** The raw text the user has typed. Owned by the caller so it survives blur. */
  text: string;
  onTextChange: (text: string) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The per-line discount entry: a `%` / `₹` toggle and a value field (D-07).
 *
 * ## It collects; it does not apply
 *
 * The type and value go upward exactly as entered and travel to the server,
 * which applies the discount, pro-rates the invoice-level share across lines and
 * recomputes tax on the result. Applying it here would produce a figure that
 * disagrees with the server's the first time the pro-rating rounds differently
 * (T-06-103).
 *
 * ## What is rejected, and what is not
 *
 * Only what the shared schema cannot carry: a percentage above 100, a
 * fractional percentage, and a rupee amount with more than two decimal places
 * (T-06-104, T-06-105). There is deliberately **no business-rule cap** — D-40
 * sets no approval threshold, so Front Desk and Admin may enter any discount up
 * to 100% without sign-off, and a component that refused 60% would be enforcing
 * a policy the product does not have.
 *
 * The rupee-to-paise conversion lives in `parseDiscountInput`, one of exactly
 * two places in the builder where a rupee figure the user typed becomes paise.
 */
export function LineItemDiscountInput({
  type,
  onTypeChange,
  onChange,
  text,
  onTextChange,
  disabled = false,
  testID,
}: LineItemDiscountInputProps) {
  const [error, setError] = useState<string | null>(null);

  const commit = (nextText: string, nextType: DiscountType) => {
    if (nextText.trim() === '') {
      setError(null);
      onChange(nextType, null);
      return;
    }

    const parsed = parseDiscountInput(nextType, nextText);
    if (parsed.ok) {
      setError(null);
      onChange(nextType, parsed.value);
    } else {
      setError(parsed.error);
      // The invalid entry is NOT reported upward: a half-typed "10" on the way
      // to "100" must not be sent, and a rejected value must not linger in the
      // draft where Finalize would pick it up.
      onChange(nextType, null);
    }
  };

  const selectType = (nextType: DiscountType) => {
    onTypeChange(nextType);
    commit(text, nextType);
  };

  return (
    <View style={styles.container} testID={testID ?? 'line-item-discount-input'}>
      <View style={styles.toggle}>
        <TypeButton
          label={BUILDER_COPY.discountTypePercent}
          selected={type === 'percent'}
          onPress={() => selectType('percent')}
          disabled={disabled}
          testID="discount-type-percent"
        />
        <TypeButton
          label={BUILDER_COPY.discountTypeFlat}
          selected={type === 'flat'}
          onPress={() => selectType('flat')}
          disabled={disabled}
          testID="discount-type-flat"
        />
      </View>

      <View style={styles.field}>
        <TextInput
          mode="outlined"
          dense
          label={BUILDER_COPY.discountValuePlaceholder}
          value={text}
          onChangeText={(next) => {
            onTextChange(next);
            commit(next, type);
          }}
          keyboardType="decimal-pad"
          error={!!error}
          disabled={disabled}
          accessibilityLabel={BUILDER_COPY.discountValuePlaceholder}
          testID="discount-value-input"
        />
        {error && (
          <Text variant="bodySmall" style={styles.error} testID="discount-value-error">
            {error}
          </Text>
        )}
      </View>
    </View>
  );
}

interface TypeButtonProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
  testID: string;
}

function TypeButton({ label, selected, onPress, disabled, testID }: TypeButtonProps) {
  return (
    <Pressable
      style={[styles.typeButton, selected && styles.typeButtonSelected]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Text
        variant="labelSmall"
        style={selected ? styles.typeLabelSelected : styles.typeLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surfaceVariant,
  },
  toggle: {
    flexDirection: 'row',
  },
  typeButton: {
    // 44x44pt minimum touch target (Phase 2 standard).
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.onSurfaceVariant,
  },
  typeButtonSelected: {
    backgroundColor: COLORS.tertiaryContainer,
    borderColor: COLORS.tertiary,
  },
  typeLabel: {
    color: COLORS.onSurfaceVariant,
  },
  typeLabelSelected: {
    color: COLORS.onTertiaryContainer,
  },
  field: {
    flex: 1,
  },
  error: {
    color: COLORS.error,
    marginTop: 2,
  },
});
