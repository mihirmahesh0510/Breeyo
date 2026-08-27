import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors as COLORS } from '@breeyo/ui';
import type { TaxBreakdown } from '@breeyo/types';
import { formatPaiseINR } from '../lib/format';
import { BUILDER_COPY, gstRowsFor, showRoundOffRow } from '../lib/builder-copy';

/**
 * The pre-tax figures, exactly as the server persisted them on the draft.
 *
 * An object rather than loose numbers, and deliberately not assembled by the
 * caller: these are `invoices.subtotal_paise` and
 * `invoices.invoice_discount_paise` read back from a create/update response.
 * The component cannot be handed a number someone worked out on the client.
 */
export interface InvoiceTotalsAmounts {
  subtotalPaise: number;
  invoiceDiscountPaise: number;
}

export interface InvoiceTotalsSectionProps {
  /** The server's `TaxBreakdown`, from the totals preview or the draft. */
  breakdown: TaxBreakdown | undefined;
  amounts: InvoiceTotalsAmounts | undefined;
  /** D-17: an unregistered clinic never sees a GST row. */
  gstEnabled: boolean;
  /** True while a debounced preview refresh is in flight. */
  isLoading?: boolean;
  testID?: string;
}

/**
 * The totals block. **It performs no arithmetic.**
 *
 * Every figure here is computed by the server and rendered as received. That is
 * the whole design (T-06-103): the grand total is
 * `taxable + the three already-rounded tax heads`, with per-head rounding
 * applied once at invoice level under Section 170 / Rule 51 and the residue
 * disclosed separately as `roundOffPaise`. Re-deriving any of that on the
 * device would be a second implementation of a statutory rounding rule, and the
 * two would disagree on the first invoice with a fractional head — on the exact
 * screen where the figure is read aloud to the person paying.
 *
 * A phase-level grep gate enforces that on this file, forbidding both the
 * addition of paise values and array folding. It matches on literal tokens, so
 * this note names neither — a gate that trips on the comment explaining it is
 * worse than no gate.
 *
 * ## The three rows that reconcile
 *
 * `Subtotal` is the server's `subtotal_paise` (already net of per-line
 * discounts, which are shown on the lines themselves), `Discount` is the
 * invoice-level discount, and their difference is the breakdown's taxable
 * value. So the column adds up as printed, without this component adding
 * anything.
 *
 * `Round Off` sits **below** `Grand Total` rather than above it, because it is
 * a GSTR-1 disclosure and not a component of the total. Placed in the column
 * above, it would invite exactly the re-addition it must not receive.
 *
 * ## Loading
 *
 * While a debounced preview is in flight the previous figures are re-rendered
 * dimmed rather than zeroed. `₹0.00` flashing at someone about to tap
 * "Finalize Invoice" is indistinguishable from a real total of nothing.
 */
export function InvoiceTotalsSection({
  breakdown,
  amounts,
  gstEnabled,
  isLoading = false,
  testID,
}: InvoiceTotalsSectionProps) {
  // The last figures that were actually computed, held so a refresh dims rather
  // than blanks. A ref, not state: it must not itself trigger a render.
  const lastKnown = useRef<{ breakdown?: TaxBreakdown; amounts?: InvoiceTotalsAmounts }>({});
  if (breakdown && amounts) {
    lastKnown.current = { breakdown, amounts };
  }

  const shownBreakdown = breakdown ?? lastKnown.current.breakdown;
  const shownAmounts = amounts ?? lastKnown.current.amounts;

  if (!shownBreakdown || !shownAmounts) return null;

  const gstRows = gstRowsFor(shownBreakdown, gstEnabled);
  const dim = isLoading ? styles.dimmed : null;

  return (
    <View style={styles.section} testID={testID ?? 'invoice-totals-section'}>
      <Row
        label={BUILDER_COPY.subtotalLabel}
        value={formatPaiseINR(shownAmounts.subtotalPaise)}
        style={dim}
        testID="totals-subtotal"
      />

      {shownAmounts.invoiceDiscountPaise > 0 && (
        <Row
          label={BUILDER_COPY.discountLabel}
          // The leading sign is presentation: the server reports a discount as a
          // positive amount deducted, and this states the direction.
          value={`-${formatPaiseINR(shownAmounts.invoiceDiscountPaise)}`}
          valueColor={COLORS.tertiary}
          style={dim}
          testID="totals-discount"
        />
      )}

      {gstRows.map((row) => (
        <Row
          key={row.key}
          label={row.label}
          value={formatPaiseINR(row.paise)}
          style={dim}
          testID={`totals-${row.key}`}
        />
      ))}

      <View style={styles.divider} />

      <Row
        label={BUILDER_COPY.grandTotalLabel}
        value={formatPaiseINR(shownBreakdown.grandTotalPaise)}
        labelVariant="titleMedium"
        valueVariant="titleMedium"
        valueColor={COLORS.primary}
        style={dim}
        testID="totals-grand-total"
      />

      {showRoundOffRow(shownBreakdown.roundOffPaise) && (
        <Row
          label={BUILDER_COPY.roundOffLabel}
          value={formatPaiseINR(shownBreakdown.roundOffPaise)}
          hint={BUILDER_COPY.roundOffHint}
          style={dim}
          testID="totals-round-off"
        />
      )}
    </View>
  );
}

interface RowProps {
  label: string;
  value: string;
  hint?: string;
  labelVariant?: 'bodyLarge' | 'titleMedium';
  valueVariant?: 'bodyLarge' | 'titleMedium';
  valueColor?: string;
  style?: object | null;
  testID: string;
}

function Row({
  label,
  value,
  hint,
  labelVariant = 'bodyLarge',
  valueVariant = 'bodyLarge',
  valueColor = COLORS.onSurface,
  style,
  testID,
}: RowProps) {
  return (
    <View style={[styles.row, style]} testID={testID} accessibilityHint={hint}>
      <Text variant={labelVariant} style={styles.label}>
        {label}
      </Text>
      <Text variant={valueVariant} style={{ color: valueColor }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: COLORS.onSurfaceVariant,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.onSurfaceVariant,
    opacity: 0.3,
    marginVertical: 4,
  },
  dimmed: {
    opacity: 0.4,
  },
});
