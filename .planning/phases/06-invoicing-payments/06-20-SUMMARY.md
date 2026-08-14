---
phase: 06-invoicing-payments
plan: "20"
subsystem: api
tags: [security, multi-tenancy, rls, d-30, refactor, ci, gate]
requires:
  - Pooled transaction-scoped tenant handle (`createTenantClient`, `TenantPrismaClient`) from 06-00
  - ENABLE + FORCE RLS on 21 clinic-scoped tables from 06-00
  - "`buildService(db)` per-request factory pattern from 06-02"
provides:
  - "`scripts/check-tenant-client.sh` — blocking CI gate against admin-client use in route/controller files"
  - "`Tenant client gate` step in the API CI job"
  - "New `mobile` CI job running `expo install --check` (Expo SDK native-module drift)"
  - "`TenantTransactionClient` alias for the `tx` of an extended client's interactive `$transaction`"
  - The complete, inline-documented admin-client exemption list (4 consumers)
  - HTTP-layer cross-tenant coverage on inventory items, stock and dispensing
affects:
  - Every future module — the gate blocks the admin client in any new route or controller
  - Plan 06-08 billing routes (must use `buildService(request.db)` or CI fails)
tech-stack:
  added: []
  patterns:
    - "Gate exemption protocol: a `D-30 exemption` marker on the line, or in the contiguous comment block above it; a blank line ends its reach"
    - "`TenantTransactionClient` where a helper receives the `tx` of a tenant-scoped interactive `$transaction`"
key-files:
  created:
    - scripts/check-tenant-client.sh
    - apps/api/src/modules/inventory/__tests__/dispense.controller.test.ts
  modified:
    - .github/workflows/ci.yml
    - apps/api/src/lib/prisma-rls.ts
    - apps/api/src/modules/notifications/{notification.routes,notification.controller,notification.service}.ts
    - apps/api/src/modules/clinic/{clinic.routes,clinic.controller,clinic.service}.ts
    - apps/api/src/modules/auth/auth.routes.ts
    - apps/api/src/jobs/midnight-archive.ts
    - apps/api/src/modules/inventory/{inventory.routes,dispense.routes,inventory-item.controller,dispense.controller,inventory-item.repository}.ts
    - apps/api/src/modules/inventory/{stock-movement,stock-receipt,stock-adjustment,stock-take,fifo-dispense,par-level-alert,want-list}.service.ts
    - apps/api/tests/helpers/factories.ts
    - apps/api/tests/tenant-isolation.test.ts
    - .planning/phases/06-invoicing-payments/deferred-items.md
decisions:
  - "Folded the unowned `inventory` module into this plan rather than allowlisting it, so the gate ships with no allowlist — the outcome 06-20's plan text explicitly wanted"
  - "Device-token routes keep the admin client: `device_tokens` has no `clinic_id` column and no RLS policy, and its routes deliberately omit `tenantContext`, so `request.db` does not exist there"
  - "Gate grants exemption from the contiguous comment block above a line, not only the same line, so a multi-line reason works; a blank line ends its reach so one comment cannot whitelist a file"
  - "Added `TenantTransactionClient` rather than casting to `Prisma.TransactionClient` — the cast compiles but discards the extension typing, which is the escape hatch D-30 closes"
  - "Added a `mobile` CI job because ci.yml had no mobile job to add the Expo check to"
metrics:
  duration: ~2h
  completed: 2026-08-14
  tasks: 2
  commits: 5
  tests_before: 593
  tests_after: 602
---

# Phase 6 Plan 20: Admin-Client Exemptions and the D-30 CI Gate — Summary

Converted the last three clinic-scoped modules — notifications, clinic, and the unowned `inventory` module Phase 5 left behind — to `request.db`, documented the four legitimate admin-client consumers inline, and locked the whole thing behind a CI gate that ships with no allowlist.

## Test Counts

| | Total | Passed | Failed | Todo |
|---|---|---|---|---|
| 06-02 recorded baseline | 593 | 513 | 0 | 80 |
| Post-change (this plan) | 602 | 522 | 0 | 80 |

`pnpm --filter @breeyo/api exec tsc --noEmit` exits 0.
`bash scripts/check-tenant-client.sh` exits 0 — 22 route/controller files scanned.

The +9 is 3 HTTP inventory tenancy tests, 5 `DispenseController` wiring guards, and 1 `InventoryController` wiring guard.

**For plan 06-19's gate script: the post-change API test count is 602 (522 passed, 0 failed, 80 todo).**

## The Exemption List — 4 consumers, with the reason for each

| # | Consumer | File | Why the admin client is correct |
|---|---|---|---|
| 1 | `TokenService`, `AuthService`, `PermissionService` | `modules/auth/auth.routes.ts` | The whole auth module is **pre-tenant**. Login, OTP verification and refresh all run before a clinic is selected, so `request.db` does not exist and `app.clinic_id` cannot be bound. Reads `users`, `refresh_tokens`, `roles`, `permissions`, `clinic_member_roles` — the global reference tables 06-00 deliberately left uncovered because they are what *establishes* the tenant. **Hardcoded exempt path in the gate.** |
| 2 | `PermissionService` (decorated locally) | `modules/clinic/clinic.routes.ts`, `modules/inventory/inventory.routes.ts`, `modules/inventory/dispense.routes.ts` | Same reason as #1, at three more registration sites. Fastify's plugin encapsulation means auth's own `decorate` never reaches sibling plugins, so each re-decorates locally. Runs during `authenticate`, before `tenantContext`. Moving it to `request.db` breaks login. **Comment-exempt.** |
| 3 | BullMQ notification worker | `modules/notifications/notification.routes.ts` | A worker processes jobs with **no HTTP request** and therefore no `request.db`. Derives tenancy from the durable job payload's `clinicId`, written by an already-tenant-scoped request. **Comment-exempt.** |
| 4 | Device-token service | `modules/notifications/notification.routes.ts` (same `adminDb` line) | `device_tokens` is **user-scoped**: no `clinic_id` column, therefore no RLS policy is even possible. Its two routes carry `authenticate` without `tenantContext` by design (a device registers before a clinic is chosen), so there is no `request.db` on that path. **Comment-exempt.** |

Plus one non-route consumer documented inline though the gate does not scan it:

| Consumer | File | Why |
|---|---|---|
| Midnight-archive cron | `jobs/midnight-archive.ts` | Runs on a timer with no request context and is **cross-clinic by design** — every clinic's queue resets at the same IST midnight. `QueueRepository.archiveEntries(today)` therefore takes no `clinicId`; it is the one intentional unscoped write in the codebase. |

## The Gate's Observed Failure Output

Required by the plan's acceptance criteria. `const r = new PatientRepository(fastify.prisma);` was injected into `apps/api/src/modules/patient/patient.routes.ts`, the script run, then the injection reverted (`git diff --stat` on that file is empty; the tree is clean).

```
D-30 tenancy gate FAILED -- admin Prisma client in a clinic-scoped file:

apps/api/src/modules/patient/patient.routes.ts:18:   const r = new PatientRepository(fastify.prisma);

Each line above builds a repository or service from the admin client,
which bypasses RLS. Build it per request from `request.db` instead:

    const buildService = (db: TenantPrismaClient) =>
      new XService(new XRepository(db));

    // ...then, as the first statement of every handler:
    const service = buildService(request.db);

See apps/api/src/modules/patient/patient.routes.ts for the reference shape.
If the admin client is genuinely required (no request context, or the code
runs before tenantContext), add a comment stating why, containing the exact
text "D-30 exemption", directly above the line.
```

Exit code `1`. A second probe verified the exemption window: with a `// probe: D-30 exemption` comment above three offending lines — two contiguous, one after a blank line — the gate flagged **only the line past the blank line**. The exemption reaches its code block and stops there, so one comment cannot whitelist a file.

The gate also fails if it scans zero files. A gate with a stale glob silently passes forever, which is worse than not having one.

## Deviations from Plan

### 1. [Scope addition, at the orchestrator's direction] Converted the `inventory` module

**Found by:** plan 06-02, recorded as deferred item #1; flagged to me before I started.
**Issue:** `inventory` landed in Phase 5, *after* 06-20's file list was written. It was in neither 06-02's six named modules nor this plan's two, and was still on `fastify.prisma` across `inventory.routes.ts`, `dispense.routes.ts` and nine services — with the six RLS policies 06-00 created for its tables unreachable.
**Decision:** folded the conversion in rather than allowlisting it. The plan's own rationale for sequencing the gate after the conversions was to avoid "a temporary allowlist that then gets forgotten"; adding one for the largest unconverted module would have inverted that. The work was mechanical — every inventory route already carries `tenantContext`, so `request.db` is always present.
**Scope:** 9 services + 1 repository retyped; 2 route files given `buildServices(db)` factories; 2 class controllers (13 and 9 handlers) converted; `SyncOperationService` built per request since it wraps three tenant-scoped services.
**Commit:** `cd80720`

### 2. [Rule 3 — Blocking] `TenantPrismaClient` has no assignable transaction-client type

**Found during:** the inventory conversion.
**Issue:** five inventory call sites use the interactive `$transaction(async (tx) => ...)` overload and pass `tx` into helpers typed `Prisma.TransactionClient`. That type describes the *unextended* client's handle and is not assignable from the extended one, so eight call sites failed to typecheck.
**Fix:** added `TenantTransactionClient` to `prisma-rls.ts`, derived from `TenantPrismaClient` rather than declared independently. Casting to `Prisma.TransactionClient` would have compiled while discarding exactly the extension typing D-30 exists to preserve.
**Commit:** `cd80720`

### 3. [Rule 3 — Blocking] `cleanupTestData` did not clear the Phase 5 tables

**Found during:** writing the inventory HTTP tests.
**Issue:** `tests/helpers/factories.ts` deletes Phase 3/4 tables but not the six inventory tables, so `tx.clinic.deleteMany()` fails on `inventory_items_clinic_id_fkey` as soon as any test creates stock. Same class of omission the Phase 3/4 block in that file already documents.
**Fix:** added the six deletes in reverse-dependency order.
**Commit:** `cd80720`

### 4. [Rule 2 — Missing critical coverage] The inventory conversion had no runtime proof

**Found during:** the inventory conversion.
**Issue:** all 80 tests in `tests/inventory/` are `it.todo`, and the unit tests mock Prisma entirely. Nothing would have caught the conversion breaking the write path — which was the real risk, since `StockReceiptService.receiveStock` and `FifoDispenseService.dispense` use the interactive `$transaction` overload and dispense issues a raw `SELECT ... FOR UPDATE` through `tx.$queryRaw`, so the conversion nests a transaction inside the extension's own.
**Fix:** three HTTP tests in `tenant-isolation.test.ts` (item listing, receive→dispense write path asserting stock actually moved 20→17, cross-tenant IDOR on read and dispense) plus a `dispense.controller.test.ts` wiring guard.
**Commit:** `cd80720`

### 5. [Honest finding] The three inventory HTTP tests are regression guards, not discriminators

**Found during:** verifying the new tests actually fail without the change.
**Issue:** I re-pointed both inventory factories at `fastify.prisma` and re-ran the three HTTP tests. **All three still passed.** Cause: every inventory repository and service method already carries an explicit `clinicId` filter — I checked `dispense`, `returnToStock`, `processStockTake`, `removeBarcode`, `findByBarcode`, and both `FOR UPDATE` raw queries. The module is uniformly defended at the application layer, so RLS here is genuinely the second layer, not a live leak being closed. This is the same result 06-02 hit with its first four tests.
**Fix:** kept the HTTP tests as regression guards (they would catch a *future* method that drops its filter) and added five `DispenseController` tests that assert the thing that *is* discriminating — that each handler resolves its services from `request.db`, including before input validation, and resolves a fresh handle per request. Those fail structurally if a handler reverts to a plugin-scope singleton.
**Probe fully reverted** — verified by `git diff --stat` and by re-running the gate and full suite.

### 6. [Deviation from plan text] `ci.yml` had no mobile job

**Issue:** the plan says to add the Expo check "in the mobile job of the same workflow". `ci.yml` had exactly one job (`test`); the only other mobile-related workflow is `ui-visual-regression.yml`, which is scoped to Storybook.
**Fix:** added a `mobile` job. It needs neither Postgres nor Redis, so it runs in parallel and reports independently. Verified locally: `expo install --check` prints "Dependencies are up to date", so the new gate is green on arrival rather than red.

### 7. [Deviation from plan text] Exemption markers placed on the lines themselves

**Issue:** the plan's verification command is line-based (`grep ... | grep -v 'D-30 exemption'`), but the gate I wrote accepts a marker in the comment block *above* a line, which is more robust for multi-line reasons. Five lines therefore satisfied the gate while still appearing in the plan's grep.
**Fix:** added the trailing marker to each exempt line so both agree, and reworded two prose lines that named `fastify.prisma` only as an example. The plan's verification grep now produces no output.
**Commit:** `42d5661`

### 8. [Rule 3 — Blocking] Worktree environment (as in 06-02)

The worktree branched from `956566e` (Phase 05 merge) and was missing all of Waves 1–2. Verified `HEAD` was a strict ancestor of `breeyo/phase-06-invoicing-payments` (merge-base == HEAD), then `git merge --ff-only` — lossless, and the merge back is a clean fast-forward. Also ran `pnpm install`, built `@breeyo/types` and `@breeyo/validators`, copied `.env` from the main checkout (gitignored, never staged), and provisioned `breeyo_wt0620` + `breeyo_wt0620_shadow` following the per-worktree convention rather than touching the shared dev DB other agents are using.

## Handler Coverage

| Module | Handlers on `request.db` | Handlers on the admin client |
|---|---|---|
| notifications | 4/6 | 2 (device-token — exemption #4) |
| clinic | 4/4 | 0 |
| inventory (`InventoryController`) | 13/13 | 0 |
| inventory (`DispenseController`) | 9/9 | 0 |
| inventory (sync dispatcher) | 1/1 | 0 |

**Note on the plan's notifications acceptance criterion.** It expected `grep -c 'request.db' notification.controller.ts` to equal the handler count. It returns 6 against 6 handlers, but that is 4 real uses plus 2 mentions in the doc comment — the substantive fact is that 4 of 6 handlers are converted and the other 2 are exemption #4, not an oversight.

## Threat Model Outcomes

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-06-133 | mitigated | notifications and clinic build per request from `request.db` |
| T-06-134 | mitigated | `check-tenant-client.sh` wired as a blocking CI step, shipping with **no allowlist** — the inventory module was converted rather than exempted |
| T-06-26 | accepted | BullMQ worker documented inline and comment-exempt in the gate, not silently permitted |
| T-06-135 | accepted | `PermissionService` carries an inline reason at all four sites; a well-meaning "fix" to `request.db` now fails CI rather than production login |
| T-06-136 | mitigated | Comment-only lines stripped before matching; `bash -n` clean; deliberate injection test performed and its output recorded above; gate additionally fails if it scans zero files |

## Known Stubs

None.

## Threat Flags

None. This plan changed wiring, added a CI gate, and added tests. No new endpoint, auth path, file-access pattern or schema was introduced. Every explicit `clinicId` filter was preserved; none was removed.

## Deferred (see `deferred-items.md`)

- Item #1 (inventory on the admin client) is **resolved** by this plan and marked as such.
- New item #4: the entire `tests/inventory/` suite is `it.todo` (80 placeholders). This plan added tenancy coverage for the paths it touched, but FIFO ordering, expiry blocking, batch override and the offline replay queue remain unexercised against a real database.
- Item #5 was withdrawn before filing: `turbo test --dry-run` confirms `@breeyo/mobile#test` does run in CI.

## Self-Check: PASSED

Files verified present: `scripts/check-tenant-client.sh` (mode `100755`), `apps/api/src/modules/inventory/__tests__/dispense.controller.test.ts`, `06-20-SUMMARY.md`.
Commits verified in `git log`: `fc43742`, `cd80720`, `4c345ad`, `42d5661`.
Final state: `tsc --noEmit` exits 0; 602 tests / 522 passed / 0 failed; `bash scripts/check-tenant-client.sh` exits 0; the plan's verification grep produces no output; `git diff` against the injected probes is empty.

## Note for the Orchestrator

Per instructions I did **not** touch `STATE.md` or `ROADMAP.md`. My branch descends from `c2fda28`, so the merge back is a fast-forward.

**Worth your attention:** the `inventory` conversion was not in this plan's file list, and it changed 17 files. If any other Wave 3 plan touches `apps/api/src/modules/inventory/`, expect a conflict there.
