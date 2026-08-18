---
phase: 08-scheduling-calendar
plan: "04"
subsystem: api
tags: [prisma, fastify, queue, scheduling, ist-date, ordering]

requires:
  - phase: 08-scheduling-calendar (plan 08-03)
    provides: "QueueEntry.queuePriorityAt/appointmentId columns, QueueEntryStatus.EXPECTED enum value, ACTIVE_QUEUE_STATUSES/CLOSED_QUEUE_STATUSES in @breeyo/types"
provides:
  - "apps/api/src/lib/ist-date.ts extended with istDateOnly, istDayBounds, minutesToIstDate, istMinutesOfDay, weekdayIST (getTodayIST/addDaysIST already existed from Phase 7 WHA-01)"
  - "QueueRepository.createEntry(data: CreateEntryParams) accepting explicit queuePriorityAt/appointmentId instead of hardcoding queuePriorityAt"
  - "findNextWaiting and getQueueBoard's waiting branch both ordered [isEmergency desc, queuePriorityAt asc, checkedInAt asc]"
  - "getQueueBoard returns a fourth `expected` group (EXPECTED entries for the IST day, ordered isEmergency desc/queuePriorityAt asc)"
  - "EXPECTED honoured by findTodayActiveEntryForPet (via ACTIVE_QUEUE_STATUSES) and excluded from archiveEntries (D-09)"
  - "QueueRepository.deleteExpectedEntryForAppointment / QueueService.removeExpectedEntryForAppointment (D-28 cleanup path)"
affects: [08-05, 08-06, 08-07, 08-09, 08-10, 08-11]

tech-stack:
  added: []
  patterns:
    - "createEntry accepts CreateEntryParams (queue.types.ts) with optional queuePriorityAt/appointmentId, defaulting queuePriorityAt to new Date() in the repository when omitted"
    - "Named status-list constants (ACTIVE_QUEUE_STATUSES/CLOSED_QUEUE_STATUSES) replace inline status arrays at every status-enumerating query except archiveEntries, which deliberately keeps its own literal list and a comment explaining why EXPECTED is excluded"
    - "Board day-scoping uses istDayBounds({gte start, lt end}) rather than a bare gte-today equality test for the new EXPECTED query"

key-files:
  created:
    - apps/api/tests/queue/queue-priority-ordering.test.ts
  modified:
    - apps/api/src/lib/ist-date.ts
    - apps/api/src/lib/__tests__/ist-date.test.ts
    - apps/api/src/jobs/midnight-archive.ts
    - apps/api/src/modules/queue/queue.repository.ts
    - apps/api/src/modules/queue/queue.service.ts
    - apps/api/src/modules/queue/queue.types.ts
    - apps/api/src/modules/queue/__tests__/queue.service.test.ts
    - apps/api/tests/queue/queue-checkin.test.ts
    - apps/api/tests/queue/queue-board.test.ts
    - apps/api/tests/queue/queue-archive.test.ts

key-decisions:
  - "No separate createExpectedEntry method added -- createEntry's existing parameters (status, position, queuePriorityAt, appointmentId, checkedInBy) already express everything plan 08-09's handoff pass needs; adding a second method would duplicate the same Prisma write for no behavioral gain"
  - "queuePriorityAt is optional in CreateEntryParams (defaults to new Date() inside the repository when omitted) rather than mandatory, preserving every pre-existing call site's behavior while letting a sweep-created EXPECTED row pass appointment.scheduledFor explicitly"
  - "The EXPECTED board query filters on queuePriorityAt (the slot time), not checkedInAt -- an EXPECTED row's checkedInAt is still its sweep-creation instant, not a meaningful 'which IST day' signal, unlike every other status group"
  - "archiveEntries keeps its own inline ['WAITING','DONE','NO_SHOW'] literal rather than being rewritten in terms of CLOSED_QUEUE_STATUSES -- it is a distinct list (CLOSED_QUEUE_STATUSES plus WAITING), and the plan's D-09 rationale is captured in a comment instead"
  - "Cast ACTIVE_QUEUE_STATUSES/CLOSED_QUEUE_STATUSES (readonly QueueStatus[] from @breeyo/types, a real TS enum) to QueueEntryStatus[] (Prisma's generated type, a plain string union) via `as unknown as` -- mirrors the existing fromStatus/toStatus cast pattern already used in updateStatus, verified clean by tsc --noEmit"

patterns-established:
  - "IST day-bounds queries use istDayBounds(date) -> {start, end} with gte/lt rather than a bare gte-today check, now that the helper exists"

requirements-completed: [SCH-02]

duration: ~70min
completed: 2026-08-17
---

# Phase 08 Plan 04: Queue Priority Ordering and EXPECTED Status Summary

**`queuePriorityAt`-driven queue ordering (with a `checkedInAt` D-34 tiebreak) at both `findNextWaiting` and `getQueueBoard`, a fourth `expected` board group, and the D-28 `removeExpectedEntryForAppointment` cleanup path — all built on a shared `apps/api/src/lib/ist-date.ts` extended with day-bounds/minutes/weekday helpers.**

## Session Context

This session found that Task 1's core extraction (`getTodayIST`/`addDaysIST` living in `apps/api/src/lib/ist-date.ts`, with `QueueRepository.getTodayIST` and `midnight-archive.ts` already delegating to it) had already been done by a **prior, unrelated session** — Phase 7's WHA-01 WhatsApp-reminder work needed the same IST arithmetic without importing `QueueRepository` into the WhatsApp module, so it did this extraction ahead of this plan. This plan's Task 1 work was therefore narrower than written: add the five new helpers (`istDateOnly`, `istDayBounds`, `minutesToIstDate`, `istMinutesOfDay`, `weekdayIST`) and switch the module's `IST_TIMEZONE` constant to alias `SCHEDULING_TIMEZONE` from `@breeyo/types` instead of repeating the `'Asia/Kolkata'` literal (verified via `grep -c "Asia/Kolkata" apps/api/src/lib/ist-date.ts` returning `0`, including in comments). `queue.repository.ts` and `midnight-archive.ts` needed no changes for Task 1 beyond `midnight-archive.ts`'s `{ timezone: ... }` option switching to `SCHEDULING_TIMEZONE`.

Similarly, plan 08-03 had already added `queuePriorityAt: new Date()` to the real `queueEntry.create` call in `queue.repository.ts` (hardcoded, not yet parameterized) as part of making the NOT NULL column safe to write to — Task 2 of this plan made that value caller-supplied instead of hardcoded.

## Performance

- **Tasks:** 3 completed
- **Files modified/created:** 10 (1 new test file, 9 modified)

## Accomplishments
- `apps/api/src/lib/ist-date.ts` now exports all 7 helpers the plan's artifact list requires (`getTodayIST`, `istDateOnly`, `addDaysIST`, `istDayBounds`, `minutesToIstDate`, `istMinutesOfDay`, `weekdayIST`), unit tested across the IST-midnight rollover, 90-day/month-boundary addition, and a known Sunday/Saturday weekday pair — 18/18 passing in `ist-date.test.ts`.
- `queuePriorityAt` is set once at creation (`checkIn` passes `new Date()` explicitly; a future sweep will pass `appointment.scheduledFor`) and never mutated afterward — `updateStatus`'s WAITING branch stamps `checkedInAt` and computes a real `position`, but is grep-verified to never assign `queuePriorityAt`.
- Both `findNextWaiting` and `getQueueBoard`'s waiting branch order by the identical three-key `[{isEmergency:'desc'},{queuePriorityAt:'asc'},{checkedInAt:'asc'}]`, so call-next and the visible board can never disagree; the `checkedInAt` key is the D-34 tiebreak for two entries sharing an identical `queuePriorityAt` (double-booked slots).
- `getQueueBoard` returns a fourth `expected` group; `EXPECTED` is honoured by `findTodayActiveEntryForPet` (duplicate-check-in blocking) and deliberately excluded from `archiveEntries` (D-09, commented).
- D-28 cleanup path added end-to-end: `QueueRepository.deleteExpectedEntryForAppointment` (scoped `deleteMany` returning a count) and `QueueService.removeExpectedEntryForAppointment` (broadcasts `QUEUE_UPDATED` only when something was actually deleted).
- Full API suite: **121 test files passed, 9 skipped (130 total); 1607 tests passed, 80 todo, 0 failed** — no regression in any pre-existing suite (prior baseline per 08-03-SUMMARY.md: 120 files/1578 tests; the +1 file is this plan's new `queue-priority-ordering.test.ts`, and the +29 tests are the new ist-date/service/board/archive/checkin tests added across Tasks 1-3).
- `tsc --noEmit`: clean, exit 0.
- `grep -rn "toLocaleDateString" apps/api/src | grep -v 'lib/ist-date.ts'` still returns matches, but none in the queue module or any Phase 8 scheduling file — the remaining hits (`inventory/want-list.service.ts`, `billing/numbering.service.ts`, `whatsapp/booking/slot.service.ts`, `whatsapp/reminders/reminder-sweep.job.ts`) are pre-existing Phase 4/5/7 **display formatting** (weekday/day/month labels for humans), not IST-day-boundary arithmetic, and are out of this plan's scope.

## Task Commits

1. **Task 1: extend shared IST date module** — `1c05821` (feat)
2. **Task 2: queuePriorityAt ordering with checkedInAt tiebreak (D-10, D-34)** — `2b25fd4` (feat)
3. **Task 3: EXPECTED as a real status across every queue query (D-08, D-09, D-11, D-13, D-28)** — `a24d03f` (feat)

**Plan metadata:** (this commit) — docs: add plan summary

_Note: each task's commit includes both its new/extended tests and the implementation that makes them pass (TDD RED confirmed before each implementation, GREEN confirmed after)._

## Files Created/Modified
- `apps/api/src/lib/ist-date.ts` — added `istDateOnly`, `istDayBounds`, `minutesToIstDate`, `istMinutesOfDay`, `weekdayIST`; `IST_TIMEZONE` now aliases `SCHEDULING_TIMEZONE` from `@breeyo/types`
- `apps/api/src/lib/__tests__/ist-date.test.ts` — 12 new tests covering the five new helpers
- `apps/api/src/jobs/midnight-archive.ts` — node-cron `{ timezone }` option now reads `SCHEDULING_TIMEZONE`
- `apps/api/src/modules/queue/queue.repository.ts` — `createEntry(data: CreateEntryParams)` (explicit `queuePriorityAt`/`appointmentId`, defaulting `queuePriorityAt` to `new Date()`); `findNextWaiting` and `getQueueBoard`'s waiting branch three-key `orderBy`; `findTodayActiveEntryForPet` uses `ACTIVE_QUEUE_STATUSES`; `getQueueBoard`'s done branch uses `CLOSED_QUEUE_STATUSES`; new fourth `expected` query using `istDayBounds`; `archiveEntries` gets a D-09 comment (list unchanged); new `deleteExpectedEntryForAppointment`
- `apps/api/src/modules/queue/queue.service.ts` — `checkIn` passes `queuePriorityAt: new Date()` explicitly; `updateStatus`'s WAITING branch sets `checkedInAt` + computed `position`; `getQueueBoard` passes through `expected` untransformed; new `removeExpectedEntryForAppointment`
- `apps/api/src/modules/queue/queue.types.ts` — new exported `CreateEntryParams` interface
- `apps/api/src/modules/queue/__tests__/queue.service.test.ts` — 9 new unit tests (duplicate-EXPECTED-checkin, four-group board, EXPECTED→IN_CONSULT/WAITING→EXPECTED rejections, EXPECTED→WAITING/NO_SHOW acceptance, archive delegation, `removeExpectedEntryForAppointment` x2)
- `apps/api/tests/queue/queue-priority-ordering.test.ts` — new, 6 integration tests proving D-10/D-11/D-34 end-to-end via `app.inject` + direct Prisma reads
- `apps/api/tests/queue/queue-checkin.test.ts` — 1 new integration test (EXPECTED blocks duplicate check-in)
- `apps/api/tests/queue/queue-board.test.ts` — 2 new integration tests (expected group + ordering; EXPECTED has no position and doesn't shift WAITING positions)
- `apps/api/tests/queue/queue-archive.test.ts` — 1 new integration test (EXPECTED excluded from archiving, WAITING still archived)

## Final Signatures (for downstream plans 08-07/08-09/08-11)

**`QueueRepository.createEntry`** (unchanged name, widened params):
```ts
async createEntry(data: CreateEntryParams)
// CreateEntryParams (queue.types.ts):
interface CreateEntryParams {
  clinicId: string;
  petId: string;
  checkedInBy: string;
  status: QueueEntryStatus;       // '@prisma/client'
  position: number;
  isEmergency: boolean;
  visitReason?: string;
  queuePriorityAt?: Date;         // defaults to new Date() in the repository if omitted
  appointmentId?: string | null;
}
```
**No separate `createExpectedEntry` method was added.** Plan 08-09's sweep creates an EXPECTED row via this same `createEntry`, passing `status: 'EXPECTED'`, `position: 0`, `queuePriorityAt: appointment.scheduledFor`, `appointmentId: appointment.id`, `checkedInBy: appointment.createdById`.

**`QueueRepository.deleteExpectedEntryForAppointment`**:
```ts
async deleteExpectedEntryForAppointment(clinicId: string, appointmentId: string): Promise<number>
// deleteMany scoped to { clinicId, appointmentId, status: 'EXPECTED' }; returns the delete count.
```

**`QueueService.removeExpectedEntryForAppointment`** (D-28):
```ts
async removeExpectedEntryForAppointment(clinicId: string, appointmentId: string): Promise<void>
// Calls repository.deleteExpectedEntryForAppointment; broadcasts SOCKET_EVENTS.QUEUE_UPDATED
// to `clinic:{clinicId}` with { appointmentId, timestamp } ONLY when the delete count > 0.
// No-op (no error) when count is 0 -- i.e. the entry never existed or already progressed
// past EXPECTED.
```

**`QueueRepository.getQueueBoard` / `QueueService.getQueueBoard` return shape** (both layers, same four keys):
```ts
{
  expected: QueueEntryWithPet[];   // status EXPECTED, IST day scoped by queuePriorityAt, ordered [isEmergency desc, queuePriorityAt asc]
  inConsult: QueueEntryWithPet[];  // unchanged
  waiting: QueueEntryWithPet[];    // ordered [isEmergency desc, queuePriorityAt asc, checkedInAt asc]; service layer adds computedPosition/estimatedWaitSeconds per entry
  done: QueueEntryWithPet[];       // unchanged; now built from CLOSED_QUEUE_STATUSES
}
```
`expected` entries are passed through the service layer untransformed (no `computedPosition`/`estimatedWaitSeconds` — they haven't checked in yet).

**Ordering (both sites, D-10/D-34)**: `findNextWaiting` and `getQueueBoard`'s waiting branch both use `orderBy: [{ isEmergency: 'desc' }, { queuePriorityAt: 'asc' }, { checkedInAt: 'asc' }]` — verified identical via `grep -c "queuePriorityAt: 'asc'"` returning `2` and `grep -c "checkedInAt: 'asc'"` returning `3` (the third occurrence is the pre-existing single-key `inConsult` branch, unrelated to the tiebreak).

## Pre-existing Test Files Updated for the Fourth Board Group

| File | Change |
|------|--------|
| `apps/api/tests/queue/queue-board.test.ts` | Added "returns an expected group ordered by queuePriorityAt" and "EXPECTED entries have no position and do not shift the WAITING position sequence"; the pre-existing "returns entries grouped by status: inConsult, waiting, done" test needed no change (it uses `toHaveProperty`, not an exact-shape check, so the new fourth key doesn't break it) |
| `apps/api/tests/queue/queue-archive.test.ts` | Added "does not archive an unresolved EXPECTED entry from a previous day, but does archive a WAITING one (D-09)" — passed immediately without any repository change, since `archiveEntries`'s literal status list never included EXPECTED to begin with; this test is a regression guard, not a behavior change |
| `apps/api/tests/queue/queue-checkin.test.ts` | Added "rejects check-in when the pet has an EXPECTED entry today (D-08, D-13)" |
| `apps/api/src/modules/queue/__tests__/queue.service.test.ts` | Added 9 unit tests (see Files Created/Modified above); mock repository factory gained `deleteExpectedEntryForAppointment: vi.fn()` |

## Decisions Made

See `key-decisions` in frontmatter. The most consequential for downstream plans: **no `createExpectedEntry` method exists** — plan 08-09 must call `createEntry` directly with the EXPECTED-shaped params listed above.

## Deviations from Plan

### 1. [Rule 1 — plan assumption already satisfied] Task 1's core extraction pre-existed from Phase 7

- **Found during:** Task 1 read_first (reading `apps/api/src/lib/ist-date.ts`, which the plan describes as not yet existing)
- **Issue:** The plan's Task 1 `<read_first>` states "the only IST date math in the repo" lives in `QueueRepository.getTodayIST`, and its `<action>` describes creating `apps/api/src/lib/ist-date.ts` from scratch with `getTodayIST`/`addDaysIST`/`QueueRepository` delegation. In fact, Phase 7's WHA-01 WhatsApp-reminder work had already done exactly this extraction (commit history shows `ist-date.ts` and its test file predate this session, imported by `apps/api/src/modules/whatsapp/booking/slot.service.ts`).
- **Fix:** Task 1 was narrowed to what was actually missing: the five new helpers (`istDateOnly`, `istDayBounds`, `minutesToIstDate`, `istMinutesOfDay`, `weekdayIST`) and switching `IST_TIMEZONE` to alias `SCHEDULING_TIMEZONE`. `queue.repository.ts` needed zero changes; `midnight-archive.ts` needed only the `SCHEDULING_TIMEZONE` swap for its cron `timezone` option.
- **Impact:** None on the plan's deliverables — every artifact and acceptance criterion in Task 1 is satisfied; the delta was smaller than the plan anticipated, not different in kind.
- **Committed in:** `1c05821`

### 2. [Rule 1 — plan assumption already satisfied] `queuePriorityAt: new Date()` on the real `createEntry` call already existed from plan 08-03

- **Found during:** Task 2 read_first (reading `queue.repository.ts`'s `createEntry`)
- **Issue:** Plan 08-03 (per its own summary) had already added `queuePriorityAt: new Date()` to `createEntry`'s Prisma write to satisfy the new NOT NULL column, but hardcoded rather than caller-supplied.
- **Fix:** Task 2 changed this from a hardcoded value to `data.queuePriorityAt ?? new Date()`, added `queuePriorityAt`/`appointmentId` to the accepted params, and had `checkIn` pass `queuePriorityAt: new Date()` explicitly (functionally identical for walk-ins, but now overridable).
- **Impact:** None — this is exactly what Task 2's `<action>` already asked for; noting it here only because the starting point was "already partially done" rather than "not done".
- **Committed in:** `2b25fd4`

No other deviations. All three tasks' `<behavior>`/`<action>`/`<acceptance_criteria>` were implemented and verified as written, including the D-28 `deleteExpectedEntryForAppointment`/`removeExpectedEntryForAppointment` pair and the D-34 `checkedInAt` tiebreak, both confirmed non-optional additions per this session's instructions.

## Issues Encountered

- Initial drafts of the `queue-priority-ordering.test.ts` integration tests for D-10 ("scheduled patient checking in later still sorts first") and D-11 ("early check-in does not change priority") passed even before any implementation existed, because the EXPECTED fixture was inserted immediately before the transition in the test, leaving too small a gap between the row's creation-time `checkedInAt` default and the transition's "now" for the assertions to discriminate old vs. new behavior. Fixed by explicitly backdating the fixture's `checkedInAt` to 24 hours in the past at insert time, which made the pre-implementation `checkedInAt >= today` board filter correctly exclude the untransitioned row — RED for the right reason — before Task 2's `checkedInAt = new Date()` write on the WAITING transition made it GREEN.
- TypeScript: `ACTIVE_QUEUE_STATUSES`/`CLOSED_QUEUE_STATUSES` from `@breeyo/types` are arrays of a genuine TS `enum` (`QueueStatus`), while Prisma's generated `QueueEntryStatus` is a plain string-literal union, not a nominal enum — the two are not directly assignable. Resolved with `as unknown as QueueEntryStatus[]`, mirroring the `fromStatus`/`toStatus` cast pattern already present in `updateStatus`. Verified via `tsc --noEmit` (clean, exit 0).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 08-09 (appointment→queue handoff sweep) can call `QueueRepository.createEntry` directly with `status: 'EXPECTED'`, `queuePriorityAt: appointment.scheduledFor`, `appointmentId`, `position: 0` — no new method needed.
- Plans 08-07/08-11 (appointment cancel/reschedule wiring) can call `QueueService.removeExpectedEntryForAppointment(clinicId, appointmentId)` directly — it is a no-op-safe, broadcast-on-delete method.
- The queue board's four-group shape (`expected`/`inConsult`/`waiting`/`done`) is stable and test-verified; mobile/web board consumers (Phase 8's remaining plans) can rely on `expected` always being present, even as an empty array.
- No blockers. Full suite green (1607/1607 non-skipped, non-todo tests passing), `tsc --noEmit` clean.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
