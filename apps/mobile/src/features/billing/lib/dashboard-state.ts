/**
 * Every decision the Billing dashboard makes, as pure functions.
 *
 * ## Why this module exists separately from the screen
 *
 * `apps/mobile` cannot render a React Native component under test: vitest runs
 * the `node` environment with no Metro/Babel transform, so `import 'react-native'`
 * fails on Flow syntax before a single assertion runs. That is a pre-existing,
 * documented property of this repo — see `tests/inventory/useInventorySearch.test.ts`,
 * which extracted `getSearchDerivedState` for exactly the same reason.
 *
 * So the screen's copy, its state machine, its D-24 tap-to-filter mapping and
 * its card field derivation live here, with no React and no React Native
 * import, and `BillingDashboardScreen.tsx` is a thin renderer over them. The
 * alternative — inlining these decisions in JSX — would make the six documented
 * screen states and the copy contract unfalsifiable.
 */

import type {
  BillingDashboardSummary,
  InvoiceListFilter,
  InvoiceListItem,
  InvoiceListSort,
} from '@breeyo/types';
import { isInvoiceActionBlocked } from '@breeyo/types';
import {
  formatInvoiceDate,
  formatPaiseCompact,
  formatPaiseINR,
  invoiceStatusColors,
  invoiceStatusLabel,
  type InvoiceStatusColors,
} from './format';

// ─── Copy ───────────────────────────────────────────────────────────────────

/**
 * Every string the Billing dashboard renders, taken verbatim from
 * 06-UI-SPEC.md's `### Billing Tab Landing (Dashboard)` copy table and its
 * `### Billing Dashboard Screen States` table.
 *
 * Centralised so the copy contract is a single object a test can assert against
 * rather than a dozen string literals scattered through JSX. Two entries are
 * additions rather than quotations and are marked as such.
 */
export const BILLING_COPY = {
  tabLabel: 'Billing',
  searchPlaceholder: 'Search by invoice number, patient, or owner',
  emptyTitle: 'No invoices yet',
  emptyBody: 'Invoices will appear here after consultations or counter sales.',
  searchNoResultsTitle: 'No invoices found',
  searchNoResultsBody: 'Try a different search term.',
  errorState: 'Could not load invoices. Pull down to try again.',
  offlineBanner: 'You are offline. Showing cached invoices.',
  fabLabel: 'New Invoice',
  sortLabel: 'Sort',
  /**
   * Addition, not a quotation: 06-UI-SPEC.md predates D-36 and has no copy for
   * the billing-exception banner. See {@link billingExceptionBannerText}.
   */
  exceptionBannerHint: 'Payments on these need a staff decision.',
} as const;

// ─── Summary cards (D-24 + D-33) ────────────────────────────────────────────

export type SummaryCardKey = 'revenue' | 'unpaid' | 'overdue' | 'payments' | 'patients';

export interface SummaryCardModel {
  key: SummaryCardKey;
  label: string;
  value: string;
  /** Renders the value in `tertiary` (#E65100) — "this money needs chasing". */
  accent: boolean;
  /** D-24: only Unpaid Total and Overdue filter the list; the rest are informational. */
  actionable: boolean;
}

/**
 * The five cards, in display order: D-24's four plus D-33's RPT-01
 * patients-seen-today. 06-UI-SPEC.md's copy table still lists only four — D-33
 * post-dates it, and `dashboard.service.ts` already returns the fifth field.
 *
 * Currency values go through `formatPaiseCompact` because a 64px card fits
 * `₹1,23,456` and not `₹1,23,456.00`. Counts are plain integers, except Recent
 * Payments, which the copy table renders as `[N] today`.
 */
export function buildSummaryCards(
  summary: BillingDashboardSummary | undefined,
): SummaryCardModel[] {
  const revenue = summary?.todayRevenuePaise ?? 0;
  const unpaid = summary?.unpaidTotalPaise ?? 0;
  const overdue = summary?.overdueCount ?? 0;
  const payments = summary?.recentPaymentsCount ?? 0;
  const patients = summary?.patientsSeenToday ?? 0;

  return [
    {
      key: 'revenue',
      label: "Today's Revenue",
      value: formatPaiseCompact(revenue),
      accent: false,
      actionable: false,
    },
    {
      key: 'unpaid',
      label: 'Unpaid Total',
      value: formatPaiseCompact(unpaid),
      accent: unpaid > 0,
      actionable: true,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: String(overdue),
      accent: overdue > 0,
      actionable: true,
    },
    {
      key: 'payments',
      label: 'Recent Payments',
      value: `${payments} today`,
      accent: false,
      actionable: false,
    },
    {
      key: 'patients',
      label: 'Patients Today',
      value: String(patients),
      accent: false,
      actionable: false,
    },
  ];
}

// ─── Filter selection (D-24 tap-to-filter) ──────────────────────────────────

/**
 * The one selection the server's filter vocabulary cannot express.
 *
 * D-24 says tapping Unpaid Total filters the list to "Unpaid" + "Overdue".
 * `INVOICE_LIST_FILTERS`'s `unpaid` covers `FINALIZED | UNPAID | PARTIALLY_PAID`
 * and deliberately excludes `OVERDUE`, which has its own chip — but the Unpaid
 * Total card sums `balance_paise` over `UNPAID | PARTIALLY_PAID | OVERDUE`
 * (`dashboard.service.ts`). Mapping the tap to the `unpaid` chip alone would
 * therefore show a staff member a list that cannot add up to the figure they
 * just tapped, which is worse than no drill-down at all.
 *
 * Rather than add a seventh literal to the shared constant (which would also
 * add a seventh chip, breaking the D-24 chip contract), the composite is a
 * client-side selection resolved into two requests and merged.
 */
export const UNPAID_AND_OVERDUE = 'unpaid_and_overdue' as const;

export type FilterSelection = InvoiceListFilter | typeof UNPAID_AND_OVERDUE;

export const DEFAULT_INVOICE_FILTER: InvoiceListFilter = 'all';
export const DEFAULT_INVOICE_SORT: InvoiceListSort = 'newest';

/** D-24: what a tap on each summary card does. `null` means informational. */
export function summaryCardSelection(key: SummaryCardKey): FilterSelection | null {
  if (key === 'unpaid') return UNPAID_AND_OVERDUE;
  if (key === 'overdue') return 'overdue';
  return null;
}

/** Which chips render as selected for a given selection. */
export function selectionToChips(selection: FilterSelection): InvoiceListFilter[] {
  return selection === UNPAID_AND_OVERDUE ? ['unpaid', 'overdue'] : [selection];
}

/** Which server-side status filters a selection has to request. */
export function selectionToStatuses(selection: FilterSelection): InvoiceListFilter[] {
  return selection === UNPAID_AND_OVERDUE ? ['unpaid', 'overdue'] : [selection];
}

// ─── Filter chip and sort labels ────────────────────────────────────────────

/**
 * Display labels for the six D-24 chips. A local record rather than
 * string-casing the literal: `partially_paid`-style values would title-case
 * wrongly, and the copy table is the contract, not a transformation of the
 * persisted value.
 */
export const INVOICE_FILTER_LABELS: Readonly<Record<InvoiceListFilter, string>> = {
  all: 'All',
  draft: 'Draft',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  paid: 'Paid',
  voided: 'Voided',
};

export interface InvoiceSortOption {
  value: InvoiceListSort;
  label: string;
}

/** The five documented sort orders. The first entry is the default. */
export const INVOICE_SORT_OPTIONS: readonly InvoiceSortOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'amount_high', label: 'Amount (High)' },
  { value: 'amount_low', label: 'Amount (Low)' },
  { value: 'due_date', label: 'Due Date' },
];

export function invoiceSortLabel(sort: InvoiceListSort): string {
  return INVOICE_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Newest First';
}

// ─── New Invoice sheet ──────────────────────────────────────────────────────

export type NewInvoiceOptionKey = 'fromConsultation' | 'quickSale';

export interface NewInvoiceOption {
  key: NewInvoiceOptionKey;
  label: string;
  description: string;
  icon: string;
}

/** The FAB's two-option sheet, per the D-24 interaction contract. */
export const NEW_INVOICE_OPTIONS: readonly NewInvoiceOption[] = [
  {
    key: 'fromConsultation',
    label: 'From Consultation',
    description: 'Bill a completed visit that has no invoice yet',
    icon: 'stethoscope',
  },
  {
    key: 'quickSale',
    label: 'Quick Sale',
    description: 'Counter sale with no consultation',
    icon: 'cart-outline',
  },
];

// ─── Screen states ──────────────────────────────────────────────────────────

export type BillingListState =
  | 'loading'
  | 'error'
  | 'empty'
  | 'searchNoResults'
  | 'populated';

export interface BillingListStateInput {
  isLoading: boolean;
  isError: boolean;
  isSearchActive: boolean;
  isFetching: boolean;
  itemCount: number;
}

/**
 * The dashboard's list-area state machine.
 *
 * Order matters. `error` wins outright: a failed query has no rows to show, and
 * falling through to `empty` would tell the front desk the clinic has no
 * invoices when in fact the request failed — a materially different and much
 * more alarming statement.
 *
 * `searchNoResults` is separate from `empty` for the same class of reason:
 * telling someone who just typed a search term that there are "No invoices yet"
 * is simply false.
 *
 * A search whose request is still in flight is `loading`, not `searchNoResults`
 * — otherwise every keystroke flashes "No invoices found" before the results
 * land.
 */
export function deriveListState(input: BillingListStateInput): BillingListState {
  if (input.isError) return 'error';
  if (input.isLoading) return 'loading';
  if (input.itemCount > 0) return 'populated';
  if (input.isSearchActive) return input.isFetching ? 'loading' : 'searchNoResults';
  return 'empty';
}

// ─── D-36 billing exceptions ────────────────────────────────────────────────

/**
 * The banner text for flagged invoices, or `null` when there are none.
 *
 * D-36/D-35: a flagged invoice has every further status-changing action
 * blocked. Until this count reached a screen, the only symptom staff would see
 * was that they could no longer act on an invoice, with nothing anywhere
 * explaining why. Zero is the normal value, so this renders as a banner rather
 * than a sixth summary card.
 *
 * The exceptions *list* the banner would ideally link to does not exist yet
 * (see `06-12-SUMMARY.md` Deferred Items and this plan's summary), so the
 * banner is informational only.
 */
export function billingExceptionBannerText(count: number): string | null {
  if (!count || count <= 0) return null;
  return count === 1 ? '1 invoice needs review' : `${count} invoices need review`;
}

// ─── Invoice card fields ────────────────────────────────────────────────────

export interface InvoiceCardFields {
  number: string;
  date: string;
  pet: string;
  owner: string;
  amount: string;
  statusLabel: string;
  statusColors: InvoiceStatusColors;
  hasException: boolean;
  accessibilityLabel: string;
}

/** Rendered in the invoice-number slot when the invoice has no number yet. */
const UNNUMBERED_PLACEHOLDER = 'Draft';
const UNKNOWN_PET = 'Unknown pet';
const UNKNOWN_OWNER = 'Unknown owner';

/**
 * Everything an `InvoiceListCard` displays, derived once.
 *
 * `invoiceNumber` is null until finalize assigns one (D-15), and `petName` /
 * `ownerName` are null on a quick sale with no patient attached. Interpolating
 * any of those straight into JSX renders the literal string `null` on a card
 * the front desk reads while taking money, so each has an explicit fallback.
 *
 * The amount goes through `formatPaiseINR`, the only paise-to-rupee conversion
 * in the feature.
 */
export function invoiceCardFields(invoice: InvoiceListItem): InvoiceCardFields {
  const number = invoice.invoiceNumber ?? UNNUMBERED_PLACEHOLDER;
  const pet = invoice.petName ?? UNKNOWN_PET;
  const owner = invoice.ownerName ?? UNKNOWN_OWNER;
  const amount = formatPaiseINR(invoice.grandTotalPaise);
  const statusLabel = invoiceStatusLabel(invoice.status);

  return {
    number,
    date: formatInvoiceDate(invoice.createdAt),
    pet,
    owner,
    amount,
    statusLabel,
    statusColors: invoiceStatusColors(invoice.status),
    hasException: isInvoiceActionBlocked(invoice.exceptionFlag),
    accessibilityLabel: `${number}, ${pet}, owner ${owner}, ${amount}, ${statusLabel}`,
  };
}

// ─── Composite page merge ───────────────────────────────────────────────────

function toTime(value: Date | string | null): number | null {
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Comparators mirroring `invoice.repository.ts`'s `orderBy`, so the merged
 * composite list is in the same order the server would have returned had it
 * been able to answer the query in one request.
 *
 * `due_date` sorts nulls last, which is what PostgreSQL's `ASC` does and
 * therefore what the single-status path already produces.
 */
const COMPARATORS: Record<InvoiceListSort, (a: InvoiceListItem, b: InvoiceListItem) => number> = {
  newest: (a, b) => (toTime(b.createdAt) ?? 0) - (toTime(a.createdAt) ?? 0),
  oldest: (a, b) => (toTime(a.createdAt) ?? 0) - (toTime(b.createdAt) ?? 0),
  amount_high: (a, b) => b.grandTotalPaise - a.grandTotalPaise,
  amount_low: (a, b) => a.grandTotalPaise - b.grandTotalPaise,
  due_date: (a, b) => {
    const left = toTime(a.dueDate);
    const right = toTime(b.dueDate);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  },
};

/**
 * Merges the pages of a composite selection into one ordered list.
 *
 * Deduplicates by id first: the status groups are disjoint today, but a status
 * transition landing between the two requests could return the same invoice
 * under both, and rendering one invoice twice in a money list is not a cosmetic
 * defect.
 *
 * Note this merges *pages*, not result sets — with a single page per status the
 * composite view shows the first N of each. Cursor pagination across a
 * composite selection is deferred; see `06-14-SUMMARY.md`.
 */
export function mergeInvoicePages(
  pages: ReadonlyArray<readonly InvoiceListItem[] | undefined>,
  sort: InvoiceListSort,
): InvoiceListItem[] {
  const byId = new Map<string, InvoiceListItem>();

  for (const page of pages) {
    for (const item of page ?? []) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  return Array.from(byId.values()).sort(COMPARATORS[sort] ?? COMPARATORS.newest);
}
