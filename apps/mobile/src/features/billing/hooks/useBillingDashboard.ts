import { useQuery } from '@tanstack/react-query';
import type { BillingDashboardSummary } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

// --- Response types ---

interface BillingDashboardResponse {
  data: BillingDashboardSummary;
}

/** Shared by every clinic-scoped billing query key. */
export const BILLING_DASHBOARD_QUERY_KEY = ['billing', 'dashboard'] as const;

/**
 * The Billing tab landing aggregate (D-24 + D-33): today's revenue, unpaid
 * total, overdue count, recent payment count, patients seen today, and the
 * D-35/D-36 billing-exception count.
 *
 * `activeClinicId` is part of the query key deliberately (T-06-92). Without it,
 * switching clinics would serve the previous clinic's revenue figures out of
 * cache — a cross-tenant disclosure that looks like a rendering glitch rather
 * than a security event. With it, a switch is a cache miss.
 *
 * 30s `staleTime` matches the queue and inventory lists. It is a ceiling on
 * staleness, not the update mechanism: `useInvoiceSocket` invalidates this key
 * the moment a payment is captured, so a webhook-confirmed payment is visible
 * immediately rather than up to 30 seconds later.
 */
export function useBillingDashboard() {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: [...BILLING_DASHBOARD_QUERY_KEY, activeClinicId],
    queryFn: () =>
      apiClient<BillingDashboardResponse>('/api/v1/billing/dashboard', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}
