# Phase 8: Scheduling & Calendar - Research

**Researched:** 2026-08-12
**Domain:** Recurring availability modeling, appointment-to-walk-in-queue handoff, BullMQ scheduled sweeps, Socket.IO multi-surface real-time sync, Expo push notifications, first-real-screen Next.js web calendar
**Confidence:** HIGH (every claim below was checked directly against this repo's code, schema, and Phase 7's already-verified research; no unverified library claims were needed — this phase adds zero new runtime dependencies to the API and one already-used dependency to the web app)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Availability Model**
- D-01: Availability is a weekly recurring template (e.g. Mon-Sat 9am-6pm) with per-date overrides for holidays/half-days/vacation.
- D-02: Appointment slot length is derived per-service from the service catalog (Phase 4 ONB-02), not a single fixed clinic-wide duration.
- D-03: No hard walk-in-capacity reservation — appointments simply claim their exact slot; walk-ins fill in around them via Phase 3's existing queue-position logic. No configurable buffer/reserved-capacity setting for Beta.
- D-04: Availability is set per-vet, not per-clinic — each vet (the `treatingVetId` already on `QueueEntry`) has their own weekly template + overrides.
- D-05: A vet can add sub-day blocked periods (start/end time) within a working day — e.g. lunch, a meeting — without taking the whole day off.
- D-06: Blocked-period reason is a preset catalog (Lunch, Break, Personal, Off-site, Meeting) plus a free-text "Other" option.
- D-07: Booking horizon is capped (e.g. 90 days out) — Claude's discretion on exact cap value; validate at booking time.

**Queue Handoff Semantics**
- D-08: At the scheduled time, a queue entry is created in a new `EXPECTED` status — not directly `WAITING`. Requires adding `EXPECTED` to Phase 3's `QueueEntryStatus` enum (`WAITING | IN_CONSULT | DONE | NO_SHOW` today).
- D-09: If nobody checks the patient in within a grace window after the slot time, the entry auto-flips to `NO_SHOW` via a scheduled sweep/job.
- D-10: On check-in, a checked-in scheduled patient's queue position is ordered by scheduled time, ahead of walk-ins who arrived after that slot was due — an addition to Phase 3's position-ordering logic (D-19), not a replacement.
- D-11: Early check-in (before the slot time) flips `EXPECTED` → `WAITING` immediately — no waiting-for-slot-time behavior.
- D-12: Confirmed WhatsApp bookings (Phase 7 D-06 to D-09) now create real `Appointment` records checked against real per-vet availability, retiring Phase 7's standalone slot-blocking mechanism.
- D-13: `EXPECTED` entries are shown on the existing Phase 3 Queue board (mobile), with a distinct badge — not hidden in a schedule-only view.

**Booking Management**
- D-14: Double-booking is allowed, with a warning only — staff can override for edge cases; no hard block.
- D-15: Reschedule/cancel is staff-only in the app, plus owner-initiated via WhatsApp reply to the appointment reminder.
- D-16: Owner WhatsApp replies: `KEEP` and `CANCEL` auto-apply immediately. `MOVE` creates a staff task/notification to pick a new time with the owner.
- D-17: Appointment reminders reuse Phase 7's WhatsApp abstraction layer, provider port, notification-bus pattern, and consent/opt-out rules — a new "Appointment reminder" template is added to Phase 7's template set, not a parallel messaging mechanism.
- D-18: Appointment reminder cadence mirrors Phase 7's D-01 pattern: fires once 1 day before, and again the day of the appointment.
- D-19: Staff select the patient when booking via the same owner/pet mobile-number lookup used at check-in (Phase 3 D-05/D-13).
- D-20: An `Appointment` has its own lifecycle, distinct from the queue entry it spawns: `SCHEDULED` → `CHECKED_IN` → `COMPLETED`, or `CANCELLED` / `NO_SHOW`. No separate "confirmed" state.
- D-21: One appointment can cover multiple pets from the same owner in a single visit/slot. At queue handoff, one `Appointment` spawns one `QueueEntry` per pet.
- D-22: Basic recurrence is supported — a vet can set a repeat pattern (e.g. weekly × N occurrences) when booking, generating multiple linked `Appointment` records at once. Claude's discretion on the exact recurrence UI/data model.
- D-23: The calendar's default view shows all vets combined (color-coded/labeled per vet), with a filter to narrow to one vet's schedule.

**Calendar UX & Notifications**
- D-24: Mobile's primary calendar view is a day agenda — a scrollable list of the day's appointments with date navigation — not a dense week grid.
- D-25: Web's primary calendar view is a staff-first 7-day week grid (columns = days, rows = time slots), built with plain React + the existing design-token CSS. First real screen in the currently-blank `apps/web` scaffold.
- D-26: Push notifications for Beta are staff-only — sent via the existing Expo push setup (`apps/api/src/modules/notifications/push.service.ts`). No owner-facing push in v1. Design the push-sending code generically enough that adding an owner recipient later is a new token registration, not a rebuild.
- D-27: Staff push notification triggers: (1) an upcoming appointment starting soon, (2) an owner replied MOVE/CANCEL via WhatsApp, (3) the queue is backing up. In addition to existing in-app Socket.IO real-time updates.

### Claude's Discretion
- Exact booking-horizon cap value (D-07) — recommended: 90 days
- Exact no-show grace-window duration (D-09) — recommended: 15-30 minutes
- Recurring-appointment data model/UI shape (D-22) — e.g. `recurringSeriesId` field linking generated `Appointment` rows
- BullMQ job design for the no-show sweep and appointment reminder cadence (delay jobs, repeatable jobs, or cron sweep — matching Phase 5/7's existing daily-sweep pattern)
- Exact push notification copy/payload shape
- Whether per-vet availability templates are edited from a dedicated Settings screen or inline in the calendar

### Deferred Ideas (OUT OF SCOPE)
- Owner-facing push notifications — deferred until an owner mobile app or push-capable PWA exists
- Configurable walk-in-capacity reservation/buffer — deferred; relies on natural solo-vet scheduling discipline for Beta
- Full appointment-change audit UI beyond the standard project-wide audit-trail convention — not a distinct feature, assumed automatic
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCH-01 | User can schedule future appointments for a patient | § Architecture Patterns Pattern 1 (Appointment model), § Code Example 1 (availability engine reusing Phase 7's `slot.service.ts` shape), D-01/D-02/D-04/D-19 |
| SCH-02 | Scheduled appointments appear in the walk-in queue at their time slot | § Architecture Patterns Pattern 2 (single sweep job for EXPECTED handoff), § Code Example 2 (`queuePriorityAt` ordering), D-08/D-09/D-10/D-11/D-13 |
| SCH-03 | User can view calendar in day and week views | § Architecture Patterns Pattern 4 (mobile day agenda / web week grid split), D-23/D-24/D-25 |
| SCH-04 | Calendar syncs in real time across mobile and web (multi-device) | § Don't Hand-Roll (reuse Socket.IO `clinic:{id}` room), § Environment Availability (`socket.io-client` gap in `apps/web`), D-25 |
| SCH-05 | User receives push notifications for upcoming appointments and queue changes | § Architecture Patterns Pattern 3 (push trigger sources), § Common Pitfalls (worker-in-routes-plugin, alert fatigue), D-26/D-27 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Verified directives the planner must honor, checked against actual code in this session.

| Directive | Verified reality in repo | Implication for Phase 8 |
|-----------|--------------------------|--------------------------|
| API module structure `modules/<name>/` with `controller.ts`, `service.ts`, `routes.ts`, `schema.ts` (+ `.repository.ts` in newer modules) | Confirmed in `queue`, `emr`, `vaccination` | Create `apps/api/src/modules/scheduling/` with `availability.*`, `appointment.*`, `reminder.*` sub-namespaces following this shape |
| Routes registered via `app.register()` with `/api/v1` prefix | Confirmed `apps/api/src/app.ts` | Register scheduling routes the same way |
| `@fastify/jwt` auth, `authenticate` + `requirePermission(...)` middleware (not `authorize`) | Confirmed `apps/api/src/middleware/authorize.ts` exports `requirePermission` | `VIEW_SCHEDULE` and `MANAGE_SCHEDULE` permissions **already exist** and are already seeded onto Clinician + FrontDesk roles [VERIFIED: `apps/api/prisma/seed.ts:27-28,54,61`] — reuse them, do not invent new permission codes |
| RLS enforced via explicit `clinicId` params on every repository method (the actual dominant pattern; DB-level RLS is only on 3 tables) | Confirmed by Phase 7 research Pitfall 5, re-verified this session (`prisma-rls.ts` exists but Phase 3/4/6 modules inject `fastify.prisma` directly) | Follow the explicit-`clinicId`-parameter pattern for all new scheduling repositories; do not attempt `FORCE ROW LEVEL SECURITY` on new tables without also routing through `request.db` |
| Error handling via centralized `error-handler.ts`; throw `Error & { statusCode, code }` | Confirmed pattern in `queue.service.ts:42-46` | Use the identical throw shape for `SLOT_TAKEN`, `INVALID_TRANSITION`, `BOOKING_HORIZON_EXCEEDED`, etc. |
| All Prisma columns `snake_case` with `@map()`, TS `camelCase`, UUIDs via `gen_random_uuid()` | Confirmed throughout `schema.prisma` | Apply identically to new `Appointment`, `AvailabilityTemplate`, `AvailabilityOverride`, `BlockedPeriod` models |
| Audit logging via `audit-log.ts` for auth events; extend for other domains per Phase 7 Pitfall 6 precedent | `AuditEvent` enum is auth-only today | Extend `AuditEvent` with `APPOINTMENT_CREATED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_MOVED`, `APPOINTMENT_NO_SHOW` — matching the same extension Phase 7 needs for its own events |
| BullMQ workers via `notification-bus.ts` Queue pattern | Confirmed | New sweep jobs should be BullMQ-scheduled, not `node-cron` — see § Common Pitfalls (carried over from Phase 7's verified Pitfall 2) |
| Zod validation shared via `@breeyo/validators`; types via `@breeyo/types` | Confirmed pattern every phase | Add `packages/validators/src/scheduling.ts`, `packages/types/src/scheduling.ts`, `packages/types/src/constants/scheduling.constants.ts` |
| ESM (`.js` import extensions), TypeScript strict mode | Confirmed | Apply identically |
| Commit messages `feat\|fix\|chore\|docs(phase-NN)`; branch `breeyo/phase-NN-description` | Confirmed by git log; current branch is already `breeyo/phase-04-emr-clinical-records` (a prior phase's branch left checked out) | Planner/executor must create/checkout `breeyo/phase-08-scheduling-calendar` before building |
| Vitest via `buildTestApp()` + `app.inject()`, not supertest, for Phase 3/4-style tests (though Phase 6 introduced `supertest` for billing) | Confirmed both patterns coexist | Match whichever pattern the scheduling module's sibling tests use; `tests/helpers/factories.ts` needs new `createTestAppointment`/`createTestAvailabilityTemplate` factories |
| Never commit `.env` files; `.env.example` lives at repo root | Confirmed | Any new env var (none anticipated — see § Standard Stack) goes in root `.env.example` |

### Project Skills (`.claude/skills/breeyo-build/SKILL.md`)

`breeyo-build --build` mode requires: TDD iron law (failing test first, delete code written before a test), each task references the `D-XX` decision and `SCH-0X` requirement it implements, exact monorepo file paths, 2-5 minute tasks. The planner must write Phase 8 plans in this shape, exactly as Phase 7's plans (e.g. `07-10-PLAN.md`) already demonstrate.

## Summary

Phase 8 is a **schema-and-scheduling-primitives phase wearing a calendar-UI costume.** The two genuinely hard problems are (1) representing recurring per-vet availability with overrides and sub-day blocks in a way that a slot-generation function can query cheaply, and (2) getting scheduled appointments into the Phase 3 walk-in queue at the right moment and in the right position without either a long-horizon Redis-resident delayed job (unsafe — this project's Redis runs `allkeys-lru` eviction, already proven a real risk in Phase 7's research) or a naive per-appointment cron. Both problems have a single answer already validated in this codebase: **own the schedule state in Postgres, and use a short-interval BullMQ `upsertJobScheduler` sweep to act on it.** This is not a new pattern for this project — it is Phase 7's Pattern 4 (`WhatsAppReminderTask` swept daily) generalized to a faster cadence.

The queue-handoff mechanic (SCH-02, D-08 through D-11) can be solved with almost no new logic in `queue.service.ts`: add a `queuePriorityAt DateTime` column to `QueueEntry`, populate it with `checkedInAt` for organic walk-ins and with the appointment's `scheduledFor` for appointment-derived entries, and change one Prisma `orderBy` clause from `checkedInAt` to `queuePriorityAt`. D-10's "ahead of walk-ins who arrived later" requirement falls out of that ordering automatically — no raw SQL, no coalesce, no new sort logic.

The calendar-sync requirement (SCH-04) needs zero new real-time technology: `apps/api/src/realtime/socket.ts` already broadcasts to a `clinic:{clinicId}` room and `apps/mobile` already has `socket.io-client`; the only gap is that `apps/web` has never had a Socket.IO client wired in (it currently has no dependencies beyond Next.js and `@breeyo/types`). Push notifications (SCH-05) reuse `PushService.send()` and the `DeviceToken` model verbatim — no new push infrastructure, only new trigger call sites.

The riskiest *cross-phase* dependency is D-12/D-17: Phase 8 formalizes Phase 7's WhatsApp booking and reminder mechanisms, and Phase 7's own research already pre-built the seams for this handoff (`WhatsAppBookingRequest.supersededByAppointmentId`, and an inbound payload namespace explicitly designed to extend to `appointment:keep:<uuid>` / `appointment:move:<uuid>` / `appointment:cancel:<uuid>`). Phase 8's plans should consume those seams, not redesign them. If Phase 7 has not yet been executed when Phase 8 planning happens, the planner must treat `apps/api/src/lib/ist-date.ts` (extracted `getTodayIST`/`addDaysIST`), the `whatsapp` module, and its `InboundRouterService` as **not yet existing** and add a Wave 0 dependency check rather than assuming them.

**Primary recommendation:** Model per-vet availability as a `VetAvailabilityTemplate` (7 weekday rows) + `AvailabilityOverride` (date-specific full/half-day/blocked) + `BlockedPeriod` (sub-day) trio, generate offerable slots with a pure function shaped exactly like Phase 7's already-designed `slot.service.ts` (`generateSlotsForDay`/`getOfferableSlots`) but keyed on `(vetId, date)` instead of `(clinicId, date)` and durationed per-service instead of fixed; drive both the EXPECTED-queue-handoff and the no-show sweep from one BullMQ `upsertJobScheduler` job running every 5 minutes IST; extend Phase 7's `WhatsAppReminderTask` `kind` enum with a fourth value (`APPOINTMENT_REMINDER`) rather than building a parallel reminder pipeline; and add a `queuePriorityAt` column to `QueueEntry` rather than any query-time coalesce logic. Zero new npm dependencies in `apps/api`; one already-in-use dependency (`socket.io-client@^4.8.3`) added to `apps/web`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Availability template/override/blocked-period CRUD | API (backend) | Mobile/Web (settings UI) | Business rules (per-vet ownership, overlap validation) must be server-enforced; multiple surfaces edit the same state |
| Slot generation (offerable times for booking) | API (backend, pure function) | — | Must combine availability + existing appointments + service duration server-side; client cannot safely compute conflict-free slots |
| Appointment CRUD + lifecycle transitions | API (backend) | Shared package (state enum + transition table, mirroring Phase 7's booking state pattern) | Server is authoritative for state; mobile/web render from the shared transition table |
| Queue handoff (EXPECTED creation, no-show sweep) | API (backend worker) | Database (task/schedule state) | Must run without any client present; state must survive restarts and Redis eviction |
| Queue position ordering (D-10) | Database (query-time `orderBy`) | API (write-time `queuePriorityAt` assignment) | A single indexed column read at query time is cheaper and safer than app-level sort merging |
| Owner-initiated KEEP/MOVE/CANCEL bridge | API (backend, WhatsApp inbound router) | Database (Appointment state) | Inbound webhook/simulator event drives a privileged state transition; must be server-authoritative exactly like Phase 7's booking payloads |
| Appointment reminder scheduling | API (backend worker) | Database (`WhatsAppReminderTask` extension) | Same reasoning as Phase 7 Pattern 4 — must not be a client-side timer |
| Push notification dispatch | API (backend) | Database (`DeviceToken`) | Expo push requires server-held tokens and the Expo access; mobile only registers tokens |
| Mobile day-agenda calendar | Mobile (Expo) | API (paginated read endpoints) | D-24 locks this as the mobile-primary view |
| Web 7-day week-grid calendar | Web (Next.js, plain React) | API (same read endpoints as mobile) | D-25 locks this as the web-primary view; first real `apps/web` screen |
| Realtime calendar/queue sync | API (Socket.IO `clinic:{id}` room) | Mobile + Web (socket hooks invalidating React Query keys) | Already established by `useQueueSocket.ts`; web needs the client wired in for the first time |

## Standard Stack

### Core — all already installed in `apps/api`, zero new dependencies

| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `bullmq` | `^5.30.0` declared, `5.81.3` installed [VERIFIED: `apps/api/package.json`, confirmed present in `node_modules` this session] | `upsertJobScheduler` for the queue-handoff/no-show sweep and (extended) `WhatsAppReminderTask` sweep | Already the notification/reminder transport; `upsertJobScheduler` is Redis-coordinated so it fires once regardless of how many ECS tasks run |
| `@prisma/client` / `prisma` | `^6.2.0` | Appointment/availability/blocked-period models | Project standard |
| `socket.io` | `^4.8.3` (server, already installed) | Broadcast appointment/queue changes to `clinic:{clinicId}` room | Established by Phase 3 |
| `zod` | `^3.24.0` | Availability/appointment/blocked-period request validation | Project standard, `@breeyo/validators` |
| `node:crypto`, `fetch` | Node 22/24 built-ins | Not newly needed by this phase | — |
| `expo-server-sdk` | `^7.0.0` installed, `7.1.0` latest [VERIFIED via `npm view expo-server-sdk version`, 2026-08-12] | Staff push via `PushService.send()` (D-26/D-27) | Already built and working; no upgrade required |
| `expo-notifications` | `~0.29.0` (mobile, already installed) | Client-side push registration/handling | Already wired; Phase 8 adds new trigger types only |
| `@tanstack/react-query` | `^5.101.4` (mobile) | Calendar/appointment data fetching, optimistic booking mutations | Established by `useQueue.ts` |
| `zustand` | `^5.0.14` (mobile) | Calendar filter/view-mode UI state | Established by `queueUIStore.ts` |

### Supporting — one addition needed (already used elsewhere in the monorepo)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `socket.io-client` | `^4.8.3` [VERIFIED: `npm view socket.io-client version` → `4.8.3`, exact match to the version already pinned in `apps/mobile/package.json`] | Web calendar real-time sync (SCH-04) | `apps/web/package.json` currently declares only `next`, `react`, `react-dom`, `@breeyo/types` — this is the one new line needed anywhere in the stack for this phase |
| `node-cron` | `^4.6.0` (already installed, used by `midnight-archive.ts`) | Existing precedent only | **Do not use for any new Phase 8 sweep** — see § Common Pitfalls (carried over verified finding from Phase 7 research) |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| One BullMQ `upsertJobScheduler` sweep (every 5 min) for EXPECTED-handoff + no-show + "starting soon" push | Per-appointment BullMQ delayed job scheduled at booking time | Rejected: booking horizon is up to 90 days out; this project's Redis runs `--maxmemory-policy allkeys-lru` (verified in Phase 7 research against `docker-compose.yml:24`), so a 90-day-out delayed job can be silently evicted. Same reasoning Phase 7 used to reject per-record delayed reminders |
| `queuePriorityAt` column + one-line `orderBy` change | Raw SQL `COALESCE(scheduled_for, checked_in_at)` in a `$queryRaw` | Rejected: adds an untyped raw-SQL code path to an otherwise fully-Prisma-typed repository for a problem a plain column solves; also avoids re-deriving Phase 3's existing `getAverageConsultDuration` raw-SQL precedent unnecessarily |
| Extending `WhatsAppReminderTask.kind` with `APPOINTMENT_REMINDER` | New parallel `AppointmentReminderTask` table | Rejected: D-17 explicitly requires reuse of Phase 7's abstraction/notification-bus/consent pipeline; a parallel table would duplicate the escalation state machine, the sweep job, and the consent-check logic that already exist |
| Plain React + existing CSS design tokens for the web week grid (D-25, locked) | A calendar component library (e.g. FullCalendar, react-big-calendar) | Not evaluated for adoption — D-25 already locks "plain React + `packages/ui/src/theme/portal.css`" as the approach; a 7-day/time-row grid is a bounded enough UI problem that a library adds a dependency and a design-token integration cost for a first screen that intentionally establishes conventions "in the wild" |
| Native `Date`/`Intl` for slot-time math (matching `QueueRepository.getTodayIST()` / Phase 7's planned `ist-date.ts`) | `date-fns-tz` or `luxon` | Not recommended: this monorepo has zero date libraries installed anywhere today; recurrence generation (D-22, weekly × N) and slot math (D-01/D-02) are simple enough (fixed weekday + minute-offset arithmetic) that adding a dependency purely for this phase breaks an otherwise consistent zero-date-library convention. Flag as revisit-if-recurrence-grows (see § Open Questions) |

**Installation:**
```bash
# apps/web only — everything else is already installed
pnpm --filter @breeyo/web add socket.io-client@^4.8.3
```

**Version verification performed (2026-08-12):**
```
npm view socket.io-client version   -> 4.8.3   (exact match to apps/mobile's pinned version)
npm view expo-server-sdk version    -> 7.1.0   (installed ^7.0.0 is current-enough; no bump needed)
```

## Package Legitimacy Audit

Phase 8 requires **one** new package across the entire monorepo, and it is already a trusted, actively-used dependency elsewhere in this same repo (not a new supplier).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `socket.io-client` | npm | mature (Socket.IO project, 10+ years) | very high (tens of millions/week) | github.com/socketio/socket.io-client | not run — already installed and vetted in `apps/mobile/package.json` at the identical pinned version (`^4.8.3`); re-running slopcheck against a package already load-bearing elsewhere in this repo would be theatre, not verification | **Approved** — add to `apps/web/package.json` at the same version already used by `apps/mobile` |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

*No `pip install slopcheck` step was run because zero unvetted external packages are proposed. If the planner introduces any additional package during planning (e.g. a calendar UI library, contrary to the D-25 plain-React recommendation above), run the full Package Legitimacy Gate on it before locking it into a plan.*

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────┐
                     │   Staff books/edits an    │
 Mobile (day agenda) │   appointment (SCH-01)    │  Web (7-day week grid)
 Web (week grid)     └────────────┬──────────────┘
        │                         │                          │
        ▼                         ▼                          ▼
 GET /schedule/*  ─────►  Fastify /api/v1/scheduling  ◄───── GET /schedule/*
        │                         │
        │              ┌──────────┴───────────┐
        │              ▼                       ▼
        │     AvailabilityService      AppointmentService
        │   (per-vet template+override   (create/reschedule/cancel,
        │    +blocked-period query,       double-book warning D-14,
        │    slot generation D-01/D-02)    multi-pet D-21, recurrence D-22)
        │              │                       │
        │              └──────────┬────────────┘
        │                         ▼
        │                 PostgreSQL (Appointment, AvailabilityTemplate,
        │                  AvailabilityOverride, BlockedPeriod — all
        │                  clinicId + vetId scoped)
        │                         │
        │                         ▼
        │           ┌─────────────────────────────┐
        │           │  BullMQ upsertJobScheduler    │
        │           │  "scheduling-sweep" (every 5m,│
        │           │   Asia/Kolkata)                │
        │           └──────┬───────────┬─────────────┘
        │                  │           │
        │      scheduledFor│<=now      │ EXPECTED + grace window elapsed
        │                  ▼           ▼
        │        QueueService.createExpectedEntry   QueueService.autoNoShow
        │                  │           │
        │                  ▼           ▼
        │         QueueEntry(EXPECTED,        QueueEntry -> NO_SHOW
        │          queuePriorityAt=scheduledFor)  Appointment -> NO_SHOW
        │                  │
        │                  ▼
        │        Socket.IO clinic:{clinicId} room ──► Mobile Queue board
        │                  │                           (EXPECTED badge, D-13)
        │                  ▼
        │        PushService.send() (staff devices, D-27 trigger 1)
        │
        ▼
 Owner replies KEEP/MOVE/CANCEL on WhatsApp (D-16)
        │
        ▼
 WhatsApp InboundRouter (Phase 7) ──► appointment:keep|move|cancel:<id>
        │
        ├─ KEEP/CANCEL: auto-apply AppointmentService transition ──► Socket.IO + PushService (D-27 trigger 2)
        └─ MOVE: create staff task/notification (no auto-apply) ──► PushService (D-27 trigger 2)
```

A reader can trace SCH-01 → SCH-02 by following: booking request → Appointment row → sweep job (polls, does not push) → QueueEntry(EXPECTED) → Socket.IO broadcast → mobile Queue board badge → (check-in) → `queuePriorityAt`-ordered WAITING entry.

### Recommended Project Structure

```
apps/api/src/modules/scheduling/
├── availability.repository.ts     # VetAvailabilityTemplate, AvailabilityOverride, BlockedPeriod CRUD
├── availability.service.ts        # weekly-template + override resolution, blocked-period validation
├── slot.service.ts                # PURE: generateSlotsForVetDay(), same shape as Phase 7's slot.service.ts
├── appointment.repository.ts      # Appointment CRUD, per-clinic/per-vet/per-date queries
├── appointment.service.ts         # lifecycle transitions (D-20), double-book warning (D-14), recurrence (D-22)
├── appointment.state.ts           # assertAppointmentTransition() mirroring booking.state.ts
├── queue-handoff.service.ts       # EXPECTED creation + no-show sweep logic (called by the sweep worker)
├── reminder.service.ts            # extends WhatsAppReminderTask discovery for kind=APPOINTMENT_REMINDER
├── scheduling.sweep.worker.ts     # BullMQ upsertJobScheduler registration (5-min IST cadence)
├── scheduling.schema.ts           # Zod request/response schemas
├── scheduling.controller.ts
├── scheduling.routes.ts
└── __tests__/

apps/mobile/src/features/scheduling/
├── screens/DayAgendaScreen.tsx         # D-24
├── screens/AvailabilitySettingsScreen.tsx
├── components/AppointmentQuickSheet.tsx
├── hooks/useScheduleSocket.ts          # mirrors useQueueSocket.ts
└── store/scheduleUIStore.ts

apps/web/app/schedule/
├── page.tsx                            # D-25 week grid, first real apps/web screen
├── WeekGrid.tsx
├── AppointmentDrawer.tsx
└── lib/useScheduleSocket.ts            # new: apps/web's first Socket.IO client
```

### Pattern 1: Availability as template + override + blocked-period, resolved by one pure function

**What:** Three small models instead of one flexible-but-unqueryable JSON blob:
- `VetAvailabilityTemplate` — one row per `(vetId, weekday 0-6)` with `openMinutes`/`closeMinutes` (or `isClosed`), matching the minutes-from-midnight convention Phase 7 already established for `WhatsAppSlotHold.slotStartMinutes`.
- `AvailabilityOverride` — one row per `(vetId, date)` for holidays/half-days/vacation, overriding the template for that date only.
- `BlockedPeriod` — one row per `(vetId, date, startMinutes, endMinutes, reason enum + reasonText)` for sub-day blocks (D-05/D-06), which slot generation subtracts from the resolved day.

**When to use:** This is the shape for D-01, D-04, D-05, D-06 together. It keeps "what are this vet's hours on this date" a three-query, no-JSON-parsing lookup, unlike `Clinic.workingHours: Json?` which Phase 7's research flagged as having "no typed contract" (Pitfall 15) precisely because it is a single opaque blob.

```typescript
// apps/api/prisma/schema.prisma sketch — minutes-from-midnight, matching WhatsAppSlotHold precedent
model VetAvailabilityTemplate {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId      String   @map("clinic_id") @db.Uuid
  vetId         String   @map("vet_id") @db.Uuid
  weekday       Int      // 0=Sunday .. 6=Saturday
  isClosed      Boolean  @default(false) @map("is_closed")
  openMinutes   Int?     @map("open_minutes")
  closeMinutes  Int?     @map("close_minutes")

  @@unique([clinicId, vetId, weekday])
  @@map("vet_availability_templates")
}

model AvailabilityOverride {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId     String   @map("clinic_id") @db.Uuid
  vetId        String   @map("vet_id") @db.Uuid
  date         DateTime @db.Date
  isClosed     Boolean  @default(true) @map("is_closed")   // most overrides are "day off"
  openMinutes  Int?     @map("open_minutes")                // set for half-day overrides
  closeMinutes Int?     @map("close_minutes")
  reason       String?

  @@unique([clinicId, vetId, date])
  @@map("availability_overrides")
}

enum BlockedPeriodReason { LUNCH BREAK PERSONAL OFF_SITE MEETING OTHER }

model BlockedPeriod {
  id            String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId      String              @map("clinic_id") @db.Uuid
  vetId         String              @map("vet_id") @db.Uuid
  date          DateTime            @db.Date
  startMinutes  Int                 @map("start_minutes")
  endMinutes    Int                 @map("end_minutes")
  reason        BlockedPeriodReason
  reasonText    String?             @map("reason_text")     // required when reason=OTHER

  @@index([clinicId, vetId, date])
  @@map("blocked_periods")
}
```

**Slot generation** should be transplanted almost directly from Phase 7's already-designed `slot.service.ts` (`07-10-PLAN.md` Task 1), generalized from `(clinicId, day, fixedDuration)` to `(vetId, day, perServiceDuration)`:

```typescript
// apps/api/src/modules/scheduling/slot.service.ts — pure, testable without a DB
export function generateSlotsForVetDay(
  resolvedHours: { openMinutes: number; closeMinutes: number } | null, // null = closed
  blockedRanges: Array<{ startMinutes: number; endMinutes: number }>,
  existingAppointments: Array<{ startMinutes: number; endMinutes: number }>, // D-14: informational only, not exclusionary
  durationMinutes: number, // D-02: per-service, passed in by the caller
): SlotOption[] { /* ... */ }
```

Per D-14 (double-booking allowed with a warning), `existingAppointments` is used to *flag* a slot as already-taken in the response (so the UI can show a warning), not to *exclude* it from the generated list — this is the one deliberate divergence from Phase 7's `slot.service.ts`, which excludes held slots outright because Phase 7's WhatsApp booking has no staff override path.

### Pattern 2: One short-interval sweep handles both queue-handoff and no-show (SCH-02, D-08–D-11)

**What:** A single BullMQ `upsertJobScheduler` job, registered once at app boot, running every 5 minutes IST, doing two idempotent passes in one transaction-safe pass:

```typescript
// apps/api/src/modules/scheduling/scheduling.sweep.worker.ts
await schedulingQueue.upsertJobScheduler(
  'scheduling-sweep',
  { pattern: '*/5 * * * *', tz: 'Asia/Kolkata' },
  { name: 'sweep', data: {} },
);

// sweep handler, called once per firing (idempotent — safe to re-run):
async function runSchedulingSweep(deps) {
  // Pass 1 (SCH-02, D-08): SCHEDULED appointments whose scheduledFor <= now()
  // and which have not yet produced a QueueEntry -> create QueueEntry(EXPECTED),
  // one per pet on the appointment (D-21).
  await createExpectedEntriesForDueAppointments(deps);

  // Pass 2 (D-09): QueueEntry.status = EXPECTED and
  // scheduledFor + graceMinutes <= now() -> flip QueueEntry and Appointment to NO_SHOW.
  await autoFlipExpiredExpectedEntries(deps, { graceMinutes: 20 });

  // Pass 3 (D-27 trigger 1): SCHEDULED appointments starting within the next
  // N minutes, not yet push-notified -> PushService.send() to staff devices.
  await notifyUpcomingAppointments(deps, { leadMinutes: 15 });
}
```

**Why one sweep, not three separate schedulers:** all three passes read the same `Appointment` rows in the same time window; one query pass amortizes better than three, and it mirrors Phase 7's Pattern 4 exactly (one sweep, multiple idempotent side effects, each guarded by its own "has this already happened" check — a `queueEntryCreatedAt` / `noShowNotifiedAt` / `startingSoonNotifiedAt` marker column per Appointment, not a `findFirst` pre-check race, since none of these three passes are concurrency-sensitive the way Phase 7's slot confirmation is).

**Why 5 minutes, not 1 minute or 30 minutes:** 5 minutes bounds the worst-case delay on EXPECTED-creation and "starting soon" push to an acceptable few minutes without adding meaningful DB load (one query pass over `SCHEDULED`/`EXPECTED` rows per clinic every 5 minutes is trivial at 20-pilot-clinic scale), and evenly divides the 15-30 minute grace-window range so grace-window expiry is detected within one sweep cycle of its true expiry.

**Idempotency:** exactly as Phase 7's `@@unique([clinicId, sourceType, sourceId, kind, touch])` key makes a duplicate sweep firing a no-op, this sweep's three passes should each be guarded by a nullable timestamp column on `Appointment` (`queueEntryCreatedAt`, `noShowFlippedAt`, `startingSoonNotifiedAt`) checked in the `WHERE` clause, so a re-run (restart, manual trigger, duplicate scheduler firing) is naturally a no-op — belt-and-braces, matching Phase 7's own stated approach ("the `@@unique` task key makes a duplicate sweep a no-op anyway. Use both").

### Pattern 3: `queuePriorityAt` — D-10's queue ordering with zero new sort logic

**What:** Add one nullable-then-always-populated column to the existing `QueueEntry` model:

```prisma
model QueueEntry {
  // ...existing fields...
  queuePriorityAt DateTime @map("queue_priority_at")  // NOT nullable after backfill
}
```

Set at creation time, never mutated afterward:
- Organic walk-in check-in (`queue.service.ts:checkIn`): `queuePriorityAt = new Date()` (same as `checkedInAt` today).
- Appointment-derived EXPECTED entry (sweep Pass 1): `queuePriorityAt = appointment.scheduledFor`.
- Early check-in (D-11, EXPECTED → WAITING before slot time): `queuePriorityAt` is **not** touched — it already holds `scheduledFor` from EXPECTED creation, which is exactly what D-10 wants (the patient still gets priority ordering by their *scheduled* time, not their early arrival time).

Then change exactly one line in `queue.repository.ts`:

```typescript
// Before (current code, queue.repository.ts:162-165):
orderBy: [{ isEmergency: 'desc' }, { checkedInAt: 'asc' }],
// After:
orderBy: [{ isEmergency: 'desc' }, { queuePriorityAt: 'asc' }],
```

**Why this satisfies D-10 exactly:** a walk-in checking in at 2:05pm gets `queuePriorityAt = 2:05pm`. A scheduled patient whose slot was 2:00pm and who checks in at 2:03pm keeps `queuePriorityAt = 2:00pm` (set when their EXPECTED row was created at slot time). Sorting ascending by `queuePriorityAt` puts the 2:00pm-slot patient ahead of the 2:05pm walk-in — "ahead of walk-ins who arrived after that slot was due" — without any special-casing in the sort itself. `checkedInAt` remains untouched and still means "when did this physically happen," preserving its use for display (D-21 queue card check-in time) and the midnight-archive date filter.

### Pattern 4: Two calendar surfaces, one read API

**What:** D-23/D-24/D-25 lock the *views* (mobile day-agenda, web 7-day grid, both default-all-vets-combined-filterable), but both should be served by the same underlying read endpoints — `GET /api/v1/scheduling/appointments?from=&to=&vetId=` returning a flat, vet-tagged list. The mobile day agenda groups client-side by nothing (it's already one day); the web week grid groups client-side into a 7×N grid by day/time. Do not build two different API shapes for "day" vs "week" — the date-range parameter already generalizes both, matching how `queue.service.getQueueBoard` already takes an optional `date` param.

### Pattern 5: Extend Phase 7's reminder task pipeline rather than parallel it (D-17, D-18)

**What:** Phase 7's `WhatsAppReminderTask.kind` enum is currently `FOLLOW_UP | VACCINE_DUE | DEWORMING_DUE` (deliberately excluding `payment_reminder` per D-05's carve-out in Phase 7). Add a fourth structural value:

```typescript
enum WaReminderKind { FOLLOW_UP VACCINE_DUE DEWORMING_DUE APPOINTMENT_REMINDER }  // Phase 8 addition
```

Phase 8's sweep contribution to the *existing* 08:30 IST daily sweep (not the new 5-minute scheduling sweep — this is a different cadence, matching D-18's "1 day before + day of" granularity, not SCH-02's "at the exact slot minute" granularity) discovers `Appointment` rows where `scheduledFor` is exactly 1 day away or exactly today, and upserts `WhatsAppReminderTask` rows with `kind = APPOINTMENT_REMINDER`, `sourceType = 'APPOINTMENT'`, `sourceId = appointment.id`, `touch = 'ADVANCE' | 'ON_DATE'`. This reuses:
- The two-touch model (D-18 = D-01's exact shape)
- The escalation state machine (Pattern 5 in 07-RESEARCH) — though note D-18 does not lock escalation-on-no-reply for appointment reminders the way D-03 does for follow-ups; **flag this as an open question** (see § Open Questions) rather than silently assuming escalation applies.
- The consent/STOP category split (D-17 explicitly requires this)
- The owner-reply KEEP/MOVE/CANCEL bridge, using the inbound payload namespace Phase 7's research *already reserved* for this: `appointment:keep:<uuid>`, `appointment:move:<uuid>`, `appointment:cancel:<uuid>` (see Phase 7 07-RESEARCH.md Pattern 7, "extensible to `appointment:keep:<uuid>` in Phase 8").

### Anti-Patterns to Avoid

- **A1 — Per-appointment BullMQ delayed jobs for the queue handoff or reminders.** Booking horizon is up to 90 days; this project's Redis runs `allkeys-lru` eviction. Use the sweep pattern (Pattern 2/5), not `queue.add(..., { delay })`.
- **A2 — Raw-SQL coalesce for queue ordering.** `queuePriorityAt` (Pattern 3) is strictly simpler and fully typed.
- **A3 — A new parallel `AppointmentReminderTask` table.** Duplicates Phase 7's escalation machinery for no benefit; extend `kind` instead (Pattern 5).
- **A4 — Excluding double-booked slots from `generateSlotsForVetDay`'s output.** D-14 requires allow-with-warning, not exclusion; excluding them would silently contradict a locked decision.
- **A5 — Starting the sweep's BullMQ `Worker` unconditionally inside a routes-registration plugin.** `notification.routes.ts:14-15` already does this and Phase 7's research flagged it (Pitfall 7) as a source of test flakiness (workers firing mid-`vitest`-run). Gate `new Worker(...)` on `process.env.NODE_ENV !== 'test'` for the new scheduling worker too.
- **A6 — Building real web push (VAPID/service worker) for D-25's "browser-notification prompt."** D-26 locks push as staff-only via the existing Expo mobile setup; the web calendar's notification prompt (per ROADMAP.md 08-06) should use the plain browser `Notification` API triggered by an already-open Socket.IO connection — a foreground-only in-tab notification, not background push infrastructure. Scoping in VAPID/service-worker push would silently exceed D-26.
- **A7 — Editing `Clinic.workingHours` to add per-vet fields.** That JSON blob is Phase 1/7's clinic-level hours contract (`workingHoursBodySchema`) and Phase 7's WhatsApp booking already depends on its exact shape (Pitfall 15 in 07-RESEARCH.md). Per-vet availability is a new, separate model (Pattern 1), not a mutation of the existing clinic-level one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Long-horizon scheduled side-effects (queue handoff, no-show, reminders) | Per-record BullMQ delayed jobs or `setTimeout` | BullMQ `upsertJobScheduler` sweep over Postgres-owned state | Redis `allkeys-lru` eviction silently drops long-delay jobs — already proven in this repo's Phase 7 research |
| Multi-ECS-task-safe recurring jobs | `node-cron` (in-process) | BullMQ `upsertJobScheduler` (Redis-coordinated, fires once) | `node-cron` fires once per process; `infra/aws/` deploys ECS tasks, so N tasks = N duplicate side effects (already the exact finding in Phase 7's research, directly applicable here) |
| Queue ordering that respects both walk-in arrival and appointment slot time | Raw SQL `COALESCE`/query-time merge sort | `queuePriorityAt` column set once at entry-creation time | One indexed column + one existing `orderBy` clause; no new query complexity |
| Recurring appointment generation | Custom RRULE parser | A bounded, explicit loop generating N `Appointment` rows sharing a `recurringSeriesId`, capped by the booking-horizon (D-07) | D-22 explicitly asks for "basic recurrence," not RFC 5545 RRULE support; a hand-rolled bounded loop is simpler and fully auditable |
| Owner-initiated appointment changes via WhatsApp | A new conversational state machine | Phase 7's existing `InboundRouterService` + payload-namespace convention (`appointment:<action>:<id>`), which Phase 7's own research already reserved for this | Avoids parallel infrastructure; Phase 7 designed the seam specifically so Phase 8 would not need to build one |
| Realtime multi-device sync | Polling, SSE, or a new WebSocket server | Existing Socket.IO `clinic:{clinicId}` room (`apps/api/src/realtime/socket.ts`) | Already authenticated, already Redis-adapter-scaled, already proven for the queue board |
| Staff push delivery | A new push provider integration | `PushService.send()` (Expo) + `DeviceToken` model, both already built | D-26 explicitly says reuse the existing Expo setup |
| Per-service appointment duration | A new duration field on `Appointment` disconnected from the service catalog | Read `ServiceCatalog` (Phase 4 ONB-02) at booking time; store the resolved `durationMinutes` on the `Appointment` row as a snapshot (so later service-catalog edits don't retroactively resize past appointments) | D-02 locks this; snapshotting avoids a subtle bug where editing a service's duration months later silently changes historical appointment slot widths |

**Key insight:** every "hard" problem in this phase is a scheduling-durability problem this codebase has already solved once, in Phase 7, for a structurally identical need (reminders that must survive Redis eviction, a sweep that must not double-fire across ECS tasks, an inbound payload namespace designed for exactly this extension). The novel work is almost entirely the per-vet availability data model (Pattern 1) and the `queuePriorityAt` ordering trick (Pattern 3) — everything else is applying an already-validated pattern to a new table.

## Common Pitfalls

### Pitfall 1: `node-cron` duplicates every sweep once ECS scales past one task
**What goes wrong:** Two ECS tasks each run the 5-minute scheduling sweep in-process; patients get duplicate "starting soon" pushes, or (less likely but possible with poor guard design) duplicate `QueueEntry` rows.
**Why it happens:** `apps/api/src/jobs/midnight-archive.ts` uses in-process `node-cron`; `infra/aws/` deploys ECS task definitions with no cross-process coordination for `node-cron`.
**How to avoid:** Use BullMQ `upsertJobScheduler` (already the Phase 7-recommended fix for the identical problem) plus idempotency guards on each of the sweep's three passes (nullable timestamp columns, not a `findFirst` race — see Pattern 2).
**Warning signs:** `cron.schedule` appearing anywhere in the scheduling module.

### Pitfall 2: Building on top of Phase 7 modules/files that do not exist yet
**What goes wrong:** Plans reference `apps/api/src/lib/ist-date.ts`, `apps/api/src/modules/whatsapp/`, or `InboundRouterService` as if already built, and fail at execution time.
**Why it happens:** As of this research session, Phase 7 has **zero implementation** — `apps/api/src/modules/whatsapp/` does not exist, and `ist-date.ts` is only a stated intent in Phase 7's own plans (`07-04-PLAN.md`), not yet-written code. Roadmap execution order (1→2→...→8) means Phase 7 should be complete by the time Phase 8 executes, but the planner must not assume this silently.
**How to avoid:** Phase 8's Wave 1 (schema/contracts wave, per ROADMAP.md's `08-01-PLAN.md`) should include an explicit dependency check: confirm `apps/api/src/modules/whatsapp/`, `ist-date.ts`, and `InboundRouterService` exist and match the shapes described in `07-RESEARCH.md` before Wave 3's reminder/owner-action-bridge work begins. If they don't exist, that is a blocking cross-phase gap, not a Phase 8 implementation bug.
**Warning signs:** an import of `apps/api/src/lib/ist-date.ts` or `apps/api/src/modules/whatsapp/inbound-router.service.ts` failing to resolve.

### Pitfall 3: `AuthAuditLog`'s enum is auth-only, again
**What goes wrong:** `writeAuditLog(prisma, 'APPOINTMENT_CANCELLED', ...)` is a type error.
**Why it happens:** `apps/api/src/lib/audit-log.ts`'s `AuditEvent` enum contains only auth + EMR events today; Phase 7 will need to extend it for WhatsApp events, and Phase 8 needs the same extension for scheduling events.
**How to avoid:** Extend the shared `AuditEvent` enum with `APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_NO_SHOW`, `AVAILABILITY_UPDATED` — coordinate with whichever phase (7 or 8) lands first so the enum extension isn't done twice with conflicting values.
**Warning signs:** a string cast (`'APPOINTMENT_CANCELLED' as AuditEvent`) anywhere — that's the tell that the enum wasn't actually extended.

### Pitfall 4: BullMQ `Worker` started unconditionally inside a routes-registration plugin
**What goes wrong:** The scheduling sweep worker fires during `vitest` runs, mutating fixtures mid-test, exactly as Phase 7's research already documented happening with `notification.routes.ts:14-15`.
**Why it happens:** That file constructs both the BullMQ bus and worker unconditionally at route-registration time, and `buildTestApp()` registers all routes including this one.
**How to avoid:** Construct the scheduling `Queue` always (tests need to enqueue/inspect), but gate `new Worker(...)` on `process.env.NODE_ENV !== 'test'`, exactly as Phase 7's research recommends for the WhatsApp module. Expose a directly-callable `runSchedulingSweep(deps)` function so tests can exercise sweep logic without a live worker.
**Warning signs:** `new Worker(...)` at the top level of `scheduling.routes.ts`.

### Pitfall 5: Alert fatigue from the "queue is backing up" push trigger (D-27 trigger 3)
**What goes wrong:** Every single check-in past the backlog threshold re-fires a staff push, spamming the clinic's phones during a genuinely busy (and thus genuinely inconvenient-to-be-interrupted) period.
**Why it happens:** `queue.service.ts:checkIn` already broadcasts on every check-in; naively hooking a push send onto that same broadcast with a simple `if (waitingCount > N)` check fires on every subsequent check-in once the threshold is crossed, not just the first crossing.
**How to avoid:** Debounce — track a per-clinic-per-day `lastBacklogAlertAt` (in-memory is not durable enough across restarts/ECS tasks; a lightweight Postgres row or Redis key with a TTL is safer) and only send if the last alert was more than a configurable window ago (recommend 30 minutes) or if the backlog just crossed the threshold from below. This is not explicitly specified in CONTEXT.md — flagged in § Open Questions as needing a concrete threshold/debounce value before implementation.
**Warning signs:** a push notification test asserting "sends every time `waitingCount > N`" rather than "sends once per backlog episode."

### Pitfall 6: Treating `Appointment.scheduledFor` as both wall-clock truth and display truth after a MOVE
**What goes wrong:** After a staff-driven MOVE (rescheduling to a new slot), old push/reminder tasks or the sweep's "already notified" markers reference the stale time, causing either a missed reminder for the new time or a duplicate reminder for the old one.
**Why it happens:** If `scheduledFor` is mutated in place on reschedule, any `WhatsAppReminderTask` rows already upserted for the old date (keyed by `sourceId = appointment.id`) become stale — their `scheduledFor`-derived due dates no longer match reality, but their idempotency key (`sourceId`) is unchanged so they won't be re-created.
**How to avoid:** On reschedule, explicitly cancel/re-upsert any `PENDING`/`SENT` `WhatsAppReminderTask` rows tied to that appointment (mirroring Phase 7's Pitfall 3 fix for superseded vaccination records — "transition existing PENDING/SENT tasks to CANCELLED when a newer record supersedes their source"), and reset the sweep's own "already notified" marker columns (`startingSoonNotifiedAt`, etc.) to null on reschedule.
**Warning signs:** a reschedule test that doesn't also assert the old reminder task was cancelled.

## Code Examples

### Slot generation, generalized from Phase 7's booking slot service (SCH-01, D-01/D-02)

```typescript
// Source: apps/api/src/modules/whatsapp/booking/slot.service.ts (Phase 7, planned shape,
// verified against 07-10-PLAN.md Task 1 behavior spec) — Phase 8 generalizes this exact
// shape from (clinicId, fixedDuration) to (vetId, perServiceDuration).
export interface SlotOption {
  startMinutes: number;
  endMinutes: number;
  isDoubleBooked: boolean; // D-14: flag, never exclude
}

export function generateSlotsForVetDay(
  hours: { openMinutes: number; closeMinutes: number } | null, // null = closed (override or template)
  blocked: Array<{ startMinutes: number; endMinutes: number }>,
  existing: Array<{ startMinutes: number; endMinutes: number }>,
  durationMinutes: number,
): SlotOption[] {
  if (!hours) return [];
  const slots: SlotOption[] = [];
  for (let start = hours.openMinutes; start + durationMinutes <= hours.closeMinutes; start += durationMinutes) {
    const end = start + durationMinutes;
    const isBlocked = blocked.some((b) => start < b.endMinutes && end > b.startMinutes);
    if (isBlocked) continue;
    const isDoubleBooked = existing.some((e) => start < e.endMinutes && end > e.startMinutes);
    slots.push({ startMinutes: start, endMinutes: end, isDoubleBooked });
  }
  return slots;
}
```

### `queuePriorityAt` ordering change (SCH-02, D-10)

```typescript
// Source: apps/api/src/modules/queue/queue.repository.ts (this repo, verified current code at line 154-166)
// BEFORE (Phase 3, current):
this.prisma.queueEntry.findMany({
  where: { clinicId, status: 'WAITING', checkedInAt: { gte: today }, archivedAt: null },
  orderBy: [{ isEmergency: 'desc' }, { checkedInAt: 'asc' }],
});

// AFTER (Phase 8 addition — one field renamed in the orderBy, one new column, no other logic changes):
this.prisma.queueEntry.findMany({
  where: { clinicId, status: 'WAITING', checkedInAt: { gte: today }, archivedAt: null },
  orderBy: [{ isEmergency: 'desc' }, { queuePriorityAt: 'asc' }],
});
```

### BullMQ `upsertJobScheduler` for a durable, ECS-safe sweep (SCH-02/SCH-05, D-09)

```typescript
// Source: pattern verified in apps/api/node_modules/bullmq (5.81.3) type definitions this session,
// and already the documented recommendation in .planning/phases/07-whatsapp-communication/07-RESEARCH.md
// Pattern 4 / Pitfall 2 for the structurally identical problem.
await schedulingQueue.upsertJobScheduler(
  'scheduling-sweep',
  { pattern: '*/5 * * * *', tz: 'Asia/Kolkata' },
  { name: 'sweep', data: {} },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `node-cron` for scheduled sweeps (Phase 3's `midnight-archive.ts`) | BullMQ `upsertJobScheduler` | Identified as a gap during Phase 7 research (2026-08-12), applies equally to Phase 8 | Phase 8's new sweep must not repeat the `node-cron` pattern even though it's the only precedent in the codebase today; the midnight-archive job itself is out of scope to fix in Phase 8 |
| `Clinic.workingHours: Json?` (clinic-level, untyped) as the only hours model | Per-vet `VetAvailabilityTemplate` + `AvailabilityOverride` + `BlockedPeriod` (typed Prisma models) | New in Phase 8 (D-04 requires per-vet, which the clinic-level JSON blob cannot represent) | Phase 7's WhatsApp booking continues reading `Clinic.workingHours` unchanged (its own separate, already-locked contract) — Phase 8 does not touch or migrate that field |

**Deprecated/outdated:** None — this is a greenfield data model within an established codebase; no prior Phase 8-scoped code exists to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 20-minute no-show grace window (D-09 discretion) | Pattern 2 | Low — easily changed to a constant later; CONTEXT.md's own recommended range is 15-30 min, so 20 is within the already-accepted range |
| A2 | 5-minute sweep interval for queue-handoff/no-show/starting-soon-push | Pattern 2 | Low-medium — too long delays EXPECTED creation and "starting soon" pushes by up to 5 min; too short adds needless DB load. Recommend confirming against real clinic volume during Beta if 5 min feels laggy |
| A3 | 15-minute lead time for the "starting soon" staff push (D-27 trigger 1) | Pattern 2 | Low — not locked in CONTEXT.md at all; purely Claude's discretion, easily tunable |
| A4 | 30-minute debounce window for the "queue backing up" push (D-27 trigger 3) | Pitfall 5 | Medium — no threshold N or debounce value is locked in CONTEXT.md; shipping without *some* debounce risks real alert fatigue in a live pilot clinic, which is a product-trust risk, not just a technical one |
| A5 | Escalation-on-no-reply does NOT automatically apply to `APPOINTMENT_REMINDER` the way it does to `FOLLOW_UP`/`VACCINE_DUE`/`DEWORMING_DUE` | Pattern 5 | Medium — if the planner silently inherits Phase 7's escalation behavior for appointment reminders, an owner who doesn't reply to "your appointment is tomorrow" could get a third unplanned resend; this needs an explicit CONTEXT.md decision or discuss-phase follow-up, not an assumed inheritance |
| A6 | Per-vet availability is edited from a dedicated Settings screen, not inline in the calendar (D-27 discretion item) | Open Questions | Low — either is workable; dedicated screen matches the existing Admin-config-screen precedent (WhatsApp simulator config, billing settings) |

## Open Questions

1. **Does appointment-reminder escalation (bounded resend on no-reply) apply, matching Phase 7's D-03 pattern?**
   - What we know: D-18 locks the *cadence* (1 day before + day of) identically to Phase 7's D-01. D-16 locks owner-reply handling (KEEP/CANCEL auto-apply, MOVE creates a staff task).
   - What's unclear: CONTEXT.md never states whether a non-reply to the day-of reminder triggers Phase 7's D-03/D-04 escalation-and-cap-to-`needsAction` behavior, or whether appointment reminders are "fire twice, no escalation" by design (arguably more appropriate — an appointment reminder needing a reply is different from a follow-up reminder, since the owner already committed to a specific time).
   - Recommendation: surface this as a discuss-phase follow-up question before planning locks in the reminder-task extension; recommend "no escalation" as the default (the appointment itself is the commitment, not the reminder reply) unless the user wants parity with D-03.

2. **What is the "queue backing up" threshold and debounce window (D-27 trigger 3)?**
   - What we know: the trigger exists and should fire via staff push, in addition to the existing in-app Socket.IO update.
   - What's unclear: no N (patient count) or debounce interval is locked.
   - Recommendation: default N=5 waiting patients, 30-minute debounce per clinic-day, configurable later if pilot clinics report it's noisy or too quiet — but this should be confirmed, not silently assumed at plan-write time.

3. **Does a `MOVE` staff task (D-16) need a new UI surface, or does it reuse the existing Notification system?**
   - What we know: `Notification` model + `NotificationList`/`NotificationBadge` components already exist (Phase 2 NTF-02); D-16 says MOVE "creates a staff task/notification."
   - What's unclear: whether "task" implies a new dedicated task-tracking surface (with an explicit done/dismissed state beyond `isRead`) or whether the existing generic `Notification` row (module='scheduling', type='MOVE_REQUEST') is sufficient.
   - Recommendation: reuse the existing `Notification` model — it already has `isRead`, `data: Json` for the appointment/booking id, and a rendering surface. A dedicated task system would be new scope not requested by any locked decision.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| PostgreSQL | Appointment/availability schema | ✓ | 16 (per CLAUDE.md) | — |
| Redis | BullMQ sweep scheduler | ✓ | 7+ (per CLAUDE.md); `allkeys-lru` eviction confirmed via `docker-compose.yml` (Phase 7 research) | Must design around eviction (Pattern 2), not around Redis being absent |
| BullMQ `upsertJobScheduler` | Sweep scheduling | ✓ | `5.81.3` installed, confirmed present in type definitions this session | — |
| Socket.IO server | Realtime sync (SCH-04) | ✓ | `^4.8.3`, `clinic:{clinicId}` room already implemented | — |
| `socket.io-client` in `apps/web` | Web calendar realtime sync (SCH-04) | ✗ | not installed | Add `socket.io-client@^4.8.3` (matches `apps/mobile`'s pinned version) — trivial, not a blocking gap |
| Expo push (`expo-server-sdk`, `expo-notifications`) | Staff push (SCH-05, D-26) | ✓ | `^7.0.0` / `~0.29.0` | — |
| Phase 7 WhatsApp module (`apps/api/src/modules/whatsapp/`) | Owner-action bridge (D-16/D-17), booking formalization (D-12) | ✗ (not yet implemented as of this research session) | — | Blocking for Wave 3 (reminder/owner-action work per ROADMAP.md `08-04-PLAN.md`) if Phase 7 has not executed by then — see § Common Pitfalls Pitfall 2 |
| `apps/api/src/lib/ist-date.ts` | All IST-anchored date math (slot generation, sweep, reminders) | ✗ (only a stated Phase 7 plan intent, not yet-written code) | — | If missing when Phase 8 executes, extract it from `QueueRepository.getTodayIST()` as Phase 7's own plan already specifies, rather than duplicating IST logic inline in the scheduling module |

**Missing dependencies with no fallback:** none — both gaps above have a clear, low-risk fallback.

**Missing dependencies with fallback:** `socket.io-client` in `apps/web` (trivial add); Phase 7 module/`ist-date.ts` (extract per Phase 7's own already-specified plan if not yet landed).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^2.1.0` (both `apps/api` and `apps/mobile`) |
| Config file | `apps/api/vitest.config.ts` (`fileParallelism: false`, `testTimeout: 30000`, setup file `tests/helpers/setup.ts`) |
| Quick run command | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling` |
| Full suite command | `pnpm --filter @breeyo/api test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| SCH-01 | Staff can create an appointment for a patient within the vet's available hours, honoring per-service duration | unit + integration | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/appointment.service.test.ts` | ❌ Wave 0/1 |
| SCH-01 | Slot generation excludes blocked periods, respects weekly template + date overrides, flags (not excludes) double-bookings | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/slot.service.test.ts` | ❌ Wave 0/1 |
| SCH-02 | Sweep creates an `EXPECTED` `QueueEntry` at slot time, one per pet on a multi-pet appointment | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/queue-handoff.test.ts` | ❌ Wave 0/2 |
| SCH-02 | No-show auto-flip fires only after the grace window elapses, and only once (idempotent re-run) | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/no-show-sweep.test.ts` | ❌ Wave 0/2 |
| SCH-02 | Checked-in scheduled patient sorts ahead of a later-arriving walk-in (`queuePriorityAt` ordering) | integration | `pnpm --filter @breeyo/api test -- --run tests/queue/queue-priority-ordering.test.ts` | ❌ Wave 0/1 (extends existing `apps/api/src/modules/queue/__tests__/queue.service.test.ts`) |
| SCH-03 | Day-range and week-range appointment reads return the correct vet-tagged, date-bounded set | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/appointment-reads.test.ts` | ❌ Wave 0/2 |
| SCH-04 | Appointment create/update/cancel broadcasts on `clinic:{clinicId}` and both mobile and web sockets receive it | manual + integration (server-side emit assertion) | `pnpm --filter @breeyo/api test -- --run tests/scheduling/realtime-broadcast.test.ts` | ❌ Wave 0/3; mobile/web client receipt is human-verified in Wave 5 (`08-07-PLAN.md`) |
| SCH-05 | Staff push fires for starting-soon appointments, owner MOVE/CANCEL replies, and (debounced) queue backlog | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/push-triggers.test.ts` | ❌ Wave 0/3 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @breeyo/api test -- --run <changed-file's-test>`
- **Per wave merge:** `pnpm --filter @breeyo/api test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the Wave 5 human end-to-end verification already scheduled in ROADMAP.md (`08-07-PLAN.md`)

### Wave 0 Gaps
- [ ] `tests/helpers/factories.ts` — add `createTestAppointment`, `createTestVetAvailabilityTemplate`, `createTestAvailabilityOverride`, `createTestBlockedPeriod`
- [ ] `apps/api/src/modules/scheduling/__tests__/` — new test directory, no existing scaffolding
- [ ] `tests/scheduling/` — new integration test directory
- [ ] Confirm `apps/api/src/lib/ist-date.ts` exists (Phase 7 dependency, see § Common Pitfalls Pitfall 2) before writing any IST-anchored sweep test
- [ ] Extend `apps/api/src/modules/queue/__tests__/queue.service.test.ts` with `queuePriorityAt` ordering cases rather than only adding new scheduling-module tests, since this is a change to existing Phase 3 code

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No (new surface, reuses existing JWT) | Existing `@fastify/jwt` + `authenticate` middleware |
| V3 Session Management | No | Unchanged from existing session model |
| V4 Access Control | Yes | `requirePermission('VIEW_SCHEDULE')` / `requirePermission('MANAGE_SCHEDULE')` — both permissions already exist and are seeded onto Admin, Clinician, and FrontDesk roles [VERIFIED: `apps/api/prisma/seed.ts`]; explicit `clinicId` filtering on every repository method (project-wide pattern, not RLS) |
| V5 Input Validation | Yes | Zod schemas in `@breeyo/validators` for appointment create/update, availability template, blocked-period requests — reject malformed weekday/minute values before they reach the slot-generation math |
| V6 Cryptography | No | No new secrets or crypto in this phase |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Cross-tenant appointment/availability read or write via a guessed UUID | Information Disclosure / Elevation of Privilege | Every scheduling repository method takes `clinicId` as an explicit first parameter and filters on it, matching the dominant project pattern (Pitfall 5 discussion above); cross-tenant lookups should throw 404, not 403, to avoid existence disclosure (matching Phase 7's own established convention) |
| Owner-controlled WhatsApp payload driving a privileged appointment state change (e.g. a forged `appointment:cancel:<uuid>` for someone else's appointment) | Elevation of Privilege | `cancelAppointment`/rescheduling via the owner bridge must resolve the appointment through the *thread's own* owner/pet linkage (never trust a bare id from the inbound payload without checking it belongs to that WhatsApp thread's owner) — mirrors Phase 7's `cancelBooking`/`moveBooking` requiring a real actor, generalized to "the inbound thread's owner must match the appointment's owner" for the owner-initiated path specifically |
| Double-booking abuse as a denial-of-service vector (a malicious/careless staff member stacking many overlapping appointments) | Business Logic Abuse | D-14 explicitly allows this with only a warning — not a security control this phase needs to add; flagged here only so the planner doesn't accidentally over-engineer a hard block that contradicts the locked decision |
| Sweep worker running twice (duplicate side effects) | Tampering (data integrity) | BullMQ `upsertJobScheduler` (Redis-coordinated) + idempotency marker columns on `Appointment`, matching Pattern 2 |
| Push token misuse (sending to a stale/uninstalled-app token) | — (not a security threat, an operational one) | Already handled by `PushService.send()`'s existing `DeviceNotRegistered` invalid-token cleanup — no new work needed |

## Sources

### Primary (HIGH confidence — direct codebase inspection this session)
- `apps/api/prisma/schema.prisma` — full schema read; confirmed `QueueEntryStatus`, `QueueEntry`, `ServiceCatalog`, `Clinic.workingHours`, `ConsentRecord`, `DeviceToken` shapes
- `apps/api/src/modules/queue/queue.service.ts`, `queue.repository.ts` — verified check-in, status-transition, and ordering logic (the exact lines Pattern 3 modifies)
- `apps/api/src/modules/notifications/push.service.ts`, `notification-bus.ts` — verified `PushService.send()` and BullMQ `Queue` dispatch pattern
- `apps/api/src/realtime/socket.ts` — verified `clinic:{clinicId}` room, JWT auth-on-connect, Redis adapter
- `apps/api/src/jobs/midnight-archive.ts` — verified existing `node-cron` precedent (and its known weakness)
- `apps/api/prisma/seed.ts` — verified `VIEW_SCHEDULE`/`MANAGE_SCHEDULE` permissions already exist and are seeded
- `apps/api/package.json`, `apps/mobile/package.json`, `apps/web/package.json`, root `package.json` — verified all installed dependency versions and the `apps/web` gap
- `packages/types/src/constants/queue-status.ts`, `socket-events.ts` — verified enum/transition-table shape to extend
- `.planning/phases/07-whatsapp-communication/07-RESEARCH.md`, `07-10-PLAN.md`, `07-CONTEXT.md` — this session's single richest source; every BullMQ/sweep/reminder/booking recommendation in this document either directly reuses or explicitly generalizes a finding already verified there against this same codebase
- `npm view socket.io-client version`, `npm view expo-server-sdk version` — run this session, confirmed current

### Secondary (MEDIUM confidence)
- None — every claim in this document traces to a direct codebase read or to Phase 7's already-HIGH-confidence research, so no WebSearch-only findings were needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new npm dependencies in `apps/api`; the one `apps/web` addition is an exact-version match to an already-installed, already-working dependency
- Architecture: HIGH — every pattern either directly reuses existing code (`queue.service.ts`, `socket.ts`, `push.service.ts`) or generalizes a pattern Phase 7's own research already validated against this codebase (BullMQ sweeps, slot generation, inbound payload namespace)
- Pitfalls: HIGH for the BullMQ/sweep/worker-in-routes-plugin findings (directly inherited from Phase 7's verified research); MEDIUM for the alert-fatigue and escalation-inheritance open questions, which are genuinely unresolved product decisions, not technical uncertainty

**Research date:** 2026-08-12
**Valid until:** 30 days, or immediately upon Phase 7 execution completing (re-verify `apps/api/src/modules/whatsapp/` and `ist-date.ts` actually exist and match the shapes assumed here before Phase 8 Wave 3 begins)
