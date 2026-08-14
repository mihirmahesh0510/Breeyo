import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from '@breeyo/ui';
import type { InvoiceListSort } from '@breeyo/types';
import {
  BILLING_COPY,
  INVOICE_SORT_OPTIONS,
  invoiceSortLabel,
} from '../lib/dashboard-state';

export interface InvoiceSortSelectorProps {
  selectedSort: InvoiceListSort;
  onSortChange: (sort: InvoiceListSort) => void;
  testID?: string;
}

/**
 * The invoice list's sort selector: the same bottom-sheet trigger Phase 5's
 * inventory list uses, so the two list screens behave identically. Options and
 * their order come from `INVOICE_SORT_OPTIONS`, whose first entry is the
 * documented default.
 */
export function InvoiceSortSelector({
  selectedSort,
  onSortChange,
  testID,
}: InvoiceSortSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <View testID={testID}>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${BILLING_COPY.sortLabel}: ${invoiceSortLabel(selectedSort)}`}
        testID="invoice-sort-trigger"
      >
        <MaterialCommunityIcons name="sort" size={16} color="#49454F" />
        <Text variant="labelSmall" style={styles.triggerLabel}>
          {BILLING_COPY.sortLabel.toUpperCase()}: {invoiceSortLabel(selectedSort).toUpperCase()}
        </Text>
      </Pressable>

      <BottomSheet
        visible={open}
        onDismiss={() => setOpen(false)}
        title={BILLING_COPY.sortLabel}
        testID="invoice-sort-sheet"
      >
        {INVOICE_SORT_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={styles.option}
            onPress={() => {
              onSortChange(option.value);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === selectedSort }}
            testID={`invoice-sort-option-${option.value}`}
          >
            <Text
              variant="bodyLarge"
              style={option.value === selectedSort ? styles.optionSelected : styles.optionText}
            >
              {option.label}
            </Text>
            {option.value === selectedSort && (
              <MaterialCommunityIcons name="check" size={20} color="#2E7D32" />
            )}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerLabel: {
    color: '#49454F',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionText: {
    color: '#1C1B1F',
  },
  optionSelected: {
    color: '#2E7D32',
    fontWeight: '600',
  },
});
