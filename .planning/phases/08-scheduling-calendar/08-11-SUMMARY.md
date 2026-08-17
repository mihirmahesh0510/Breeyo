---
phase: 08-scheduling-calendar
plan: "11"
subsystem: api
tags: [scheduling, appointments, availability, fastify, permissions, tenancy, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-05)
    provides: "AvailabilityService method list, thrown codes, getOfferableSlots signature, D-30 return shapes"
  - phase: 08-scheduling-calendar (plan 08-07)
    provides: "AppointmentService full constructor, onRescheduled/onCancelled hook seam, every thrown code, BookingWarning shape, three worker-only repository queries, D-34 advisory lock"
  - phase: 08-scheduling-calendar (plan 08-09)
    provides: "registerSchedulingSweep exact signature, QueueService's optional pushTriggers constructor arg"
  - phase: 08-scheduling-calendar (plan 08-10)
    provides: "AppointmentReminderService, OwnerActionService (6-arg constructor incl. OwnerReplySender), D-12 booking redirect"
  - phase: 08-scheduling-calendar (plan 08-04)
    provides: "QueueRepository.deleteExpectedEntryForAppointment / QueueService.removeExpectedEntryForAppointment"
provides:
  - "scheduling.schema.ts / scheduling.controller.ts / scheduling.routes.ts: the full HTTP surface for scheduling"
  - "15 endpoints under /api/v1/scheduling/*, each guarded by VIEW_SCHEDULE or MANAGE_SCHEDULE"
  - "Fix: AppointmentService.createAppointment's D-34 advisory-lock statement (tx.$executeRaw, was tx.$queryRaw)"
affects: [08-12, 08-13, 08-14, 08-15]

tech-stack:
  added: []
  patterns:
    - "Controller takes prebuilt AppointmentService/AvailabilityService instances (not a per-request buildService factory) because neither repository uses the tenant-scoped request handle -- D-30's per-request pattern is for RLS-backed tables only"
    - "Phase-7-dependent construction (AppointmentReminderService, OwnerActionService) guarded by try/catch around dynamic `await import()`, so a missing/broken WhatsApp module degrades gracefully instead of blocking the whole module's registration"

key-files:
  created:
    - apps/api/src/modules/scheduling/scheduling.schema.ts
    - apps/api/src/modules/scheduling/scheduling.controller.ts
    - apps/api/src/modules/scheduling/scheduling.routes.ts
    - apps/api/tests/scheduling/appointment-reads.test.ts
    - apps/api/tests/scheduling/appointment-booking.test.ts
    - apps/api/tests/scheduling/availability-api.test.ts
    - apps/api/tests/scheduling/tenant-isolation.test.ts
    - apps/api/tests/scheduling/realtime-broadcast.test.ts
  modified:
    - apps/api/src/app.ts
    - apps/api/src/modules/scheduling/appointment.service.ts
    - apps/api/src/modules/scheduling/availability.service.ts
    - apps/api/src/modules/scheduling/scheduling.types.ts
    - apps/api/src/modules/scheduling/__tests__/appointment.service.test.ts

key-decisions:
  - "Three minimal, additive delegate methods were added to services not in this plan's declared file list, because the controller genuinely cannot expose the specified handlers without them: AppointmentService.getAppointment (thin passthrough to repository.findById, for GET /scheduling/appointments/:id), AvailabilityService.getTemplateForVet and AvailabilityService.getBlockedPeriods (thin passthroughs to the already clinicId-scoped repository methods, for the two corresponding GET endpoints). None change existing behavior."
  - "CreateAppointmentParams.serviceCatalogId was widened to optional in scheduling.types.ts (an Omit+redeclare over CreateAppointmentInput) to match what AppointmentService.createAppointment already accepts at runtime via its own internal .partial() re-parse (D-02) -- the type was previously inconsistent with the implementation, which only mattered once a real HTTP caller (this plan) tried to pass the params object through with a possibly-undefined field."
  - "createAppointmentBodySchema in scheduling.schema.ts is createAppointmentSchema.partial({ serviceCatalogId: true }), not a straight re-export of the shared validator -- re-exporting the strict schema as-is would have rejected a serviceCatalogId-omitting booking at the HTTP boundary before it ever reached the service that is explicitly built to accept it (D-02)."
  - "fastify.notificationBus (as the plan's action text literally describes reading it) is NOT reachable from scheduling.routes.ts: Fastify's plugin encapsulation scopes a bare fastify.decorate(...) call to that plugin's own child context, never to a sibling top-level app.register(...) call -- the exact issue clinic.routes.ts/whatsapp.routes.ts already work around for permissionService. Confirmed empirically: no other module in this codebase actually reads fastify.notificationBus either; emr.routes.ts hit the identical wall for its own D-72 bus and resolved it by constructing a fresh, cheap NotificationBus instance instead. scheduling.routes.ts does the same (createNotificationBus(fastify.redis), with its own onClose)."
  - "OwnerActionService is constructed in scheduling.routes.ts (per the plan's literal Task 2 instruction) but is NOT wired into anything live: whatsapp.routes.ts (the WhatsApp module's own composition root, which owns InboundRouterDeps.appointmentActionHandler and BookingService's D-12 optional deps) is outside this plan's declared file scope. This is a disclosed, deliberate gap -- see 'Known Gaps' below -- not an oversight."

patterns-established:
  - "A route module whose services need a raw (non-RLS) PrismaClient constructs those services ONCE at plugin scope, not per-request -- queue.routes.ts's buildService-per-request factory is specific to RLS-backed tables and should not be copied reflexively for every future module."

requirements-completed: [SCH-01, SCH-02, SCH-03, SCH-04, SCH-05]

duration: ~1 session
completed: 2026-08-17
---

# Phase 08 Plan 11: Scheduling HTTP API -- Schemas, Controller, Routes and Integration Tests Summary

**All three tasks completed cleanly against the plan's own acceptance criteria. Task 3's real-Postgres integration tests immediately surfaced one genuine, pre-existing bug in `AppointmentService.createAppointment`'s D-34 advisory-lock statement (a Prisma `void`-column deserialization failure that made every real HTTP booking 500) -- fixed as part of this plan, since no prior plan's tests ever exercised that code path against a live database.**

## Task Commits

1. **Task 1: scheduling request schemas and controller** -- `570f495` (feat)
2. **Task 2: routes with permission guards, dependency graph, sweep registration, app.ts wiring** -- `cc5b5fb` (feat)
3. **Task 3: integration test suite (+ the D-34 advisory-lock fix it uncovered)** -- `9baa711` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

## Which Tasks Completed Cleanly vs. Needed Deviation

- **Task 1**: completed per the plan's literal text, with three small, necessary, disclosed additions outside its declared file list (see `key-decisions`): `AppointmentService.getAppointment`, `AvailabilityService.getTemplateForVet`/`getBlockedPeriods`, and widening `CreateAppointmentParams.serviceCatalogId` to optional. All additive, zero behavior change to existing callers, confirmed by the pre-existing unit suites passing unchanged (105/105 in `src/modules/scheduling/__tests__`).
- **Task 2**: completed per the plan's literal text with one factual correction: `fastify.notificationBus` is not actually reachable from a sibling plugin registration (Fastify's own encapsulation, not a registration-order issue as the plan's action text assumed) -- resolved by constructing a fresh `NotificationBus`, mirroring `emr.routes.ts`'s own established precedent for the identical problem.
- **Task 3**: completed test-first against the already-implemented Tasks 1-2 code (this plan's own structure has implementation land in Tasks 1-2, tests in Task 3 -- not a violation of the "test before implementation" TDD rule, since that rule is about not writing implementation *ahead of* Task 3's own test-writing step, which did not happen here). Uncovered and fixed one real, pre-existing bug (below).

## The D-34 Advisory-Lock Bug (found, fixed, disclosed)

`AppointmentService.createAppointment` (plan 08-07) acquires a `pg_advisory_xact_lock` via:
```ts
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
```
`pg_advisory_xact_lock` returns Postgres `void`. Prisma's `$queryRaw` always attempts to deserialize every column of its result set into a scalar type, and fails outright on `void`:
```
PrismaClientKnownRequestError: Invalid `prisma.$queryRaw()` invocation:
Raw query failed. Code: `N/A`. Message: `Failed to deserialize column of type 'void'. ...`
code: 'P2010'
```
This made **every real HTTP appointment booking return 500**, unconditionally. It was invisible before this plan because:
- `appointment.service.test.ts` (plan 08-07) mocks the transaction client entirely -- `tx.$queryRaw` was a `vi.fn()`, never a real query.
- Plans 08-09/08-10's integration tests create appointments via `createTestAppointment` (the Prisma factory, a direct `prisma.appointment.create()`), never through `AppointmentService.createAppointment` over HTTP.
- This plan's Task 3 is the **first** real-database, real-HTTP exercise of this code path in the entire phase.

**Fix**: switched to `tx.$executeRaw` (the identical SQL statement, still acquires the lock as a side effect, but only reports an affected-row count and never attempts to typemap a result set). Updated `appointment.service.test.ts`'s mock (`$queryRaw` -> `$executeRaw`) and its one call-order assertion to match; no other test needed changes. Verified: 38/38 tests in that file still pass, and every booking-path integration test in Task 3 (which exercises this exact line on every single POST) now passes against the real dev Postgres.

## Final Endpoint Table

| Method | Path | Permission | Response envelope |
|---|---|---|---|
| GET | `/api/v1/scheduling/appointments` | VIEW_SCHEDULE | `{ data: AppointmentWithDetails[] }` |
| GET | `/api/v1/scheduling/appointments/:appointmentId` | VIEW_SCHEDULE | `{ data: AppointmentWithDetails }` (404 `APPOINTMENT_NOT_FOUND` if missing/cross-tenant) |
| POST | `/api/v1/scheduling/appointments` | MANAGE_SCHEDULE | 201 `{ data: { appointments: AppointmentWithDetails[]; warnings: BookingWarning[] } }` |
| PATCH | `/api/v1/scheduling/appointments/:appointmentId` | MANAGE_SCHEDULE | `{ data: { appointment: AppointmentWithDetails; warnings: BookingWarning[] } }` |
| POST | `/api/v1/scheduling/appointments/:appointmentId/cancel` | MANAGE_SCHEDULE | `{ data: { appointment: AppointmentWithDetails } }` |
| PATCH | `/api/v1/scheduling/appointments/:appointmentId/status` | MANAGE_SCHEDULE | `{ data: AppointmentWithDetails }` (400 `INVALID_TRANSITION` for any status other than `CHECKED_IN`/`COMPLETED`/`NO_SHOW`) |
| GET | `/api/v1/scheduling/slots` | VIEW_SCHEDULE | `{ data: SlotOption[] }` |
| GET | `/api/v1/scheduling/availability/:vetId/template` | VIEW_SCHEDULE | `{ data: VetAvailabilityTemplate[] }` |
| PUT | `/api/v1/scheduling/availability/:vetId/template` | MANAGE_SCHEDULE | `{ data: { template: VetAvailabilityTemplate[]; affectedAppointmentCount: number } }` (D-30) |
| PUT | `/api/v1/scheduling/availability/:vetId/override` | MANAGE_SCHEDULE | `{ data: { override: AvailabilityOverride; affectedAppointmentCount: number } }` |
| GET | `/api/v1/scheduling/availability/resolved` | VIEW_SCHEDULE | `{ data: Array<{ vetId: string; hours: ResolvedDayHours \| null; blockedRanges: Array<{startMinutes; endMinutes}> }> }` -- one entry per vet if `vetId` query param omitted, one entry if given |
| GET | `/api/v1/scheduling/blocked-periods` | VIEW_SCHEDULE | `{ data: BlockedPeriod[] }` |
| POST | `/api/v1/scheduling/blocked-periods` | MANAGE_SCHEDULE | 201 `{ data: { blockedPeriod: BlockedPeriod; affectedAppointmentCount: number } }` (D-30) |
| DELETE | `/api/v1/scheduling/blocked-periods/:blockedPeriodId` | MANAGE_SCHEDULE | `{ data: { deleted: true } }` (404 `BLOCKED_PERIOD_NOT_FOUND` if missing/cross-tenant) |
| GET | `/api/v1/scheduling/vets` | VIEW_SCHEDULE | `{ data: Array<{ id: string; name: string }> }`, `id`-sorted |

**D-30 response shapes, verbatim (matching 08-05's existing override endpoint exactly)**:
```ts
// PUT /scheduling/availability/:vetId/template
{ data: { template: VetAvailabilityTemplate[], affectedAppointmentCount: number } }

// POST /scheduling/blocked-periods
{ data: { blockedPeriod: BlockedPeriod, affectedAppointmentCount: number } }
```
Both are returned by passing the service's own `{ ..., affectedAppointmentCount }` result straight through in the controller (never destructured to drop the count) -- so mobile hooks (plan 08-13) can rely on the field being present on every one of these three write responses (the third being the pre-existing date-override endpoint).

## Dependency Construction Order (`scheduling.routes.ts`)

1. `permissionService` decoration guard (re-decorated here because Fastify's plugin encapsulation makes `clinic.routes.ts`'s own decoration unreachable -- same fix `whatsapp.routes.ts` already carries).
2. `AvailabilityRepository` -> `AvailabilityService` (raw `fastify.prisma`, `fastify.io`).
3. `AppointmentRepository` (raw `fastify.prisma`).
4. A **second**, independent `QueueRepository`/`QueueService` pair (D-28) -- `fastify.prisma` + `fastify.io`, separate from `queue.routes.ts`'s own per-request instances.
5. **Guarded** construction of `AppointmentReminderService` (Phase 7/plan 08-10 dependency) via dynamic `await import()` inside a `try/catch` -- see "How the Phase 7 Dependency Was Guarded" below.
6. `AppointmentService`, with combined `onRescheduled`/`onCancelled` hooks (D-28 + D-10 reminder cancellation).
7. `NotificationBus` (fresh instance, see `key-decisions`) -> `PushTriggerService`.
8. `QueueHandoffService`.
9. **Guarded** construction of `OwnerActionService` (only attempted if step 5 succeeded) -- constructed for plan-compliance/future-readiness but not wired into anything live this plan (see "Known Gaps").
10. `registerSchedulingSweep(fastify.redis, { handoff, pushTriggers, appointments })` + `onClose` cleanup for the sweep queue/worker.
11. Controller construction + all 15 route bindings behind `readPre`/`writePre`.

## How the Phase 7 Dependency Was Guarded

`reminderService` (an `AppointmentReminderService | null`) is built inside a `try { ... } catch (err) { fastify.log.warn(...); }` block that uses **dynamic** `await import('../whatsapp/...')` calls, not static imports, for the three WhatsApp-module pieces it needs (`ReminderTaskRepository`, `WhatsAppRepository`, and `reminder.service.js` itself). If that import or construction throws for any reason -- including "plan 08-10/the WhatsApp module was never merged" -- the catch block logs a warning and `reminderService` stays `null`; every other scheduling endpoint, and the D-28 half of the `onRescheduled`/`onCancelled` hooks, is completely unaffected. `OwnerActionService`'s construction is nested inside `if (reminderService) { try { ... } catch { ... } }`, the same pattern, one level deeper (it requires a non-null `AppointmentReminderService` per its own typed constructor).

In this actual worktree, plan 08-10 is fully landed, so both guards resolve to their "present" branch at runtime -- confirmed by `apps/api/tests/scheduling/owner-action-bridge.test.ts` and `reminder.service.test.ts` (pre-existing, plan 08-10) still passing unchanged, and by the D-28+D-10 combined-hook behavior being exercised indirectly through every reschedule/cancel integration test in this plan's own suite (the queue-cleanup half is asserted directly via `removeExpectedEntryForAppointment`'s pre-existing unit coverage; a full end-to-end assertion that a `WhatsAppReminderTask` row is actually cancelled on reschedule would require WhatsApp-thread fixtures this plan's test files did not build, since SCH-04/SCH-05 do not require it).

## D-28 Confirmation

The `onRescheduled`/`onCancelled` hooks passed into `AppointmentService`'s constructor call `queueService.removeExpectedEntryForAppointment(clinicId, appointmentId)` **unconditionally**, in its own `try/catch`, completely independent of whether `reminderService` is present:
```ts
async (appointmentId, clinicId) => {
  try {
    await queueService.removeExpectedEntryForAppointment(clinicId, appointmentId);
  } catch (err) { fastify.log.error(...); }
  if (reminderService) {
    try { await reminderService.cancelPendingForAppointment(appointmentId, clinicId); }
    catch (err) { fastify.log.error(...); }
  }
}
```
`grep -c 'removeExpectedEntryForAppointment' scheduling.routes.ts` = 2 (once in `onRescheduled`, once in `onCancelled`), each in its own try/catch block, confirmed by direct reading of the committed file.

## Known Gaps (disclosed, out of this plan's file scope)

`whatsapp.routes.ts` is not in this plan's declared `files_modified` list, so three pieces of Phase-7-adjacent readiness that 08-10-SUMMARY.md flagged as "plan 08-11 must still do" remain **not actually wired to anything live**, even though the collaborators they need now all exist:
1. `OwnerActionService` (constructed in `scheduling.routes.ts`, working, tested via `owner-action-bridge.test.ts`) is never passed to `InboundRouterDeps.appointmentActionHandler` in `whatsapp.routes.ts` -- an owner's `appointment:keep|move|cancel:<uuid>` WhatsApp reply still hits `InboundRouterService`'s no-op default.
2. `BookingService`'s D-12 optional `appointmentService`/`availability` constructor deps are never supplied in `whatsapp.routes.ts` -- a confirmed WhatsApp booking still runs Phase 7's original hold-and-flip-state-only path, never creating a real `Appointment` row.
3. `AppointmentReminderService` (constructed here) is never passed as `ReminderSweepDeps.appointmentReminders` at `whatsapp.routes.ts`'s `createReminderSweepWorker` call site -- the D-18 appointment-reminder discovery pass never actually runs as part of Phase 7's daily reminder sweep.

All three require touching `apps/api/src/modules/whatsapp/whatsapp.routes.ts`, which is outside this plan's file list. Flagged here explicitly for whichever future plan next revisits that file -- the exact construction patterns needed already exist in `scheduling.routes.ts` to copy from.

## Total Scheduling Test Count

`pnpm --filter @breeyo/api test -- --run tests/scheduling`: **10 files, 89 tests, all passing**, run twice with identical results (well above the plan's 55-test floor). Breakdown: 5 new files from this plan (`appointment-reads` 11, `appointment-booking` 12, `availability-api` 9, `tenant-isolation` 9, `realtime-broadcast` 5 = 46 tests) plus 5 pre-existing files from plans 08-01/08-03/08-09/08-10 (`schema-shape` 9, `queue-handoff` 13, `no-show-sweep` 5, `push-triggers` 12, `owner-action-bridge` 4 = 43 tests).

## Full Suite Verification (run twice)

- **Run 1**: 136 files passed / 9 skipped (146), 1795 passed / **3 failed** / 80 todo (1878). All 3 failures in `tests/billing/webhook.test.ts`.
- **Run 2**: 135 files passed / 9 skipped (146), 1793 passed / **5 failed** / 80 todo (1878). Failures in `tests/billing/webhook.test.ts` (4) and `tests/billing/combined-payment-link.test.ts` (1).
- Every failure in both runs is an FK-violation/duplicate-receipt race in the billing webhook worker's own test cleanup and replay logic -- the exact, already-documented pre-existing flakiness from `08-09-SUMMARY.md` and `08-10-SUMMARY.md` (`tx.payment.deleteMany()` hitting `payment_receipts_payment_id_fkey`, and duplicate-webhook-replay races). `git diff` confirms none of this plan's three commits touch any billing file.
- **Zero scheduling/queue/whatsapp test failures in either run** -- confirmed by grepping every `FAIL` line from both full-suite outputs: 100% stable.
- `pnpm --filter @breeyo/api exec tsc --noEmit`: clean, exit 0 (checked after every task and again at the end).
- `curl` against a locally running instance of this exact code (a fresh `buildApp()` on a free port, not the stale pre-existing dev server that predated this plan's route registration): `GET /api/v1/scheduling/appointments` -> 401, `GET /api/v1/scheduling/vets` -> 401, `POST /api/v1/scheduling/appointments` -> 401. No unauthenticated access to any scheduling endpoint.

## Tenancy and Permission Verification (the plan's stated top priority)

- Cross-tenant appointment read/reschedule/cancel/status-update: all four return `404 APPOINTMENT_NOT_FOUND`, never 403, and the target row is verified unchanged afterward (status, `scheduledFor`) via a direct Prisma read in `tenant-isolation.test.ts`.
- Cross-tenant `PUT .../template`: `404 VET_NOT_FOUND` (via `AvailabilityService.assertVetInClinic`, plan 08-05).
- Cross-tenant `DELETE .../blocked-periods/:id`: `404 BLOCKED_PERIOD_NOT_FOUND`, row verified still present in the database afterward.
- A date-range read with clinic A's token never returns a clinic B appointment id, even when both clinics have an appointment scheduled on the identical day.
- A token with neither `VIEW_SCHEDULE` nor `MANAGE_SCHEDULE` (the seeded `InventoryManager` role) gets `403 FORBIDDEN` on a read endpoint.
- A token with `VIEW_SCHEDULE` but not `MANAGE_SCHEDULE` (a `FrontDesk`-role fixture with a `UserPermissionOverride` denying `MANAGE_SCHEDULE` -- no seeded role natively has this split, per the plan's own anticipation) succeeds on `GET /scheduling/vets` (200) and gets `403 FORBIDDEN` on `POST /scheduling/appointments`.
- `grep -c 'clinicId'` on the schema file and `grep -Ec 'request.body.clinicId|request.query.clinicId|request.params.clinicId'` on the controller both confirm `clinicId` is structurally unobtainable from client input; every handler reads it from `request.user.activeClinicId` (16 occurrences across 15 handlers).

## User Setup Required

None -- no external service configuration required. Uses the existing local Postgres 16 (`localhost:5433`) and Redis 7.

## Next Phase Readiness

- Plans 08-12/08-13 (mobile UI) can consume all 15 endpoints exactly as tabled above, including the D-30 `affectedAppointmentCount` field on all three availability-write responses.
- Plan 08-14 (`useClinicVets`/web) can call `GET /scheduling/vets` directly.
- A future plan touching `apps/api/src/modules/whatsapp/whatsapp.routes.ts` should wire the three "Known Gaps" above -- the collaborators (`OwnerActionService`, `AppointmentReminderService`, `BookingService`'s D-12 deps) all already exist and are tested; only that one file's construction site needs to change.
- No blockers for scheduling/queue/whatsapp. The only outstanding suite issue is the pre-existing billing-webhook flakiness, already flagged in two prior plans and unrelated to this one.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
