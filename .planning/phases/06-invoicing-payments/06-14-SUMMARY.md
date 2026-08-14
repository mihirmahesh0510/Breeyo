---
phase: 06-invoicing-payments
plan: "14"
subsystem: ui
tags: [react-native, expo-router, react-query, socket-io, zustand, intl, money, billing]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-04 shared billing types/validators/socket events; 06-05 money.ts (formatPaiseINR parity target); 06-08 GET /billing/invoices; 06-12 GET /billing/dashboard"
  - phase: 05-inventory-pharmacy
    provides: "mobile list-screen pattern (SummaryHeader, CategoryFilterChips, SortSelector, InventoryListScreen) and the Inventory bottom tab"
  - phase: 03-patient-registration-walk-in-queue
    provides: "useQueueSocket Socket.IO pattern, usePatientProfile query-hook conventions"
provides:
  - "Billing bottom tab (D-28) and its landing screen"
  - "formatPaiseINR / formatPaiseCompact — the mobile side's only paise-to-display conversion"
  - "invoiceStatusLabel / invoiceStatusColors — the D-46-differentiated status badge vocabulary"
  - "useBillingDashboard, useInvoices, useInvoiceSocket, useInvoiceSearch"
  - "lib/dashboard-state.ts — the billing copy contract and screen state machine, testable without a renderer"
  - "billingUIStore — the shared offline flag every D-41 money-affecting screen needs"
affects: [06-15-invoice-detail, 06-16-payment-collection, 06-18-quick-sale, 06-19-credit-note-refund, 06-20-billing-settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All mobile billing money renders through one formatter that throws on a non-integer input"
    - "Screen decisions live in a React-Native-free lib/ module so they are testable in a repo that cannot render RN components"
    - "Composite filter selections are resolved client-side into two queries and merged by the active sort"

key-files:
  created:
    - apps/mobile/app/(app)/(tabs)/billing.tsx
    - apps/mobile/src/features/billing/screens/BillingDashboardScreen.tsx
    - apps/mobile/src/features/billing/components/BillingSummaryHeader.tsx
    - apps/mobile/src/features/billing/components/InvoiceListCard.tsx
    - apps/mobile/src/features/billing/components/InvoiceFilterChips.tsx
    - apps/mobile/src/features/billing/components/InvoiceSortSelector.tsx
    - apps/mobile/src/features/billing/components/NewInvoiceSheet.tsx
    - apps/mobile/src/features/billing/hooks/useBillingDashboard.ts
    - apps/mobile/src/features/billing/hooks/useInvoices.ts
    - apps/mobile/src/features/billing/hooks/useInvoiceSocket.ts
    - apps/mobile/src/features/billing/hooks/useInvoiceSearch.ts
    - apps/mobile/src/features/billing/lib/format.ts
    - apps/mobile/src/features/billing/lib/dashboard-state.ts
    - apps/mobile/src/features/billing/lib/invoice-query.ts
    - apps/mobile/src/features/billing/store/billingUIStore.ts
    - apps/mobile/src/features/billing/__tests__/format.test.ts
    - apps/mobile/src/features/billing/__tests__/BillingDashboardScreen.test.tsx
    - apps/mobile/src/features/billing/__tests__/invoice-query.test.ts
  modified:
    - apps/mobile/app/(app)/(tabs)/_layout.tsx

key-decisions:
  - "D-28's 'More'-tab replacement and drawer clauses are no-ops: the shipped app has no More tab. Billing was appended as the fourth tab after Queue, Patients and Inventory."
  - "D-46 implemented as label + outline: FINALIZED renders 'AWAITING PAYMENT' and UNPAID keeps the spec's secondaryContainer body with a tertiary (#E65100) outline, giving a three-step escalation ladder from existing Phase 2 tokens only."
  - "D-24's 'Unpaid Total filters to Unpaid + Overdue' is a client-side composite: the server's `unpaid` filter excludes OVERDUE while the card sums balances across it, so a single request would render a list that cannot reconcile with the tapped figure."
  - "The invoice list requests 30 rows per page (UI-SPEC Search Behavior), not the shared schema's server-side floor of 20."
  - "@breeyo/ui's StatusBadge could not carry the UI-SPEC colours — it has a closed 8-value variant union with baked-in colours and no colour props — so InvoiceListCard uses a local 20-line badge rather than widening the shared atom with Phase 6 billing semantics."
  - "Screen logic was extracted into React-Native-free lib/ modules because apps/mobile cannot render an RN component under test; this is the same resolution Phase 5 reached for useInventorySearch."

patterns-established:
  - "Money formatter parity: the mobile formatter is pinned to the API formatter's exact output for seven inputs by a hardcoded table test, since the two cannot share code"
  - "Copy contract as data: every UI-SPEC string lives in BILLING_COPY and is asserted by test, not scattered through JSX"
  - "Screen state machine as a pure function (deriveListState) so all six documented states are falsifiable"

requirements-completed: [BIL-03, RPT-01]

# Metrics
duration: 25min
completed: 2026-08-14
---

# Phase 06 Plan 14: Billing Tab Landing Surface Summary

**Billing bottom tab with a five-card live dashboard, a filterable/sortable invoice list, and one paise-only money formatter pinned to the server's output — plus a Socket.IO subscription that turns a Razorpay webhook into a visible status change without polling.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-14T07:30:00Z
- **Completed:** 2026-08-14T07:55:00Z
- **Tasks:** 3
- **Files created/modified:** 19

## Accomplishments

- Billing is now the fourth bottom tab; the change to `_layout.tsx` is purely additive (0 removed lines).
- All money on the Billing surface renders through `formatPaiseINR`, which **throws** on a non-integer input and whose output is pinned to `apps/api/src/modules/billing/money.ts` for seven inputs by a hardcoded table test.
- The dashboard renders five summary cards (D-24's four plus D-33's patients-seen-today), with skeletons rather than zeros while loading, tertiary accent above zero on Unpaid Total and Overdue, and D-24 tap-to-filter.
- D-36's `billingExceptionCount` is surfaced as a banner (`"N invoices need review"`) so a blocked invoice is discoverable rather than silently unactionable.
- `useInvoiceSocket` invalidates both the invoice list and the dashboard on `invoice:updated` and `payment:received`, and refuses to connect without both a token and an active clinic.
- 64 new tests, all passing; the full mobile suite is 275 passing.

## Task Commits

1. **Task 1: Money formatter, data hooks and live-update subscription** — `d48d4e8` (test, RED) → `be8a636` (feat, GREEN)
2. **Task 2: Billing tab registration and the dashboard screen** — `aecbba6` (test, RED) → `045505f` (feat) → `4240a48` (feat)
3. **Task 3: List card, filter chips, New Invoice sheet, screen-state tests** — components in `045505f`; request-contract tests in `ecf640f` (test)

## Files Created/Modified

| File | What it does |
|---|---|
| `apps/mobile/app/(app)/(tabs)/_layout.tsx` | **Modified** — appended the fourth `Tabs.Screen name="billing"` with the `receipt` icon |
| `apps/mobile/app/(app)/(tabs)/billing.tsx` | Thin route delegating to `BillingDashboardScreen` |
| `.../billing/screens/BillingDashboardScreen.tsx` | Summary header, search, chips, sort, list, FAB, offline/exception/error banners, pull-to-refresh |
| `.../billing/components/BillingSummaryHeader.tsx` | Five 64px cards, horizontally scrollable, skeletons while loading |
| `.../billing/components/InvoiceListCard.tsx` | 80px card; money only via `formatPaiseINR`; local status badge with the D-46 outline |
| `.../billing/components/InvoiceFilterChips.tsx` | Six chips derived from `INVOICE_LIST_FILTERS` |
| `.../billing/components/InvoiceSortSelector.tsx` | Bottom-sheet sort selector, five documented orders |
| `.../billing/components/NewInvoiceSheet.tsx` | The two D-24 options; destinations injected as callbacks |
| `.../billing/hooks/useBillingDashboard.ts` | `GET /billing/dashboard`, clinic-scoped key, 30s staleTime |
| `.../billing/hooks/useInvoices.ts` | `GET /billing/invoices`, clinic-scoped key, optional `enabled` for the composite second call |
| `.../billing/hooks/useInvoiceSocket.ts` | `invoice:updated` / `payment:received` → invalidate list + dashboard; drives the offline flag |
| `.../billing/hooks/useInvoiceSearch.ts` | 300ms / 2-char debounce, with the decision logic split out as a pure function |
| `.../billing/lib/format.ts` | `formatPaiseINR`, `formatPaiseCompact`, `invoiceStatusLabel`, `invoiceStatusColors`, `formatInvoiceDate` |
| `.../billing/lib/dashboard-state.ts` | `BILLING_COPY`, summary cards, filter selection, screen states, card fields, page merge |
| `.../billing/lib/invoice-query.ts` | Query-string serialiser parsed through `invoiceListQuerySchema` |
| `.../billing/store/billingUIStore.ts` | Ephemeral offline flag (D-41), no middleware, no persistence |
| `.../billing/__tests__/format.test.ts` | 22 tests incl. the seven-input API parity table |
| `.../billing/__tests__/BillingDashboardScreen.test.tsx` | 32 tests across the six screen states, tap-to-filter, card fields, merge |
| `.../billing/__tests__/invoice-query.test.ts` | 10 tests on the request contract and the debounce contract |

## Decisions Made

### D-28 was mostly a no-op, but not for the reason the plan expected

The plan asserted there was no Inventory tab and that Billing would be the third. **There is one** — Phase 5's mobile surface shipped `app/(app)/(tabs)/inventory/`. So the bar is now exactly what D-28 specifies: `Queue | Patients | Inventory | Billing`.

The "replace the More tab" and "move More items to a drawer" clauses remain no-ops: there is no `More` tab anywhere in `app/(app)/(tabs)/`, so nothing was replaced and nothing had to move. No drawer was invented.

### D-33 — the fifth card ships, and the spec is stale

`06-UI-SPEC.md`'s copy table still lists four summary cards. `dashboard.service.ts` already returns `patientsSeenToday`, so the fifth card ("Patients Today") is rendered per the decision, not the spec. Because five 64px cards would wrap to 2+2+1 in Phase 5's grid layout and push the invoice list below the fold, the header is a single horizontally-scrolling 64px row instead.

### D-46 — differentiating FINALIZED from UNPAID

`06-UI-SPEC.md` gives both states the same `secondaryContainer` swatch and near-identical wording, which is precisely the confusion D-46 rules out. Resolved with **no new tokens**:

| State | Label | Background | Text | Outline |
|---|---|---|---|---|
| `FINALIZED` | `AWAITING PAYMENT` | `#D7CCC8` | `#3E2723` | — |
| `UNPAID` | `UNPAID` | `#D7CCC8` | `#3E2723` | `#E65100` (tertiary) |
| `OVERDUE` | `OVERDUE` | `#FFE0B2` | `#BF360C` | — |

That reads as an escalation ladder (locked → nothing collected → past due) and reuses `tertiary`'s existing meaning on this screen, where it already marks "Unpaid Total > 0".

`AWAITING PAYMENT` deviates from the UI-SPEC typography table's literal `FINALIZED`. It states what the staff member needs to know rather than naming an internal lifecycle state, which is the D-46 intent. **06-UI-SPEC.md should be updated to match.**

### D-24 tap-to-filter needed a client-side composite

D-24: tapping Unpaid Total filters to "Unpaid" + "Overdue". But:

- `INVOICE_LIST_FILTERS`' `unpaid` maps server-side to `FINALIZED | UNPAID | PARTIALLY_PAID` and **excludes** `OVERDUE` (`invoice.repository.ts:256-262`).
- The Unpaid Total card sums `balance_paise` across `UNPAID | PARTIALLY_PAID | OVERDUE` (`dashboard.service.ts:136-138`).

So mapping the tap to the `unpaid` chip alone would show a list that cannot add up to the figure just tapped — worse than no drill-down. Adding a seventh literal to the shared constant would have added a seventh chip and broken the D-24 chip contract, so the composite (`UNPAID_AND_OVERDUE`) is a client-side selection resolved into two requests and merged by the active sort (`mergeInvoicePages`, deduplicated by id, comparators mirroring the server's `orderBy`). Both `Unpaid` and `Overdue` chips render selected while it is active.

### `@breeyo/ui`'s `StatusBadge` could not be used

`StatusBadge` has a closed eight-value `StatusVariant` union with colours baked into `STATUS_CONFIG` and **no colour props**. It has `paid`, `unpaid` and `overdue` but no `draft`, `finalized`, `partiallyPaid` or `voided`, and no way to express the D-46 outline. The plan's instruction to "pass the UI-SPEC colours in" is not expressible against the current API. `InvoiceListCard` therefore renders a local ~20-line badge, so Phase 6 billing status semantics stay out of the design system.

### Routes the New Invoice sheet targets (for plan 06-18)

Declared as `BILLING_ROUTES` in `BillingDashboardScreen.tsx`:

| Option | Route |
|---|---|
| From Consultation | `/(app)/(tabs)/billing/from-consultation` |
| Quick Sale | `/(app)/(tabs)/billing/quick-sale` |
| (invoice card press, 06-15) | `/(app)/(tabs)/billing/[invoiceId]` |

**Action required in 06-15/06-18:** `app/(app)/(tabs)/billing.tsx` is currently a **leaf file route**. To host the nested routes above it must be converted to `app/(app)/(tabs)/billing/_layout.tsx` + `app/(app)/(tabs)/billing/index.tsx` (the same shape `inventory/` already uses). That conversion is out of this plan's file scope and was deliberately not done here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] React Native components cannot be rendered under test in this repo**

- **Found during:** Task 1 (before writing any test)
- **Issue:** The plan requires `BillingDashboardScreen.test.tsx` written with React Native Testing Library. `apps/mobile/vitest.config.ts` uses the `node` environment with no Metro/Babel transform, so `import 'react-native'` fails at parse time (`Error: Expected 'from', got 'typeOf'` — verified with a throwaway spike), and `react-test-renderer` (RNTL's required peer) is not installed. Every existing test under `apps/mobile/tests` documents the same constraint; none renders a component.
- **Fix:** Extracted every rendering decision into React-Native-free modules — `lib/dashboard-state.ts` (copy contract, summary cards, screen state machine, tap-to-filter mapping, card field derivation, page merge) and `lib/invoice-query.ts` (request serialiser) — and wrote the tests against those. The components are thin renderers over them. This is the identical resolution Phase 5 reached (`getSearchDerivedState` in `useInventorySearch.ts`). Standing up a real RN harness (`babel-preset-expo` + jsdom + `react-test-renderer` + aliasing) is an app-wide test-infrastructure change affecting every remaining Phase 6 mobile plan — Rule 4 territory, deliberately not attempted here. **Deferred item below.**
- **Files:** `lib/dashboard-state.ts`, `lib/invoice-query.ts`, all three test files
- **Verification:** 64 billing tests passing; 275 across the mobile package.
- **Committed in:** `aecbba6`, `045505f`, `ecf640f`

**2. [Rule 2 - Missing Critical] `unpaid` filter cannot reconcile with the Unpaid Total card**

- **Found during:** Task 2
- **Issue:** See "D-24 tap-to-filter" above. Following the plan literally would have produced a drill-down whose rows cannot sum to the number tapped.
- **Fix:** `UNPAID_AND_OVERDUE` composite selection, two queries merged client-side. `useInvoices` gained an `enabled` option so the second query stays off for non-composite selections (rules of hooks).
- **Files:** `lib/dashboard-state.ts`, `hooks/useInvoices.ts`, `screens/BillingDashboardScreen.tsx`
- **Verification:** `mergeInvoicePages` covered by 3 tests (ordering across all five sorts, nulls-last on due date, dedup).
- **Committed in:** `045505f`, `4240a48`

**3. [Rule 2 - Missing Critical] Error state printed an instruction the screen could not obey**

- **Found during:** Task 2
- **Issue:** The UI-SPEC error copy is "Could not load invoices. **Pull down to try again.**" Branching to a bare `EmptyState` (the Phase 5 precedent) renders a non-scrollable view, so pulling down does nothing.
- **Fix:** One `FlatList` with `RefreshControl` spans the populated, empty, search-no-results and error states; the error copy renders as an inline banner above it. Pull-to-refresh works in every state.
- **Files:** `screens/BillingDashboardScreen.tsx`
- **Committed in:** `4240a48`

**4. [Rule 1 - Bug] Page size did not match the UI-SPEC search contract**

- **Found during:** Task 3
- **Issue:** `useInvoices` inherited `invoiceListQuerySchema`'s default `limit: 20`; `06-UI-SPEC.md` `## Search Behavior (Phase 6)` specifies 30 results per query.
- **Fix:** `INVOICE_PAGE_SIZE = 30`, set explicitly before the schema parse.
- **Verification:** `invoice-query.test.ts` asserts `limit=30` by default and that an explicit override still wins.
- **Committed in:** `ecf640f`

**5. [Rule 3 - Blocking] Grep gates tripped on the comments explaining them**

- **Found during:** Task 2 verification
- **Issue:** The plan's `grep -rn 'toFixed' apps/mobile/src/features/billing/` gate matched three doc comments that named the forbidden tokens while explaining why they are forbidden.
- **Fix:** Rewrote those comments to describe the prohibition without writing the literal tokens — the same approach `dashboard.service.ts` takes for the API's SQL gates ("a gate that trips on the comment explaining the trap is worse than no gate").
- **Verification:** `grep -rn 'toFixed' apps/mobile/src/features/billing/` → no output. `grep -cE 'toFixed|/ *100' InvoiceListCard.tsx` → `0`.
- **Committed in:** `4240a48`

**6. [Rule 2 - Missing Critical] D-36 exception count had no surface**

- **Found during:** Task 2
- **Issue:** `billingExceptionCount` (post-dates the UI-SPEC) is the only thing in the product that surfaces `exception_flag`. A flagged invoice blocks every status-changing action on itself; with nothing rendering the count, the only symptom staff would see is that they can no longer act on an invoice and cannot see why.
- **Fix:** `billingExceptionBannerText(count)` → a tertiary banner reading `"N invoices need review. Payments on these need a staff decision."`, rendered only when non-zero. Informational only — the exceptions *list* screen remains out of scope (see Deferred Items).
- **Verification:** 2 tests (null at zero, singular/plural above zero).
- **Committed in:** `045505f`, `4240a48`

### Unmet acceptance criteria (with reasons)

Three of the plan's grep criteria could not be met as written. All three are proxies for "the UI-SPEC copy is encoded, not invented", and that property is asserted directly and more strongly by `BillingDashboardScreen.test.tsx`.

| Criterion | Actual | Why |
|---|---|---|
| `grep -c "Today's Revenue" BillingSummaryHeader.tsx` = 1 (and the other four labels) | 1 each ✅ | Met — the labels appear in the component's `CARD_HINTS` accessibility map. The canonical source is `dashboard-state.ts`. |
| `grep -cE "'All'\|'Draft'\|..." InvoiceFilterChips.tsx` ≥ 6 | 0 | Chip labels live in `INVOICE_FILTER_LABELS` (`dashboard-state.ts`) and are imported. They had to live in a React-Native-free module to be assertable at all — see deviation 1. Asserted by test instead. |
| `grep -c 'From Consultation' NewInvoiceSheet.tsx` = 1, same for `Quick Sale` | 0 | Same reason: `NEW_INVOICE_OPTIONS` lives in `dashboard-state.ts`. Asserted by test. |
| `grep -c 'Could not load invoices...'` / `'No invoices yet'` / `'You are offline...'` / `'Search by invoice number...'` in `BillingDashboardScreen.tsx` = 1 each | 0 | Same reason: all in `BILLING_COPY`. Each is asserted verbatim by test. |
| `grep -c 'useInvoiceSocket' BillingDashboardScreen.tsx` = 1 | 3 | Unsatisfiable with a real import: the import line plus the call site is already 2. The intent (called exactly once) holds — there is one call site. |
| `pnpm --filter @breeyo/mobile exec tsc --noEmit` exits 0 | exits 2 | **Pre-existing baseline**, out of scope. 61 errors on `main` before this plan, all in `packages/ui` and unrelated app files (`react-native-paper` `Text` + `React.createElement` children typing). Verified 61 before and 61 after — this plan adds zero new type errors, and `grep 'features/billing'` over the output is empty. |

---

**Total deviations:** 6 auto-fixed (1× Rule 1, 3× Rule 2, 2× Rule 3)
**Impact on plan:** All six were necessary for correctness or to make the plan's own verification possible. No scope creep — no exceptions-management screen, no invoice detail, no drawer.

## Issues Encountered

- **Worktree started from `origin/main`**, far behind the phase branch. Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (`f3dc6e6`), then `pnpm install` and built `@breeyo/types` + `@breeyo/validators` before doing anything else.
- **The plan's premise about the tab bar was wrong** — Phase 5's mobile Inventory tab does exist. Billing was appended as the fourth tab rather than the third; the change is still purely additive.

## Deferred Items

1. **React Native test harness.** `apps/mobile` cannot render a component under test. Standing one up (`babel-preset-expo`, jsdom, `react-test-renderer@18.3.1`, RN aliasing) would let the remaining Phase 6 mobile plans assert on rendered output rather than on extracted logic. App-wide infrastructure change; needs its own plan.
2. **Billing exceptions list screen (D-35/D-36).** The count is surfaced; the list it should link to does not exist. Also noted as deferred in `06-12-SUMMARY.md`.
3. **Cursor pagination.** `nextCursor` is returned by the API and typed in `InvoiceListPage`, but the list renders a single 30-row page with no infinite scroll. The composite unpaid+overdue selection shows the first 30 of each status.
4. **`billing.tsx` → `billing/` directory conversion**, required before 06-15's invoice detail or 06-18's Quick Sale routes can exist (see "Routes the New Invoice sheet targets").
5. **Real connectivity detection.** `isOffline` is driven purely by the Socket.IO connection lifecycle, which is a good proxy but not `@react-native-community/netinfo`. Same state Phase 5 left `useIsOffline` in.
6. **06-UI-SPEC.md updates** for D-33 (fifth summary card), D-46 (`AWAITING PAYMENT` label and the `UNPAID` outline) and D-36 (exception banner copy).

## Threat Model Coverage

| Threat | Mitigation as built |
|---|---|
| T-06-91 (100x money display error) | One formatter; `Number.isInteger` guard throws; seven-input API parity table; `grep -rn 'toFixed' features/billing/` → no output; `grep -cE 'toFixed\|/ *100' InvoiceListCard.tsx` → 0 |
| T-06-92 (stale cross-clinic cache) | `activeClinicId` in `['billing','dashboard',id]` and `['invoices',id,...]` |
| T-06-93 (unauthenticated socket) | `useInvoiceSocket` returns before `io()` unless both `accessToken` and `activeClinicId` are present |
| T-06-94 (stale unpaid status → double collection) | `INVOICE_UPDATED` and `PAYMENT_RECEIVED` both invalidate list + dashboard; reconnect also refetches; pull-to-refresh is the fallback |
| T-06-95 (`₹0.00` reads as "no revenue") | `BillingSummaryHeader` renders five skeleton card slots while `isLoading`; `deriveListState` returns `'loading'` before any zeroed value can render |

## Known Stubs

None. Every component is wired to a live query. The two forward routes (`from-consultation`, `quick-sale`) are `router.push` calls to paths plan 06-18 will create — deliberate forward references recorded above, not stubbed data.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `formatPaiseINR`, `invoiceStatusLabel` and `invoiceStatusColors` are ready for 06-15 (invoice detail), 06-16 (payment collection), 06-18 (quick sale) and 06-19 (credit note / refund) to import.
- `useInvoiceSocket` and `billingUIStore.isOffline` are ready to be reused by every D-41 money-affecting screen.
- **Blocker for 06-15/06-18:** `app/(app)/(tabs)/billing.tsx` must become `billing/_layout.tsx` + `billing/index.tsx` before any nested billing route can exist.

## Self-Check: PASSED

- All 19 created/modified files verified present on disk.
- All 6 task commits verified present in `git log`.
- `pnpm --filter @breeyo/mobile test` → 18 files, 275 tests passing.
- `pnpm --filter @breeyo/mobile exec tsc --noEmit` → 61 errors, identical to the
  pre-existing baseline; zero under `features/billing`.
- `grep -rn 'toFixed' apps/mobile/src/features/billing/` → no output.
- `git diff app/(app)/(tabs)/_layout.tsx | grep -c '^-[^-]'` → `0` (purely additive).

---
*Phase: 06-invoicing-payments*
*Completed: 2026-08-14*
