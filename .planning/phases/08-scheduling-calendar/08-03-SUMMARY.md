---
phase: 08-scheduling-calendar
plan: "03"
subsystem: persistence
tags: [prisma, postgresql, migration, scheduling, appointments, availability, queue]

requires: []
provides:
  - "Appointment, AppointmentPet, VetAvailabilityTemplate, AvailabilityOverride, BlockedPeriod models in schema.prisma"
  - "AppointmentStatus, AppointmentSource, BlockedPeriodReason enums; QueueEntryStatus.EXPECTED"
  - "ServiceCatalog.durationMinutes (default 15), Appointment.durationMinutes (NOT NULL booking-time snapshot)"
  - "QueueEntry.queuePriorityAt (NOT NULL, backfilled) and QueueEntry.appointmentId"
  - "Migration 20260813100000_add_scheduling_models, applied, in parity with schema.prisma"
  - "Six scheduling test factories in apps/api/tests/helpers/factories.ts + FK-safe cleanupTestData() ordering"
  - "apps/api/tests/scheduling/schema-shape.test.ts — 9 database-shape assertions"
affects: [08-04, 08-05, 08-06, 08-07, 08-08, 08-09, 08-10, 08-11]

tech-stack:
  added: []
  patterns:
    - "QueueEntry conventions copied verbatim to every new model: dbgenerated UUID id, snake_case @map on every column, @@map to plural table name, clinicId-leading composite indexes, back-relation on Clinic"
    - "Enum value added via ALTER TYPE ... ADD VALUE in its own transaction ahead of any statement that could reference it (verified no same-file reference; no transaction split needed)"
    - "Nullable-then-backfill-then-NOT-NULL column addition pattern for adding a required column to a non-empty table (queue_priority_at)"
    - "Booking-time snapshot columns (Appointment.durationMinutes) instead of live FK reads, so later catalog edits cannot retroactively resize history"

key-files:
  created:
    - apps/api/prisma/migrations/20260813100000_add_scheduling_models/migration.sql
    - apps/api/tests/scheduling/schema-shape.test.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/tests/helpers/factories.ts
    - apps/api/src/modules/queue/queue.repository.ts
    - apps/api/src/modules/patient/__tests__/patient.service.test.ts
    - apps/api/src/modules/queue/__tests__/queue.service.test.ts
    - apps/api/tests/billing/consultation-draft-hook.test.ts

key-decisions:
  - "ServiceCatalog.durationMinutes default chosen: 15 — matches DEFAULT_SERVICE_DURATION_MINUTES in packages/types/src/constants/scheduling.constants.ts exactly (plan 08-01), no discrepancy to record"
  - "ALTER TYPE \"QueueEntryStatus\" ADD VALUE 'EXPECTED' needed no transaction split: verified (Task 2) that no later statement in the same migration.sql file references 'EXPECTED' in a default, CHECK or index predicate, so Prisma's single-transaction generated SQL was left as-is"
  - "queue_priority_at added nullable, backfilled from checked_in_at (UPDATE queue_entries SET queue_priority_at = checked_in_at WHERE queue_priority_at IS NULL), then ALTER COLUMN SET NOT NULL — for an organic walk-in, priority time and physical check-in time are the same instant, so no historical queue ordering changes"
  - "Migration directory forced to 20260813100000_add_scheduling_models per plan instruction, confirmed present on disk exactly as named"
  - "No RLS policies added to the five new scheduling tables — verified via grep (0 matches for 'row level security'/'create policy' in the migration) — tenant isolation is enforced at the repository layer per every other non-RLS table in this codebase"

patterns-established:
  - "Scheduling factories take required FKs positionally (clinicId first) then a trailing overrides = {} object, mirroring every existing factory in apps/api/tests/helpers/factories.ts"
  - "createTestAppointment takes petIds as an array so D-21 multi-pet appointments are the default-supported shape, not an afterthought"
  - "cleanupTestData() deletes new scheduling tables (appointmentPet, appointment, blockedPeriod, availabilityOverride, vetAvailabilityTemplate) before queueEntry/pet/petOwner/serviceCatalog/clinic, extending the existing hand-maintained reverse-FK-order list"
  - "Migration/schema parity is verified against a disposable database with `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code`, run BEFORE post-migrate.sql — running it against the live dev DB after post-migrate.sql produces false-positive drift from the pg_trgm GIN indexes (idx_pet_owner_name_trgm, idx_pet_owner_mobile_trgm, idx_pet_name_trgm, idx_inventory_item_name_trgm) that schema.prisma deliberately does not model (documented precedent: 06-03-SUMMARY.md)"

requirements-completed: [SCH-01, SCH-02]

duration: ~40min (this session; resumed from a prior interrupted session that had completed Tasks 1-2 and left Task 3 uncommitted but complete)
completed: 2026-08-17
---

# Phase 08 Plan 03: Scheduling Persistence Layer Summary

**Five scheduling tables, three enums, `ServiceCatalog.durationMinutes`, `QueueEntry.queuePriorityAt`/`EXPECTED`, their migration, test factories, and a 9-assertion database-shape test — all verified against the live schema and a disposable parity-check database.**

## Session Context

This plan was originally started by a prior agent session that was terminated mid-Task-3. On resuming: Tasks 1 and 2 were already committed (`d9dab34`, `6a73545`) and verified correct by inspection. Task 3's work (factories, cleanup ordering, schema-shape test, and the four pre-existing `queueEntry.create` call-site fixes) was present in the working tree, uncommitted, and — on full review against the plan's `<behavior>`/`<action>`/`<acceptance_criteria>` — was complete and correct as written. No gaps were found requiring new code; this session's job was verification, one commit, and the summary.

## Performance

- **Tasks:** 3 completed (1-2 committed previously, 3 committed this session)
- **Files modified/created (Task 3):** 6

## Accomplishments
- Confirmed Task 1's schema additions and Task 2's migration/backfill exactly match the plan (see Final Field Lists and Migration Approach below).
- Verified all 6 required scheduling factories exist in `apps/api/tests/helpers/factories.ts` with the plan's exact signatures and defaults.
- Verified `cleanupTestData()` deletes the 5 new scheduling tables in FK-safe order, ahead of `queueEntry`/`pet`/`petOwner`/`serviceCatalog`/`clinic`.
- Verified `apps/api/tests/scheduling/schema-shape.test.ts` implements all 9 plan-mandated behaviors; ran it standalone — **9/9 passing**.
- Searched the full `apps/api` tree for every `queueEntry.create` call site; confirmed all four that needed `queuePriorityAt` already had it, and no others existed (one additional site is a `vi.mock`-based assertion in `booking.service.test.ts` that never constructs real data, so it needed no change).
- Ran the full API suite: **120 test files passed, 9 skipped (129 total); 1578 tests passed, 80 todo, 0 failed.**
- Ran `tsc --noEmit`: clean, exit 0.
- Re-verified migration/schema parity end-to-end using a disposable database (see Migration Parity Verification below), confirming the whole plan (all 3 tasks) is solid.

## Task Commits

1. **Task 1: scheduling models, enums, ServiceCatalog/QueueEntry modifications** — `d9dab34` (feat) — completed in a prior session
2. **Task 2: scheduling migration with hand-written queue_priority_at backfill** — `6a73545` (feat) — completed in a prior session
3. **Task 3: scheduling test factories + database-shape test** — `ebfc324` (feat) — committed this session, work verified complete and correct as found

## Files Created/Modified (Task 3, this session's commit)
- `apps/api/tests/helpers/factories.ts` — added `createTestVetAvailabilityTemplate`, `createTestVetAvailabilityWeek`, `createTestAvailabilityOverride`, `createTestBlockedPeriod`, `createTestAppointment`, `createTestServiceForBooking`; extended `cleanupTestData()`
- `apps/api/tests/scheduling/schema-shape.test.ts` — new, 9 tests
- `apps/api/src/modules/queue/queue.repository.ts` — real `queueEntry.create` call now sets `queuePriorityAt: new Date()`
- `apps/api/src/modules/patient/__tests__/patient.service.test.ts` — mock `QueueEntry` fixture gained `queuePriorityAt`/`appointmentId`
- `apps/api/src/modules/queue/__tests__/queue.service.test.ts` — mock `QueueEntry` fixture gained `queuePriorityAt`/`appointmentId`
- `apps/api/tests/billing/consultation-draft-hook.test.ts` — real DB `queueEntry.create` fixture gained `queuePriorityAt`

## Final Field List: Each New Model

**`VetAvailabilityTemplate`** (`vet_availability_templates`): `id`, `clinicId`, `vetId`, `weekday` (Int, 0=Sunday..6=Saturday), `isClosed` (default false), `openMinutes`, `closeMinutes`, `createdAt`, `updatedAt`. `@@unique([clinicId, vetId, weekday])`. Relations: `clinic`, `vet` (named `"VetAvailabilityTemplateVet"`, disambiguated since `User` has multiple scheduling relations).

**`AvailabilityOverride`** (`availability_overrides`): `id`, `clinicId`, `vetId`, `date` (`@db.Date`), `isClosed` (default true), `openMinutes`, `closeMinutes`, `reason` (String?), `createdAt`, `updatedAt`. `@@unique([clinicId, vetId, date])`.

**`BlockedPeriod`** (`blocked_periods`): `id`, `clinicId`, `vetId`, `date` (`@db.Date`), `startMinutes`, `endMinutes`, `reason` (`BlockedPeriodReason`), `reasonText`, `createdById`, `createdAt`. `@@index([clinicId, vetId, date])`.

**`Appointment`** (`appointments`): `id`, `clinicId`, `vetId` (relation `"AppointmentVet"`), `ownerId`, `serviceCatalogId` (nullable), `status` (`AppointmentStatus`, default `SCHEDULED`), `source` (`AppointmentSource`, default `STAFF`), `scheduledFor`, `durationMinutes` (NOT NULL, booking-time snapshot), `recurringSeriesId`/`recurrenceIndex` (D-22), `notes`, `createdById` (relation `"AppointmentCreatedBy"`), `whatsappBookingRequestId` (bare nullable UUID, no relation — D-12 seam), idempotency markers `queueEntryCreatedAt`/`noShowFlippedAt`/`startingSoonNotifiedAt`, lifecycle timestamps `checkedInAt`/`cancelledAt`/`cancelledById`/`cancelReason`/`completedAt`, `createdAt`, `updatedAt`. Indexes: `[clinicId, scheduledFor]`, `[clinicId, vetId, scheduledFor]`, `[clinicId, status, scheduledFor]`, `[clinicId, recurringSeriesId]`, `[whatsappBookingRequestId]`.

**`AppointmentPet`** (`appointment_pets`): `id`, `clinicId`, `appointmentId` (`onDelete: Cascade`), `petId`, `queueEntryId` (nullable, set by plan 08-09's handoff), `createdAt`. `@@unique([appointmentId, petId])`, `@@index([clinicId, petId])`, `@@index([queueEntryId])`.

**`ServiceCatalog`** modification: `durationMinutes Int @default(15) @map("duration_minutes")` — D-02.

**`QueueEntry`** modifications: `queuePriorityAt DateTime @map("queue_priority_at")` (NOT NULL, no schema default — migration-backfilled), `appointmentId String? @map("appointment_id") @db.Uuid` + `appointment Appointment?` relation. New index `@@index([clinicId, status, queuePriorityAt])`.

**Enums:** `AppointmentStatus { SCHEDULED CHECKED_IN COMPLETED CANCELLED NO_SHOW }` (no `CONFIRMED`), `AppointmentSource { STAFF WHATSAPP }`, `BlockedPeriodReason { LUNCH BREAK PERSONAL OFF_SITE MEETING OTHER }`, `QueueEntryStatus` gained `EXPECTED`.

## Migration Approach

- **Directory:** `apps/api/prisma/migrations/20260813100000_add_scheduling_models/migration.sql` — confirmed present on disk exactly as the plan names it (renamed from Prisma's auto-generated timestamp during Task 2).
- **`ALTER TYPE ... ADD VALUE 'EXPECTED'` transaction split:** Not needed. Task 2 verified no later statement in the same `migration.sql` file references `'EXPECTED'` in a default, `CHECK`, or index predicate, so Prisma's single-transaction generated SQL (`ALTER TYPE "QueueEntryStatus" ADD VALUE 'EXPECTED';` as one statement among many in one file) is safe as written — no split into an earlier migration directory was required. This is recorded with a comment directly above the statement in `migration.sql`.
- **`queue_priority_at` backfill:** Prisma's naive `ADD COLUMN ... NOT NULL` was replaced by hand with three statements: (1) `ADD COLUMN "queue_priority_at" TIMESTAMP(3);` (nullable), (2) `UPDATE "queue_entries" SET "queue_priority_at" = "checked_in_at" WHERE "queue_priority_at" IS NULL;`, (3) `ALTER COLUMN "queue_priority_at" SET NOT NULL;`. Verified present in that exact order in `migration.sql`.
- **No RLS added:** Confirmed 0 matches for `row level security`/`create policy` (case-insensitive) in the migration file — consistent with this codebase's dominant pattern of application-layer tenant scoping for all but three specific tables.

## Migration Parity Verification (this session)

The plan's literal verification command (`prisma migrate reset --force --skip-seed && psql -f post-migrate.sql && prisma migrate diff --from-schema-datasource "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code`) was **not** run verbatim, for two reasons:

1. `prisma migrate reset --force` against the shared local dev database triggered this Prisma CLI version's built-in AI-agent safety guard (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` is required), which blocks destructive resets without explicit interactive user consent. Rather than pause the session to request consent for wiping the shared dev DB, a disposable database was used instead — the same choice a prior plan in this repo made under a similar constraint (see `06-03-SUMMARY.md`, "Environment Notes").
2. Running the diff **after** `post-migrate.sql` on the *live* dev DB (which had been migrated by a prior session before this one started) reproduced a known, pre-existing false-positive: `post-migrate.sql` creates four `pg_trgm` GIN indexes (`idx_pet_owner_name_trgm`, `idx_pet_owner_mobile_trgm`, `idx_pet_name_trgm`, `idx_inventory_item_name_trgm`, all PAT-04/D-31, Phase 3-5 full-text search, unrelated to this plan) that `schema.prisma` deliberately cannot model. `06-03-SUMMARY.md` documents this exact trap and the fix: run the parity check with `--from-migrations`, before `post-migrate.sql`, against a disposable database.

**What was actually run**, none of it touching the shared dev database's data:
1. Created disposable databases `breeyo_p803_verify` and `breeyo_p803_verify_shadow` via `docker exec breeyo-postgres-1 psql`.
2. `DATABASE_URL=<disposable> pnpm exec prisma migrate deploy` — all 9 migrations (including `20260813100000_add_scheduling_models`) applied cleanly to an empty database.
3. `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <disposable-shadow> --exit-code` → **`No difference detected.`, exit 0.**
4. `SELECT unnest(enum_range(NULL::"QueueEntryStatus"))` on the disposable DB → `WAITING, IN_CONSULT, DONE, NO_SHOW, EXPECTED` (5 rows) — `EXPECTED` present.
5. `SELECT count(*) FROM information_schema.tables WHERE table_name IN (...)` → `5` for the five scheduling tables.
6. `SELECT is_nullable FROM information_schema.columns WHERE table_name='queue_entries' AND column_name='queue_priority_at'` → `NO`.
7. `node -e "..."` Prisma client delegate check → all 5 new delegates (`appointment`, `appointmentPet`, `vetAvailabilityTemplate`, `availabilityOverride`, `blockedPeriod`) present.
8. Disposable databases dropped immediately after verification; shared dev DB (`breeyo`) was never reset or otherwise modified by this session.

This gives an equal or stronger parity guarantee than the plan's literal command: the migration set alone, applied to a genuinely empty database, reproduces `schema.prisma` exactly, with zero risk to the shared dev DB's existing data.

## Full Verification Evidence (this session)

| Gate | Result |
|------|--------|
| `prisma validate` | passes |
| `pnpm --filter @breeyo/api test -- --run tests/scheduling/schema-shape.test.ts` | 9/9 passed |
| Full API suite (`pnpm --filter @breeyo/api test`) | 120 files passed, 9 skipped (129); **1578 passed, 80 todo, 0 failed** |
| `tsc --noEmit` | clean, exit 0 |
| Migration set alone vs. `schema.prisma` (disposable DB, pre-`post-migrate.sql`) | `No difference detected.`, exit 0 |
| `EXPECTED` in live `QueueEntryStatus` enum | present |
| 5 scheduling tables in `information_schema.tables` | count = 5 |
| `queue_entries.queue_priority_at` nullability | `NO` (NOT NULL) |
| Prisma client delegates for all 5 new models | all present |
| RLS/policy statements in the scheduling migration | 0 |

## Pre-existing Call Sites Fixed for `queuePriorityAt` (NOT NULL)

| File | Fix |
|------|-----|
| `apps/api/src/modules/queue/queue.repository.ts` | Real `queueEntry.create` in the check-in path now sets `queuePriorityAt: new Date()` alongside `checkedInAt`, documented with a comment naming D-08/D-10 |
| `apps/api/src/modules/patient/__tests__/patient.service.test.ts` | Mocked `QueueEntry` fixture object gained `queuePriorityAt: new Date('2024-01-15')`, `appointmentId: null` |
| `apps/api/src/modules/queue/__tests__/queue.service.test.ts` | Mocked `QueueEntry` fixture object (`mockEntry`) gained `queuePriorityAt: now`, `appointmentId: null` |
| `apps/api/tests/billing/consultation-draft-hook.test.ts` | Real DB `queueEntry.create` fixture in `consultationWithQueueEntry()` gained `queuePriorityAt: new Date()` |

No other `queueEntry.create` call sites exist in `apps/api/src` or `apps/api/tests` (confirmed by a full-tree grep); `apps/api/src/modules/whatsapp/__tests__/booking.service.test.ts` references `prisma.queueEntry.create` only as a `vi.mock` call-count assertion (`expect(prisma.queueEntry.create).not.toHaveBeenCalled()`), never constructing real data, so it required no change.

## Deviations from Plan

### 1. [Rule 3 — environment constraint] Migration-parity check run against a disposable database instead of the shared dev DB

- **Found during:** this session's Step 5 (plan verification)
- **Issue:** The plan's literal verification command runs `prisma migrate reset --force` against the shared dev database. This session's Prisma CLI enforces a hard safety stop on that exact command when invoked by an AI agent, requiring explicit interactive user consent. Additionally, running the diff after `post-migrate.sql` (as the plan's command sequence does) reproduces a known false-positive from `pg_trgm` indexes documented in `06-03-SUMMARY.md`.
- **Fix:** Verified parity using a disposable database pair (`breeyo_p803_verify` / `_shadow`), `prisma migrate deploy` + `prisma migrate diff --from-migrations ... --exit-code` run *before* any `post-migrate.sql` application, then dropped both databases. Zero risk to the shared dev DB; equal-or-stronger parity guarantee (matches the precedent set in `06-03-SUMMARY.md`).
- **Impact:** None on the plan's deliverables — schema, migration, factories and tests are unchanged. Only the *verification methodology* differed from the plan's literal command text.
- **Commit:** N/A (verification-only; no code changed by this deviation)

No other deviations. Tasks 1-3 as found in the working tree matched the plan's `<action>` and `<acceptance_criteria>` sections exactly; no code changes beyond the single Task 3 commit were needed.

## Known Stubs

None. Every column, index, enum value and constraint this plan declares exists in the database and is asserted by `tests/scheduling/schema-shape.test.ts`.

## Threat Flags

None new. All STRIDE entries in this plan's threat model (T-08-07 through T-08-12) are either verified directly by `schema-shape.test.ts` (T-08-07's cross-tenant read assertion, T-08-09's `@@unique([appointmentId, petId])` assertion) or deferred by design to later plans (T-08-08 to plan 08-04's transition guard, T-08-10 to the NOT NULL snapshot column already verified here, T-08-11 accepted by convention, T-08-12 to plan 08-10's server-side bridge).

## User Setup Required

None.

## Next Phase Readiness

Every table, column, enum value, index and test factory the remaining Phase 8 plans depend on now exists, is migrated, and is verified against a live (disposable) database. Plans 08-04 through 08-11 can proceed without further schema changes to these five tables, `ServiceCatalog.durationMinutes`, or `QueueEntry.queuePriorityAt`/`appointmentId`/`EXPECTED`.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
