import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput, Checkbox } from 'react-native-paper';
import { BottomSheet } from '@breeyo/ui';
import { INVOICE_DETAIL_COPY, voidConfirmCopy } from '../lib/invoice-detail';

export interface VoidConfirmPayload {
  reason: string;
  /**
   * The checkbox's value, reported unchanged (T-06-115).
   *
   * Whether dispensed items return to inventory is a real stock decision, not a
   * UI detail, so it is the caller's to send rather than this sheet's to assume.
   */
  restoreStock: boolean;
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
 * ## The checkbox defaults to ticked
 *
 * A void is usually a correction of a mistaken invoice, and the items on a
 * mistaken invoice were usually never handed over. Returning them is the common
 * case, so the vet opts out rather than opting in.
 *
 * ## What the checkbox actually controls
 *
 * D-34 narrowed D-26: the server restores stock for lines the invoice itself
 * created — Quick Sale counter items, manually added product lines — and leaves
 * a consultation-dispensed drug deducted, because the animal was given it
 * whatever the billing correction says. The sheet says so under the checkbox
 * instead of letting a vet discover it at the next stock take.
 *
 * Note also that `voidInvoiceSchema` currently accepts `restoreStock: true`
 * alone, so `parseVoidInput` rejects an opt-out rather than dropping it
 * silently. The value is still reported here unchanged: this sheet's job is to
 * report what the user chose, and swallowing a choice the wire cannot carry is
 * how a user comes to believe something the system did not do. Plan 06-22 owns
 * how that rejection is surfaced; see `deferred-items.md`.
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

  const [restoreStock, setRestoreStock] = useState(true);
  const [reason, setReason] = useState('');

  // A sheet reopened after a cancel must not inherit the previous attempt's
  // reason or a toggled checkbox — a stale reason would be written into the
  // financial audit log for a different void.
  useEffect(() => {
    if (visible) {
      setRestoreStock(true);
      setReason('');
    }
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

        <Pressable
          onPress={() => setRestoreStock((value) => !value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: restoreStock }}
          accessibilityLabel={copy.checkboxLabel}
          testID="void-restore-stock-checkbox"
          style={styles.checkboxRow}
        >
          <Checkbox status={restoreStock ? 'checked' : 'unchecked'} />
          <Text variant="bodyMedium" style={styles.checkboxLabel}>
            {copy.checkboxLabel}
          </Text>
        </Pressable>

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
            onPress={() => onConfirm({ reason: reason.trim(), restoreStock })}
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  checkboxLabel: {
    flex: 1,
    color: COLORS.onSurface,
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
