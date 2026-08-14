import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { CreditNote, Invoice, InvoiceDetail, PaymentMethod, Refund } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import {
  BILLING_PAYMENT_ENDPOINTS,
  invoiceDetailQueryKey,
  parseCreditNoteInput,
  parsePaymentInput,
  parseRefundInput,
  parseVoidInput,
  type MarkPaidInput,
} from '../lib/payment-mutations';
import { INVOICES_QUERY_KEY } from './useInvoices';
import { BILLING_DASHBOARD_QUERY_KEY } from './useBillingDashboard';

/**
 * The single write surface for an invoice's money state (BIL-03, BIL-05, BIL-06).
 *
 * ## Invalidation is the whole point of this module
 *
 * Three surfaces render an invoice balance: the detail screen, the Billing
 * tab's list, and the dashboard's "Unpaid Total" / "Today's Revenue" cards.
 * Every mutation below invalidates all three, listed at the call site rather
 * than left to a prefix, because a payment that leaves any one of them showing
 * the old figure is how the same invoice gets collected a second time
 * (T-06-113). The dashboard in particular is an aggregate that nothing else
 * touches.
 *
 * ## Errors are passed through unchanged
 *
 * Not one `mutationFn` here catches an `ApiClientError`. Plan 06-22's payment,
 * refund and credit-note sheets branch on `.code` — `INSUFFICIENT_STOCK`,
 * `REFUND_EXCEEDS_PAID`, `INVALID_STATE_TRANSITION`,
 * `BILLING_EXCEPTION_UNRESOLVED` — and read the per-item breakdown out of
 * `.details`. Flattening either into a string here would force those sheets
 * back to parsing prose, which is how a copy change on the server becomes a
 * broken branch on the phone.
 *
 * ## Request bodies are parsed before they are sent
 *
 * With the same schema objects the Fastify handlers parse, via
 * `lib/payment-mutations.ts`. The server's parse is the control; this one exists
 * so a body the server would 400 fails on the device with the identical message
 * instead of after a round trip taken in front of a waiting owner.
 */

// ─── Response shapes ────────────────────────────────────────────────────────
//
// Mirrored from the shipped services rather than imported: `payment.service.ts`
// and `refund.service.ts` import `@prisma/client`, so their result interfaces
// cannot cross into the mobile bundle. Each is the exact `{ data }` payload the
// controller sends.

/** `payment.service.ts#PaymentLinkResult` — the four fields the QR sheet renders. */
export interface PaymentLinkResult {
  paymentLinkId: string;
  shortUrl: string;
  expiresAt: string;
  amountPaise: number;
}

/** The cash branch of `POST /payments`: a receipt was issued immediately (D-13). */
export interface CashPaymentResult {
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  invoice: InvoiceDetail;
}

/** The D-10 split branch: a settled cash leg plus a pending gateway leg. */
export interface SplitPaymentResult extends CashPaymentResult {
  paymentLink: PaymentLinkResult;
}

/**
 * `POST /payments` returns one of three shapes depending on what was collected.
 * Discriminate structurally — `'paymentLink' in result`, `'shortUrl' in result`
 * — rather than by re-reading the request; the sheet already knows what it sent
 * but the union keeps the three cases visible to the type checker.
 */
export type RecordPaymentResult = CashPaymentResult | SplitPaymentResult | PaymentLinkResult;

/** `POST /void` — D-26/D-34 restoration count and D-35 link cancellations. */
export interface VoidInvoiceResult {
  invoice: Invoice;
  restoredMovementCount: number;
  cancelledPaymentLinkIds: string[];
}

/** `POST /refunds` — one entry per leg reversed (D-42). */
export interface CreateRefundResult {
  refunds: Refund[];
  totalRefundedPaise: number;
  invoice: InvoiceDetail;
}

interface ApiResponse<T> {
  data: T;
}

// ─── Invalidation ───────────────────────────────────────────────────────────

/**
 * The two collection surfaces every money write moves. Both are clinic-scoped
 * one level down, so invalidating the prefix reaches whichever clinic is active
 * without this module having to know which.
 *
 * The per-invoice detail key is invalidated separately at each call site,
 * because it is the one key that depends on the mutation's own variables.
 */
function invalidateBalanceSurfaces(queryClient: QueryClient): void {
  // ['invoices']
  queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
  // ['billing', 'dashboard'] — the aggregate cards, which nothing else moves.
  queryClient.invalidateQueries({ queryKey: BILLING_DASHBOARD_QUERY_KEY });
}

// ─── The seven money-state writes ───────────────────────────────────────────

export interface UsePaymentMutationsResult {
  recordPayment: ReturnType<typeof useRecordPayment>;
  retryPaymentLink: ReturnType<typeof useRetryPaymentLink>;
  markUnpaid: ReturnType<typeof useMarkUnpaid>;
  markPaid: ReturnType<typeof useMarkPaid>;
  voidInvoice: ReturnType<typeof useVoidInvoiceMutation>;
  createRefund: ReturnType<typeof useCreateRefund>;
  issueCreditNote: ReturnType<typeof useIssueCreditNote>;
}

/**
 * Every money-state write, bound to one invoice.
 *
 * Bundled rather than imported individually so that a screen cannot pick up
 * five of the seven and quietly lose the sixth's invalidation. Mutations are
 * inert until called, so subscribing to all seven costs nothing.
 */
export function usePaymentMutations(invoiceId: string): UsePaymentMutationsResult {
  return {
    recordPayment: useRecordPayment(invoiceId),
    retryPaymentLink: useRetryPaymentLink(invoiceId),
    markUnpaid: useMarkUnpaid(invoiceId),
    markPaid: useMarkPaid(invoiceId),
    voidInvoice: useVoidInvoiceMutation(invoiceId),
    createRefund: useCreateRefund(invoiceId),
    issueCreditNote: useIssueCreditNote(invoiceId),
  };
}

/**
 * `POST /billing/invoices/:invoiceId/payments` — D-10 collection.
 *
 * Takes a `recordPaymentSchema` body: a single cash/UPI/card leg, or a split.
 * The client proposes an amount and never a balance, a total or a status; the
 * server bounds the amount by the invoice's own balance under a row lock.
 */
export function useRecordPayment(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parsePaymentInput(input);
      return apiClient<ApiResponse<RecordPaymentResult>>(
        BILLING_PAYMENT_ENDPOINTS.recordPayment(invoiceId),
        { method: 'POST', token: accessToken!, body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/payments/retry` — D-11 retry.
 *
 * The server cancels the old link at the gateway before issuing a new one, so
 * two payable links for one balance never coexist. Nothing is captured here;
 * the detail is still invalidated because the pending payment row it renders
 * changes.
 */
export function useRetryPaymentLink(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<ApiResponse<PaymentLinkResult>>(
        BILLING_PAYMENT_ENDPOINTS.retryPaymentLink(invoiceId),
        { method: 'POST', token: accessToken! },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/payments/mark-unpaid` — D-11's manual
 * fallback after a link fails or is abandoned.
 *
 * D-37: an invoice whose cash leg was already collected reverts to
 * `PARTIALLY_PAID`, never to fully `UNPAID`. The server owns that decision;
 * this is the button behind "Mark as Unpaid" on the failure card.
 */
export function useMarkUnpaid(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<ApiResponse<Invoice>>(BILLING_PAYMENT_ENDPOINTS.markUnpaid(invoiceId), {
        method: 'POST',
        token: accessToken!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/mark-paid` — manual attestation that money
 * arrived outside the gateway.
 *
 * Deliberately a different route from `POST /payments` with `channel: 'manual'`:
 * routing on `channel` would let a client record a digital payment as captured
 * on its own say-so. Attestation is separately gated and separately audited.
 */
export function useMarkPaid(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: MarkPaidInput) =>
      apiClient<ApiResponse<Invoice>>(BILLING_PAYMENT_ENDPOINTS.markPaid(invoiceId), {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/void` — D-21, D-26, D-34, D-35.
 *
 * Also invalidates `['inventory']`: a void reverses the stock movements of
 * billing-time lines, so an item that was deducted comes back and the Inventory
 * tab's figure — which D-45's out-of-stock grey-out reads — is stale until it
 * refetches.
 */
export function useVoidInvoiceMutation(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parseVoidInput(input);
      return apiClient<ApiResponse<VoidInvoiceResult>>(
        BILLING_PAYMENT_ENDPOINTS.voidInvoice(invoiceId),
        { method: 'POST', token: accessToken!, body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/refunds` — D-12, D-42.
 *
 * The body's optional `paymentId` names the leg being reversed, which is what
 * makes a cash-only or digital-only refund of a split payment expressible. The
 * server re-checks `Σ refunds ≤ Σ payments` under a row lock and answers
 * `REFUND_EXCEEDS_PAID` if the refundable balance moved since the form loaded.
 */
export function useCreateRefund(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parseRefundInput(input);
      return apiClient<ApiResponse<CreateRefundResult>>(
        BILLING_PAYMENT_ENDPOINTS.createRefund(invoiceId),
        { method: 'POST', token: accessToken!, body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

/**
 * `POST /billing/invoices/:invoiceId/credit-notes` — D-19, D-22.
 *
 * A credit note reduces the invoice's balance by reference; it does not move
 * the invoice out of `PAID`. D-43 attributes it to the month it is issued in,
 * so the dashboard's revenue card moves and must be invalidated with the rest.
 */
export function useIssueCreditNote(invoiceId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parseCreditNoteInput(input);
      return apiClient<ApiResponse<CreditNote>>(
        BILLING_PAYMENT_ENDPOINTS.issueCreditNote(invoiceId),
        { method: 'POST', token: accessToken!, body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceDetailQueryKey(invoiceId) });
      invalidateBalanceSurfaces(queryClient);
    },
  });
}

export type { MarkPaidInput, PaymentMethod };
