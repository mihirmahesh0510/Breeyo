import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  QR_CODE_CONTAINER_SIZE,
  QR_CODE_SIZE,
  type QRCodeDisplayProps,
} from '../lib/payment-collection';

/**
 * The Razorpay Payment Link, rendered as a QR **on this device**.
 *
 * ## Nothing is fetched and nothing is stored
 *
 * The code is drawn locally from the link's `short_url` by the SVG renderer
 * imported above. No image URL is requested, no bitmap is written to disk, no
 * server CPU is spent, and the block still renders from cached link data on a
 * flaky counter connection.
 *
 * Razorpay's QR Codes API was deliberately **not** used. It is activation-gated
 * per merchant account, so it cannot be a dependency of a Beta shipping to 20
 * pilot clinics — a clinic whose activation had not come through would have a
 * blank square where the payment surface should be, with nothing the front desk
 * could do about it.
 *
 * ## Its props are exactly three, and none is a credential
 *
 * `shortUrl`, `amountPaise` and `expiresAt` — all public. The gateway key id
 * and secret exist only in the clinic's server-side settings and appear in no
 * response the device receives. `qrCodeDisplayProps` in
 * `lib/payment-collection.ts` narrows a link response to this set, and
 * `__tests__/PaymentCollectionSheet.test.tsx` asserts the key set (T-06-109).
 *
 * ## Copy rendered by the parent
 *
 * The `Scan to Pay` heading, the `via Razorpay` subtext and the copyable link
 * belong to `PaymentCollectionSheet`, which owns the block's layout. This
 * component is the code itself and its frame.
 */
export function QRCodeDisplay({ shortUrl }: QRCodeDisplayProps) {
  // 06-UI-SPEC "Animation & Motion": 200ms bezier fade with a scale from 0.95.
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [appear, shortUrl]);

  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });

  return (
    <Animated.View
      style={[styles.container, { opacity: appear, transform: [{ scale }] }]}
      testID="qr-code-display"
    >
      <View style={styles.code}>
        <QRCode value={shortUrl} size={200} backgroundColor="#FFFBF5" color="#1C1B1F" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    // 248 = the 200px code plus 24px of quiet zone on each side, which is what
    // keeps a phone camera locking on at counter distance.
    width: QR_CODE_CONTAINER_SIZE,
    height: QR_CODE_CONTAINER_SIZE,
    padding: 24,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
  },
  code: {
    width: QR_CODE_SIZE,
    height: QR_CODE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
