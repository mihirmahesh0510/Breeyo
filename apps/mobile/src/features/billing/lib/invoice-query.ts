/**
 * The invoice list's request contract.
 *
 * Kept out of `hooks/useInvoices.ts` because that module imports
 * `AuthProvider`, which transitively imports `react-native` — unparseable in
 * this repo's vitest `node` environment. Everything here is a pure function of
 * its arguments, so it stays testable.
 */

// The filter and sort literals are IMPORTED, never retyped. `invoiceListQuerySchema`
// is the exact schema the server parses `GET /billing/invoices` with, so running
// the client's filters through it here makes a value the server would reject
// unrepresentable rather than merely unlikely.
import { invoiceListQuerySchema, type InvoiceListQueryInput } from '@breeyo/validators';

export type InvoiceFilters = Partial<InvoiceListQueryInput>;

/**
 * Page size for the invoice list.
 *
 * 06-UI-SPEC.md `## Search Behavior (Phase 6)` specifies 30 results per query.
 * `invoiceListQuerySchema`'s own default is 20, which is the server's floor for
 * any caller rather than this screen's page size, so it is set explicitly here.
 */
export const INVOICE_PAGE_SIZE = 30;

/**
 * Serialises filters into a query string containing only values the shared
 * schema accepts.
 *
 * Optional fields that are absent are omitted rather than serialised as the
 * string `"undefined"` — `?petId=undefined` fails the server's `z.string().uuid()`
 * with a 400, and the user would see "could not load invoices" with no clue why.
 */
export function buildInvoiceListQueryString(filters: InvoiceFilters): string {
  // Throws on a value outside the shared literal unions, and fills in the
  // server's defaults so the query key and the request agree on what was asked.
  const parsed = invoiceListQuerySchema.parse({
    limit: INVOICE_PAGE_SIZE,
    ...filters,
  });

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
