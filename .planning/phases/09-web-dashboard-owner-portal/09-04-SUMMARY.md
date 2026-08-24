---
phase: 09-web-dashboard-owner-portal
plan: 04
subsystem: queue-billing-browser-workbenches
tags: [fastify, prisma, nextjs, react, socket.io, vitest, happy-dom, TDD, queue, billing, realtime, D-22, D-40]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [queue-web-api, billing-web-api, browser-sync-service, queue-workbench-ui, billing-workbench-ui]
  affects: [any later phase-9 plan touching queue, billing, or browser realtime sync]
tech_stack:
  added: []
  patterns:
    - "D-22 double enforcement: refundAllowed/voidAllowed hint the UI, but BillingWorkbenchService.refundInvoice/voidInvoice re-resolve AccessPolicyService's role fresh and 403 before ever calling RefundService/InvoiceService -- the flag is never the authorization boundary itself"
    - "browser-only realtime channel (apps/api/src/realtime/socket.events.ts's BROWSER_SYNC_EVENTS) kept OUT of @breeyo/types's shared SOCKET_EVENTS so a browser stale-state prompt never widens the mobile/web contract"
    - "BrowserSyncService.buildChangeMetadata/resolveStaleStatus as pure functions consumed by both web-queue.service.ts and billing-workbench.service.ts, so D-40 staleness is one implementation, not two"
    - "inline-first stale prompt has two independent triggers rendering the same shared StaleStateBanner: the server's own staleState (from a knownVersion query param) and a live browser-sync push not yet acknowledged"
    - "two-step risky-action dialog (inline reason/amount form, then shared HighRiskConfirmDialog) reused from Plan 09-03's RiskyStockChangeDialog pattern for billing refund/void"
key_files:
  created:
    - apps/api/src/realtime/socket.events.ts
    - apps/api/src/realtime/browser-sync.service.ts
    - apps/api/src/realtime/__tests__/browser-sync.service.test.ts
    - apps/api/src/modules/queue/web-queue.service.ts
    - apps/api/src/modules/queue/web-queue.controller.ts
    - apps/api/src/modules/queue/__tests__/web-queue.service.test.ts
    - apps/api/src/modules/billing/billing-workbench.service.ts
    - apps/api/src/modules/billing/workbench.controller.ts
    - apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts
    - apps/web/src/features/queue/hooks/useQueueBoard.ts
    - apps/web/src/features/queue/hooks/useQueueRealtime.ts
    - apps/web/src/features/queue/components/QueueBoard.tsx (+ .module.css)
    - apps/web/app/queue/page.tsx (+ queue.module.css)
    - apps/web/src/features/queue/__tests__/queue-board.test.tsx
    - apps/web/src/features/billing/hooks/useBillingWorkbench.ts
    - apps/web/src/features/billing/components/BillingWorkbench.tsx (+ .module.css)
    - apps/web/app/billing/page.tsx (+ billing.module.css)
    - apps/web/src/features/billing/__tests__/billing-workbench.test.tsx
  modified:
    - apps/api/src/modules/queue/queue.routes.ts (added `/queue/web/board` + `/queue/web/entries/:queueEntryId/status`)
    - apps/api/src/modules/queue/queue.schema.ts (added `webQueueBoardQuerySchema`, `webQueueEntryParamsSchema`)
    - apps/api/src/modules/billing/billing.routes.ts (added `/billing/web/workbench`, `/billing/web/invoices/:invoiceId/{collect-payment,refund,void}`)
    - apps/api/src/modules/billing/billing.schema.ts (added `collectPaymentBodySchema`, `webBillingWorkbenchQuerySchema`)
    - vitest.config.ts (repo root; extended include list with this plan's five new test globs, following 09-01/09-02/09-03 precedent)
metrics:
  duration: ~4 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 04: Queue and Billing Browser Workbenches Summary

Built the browser queue board and billing workbench: a new flat `BrowserSyncService`/`socket.events.ts` pair provides D-40 stale-version metadata and a browser-only Socket.IO channel shared by both modules; `WebQueueService`/`WebQueueController` wrap the existing Phase 3/8 `QueueService` with an expected-arrivals-vs-waiting split (D-07, D-41) and per-entry change metadata; `BillingWorkbenchService`/`WorkbenchController` wrap the existing Phase 6 `InvoiceService`/`PaymentService`/`RefundService` with unpaid/overdue/payment-history data and D-22's Admin-only refund/void gate, enforced twice (a `refundAllowed`/`voidAllowed` hint for the UI, and a fresh `AccessPolicyService` role check inside `refundInvoice`/`voidInvoice` that 403s before either service method is ever called). The `apps/web` pages (`/queue`, `/billing`) render both inside the shared `DashboardShell`, reusing Plan 09-02's `StaleStateBanner`/`HighRiskConfirmDialog`. Both tasks' exact `<verify>` commands pass, and `pnpm --filter @breeyo/web build` succeeds with `/queue` and `/billing` as new static routes.

## What Was Built

### Task 1: Queue and billing browser APIs + browser-sync realtime (TDD)

- **`apps/api/src/realtime/socket.events.ts`** (new, flat, alongside the existing `socket.ts`) — `BROWSER_SYNC_EVENTS` (`QUEUE_BOARD_SYNC`, `BILLING_WORKBENCH_SYNC`) and the `BrowserSyncChangeMetadata` type (`staleVersion`, `changedByUser`, `changedAt`, `reviewPath`). Deliberately NOT added to `@breeyo/types`'s `SOCKET_EVENTS`, which `apps/mobile` also consumes — widening that shared contract for a browser-only stale-state prompt was the wrong layer, per this file's own header.
- **`apps/api/src/realtime/browser-sync.service.ts`** (new) — `BrowserSyncService.buildChangeMetadata()` (maps a record's `updatedAt`/actor into the four metadata fields, `changedByUser` falling back name → user id → `null`), `resolveStaleStatus(serverVersion, clientKnownVersion?)` (undefined/null known version is `fresh`, anything older than server version is `stale`), and `emitQueueSync`/`emitBillingSync` (no-ops when `io` is `null`, matching `QueueService`'s own optional-`io` constructor convention).
- **`apps/api/src/modules/queue/web-queue.service.ts`** (new) — `WebQueueService.getBoard()` wraps `QueueService.getQueueBoard()` unchanged and adds: a separate `expectedArrivals` array (never merged into `waiting`, D-07/D-41), batched actor-name resolution (`treatingVetId` ?? `checkedInBy`, one `db.user.findMany` per board read) for each entry's `changeMetadata`, and a whole-board `staleState` from the max `staleVersion` across all entries vs. an optional `knownVersion` query param. `updateEntryStatus()` delegates to `QueueService.updateStatus()` (same state machine, same socket broadcast side effects) and additionally emits a `QUEUE_BOARD_SYNC` browser-sync event.
- **`apps/api/src/modules/billing/billing-workbench.service.ts`** (new) — `getWorkbench()` returns `unpaid`/`overdue` (via `InvoiceService.list()` for filter/sort correctness, plus one extra batched `db.invoice.findMany` for `updatedAt`/`createdById` since the list projection has neither), `recentPayments` (direct `db.payment.findMany`, captured only, with invoice/pet/owner/recordedBy joined), and `refundAllowed`/`voidAllowed` (both derived from `AccessPolicyService.getRoleCodeForUser(...) === 'ADMIN'`, resolved fresh on every call, D-83-style). `collectPayment()` delegates to `PaymentService.recordCashPayment()` unchanged (Front Desk and Admin both reach it, D-05). `refundInvoice()`/`voidInvoice()` re-check `isAdmin()` and throw a `403 FORBIDDEN` domain error **before** calling `RefundService.createRefund()`/`InvoiceService.voidInvoice()` for any other role — this is the enforcement half of D-22, independent of the `refundAllowed` hint.
- **Routes**: `queue.routes.ts` gained `/queue/web/board` and `/queue/web/entries/:queueEntryId/status` behind the existing `[authenticate, tenantContext]` preHandler (no new RBAC gate — the queue module has none beyond authentication). `billing.routes.ts` gained `/billing/web/workbench` (behind `readHandler`/`VIEW_INVOICES`) and `/billing/web/invoices/:invoiceId/{collect-payment,refund,void}` (all three behind `payHandler`/`MANAGE_PAYMENTS`, same as the pre-existing mobile routes) — D-22's Admin-only narrowing is NOT a route-level gate; it lives inside `BillingWorkbenchService` as described above, so Front Desk still passes `MANAGE_PAYMENTS` at the route but gets 403'd one layer down.
- **Tests**: `browser-sync.service.test.ts` (9 tests, new) covers `buildChangeMetadata`'s field mapping and actor fallback, `resolveStaleStatus`'s fresh/stale boundary, and both emit methods (including the no-`io` no-op case). `web-queue.service.test.ts` (6 tests, new) covers the expected-vs-waiting section split, per-entry `changeMetadata` (`staleVersion`/`changedByUser`/`reviewPath`), board-level fresh/stale resolution, and `updateEntryStatus` delegation. `billing-workbench.service.test.ts` (10 tests, new) covers `refundAllowed`/`voidAllowed` true for Admin and false for Front Desk, the payload shape (unpaid/overdue rows with `changeMetadata`, `staleState`), `collectPayment` delegation, and — the load-bearing pair — Admin succeeding at `refundInvoice`/`voidInvoice` while Front Desk gets a `{ statusCode: 403, code: 'FORBIDDEN' }` rejection with `RefundService.createRefund`/`InvoiceService.voidInvoice` **never called**.

### Task 2: Browser queue board and billing workbench pages (TDD)

- **`useQueueBoard.ts`** — same `useState`/`useEffect`/`AbortController` shape as `useInventoryWorkbench.ts`; `knownVersionRef` only advances when `acknowledgeAndRefetch()` is explicitly called (the `StaleStateBanner`'s "Refresh" action), so a board that fell behind stays flagged `stale` until the caller actively acts on it, not on the next incidental poll.
- **`useQueueRealtime.ts`** — ported from `apps/web/src/lib/useScheduleSocket.ts` (same handshake token, websocket-only transport, reconnection policy); subscribes to the literal `'browser:queue-board-sync'` event name (duplicated here rather than imported, since it's intentionally outside `@breeyo/types`) and hands each payload to the caller.
- **`QueueBoard.tsx`** — four `<section>` regions (Expected Arrivals, Waiting, In Consult, Done Today), each entry showing pet/owner/reason/position and one forward-transition button (`Check In` / `Call In` / `Mark Done`, mirroring QUE-04's table). Renders the shared `StaleStateBanner` when either the server's `staleState` is `'stale'` OR an unacknowledged realtime push has arrived — no week-calendar rendering anywhere in this file (grepped and asserted in the test).
- **`app/queue/page.tsx`** — wires the above into `DashboardShell` with the same `useRequireAuth` + `useDashboardCockpit({ currentModulePanelId: 'QUEUE' })` guard pattern as `app/inventory/page.tsx`.
- **`useBillingWorkbench.ts`** — same shape again, and (unlike queue) owns its own Socket.IO subscription directly rather than a separate realtime hook file, per this plan's file list — `realtimeNotice` state plus `dismissRealtimeNotice()`/`acknowledgeAndRefetch()`. `collectPayment`/`refundInvoice`/`voidInvoice` each POST to the corresponding `/billing/web/...` route and refetch on success; a Front Desk caller attempting `refundInvoice`/`voidInvoice` (e.g. by racing a stale `refundAllowed: true` UI state) gets the server's 403 surfaced as a thrown error, never a silent success.
- **`BillingWorkbench.tsx`** — Unpaid/Overdue tables (`Collect Payment` always rendered; `Refund`/`Void` buttons entirely omitted from the JSX — not merely `disabled` — unless `refundAllowed`/`voidAllowed` are `true`), a Recent Payments list with `recordedByName`/`paidAt` visible per row (D-24), and a two-step risky-action flow (inline reason-and-amount form, then the shared `HighRiskConfirmDialog`) using the exact 09-UI-SPEC.md copy for both void ("Void invoice {number}? This keeps the audit trail and may return stock.") and refund ("Refund ₹{amount} for invoice {number}? This cannot be cancelled after submission.").
- **`app/billing/page.tsx`** — same `DashboardShell` wiring pattern, `currentModulePanelId: 'BILLING'`.
- **Tests**: `queue-board.test.tsx` (4 tests, new) — expected-arrivals/waiting section separation with no week-calendar text; the shared `StaleStateBanner` rendering from a server-reported `staleState: 'stale'`; the same banner appearing from a **simulated realtime push** (via a `socket.io-client` mock that captures the registered event handler and invokes it directly, no real socket connection); and the banner clearing on "Refresh". `billing-workbench.test.tsx` (6 tests, new) — payload rendering (unpaid invoice + payment history with actor name); Refund/Void **present** for `refundAllowed: true`; Refund/Void **absent** (not disabled — asserted via `queryByRole` returning `null`) for `refundAllowed: false`, with `Collect Payment` still present; the two-step void confirmation flow (reason required, then `HighRiskConfirmDialog` showing the acting Admin's name); and the stale-state banner from a server-reported stale workbench.

## Verification

- `npx vitest run apps/api/src/modules/queue/__tests__/web-queue.service.test.ts apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts apps/api/src/realtime/__tests__/browser-sync.service.test.ts` → **25/25 passed** (verified both from `apps/api` and from the repo root via the extended `vitest.config.ts`).
- `npx vitest run apps/web/src/features/queue/__tests__/queue-board.test.tsx apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` → **10/10 passed** (verified both from `apps/web` and from the repo root).
- Regression: `cd apps/api && npx vitest run src/modules/queue src/modules/billing src/realtime` → **363/363 passed** (no pre-existing queue/billing/realtime test broke). `cd apps/web && npx vitest run` (full suite) → **33/33 passed** (adds this plan's 10 to the pre-existing 23).
- `cd apps/api && npx tsc --noEmit -p tsconfig.json` and `cd apps/web && npx tsc --noEmit -p tsconfig.json` → clean, no errors.
- `pnpm --filter @breeyo/web build` → **succeeds**. `/queue` (4.16 kB, 134 kB First Load JS) and `/billing` (5.49 kB, 135 kB First Load JS) appear as new static routes alongside the pre-existing `/dashboard`, `/inventory`, `/schedule`, `/users`, `/login` routes. No build regression.
- The full un-scoped `apps/api` test suite (every module, including real-Postgres/Redis integration tests) was started but not run to completion in this environment — it is long-running and outside what any task's `<verify>` command asks for; the scoped regression run above (`src/modules/queue src/modules/billing src/realtime`) is the relevant coverage and passed in full.

## Deviations From The Plan (flagged, not silently made)

1. **`vitest.config.ts` (repo root) extended**, following the exact 09-01/09-02/09-03 precedent — added five new globs (`apps/api/src/modules/queue/**/__tests__`, `apps/api/src/modules/billing/**/__tests__`, `apps/api/src/realtime/**/__tests__`, `apps/web/src/features/queue/**/__tests__`, `apps/web/src/features/billing/**/__tests__`) so both tasks' `<verify>` commands also succeed unmodified from the repo root, not only from inside `apps/api`/`apps/web`. Not in either task's `files_modified` list, same situation 09-03's summary already flagged and resolved the same way.
2. **No new shared-package types.** Following 09-02's and 09-03's precedent, every new response/payload type (`WebQueueBoard`, `BillingWorkbenchResponse`, `BrowserSyncChangeMetadata`, etc.) is defined once server-side and mirrored by hand in the corresponding `apps/web` hook, never added to `@breeyo/types`/`@breeyo/validators`. Neither package appears in either task's `files_modified` list.
3. **D-22's Admin-only gate is enforced in `BillingWorkbenchService`, not as a new Fastify preHandler or a new permission string.** The plan's interface list gives refund/void their own `/billing/web/...` routes but does not specify how the Admin-only narrowing is wired relative to Front Desk's pre-existing `MANAGE_PAYMENTS` grant. Introducing a second permission (e.g. `MANAGE_REFUNDS`) would have meant seeding a new `Role`/`Permission` row and keeping it in sync with `AccessPolicyService`'s independent `BrowserRoleCode` model — two sources of truth for one D-22 rule. Resolving it inside the service, against the same `AccessPolicyService.getRoleCodeForUser` the cockpit and inventory workbenches already use, keeps D-22 as a single fresh (D-83-style) role check with one implementation. Flagging this as a design decision rather than silently picking it: a reviewer who expected a route-level `requirePermission('MANAGE_REFUNDS')` gate should know it was considered and not used.
4. **Billing's realtime subscription lives inside `useBillingWorkbench.ts` itself, not a separate `useBillingRealtime.ts` file.** The plan's `files_modified` list gives queue both `useQueueBoard.ts` and `useQueueRealtime.ts` but billing only `useBillingWorkbench.ts` — read literally as intentional (billing's page has nothing else that would need the realtime subscription split out the way queue's `QueueBoard.tsx` does), so the Socket.IO `useEffect` was folded into the one billing hook instead of inventing an unlisted file.
5. **Invoice-row staleness/actor metadata required one extra batched query beyond `InvoiceService.list()`.** `InvoiceRepository.listInvoices()`'s `select` has no `updatedAt` or `createdById` (by design, for the mobile list view it was built for) — rather than widening that shared projection for every other caller of `InvoiceService.list()`, `BillingWorkbenchService.buildInvoiceRows()` fetches those two columns in one additional `db.invoice.findMany({ where: { id: { in: ids } } })` per section and merges them in. `createdById` (the invoice's creator) is used as the row's attributed actor for D-43 purposes — there is no separate "last modified by" column on `Invoice` to prefer instead.
6. **No file-path or naming inconsistency found.** Confirmed before writing any file: `web-queue.service.ts`/`web-queue.controller.ts` sit flat inside the existing `apps/api/src/modules/queue/` directory and were wired into the existing `queue.routes.ts`; `billing-workbench.service.ts`/`workbench.controller.ts` sit flat inside `apps/api/src/modules/billing/` and were wired into the existing `billing.routes.ts`; `browser-sync.service.ts`/`socket.events.ts` sit flat inside `apps/api/src/realtime/` alongside the pre-existing `socket.ts`. No nested `services/`/`controllers/` subdirectory was created anywhere. Nothing to flag here.

## Notable Implementation Detail: two independent stale-state triggers, one shared banner

D-40 asks for a stale/conflict prompt instead of silent overwrite; D-42 asks for inline-first updates with toasts reserved for failures/blocked actions. Both pages satisfy this with two independent signals feeding the same `StaleStateBanner`: (1) the server's own `staleState` field, computed by comparing the board/workbench's own `staleVersion`s against an optional `knownVersion` query param the client only advances on an explicit "Refresh"; and (2) a live Socket.IO push on the browser-only `browser:*-sync` channel, arriving while the tab is already open. Neither one auto-refetches on its own — a push sets a local "unacknowledged" flag and a stale server response sets its own field, and either is sufficient to show the banner, but the underlying rendered data is never silently replaced until the caller clicks "Refresh" or "Review changes." This is the same shape 09-02's `StaleStateBanner` component was built to support, applied here to two write-capable modules instead of a read-only cockpit panel.
