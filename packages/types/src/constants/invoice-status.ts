/**
 * Invoice lifecycle state machine (D-20, D-21).
 *
 * This table lives in `@breeyo/types`, not in the API's billing module, for the
 * same reason `queue-status.ts` does: the server enforces it on every status
 * change and the mobile InvoiceDetail action bar gates its Pay / Void / Refund /
 * Credit Note buttons off it. Two copies would drift, and the UI would start
 * offering actions the server answers with a 409.
 *
 * ## The seven states
 *
 * - `DRAFT` — editable, unnumbered, no stock deducted. The only editable state.
 * - `FINALIZED` — **transient.** The finalize transaction assigns the invoice
 *   number, freezes the GST snapshot and deducts stock, all in one transaction;
 *   the payment reducer then immediately resolves it to `UNPAID`,
 *   `PARTIALLY_PAID` or `PAID` from the sum of payment rows. An invoice sitting
 *   in `FINALIZED` for any length of time means the reducer did not run.
 *   D-46: `FINALIZED` and `UNPAID` are deliberately distinct and must be
 *   labelled and coloured differently in the UI.
 * - `UNPAID` / `PARTIALLY_PAID` / `PAID` — derived from `Σ captured payments`
 *   against `grandTotal`. Never set independently of the payment rows; a stored
 *   total that can disagree with its rows is the classic billing bug.
 * - `OVERDUE` — written **only** by the nightly cron, from
 *   `dueDate < today AND balance > 0` (D-23). Nothing in a request path writes it.
 * - `VOIDED` — terminal (D-21). Corrections after finalize are a credit note
 *   (D-22) or a void-and-reissue, never an edit.
 *
 * ## Why some transitions are absent
 *
 * - `PAID` is terminal. Refunds (D-12/D-42) and credit notes (D-22) are
 *   *separate records*; they reduce the balance by reference and do **not**
 *   move the invoice out of `PAID`.
 * - `VOIDED` is terminal, including `VOIDED → PAID`. D-35: if a payment lands
 *   on an already-voided invoice (late webhook, race with link cancellation)
 *   the payment row is recorded but the invoice is **not** reopened — it is
 *   flagged via `exceptionFlag` for manual staff resolution instead.
 * - `PARTIALLY_PAID → UNPAID` is absent. D-37: when a split payment's digital
 *   leg times out after the cash leg was collected, the invoice stays
 *   `PARTIALLY_PAID` (the cash is real and retained); it must never fall back
 *   to fully `UNPAID`.
 * - `DRAFT → PAID` is absent: a draft carries no invoice number and no frozen
 *   tax, so it cannot be a record of account against which money is received.
 *
 * ## Idempotent re-application
 *
 * Razorpay documents both duplicate and out-of-order webhook delivery, so a
 * second `payment_link.paid` for an already-`PAID` invoice must be a no-op, not
 * a thrown 409 (06-RESEARCH webhook constraint 4). `isValidInvoiceTransition`
 * therefore returns `true` for `from === to` on the four payment-derived states
 * and `false` on `DRAFT` and `FINALIZED`, where re-entry is a real state change
 * (re-finalizing would burn a second invoice number).
 */

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  FINALIZED: 'FINALIZED',
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOIDED: 'VOIDED',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'DRAFT',
  'FINALIZED',
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOIDED',
] as const;

/**
 * The authoritative D-20 transition table. Anything not listed here throws.
 * `DRAFT` may also be *deleted* outright, which is a row removal rather than a
 * transition and so has no entry.
 */
export const INVOICE_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ['FINALIZED'],
  FINALIZED: ['UNPAID', 'VOIDED'],
  UNPAID: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOIDED'],
  PAID: [],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOIDED'],
  VOIDED: [],
} as const;

/**
 * States for which re-applying the same status is an accepted no-op rather than
 * an error. See the "Idempotent re-application" note above.
 */
const IDEMPOTENT_STATUSES: readonly InvoiceStatus[] = [
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
] as const;

export function isValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return IDEMPOTENT_STATUSES.includes(from);
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Human labels for the seven states. `FINALIZED` and `UNPAID` are worded so
 * staff can tell them apart at a glance (D-46).
 */
export const INVOICE_STATUS_LABELS: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOIDED: 'Voided',
} as const;

/**
 * Billing exception flags (D-35, D-36).
 *
 * An exception is **orthogonal to `status`** — it is a separate nullable column
 * on `invoices`, not an eighth state — precisely so that a flagged invoice keeps
 * its real lifecycle status while staff resolve the money question. A non-null
 * flag blocks every further status-changing action until it is cleared.
 *
 * - `payment_after_void` — D-35: money arrived for an invoice that was already
 *   voided. The payment row exists; the invoice stays `VOIDED`; staff must
 *   refund manually.
 * - `overpayment` — D-36: `Σ captured payments > grandTotal`, e.g. cash marked
 *   paid while a digital payment for the same invoice also lands. `balancePaise`
 *   is deliberately allowed to go negative (plan 06-03) so this is
 *   representable and therefore detectable. No automatic refund is issued.
 */
export const BILLING_EXCEPTION_FLAGS = {
  PAYMENT_AFTER_VOID: 'payment_after_void',
  OVERPAYMENT: 'overpayment',
} as const;

export type BillingExceptionFlag =
  (typeof BILLING_EXCEPTION_FLAGS)[keyof typeof BILLING_EXCEPTION_FLAGS];

export const BILLING_EXCEPTION_FLAG_VALUES: readonly BillingExceptionFlag[] = [
  'payment_after_void',
  'overpayment',
] as const;

/**
 * D-35 / D-36 gate. Returns true when an invoice carries an unresolved billing
 * exception, in which case every status-changing action is blocked regardless
 * of what `isValidInvoiceTransition` says. Callers must check both.
 */
export function isInvoiceActionBlocked(exceptionFlag: string | null | undefined): boolean {
  return exceptionFlag !== null && exceptionFlag !== undefined && exceptionFlag !== '';
}

// ─── Payment, refund and provenance literals ────────────────────────────────
//
// Every literal below is copied verbatim from the column comments plan 06-03
// wrote into `apps/api/prisma/schema.prisma`. They are the persisted values, not
// display values — do not "tidy" the casing.

/** `payments.method` — cash | upi | card (D-10). */
export const PAYMENT_METHODS = ['cash', 'upi', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `payments.channel` — manual (staff recorded it) | razorpay (gateway). */
export const PAYMENT_CHANNELS = ['manual', 'razorpay'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

/** `payments.status`. */
export const PAYMENT_STATUSES = ['pending', 'captured', 'failed', 'expired', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** `refunds.status`. */
export const REFUND_STATUSES = ['pending', 'processed', 'failed'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/**
 * `refunds.method` (D-12, D-42). A split payment is refunded per leg — the
 * digital portion through the Razorpay Refund API, the cash portion as a manual
 * adjustment — so a refund names the method it actually reverses.
 */
export const REFUND_METHODS = ['razorpay', 'cash'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** `invoices.source` — how the invoice came into being (D-03, D-04). */
export const INVOICE_SOURCES = ['consultation', 'manual', 'quick_sale'] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];

/**
 * `invoice_line_items.line_type`. A `product` line has stock provenance and may
 * require a FIFO deduction at finalize; a `service` line never does.
 */
export const INVOICE_LINE_TYPES = ['service', 'product'] as const;
export type InvoiceLineType = (typeof INVOICE_LINE_TYPES)[number];

/** `discount_type` on both `invoices` and `invoice_line_items` (D-07). */
export const DISCOUNT_TYPES = ['percent', 'flat'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** `invoice_number_counters.doc_type` (D-15, D-19). */
export const DOCUMENT_NUMBER_TYPES = ['INV', 'CN'] as const;
export type DocumentNumberType = (typeof DOCUMENT_NUMBER_TYPES)[number];

/**
 * Razorpay's INR minimum for a Payment Link is 100 paise (₹1). A leg destined
 * for the gateway below this is rejected by the API, so the shared validators
 * reject it first.
 */
export const RAZORPAY_MIN_AMOUNT_PAISE = 100;

/**
 * D-11: a pending digital payment expires after 15 minutes and the invoice
 * reverts (to `UNPAID`, or to `PARTIALLY_PAID` when a cash leg was already
 * collected — D-37). The server owns this deadline; the Razorpay `expire_by`
 * sent on the link is deliberately a minute longer, because Razorpay rejects an
 * `expire_by` that is under 15 minutes away by the time the request lands.
 */
export const PAYMENT_LINK_TIMEOUT_MINUTES = 15;
export const RAZORPAY_EXPIRE_BY_BUFFER_MINUTES = 16;
