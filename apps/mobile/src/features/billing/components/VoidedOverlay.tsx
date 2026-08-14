import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { voidedStampFields } from '../lib/invoice-detail';

export interface VoidedOverlayProps {
  /** `invoice.voidedAt`. */
  voidDate: Date | string | null;
  /** `invoice.voidReason`. */
  voidReason: string | null;
  testID?: string;
}

const COLORS = {
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  scrim: 'rgba(255, 251, 245, 0.72)',
} as const;

/**
 * The D-21 `VOIDED` stamp laid over the invoice body.
 *
 * A voided invoice keeps every figure it had — the line items, the totals, the
 * payment history — because it remains a record of account with a six-year
 * retention obligation (D-32). That makes it look exactly like a live invoice,
 * which is the problem: a front desk reading a voided invoice's grand total and
 * asking an owner for it is a plausible mistake and an expensive one. The stamp
 * is deliberately loud, rotated and set over a scrim, so "this document is
 * cancelled" is legible before any number is.
 *
 * Rendered by the detail screen (plan 06-22) as an absolutely-positioned
 * sibling of the body; it does not swallow touches, so the still-permitted
 * Print, Share and Download actions remain reachable underneath.
 */
export function VoidedOverlay({ voidDate, voidReason, testID }: VoidedOverlayProps) {
  const fields = voidedStampFields(voidDate, voidReason);

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLabel={[fields.stamp, fields.date, fields.reason].filter(Boolean).join('. ')}
      testID={testID ?? 'invoice-voided-overlay'}
    >
      <View style={styles.stampBox}>
        <Text variant="displaySmall" style={styles.stamp}>
          {fields.stamp}
        </Text>

        {fields.date ? (
          <Text variant="bodySmall" style={styles.meta}>
            {fields.date}
          </Text>
        ) : null}

        {fields.reason ? (
          <Text variant="bodySmall" style={styles.meta}>
            {fields.reason}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.scrim,
  },
  stampBox: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorContainer,
    transform: [{ rotate: '-12deg' }],
  },
  stamp: {
    color: COLORS.error,
    fontWeight: '700',
    letterSpacing: 4,
  },
  meta: {
    color: COLORS.onErrorContainer,
    marginTop: 4,
    textAlign: 'center',
  },
});
