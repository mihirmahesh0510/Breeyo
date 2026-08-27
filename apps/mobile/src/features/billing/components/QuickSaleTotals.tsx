import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors as COLORS } from '@breeyo/ui';
import type { TaxBreakdown } from '@breeyo/types';
import { formatPaiseINR } from '../lib/format';
import { BUILDER_COPY, gstRowsFor, showRoundOffRow } from '../lib/builder-copy';

export interface QuickSaleTotalsProps {
  /** The server's breakdown, from the Quick Sale preview. */
  breakdown: TaxBreakdown | undefined;
  /** The server's pre-tax figure, carried alongside rather than derived. */
  subtotalPaise: number | undefined;
  /** D-17: an unregistered clinic never sees a GST row. */
  gstEnabled: boolean;
  /** True while a debounced preview refresh is in flight. */
  isLoading?: boolean;
  testID?: string;
}

/**
 * The counter-sale totals block. **It performs no arithmetic.**
 *
 * Every figure is computed by the server and rendered as received, exactly as
 * `InvoiceTotalsSection` does. A phase-level grep gate enforces that on this
 * file, forbidding both the addition of paise values and array folding; the
 * gate matches on literal tokens, so this note names none of them.
 *
 * The counter is where that rule earns its keep (T-06-122). On the builder
 * screen a wrong figure is caught before finalize. Here the figure IS the
 * checkout: it is read aloud, cash is counted against it, and the invoice
 * produced one tap later would contradict it. A client-side re-derivation could
 * not agree, either — the three heads are rounded to whole rupees once at
 * invoice level under Section 170 / Rule 51, with the residue disclosed
 * separately as `roundOffPaise`, so any second implementation diverges on the
 * first sale with a fractional head.
 *
 * ## Why the GST rows are per head, not the UI-SPEC's single `GST @ [N]%`
 *
 * That spec line predates the supersession of D-08 and D-17, which put the full
 * per-line CGST/SGST/IGST breakdown in scope for Phase 6. `gstRowsFor` is the
 * shared implementation of that decision and already carries its three rules:
 * no row at all for an unregistered clinic, IGST or the CGST/SGST pair but
 * never both, and a zero head omitted. Reusing it also keeps a counter sale and
 * a consultation invoice presenting tax identically — two billing screens in
 * one app disagreeing about how tax is shown is itself a defect.
 *
 * ## Loading
 *
 * While a debounced preview is in flight the previous figures are re-rendered
 * dimmed rather than zeroed. `₹0.00` flashing at someone about to tap
 * `Generate Invoice` is indistinguishable from a real total of nothing.
 */
export function QuickSaleTotals({
  breakdown,
  subtotalPaise,
  gstEnabled,
  isLoading = false,
  testID,
}: QuickSaleTotalsProps) {
  // The last figures actually computed, held so a refresh dims rather than
  // blanks. A ref, not state: it must not itself trigger a render.
  const lastKnown = useRef<{ breakdown?: TaxBreakdown; subtotalPaise?: number }>({});
  if (breakdown && subtotalPaise !== undefined) {
    lastKnown.current = { breakdown, subtotalPaise };
  }

  const shownBreakdown = breakdown ?? lastKnown.current.breakdown;
  const shownSubtotal = subtotalPaise ?? lastKnown.current.subtotalPaise;

  if (!shownBreakdown || shownSubtotal === undefined) return null;

  const gstRows = gstRowsFor(shownBreakdown, gstEnabled);
  const dim = isLoading ? styles.dimmed : null;

  return (
    <View style={styles.section} testID={testID ?? 'quick-sale-totals'}>
      <Row
        label={BUILDER_COPY.subtotalLabel}
        value={formatPaiseINR(shownSubtotal)}
        style={dim}
        testID="quick-sale-subtotal"
      />

      {gstRows.map((row) => (
        <Row
          key={row.key}
          label={row.label}
          value={formatPaiseINR(row.paise)}
          style={dim}
          testID={`quick-sale-${row.key}`}
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
        testID="quick-sale-grand-total"
      />

      {showRoundOffRow(shownBreakdown.roundOffPaise) && (
        // Below the grand total, not above it: this is a GSTR-1 disclosure and
        // not a component of the total. Placed in the column above, it would
        // invite exactly the re-addition this component must not perform.
        <Row
          label={BUILDER_COPY.roundOffLabel}
          value={formatPaiseINR(shownBreakdown.roundOffPaise)}
          hint={BUILDER_COPY.roundOffHint}
          style={dim}
          testID="quick-sale-round-off"
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
