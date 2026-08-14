import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { BILLING_PAYMENT_ENDPOINTS } from '../lib/payment-mutations';
import type { RefundableSummary } from '../lib/refund-form';

interface RefundableResponse {
  data: RefundableSummary;
}

/**
 * `GET /billing/invoices/:invoiceId/refundable` — what the refund sheet may
 * offer, in total and per leg (D-12, D-42).
 *
 * ## The figure is advisory and the sheet says so by design
 *
 * `refund.service.ts` documents this read as taken outside a transaction on
 * purpose: it is the number shown before the user has decided anything, and
 * `createRefund` recomputes it under a row lock. Between this response and that
 * write, another member of staff on another device may have refunded against
 * the same legs. So the client bound built from it (`makeRefundInputSchema`) is
 * a courtesy that spares a round trip, not a guarantee — the server's
 * `REFUND_EXCEEDS_PAID` remains reachable and is rendered as the UI-SPEC's
 * failure line rather than treated as a bug (T-06-111).
 *
 * ## Zero cache lifetime
 *
 * Unlike the detail query's 30 seconds, this is refetched on every mount. A
 * stale maximum is not a stale display — it is a bound the form would enforce
 * against money that has already gone.
 *
 * The key nests under the detail key, so every mutation that invalidates
 * `['invoices', invoiceId]` reaches this too.
 */
export function useRefundable(invoiceId: string, enabled = true) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['invoices', invoiceId, 'refundable'],
    queryFn: () =>
      apiClient<RefundableResponse>(BILLING_PAYMENT_ENDPOINTS.refundable(invoiceId), {
        token: accessToken!,
      }),
    enabled: enabled && !!accessToken && !!invoiceId,
    staleTime: 0,
    select: (response) => response.data,
  });
}

export type { RefundableSummary };
