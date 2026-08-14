import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { BottomSheet } from '@breeyo/ui';
import { INVOICE_DETAIL_COPY, voidConfirmCopy } from '../lib/invoice-detail';

export interface VoidConfirmPayload {
  reason: string;
  /**
   * Always `true` (D-34, T-06-115).
   *
   * The field is kept on the payload rather than dropped so the intent is
   * explicit in the request and in the financial audit log, but it is no longer
   * a value this sheet collects — see the note on the component below.
   */
  restoreStock: true;
}

export interface VoidConfirmSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** `invoice.invoiceNumber`. Null renders the numberless fallback wording. */
  invoiceNumber: string | null;
  /** `invoice.grandTotalPaise`. */
  grandTotalPaise: number;
  onConfirm: (payload: VoidConfirmPayload) => void;
  isSubmitting?: boolean;
  testID?: string;
}

const COLORS = {
  error: '#BA1A1A',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
} as const;

/**
 * D-26's void confirmation.
 *
 * Copy is 06-UI-SPEC's "Destructive Actions" void row: the title reads
 * "Void this invoice?", the body names the invoice and its amount and states
 * that the action cannot be undone, and the checkbox asks
 * "Return dispensed items to stock?". Every string comes from
 * `INVOICE_DETAIL_COPY` / `voidConfirmCopy`, which are asserted verbatim by
 * `__tests__/invoice-detail.test.ts` — a literal typed into this file would be
 * a string no test can reach, since `apps/mobile` cannot render a React Native
 * component under test.
 *
 * ## There is no stock-restoration checkbox, and that is the point (D-34)
 *
 * D-26 originally asked the vet "Return dispensed items to stock?" and plan
 * 06-17 built the checkbox for it. D-34 then settled the question on the server
 * instead: a void reverses the stock movements the *invoice itself* created —
 * Quick Sale counter items, manually added product lines — and leaves a drug
 * already administered to the patient deducted, because the animal was given it
 * whatever the billing correction says. Which movements reverse follows from
 * each line's provenance, not from a decision a vet is in a position to make at
 * the moment of voiding.
 *
 * `voidInvoiceSchema` encodes exactly that: `restoreStock` is `z.literal(true)`,
 * so an opt-out is unrepresentable on the wire and `parseVoidInput` rejects it.
 * Keeping the checkbox would therefore have offered a choice with two outcomes,
 * both wrong — a hard rejection on submit, or a silent coercion leaving a vet
 * believing stock stayed deducted when it had not. It was removed here (plan
 * 06-22) and replaced with a statement of what will happen, which is the thing
 * the vet actually needs before confirming. This closes 06-17's deferred item 2.
 *
 * The value is still reported on the payload rather than dropped, so the intent
 * is explicit in the request and in the financial audit log (T-06-115).
 *
 * ## D-35
 *
 * Voiding cancels any live Razorpay link for this invoice, server-side, inside
 * the same transaction. Staff who have just put a QR code in front of an owner
 * need to know the code stops working.
 */
export function VoidConfirmSheet({
  visible,
  onDismiss,
  invoiceNumber,
  grandTotalPaise,
  onConfirm,
  isSubmitting = false,
  testID,
}: VoidConfirmSheetProps) {
  const copy = useMemo(
    () => voidConfirmCopy(invoiceNumber, grandTotalPaise),
    [invoiceNumber, grandTotalPaise],
  );

  const [reason, setReason] = useState('');

  // A sheet reopened after a cancel must not inherit the previous attempt's
  // reason — a stale reason would be written into the financial audit log for
  // a different void.
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const canConfirm = reason.trim().length > 0 && !isSubmitting;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={copy.title}
      testID={testID ?? 'void-confirm-sheet'}
    >
      <View style={styles.container}>
        <Text variant="bodyMedium" style={styles.body}>
          {copy.body}
        </Text>

        <Text variant="bodySmall" style={styles.note}>
          {copy.paymentLinkNote}
        </Text>

        <TextInput
          mode="outlined"
          label={INVOICE_DETAIL_COPY.voidReasonLabel}
          placeholder={INVOICE_DETAIL_COPY.voidReasonPlaceholder}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={2}
          maxLength={500}
          testID="void-reason-input"
        />

        {/*
          A statement, not a control. Stock added at billing time comes back
          automatically; items already given to the patient do not. Both halves
          are stated because a vet who is told only the first will be looking
          for the second at the next stock take.
        */}
        <Text variant="bodySmall" style={styles.note} testID="void-restore-stock-note">
          {copy.restoreStockStatement}
        </Text>
        <Text variant="bodySmall" style={styles.note}>
          {copy.checkboxNote}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={copy.cancelLabel}
            testID="void-cancel"
            style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
          >
            <Text variant="labelLarge" style={styles.cancelLabel}>
              {copy.cancelLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onConfirm({ reason: reason.trim(), restoreStock: true })}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm }}
            accessibilityLabel={copy.confirmLabel}
            testID="void-confirm"
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.pressed : null,
              canConfirm ? null : styles.disabled,
            ]}
          >
            <Text variant="labelLarge" style={styles.confirmLabel}>
              {copy.confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  body: {
    color: COLORS.onSurface,
  },
  note: {
    color: COLORS.onSurfaceVariant,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  cancelLabel: {
    color: COLORS.onSurfaceVariant,
  },
  confirmLabel: {
    color: COLORS.error,
  },
});
