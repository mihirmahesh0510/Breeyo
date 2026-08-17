---
phase: 08-scheduling-calendar
plan: "05"
subsystem: api
tags: [scheduling, availability, slot-generation, prisma, audit-log, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-01)
    provides: "SlotOption/ResolvedDayHours/VetAvailabilityTemplate/AvailabilityOverride/BlockedPeriod types, scheduling Zod schemas, BOOKING_HORIZON_DAYS, SOCKET_EVENTS.AVAILABILITY_UPDATED"
  - phase: 08-scheduling-calendar (plan 08-03)
    provides: "VetAvailabilityTemplate/AvailabilityOverride/BlockedPeriod Prisma models and migration"
  - phase: 08-scheduling-calendar (plan 08-04)
    provides: "ist-date.ts helpers: getTodayIST, istDateOnly, addDaysIST, istDayBounds, minutesToIstDate, istMinutesOfDay, weekdayIST"
provides:
  - "slot.service.ts: pure generateSlotsForVetDay/resolveDayHours/subtractBlockedRanges, no Prisma, no Date, integer minutes-from-midnight arithmetic only"
  - "AuditEvent extended with 9 scheduling events: APPOINTMENT_CREATED/RESCHEDULED/CANCELLED/CHECKED_IN/COMPLETED/NO_SHOW, AVAILABILITY_UPDATED, BLOCKED_PERIOD_ADDED/REMOVED"
  - "scheduling.types.ts: UpsertAvailabilityTemplateParams, UpsertAvailabilityOverrideParams, CreateBlockedPeriodParams, RemoveBlockedPeriodParams, ResolveAvailabilityParams, GetOfferableSlotsParams"
  - "AvailabilityRepository: clinicId-scoped CRUD over VetAvailabilityTemplate/AvailabilityOverride/BlockedPeriod, findOverlappingBlockedPeriod, listClinicVets (id-sorted, EDIT_EMR-permission filter)"
  - "AvailabilityService: resolveAvailabilityForDate, getOfferableSlots (existing ranges injected by caller), replaceWeeklyTemplate/upsertDateOverride/createBlockedPeriod (all three now return affectedAppointmentCount per D-30), removeBlockedPeriod, listVets"
affects: [08-06, 08-07, 08-09, 08-10, 08-11, 08-12, 08-13, 08-14]

tech-stack:
  added: []
  patterns:
    - "Exported plain functions (no class) for the pure slot engine, per PATTERNS § No Analog Found -- genuinely greenfield, no Phase 7 transplant source"
    - "clinicId always the first repository parameter and always in the `where`; fastify.prisma (a plain PrismaClient) injected directly, no DB-level RLS on these three tables"
    - "Service constructor(repository, prisma, io = null) mirrors QueueService's constructor(repository, io = null) shape, widened with a raw PrismaClient because replaceWeeklyTemplate/upsertDateOverride/createBlockedPeriod each query prisma.appointment directly for their D-30/D-01 warning-only counts"
    - "Domain errors: `new Error(message) as Error & { statusCode: number; code: string }`, exact UI-SPEC message text, cross-tenant misses always 404 never 403"

key-files:
  created:
    - apps/api/src/modules/scheduling/scheduling.types.ts
    - apps/api/src/modules/scheduling/slot.service.ts
    - apps/api/src/modules/scheduling/availability.repository.ts
    - apps/api/src/modules/scheduling/availability.service.ts
    - apps/api/src/modules/scheduling/__tests__/slot.service.test.ts
    - apps/api/src/modules/scheduling/__tests__/availability.service.test.ts
  modified:
    - apps/api/src/lib/audit-log.ts

key-decisions:
  - "listClinicVets filters on ClinicMember -> roles -> role -> rolePermissions -> permission.code = 'EDIT_EMR' rather than a role name string: seed.ts seeds EDIT_EMR onto Admin (all permissions) and Clinician only, never FrontDesk/InventoryManager, which is exactly the 'can this staff member be booked as a treating vet' set. Queried directly as `prisma.user.findMany({ where: { clinicMemberships: { some: { clinicId, isActive: true, roles: { some: { role: { rolePermissions: { some: { permission: { code: 'EDIT_EMR' } } } } } } } } }, orderBy: { id: 'asc' } })` rather than clinicMember.findMany, so the ordering is a literal `orderBy: { id: 'asc' }` on the User's own id (the id vetColorForId indexes into), not a relation-nested orderBy"
  - "createBlockedPeriod does NOT re-parse with createBlockedPeriodSchema.parse() in the service, unlike replaceWeeklyTemplate/upsertDateOverride which do re-parse with their Zod schemas. createBlockedPeriodSchema's own .superRefine already encodes the same end-after-start and OTHER-needs-reasonText rules, so calling .parse() there would throw a bare ZodError (400 VALIDATION_ERROR) before the service's own INVALID_TIME_RANGE/REASON_TEXT_REQUIRED domain-error codes could ever be produced -- the behavior tests require the specific codes, so createBlockedPeriod validates those two rules itself, in the exact order the plan specifies, before calling the repository's overlap check"
  - "assertVetInClinic (private) is a direct `prisma.clinicMember.findFirst({ where: { clinicId, userId: vetId, isActive: true } })`, not a check against listClinicVets's EDIT_EMR-filtered list -- template/override configuration should be gate-able for any active clinic member holding the vetId, not narrowed further by role, since 08-11's controller-level permission checks (MANAGE_SCHEDULE) are the actual authorization boundary; this method only proves tenancy (T-08-17), not role"
  - "AvailabilityService's constructor takes a raw `PrismaClient` (not the TenantPrismaClient/DbClient union used by queue.repository.ts/vaccination.repository.ts) because plan 08-03 deliberately left these three tables without DB-level RLS, matching PATTERNS § Multi-tenancy's explicit instruction to inject fastify.prisma directly for this module"

patterns-established:
  - "getOfferableSlots takes `existing` as an injected argument, never queries prisma.appointment itself -- verified by `awk '/getOfferableSlots\\(/,/^  }/' ... | grep -c 'appointment\\.'` returning 0. Plan 08-07's AppointmentService MUST supply this array from its own repository; do not add an appointment-repository dependency to AvailabilityService"
  - "D-30 affectedAppointmentCount is warning-only and never blocks a write: upsertDateOverride uses `prisma.appointment.count` scoped to istDayBounds; replaceWeeklyTemplate and createBlockedPeriod use `prisma.appointment.findMany` (selecting only scheduledFor/durationMinutes) and count matches in application code, per the plan's D-30 action text -- neither queries an injected appointment repository"

requirements-completed: [SCH-01]

duration: ~90min
completed: 2026-08-17
---

# Phase 08 Plan 05: Availability Engine, Repository and Service Summary

**Pure integer-arithmetic slot-generation engine, `clinicId`-scoped availability repository (templates/overrides/blocked periods + vet list), and the availability service that resolves per-date hours, validates blocked periods against UI-SPEC's exact error copy, and reports a non-blocking `affectedAppointmentCount` on every availability write (D-30) -- all three tasks TDD, RED confirmed before each implementation.**

## Session Context

Read the finalized plan in full, including the review-round addition of D-30 to Task 3 (`replaceWeeklyTemplate` and `createBlockedPeriod` must also compute and return `affectedAppointmentCount`, matching `upsertDateOverride`'s existing pattern) and the narrowed acceptance criterion scoping the "no `appointment.findMany` in this service" check specifically to `getOfferableSlots` rather than the whole file. Both were implemented as the finalized plan text describes, not the earlier/stricter versions.

## Performance

- **Tasks:** 3 completed, all clean -- no deviations from the plan's `<action>` text in any task.
- **Files created:** 6 (2 implementation modules besides the repository, 1 types file, 1 audit-log extension, 2 test files)

## Accomplishments

- `AuditEvent` extended with all 9 scheduling events (`APPOINTMENT_CREATED/RESCHEDULED/CANCELLED/CHECKED_IN/COMPLETED/NO_SHOW`, `AVAILABILITY_UPDATED`, `BLOCKED_PERIOD_ADDED/REMOVED`), mirroring the Phase 4 extension block's style exactly (member name equals string value).
- `slot.service.ts`: three pure exported functions (`generateSlotsForVetDay`, `resolveDayHours`, `subtractBlockedRanges`), zero Prisma/Date imports, 16 unit tests covering all 10 required behaviors (closed day, exact tiling, trailing partial slot dropped, over-long duration, blocked exclusion (full and partial overlap), existing-appointment flagging (same-length and different-length overlap), template/override precedence in all four combinations, and range-merging).
- `availability.repository.ts`: 13 `clinicId`-scoped async methods, every `where` clause carries `clinicId` (verified: 13 `async`, 13 `clinicId: string`, 13 `where` occurrences), `istDateOnly`/`istDayBounds` used for every date filter (9 occurrences), `listClinicVets` ordered by the User's own `id` via a literal `orderBy: { id: 'asc' }`, zero use of the tenant-scoped request handle.
- `availability.service.ts`: `resolveAvailabilityForDate`, `getBlockedRangesForDate`, `getOfferableSlots` (existing ranges injected, zero `prisma.appointment` calls inside that method), `replaceWeeklyTemplate`/`upsertDateOverride`/`createBlockedPeriod` all audit-logged, broadcast, and now all three returning `affectedAppointmentCount` (D-30), `removeBlockedPeriod` (404 never 403 on a cross-tenant/nonexistent id), `listVets`. 15 unit tests covering all 13 required behaviors (plus 2 extra D-30 zero-count cases for symmetry).
- Every thrown error uses the `Error & { statusCode; code }` shape with UI-SPEC's verbatim message text: `"This overlaps an existing blocked period. Adjust the times."`, `"End time must be after start time."`, `"Add a short reason."`.
- Full API suite: **123 test files passed, 9 skipped (132 total); 1638 tests passed, 80 todo, 0 failed** -- exact match against the 08-04 baseline (121 files/1607 tests) plus this plan's 2 new files/31 new tests, confirming zero regression in any pre-existing suite.
- `tsc --noEmit`: clean, exit 0.

## Task Commits

1. **Task 1: AuditEvent extension, scheduling.types.ts, pure slot engine** -- `7ab6de7` (feat)
2. **Task 2: clinicId-scoped availability repository** -- `e4c8686` (feat)
3. **Task 3: availability service with D-30 affected-appointment counts** -- `5dc2e58` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

_Each task's commit includes both its new/extended tests and the implementation that makes them pass (TDD RED confirmed via a failing run before each implementation existed, GREEN confirmed after)._

## Final Signatures (for downstream plans 08-07, 08-11, 08-13)

**`AvailabilityService.getOfferableSlots`** -- plan 08-07's `AppointmentService` MUST supply `existing` from its own appointment repository; this method never queries `prisma.appointment`:
```ts
async getOfferableSlots(params: GetOfferableSlotsParams): Promise<SlotOption[]>

interface GetOfferableSlotsParams {
  clinicId: string;
  userId: string;
  vetId: string;
  date: Date;
  durationMinutes: number;
  existing: Array<{ startMinutes: number; endMinutes: number }>; // INJECTED by the caller
}
```

**`AvailabilityService` full method list, with thrown error codes:**

| Method | Returns | Thrown errors |
|--------|---------|---------------|
| `resolveAvailabilityForDate(params: ResolveAvailabilityParams)` | `ResolvedDayHours \| null` | none |
| `getBlockedRangesForDate(clinicId, vetId, date)` | `Array<{ startMinutes; endMinutes }>` | none |
| `getOfferableSlots(params: GetOfferableSlotsParams)` | `SlotOption[]` | none |
| `replaceWeeklyTemplate(params: UpsertAvailabilityTemplateParams)` | `{ template, affectedAppointmentCount }` | `404 VET_NOT_FOUND`; upstream `ZodError` -> `400 VALIDATION_ERROR` |
| `upsertDateOverride(params: UpsertAvailabilityOverrideParams)` | `{ override, affectedAppointmentCount }` | `404 VET_NOT_FOUND`; upstream `ZodError` -> `400 VALIDATION_ERROR` |
| `createBlockedPeriod(params: CreateBlockedPeriodParams)` | `{ blockedPeriod, affectedAppointmentCount }` | `400 INVALID_TIME_RANGE`, `400 REASON_TEXT_REQUIRED`, `409 BLOCKED_PERIOD_OVERLAP` |
| `removeBlockedPeriod(params: RemoveBlockedPeriodParams)` | `void` | `404 BLOCKED_PERIOD_NOT_FOUND` (cross-tenant id and nonexistent id are indistinguishable, both 404, never 403) |
| `listVets(clinicId)` | `Array<{ id, name }>` | none |

**`replaceWeeklyTemplate` return shape** (D-30, plans 08-11/08-13 must match exactly):
```ts
{ template: VetAvailabilityTemplate[], affectedAppointmentCount: number }
```
`affectedAppointmentCount` counts `SCHEDULED` appointments within the `BOOKING_HORIZON_DAYS` window whose `weekdayIST(scheduledFor)` maps to a day in the *new* template that is now closed, starts after, or ends before the appointment's `[scheduledFor, scheduledFor + durationMinutes)` window. A date with its own override is NOT re-validated here (D-01: override already wins for that date). Never blocks the write.

**`createBlockedPeriod` return shape** (D-30, plans 08-11/08-13 must match exactly):
```ts
{ blockedPeriod: BlockedPeriod, affectedAppointmentCount: number }
```
`affectedAppointmentCount` counts `SCHEDULED` appointments that date whose `[istMinutesOfDay(scheduledFor), istMinutesOfDay(scheduledFor) + durationMinutes)` overlaps the new block's `[startMinutes, endMinutes)`. Computed via `prisma.appointment.findMany` directly (never an injected appointment repository), after the create has already succeeded -- never blocks the write.

**`upsertDateOverride` return shape** (pre-existing pattern both of the above now mirror):
```ts
{ override: AvailabilityOverride, affectedAppointmentCount: number }
```
`affectedAppointmentCount` is a `prisma.appointment.count` scoped to `clinicId`, `vetId`, `status: 'SCHEDULED'`, and `istDayBounds(date)`.

**How clinic vets are queried** (plan 08-07/UI plans must reuse, not reinvent):
```ts
// AvailabilityRepository.listClinicVets(clinicId): Array<{ id: string; name: string }>
this.prisma.user.findMany({
  where: {
    clinicMemberships: {
      some: {
        clinicId,
        isActive: true,
        roles: { some: { role: { rolePermissions: { some: { permission: { code: 'EDIT_EMR' } } } } } },
      },
    },
  },
  orderBy: { id: 'asc' }, // vetColorForId indexes into this exact order
  select: { id: true, fullName: true },
})
```
`EDIT_EMR` is seeded (per `apps/api/prisma/seed.ts`) onto Admin (all permissions) and Clinician only -- never FrontDesk or InventoryManager -- which is the "can be booked as a treating vet" set in this codebase; there is no separate `VET` role name.

**`AuditEvent` values added** (all in `apps/api/src/lib/audit-log.ts`):
`APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_CHECKED_IN`, `APPOINTMENT_COMPLETED`, `APPOINTMENT_NO_SHOW`, `AVAILABILITY_UPDATED`, `BLOCKED_PERIOD_ADDED`, `BLOCKED_PERIOD_REMOVED`. Only 3 of the 9 are used by this plan (`AVAILABILITY_UPDATED`, `BLOCKED_PERIOD_ADDED`, `BLOCKED_PERIOD_REMOVED`); the six `APPOINTMENT_*` values are reserved for plan 08-07's `AppointmentService`.

## Decisions Made

See `key-decisions` in frontmatter. The most consequential for downstream plans:
1. **`getOfferableSlots` has zero appointment-repository dependency by design** -- plan 08-07 must inject `existing` from its own query, never call into `AvailabilityService` expecting it to know about appointments beyond blocked periods and template/override hours.
2. **`listClinicVets` filters on the `EDIT_EMR` permission, not a role name** -- there is no `VET` role in this codebase's seed data; "vet-capable" is operationalized as "has clinical-record edit access," which happens to be exactly Admin + Clinician.
3. **`createBlockedPeriod` deliberately skips the service-level Zod re-parse** that `replaceWeeklyTemplate`/`upsertDateOverride` both perform, specifically so its three custom domain-error codes (not a generic `ZodError`) reach the client -- the schema in `@breeyo/validators` still runs at the controller layer in plan 08-11 for defense in depth, but the service's own checks are what the behavior tests (and the UI's ability to distinguish `INVALID_TIME_RANGE` from `REASON_TEXT_REQUIRED` from `BLOCKED_PERIOD_OVERLAP`) actually depend on.

## Deviations from Plan

None. All three tasks were implemented exactly as the finalized plan (including the D-30 addendum to Task 3 and the narrowed `getOfferableSlots`-scoped acceptance criterion) specifies; every acceptance-criteria grep and the full `<verification>` block passed on the first implementation pass with no rework required.

## Issues Encountered

- One pre-existing, unrelated grep hit: `grep -rn "as AuditEvent" apps/api/src/` matches `apps/api/src/modules/whatsapp/__tests__/booking.service.test.ts:5` (`import type { AuditEvent as AuditEventType } from '../../../lib/audit-log.js';`), a type-import rename from Phase 7 (commit `8ea019e`), not a string cast (`'X' as AuditEvent`). This predates this plan and is outside its `apps/api/src/modules/scheduling/` scope, where the same grep returns nothing (Task 1's own acceptance criterion, confirmed clean). Flagging it here only so it isn't mistaken for a regression introduced by this plan.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Plan 08-07 (`AppointmentService`) can construct `AvailabilityService` for slot offering: it must query its own appointment repository for `existing` and pass that array into `getOfferableSlots` -- this seam is deliberate, not a gap.
- Plan 08-09 (queue handoff sweep) and plan 08-07's cancel/reschedule paths can call `AvailabilityService.resolveAvailabilityForDate`/`getOfferableSlots` freely; neither touches `QueueEntry` or `Appointment` tables directly.
- Plans 08-11 (routes) and 08-13 (mobile UI) must match `replaceWeeklyTemplate`'s `{ template, affectedAppointmentCount }`, `createBlockedPeriod`'s `{ blockedPeriod, affectedAppointmentCount }`, and `upsertDateOverride`'s `{ override, affectedAppointmentCount }` shapes exactly -- all three now carry the same warning-only count field.
- Plan 08-14 (`useClinicVets`) and plan 08-11's `listVetsHandler` can call `AvailabilityService.listVets(clinicId)` directly -- the `id`-sorted order vet colours depend on is already guaranteed by the repository.
- No blockers. Full suite green (1638/1638 non-skipped, non-todo tests passing, exact +31 delta from baseline), `tsc --noEmit` clean.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
