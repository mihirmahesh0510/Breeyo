import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { PAYMENT_COLLECTION_COPY, formatCountdown } from '../lib/payment-collection';

export interface PaymentLinkExpiryTimerProps {
  /** ISO timestamp from the Payment Link response. */
  expiresAt: string;
  /** Fired once when the clock reaches zero, so the sheet can change state. */
  onExpired: () => void;
  /** Injectable for a deterministic first frame. */
  now?: () => number;
  testID?: string;
}

/**
 * D-11's 15-minute countdown, rendered as `Link expires in [MM:SS]`.
 *
 * ## This clock is display-only
 *
 * It calls no API — not to check the link, not to expire it, not to ask the
 * server what time it is. The authoritative expiry is the server's per-minute
 * sweep, and it has to be: the front desk puts the phone down, locks it, and
 * walks off while the owner scans. A countdown owned by a process that is no
 * longer running would either leave a payable link the product believes is
 * dead, or a dead one it believes is payable. `onExpired` therefore switches
 * what this device *shows*; it changes nothing on the server (T-06-114).
 *
 * For the same reason the remaining time is recomputed from `expiresAt` against
 * the wall clock on every tick rather than decremented from a counter. A
 * counter loses whatever time the app spent backgrounded and would come back
 * claiming minutes that had already gone.
 */
export function PaymentLinkExpiryTimer({
  expiresAt,
  onExpired,
  now = Date.now,
  testID,
}: PaymentLinkExpiryTimerProps) {
  const deadline = new Date(expiresAt).getTime();
  const [remainingMs, setRemainingMs] = useState(() => deadline - now());
  const hasFired = useRef(false);

  useEffect(() => {
    hasFired.current = false;

    const tick = () => {
      const next = deadline - now();
      setRemainingMs(next);

      if (next <= 0 && !hasFired.current) {
        hasFired.current = true;
        onExpired();
      }
    };

    tick();
    const handle = setInterval(tick, 1000);
    return () => clearInterval(handle);
  }, [deadline, now, onExpired]);

  return (
    <Text variant="bodySmall" style={styles.caption} testID={testID ?? 'payment-link-expiry-timer'}>
      {PAYMENT_COLLECTION_COPY.expiryTimer(formatCountdown(remainingMs))}
    </Text>
  );
}

const styles = StyleSheet.create({
  caption: {
    // tertiary — the spec's colour for the expiry caption.
    color: '#E65100',
    textAlign: 'center',
  },
});
