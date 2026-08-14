/**
 * The refund sheet's copy contract and its bounds (BIL-03 — D-12, D-42).
 *
 * ## The client bound is a courtesy; the server bound is the control
 *
 * `makeRefundInputSchema(bound)` is the same factory `refund.service.ts` calls
 * inside its row-locked transaction. Building the client validator from it
 * means the phone and the server compute the limit the same way and say the
 * same thing when it is exceeded — but the phone's copy is `refundablePaise`
 * read a moment ago, and another device may have refunded against the same
 * legs since. When that happens the server answers `REFUND_EXCEEDS_PAID` and
 * {@link refundFailureMessage} renders it as the spec's failure line rather
 * than as a crash (T-06-111).
 *
 * ## Refunds are per leg (D-42)
 *
 * A split invoice was settled with two instruments and can be reversed against
 * either independently: only the cash portion, only the digital portion, or
 * both. So the bound is the *selected leg's* remaining balance, not the
 * invoice's — a ₹500 refund can be inside the invoice total and outside the
 * ₹400 cash leg it was aimed at.
 *
 * Copy lives here rather than in the `.tsx` because `apps/mobile` cannot render
 * a React Native component under test. Nothing here converts paise to rupees or
 * performs money arithmetic beyond selecting an already-computed bound.
 */

import { makeRefundInputSchema, type RefundInput } from '@breeyo/validators';
import { formatPaiseINR } from './format';

// ─── Copy ───────────────────────────────────────────────────────────────────

export const REFUND_COPY = {
  sheetTitle: 'Process Refund',
  fullRefund: 'Full Refund',
  partialRefund: 'Partial Refund',
  fullAmount: (paise: number) => `Refund Amount: ${formatPaiseINR(paise)}`,
  partialAmountLabel: 'Refund Amount (₹)',
  maximum: (paise: number) => `Maximum: ${formatPaiseINR(paise)}`,
  originalPayment: (paise: number, method: string) =>
    `Original: ${formatPaiseINR(paise)} via ${method}`,

  digitalNote: 'Digital refunds processed via Razorpay (2-5 business days)',
  cashNote: 'Cash refund recorded as manual adjustment',
  splitDigital: (paise: number) => `Digital: ${formatPaiseINR(paise)} via Razorpay`,
  splitCash: (paise: number) => `Cash: ${formatPaiseINR(paise)} refunded manually`,

  confirmButton: 'Process Refund',
  cancelButton: 'Cancel',
  successToast: (paise: number) => `Refund of ${formatPaiseINR(paise)} processed`,

  // 06-UI-SPEC "Destructive Actions", the two refund rows, verbatim.
  digitalConfirmTitle: 'Process refund?',
  digitalConfirmBody: (paise: number) =>
    `${formatPaiseINR(paise)} will be refunded to the original payment method via Razorpay. This typically takes 2-5 business days.`,
  digitalConfirmAction: 'Process Refund',
  cashConfirmTitle: 'Record cash refund?',
  cashConfirmBody: (paise: number) =>
    `${formatPaiseINR(paise)} cash refund will be recorded. Please hand the cash to the owner.`,
  cashConfirmAction: 'Record Refund',

  /**
   * Addition, D-42: 06-UI-SPEC's refund flow assumes one payment. A split has
   * two, and the sheet has to ask which is being reversed before it can bound
   * anything.
   */
  legPickerLabel: 'Which payment is being refunded?',
  wholeInvoiceLeg: 'The whole invoice',
  /** Addition: the empty case, which 06-UI-SPEC does not cover. */
  nothingRefundable: 'Nothing on this invoice is refundable',
} as const;

// ─── The server's summary shape ─────────────────────────────────────────────

/** Mirrors `refund.service.ts#RefundableLeg` — one captured payment. */
export interface RefundableLeg {
  paymentId: string;
  method: string;
  channel: string;
  capturedPaise: number;
  refundedPaise: number;
  refundablePaise: number;
}

/** `GET /billing/invoices/:invoiceId/refundable`. Advisory, per its own docs. */
export interface RefundableSummary {
  refundablePaise: number;
  legs: RefundableLeg[];
}

/**
 * Whether a leg settled through the gateway.
 *
 * The channel decides, not the method: a card payment a staff member ticked by
 * hand is a manual record with no Razorpay transaction behind it, so it can
 * only be reversed as a cash adjustment. Getting this wrong would promise an
 * owner a 2-5 day bank credit that nothing was ever going to send.
 */
export function isDigitalLeg(leg: RefundableLeg): boolean {
  return leg.channel === 'razorpay';
}

/**
 * The maximum this refund may be, given which leg it is aimed at.
 *
 * A null `paymentId` means a whole-invoice adjustment, which the shared schema
 * permits and which the server spreads across the legs itself; its bound is the
 * summary total.
 */
export function refundBoundFor(
  summary: RefundableSummary,
  paymentId: string | null,
): number {
  if (paymentId === null) return summary.refundablePaise;

  const leg = summary.legs.find((candidate) => candidate.paymentId === paymentId);
  return leg ? leg.refundablePaise : 0;
}

export function findLeg(
  summary: RefundableSummary,
  paymentId: string | null,
): RefundableLeg | null {
  if (paymentId === null) return null;
  return summary.legs.find((candidate) => candidate.paymentId === paymentId) ?? null;
}

/**
 * The `RefundSplitDisplay` rows, or null when there is nothing to disambiguate.
 *
 * Rendered only when the invoice actually carries both a gateway leg and a cash
 * leg — showing a "Digital / Cash" breakdown for a single-instrument payment
 * would invent a distinction the transaction never had.
 */
export function splitDisplayRows(summary: RefundableSummary): string[] | null {
  const digital = summary.legs.filter(isDigitalLeg);
  const cash = summary.legs.filter((leg) => !isDigitalLeg(leg));

  if (digital.length === 0 || cash.length === 0) return null;

  return [
    ...digital.map((leg) => REFUND_COPY.splitDigital(leg.refundablePaise)),
    ...cash.map((leg) => REFUND_COPY.splitCash(leg.refundablePaise)),
  ];
}

// ─── The request body ───────────────────────────────────────────────────────

export interface RefundInputArgs {
  type: 'full' | 'partial';
  /** Integer paise. Rupee input is converted by `parseRupeesToPaise` first. */
  amountPaise: number;
  paymentId: string | null;
  summary: RefundableSummary;
  reason?: string;
}

/**
 * Builds and validates the refund body against the leg's own bound.
 *
 * The refund `method` is derived from the leg rather than accepted: it is a
 * statement about how the money physically goes back, and only the payment it
 * reverses can answer that. A whole-invoice adjustment with no leg named
 * carries no method at all, leaving the server to decide per leg.
 */
export function buildRefundInput(args: RefundInputArgs): RefundInput {
  const bound = refundBoundFor(args.summary, args.paymentId);
  const leg = findLeg(args.summary, args.paymentId);

  const candidate: Record<string, unknown> = {
    type: args.type,
    amountPaise: args.amountPaise,
  };

  if (args.paymentId !== null) candidate.paymentId = args.paymentId;
  if (leg) candidate.method = isDigitalLeg(leg) ? 'razorpay' : 'cash';
  if (args.reason && args.reason.trim() !== '') candidate.reason = args.reason.trim();

  const result = makeRefundInputSchema(bound).safeParse(candidate);
  if (!result.success) {
    throw new Error(
      result.error.errors.map((issue) => issue.message).join(', ') || 'Invalid refund',
    );
  }

  return result.data;
}

// ─── Confirmation and failure ───────────────────────────────────────────────

export interface RefundConfirmCopy {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * 06-UI-SPEC's "Destructive Actions" rows, picked by instrument.
 *
 * The two bodies say materially different things — one promises a bank credit
 * in 2-5 days, the other instructs the staff member to physically hand over
 * cash — so the wrong one is not a cosmetic error. It is the difference between
 * an owner leaving with their money and an owner leaving expecting it.
 */
export function refundConfirmCopy(isDigital: boolean, amountPaise: number): RefundConfirmCopy {
  return isDigital
    ? {
        title: REFUND_COPY.digitalConfirmTitle,
        body: REFUND_COPY.digitalConfirmBody(amountPaise),
        confirmLabel: REFUND_COPY.digitalConfirmAction,
        cancelLabel: REFUND_COPY.cancelButton,
      }
    : {
        title: REFUND_COPY.cashConfirmTitle,
        body: REFUND_COPY.cashConfirmBody(amountPaise),
        confirmLabel: REFUND_COPY.cashConfirmAction,
        cancelLabel: REFUND_COPY.cancelButton,
      };
}

/**
 * 06-UI-SPEC's `Refund failed: [reason]. Please try again.`
 *
 * The server's own message is passed through rather than replaced. A
 * `REFUND_EXCEEDS_PAID` raised here means another device refunded against the
 * same legs between this sheet loading its maximum and this request landing —
 * the server's text names the two figures, which is exactly what the person
 * holding the phone needs in order to decide what to do next.
 */
export function refundFailureMessage(error: unknown): string {
  const reason =
    error instanceof Error && error.message.trim() !== ''
      ? error.message
      : 'The refund could not be processed';

  return `Refund failed: ${reason}. Please try again.`;
}
