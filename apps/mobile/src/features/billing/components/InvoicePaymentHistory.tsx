import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState } from '@breeyo/ui';
import type { Payment, Refund } from '@breeyo/types';
import {
  INVOICE_DETAIL_COPY,
  paymentHistoryRows,
  type PaymentHistoryIcon,
  type PaymentHistoryRow,
} from '../lib/invoice-detail';

export interface InvoicePaymentHistoryProps {
  payments: readonly Payment[];
  refunds: readonly Refund[];
  /** Injectable so the pending countdown is deterministic under a screen test. */
  now?: Date;
  testID?: string;
}

const COLORS = {
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  primary: '#2E7D32',
  tertiary: '#E65100',
  error: '#BA1A1A',
} as const;

/**
 * 06-UI-SPEC's "Payment Method Icon Map", verbatim.
 *
 * The semantic key is decided by `paymentHistoryRows` (and tested there); the
 * MaterialCommunityIcons name and its colour are presentation and live here,
 * the same way `InvoiceListCard` owns its colour map and the Phase 3
 * `MedicalTimeline` owns `VISIT_TYPE_COLORS`.
 */
const ICONS: Readonly<Record<PaymentHistoryIcon, { name: string; color: string }>> = {
  cash: { name: 'cash', color: COLORS.onSurfaceVariant },
  upi: { name: 'cellphone-nfc', color: COLORS.onSurfaceVariant },
  card: { name: 'credit-card-outline', color: COLORS.onSurfaceVariant },
  razorpay: { name: 'shield-check', color: COLORS.primary },
  refund: { name: 'cash-refund', color: COLORS.error },
};

/**
 * The BIL-05 payment ledger, on the Phase 3 timeline pattern.
 *
 * ## Refunds are rows, not a footnote
 *
 * T-06-138: a payment or a refund that happened but is invisible here leaves a
 * dispute with no on-screen record — the owner says they paid, the clinic's own
 * screen shows nothing, and the only remaining evidence is in the database.
 * Every payment leg and every refund gets a row, including failed and expired
 * ones, because "we tried and it did not go through" is itself the answer to a
 * question someone will ask.
 *
 * ## The empty state is a statement
 *
 * An empty container and a rendering failure look identical. `EmptyState` says
 * outright that nothing has been collected, so the absence is information.
 *
 * ## Money
 *
 * Every amount arrives pre-formatted from `paymentHistoryRows`, which calls the
 * shared `formatPaiseINR`. This file performs no arithmetic on a money value
 * and a phase-level grep gate enforces that: an ad-hoc conversion on the exact
 * screen the front desk reads while handling cash is a 100x misstatement nobody
 * catches in review.
 */
export function InvoicePaymentHistory({
  payments,
  refunds,
  now,
  testID,
}: InvoicePaymentHistoryProps) {
  const rows = useMemo(
    () => paymentHistoryRows(payments, refunds, now ?? new Date()),
    [payments, refunds, now],
  );

  return (
    <View style={styles.container} testID={testID ?? 'invoice-payment-history'}>
      <Text variant="titleSmall" style={styles.header}>
        {INVOICE_DETAIL_COPY.paymentHistoryHeader}
      </Text>

      {rows.length === 0 ? (
        <EmptyState
          title={INVOICE_DETAIL_COPY.paymentHistoryEmptyTitle}
          description={INVOICE_DETAIL_COPY.paymentHistoryEmptyBody}
          testID="invoice-payment-history-empty"
        />
      ) : (
        rows.map((row, index) => (
          <PaymentHistoryItem key={row.id} row={row} isLast={index === rows.length - 1} />
        ))
      )}
    </View>
  );
}

function PaymentHistoryItem({ row, isLast }: { row: PaymentHistoryRow; isLast: boolean }) {
  const icon = ICONS[row.icon];

  return (
    <View style={styles.row} testID={`payment-history-${row.id}`}>
      <View style={styles.timelineColumn}>
        <MaterialCommunityIcons
          name={icon.name as never}
          size={20}
          color={icon.color}
          accessibilityLabel={row.kind === 'refund' ? 'Refund' : 'Payment'}
        />
        {isLast ? null : <View style={styles.line} />}
      </View>

      <View style={styles.body}>
        <Text
          variant="bodyMedium"
          style={[styles.amount, row.kind === 'refund' ? styles.refundAmount : null]}
        >
          {row.amount} — {row.timestamp}
        </Text>

        {row.reference ? (
          <Text variant="bodySmall" style={styles.caption}>
            {row.reference}
          </Text>
        ) : null}

        {row.pending ? (
          <Text variant="bodySmall" style={styles.pending}>
            {row.pending}
          </Text>
        ) : null}

        {row.note ? (
          <Text variant="bodySmall" style={styles.note}>
            {row.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  header: {
    color: COLORS.onSurface,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineColumn: {
    width: 32,
    alignItems: 'center',
  },
  line: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.outlineVariant,
    marginTop: 4,
  },
  body: {
    flex: 1,
    paddingBottom: 12,
  },
  amount: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  refundAmount: {
    color: COLORS.error,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
  },
  pending: {
    color: COLORS.tertiary,
  },
  note: {
    color: COLORS.error,
  },
});
