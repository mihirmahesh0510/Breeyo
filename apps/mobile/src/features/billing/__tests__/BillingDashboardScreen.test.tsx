/**
 * Billing dashboard screen-contract tests.
 *
 * ## Why these do not render the screen
 *
 * `apps/mobile` cannot render a React Native component in a test. `vitest.config.ts`
 * uses the `node` environment with no Metro/Babel transform, so importing
 * `react-native` at all fails at parse time on its Flow syntax
 * (`Error: Expected 'from', got 'typeOf'`), and `react-test-renderer` — the peer
 * `@testing-library/react-native` needs — is not installed. Every existing test
 * under `apps/mobile/tests` states the same constraint and works the same way;
 * see the header of `tests/inventory/useInventorySearch.test.ts`.
 *
 * So the screen's decisions live in `lib/dashboard-state.ts`, a module with no
 * React Native import, and the components are thin renderers over it. That is
 * what makes the six documented screen states, the D-24 tap-to-filter mapping
 * and the UI-SPEC copy contract assertable here rather than merely asserted in
 * a comment. Standing up a real RN test harness is tracked as a deferred item
 * in `06-14-SUMMARY.md`.
 */

import { describe, it, expect } from 'vitest';
import type { BillingDashboardSummary, InvoiceListItem } from '@breeyo/types';
import {
  BILLING_COPY,
  buildSummaryCards,
  summaryCardSelection,
  selectionToChips,
  selectionToStatuses,
  deriveListState,
  billingExceptionBannerText,
  UNPAID_AND_OVERDUE,
  DEFAULT_INVOICE_FILTER,
  DEFAULT_INVOICE_SORT,
  INVOICE_FILTER_LABELS,
  INVOICE_SORT_OPTIONS,
  NEW_INVOICE_OPTIONS,
  invoiceCardFields,
  mergeInvoicePages,
} from '../lib/dashboard-state';

const summary: BillingDashboardSummary = {
  todayRevenuePaise: 12345600,
  unpaidTotalPaise: 450000,
  overdueCount: 3,
  recentPaymentsCount: 7,
  patientsSeenToday: 11,
  billingExceptionCount: 0,
};

const zeroSummary: BillingDashboardSummary = {
  todayRevenuePaise: 0,
  unpaidTotalPaise: 0,
  overdueCount: 0,
  recentPaymentsCount: 0,
  patientsSeenToday: 0,
  billingExceptionCount: 0,
};

function invoice(overrides: Partial<InvoiceListItem> = {}): InvoiceListItem {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-202608-0001',
    status: 'UNPAID',
    grandTotalPaise: 123435,
    balancePaise: 123435,
    createdAt: new Date('2026-08-14T06:00:00.000Z'),
    dueDate: null,
    petName: 'Bruno',
    ownerName: 'Asha Rao',
    exceptionFlag: null,
    ...overrides,
  };
}

// ─── 1. Summary header: five cards, D-33 included ───────────────────────────

describe('summary header (D-24 + D-33)', () => {
  it('renders five cards with the UI-SPEC labels, including patients seen today', () => {
    const cards = buildSummaryCards(summary);

    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.label)).toEqual([
      "Today's Revenue",
      'Unpaid Total',
      'Overdue',
      'Recent Payments',
      'Patients Today',
    ]);
  });

  it('formats every currency card from integer paise through the compact formatter', () => {
    const cards = buildSummaryCards(summary);
    const byKey = Object.fromEntries(cards.map((c) => [c.key, c.value]));

    // 12345600 paise = Rs 1,23,456.00 -> compacted so it fits a 64px card.
    expect(byKey.revenue).toBe('₹1,23,456');
    expect(byKey.unpaid).toBe('₹4,500');
  });

  it('renders the non-currency cards as counts, with "[N] today" for recent payments', () => {
    const byKey = Object.fromEntries(buildSummaryCards(summary).map((c) => [c.key, c.value]));

    expect(byKey.overdue).toBe('3');
    expect(byKey.payments).toBe('7 today');
    expect(byKey.patients).toBe('11');
  });

  it('accents Unpaid Total and Overdue in tertiary only when they are above zero', () => {
    const above = Object.fromEntries(buildSummaryCards(summary).map((c) => [c.key, c.accent]));
    const zero = Object.fromEntries(buildSummaryCards(zeroSummary).map((c) => [c.key, c.accent]));

    expect(above.unpaid).toBe(true);
    expect(above.overdue).toBe(true);
    expect(zero.unpaid).toBe(false);
    expect(zero.overdue).toBe(false);

    // The other three are never accented -- accent means "money needs chasing".
    expect(above.revenue).toBe(false);
    expect(above.payments).toBe(false);
    expect(above.patients).toBe(false);
  });

  it('marks only Unpaid Total and Overdue as tappable (D-24: the rest are informational)', () => {
    const cards = buildSummaryCards(summary);
    expect(cards.filter((c) => c.actionable).map((c) => c.key)).toEqual(['unpaid', 'overdue']);
  });
});

// ─── 2. D-24 tap-to-filter ──────────────────────────────────────────────────

describe('tap-to-filter (D-24)', () => {
  it('filters to unpaid AND overdue when Unpaid Total is tapped', () => {
    expect(summaryCardSelection('unpaid')).toBe(UNPAID_AND_OVERDUE);
    // The card sums balances over UNPAID + PARTIALLY_PAID + OVERDUE
    // (dashboard.service.ts), so a list that excluded overdue could not
    // reconcile with the figure the staff member just tapped.
    expect(selectionToStatuses(UNPAID_AND_OVERDUE)).toEqual(['unpaid', 'overdue']);
    expect(selectionToChips(UNPAID_AND_OVERDUE)).toEqual(['unpaid', 'overdue']);
  });

  it('filters to overdue only when Overdue is tapped', () => {
    expect(summaryCardSelection('overdue')).toBe('overdue');
    expect(selectionToStatuses('overdue')).toEqual(['overdue']);
  });

  it('does nothing for the three informational cards', () => {
    expect(summaryCardSelection('revenue')).toBeNull();
    expect(summaryCardSelection('payments')).toBeNull();
    expect(summaryCardSelection('patients')).toBeNull();
  });

  it('issues a single request for every non-composite selection', () => {
    expect(selectionToStatuses('all')).toEqual(['all']);
    expect(selectionToStatuses('paid')).toEqual(['paid']);
  });
});

// ─── 3. The six documented screen states ────────────────────────────────────

describe('screen states', () => {
  const base = { isLoading: false, isError: false, isSearchActive: false, isFetching: false, itemCount: 0 };

  it('renders skeletons while loading, never a zeroed-out header', () => {
    // Rendering Rs 0.00 before data arrives reads as "no revenue today", which
    // is a different and alarming statement (T-06-95).
    expect(deriveListState({ ...base, isLoading: true })).toBe('loading');
  });

  it('renders the error copy on a failed query', () => {
    expect(deriveListState({ ...base, isError: true })).toBe('error');
    expect(BILLING_COPY.errorState).toBe('Could not load invoices. Pull down to try again.');
  });

  it('renders the empty state when the clinic has no invoices and no search is active', () => {
    expect(deriveListState({ ...base, itemCount: 0 })).toBe('empty');
    expect(BILLING_COPY.emptyTitle).toBe('No invoices yet');
    expect(BILLING_COPY.emptyBody).toBe(
      'Invoices will appear here after consultations or counter sales.',
    );
  });

  it('renders a search-no-results state distinct from the empty state', () => {
    expect(deriveListState({ ...base, isSearchActive: true, itemCount: 0 })).toBe(
      'searchNoResults',
    );
    // Showing "No invoices yet" to someone who just searched is wrong.
    expect(BILLING_COPY.searchNoResultsTitle).not.toBe(BILLING_COPY.emptyTitle);
    expect(BILLING_COPY.searchNoResultsTitle).toBe('No invoices found');
    expect(BILLING_COPY.searchNoResultsBody).toBe('Try a different search term.');
  });

  it('stays in the loading state while a search request is still in flight', () => {
    expect(
      deriveListState({ ...base, isSearchActive: true, isFetching: true, itemCount: 0 }),
    ).toBe('loading');
  });

  it('renders the populated state once rows exist', () => {
    expect(deriveListState({ ...base, itemCount: 4 })).toBe('populated');
    expect(deriveListState({ ...base, isSearchActive: true, itemCount: 4 })).toBe('populated');
  });

  it('prefers the error state over every other state', () => {
    expect(deriveListState({ ...base, isError: true, isLoading: true, itemCount: 9 })).toBe(
      'error',
    );
  });

  it('carries the D-41 offline copy', () => {
    expect(BILLING_COPY.offlineBanner).toBe('You are offline. Showing cached invoices.');
  });
});

// ─── 4. D-36 billing exceptions ─────────────────────────────────────────────

describe('billing exception banner (D-36)', () => {
  it('renders nothing when no invoice is flagged -- zero is the normal value', () => {
    expect(billingExceptionBannerText(0)).toBeNull();
  });

  it('surfaces the count so a blocked invoice is discoverable rather than silently stuck', () => {
    expect(billingExceptionBannerText(1)).toBe('1 invoice needs review');
    expect(billingExceptionBannerText(4)).toBe('4 invoices need review');
  });
});

// ─── 5. Filters, sort and the New Invoice sheet ─────────────────────────────

describe('filter chips, sort options and the New Invoice sheet', () => {
  it('labels the six D-24 filter chips exactly as the UI-SPEC copy table does', () => {
    expect(INVOICE_FILTER_LABELS).toEqual({
      all: 'All',
      draft: 'Draft',
      unpaid: 'Unpaid',
      overdue: 'Overdue',
      paid: 'Paid',
      voided: 'Voided',
    });
    expect(DEFAULT_INVOICE_FILTER).toBe('all');
  });

  it('offers the five documented sort orders with Newest First as the default', () => {
    expect(INVOICE_SORT_OPTIONS.map((o) => o.label)).toEqual([
      'Newest First',
      'Oldest First',
      'Amount (High)',
      'Amount (Low)',
      'Due Date',
    ]);
    expect(DEFAULT_INVOICE_SORT).toBe('newest');
    expect(INVOICE_SORT_OPTIONS[0].value).toBe(DEFAULT_INVOICE_SORT);
  });

  it('presents exactly two New Invoice options', () => {
    expect(NEW_INVOICE_OPTIONS.map((o) => o.label)).toEqual(['From Consultation', 'Quick Sale']);
    expect(new Set(NEW_INVOICE_OPTIONS.map((o) => o.key)).size).toBe(2);
  });
});

// ─── 6. Invoice card fields ─────────────────────────────────────────────────

describe('invoice card fields', () => {
  it('renders the amount from integer paise through the shared formatter', () => {
    expect(invoiceCardFields(invoice()).amount).toBe('₹1,234.35');
  });

  it('renders a placeholder rather than the string "null" for an unnumbered draft', () => {
    const fields = invoiceCardFields(invoice({ invoiceNumber: null, status: 'DRAFT' }));

    expect(fields.number).toBe('Draft');
    expect(fields.number).not.toBe('null');
    expect(fields.statusLabel).toBe('DRAFT');
  });

  it('falls back on a missing pet or owner name instead of rendering "null"', () => {
    const fields = invoiceCardFields(invoice({ petName: null, ownerName: null }));

    expect(fields.pet).not.toContain('null');
    expect(fields.owner).not.toContain('null');
  });

  it('gives an overdue invoice the tertiary badge and a voided invoice the error badge', () => {
    expect(invoiceCardFields(invoice({ status: 'OVERDUE' })).statusColors).toMatchObject({
      background: '#FFE0B2',
      text: '#BF360C',
    });
    expect(invoiceCardFields(invoice({ status: 'VOIDED' })).statusColors).toMatchObject({
      background: '#FFDAD6',
      text: '#410002',
    });
  });

  it('D-46: distinguishes a finalized invoice from an unpaid one on the card', () => {
    const finalized = invoiceCardFields(invoice({ status: 'FINALIZED' }));
    const unpaid = invoiceCardFields(invoice({ status: 'UNPAID' }));

    expect(finalized.statusLabel).not.toBe(unpaid.statusLabel);
    expect(finalized.statusColors.border).not.toBe(unpaid.statusColors.border);
  });

  it('flags an invoice carrying an unresolved billing exception (D-35, D-36)', () => {
    expect(invoiceCardFields(invoice()).hasException).toBe(false);
    expect(invoiceCardFields(invoice({ exceptionFlag: 'overpayment' })).hasException).toBe(true);
  });

  it('renders the date without relying on the platform locale', () => {
    expect(invoiceCardFields(invoice()).date).toBe('14 Aug 26');
  });
});

// ─── 7. Composite unpaid+overdue merge ──────────────────────────────────────

describe('mergeInvoicePages', () => {
  const older = invoice({ id: 'a', createdAt: new Date('2026-08-01T00:00:00Z'), grandTotalPaise: 500 });
  const newer = invoice({ id: 'b', createdAt: new Date('2026-08-10T00:00:00Z'), grandTotalPaise: 100 });

  it('interleaves the two pages by the active sort rather than concatenating them', () => {
    expect(mergeInvoicePages([[older], [newer]], 'newest').map((i) => i.id)).toEqual(['b', 'a']);
    expect(mergeInvoicePages([[older], [newer]], 'oldest').map((i) => i.id)).toEqual(['a', 'b']);
    expect(mergeInvoicePages([[newer], [older]], 'amount_high').map((i) => i.id)).toEqual([
      'a',
      'b',
    ]);
    expect(mergeInvoicePages([[older], [newer]], 'amount_low').map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('sorts undated invoices last under Due Date, matching the server ordering', () => {
    const dated = invoice({ id: 'c', dueDate: new Date('2026-09-01T00:00:00Z') });
    const undated = invoice({ id: 'd', dueDate: null });

    expect(mergeInvoicePages([[undated], [dated]], 'due_date').map((i) => i.id)).toEqual([
      'c',
      'd',
    ]);
  });

  it('drops duplicates so an invoice appearing in both pages is not rendered twice', () => {
    expect(mergeInvoicePages([[older], [older]], 'newest')).toHaveLength(1);
  });
});
