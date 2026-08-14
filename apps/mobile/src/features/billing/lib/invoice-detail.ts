/**
 * The invoice detail layer's copy contract and its presentation decisions.
 *
 * Every string is quoted from `06-UI-SPEC.md`'s "Invoice Detail Screen" copy
 * table or its "Destructive Actions" void row, and every one is asserted by
 * `__tests__/invoice-detail.test.ts`. Copy lives in a module rather than in JSX
 * for the reason plans 06-14 and 06-16 established: `apps/mobile` cannot render
 * a React Native component under test, so a string inside a `.tsx` is a string
 * nothing can check.
 *
 * ## Two transliterations from the spec, matching 06-16
 *
 *  * `Rs` becomes `₹`, because `formatPaiseINR` — the feature's single money
 *    formatter — emits the rupee sign from `Intl` for `en-IN`.
 *  * `--` becomes `—`; the double hyphen is how the source markdown writes an
 *    em dash, and a literal `--` on screen reads as a typo.
 *
 * Nothing in this module performs a paise-to-rupee conversion of its own.
 */

import type { ClinicInvoiceHeader, CreditNote, Payment, Refund } from '@breeyo/types';
import { formatPaiseINR } from './format';

// ─── Copy ───────────────────────────────────────────────────────────────────

export const INVOICE_DETAIL_COPY = {
  /** "Invoice #[number]" — the screen title, used by plan 06-22. */
  screenTitle: (invoiceNumber: string | null) =>
    invoiceNumber ? `Invoice #${invoiceNumber}` : 'Draft Invoice',

  paymentHistoryHeader: 'Payment History',
  /**
   * Additions, not quotations: 06-UI-SPEC gives the payment history no empty
   * state. "No rows" has to be a statement rather than an absence, or a
   * rendering failure and a genuinely uncollected invoice look identical to the
   * person handling a dispute (T-06-138).
   */
  paymentHistoryEmptyTitle: 'No payments yet',
  paymentHistoryEmptyBody: 'Payments and refunds will appear here once money moves.',

  /** Addition: the spec lists the linked-note line but no section header. */
  creditNotesHeader: 'Credit Notes',

  voidedStamp: 'VOIDED',

  // 06-UI-SPEC "Destructive Actions" → "Void invoice", verbatim.
  voidConfirmTitle: 'Void this invoice?',
  voidRestoreStockCheckbox: 'Return dispensed items to stock?',
  voidConfirmButton: 'Void Invoice',
  cancelButton: 'Cancel',
  /**
   * Additions. The reason is mandatory on the wire (`voidInvoiceSchema` requires
   * a non-empty string) but the spec's sheet has no field for it, so the label
   * and placeholder are this plan's.
   */
  voidReasonLabel: 'Reason for voiding',
  voidReasonPlaceholder: 'Why is this invoice being voided?',
  /**
   * Addition, D-35: the server cancels any live Razorpay link inside the void
   * transaction. Staff who have just shown an owner a QR code need to know the
   * code stops working, or they will wait for a payment that can no longer land.
   */
  voidCancelsPaymentLinkNote: 'Any active payment link for this invoice will be cancelled.',
  /**
   * Addition, D-34: the checkbox is offered because D-26 promised the choice,
   * but the server restores only lines the invoice itself created. A drug
   * already given to the patient stays deducted whatever this box says, and
   * saying so here is cheaper than a vet discovering it during a stock take.
   */
  voidRestoreStockNote:
    'Items dispensed during a consultation stay deducted — they were already given to the patient.',
} as const;

// ─── Clinic header (D-14, T-06-137) ─────────────────────────────────────────

export interface ClinicHeaderRows {
  name: string;
  address: string;
  phone: string;
  /** `null` means render no GSTIN row at all — not an empty one. */
  gstin: string | null;
}

/**
 * The D-14 clinic block, with the GSTIN row suppressed for an unregistered
 * clinic (D-17, T-06-137).
 *
 * `gstEnabledSnapshot` comes from the **invoice**, not from the clinic. Most
 * solo vets sit below the ₹20L threshold and must not present a GSTIN at all;
 * one who registers later must not have last year's invoices retroactively
 * start claiming a registration they did not hold when those invoices were
 * raised. The invoice's frozen snapshot is the only field that answers that
 * correctly, which is why it is a separate argument rather than being read off
 * `clinic.gstEnabled`.
 */
export function clinicHeaderRows(
  clinic: ClinicInvoiceHeader,
  gstEnabledSnapshot: boolean,
): ClinicHeaderRows {
  const gstin = clinic.gstin?.trim();

  return {
    name: clinic.name,
    address: clinic.address,
    phone: clinic.contactPhone,
    gstin: gstEnabledSnapshot && gstin ? `GSTIN: ${gstin}` : null,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `14 Aug 2026`. Built by hand rather than through `toLocaleDateString` for the
 * reason `lib/format.ts` documents: Hermes ships a cut-down ICU and produces a
 * different string on device than it does under test.
 */
function formatLongDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `14 Aug 2026, 09:30` — the spec's `[DD MMM YYYY, HH:MM]`, device local time. */
function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatLongDate(date)}, ${hours}:${minutes}`;
}

// ─── Payment history (T-06-138) ─────────────────────────────────────────────

/**
 * 06-UI-SPEC's "Payment Method Icon Map", as a closed set of keys.
 *
 * The keys are semantic, not icon names: the MaterialCommunityIcons string and
 * its colour belong to `InvoicePaymentHistory.tsx`, which is where presentation
 * belongs, and this module stays free of anything a `node` test cannot assert.
 */
export type PaymentHistoryIcon = 'cash' | 'upi' | 'card' | 'razorpay' | 'refund';

export interface PaymentHistoryRow {
  id: string;
  kind: 'payment' | 'refund';
  icon: PaymentHistoryIcon;
  /** Already formatted. Negative for a refund. */
  amount: string;
  /** `DD MMM YYYY, HH:MM`. */
  timestamp: string;
  /** `Ref: [transaction_id]`, or null when the leg carries no reference. */
  reference: string | null;
  /** `Pending — expires in [N] min`, or null when the leg is not pending. */
  pending: string | null;
  /** A failed, expired or cancelled leg's caption, or null. */
  note: string | null;
  /** Epoch milliseconds, for stable ordering. Not rendered. */
  occurredAt: number;
}

/**
 * A gateway leg is a Razorpay row whatever instrument the owner chose.
 *
 * The channel is checked before the method because that is the distinction the
 * spec's icon map draws: `shield-check` means "settled through the gateway,
 * confirmed by webhook", which is a different assurance from a staff member
 * ticking "card" by hand.
 */
function paymentIcon(payment: Payment): PaymentHistoryIcon {
  if (payment.channel === 'razorpay') return 'razorpay';
  if (payment.method === 'upi') return 'upi';
  if (payment.method === 'card') return 'card';
  return 'cash';
}

const PAYMENT_STATUS_NOTES: Readonly<Record<string, string>> = {
  failed: 'Failed',
  expired: 'Payment link expired',
  cancelled: 'Cancelled',
};

function paymentNote(payment: Payment): string | null {
  const base = PAYMENT_STATUS_NOTES[payment.status];
  if (!base) return null;
  return payment.failureReason ? `${base} — ${payment.failureReason}` : base;
}

/**
 * D-11's 15-minute window, in whole minutes.
 *
 * Rounded up, so a link with 30 seconds left reads "1 min" rather than "0 min"
 * while it is still payable. Past the deadline it says so outright instead of
 * counting down through zero — the sweep that flips the row to `expired` runs
 * on the server, and the seconds between the deadline and that flip must not
 * render as an offer of time that no longer exists.
 */
function pendingCaption(payment: Payment, now: Date): string | null {
  if (payment.status !== 'pending') return null;

  const expiresAt = toDate(payment.expiresAt);
  if (!expiresAt) return 'Pending';

  const minutes = Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000);
  return minutes > 0 ? `Pending — expires in ${minutes} min` : 'Pending — expired';
}

const REFUND_STATUS_NOTES: Readonly<Record<string, string>> = {
  pending: 'Refund pending',
  failed: 'Refund failed',
};

function refundNote(entry: Refund): string | null {
  const base = REFUND_STATUS_NOTES[entry.status];
  if (!base) return null;
  return entry.failureReason ? `${base} — ${entry.failureReason}` : base;
}

/**
 * One row per payment and one per refund, newest first (T-06-138).
 *
 * ## Refunds render negative
 *
 * `Refund.amountPaise` is stored positive; it is negated here so the column
 * reads as a ledger and a reversal cannot be mistaken for a second collection
 * at a glance. `formatPaiseINR` documents and handles the negative case, and
 * the sign is the only arithmetic this module performs on a money value.
 *
 * ## Newest first
 *
 * Matching the Phase 3 visit timeline and the Billing tab's default sort. The
 * most recent movement is the one a person opening this screen is asking about.
 */
export function paymentHistoryRows(
  payments: readonly Payment[],
  refunds: readonly Refund[],
  now: Date = new Date(),
): PaymentHistoryRow[] {
  const paymentRows: PaymentHistoryRow[] = payments.map((payment) => {
    const occurredAt = toDate(payment.paidAt) ?? toDate(payment.createdAt) ?? now;

    return {
      id: payment.id,
      kind: 'payment',
      icon: paymentIcon(payment),
      amount: formatPaiseINR(payment.amountPaise),
      timestamp: formatDateTime(occurredAt),
      reference: payment.razorpayPaymentId ? `Ref: ${payment.razorpayPaymentId}` : null,
      pending: pendingCaption(payment, now),
      note: paymentNote(payment),
      occurredAt: occurredAt.getTime(),
    };
  });

  const refundRows: PaymentHistoryRow[] = refunds.map((entry) => {
    const occurredAt = toDate(entry.processedAt) ?? toDate(entry.createdAt) ?? now;

    return {
      id: entry.id,
      kind: 'refund',
      icon: 'refund',
      amount: formatPaiseINR(-entry.amountPaise),
      timestamp: formatDateTime(occurredAt),
      reference: entry.razorpayRefundId ? `Ref: ${entry.razorpayRefundId}` : null,
      pending: null,
      note: refundNote(entry),
      occurredAt: occurredAt.getTime(),
    };
  });

  return [...paymentRows, ...refundRows].sort((a, b) => b.occurredAt - a.occurredAt);
}

// ─── Linked credit notes (D-22) ─────────────────────────────────────────────

/**
 * `Credit Note: CN-[number] — ₹[amount]`.
 *
 * `creditNoteNumber` already carries its `CN-` prefix (D-19), so the spec's
 * `CN-[number]` placeholder is satisfied by the stored value alone.
 */
export function linkedCreditNoteLabel(creditNote: CreditNote): string {
  return `Credit Note: ${creditNote.creditNoteNumber} — ${formatPaiseINR(creditNote.totalPaise)}`;
}

// ─── Voided overlay (D-21) ──────────────────────────────────────────────────

export interface VoidedStampFields {
  stamp: string;
  /** `Voided on 14 Aug 2026`, or null when no timestamp was recorded. */
  date: string | null;
  /** `Reason: ...`, or null when no reason was recorded. */
  reason: string | null;
}

export function voidedStampFields(
  voidedAt: Date | string | null | undefined,
  voidReason: string | null | undefined,
): VoidedStampFields {
  const date = toDate(voidedAt);
  const reason = voidReason?.trim();

  return {
    stamp: INVOICE_DETAIL_COPY.voidedStamp,
    date: date ? `Voided on ${formatLongDate(date)}` : null,
    reason: reason ? `Reason: ${reason}` : null,
  };
}

// ─── Void confirmation (D-26, D-34, D-35) ───────────────────────────────────

export interface VoidConfirmCopy {
  title: string;
  body: string;
  checkboxLabel: string;
  checkboxNote: string;
  paymentLinkNote: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * 06-UI-SPEC's void confirmation, with the number and amount interpolated.
 *
 * A numberless invoice is a draft, which cannot reach this sheet — a draft is
 * deleted, not voided (`invoiceActionSet` withholds the button). The fallback
 * wording exists so the string is total rather than rendering `Invoice #null`
 * if a caller ever gets there.
 */
export function voidConfirmCopy(
  invoiceNumber: string | null,
  grandTotalPaise: number,
): VoidConfirmCopy {
  const subject = invoiceNumber ? `Invoice #${invoiceNumber}` : 'This invoice';

  return {
    title: INVOICE_DETAIL_COPY.voidConfirmTitle,
    body: `${subject} for ${formatPaiseINR(grandTotalPaise)} will be marked as void. This cannot be undone.`,
    checkboxLabel: INVOICE_DETAIL_COPY.voidRestoreStockCheckbox,
    checkboxNote: INVOICE_DETAIL_COPY.voidRestoreStockNote,
    paymentLinkNote: INVOICE_DETAIL_COPY.voidCancelsPaymentLinkNote,
    confirmLabel: INVOICE_DETAIL_COPY.voidConfirmButton,
    cancelLabel: INVOICE_DETAIL_COPY.cancelButton,
  };
}
