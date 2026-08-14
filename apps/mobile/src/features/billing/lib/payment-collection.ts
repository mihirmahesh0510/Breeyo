/**
 * The payment collection sheet's copy contract, state machine and request
 * bodies (BIL-05, BIL-06 — D-09, D-10, D-11, D-13).
 *
 * ## Why this is a module and not the component
 *
 * `apps/mobile` cannot render a React Native component under test (vitest `node`
 * environment, no Metro transform, no `react-test-renderer`), so a six-state
 * machine written inside JSX is a six-state machine no test can reach. Every
 * decision the sheet appears to make is made here; `PaymentCollectionSheet.tsx`
 * is the layout over it. Same split as `lib/builder-screen.ts` (06-16),
 * `lib/invoice-actions.ts` and `lib/invoice-detail.ts` (06-17).
 *
 * ## Copy
 *
 * Every string is quoted from `06-UI-SPEC.md`'s "Payment Collection Flow" table
 * and asserted verbatim by `__tests__/PaymentCollectionSheet.test.tsx`. The one
 * systematic transliteration is the feature-wide `Rs` → `₹`, because
 * `formatPaiseINR` — the billing layer's single money formatter — emits the
 * rupee sign from `Intl` for `en-IN`. 06-16 and 06-17 made the same substitution.
 *
 * ## No credential is representable here
 *
 * Nothing in this module accepts, holds or returns a Razorpay key id or secret.
 * {@link qrCodeDisplayProps} narrows a payment-link response to the three public
 * fields the QR block renders, so the credential-free property of the display
 * component is structural rather than a convention someone has to remember
 * (T-06-109).
 */

import { RAZORPAY_MIN_AMOUNT_PAISE, type PaymentMethod } from '@breeyo/types';
import type { RecordPaymentInput } from '@breeyo/validators';
import { formatPaiseINR } from './format';
import { parsePaymentInput } from './payment-mutations';

// ─── Copy ───────────────────────────────────────────────────────────────────

export const PAYMENT_COLLECTION_COPY = {
  sheetTitle: 'Collect Payment',
  amountDue: (paise: number) => `Amount Due: ${formatPaiseINR(paise)}`,
  methodSectionHeader: 'Payment Method',
  splitToggle: 'Split Payment',

  splitCashLabel: 'Cash Amount (₹)',
  splitCashPlaceholder: '0',
  splitDigitalLabel: 'Digital Amount (₹)',
  splitRemaining: (paise: number) => `Remaining: ${formatPaiseINR(paise)}`,

  cashConfirm: 'Mark as Paid',
  digitalConfirm: 'Generate Payment Link',

  qrHeading: 'Scan to Pay',
  qrSubtext: (paise: number) => `${formatPaiseINR(paise)} via Razorpay`,
  linkShareLabel: 'Or share this link:',
  copyLink: 'Copy Link',
  expiryTimer: (mmss: string) => `Link expires in ${mmss}`,

  pending: 'Waiting for payment...',

  successHeading: 'Payment Received',
  successBody: (paise: number, method: string) => `${formatPaiseINR(paise)} via ${method}`,
  viewReceipt: 'View Receipt',
  done: 'Done',

  failureHeading: 'Payment Failed',
  retry: 'Retry',
  markUnpaid: 'Mark as Unpaid',

  cashRecordedToast: (paise: number) => `${formatPaiseINR(paise)} cash payment recorded`,

  expiredHeading: 'Payment link expired',
  generateNewLink: 'Generate New Link',

  /**
   * Addition, not a quotation. 06-UI-SPEC gives the copy button but no feedback
   * for it, and a tap that changes nothing on screen reads as a dead button to
   * the person holding the phone in front of an owner.
   */
  linkSharedToast: 'Payment link ready to share',
} as const;

/** The spec's method labels, in the order the sheet lists them. */
export interface PaymentMethodOption {
  method: PaymentMethod;
  label: string;
  /** MaterialCommunityIcons name, from 06-UI-SPEC's "Payment Method Icon Map". */
  icon: string;
}

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  { method: 'cash', label: 'Cash', icon: 'cash' },
  { method: 'upi', label: 'UPI', icon: 'cellphone' },
  { method: 'card', label: 'Card', icon: 'credit-card-outline' },
] as const;

/** 06-UI-SPEC "Spacing Scale": the payment-method rows are 56px. */
export const PAYMENT_METHOD_ROW_HEIGHT = 56;

/** 06-UI-SPEC "Payment Link Behavior": the QR is 200x200 in a 248px container. */
export const QR_CODE_SIZE = 200;
export const QR_CODE_CONTAINER_SIZE = 248;

/** D-11's window. Display only — see {@link formatCountdown}. */
export const PAYMENT_LINK_WINDOW_MS = 15 * 60 * 1000;

/**
 * Which confirm button the chosen method puts at the bottom of the sheet.
 *
 * Cash settles on the device's say-so and is therefore an attestation
 * ("Mark as Paid"); UPI and card cannot settle without the gateway, so the
 * button describes what actually happens next ("Generate Payment Link") rather
 * than promising a payment the clinic has not received.
 */
export function confirmLabelFor(method: PaymentMethod): string {
  return method === 'cash'
    ? PAYMENT_COLLECTION_COPY.cashConfirm
    : PAYMENT_COLLECTION_COPY.digitalConfirm;
}

// ─── The QR's props (T-06-109) ──────────────────────────────────────────────

/** The public half of `payment.service.ts#PaymentLinkResult`. */
export interface PaymentLinkLike {
  shortUrl: string;
  expiresAt: string;
  amountPaise: number;
  /** Present on the service's result; deliberately NOT forwarded to the QR. */
  paymentLinkId?: string;
}

export interface QRCodeDisplayProps {
  shortUrl: string;
  amountPaise: number;
  expiresAt: string;
}

/**
 * Narrows a payment-link response to exactly what the QR block renders.
 *
 * Three fields, all public: the Razorpay-hosted short URL the QR encodes, the
 * amount for the caption and the deadline for the countdown. The gateway's key
 * id and secret live only in the clinic's server-side settings and are never
 * part of any response the device receives — this function makes that
 * structural for the one component that renders a gateway artefact, so a future
 * change that widens the link response cannot silently widen what the QR holds.
 */
export function qrCodeDisplayProps(link: PaymentLinkLike): QRCodeDisplayProps {
  return {
    shortUrl: link.shortUrl,
    amountPaise: link.amountPaise,
    expiresAt: link.expiresAt,
  };
}

// ─── The countdown ──────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;

/**
 * `MM:SS` from a remaining-milliseconds figure, floored at zero.
 *
 * **This clock is cosmetic.** The authoritative expiry is the server's
 * per-minute sweep, because the front desk backgrounds the app, locks the phone
 * and walks away while an owner scans. A countdown that reached zero in a
 * process that is no longer running would leave a payable link the product
 * believes is dead, or worse, a dead one it believes is payable. Past the
 * deadline this returns `00:00` rather than a negative figure, so the seconds
 * between the deadline and the sweep never render as time that still exists
 * (T-06-114).
 */
export function formatCountdown(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  const minutes = Math.floor(clamped / MS_PER_MINUTE);
  const seconds = Math.floor((clamped % MS_PER_MINUTE) / MS_PER_SECOND);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ─── The state machine (D-09, D-10, D-11) ───────────────────────────────────

export type PaymentSheetPhase =
  | 'selectMethod'
  | 'processing'
  | 'awaitingPayment'
  | 'success'
  | 'failure'
  | 'expired';

export interface PaymentSheetPhaseInput {
  /** A collection request is in flight. */
  isSubmitting: boolean;
  /** The live payment link, or null when none has been issued. */
  link: PaymentLinkLike | null;
  /** The on-screen countdown reached zero. Display state, not server truth. */
  linkExpired: boolean;
  /** The gateway's own reason, passed through unedited. */
  failureReason: string | null;
  /** A cash-only collection returned successfully. */
  cashSettled: boolean;
  /**
   * `invoice.amountPaidPaise` at the moment the link was issued.
   *
   * The baseline is taken at link time and not at sheet open, because D-10's
   * split records the cash leg first: an invoice that is already
   * `PARTIALLY_PAID` when the QR appears would otherwise read as settled the
   * instant the sheet consulted the status.
   */
  amountPaidPaiseAtLink: number | null;
  /** `invoice.amountPaidPaise` from the detail query, as last refetched. */
  amountPaidPaise: number;
}

/**
 * Whether money arrived since the link was issued.
 *
 * A strict increase in the invoice's captured total, not a status comparison.
 * `PARTIALLY_PAID → PARTIALLY_PAID` is the ordinary outcome of a second partial
 * capture and would be invisible to a status check, while `UNPAID → PAID` is
 * only one of several settling paths. The captured total moves exactly when the
 * clinic has more money than it did, which is the question the sheet is asking.
 */
export function hasPaymentLanded(
  amountPaidPaiseAtLink: number,
  amountPaidPaise: number,
): boolean {
  return amountPaidPaise > amountPaidPaiseAtLink;
}

/**
 * The sheet's current state, derived rather than stored.
 *
 * ## There is no polling here, and none in the component
 *
 * The `awaitingPayment → success` edge is driven by `amountPaidPaise` changing,
 * and that value changes because `useInvoiceSocket` invalidates the
 * `['invoices']` namespace when the server emits `invoice:updated` after the
 * Razorpay webhook lands. The sheet subscribes to nothing and schedules
 * nothing. A timer that re-asked the server on a fixed cadence would reintroduce
 * the stale-status window at its source: for up to one period the screen would
 * show `UNPAID` on an invoice the clinic has already been paid for, which is
 * precisely the interval in which someone asks the owner to pay again
 * (T-06-113).
 *
 * ## Precedence
 *
 * Money landing outranks everything, including an expiry that fired in the same
 * tick — the countdown and the webhook can cross, and of the two possible
 * mistakes, "we told you it expired after you paid" is the one that produces a
 * double collection.
 */
export function paymentSheetPhase(input: PaymentSheetPhaseInput): PaymentSheetPhase {
  const landed =
    input.amountPaidPaiseAtLink !== null &&
    hasPaymentLanded(input.amountPaidPaiseAtLink, input.amountPaidPaise);

  if (input.cashSettled || landed) return 'success';
  if (input.failureReason !== null) return 'failure';
  if (input.linkExpired) return 'expired';
  if (input.link !== null) return 'awaitingPayment';
  if (input.isSubmitting) return 'processing';

  return 'selectMethod';
}

// ─── Request bodies ─────────────────────────────────────────────────────────
//
// Both builders run the assembled object through `parsePaymentInput`, i.e.
// `recordPaymentSchema` — the same schema object the Fastify handler parses. A
// leg sum that does not add up or a gateway leg under ₹1 therefore fails on the
// device carrying the server's own message, instead of after a round trip taken
// in front of a waiting owner. The server's parse remains the control; this one
// is a usability guarantee, bypassable by construction.

export interface SinglePaymentArgs {
  method: PaymentMethod;
  /** Integer paise (D-31). Rupee input is converted by `parseRupeesToPaise`. */
  amountPaise: number;
  reference?: string;
}

/**
 * A one-leg collection.
 *
 * The channel is derived from the method rather than accepted from the caller:
 * cash is settled by a staff member's attestation (`manual`), and UPI or card
 * chosen in this sheet always means a Razorpay Payment Link. Letting a caller
 * pass `channel` would make "record a card payment as captured, manually"
 * expressible from the phone, which is a claim only the gateway can make.
 */
export function buildSinglePaymentInput(args: SinglePaymentArgs): RecordPaymentInput {
  return parsePaymentInput({
    mode: 'single',
    method: args.method,
    channel: args.method === 'cash' ? 'manual' : 'razorpay',
    amountPaise: args.amountPaise,
    ...(args.reference ? { reference: args.reference } : {}),
  });
}

export interface SplitPaymentArgs {
  /** The invoice balance being settled, in integer paise. */
  totalPaise: number;
  cashAmountPaise: number;
  digitalMethod: 'upi' | 'card';
  /**
   * Normally omitted: the digital leg is the remainder, so the two legs cannot
   * disagree with the total by construction. It is accepted only so a caller
   * that computed its own figure is caught by the shared schema rather than
   * silently overridden.
   */
  digitalAmountPaise?: number;
  reference?: string;
}

/**
 * The digital remainder of a split.
 *
 * This is the one subtraction the collection surface performs, and it is a
 * proposal rather than a computed total: the server bounds both legs by the
 * invoice's own balance under a row lock, and `recordPaymentSchema`'s
 * `superRefine` re-checks the sum on both sides of the wire. Nothing here
 * derives a subtotal, a tax head or a grand total — those remain server-only
 * (T-06-103).
 */
export function splitRemainingPaise(totalPaise: number, cashAmountPaise: number): number {
  return totalPaise - cashAmountPaise;
}

export function buildSplitPaymentInput(args: SplitPaymentArgs): RecordPaymentInput {
  const digitalAmountPaise =
    args.digitalAmountPaise ?? splitRemainingPaise(args.totalPaise, args.cashAmountPaise);

  return parsePaymentInput({
    mode: 'split',
    totalPaise: args.totalPaise,
    cashAmountPaise: args.cashAmountPaise,
    digitalAmountPaise,
    digitalMethod: args.digitalMethod,
    digitalChannel: 'razorpay',
    ...(args.reference ? { reference: args.reference } : {}),
  });
}

/** Re-exported so the sheet can name the gateway floor in an inline error. */
export { RAZORPAY_MIN_AMOUNT_PAISE };
