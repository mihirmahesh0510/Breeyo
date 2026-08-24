---
phase: 09-web-dashboard-owner-portal
plan: 01
subsystem: web-dashboard-owner-portal-shared-foundation
tags: [types, zod, prisma, monorepo, TDD, magic-link, rbac, contracts]
dependency_graph:
  requires: []
  provides: [web-dashboard-types, web-dashboard-schemas, owner-portal-types, owner-portal-schemas, phase-9-prisma-models, wave-0-scaffolds]
  affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07]
tech_stack:
  added: []
  patterns: [zod-discriminated-union-for-no-data-states, pure-business-rule-functions-colocated-with-types, per-role-default-access-table]
key_files:
  created:
    - packages/types/src/web-dashboard.ts
    - packages/types/src/owner-portal.ts
    - packages/validators/src/web-dashboard.ts
    - packages/validators/src/owner-portal.ts
    - packages/validators/src/__tests__/web-dashboard.test.ts
    - packages/validators/src/__tests__/owner-portal.test.ts
    - apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts
    - apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts
    - apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts
    - vitest.config.ts (repo root)
  modified:
    - packages/types/src/index.ts (barrel-export web-dashboard.js, owner-portal.js)
    - packages/validators/src/index.ts (barrel-export web-dashboard.js, owner-portal.js)
    - apps/api/package.json (@breeyo/types and @breeyo/validators already present; no @breeyo/shared dependency)
    - package.json (repo root; added "vitest" and "prisma" devDependencies)
    - pnpm-lock.yaml
    - apps/api/prisma/schema.prisma (appended 5 models)
metrics:
  duration: ~90 minutes (original) + follow-up migration
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2 (Task 3 intentionally not run — blocking, left for human review)
---

# Phase 09 Plan 01: Web Dashboard & Owner Portal Shared Foundation Summary

Shared Phase 9 contract layer, Wave 0 test scaffolds, and five new Prisma models for browser access, owner magic links, session restore, and combined checkout — built strictly test-first. Both tasks' exact `<verify>` commands pass. Task 3 (`prisma db push` + `prisma generate`) was deliberately **not** run, per instructions, and is left for a human to review the schema diff below before running it.

Contracts live in this repo's established convention: types/interfaces/pure functions in `packages/types/src/{web-dashboard,owner-portal}.ts`, zod schemas in `packages/validators/src/{web-dashboard,owner-portal}.ts`, each barrel-exported from its package's `src/index.ts`, with tests in `packages/validators/src/__tests__/{web-dashboard,owner-portal}.test.ts`. (See "Correction" note below — the first pass landed this in a `packages/shared` package that was subsequently migrated to this location.)

## What Was Built

### Task 1: Shared contracts + Wave 0 tests (TDD)

- **`packages/types/src/web-dashboard.ts`** — `BrowserRoleCode` (`ADMIN | FRONT_DESK | CLINICIAN`), `BrowserModuleCode`, `ClinicBrowserAccessPolicy`, the locked `DASHBOARD_PANEL_ORDER` (`ALERTS, QUEUE, SCHEDULING, BILLING, INVENTORY, USERS, OWNER_EXCEPTIONS`) and derived `DashboardPanelId`, `DashboardPanelSummary`, `DashboardQuickAction`, `UserManagementMiniPanelSummary`, `StaleStateEnvelope`. Also exports `DEFAULT_BROWSER_ACCESS_BY_ROLE` (Admin all-on, Front Desk all-off until configured, Clinician all-off — D-15/D-16/D-19) and `getVisibleModules()`, a pure function that returns only enabled modules (D-20: hidden, never a "locked" placeholder; returns `[]` outright when `browserEnabled` is false).
- **`packages/validators/src/web-dashboard.ts`** — `browserAccessPolicySchema`, `browserAccessPolicyUpdateSchema`, `dashboardPanelOrderSchema` (validates a permutation of the exact locked panel set — rejects a missing core panel and rejects an unknown panel id, per D-14), `cockpitResponseSchema`, `staleStateEnvelopeSchema` (D-40). Imports `DASHBOARD_PANEL_ORDER` from `@breeyo/types`.
- **`packages/types/src/owner-portal.ts`** — `OwnerPortalSessionState` (`VALIDATING | READY | EXPIRED | INVALID`), `OwnerPortalTabId`, `OwnerPortalDeepLinkType`/`OwnerPortalDeepLinkTarget`, `OwnerPortalPetSummary`, `OwnerPortalVisitSummary`, `OwnerPortalPrescriptionCard`, `OwnerPortalInvoiceSummary`, `OwnerPortalCheckoutSelection`, `OwnerPortalCheckoutReturnState`. Also exports the OWN-04/D-64 expiry constant `OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS = 7 * 24 * 60 * 60` (spelled out as the literal `7 * 24 * 60 * 60` expression per the plan, not just the number), `OWNER_PORTAL_REISSUE_DAILY_LIMIT = 3` (D-82), and three pure functions later services (09-05) will call directly: `hashMagicLinkToken()` (SHA-256, so raw tokens are never what gets compared/stored — T-09-02), `computeMagicLinkExpiry()`, and `resolveOwnerPortalSessionState()` (collapses a hash mismatch and a revoked link to the same `INVALID` result, so OWN-06's "tampered/revoked/cross-clinic all return the same non-informative outcome" holds at the logic layer, not only at the route layer).
- **`packages/validators/src/owner-portal.ts`** — `ownerPortalSessionSchema` and `magicLinkValidationResultSchema` are zod discriminated unions on `state`; the `VALIDATING`/`EXPIRED`/`INVALID` variants are `.strict()` objects with no `data` key at all, so a payload that tries to smuggle `data` alongside `state: 'INVALID'` fails validation — this is schema-level enforcement of OWN-06's "no data in the response body" rule, not just a convention. `ownerPortalCheckoutSchema` requires ≥1 invoice id and rejects duplicates (D-59/D-69/D-70). `deepLinkRequestSchema`, `sessionRestoreStateSchema` (D-53), `reissueRequestSchema` (D-67/D-82) round out the set named in the plan.
- **Wave 0 API test scaffolds** — `access-policy.service.test.ts`, `magic-link.service.test.ts`, `portal-session.service.test.ts` under `apps/api/src/modules/{web-dashboard,owner-portal}/__tests__/`. These import only from `@breeyo/types` / `@breeyo/validators` (no Prisma, no DB) and exercise the pure default/hidden-module/hash/expiry/state logic above. This is intentional: the plan's own `files_modified` list for Task 1 does **not** include `access-policy.service.ts`, `magic-link.service.ts`, or `portal-session.service.ts` themselves — those Prisma-backed services are 09-02's and 09-05's job, and Task 3 (the schema push that would generate the Prisma client types they'd need) hasn't run. Per `09-VALIDATION.md`'s own per-task map, 09-02-01 and 09-05-01 re-run these same file paths with additional, DB-backed assertions layered on top — so today's tests are a real, passing Wave 0 floor for those later plans to extend, not a fake placeholder.
- Written test-first throughout: each test file was run and confirmed to fail with `Cannot find module` (or the equivalent) before its corresponding types/schemas file was written.

### Task 2: Prisma models (schema only)

Appended five models to `apps/api/prisma/schema.prisma`, immediately after `AppointmentPet` (pure append — `git diff` shows 104 insertions, 0 deletions, no existing model touched):

- **`ClinicBrowserAccessPolicy`** — `@@unique([clinicId, roleCode])`, indexes on `[clinicId, roleCode]` and `[clinicId, browserEnabled]`.
- **`UserDashboardPreference`**
- **`OwnerPortalMagicLink`** — index on `[tokenHash]`, index on `[ownerId, expiresAt]`.
- **`OwnerPortalSessionState`** — index on `[magicLinkId, updatedAt]`.
- **`OwnerPortalCheckoutSession`** — index on `[magicLinkId, returnState]`.

All scalar fields match the plan's field lists exactly. `roleCode`/`defaultTab`/`deepLinkType`/`lastTab`/`lastReturnState`/`returnState` are plain `String` columns with an inline comment listing the allowed values, matching the existing convention for status-like fields elsewhere in this schema (`Invoice.status`, `Payment.method`, `Payment.status`) rather than introducing new Prisma `enum` blocks.

## Deviations From the Plan (flagged, not silently made)

1. **`id` primary keys added to `UserDashboardPreference`, `OwnerPortalMagicLink`, `OwnerPortalSessionState`, `OwnerPortalCheckoutSession`.** The plan's field lists for these four models omit `id`, but Prisma requires an `@id` (or `@@id`) on every model, and every other model in this schema uses `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. Added for schema validity, following the existing convention — no other field was added or renamed beyond what the plan specified.
2. **No `@relation` fields added between the 5 new models and existing models** (`Clinic`, `User`, `PetOwner`, `Invoice`). The plan's action text lists only scalar columns (e.g. `clinicId`, `ownerId`, `magicLinkId` as plain ids), and a formal Prisma relation would require adding a back-relation array field to the *existing* model on the other side (e.g. `Clinic.browserAccessPolicies ClinicBrowserAccessPolicy[]`) — which the task's own instructions forbid ("Do not touch any existing Prisma models"). Kept all new FK-shaped columns as plain `String @db.Uuid` scalars, consistent with a literal reading of the field lists.
3. **No extra uniqueness constraints beyond `@@unique([clinicId, roleCode])`** were added at the time this plan landed. `OwnerPortalMagicLink.tokenHash` was only `@@index`-ed, not `@@unique`, and `OwnerPortalSessionState.magicLinkId` had no uniqueness constraint even though conceptually there should be at most one session-state row per magic link. The plan's indexes/uniqueness list was exact and didn't include these, so they were left out rather than silently added. Both gaps were later closed: `tokenHash` gained `@@unique` in commit `dadc5a3`, and `OwnerPortalSessionState.magicLinkId` gained `@@unique` (plus a real Prisma `upsert` in `portal-session.service.ts`, replacing the earlier `findFirst`-then-create/update) during the no-mistakes review-fix pass.
4. **Repo infrastructure gaps that had to be closed to make the exact `<verify>` commands runnable at all**, none of which touch application code:
   - **`packages/types` and `packages/validators` had no built `dist/` in this worktree**, so *every* existing `apps/api` test that imports `@breeyo/types` or `@breeyo/validators` (e.g. `src/modules/billing/__tests__/money.test.ts`) was failing with `Failed to resolve entry for package "@breeyo/types"` before this plan touched anything — confirmed by running `apps/api`'s existing test suite. Ran `tsc` in `packages/types` and `packages/validators` to produce `dist/`, matching the turbo pipeline's own `dependsOn: ["^build"]` convention (`.gitignore` already excludes `dist`, so nothing new is tracked).
   - The plan's Task 1 `<verify>` command mixes file paths from two different workspace packages (`packages/validators/...` and `apps/api/...`) in one `npx vitest run` invocation, and the repo has no root-level `vitest`/`vitest.config.ts` to run that across packages. Added a root `vitest.config.ts` scoped narrowly to Phase 9's own test paths plus a root `vitest` devDependency, so `pnpm --filter <pkg> test` and every other package's own test config are unaffected — a run whose cwd is inside a package still uses that package's own `vitest.config.ts` first.
   - Similarly, `npx prisma validate` from the repo root with no local `prisma` devDependency resolved to a freshly-fetched Prisma **7.9.1**, which rejects this repo's Prisma-6-style `datasource { url = env("DATABASE_URL") }` syntax outright. Added `"prisma": "^6.2.0"` as a root devDependency (matching `apps/api`'s own `prisma` version) so `npx prisma` resolves the correct major version.

## Correction: `packages/shared` migrated to `packages/types` + `packages/validators`

The initial implementation of this plan created a new `packages/shared` workspace package (with `web-dashboard/` and `owner-portal/` subpaths) instead of following this repo's established convention. This directly contradicted `.planning/phases/09-web-dashboard-owner-portal/09-RESEARCH.md`, which explicitly states: **"Do NOT create `packages/shared/`. It exists only as an empty stub..., it is not in `pnpm-workspace.yaml`'s resolved set as a real package, and no phase has ever used it."** — the same situation Phase 5 (`05-01-SUMMARY.md`) hit and corrected.

This was fixed in a follow-up commit that:
- Moved `packages/shared/src/web-dashboard/types.ts` → `packages/types/src/web-dashboard.ts` (unchanged content/behavior).
- Moved `packages/shared/src/web-dashboard/schemas.ts` → `packages/validators/src/web-dashboard.ts`, updating its import of `DASHBOARD_PANEL_ORDER` to come from `@breeyo/types` instead of a local relative path.
- Moved `packages/shared/src/owner-portal/types.ts` → `packages/types/src/owner-portal.ts` (unchanged content/behavior).
- Moved `packages/shared/src/owner-portal/schemas.ts` → `packages/validators/src/owner-portal.ts` (no cross-file import to fix here).
- Moved both Wave 0 schema test files into `packages/validators/src/__tests__/{web-dashboard,owner-portal}.test.ts`, updating imports accordingly.
- Updated the three `apps/api` Wave 0 test scaffolds (`access-policy.service.test.ts`, `magic-link.service.test.ts`, `portal-session.service.test.ts`) to import from `@breeyo/types` / `@breeyo/validators` instead of `@breeyo/shared/*`.
- Barrel-exported both new files from `packages/types/src/index.ts` and `packages/validators/src/index.ts` (`export * from './web-dashboard.js'` / `export * from './owner-portal.js'`).
- Removed the `@breeyo/shared` dependency from `apps/api/package.json` (it already depended on `@breeyo/types` and `@breeyo/validators`).
- Deleted `packages/shared/` entirely and re-ran `pnpm install` to refresh the lockfile.
- Updated the root `vitest.config.ts` include list to point at the new `packages/validators/src/__tests__/{web-dashboard,owner-portal}.test.ts` paths.

All 59 Wave 0 tests still pass after the migration, with no behavior change — only file location and import paths changed. `09-02-PLAN.md` through `09-07-PLAN.md` should be read as targeting `packages/types/src/{web-dashboard,owner-portal}.ts` and `packages/validators/src/{web-dashboard,owner-portal}.ts`, not `packages/shared`.

## Task Commits

1. **Task 1: shared contracts + Wave 0 tests** — `42f3ddf` (feat)
2. **Task 2: Prisma models** — `f9194dd` (feat)
3. **Fix: migrate `packages/shared` into `packages/types` + `packages/validators`** — see repo history for the follow-up commit hash.

_Both original tasks followed the TDD iron law: the failing test was written and run first (confirmed failing with a `Cannot find module` error for the right file), then the minimal implementation was added until it passed. The migration commit preserved that passing state — no test assertions changed._

## Verification

Task 1 — corrected command, run from the repo root:

```
npx vitest run packages/validators/src/__tests__/web-dashboard.test.ts packages/validators/src/__tests__/owner-portal.test.ts apps/api/src/modules/web-dashboard/__tests__/access-policy.service.test.ts apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts
```
Result: **5 files passed, 59 tests passed**, exit code 0 (same 59 tests as before the migration).

Task 2 — exact command from the plan, run from the repo root:

```
npx prisma validate --schema apps/api/prisma/schema.prisma
```
Result: `The schema at apps/api/prisma/schema.prisma is valid 🚀`, exit code 0. Untouched by the migration.

Additional sanity checks (not required by either `<verify>` block, run anyway):
- `packages/types`, `packages/validators`: `tsc` build — 0 errors.
- `git diff --stat apps/api/prisma/schema.prisma` confirms 104 insertions / 0 deletions — no existing model was modified.

## Not Done (by design)

- **Task 3** (`prisma db push` + `prisma generate`) — intentionally not run. The Prisma diff above (five new models, zero changes to existing models) is ready for a human to review before someone else runs Task 3.
- No `access-policy.service.ts`, `magic-link.service.ts`, `portal-session.service.ts`, or any route/controller — those are explicitly 09-02's and 09-05's scope, not Task 1's (see `files_modified` in `09-01-PLAN.md`).
