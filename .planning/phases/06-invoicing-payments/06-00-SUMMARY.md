---
phase: 06-invoicing-payments
plan: "00"
subsystem: infrastructure / tenant-isolation
tags: [rls, multi-tenancy, prisma, postgres, security, ci]
requires: []
provides:
  - Pooled app-role Prisma singleton (`getAppPrisma` / `disconnectAppPrisma`)
  - Transaction-scoped tenant handle (`createTenantClient`, `TenantPrismaClient`)
  - ENABLE + FORCE RLS with four per-operation policies on 21 clinic-scoped tables
  - CI schema-reproducibility gate (`prisma migrate diff --exit-code`)
  - Cross-tenant isolation test coverage for pets / consultations / service_catalog / prescriptions
affects:
  - Every Phase 6 plan that adds a clinic-scoped table (must add policies to post-migrate.sql section 7)
  - Any module that adopts `request.db` instead of `fastify.prisma`
tech-stack:
  added: []
  patterns:
    - "Prisma client extension at the root of `query` wrapping every operation in a sequential-array $transaction that first binds app.clinic_id via set_config"
    - "post-migrate.sql section 7: ENABLE + FORCE + <table>_{select,insert,update,delete} keyed on current_setting('app.clinic_id', true)::uuid"
    - "Child tables with no clinic_id scoped through their parent with an EXISTS subquery"
key-files:
  created:
    - apps/api/src/lib/__tests__/prisma-rls.test.ts
  modified:
    - apps/api/src/lib/prisma-rls.ts
    - apps/api/src/middleware/tenant-context.ts
    - apps/api/src/plugins/prisma.ts
    - apps/api/prisma/post-migrate.sql
    - apps/api/tests/tenant-isolation.test.ts
    - apps/api/tests/helpers/factories.ts
    - .github/workflows/ci.yml
  deleted:
    - apps/api/prisma/rls/phase-03-patient-queue-rls.sql
    - apps/api/prisma/rls/phase-05-inventory-rls.sql
decisions:
  - "Baseline migration NOT created -- migrations already reproduce schema.prisma; adding it would have broken migrate deploy"
  - "RLS extension applied at the root of `query`, not under $allModels, so raw queries through the handle are scoped too"
  - "drugs and its children use read-admits-global / write-own-clinic policies because clinic_id is nullable and NULL means global formulary"
  - "CI reproducibility gate placed BEFORE post-migrate.sql because the pg_trgm indexes are intentionally unmodelled and register as drift"
  - "Phase 5 inventory tables included (plan scoped only Phase 3/4) -- deleting phase-05-inventory-rls.sql would otherwise have dropped their RLS entirely"
metrics:
  duration: ~35 min
  completed: 2026-08-14
  tasks: 3
  commits: 4
  tests_added: 10
  suite: "506 passed, 0 failed, 80 todo"
---

# Phase 6 Plan 00: Tenant-Isolation Remediation (Wave 0a, D-30) Summary

Closed the multi-tenancy boundary before any billing table exists: the per-request Prisma client is now a pooled singleton whose every operation binds `app.clinic_id` as a parameter inside the same transaction as the query, and RLS went from 3 tables / 9 policies to 21 tables / 93 policies with ENABLE + FORCE throughout.

## What Was Built

**Task 1 — pooled, transaction-scoped tenant handle** (`c7070b7` RED, `15d458e` GREEN)

`createTenantClient` previously constructed a fresh `PrismaClient` per HTTP request, never disconnected it, and issued `SET LOCAL app.clinic_id = '<interpolated>'` as a statement separate from the query it was meant to scope. All three defects are fixed:

- `getAppPrisma()` is a lazy module-level singleton on `DATABASE_URL_APP`; `disconnectAppPrisma()` is wired into the Fastify `onClose` hook alongside the admin client (T-06-02).
- Every operation now runs as `$transaction([$executeRaw\`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)\`, query(args)])` — the GUC is provably live on the same connection *and* the same transaction as the query the policies filter (T-06-01).
- Tagged-template `$executeRaw` replaces `$executeRawUnsafe` string interpolation (T-06-05).
- `request.db` is typed `TenantPrismaClient` rather than cast back to raw `PrismaClient`, which had been hiding the isolation wrapper from the type system.

**Task 2 — RLS on every clinic-scoped table** (`b216fe0`)

`post-migrate.sql` gained section 7 covering 21 tables in the ENABLE + FORCE + four-per-operation-policy shape already used by `clinic_members`. Section 8 documents every table deliberately left uncovered, with a reason per line.

**Task 3 — cross-tenant isolation proof** (`3d7c35f`)

Five tests reading through `createTenantClient` (not the RLS-bypassing admin client), plus five factories following the existing `createTestX(requiredFks, overrides)` convention.

## Tables That Received Policies (21 tables, 93 policies)

| Group | Tables | Policies each |
|---|---|---|
| Pre-existing (unchanged) | `clinic_members` (4), `auth_audit_log` (2), `notifications` (3) | — |
| Own `clinic_id` | `pet_owners`, `pets`, `queue_entries`, `consultations`, `consultation_drafts`, `vaccination_records`, `deworming_records`, `service_catalog`, `drugs` | 4 |
| Child, scoped via parent `consultations` | `consultation_locks`, `vitals`, `prescriptions`, `consultation_attachments` | 4 |
| Child, scoped via parent `drugs` | `drug_formulations`, `species_dosages` | 4 |
| Phase 5 inventory | `inventory_items`, `inventory_barcodes`, `stock_batches`, `stock_movements`, `clinic_inventory_categories`, `clinic_inventory_units` | 4 |

## Tables Deliberately Left Without Clinic Policies (11)

| Table | Reason |
|---|---|
| `users` | Global identity; read during login before any clinic context exists. |
| `clinics` | The tenant table itself; visibility filtered by membership in the app layer. |
| `roles` | Global reference data, identical for every clinic. |
| `permissions` | Global reference data, identical for every clinic. |
| `role_permissions` | Global reference data (role → permission mapping). |
| `clinic_member_roles` | Child of `clinic_members`, which is already forced; reachable only via a visible member row. |
| `user_permission_overrides` | Child of `clinic_members`, same reasoning. |
| `refresh_tokens` | User-scoped auth material, looked up by token hash before a clinic context exists. |
| `device_tokens` | User-scoped; a push token spans all of a user's clinics. |
| `consent_records` | DPDP consent is owner-scoped, has no `clinic_id`, and must survive a clinic relationship ending. |
| `_prisma_migrations` | Migration bookkeeping, not application data. |

Verified against the live database: `SELECT tablename FROM pg_tables WHERE rowsecurity = false` returns exactly this list and nothing else.

## RESEARCH A6 — Observed Pre-Remediation Behaviour

**Result: the new tests fail hard against the old `createTenantClient`. The isolation boundary was not merely unverified — it was non-functional.**

Method (note: `git stash` is unsafe here — the stash ref is shared across all worktrees of a repo, so a `stash`/`pop` pair can silently apply a sibling agent's WIP. Instead only `createTenantClient`'s body was temporarily reverted in place, with the Task 2 policies left active, then restored with `git checkout -- <file>`. This isolates exactly one variable: the client implementation).

Against the pre-remediation body, **4 of the 5 new tests failed** with:

```
PostgresError { code: "22P02", message: "invalid input syntax for type uuid: \"\"" }
```

That error is the direct evidence the plan hypothesised. `current_setting('app.clinic_id', true)` resolved to the **empty string** at the moment the query ran, so the policy's `''::uuid` cast threw — proving `SET LOCAL` never reached the connection executing the query.

The fifth test, "tenant handle blocks cross-tenant write", **passed only incidentally**: it asserts `rejects.toThrow()`, and the 22P02 error satisfied that assertion just as well as RLS hiding the row would have. It was not evidence of working isolation. Recorded here because a green tick on that one test in isolation would be misleading.

For completeness: against the *fully* pre-remediation state (old client **and** no policies on these tables, which is what shipped), the failure mode is the opposite and worse — the tables were fail-open, so `pet.findMany()` through the "tenant" handle would have returned **both** clinics' pets and `expect(idsSeenByA).not.toContain(petB.id)` would have failed on a genuine cross-tenant data leak.

## Deviations from Plan

### 1. [Rule 3 — Blocking] Baseline migration not created; the drift it targeted no longer exists

- **Found during:** Task 2, before writing any SQL.
- **Issue:** The plan is built on "15 tables from Phases 3-4 exist in `schema.prisma` with no migration at all, so `prisma migrate deploy` cannot reproduce the database". That is no longer true. `apps/api/prisma/migrations/` now contains five migrations, including `20260812000000_backfill_phase_3_to_6_models` (409 lines, 15 `CREATE TABLE`s) and two Phase 5 inventory migrations, all added after the plan was written. `schema.prisma` is also 695 lines now, not the 557 the plan cites.
- **Verified:** from a freshly created empty database, `prisma migrate deploy` followed by `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` reports **"No difference detected"** and exits 0.
- **Action:** did **not** create `20260812090000_baseline_phase_3_4/migration.sql`. Its `CREATE TABLE "pets"` etc. would collide with the existing backfill migration and break `migrate deploy` on every fresh database — satisfying a grep at the cost of the thing the grep exists to protect. The plan's actual goal (CI enforces reproducibility) is met by the new CI gate.
- **Consequence:** the plan's `must_haves.artifacts` entry for that migration path is intentionally unmet, and acceptance criterion "`grep -c 'CREATE TABLE \"pets\"' .../20260812090000_baseline_phase_3_4/migration.sql` returns 1" cannot be satisfied. Equivalent guarantee delivered instead.

### 2. [Rule 1 — Bug] CI reproducibility gate moved before `post-migrate.sql`

- **Found during:** Task 2 verification.
- **Issue:** The plan places the gate "immediately after the existing `post-migrate.sql` step". Empirically it fails there: `post-migrate.sql` creates four `pg_trgm` GIN indexes that are deliberately not modelled in `schema.prisma`, and `migrate diff` reports them as drift —
  `[-] Removed index on columns (name)` for `pets`, `inventory_items`, and `(name)`/`(mobile)` for `pet_owners`.
- **Fix:** the step runs immediately after `prisma migrate deploy` and before `post-migrate.sql`. This also states the more precise claim: the *migration set alone* reproduces `schema.prisma` from empty.
- **Also:** the plan's `--from-schema-datasource "$DATABASE_URL"` is wrong for Prisma 6 — that flag takes a **schema file path**, not a URL. Uses `prisma/schema.prisma` with `working-directory: apps/api`.

### 3. [Rule 1 — Bug] The orphan RLS file was **not** orphaned; deleting it as instructed would have removed live RLS

- **Found during:** Task 2 `read_first`.
- **Issue:** The plan (and PATTERNS Warning 1) states `phase-03-patient-queue-rls.sql` "is referenced by no script or workflow". It is: `.github/workflows/ci.yml:77` runs it, and line 78 runs a **second** file the plan never mentions, `phase-05-inventory-rls.sql`, which did not exist when the plan was written. Blind deletion would have left `pets`, `pet_owners` and `queue_entries` without their trigram indexes and stripped inventory RLS entirely.
- **Fix:** folded both files into `post-migrate.sql` before deleting them — `CREATE EXTENSION pg_trgm` and all four fuzzy-search GIN indexes preserved verbatim, both files' policies re-expressed in the ENABLE + FORCE + four-policy shape, and their superseded single-policy names explicitly `DROP POLICY IF EXISTS`'d so an already-migrated database converges on the same state as a fresh one. Both `psql` lines removed from CI.

### 4. [Rule 2 — Missing critical functionality] Phase 5 inventory tables given policies

- **Found during:** Task 2.
- **Issue:** The plan scopes only Phase 3/4 tables. Since deviation 3 deletes the file that carried inventory RLS, following the plan literally would have *reduced* coverage. Phase 6 invoices line-item directly off `stock_movements` and `inventory_items`, so these are money-adjacent.
- **Fix:** all six inventory tables upgraded from a single permissive `ALL` policy with no `FORCE` to the full four-policy forced shape.

### 5. [Rule 1 — Bug] `drugs` policies admit the global formulary

- **Found during:** Task 2, cross-checking `schema.prisma`.
- **Issue:** The plan lists `drugs` among tables to scope with a flat `clinic_id = current_setting(...)::uuid`. But `Drug.clinicId` is **nullable**, and `clinic_id IS NULL` means a globally shared reference drug — see the recent commit `fix(drug): scope drug queries to global rows and the active clinic`. A flat equality check would have hidden the entire global formulary from every clinic, breaking drug lookup and dosage calculation.
- **Fix:** `drugs_select` uses `clinic_id IS NULL OR clinic_id = current_setting(...)::uuid`; insert/update/delete stay restricted to the caller's own clinic so a tenant cannot mutate or delete shared reference data. `drug_formulations` and `species_dosages` mirror this through their `EXISTS` parent subquery.

### 6. [Rule 2] Extension applied at the root of `query`, not under `$allModels`

- **Issue:** The plan's action specifies `{ query: { $allModels: { $allOperations } } }`, but its own behaviour spec requires asserting the GUC "via a `$queryRaw` executed through the same handle". Under `$allModels`, raw queries are **not** intercepted, so they would run with no `app.clinic_id` bound — a silent hole for any future code reaching for `request.db.$queryRaw`.
- **Fix:** applied at the root of `query`, which covers model operations and raw queries alike. Strictly stronger, and required by the plan's own tests.

### 7. [Rule 1 — Bug] Test probe used a privilege-filtered catalog view

- **Found during:** Task 1 GREEN (1 of 5 tests red).
- **Issue:** the SQL-injection test probed `information_schema.tables` to confirm `users` still existed. That view is filtered by the caller's privileges, so under `breeyo_app` it reported the table as absent — a false negative unrelated to the code under test.
- **Fix:** probe `pg_catalog.pg_tables` instead.

### 8. Task 3's `cleanupTestData()` extension was already done

`cleanupTestData()` already deletes all Phase 3/4 rows in FK-safe order (added by a prior phase). No change needed.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @breeyo/api exec tsc --noEmit` | exit 0 |
| Full API suite | **506 passed, 0 failed**, 80 todo, 9 skipped files (all pre-existing) |
| `src/lib/__tests__/prisma-rls.test.ts` | 5 passed |
| `tests/tenant-isolation.test.ts` | 11 passed (6 pre-existing + 5 new) |
| From-empty rebuild: `migrate deploy` → `migrate diff --exit-code` | "No difference detected", exit 0 |
| `post-migrate.sql` on that fresh database | applies clean; **93** policies; idempotent on re-run |
| `grep -c '\$executeRawUnsafe' prisma-rls.ts` | 0 |
| `grep -c 'SET LOCAL' prisma-rls.ts` | 0 |
| `grep -v '^\s*[/*]' prisma-rls.ts \| grep -c 'new PrismaClient'` | 2 (`getAppPrisma`, `getBasePrisma`; neither inside `createTenantClient`) |
| `grep -c '^export ' prisma-rls.ts` | 6 (≥ 4) |
| `grep -c 'FORCE ROW LEVEL SECURITY' post-migrate.sql` | 24 (≥ 18) |
| `grep -c "current_setting('app.clinic_id', true)::uuid" post-migrate.sql` | 93 (≥ 60) |
| `pg_policies` count | 93 (≥ 60) |
| `grep -rc 'app.current_clinic_id' apps/api/prisma/` | no output — no file references the wrong GUC |
| `test ! -e apps/api/prisma/rls` | directory gone |
| `grep -c 'createTenantClient' tenant-isolation.test.ts` | 9 (≥ 5) |
| `grep -c 'export async function createTest' factories.ts` | 9 (≥ 8) |
| `.github/workflows/ci.yml` contains `Verify schema reproducibility` | yes |
| Unprotected tables list | exactly the 10 intentional tables + `_prisma_migrations` |

Verification ran against a dedicated database (`breeyo_wt0600`, plus `breeyo_wt0600_shadow` for the from-empty rebuild) in the shared dev Postgres container, so no other parallel worktree agent's data was touched. `apps/api/.env` in this worktree points at it and is gitignored. Those two databases can be dropped once the wave merges.

## Threat Model Coverage

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-06-01 | mitigated | GUC + query in one sequential-array `$transaction`; cross-tenant reads return zero rows (Task 3) |
| T-06-02 | mitigated | Single pooled app client; `disconnectAppPrisma` on `onClose`; test asserts 50 calls → 1 construction |
| T-06-05 | mitigated | `$executeRawUnsafe` count 0; test asserts a quote-bearing clinicId round-trips verbatim and does not alter the statement |
| T-06-20 | mitigated | 21 tables ENABLE + FORCE, 93 policies, `pg_policies` gate |
| T-06-21 | mitigated | Both `prisma/rls/*.sql` folded in and deleted; no reference to the wrong GUC remains |
| T-06-22 | mitigated | `Verify schema reproducibility` CI step; from-empty rebuild verified locally |

## Known Stubs

None.

## Threat Flags

None — this plan removed attack surface rather than adding any. No new endpoints, auth paths, file access or trust-boundary schema changes.

## Follow-Ups for Later Phase 6 Plans

1. **PATTERNS Warning 4 is still open and is the load-bearing gap.** No shipped module uses `request.db` — `emr.routes.ts`, `queue.routes.ts` and `patient.routes.ts` all pass `fastify.prisma` (the `breeyo_admin` client, which is `BYPASSRLS`). The isolation boundary this plan built is therefore **correct and tested but not yet on the runtime path for Phases 3-5**. Billing routes should adopt `request.db` and become its first real consumers. Auditing and converting existing call sites was listed under D-30(b) in CONTEXT but is not in this plan's task list, so it was not done here.
2. **Interactive-transaction limitation.** Calling `request.db.$transaction(async tx => ...)` on the extended handle would nest a transaction inside the extension's own. No caller does this today (nothing uses `request.db` at all), but any Phase 6 billing service needing an interactive transaction should take a `withTenant(clinicId, fn)` helper instead of the extended handle.
3. **Any new Phase 6 clinic-scoped table must add its four policies to `post-migrate.sql` section 7.** The `pg_policies` count is not currently asserted in CI — only schema reproducibility is. Consider adding a policy-count assertion when the billing tables land.
4. D-30(e) (missing mobile deps: `expo-print`, `expo-sharing`, `expo-file-system`, `react-native-paper`, `@breeyo/ui`) is part of Wave 0 per CONTEXT but is not in this plan's tasks — still outstanding.

## Self-Check: PASSED

All claimed files verified present on disk; all four commit hashes verified in `git log`.
