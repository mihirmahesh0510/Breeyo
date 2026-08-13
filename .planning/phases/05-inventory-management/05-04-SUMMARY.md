---
phase: 05-inventory-management
plan: 04
subsystem: inventory-mobile-list-and-item-screens
tags: [expo-router, react-query, react-native-paper, breeyo-ui, zod, vitest, TDD-where-testable]
dependency_graph:
  requires: [inventory-types, inventory-validators, inventory-constants, inventory-item-crud-api, stock-receipt-api, barcode-lookup-api, fifo-dispense-api, stock-adjustment-api, par-level-alert-api, want-list-api, stock-movement-history-api]
  provides: [inventory-list-screen, inventory-item-detail-screen, inventory-item-form-screen, inventory-mobile-api-hooks]
  affects: [05-05, 05-06, 05-07, 05-08]
tech_stack:
  added: []
  patterns: [react-query-hooks-per-endpoint, zod-schema-output-typed-mutations, presigned-url-upload, pure-logic-extraction-for-testability, lazy-draft-item-creation]
key_files:
  created:
    - apps/mobile/src/features/inventory/hooks/useInventoryApi.ts
    - apps/mobile/src/features/inventory/hooks/useInventorySearch.ts
    - apps/mobile/src/features/inventory/hooks/useItemPhotoUpload.ts
    - apps/mobile/src/features/inventory/components/SummaryHeader.tsx
    - apps/mobile/src/features/inventory/components/AttentionCard.tsx
    - apps/mobile/src/features/inventory/components/InventoryItemCard.tsx
    - apps/mobile/src/features/inventory/components/CategoryFilterChips.tsx
    - apps/mobile/src/features/inventory/components/SortSelector.tsx
    - apps/mobile/src/features/inventory/components/ItemProfileHeader.tsx
    - apps/mobile/src/features/inventory/components/BatchList.tsx
    - apps/mobile/src/features/inventory/components/StockMovementTimeline.tsx
    - apps/mobile/src/features/inventory/components/ItemDetailsTab.tsx
    - apps/mobile/src/features/inventory/components/ItemPhotoPicker.tsx
    - apps/mobile/src/features/inventory/screens/InventoryListScreen.tsx
    - apps/mobile/src/features/inventory/screens/InventoryItemDetailScreen.tsx
    - apps/mobile/src/features/inventory/screens/ItemFormScreen.tsx
    - apps/mobile/tests/inventory/useInventorySearch.test.ts
    - apps/mobile/tests/inventory/useItemPhotoUpload.test.ts
  modified: []
metrics:
  duration: ~3 hours
  completed: 2026-08-12
  tasks_completed: 2
  tasks_total: 2
---

# Phase 05 Plan 04: Inventory List, Item Profile, and Item Form Screens Summary

Built the mobile `features/inventory` directory from scratch (it did not exist before this plan): the Inventory tab landing screen (summary dashboard, tabbed Attention alerts, debounced search, category filters, sort selector, item cards, FAB), the item profile screen (tabbed Batches/History/Details with a CSV-exportable movement timeline), and the item creation/edit form (category/unit pickers backed by the merged predefined+custom API endpoints, a real presigned-URL photo upload, and inline barcode-conflict handling per D-63). TDD applied where the plan's behavior bullets described genuinely testable logic (search debounce thresholds, the photo-upload orchestration sequence); the rest is composition/UI code per the orchestrator's guidance.

## What Was Built

### Task 1: Inventory list screen, hooks, and supporting components

- **`hooks/useInventoryApi.ts`** — nine query/mutation hooks exactly as named in the plan (`useInventoryItems`, `useInventorySummary`, `useInventoryAlerts`, `useInventoryItem`, `useItemMovements`, `useCreateItem`, `useUpdateItem`, `useInventoryCategories`, `useInventoryUnits`), plus `useAddItemBarcode`/`useRemoveItemBarcode`/`useRequestPhotoUploadUrl` needed for Task 2. `useCreateItem`/`useUpdateItem` invalidate items/summary/categories/units caches (D-61: creating or editing an item can register a new clinic-wide category/unit).
- **`hooks/useInventorySearch.ts`** — 300ms debounce, 2-character minimum (D-31), mirroring `usePatientSearch.ts`'s debounce pattern. The decision logic (`isSearchActive`/`isSearching`) is pulled into an exported pure function `getSearchDerivedState` for testability (see Deviations).
- **`components/SummaryHeader.tsx`** — 4 summary cards (Total Items, Low Stock, Expiring Soon, Total Value), tertiary-colored counts when > 0, skeleton loading state, tappable Low Stock/Expiring cards.
- **`components/AttentionCard.tsx`** — "Attention Needed" card with 3 tabs (Low Stock/Expiring Soon/Expired), count badges, empty-tab copy per UI-SPEC, hidden entirely when all counts are 0 (D-26).
- **`components/InventoryItemCard.tsx`** — 72px card with category icon, color-coded stock level via `getStockLevelStatus`, Schedule H badge, out-of-stock indicator, optional expiry badge (see Deviations on why it won't show yet in practice).
- **`components/CategoryFilterChips.tsx`** — horizontal `BreeyoChip` scroll, "All" + predefined + clinic-custom categories from `useInventoryCategories`.
- **`components/SortSelector.tsx`** — self-contained trigger + `@breeyo/ui` `BottomSheet` with the 5 D-36 sort options, default Name (A-Z).
- **`screens/InventoryListScreen.tsx`** — composes all of the above plus a `SearchBar` + barcode-scan icon button, FAB "Add Item", pull-to-refresh (invalidates items/summary/alerts), and all 7 states (empty/loading/populated/searching/searchNoResults/error/offline).

### Task 2: Item profile screen, item form, and photo upload

- **`components/ItemProfileHeader.tsx`** — name, category badge, Schedule H badge, color-coded total stock, selling/purchase price, photo or category-icon placeholder.
- **`components/BatchList.tsx`** — batch rows (lot/qty/expiry/purchase price/supplier/received date), EXPIRED badge, inline "Dispose expired batch?" confirmation per the UI-SPEC destructive-action pattern (routes to a Plan 06 adjust-flow placeholder on confirm — see Deviations).
- **`components/StockMovementTimeline.tsx`** — movement rows with `STOCK_MOVEMENT_TYPES` icon/color, movement-type-specific labels, "Counter Sale" badge (dispensed + no consultationId), running total, infinite-scroll pagination, "Export CSV" trigger (actual CSV generation lives in the detail screen via papaparse + expo-file-system + expo-sharing).
- **`components/ItemDetailsTab.tsx`** — barcodes list with remove-in-edit-mode, unit, distributor (from the latest batch with a supplier), par level, notes, photo.
- **`hooks/useItemPhotoUpload.ts`** — `pickAndUpload(itemId)`: camera/gallery action sheet → `POST .../photo-upload-url` → `FileSystem.uploadAsync` PUT to S3 → returns the real `photoUrl`. The request-then-PUT sequence is pulled into an exported pure(ish) function `uploadPickedPhotoToPresignedUrl` for testability (see Deviations).
- **`components/ItemPhotoPicker.tsx`** — empty/uploading/has-photo/error states per D-64, disabled with helper copy until `itemId` exists, inline "Remove photo?" confirmation.
- **`screens/InventoryItemDetailScreen.tsx`** — `ItemProfileHeader` + custom 3-tab bar (Batches/History/Details) + Receive Stock/Dispense/Adjust action row (placeholder routes — Plan 06 owns the real flows) + "Edit" header button + pull-to-refresh + loading/error states + CSV export handler.
- **`screens/ItemFormScreen.tsx`** — required fields (Name, Category, Unit, Selling Price) via `FormField`, category/unit bottom-sheet pickers (predefined options from `useInventoryCategories`/`useInventoryUnits` + free-text "Add Custom" entry — no separate API call needed since the item-save call itself registers a new clinic-level category/unit per D-61's repository-level upsert), optional fields (Par Level, Schedule H switch, Notes, `ItemPhotoPicker`), barcode add/remove with inline D-63 conflict handling ("This barcode is linked to '[Item]'" + "View Item" link), zod validation via `createItemSchema`/`updateItemSchema`, and the create-mode "lazy draft item" ordering the plan specified (see below).

**Create-mode ordering implementation**: a `useEffect` watches the 4 required fields; the moment they're all valid (and no item exists yet), it silently calls `useCreateItem` to create a draft item and stores the id in `draftItemId`. From that point on, `ItemPhotoPicker`/barcode-add are enabled (itemId-scoped), and the final "Save Item" tap runs `updateItem` against the draft (not a second `createItem`) with the full current field set. The success toast still reads "[Item Name] added to inventory" in this case — driven by whether the screen was navigated to with an `itemId` route param (`isEditMode`), not by which internal API call happened to fire.

## Deviations from Plan (with justification)

| Plan text / assumption | What was actually built | Why |
|---|---|---|
| `apps/mobile/src/features/inventory/` already has files to read (`screens/InventoryListScreen.tsx` etc. in `read_first`) | The entire `features/inventory/` directory did not exist; created from scratch | Plans 05-01/02/03 only built shared types/validators and the API — no mobile inventory code existed yet. This plan is the first to create it. |
| `read_first`: `apps/mobile/src/components/SearchBar.tsx`, `EmptyState.tsx`, `FAB.tsx`, `Card.tsx`, `Chip.tsx` | Used `@breeyo/ui`'s `SearchBar`, `EmptyState`, `Card`, `BreeyoChip`, `BottomSheet`, `FormField`, `Button`, `BreeyoIconButton`, `SkeletonLoader`; `FAB` imported directly from `react-native-paper` | `apps/mobile/src/components/` does not exist. Confirmed via `PatientListScreen.tsx`/`PatientDetailScreen.tsx`/`EditPetForm.tsx` that Phase 3/4 screens import base components from `@breeyo/ui` and import `FAB`/`Text`/`ActivityIndicator`/`Switch` directly from `react-native-paper` — matched that exact convention rather than a nonexistent local components folder. |
| `read_first`: `apps/mobile/src/theme/tokens.ts` | Hardcoded hex colors in local `StyleSheet` objects per file (e.g. `#2E7D32`, `#E65100`, `#BA1A1A`) | No such file exists; design tokens live in `packages/ui/src/theme/*`. Every existing Phase 3/4 screen (`PatientListScreen.tsx`, `PatientDetailScreen.tsx`, `VisitTimeline.tsx`, `OfflineBanner.tsx`) hardcodes the same Phase 2 palette hex values locally rather than importing `useAppTheme()` — followed that established convention instead of introducing theme-hook usage nothing else in mobile screens uses. |
| `read_first`: `apps/mobile/src/navigation/BottomTabNavigator.tsx` | Not touched; the real tab layout is `apps/mobile/app/(app)/(tabs)/_layout.tsx` (Queue + Patients only, no Inventory tab yet) | That file doesn't exist under that name. Adding an "Inventory" tab entry plus the `app/(app)/(tabs)/inventory*.tsx` route files that would render these three screens is Expo Router wiring, not listed in this plan's `files_modified`, and out of scope. All three screens are fully built, exported, and ready to be dropped into route files by whichever plan/task owns that wiring; navigation between them uses placeholder route-string paths (e.g. `/(app)/(tabs)/inventory/${itemId}`) per the task's explicit instruction to reference future routes as strings rather than build them. |
| D-64 spec: compress via `expo-image-manipulator` if over ~1MB | Used the image picker's own `quality: 0.6`/`aspect: [1,1]` options (same as Phase 3's `PetPhotoPicker`) instead of a separate `manipulateAsync()` resize step | `expo-image-manipulator` is not an installed dependency anywhere in this monorepo (confirmed absent from `apps/mobile/package.json` and `node_modules`). The one file that already imports it, `features/attachment/hooks/useFileUpload.ts`, is itself a pre-existing baseline TS error (`Cannot find module 'expo-image-manipulator'`) — adding a new native dependency was out of scope for this UI plan and would have introduced a *new*, non-baselined error. Documented in the hook's own comment block. |
| Offline screen state (D-19/UI-SPEC "Offline" banner) implies a real `useNetworkStatus`-style hook | Added a local `useIsOffline()` stub in `InventoryListScreen.tsx` that always returns `false`, with a `TODO(Plan 05-05)` comment | `@react-native-community/netinfo` is not installed anywhere in the repo, and Plan 05-05 (running concurrently in this same worktree) owns the real offline-queue/sync implementation per the task brief's explicit instruction. The Offline banner UI and screen-state branch exist and are wired end-to-end; they just never trigger until a real network hook is substituted in. |
| Barcode scanning (D-13–D-20) implies a working scanner in this plan | Manual numeric barcode entry (D-20) is the only working entry path; "Scan or Enter Barcode" / the search-bar scan icon push placeholder route strings | `BarcodeScannerScreen.tsx` is explicitly out of scope (owned by Plan 05-05, running concurrently). Per the task brief, referenced the scanner as a route-name string/comment rather than building it. |
| `apiClient` (`lib/api.ts`) assumed to surface the full error payload | `useAddItemBarcode` and `useRemoveItemBarcode` bypass `apiClient` and call `fetch` directly | Two independent gaps in the shared `apiClient`: (1) its `ApiClientError` only forwards `error.details`, not the `existingItem` field the addBarcode 409 response actually returns (per Plan 05-02's controller) — using it would silently drop the D-63 conflict data; (2) it unconditionally calls `response.json()`, which throws on the 204 No Content the remove-barcode endpoint returns. Fixing `apiClient` itself is shared infrastructure other features (and Plan 05-05, running concurrently) depend on, so out of scope — worked around locally instead, documented inline in both hooks. |
| `CreateItemInput`/`UpdateItemInput` from `@breeyo/types` assumed to type the create/update payload | `useCreateItem`/`useUpdateItem` mutation params typed as `CreateItemSchemaInput`/`UpdateItemSchemaInput` from `@breeyo/validators` instead | `barcodeEntrySchema.format` is `z.enum(BARCODE_FORMAT_VALUES as [string, ...string[]])`, which zod infers as plain `string`, not the `BarcodeFormat` literal union `@breeyo/types`'s interfaces expect — the exact same pre-existing type-inference gap Plan 05-02's summary already documented and worked around on the API side. `ItemFormScreen` always passes already-validated `createItemSchema`/`updateItemSchema` output into these mutations, so matching that shape (rather than fighting a mismatch with no runtime consequence) was the correct fix, mirroring the API's own precedent. |
| `InventoryItemCard`'s `nearestExpiry` prop (plan-specified) implies the list always has expiry data to show | Prop fully implemented and renders correctly when given a date, but `InventoryListScreen` has no expiry data to pass on the default `GET /inventory/items` endpoint | Confirmed via `inventory-item.repository.ts`'s `ITEM_INCLUDE = { barcodes: true }` — the list endpoint never includes per-item batch/expiry data (only the dedicated `expiry_asc` sort resolves it server-side, and even then only as ordering, not as a field in the response). This is a Plan 05-02 API surface gap, not fixable from this mobile-only plan; documented so a future API pass can close it. |
| `BatchList`'s EXPIRED badge / "Dispose" action (plan-specified) implies the item-detail response can contain expired batches | Fully implemented and forward-compatible, but `GET /inventory/items/:itemId` currently never returns a batch that would trigger it | Confirmed via `inventory-item.repository.ts`'s `findById()`, which includes batches only `WHERE currentQty > 0 AND isExpired = false`. Expired/zero-qty batches are filtered out before they ever reach the mobile client. Same class of gap as above — documented, not fixed (out of scope for this plan). |
| "Receive Stock"/"Dispense"/"Adjust" action buttons and BatchList's "Dispose" confirm assumed to perform real mutations | All four wired to placeholder route pushes (e.g. `/(app)/(tabs)/inventory/${itemId}/adjust?...`), not real API calls | Per the plan's own objective statement: "action buttons that launch stock receipt, dispense, and adjustment flows (**built in Plan 06**)." Building those mutations here would duplicate/preempt Plan 06's scope. |
| `ItemDetailsTab`/`ItemProfileHeader` props listed as exactly `item`/`isEditing`/`onRemoveBarcode` and `item`/`latestPurchasePrice` | Added one additional optional prop to each: `ItemDetailsTab.latestSupplier?` and (already plan-specified) `ItemProfileHeader.latestPurchasePrice?`, both computed by the parent screen from `item.batches` | `supplier`/`purchasePrice` live on `StockBatch`, not `InventoryItem` — the UI-SPEC's copy contract ("Distributor: [supplier] or No distributor recorded", "Purchase: Rs [N]") needs them, and they only exist on the per-item batch list already fetched by `useInventoryItem`. Additive, not a scope change. |
| `SummaryHeader`'s tappable Low Stock/Expiring cards described as "scrolls to / opens Attention card tab" | Wired as no-op callbacks with a comment; `AttentionCard` already renders directly beneath `SummaryHeader` in the same screen | Programmatic scroll-to-element across the composite `InventoryListScreen` (which mixes fixed headers with a `FlatList`) is a real but secondary piece of polish; the plan's own acceptance criteria only check that the props/callbacks exist and are wired, not the scroll behavior itself. Deferred rather than adding brittle scroll-ref plumbing under time pressure. |
| Hooks with real logic ("search debounce", "photo upload state machine") should get a test written first | `useInventorySearch`'s and `useItemPhotoUpload`'s *stateful* React parts (the `useState`/`useEffect`/`setTimeout` plumbing, and the picker/action-sheet UI) are not directly tested; their *pure decision logic* is, via two extracted functions (`getSearchDerivedState`, `uploadPickedPhotoToPresignedUrl`) with 15 passing tests between them | `@testing-library/react-native`'s `renderHook`/`render` fail in this repo's vitest config with `TypeError: Cannot read properties of undefined (reading 'S')` — a `react-test-renderer@19.2.8` vs `react@18.3.1` version mismatch. Confirmed this is pre-existing and repo-wide: no test anywhere in `apps/mobile/tests/` (checked all 4 pre-existing files) actually renders a component or hook through the renderer; every one tests plain functions/modules instead (e.g. `dosage-parsing.test.ts`). Rather than attempting to fix an unrelated, pre-existing test-infrastructure issue mid-plan, followed the repo's own established workaround: extract the testable logic into plain functions and test those directly. |

## Verification

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` (run from `apps/mobile/`, since the root-level invocation resolves to the wrong `tsc` binary) — **exit 2** (matches the pre-existing baseline's exit code, not a regression)
- **Baseline diff**: `diff <(grep "error TS" .pre-existing-tsc-baseline.txt | sort) <(grep "error TS" <fresh-tsc-output> | sort)` — **empty diff, 71 errors in both** — confirms zero new TypeScript errors introduced by any file created or modified in this plan (two intermediate fixes were needed and applied before reaching this state — see below)
- `npx vitest run tests/inventory --reporter=verbose` — **2 files, 15 tests, all passed** (`useInventorySearch.test.ts`: 10, `useItemPhotoUpload.test.ts`: 5)
- `npx vitest run` (full `apps/mobile` suite, regression check) — **6 files, 76 tests, all passed** (61 pre-existing + 15 new)
- All acceptance-criteria grep strings from both tasks verified present via direct `grep` against every created file — **all present** (see the two verification passes run during implementation: Task 1's 17 strings and Task 2's 25 strings, all `OK`)

**Two type errors surfaced and fixed during verification** (not left in the final state):
1. `useCreateItem`/`useUpdateItem`'s mutation parameter types (`CreateItemInput`/`UpdateItemInput` from `@breeyo/types`) rejected the `createItemSchema`/`updateItemSchema` output `ItemFormScreen` actually passes them, because of the `barcodeEntrySchema.format: string` vs `BarcodeFormat` mismatch described above. Fixed by re-typing those two mutation functions against `CreateItemSchemaInput`/`UpdateItemSchemaInput` from `@breeyo/validators`.
2. The silent draft-item-creation `useEffect` in `ItemFormScreen.tsx` built its payload object without a `barcodes` field; since `createItemSchema`'s `.default([])` makes zod's *inferred output type* require `barcodes` (non-optional), this failed to satisfy `CreateItemSchemaInput` after fix #1. Fixed by adding `barcodes: []` to that payload literal.

## Self-Check: PASSED

- [x] All 18 created files exist on disk (16 mobile source files + 2 test files); 0 files modified (this plan only adds new files — no existing file needed changes)
- [x] TDD honored where the plan's behavior bullets describe genuinely unit-testable logic: `getSearchDerivedState` (D-31's 2-char/300ms rules) and `uploadPickedPhotoToPresignedUrl` (the presigned-URL request → S3 PUT sequence) both have tests written and passing; the stateful hook wrappers around them are exercised transitively through the screens that consume them, per the repo's own pre-existing testing conventions (see Deviations)
- [x] All acceptance-criteria grep strings from both tasks verified present in every named file (double-checked via direct `grep`, not just visual inspection)
- [x] `npx tsc --noEmit -p apps/mobile/tsconfig.json` produces the exact same 71 pre-existing errors as `.pre-existing-tsc-baseline.txt` — zero new errors, confirmed via automated diff
- [x] `npx vitest run` (full mobile suite) — 76/76 passed, no regressions
- [x] Deviations documented with concrete evidence (file paths, grep/read results) rather than silently diverging from the plan's generic snippets — 13 deviations logged above, matching the style of 05-01/02/03's summaries
- [x] Explicit out-of-scope boundaries respected: did not touch `BarcodeScannerScreen.tsx`, `features/inventory/stores/`, `features/inventory/services/`, `useBarcodeScan.ts`, or `useOfflineSync.ts` (all owned by the concurrently-running Plan 05-05)
