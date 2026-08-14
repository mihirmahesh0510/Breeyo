import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { BreeyoChip } from '@breeyo/ui';
// The chip set is the shared filter vocabulary itself, not a hand-maintained
// copy of it: a chip the server would reject is unrepresentable.
import { INVOICE_LIST_FILTERS, type InvoiceListFilter } from '@breeyo/types';
import { INVOICE_FILTER_LABELS } from '../lib/dashboard-state';

export interface InvoiceFilterChipsProps {
  /**
   * The chips currently rendered as selected. An array rather than a single
   * value because D-24's "tap Unpaid Total" selects two of them at once — see
   * `UNPAID_AND_OVERDUE` in `lib/dashboard-state.ts`.
   */
  selected: readonly InvoiceListFilter[];
  onSelect: (filter: InvoiceListFilter) => void;
  disabled?: boolean;
  testID?: string;
}

/**
 * The six D-24 status filter chips, in display order, with `All` first.
 *
 * `INVOICE_LIST_FILTERS` is imported from `@breeyo/types` rather than retyped,
 * so the chip set and the values `invoiceListQuerySchema` accepts cannot drift
 * apart. Display labels come from a record keyed by the literal
 * (`INVOICE_FILTER_LABELS`) rather than from string-casing the value: the copy
 * table is the contract, and `partially_paid`-shaped literals would title-case
 * wrongly if this were ever extended.
 */
export function InvoiceFilterChips({
  selected,
  onSelect,
  disabled = false,
  testID,
}: InvoiceFilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      testID={testID}
    >
      {INVOICE_LIST_FILTERS.map((filter) => (
        <BreeyoChip
          key={filter}
          label={INVOICE_FILTER_LABELS[filter]}
          selected={selected.includes(filter)}
          disabled={disabled}
          onPress={() => onSelect(filter)}
          testID={`invoice-filter-chip-${filter}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
});
