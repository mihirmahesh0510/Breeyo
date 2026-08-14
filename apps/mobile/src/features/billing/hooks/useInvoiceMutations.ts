import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  createInvoiceSchema,
  updateDraftInvoiceSchema,
  finalizeInvoiceSchema,
  voidInvoiceSchema,
  serviceCatalogSchema,
} from '@breeyo/validators';
import type { Invoice, InvoiceDetail, ServiceCatalog, TaxBreakdown } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { INVOICES_QUERY_KEY } from './useInvoices';
import { BILLING_DASHBOARD_QUERY_KEY } from './useBillingDashboard';
import { SERVICE_CATALOG_QUERY_KEY } from './useServiceCatalog';

/**
 * Every write the invoice builder performs (BIL-01, BIL-02, BIL-07).
 *
 * ## The client never sends money
 *
 * Not one request body assembled in this file carries a subtotal, a tax head or
 * a grand total, and none can: the shared schemas from `@breeyo/validators` —
 * the exact objects the Fastify handlers parse — have no such field, and Zod
 * strips unknown keys. `finalizeInvoiceSchema` in particular accepts only a due
 * date, notes and a place of supply; the server recomputes the invoice from its
 * own persisted line items (T-06-102).
 *
 * ## Why the bodies are validated here as well as on the server
 *
 * The same schema object runs on both sides, so a payload the phone would send
 * and the server would reject with a 400 fails locally instead, with the same
 * message, before a round trip. This is a usability property, not a security
 * one — the server's parse is the control, and this one is bypassable by
 * definition.
 *
 * ## Invalidation
 *
 * Every mutation below invalidates every key it can affect, listed explicitly
 * rather than by a broad prefix. A finalized invoice that lingers as `DRAFT` in
 * the dashboard list is not a cosmetic bug: it is an invoice the front desk will
 * try to edit, and the second attempt fails with `INVOICE_NOT_DRAFT` after they
 * have already told the owner a figure (T-06-94's family).
 */

interface InvoiceResponse {
  data: Invoice;
}

interface InvoiceDetailResponse {
  data: InvoiceDetail;
}

interface TaxBreakdownResponse {
  data: TaxBreakdown;
}

interface ServiceCatalogResponse {
  data: ServiceCatalog;
}

interface DeleteDraftResponse {
  data: { deleted: boolean };
}

/**
 * The two keys every invoice write can move: the Billing tab's list and its
 * summary cards. Both are clinic-scoped one level down, so invalidating the
 * prefix catches whichever clinic is active without this module having to know
 * which.
 */
function invalidateInvoiceSurfaces(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: BILLING_DASHBOARD_QUERY_KEY });
}

/** A raised ZodError would surface as an unhandled rejection inside the mutation. */
function parseOrThrow<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: unknown } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = (result.error as { errors?: { message: string }[] })?.errors ?? [];
    throw new Error(issues.map((issue) => issue.message).join(', ') || 'Invalid invoice input');
  }
  return result.data as T;
}

/** POST /billing/invoices — the interactive D-01/D-06 builder path. */
export function useCreateInvoice() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parseOrThrow(createInvoiceSchema, input);
      return apiClient<InvoiceResponse>('/api/v1/billing/invoices', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      invalidateInvoiceSurfaces(queryClient);
    },
  });
}

/** PATCH /billing/invoices/:invoiceId — D-21: only a draft is editable. */
export function useUpdateDraft() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, updates }: { invoiceId: string; updates: unknown }) => {
      const body = parseOrThrow(updateDraftInvoiceSchema, updates);
      return apiClient<InvoiceResponse>(`/api/v1/billing/invoices/${invoiceId}`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, variables.invoiceId] });
      invalidateInvoiceSurfaces(queryClient);
    },
  });
}

/**
 * POST /billing/invoices/:invoiceId/finalize — BIL-02 and BIL-07.
 *
 * The body carries no line items and no money. The invoice's contents are
 * already persisted; finalize numbers it, freezes the tax snapshot and deducts
 * stock inside one transaction.
 *
 * On insufficient stock this rejects with an `ApiClientError` whose `code` is
 * `INSUFFICIENT_STOCK` and whose `details.shortfalls` is the per-item list.
 * Pull it out with `stockShortfallsFrom` from `lib/builder-state` rather than
 * re-reading the message — the banner's copy is the client's to own.
 */
export function useFinalizeInvoice() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input?: unknown }) => {
      const body = parseOrThrow(finalizeInvoiceSchema, input ?? {});
      return apiClient<InvoiceResponse>(`/api/v1/billing/invoices/${invoiceId}/finalize`, {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, variables.invoiceId] });
      invalidateInvoiceSurfaces(queryClient);
      // Finalize deducts stock, so the inventory surfaces are stale too — an
      // item the front desk just billed out must not still read as in stock on
      // the Inventory tab (D-45's grey-out depends on this figure).
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/** POST /billing/invoices/:invoiceId/void — D-21, D-26, D-34. */
export function useVoidInvoice() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: unknown }) => {
      const body = parseOrThrow(voidInvoiceSchema, input);
      return apiClient<InvoiceResponse>(`/api/v1/billing/invoices/${invoiceId}/void`, {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, variables.invoiceId] });
      invalidateInvoiceSurfaces(queryClient);
      // A void restores the stock of billing-time lines (D-34), so the same
      // inventory figures move as on finalize.
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/** DELETE /billing/invoices/:invoiceId — a draft leaves no document behind. */
export function useDeleteDraft() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invoiceId: string) =>
      apiClient<DeleteDraftResponse>(`/api/v1/billing/invoices/${invoiceId}`, {
        method: 'DELETE',
        token: accessToken!,
      }),
    onSuccess: (_data, invoiceId) => {
      queryClient.removeQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      invalidateInvoiceSurfaces(queryClient);
    },
  });
}

/**
 * POST /billing/services — the D-02 "Add Custom Service" inline form.
 *
 * The new service is added to the invoice *and* saved to the catalog for reuse,
 * so both catalog hooks are invalidated. The invoice surfaces are not: creating
 * a catalog entry changes no invoice.
 */
export function useCreateCustomService() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: unknown) => {
      const body = parseOrThrow(serviceCatalogSchema, input);
      return apiClient<ServiceCatalogResponse>('/api/v1/billing/services', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SERVICE_CATALOG_QUERY_KEY });
    },
  });
}

/**
 * The live totals endpoint — the figure the builder displays while it is edited.
 *
 * ## It sends an invoice id, not line items
 *
 * The server computes from the invoice's already-stored line items and writes
 * nothing; `previewTotalsBodySchema` accepts `{ invoiceId }` and nothing else.
 * That is a stronger contract than posting the current draft would be — the
 * preview and the finalize read the same rows, so the number on screen cannot
 * disagree with the number charged. The cost is that the builder must save the
 * draft before it can preview, which `shouldPreviewTotals` encodes.
 *
 * ## Debouncing
 *
 * Not here. See `PREVIEW_TOTALS_DEBOUNCE_MS` in `lib/builder-state` for why the
 * 400ms timer belongs to the screen (plan 06-21) and not to this hook.
 *
 * No `onSuccess` invalidation: this is a read dressed as a POST, and
 * invalidating anything from it would make an idle builder poll itself.
 */
export function usePreviewTotals() {
  const { accessToken } = useAuth();

  return useMutation({
    mutationFn: (invoiceId: string) =>
      apiClient<TaxBreakdownResponse>('/api/v1/billing/invoices/preview-totals', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify({ invoiceId }),
      }),
  });
}

/** GET /billing/invoices/:invoiceId — used to hydrate an existing draft. */
export type { InvoiceDetailResponse };
