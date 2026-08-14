/**
 * The invoice list's request contract: what the client is allowed to ask the
 * server for, and what it does with the answer.
 *
 * These sit apart from `BillingDashboardScreen.test.tsx` because they are about
 * the wire, not the screen. `buildInvoiceListQueryString` lives in `lib/` and
 * not in `hooks/useInvoices.ts` precisely so it is importable here:
 * `useInvoices` imports `AuthProvider`, which transitively imports
 * `react-native`, which cannot be parsed in this environment.
 */

import { describe, it, expect } from 'vitest';
import { buildInvoiceListQueryString } from '../lib/invoice-query';
import {
  INVOICE_SEARCH_DEBOUNCE_MS,
  INVOICE_SEARCH_MIN_CHARS,
  getSearchDerivedState,
} from '../hooks/useInvoiceSearch';

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe('buildInvoiceListQueryString', () => {
  it('applies the documented defaults when given nothing', () => {
    const p = params(buildInvoiceListQueryString({}));

    expect(p.get('status')).toBe('all');
    expect(p.get('sort')).toBe('newest');
  });

  it('requests 30 results per query, per the UI-SPEC search contract', () => {
    // 06-UI-SPEC.md "## Search Behavior (Phase 6)": 30 results per query. The
    // shared schema's own default is 20 — that is the server's floor for any
    // caller, not this screen's page size.
    expect(params(buildInvoiceListQueryString({})).get('limit')).toBe('30');
    expect(params(buildInvoiceListQueryString({ limit: 5 })).get('limit')).toBe('5');
  });

  it('omits optional parameters instead of sending them as the string "undefined"', () => {
    const p = params(buildInvoiceListQueryString({ status: 'unpaid' }));

    // `?petId=undefined` fails the server's uuid parse with a 400.
    expect(p.has('search')).toBe(false);
    expect(p.has('petId')).toBe(false);
    expect(p.has('cursor')).toBe(false);
    expect(p.has('from')).toBe(false);
    expect(p.has('to')).toBe(false);
  });

  it('carries a search term through alongside the status filter', () => {
    // UI-SPEC: "Filter combination | Status filter + search combinable".
    const p = params(buildInvoiceListQueryString({ status: 'overdue', search: 'Bruno' }));

    expect(p.get('status')).toBe('overdue');
    expect(p.get('search')).toBe('Bruno');
  });

  it('rejects a filter value the server would reject, at the call site', () => {
    // The literals come from `invoiceListQuerySchema`, so an invented client
    // filter is a thrown error here rather than a 400 the user sees.
    expect(() =>
      buildInvoiceListQueryString({ status: 'unpaid_and_overdue' as never }),
    ).toThrow();
    expect(() => buildInvoiceListQueryString({ sort: 'cheapest' as never })).toThrow();
  });

  it('accepts every documented filter and sort literal', () => {
    for (const status of ['all', 'draft', 'unpaid', 'overdue', 'paid', 'voided'] as const) {
      expect(params(buildInvoiceListQueryString({ status })).get('status')).toBe(status);
    }
    for (const sort of ['newest', 'oldest', 'amount_high', 'amount_low', 'due_date'] as const) {
      expect(params(buildInvoiceListQueryString({ sort })).get('sort')).toBe(sort);
    }
  });
});

describe('invoice search debounce contract', () => {
  it('uses the Phase 3/5 numbers so the three list screens feel identical', () => {
    expect(INVOICE_SEARCH_DEBOUNCE_MS).toBe(300);
    expect(INVOICE_SEARCH_MIN_CHARS).toBe(2);
  });

  it('is not an active search below the two-character minimum', () => {
    expect(getSearchDerivedState('a', 'a').isSearchActive).toBe(false);
    expect(getSearchDerivedState('', '').isSearchActive).toBe(false);
    expect(getSearchDerivedState('  ', '  ').isSearchActive).toBe(false);
  });

  it('becomes an active search once the debounced term reaches two characters', () => {
    expect(getSearchDerivedState('IN', 'IN').isSearchActive).toBe(true);
  });

  it('reports "searching" while the debounce timer trails the latest keystroke', () => {
    expect(getSearchDerivedState('INV-2026', 'INV').isSearching).toBe(true);
    expect(getSearchDerivedState('INV', 'INV').isSearching).toBe(false);
  });
});
