---
phase: 05-inventory-management
plan: 07
subsystem: inventory-mobile-stock-take-want-list-navigation
tags: [expo-router, zustand, papaparse, expo-sharing, TDD, react-navigation-via-expo-router]
dependency_graph:
  requires: [inventory-types, inventory-validators, stock-take-api, want-list-api, inventory-mobile-list-and-item-screens, offline-barcode-cache, offline-operations-queue, scanner-state-store, stock-receipt-screen, stock-adjustment-sheet, dispense-screen]
  provides: [stock-take-screen, want-list-screen, csv-export-service, inventory-navigator, inventory-tab, inventory-dispense-cross-phase-hook]
  affects: [05-07-task-2 (human verification, separate)]
tech_stack:
  added: []
  patterns: [expo-router-nested-stack-under-tab, lib-pure-logic-extraction-for-testability, client-side-preview-before-server-commit, zustand-store-directly-testable-without-persist]
key_files:
  created:
    - apps/mobile/src/features/inventory/stores/stock-take.store.ts
    - apps/mobile/src/features/inventory/lib/stock-take-logic.ts
    - apps/mobile/src/features/inventory/hooks/useStockTakeSession.ts
    - apps/mobile/src/features/inventory/components/StockTakeItemRow.tsx
    - apps/mobile/src/features/inventory/components/StockTakeSummary.tsx
    - apps/mobile/src/features/inventory/screens/StockTakeScreen.tsx
    - apps/mobile/src/features/inventory/components/WantListItem.tsx
    - apps/mobile/src/features/inventory/components/WhatsAppShareButton.tsx
    - apps/mobile/src/features/inventory/screens/WantListScreen.tsx
    - apps/mobile/src/features/inventory/services/csv-export.service.ts
    - apps/mobile/src/navigation/InventoryNavigator.tsx
    - apps/mobile/src/navigation/inventory-navigation.ts
    - apps/mobile/src/features/inventory/index.ts
    - apps/mobile/app/(app)/(tabs)/inventory/_layout.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/index.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/add.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/scan.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/stock-take.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/want-list.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/[itemId]/index.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/[itemId]/edit.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/[itemId]/receive.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/[itemId]/dispense.tsx
    - apps/mobile/app/(app)/(tabs)/inventory/[itemId]/adjust.tsx
    - apps/mobile/tests/inventory/stock-take-logic.test.ts
    - apps/mobile/tests/inventory/stock-take.store.test.ts
    - apps/mobile/tests/inventory/csv-export.service.test.ts
  modified:
    - apps/mobile/app/(app)/(tabs)/_layout.tsx
    - apps/mobile/src/features/inventory/hooks/useBarcodeScan.ts
    - apps/mobile/src/features/inventory/hooks/useInventoryApi.ts
    - apps/mobile/src/features/inventory/screens/InventoryItemDetailScreen.tsx
    - apps/mobile/src/features/inventory/screens/InventoryListScreen.tsx
metrics:
  duration: ~2.5 hours
  completed: 2026-08-13
  tasks_completed: 1
  tasks_total: 2
---

# Phase 05 Plan 07 (Task 1): Stock-Take, Want-List, CSV Export, Navigation Wiring Summary

**This summary covers Task 1 only.** Task 2 of Plan 05-07 is a blocking human-verification checkpoint (10 end-to-end flows on a physical device) that must be run separately by the orchestrating session with the user directly -- see the placeholder section at the bottom of this file.

Built the stock-take screen (scan+select counting, client-side discrepancy preview, save/discard), the want-list screen (WhatsApp share + CSV export), the shared CSV export service, and -- the largest deviation from the plan's literal scope -- the **actual Expo Router route files that make every inventory screen from Plans 05-04/05-05/05-06 reachable for the first time**, since none of those screens had been wired into the route tree yet.

## What Was Built

### Stock-take (D-37, D-38, D-40)

- **`lib/stock-take-logic.ts`** (TDD) -- pure functions: `getDiscrepancy`/`getDiscrepancyStatus` (match/over/under), `isStockTakeSessionExpired` (24h TTL), `buildStockTakeSubmission` (validates via `stockTakeSchema`), `formatSignedQuantity`, and `computeClientSummary` -- a **client-side discrepancy preview** computed from cached `systemQty`/`actualCount` pairs, mirroring the server's exact math (`difference = actualCount - systemQty`) without calling the API.
- **`stores/stock-take.store.ts`** -- Zustand store (`entries: Map<itemId, StockTakeEntryState>`, `isActive`, `startedAt`), `addEntry`/`updateCount`/`removeEntry`/`clear`/`getEntries`/`isExpired()`. Directly unit-tested via `.getState()` (no persist middleware -- see Deviations).
- **`hooks/useStockTakeSession.ts`** -- wraps the store; auto-discards an expired (>24h) session on mount; `submitStockTake()` POSTs `/inventory/stock-take` and invalidates items/summary/alerts on success; `getPreviewSummary()` exposes the client-side preview; `cancelStockTake()` clears the store.
- **`components/StockTakeItemRow.tsx`** -- 56px row, "System: N unit", numeric "Actual Count" input, color-coded discrepancy (match=green/over=tertiary/under=error) with a 200ms `Animated` highlight fade on status change.
- **`components/StockTakeSummary.tsx`** -- Items Counted/Matches/Discrepancies/Over/Under/Value Difference, "Save Stock-Take" (filled) and an inline-confirmed "Discard" (matching `BatchList.tsx`'s existing confirmation pattern, not a native `Alert`).
- **`screens/StockTakeScreen.tsx`** -- "Scan Barcode" (pushes to `/inventory/scan?mode=stockTake`) / "Select Item" (bottom-sheet search over `useInventoryItems`), `FlatList` of `StockTakeItemRow`, "Complete Stock-Take" (computes the client preview, does **not** call the API yet) → shows `StockTakeSummary` → "Save Stock-Take" is what actually POSTs; "Cancel Stock-Take" has its own inline confirmation.

**Design decision — preview-before-commit, not commit-then-offer-discard**: `POST /inventory/stock-take` (stock-take.service.ts) has no dry-run mode; it's a single transaction that writes movements and updates `currentStock` immediately. If "Complete Stock-Take" called the API directly, "Discard" in the summary screen would be offering to undo something already committed to the database with no reversal endpoint to actually do so. Instead, "Complete Stock-Take" computes `computeClientSummary` (client-side, nothing persisted) and only "Save Stock-Take" calls the real endpoint -- matching the plan's own literal sequencing ("On save: ... toast 'Stock-take saved'" implies the toast/persistence happens at Save, not at Complete) and making "Discard" a real, honest no-op-on-the-server action.

### Want-list (D-06, D-24, D-28)

- **`components/WantListItem.tsx`** -- 56px, 12px padding, "[Name] -- Current: N, Par: P", tappable to item detail.
- **`components/WhatsAppShareButton.tsx`** -- fetches `GET /inventory/want-list/text`, writes to a temp file, opens the OS share sheet via `expo-sharing` (WhatsApp is one of the apps the sheet offers -- there's no direct "send to WhatsApp" API). States: default/sharing/shared; success toast "Want-list shared"; error toast "Could not share. Please try again."
- **`screens/WantListScreen.tsx`** -- "Want List" / "Items below par level", `FlatList` of `WantListItem`, `WhatsAppShareButton` + "Export CSV" outlined button, loading/populated/empty ("No items below par level" / "All items are adequately stocked.")/error states with pull-to-refresh.
- **`hooks/useInventoryApi.ts`** (additive) -- added `useWantList(clinicId)` (`GET /inventory/want-list`) and `fetchMovementsForExport(accessToken, itemId)` (plain async fn, not a query hook -- an on-demand export fetch has no caching benefit).

### CSV export (D-47)

- **`services/csv-export.service.ts`** -- `Papa.unparse` + UTF-8 BOM (`'[U+FEFF]'`) + `expo-file-system` + `expo-sharing`, per the RESEARCH.md pattern. `exportStockMovementsCSV(movements, itemName)` (Date/Type/Quantity/Batch/Reason/Running Total/User columns, `dd/MM/yyyy HH:mm` in Asia/Kolkata via native `Intl`, no `date-fns` dependency -- matching the precedent `want-list.service.ts` already set on the API side) and `exportWantListCSV(items, clinicName)`. Row-mapping (`mapMovementsToRows`, `mapWantListToRows`) and filename builders are pure, exported, and directly unit-tested (TDD) separately from the I/O functions.
- **`InventoryItemDetailScreen.tsx`'s "Export CSV" handler was refactored** to call this new service instead of its own inline `Papa.unparse` call (which lacked the BOM, used only `batchId` without the exact D-47 column names, and didn't format dates in IST) -- otherwise the new service would be dead code never reached by production UI.

### Navigation wiring -- the actual gap this plan closes

**Critical finding**: every inventory screen built by Plans 05-04/05-05/05-06 (`InventoryListScreen`, `InventoryItemDetailScreen`, `ItemFormScreen`, `BarcodeScannerScreen`, `StockReceiptScreen`, `DispenseScreen`, `StockAdjustmentSheet`) reads its params via `useLocalSearchParams()` and navigates via `router.push('/(app)/(tabs)/inventory/...')` -- but **no file under `apps/mobile/app/` for any of these routes existed until this plan**. Every prior summary explicitly documented this as deferred ("route wiring is a separate concern owned elsewhere"). This plan builds those route files for real, for the first time, closing the gap:

- **`apps/mobile/src/navigation/InventoryNavigator.tsx`** -- an Expo Router `<Stack>` (which *is* `@react-navigation/native-stack` under the hood -- this repo has no bare `@react-navigation` usage anywhere; `BottomTabNavigator.tsx`/`AppNavigator.tsx` named in the plan's `read_first` don't exist, the real equivalents are `app/(app)/(tabs)/_layout.tsx`/`app/(app)/_layout.tsx`) with a `<Stack.Screen>` per inventory route.
- **`apps/mobile/app/(app)/(tabs)/inventory/_layout.tsx`** re-exports `InventoryNavigator` as the tab's root layout (Expo Router requires layouts to live in the filesystem tree; the component itself lives in `src/navigation/` per the plan's literal path).
- **10 new route files** under `app/(app)/(tabs)/inventory/`: `index.tsx` (list), `add.tsx` (create), `scan.tsx` (scanner, `?mode=`), `stock-take.tsx`, `want-list.tsx`, and `[itemId]/index.tsx|edit.tsx|receive.tsx|dispense.tsx|adjust.tsx`. Every file is a thin wrapper (`export default function Route() { return <Screen />; }`) since every screen already reads its own params internally -- confirmed by reading each screen file directly before writing its route.
- **`app/(app)/(tabs)/_layout.tsx`** -- added a `Tabs.Screen name="inventory"` entry (title "Inventory", `package-variant-closed` icon), the standard Expo Router "tab that is itself a nested Stack" pattern.
- **`[itemId]/adjust.tsx`** is a route wrapper (not a thin pass-through) since `StockAdjustmentSheet` is a controlled component (`visible`/`itemId`/`itemName`/`unit`/`currentStock`/`onDismiss`), not a self-reading screen -- the wrapper fetches the item via `useInventoryItem` and renders the sheet with `visible` always true, `onDismiss={() => router.back()}`.
- **`InventoryListScreen.tsx`** (modified) -- added a "View Want List →" link below the Attention card and a "Stock-Take" icon button next to the barcode-scan icon (neither existed before; the plan's "wire the Attention card" instruction assumed a placeholder link that didn't actually exist). The Attention card's own Low Stock/Expiring Soon row taps were **already** calling the real `/(app)/(tabs)/inventory/${itemId}` path (Plan 05-04 built that correctly) -- they only needed the route file to exist, which this plan now provides; `AttentionCard.tsx` itself needed no changes.

### Cross-phase EMR hook (D-49)

- **`apps/mobile/src/navigation/inventory-navigation.ts`** (new, additive) -- `navigateToInventoryDispense(router, { itemId, consultationId?, petName? })`, mirroring `consultation-navigator.ts`'s exact `navigateToX(router, params)` convention (the one non-component navigation-helper pattern this repo already established), pushing to `[itemId]/dispense` with `consultationId`/`petName` attached only when present. `DispenseScreen.tsx` (Plan 05-06) already reads exactly these two optional params and renders "Linked to consultation: [Pet Name]" when `consultationId` is present -- confirmed by reading the file, not guessed.
- **`apps/mobile/src/features/inventory/index.ts`** (new, additive) -- the feature barrel Phase 4's EMR/prescription code is expected to import from (`navigateToInventoryDispense`, `InventoryNavigator`, and every screen). Checked: `MedicationForm.tsx` still hardcodes `inventoryItemId: null` (D-58's EMR-side fuzzy-match wiring was never completed in Phase 4) -- actually wiring the EMR "Dispense from inventory?" suggestion into `MedicationForm.tsx`/`MedicationCard.tsx` is Phase 4/6 scope, not this plan's; this barrel is the hook Phase 4 needs when that lands, not a claim that it's already connected.

### `useBarcodeScan.ts` (modified) -- connecting the scanner's stockTake mode to the new session store

Plan 05-05 already built a `stockTake` scan mode with its own local `actualCounts` state inside `useBarcodeScan.ts`/`ContinuousScanList`, but that mode had no connection to any session/store (the stock-take store didn't exist yet when it was built) and no submission path. Added one additive side effect: when `mode === 'stockTake'` and a scan resolves `found`, the item is also pushed into `useStockTakeStore.getState().addEntry(...)` -- the same store `StockTakeScreen` reads from. This is what makes "Scan Barcode" from `StockTakeScreen` actually flow counted items back into the review/summary/save pipeline, rather than being two disconnected UIs.

## Deviations from Plan (with justification)

| Plan text / assumption | What was actually built | Why |
|---|---|---|
| `read_first`: `apps/mobile/src/navigation/BottomTabNavigator.tsx`, `apps/mobile/src/navigation/AppNavigator.tsx` | Neither file exists. Real equivalents: `app/(app)/(tabs)/_layout.tsx` (Expo Router `<Tabs>`), `app/(app)/_layout.tsx` (Expo Router `<Stack>`) | This repo's navigation is 100% Expo Router (file-based), confirmed via `find apps/mobile/app` and grepping for any bare `@react-navigation` `NavigationContainer` usage (none). `consultation-navigator.ts` (Phase 4) already established the working pattern this plan follows. |
| `InventoryNavigator.tsx` framed as a `Stack.Screen`-based "Stack navigator ... register in BottomTabNavigator" | Built as an Expo Router `<Stack>` component, re-exported from a new `_layout.tsx` under `app/(app)/(tabs)/inventory/`, registered as a `Tabs.Screen name="inventory"` entry in the real tabs layout | Expo Router's `<Stack>` *is* `@react-navigation/native-stack` under the hood, so this genuinely satisfies "React Navigation stack with all inventory screens" (the must_haves key_link's literal grep target, `Stack\.Screen`, is present) -- it's just authored the way every other screen/navigator in this codebase already is. |
| **Not stated as a gap in the plan, but true**: no `app/` route files existed for *any* Plan 05-04/05-05/05-06 inventory screen | Created 10 new route files (`index.tsx`, `add.tsx`, `scan.tsx`, `stock-take.tsx`, `want-list.tsx`, `[itemId]/index\|edit\|receive\|dispense\|adjust.tsx`) plus the tab entry | Every prior plan's summary (05-04 through 05-06) explicitly logged "route wiring is a separate concern owned elsewhere" as an intentional out-of-scope boundary. This plan's own must_haves ("Navigation wiring connects all inventory screens") and Task 2's entire premise (a human manually taps through 10 flows on a device) are impossible to satisfy without these files existing. Built them, using each screen's own already-implemented `useLocalSearchParams`/`router.push` calls as the exact contract to match (no route path was invented -- every one was read from existing code first). |
| Plan's action step 5 implies "Complete Stock-Take" both computes and displays a summary, then "Save"/"Discard" act on it | "Complete Stock-Take" computes a **client-side preview** (`computeClientSummary`, no API call); "Save Stock-Take" is what actually calls `POST /inventory/stock-take` | `stock-take.service.ts` has no dry-run/preview endpoint -- it's one transactional commit. Committing on "Complete" and then offering "Discard" afterward would be presenting an undo that doesn't exist (no stock-take-reversal endpoint; `returnToStock` only accepts `dispensed` movements, not `stock_take` ones). The client preview mirrors the server's exact discrepancy math for `itemsCounted`/`matches`/`overCount`/`underCount`; only `valueDifference` is an approximation for entries added via barcode scan (no price data in `ScanResultItemView`) -- the **authoritative** summary (all fields, using real DB prices) still comes from the server's response once Save actually submits, and that's what drives the success toast. |
| `addEntry(itemId, itemName, unit, systemQty)` (plan's literal 4-arg signature) | `addEntry(itemId, itemName, unit, systemQty, sellingPrice?)` -- 5th arg optional | Needed for the client-side preview's `valueDifference` to be non-zero for items added via the item picker (which has full `InventoryItem.sellingPrice`); barcode-scanned entries omit it (offline/online scan result views don't carry price) and simply contribute 0 to the preview's value difference, which is corrected once the server responds. Additive, not a breaking change to the plan's literal shape. |
| `useBarcodeScan.ts`, `BarcodeScannerScreen.tsx` not in this plan's `files_modified` list | `useBarcodeScan.ts` modified (one additive `if (mode === 'stockTake') useStockTakeStore.getState().addEntry(...)` call + one dependency-array addition); `BarcodeScannerScreen.tsx` left untouched | Without this, "Scan Barcode" from `StockTakeScreen` would open the scanner's *own*, separate stockTake-mode counting UI (built by Plan 05-05 before this plan's store existed) with zero connection to the store `StockTakeScreen` reads from -- scanned items would never appear back on the stock-take review screen. This is the minimum viable glue; it doesn't change any existing return value, prop, or behavior of `useBarcodeScan` for `single`/`continuous` modes. |
| `InventoryListScreen.tsx`, `InventoryItemDetailScreen.tsx`, `AttentionCard.tsx` not in this plan's `files_modified` list | `InventoryListScreen.tsx` modified (added "View Want List" link + stock-take icon button); `InventoryItemDetailScreen.tsx` modified (CSV export refactored to use the new service); `AttentionCard.tsx` **not** modified (already correct) | Action steps 9 and 12 explicitly ask for exactly these two `InventoryListScreen.tsx` additions and to verify `AttentionCard.tsx`'s wiring, which on inspection was already correct (real route paths, just missing the route file this plan now provides) -- no change needed there. The CSV refactor keeps the new `csv-export.service.ts` from being orphaned/untested-in-production code. |
| `useInventoryApi.ts` not in this plan's `files_modified` list | Added `useWantList(clinicId)` and `fetchMovementsForExport(accessToken, itemId)` (additive only, following the exact precedent Plan 05-06 already set for this same file) | `WantListScreen.tsx` needs a query hook for `GET /inventory/want-list`; no such hook existed. `fetchMovementsForExport` is a plain function (not a `useQuery`) since an on-demand CSV export fetch has no caching benefit -- matches how `WhatsAppShareButton.tsx` also calls `apiClient` directly for its one-shot text fetch. |
| Store described as "Zustand: entries map ... persist via Zustand persist (survives app backgrounding)" | Built without `persist` middleware | Identical situation to `offline-queue.store.ts` (Plan 05-05): `@react-native-async-storage/async-storage` (the RN storage adapter `persist` needs) is not installed anywhere in this monorepo, and no store in this feature uses `persist`. Plain in-memory Zustand state already survives ordinary app backgrounding (the JS context stays alive); it does not survive the OS fully killing the process, which would need a new dependency to fix -- documented, not silently dropped. |
| `[itemId]/adjust.tsx`'s `?batchId=&reason=` query params (used by `InventoryItemDetailScreen`'s "Dispose expired batch?" confirmation, D-57) | Route wrapper reads `itemId` only; `batchId`/`reason` are not yet consumed/prefilled | `StockAdjustmentSheet.tsx` (Plan 05-06, explicitly out of this plan's file list) has no prefill props for a starting batch/reason. Adding them would mean modifying that component's props, which is outside this plan's scope -- documented as an open gap rather than silently guessed at. |

## Verification

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` (from `apps/mobile/`) -- exit 2, **71 errors**, `diff` against `.pre-existing-tsc-baseline.txt` -- **empty diff**. Zero new TypeScript errors from any file created or modified in this plan.
- `npx vitest run` (from `apps/mobile/`) -- **15 files, 208 tests, all passed** (162 pre-existing + 46 new: 19 `stock-take-logic.test.ts` + 13 `stock-take.store.test.ts` + 14 `csv-export.service.test.ts`).
- `npx vitest run src/` (from `apps/api/`) -- **18 files, 263 tests, all passed** -- confirmed no regression in the API from this mobile-only plan (no API files were touched).
- Root-level `npx vitest run` across the whole monorepo is **not** clean, but for reasons unrelated to this plan: a stale compiled `packages/validators/dist/__tests__/inventory.validators.test.js` artifact colliding with its own source test, `packages/ui`'s `Card.test.ts`/`QueueCard.test.ts` failing on a pre-existing Flow-syntax parse error in the root-level Vite/rolldown config (nothing in `packages/ui` was touched by this plan), and `apps/api/tests/queue/*` tests that need a live Postgres/Redis (per this repo's own CI setup, not available in this sandbox). None of the failing files are inventory-related or touched by this plan -- confirmed by grepping the failure output for "inventory" and finding only pre-existing, correctly-passing references.
- Manually traced every new route file's import path and every `router.push(...)` string already in the codebase (`InventoryListScreen.tsx`, `InventoryItemDetailScreen.tsx`, `ItemFormScreen.tsx`, `BarcodeScannerScreen.tsx`) against the route files created, confirming every existing navigation call now resolves to a real file.

### Every existing inventory screen is reachable from the navigator

| Screen | Reachable via |
|---|---|
| `InventoryListScreen` | "Inventory" bottom tab → `index.tsx` |
| `InventoryItemDetailScreen` | Tap any item card / Attention card row / Want-list row → `[itemId]/index.tsx` |
| `ItemFormScreen` (create) | FAB "Add Item" → `add.tsx` |
| `ItemFormScreen` (edit) | Item detail "Edit" header button → `[itemId]/edit.tsx` |
| `BarcodeScannerScreen` | Scan icon (list) or "Scan Barcode" (stock-take) → `scan.tsx?mode=` |
| `StockReceiptScreen` | Item detail "Receive Stock" button → `[itemId]/receive.tsx` |
| `DispenseScreen` | Item detail "Dispense" button, scanner quick action, or `navigateToInventoryDispense` (D-49) → `[itemId]/dispense.tsx` |
| `StockAdjustmentSheet` | Item detail "Adjust" button / "Dispose expired batch?" → `[itemId]/adjust.tsx` |
| `StockTakeScreen` | New stock-take icon button on the list screen → `stock-take.tsx` |
| `WantListScreen` | New "View Want List" link on the list screen → `want-list.tsx` |

## Self-Check: PASSED (Task 1 scope)

- [x] All 26 created files exist on disk; all 5 modified files updated (verified via `git status`)
- [x] TDD: `stock-take-logic.test.ts` (19 tests: discrepancy math, 24h expiry boundary, schema validation, client summary preview), `stock-take.store.test.ts` (13 tests, directly testing the Zustand store via `.getState()`, matching `scanner.store.test.ts`'s established precedent), `csv-export.service.test.ts` (14 tests: row mapping, BOM, filename builders) all written and passing
- [x] `npx tsc --noEmit -p apps/mobile/tsconfig.json` -- empty diff against `.pre-existing-tsc-baseline.txt`, 71 errors both sides
- [x] `npx vitest run` (mobile) -- 208/208 passed, no regressions from the prior 162
- [x] `npx vitest run src/` (api) -- 263/263 passed, no regressions
- [x] Every existing inventory screen (list/detail/form/scanner/receipt/dispense/adjust/stock-take/want-list) confirmed reachable via a real route file, traced against each screen's own existing `router.push` calls
- [x] Deviations documented with concrete evidence (grep/read results, exact file contents checked before writing each route) rather than silently diverging
- [x] D-37/D-38/D-40 (stock-take scan+count, 24h session expiry, client-preview-then-save), D-24/D-28 (want-list + WhatsApp share, exact D-28 text format reused server-side), D-47 (CSV export via papaparse+BOM+expo-file-system+expo-sharing), D-49 (cross-phase dispense navigation hook) all directly exercised by name-tagged tests or traced code paths

---

## Task 2: Human Verification of All Inventory End-to-End Flows -- NOT PART OF THIS SESSION

Task 2 of Plan 05-07 is an `autonomous: false`, blocking human-verification checkpoint (`type="checkpoint:human-verify"`) covering all 10 end-to-end inventory flows (Inventory List, Stock Receipt, Barcode Scanning, FIFO Dispensing, Stock Adjustment, Par-level Alerts, Want-List, Offline Scanning, Stock-Take, CSV Export) on a physical Android device. Per the orchestrating instructions, this task is **handled directly by the orchestrating session with the actual user**, not by this implementation session. This summary file's Task 1 section above is complete and self-contained; this Task 2 section is a placeholder to be filled in (or replaced) by whoever runs that verification pass, per the plan's own `<resume-signal>`: "Type 'approved' or describe issues for each flow."

Known items flagged for that verification pass by prior plans, still open as of Task 1:
- **05-05-SUMMARY.md's "Architecture Fix" section**: barcode camera integration was moved from `react-native-vision-camera` to `expo-camera` specifically because the former was architecturally incompatible with the scanner plugin -- confirmed fixed in code, but actual on-device barcode detection accuracy/speed is still unverified (no physical device in any implementation session so far).
- **`[itemId]/adjust.tsx`'s `?batchId=&reason=` prefill gap** (this plan's Deviations table) -- the "Dispose expired batch?" flow from `InventoryItemDetailScreen` navigates to the adjust screen but doesn't yet prefill the batch/reason; worth checking during the Stock Adjustment verification flow.
- **D-54 (retention/archival CSV+soft-delete)** remains explicitly deferred per 05-03-SUMMARY.md's gap-fill section (missing S3/file-storage infrastructure) -- unrelated to what's being verified in Task 2's 10 flows, but noted for completeness of the phase.
