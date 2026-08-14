import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { BottomSheet, showToast } from '@breeyo/ui';
import { formatPaiseINR } from '../lib/format';
import { parseRupeesToPaise } from '../lib/builder-state';
import {
  REFUND_COPY,
  buildRefundInput,
  findLeg,
  isDigitalLeg,
  refundBoundFor,
  refundConfirmCopy,
  refundFailureMessage,
  splitDisplayRows,
} from '../lib/refund-form';
import { useRefundable } from '../hooks/useRefundable';
import type { UsePaymentMutationsResult } from '../hooks/usePaymentMutations';

export interface RefundSheetProps {
  visible: boolean;
  onDismiss: () => void;
  invoiceId: string;
  mutations: UsePaymentMutationsResult;
  testID?: string;
}

const COLORS = {
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  outline: '#CAC4D0',
  primary: '#2E7D32',
  primaryContainer: '#C8E6C9',
  onPrimaryContainer: '#1B5E20',
} as const;

/**
 * D-12 / D-42's refund surface.
 *
 * ## The maximum comes from the server, and so does the validator
 *
 * `useRefundable` fetches `{ refundablePaise, legs }` and
 * `buildRefundInput` bounds the amount with `makeRefundInputSchema(bound)` —
 * the same factory `refund.service.ts` calls inside its row-locked
 * transaction. The client and the server therefore compute the limit the same
 * way and say the same thing when it is exceeded. The client's copy of the
 * figure can still go stale: another device may refund against the same legs
 * between this sheet loading and this request landing, in which case the server
 * answers `REFUND_EXCEEDS_PAID` and `refundFailureMessage` renders the UI-SPEC's
 * `Refund failed: [reason]. Please try again.` (T-06-111).
 *
 * ## A refund names the leg it reverses
 *
 * D-42: a split invoice was settled with two instruments and can be reversed
 * against either independently. Picking the leg is this sheet's job — the
 * action bar's `onRefund` deliberately carries no payment id — and the choice
 * decides three things at once: the bound, the refund `method`, and which of
 * the two confirmation bodies is shown. The wrong confirmation is not cosmetic:
 * one promises a bank credit in 2-5 days, the other tells the staff member to
 * hand over cash.
 *
 * All decisions live in `lib/refund-form.ts`; this file is layout, because
 * `apps/mobile` cannot render a React Native component under test.
 *
 * ## Copy rendered here
 *
 * All of it from `REFUND_COPY`, asserted verbatim against 06-UI-SPEC's "Refund
 * Flow" and "Destructive Actions" tables. Named here for traceability:
 * `Process Refund`, `Full Refund`, `Partial Refund`, `Refund Amount: Rs [N]`,
 * `Refund Amount (Rs)`, `Maximum: Rs [paid_amount]`,
 * `Original: Rs [amount] via [method]`,
 * `Digital refunds processed via Razorpay (2-5 business days)`,
 * `Cash refund recorded as manual adjustment`,
 * `Digital: Rs [N] via Razorpay`, `Cash: Rs [N] refunded manually`, `Cancel`,
 * `Refund of Rs [N] processed`, `Refund failed: [reason]. Please try again.`,
 * plus both destructive-action confirmations — `Process refund?` /
 * `Record cash refund?` with `Process Refund` / `Record Refund`.
 *
 * The spec writes `Rs` throughout; every one renders `₹`, because
 * `formatPaiseINR` is the feature's single money formatter and emits the rupee
 * sign from `Intl` for `en-IN`. 06-16 and 06-17 made the same substitution.
 */
export function RefundSheet({
  visible,
  onDismiss,
  invoiceId,
  mutations,
  testID,
}: RefundSheetProps) {
  const refundable = useRefundable(invoiceId, visible);
  const summary = refundable.data;

  const [isPartial, setIsPartial] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // A reopened sheet must not inherit the previous attempt's leg or amount:
  // both bound real money and the previous refund may already have taken it.
  useEffect(() => {
    if (!visible) return;
    setIsPartial(false);
    setPaymentId(null);
    setAmountInput('');
    setError(null);
    setIsConfirming(false);
  }, [visible]);

  const boundPaise = summary ? refundBoundFor(summary, paymentId) : 0;
  const leg = summary ? findLeg(summary, paymentId) : null;
  // With no leg named the refund is a whole-invoice adjustment, which the
  // server spreads across the legs. The gateway note is the honest default
  // there only when the invoice actually has a gateway leg to credit.
  const digital = leg ? isDigitalLeg(leg) : Boolean(summary?.legs.some(isDigitalLeg));

  const amountPaise = useMemo(() => {
    if (!isPartial) return boundPaise;
    const parsed = parseRupeesToPaise(amountInput);
    return parsed.ok ? parsed.paise : null;
  }, [amountInput, boundPaise, isPartial]);

  const splitRows = summary ? splitDisplayRows(summary) : null;
  const confirmCopy = refundConfirmCopy(digital, amountPaise ?? 0);

  const handleReview = useCallback(() => {
    setError(null);
    if (!summary || amountPaise === null) {
      setError(REFUND_COPY.partialAmountLabel);
      return;
    }

    try {
      // Built here purely to validate: a bound breach must stop the flow before
      // the confirmation sheet promises the owner anything.
      buildRefundInput({
        type: isPartial ? 'partial' : 'full',
        amountPaise,
        paymentId,
        summary,
      });
      setIsConfirming(true);
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : 'Invalid refund',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [amountPaise, isPartial, paymentId, summary]);

  const handleConfirm = useCallback(() => {
    if (!summary || amountPaise === null) return;

    let body;
    try {
      body = buildRefundInput({
        type: isPartial ? 'partial' : 'full',
        amountPaise,
        paymentId,
        summary,
      });
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Invalid refund');
      setIsConfirming(false);
      return;
    }

    mutations.createRefund.mutate(body, {
      onSuccess: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        showToast('success', REFUND_COPY.successToast(amountPaise));
        onDismiss();
      },
      onError: (mutationError: unknown) => {
        setIsConfirming(false);
        setError(refundFailureMessage(mutationError));
      },
    });
  }, [amountPaise, isPartial, mutations.createRefund, onDismiss, paymentId, summary]);

  const nothingRefundable = summary !== undefined && summary.refundablePaise <= 0;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={isConfirming ? confirmCopy.title : REFUND_COPY.sheetTitle}
      testID={testID ?? 'refund-sheet'}
    >
      <View style={styles.container}>
        {refundable.isLoading ? (
          <ActivityIndicator color={COLORS.primary} testID="refund-loading" />
        ) : null}

        {nothingRefundable ? (
          <Text variant="bodyMedium" style={styles.body}>
            {REFUND_COPY.nothingRefundable}
          </Text>
        ) : null}

        {isConfirming && summary ? (
          <>
            <Text variant="bodyMedium" style={styles.body} testID="refund-confirm-body">
              {confirmCopy.body}
            </Text>

            <View style={styles.actions}>
              <Pressable
                onPress={() => setIsConfirming(false)}
                accessibilityRole="button"
                accessibilityLabel={confirmCopy.cancelLabel}
                testID="refund-confirm-cancel"
                style={styles.textButton}
              >
                <Text variant="labelLarge" style={styles.neutralLabel}>
                  {confirmCopy.cancelLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleConfirm}
                disabled={mutations.createRefund.isPending}
                accessibilityRole="button"
                accessibilityState={{ disabled: mutations.createRefund.isPending }}
                accessibilityLabel={confirmCopy.confirmLabel}
                testID="refund-confirm-submit"
                style={[
                  styles.destructiveButton,
                  mutations.createRefund.isPending ? styles.disabled : null,
                ]}
              >
                <Text variant="labelLarge" style={styles.destructiveLabel}>
                  {confirmCopy.confirmLabel}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {!isConfirming && summary && !nothingRefundable ? (
          <>
            <View style={styles.toggleRow}>
              {[false, true].map((partial) => (
                <Pressable
                  key={partial ? 'partial' : 'full'}
                  onPress={() => setIsPartial(partial)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isPartial === partial }}
                  accessibilityLabel={partial ? REFUND_COPY.partialRefund : REFUND_COPY.fullRefund}
                  testID={`refund-type-${partial ? 'partial' : 'full'}`}
                  style={[styles.toggle, isPartial === partial ? styles.toggleSelected : null]}
                >
                  <Text
                    variant="labelLarge"
                    style={isPartial === partial ? styles.toggleLabelSelected : styles.toggleLabel}
                  >
                    {partial ? REFUND_COPY.partialRefund : REFUND_COPY.fullRefund}
                  </Text>
                </Pressable>
              ))}
            </View>

            {summary.legs.length > 1 ? (
              <View style={styles.legPicker}>
                <Text variant="labelLarge" style={styles.caption}>
                  {REFUND_COPY.legPickerLabel}
                </Text>

                <Pressable
                  onPress={() => setPaymentId(null)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: paymentId === null }}
                  testID="refund-leg-whole"
                  style={[styles.legRow, paymentId === null ? styles.legRowSelected : null]}
                >
                  <Text variant="bodyMedium" style={styles.body}>
                    {REFUND_COPY.wholeInvoiceLeg}
                  </Text>
                </Pressable>

                {summary.legs.map((candidate) => (
                  <Pressable
                    key={candidate.paymentId}
                    onPress={() => setPaymentId(candidate.paymentId)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: paymentId === candidate.paymentId }}
                    testID={`refund-leg-${candidate.paymentId}`}
                    style={[
                      styles.legRow,
                      paymentId === candidate.paymentId ? styles.legRowSelected : null,
                    ]}
                  >
                    <Text variant="bodyMedium" style={styles.body}>
                      {REFUND_COPY.originalPayment(candidate.refundablePaise, candidate.method)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              summary.legs.map((candidate) => (
                <Text key={candidate.paymentId} variant="bodyMedium" style={styles.body}>
                  {REFUND_COPY.originalPayment(candidate.capturedPaise, candidate.method)}
                </Text>
              ))
            )}

            {splitRows ? (
              <View testID="refund-split-display">
                {splitRows.map((row) => (
                  <Text key={row} variant="bodySmall" style={styles.caption}>
                    {row}
                  </Text>
                ))}
              </View>
            ) : null}

            {isPartial ? (
              <>
                <TextInput
                  mode="outlined"
                  label={REFUND_COPY.partialAmountLabel}
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="decimal-pad"
                  error={error !== null}
                  testID="refund-amount-input"
                />
                <Text variant="bodySmall" style={styles.caption}>
                  {REFUND_COPY.maximum(boundPaise)}
                </Text>
              </>
            ) : (
              <Text variant="titleMedium" style={styles.body}>
                {REFUND_COPY.fullAmount(boundPaise)}
              </Text>
            )}

            <Text variant="bodySmall" style={styles.caption}>
              {digital ? REFUND_COPY.digitalNote : REFUND_COPY.cashNote}
            </Text>

            {error !== null ? (
              <Text variant="bodySmall" style={styles.error} testID="refund-error">
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={onDismiss}
                accessibilityRole="button"
                accessibilityLabel={REFUND_COPY.cancelButton}
                testID="refund-cancel"
                style={styles.textButton}
              >
                <Text variant="labelLarge" style={styles.neutralLabel}>
                  {REFUND_COPY.cancelButton}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleReview}
                accessibilityRole="button"
                accessibilityLabel={REFUND_COPY.confirmButton}
                testID="refund-review"
                style={styles.destructiveButton}
              >
                <Text variant="labelLarge" style={styles.destructiveLabel}>
                  {REFUND_COPY.confirmButton}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 16,
  },
  body: {
    color: COLORS.onSurface,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
  },
  error: {
    color: COLORS.error,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  toggleSelected: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primary,
  },
  toggleLabel: {
    color: COLORS.onSurfaceVariant,
  },
  toggleLabelSelected: {
    color: COLORS.onPrimaryContainer,
  },
  legPicker: {
    gap: 8,
  },
  legRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  legRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  neutralLabel: {
    color: COLORS.onSurfaceVariant,
  },
  destructiveButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: COLORS.error,
  },
  destructiveLabel: {
    color: COLORS.onError,
  },
  disabled: {
    opacity: 0.5,
  },
});

/** The sheet's single money formatter, re-exported for call-site parity. */
export { formatPaiseINR };
