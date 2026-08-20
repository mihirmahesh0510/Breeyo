---
phase: 09-web-dashboard-owner-portal
plan: 02
subsystem: browser-access-policy-and-operations-cockpit
tags: [fastify, prisma, nextjs, react, vitest, happy-dom, TDD, rbac, cockpit]
dependency_graph:
  requires: [09-01]
  provides: [web-dashboard-api, browser-access-policy-service, cockpit-aggregation, dashboard-shell, apps-web-component-test-harness]
  affects: [09-03, 09-04, later web module pages that reuse DashboardShell/HighRiskConfirmDialog/StaleStateBanner]
tech_stack:
  added: [happy-dom, "@vitejs/plugin-react", "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event"]
  patterns:
    - "role-scoped access policy re-read fresh on every request, never cached (D-83)"
    - "cockpit aggregation as one service composing per-panel builders, gated by AccessPolicyService.getVisibleModulesForUser"
    - "apps/web component tests: happy-dom + @vitejs/plugin-react, AuthProvider + sessionStorage seeding, vi.stubGlobal('fetch', ...) instead of mocking the data hook"
key_files:
  created:
    - apps/api/src/modules/web-dashboard/access-policy.service.ts
    - apps/api/src/modules/web-dashboard/cockpit.service.ts
    - apps/api/src/modules/web-dashboard/preferences.service.ts
    - apps/api/src/modules/web-dashboard/access-policy.controller.ts
    - apps/api/src/modules/web-dashboard/cockpit.controller.ts
    - apps/api/src/modules/web-dashboard/preferences.controller.ts
    - apps/api/src/modules/web-dashboard/users.controller.ts
    - apps/api/src/modules/web-dashboard/web-dashboard.routes.ts
    - apps/api/src/modules/web-dashboard/__tests__/cockpit.service.test.ts
    - apps/web/src/components/app-shell/DashboardShell.tsx (+ .module.css)
    - apps/web/src/components/app-shell/AppSidebar.tsx (+ .module.css)
    - apps/web/src/components/app-shell/AppTopBar.tsx (+ .module.css)
    - apps/web/src/features/dashboard/hooks/useDashboardCockpit.ts
    - apps/web/src/features/dashboard/components/ExceptionStrip.tsx (+ .module.css)
    - apps/web/src/features/dashboard/components/PriorityPanel.tsx (+ .module.css)
    - apps/web/src/features/dashboard/components/UserManagementMiniPanel.tsx (+ .module.css)
    - apps/web/src/features/dashboard/components/HighRiskConfirmDialog.tsx (+ .module.css)
    - apps/web/src/features/dashboard/components/StaleStateBanner.tsx (+ .module.css)
    - apps/web/app/dashboard/page.tsx (+ dashboard.module.css)
    - apps/web/app/users/page.tsx (+ users.module.css)
    - apps/web/src/features/dashboard/__tests__/dashboard-home.test.tsx
  modified:
    - apps/api/src/app.ts (registers web-dashboard.routes.js)
    - apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts (replaced 09-01 Wave 0 scaffold)
    - apps/web/vitest.config.ts (happy-dom + @vitejs/plugin-react)
    - vitest.config.ts (repo root; extended include list + environmentMatchGlobs + react plugin)
    - apps/web/package.json (test-library/happy-dom/plugin-react devDependencies)
    - package.json (repo root; react/react-dom/testing-library/happy-dom/plugin-react devDependencies, so root-invoked vitest can resolve them from a nested apps/web test file)
    - pnpm-lock.yaml
metrics:
  duration: ~3.5 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 02: Browser Access Policy, Operations Cockpit & Dashboard Shell Summary

Built the Phase 9 web-dashboard API (role-scoped browser access policy, cockpit aggregation, panel-order preferences, admin user summaries) and the corresponding `apps/web` browser shell (dashboard shell, action-first home cockpit, admin users page, shared high-risk/stale-state UX). Both tasks' exact `<verify>` commands pass. `apps/web` had no component-test harness before this plan; one was added as part of Task 2, test-first, per the plan's Hard Rule 6.

## What Was Built

### Task 1: `AccessPolicyService`, `CockpitService`, `PreferencesService` + routes (TDD)

- **`access-policy.service.ts`** — `AccessPolicyService` reads/writes `ClinicBrowserAccessPolicy` keyed only by `(clinicId, roleCode)` (D-19), falling back to `DEFAULT_BROWSER_ACCESS_BY_ROLE` when no row exists yet (D-15 to D-17). `updatePolicy('CLINICIAN', ...)` throws `ClinicianBrowserAccessError` rather than silently no-op'ing (D-15's "no exception path"). `resolveRoleCode()` maps `Role.name` seed strings (`'Admin' | 'FrontDesk' | 'Clinician'`, distinct from the `BrowserRoleCode` contract) to the normalized code, picking the highest-privilege browser-eligible role when a member holds several. `getVisibleModulesForUser()` re-resolves both the user's role membership AND the current policy row on every call — nothing is cached anywhere (no in-memory map, no Redis key, no JWT claim), which is what makes D-83's "next request, not next login" enforcement true.
- **`cockpit.service.ts`** — `CockpitService.getCockpit()` composes one panel-builder method per module (`ALERTS`, `QUEUE`, `SCHEDULING`, `BILLING`, `INVENTORY`, `USERS`, `OWNER_EXCEPTIONS`), calling `AccessPolicyService.getVisibleModulesForUser()` fresh on every invocation and only including a module's panel when authorized. `ALERTS` and `OWNER_EXCEPTIONS` always render (D-06 exception-first/exception-last bookends); every panel carries ≥1 quick action (D-03) and only a count + action, never chart-shaped data (D-08). Front Desk's `INVENTORY` panel gets an "Open Inventory" action; Admin's (with `INVENTORY_WRITE`) gets "Adjust Stock" (D-18 view-only enforcement).
- **`preferences.service.ts`** — `PreferencesService` persists `UserDashboardPreference.panelOrderJson`, re-validating on both read and write that the stored/submitted order is an exact permutation of `DASHBOARD_PANEL_ORDER` (D-14: reorder-only, no removing core panels).
- **Controllers + `web-dashboard.routes.ts`** — `access-policy.controller.ts` (Admin-only, `MANAGE_ROLES`), `cockpit.controller.ts` (403s when the caller has no browser-eligible role or `browserEnabled` is false — re-checked fresh per D-83, not gated by a fixed permission code), `preferences.controller.ts` (any authenticated browser user), `users.controller.ts` (Admin-only, `MANAGE_USERS`; lists clinic members and toggles `ClinicMember.isActive`, writing `USER_DEACTIVATED`/`USER_REACTIVATED` audit-log events and returning actor+timestamp in the response body per D-24). Routes registered in `app.ts` after the modules the cockpit aggregates over (queue, scheduling, billing, inventory).
- **Tests**: `access-policy.service.test.ts` (14 tests) replaces the 09-01 Wave 0 scaffold (which only exercised the pure `@breeyo/types` contracts) with tests against the real, mocked-`db` `AccessPolicyService` — defaults per role, role-scoped-not-per-user updates, Clinician rejection, role-name-to-code resolution, and two dedicated D-83 mid-session-revocation tests (module-level and whole-browser-access-level). `cockpit.service.test.ts` (8 tests, new) proves the exact locked panel order, exception-first/exception-last positioning, hidden-module omission, Front Desk inventory view-only quick actions, a quick action on every panel, and a mid-session revocation test showing the same `CockpitService` instance drops a panel on its very next call with no internal caching.

### Task 2: Dashboard shell, cockpit home, admin users page, shared UX (TDD)

- **`apps/web` test harness (new)** — `apps/web` previously only tested pure logic (`week-grid.test.ts` under a bare `'node'` environment). Both `apps/web/vitest.config.ts` and the repo-root `vitest.config.ts` (used for the plan's own cross-directory verify commands) now load `@vitejs/plugin-react` and use `happy-dom` (via `environment: 'happy-dom'` locally, `environmentMatchGlobs: [['apps/web/**', 'happy-dom']]` at the root, scoped so the api/validators suites keep plain `'node'`). Added `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom` (pinned to the exact `6.9.1` patch — `6.10.0` carries the package's own published deprecation notice for a breaking regression), and `@testing-library/user-event` to `apps/web/package.json`; added `react`, `react-dom`, and the same test-library set to the **repo root** `package.json` too (see Deviations below for why).
- **`DashboardShell.tsx` / `AppSidebar.tsx` / `AppTopBar.tsx`** — left sidebar (1024px+) / collapsible drawer (768–1023px, CSS-media-query driven, no layout-flash JS media hook) shell with a sticky top bar (clinic switcher, identity, role badge, one module-local search slot — no global command bar, D-09/D-10). `AppSidebar` takes `visiblePanelIds: DashboardPanelId[]` as a prop (re-derived by the caller from the latest cockpit fetch, never cached) and renders only the nav items whose panel id is present — no lock icons, no teaser rows (D-20). `Settings` shares `USERS`'s gate in Phase 9 (discretionary call, documented inline: no dedicated `SETTINGS` browser-access module code exists yet, and clinic settings are already Admin-only via `MANAGE_CLINIC_SETTINGS`).
- **`useDashboardCockpit.ts`** — `GET /api/v1/web-dashboard/cockpit` via the same `useState`/`useEffect`/`AbortController` shape as `useSchedule.ts`. Implements D-83's browser-side half: a 403 on the whole cockpit redirects to `/dashboard/locked-out`; if an optional `currentModulePanelId` is no longer present in a later response, it redirects to the first still-authorized module's route (`DASHBOARD_PANEL_ORDER` order) or the locked-out screen if none remain. Both checks re-run on every fetch/refetch, not only at login.
- **`ExceptionStrip.tsx` / `PriorityPanel.tsx` / `UserManagementMiniPanel.tsx`** — `ExceptionStrip` renders only the `ALERTS` panel at the very top (no section heading — a strip, not one more panel among equals, per the UI-SPEC component inventory); `PriorityPanel` is the shared wrapper (title, count, quick actions, "Open `<title>`" link) reused for `QUEUE`, `SCHEDULING`, `BILLING`, `INVENTORY`, and `OWNER_EXCEPTIONS` (rendered last, per D-06); `UserManagementMiniPanel` is `USERS`'s own home-awareness component (D-11).
- **`HighRiskConfirmDialog.tsx` / `StaleStateBanner.tsx`** — shared primitives for later module pages: strong confirmation + visible actor/timestamp (D-23/D-24) and the D-40 stale/conflict banner with exactly `Refresh` and `Review changes` actions.
- **`app/dashboard/page.tsx`** — the home cockpit: auth guard first (matching `app/schedule/page.tsx`'s precedent), then `ExceptionStrip` → `QUEUE`/`SCHEDULING`/`BILLING`/`INVENTORY` `PriorityPanel`s → `UserManagementMiniPanel` (if authorized) → `OWNER_EXCEPTIONS` `PriorityPanel`, exactly the D-06 locked order, each module panel only rendered when the cockpit response includes it.
- **`app/users/page.tsx`** — the admin-only full user-management module: staff list with role + active/inactive toggle (via `HighRiskConfirmDialog`, using the UI-SPEC's exact "Update access for `{name}`? Hidden modules will disappear immediately." copy) and a per-role browser-access-policy toggle section, both showing the API's actor/timestamp fields.
- **Test**: `dashboard-home.test.tsx` (7 tests) — `AppSidebar` hidden-module + Admin-only-Users assertions; a full `DashboardHomePage` render (real `AuthProvider` + seeded `sessionStorage`, `next/navigation` mocked, `fetch` stubbed) proving the exact heading order (`Queue, Scheduling, Billing, Inventory, User Management, Owner & WhatsApp Exceptions`), Queue and Scheduling as distinct DOM panels, a "Review Alerts" quick action, no global command bar / searchbox anywhere on the page, and USERS-panel/nav omission for a Front Desk-shaped cockpit response; two `renderHook(useDashboardCockpit)` tests proving the D-83 redirect — to the first remaining module on a partial revocation, to `/dashboard/locked-out` on a full 403.

## Deviations From The Plan (flagged, not silently made)

1. **Root-level `package.json` gained `react`, `react-dom`, and the full test-library set as devDependencies**, not just `apps/web/package.json`. Discovered while getting the plan's own verify command (`npx vitest run apps/web/src/features/dashboard/__tests__/dashboard-home.test.tsx`, run from the repo root) to pass: Vite/vitest's bare-import resolution for a test file invoked from the *repo root* did not walk up to `apps/web/node_modules` for `react`/`react/jsx-dev-runtime` the way plain Node resolution would — it failed with `Failed to resolve import "react"` until the root's own `node_modules` had a `react` symlink too (confirmed with a standalone probe test before touching any real code). `pnpm --filter @breeyo/web test` (the package's own script, using `apps/web/vitest.config.ts` + its own local `react`) was unaffected throughout and was also verified passing.
2. **`packages/types` and `packages/validators` don't export a `CockpitResponse` type**, only the panel-level pieces (`DashboardPanelSummary`, `DashboardPanelId`, `DASHBOARD_PANEL_ORDER`) plus `cockpitResponseSchema` in `@breeyo/validators` (zod, no exported static type). Defined a local `CockpitResponse` interface in both `apps/api/.../cockpit.service.ts` and `apps/web/.../useDashboardCockpit.ts`, each with a comment pointing at the zod schema it mirrors, rather than editing 09-01's `packages/types/src/web-dashboard.ts` (out of this plan's file list).
3. **`PANEL_TITLE`/role-badge/"which role is this" is inferred, not carried by the API.** The cockpit response has no `roleCode` field of its own; `app/dashboard/page.tsx`'s role badge is inferred from whether the `USERS` panel is present (Admin is the only Phase 9 role with `usersEnabled` by default, D-21). Documented inline as a discretionary call — a precise role badge would need the cockpit response to carry `roleCode`, which is a 09-01 contract change outside this plan's scope.
4. **No naming/file-path convention violations found.** Checked `apps/api/src/modules/billing/`, `inventory/`, `whatsapp/`, and `scheduling/` before creating any new file, and the plan's file list (`web-dashboard.routes.ts`, `<name>.service.ts`/`.controller.ts`, a flat `__tests__/` subdirectory, no nested `services/`/`controllers/` folders) matches those modules' conventions exactly — nothing to flag here, unlike the two issues the prior 09-01 agent hit.

## Pre-existing issue found (not fixed, out of this plan's scope): `apps/web` production build is broken

Hard Rule 7 required a `pnpm --filter @breeyo/web build` sanity check before committing. Running it (both before and after this plan's changes) fails with:

```
node:crypto
Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins (Unhandled scheme).
Import trace: node:crypto → packages/types/dist/owner-portal.js → packages/types/dist/index.js
  → ./app/schedule/AppointmentDrawer.tsx → ./app/schedule/page.tsx
```

**Root cause**: `packages/types/src/owner-portal.ts` (created by Plan 09-01, committed as `fb7cc80`) imports `createHash` from `node:crypto` at module scope, for its `hashMagicLinkToken()` helper. Because `packages/types/src/index.ts` barrel-exports `owner-portal.js` from the same entry point as every other type, **any** client component that imports anything from `@breeyo/types` — including `app/schedule/AppointmentDrawer.tsx`, a pre-existing Phase 8 file untouched by this plan — pulls `node:crypto` into the webpack client bundle and fails to compile.

This predates this plan entirely (confirmed via `git log` on `owner-portal.ts`: only touched by 09-01's `fb7cc80`) and is **not** caused by any file this plan added — grep confirms none of this plan's new `apps/web` files import `@breeyo/ui` (the RN-barrel risk Hard Rule 7 specifically calls out), and the failing import trace above never touches a file this plan created. It does mean `apps/web`'s production build is currently broken for every page, not only Phase 9's new ones — `next dev` and `vitest` are both unaffected (neither runs a webpack client bundle the same way), which is why this had not surfaced before. **Flagging rather than fixing**: the fix belongs in `packages/types/src/owner-portal.ts` (e.g. move `hashMagicLinkToken` to a server-only module, or swap to a Web-Crypto-compatible hash), which is outside this plan's `files_modified` list and 09-01's file, not 09-02's.

## Task Commits

1. **Task 1: browser access-policy, cockpit aggregation, and preferences APIs** — `433a107` (feat)
2. **Task 2: dashboard shell, cockpit home, admin users page, shared high-risk web UX** — `31d4560` (feat)

_Both tasks followed the TDD iron law: for every file with a corresponding test, the failing test was written and run first (confirmed failing with `Cannot find module`/`Failed to resolve import` for the right reason), then the minimal implementation was added until it passed._

## Verification

Task 1 — exact command from the plan, run from the repo root:
```
npx vitest run apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts apps/api/src/modules/web-dashboard/__tests__/cockpit.service.test.ts
```
Result: **2 files passed, 22 tests passed** (14 + 8), exit code 0.

Task 2 — exact command from the plan, run from the repo root:
```
npx vitest run apps/web/src/features/dashboard/__tests__/dashboard-home.test.tsx
```
Result: **1 file passed, 7 tests passed**, exit code 0.

Additional sanity checks (not required by either `<verify>` block, run anyway per Hard Rule 4/7):
- `apps/api`: `npx tsc --noEmit` — 0 errors in any `web-dashboard/` file or `app.ts` (one pre-existing, unrelated error remains in `apps/whatsapp/providers/__tests__/cloud-api.provider.test.ts`, confirmed untouched by this plan via `git status`).
- `apps/web`: `npx tsc --noEmit` — 0 errors.
- `pnpm --filter @breeyo/web test` (package-local script, `apps/web`'s own `vitest.config.ts` + local `vitest@2.1.9`) — both `week-grid.test.ts` (11 tests) and `dashboard-home.test.tsx` (7 tests) pass; confirms the harness works via the repo's normal `pnpm test` path, not only the plan's literal root-invoked command.
- `pnpm --filter @breeyo/web build` — **fails**, but on a pre-existing, out-of-scope defect (see above), not on anything this plan added.

## Not Done / Left For Later Plans

- Real module pages for Queue/Scheduling/Billing/Inventory (`/queue`, `/schedule` already exists from Phase 8, `/billing`, `/inventory`) are referenced by nav links and "Open `<title>`" links but not built here — later 09-0x plans own those, per `09-CONTEXT.md`'s module-depth phasing.
- `HighRiskConfirmDialog`/`StaleStateBanner` are built and used once each (users page status toggle) but not yet wired into a refund/void/stock-adjustment flow — those flows don't exist until Billing/Inventory's own web plans land.
- The `apps/web` production-build defect above needs a fix in `packages/types/src/owner-portal.ts` before any Phase 9 web page ships to production, but is not this plan's file to fix.
