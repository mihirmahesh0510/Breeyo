import React, { useCallback, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { FAB, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { EmptyState, SearchBar, SkeletonLoader } from '@breeyo/ui';
import type { InvoiceListItem, InvoiceListSort } from '@breeyo/types';
import { useBillingDashboard } from '../hooks/useBillingDashboard';
import { useInvoices } from '../hooks/useInvoices';
import { useInvoiceSearch } from '../hooks/useInvoiceSearch';
import { useInvoiceSocket } from '../hooks/useInvoiceSocket';
import { useBillingUIStore } from '../store/billingUIStore';
import { BillingSummaryHeader } from '../components/BillingSummaryHeader';
import { InvoiceFilterChips } from '../components/InvoiceFilterChips';
import { InvoiceSortSelector } from '../components/InvoiceSortSelector';
import { InvoiceListCard } from '../components/InvoiceListCard';
import { NewInvoiceSheet } from '../components/NewInvoiceSheet';
// A second import from `react-native-paper` rather than widening the one above,
// so that adding the D-29 gear removes no line from a plan 06-14 file.
import { IconButton as SettingsGearButton } from 'react-native-paper';
import {
  BILLING_COPY,
  DEFAULT_INVOICE_FILTER,
  DEFAULT_INVOICE_SORT,
  UNPAID_AND_OVERDUE,
  billingExceptionBannerText,
  deriveListState,
  mergeInvoicePages,
  selectionToChips,
  selectionToStatuses,
  summaryCardSelection,
  type FilterSelection,
  type SummaryCardKey,
} from '../lib/dashboard-state';

/**
 * Routes the New Invoice sheet pushes to.
 *
 * ## Every billing sub-route is a sibling of `(tabs)`, not a child of it
 *
 * Plan 06-14 declared the first two under `/(app)/(tabs)/billing/...`. That
 * namespace cannot resolve: `app/(app)/(tabs)/billing.tsx` is a *file* — the
 * Billing tab itself — so there is no `(tabs)/billing/` directory for a child
 * route to live in, and a push to one of those paths silently did nothing. Since
 * the sheet is the primary entry point to the entire billing flow, that was a
 * dead end on the first tap.
 *
 * `settings` already had it right, and plan 06-21 corrected the rest to match:
 * every one of these is a full-screen form or picker that pushes *over* the tab
 * bar, exactly as `patient/register` does. Corrected here rather than at the
 * call sites so there stays one source of truth.
 */
export const BILLING_ROUTES = {
  /** Plan 06-21 — the D-06 Path B picker. */
  consultationPicker: '/(app)/billing/from-consultation',
  /** Plan 06-21 — the standalone builder. */
  newInvoice: '/(app)/billing/new',
  /**
   * D-04 Quick Sale screen (plan 06-18).
   *
   * Corrected from a `(tabs)` child to a `(tabs)` sibling — the original path
   * required `(tabs)/billing.tsx` to become a directory, a restructure no plan
   * in this phase owns. Quick Sale is a full-screen counter flow that pushes
   * over the tab bar anyway, the same shape as `settings` below. Route file:
   * `app/(app)/billing/quick-sale.tsx`.
   */
  quickSale: '/(app)/billing/quick-sale',
  /**
   * D-29 billing settings (plan 06-23). Unlike the two above it is a sibling of
   * `(tabs)`, not a child: it is an Admin form holding a live payment
   * credential, so it pushes over the tab bar the way `patient/register` does.
   */
  settings: '/(app)/billing/settings',
  /** One invoice. The builder replaces itself with this on finalize. */
  invoiceDetail: (invoiceId: string) => `/(app)/billing/${invoiceId}`,
  /**
   * D-22's credit note against an existing invoice (plan 06-22).
   *
   * A two-segment path under `billing/`, so it does not compete with the
   * one-segment `[invoiceId]` above. Expo Router resolves static segments ahead
   * of dynamic ones at the same depth, which is also what keeps `settings`,
   * `new`, `quick-sale` and `from-consultation` reachable now that a dynamic
   * sibling exists.
   */
  creditNote: (invoiceId: string) => `/(app)/billing/credit-note/${invoiceId}`,
  /**
   * Reopening a DRAFT in the builder (D-21: only a draft is editable). The
   * builder route already reads an optional `invoiceId` and hydrates from it.
   */
  editDraft: (invoiceId: string) => `/(app)/billing/new?invoiceId=${invoiceId}`,
} as const;

const COLORS = {
  surface: '#FFFBF5',
  primary: '#2E7D32',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
} as const;

/**
 * The Billing tab landing screen (D-24, D-28, D-33).
 *
 * ## The live-update subscription is the point, not a nicety
 *
 * `useInvoiceSocket()` is called once here, unconditionally, for as long as the
 * tab is mounted. A Razorpay webhook lands on the server while the front desk
 * has this screen open; without the subscription the only thing that would move
 * an invoice out of `UNPAID` on screen is someone happening to pull down to
 * refresh, which is how an invoice gets collected twice (T-06-94).
 *
 * ## Why the list is sometimes two queries
 *
 * D-24 says tapping "Unpaid Total" filters the list to unpaid *and* overdue.
 * The server's filter vocabulary has no such combined value, and the card sums
 * balances across `UNPAID | PARTIALLY_PAID | OVERDUE` — so a single `unpaid`
 * request would render a list that cannot add up to the number just tapped.
 * The composite selection runs both filters and merges them by the active sort
 * (`mergeInvoicePages`). Every other selection runs one query and leaves the
 * second one disabled.
 *
 * ## State ownership
 *
 * Filter, sort, search term and sheet visibility are ephemeral UI state and
 * live in `useState`. Server state is React Query's. The only thing in the
 * Zustand store is the offline flag, which other billing screens will need too
 * (D-41).
 */
export function BillingDashboardScreen() {
  const router = useRouter();
  useInvoiceSocket();

  const isOffline = useBillingUIStore((s) => s.isOffline);

  const [selection, setSelection] = useState<FilterSelection>(DEFAULT_INVOICE_FILTER);
  const [sort, setSort] = useState<InvoiceListSort>(DEFAULT_INVOICE_SORT);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const { searchTerm, setSearchTerm, debouncedSearch, isSearchActive } = useInvoiceSearch();
  const search = isSearchActive ? debouncedSearch.trim() : undefined;

  const statuses = selectionToStatuses(selection);
  const isComposite = selection === UNPAID_AND_OVERDUE;

  const dashboardQuery = useBillingDashboard();
  const primaryQuery = useInvoices({ status: statuses[0], sort, search });
  const secondaryQuery = useInvoices(
    { status: statuses[1] ?? 'overdue', sort, search },
    { enabled: isComposite },
  );

  const invoices = useMemo(
    () =>
      isComposite
        ? mergeInvoicePages([primaryQuery.data?.items, secondaryQuery.data?.items], sort)
        : (primaryQuery.data?.items ?? []),
    [isComposite, primaryQuery.data, secondaryQuery.data, sort],
  );

  const isError = primaryQuery.isError || (isComposite && secondaryQuery.isError);
  const isLoading = primaryQuery.isLoading || (isComposite && secondaryQuery.isLoading);
  const isFetching = primaryQuery.isFetching || (isComposite && secondaryQuery.isFetching);

  const listState = deriveListState({
    isLoading,
    isError,
    isSearchActive,
    isFetching,
    itemCount: invoices.length,
  });

  const exceptionBanner = billingExceptionBannerText(
    dashboardQuery.data?.billingExceptionCount ?? 0,
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      dashboardQuery.refetch(),
      primaryQuery.refetch(),
      isComposite ? secondaryQuery.refetch() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [dashboardQuery, primaryQuery, secondaryQuery, isComposite]);

  const handleSummaryCardPress = useCallback((card: SummaryCardKey) => {
    const next = summaryCardSelection(card);
    if (next) setSelection(next);
  }, []);

  const handleInvoicePress = useCallback(
    (invoice: InvoiceListItem) => {
      // The invoice detail route is plan 06-15's; pushing it here keeps the
      // list's press behaviour honest rather than silently inert. Routed through
      // BILLING_ROUTES so it shares the corrected namespace — the inline
      // `(tabs)/billing/...` path it used before could never resolve.
      router.push(BILLING_ROUTES.invoiceDetail(invoice.id) as never);
    },
    [router],
  );

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      tintColor={COLORS.primary}
    />
  );

  return (
    <View style={styles.container} testID="billing-dashboard-screen">
      {/*
       * D-28's settings entry point. The tab bar shows no header (`headerShown:
       * false` in `(tabs)/_layout.tsx`), and 06-14 established there is no
       * `More` tab to hang settings off and no drawer, so the gear lives at the
       * top of the screen body — the only header this surface has.
       */}
      <View style={styles.headerActions}>
        <SettingsGearButton
          icon="cog-outline"
          size={24}
          iconColor={COLORS.onSurfaceVariant}
          accessibilityLabel="Billing settings"
          onPress={() => router.push(BILLING_ROUTES.settings as never)}
          testID="billing-settings-gear"
        />
      </View>

      {isOffline && (
        <View style={styles.offlineBanner} testID="billing-offline-banner">
          <Text variant="bodySmall" style={styles.bannerText}>
            {BILLING_COPY.offlineBanner}
          </Text>
        </View>
      )}

      {exceptionBanner && (
        <View style={styles.exceptionBanner} testID="billing-exception-banner">
          <Text variant="bodySmall" style={styles.bannerText}>
            {exceptionBanner}. {BILLING_COPY.exceptionBannerHint}
          </Text>
        </View>
      )}

      <BillingSummaryHeader
        summary={dashboardQuery.data}
        isLoading={dashboardQuery.isLoading}
        onCardPress={handleSummaryCardPress}
        testID="billing-summary-header"
      />

      <View style={styles.searchRow}>
        <SearchBar
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder={BILLING_COPY.searchPlaceholder}
          testID="billing-search-bar"
        />
      </View>

      <InvoiceFilterChips
        selected={selectionToChips(selection)}
        onSelect={setSelection}
        disabled={isLoading}
        testID="billing-filter-chips"
      />

      <View style={styles.sortRow}>
        <InvoiceSortSelector
          selectedSort={sort}
          onSortChange={setSort}
          testID="billing-sort-selector"
        />
      </View>

      {listState === 'error' && (
        <View style={styles.errorBanner} testID="billing-error-state">
          <Text variant="bodySmall" style={styles.bannerText}>
            {BILLING_COPY.errorState}
          </Text>
        </View>
      )}

      <View style={styles.listArea}>
        {listState === 'loading' ? (
          <SkeletonLoader type="listRow" count={6} testID="billing-list-skeleton" />
        ) : (
          /*
           * One FlatList across the populated, empty, search-no-results and
           * error states rather than four sibling branches: the error copy
           * says "Pull down to try again", and a bare `EmptyState` is not
           * scrollable, so branching away from the list would print an
           * instruction the screen cannot actually obey.
           */
          <FlatList<InvoiceListItem>
            data={listState === 'populated' ? invoices : []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <InvoiceListCard invoice={item} onPress={() => handleInvoicePress(item)} />
            )}
            refreshControl={refreshControl}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              listState === 'searchNoResults' ? (
                <EmptyState
                  title={BILLING_COPY.searchNoResultsTitle}
                  description={BILLING_COPY.searchNoResultsBody}
                  testID="billing-search-no-results"
                />
              ) : listState === 'empty' ? (
                <EmptyState
                  title={BILLING_COPY.emptyTitle}
                  description={BILLING_COPY.emptyBody}
                  testID="billing-empty-state"
                />
              ) : null
            }
            testID="billing-invoice-list"
          />
        )}
      </View>

      <FAB
        icon="plus"
        label={BILLING_COPY.fabLabel}
        onPress={() => setSheetVisible(true)}
        style={styles.fab}
        color="#FFFFFF"
        testID="billing-new-invoice-fab"
      />

      <NewInvoiceSheet
        visible={sheetVisible}
        onDismiss={() => setSheetVisible(false)}
        onFromConsultation={() => router.push(BILLING_ROUTES.consultationPicker as never)}
        onQuickSale={() => router.push(BILLING_ROUTES.quickSale as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: 4,
  },
  offlineBanner: {
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  exceptionBanner: {
    backgroundColor: '#FFE0B2',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBanner: {
    backgroundColor: '#FFDAD6',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerText: {
    color: COLORS.onSurface,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
    // Clears the tab bar safe zone and the FAB.
    paddingBottom: 48,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: COLORS.primary,
  },
});
