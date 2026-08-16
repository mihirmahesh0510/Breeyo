---
phase: 08-scheduling-calendar
plan: "01"
subsystem: shared-contracts
tags: [typescript, zod, types, validators, appointments, queue, socket.io]

requires: []
provides:
  - "AppointmentStatus enum, APPOINTMENT_TRANSITIONS table, isValidAppointmentTransition, APPOINTMENT_STATUS_LABELS in @breeyo/types"
  - "BlockedPeriodReason, AppointmentSource, RecurrenceInterval enums plus every tunable scheduling constant in @breeyo/types"
  - "The only hhmmToMinutes/minutesToHHMM/weekdayIndexFromLabel/formatMinutesRange converters in the monorepo"
  - "QueueStatus.EXPECTED with transitions, label, CLOSED_QUEUE_STATUSES/ACTIVE_QUEUE_STATUSES lists"
  - "Scheduling Socket.IO event keys, MOVE_REQUEST notification type"
  - "QueueEntry.queuePriorityAt/appointmentId, QueueBoard.expected"
  - "packages/types/src/scheduling.ts entity types (Appointment, AppointmentWithDetails, availability/blocked-period/slot types)"
  - "packages/validators/src/scheduling.ts — 12 Zod schemas with inferred type exports"
  - "queueStatusUpdateSchema widened to accept EXPECTED"
affects: [08-03, 08-04, 08-05, 08-07, 08-08, 08-10, 08-13]

tech-stack:
  added: []
  patterns:
    - "Plain enum + Record<Enum, Enum[]> transition table + isValidX guard function (mirrors queue-status.ts)"
    - "Zod schema + trailing z.infer type export per schema (mirrors queue.ts/emr.ts)"
    - "Cross-field validation via .superRefine with ctx.addIssue, not .refine, when multiple independent field-level messages are needed"

key-files:
  created:
    - packages/types/src/constants/scheduling.constants.ts
    - packages/types/src/scheduling.ts
    - packages/validators/src/scheduling.ts
    - packages/types/src/constants/__tests__/scheduling.constants.test.ts
    - packages/types/src/constants/__tests__/queue-status.test.ts
    - packages/validators/src/__tests__/scheduling.test.ts
  modified:
    - packages/types/src/constants/queue-status.ts
    - packages/types/src/constants/socket-events.ts
    - packages/types/src/constants/index.ts
    - packages/types/src/notification.ts
    - packages/types/src/queue.ts
    - packages/types/src/index.ts
    - packages/validators/src/queue.ts
    - packages/validators/src/index.ts

key-decisions:
  - "formatMinutesRange uppercases the toLocaleTimeString('en-IN', ...) output because this Node runtime's ICU renders en-IN am/pm markers lowercase ('1:00 pm'), which would not match the UI-SPEC's capital-PM copy contract otherwise; the recipe itself (en-IN, hour12, en dash) is unchanged"
  - "BOOKING_HORIZON_DAYS=90, NO_SHOW_GRACE_MINUTES=20, STARTING_SOON_LEAD_MINUTES=15, QUEUE_BACKLOG_THRESHOLD=5, QUEUE_BACKLOG_DEBOUNCE_MINUTES=30, SCHEDULING_SWEEP_CRON='*/5 * * * *', SCHEDULING_TIMEZONE='Asia/Kolkata', DEFAULT_SERVICE_DURATION_MINUTES=15 — taken verbatim from CONTEXT.md/RESEARCH.md recommendations, no deviation"
  - "@breeyo/types was already a declared dependency of @breeyo/validators (package.json), so no dependency edit was needed"

patterns-established:
  - "Every scheduling write-shape lives in packages/validators/src/scheduling.ts with a matching z.infer export; no route/controller in later plans should hand-roll a parallel shape"
  - "hhmmToMinutes/minutesToHHMM/weekdayIndexFromLabel/formatMinutesRange are the single source of truth — later plans (08-05 availability service, 08-13 settings screen) must import, never reimplement"

requirements-completed: [SCH-01, SCH-02, SCH-03, SCH-04, SCH-05]

duration: ~55min
completed: 2026-08-16
---

# Phase 08 Plan 01: Shared Scheduling Contracts Summary

**Appointment lifecycle transition table, EXPECTED queue status, scheduling socket events/notification type, and 12 Zod scheduling schemas added to `@breeyo/types` and `@breeyo/validators`, all TDD with unit tests.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 completed
- **Files modified/created:** 14

## Accomplishments
- `AppointmentStatus`/`APPOINTMENT_TRANSITIONS`/`isValidAppointmentTransition`/`APPOINTMENT_STATUS_LABELS` (D-20) plus `BlockedPeriodReason` (D-06), `AppointmentSource`, `RecurrenceInterval` (D-22), every tunable scheduling constant, and the sole HH:MM/weekday converter set, all unit tested including throw and round-trip cases.
- `QueueStatus.EXPECTED` is now a first-class status (D-08) with transitions only to `WAITING` (D-11) and `NO_SHOW` (D-09), never reachable backwards; `CLOSED_QUEUE_STATUSES`/`ACTIVE_QUEUE_STATUSES` named lists added for plan 08-04.
- Scheduling Socket.IO events, `MOVE_REQUEST` notification type (D-16), `QueueEntry.queuePriorityAt`/`appointmentId`, `QueueBoard.expected` (D-13, ordered first), and the full `packages/types/src/scheduling.ts` entity-type surface.
- 12 Zod schemas in `packages/validators/src/scheduling.ts` covering every scheduling write shape, each with an inferred type export; `queueStatusUpdateSchema` widened to accept `EXPECTED`.

## Task Commits

1. **Task 1: scheduling.constants.ts (transitions, blocked-period reasons, tunables, converters)** - `ae186da` (feat)
2. **Task 2: EXPECTED queue status, socket events, MOVE_REQUEST, scheduling.ts entity types** - `36535a5` (feat)
3. **Task 3: scheduling Zod validators + queue status validator widened to EXPECTED** - `507588e` (feat)

_Each task followed red→green TDD: a failing test file was written and run first, confirmed to fail for the right reason (missing module or missing enum member), then the minimal implementation was added until the exact task's tests and grep-based acceptance criteria passed._

## Files Created/Modified
- `packages/types/src/constants/scheduling.constants.ts` - AppointmentStatus lifecycle, transitions, labels, BlockedPeriodReason, AppointmentSource, RecurrenceInterval, all tunables, HH:MM/weekday converters
- `packages/types/src/constants/__tests__/scheduling.constants.test.ts` - 12 tests covering every Task 1 behavior
- `packages/types/src/constants/queue-status.ts` - added `EXPECTED`, its transitions/label, `CLOSED_QUEUE_STATUSES`/`ACTIVE_QUEUE_STATUSES`
- `packages/types/src/constants/__tests__/queue-status.test.ts` - 11 tests covering EXPECTED transitions and regression coverage for existing transitions
- `packages/types/src/constants/socket-events.ts` - added 4 scheduling event keys
- `packages/types/src/notification.ts` - added `MOVE_REQUEST` to `NotificationType`
- `packages/types/src/queue.ts` - added `queuePriorityAt`/`appointmentId` to `QueueEntry`, `expected` to `QueueBoard` (first field)
- `packages/types/src/scheduling.ts` - new: `VetAvailabilityTemplate`, `AvailabilityOverride`, `BlockedPeriod`, `ResolvedDayHours`/`ResolvedDayAvailability`, `SlotOption`, `AppointmentPetRef`, `Appointment`, `AppointmentWithDetails`, `ScheduleRange`
- `packages/types/src/index.ts`, `packages/types/src/constants/index.ts` - barrel exports for the two new files
- `packages/validators/src/scheduling.ts` - new: 12 Zod schemas + type exports (see list below)
- `packages/validators/src/__tests__/scheduling.test.ts` - 19 tests covering every Task 3 behavior
- `packages/validators/src/queue.ts` - `queueStatusUpdateSchema` enum widened to include `'EXPECTED'`
- `packages/validators/src/index.ts` - barrel export for `scheduling.js`

## Decisions Made
- `formatMinutesRange` applies `.toUpperCase()` to the `toLocaleTimeString('en-IN', ...)` output. This Node runtime's ICU renders en-IN `am`/`pm` markers lowercase (`'1:00 pm'`) even with `hour12: true`; the plan's literal test assertion (`'1:00 PM – 1:15 PM'`) and UI-SPEC's copy contract (`2:30 PM`) require capital letters, so the function normalizes case after formatting. The underlying recipe (en-IN locale, hour12, en dash separator, IST-anchored) is unchanged from the spec.
- All tunable constant values were taken verbatim from CONTEXT.md/RESEARCH.md's recommended values — no independent judgment calls were needed since the plan enumerated every value explicitly.

## Deviations from Plan

None - plan executed exactly as written, with the single exception of the `formatMinutesRange` uppercase normalization noted above (required to satisfy the plan's own literal test assertion given this runtime's ICU behavior; not a scope or behavior deviation).

## Issues Encountered
- A pre-existing test-file typing issue was found and fixed in-flight: the `dayEntry()` test helper in `packages/validators/src/__tests__/scheduling.test.ts` inferred `openMinutes`/`closeMinutes` as `number` from its first literal, which broke when a later test assigned `openMinutes: null` to an array element of that inferred type. Fixed by widening the helper's return type to `number | null` for both fields. This is test-only code, not the schema under test.
- `pnpm --filter @breeyo/api build` fails in this worktree, but for reasons unrelated to this plan: `@prisma/client` has never been generated here (`apps/api/node_modules/.prisma/client` does not exist), so every Prisma-typed import in `apps/api` fails to resolve. This is a pre-existing environment gap (no `pnpm db:generate` has been run in this worktree), not a regression introduced by this plan's `QueueBoard`/`QueueEntry` field additions. It is out of scope for 08-01 (whose `<verification>` block only requires the two shared packages to build) and is flagged here for whichever plan first needs `apps/api` to build (likely 08-04).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

The full shared contract surface (`@breeyo/types`, `@breeyo/validators`) needed by every downstream Phase 8 plan now exists, is unit tested, and builds cleanly. Downstream plans can import directly rather than re-deriving these values:

### Final `AppointmentStatus` values
`SCHEDULED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW` (no `CONFIRMED` — D-20).

### Final `APPOINTMENT_TRANSITIONS` table
| From | To |
|------|----|
| `SCHEDULED` | `CHECKED_IN`, `CANCELLED`, `NO_SHOW` |
| `CHECKED_IN` | `COMPLETED`, `NO_SHOW` |
| `COMPLETED` | *(none)* |
| `CANCELLED` | *(none)* |
| `NO_SHOW` | *(none)* |

### Final `QUEUE_TRANSITIONS` table (Phase 3 + Phase 8's `EXPECTED` addition)
| From | To |
|------|----|
| `EXPECTED` | `WAITING`, `NO_SHOW` |
| `WAITING` | `IN_CONSULT`, `NO_SHOW` |
| `IN_CONSULT` | `DONE`, `NO_SHOW` |
| `DONE` | *(none)* |
| `NO_SHOW` | *(none)* |

`CLOSED_QUEUE_STATUSES = [DONE, NO_SHOW]`, `ACTIVE_QUEUE_STATUSES = [EXPECTED, WAITING, IN_CONSULT]`.

### Tunable constants (exact values, `packages/types/src/constants/scheduling.constants.ts`)
| Constant | Value |
|---|---|
| `BOOKING_HORIZON_DAYS` | `90` |
| `NO_SHOW_GRACE_MINUTES` | `20` |
| `STARTING_SOON_LEAD_MINUTES` | `15` |
| `QUEUE_BACKLOG_THRESHOLD` | `5` |
| `QUEUE_BACKLOG_DEBOUNCE_MINUTES` | `30` |
| `SCHEDULING_SWEEP_CRON` | `'*/5 * * * *'` |
| `SCHEDULING_TIMEZONE` | `'Asia/Kolkata'` |
| `DEFAULT_SERVICE_DURATION_MINUTES` | `15` |
| `RECURRENCE_MIN_OCCURRENCES` / `RECURRENCE_MAX_OCCURRENCES` | `2` / `12` |
| `RECURRENCE_INTERVAL_DAYS` | `WEEKLY: 7`, `FORTNIGHTLY: 14`, `FOUR_WEEKLY: 28` |
| `APPOINTMENT_REMINDER_TOUCHES` | `['ADVANCE', 'ON_DATE']` |

### Exported schema names (`packages/validators/src/scheduling.ts`)
`recurrenceSchema`, `createAppointmentSchema`, `rescheduleAppointmentSchema`, `cancelAppointmentSchema`, `appointmentStatusUpdateSchema`, `appointmentRangeQuerySchema`, `slotQuerySchema`, `availabilityTemplateDaySchema`, `upsertAvailabilityTemplateSchema`, `upsertAvailabilityOverrideSchema`, `createBlockedPeriodSchema`, `ownerAppointmentActionSchema` — each has a matching `z.infer` type export (`RecurrenceInput`, `CreateAppointmentInput`, `RescheduleAppointmentInput`, `CancelAppointmentInput`, `AppointmentStatusUpdateInput`, `AppointmentRangeQueryInput`, `SlotQueryInput`, `AvailabilityTemplateDayInput`, `UpsertAvailabilityTemplateInput`, `UpsertAvailabilityOverrideInput`, `CreateBlockedPeriodInput`, `OwnerAppointmentActionInput`).

### Known blocker for later plans
`apps/api` cannot currently build in this worktree because `@prisma/client` has not been generated (`pnpm db:generate` has not been run here). Whichever plan first needs `apps/api` to build (likely 08-04, which owns the `QueueBoard`/`EXPECTED` API-side wiring) should run `pnpm db:generate` first and confirm this resolves the Prisma-typed import errors before investigating further.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-16*
