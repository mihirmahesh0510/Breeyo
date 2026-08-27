import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors as COLORS } from '@breeyo/ui';
import { PAYMENT_COLLECTION_COPY } from '../lib/payment-collection';

/**
 * The three terminal cards of the collection flow, in one file.
 *
 * They are small, they are always used together by the one sheet that owns the
 * flow, and each is a handful of lines of layout over copy that lives in
 * `lib/payment-collection.ts`. Splitting them across three files would add
 * import noise and three more places to look without separating anything that
 * changes independently.
 *
 * Every string is rendered from `PAYMENT_COLLECTION_COPY`, which
 * `__tests__/PaymentCollectionSheet.test.tsx` asserts verbatim against
 * 06-UI-SPEC — a literal typed into this file would be a string no test can
 * reach, since `apps/mobile` cannot render a React Native component under test.
 */

// ─── Pending ────────────────────────────────────────────────────────────────

export interface PaymentPendingIndicatorProps {
  testID?: string;
}

/**
 * Shown while the gateway has the payment and the server has not yet said so.
 *
 * There is no timer behind this spinner. It stops because the invoice query's
 * data changed, and that data changed because the webhook reached the server
 * and the socket invalidated the cache.
 */
export function PaymentPendingIndicator({ testID }: PaymentPendingIndicatorProps) {
  return (
    <View style={styles.pendingRow} testID={testID ?? 'payment-pending-indicator'}>
      <ActivityIndicator color={COLORS.primary} />
      <Text variant="bodyMedium" style={styles.pendingLabel}>
        {PAYMENT_COLLECTION_COPY.pending}
      </Text>
    </View>
  );
}

// ─── Success ────────────────────────────────────────────────────────────────

export interface PaymentSuccessCardProps {
  /** Integer paise, from the invoice the server returned. */
  amountPaise: number;
  /** `Cash`, `UPI` or `Card` — the label, not the wire value. */
  methodLabel: string;
  onViewReceipt: () => void;
  onDone: () => void;
  testID?: string;
}

export function PaymentSuccessCard({
  amountPaise,
  methodLabel,
  onViewReceipt,
  onDone,
  testID,
}: PaymentSuccessCardProps) {
  // 06-UI-SPEC "Animation & Motion": 300ms scale-from-0 plus opacity on the
  // success checkmark. It is the one moment in billing worth animating — the
  // front desk needs to register it from arm's length.
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 300,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [appear]);

  return (
    <View style={styles.card} testID={testID ?? 'payment-success-card'}>
      <Animated.View style={{ opacity: appear, transform: [{ scale: appear }] }}>
        <MaterialCommunityIcons name="check-circle" size={56} color={COLORS.primary} />
      </Animated.View>

      <Text variant="titleLarge" style={styles.successHeading}>
        {PAYMENT_COLLECTION_COPY.successHeading}
      </Text>
      <Text variant="bodyLarge" style={styles.body}>
        {PAYMENT_COLLECTION_COPY.successBody(amountPaise, methodLabel)}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={onViewReceipt}
          accessibilityRole="button"
          accessibilityLabel={PAYMENT_COLLECTION_COPY.viewReceipt}
          testID="payment-view-receipt"
          style={styles.textButton}
        >
          <Text variant="labelLarge" style={styles.textButtonLabel}>
            {PAYMENT_COLLECTION_COPY.viewReceipt}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={PAYMENT_COLLECTION_COPY.done}
          testID="payment-done"
          style={styles.filledButton}
        >
          <Text variant="labelLarge" style={styles.filledButtonLabel}>
            {PAYMENT_COLLECTION_COPY.done}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Failure ────────────────────────────────────────────────────────────────

export interface PaymentFailureCardProps {
  /**
   * The gateway's own words, passed through unedited.
   *
   * Rewriting it into house copy would hide the one detail that tells the front
   * desk whether to retry the same card or ask for another instrument.
   */
  reason: string;
  onRetry: () => void;
  onMarkUnpaid: () => void;
  isRetrying?: boolean;
  testID?: string;
}

export function PaymentFailureCard({
  reason,
  onRetry,
  onMarkUnpaid,
  isRetrying = false,
  testID,
}: PaymentFailureCardProps) {
  return (
    <View style={styles.card} testID={testID ?? 'payment-failure-card'}>
      <MaterialCommunityIcons name="alert-circle" size={48} color={COLORS.error} />

      <Text variant="titleLarge" style={styles.failureHeading}>
        {PAYMENT_COLLECTION_COPY.failureHeading}
      </Text>
      <Text variant="bodyMedium" style={styles.body} testID="payment-failure-reason">
        {reason}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={onMarkUnpaid}
          accessibilityRole="button"
          accessibilityLabel={PAYMENT_COLLECTION_COPY.markUnpaid}
          testID="payment-mark-unpaid"
          style={styles.textButton}
        >
          <Text variant="labelLarge" style={styles.neutralLabel}>
            {PAYMENT_COLLECTION_COPY.markUnpaid}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityState={{ disabled: isRetrying }}
          accessibilityLabel={PAYMENT_COLLECTION_COPY.retry}
          testID="payment-retry"
          style={[styles.filledButton, isRetrying ? styles.disabled : null]}
        >
          <Text variant="labelLarge" style={styles.filledButtonLabel}>
            {PAYMENT_COLLECTION_COPY.retry}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Expired ────────────────────────────────────────────────────────────────

export interface PaymentExpiredCardProps {
  onGenerateNewLink: () => void;
  onMarkUnpaid: () => void;
  isGenerating?: boolean;
  testID?: string;
}

/**
 * D-11's timeout, as the sheet shows it.
 *
 * Reaching this card calls no expiry endpoint. The server's per-minute sweep
 * has either already flipped the payment row or is about to; this device
 * volunteering an expiry would be a second authority on the same fact.
 */
export function PaymentExpiredCard({
  onGenerateNewLink,
  onMarkUnpaid,
  isGenerating = false,
  testID,
}: PaymentExpiredCardProps) {
  return (
    <View style={styles.card} testID={testID ?? 'payment-expired-card'}>
      <MaterialCommunityIcons name="timer-off-outline" size={48} color={COLORS.onSurfaceVariant} />

      <Text variant="titleMedium" style={styles.expiredHeading}>
        {PAYMENT_COLLECTION_COPY.expiredHeading}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={onMarkUnpaid}
          accessibilityRole="button"
          accessibilityLabel={PAYMENT_COLLECTION_COPY.markUnpaid}
          testID="payment-expired-mark-unpaid"
          style={styles.textButton}
        >
          <Text variant="labelLarge" style={styles.neutralLabel}>
            {PAYMENT_COLLECTION_COPY.markUnpaid}
          </Text>
        </Pressable>

        <Pressable
          onPress={onGenerateNewLink}
          disabled={isGenerating}
          accessibilityRole="button"
          accessibilityState={{ disabled: isGenerating }}
          accessibilityLabel={PAYMENT_COLLECTION_COPY.generateNewLink}
          testID="payment-generate-new-link"
          style={[styles.filledButton, isGenerating ? styles.disabled : null]}
        >
          <Text variant="labelLarge" style={styles.filledButtonLabel}>
            {PAYMENT_COLLECTION_COPY.generateNewLink}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  pendingLabel: {
    color: COLORS.onSurfaceVariant,
  },
  card: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  successHeading: {
    color: COLORS.onPrimaryContainer,
    fontWeight: '700',
  },
  failureHeading: {
    color: COLORS.error,
    fontWeight: '700',
  },
  expiredHeading: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  body: {
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  textButtonLabel: {
    color: COLORS.primary,
  },
  neutralLabel: {
    color: COLORS.onSurfaceVariant,
  },
  filledButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
  },
  filledButtonLabel: {
    color: COLORS.onPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
