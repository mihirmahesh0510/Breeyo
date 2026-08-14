import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
// The same schema object the Fastify handler parses. Running it here for live
// inline feedback — rather than restating its two rules — is what stops the
// form and the server disagreeing about what a valid split is.
import { recordPaymentSchema } from '@breeyo/validators';
import { PAYMENT_COLLECTION_COPY, splitRemainingPaise } from '../lib/payment-collection';
import { parseRupeesToPaise } from '../lib/builder-state';

export interface SplitPaymentFormProps {
  visible: boolean;
  /** The balance being settled, integer paise (D-31). */
  totalPaise: number;
  /** What the user has typed into the cash field, in rupees. */
  cashAmount: string;
  onCashChange: (value: string) => void;
  /** Reported upward so the sheet can disable its confirm button. */
  onValidityChange?: (error: string | null) => void;
  testID?: string;
}

const COLORS = {
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
} as const;

/**
 * D-10's split: part cash at the counter, the remainder through the gateway.
 *
 * ## The digital leg is not typed, it is the remainder
 *
 * 06-UI-SPEC labels the digital field but auto-calculates it, and that is the
 * right shape: two independently typed legs can disagree with the total, and a
 * split that does not add up marks an invoice settled for money the clinic
 * never received. `splitRemainingPaise` derives it, and
 * `recordPaymentSchema`'s `superRefine` re-checks the sum on both sides of the
 * wire.
 *
 * ## Validation is the shared schema's, worded once
 *
 * The two failures this form can produce — legs that do not sum, and a gateway
 * leg under ₹1 — are both expressed in `@breeyo/validators`. The builders in
 * `lib/payment-collection.ts` parse with that schema before anything is sent,
 * so the message shown here is the message the server would have returned. The
 * only rule stated locally is the rupee-input grammar, which is 06-16's
 * `parseRupeesToPaise`: digits with at most two decimal places, rejected rather
 * than rounded, because choosing a rounding direction on the user's behalf is
 * choosing which way the clinic loses money.
 */
export function SplitPaymentForm({
  visible,
  totalPaise,
  cashAmount,
  onCashChange,
  onValidityChange,
  testID,
}: SplitPaymentFormProps) {
  // 06-UI-SPEC "Animation & Motion": 200ms on the split form expanding.
  const reveal = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: visible ? 1 : 0,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [reveal, visible]);

  const { remainingPaise, error } = useMemo(() => {
    const parsed = parseRupeesToPaise(cashAmount);
    if (!parsed.ok) return { remainingPaise: null, error: parsed.error };

    const remaining = splitRemainingPaise(totalPaise, parsed.paise);

    const result = recordPaymentSchema.safeParse({
      mode: 'split',
      totalPaise,
      cashAmountPaise: parsed.paise,
      digitalAmountPaise: remaining,
      digitalMethod: 'upi',
      digitalChannel: 'razorpay',
    });

    if (result.success) return { remainingPaise: remaining, error: null };

    return { remainingPaise: remaining, error: result.error.errors[0]?.message ?? null };
  }, [cashAmount, totalPaise]);

  useEffect(() => {
    onValidityChange?.(error);
  }, [error, onValidityChange]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: reveal }]} testID={testID ?? 'split-payment-form'}>
      <TextInput
        mode="outlined"
        label={PAYMENT_COLLECTION_COPY.splitCashLabel}
        placeholder={PAYMENT_COLLECTION_COPY.splitCashPlaceholder}
        value={cashAmount}
        onChangeText={onCashChange}
        keyboardType="decimal-pad"
        error={error !== null}
        testID="split-cash-input"
      />

      <Text variant="labelLarge" style={styles.digitalLabel}>
        {PAYMENT_COLLECTION_COPY.splitDigitalLabel}
      </Text>

      {remainingPaise !== null ? (
        <Text variant="bodySmall" style={styles.remaining} testID="split-remaining">
          {PAYMENT_COLLECTION_COPY.splitRemaining(remainingPaise)}
        </Text>
      ) : null}

      {error !== null ? (
        <Text variant="bodySmall" style={styles.error} testID="split-error">
          {error}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  digitalLabel: {
    color: COLORS.onSurfaceVariant,
  },
  remaining: {
    color: COLORS.onSurfaceVariant,
  },
  error: {
    color: COLORS.error,
  },
});
