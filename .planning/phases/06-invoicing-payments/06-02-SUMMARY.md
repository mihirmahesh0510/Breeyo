---
phase: 06-invoicing-payments
plan: "02"
subsystem: api
tags: [security, multi-tenancy, rls, d-30, refactor]
requires:
  - Pooled transaction-scoped tenant handle (`createTenantClient`, `TenantPrismaClient`) from 06-00
  - ENABLE + FORCE RLS on 21 clinic-scoped tables from 06-00
provides:
  - "`buildService(db: TenantPrismaClient)` per-request service-factory pattern (reference implementation for 06-08 and 06-20)"
  - "`DbClient` union alias for repositories reachable from both the HTTP path and admin-path callers"
  - HTTP-layer cross-tenant test coverage on pets, queue entries and consultations
  - Proof that `app.clinic_id` survives an interactive `$transaction` nested inside the extension's own transaction
  - Explicit pet-ownership guard on queue check-in
affects:
  - Plan 06-08 billing routes (copy the factory verbatim)
  - Plan 06-20 (notifications + clinic conversion, admin-client exemptions, CI gate)
  - Any future module constructing a repository
tech-stack:
  added: []
  patterns:
    - "Per-request `const buildService = (db: TenantPrismaClient) => new XService(new XRepository(db))` at plugin scope; controller factory takes `buildService`; every handler resolves `buildService(request.db)` as its first statement"
    - "Non-tenant collaborators (Socket.IO server, BullMQ producer, stateless calculators) stay plugin-scope singletons and are closed over by the factory"
    - "`DbClient = TenantPrismaClient | PrismaClient` for repositories with admin-path callers; `TenantPrismaClient` directly where the interactive `$transaction` overload is used"
key-files:
  created:
    - .planning/phases/06-invoicing-payments/deferred-items.md
  modified:
    - apps/api/src/lib/prisma-rls.ts
    - apps/api/src/lib/audit-log.ts
    - apps/api/src/modules/patient/{patient.routes,patient.controller,patient.repository}.ts
    - apps/api/src/modules/queue/{queue.routes,queue.controller,queue.repository,queue.service}.ts
    - apps/api/src/modules/emr/{emr.routes,emr.controller,emr.repository,emr.service,consultation-lock.service}.ts
    - apps/api/src/modules/attachment/{attachment.routes,attachment.controller,attachment.service}.ts
    - apps/api/src/modules/vaccination/{vaccination.routes,vaccination.controller,vaccination.repository,vaccination.service}.ts
    - apps/api/src/modules/drug/{drug.routes,drug.controller,drug.repository}.ts
    - apps/api/tests/tenant-isolation.test.ts
decisions:
  - "Repositories with admin-path callers take the `DbClient` union rather than `TenantPrismaClient`, because the midnight-archive cron job is cross-clinic by design and legitimately needs the raw client"
  - "emr types its handle as `TenantPrismaClient` directly: the interactive `$transaction(async (tx) => ...)` overload does not resolve through a union"
  - "`writeAuditLog` widened to `DbClient` rather than duplicated, since auth writes pre-clinic-selection through the admin client while clinic-scoped modules write through the tenant handle"
  - "Added a fifth HTTP test beyond the four the plan specified, because all four passed before the change and therefore proved nothing"
metrics:
  duration: ~2h
  completed: 2026-08-14
  tasks: 2
  commits: 4
  tests_before: 586
  tests_after: 593
---

# Phase 6 Plan 02: Tenant-Handle Conversion for Six Clinic-Scoped Modules — Summary

Converted patient, queue, emr, attachment, vaccination and drug from the RLS-bypassing admin client to per-request `request.db` construction, establishing the `buildService(db)` factory that plans 06-08 and 06-20 copy — and closing a live cross-tenant leak on the queue board in the process.

## Test Counts

| | Total | Passed | Failed |
|---|---|---|---|
| Pre-change baseline | 586 | 506 | 0 |
| Post-change | 593 | 513 | 0 |

`pnpm --filter @breeyo/api exec tsc --noEmit` exits 0. `grep -rn 'fastify.prisma\|request.server.prisma'` across the six modules returns nothing.

## The `buildService(db)` Factory Signature — copy this verbatim

Single-collaborator module (patient, drug, vaccination, attachment):

```ts
// x.routes.ts — plugin scope
const buildService = (db: TenantPrismaClient) =>
  new XService(new XRepository(db));

const controller = createXController(buildService);
```

```ts
// x.controller.ts
export function createXController(
  buildService: (db: TenantPrismaClient) => XService,
) {
  return {
    async someHandler(request: FastifyRequest, reply: FastifyReply) {
      const xService = buildService(request.db);   // first statement, before safeParse
      ...
    },
  };
}
```

Module with non-tenant collaborators (queue, emr) — the collaborator stays a plugin-scope singleton and is closed over:

```ts
const dosageService = new DosageService();            // stateless, plugin-scope
const notificationBus = createNotificationBus(fastify.redis);  // BullMQ producer
fastify.addHook('onClose', async () => { await notificationBus.close(); });

const buildServices = (db: TenantPrismaClient) => {
  const lockService = new ConsultationLockService(db);
  return {
    emrService: new EmrService(new EmrRepository(db), lockService, dosageService, db),
    lockService,
  };
};
```

Handler count per module: patient 9/9, queue 5/5, emr 12/12, attachment 4/4, drug 3/3, vaccination 6/6.

## Modules Whose Constructor Arity Made This Non-Obvious

| Module | Wrinkle | Resolution |
|---|---|---|
| **emr** | Controller needed *two* per-request collaborators (`emrService` and `lockService`), and `lockService` is also a constructor argument of `EmrService` | One factory returning `{ emrService, lockService }`, with a single `lockService` instance shared by both so they observe the same lock state |
| **emr** | `EmrRepository` uses the interactive `$transaction(async (tx) => ...)` overload, which does not typecheck through a union | Typed `TenantPrismaClient` directly, not `DbClient` |
| **vaccination** | Class-based controller (`new VaccinationController(service)`) with arrow-function handler properties using `this.service` | Constructor takes `buildService`; each handler resolves `const service = this.buildService(request.db)` and `this.service.` became `service.` — every `clinicId` argument preserved |
| **queue** | `QueueService` takes `(repository, io)` where `io` is a Socket.IO server | `io` stays plugin-scope, closed over by the factory |
| **queue** | `QueueRepository.getTodayIST()` is static and called by the cron job with no instance | Left static; a regression test asserts it stays callable without an instance |
| **audit-log** | `writeAuditLog(prisma, ...)` is called from both admin-path (auth) and tenant-path (emr, attachment, vaccination) code | Widened to `DbClient` |

## Deviations from Plan

### 1. [Rule 3 — Blocking] Plan dependency 06-00 was absent from the worktree

**Found during:** setup, before Task 1.
**Issue:** This worktree branched from `956566e` (Phase 05 merge). Plans 06-00 and 06-01 had already merged onto `breeyo/phase-06-invoicing-payments` at `df10f3c`. `prisma-rls.ts` was still the pre-06-00 version — no `TenantPrismaClient` export, per-request `new PrismaClient()`, `SET LOCAL` outside a transaction. The plan is unexecutable without it.
**Fix:** Verified `HEAD` was a strict ancestor of the phase branch (14 commits to gain, 0 to lose), then `git merge --ff-only`. Lossless; my commits now sit on top of 06-00, so the merge back is a clean fast-forward.

### 2. [Rule 3 — Blocking] Worktree had no `node_modules`, no built workspace packages, no `.env`, and no usable database

**Found during:** baseline capture.
**Fixes, in order:** `pnpm install`; `pnpm --filter @breeyo/types --filter @breeyo/validators build` (vitest could not resolve `@breeyo/validators`/`@breeyo/types` without their `dist/`); copied `.env` from the main checkout (both copies are gitignored and were never staged); provisioned an isolated database.

**On the database:** the shared dev DB at `localhost:5433/breeyo` had diverged — a sibling agent had applied `20260812200629_add_phases_3_through_5`, which does not exist locally. I did **not** reset it, since parallel agents are using it. Instead I created `breeyo_wt0602` + `breeyo_wt0602_shadow`, following the per-worktree convention already visible in the cluster (`breeyo_wt0600`, `breeyo_phase06`), applied all five migrations, ran `post-migrate.sql` (24 tables with RLS forced) and seeded RBAC data.

### 3. [Deviation from plan text] Added a fifth HTTP test; the four specified were non-discriminating

**Found during:** Task 1 RED.
**Issue:** All four behaviours the plan specified **passed before any implementation change**. This tripped the TDD fail-fast rule, so I stopped and investigated rather than proceeding. Cause: every repository method already carries an explicit `clinicId` WHERE clause, so the admin client filters correctly at the application layer. The four tests are worthwhile regression guards but cannot demonstrate the conversion.
**Fix:** Added `HTTP cross-tenant pull — clinic A cannot pull clinic B pet onto its queue board`, which exercises `QueueService.checkIn` — the one path with no explicit `clinicId` filter on the pet. It failed genuinely before the change, exposing clinic B's pet name and owner name on clinic A's board. The `HTTP-layer tenant scoping (D-30)` block therefore reports **5** tests, not the 4 the acceptance criteria named.
**Commit:** `2f16568`

### 4. [Rule 2 — Missing critical functionality] `QueueService.checkIn` never verified pet ownership

**Found during:** Task 2 verification.
**Issue:** Check-in accepted any `petId` and wrote a queue entry scoped to the caller's clinic pointing at it. On the admin client this was the live leak above. After the conversion the leak is closed, but the insert then fails on the RLS-invisible relation and surfaced as a **500** rather than a clean rejection — inconsistent with the pet IDOR path's 404.
**Fix:** Added `QueueRepository.findPetInClinic(clinicId, petId)` and a 404 `PET_NOT_FOUND` guard ahead of any queue-state mutation. This restores the explicit `clinicId` filter as layer one with RLS as the backstop — the pairing 06-RESEARCH's threat register requires (T-06-25). Verified: cross-tenant check-in returns 404 and writes zero `queue_entries` rows.
**Commit:** `a46dc5d`

### 5. [Rule 2 — Missing critical coverage] Interactive-transaction scoping was unproven

**Found during:** Task 2, emr.
**Issue:** 06-00's extension wraps every operation in its own `$transaction`. `EmrRepository.finalizeConsultation` and `savePrescriptions` use the *interactive* `$transaction(async (tx) => ...)` overload, so the conversion nests one transaction inside another. There are no emr integration tests, so a silent failure — or worse, silently unscoped writes — would not have been caught. `EmrRepository.updateAddenda` updates `where: { id: consultationId }` with **no** `clinicId` filter, so RLS is the only protection there.
**Fix:** Probed at runtime, then locked the result in as a permanent test. Confirmed: reads inside the interactive transaction stay scoped, and a filterless cross-tenant update by id is rejected with the target row untouched.
**Commit:** `771f530`

## Threat Model Outcomes

| Threat ID | Disposition | Outcome |
|---|---|---|
| T-06-03 | mitigated | All six modules construct per request from `request.db`; HTTP-layer cross-tenant tests cover pets, queue entries and consultations |
| T-06-04 | mitigated | `request.server.prisma.speciesDosage` → `request.db.speciesDosage`, `drugId`/`species` filter retained; grep gate returns 0 |
| T-06-25 | mitigated | No explicit `clinicId` filter removed (verified by diff); one *added* on the check-in path |

## Known Stubs

None.

## Threat Flags

None — this plan changed wiring only. No new endpoint, auth path, file-access pattern or schema was introduced.

## Deferred (see `deferred-items.md`)

1. **`inventory` is still on the admin client and is unowned.** Eight services across `inventory.routes.ts` and `dispense.routes.ts`. It is in neither 06-02 (six named modules) nor 06-20 (scoped to notifications + clinic) — Phase 5 landed after 06-20's plan text was written. Its six tables already have RLS policies from 06-00, so the policies exist with nothing reaching them through the tenant handle. **This needs an owner before 06-20's `scripts/check-tenant-client.sh` gate lands, or that gate will need the allowlist entry its plan text explicitly wants to avoid.**
2. `prisma/seed.ts` never calls `dotenv.config()`, so `pnpm db:seed` fails on a fresh checkout.
3. `QueueRepository.archiveEntries(today)` takes no `clinicId` — a legitimate cron-job exemption, recorded so 06-20's exemption list is complete.

## Self-Check: PASSED

All claimed files exist on disk; all four commit hashes (`2f16568`, `5d8d408`, `771f530`, `a46dc5d`) resolve in `git log`. Final verification re-run from a clean state: `tsc --noEmit` exits 0, full API suite 593 tests / 513 passed / 0 failed.

## Note for the Orchestrator

Per instructions I did **not** touch `STATE.md` or `ROADMAP.md`. My branch is a descendant of `df10f3c`, so the merge back is a fast-forward.
