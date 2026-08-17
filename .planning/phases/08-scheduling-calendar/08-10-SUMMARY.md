---
phase: 08-scheduling-calendar
plan: "10"
subsystem: api
tags: [whatsapp, scheduling, reminders, owner-actions, security, tdd]

requires:
  - phase: 07-whatsapp-communication
    provides: "InboundRouterService, WhatsAppReminderTask/ReminderTaskRepository/ReminderTaskService, the daily reminder sweep (reminder-sweep.job.ts), template-registry.ts, BookingService/SlotService/WhatsAppBookingRequest/WhatsAppSlotHold, WA_BUTTON_PAYLOAD_PATTERN"
  - phase: 08-scheduling-calendar (plan 08-07)
    provides: "AppointmentService (createAppointment/cancelAppointment/rescheduleAppointment), AppointmentRepository, onRescheduled/onCancelled hooks"
  - phase: 08-scheduling-calendar (plan 08-09)
    provides: "PushTriggerService.notifyOwnerAction"
provides:
  - "WaReminderKind.APPOINTMENT_REMINDER and the appointment_reminder template in Phase 7's template-registry.ts"
  - "AppointmentReminderService (reminder.service.ts): discoverAppointmentReminders, cancelPendingForAppointment"
  - "OwnerActionService (owner-action.service.ts): handleOwnerAction, createAppointmentActionHandler adapter"
  - "InboundRouterService AppointmentActionHandler seam + appointment:keep|move|cancel: dispatch"
  - "BookingService.confirmSlot D-12 real-appointment redirect (optional appointmentService/availability deps)"
affects: [08-11, 08-15]

tech-stack:
  added: []
  patterns:
    - "AppointmentReminderService.discoverAppointmentReminders(now) is cross-clinic (no clinicId param), matching AppointmentRepository's three worker-only sweep queries' convention, NOT Phase 7's own per-clinic ReminderSourceRepository convention -- it is called once per sweep run, not once per clinic"
    - "OwnerReplySender is an additive seam (not in the plan's literal 5-arg OwnerActionService constructor) so KEEP/MOVE/CANCEL can all close the loop with the owner through one send mechanism"
    - "BookingService's D-12 redirect runs AppointmentService.createAppointment BEFORE any Phase 7 state change (sequential, not nested, since createAppointment owns its own $transaction) so an availability failure leaves zero Phase 7 state changed"

key-files:
  created:
    - apps/api/prisma/migrations/20260816000000_add_appointment_reminder_kind/migration.sql
    - apps/api/src/modules/scheduling/reminder.service.ts
    - apps/api/src/modules/scheduling/owner-action.service.ts
    - apps/api/src/modules/scheduling/__tests__/reminder.service.test.ts
    - apps/api/src/modules/scheduling/__tests__/owner-action.service.test.ts
    - apps/api/tests/scheduling/owner-action-bridge.test.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/src/modules/whatsapp/template-registry.ts
    - apps/api/src/modules/whatsapp/providers/simulator/simulator-reply.ts
    - apps/api/src/modules/whatsapp/inbound-router.service.ts
    - apps/api/src/modules/whatsapp/reminders/reminder-sweep.job.ts
    - apps/api/src/modules/whatsapp/booking/booking.service.ts
    - apps/api/src/modules/scheduling/appointment.repository.ts
    - apps/api/src/modules/scheduling/appointment.service.ts
    - apps/api/src/modules/scheduling/scheduling.types.ts
    - apps/api/src/lib/audit-log.ts
    - packages/types/src/whatsapp.ts
    - packages/types/src/constants/whatsapp.constants.ts
    - packages/validators/src/whatsapp.ts
    - several existing Phase 7 test files updated for the 4th/7th enum-key additions (see Deviations)

key-decisions:
  - "D-18 cadence computed independently of WA_REMINDER_LEAD_DAYS: AppointmentReminderService computes ADVANCE=today+1, ON_DATE=today directly, rather than adding an entry Phase 7's per-kind lead-time map would have to special-case; WA_REMINDER_LEAD_DAYS.APPOINTMENT_REMINDER=1 was still added (unused by this service) only so upsertTasksForSource's WaReminderKind-indexed lookup stays type-exhaustive"
  - "No escalation for appointment reminders (RESEARCH A5/Open Question 1): deliberate, commented in reminder.service.ts's file header"
  - "Consent check applied at discovery time (skip creating the task), not at send time (create-then-cancel-on-OWNER_OPTED_OUT like Phase 7's other three kinds) -- reuses the same WhatsAppRepository.getOwnerPreference query, just at a different point in the pipeline"
  - "D-21 multi-pet appointments: WhatsAppReminderTask.petId is a single required column; the reminder uses the appointment's FIRST pet only"
  - "Owner recorded as the cancelling actor: cancelAppointment's userId/cancelledById is the appointment's own createdById (a real User); the real owner id is recorded in the cancelReason text ('Owner cancelled via WhatsApp (ownerId: <uuid>)'), not in audit metadata -- CancelAppointmentParams/writeAuditLog's metadata shape inside appointment.service.ts has no slot for extra fields, and editing that shape was out of this plan's task scope"
  - "D-12 vet resolution: Phase 7's WhatsApp booking flow has NO vetId concept anywhere (WhatsAppBookingRequest, SlotService, Clinic.workingHours are all vet-agnostic) -- confirmSlot resolves AvailabilityService.listVets(clinicId)[0] (the same id-sorted vet list plan 08-05's UI depends on) as the appointment's vet AND as createdById/userId (no staff actor exists for an owner-confirmed booking)"
  - "MOVE relies entirely on PushTriggerService.notifyOwnerAction for the staff Notification row (it already emits type: MOVE_REQUEST, module: SCHEDULING, data.appointmentId through the existing NotificationBus/worker pipeline) -- OwnerActionService does NOT also write a Notification row directly, to avoid a duplicate row once the queued job is processed"

patterns-established:
  - "AppointmentActionHandler (inbound-router.service.ts) + createAppointmentActionHandler (owner-action.service.ts) mirrors BookingInboundHandler/ReminderReplyHandler's exact no-op-default-plus-factory convention"
  - "BookingServiceDeps.appointmentService/availability are optional so Phase 7's own pre-Phase-8 unit tests (booking.service.test.ts) are unaffected by the D-12 capability"

requirements-completed: [SCH-05]

duration: ~1 session
completed: 2026-08-17
---

# Phase 08 Plan 10: WhatsApp Scheduling Formalization (Reminders, Owner Actions, D-12 Booking) Summary

**Formalized Phase 7's WhatsApp stopgaps into real appointments: a fourth `WaReminderKind` riding Phase 7's existing reminder pipeline, an owner KEEP/MOVE/CANCEL bridge with server-authoritative ownership checks and D-33 acknowledgements, and a real-`Appointment` redirect for confirmed WhatsApp bookings.**

## Gate Outcome (Task 1)

**Passed, not blocked.** `apps/api/src/modules/whatsapp/` exists with a real `InboundRouterService`; `WhatsAppReminderTask`/`WaReminderKind` are in `schema.prisma` (`WaReminderKind` at line 1299 pre-plan, `WhatsAppReminderTask` at line 1442). All six gate-check commands resolved. The plan's cross-phase dependency (Phase 7 merged before Phase 8's plan 08-10 executes) held as ROADMAP.md expected.

### Actual shipped shapes vs. RESEARCH Pattern 5's assumptions

| Item | RESEARCH assumed | Actually shipped |
|---|---|---|
| `WhatsAppReminderTask` fields | (reconstructed) | `id, clinicId, ownerId, petId, kind, touch, sourceType, sourceId, sourceLabel, dueDate, scheduledFor, state, attemptCount, lastAttemptAt, nextAttemptAt, repliedAt, cappedAt, cappedReason, acknowledgedAt, createdAt, updatedAt` |
| `@@unique` key | assumed to include `kind`+touch discriminator | `@@unique([clinicId, sourceType, sourceId, kind, touch])` — confirmed, a 4th kind is safe |
| `InboundRouterService` entry point | — | `route(event: WaInboundEvent, clinicId: string, channel: WaChannelDb = 'CLOUD_API'): Promise<void>` |
| `WhatsAppBookingRequest.supersededByAppointmentId` | assumed present as "Phase 8 hook" | Present (`String? @map("superseded_by_appointment_id")`), used by Task 3's D-12 redirect |
| Discovery source registration point | assumed an extension-point registry | **No extension point exists** — Phase 7's `processClinic` hardcodes its three `sourceRepo.find*Due` calls inline. Task 2 added a call directly to `runReminderSweep` instead (see below) |
| Consent check at discovery time | assumed reusable as-is | Phase 7's OWN reminder kinds do NOT skip task creation for an opted-out owner at discovery time — they create the task and only cancel it at SEND time (`reminder-sweep.job.ts`'s `sendReminder` catches `OWNER_OPTED_OUT`). This plan's service instead calls the same `WhatsAppRepository.getOwnerPreference` query but skips task creation entirely at discovery time — a legitimate reuse of the underlying rule, applied at a different point, and explicitly what the plan's own behavior spec required ("an appointment for a STOP-opted-out owner produces no task") |
| Booking flow has a `vetId` | implied by "real per-vet availability" (D-12) | **Phase 7's WhatsApp booking flow has NO vet concept at all** — `WhatsAppBookingRequest`, `SlotService`, and `Clinic.workingHours` are entirely vet-agnostic. See Task 3's D-12 section below |
| `appointment:keep\|move\|cancel:<uuid>` payload namespace | "already reserved" per 07-RESEARCH | The payload namespace was reserved only in *prose* (07-RESEARCH.md, a 07-09 test title) — `WA_BUTTON_PAYLOAD_PATTERN`'s actual regex had NO entry for it. Task 3 added it |

Migration timestamp: the plan's literal `20260813140000_add_appointment_reminder_kind` directory name sorts BEFORE `20260815000000_add_whatsapp_communication` (the migration that actually creates the `WaReminderKind` Postgres type) — confirmed by running `prisma migrate deploy` against a disposable database and getting `type "WaReminderKind" does not exist`. Renamed to **`20260816000000_add_appointment_reminder_kind`**, after every migration on disk at execution time.

### Migration parity verification

Per plan 08-03's established technique (`08-03-SUMMARY.md` § Migration Parity Verification), `prisma migrate reset --force` against the shared dev DB is blocked by the Prisma CLI's AI-agent safety guard, and diffing the live dev DB after `post-migrate.sql` reproduces a known false positive from four `pg_trgm` GIN indexes `schema.prisma` deliberately does not model. Used a disposable database pair instead:

1. `breeyo_p810_verify` / `breeyo_p810_verify_shadow` created via `docker exec breeyo-postgres-1 psql`.
2. `DATABASE_URL=<disposable> pnpm exec prisma migrate deploy` — all 10 migrations (including the renamed `20260816000000_add_appointment_reminder_kind`) applied cleanly.
3. `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <disposable-shadow> --exit-code` → **`No difference detected.`, exit 0.**
4. Both disposable databases dropped immediately after.

For completeness, the plan's own literal verification command (`prisma migrate diff --from-schema-datasource "$DATABASE_URL" ...`) was also attempted; `--from-schema-datasource` actually takes a *path to a schema file*, not a raw connection string (confirmed via `prisma migrate diff --help`) — the corrected equivalent is `--from-url`. Run against the LIVE shared dev DB, it reproduced the exact same pre-existing pg_trgm-index false positive documented in `06-03-SUMMARY.md`/`08-03-SUMMARY.md` (`inventory_items`/`pet_owners`/`pets` name/mobile trigram indexes), unrelated to this plan. The disposable-DB result above is the authoritative parity check.

The shared dev DB itself: `WaReminderKind` enum now has all four values (`FOLLOW_UP, VACCINE_DUE, DEWORMING_DUE, APPOINTMENT_REMINDER`), applied via a direct `ALTER TYPE` and recorded via `prisma migrate resolve --applied` — never reset.

### Template

`appointment_reminder` added to `apps/api/src/modules/whatsapp/template-registry.ts`'s `WA_TEMPLATES`/`WA_REMINDER_KIND_TO_TEMPLATE` (category `REMINDER`, same STOP-opt-out gate as every other reminder template via `SendAuthorizationService`). Variables (`packages/validators/src/whatsapp.ts`): `owner_name, pet_name, appointment_date, appointment_time, touch`. The ADVANCE-touch copy invites a KEEP/MOVE/CANCEL reply; the ON_DATE-touch copy is a plain same-day nudge with no invitation (no escalation, no re-ask). No `buttons` array is declared on this template — wiring Meta interactive-button ids dynamically per appointment into the frozen template registry was out of scope (the `appointment:keep|move|cancel:<uuid>` payload namespace is reachable by any caller that produces it, including 08-15's manual QA simulation, once a real Cloud API button or a future interactive-list implementation exists).

## Task 2: Reminder Producer

`AppointmentReminderService` (`apps/api/src/modules/scheduling/reminder.service.ts`):
- `discoverAppointmentReminders(now: Date)` — **no `clinicId` parameter**: computes `ADVANCE = today+1`, `ON_DATE = today` (IST), loads `SCHEDULED` appointments in each day's bounds via a new `AppointmentRepository.findRemindableAppointments(fromDate, toDate)` (worker-only convention, cross-clinic, alongside `findDueForQueueHandoff`/`findExpiredExpected`/`findStartingSoon`), skips STOP-opted-out owners via `WhatsAppRepository.getOwnerPreference`, and upserts one `WhatsAppReminderTask` per appointment per touch directly through Phase 7's `ReminderTaskRepository` (its `findByKey`+`create` pair is the same idempotency mechanism Phase 7's own `upsertTasksForSource` uses).
- `cancelPendingForAppointment(appointmentId, clinicId)` — delegates to `ReminderTaskRepository.cancelActive(clinicId, 'APPOINTMENT', appointmentId)`, Phase 7's own superseded-source pattern. **Note:** the plan's illustrative hook wiring text (`(appointmentId) => reminderService.cancelPendingForAppointment(appointmentId)`) omits `clinicId`, but the repository method (and every other method in that file) requires it — the real signature takes both, matching `AppointmentService`'s actual `onRescheduled`/`onCancelled` hook shape `(appointmentId: string, clinicId: string) => Promise<void>` from `08-07-SUMMARY.md`.

**No escalation**: deliberate (RESEARCH § Assumptions Log A5, § Open Questions 1) — an appointment reminder never resends and never caps to `CAPPED_NEEDS_ACTION`. Documented in the file header and inline comments; `grep -v '//' reminder.service.ts | grep -Eic 'escalat|needsAction'` → `0`.

**Discovery source registration**: Phase 7 has no discovery-source extension point — `reminder-sweep.job.ts`'s `processClinic` hardcodes its three `sourceRepo.find*Due` calls inline, inside a per-clinic loop. Added a new optional `ReminderSweepDeps.appointmentReminders` dependency and called it **once, after the per-clinic loop, inside `runReminderSweep`** (not inside `processClinic`) — because `discoverAppointmentReminders` is deliberately cross-clinic (matching the worker-query convention above), not per-clinic like Phase 7's own `ReminderSourceRepository` methods. File/line: `apps/api/src/modules/whatsapp/reminders/reminder-sweep.job.ts`, the block immediately following the `for (const clinic of clinics)` loop in `runReminderSweep`. The dependency is optional and Phase 7's own `reminder-sweep.test.ts` (constructed without it) is unaffected.

**What plan 08-11 must still do**: construct the real `AppointmentReminderService` instance and pass it as `ReminderSweepDeps.appointmentReminders` at the actual production sweep-worker construction site (wherever `whatsapp.routes.ts`/app boot builds the sweep deps), AND wire `AppointmentService`'s `onRescheduled`/`onCancelled` hooks to `(appointmentId, clinicId) => appointmentReminderService.cancelPendingForAppointment(appointmentId, clinicId)` at `AppointmentService` construction time. Neither wiring exists yet — both are deferred exactly as the plan specifies ("plan 08-11's routes plugin", "construction time").

11/11 new tests passing (`reminder.service.test.ts`).

## Task 3: Owner-Action Bridge + D-12

### `OwnerActionService` constructor

```ts
export class OwnerActionService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly appointmentService: AppointmentService,
    private readonly reminders: AppointmentReminderService,
    private readonly pushTriggers: PushTriggerService,
    private readonly prisma: PrismaClient,
    private readonly ownerReplySender: OwnerReplySender,
  ) {}
}
```

**Deviation from the plan's literal 5-argument constructor**: the plan's illustrative signature has no WhatsApp-send capability at all, but D-33 requires every action (KEEP/MOVE/CANCEL) to close the loop with an owner-facing WhatsApp reply. Added a 6th parameter, `ownerReplySender: OwnerReplySender` (`{ send(clinicId, ownerId, body): Promise<void> }`). Production wiring (plan 08-11) should supply an adapter over Phase 7's existing send path — the exact mechanism `booking-inbound.handler.ts`'s `sendText` already uses (`WhatsAppRepository.createOutboundMessage` + `touchThread` + the `whatsapp-outbound` queue) — not a second one.

`handleOwnerAction(params: { clinicId, threadOwnerId, action, appointmentId }): Promise<OwnerActionResult>` where `OwnerActionResult = { ok: boolean; applied?: string; reason?: 'NOT_ACTIONABLE' }`.

### Security (T-08-46, T-08-47)

`clinicId`/`threadOwnerId` are read ONLY from `params` (which `InboundRouterService`/`createAppointmentActionHandler` populate ONLY from the resolved thread's `ctx.clinicId`/`ctx.ownerId`) — never from the payload. Grep-gated in the file itself: `grep -Ec 'params.payload.clinicId|body.clinicId|payload.ownerId'` → `0`. Ownership check: `appointment.ownerId !== params.threadOwnerId` after `appointments.findById(params.clinicId, params.appointmentId)` (clinic-scoped at the repository level, so a cross-clinic id and a nonexistent id both resolve to `null`). Every failure path returns the identical `{ ok: false, reason: 'NOT_ACTIONABLE' }` and is audited via a new `AuditEvent.WHATSAPP_OWNER_ACTION_REFUSED` entry (`clinicId`, `metadata: { threadOwnerId, appointmentId }`) — no distinguishing error is ever thrown or logged differently.

### KEEP / MOVE / CANCEL / D-33 copy (exact strings used)

| Action/outcome | Copy |
|---|---|
| KEEP | `Thanks for confirming! We'll see {petNames} at the scheduled time.` |
| CANCEL (success) | `Your appointment for {petNames} on {date} has been cancelled.` |
| MOVE (acknowledgement) | `We've received your request to move this appointment. Our team will follow up shortly with a new time.` |
| CANCEL, appointment CHECKED_IN or COMPLETED (D-33) | `This visit has already started. Please call the clinic directly for any changes.` |
| CANCEL, appointment already CANCELLED/NO_SHOW (neutral, pre-D-33) | `This appointment has already been resolved and cannot be changed here.` |

CANCEL: branches on the already-loaded `appointment.status` (from the same `findById` call used for ownership resolution — no second query) BEFORE calling `cancelAppointment` when status is `CHECKED_IN`/`COMPLETED`. Otherwise calls `appointmentService.cancelAppointment({ clinicId, userId: appointment.createdById, appointmentId, scope: 'ONE', reason: 'Owner cancelled via WhatsApp (ownerId: <uuid>)' })`; an `INVALID_TRANSITION` (already `CANCELLED`/`NO_SHOW`) is caught and gets the neutral reply. On success: `reminders.cancelPendingForAppointment`, `pushTriggers.notifyOwnerAction(..., 'CANCEL')`, then the CANCEL confirmation reply.

**Owner recorded as the cancelling actor**: `CancelAppointmentParams.userId` (used for `cancelledById`, a `User` FK) is the appointment's own `createdById` — an owner has no `User` row. The real owner id is recorded in the `cancelReason` text instead of audit `metadata`, since `AppointmentService.cancelAppointment`'s audit-log call (`{ appointmentId, scope, cancelledIds }`) has no extra-metadata slot and widening it was out of this plan's file scope (`appointment.service.ts`'s audit call site was not otherwise touched).

MOVE: never calls `rescheduleAppointment`/`cancelAppointment` (grep-gated: `awk "/'MOVE'/,/break|return/" ... | grep -Ec 'rescheduleAppointment|cancelAppointment'` → `0`). Calls only `pushTriggers.notifyOwnerAction(clinicId, appointment, 'MOVE')` — which already emits a `MOVE_REQUEST`-typed `NotificationEvent` (`module: SCHEDULING`, `data.appointmentId`) through the existing `NotificationBus`/`notification.worker.ts` pipeline, landing on the existing `Notification` model/`NotificationList` surface. `OwnerActionService` does **not** additionally write a `Notification` row directly — doing so would double the row once the queued job is processed; the plan's action-text phrase "create a Notification row directly" is satisfied by delegating to the one existing mechanism that already does this, not by adding a second write path.

### Inbound router wiring

`inbound-router.service.ts` gained an `AppointmentActionHandler` interface (`handleAction(ctx, action, appointmentId): Promise<void>`) with a no-op default, matching `BookingInboundHandler`/`ReminderReplyHandler`'s exact convention, plus three explicit `payload.startsWith('appointment:keep:'|'move:'|'cancel:')` branches in `dispatchPayload` (checked via `grep -Ec 'appointment:keep|appointment:move|appointment:cancel'` → `9`). `owner-action.service.ts` exports `createAppointmentActionHandler({ ownerActionService })`, mirroring `reminder-task.service.ts`'s `createReminderReplyHandler` factory precedent — plan 08-11 constructs the real `OwnerActionService` and passes `createAppointmentActionHandler({ ownerActionService })` into `InboundRouterDeps.appointmentActionHandler`.

`packages/types/src/constants/whatsapp.constants.ts`'s `WA_BUTTON_PAYLOAD_PATTERN` was extended with `appointment:(?:keep|move|cancel):<uuid>` (previously absent despite RESEARCH's claim it was "already reserved" — see Task 1's Reality Check table above).

### D-12: booking-confirmation redirect

**What changed**: `BookingService.confirmSlot` (`apps/api/src/modules/whatsapp/booking/booking.service.ts`) gained two new **optional** constructor dependencies on `BookingServiceDeps` — `appointmentService: Pick<AppointmentService, 'createAppointment' | 'cancelAppointment'>` and `availability: Pick<AvailabilityService, 'listVets'>`. When both are present, `confirmSlot`:
1. Resolves a vet via `availability.listVets(clinicId)[0]` (Phase 7's booking flow has no `vetId` concept — see below).
2. Calls `appointmentService.createAppointment({ clinicId, userId: vet.id, ownerId, petIds: [petId], vetId: vet.id, scheduledFor, source: AppointmentSource.WHATSAPP, whatsappBookingRequestId: bookingId })` **before** any Phase 7 state change. `AppointmentService.createAppointment` runs its own `prisma.$transaction` (D-34's advisory lock) internally, so it cannot be nested inside `confirmSlot`'s own transaction — the two run sequentially, not composed into one atomic unit.
3. On a domain error (`VET_NOT_AVAILABLE`, `SLOT_BLOCKED`, `SLOT_IN_PAST`, `BOOKING_HORIZON_EXCEEDED`, `SLOT_DOUBLE_BOOKED`), returns a new `{ outcome: 'UNAVAILABLE', reason: code }` — a decline, not a confirmed booking with no real appointment behind it. No Phase 7 state (`WhatsAppSlotHold`/`confirmBooking`) is touched in this path.
4. On success, runs the EXISTING hold-then-confirm transaction unchanged (still the D-07 race arbiter for two owners picking the identical clinic-wide slot), then sets `WhatsAppBookingRequest.supersededByAppointmentId` to the created appointment's id via a direct `prisma.whatsAppBookingRequest.update` (chosen over widening `BookingRepository.confirmBooking`'s typed input, which is out of this task's file scope).
5. If the hold transaction then hits `P2002` (a genuine `SLOT_TAKEN` race that only the hold, not the availability check, can catch), the just-created appointment is cancelled as compensation via `appointmentService.cancelAppointment`.

**What was left alone**: `WhatsAppSlotHold`'s unique-constraint race arbitration (still the D-07 mechanism for two owners confirming the identical clinic-wide slot concurrently), the pet/slot-picker offer flow (`SlotService.getOfferableSlots`, `booking-inbound.handler.ts`'s pet picker), `cancelBooking`/`moveBooking` (staff-only, unaffected), and `AppointmentService.createAppointment` itself (only gained two new *optional*, backward-compatible params — `source`/`whatsappBookingRequestId` — defaulting to `STAFF`/`null` exactly as every plan 08-07 call site already assumed).

**`AppointmentService.createAppointment` gained**: `CreateAppointmentParams.source?: AppointmentSource` and `.whatsappBookingRequestId?: string`, both optional (`scheduling.types.ts`). `appointment.service.ts`'s hardcoded `source: AppointmentSource.STAFF` became `source: params.source ?? AppointmentSource.STAFF`, and `whatsappBookingRequestId: params.whatsappBookingRequestId ?? null` was added to the same `repository.create` call. This is the exact change the code's own pre-existing comment anticipated ("D-12 (plan 08-10) will let a WhatsApp-confirmed booking pass its own source through").

**D-12's real gap vs. RESEARCH's assumption**: D-12 says "checked against real per-vet availability", but Phase 7's WhatsApp booking flow (`WhatsAppBookingRequest`, `SlotService`, `Clinic.workingHours`) has **no vet concept anywhere** — it offers a single clinic-wide slot pool, never asking which vet. `confirmSlot` resolves `AvailabilityService.listVets(clinicId)[0]` (the same id-sorted vet list plan 08-05's UI/vet-color-assignment already depends on) as both the appointment's `vetId` and its `createdById`/`userId` (no staff actor exists for an owner-confirmed booking — mirroring `OwnerActionService`'s identical "no owner `User` row" resolution for `cancelAppointment`). This is a genuine, documented scope simplification: a clinic with more than one vet will always route WhatsApp-confirmed bookings to the same (first, id-sorted) vet, not a load-balanced or owner-chosen one. Flagged for whichever future plan next revisits the WhatsApp booking flow's slot-offering UX.

3 new `booking.service.test.ts` tests (create-appointment-first ordering, `UNAVAILABLE` decline, and a backward-compatibility check with no `appointmentService`/`availability` configured) plus the 20 pre-existing tests, all passing.

## Deviations From the Plan's Declared File Lists

Both tasks' frontmatter `files` lists were narrower than what their own `<action>` text required (a pattern also seen in earlier plans in this phase). Every deviation below was necessary to make the plan's own stated behavior true and to keep `pnpm --filter @breeyo/api test` green in full:

- **Task 1** additionally touched: `packages/types/src/whatsapp.ts`, `packages/types/src/constants/whatsapp.constants.ts` (`WA_TEMPLATE_KEYS`/`STAFF_NAMES`/`CATEGORIES`/`LEAD_DAYS`, but NOT `WA_BUTTON_PAYLOAD_PATTERN` — deferred to Task 3's commit since nothing consumed it yet), `packages/validators/src/whatsapp.ts`, `apps/api/src/modules/whatsapp/providers/simulator/simulator-reply.ts` (a `Record<WaTemplateKey, string>` that TypeScript's exhaustiveness check required extending), and three existing Phase 7 test files whose exact-count/exact-object assertions (`toHaveLength(6)`, `toEqual({ FOLLOW_UP: 1, ... })`) had to grow by one entry.
- **Task 3** additionally touched: `apps/api/src/lib/audit-log.ts` (new `WHATSAPP_OWNER_ACTION_REFUSED` event), `apps/api/src/modules/scheduling/appointment.service.ts`/`scheduling.types.ts` (D-12's optional `source`/`whatsappBookingRequestId` passthrough — directly anticipated by that file's own pre-existing comment), `apps/api/src/modules/whatsapp/booking/booking.service.ts` (the actual D-12 redirect — not in either task's file list, since neither task's frontmatter anticipated exactly where "Phase 7's booking-confirmation function" lives), `packages/types/src/constants/whatsapp.constants.ts` (`WA_BUTTON_PAYLOAD_PATTERN`), and `booking.service.test.ts`/`inbound-router.test.ts` (new coverage for the above, kept green).

## Verification

- `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__ tests/scheduling src/modules/whatsapp` — run TWICE, back to back, with no other process touching the database concurrently: **521/521 passing across 36 files, both times**, confirming the scheduling/WhatsApp suite (including every test this plan added) is fully stable.
- `pnpm --filter @breeyo/api test` (full suite) — run three times total. Two clean (non-contaminated) runs: **131 files passed / 9 skipped (141), 1746–1748 tests passed / 80 todo, 4–6 failed** — every failure both times was inside `tests/billing/webhook.test.ts` (and once also `combined-payment-link.test.ts`), matching the exact pre-existing flakiness already documented in `08-09-SUMMARY.md`'s baseline (FK-violation races in that file's own webhook-replay setup, unrelated to scheduling/WhatsApp). A third run was invalidated by this session's own mistake of launching it concurrently with another DB-touching vitest run, which produced unrelated FK-violation noise across several billing files purely from database contention — re-run cleanly afterward with the result above. Zero failures in any scheduling/whatsapp/owner-action test file across all three attempts.
- `pnpm --filter @breeyo/api exec tsc --noEmit` — clean, exit 0.
- `grep -rn 'AppointmentReminderTask' apps/api/src apps/api/prisma` — no matches (Phase 7's table extended, never paralleled).
- Migration/schema parity — clean via the disposable-database technique (see Task 1 section above); the live-DB comparison reproduces only the same pre-existing pg_trgm-index false positive documented in `06-03-SUMMARY.md`/`08-03-SUMMARY.md`.

## Next Phase Readiness (for plan 08-11)

1. Construct `AppointmentReminderService` and pass it as `ReminderSweepDeps.appointmentReminders` wherever the production reminder-sweep worker's deps are built.
2. Wire `AppointmentService`'s `onRescheduled`/`onCancelled` constructor hooks to `(appointmentId, clinicId) => appointmentReminderService.cancelPendingForAppointment(appointmentId, clinicId)`.
3. Construct `OwnerActionService` (6 args, see signature above) with a real `OwnerReplySender` adapter over Phase 7's existing send path, wrap it with `createAppointmentActionHandler`, and pass it as `InboundRouterDeps.appointmentActionHandler`.
4. Pass real `appointmentService`/`availability` instances into `BookingService`'s construction site (`whatsapp.routes.ts`) so the D-12 redirect actually takes effect in production — without this wiring, `confirmSlot` silently keeps running Phase 7's original hold-and-flip-state-only path (the optional-dependency design is deliberately backward compatible, but that means D-12 has NO effect until this wiring lands).
