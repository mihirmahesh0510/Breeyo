import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@breeyo/ui';
import { formatPaiseINR } from '../lib/format';
import { BUILDER_COPY } from '../lib/builder-copy';
import { lineGrossPaise } from '../lib/builder-state';
import type { InvoiceBuilderLine } from '../stores/invoiceBuilderStore';

export interface InvoiceLineItemRowProps {
  line: InvoiceBuilderLine;
  onQuantityChange: (localId: string, quantity: number) => void;
  onRemove: (localId: string) => void;
  /** Reveals the line's `LineItemDiscountInput`. */
  onToggleDiscount?: (localId: string) => void;
  /** True when this line is named in a stock shortfall (BIL-02). */
  hasShortfall?: boolean;
  disabled?: boolean;
  testID?: string;
}

const COLORS = {
  surface: '#FFFFFF',
  surfaceVariant: '#F5F0EB',
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  tertiary: colors.tertiary,
  error: '#BA1A1A',
} as const;

/**
 * One editable line on the builder.
 *
 * ## Removal is confirmed inline
 *
 * The trash icon does not remove. It swaps the row's trailing controls for
 * `Remove [item name]?` with `Remove` and `Keep`, per 06-UI-SPEC's
 * destructive-actions table — the same inline pattern Phase 5 uses for a
 * scanned-item remove. A tap-to-delete on a 44pt target next to a quantity
 * stepper is a line silently dropped from an invoice, which is money the clinic
 * never bills.
 *
 * ## Money
 *
 * `Rate` is the server's unit price and `Amount` is `lineGrossPaise`, an exact
 * integer multiplication that excludes discount and tax and is never sent —
 * see that function for why it is the one multiplication the builder does.
 * Both render through `formatPaiseINR`; this file does no conversion of its own.
 */
export function InvoiceLineItemRow({
  line,
  onQuantityChange,
  onRemove,
  onToggleDiscount,
  hasShortfall = false,
  disabled = false,
  testID,
}: InvoiceLineItemRowProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const typeLabel = line.lineType === 'service' ? 'SERVICE' : 'PRODUCT';

  const step = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onQuantityChange(line.localId, line.quantity + delta);
  };

  if (confirmingRemove) {
    return (
      <View
        style={[styles.row, styles.confirmRow]}
        testID={testID ?? `line-item-${line.localId}`}
      >
        <Text variant="bodyLarge" numberOfLines={1} style={styles.confirmPrompt}>
          {BUILDER_COPY.removeConfirm(line.description)}
        </Text>
        <Pressable
          style={styles.confirmAction}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setConfirmingRemove(false);
            onRemove(line.localId);
          }}
          accessibilityRole="button"
          testID={`line-item-remove-confirm-${line.localId}`}
        >
          <Text variant="bodyLarge" style={styles.removeLabel}>
            {BUILDER_COPY.removeConfirmAccept}
          </Text>
        </Pressable>
        <Pressable
          style={styles.confirmAction}
          onPress={() => setConfirmingRemove(false)}
          accessibilityRole="button"
          testID={`line-item-remove-cancel-${line.localId}`}
        >
          <Text variant="bodyLarge" style={styles.keepLabel}>
            {BUILDER_COPY.removeConfirmCancel}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[styles.row, hasShortfall && styles.shortfallRow]}
      testID={testID ?? `line-item-${line.localId}`}
    >
      <View style={styles.details}>
        <View style={styles.titleLine}>
          <View style={styles.typeBadge}>
            <Text variant="labelSmall" style={styles.typeLabel}>
              {typeLabel}
            </Text>
          </View>
          <Text variant="bodyLarge" numberOfLines={1} style={styles.description}>
            {line.description}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.meta}>
          {BUILDER_COPY.rateLabel} {formatPaiseINR(line.unitPricePaise)}
        </Text>
      </View>

      <View style={styles.stepper}>
        <Pressable
          style={styles.stepButton}
          onPress={() => step(-1)}
          disabled={disabled || line.quantity <= 1}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${BUILDER_COPY.qtyLabel}`}
          testID={`line-item-qty-decrease-${line.localId}`}
        >
          <MaterialCommunityIcons name="minus" size={18} color={COLORS.onSurfaceVariant} />
        </Pressable>
        <Text variant="bodyLarge" style={styles.quantity} testID={`line-item-qty-${line.localId}`}>
          {line.quantity}
        </Text>
        <Pressable
          style={styles.stepButton}
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${BUILDER_COPY.qtyLabel}`}
          testID={`line-item-qty-increase-${line.localId}`}
        >
          <MaterialCommunityIcons name="plus" size={18} color={COLORS.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={styles.amountColumn}>
        <Text variant="bodyLarge" style={styles.amount}>
          {formatPaiseINR(lineGrossPaise(line))}
        </Text>
        {onToggleDiscount && (
          <Pressable
            onPress={() => onToggleDiscount(line.localId)}
            disabled={disabled}
            accessibilityRole="button"
            testID={`line-item-discount-toggle-${line.localId}`}
          >
            <Text variant="bodySmall" style={styles.discountCta}>
              {BUILDER_COPY.addDiscount}
            </Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.removeButton}
        onPress={() => setConfirmingRemove(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={BUILDER_COPY.removeConfirm(line.description)}
        testID={`line-item-remove-${line.localId}`}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.error} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // 06-UI-SPEC "Spacing Scale" exception: 48px per invoice line item, the
    // compact density Phase 2 D-32 specifies for tabular financial data.
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  shortfallRow: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
  },
  confirmRow: {
    backgroundColor: COLORS.surfaceVariant,
    gap: 8,
  },
  confirmPrompt: {
    flex: 1,
    color: COLORS.onSurface,
  },
  confirmAction: {
    // 44x44pt minimum touch target (Phase 2 standard), height inherited from
    // the 48px row.
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: {
    color: COLORS.error,
  },
  keepLabel: {
    color: COLORS.onSurfaceVariant,
  },
  details: {
    flex: 1,
    marginRight: 8,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeBadge: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  typeLabel: {
    color: COLORS.onSurfaceVariant,
  },
  description: {
    flex: 1,
    color: COLORS.onSurface,
  },
  meta: {
    color: COLORS.onSurfaceVariant,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    minWidth: 24,
    textAlign: 'center',
    color: COLORS.onSurface,
  },
  amountColumn: {
    alignItems: 'flex-end',
    minWidth: 72,
    marginLeft: 8,
  },
  amount: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  discountCta: {
    color: COLORS.tertiary,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
