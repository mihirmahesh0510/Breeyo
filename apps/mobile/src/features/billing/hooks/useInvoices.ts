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
import { canViewInvoices } from '../lib/pet-invoices';
import { canManagePayments } from '../lib/invoice-actions';

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

/**
 * D-25: one pet's invoices for the profile section.
 *
 * A hook of its own rather than `useInvoices({ petId })`, because the endpoint
 * is a different one — `GET /billing/pets/:petId/invoices`, which the server
 * answers newest-first with a fixed limit and no cursor. Routing it through the
 * list hook would mean synthesising a filter object for a query that takes no
 * filters, and would put a pet's section in the same cache entries as the
 * Billing tab, so a filter change on that tab would refetch every open profile.
 *
 * `activeClinicId` is in the key for the same reason it is in every other
 * billing query's (T-06-92): a clinic switch must miss the cache rather than
 * render another tenant's invoices under this pet.
 */
export function usePetInvoices(petId: string | undefined, options: UseInvoicesOptions = {}) {
  const { accessToken, activeClinicId } = useAuth();
  const { enabled = true } = options;

  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, activeClinicId, 'pet', petId],
    queryFn: () =>
      apiClient<InvoiceListResponse>(`/api/v1/billing/pets/${petId}/invoices`, {
        token: accessToken!,
      }),
    enabled: enabled && !!accessToken && !!activeClinicId && !!petId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

/**
 * The `VIEW_INVOICES` check the pet profile's section is gated on (T-06-142).
 *
 * Reads the same `/auth/permissions` endpoint and the same cache key as
 * `useBillingSettingsPermission`, so a profile that already loaded the
 * permission list for any other reason does not re-request it.
 *
 * Defence in depth, not the enforcement point: the endpoint above is gated
 * server-side regardless. Its purpose is to keep the section off a screen where
 * it could only ever render a 403 — on a profile staff open constantly.
 */
export function useViewInvoicesPermission() {
  const { accessToken, activeClinicId } = useAuth();

  const query = useQuery({
    queryKey: ['auth', 'permissions', activeClinicId],
    queryFn: () =>
      apiClient<{ data: { permissions: string[] } }>('/api/v1/auth/permissions', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 5 * 60_000,
    select: (response) => response.data.permissions,
  });

  return {
    ...query,
    /** False while loading, so the section is never shown before the check resolves. */
    canViewInvoices: canViewInvoices(query.data),
  };
}

/**
 * The `MANAGE_PAYMENTS` check `InvoiceActionBar` gates its money actions on
 * (E2E-BUG-FIX-PLAN.md §6.3).
 *
 * Reads the same `/auth/permissions` endpoint and cache key as
 * `useViewInvoicesPermission`/`useBillingSettingsPermission`.
 *
 * Defence in depth, not the enforcement point: the API rejects a caller
 * without `MANAGE_PAYMENTS` regardless. Its purpose is to stop the bar
 * offering Void/Refund/Collect Payment/Issue Credit Note to someone who can
 * only ever see them 403.
 */
export function useManagePaymentsPermission() {
  const { accessToken, activeClinicId } = useAuth();

  const query = useQuery({
    queryKey: ['auth', 'permissions', activeClinicId],
    queryFn: () =>
      apiClient<{ data: { permissions: string[] } }>('/api/v1/auth/permissions', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 5 * 60_000,
    select: (response) => response.data.permissions,
  });

  return {
    ...query,
    /** False while loading, so the bar never briefly shows money actions before the check resolves. */
    canManagePayments: canManagePayments(query.data),
  };
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
