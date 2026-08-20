---
phase: 9
slug: web-dashboard-owner-portal
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-20
updated: 2026-08-20
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Extracted from `09-RESEARCH.md` § Validation Architecture (which four of the seven PLAN.md files cite as required reading but which had never been split into its own file — closed during `/breeyo-build --review phase 9`, 2026-08-20).
> Populated by the planner from the 7 PLAN.md files. Statuses flip to ✅ as each task lands; plan 09-06 Task 2's human-verify checkpoint is the phase-level gate before completion.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (API)** | Vitest 2.1.x + `supertest` 7.x, `environment: 'node'`, `fileParallelism: false` (`apps/api/vitest.config.ts`, `include: ['tests/**/*.test.ts', 'src/**/*.test.ts']`, `setupFiles: ['./tests/helpers/setup.ts']`, 30s timeouts) |
| **Framework (validators)** | Vitest 3.x (`packages/validators/vitest.config.ts`) |
| **Framework (web)** | Wave 0 gap — `apps/web/package.json` currently has `"test": "echo 'no web tests yet'"`. Plan 09-01/09-02 must add `apps/web/vitest.config.ts` (`environment: 'happy-dom'`, `globals: true`, `esbuild: { jsx: 'automatic' }`, `include: ['src/**/*.test.{ts,tsx}']`) before any `apps/web` test in this phase can run. |
| **Quick run (API unit)** | `pnpm --filter @breeyo/api exec vitest run src/modules/<mod>/__tests__/<file>.test.ts` |
| **Quick run (contracts)** | `pnpm --filter @breeyo/validators test` |
| **Quick run (web)** | `pnpm --filter @breeyo/web test` *(after the Wave 0 web test setup lands)* |
| **Full suite** | `pnpm test` (turbo, `dependsOn: ['^build']`; env: `DATABASE_URL`, `DATABASE_URL_APP`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `NODE_ENV`) |
| **Prerequisite** | `docker compose up -d --wait` + `pnpm --filter @breeyo/api db:generate` + `apps/api/prisma/schema.prisma` pushed (09-01 Task 3, blocking) |

---

## Sampling Rate

- **Per task commit:** the task's own closest `vitest run <file>` (target < 30s) + `pnpm --filter @breeyo/api exec tsc --noEmit` for API changes.
- **Per wave merge:** `pnpm --filter @breeyo/api test && pnpm --filter @breeyo/web test && pnpm --filter @breeyo/validators test`.
- **Phase gate (before `/gsd-verify-work`):** `pnpm test` (full turbo suite) green + `pnpm --filter @breeyo/web build` + Lighthouse owner-portal budget pass (09-06 Task 2) + the 09-06 human-verify checkpoint approved.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure/Correct Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|------------------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | PLT-01, PLT-02, OWN-04, OWN-06 | T-09-01, T-09-02 | Access-policy defaults, hidden-module semantics, token hash lookup, expired/invalid-link no-data behavior, multi-invoice checkout constraints all fail-first | unit | `npx vitest run packages/shared/src/web-dashboard/__tests__/schemas.test.ts packages/shared/src/owner-portal/__tests__/schemas.test.ts apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts` | ❌ W0 | pending |
| 09-01-02 | 01 | 1 | OWN-04, OWN-06 | T-09-03 | Prisma models exist for browser access, magic links, session restore, checkout snapshots; correct indexes and uniqueness constraints | schema | `npx prisma validate --schema apps/api/prisma/schema.prisma` | ❌ W0 | pending |
| 09-01-03 | 01 | 1 | — | T-09-03 | **[BLOCKING]** Schema pushed and client generated before any later Phase 9 plan starts | CLI | `npx prisma db push --schema apps/api/prisma/schema.prisma && npx prisma generate --schema apps/api/prisma/schema.prisma` | ✅ | pending |
| 09-02-01 | 02 | 2 | PLT-02 | T-09-04, T-09-05, T-09-06 | Admin=all, FrontDesk=off-by-default, Clinician=none; unauthorized modules omitted from payload, not flagged locked; ordered cockpit panels; actor/timestamp on sensitive rows | unit | `npx vitest run apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts apps/api/src/modules/web-dashboard/__tests__/cockpit.service.test.ts` | ❌ W0 | pending |
| 09-02-02 | 02 | 2 | PLT-02, D-83 | T-09-04, T-09-05 | Hidden unauthorized modules, correct home section order, separate queue/scheduling panels, no global command bar, Admin-only users route; access-revoked-mid-session redirects on next action per D-83 | unit (component) | `npx vitest run apps/web/src/features/dashboard/__tests__/dashboard-home.test.tsx` | ❌ W0 | pending |
| 09-03-01 | 03 | 3 | PLT-02, D-18 | T-09-07, T-09-08, T-09-09 | Default-tab payloads; CSV/PDF export availability; want-list grouping; browser barcode-scanning rejected; **Front-Desk write access to adjust-stock rejected when `inventoryWriteEnabled=false` (D-18)** | unit | `npx vitest run apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts` | ❌ W0 | pending |
| 09-03-02 | 03 | 3 | PLT-02, D-18 | T-09-07 | Default tab selection, export button presence, risky-confirmation flow, mobile-first scanning boundary text, **adjust-stock controls hidden/disabled in UI for Front Desk when write-disabled** | unit (component) | `npx vitest run apps/web/src/features/inventory/__tests__/inventory-workbench.test.tsx` | ❌ W0 | pending |
| 09-04-01 | 04 | 3 | PLT-01, PLT-02 | T-09-10, T-09-11, T-09-12 | Expected-arrival separation from queue; stale-version metadata; refund/void hidden + rejected for Front Desk; Admin-only authorization enforced server-side | unit + integration | `npx vitest run apps/api/src/modules/queue/__tests__/web-queue.service.test.ts apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts apps/api/src/realtime/__tests__/browser-sync.service.test.ts` | ❌ W0 | pending |
| 09-04-02 | 04 | 3 | PLT-01, PLT-02 | T-09-10, T-09-11 | No week-calendar in queue page; stale-state prompt rendering; collect-payment availability; hidden Admin-only actions for Front Desk | unit (component) | `npx vitest run apps/web/src/features/queue/__tests__/queue-board.test.tsx apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` | ❌ W0 | pending |
| 09-05-01 | 05 | 2 | OWN-01, OWN-02, OWN-04, OWN-06 | T-09-13, T-09-14 | Hashed lookup; READY/EXPIRED/INVALID state handling; diagnosis+prescription-only projection (no clinician notes); pet-scoped invoice filtering; session restore fields | unit | `npx vitest run apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-records.service.test.ts` | ❌ W0 | pending |
| 09-05-02 | 05 | 2 | OWN-03, OWN-04, D-82 | T-09-15 | Single- and multi-invoice checkout snapshots; Razorpay delegation call shape; reissue lineage; **reissue rejected once the D-82 3-per-day-per-owner cap is hit, falling back to clinic-contact response**; no-data behavior for expired/mismatched checkout attempts | unit | `npx vitest run apps/api/src/modules/owner-portal/__tests__/portal-checkout.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-reissue.service.test.ts` | ❌ W0 | pending |
| 09-06-01 | 06 | 3 | PLT-01, OWN-01, OWN-04, OWN-06 | T-09-16 | Trust-banner visibility; overview default; persistent help actions; multi-pet switching; invalid/expired state rendering; diagnosis glosses | unit (component) | `npx vitest run apps/web/src/features/owner-portal/__tests__/portal-shell.test.tsx apps/web/src/features/owner-portal/__tests__/visit-timeline.test.tsx` | ❌ W0 | pending |
| 09-06-02 | 06 | 3 | OWN-02, OWN-03, OWN-05 | T-09-17, T-09-18 | Multi-invoice checkout handoff copy; payment success/failure/interrupted return states; expired-link reissue CTA; clinic-help visibility; portal route meets FCP < 3000ms on 4G | unit (component) + perf (CI) | `npx vitest run apps/web/src/features/owner-portal/__tests__/invoice-flow.test.tsx && npx lhci autorun --config=apps/web/lighthouserc.owner-portal.json` | ❌ W0 | pending |
| 09-06-HV | 06 | 3 | PLT-01, OWN-01..06 | T-09-19 | Human verifies: trust banner, overview default, pet switching, deep links stay reachable, combined checkout breakdown, success/failure returns, expired vs invalid-link distinction | human checkpoint (blocking) | `npm test` + manual walkthrough per plan's `<how-to-verify>` | n/a | pending |
| 09-07-01 | 07 | 4 | OWN-07 | T-09-20, T-09-21, T-09-22 | Vaccination/deworming due-date + overdue/due-soon/upcoming classification; next-appointment filtered to CONFIRMED/EXPECTED + future; out-of-scope petId returns 403-style empty envelope; only vaccineName/drugName/nextDueDate/status projected (no notes/dosage/batch/internal IDs) | unit | `npx vitest run apps/api/src/modules/owner-portal/__tests__/portal-care-dates.service.test.ts` | ❌ W0 | pending |
| 09-07-02 | 07 | 4 | OWN-07 | T-09-20 | Vaccination/deworming/appointment sections render with correct urgency color-coding; empty-state reassurance copy; pet-switcher re-fetch; OwnerSummaryCard integration | unit (component) | `npx vitest run apps/web/src/features/owner-portal/__tests__/upcoming-care.test.tsx` | ❌ W0 | pending |

### Cross-cutting checks (not owned by a single task)

| Check | Requirement | Test type | Automated command | Status |
|-------|-------------|-----------|-------------------|--------|
| Tampered/revoked/cross-clinic token → 403 with empty body | OWN-06 | integration | `pnpm --filter @breeyo/api exec vitest run tests/owner-portal/portal-isolation.test.ts` — model on `tests/tenant-isolation.test.ts` | ❌ W0 |
| Owner A's session cannot read Owner B's pet/invoice by direct id | OWN-06 | integration | same file as above | ❌ W0 |
| `breeyo_app` + `app.clinic_id` RLS returns own-clinic rows, zero cross-clinic rows | OWN-06 | integration | `pnpm --filter @breeyo/api exec vitest run tests/rls/clinic-scope.test.ts` | ❌ W0 — first test in the repo to actually exercise `breeyo_app` + RLS end to end |
| Stale `updatedAt` → 409 + fresh entity; UI shows stale banner | D-40 | unit + integration | `pnpm --filter @breeyo/api exec vitest run src/modules/queue/__tests__/queue.repository.optimistic.test.ts` | ❌ W0 |
| Socket event triggers inline invalidation, not a toast | D-42, D-43 | unit (hook) | `pnpm --filter @breeyo/web exec vitest run src/features/queue/__tests__/useQueueRealtime.test.ts` | ❌ W0 |
| Every Phase 9 sensitive action writes an audit row with actor + timestamp | D-24 | integration | extend `AuditEvent` enum + assert audit row per access-policy change, refund, void, and stock correction | ❌ W0 |
| Reissue capped at 3/owner/day, then routes to clinic contact | D-82 | integration | `pnpm --filter @breeyo/api exec vitest run tests/owner-portal/reissue-rate-limit.test.ts` | ❌ W0 |
| Browser access revoked mid-session takes effect on next request, not next login | D-83 | integration | `pnpm --filter @breeyo/api exec vitest run tests/web-dashboard/browser-permissions.test.ts` | ❌ W0 |

---

## Wave 0 Gaps

Infrastructure that must exist before the task it blocks can turn from ❌ to ✅:

- [ ] `pnpm --filter @breeyo/api db:generate` — generates the Prisma client; blocks every API test in this phase
- [ ] `apps/web/vitest.config.ts` — `environment: 'happy-dom'`, `globals: true`, `esbuild: { jsx: 'automatic' }`, `include: ['src/**/*.test.{ts,tsx}']`
- [ ] `apps/web/package.json` — replace the `test` echo with `vitest run`; add `@breeyo/validators`, `@breeyo/ui`, `@tanstack/react-query`, `zustand`, `socket.io-client` and matching test devDependencies
- [ ] `apps/web/tests/setup.ts` — `@testing-library/jest-dom` import, `portal.css` stub
- [ ] `apps/web/next.config.js` — portal security headers (does not exist yet)
- [ ] `apps/api/tests/owner-portal/` and `apps/api/tests/web-dashboard/` directories with shared factories extending `tests/helpers/factories.ts` (owner/pet/link factories)
- [ ] `apps/api/tests/rls/clinic-scope.test.ts` — first repo test that actually exercises `breeyo_app` + RLS
- [ ] `apps/web/lighthouserc.owner-portal.json` — 4G mobile profile, FCP budget 3000ms
- [ ] `apps/api/tests/owner-portal/reissue-rate-limit.test.ts` — proves D-82's 3/day cap
- [ ] `apps/api/tests/web-dashboard/browser-permissions.test.ts` — proves D-83's immediate-effect access revocation

---

## Notes on Currency

This file supersedes the "Validation Architecture" section of `09-RESEARCH.md` (§ Test Framework, § Phase Requirements → Test Map, § Sampling rate, § Wave 0 gaps) as the canonical validation contract for Phase 9 — that section should be treated as background/rationale only from this point forward. See `09-RESEARCH.md`'s "Note on currency" for why several of its other findings (BF-1, BF-2, BF-4, BF-5) no longer reflect the current codebase.
