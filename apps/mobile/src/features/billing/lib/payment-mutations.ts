/**
 * The endpoint table, the cache-key set and the request-body parses that
 * `usePaymentMutations` is built from.
 *
 * ## Why this is not inside the hook file
 *
 * `hooks/usePaymentMutations.ts` imports `AuthProvider`, which transitively
 * imports `react-native`; vitest runs the `node` environment with no Metro
 * transform, so that module cannot be loaded under test at all. Everything a
 * test can meaningfully assert about the money-write layer — that the paths
 * match the shipped routes, that the invalidation set covers every surface
 * rendering a balance, that a malformed body is rejected before it leaves the
 * phone — therefore lives here, and the hook is a thin binding over it. This is
 * the same split `lib/invoice-query.ts` (plan 06-14) and `lib/builder-state.ts`
 * (plan 06-16) established.
 *
 * Nothing in this module computes money and nothing catches an `ApiClientError`.
 */

import {
  creditNoteSchema,
  recordPaymentSchema,
  refundInputSchema,
  voidInvoiceSchema,
  type CreditNoteInput,
  type RecordPaymentInput,
  type RefundInput,
  type VoidInvoiceInput,
} from '@breeyo/validators';
import type { PaymentMethod } from '@breeyo/types';

// ─── Endpoints ──────────────────────────────────────────────────────────────

const BILLING_BASE = '/api/v1/billing';

/** `GET /billing/invoices/:invoiceId` — the D-18 in-app invoice view. */
export const INVOICE_DETAIL_ENDPOINT = (invoiceId: string): string =>
  `${BILLING_BASE}/invoices/${invoiceId}`;

/**
 * Every money-state write the invoice detail screen can perform, plus the one
 * read (`refundable`) that exists so the refund form never derives a maximum of
 * its own.
 *
 * Note that `markUnpaid` is the **payment** module's route
 * (`/payments/mark-unpaid`, D-11's "the link timed out, put it back") and not
 * the invoice module's `/mark-unpaid` (which reverses a manual attestation).
 * The two are separately audited on the server and the detail screen's
 * "Mark as Unpaid" button after a failed link is the former.
 */
export const BILLING_PAYMENT_ENDPOINTS = {
  recordPayment: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/payments`,
  retryPaymentLink: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/payments/retry`,
  markUnpaid: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/payments/mark-unpaid`,
  markPaid: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/mark-paid`,
  voidInvoice: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/void`,
  createRefund: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/refunds`,
  issueCreditNote: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/credit-notes`,
  refundable: (invoiceId: string) => `${BILLING_BASE}/invoices/${invoiceId}/refundable`,
} as const;

// ─── Cache keys ─────────────────────────────────────────────────────────────

/**
 * The detail entry sits under the same `['invoices']` root as the list, so the
 * list's prefix invalidation reaches it too. Both are named explicitly at every
 * call site anyway — relying on the prefix alone would make the coupling
 * invisible and one refactor away from silently breaking.
 */
export function invoiceDetailQueryKey(invoiceId: string): readonly [string, string] {
  return ['invoices', invoiceId] as const;
}

/**
 * The three surfaces that render an invoice balance (T-06-113).
 *
 * A payment that lands while the front desk is looking at any of them and
 * leaves that one stale is how the same invoice gets collected twice. The
 * dashboard is in the list for exactly that reason: its "Unpaid Total" card is
 * an aggregate, so nothing else invalidates it.
 */
export function paymentMutationQueryKeys(invoiceId: string): readonly (readonly string[])[] {
  return [invoiceDetailQueryKey(invoiceId), ['invoices'], ['billing', 'dashboard']];
}

// ─── Request bodies ─────────────────────────────────────────────────────────

interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
}

/**
 * A raised `ZodError` inside a `mutationFn` surfaces as an unhandled rejection
 * with an opaque shape, so the issues are flattened into one `Error` whose
 * message is the same text the server's 400 would carry. Same helper shape as
 * `useInvoiceMutations.ts`'s.
 */
function parseOrThrow<T>(
  schema: { safeParse: (value: unknown) => ParseResult<T> },
  value: unknown,
  fallback: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = (result.error as { errors?: { message: string }[] })?.errors ?? [];
    throw new Error(issues.map((issue) => issue.message).join(', ') || fallback);
  }
  return result.data as T;
}

/**
 * The same object the Fastify handler parses, run first on the phone.
 *
 * This is a usability control, not a security one — the server's parse is
 * authoritative and this one is bypassable by construction. What it buys is
 * that a split whose legs do not sum, or a gateway leg under ₹1, fails on the
 * device with the identical message instead of after a round trip taken in
 * front of a waiting owner.
 */
export function parsePaymentInput(input: unknown): RecordPaymentInput {
  return parseOrThrow(recordPaymentSchema, input, 'Invalid payment');
}

/**
 * D-26's stock-restoration choice, as the shared schema actually defines it.
 *
 * `voidInvoiceSchema` accepts `restoreStock: true` and nothing else, because
 * D-34 moved the decision of *which* movements reverse to the server: only
 * billing-time lines are restored, never a drug already administered to the
 * patient. An `false` therefore has no meaning the server can honour, and
 * rejecting it here is deliberate — silently coercing it to `true` would mean a
 * vet who unticked the box believed something the system did not do.
 */
export function parseVoidInput(input: unknown): VoidInvoiceInput {
  return parseOrThrow(voidInvoiceSchema, input, 'Invalid void request');
}

/**
 * D-42: `paymentId` names the specific leg being reversed, so a split can be
 * refunded cash-only, digital-only, or both. It passes through untouched.
 */
export function parseRefundInput(input: unknown): RefundInput {
  return parseOrThrow(refundInputSchema, input, 'Invalid refund');
}

export function parseCreditNoteInput(input: unknown): CreditNoteInput {
  return parseOrThrow(creditNoteSchema, input, 'Invalid credit note');
}

/**
 * `POST /billing/invoices/:invoiceId/mark-paid` — the manual attestation path.
 *
 * There is deliberately no runtime parse here, because there is no shared
 * schema to run: the server's `markPaidBodySchema` lives in
 * `apps/api/src/modules/billing/billing.schema.ts` and is not re-exported by
 * `@breeyo/validators`. Writing a second copy of it on the client is the exact
 * drift every other body in this module avoids, so this is a type-only contract
 * until the schema is promoted to the shared package (logged in
 * `deferred-items.md`).
 */
export interface MarkPaidInput {
  method: PaymentMethod;
  /** Omitted means "the whole outstanding balance", which the server resolves. */
  amountPaise?: number;
  /** Staff-entered UPI reference or card slip number. */
  reference?: string;
}
