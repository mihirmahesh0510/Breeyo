import { useQuery } from '@tanstack/react-query';
import type { InvoiceDetail } from '@breeyo/types';
import { INVOICE_DETAIL_ENDPOINT, invoiceDetailQueryKey } from '../lib/payment-mutations';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

// --- Response types ---

/**
 * `GET /api/v1/billing/invoices/:invoiceId` — see `invoice.repository.ts`'s
 * `getInvoiceDetail`. Dates arrive over the wire as ISO strings; every consumer
 * in `lib/invoice-detail.ts` accepts both.
 */
interface InvoiceDetailResponse {
  data: InvoiceDetail;
}

/**
 * The D-18 full in-app invoice view.
 *
 * ## This query sets no polling timer, by design
 *
 * Freshness arrives through `useInvoiceSocket` (plan 06-14), which invalidates
 * the `['invoices']` namespace — this key included — on `invoice:updated` and
 * `payment:received`. A poll added here would be worse than redundant: it would
 * reintroduce the stale-status window at its source. A front desk watching an
 * invoice while a Razorpay webhook settles it would see the old status for up
 * to one poll period, which is precisely the interval in which someone asks the
 * owner to pay again (T-06-113). Pull-to-refresh is the fallback, not the
 * mechanism.
 *
 * A phase-level grep gate enforces the absence across `features/billing`, so
 * this note deliberately does not name the React Query option it is about — a
 * gate that trips on the comment explaining it is worse than no gate. The same
 * convention is used in `lib/format.ts`.
 *
 * ## The clinic id is not in the key
 *
 * Unlike `useInvoices` and `useBillingDashboard`, whose keys are collections
 * scoped to whichever clinic is active, this key is a single row addressed by a
 * UUID the server resolves under RLS. A clinic switch cannot make this entry
 * mean a different invoice; at worst the request 404s, which is the correct
 * outcome for an id that is not the active tenant's.
 */
export function useInvoice(invoiceId: string) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: invoiceDetailQueryKey(invoiceId),
    queryFn: () =>
      apiClient<InvoiceDetailResponse>(INVOICE_DETAIL_ENDPOINT(invoiceId), {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!invoiceId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

export type { InvoiceDetailResponse };
