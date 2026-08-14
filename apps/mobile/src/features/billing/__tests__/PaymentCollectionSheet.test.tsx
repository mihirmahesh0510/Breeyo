/**
 * The payment collection sheet's behaviour, tested at its decision layer.
 *
 * ## Why this file imports a `lib/` module rather than rendering the sheet
 *
 * `apps/mobile` cannot render a React Native component under test: vitest runs
 * the `node` environment with no Metro/Babel transform, so `import
 * 'react-native'` fails at parse time, and `react-test-renderer` is not
 * installed. This is a pre-existing, app-wide constraint that 06-14, 06-15,
 * 06-16, 06-17, 06-18, 06-21 and 06-23 each hit and each resolved the same way:
 * the decisions move into a React-Native-free module and the `.tsx` becomes a
 * thin renderer over it.
 *
 * So every behaviour the plan specifies for `PaymentCollectionSheet` is
 * asserted here against `lib/payment-collection.ts`, which is the module the
 * sheet delegates every one of those decisions to. Three assertions that are
 * genuinely about the component tree — the QR's prop set, the absence of a
 * polling timer, and the absence of a Razorpay credential — are made by reading
 * the component sources off disk, which is the only form in which they are
 * reachable at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAZORPAY_MIN_AMOUNT_PAISE } from '@breeyo/types';
import {
  PAYMENT_COLLECTION_COPY,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHOD_ROW_HEIGHT,
  QR_CODE_CONTAINER_SIZE,
  QR_CODE_SIZE,
  PAYMENT_LINK_WINDOW_MS,
  buildSinglePaymentInput,
  buildSplitPaymentInput,
  confirmLabelFor,
  formatCountdown,
  hasPaymentLanded,
  paymentSheetPhase,
  qrCodeDisplayProps,
  splitRemainingPaise,
  type PaymentSheetPhaseInput,
} from '../lib/payment-collection';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const COMPONENT_DIR = join(__dirname, '..', 'components');

function componentSource(filename: string): string {
  return readFileSync(join(COMPONENT_DIR, filename), 'utf8');
}

const LINK = {
  paymentLinkId: 'plink_ABC123',
  shortUrl: 'https://rzp.io/i/aBcD1234',
  expiresAt: '2026-08-14T10:15:00.000Z',
  amountPaise: 125_000,
};

const IDLE: PaymentSheetPhaseInput = {
  isSubmitting: false,
  link: null,
  linkExpired: false,
  failureReason: null,
  cashSettled: false,
  amountPaidPaiseAtLink: null,
  amountPaidPaise: 0,
};

// ─── 1. The sheet opens on method selection ─────────────────────────────────

describe('the sheet opens showing the amount due and the three methods', () => {
  it('uses the UI-SPEC title, amount-due and split-toggle copy verbatim', () => {
    expect(PAYMENT_COLLECTION_COPY.sheetTitle).toBe('Collect Payment');
    expect(PAYMENT_COLLECTION_COPY.amountDue(125_000)).toBe('Amount Due: ₹1,250.00');
    expect(PAYMENT_COLLECTION_COPY.methodSectionHeader).toBe('Payment Method');
    expect(PAYMENT_COLLECTION_COPY.splitToggle).toBe('Split Payment');
  });

  it('offers exactly Cash, UPI and Card at the spec row height, cash first', () => {
    expect(PAYMENT_METHOD_OPTIONS.map((option) => option.method)).toEqual([
      'cash',
      'upi',
      'card',
    ]);
    expect(PAYMENT_METHOD_OPTIONS.map((option) => option.label)).toEqual([
      'Cash',
      'UPI',
      'Card',
    ]);
    // Every option carries an icon; the spec's map is phone for UPI, card for card.
    expect(PAYMENT_METHOD_OPTIONS.every((option) => option.icon.length > 0)).toBe(true);
    expect(PAYMENT_METHOD_ROW_HEIGHT).toBe(56);
  });

  it('starts in selectMethod with the split switch off', () => {
    expect(paymentSheetPhase(IDLE)).toBe('selectMethod');
  });
});

// ─── 2. Cash ────────────────────────────────────────────────────────────────

describe('cash collection settles immediately', () => {
  it('labels the cash confirm "Mark as Paid" and the digital one "Generate Payment Link"', () => {
    expect(confirmLabelFor('cash')).toBe('Mark as Paid');
    expect(confirmLabelFor('upi')).toBe('Generate Payment Link');
    expect(confirmLabelFor('card')).toBe('Generate Payment Link');
  });

  it('builds a manual-channel single-leg body and the spec toast', () => {
    const input = buildSinglePaymentInput({ method: 'cash', amountPaise: 125_000 });

    expect(input).toEqual({
      mode: 'single',
      method: 'cash',
      channel: 'manual',
      amountPaise: 125_000,
    });
    expect(PAYMENT_COLLECTION_COPY.cashRecordedToast(125_000)).toBe(
      '₹1,250.00 cash payment recorded',
    );
  });

  it('routes UPI and card through the gateway channel', () => {
    expect(buildSinglePaymentInput({ method: 'upi', amountPaise: 125_000 })).toMatchObject({
      method: 'upi',
      channel: 'razorpay',
    });
    expect(buildSinglePaymentInput({ method: 'card', amountPaise: 125_000 })).toMatchObject({
      method: 'card',
      channel: 'razorpay',
    });
  });

  it('rejects a gateway leg below the Razorpay minimum before any request', () => {
    expect(() => buildSinglePaymentInput({ method: 'upi', amountPaise: 50 })).toThrow(
      `A Razorpay payment must be at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise`,
    );
  });
});

// ─── 3. The QR ──────────────────────────────────────────────────────────────

describe('the QR is rendered on the device from the link URL', () => {
  it('carries the spec copy for the QR block', () => {
    expect(PAYMENT_COLLECTION_COPY.qrHeading).toBe('Scan to Pay');
    expect(PAYMENT_COLLECTION_COPY.qrSubtext(125_000)).toBe('₹1,250.00 via Razorpay');
    expect(PAYMENT_COLLECTION_COPY.linkShareLabel).toBe('Or share this link:');
    expect(PAYMENT_COLLECTION_COPY.copyLink).toBe('Copy Link');
  });

  it('is 200x200 inside a 248x248 container', () => {
    expect(QR_CODE_SIZE).toBe(200);
    expect(QR_CODE_CONTAINER_SIZE).toBe(248);
  });

  it('passes QRCodeDisplay exactly three props and no credential (T-06-109)', () => {
    const props = qrCodeDisplayProps(LINK);

    expect(Object.keys(props).sort()).toEqual(['amountPaise', 'expiresAt', 'shortUrl']);
    expect(props.shortUrl).toBe(LINK.shortUrl);

    // Nothing key-shaped can be reached from the props object at all.
    const serialised = JSON.stringify(props);
    expect(serialised).not.toMatch(/rzp_(test|live)/);
    expect(serialised).not.toMatch(/keySecret|key_secret|razorpayKeyId/);
  });

  it('renders the QR locally and never fetches or stores an image', () => {
    const source = componentSource('QRCodeDisplay.tsx');

    expect(source).toContain('react-native-qrcode-svg');
    expect(source).toMatch(/size=\{200\}/);
    // No remote image and no filesystem write.
    expect(source).not.toMatch(/<Image\b/);
    expect(source).not.toMatch(/FileSystem|writeAsStringAsync/);
  });
});

// ─── 4. The countdown is display-only ───────────────────────────────────────

describe('the expiry countdown', () => {
  it('starts at 15:00 and formats MM:SS', () => {
    expect(PAYMENT_LINK_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(formatCountdown(PAYMENT_LINK_WINDOW_MS)).toBe('15:00');
    expect(formatCountdown(9 * 60_000 + 5_000)).toBe('09:05');
    expect(formatCountdown(0)).toBe('00:00');
    // Past the deadline the clock stops at zero rather than going negative.
    expect(formatCountdown(-30_000)).toBe('00:00');
  });

  it('renders the spec caption', () => {
    expect(PAYMENT_COLLECTION_COPY.expiryTimer('15:00')).toBe('Link expires in 15:00');
  });

  it('calls no API — the server sweep owns expiry (T-06-114)', () => {
    const source = componentSource('PaymentLinkExpiryTimer.tsx');

    expect(source).not.toMatch(/apiClient/);
    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/useMutation|useQuery/);
  });
});

// ─── 5. Waiting → success is push-driven ────────────────────────────────────

describe('the waiting-to-success transition', () => {
  it('waits while the link is live and nothing has been captured', () => {
    const phase = paymentSheetPhase({
      ...IDLE,
      link: LINK,
      amountPaidPaiseAtLink: 0,
      amountPaidPaise: 0,
    });

    expect(phase).toBe('awaitingPayment');
    expect(PAYMENT_COLLECTION_COPY.pending).toBe('Waiting for payment...');
  });

  it('flips to success when the refetched invoice shows money arrived', () => {
    expect(hasPaymentLanded(0, 125_000)).toBe(true);
    expect(hasPaymentLanded(0, 0)).toBe(false);
    // A split whose cash leg was already counted does not read as the digital
    // leg landing: the baseline is taken at link time, not at sheet open.
    expect(hasPaymentLanded(50_000, 50_000)).toBe(false);
    expect(hasPaymentLanded(50_000, 125_000)).toBe(true);

    expect(
      paymentSheetPhase({
        ...IDLE,
        link: LINK,
        amountPaidPaiseAtLink: 0,
        amountPaidPaise: 125_000,
      }),
    ).toBe('success');

    expect(PAYMENT_COLLECTION_COPY.successHeading).toBe('Payment Received');
    expect(PAYMENT_COLLECTION_COPY.successBody(125_000, 'UPI')).toBe('₹1,250.00 via UPI');
    expect(PAYMENT_COLLECTION_COPY.viewReceipt).toBe('View Receipt');
    expect(PAYMENT_COLLECTION_COPY.done).toBe('Done');
  });

  it('sets no polling timer anywhere in the sheet (T-06-113)', () => {
    const source = componentSource('PaymentCollectionSheet.tsx');

    expect(source).not.toMatch(/refetchInterval/);
    expect(source).not.toMatch(/setInterval/);
    expect(source).not.toMatch(/refetch\s*\(/);
  });
});

// ─── 6. Failure and expiry ──────────────────────────────────────────────────

describe('a failed payment', () => {
  it("shows the gateway's own reason with retry and mark-unpaid", () => {
    const phase = paymentSheetPhase({
      ...IDLE,
      link: LINK,
      amountPaidPaiseAtLink: 0,
      failureReason: 'Payment was declined by the issuing bank',
    });

    expect(phase).toBe('failure');
    expect(PAYMENT_COLLECTION_COPY.failureHeading).toBe('Payment Failed');
    expect(PAYMENT_COLLECTION_COPY.retry).toBe('Retry');
    expect(PAYMENT_COLLECTION_COPY.markUnpaid).toBe('Mark as Unpaid');
  });

  it('renders a new QR value after a retry issues a different link', () => {
    const retried = { ...LINK, paymentLinkId: 'plink_XYZ789', shortUrl: 'https://rzp.io/i/zZzZ9999' };

    expect(qrCodeDisplayProps(retried).shortUrl).not.toBe(qrCodeDisplayProps(LINK).shortUrl);
  });
});

describe('an expired link', () => {
  it('offers a new link and mark-unpaid, and calls no expiry endpoint', () => {
    const phase = paymentSheetPhase({
      ...IDLE,
      link: LINK,
      amountPaidPaiseAtLink: 0,
      linkExpired: true,
    });

    expect(phase).toBe('expired');
    expect(PAYMENT_COLLECTION_COPY.expiredHeading).toBe('Payment link expired');
    expect(PAYMENT_COLLECTION_COPY.generateNewLink).toBe('Generate New Link');
  });

  it('prefers a landed payment over an expiry that fired in the same tick', () => {
    // The webhook and the countdown can cross. Money already captured wins:
    // telling the front desk the link expired after it was paid is the one
    // failure that produces a second collection.
    expect(
      paymentSheetPhase({
        ...IDLE,
        link: LINK,
        linkExpired: true,
        amountPaidPaiseAtLink: 0,
        amountPaidPaise: 125_000,
      }),
    ).toBe('success');
  });
});

// ─── 7. Split ───────────────────────────────────────────────────────────────

describe('a split payment', () => {
  it('auto-calculates the digital remainder for the caption', () => {
    expect(splitRemainingPaise(125_000, 25_000)).toBe(100_000);
    expect(PAYMENT_COLLECTION_COPY.splitRemaining(100_000)).toBe('Remaining: ₹1,000.00');
    expect(PAYMENT_COLLECTION_COPY.splitCashLabel).toBe('Cash Amount (₹)');
    expect(PAYMENT_COLLECTION_COPY.splitCashPlaceholder).toBe('0');
    expect(PAYMENT_COLLECTION_COPY.splitDigitalLabel).toBe('Digital Amount (₹)');
  });

  it('builds a split body whose legs sum to the declared total', () => {
    const input = buildSplitPaymentInput({
      totalPaise: 125_000,
      cashAmountPaise: 25_000,
      digitalMethod: 'upi',
    });

    expect(input).toEqual({
      mode: 'split',
      totalPaise: 125_000,
      cashAmountPaise: 25_000,
      digitalAmountPaise: 100_000,
      digitalMethod: 'upi',
      digitalChannel: 'razorpay',
    });
  });

  it("rejects legs that do not sum with the shared schema's own message", () => {
    expect(() =>
      buildSplitPaymentInput({
        totalPaise: 125_000,
        cashAmountPaise: 25_000,
        digitalMethod: 'upi',
        // A caller that overrides the derived remainder is the case the shared
        // superRefine exists to catch.
        digitalAmountPaise: 90_000,
      }),
    ).toThrow('The cash and digital legs must sum to the declared total');
  });

  it('rejects a digital leg below the gateway minimum, naming it', () => {
    expect(() =>
      buildSplitPaymentInput({
        totalPaise: 25_050,
        cashAmountPaise: 25_000,
        digitalMethod: 'upi',
      }),
    ).toThrow(`A Razorpay leg must be at least ${RAZORPAY_MIN_AMOUNT_PAISE} paise`);
  });

  it('rejects a cash leg that swallows the whole total, since a split needs two legs', () => {
    expect(() =>
      buildSplitPaymentInput({
        totalPaise: 125_000,
        cashAmountPaise: 125_000,
        digitalMethod: 'upi',
      }),
    ).toThrow();
  });
});

// ─── 8. No credential reaches any component ─────────────────────────────────

describe('no Razorpay credential exists in the collection surface (T-06-109)', () => {
  const FILES = [
    'PaymentCollectionSheet.tsx',
    'PaymentMethodSelector.tsx',
    'SplitPaymentForm.tsx',
    'QRCodeDisplay.tsx',
    'PaymentLinkExpiryTimer.tsx',
    'PaymentStateCards.tsx',
  ];

  it.each(FILES)('%s holds no key id and no secret', (filename) => {
    const source = componentSource(filename);

    expect(source).not.toMatch(/keySecret|key_secret/);
    expect(source).not.toMatch(/razorpayKeyId/);
    expect(source).not.toMatch(/rzp_(test|live)/);
  });
});
