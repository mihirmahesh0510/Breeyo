import { useQuery } from '@tanstack/react-query';
import type { InvoiceListItem } from '@breeyo/types';
// The filter and sort literals are IMPORTED, never retyped. `invoiceListQuerySchema`
// is the exact schema the server parses `GET /billing/invoices` with, so running
// the client's filters through it here makes a client-side value the server
// would reject unrepresentable rather than merely unlikely.
import { invoiceListQuerySchema, type InvoiceListQueryInput } from '@breeyo/validators';
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

export type InvoiceFilters = Partial<InvoiceListQueryInput>;

/** Shared by every clinic-scoped invoice query key. */
export const INVOICES_QUERY_KEY = ['invoices'] as const;

/**
 * Serialises filters into a query string using only values the shared schema
 * accepts. Undefined optional fields are omitted rather than sent as the string
 * `"undefined"`, which the server's `z.string().uuid()` would reject with a 400.
 */
export function buildInvoiceListQueryString(filters: InvoiceFilters): string {
  // Throws on a value outside the shared literal unions, and fills in the
  // server's own defaults (`status: 'all'`, `sort: 'newest'`, `limit: 20`) so
  // the query key and the request agree on what was actually asked for.
  const parsed = invoiceListQuerySchema.parse(filters);

  const params = new URLSearchParams();
  params.set('status', parsed.status);
  params.set('sort', parsed.sort);
  params.set('limit', String(parsed.limit));
  if (parsed.search) params.set('search', parsed.search);
  if (parsed.from) params.set('from', parsed.from);
  if (parsed.to) params.set('to', parsed.to);
  if (parsed.petId) params.set('petId', parsed.petId);
  if (parsed.cursor) params.set('cursor', parsed.cursor);

  return params.toString();
}

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
export function useInvoices(filters: InvoiceFilters = {}) {
  const { accessToken, activeClinicId } = useAuth();

  const queryString = buildInvoiceListQueryString(filters);

  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, activeClinicId, queryString],
    queryFn: () =>
      apiClient<InvoiceListResponse>(`/api/v1/billing/invoices?${queryString}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}
