import { useQuery } from '@tanstack/react-query';
import type { InvoiceListItem } from '@breeyo/types';
// The filter and sort literals reach this hook through `lib/invoice-query.ts`,
// which parses them with `invoiceListQuerySchema` from '@breeyo/validators' —
// the exact schema the server uses — so a client filter value the server would
// reject is unrepresentable rather than merely unlikely. The serialiser lives
// in `lib/` because this module imports `AuthProvider`, which transitively
// imports `react-native` and therefore cannot be loaded under test.
import { buildInvoiceListQueryString, type InvoiceFilters } from '../lib/invoice-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

// --- Response types ---

/**
 * `GET /api/v1/billing/invoices` — see `invoice.repository.ts#listInvoices`.
 * Dates arrive over the wire as ISO strings; `formatInvoiceDate` accepts both.
 */
export interface InvoiceListPage {
  items: InvoiceListItem[];
  nextCursor: string | null;
}

interface InvoiceListResponse {
  data: InvoiceListPage;
}

export type { InvoiceFilters };

/** Shared by every clinic-scoped invoice query key. */
export const INVOICES_QUERY_KEY = ['invoices'] as const;

/**
 * The Billing tab's invoice list (D-24).
 *
 * `activeClinicId` is in the query key for the same reason it is in
 * `useBillingDashboard`'s (T-06-92): a clinic switch must miss the cache, not
 * hit another tenant's invoices.
 *
 * The filters object is in the key too, so changing a chip or the sort order is
 * a distinct cache entry rather than a refetch that briefly renders the
 * previous filter's rows under the new chip.
 */
export interface UseInvoicesOptions {
  /**
   * Additional gate on top of the token/clinic guard.
   *
   * The dashboard's D-24 "Unpaid Total" selection needs two status filters at
   * once, which the server's filter vocabulary cannot express in one request.
   * The screen therefore calls this hook twice — unconditionally, as the rules
   * of hooks require — and switches the second call off through this flag
   * whenever the current selection is not composite.
   */
  enabled?: boolean;
}

export function useInvoices(filters: InvoiceFilters = {}, options: UseInvoicesOptions = {}) {
  const { accessToken, activeClinicId } = useAuth();
  const { enabled = true } = options;

  const queryString = buildInvoiceListQueryString(filters);

  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, activeClinicId, queryString],
    queryFn: () =>
      apiClient<InvoiceListResponse>(`/api/v1/billing/invoices?${queryString}`, {
        token: accessToken!,
      }),
    enabled: enabled && !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}
