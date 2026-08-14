import { useQuery } from '@tanstack/react-query';
import type { InvoiceDetail } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { INVOICES_QUERY_KEY } from './useInvoices';

interface InvoiceDetailResponse {
  data: InvoiceDetail;
}

/**
 * `GET /api/v1/billing/invoices/:invoiceId` — one invoice with its line items,
 * pet and owner.
 *
 * The builder needs this to open an existing draft: `hydrate` takes an
 * `InvoiceBuilderDraft`, which `InvoiceDetail` satisfies structurally, and
 * without it a draft raised by D-03's end-consultation hook could be listed but
 * never opened.
 *
 * The key extends `INVOICES_QUERY_KEY` with the id, which is exactly the key
 * `useUpdateDraft` and `useFinalizeInvoice` already invalidate — so a save
 * refetches this entry rather than leaving the screen showing the pre-save
 * server state.
 *
 * `staleTime` is zero, unlike the list's 30 seconds. A draft the front desk is
 * about to edit and finalize is the one invoice in the app where a cached copy
 * half a minute old is a real hazard: it is the copy the finalize will be
 * checked against, and D-21 makes the outcome irreversible.
 */
export function useInvoiceDetail(invoiceId: string | null | undefined) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, activeClinicId, invoiceId],
    queryFn: () =>
      apiClient<InvoiceDetailResponse>(`/api/v1/billing/invoices/${invoiceId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId && !!invoiceId,
    staleTime: 0,
    select: (response) => response.data,
  });
}
