import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quickSaleSchema } from '@breeyo/validators';
import type { InvoiceDetail, TaxBreakdown } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { INVOICES_QUERY_KEY } from './useInvoices';
import { BILLING_DASHBOARD_QUERY_KEY } from './useBillingDashboard';
import { PREVIEW_TOTALS_DEBOUNCE_MS } from '../lib/builder-state';
import { toQuickSaleItems, type QuickSaleCartItem } from '../stores/quickSaleCartStore';

/**
 * The two requests the D-04 counter screen makes.
 *
 * ## The client never computes the total
 *
 * Neither request body carries money and neither response is post-processed
 * arithmetically. The cart's subtotal, tax heads and grand total all arrive
 * from {@link useQuickSalePreview}, and the authoritative figures from the
 * invoice the checkout returns. This is not defensive style: the grand total is
 * the taxable value plus three heads rounded once at invoice level under
 * Section 170 / Rule 51, so a device that re-derived it would disagree with the
 * invoice on the first sale with a fractional head — while the customer is
 * standing at the counter listening to the figure (T-06-122).
 *
 * ## Why the checkout body is validated here as well as on the server
 *
 * The same `quickSaleSchema` object runs on both sides, so a cart the phone
 * would send and the server would reject with a 400 fails locally first, with
 * the same message and without a round trip. This is a usability property, not
 * a security one — the server's parse is the control.
 */

interface QuickSalePreviewResponse {
  data: {
    subtotalPaise: number;
    gstEnabled: boolean;
    breakdown: TaxBreakdown;
  };
}

interface QuickSaleInvoiceResponse {
  data: InvoiceDetail;
}

/** The cart preview's cache prefix, clinic-scoped one level down. */
export const QUICK_SALE_PREVIEW_QUERY_KEY = ['billing', 'quick-sale', 'preview'] as const;

/**
 * Debounce identical in shape to `useServiceCatalog`'s. Duplicated rather than
 * shared for the same reason that one is: it is eight lines, and the
 * alternative is a `hooks/` module every feature imports for a `setTimeout`.
 */
function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

/**
 * The cart's live figures, from the server (BIL-07).
 *
 * ## Why this posts the cart rather than an invoice id
 *
 * The builder's `usePreviewTotals` sends an `invoiceId` because its draft is
 * already persisted. A Quick Sale has no invoice until checkout — creation and
 * finalize are deliberately one request — so there is no id to send. The server
 * prices the cart through the same code path the checkout uses, which is what
 * makes the previewed figure and the charged figure the same figure rather than
 * two that happen to agree.
 *
 * ## The debounce
 *
 * 400ms, the same `PREVIEW_TOTALS_DEBOUNCE_MS` the builder uses. Held here
 * rather than in the screen because, unlike the builder's mutation, this is a
 * query whose key IS the debounced value — a screen-level timer would leave the
 * key changing on every keystroke regardless.
 *
 * An empty cart issues no request at all: the server would reject it (the
 * schema requires at least one item), and there is nothing to price.
 */
export function useQuickSalePreview(items: readonly QuickSaleCartItem[]) {
  const { accessToken, activeClinicId } = useAuth();

  const body = { items: toQuickSaleItems(items) };
  // Serialised for the cache key: an array identity changes on every render,
  // and the contents are what actually determine the figures.
  const serialised = JSON.stringify(body.items);
  const debounced = useDebounce(serialised, PREVIEW_TOTALS_DEBOUNCE_MS);

  return useQuery({
    queryKey: [...QUICK_SALE_PREVIEW_QUERY_KEY, activeClinicId, debounced],
    queryFn: () =>
      apiClient<QuickSalePreviewResponse>('/api/v1/billing/quick-sale/preview', {
        method: 'POST',
        token: accessToken!,
        // The debounced payload, not the live one, so the request matches the
        // key it is cached under.
        body: JSON.stringify({ items: JSON.parse(debounced) }),
      }),
    enabled: !!accessToken && !!activeClinicId && items.length > 0 && debounced !== '[]',
    // Prices and rates are clinic reference data; within a single sale they do
    // not move. Re-pricing an unchanged cart would only make the figure flicker.
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

/**
 * POST /billing/quick-sale — create and finalize a counter sale in one tap.
 *
 * On insufficient stock this rejects with an `ApiClientError` whose `code` is
 * `INSUFFICIENT_STOCK` and whose `details.shortfalls` is the per-item list.
 * Pull it out with `stockShortfallsFrom` from `lib/builder-state` rather than
 * re-reading the message — the per-row copy is the client's to own.
 *
 * ## Invalidation
 *
 * Four surfaces move, listed explicitly rather than by a broad prefix:
 * the invoice list and the dashboard summary both gain a finalized invoice, and
 * the inventory surfaces are stale because this request deducted stock. An item
 * just sold over the counter must not still read as in stock on the Inventory
 * tab — D-45's grey-out on the very next sale depends on that figure.
 */
export function useQuickSaleCheckout() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items: readonly QuickSaleCartItem[]) => {
      const parsed = quickSaleSchema.safeParse({ items: toQuickSaleItems(items) });
      if (!parsed.success) {
        throw new Error(
          parsed.error.errors.map((issue) => issue.message).join(', ') || 'Invalid cart',
        );
      }

      return apiClient<QuickSaleInvoiceResponse>('/api/v1/billing/quick-sale', {
        method: 'POST',
        token: accessToken!,
        body: JSON.stringify(parsed.data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BILLING_DASHBOARD_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // The cart is about to be emptied, so its priced preview is dead weight.
      queryClient.removeQueries({ queryKey: QUICK_SALE_PREVIEW_QUERY_KEY });
    },
  });
}
