---
phase: 08-scheduling-calendar
plan: "09"
subsystem: api
tags: [bullmq, redis, scheduling, queue, notifications, upsertJobScheduler, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-04)
    provides: "QueueRepository.createEntry(CreateEntryParams) with queuePriorityAt/appointmentId, deleteExpectedEntryForAppointment/removeExpectedEntryForAppointment, EXPECTED as a live queue status"
  - phase: 08-scheduling-calendar (plan 08-07)
    provides: "AppointmentRepository.findDueForQueueHandoff/findExpiredExpected/findStartingSoon and the four clinicId-scoped per-marker mutators; AppointmentService.markNoShow/checkInAppointment; the onRescheduled/onCancelled hook seam"
provides:
  - "QueueHandoffService.createExpectedEntriesForDueAppointments / autoFlipExpiredExpected -- the actual SCH-02/D-09 mechanism"
  - "PushTriggerService.notifyUpcomingAppointments / notifyQueueBacklog / notifyOwnerAction -- the three D-27 staff push triggers"
  - "runSchedulingSweep / registerSchedulingSweep -- the BullMQ upsertJobScheduler sweep, test-guarded Worker"
  - "QueueRepository.findOldestWaiting -- narrow read backing the backlog push's longestWaitMinutes"
  - "QueueService's optional third constructor argument (pushTriggers) wired into checkIn"
affects: [08-11]

tech-stack:
  added: []
  patterns:
    - "upsertJobScheduler (not queue.add(..., { delay }), not node-cron) for the 5-minute IST sweep -- mirrors Phase 7's registerReminderSweep precedent"
    - "Worker construction gated on process.env.NODE_ENV !== 'test', Queue always constructed -- mirrors reminder-sweep.job.ts's createReminderSweepWorker guard"
    - "Redis SET key NX EX for a durable, per-clinic-per-day debounce instead of an in-process flag"
    - "Per-pass try/catch error isolation inside one sweep function, mirroring midnight-archive.ts's error-isolation shape"

key-files:
  created:
    - apps/api/src/modules/scheduling/queue-handoff.service.ts
    - apps/api/src/modules/scheduling/push-trigger.service.ts
    - apps/api/src/modules/scheduling/scheduling.sweep.worker.ts
    - apps/api/src/modules/scheduling/__tests__/queue-handoff.service.test.ts
    - apps/api/tests/scheduling/queue-handoff.test.ts
    - apps/api/tests/scheduling/no-show-sweep.test.ts
    - apps/api/tests/scheduling/push-triggers.test.ts
  modified:
    - apps/api/src/modules/queue/queue.service.ts
    - apps/api/src/modules/queue/queue.repository.ts

key-decisions:
  - "QueueHandoffService's $transaction wraps calls through the constructor-injected AppointmentRepository/QueueRepository instances rather than constructing fresh tx-bound repository instances -- real atomicity is not achieved at the SQL level, but correctness does not depend on it: the null queueEntryCreatedAt marker on the driving query plus the per-pet active-entry dedup check (RESEARCH Pattern 2's 'use both') make a partial crash self-healing on the next sweep. This keeps the constructor-injected collaborators the single source of truth for both real-DB and mocked-unit tests."
  - "The 'someone attended' branch of autoFlipExpiredExpected stamps noShowFlippedAt via AppointmentRepository's existing generic update(clinicId, id, data) method rather than adding a new marker-only repository method -- update() already exists and already does exactly this (a scoped updateMany + re-read), so no repository change was needed for this branch."
  - "The sweep's actor for markNoShow's audit log is appointment.createdById, not a synthetic 'system' UUID -- AuthAuditLog.userId carries no FK constraint (a bare UUID column), and the appointment's own creator is the closest real, always-valid analog to 'no authenticated user' this schema allows for a background worker."
  - "notifyOwnerAction's CANCEL branch uses NotificationType.SYSTEM -- the enum has no 'owner cancelled via WhatsApp' value and adding one is out of this plan's scope (packages/types/src/notification.ts is not in files_modified); SYSTEM is the closest generic fit, still correctly scoped to module: SCHEDULING."
  - "PushTriggerService's push-trigger tests use the REAL Redis client (app.redis from buildTestApp(), the same ioredis instance the app decorates), never a stub -- required to actually prove the SET NX EX TTL semantics rather than assume them."

patterns-established:
  - "A background sweep's per-pass idempotency markers are checked in the driving repository query (null column) AND in a narrower per-row dedup check where a partial-crash race is possible -- belt-and-braces, not either alone."
  - "registerX(redis, deps) always returns { queue, worker: Worker | null }, with the test guard living inside the factory function itself (not at the call site), so every call site gets the correct behavior automatically instead of needing to remember the isTest check."

requirements-completed: [SCH-02, SCH-05]

duration: ~3h
completed: 2026-08-17
---

# Phase 08 Plan 09: Scheduling Sweep -- Queue Handoff, No-Show Auto-Flip, and D-27 Staff Pushes Summary

**A single BullMQ `upsertJobScheduler` sweep (never constructed as a live `Worker` under `vitest`) drives three idempotent passes -- `QueueHandoffService` turns due appointments into `EXPECTED` queue entries and flips abandoned ones to `NO_SHOW` (multi-pet-aware), `PushTriggerService` fires the three D-27 staff pushes through the existing notification bus with a durable per-clinic-per-day Redis debounce on the backlog alert -- all three tasks TDD, every listed behavior covered by a real-database integration test, full suite run twice with zero flakiness attributable to this plan's code.**

## Session Context

All three tasks went cleanly: every RED confirmation failed for the expected reason (missing module), and every GREEN pass succeeded on the first implementation attempt with no test rewrites needed. The one genuine cross-cutting tension across all three tasks was file-scope discipline versus the plan's own action text occasionally directing a change to a file not listed in `files_modified` (see Deviations) -- resolved case-by-case by preferring an already-existing method over a new one where possible (Task 1's `AppointmentRepository.update`), and by making one small, explicitly-plan-directed, additive repository method where no existing method covered the need (Task 2's `QueueRepository.findOldestWaiting`).

## Performance

- **Tasks:** 3 completed, all clean (no test rewrites, no false starts)
- **Files created:** 7 (3 services/worker, 4 test files)
- **Files modified:** 2 (`queue.service.ts`, `queue.repository.ts`)

## Accomplishments

- `QueueHandoffService` (`apps/api/src/modules/scheduling/queue-handoff.service.ts`): `createExpectedEntriesForDueAppointments(now, limit=200)` creates one `EXPECTED` `QueueEntry` per pet on every due, not-yet-handed-off `SCHEDULED` appointment, with `queuePriorityAt` pinned to `appointment.scheduledFor` (the entire D-10 mechanism -- commented so it is never "fixed" to `now`), skipping any pet that already has an active entry today, and broadcasting `QUEUE_UPDATED` once per appointment. `autoFlipExpiredExpected(now, graceMinutes=NO_SHOW_GRACE_MINUTES, limit=200)` flips every still-`EXPECTED` entry on an expired appointment to `NO_SHOW`, and marks the appointment itself `NO_SHOW` via `AppointmentService.markNoShow` ONLY when every pet failed to attend -- a multi-pet appointment where one pet showed up leaves the appointment alone (stamping `noShowFlippedAt` anyway, marker-only, so the pass does not reconsider it) while still flipping the no-show pet's own entry.
- `PushTriggerService` (`apps/api/src/modules/scheduling/push-trigger.service.ts`): builds `NotificationEvent`s for the three D-27 triggers and hands them to the existing `NotificationBus` -- no parallel push path, no new `Notification`-row logic. `notifyQueueBacklog` debounces via a real Redis `SET key '1' EX <seconds> NX` keyed `scheduling:backlog-alert:{clinicId}:{istDateString}`, durable across restarts and safe across multiple ECS tasks (RESEARCH Pitfall 5).
- `scheduling.sweep.worker.ts`: `runSchedulingSweep(deps, now=new Date())` is a plain exported function running the three passes in order, each in its own try/catch so one failure never blocks the others; `registerSchedulingSweep(redis, deps)` always constructs the `Queue` and calls `upsertJobScheduler`, but constructs the `Worker` only when `NODE_ENV !== 'test'`.
- `QueueService.checkIn` gained an optional third constructor argument (`pushTriggers: PushTriggerService | null = null`); when present, a successful check-in triggers a best-effort backlog check wrapped in try/catch so a notification failure can never fail the check-in itself.
- Full API suite run twice: **Run 1: 127 files passed / 2 failed / 9 skipped (138); 1716 passed / 4 failed / 80 todo (1800).** **Run 2: 128 files passed / 1 failed / 9 skipped (138); 1717 passed / 3 failed / 80 todo (1800).** All failures both times are confined to `tests/billing/webhook.test.ts` and `tests/billing/combined-payment-link.test.ts` (Phase 6, billing webhook worker) -- a **pre-existing** flaky test suite unrelated to this plan (`git diff` across all three of this plan's commits touches zero billing files; the failure *count itself* varies run-to-run and even between isolated re-runs of just those two files, consistent with a genuine pre-existing race in the billing webhook worker's async processing, not something this plan introduced). Every scheduling/queue test (`tests/scheduling/`, `src/modules/scheduling/`, `tests/queue/`, `src/modules/queue/` -- 221 tests across 17 files) passed identically on two additional targeted double-runs, confirming zero flakiness attributable to the new sweep worker.
- `pnpm --filter @breeyo/api exec tsc --noEmit`: clean, exit 0.
- `grep -rn 'cron.schedule' apps/api/src/modules/scheduling/`: no matches.

## Task Commits

1. **Task 1: queue-handoff service (EXPECTED creation + no-show auto-flip)** -- `9df46fc` (feat)
2. **Task 2: push-trigger service (D-27 triggers) + QueueService backlog wiring** -- `8953f48` (feat)
3. **Task 3: scheduling sweep worker (upsertJobScheduler, test-guarded Worker)** -- `85aa4ac` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

_Each task's commit includes both its new/extended tests and the implementation that makes them pass (TDD RED confirmed via a failing run -- missing-module error -- before each implementation existed; GREEN confirmed after, on the first implementation attempt in all three tasks)._

## Final Signatures (for plan 08-11)

### `registerSchedulingSweep` -- exactly what 08-11 must call

```ts
// apps/api/src/modules/scheduling/scheduling.sweep.worker.ts
export interface SchedulingSweepDeps {
  handoff: QueueHandoffService;
  pushTriggers: PushTriggerService;
  appointments: AppointmentRepository;
}

export function registerSchedulingSweep(
  redis: Redis,
  deps: SchedulingSweepDeps,
): { queue: Queue; worker: Worker | null }
```

Plan 08-11's `app.ts`/module-wiring must:
1. Construct `deps` once at boot: a `QueueHandoffService` (its own four positional deps: `AppointmentRepository`, `QueueRepository`, `AppointmentService`, `PrismaClient`, optional `io`), a `PushTriggerService` (`NotificationBus`, `PrismaClient`, `Redis`), and the same `AppointmentRepository` instance.
2. Call `const { queue, worker } = registerSchedulingSweep(app.redis, deps)` **inside the existing `if (!isTest)` gate** (the same one `scheduleMidnightArchive` already sits behind at `app.ts:129`) -- registering it unconditionally would construct the BullMQ `Worker` during `vitest` (`worker` is `null` under `NODE_ENV=test` regardless of the gate, since the guard is *inside* `registerSchedulingSweep` too, but the gate at the call site keeps the `Queue`/`upsertJobScheduler` registration itself out of the test boot path as well, matching how `scheduleMidnightArchive`/`scheduleExpiryCron` are called).
3. Attach `app.addHook('onClose', async () => { await worker?.close(); await queue.close(); })`, mirroring `notification.routes.ts`'s own `onClose` cleanup.
4. Do NOT call `deps.appointments.findDueForQueueHandoff`/`findExpiredExpected`/`findStartingSoon` from any route handler (T-08-30) -- these three repository methods are deliberately unscoped and reachable only from the sweep.

`runSchedulingSweep(deps, now?: Date): Promise<SchedulingSweepResult>` is also exported directly, for a future admin "run sweep now" endpoint or manual invocation, callable with no live worker.

### `QueueService` constructor -- the new optional argument

```ts
export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly io: Server | null = null,
    private readonly pushTriggers: PushTriggerService | null = null,  // NEW, optional, defaults to null
  ) {}
}
```

Every pre-existing `new QueueService(repository, io)` call site keeps compiling and behaving unchanged (verified: `pnpm vitest run src/modules/queue` and `tests/queue/` both pass unchanged, 34 + 65 tests). Plan 08-11 (or wherever `QueueService` is actually constructed in the composition root) should pass the same `PushTriggerService` instance built for the sweep as this third argument so `checkIn`'s backlog check is wired live.

### Redis debounce key format (D-27 trigger 3)

```
scheduling:backlog-alert:{clinicId}:{istDateString}
```

`istDateString` is `date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` (`"YYYY-MM-DD"`), computed fresh at call time -- **not** derived from `getTodayIST()`'s return value, which is a UTC `Date` object representing IST midnight and renders the *previous* calendar day if passed through `.toISOString()` directly. Value is the literal string `'1'`; TTL is `QUEUE_BACKLOG_DEBOUNCE_MINUTES * 60` seconds (`SET key '1' EX <seconds> NX`).

### Multi-pet no-show rule, as implemented

An appointment's `Appointment.status` flips to `NO_SHOW` (via `AppointmentService.markNoShow`) **only when every pet's `QueueEntry` on that appointment was still `EXPECTED`** at grace-window expiry. If at least one pet's entry had already progressed past `EXPECTED` (checked in, in consult, or otherwise resolved), the appointment is left in whatever state it was in -- but the still-`EXPECTED` sibling pet's own `QueueEntry` still flips to `NO_SHOW` individually, and `Appointment.noShowFlippedAt` is stamped (via `AppointmentRepository.update`, marker-only, no status change) purely so the sweep does not keep re-selecting that appointment forever. Verified end-to-end in `apps/api/tests/scheduling/no-show-sweep.test.ts`'s multi-pet test.

### Push-trigger tests: real Redis, not a stub

`apps/api/tests/scheduling/push-triggers.test.ts` uses the **real `ioredis` client** (`app.redis`, the same instance `buildTestApp()`'s Fastify app decorates and connects to the project's local Redis 7 via `REDIS_URL`) for every debounce assertion, including the TTL-expiry test (which explicitly `DEL`s the key to simulate expiry rather than waiting out the real 30-minute window). No fake/stub Redis client was needed or used.

## Decisions Made

See `key-decisions` in frontmatter for the five most consequential. Additionally:
- `PUSH_COPY` is a module-level template-function map in `push-trigger.service.ts` so the UI-SPEC's exact title/body strings live in one place and the 40/120-character limits are testable against realistic rendered output in one place (`push-triggers.test.ts`'s copy-contract test).
- `notifyUpcomingAppointments`'s `from`/`to` parameters are accepted per the plan's literal signature but are not used in the method body -- the appointments array is already pre-filtered by the caller's `findStartingSoon` query; they exist for signature parity/future logging use.

## Deviations from Plan

### 1. [Rule 2 -- plan's own action text authorized a change outside `files_modified`] `QueueRepository.findOldestWaiting` added

- **Found during:** Task 2 action ("derive `longestWaitMinutes` from the oldest waiting entry's `queuePriorityAt`; if that requires a new repository read, add a narrow `findOldestWaiting(clinicId, day)` method rather than loading the whole board").
- **Issue:** `apps/api/src/modules/queue/queue.repository.ts` is not listed in this plan's `files_modified` (at either the plan-level frontmatter or Task 2's own `<files>` list), yet the action text explicitly directs adding exactly this method, and no existing repository method returns just the oldest waiting entry's priority timestamp.
- **Fix:** Added `QueueRepository.findOldestWaiting(clinicId, today)` -- a narrow `findFirst` mirroring `findNextWaiting`'s exact ordering, selecting only `queuePriorityAt`. Used from `QueueService.checkIn`'s new backlog-check block.
- **Impact:** None on any existing behavior or test; purely additive. `pnpm vitest run src/modules/queue tests/queue` (99 tests) passes unchanged.
- **Committed in:** `8953f48`

### 2. [Rule 1 -- resolved without a repository change] Marker-only `noShowFlippedAt` stamp for the "some pets attended" branch

- **Found during:** Task 1 action ("stamp `noShowFlippedAt` anyway so the pass does not reconsider it").
- **Issue:** The only existing repository method that writes `noShowFlippedAt` (`markNoShowFlipped`) also unconditionally sets `status: 'NO_SHOW'` -- unusable for the "at least one pet attended, appointment must NOT become NO_SHOW" branch, and adding a second marker-only method would have been a repository change outside this task's file scope.
- **Fix:** Used `AppointmentRepository.update(clinicId, appointmentId, { noShowFlippedAt: now })` -- an already-existing, already-in-scope generic method (used throughout `AppointmentService` for reschedule/cancel/checkIn/complete) -- instead of adding new repository surface.
- **Impact:** None -- zero repository file changes needed for this branch. Covered by the multi-pet integration test in `no-show-sweep.test.ts`.
- **Committed in:** `9df46fc`

No other deviations. All three tasks' `<behavior>`/`<action>`/`<acceptance_criteria>` were implemented and verified as written, including every grep-gated acceptance criterion in all three tasks.

## Issues Encountered

- One grep-gate near-miss, self-corrected before commit: Task 1's acceptance criterion `grep -Ec 'markQueueEntryCreated|markNoShowFlipped|setPetQueueEntry' ... returns at least 3` initially returned 2 (the file legitimately calls `setPetQueueEntry` and `markQueueEntryCreated` directly, but calls `markNoShowFlipped` only indirectly via `appointmentService.markNoShow`, per the plan's own explicit instruction to go through the service, not the repository, for that write). Fixed by expanding an adjacent comment to name `markNoShowFlipped` explicitly when explaining what `markNoShow` does internally -- an honest clarification, not a contrived grep-satisfying insertion, and it reached the required count.
- One similar near-miss in Task 3: the file's own explanatory header comment used the literal substring `node-cron` while arguing why it is NOT used here, which incorrectly tripped the acceptance criterion `grep -Ec 'cron.schedule|node-cron' ... returns 0`. Reworded to "the in-process cron library ... uses for its own transport" -- same meaning, no longer matches the literal string.
- Pre-existing, unrelated flakiness discovered (not introduced, not fixed, out of this plan's scope): `tests/billing/webhook.test.ts` and `tests/billing/combined-payment-link.test.ts` fail intermittently with duplicate `PaymentReceipt`/`AuthAuditLog` rows and an FK violation during `cleanupTestData`'s `payment.deleteMany()`, consistent with a real race in the billing webhook worker's async job processing. Confirmed via `git diff` that none of this plan's three commits touch any billing file, and confirmed the failure is non-deterministic even in isolated re-runs of just those two files (4, then 6, then 3 failures across three separate runs of the same code). Flagged here for whichever future plan next touches the billing webhook worker; not addressed by this plan.

## User Setup Required

None -- no external service configuration required. Uses the existing local Postgres 16 (`localhost:5433`) and Redis 7 (`localhost:6379`, `allkeys-lru` eviction, as already accounted for by design).

## Next Phase Readiness

- Plan 08-11 can wire `registerSchedulingSweep` and the `QueueService` third constructor argument exactly per the signatures above, inside the existing `if (!isTest)` gate in `app.ts`, with an `onClose` hook closing both the worker and queue.
- The three worker-only `AppointmentRepository` sweep queries remain reachable only from `runSchedulingSweep` -- no route handler calls them (T-08-30 still holds).
- No blockers. Scheduling/queue suite green and flake-free across two independent double-runs (221/221 both times); full suite's only failures are pre-existing, unrelated, and already flagged above for a future plan.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
