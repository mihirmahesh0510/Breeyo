import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Share, Switch, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { BottomSheet, showToast, colors } from '@breeyo/ui';
import type { PaymentMethod } from '@breeyo/types';
import { formatPaiseINR } from '../lib/format';
import { parseRupeesToPaise } from '../lib/builder-state';
import {
  PAYMENT_COLLECTION_COPY,
  buildSinglePaymentInput,
  buildSplitPaymentInput,
  confirmLabelFor,
  paymentSheetPhase,
  qrCodeDisplayProps,
  type PaymentLinkLike,
} from '../lib/payment-collection';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { SplitPaymentForm } from './SplitPaymentForm';
import { QRCodeDisplay } from './QRCodeDisplay';
import { PaymentLinkExpiryTimer } from './PaymentLinkExpiryTimer';
import {
  PaymentExpiredCard,
  PaymentFailureCard,
  PaymentPendingIndicator,
  PaymentSuccessCard,
} from './PaymentStateCards';
import type {
  PaymentLinkResult,
  RecordPaymentResult,
  UsePaymentMutationsResult,
} from '../hooks/usePaymentMutations';

export interface PaymentCollectionSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** The outstanding balance, integer paise (D-31). */
  amountDuePaise: number;
  /** `invoice.amountPaidPaise`, as last refetched by the detail query. */
  amountPaidPaise: number;
  /** The seven money-state writes, bound to this invoice by the screen. */
  mutations: UsePaymentMutationsResult;
  /** Opens the D-13 receipt for the payment just taken. */
  onViewReceipt: (receiptId: string | null) => void;
  testID?: string;
}

const COLORS = {
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  primary: colors.primary,
  onPrimary: '#FFFFFF',
  outline: '#CAC4D0',
  error: '#BA1A1A',
} as const;

/**
 * D-09 / D-10 / D-11's collection surface (BIL-05, BIL-06).
 *
 * ## The six states are derived, not stored
 *
 * `paymentSheetPhase` in `lib/payment-collection.ts` answers which of
 * `selectMethod`, `processing`, `awaitingPayment`, `success`, `failure` and
 * `expired` is current, from the link, the failure reason, the expiry flag and
 * the invoice's captured total. That module is React-Native-free and unit
 * tested; this file is the layout over it, for the reason 06-14 through 06-21
 * each recorded — `apps/mobile` cannot render a React Native component under
 * test, so a state machine written into this JSX is a state machine nothing can
 * check.
 *
 * ## Waiting becomes success by push, never by asking again
 *
 * This component schedules nothing and subscribes to nothing. The Razorpay
 * webhook reaches the server, the server emits `invoice:updated` into the
 * clinic's Socket.IO room, `useInvoiceSocket` invalidates the `['invoices']`
 * namespace, the detail query refetches, `amountPaidPaise` arrives larger than
 * it was when the link was issued, and the sheet re-derives itself into
 * `success`. Deliberately absent, and enforced by both a test and a phase-level
 * grep gate: any repeating re-request of the invoice on a fixed cadence. Such a
 * timer would reintroduce the stale-status window at its source — for up to one
 * period the screen would show an unpaid invoice the clinic has already been
 * paid for, which is the interval in which the owner gets asked to pay twice
 * (T-06-113).
 *
 * ## Copy rendered here
 *
 * All of it from `PAYMENT_COLLECTION_COPY`, which is asserted verbatim against
 * 06-UI-SPEC's "Payment Collection Flow" table by
 * `__tests__/PaymentCollectionSheet.test.tsx`. This block names the strings the
 * sheet puts on screen so a reader can find them without opening the copy
 * module: `Collect Payment`, `Amount Due: Rs [N]`, `Payment Method`,
 * `Split Payment`, `Mark as Paid`, `Generate Payment Link`, `Scan to Pay`,
 * `Or share this link:`, `Copy Link`, `Waiting for payment...`,
 * `Payment Received`, `Payment Failed`, `Retry`, `Mark as Unpaid`,
 * `Payment link expired` and `Generate New Link`. The three cards and the timer
 * render their own share of that set.
 *
 * ## No credential is here or reachable from here
 *
 * The QR block receives `qrCodeDisplayProps(link)` — the short URL, the amount
 * and the deadline, and nothing else. The gateway key id and secret live only
 * in the clinic's server-side settings and are in no response this device sees
 * (T-06-109).
 */
export function PaymentCollectionSheet({
  visible,
  onDismiss,
  amountDuePaise,
  amountPaidPaise,
  mutations,
  onViewReceipt,
  testID,
}: PaymentCollectionSheetProps) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [isSplit, setIsSplit] = useState(false);
  const [cashAmount, setCashAmount] = useState('');
  const [splitError, setSplitError] = useState<string | null>(null);

  const [link, setLink] = useState<PaymentLinkLike | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [cashSettled, setCashSettled] = useState(false);
  const [settledPaise, setSettledPaise] = useState(0);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [amountPaidPaiseAtLink, setAmountPaidPaiseAtLink] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // A sheet reopened after a dismissal must not inherit the previous attempt's
  // link, failure or settled flag: a stale QR is a code an owner can still scan
  // against a balance that has since changed.
  useEffect(() => {
    if (!visible) return;
    setMethod('cash');
    setIsSplit(false);
    setCashAmount('');
    setSplitError(null);
    setLink(null);
    setLinkExpired(false);
    setFailureReason(null);
    setCashSettled(false);
    setSettledPaise(0);
    setReceiptId(null);
    setAmountPaidPaiseAtLink(null);
    setFormError(null);
  }, [visible]);

  const { recordPayment, retryPaymentLink, markUnpaid } = mutations;

  const phase = useMemo(
    () =>
      paymentSheetPhase({
        isSubmitting: recordPayment.isPending || retryPaymentLink.isPending,
        link,
        linkExpired,
        failureReason,
        cashSettled,
        amountPaidPaiseAtLink,
        amountPaidPaise,
      }),
    [
      recordPayment.isPending,
      retryPaymentLink.isPending,
      link,
      linkExpired,
      failureReason,
      cashSettled,
      amountPaidPaiseAtLink,
      amountPaidPaise,
    ],
  );

  // Success feedback per 06-UI-SPEC's haptics table. Fired on entering the
  // state rather than inside a handler, so a webhook-driven success — which no
  // handler on this device ever runs — is felt too.
  useEffect(() => {
    if (phase === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (phase === 'failure') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [phase]);

  const methodLabel = method === 'cash' ? 'Cash' : method === 'upi' ? 'UPI' : 'Card';

  const applyLink = useCallback(
    (result: PaymentLinkResult) => {
      setLink(result);
      setLinkExpired(false);
      setFailureReason(null);
      // The baseline for "money arrived" is taken here, not at sheet open: a
      // split has already recorded its cash leg by this point.
      setAmountPaidPaiseAtLink(amountPaidPaise);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [amountPaidPaise],
  );

  const handleCollect = useCallback(() => {
    setFormError(null);

    let body;
    try {
      if (isSplit) {
        const parsed = parseRupeesToPaise(cashAmount);
        if (!parsed.ok) {
          setFormError(parsed.error);
          return;
        }
        body = buildSplitPaymentInput({
          totalPaise: amountDuePaise,
          cashAmountPaise: parsed.paise,
          digitalMethod: method === 'card' ? 'card' : 'upi',
        });
      } else {
        body = buildSinglePaymentInput({ method, amountPaise: amountDuePaise });
      }
    } catch (error) {
      // The shared schema's own message, so the device and the server say the
      // same thing about the same body.
      setFormError(error instanceof Error ? error.message : 'Invalid payment');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    recordPayment.mutate(body, {
      onSuccess: (response: { data: RecordPaymentResult }) => {
        const result = response.data;

        if ('paymentLink' in result) {
          // D-10 split: the cash leg is settled, the gateway leg is pending.
          setReceiptId(result.receiptId);
          applyLink(result.paymentLink);
          return;
        }

        if ('shortUrl' in result) {
          applyLink(result);
          return;
        }

        setReceiptId(result.receiptId);
        setSettledPaise(result.invoice.amountPaidPaise);
        setCashSettled(true);
        showToast('success', PAYMENT_COLLECTION_COPY.cashRecordedToast(amountDuePaise));
      },
      onError: (error: unknown) => {
        setFailureReason(error instanceof Error ? error.message : 'Payment could not be recorded');
      },
    });
  }, [
    amountDuePaise,
    applyLink,
    cashAmount,
    isSplit,
    method,
    recordPayment,
  ]);

  const handleRetry = useCallback(() => {
    retryPaymentLink.mutate(undefined, {
      onSuccess: (response: { data: PaymentLinkResult }) => applyLink(response.data),
      onError: (error: unknown) => {
        setFailureReason(error instanceof Error ? error.message : 'Could not create a new link');
      },
    });
  }, [applyLink, retryPaymentLink]);

  const handleMarkUnpaid = useCallback(() => {
    markUnpaid.mutate(undefined, { onSuccess: onDismiss });
  }, [markUnpaid, onDismiss]);

  /**
   * Copy without a new dependency, following 06-23's precedent in
   * `BillingSettingsScreen`: `expo-clipboard` is not in this app's dependency
   * set, so the URL is `selectable` for a native long-press copy and this
   * button opens the share sheet, whose first action on both platforms is Copy
   * — and which is also how the link reaches an owner who has already left
   * (D-09). One line changes if the dependency is ever added.
   */
  const handleCopyLink = useCallback(() => {
    if (!link) return;
    void Share.share({ message: link.shortUrl });
    showToast('info', PAYMENT_COLLECTION_COPY.linkSharedToast);
  }, [link]);

  const canConfirm =
    !recordPayment.isPending && (!isSplit || splitError === null) && amountDuePaise > 0;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={PAYMENT_COLLECTION_COPY.sheetTitle}
      testID={testID ?? 'payment-collection-sheet'}
    >
      <View style={styles.container}>
        <Text variant="headlineSmall" style={styles.amountDue} testID="payment-amount-due">
          {PAYMENT_COLLECTION_COPY.amountDue(amountDuePaise)}
        </Text>

        {phase === 'selectMethod' || phase === 'processing' ? (
          <>
            <PaymentMethodSelector
              selectedMethod={method}
              onSelect={setMethod}
              disabled={recordPayment.isPending}
            />

            <Pressable
              onPress={() => setIsSplit((value) => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isSplit }}
              accessibilityLabel={PAYMENT_COLLECTION_COPY.splitToggle}
              testID="split-payment-toggle"
              style={styles.switchRow}
            >
              <Text variant="bodyLarge" style={styles.switchLabel}>
                {PAYMENT_COLLECTION_COPY.splitToggle}
              </Text>
              <Switch value={isSplit} onValueChange={setIsSplit} />
            </Pressable>

            <SplitPaymentForm
              visible={isSplit}
              totalPaise={amountDuePaise}
              cashAmount={cashAmount}
              onCashChange={setCashAmount}
              onValidityChange={setSplitError}
            />

            {formError !== null ? (
              <Text variant="bodySmall" style={styles.error} testID="payment-form-error">
                {formError}
              </Text>
            ) : null}

            <Pressable
              onPress={handleCollect}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              accessibilityLabel={confirmLabelFor(method)}
              testID="payment-confirm"
              style={[styles.confirmButton, canConfirm ? null : styles.disabled]}
            >
              {recordPayment.isPending ? (
                <ActivityIndicator color={COLORS.onPrimary} />
              ) : (
                <Text variant="labelLarge" style={styles.confirmLabel}>
                  {confirmLabelFor(method)}
                </Text>
              )}
            </Pressable>
          </>
        ) : null}

        {phase === 'awaitingPayment' && link ? (
          <>
            <Text variant="titleMedium" style={styles.qrHeading}>
              {PAYMENT_COLLECTION_COPY.qrHeading}
            </Text>
            <Text variant="bodySmall" style={styles.caption}>
              {PAYMENT_COLLECTION_COPY.qrSubtext(link.amountPaise)}
            </Text>

            <QRCodeDisplay {...qrCodeDisplayProps(link)} />

            <Text variant="bodySmall" style={styles.caption}>
              {PAYMENT_COLLECTION_COPY.linkShareLabel}
            </Text>
            <Text variant="bodySmall" selectable style={styles.linkText} testID="payment-link-url">
              {link.shortUrl}
            </Text>

            <Pressable
              onPress={handleCopyLink}
              accessibilityRole="button"
              accessibilityLabel={PAYMENT_COLLECTION_COPY.copyLink}
              testID="payment-copy-link"
              style={styles.outlinedButton}
            >
              <Text variant="labelLarge" style={styles.outlinedLabel}>
                {PAYMENT_COLLECTION_COPY.copyLink}
              </Text>
            </Pressable>

            <PaymentLinkExpiryTimer
              expiresAt={link.expiresAt}
              onExpired={() => setLinkExpired(true)}
            />

            <PaymentPendingIndicator />
          </>
        ) : null}

        {phase === 'success' ? (
          <PaymentSuccessCard
            amountPaise={cashSettled ? settledPaise : amountPaidPaise}
            methodLabel={methodLabel}
            onViewReceipt={() => onViewReceipt(receiptId)}
            onDone={onDismiss}
          />
        ) : null}

        {phase === 'failure' ? (
          <PaymentFailureCard
            reason={failureReason ?? ''}
            onRetry={handleRetry}
            onMarkUnpaid={handleMarkUnpaid}
            isRetrying={retryPaymentLink.isPending}
          />
        ) : null}

        {phase === 'expired' ? (
          <PaymentExpiredCard
            onGenerateNewLink={handleRetry}
            onMarkUnpaid={handleMarkUnpaid}
            isGenerating={retryPaymentLink.isPending}
          />
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
  amountDue: {
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  switchLabel: {
    color: COLORS.onSurface,
  },
  qrHeading: {
    color: COLORS.onSurface,
    fontWeight: '600',
    textAlign: 'center',
  },
  caption: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  linkText: {
    color: COLORS.primary,
    textAlign: 'center',
  },
  confirmButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: COLORS.primary,
  },
  confirmLabel: {
    color: COLORS.onPrimary,
  },
  outlinedButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingHorizontal: 24,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  outlinedLabel: {
    color: COLORS.onSurface,
  },
  error: {
    color: COLORS.error,
  },
  disabled: {
    opacity: 0.5,
  },
});

/** The formatter the sheet's own strings go through, re-exported for parity. */
export { formatPaiseINR };
