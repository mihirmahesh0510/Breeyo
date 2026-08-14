import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { DiscountType } from '@breeyo/types';
import { BUILDER_COPY } from '../lib/builder-copy';
import { LineItemDiscountInput } from './LineItemDiscountInput';

export interface InvoiceDiscountRowProps {
  type: DiscountType;
  onTypeChange: (type: DiscountType) => void;
  /** Whole percentage for `percent`, integer paise for `flat`. `null` clears. */
  onChange: (type: DiscountType, value: number | null) => void;
  text: string;
  onTextChange: (text: string) => void;
  disabled?: boolean;
  testID?: string;
}

const COLORS = {
  onSurfaceVariant: '#49454F',
  tertiary: '#E65100',
} as const;

/**
 * The invoice-level discount (D-07), hidden behind `Add Invoice Discount` until
 * it is wanted.
 *
 * It reuses `LineItemDiscountInput` outright rather than reimplementing the
 * toggle: the two differ only in what they are attached to, and the rupee-to-
 * paise conversion and the percentage rules must not exist twice — a second
 * copy is a second chance to get the 100x conversion wrong (T-06-105).
 *
 * Collapsing back to the CTA clears the value. Leaving a hidden discount
 * applied to an invoice is a figure nobody on the screen can see and nobody can
 * account for afterwards.
 */
export function InvoiceDiscountRow({
  type,
  onTypeChange,
  onChange,
  text,
  onTextChange,
  disabled = false,
  testID,
}: InvoiceDiscountRowProps) {
  const [visible, setVisible] = useState(text.trim() !== '');

  if (!visible) {
    return (
      <Pressable
        style={styles.cta}
        onPress={() => setVisible(true)}
        disabled={disabled}
        accessibilityRole="button"
        testID={testID ?? 'invoice-discount-cta'}
      >
        <MaterialCommunityIcons name="tag-outline" size={16} color={COLORS.tertiary} />
        <Text variant="bodySmall" style={styles.ctaLabel}>
          {BUILDER_COPY.addInvoiceDiscount}
        </Text>
      </Pressable>
    );
  }

  return (
    <View testID={testID ?? 'invoice-discount-row'}>
      <View style={styles.header}>
        <Text variant="bodyLarge" style={styles.headerLabel}>
          {BUILDER_COPY.discountLabel}
        </Text>
        <Pressable
          style={styles.dismiss}
          onPress={() => {
            setVisible(false);
            onTextChange('');
            onChange(type, null);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={BUILDER_COPY.removeConfirmAccept}
          testID="invoice-discount-clear"
        >
          <MaterialCommunityIcons name="close" size={18} color={COLORS.onSurfaceVariant} />
        </Pressable>
      </View>

      <LineItemDiscountInput
        type={type}
        onTypeChange={onTypeChange}
        onChange={onChange}
        text={text}
        onTextChange={onTextChange}
        disabled={disabled}
        testID="invoice-discount-input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 44pt minimum touch height (Phase 2 standard).
    height: 44,
    paddingHorizontal: 16,
  },
  ctaLabel: {
    color: COLORS.tertiary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerLabel: {
    color: COLORS.onSurfaceVariant,
  },
  dismiss: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
