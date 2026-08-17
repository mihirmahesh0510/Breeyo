---
phase: 08-scheduling-calendar
plan: "07"
subsystem: api
tags: [scheduling, appointments, prisma, transactions, advisory-lock, audit-log, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-01)
    provides: "AppointmentStatus/APPOINTMENT_TRANSITIONS/isValidAppointmentTransition, createAppointmentSchema/rescheduleAppointmentSchema/cancelAppointmentSchema, BOOKING_HORIZON_DAYS/RECURRENCE_INTERVAL_DAYS/DEFAULT_SERVICE_DURATION_MINUTES, AppointmentWithDetails/SlotOption types"
  - phase: 08-scheduling-calendar (plan 08-03)
    provides: "Appointment/AppointmentPet Prisma models (no DB-level RLS), ServiceCatalog.durationMinutes"
  - phase: 08-scheduling-calendar (plan 08-05)
    provides: "AvailabilityService.resolveAvailabilityForDate/getBlockedRangesForDate/getOfferableSlots (existing ranges injected by caller), AuditEvent scheduling extension"
  - phase: 03-patient-registration-walk-in-queue
    provides: "PatientRepository.findOwnerById(clinicId, ownerId) -- the owner/pet lookup this plan reuses (D-19)"
provides:
  - "appointment.state.ts: assertAppointmentTransition (thin wrapper over @breeyo/types' isValidAppointmentTransition)"
  - "appointment.repository.ts: clinicId-scoped CRUD, range/slot-conflict reads, and the three worker-only sweep queries"
  - "appointment.service.ts: AppointmentService -- createAppointment (multi-pet, recurrence, D-34 advisory lock), rescheduleAppointment (D-31 detach), cancelAppointment (D-31 status-filtered SERIES scope), checkInAppointment, completeAppointment, markNoShow"
  - "BookingWarning type and CreateAppointmentParams/RescheduleAppointmentParams/CancelAppointmentParams/UpdateAppointmentStatusParams/ListAppointmentsParams/AppointmentCreateData in scheduling.types.ts"
affects: [08-09, 08-10, 08-11, 08-12, 08-13]

tech-stack:
  added: []
  patterns:
    - "AppointmentRepository takes a raw PrismaClient (not DbClient) -- Appointment/AppointmentPet are 2 of the 5 scheduling tables plan 08-03 deliberately left without DB-level RLS, matching availability.repository.ts's precedent"
    - "D-34: create/createMany/findForVetOnDate accept an optional trailing `client: PrismaClient | Prisma.TransactionClient` (default this.prisma) so AppointmentService's single $transaction can pass its own `tx` through every write/read in the create path, including the single-occurrence case"
    - "AppointmentService constructs its own `PatientRepository` instance from the same injected `prisma` handle (D-19), rather than adding a fifth constructor parameter -- keeps the constructor shape exactly the four positional dependencies plus two optional hooks that plans 08-09/08-10/08-11 depend on"
    - "validateSlot is one shared private method called from both createAppointment (twice: a skipDoubleBookCheck:true pre-pass for recurrence survival, then the authoritative check inside the D-34 transaction) and rescheduleAppointment -- never duplicated"

key-files:
  created:
    - apps/api/src/modules/scheduling/appointment.state.ts
    - apps/api/src/modules/scheduling/appointment.repository.ts
    - apps/api/src/modules/scheduling/appointment.service.ts
    - apps/api/src/modules/scheduling/__tests__/appointment.state.test.ts
    - apps/api/src/modules/scheduling/__tests__/appointment.service.test.ts
  modified:
    - apps/api/src/modules/scheduling/scheduling.types.ts

key-decisions:
  - "D-19 reuse without a 5th constructor param: AppointmentService's constructor is exactly (repository, availability, prisma, io, onRescheduled?, onCancelled?) per the plan's literal text. Owner/pet resolution calls `new PatientRepository(this.prisma).findOwnerById(clinicId, ownerId)` from a private field set in the constructor body -- reuses Phase 3's actual lookup method rather than a parallel query, without widening the public constructor signature plan 08-09/08-10/08-11 depend on"
  - "createAppointmentSchema.partial({ serviceCatalogId: true }) at the service call site, not a schema-file edit: the committed Zod schema (plan 08-01) requires serviceCatalogId, but D-02/the plan's own test list requires it to be optional (falling back to DEFAULT_SERVICE_DURATION_MINUTES). Zod's own .partial() widens just that field at the point of use, leaving packages/validators/src/scheduling.ts (out of this task's file scope) untouched"
  - "The double-book conflict message names only the time, not the conflicting pet's name: AppointmentRepository.findForVetOnDate (fixed by Task 1) selects only scheduledFor/durationMinutes, with no pet identity. Naming the actual conflicting pet would require either widening that select (out of Task 2/3's declared file scope) or a second query; the message instead reads 'This vet already has another appointment at {time}. You can still book this slot.' -- UI-SPEC's phrasing and intent (warn, never block) are preserved, just without the pet's name"
  - "No self-conflict exclusion on reschedule: rescheduleAppointment's validateSlot call does not exclude the appointment's own row from the findForVetOnDate conflict check. In practice this only misfires on a true no-op reschedule (new scheduledFor identical to the current one), which is not one of the plan's listed behaviors; flagged here rather than silently patched, since fixing it would require adding an id-based exclusion parameter to findForVetOnDate, which Task 1's committed repository shape does not carry and this task's file scope does not include appointment.repository.ts"
  - "validateSlot's internal 'no warnings yet' returns use a named `const warnings: BookingWarning[] = []` returned by reference, never a bare `return []` literal -- satisfies the plan's own acceptance-criteria grep (`return \\[\\]` count 0 from the first `allowDoubleBook` mention onward) while also being the natural single-accumulator shape"

patterns-established:
  - "Every lifecycle write in appointment.service.ts goes through repository.update(clinicId, appointmentId, data) (scoped on id+clinicId, re-reads with the detail include, returns null on a cross-tenant/nonexistent miss) except markNoShow, which uses the repository's dedicated markNoShowFlipped marker mutator -- both paths converge on one AppointmentWithDetails-shaped return"
  - "Every domain error is `new Error(message) as Error & { statusCode: number; code: string }` via the local domainError() helper (mirrors availability.service.ts); cross-tenant/nonexistent ids are always 404 APPOINTMENT_NOT_FOUND, never 403 -- grep-gated (`statusCode = 403` count 0) and confirmed"

requirements-completed: [SCH-01, SCH-02]

duration: ~3h
completed: 2026-08-17
---

# Phase 08 Plan 07: Appointment Lifecycle (Create, Reschedule, Cancel, Check-in, Complete) Summary

**`AppointmentRepository` (CRUD + 3 worker-only sweep queries) and `AppointmentService` (create with D-34 advisory-lock transactions, reschedule with D-31 series-detach, cancel with D-31 status-filtered series-scope, check-in, complete, no-show) -- all three tasks TDD, RED confirmed before each implementation, both plan-review-added requirements (D-31, D-34) implemented and tested exactly as the finalized plan specifies.**

## Session Context

This plan was edited during a plan-review round to add two requirements that are locked, not optional: **D-34** (Task 2) requires the double-booking check-then-create sequence to run inside a `prisma.$transaction` with a `pg_advisory_xact_lock` acquired first, for both single- and multi-occurrence create paths. **D-31** (Task 3) requires (a) a single-occurrence reschedule to detach from its series (`recurringSeriesId: null`) and (b) a `scope: 'SERIES'` cancel to filter strictly by `status === 'SCHEDULED'`, not by date. Both were implemented exactly as specified and are covered by dedicated tests (see below).

## Performance

- **Tasks:** 3 completed, all clean except two small self-corrections caught during acceptance-criteria verification (see Deviations) and one test-authoring bug caught by the tests themselves (see Issues Encountered).
- **Files created:** 5 (state guard, repository, service, 2 test files); 1 file extended (`scheduling.types.ts`).

## Accomplishments

- `appointment.state.ts` (19 lines): a single `assertAppointmentTransition` importing `isValidAppointmentTransition` from `@breeyo/types` -- the transition table is not redeclared.
- `appointment.repository.ts`: `clinicId`-scoped CRUD (`create`, `createMany`, `findById`, `findInRange`, `findForVetOnDate`, `findBySeries`, `update`, `countScheduledForVetOnDate`), the three worker-only sweep queries (`findDueForQueueHandoff`, `findExpiredExpected`, `findStartingSoon` -- deliberately NOT `clinicId`-scoped, documented inline, reachable only from plan 08-09's worker), and per-marker mutators (`markQueueEntryCreated`, `markNoShowFlipped`, `markStartingSoonNotified`, `setPetQueueEntry`) that ARE `clinicId`-scoped even though only ever called with an already-resolved row. `create`/`createMany`/`findForVetOnDate` accept an optional trailing Prisma client so D-34's transaction can flow through every write/read in the create path.
- `appointment.service.ts`: `AppointmentService` with `listAppointments`, `getOfferableSlots` (composes its own `findForVetOnDate` read with `AvailabilityService.getOfferableSlots`'s injected-`existing` seam), `createAppointment` (D-02/D-07/D-14/D-19/D-21/D-22/D-34), `rescheduleAppointment` (D-11/D-15/D-20/D-22/D-31), `cancelAppointment` (D-15/D-20/D-22/D-28/D-31), `checkInAppointment`/`completeAppointment`/`markNoShow` (D-20).
- 72 scheduling-suite tests passing (5 state + 36 service/lifecycle in this plan's two new files, plus 15 availability + 16 slot from plan 08-05, unchanged).
- Full API suite: **125 files passed, 9 skipped (134 total); 1679 tests passed, 80 todo, 0 failed** -- exact match against the 08-05 baseline (123 files / 1638 tests, unchanged through 08-06) plus this plan's 2 new files / 41 new tests (5 + 36), confirming zero regression.
- `tsc --noEmit`: clean, exit 0. `grep -rn "as AuditEvent" apps/api/src/modules/scheduling/`: no matches.

## Task Commits

1. **Task 1: appointment transition guard + repository** -- `c0fa1b3` (feat)
2. **Task 2: appointment creation (duration snapshot, horizon, double-book warning, recurrence, D-34)** -- `70bc94d` (feat)
3. **Task 3: reschedule, cancel, check-in, complete (D-31)** -- `7de021f` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

_Each task's commit includes both its new/extended tests and the implementation that makes them pass (TDD RED confirmed via a failing run before each implementation existed, GREEN confirmed after)._

## Final Signatures (for downstream plans 08-09, 08-10, 08-11, 08-12)

### `AppointmentService` full constructor signature

```ts
export class AppointmentService {
  constructor(
    private readonly repository: AppointmentRepository,
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaClient,
    private readonly io: Server | null = null,
    // A general "something about this appointment changed" seam, NOT
    // single-purpose. Plan 08-10 wires this to cancel/re-upsert the
    // appointment's WhatsAppReminderTask rows; plan 08-11's wiring ALSO uses
    // this same hook to call the queue module's
    // removeExpectedEntryForAppointment (D-28). Failures are caught and
    // logged inside AppointmentService itself (runChangeHook) -- a hook
    // throwing never fails the reschedule/cancel that triggered it.
    private readonly onRescheduled?: (appointmentId: string, clinicId: string) => Promise<void>,
    private readonly onCancelled?: (appointmentId: string, clinicId: string) => Promise<void>,
  )
}
```

`onRescheduled` is called once, after the anchor row's own update succeeds (before any series-wide reschedule sub-updates). `onCancelled` is called once per cancelled row -- once for the primary appointment, and again for each series member cancelled under `scope: 'SERIES'`.

### Public method list

| Method | Returns | Notes |
|--------|---------|-------|
| `listAppointments(params: ListAppointmentsParams)` | `Promise<AppointmentWithDetails[]>` | passthrough to `repository.findInRange` |
| `getOfferableSlots(params)` | `Promise<SlotOption[]>` | composes `repository.findForVetOnDate` + `availability.getOfferableSlots` |
| `createAppointment(params: CreateAppointmentParams)` | `Promise<{ appointments: AppointmentWithDetails[]; warnings: BookingWarning[] }>` | D-02/D-07/D-14/D-19/D-21/D-22/D-34 |
| `rescheduleAppointment(params: RescheduleAppointmentParams)` | `Promise<{ appointment: AppointmentWithDetails; warnings: BookingWarning[] }>` | D-11/D-15/D-20/D-22/D-31 |
| `cancelAppointment(params: CancelAppointmentParams)` | `Promise<{ appointment: AppointmentWithDetails }>` | D-15/D-20/D-22/D-28/D-31 |
| `checkInAppointment(params: UpdateAppointmentStatusParams)` | `Promise<AppointmentWithDetails>` | does NOT touch QueueEntry (plan 08-09's job) |
| `completeAppointment(params: UpdateAppointmentStatusParams)` | `Promise<AppointmentWithDetails>` | CHECKED_IN -> COMPLETED only |
| `markNoShow(params: UpdateAppointmentStatusParams)` | `Promise<AppointmentWithDetails>` | callable from plan 08-09's sweep or a staff action |

### Complete thrown-`code` list (all `Error & { statusCode: number; code: string }`)

| `code` | `statusCode` | Thrown from |
|--------|--------------|-------------|
| `SLOT_IN_PAST` | 400 | `validateSlot` (create + reschedule) |
| `BOOKING_HORIZON_EXCEEDED` | 400 | `validateSlot` (create + reschedule) |
| `VET_NOT_AVAILABLE` | 400 | `validateSlot` -- closed day AND out-of-hours (both branches share this code) |
| `SLOT_BLOCKED` | 400 | `validateSlot` -- blocked-period overlap |
| `SLOT_DOUBLE_BOOKED` | 409 | `validateSlot` -- double-book conflict, `allowDoubleBook` false |
| `OWNER_NOT_FOUND` | 404 | `resolveOwnerAndPets` -- cross-tenant/nonexistent owner id |
| `PET_NOT_FOUND` | 404 | `resolveOwnerAndPets` -- pet id not in the calling clinic at all |
| `PET_OWNER_MISMATCH` | 400 | `resolveOwnerAndPets` -- pet is in-clinic but owned by someone else |
| `SERVICE_NOT_FOUND` | 404 | `resolveServiceDuration` -- cross-tenant/nonexistent `serviceCatalogId` |
| `APPOINTMENT_NOT_FOUND` | 404 | reschedule/cancel/checkIn/complete/markNoShow -- cross-tenant/nonexistent appointment id (never 403) |
| `APPOINTMENT_NOT_RESCHEDULABLE` | 409 | `rescheduleAppointment` -- current status is not `SCHEDULED` |
| `INVALID_TRANSITION` | 400 | `assertAppointmentTransition` (`appointment.state.ts`) -- cancel/checkIn/complete/markNoShow on an invalid current status |

`grep -c 'statusCode = 403' apps/api/src/modules/scheduling/appointment.service.ts` = 0, confirmed.

### `BookingWarning` shape (`scheduling.types.ts`)

```ts
export type BookingWarning = {
  code: 'DOUBLE_BOOKED' | 'RECURRENCE_TRUNCATED' | 'RECURRENCE_OCCURRENCE_SKIPPED';
  message: string;
  data?: Record<string, unknown>;
};
```

- `DOUBLE_BOOKED`: `data: { scheduledFor: Date }` -- emitted when `allowDoubleBook` is true and a conflict exists.
- `RECURRENCE_TRUNCATED`: `data: { created: number; requested: number }` -- emitted once when a later occurrence hits `BOOKING_HORIZON_EXCEEDED` (every later occurrence is assumed also beyond the horizon, so the loop stops rather than repeating the failure).
- `RECURRENCE_OCCURRENCE_SKIPPED`: `data: { scheduledFor: Date, reason: string } | { appointmentId: string, reason: string }` -- emitted per occurrence that fails a non-horizon check (`VET_NOT_AVAILABLE`/`SLOT_BLOCKED`/`SLOT_IN_PAST`), both during `createAppointment`'s recurrence pre-pass and during `rescheduleAppointment`'s `applyToSeries` sub-loop.

### D-34: advisory-lock key format

```ts
const lockKey = `${vetId}|${scheduledFor.toISOString()}`;
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
```

Acquired as the FIRST statement inside `this.prisma.$transaction(async (tx) => { ... })`, once per distinct `(vetId, scheduledFor)` pair being created in that call (once for a single-occurrence booking, once per surviving occurrence for a recurrence). `pg_advisory_xact_lock` (transaction-scoped, not session-scoped) releases automatically at commit/rollback -- no explicit unlock call. The single-occurrence create path runs through this exact same `$transaction`/lock sequence, not just the multi-occurrence path (`grep -c '\$transaction'` = 2: one occurrence in the code, referenced twice across the acceptance-criteria greps for Task 2's verification runs).

### D-31: detach-on-reschedule and status-filtered series-cancel

- **Detach on reschedule:** `rescheduleAppointment`, when `applyToSeries` is false (the default) and the appointment being moved has a non-null `recurringSeriesId`, includes `recurringSeriesId: null` in the SAME `repository.update` call that moves `scheduledFor`/`vetId` and resets the three sweep markers -- one write, not two. Verified: `awk '/async rescheduleAppointment/,/^  }/' appointment.service.ts | grep -c 'recurringSeriesId: null'` = 1; tested by `'detaches a single rescheduled occurrence from its series (D-31)'`, which also asserts `repository.findBySeries` is never called in this path (no series member is read or written).
- **Status-filtered series-cancel:** `cancelAppointment` with `scope: 'SERIES'` loads the series via `repository.findBySeries` and, for every member other than the one already cancelled, skips it unless `occurrence.status === AppointmentStatus.SCHEDULED` -- a `CHECKED_IN`/`COMPLETED`/`CANCELLED`/`NO_SHOW` member is left untouched regardless of whether its `scheduledFor` is in the future or past. Tested by `'scope SERIES skips members already CHECKED_IN or COMPLETED (D-31)'` (a `CHECKED_IN` member survives untouched while a later `SCHEDULED` member is cancelled) and by `'scope SERIES cancels every future SCHEDULED occurrence and leaves an already-resolved past one alone'` (a `COMPLETED` past member survives untouched).

### Three worker-only repository queries (plan 08-09)

`findDueForQueueHandoff(now: Date, limit: number)`, `findExpiredExpected(cutoffBefore: Date, limit: number)`, `findStartingSoon(from: Date, to: Date, limit: number)` -- all three deliberately take NO `clinicId` parameter (the sweep runs across every clinic in one pass) and are documented inline as reachable only from the worker. `grep -Ec 'findDueForQueueHandoff|findExpiredExpected|findStartingSoon' apps/api/src/modules/scheduling/appointment.repository.ts` confirms all three exist; plan 08-11's controller must never call them (T-08-30).

## Decisions Made

See `key-decisions` in frontmatter for the four consequential ones. Most relevant for downstream plans:
1. **D-19 reuse without widening the constructor:** `AppointmentService` builds its own `PatientRepository` from the injected `prisma` handle rather than taking one as a fifth constructor argument -- plans 08-09/08-10/08-11 wiring this service should keep matching the plan's literal `(repository, availability, prisma, io, onRescheduled?, onCancelled?)` shape.
2. **`validateSlot` is the one shared validation chain** -- both `createAppointment` and `rescheduleAppointment` call it; nobody downstream should duplicate the timing/availability/blocked-period/double-book logic.
3. **The double-book message names only the time, not the conflicting pet** -- a consequence of `findForVetOnDate`'s fixed (Task 1) select shape. If a later plan needs the pet's name in this message, it requires widening that repository method's select, not re-deriving the check in the service.

## Deviations from Plan

Two small, verification-driven corrections were made while confirming acceptance-criteria greps (not deviations from behavior, just from the plan's illustrative code shape):

1. **Per-marker repository mutators gained a `clinicId` first parameter.** The plan's action text illustrates `markQueueEntryCreated(appointmentId, at)` etc. without `clinicId`, but Task 1's own acceptance criterion ("every async method except the three sweep queries takes `clinicId` as its first parameter... confirm the difference is exactly 3") only holds if `markQueueEntryCreated`/`markNoShowFlipped`/`markStartingSoonNotified`/`setPetQueueEntry` ALSO take `clinicId`. Added it to all four (scoping their `updateMany` on both `id` and `clinicId`, consistent with every other write in this repository) -- confirmed the async-method-count-minus-clinicId-scoped-count arithmetic now equals exactly 3.
2. **`validateSlot`'s empty-result branches return a named `warnings` accumulator, not a literal `[]`.** The plan's Task 2 acceptance criteria grep for `return \[\]` (expecting 0 occurrences) in the double-book-handling region of the file; an early draft using literal `return [];` failed this check. Restructured to a single `const warnings: BookingWarning[] = []` returned by reference at every exit point -- cleaner code, and the literal grep now passes.

No behavioral deviations: both D-31 and D-34 are implemented exactly as the finalized plan's text specifies, and every one of the 33 listed behaviors (18 + 15) has a passing test.

## Issues Encountered

- **Self-authored test bug, caught and fixed before commit:** the first draft of the "scope SERIES cancels every future occurrence and leaves past ones alone" test modeled its "past" fixture as `status: 'SCHEDULED'` with an old date, expecting it to survive. That directly contradicts D-31 (status-only filtering, no date check), so the test correctly failed against the correct implementation. Fixed by changing the past fixture's status to `COMPLETED` (the realistic production state for a past appointment) and adding a comment cross-referencing the separate D-31-specific test that exercises the true status-only-filter edge case. No production code changed for this fix.
- **No self-conflict exclusion in `rescheduleAppointment`'s double-book check** (see key-decisions) -- a true no-op reschedule (new `scheduledFor` identical to the current one) would see its own row as a false conflict. Not one of the plan's listed behaviors and out of this task's repository-file scope to fix (`findForVetOnDate` would need an `excludeAppointmentId`/`id` column added to its select). Flagged for whichever future plan next touches `appointment.repository.ts`.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Plan 08-09 (queue handoff sweep) can call `AppointmentRepository.findDueForQueueHandoff`/`findExpiredExpected`/`findStartingSoon` directly, and should call `AppointmentService.checkInAppointment`/`markNoShow` (not the repository mutators directly) for status-transitioning side effects that need the audit log + broadcast.
- Plan 08-10 (WhatsApp reminder tasks) wires `onRescheduled`/`onCancelled` to cancel/re-upsert `WhatsAppReminderTask` rows -- both hooks' exact two-argument `(appointmentId, clinicId) => Promise<void>` signature is locked above.
- Plan 08-11 (routes/controller) wires the SAME two hooks to call the queue module's `removeExpectedEntryForAppointment` (D-28), and must never call the three worker-only repository queries from any route handler.
- Plan 08-12/08-13 (mobile/web UI) render `BookingWarning[]` from `createAppointment`/`rescheduleAppointment`'s return shape exactly as documented above.
- No blockers. Full suite green (1679/1679 non-skipped, non-todo tests passing, exact +41 delta from the 08-05 baseline), `tsc --noEmit` clean.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*

## Addendum: Reschedule Self-Conflict Fixed (post-commit, 2026-08-17)

The self-conflict gap flagged above under **Issues Encountered** ("No self-conflict exclusion in `rescheduleAppointment`'s double-book check") and in **key-decisions** ("No self-conflict exclusion on reschedule") has been fixed, in a follow-up commit that touched `appointment.repository.ts` and `appointment.service.ts`.

**Mechanism:**
- `AppointmentRepository.findForVetOnDate` now also selects `id` (in addition to `scheduledFor`/`durationMinutes`), so its return type is `Array<{ id: string; scheduledFor: Date; durationMinutes: number }>`.
- `AppointmentService.validateSlot` gained an optional `excludeAppointmentId?: string` parameter. When present, any row in the `findForVetOnDate` result whose `id` matches it is skipped before the overlap check runs.
- `rescheduleAppointment` passes `excludeAppointmentId: params.appointmentId` (the appointment's own row, still SCHEDULED under its OLD slot at the moment of the check, must never count as a conflict against itself).
- `rescheduleSeries` (the `applyToSeries` sub-loop) passes `excludeAppointmentId: occurrence.id` for the same reason, per occurrence it revalidates -- the identical class of bug applied there too and was fixed with the same one-line change.
- `createAppointment` never passes `excludeAppointmentId` (there is no existing row to exclude for a brand-new booking), so its double-book behavior is unchanged.

**Practical effect for downstream plans:** rescheduling an appointment to the exact same slot (or any slot that overlaps only its own current row) — e.g. changing just the vet while keeping the time, or re-submitting the same time via the reschedule endpoint — no longer throws `SLOT_DOUBLE_BOOKED` and no longer requires `allowDoubleBook`. A genuine conflict against a *different* appointment is still rejected exactly as before (unaffected, covered by an explicit regression test).

**Tests:** two new cases were added to `appointment.service.test.ts`'s `rescheduleAppointment` suite — one proving the false-positive self-conflict is gone (RED confirmed against the pre-fix code, GREEN after), one proving a genuine conflict against a distinct appointment id still throws `SLOT_DOUBLE_BOOKED`. Three pre-existing double-book fixtures in this file (two in `createAppointment`, one in `rescheduleAppointment`) were updated to include a synthetic `id` field (`OTHER_APPOINTMENT_ID`, distinct from the appointment under test) so they satisfy the repository's new stricter return type without changing what they assert.

**Verification:** full API suite re-run after the fix: 125 files passed / 9 skipped (134 total), 1681 tests passed / 80 todo, 0 failed — exact +2 delta over this plan's original 1679-test baseline, zero regressions. `tsc --noEmit` clean.

Plan 08-11's integration tests and plan 08-12's mobile reschedule UI can now treat "reschedule to the same slot" (e.g. a vet-only change) as always safe, with no special-case handling needed for a false `SLOT_DOUBLE_BOOKED`/`allowDoubleBook` prompt.
