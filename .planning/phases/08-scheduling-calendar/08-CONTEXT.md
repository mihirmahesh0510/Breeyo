# Phase 8: Scheduling & Calendar - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A vet or front desk can schedule future appointments for a patient against a real per-vet availability calendar, view that calendar in day (mobile) and week (web) views with real-time sync, and have scheduled appointments automatically merge into the Phase 3 walk-in queue at their time slot — first as an `EXPECTED` placeholder, becoming a true `WAITING` queue entry only on check-in. The phase also formalizes Phase 7's WhatsApp provisional-booking stopgap into real appointments, adds an appointment-specific WhatsApp reminder with owner KEEP/MOVE/CANCEL actions (reusing Phase 7's abstraction layer), and delivers staff-only push notifications for upcoming appointments, owner reply actions, and queue backlog. It does not build owner-facing push (no owner app/PWA exists in v1) or a broader web dashboard (Phase 9 owns that) — Phase 8 builds only the calendar screen as the web app's first real feature.

</domain>

<decisions>
## Implementation Decisions

### Availability Model
- **D-01:** Availability is a weekly recurring template (e.g. Mon-Sat 9am-6pm) with per-date overrides for holidays/half-days/vacation.
- **D-02:** Appointment slot length is derived per-service from the service catalog (Phase 4 ONB-02), not a single fixed clinic-wide duration.
- **D-03:** No hard walk-in-capacity reservation — appointments simply claim their exact slot; walk-ins fill in around them via Phase 3's existing queue-position logic. No configurable buffer/reserved-capacity setting for Beta.
- **D-04:** Availability is set **per-vet**, not per-clinic — each vet (the `treatingVetId` already on `QueueEntry`) has their own weekly template + overrides. Solo-vet clinics just configure one vet's schedule; multi-vet clinics configure each.
- **D-05:** A vet can add sub-day blocked periods (start/end time) within a working day — e.g. lunch, a meeting — without taking the whole day off. Slots inside a blocked period aren't offered for booking.
- **D-06:** Blocked-period reason is a preset catalog (Lunch, Break, Personal, Off-site, Meeting) plus a free-text "Other" option.
- **D-07:** Booking horizon is capped (e.g. 90 days out) — Claude's discretion on exact cap value; validate at booking time.

### Queue Handoff Semantics
- **D-08:** At the scheduled time, a queue entry is created in a **new `EXPECTED` status** — not directly `WAITING`. This requires adding `EXPECTED` to Phase 3's `QueueEntryStatus` enum (`WAITING | IN_CONSULT | DONE | NO_SHOW` today, in `apps/api/prisma/schema.prisma`).
- **D-09:** If nobody checks the patient in within a grace window after the slot time (Claude's discretion on exact minutes, e.g. 15-30 min), the entry auto-flips to `NO_SHOW` (reusing Phase 3's existing status) via a scheduled sweep/job.
- **D-10:** On check-in, a checked-in scheduled patient's queue position is ordered **by scheduled time**, ahead of walk-ins who arrived after that slot was due — honoring the appointment as a real time commitment. This is an addition to Phase 3's existing position-ordering logic (D-19 in `03-CONTEXT.md`), not a replacement.
- **D-11:** Early check-in (before the slot time) flips `EXPECTED` → `WAITING` immediately — no waiting-for-slot-time behavior.
- **D-12:** Confirmed WhatsApp bookings (Phase 7 D-06 to D-09's provisional-booking + slot-blocking stopgap) now create **real `Appointment` records** checked against real per-vet availability, retiring Phase 7's standalone slot-blocking mechanism. This is a cross-phase integration point — Phase 8's plans must include wiring Phase 7's booking-confirmation path into Phase 8's appointment creation.
- **D-13:** `EXPECTED` entries **are shown on the existing Phase 3 Queue board** (mobile), with a distinct badge — not hidden in a schedule-only view. Front desk gets visibility into who's coming without leaving the queue screen they live in all day.

### Booking Management
- **D-14:** Double-booking is **allowed, with a warning only** — staff can override for edge cases (a quick recheck squeezed in); the system does not hard-block.
- **D-15:** Reschedule/cancel is **staff-only in the app**, plus **owner-initiated via WhatsApp** reply to the appointment reminder (see D-19).
- **D-16:** Owner WhatsApp replies: `KEEP` and `CANCEL` auto-apply immediately (unambiguous). `MOVE` cannot be auto-applied (needs a specific new slot) — it creates a staff task/notification to pick a new time with the owner.
- **D-17:** Appointment reminders reuse Phase 7's WhatsApp abstraction layer, provider port, notification-bus pattern, and consent/opt-out rules — a new "Appointment reminder" template is added to Phase 7's template set, not a parallel messaging mechanism.
- **D-18:** Appointment reminder cadence mirrors Phase 7's D-01 pattern: fires once **1 day before**, and again **the day of** the appointment.
- **D-19:** Staff select the patient when booking via the **same owner/pet mobile-number lookup** used at check-in (Phase 3 D-05/D-13) — type mobile, pick from existing owner's pets, or register inline if not found.
- **D-20:** An `Appointment` has its own lifecycle, distinct from the queue entry it spawns: **`SCHEDULED` → `CHECKED_IN` → `COMPLETED`**, or **`CANCELLED`** / **`NO_SHOW`**. No separate "confirmed" state — auto-confirm behavior (matching Phase 7 D-06) means `SCHEDULED` already implies confirmed.
- **D-21:** One appointment can cover **multiple pets** from the same owner in a single visit/slot (e.g. two dogs for vaccination). At queue handoff, one `Appointment` spawns one `QueueEntry` per pet.
- **D-22:** Basic recurrence is supported — a vet can set a repeat pattern (e.g. weekly × N occurrences) when booking, generating multiple linked `Appointment` records at once. Claude's discretion on the exact recurrence UI/data model (e.g. a `recurringSeriesId` linking generated appointments).
- **D-23:** The calendar's default view shows **all vets combined** (color-coded/labeled per vet), with a filter to narrow to one vet's schedule — consistent with Phase 3 D-36's "same view for all roles" philosophy.

### Calendar UX & Notifications
- **D-24:** Mobile's primary calendar view is a **day agenda** — a scrollable list of the day's appointments with date navigation (picker/arrows) — not a dense week grid. Matches PROJECT.md's one-handed, mobile-first constraint.
- **D-25:** Web's primary calendar view is a **staff-first 7-day week grid** (columns = days, rows = time slots), built with plain React + the existing design-token CSS (`packages/ui/src/theme/portal.css`). This is the **first real screen** in the currently-blank `apps/web` scaffold (today it's only `layout.tsx` + `page.tsx` + `src/lib/api.ts`) and establishes patterns Phase 9's broader web dashboard will extend — it does not itself build Phase 9's dashboard shell.
- **D-26:** Push notifications for Beta are **staff-only** — sent to clinic staff devices via the existing Expo push setup (`apps/api/src/modules/notifications/push.service.ts`). No owner-facing push in v1 (no owner mobile app/PWA exists; Phase 9's owner portal is a browser magic-link, not push-capable). Design the push-sending code generically enough that adding an owner recipient later is a new token registration, not a rebuild.
- **D-27:** Staff push notification triggers: (1) an upcoming appointment starting soon, (2) an owner replied MOVE/CANCEL via WhatsApp (D-16), (3) the queue is backing up (e.g. N patients waiting). These are in addition to existing in-app Socket.IO real-time updates, which already cover the app-open case.

### Plan Review Follow-ups (2026-08-16)

Gaps surfaced during `--review` of the 15 finalized plans, resolved with the user before build:

- **D-28:** When staff or an owner cancels/reschedules an appointment whose `EXPECTED` queue entry already exists on the board, that entry is removed immediately — it never reaches `NO_SHOW` via the grace-window sweep. Cancel/reschedule paths must reach into the queue to clear it.
- **D-29:** Web calendar notifications are foreground-tab-only for Beta (no service worker, no background/closed-tab delivery) and may show patient/owner names on-screen — this trade-off is accepted. Staff working off-tab rely on the in-app queue/calendar view, not push, per D-26's staff-only push scope.
- **D-30:** Weekly availability template edits and blocked-period creation both compute and display an affected-appointment count with a confirm step before applying, matching the existing date-override (D-01) warning flow — not silent like the original plans had them.
- **D-31:** Recurring series (D-22): an occurrence landing on a day the vet is unavailable is skipped at booking time (staff is told which occurrences were skipped, not a hard rejection of the whole series); moving one occurrence detaches it from the series; "Cancel All" only cancels remaining future `SCHEDULED` occurrences, never ones already `CHECKED_IN`/`COMPLETED`.
- **D-32:** Multi-pet appointments (D-21) use a single shared service/duration for the entire visit; cancellation is all-or-nothing across every pet in the appointment — no per-pet service selection or per-pet cancel in Beta.
- **D-33:** Owner WhatsApp KEEP/MOVE/CANCEL replies (D-16) all get an acknowledgment: KEEP and CANCEL confirm the action took effect; MOVE confirms staff will follow up with a new time. A CANCEL arriving after the patient has already been checked in gets a reply explaining the visit has already started and to contact the clinic directly.
- **D-34:** Double-booking (D-14) is serialized server-side per slot so a second concurrent booking attempt always sees the double-book warning rather than silently succeeding unwarned; when two appointments legitimately share the same time (warning accepted by staff), queue priority at check-in goes to whichever patient checks in first.
- **D-35:** Web calendar login (D-25) has no role restriction beyond existing authentication — any staff role that can use the mobile app can also log into the web calendar; existing per-action RBAC/permission checks still apply unchanged.

### Claude's Discretion
- Exact booking-horizon cap value (D-07) — recommended: 90 days
- Exact no-show grace-window duration (D-09) — recommended: 15-30 minutes
- Recurring-appointment data model/UI shape (D-22) — e.g. `recurringSeriesId` field linking generated `Appointment` rows
- BullMQ job design for the no-show sweep and appointment reminder cadence (delay jobs, repeatable jobs, or cron sweep — matching Phase 5/7's existing daily-sweep pattern)
- Exact push notification copy/payload shape
- Whether per-vet availability templates are edited from a dedicated Settings screen or inline in the calendar

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value (mobile-first for solo vets), walk-in-coexistence constraint ("appointment system must never conflict with or impede walk-in patient flow"), India data residency, price sensitivity
- `.planning/REQUIREMENTS.md` — SCH-01 through SCH-05 are the requirements for this phase
- `.planning/ROADMAP.md` — Phase 8 goal, success criteria, dependency on Phase 7

### Prior Phase Context
- `.planning/phases/07-whatsapp-communication/07-CONTEXT.md` — Provisional booking + slot-blocking stopgap (D-06 to D-09) that Phase 8 formalizes (D-12); WhatsApp abstraction layer, template system, consent/opt-out rules (D-10/D-11/D-12/D-13) reused for the new appointment reminder template (D-17); staff-only Move/Cancel pattern (D-09) that Phase 8's owner-action bridge (D-15/D-16) extends with auto-apply for KEEP/CANCEL
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` — `QueueEntryStatus` enum and queue-board UI that D-08/D-13 extend with a new `EXPECTED` status; queue position-ordering logic (D-19) that D-10 layers scheduled-time priority onto; owner/pet mobile-number lookup (D-05/D-13) reused for appointment booking (D-19); real-time Socket.IO sync pattern (D-33) that the calendar's real-time requirement (SCH-04) follows; multi-vet "same view for all roles" philosophy (D-36) applied to calendar filtering (D-23)
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` — Service catalog (ONB-02) that per-service appointment duration (D-02) reads from

### Technology Stack
- `.planning/research/STACK.md` — React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Prisma, TypeScript, Zustand, React Query, zod, BullMQ, Socket.IO

No additional external specs or ADRs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/prisma/schema.prisma` — `QueueEntry` model + `QueueEntryStatus` enum (`WAITING | IN_CONSULT | DONE | NO_SHOW`) — needs a new `EXPECTED` value per D-08
- `apps/api/src/modules/notifications/push.service.ts` — Expo push token infrastructure already built (`PushService.send()`), directly reusable for D-26/D-27 staff notifications
- `apps/api/src/modules/notifications/notification-bus.ts` — BullMQ `Queue`-based event bus pattern for dispatching notifications
- `apps/api/src/realtime/socket.ts` — existing Socket.IO real-time infra, reusable for calendar sync (SCH-04) the same way Phase 3 uses it for queue sync
- `apps/api/src/lib/audit-log.ts` — existing audit trail utility, extend for appointment lifecycle changes (matches project-wide audit-trail convention)
- `packages/ui/src/theme/portal.css` — generated CSS design tokens, usable by the web app's first calendar screen (D-25) since `apps/web` has no component library wired up yet
- `apps/web/src/lib/api.ts` — existing API client stub in the otherwise-blank web app

### Established Patterns
- Monorepo bounded-context module structure (`apps/api/src/modules/<name>/`) — a new `scheduling` (or `appointment`) module follows this
- PostgreSQL RLS multi-tenancy — all appointment/availability data scoped to clinic tenant
- BullMQ workers for scheduled jobs — no-show sweep (D-09) and reminder cadence (D-18) follow Phase 5/7's daily-sweep/delayed-job patterns
- Zod schema validation and Prisma Client Extensions for RLS — same conventions as every prior phase

### Integration Points
- Queue (Phase 3) — `EXPECTED` status addition, position-ordering change (D-10), Queue board badge (D-13)
- WhatsApp (Phase 7) — booking-confirmation → real appointment creation (D-12), new reminder template + owner-action bridge (D-15 to D-18)
- EMR (Phase 4) — service catalog drives per-service slot duration (D-02)
- Web app (`apps/web`) — first real feature screen (D-25); Phase 9 will build the broader dashboard shell around it later

</code_context>

<specifics>
## Specific Ideas

- `EXPECTED` as a distinct pre-queue status (D-08) mirrors the same "honest stopgap" instinct behind Phase 7's provisional-booking design — visible to staff, but not counted as a true walk-in until the patient physically arrives
- Scheduled-time queue priority (D-10) is what actually delivers on SCH-02's promise ("appears in the walk-in queue at its time slot") rather than appointments just being a reminder with no real queue standing
- Auto-applying KEEP/CANCEL but routing MOVE to a staff task (D-16) mirrors Phase 7's philosophy of automating only the unambiguous cases
- The web week-grid (D-25) being the very first real screen in `apps/web` is a notable milestone — Phase 8 is establishing web UI conventions "in the wild," not from a pre-built design system, since `@breeyo/ui` is React Native-only

</specifics>

<deferred>
## Deferred Ideas

- Owner-facing push notifications — deferred until an owner mobile app or push-capable PWA exists (none in v1 scope); D-26 designs the push service to be extensible toward this later
- Configurable walk-in-capacity reservation/buffer — deferred; D-03 relies on natural solo-vet scheduling discipline instead of a hard-coded reservation setting for Beta
- Full appointment-change audit UI beyond the standard audit-trail logging convention — not discussed as a distinct feature; assumed to follow the project-wide pattern automatically

None of the above are scope creep — all stayed within Phase 8's domain (scheduling, calendar, queue handoff, notifications) and were narrowed to Beta-appropriate defaults or explicitly deferred to a phase that already owns the missing prerequisite (owner app, Phase 9 dashboard).

</deferred>

---

*Phase: 08-scheduling-calendar*
*Context gathered: 2026-08-12*
