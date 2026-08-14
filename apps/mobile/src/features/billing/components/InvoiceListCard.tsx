import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { InvoiceListItem } from '@breeyo/types';
import { invoiceCardFields } from '../lib/dashboard-state';

export interface InvoiceListCardProps {
  invoice: InvoiceListItem;
  onPress: () => void;
  testID?: string;
}

const COLORS = {
  surface: '#FFFFFF',
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  tertiary: '#E65100',
} as const;

/**
 * One invoice in the Billing tab list (D-24).
 *
 * ## Money
 *
 * The amount comes from `invoiceCardFields`, which calls the shared
 * `formatPaiseINR`. This file contains no `toFixed` and no `/ 100`, by grep
 * gate: an ad-hoc conversion here would be a 100x misstatement on the exact
 * surface the front desk reads while taking cash (T-06-91).
 *
 * ## The status badge is local, not `@breeyo/ui`'s `StatusBadge`
 *
 * `StatusBadge` has a closed eight-value `StatusVariant` union with its colours
 * baked into `STATUS_CONFIG`, and takes no colour props — it can express
 * `paid`, `unpaid` and `overdue` but has no `draft`, `finalized`,
 * `partiallyPaid` or `voided`, and no way to accept the D-46 outline. Widening
 * the shared atom for one screen's status vocabulary would push Phase 6 billing
 * semantics into the design system; a 20-line local badge does not.
 */
export function InvoiceListCard({ invoice, onPress, testID }: InvoiceListCardProps) {
  const fields = invoiceCardFields(invoice);

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fields.accessibilityLabel}
      testID={testID ?? `invoice-card-${invoice.id}`}
    >
      <View style={styles.leadingColumn}>
        <Text variant="bodyLarge" numberOfLines={1} style={styles.number}>
          {fields.number}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
          {fields.date}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
          {fields.pet} · {fields.owner}
        </Text>
      </View>

      <View style={styles.trailingColumn}>
        <Text variant="bodyLarge" numberOfLines={1} style={styles.amount}>
          {fields.amount}
        </Text>

        <View style={styles.badgeRow}>
          {fields.hasException && (
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={16}
              color={COLORS.tertiary}
              accessibilityLabel="Needs review"
            />
          )}
          <View
            style={[
              styles.badge,
              { backgroundColor: fields.statusColors.background },
              fields.statusColors.border
                ? { borderWidth: 1, borderColor: fields.statusColors.border }
                : null,
            ]}
            testID={`invoice-status-${invoice.id}`}
          >
            <Text
              variant="labelSmall"
              numberOfLines={1}
              style={{ color: fields.statusColors.text }}
            >
              {fields.statusLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    // 06-UI-SPEC.md "Spacing Scale" exception: 80px per invoice list card. The
    // whole card is the press target, so it clears the 44x44pt minimum on both
    // axes with room to spare.
    height: 80,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.outlineVariant,
  },
  leadingColumn: {
    flex: 1,
    marginRight: 8,
  },
  number: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  meta: {
    color: COLORS.onSurfaceVariant,
  },
  trailingColumn: {
    alignItems: 'flex-end',
  },
  amount: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
});
