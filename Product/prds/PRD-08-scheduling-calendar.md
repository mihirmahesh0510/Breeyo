# PRD-08: Scheduling & Calendar

**Type:** Lightweight PRD
**Phase:** 08 - Scheduling & Calendar
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 8 layers future appointment scheduling onto the walk-in queue that has been the heart of Breeyo since Phase 3. In Indian veterinary clinics, 80%+ of patient visits are unscheduled walk-ins -- but the remaining 20% represent follow-ups, vaccinations, and procedures that benefit from advance booking. This phase introduces an appointment system that respects the walk-in-first reality: scheduled patients appear in the queue as EXPECTED entries, become true WAITING entries only after check-in, and never displace walk-in patients who are already present.

The phase delivers five interconnected capabilities: (1) an availability engine with configurable schedule templates, overrides, and blocked periods so clinics control when they accept bookings; (2) an appointment lifecycle with provisional booking, confirmation, queue handoff, and a full audit trail; (3) a WhatsApp-integrated reminder system where owners can KEEP, MOVE, or CANCEL appointments via owner-action responses; (4) a mobile day-agenda view with quick-action bottom sheets and queue-scheduled badges; and (5) a web 7-day staff-first week grid with a quick drawer, real-time sync, and browser notifications.

Calendar views sync across mobile and web in real time via Socket.IO. Push notifications alert staff and owners to upcoming appointments, confirmation requests, and queue changes. The mobile experience defaults to a day-agenda view appropriate for phone screens, while the dense 7-day week planning view belongs to the web dashboard on larger screens.

The core design principle: **the walk-in queue must never be complicated by scheduling.** Appointments are a convenience layer -- an overlay on the queue, not a replacement. Any solution that makes walk-in check-in slower, more confusing, or secondary to appointments will fail adoption.

This phase depends on Phase 7 (WhatsApp Communication) for the reminder delivery infrastructure.

---

## 2. Problem Statement

### Problems for Dr. Priya (Vet / Admin)

- **No advance visibility into her day.** Dr. Priya has no way to see which patients are expected later today or this week. She cannot prepare for complex cases (surgeries, follow-ups that need lab results reviewed) because she only learns about them when the owner walks in.
- **Repeat visits require manual coordination.** After a consultation, she tells the owner "come back in 10 days for a recheck" but has no system to record this intent. She relies on the owner remembering, or on Rekha manually writing it in a paper diary that gets lost.
- **Reactive workload.** Without a schedule, her day is entirely reactive. She cannot batch similar procedures (e.g., morning vaccinations, afternoon surgeries) because she has no mechanism to guide appointment timing.

### Problems for Receptionist Rekha (Front Desk)

- **Phone-based booking is untracked.** Pet owners call the clinic to ask "Can I come at 3 PM?" Rekha says yes or no based on memory, with no record of the commitment. If three owners are told "come at 3 PM," chaos ensues.
- **No calendar view.** Rekha has no visual representation of the day's expected patients. She cannot tell a calling owner whether 11 AM or 2 PM is less busy.
- **Manual reminder burden.** For the few scheduled visits, Rekha sometimes sends a WhatsApp message the day before. She forgets more often than not, leading to no-shows for appointments the clinic was expecting.

### Problems for Owner Ananya (Pet Owner)

- **No appointment confirmation.** When Ananya books a visit by phone, she receives no confirmation. She is unsure whether the clinic actually recorded her appointment and sometimes arrives to find the clinic unaware.
- **No reminders.** She sets her own phone reminders but frequently forgets to do so, or sets them for the wrong date. Missed follow-ups affect her pets' health.
- **No ability to reschedule.** If her plans change, she must call the clinic again. If the clinic is busy, she cannot reach them and simply does not show up.

### The Constraint

Walk-in clinics in India operate on a "show up and wait" model. Scheduling must not convert this into an appointment-only or appointment-first model. The queue remains the home screen. The calendar is an auxiliary tool that feeds into the queue. Any solution that makes walk-in check-in slower, more confusing, or secondary to appointments will fail adoption.

### Desired Outcome

A clinic can schedule future appointments that merge seamlessly into the walk-in queue at their time slot, with calendar views syncing across mobile and web in real time, and owners receiving actionable WhatsApp reminders with KEEP/MOVE/CANCEL options.

---

## 3. Target Users & Personas

### Primary: Dr. Priya Sharma -- Solo Vet / Admin

| Attribute | Detail |
|---|---|
| **Role** | Veterinarian and clinic owner. Admin + Clinician roles. |
| **Clinic size** | Solo practice, 15-20 patients/day |
| **Device** | Android phone (primary), occasionally a clinic tablet |
| **Scheduling needs** | Wants to see tomorrow's expected appointments before the first walk-in arrives. Needs to know which cases are follow-ups vs. new visits. Blocks her Wednesday afternoons for surgeries. |
| **Pain points** | Starts every morning blind. Cannot prepare for specific cases. Loses track of follow-ups promised during consultations. Needs scheduling to stay out of the way during busy walk-in hours -- she cannot afford extra taps. |
| **Goal** | Glance at the day agenda in the morning, see expected patients interspersed with open walk-in slots, and have scheduled patients appear in the queue automatically when they check in. |
| **Key behavior** | Uses the mobile day-agenda view. Will not use a dense weekly grid on her phone -- too small. Relies on push notifications and the queue screen, not a separate calendar app. |
| **Quote** | "I tried one of those vet software demos last year -- it wanted me to set up appointment slots. My patients just walk in. The software didn't understand my clinic." |

### Primary: Receptionist Rekha -- Front Desk Staff

| Attribute | Detail |
|---|---|
| **Role** | Front Desk. Books appointments on behalf of pet owners (phone calls, WhatsApp requests, walk-in "I'll come back Thursday" conversations). |
| **Daily volume** | 20-25 patients/day |
| **Device** | Android phone, shared clinic tablet, web dashboard (larger screen for weekly planning) |
| **Scheduling needs** | Books appointments when owners call or when WhatsApp booking requests arrive. Needs to check availability quickly and slot patients without double-booking. Manages cancellations and reschedules. |
| **Pain points** | Currently writes appointment reminders on sticky notes. Cannot confirm availability without asking the vet. Wastes time calling owners to remind them. |
| **Goal** | Book an appointment in under 30 seconds, see the day's schedule at a glance, and let WhatsApp reminders handle owner communication automatically. |
| **Key behavior** | Uses the web dashboard (larger screen) for weekly planning and the mobile app for quick day-of lookups. Frequently switches between queue and schedule views. During morning rush, focuses entirely on the walk-in queue. Between rushes, books appointments for owners who call. |
| **Quote** | "Mornings are the worst. Five people walk in at once, everyone wants to go first, and I'm trying to remember if that Labrador came last week or last month." |

### Secondary: Pet Owner Ananya -- Receives Reminders

| Attribute | Detail |
|---|---|
| **Role** | Pet owner with a scheduled appointment |
| **Interaction** | Receives WhatsApp reminders. Responds with KEEP, MOVE, or CANCEL. Arrives at the clinic and checks in (via receptionist). Never installs the Breeyo app. |
| **Pain points** | Forgets verbal appointments. Has no confirmation to reference. Arrives and has to wait as if she were a walk-in even though she had a "scheduled" visit. |
| **Goal** | Receive a WhatsApp reminder the morning of her appointment, confirm she is coming, arrive at the clinic, and be checked in promptly with the vet expecting her. |
| **Key behavior** | Interacts entirely through WhatsApp -- no app install required. Her experience of scheduling is: receive a reminder, reply to it, show up, and be recognized. |
| **Quote** | "I set a phone reminder for Simba's next deworming but I always forget to actually book the visit. It would be amazing if the clinic just sent me a WhatsApp message when it's due." |

---

## 4. Strategic Context

### Market Context

- **Walk-in culture is dominant.** Indian vet clinics are overwhelmingly walk-in. Scheduled appointments represent roughly 20% of visits, primarily for follow-ups, vaccinations, and surgeries that require preparation. No scheduling system will succeed in India if it demands appointment-first workflows.
- **No Indian competitor gets this right.** Existing Indian vet PMS solutions either ignore scheduling entirely (paper-register tools) or copy Western appointment-calendar-first models that do not fit Indian workflows. Breeyo's queue-overlay approach is a genuine competitive differentiator.
- **WhatsApp is the communication channel.** Pet owners do not install clinic apps. Reminders, confirmations, and booking actions happen through WhatsApp, which owners already use daily. Phase 7's WhatsApp infrastructure makes scheduling adoption frictionless for pet owners.
- **Appointment adoption is growing.** Rising pet ownership in Indian metro areas and WhatsApp-savvy younger pet owners are increasing demand for digital booking -- but always alongside walk-in visits, not replacing them.

### Platform Positioning

- Scheduling is Phase 8 -- deliberately placed after the walk-in queue (Phase 3), clinical records (Phase 4), inventory (Phase 5), billing (Phase 6), and WhatsApp communication (Phase 7) are all built and validated. This sequencing ensures scheduling is layered onto a complete, functioning clinic workflow rather than being a foundational assumption.
- The queue remains the mobile home surface. The calendar is accessed via a dedicated tab and via a web sidebar entry. Appointments feed into the queue; the queue does not feed into the calendar.

### Dependency Chain

| Depends On | Why |
|---|---|
| **Phase 1: Auth & RBAC** | Permissions for scheduling operations (Admin, Clinician, Front Desk can schedule) |
| **Phase 2: UI Design System** | Calendar components, appointment cards, bottom sheets, StatusBadge variants |
| **Phase 3: Patient Registration & Walk-in Queue** | Appointments merge into the queue; QueueEntry model is extended with EXPECTED status; Socket.IO room infrastructure reused |
| **Phase 4: EMR & Clinical Records** | Follow-up appointments reference prior consultations; "Schedule Follow-up" action on consultation completion screen |
| **Phase 7: WhatsApp Communication** | Appointment reminders and owner actions (KEEP/MOVE/CANCEL) delivered via WhatsApp simulator/API; booking conversation flow backend |

| Depended On By | Why |
|---|---|
| **Phase 9: Web Dashboard & Owner Portal** | Web calendar views, schedule management surfaces, upcoming appointment display in owner portal |
| **Phase 10: Offline Hardening** | Scheduled appointments in offline working set for day-of operations |

### Key Architectural Decisions

| # | Decision | Rationale |
|---|---|---|
| D-SCH-01 | Queue remains mobile home surface; scheduling is linked but separate (D-09) | Walk-in is 80% of volume; appointments must not dominate the primary UX |
| D-SCH-02 | Scheduled patients enter queue as EXPECTED first, become WAITING after check-in (D-21, D-22) | Clear distinction between "booked" and "physically present"; prevents phantom queue entries from no-shows |
| D-SCH-03 | Mobile defaults to day agenda; 7-day week view for larger screens only (D-02, D-03) | Mobile real estate is too constrained for a dense week grid; day agenda is scannable on a phone |
| D-SCH-04 | Reminder timing is clinic-configurable with same-day-only shipped defaults (D-25) | Different clinics have different lead times; conservative defaults prevent annoyance |
| D-SCH-05 | Owner actions: KEEP / MOVE / CANCEL via WhatsApp (D-26, D-27) | Owner agency reduces no-shows; WhatsApp is the natural channel for Indian pet owners |
| D-SCH-06 | Availability engine: templates + overrides + blocked periods + reason catalog | Flexible enough for a solo vet who works 6.5 days/week with irregular hours |
| D-SCH-07 | Appointment lifecycle: PROVISIONAL -> CONFIRMED -> EXPECTED -> WAITING -> IN_CONSULT -> DONE | Clear state machine with queue handoff at the EXPECTED -> WAITING transition |
| D-SCH-08 | Appointments are soft-deleted (cancelledAt timestamp), never hard-deleted | Audit trail integrity and analytics; cancelled appointments still inform no-show tracking |
| D-SCH-09 | Reminder producer uses BullMQ delayed jobs | Reliable, retryable, and works with the existing job infrastructure |

---

## 5. Solution Overview

### 5.1 Availability Engine (Plan 08-02)

The availability engine lets clinics define when they accept appointments, ensuring bookings never conflict with blocked periods or exceed capacity.

| Capability | Details |
|---|---|
| **Schedule templates** | Recurring weekly patterns defining available time slots (e.g., Mon-Fri 9:00-13:00 and 15:00-18:00; Saturday 9:00-13:00; Sunday closed). Each slot has a configurable duration (default 15 min) and capacity (default 1 patient per slot). Templates are per-clinic, with future support for per-vet templates in multi-vet clinics. Stored as JSON extending the Clinic model. |
| **Overrides** | One-off changes to the template for specific dates (e.g., "Open until 20:00 on Dec 24" or "Morning only on Jan 2"). Overrides take precedence over the template for their date. |
| **Blocked periods** | Explicit blocks where no appointments can be scheduled (e.g., "Surgery block: Wed 14:00-17:00", "Holiday: Aug 15 all day"). Can be one-time or recurring. Blocked periods show as unavailable on calendar views and produce hard booking rejections. |
| **Reason catalog** | Predefined and custom reasons for blocking time: Surgery, Personal Leave, Holiday, Staff Meeting, Equipment Maintenance, Lunch Break, Other. Clinics can add custom reasons. |
| **Slot calculation** | Given a date, the engine calculates available slots by: (1) applying the template for that day-of-week, (2) applying any overrides for that specific date, (3) subtracting blocked periods, (4) subtracting already-booked slots, (5) returning remaining open slots with their start times. |
| **Settings API** | CRUD endpoints for templates, overrides, blocked periods, and the reason catalog. Role-restricted to Admin and Clinician roles. |

### 5.2 Appointment Lifecycle (Plan 08-03)

The appointment lifecycle manages the full journey from booking request to queue entry.

| Capability | Details |
|---|---|
| **Provisional booking** | When a booking request arrives from WhatsApp (Phase 7 handoff), the appointment is created in PROVISIONAL status. Provisional bookings hold the slot for a configurable duration (default 15 minutes) before auto-expiring if not confirmed. This prevents double-booking during the confirmation window. Appointments created directly by clinic staff skip PROVISIONAL and start as CONFIRMED. |
| **Confirmation** | The appointment moves to CONFIRMED when the owner confirms (via WhatsApp KEEP action) or when staff explicitly confirms a provisional booking. Confirmed appointments are visible on the calendar and will generate reminders. |
| **Queue handoff (EXPECTED status)** | On the day of the appointment, confirmed appointments appear in the walk-in queue as EXPECTED entries (D-21, D-22). EXPECTED entries are visually distinct from WAITING entries -- they show a scheduled-time badge and a "Check In" action but have no queue position number. When the owner arrives and is checked in by staff, the EXPECTED entry transitions to WAITING and joins the normal queue flow. |
| **No-show handling** | If the owner does not check in by appointment time + grace period (configurable, default 30 minutes), the EXPECTED entry is auto-marked as a scheduling no-show. Scheduling no-shows are tracked separately from walk-in no-shows and trigger a follow-up WhatsApp message. |
| **Rescheduling** | An appointment can be moved to a different slot (by staff or via owner MOVE action). The old slot is released and the new slot is held. Rescheduling triggers a new WhatsApp notification to the owner. Both the original and new time are recorded in the audit trail. |
| **Cancellation** | Appointments can be cancelled by staff or by the owner (via WhatsApp CANCEL action). Cancelled appointments release their slot, are soft-deleted (cancelledAt timestamp set), and are recorded with a cancellation reason. If the appointment had an EXPECTED queue entry, it is removed from the queue. |
| **Audit trail** | Every state change (created, confirmed, rescheduled, cancelled, checked-in, no-show) is logged with timestamp, actor (staff user or owner via WhatsApp), and reason. The audit trail is immutable and available for analytics. |

**Appointment State Machine:**

```
[provisional] --confirm--> [confirmed] --day-of--> [expected in queue]
     |                          |                         |
     +--expire--> [expired]     +--check-in----------> [waiting in queue]
     |                          |                         |
     +--cancel--> [cancelled]   +--cancel--> [cancelled]  +--call-next--> [in-consult] --> [done]
                                |                         |
                                +--reschedule--> [confirmed]  +--no-show--> [no-show]
                                |
                                +--grace-expired--> [no-show]
```

### 5.3 Queue Integration: EXPECTED Status (D-21, D-22)

This is the critical integration point between scheduling and the walk-in queue. The design ensures scheduling enhances rather than disrupts the walk-in workflow.

| Aspect | Behavior |
|---|---|
| **EXPECTED entries** | On each day, confirmed appointments for that day appear in the queue as EXPECTED entries. These are shown in a separate "Expected" section above the Waiting section, visually distinct (scheduled-time badge, lighter/muted styling, no queue position number). |
| **Check-in transition** | When the owner arrives and the receptionist checks them in, the EXPECTED entry transitions to WAITING and enters the normal queue ordering. The check-in is the same 2-tap flow as walk-in check-in -- the system detects the existing EXPECTED entry and transitions it rather than creating a new queue entry. |
| **Walk-in priority preserved** | EXPECTED entries do not occupy a queue position until checked in. A walk-in patient who arrives before a scheduled patient is always ahead in the queue. The only exception is emergency entries, which always go to the top regardless of scheduling. |
| **No-show handling** | If an EXPECTED entry is not checked in within the grace period (appointment time + configurable minutes), it is automatically marked as a scheduling no-show. Staff can manually override and re-queue. |
| **Same-day booking** | An appointment booked for "today" immediately creates an EXPECTED queue entry. If the owner is already present and checks in, it transitions to WAITING instantly. |
| **Queue screen visibility** | The "Expected Today" section auto-hides when there are no expected appointments, ensuring zero visual overhead for clinics that do not use scheduling. |

### 5.4 Reminder Producer (Plan 08-04)

The reminder system uses the WhatsApp communication infrastructure from Phase 7 to notify owners about upcoming appointments.

| Capability | Details |
|---|---|
| **Reminder timing** | Clinic-configurable with shipped same-day-only defaults (D-25). Default schedule: morning-of reminder at 08:00 on the appointment day. Clinics can optionally enable a day-before reminder. Timing is based on the clinic's configured timezone (IST default). |
| **WhatsApp reminder content** | Templated message including: clinic name, pet name, appointment date/time, vet name (if assigned), visit reason, and action options. Message is delivered via the Phase 7 WhatsApp simulator/API. |
| **Owner-action bridge (D-26, D-27)** | Each reminder includes three action options: **KEEP** (confirms the appointment -- no further action needed), **MOVE** (triggers a rescheduling flow -- the system offers alternative slots via WhatsApp interactive list), **CANCEL** (cancels the appointment, releases the slot). Owner actions update the appointment state and are logged in the audit trail. |
| **Push notifications (staff)** | Expo push notifications sent to staff devices for: (1) morning summary of the day's expected appointments, (2) owner confirms/moves/cancels via WhatsApp, (3) scheduled patient checks in, (4) approaching no-show threshold. |
| **Socket.IO notifications** | Real-time events for appointment state changes so all connected devices (mobile and web) update immediately when an owner responds to a reminder or a booking is modified. Events: `schedule:appointment:created`, `schedule:appointment:updated`, `schedule:appointment:cancelled`, `schedule:appointment:checked_in`. |
| **Browser notifications (web)** | Web Push API notifications for: new booking requests, owner responses, scheduled patient check-ins. Permission requested after the user has interacted with the schedule at least once (not on first page load). |
| **BullMQ workers** | Background workers handle: (1) scheduling reminders at the correct time (cron-based daily job queues reminders for that day's appointments), (2) processing owner action responses from the WhatsApp webhook, (3) auto-expiring provisional bookings not confirmed in time, (4) auto-marking no-shows after grace period, (5) creating EXPECTED queue entries at the configured pre-arrival window. |

### 5.5 Mobile Day Agenda (Plan 08-05)

The mobile scheduling experience defaults to a day-agenda view, consistent with the constraint that dense weekly planning belongs to larger screens (D-02, D-03).

| Capability | Details |
|---|---|
| **Day agenda layout** | A vertical timeline for the selected date showing: (1) time slots with scheduled appointments, (2) open/available slots, (3) blocked periods with reason badges. The timeline scrolls vertically and auto-scrolls to the current time on load. Each appointment card shows: pet name, species, owner name, visit reason, time, status badge, and booking source indicator. |
| **Quick-action bottom sheet** | Tapping any slot (open or occupied) opens a bottom sheet with context-appropriate actions: (1) open slot: "Book Appointment" (launches booking flow), (2) occupied slot: "View Details", "Reschedule", "Cancel", "Check In" (if day-of and EXPECTED), (3) blocked slot: "View Block", "Remove Block" (Admin only). |
| **Queue scheduled badges** | On the queue screen (which remains the mobile home surface), queue entries that originated from scheduled appointments display a small "Scheduled" badge with the original appointment time. This helps the vet distinguish scheduled follow-ups from walk-ins at a glance without leaving the queue. |
| **WhatsApp-linked state** | When an owner responds to a WhatsApp reminder (KEEP/MOVE/CANCEL), the appointment card on the day agenda updates in real time to reflect the new state. A small WhatsApp icon indicates that the last state change came from an owner WhatsApp action. |
| **Date navigation** | Swipe left/right to navigate between days. A date picker allows jumping to a specific date. "Today" button always returns to the current date. |
| **Entry points** | The day agenda is accessible from: (1) a "Schedule" tab or icon in the navigation, (2) a "View Schedule" action in the queue screen header, (3) deep links from push notifications. The queue screen remains the default home tab. |

### 5.6 Web 7-Day Week Grid (Plan 08-06)

The web dashboard provides a dense 7-day view designed for planning and administration on larger screens.

| Capability | Details |
|---|---|
| **Staff-first layout** | For multi-vet clinics, the week grid can display columns per staff member, showing each vet's schedule side by side. For solo vets, it displays a single-column week view. Rows represent time slots. |
| **Week grid cells** | Each cell shows: appointment summary (pet name, owner, type), status badge (confirmed, provisional, cancelled), and a WhatsApp indicator if the owner has responded. Empty cells show availability. Blocked cells show the block reason with hatched/greyed styling. Current day column highlighted, current time shown as a red indicator line. |
| **Quick drawer** | Clicking any cell opens a slide-out drawer with full appointment details, action buttons (confirm, reschedule, cancel, check in), owner contact information, and pet profile link. The drawer supports inline editing without navigating away from the calendar. Clicking an empty cell pre-fills the date and time for quick booking. |
| **Real-time sync** | The web calendar uses the same Socket.IO infrastructure as mobile. Appointment changes made on any device (mobile or web) are reflected on the web grid within 2 seconds. A `useScheduleRealtime` hook manages WebSocket subscription and local state reconciliation. |
| **Browser notifications** | On first calendar interaction (not on page load), the web app prompts for browser notification permission. If granted, desktop notifications are shown for new booking requests, owner responses to reminders (KEEP/MOVE/CANCEL), and scheduled patient check-ins. Notifications are clickable and navigate to the relevant appointment. "Denied" is respected permanently -- no re-prompting. |
| **Navigation** | The week grid shows Mon-Sun by default. Arrow buttons navigate forward/back by week. A "This Week" button returns to the current week. Clicking a day header switches to a day-detail view similar to the mobile day agenda but rendered for larger screens. |

### 5.7 Navigation & Shell Integration (Plan 08-07)

| Capability | Details |
|---|---|
| **Mobile navigation** | A "Schedule" entry is added to the navigation structure. The queue screen gains a "View Schedule" link in its header. Queue entries with a scheduled badge are tappable to navigate to the appointment detail, and vice versa. |
| **Web navigation** | The web dashboard sidebar gains a "Schedule" section with links to: week view, today's agenda, and availability settings. The dashboard home page includes a "Today's Schedule" summary card showing expected appointments count and confirmed count. |
| **Deep links** | Push notifications for appointment events include deep links that navigate directly to the relevant appointment detail on both mobile and web. |
| **Human verification** | End-to-end verification of all major scheduling flows across mobile and web, including booking, queue handoff, reminder delivery, owner actions, and cross-device sync. |

---

## 6. Success Metrics

### Primary Metrics (Phase 8 Gate Criteria)

These correspond directly to the Phase 8 success criteria defined in the ROADMAP.

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Appointment-to-queue handoff** | User can schedule a future appointment and it appears in the walk-in queue as an EXPECTED entry at its scheduled time | Integration tests + manual QA |
| 2 | **Calendar views with real-time sync** | Day view (mobile) and week view (web) are functional with real-time sync; changes reflected on all devices within 2 seconds | Socket.IO event delivery latency monitoring + cross-device QA |
| 3 | **Push notification delivery** | User receives push notifications for upcoming appointments and queue changes | Notification delivery rate > 95% in staging |

### Secondary Metrics (Tracked, not gating)

| Metric | Target | Measurement |
|---|---|---|
| **Appointment booking speed** | < 30 seconds from opening the booking flow to confirmed appointment | Client-side timing |
| **Reminder response rate** | > 40% of owners respond to WhatsApp reminders (KEEP/MOVE/CANCEL) | WhatsApp delivery + response tracking |
| **Scheduling no-show rate** | < 30% of confirmed appointments result in no-show | Appointment status tracking |
| **Walk-in queue disruption** | 0% increase in walk-in check-in time after scheduling overlay | Check-in time comparison: Phase 3 baseline vs. Phase 8 |
| **Calendar adoption** | > 50% of active clinics create at least 1 appointment within 30 days of deployment | Per-clinic appointment creation tracking |
| **Cross-device sync accuracy** | 100% of appointment state changes reflected on all devices within 2 seconds | Socket.IO event delivery monitoring |
| **Owner action completion rate** | > 30% of MOVE/CANCEL actions successfully complete end-to-end | WhatsApp response processing tracking |
| **No-show auto-detection accuracy** | 100% of appointments not checked in within grace period are auto-marked | BullMQ job completion monitoring |

### Technical Metrics

| Metric | Target | Measurement |
|---|---|---|
| **Slot calculation API (P95)** | < 300ms for a 7-day availability query | Server-side request logging |
| **Appointment CRUD API (P95)** | < 200ms | Server-side request logging |
| **Socket.IO event latency (P95)** | < 500ms from server emit to client receipt | Client-side event timing |
| **Reminder dispatch accuracy** | 100% of due reminders dispatched within 5 minutes of configured time | BullMQ job completion tracking |
| **Mobile day agenda load time** | < 1.5 seconds on 4G connection | Client-side performance measurement |
| **Web week grid render** | < 2 seconds for a full 7-day grid with 30 appointments | Browser performance measurement |

---

## 7. User Stories & Requirements

### 7.1 Appointment Scheduling (SCH-01)

#### SCH-01a: Book a Future Appointment

**As a** front desk user,
**I want to** book a future appointment for a registered patient,
**so that** the clinic can plan for their visit and the owner receives a reminder.

**Acceptance Criteria:**
- [ ] Booking form collects: patient (pet + owner, searchable from existing records), date, time slot, visit reason (quick-select chips: Vaccination, Checkup, Follow-up, Surgery, Dental, Grooming, Other)
- [ ] Optional fields: assigned vet, notes, duration estimate
- [ ] Only available slots are shown (calculated by the availability engine)
- [ ] Staff-created appointments start as CONFIRMED (skip PROVISIONAL)
- [ ] WhatsApp-originated appointments start as PROVISIONAL with a configurable hold window (default 15 min)
- [ ] Provisional appointments auto-expire if not confirmed within the hold window
- [ ] Confirmed appointment appears immediately on calendar views on all connected devices
- [ ] Confirmation notification sent to owner via WhatsApp (if WhatsApp module active and owner consented)
- [ ] Booking requires Front Desk, Clinician, or Admin role
- [ ] Appointment is scoped to the current clinic (tenant) with RLS enforced
- [ ] Appointment record includes: pet ID, owner ID, vet ID (optional), slot start/end, type, status, notes, created_by, audit trail

**Edge Cases:**
- Double-booking the same slot: API rejects with 409 Conflict and suggests the next available slot
- Booking for a date with no template defined: show "No availability configured for this date" and link to availability settings
- Booking for a past date: rejected by validation
- Network failure during booking: optimistic hold released; user retries
- Slot becomes unavailable between page load and submit (race condition): server-side optimistic concurrency check rejects the stale request

---

#### SCH-01b: Schedule a Follow-up After Consultation

**As a** veterinarian,
**I want to** schedule a follow-up appointment at the end of a consultation,
**so that** the patient returns at the right time without relying on memory.

**Acceptance Criteria:**
- [ ] "Schedule Follow-up" action is available on the consultation completion screen (from Phase 4)
- [ ] Vet selects: days until follow-up (quick-select: 3, 7, 10, 14, 30 days), preferred time, visit reason pre-filled as "Follow-up"
- [ ] System suggests the nearest available slot on the target date
- [ ] Appointment created as CONFIRMED with a reference to the originating consultation record
- [ ] Owner receives WhatsApp notification with follow-up details
- [ ] If no slots are available on the target date, the system suggests the next available date

---

#### SCH-01c: Edit an Existing Appointment

**As a** front desk user,
**I want to** edit an existing appointment,
**so that** I can accommodate schedule changes without cancelling and rebooking.

**Acceptance Criteria:**
- [ ] Tap an appointment in calendar view or queue EXPECTED entry to open detail sheet
- [ ] Editable fields: date, time, assigned vet, visit reason, notes
- [ ] On save, all connected clients receive `schedule:appointment:updated` event
- [ ] If date or time changed, owner receives a WhatsApp update notification with the new details
- [ ] Pending reminder BullMQ jobs are recalculated for the new date/time
- [ ] Original time and new time are both recorded in the audit trail

---

#### SCH-01d: Cancel an Appointment

**As a** front desk user,
**I want to** cancel an appointment,
**so that** the slot is freed and the owner is informed.

**Acceptance Criteria:**
- [ ] "Cancel Appointment" action on appointment detail sheet with a required cancellation reason (quick-select: Owner Requested, Clinic Closed, Vet Unavailable, Other)
- [ ] Appointment status set to CANCELLED, `cancelledAt` timestamp recorded, soft-deleted
- [ ] If the appointment had an EXPECTED queue entry, it is removed from the queue
- [ ] Owner receives a WhatsApp cancellation notification with the reason
- [ ] Cancelled appointment remains visible in calendar views with strikethrough styling and CANCELLED badge (can be hidden via filter)
- [ ] Pending reminder BullMQ jobs for this appointment are removed
- [ ] Staff receives a push notification confirming the cancellation

---

#### SCH-01e: Overlap and Conflict Detection

**As a** front desk user,
**I want to** see a warning when I book an appointment that overlaps with an existing one,
**so that** I can avoid double-booking.

**Acceptance Criteria:**
- [ ] On selecting a date and time, the system checks for existing appointments in the same time window
- [ ] If overlap exists, a warning banner appears: "Overlaps with [Pet Name] at [Time]. Continue anyway?"
- [ ] The warning is non-blocking -- staff can proceed with the booking (soft conflict)
- [ ] Appointments during blocked periods are hard-blocked with an error: "This time is blocked: [reason]"
- [ ] Appointments on closed days (holidays, overrides) are hard-blocked with an error

---

### 7.2 Queue Integration (SCH-02)

#### SCH-02a: EXPECTED Entries in the Walk-in Queue

**As a** front desk user,
**I want** scheduled appointments to automatically appear in the queue at their time,
**so that** I do not have to manually add them and the vet knows who is expected.

**Acceptance Criteria:**
- [ ] A BullMQ delayed job fires at `scheduledTime - preArrivalWindow` (default 15 minutes before appointment time)
- [ ] Job creates a QueueEntry with status EXPECTED, linked to the Appointment record via `appointmentId`
- [ ] EXPECTED entries appear in the queue's "Expected Today" section above the WAITING section, with no position number
- [ ] EXPECTED entries have distinct visual treatment: scheduled-time badge, muted background, "Scheduled" label
- [ ] `queue:entry:added` Socket.IO event fires with `source: 'scheduled'` metadata
- [ ] If the appointment is cancelled before the job fires, the job is removed and no queue entry is created
- [ ] "Expected Today" section auto-hides when there are no expected appointments

---

#### SCH-02b: Check In a Scheduled Patient

**As a** front desk user,
**I want to** check in a scheduled patient when they arrive,
**so that** they enter the regular queue and follow the normal consultation flow.

**Acceptance Criteria:**
- [ ] Tapping "Check In" on an EXPECTED queue card transitions the entry to WAITING status
- [ ] A queue position number is assigned based on current FIFO order (behind all existing WAITING entries)
- [ ] The appointment status updates to CHECKED_IN
- [ ] `queue:entry:updated` Socket.IO event fires
- [ ] From WAITING onward, the entry follows the standard queue flow (IN_CONSULT -> DONE or NO_SHOW)
- [ ] The queue card retains a subtle "Scheduled" badge to distinguish from walk-ins but is otherwise identical in behavior
- [ ] The check-in uses the same 2-tap mobile flow as walk-in check-in; the system detects the existing EXPECTED entry and transitions it rather than creating a duplicate

---

#### SCH-02c: Auto-Mark Scheduling No-Shows

**As the** system,
**I want to** auto-mark scheduled patients as no-show if they do not check in within the grace period,
**so that** the queue stays accurate and the clinic can follow up.

**Acceptance Criteria:**
- [ ] A BullMQ delayed job fires at `scheduledTime + gracePeriod` (default 30 minutes)
- [ ] If the EXPECTED queue entry still has status EXPECTED (not checked in), it transitions to NO_SHOW
- [ ] The appointment status updates to NO_SHOW
- [ ] Staff receives a push notification: "[Pet Name]'s [Time] appointment was auto-marked as no-show"
- [ ] A follow-up WhatsApp message is sent to the owner
- [ ] Staff can manually override NO_SHOW back to EXPECTED if the owner calls to say they are running late
- [ ] The grace period is configurable in clinic settings (15, 30, 45, 60 minutes; default 30)

---

#### SCH-02d: Walk-in Priority Preserved

**As a** walk-in patient,
**I want** my queue position to not be affected by scheduled appointments,
**so that** I am not pushed behind someone who booked but has not arrived.

**Acceptance Criteria:**
- [ ] EXPECTED entries do not hold queue positions and have no position number displayed
- [ ] When a scheduled patient checks in, they receive the next available position behind all current WAITING entries
- [ ] If walk-in #3 checks in at 10:10 and a scheduled patient checks in at 10:12, the scheduled patient is #4
- [ ] Emergency walk-ins continue to bypass all position logic as per Phase 3 behavior
- [ ] The walk-in check-in flow (2-tap) is completely unchanged -- no additional screens, prompts, or delays

---

### 7.3 Calendar Views (SCH-03)

#### SCH-03a: Mobile Day Agenda View

**As a** veterinarian,
**I want** a day agenda view on my phone,
**so that** I can see all appointments for a given day at a glance without needing a desktop.

**Acceptance Criteria:**
- [ ] Vertical timeline with hourly markers, scrollable, auto-scrolls to current time on load
- [ ] Appointment cards placed at their scheduled times showing: pet name (species icon), owner name, visit reason, time, status badge, booking source indicator
- [ ] Open slots shown as available time gaps between appointments and blocked periods
- [ ] Blocked periods shown as greyed-out bands with reason label
- [ ] Tap appointment card to open quick-action bottom sheet with: View Details, Reschedule, Cancel, Check In (if day-of EXPECTED)
- [ ] Tap open slot to initiate a booking with date/time pre-filled
- [ ] Horizontal swipe or date picker to navigate between days; "Today" button returns to today
- [ ] WhatsApp indicator on appointment cards when the last state change was an owner WhatsApp action

---

#### SCH-03b: Web 7-Day Week Grid

**As a** front desk user,
**I want** a week calendar view on the web dashboard,
**so that** I can see the full week's schedule, identify busy vs. open days, and plan ahead.

**Acceptance Criteria:**
- [ ] 7-day grid (Mon-Sun) with hourly time slot rows
- [ ] Appointments displayed as colored blocks, color-coded by status (CONFIRMED=green, EXPECTED=blue, CHECKED_IN=orange, DONE=grey, CANCELLED=red strikethrough, NO_SHOW=red)
- [ ] Click empty cell to open quick-book side drawer with date/time pre-filled
- [ ] Click appointment block to open detail drawer with edit/cancel/check-in actions
- [ ] Current day column highlighted; current time red indicator line on today's column
- [ ] Blocked periods shown as hatched/greyed cells with reason
- [ ] Working hours boundaries clearly delineated; non-working hours dimmed
- [ ] Week navigation arrows and "This Week" button
- [ ] Clicking a day header opens a day-detail view for that day
- [ ] Staff-first column layout option for multi-vet clinics (per-vet columns)

---

#### SCH-03c: Calendar Filtering

**As a** vet in a multi-vet clinic,
**I want to** filter the calendar to show only my appointments,
**so that** I can focus on my schedule without visual clutter from other vets' bookings.

**Acceptance Criteria:**
- [ ] Calendar views (day and week) have a vet filter dropdown
- [ ] Options: "All vets" (default), individual vet names
- [ ] In solo-vet clinics, the filter is hidden
- [ ] Filter persists across day/week navigation
- [ ] Unassigned appointments (no vet specified) always appear regardless of filter

---

### 7.4 Real-Time Sync (SCH-04)

#### SCH-04a: Cross-Device Calendar Sync

**As a** front desk user,
**I want** an appointment I just booked to appear immediately on the vet's mobile calendar,
**so that** everyone sees the same schedule.

**Acceptance Criteria:**
- [ ] `schedule:appointment:created`, `schedule:appointment:updated`, `schedule:appointment:cancelled`, `schedule:appointment:checked_in` Socket.IO events emitted to the clinic room upon each state change
- [ ] All connected clients (mobile and web) receive events and update their local calendar state
- [ ] Latency from change to display on other devices is under 2 seconds on stable connections
- [ ] Event payload includes full appointment data (pet, owner, time, reason, status, assigned vet)
- [ ] Events are scoped to the clinic tenant (no cross-tenant leakage)

---

#### SCH-04b: Reconnection State Recovery

**As a** vet,
**I want** the calendar to recover after I lose and regain connectivity,
**so that** I see the current state without stale data.

**Acceptance Criteria:**
- [ ] On Socket.IO reconnection, the client fetches the full schedule for the currently viewed date range
- [ ] Local state is reconciled with server state: new appointments added, cancelled ones removed, updated ones refreshed
- [ ] A brief "Reconnected -- schedule updated" toast appears
- [ ] No duplicate entries or stale data after reconnection
- [ ] Connection status indicator: green (connected), yellow (reconnecting), red (offline) -- matches queue screen pattern

---

#### SCH-04c: Optimistic Updates

**As a** front desk user,
**I want** calendar changes to apply immediately,
**so that** the interface feels responsive even on slower connections.

**Acceptance Criteria:**
- [ ] New appointments appear in the calendar immediately on submission, before server confirmation
- [ ] If the server rejects the operation (validation error, slot conflict), the optimistic entry is removed and an error toast shows the reason
- [ ] Edits and cancellations are also applied optimistically with rollback on failure

---

### 7.5 Notifications (SCH-05)

#### SCH-05a: Owner WhatsApp Appointment Reminders

**As a** pet owner,
**I want to** receive a WhatsApp reminder before my appointment,
**so that** I do not forget and can confirm, reschedule, or cancel.

**Acceptance Criteria:**
- [ ] Reminder sent at clinic-configured intervals (shipped default: same-day at 08:00)
- [ ] Message content: "Hi [Owner Name], this is a reminder that [Pet Name] has a [Visit Reason] appointment at [Clinic Name] today at [Time]. Reply KEEP to confirm, MOVE to reschedule, or CANCEL."
- [ ] If owner responds KEEP: appointment confirmed, "Confirmed by owner" logged in audit trail
- [ ] If owner responds CANCEL: appointment cancelled per SCH-01d flow
- [ ] If owner responds MOVE: offered next 3 available slots on the same day, plus "another day" option with 3 slots on the next available day (WhatsApp interactive list)
- [ ] Reminder respects Phase 7 WhatsApp consent model -- no message sent to opted-out owners
- [ ] Delivered via Phase 7 WhatsApp simulator/API

**Edge Cases:**
- Owner has WhatsApp blocked/unavailable: delivery fails gracefully; staff is notified
- Multiple appointments same day for same owner: consolidated into a single reminder listing all appointments
- Owner responds to an expired reminder (after appointment time): response is logged but no state change; staff is notified
- Owner MOVE limit: maximum 2 MOVE actions per appointment; after that, owner must call the clinic

---

#### SCH-05b: Staff Push Notifications

**As a** clinic staff member,
**I want to** receive push notifications for scheduling events,
**so that** I stay informed without constantly checking the calendar.

**Acceptance Criteria:**
- [ ] **Morning summary:** "You have X appointments today" sent at clinic-configurable time (default 07:30)
- [ ] **Owner response:** "Ananya confirmed her 10:00 AM appointment for Bruno" or "Ananya cancelled..." sent when owner responds to reminder
- [ ] **Check-in:** "Bruno (Ananya) has checked in for their 10:00 AM appointment" sent when EXPECTED transitions to WAITING
- [ ] **New booking:** "New appointment booked: Bruno at 3:00 PM tomorrow" sent on appointment creation
- [ ] **Approaching no-show:** "[Pet Name]'s [Time] appointment -- owner has not arrived. Grace period: [X] minutes remaining." sent at `scheduledTime + gracePeriod/2`
- [ ] Tapping any notification opens the relevant screen (queue or appointment detail) via deep link
- [ ] "Approaching no-show" notification includes a "Call Owner" quick action opening the phone dialer
- [ ] Notifications respect user notification preferences (mutable in settings)

---

#### SCH-05c: Browser Notifications (Web)

**As a** front desk user on the web dashboard,
**I want to** receive browser notifications for scheduling events,
**so that** I am alerted even when the calendar tab is not in focus.

**Acceptance Criteria:**
- [ ] Browser notification permission requested after first calendar interaction (not on page load)
- [ ] Same event types as staff push notifications: new bookings, owner responses, check-ins
- [ ] Notifications are clickable and navigate to the relevant appointment
- [ ] "Denied" permission is respected permanently -- no re-prompting
- [ ] Degrades gracefully if permission is denied -- app functions normally without notifications

---

#### SCH-05d: Configurable Reminder Settings

**As a** clinic admin,
**I want to** configure reminder timing,
**so that** reminders fit my clinic's workflow and owner preferences.

**Acceptance Criteria:**
- [ ] Clinic settings page includes an "Appointment Reminders" section
- [ ] Configurable: number of reminders (1-3), timing for each (selectable from: 48h, 24h, 12h, 6h, 2h, 1h, 30min before)
- [ ] Shipped default: 1 reminder, same-day at 08:00 (D-25)
- [ ] Toggle to enable/disable owner actions (KEEP/MOVE/CANCEL) on reminders
- [ ] Changes apply to all future appointments; existing scheduled reminders are not retroactively changed
- [ ] Restricted to Admin role

---

### 7.6 Availability Management

#### AVL-01: Configure Schedule Templates

**As a** clinic admin,
**I want to** set up a recurring weekly schedule template,
**so that** staff can book appointments only during my available hours.

**Acceptance Criteria:**
- [ ] Template defines available time slots for each day of the week (Mon-Sun)
- [ ] Each slot has a start time, end time, and capacity (patients per slot, default 1)
- [ ] Slot duration is configurable (15, 20, 30, 45, or 60 minutes; default 15)
- [ ] Multiple time blocks per day are supported (e.g., 9-13 and 15-18 with a lunch break)
- [ ] Template can be created and edited from mobile (settings) and web (availability page)
- [ ] Changes to the template take effect for future dates only; existing bookings are not affected
- [ ] Template stored as JSON on the Clinic model
- [ ] Restricted to Admin role

**Edge Cases:**
- Overlapping time blocks in the template: validation rejects with a clear error
- Template deleted while bookings exist: existing bookings preserved; no new bookings until a template is recreated
- No template configured: scheduling is effectively disabled; booking attempts show "Configure your availability first"

---

#### AVL-02: Create Overrides and Blocked Periods

**As a** clinic admin or vet,
**I want to** override my schedule for specific dates or block time for surgeries and holidays,
**so that** appointments are not booked when I am unavailable.

**Acceptance Criteria:**
- [ ] Override allows modifying hours for a specific date (e.g., "Dec 24: 9:00-14:00 only")
- [ ] Blocked period prevents bookings for a specific date/time range
- [ ] Blocked period requires a reason from the catalog (Surgery, Personal Leave, Holiday, Staff Meeting, Equipment Maintenance, Lunch Break, Other/custom)
- [ ] Blocked periods can be full-day or partial-day
- [ ] If a blocked period overlaps with an existing confirmed appointment, a warning is shown: "X existing appointments will be affected" with options to proceed (and notify affected owners) or cancel the block
- [ ] Overrides and blocks are visible on the calendar with distinct visual treatment
- [ ] Date-specific overrides take precedence over the weekly template
- [ ] Holiday closures show a "Closed: [Holiday Name]" banner on the calendar day
- [ ] Restricted to Admin and Clinician roles

**Edge Cases:**
- Blocking a slot with a provisional (unconfirmed) booking: the provisional booking is auto-expired and the slot is blocked
- Creating an override for today: takes effect immediately; already-checked-in patients are not affected
- Recurring blocks (e.g., "every Wednesday afternoon"): supported as a weekly template configuration, not as a separate recurring block mechanism

---

## 8. Out of Scope

The following are explicitly excluded from Phase 8:

| Item | Deferred To | Rationale |
|---|---|---|
| **Recurring appointment series** (e.g., "every 2 weeks for 6 sessions") | Future | Adds complexity to availability engine and conflict resolution; manual rebooking is sufficient for Beta |
| **Per-vet schedule templates in multi-vet clinics** | Phase 9+ | Phase 8 delivers per-clinic templates; per-vet scheduling is a multi-vet enhancement |
| **Owner self-service booking via app or web portal** | Phase 9 | Owner booking happens via WhatsApp (Phase 7) or through clinic staff; the owner portal may add self-service later |
| **Automated waitlist management** | Future | If a slot is full, there is no waitlist mechanism; the soft-conflict warning lets staff book anyway |
| **Calendar integrations** (Google Calendar, Apple Calendar, Outlook) | Future | External calendar sync is not required for Beta clinics |
| **Multi-location scheduling** | Future | Phase 8 is single-clinic; multi-location is a v2 feature |
| **Appointment types with different durations** | Future (partial) | All slots use the clinic's configured uniform duration; procedure-specific durations are a future enhancement |
| **Revenue forecasting from scheduled appointments** | Phase 9 | Analytics and reporting belong in the web dashboard phase |
| **SMS reminders (non-WhatsApp)** | Future | WhatsApp is the primary channel for Indian clinics; SMS fallback can be added post-Beta |
| **Owner-facing queue position for scheduled visits** | Phase 9 | Owner portal may display estimated wait; Phase 8 is clinic-staff-facing |
| **Drag-and-drop rescheduling on the web calendar** | Phase 9+ | Quick drawer with a "Reschedule" button is sufficient; drag-and-drop is a UX enhancement |
| **Offline appointment booking** | Phase 10 | Phase 10 handles offline hardening; Phase 8 requires connectivity for scheduling operations |
| **Automated follow-up suggestions from clinical data** | Future | The system does not auto-suggest appointments based on diagnosis codes; the vet manually initiates scheduling |
| **Patient-facing wait time for scheduled appointments** | Phase 9 | Queue position visibility is an internal clinic tool only in Phase 8 |

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Status | Impact if Delayed |
|---|---|---|---|
| **Phase 7: WhatsApp Communication** | Feature | Planned | Reminder delivery and owner-action bridge (KEEP/MOVE/CANCEL) depend on Phase 7's WhatsApp simulator and message dispatch infrastructure. Without it, reminders degrade to push notifications only -- still functional but diminished owner experience. |
| **Phase 3: Walk-in Queue** | Feature | Complete | Queue data model, EXPECTED status extension, Socket.IO rooms, and check-in flow are the foundation for queue handoff. |
| **Phase 4: EMR & Clinical Records** | Feature | Planned | "Schedule Follow-up" action on consultation completion screen requires Phase 4's consultation lifecycle. Can be omitted from Phase 8 if Phase 4 is delayed -- staff can book follow-ups manually. |
| **Phase 1: Notification Foundation (NTF-01)** | Feature | Complete | Push token registration, notification preferences, and dispatch API are used for staff push notifications. |
| **Phase 2: UI Components** | Feature | Complete | BottomSheet, Card, StatusBadge, and other design system components are reused in scheduling UI. |
| **BullMQ + Redis** | Infrastructure | Available | Reminder scheduling, provisional booking expiry, queue-insertion jobs, and no-show auto-detection require background job infrastructure. |
| **Expo Push Notification Service** | External | Available | Mobile push notification delivery depends on Expo's push service. |
| **Web Push API** | Technical | Browser-native | Browser notifications require Web Push API support (Chrome, Firefox, Safari 16+). |
| **Socket.IO (existing)** | Infrastructure | Available | Real-time calendar sync uses the same Socket.IO server established in Phase 3. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Scheduling complexity discourages adoption** | Medium | High | Keep booking flow to 3 taps maximum. Default values for all optional fields. Emphasize that scheduling is optional and the walk-in queue works independently. If scheduling is not used, it has zero footprint on the queue UX. |
| **EXPECTED entries clutter the queue screen** | Medium | Medium | EXPECTED section is collapsible, visually distinct (muted, no position number), and auto-hides when empty. User testing with front desk staff before launch. Configurable toggle to hide. |
| **WhatsApp reminder delivery failures** | Medium | Medium | Fallback to push notification if WhatsApp delivery fails. Retry logic with exponential backoff. Staff notification when a reminder cannot be delivered so they can follow up manually. |
| **BullMQ job timing drift** | Low | Medium | Use exact timestamps (not relative delays) for job scheduling. Monitor job execution latency. Alert if drift exceeds 5 minutes. |
| **Conflict between scheduled and walk-in queue UX** | Medium | High | EXPECTED entries are strictly non-positional and never displace walk-ins. Walk-in check-in flow is completely unchanged (same 2-tap path, no extra prompts). Regression test walk-in check-in after scheduling integration. |
| **Timezone handling errors** | Low | High | All times stored as UTC in the database. Display and reminder scheduling converted using the clinic's configured timezone (IST default). Consistent timezone handling across API, BullMQ, and client. |
| **Slot contention under concurrent booking** | Low | High | Optimistic concurrency control on slot booking (version check on appointment row). Return 409 Conflict with suggested alternatives if the slot was taken between load and submit. |
| **Owner action abuse (repeated MOVE)** | Low | Low | Limit MOVE actions to 2 per appointment. After 2 moves, owner must call the clinic to reschedule. |
| **Web week grid performance with many appointments** | Low | Medium | Virtualize grid rendering (only render visible cells). Limit query to the visible week range. Paginate staff columns if > 5 vets. |
| **Provisional booking expiry creates confusion** | Medium | Low | Show a clear countdown timer on provisional bookings in the UI. Notify staff when a provisional booking expires. Allow immediate re-booking if the slot is still available. |
| **Browser notification permission fatigue** | Medium | Low | Request permission only after user has interacted with the schedule (not on page load). Respect "denied" permanently. Degrade gracefully. |

---

## 10. Open Questions

| # | Question | Context | Proposed Answer | Status |
|---|---|---|---|---|
| OQ-01 | What is the default appointment slot duration? | 30 min is reasonable for general consults, but solo vets doing quick vaccinations may prefer 15 min and surgeries need 60+. | Start with a single clinic-wide configurable duration (default 15 min per ROADMAP plan 08-02). Per-appointment-type durations are a future enhancement. | **Proposed** |
| OQ-02 | Should the EXPECTED section on the queue screen show all of today's appointments or only upcoming ones (next 2 hours)? | Showing the full day may overwhelm Rekha during morning rush. Showing only upcoming may cause her to miss a 4 PM appointment when asked at 10 AM. | Show all of today's appointments. Upcoming ones (within 1 hour) are highlighted; past-time ones are dimmed. Collapse/expand toggle on the section header for control. | **Proposed** |
| OQ-03 | How should the system handle appointment booking for unregistered patients? | Currently, booking requires a registered pet + owner. Should there be a "quick register + book" combined flow? | Registration must happen first. The booking flow starts with a patient search. If the patient is not found, the user is directed to the registration wizard first, then returns to booking. Combining the flows adds complexity without clear value. | **Proposed** |
| OQ-04 | Should cancelled appointments count toward no-show analytics? | Owner-initiated cancellations are courteous (not no-shows). Clinic-initiated cancellations should not count against the owner. | Cancellations are tracked separately from no-shows. Only entries that reach NO_SHOW status count toward no-show analytics. Cancellations have their own metric. | **Proposed** |
| OQ-05 | What happens when a scheduled patient arrives significantly early (e.g., 2 hours before their slot)? | Should Rekha check them in as a walk-in or against the appointment? | Check-in transitions the EXPECTED entry to WAITING regardless of timing. The patient joins the queue at the current position. If the appointment has not yet created an EXPECTED entry (too early), the system detects the matching appointment and creates the transition immediately. | **Proposed** |
| OQ-06 | Should the availability engine support per-vet availability, or is clinic-wide sufficient for Phase 8? | Solo vets need only clinic-wide. Multi-vet clinics (2-3 vets) may need per-vet schedules. | Clinic-wide for Phase 8. Per-vet scheduling adds significant complexity and is deferred to Phase 9+ when multi-vet workflows are more mature. The vet assignment on appointments provides basic multi-vet awareness. | **Proposed** |
| OQ-07 | What is the maximum future booking horizon? | Can an owner book 6 months out for an annual vaccination? Or should bookings be limited? | 90-day maximum booking horizon for Phase 8. Long-term scheduling (6+ months) is a future enhancement. Most vet follow-ups are within 30 days; 90 days covers quarterly treatments. | **Proposed** |
| OQ-08 | How should the WhatsApp MOVE action work when there are no available slots on adjacent days? | If the next 3 days are fully booked, what does the system offer? | Offer next 3 available slots on the same day, plus "another day" option providing 3 slots on the next available day. If no slots within 7 days, respond: "No availability in the next week. Please call the clinic to reschedule." | **Proposed** |
| OQ-09 | Should the calendar show consultation notes alongside appointment history for follow-ups? | Vet may want to see "last visit notes" when viewing an upcoming follow-up appointment. This creates a dependency on Phase 4 data. | Show a "Previous Visit" link on follow-up appointments that navigates to the originating consultation record (Phase 4). Do not inline consultation notes in the calendar view -- it would clutter the UI. | **Proposed** |
| OQ-10 | Is offline appointment creation in scope for Phase 8 or deferred? | If the clinic loses connectivity, can Rekha still book an appointment that syncs later? | Deferred to Phase 10. Scheduling requires real-time availability checking and conflict detection, which cannot be done reliably offline. Phase 8 requires connectivity for all scheduling operations. Users can view the last-known schedule while offline. | **Deferred** |
| OQ-11 | Should the vet be proactively notified when a scheduled patient has NOT checked in by appointment time? | Helps the vet know their 10 AM follow-up has not arrived so they can take the next walk-in instead of waiting. | Yes -- the "approaching no-show" push notification (sent at scheduledTime + gracePeriod/2) serves this purpose. See SCH-05b acceptance criteria. | **Proposed** |
| OQ-12 | When a consolidated WhatsApp reminder lists multiple same-day appointments for one owner (SCH-05a edge case), which appointment does a bare KEEP/MOVE/CANCEL reply apply to? | Ambiguous routing risked acting on the wrong appointment. | Consolidated reminder numbers each appointment (e.g. "1. Bruno 10am, 2. Simba 3pm"); owner must reply referencing the number (e.g. "KEEP 1"). A bare KEEP/MOVE/CANCEL with no number is rejected with a clarifying prompt listing the numbered appointments again. | **Locked** |
| OQ-13 | If a scheduled patient is checked in via the normal walk-in "Add to Queue" flow instead of the EXPECTED card's "Check In" action (e.g. arrived 2+ hours early, before the EXPECTED entry was created), does the system detect and link the existing appointment, or risk a duplicate/orphaned entry? | Staff won't always notice or use the EXPECTED card, especially for early arrivals. | The walk-in check-in flow always checks for a same-day appointment (any status) for that patient before creating a new queue entry. If found, it links to the existing appointment and transitions it to WAITING directly, rather than creating a duplicate entry. | **Locked** |
| OQ-14 | Should the system allow the same patient to have two appointments booked on the same day? | E.g. a morning vaccination and an unrelated afternoon follow-up are legitimate, but could also be an accidental double-booking. | Allowed, but a soft-conflict warning is shown at booking time (same pattern as SCH-01e's overlap warning): "[Pet Name] already has an appointment today at [time]. Continue anyway?" Staff can proceed. | **Locked** |
| OQ-15 | If an admin changes the schedule template's slot duration (e.g. 15 min -> 30 min) after appointments already exist, how does the availability engine reconcile new-duration slots with pre-existing bookings that used the old duration? | AVL-01 states existing bookings are unaffected, but didn't specify how future slot calculation avoids overlapping them. | Existing appointments keep their original start/end time and are treated as fixed, occupied blocks. The availability engine calculates new slots (at the new duration) around those fixed blocks going forward -- it does not retroactively resize or move existing bookings. | **Locked** |

---

*This is a Lightweight PRD for scheduling and calendar functionality. Detailed technical design lives in the Phase 8 implementation plans (08-01 through 08-07) and the codebase.*
