---
phase: 09-web-dashboard-owner-portal
plan: 03
subsystem: inventory-browser-workbench
tags: [fastify, prisma, nextjs, react, vitest, happy-dom, TDD, inventory, D-18]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [inventory-web-api, inventory-workbench-ui, browser-inventory-write-gate]
  affects: [any later phase-9 plan touching inventory or the cockpit's INVENTORY panel]
tech_stack:
  added: []
  patterns:
    - "browser write-gate re-read fresh per call via AccessPolicyService.getRoleCodeForUser + getPolicy, never cached (D-18/D-83 style)"
    - "hand-built minimal PDF/1.4 byte stream for a single export button instead of adding a new PDF dependency"
    - "hidden-not-disabled write controls: table's Actions column (header + cells) omitted from the render tree entirely when writeAllowed is false"
    - "two-step client dialog (reason capture, then HighRiskConfirmDialog reuse) for D-34 risky stock changes"
key_files:
  created:
    - apps/api/src/modules/inventory/inventory-web.service.ts
    - apps/api/src/modules/inventory/inventory-web.controller.ts
    - apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts
    - apps/web/src/features/inventory/hooks/useInventoryWorkbench.ts
    - apps/web/src/features/inventory/components/InventoryTabBar.tsx (+ .module.css)
    - apps/web/src/features/inventory/components/InventoryActionTable.tsx (+ .module.css)
    - apps/web/src/features/inventory/components/InventoryReorderPanel.tsx (+ .module.css)
    - apps/web/src/features/inventory/components/InventoryAnalyticsPanel.tsx (+ .module.css)
    - apps/web/src/features/inventory/components/RiskyStockChangeDialog.tsx (+ .module.css)
    - apps/web/app/inventory/page.tsx (+ inventory.module.css)
    - apps/web/src/features/inventory/__tests__/inventory-workbench.test.tsx
  modified:
    - apps/api/src/modules/inventory/inventory.routes.ts (added the /inventory/web/* route group + its own buildWebServices factory)
    - vitest.config.ts (repo root; extended include list with the two new test globs, following the 09-01/09-02 precedent)
metrics:
  duration: ~3 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 03: Inventory Browser Workbench Summary

Built the browser inventory workbench: `InventoryWebService`/`InventoryWebController` aggregate the existing Phase 5 inventory module into three browser tab payloads (Stock & Batches, Reordering, Analytics) plus CSV/PDF analytics export, and the `apps/web` UI (`InventoryTabBar`, `InventoryActionTable`, `InventoryReorderPanel`, `InventoryAnalyticsPanel`, `RiskyStockChangeDialog`, `app/inventory/page.tsx`) renders them inside `DashboardShell`. D-18's Front-Desk-view-only rule is enforced on both sides: the server 403s `adjust-stock` when the caller's role lacks `inventoryWriteEnabled`, and the table hides (never disables) its write controls when the workbench's `writeAllowed` flag is false. Both tasks' exact `<verify>` commands pass, and `pnpm --filter @breeyo/web build` succeeds with `/inventory` as a new static route.

## What Was Built

### Task 1: `InventoryWebService` / `InventoryWebController` + routes (TDD)

- **`inventory-web.service.ts`** — `InventoryWebService.getWorkbench(clinicId, userId, tab)` dispatches to `getStockAndBatches`, `getReordering`, or `getAnalytics` (default `'stock'`, D-32) and always attaches a `scanningBoundaryMessage` (D-37) regardless of which tab payload is attached. `getStockAndBatches` queries `inventoryItem.findMany` with its active batches directly (the existing `InventoryItemRepository.list()` doesn't include batches, and `findById` is single-item, so this is a new read shaped for the table rather than a duplicate of an existing one) and derives `isLowStock`, `nextExpiry`, and per-row `safeActions` — the last is `[]` when `writeAllowed` is `false`, never omitted (D-18/D-20: the browser is told explicitly that writes are off, not left to infer it). `getReordering` reuses `WantListService.getWantList()` and groups rows by `getStockLevelStatus()` urgency, exposing the exact `Open item` / `Export CSV` / `Export PDF` actions (D-35, D-36). `getAnalytics` reuses `ParLevelAlertService.getLowStockItems()`/`getExpiringSoonItems()` and adds one new metric with no existing repository method — a raw-SQL 30-day dispensed-quantity-per-item query for stock turnover. `adjustStock()` is the one write path: it re-resolves the caller's role and policy fresh via `AccessPolicyService` on every call (no caching, matching D-83's convention) and throws a `403 FORBIDDEN` error before ever touching `StockAdjustmentService.adjust()` when `inventoryWriteEnabled` is `false` — Admin always qualifies by default, Front Desk only once an Admin has separately granted it. `exportAnalyticsCsv`/`exportAnalyticsPdf` reuse `getAnalytics()`'s data; the PDF export hand-builds a minimal valid PDF/1.4 byte stream (catalog/pages/page/content-stream/font objects, its own xref table) rather than adding a new dependency (no PDF library — pdfkit, pdf-lib, puppeteer — is installed anywhere in this repo) for one export button.
- **`inventory-web.controller.ts`** — `getWorkbench` (defaults an unrecognized/missing `tab` query value to `'stock'`), `adjustStock` (validates params/body with the existing `itemParamsSchema`/`stockAdjustmentSchema`, no new schema file), `exportAnalyticsCsv`/`exportAnalyticsPdf` (set `Content-Type`/`Content-Disposition` and send the raw string/Buffer). The 403 from `adjustStock` propagates to the existing global error handler unchanged, the same convention every other structured domain error in this module already uses.
- **`inventory.routes.ts`** — added a second `buildWebServices` factory (mirroring `dispense.routes.ts`'s pattern of composing `ParLevelAlertService`/`StockAdjustmentService` from a shared `StockMovementService`) and four routes: `GET /inventory/web/workbench`, `POST /inventory/web/items/:itemId/adjust-stock`, `GET /inventory/web/exports/analytics.csv`, `GET /inventory/web/exports/analytics.pdf`. Read routes share the module's existing `viewInventory` RBAC gate; `adjust-stock` keeps the existing `manageStock` RBAC gate (mobile-facing, unchanged — Front Desk still has it) *and* the new D-18 browser-specific check inside the service, so the same role can manage stock on mobile while staying view-only in the browser.
- **Tests**: `inventory-web.service.test.ts` (11 tests, new — no Wave 0 scaffold existed for this file to replace) covers the default-tab payload and its `scanningBoundaryMessage`, `writeAllowed` true/false on `stockAndBatches` (including that rows are never omitted when write-disabled), full per-row field coverage (name/category/unit/stock/par/low-stock flag/next expiry/batch list), reordering's urgency grouping and exact action labels, analytics' turnover/expiry-risk/low-stock summaries and export actions, the D-18 403-vs-Admin-success pair on `adjustStock`, and both export formats (CSV text content, PDF byte-buffer header).

### Task 2: Inventory browser workbench UI + strong-confirmation stock UX (TDD)

- **`useInventoryWorkbench.ts`** — same `useState`/`useEffect`/`AbortController` shape as `useDashboardCockpit.ts`; response types are defined locally in this hook (mirroring `useDashboardCockpit.ts`'s own local `CockpitResponse`) rather than added to `@breeyo/types`, keeping this plan's contract change scoped to the two files that need it. `adjustStock()` calls the write endpoint and refetches; `exportAnalytics()` does a raw authenticated `fetch` (not `apiClient`, which always parses JSON) and triggers a `Blob`/`URL.createObjectURL` download.
- **`InventoryTabBar.tsx`** — the exact three tabs (`Stock & Batches`, `Reordering`, `Analytics`); the page owns which one is active and defaults to `'stock'` (D-32).
- **`InventoryActionTable.tsx`** — dense table with batch/expiry columns; when `writeAllowed` is `false` the `<th>Actions</th>` header and every row's action `<td>` are omitted from the JSX entirely (not rendered-and-disabled) — verified by the workbench test querying for the absence of the button role, not a `disabled` attribute. "Add Stock" is an inline quick form (D-33 fast normal work); "Remove Stock" opens `RiskyStockChangeDialog`.
- **`RiskyStockChangeDialog.tsx`** — a two-step flow: step 1 captures a required reason (from the same six-value preset list as `stockAdjustmentSchema`) plus optional notes; step 2 renders Plan 09-02's shared `HighRiskConfirmDialog` with the acting user's name and current timestamp visible before the change can be confirmed (D-24, D-34).
- **`InventoryReorderPanel.tsx` / `InventoryAnalyticsPanel.tsx`** — render the server's urgency groups / turnover-expiry-lowstock summaries and the server's own action/export-action copy verbatim (no hardcoded relabeling), each with an `Export CSV`/`Export PDF` trigger wired to `exportAnalytics`.
- **`app/inventory/page.tsx`** — wires all of the above into `DashboardShell` (same `useRequireAuth` + `useDashboardCockpit({ currentModulePanelId: 'INVENTORY' })` guard pattern as `app/users/page.tsx`) and states "Use mobile scanner for barcode capture" directly in the page body — no browser camera/scan control anywhere in this plan's files (confirmed by grep across both new API and UI files).
- **Test**: `inventory-workbench.test.tsx` (5 tests, new) — default-tab rendering plus the scanning-boundary copy; Add Stock/Remove Stock presence for a `writeAllowed: true` payload; their absence (not just disabled state) for a `writeAllowed: false` payload; the two-step risky-confirmation flow (reason required before the confirmation dialog appears, then the confirmation dialog shows the signed-in user's name); Export CSV/Export PDF presence on the Analytics tab. Mocks routed by URL substring (`web-dashboard/cockpit` vs. `inventory/web/workbench`) rather than call order, since the page's two data hooks fire independent fetches.

## Verification

- `npx vitest run apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts` → 11/11 passed (also verified from repo root, using the extended `vitest.config.ts`).
- `npx vitest run apps/web/src/features/inventory/__tests__/inventory-workbench.test.tsx` → 5/5 passed (also verified from repo root).
- Regression: `cd apps/api && npx vitest run src/modules/inventory src/modules/web-dashboard` → 149/149 passed. `cd apps/web && npx vitest run` → 23/23 passed (adds this plan's 5 to the pre-existing 18).
- `cd apps/api && npx tsc --noEmit -p .` and `cd apps/web && npx tsc --noEmit -p .` → clean, no errors.
- `pnpm --filter @breeyo/web build` → succeeds; `/inventory` appears as a new static route (`6.08 kB`, `123 kB` First Load JS) alongside the pre-existing `/dashboard`, `/users`, `/schedule`, `/login` routes. No build regression (the pre-existing `node:crypto`-in-browser-bundle issue flagged by 09-02's summary was already fixed upstream by `6ea8b4c`, confirmed by this clean build).

## Deviations From The Plan (flagged, not silently made)

1. **No new shared-package types were added.** The plan's `files_modified` list for both tasks includes neither `packages/types` nor `packages/validators`, and 09-02 already established the precedent of keeping a browser-response contract local to the API service + the web hook (`CockpitResponse` in both `cockpit.service.ts` and `useDashboardCockpit.ts`) rather than exporting it from `@breeyo/types`. This plan followed the same precedent for `InventoryWebWorkbenchResponse` and its nested payload types — defined once in `inventory-web.service.ts`, mirrored by hand in `useInventoryWorkbench.ts`. `InventoryCategory`, `LowStockItem`, and `WantListItem` (all pre-existing `@breeyo/types` exports, type-only, no runtime code) are imported directly in both files for the pieces that already had a canonical shape.
2. **No new zod schema file.** `adjust-stock`'s request body reuses the existing `stockAdjustmentSchema` from `@breeyo/validators` unchanged (same reason-preset list, same add/remove shape as the mobile path), and the `tab` query parameter is validated with a small inline allow-list in the controller rather than a new schema in `inventory.schema.ts` — neither file was in the plan's `files_modified` list for Task 1.
3. **PDF export has no external dependency.** Confirmed via `pnpm-lock.yaml` and `apps/api/package.json` that no PDF-generation library is installed anywhere in the repo. Rather than adding one for a single export button (with the attendant `pnpm install` / lockfile risk this task's instructions were cautious about), `exportAnalyticsPdf` hand-builds a minimal, genuinely valid PDF/1.4 document (verified in the test by checking the `%PDF-` byte header).
4. **`vitest.config.ts` (repo root) extended, following the exact 09-01/09-02 precedent.** That file's own header comment states it exists "to run Phase 9 verify commands that span workspace packages in a single `vitest run` invocation from the repo root," and its `include` list has been extended by every plan so far whose `<verify>` command needs a path outside the previously-covered globs. Running this plan's two verify commands from the repo root failed with "No test files found" before this addition (the file's `include` allowlist did not cover `apps/api/src/modules/inventory/**` or `apps/web/src/features/inventory/**`); added exactly those two globs, nothing broader.
5. **No file-path or naming inconsistency found.** Confirmed before writing any file: `inventory-web.service.ts`/`inventory-web.controller.ts` sit flat inside the existing `apps/api/src/modules/inventory/` directory (no nested `services/`/`controllers/` subfolder, matching every sibling file already there), and the routes were added to the existing `inventory.routes.ts` rather than a new bare `routes.ts`. `AccessPolicyService` (Plan 09-02, `apps/api/src/modules/web-dashboard/access-policy.service.ts`) is imported across the module boundary with no circular dependency (`access-policy.service.ts` itself only imports `@breeyo/types` and the tenant Prisma client type). Nothing to flag here.

## Notable Implementation Detail: the "Add Stock" / "Remove Stock" split

D-33 asks for fast direct table actions for normal work, while D-34 asks for stronger confirmation on risky changes — both routed through the one `adjust-stock` endpoint this plan built (there is no separate risky-vs-safe endpoint). The UI resolves this by type: `type: 'add'` submits inline from the table with a single quantity field (fast, D-33); `type: 'remove'` always routes through `RiskyStockChangeDialog`'s two-step reason-then-confirm flow (D-34, D-24), even though the server itself does not distinguish "risky" from "safe" adjustments beyond the shared reason requirement it already enforced pre-Phase-9. This is a UI-layer policy choice, not a server contract — documented here in case a later plan wants the server to encode the same distinction explicitly (e.g. a `severity` field on the adjustment schema).
