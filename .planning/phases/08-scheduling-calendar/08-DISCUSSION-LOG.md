# Phase 8: Scheduling & Calendar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 8-scheduling-calendar
**Areas discussed:** Availability model, Queue handoff semantics, Booking management, Calendar UX & notifications, Appointment lifecycle status, Multi-pet/multi-service visits, Recurring appointments, Multi-vet calendar filtering

---

## Availability Model

| Question | Options | Selected |
|---|---|---|
| How does a vet define bookable hours? | Weekly template + overrides / Weekly template only / You decide | **Weekly template + overrides** |
| How is slot length determined? | Single fixed duration / Per-service duration / You decide | **Per-service duration** |
| Walk-in capacity guard? | No hard limit / Reserve a walk-in buffer / You decide | **You decide → No hard capacity limit** |
| Per-clinic or per-vet availability? | Per-vet / Per-clinic only / You decide | **You decide → Per-vet** |
| Sub-day blocked time? | Yes, with a reason / No, full-day only | **Yes, with a reason** |
| Blocked-period reason input? | Preset + Other / Freeform only | **Preset catalog + Other** |
| Booking horizon? | No limit / Capped (~90 days) / You decide | **Capped (e.g. 90 days)** |

**Notes:** Per-vet availability chosen because Phase 3 already models `treatingVetId` on queue entries, and multi-vet clinics need distinct schedules. No hard walk-in buffer for Beta — relies on solo-vet scheduling discipline rather than a new setting.

---

## Queue Handoff Semantics

| Question | Options | Selected |
|---|---|---|
| How does a scheduled appointment enter the queue? | New EXPECTED status first / Auto-enters as WAITING | **New EXPECTED status first** |
| No-show handling? | Auto no-show after grace window / Manual only | **Auto no-show after a grace window** |
| Queue order for checked-in scheduled patients? | By scheduled time, ahead of later walk-ins / By check-in time / You decide | **You decide → By scheduled time, ahead of later walk-ins** |
| Early check-in behavior? | Immediately WAITING / You decide | **Immediately WAITING** |
| Phase 7 WhatsApp bookings ↔ Phase 8 calendar? | WhatsApp bookings create real appointments / Keep separate for Beta | **WhatsApp bookings create real appointments** |
| EXPECTED entries visible on Queue board? | Show with a badge / Schedule-only, hidden | **Show on Queue board with a badge** |

**Notes:** This is the core mechanic delivering SCH-02. Retires Phase 7's provisional-booking/slot-blocking stopgap (D-06 to D-09 in `07-CONTEXT.md`) in favor of real appointment records.

---

## Booking Management

| Question | Options | Selected |
|---|---|---|
| Double-booking? | Prevent / Allow, warn only | **Allow overlap, warn only** |
| Who can reschedule/cancel? | Staff-only / Staff + owner via WhatsApp | **Staff + owner via WhatsApp** |
| Owner KEEP/MOVE/CANCEL reply handling? | Auto-apply KEEP/CANCEL, staff picks slot for MOVE / All need staff approval | **Auto-apply KEEP/CANCEL, staff picks new slot for MOVE** |
| Reminder reuses Phase 7 abstraction? | Reuses Phase 7's layer / You decide | **Reuses Phase 7's abstraction layer** |
| Reminder cadence? | Same as Phase 7 (1 day before + day-of) / Single reminder / You decide | **Same pattern as Phase 7 (1 day before + day-of)** |
| Patient selection when booking? | Same lookup as check-in / You decide | **You decide → Same owner/pet lookup as check-in (Phase 3 D-05/D-13)** |

---

## Calendar UX & Notifications

| Question | Options | Selected |
|---|---|---|
| Primary mobile view? | Day agenda / Full week grid | **Day agenda (list of today's appointments)** |
| Primary web view? | Staff-first 7-day week grid / Simple day list | **Staff-first 7-day week grid** |
| Push audience? | Staff only / Staff + owners (if owner app exists) | **Staff + owners (if owner app exists)** — clarified to **staff-only for Beta, extensible design for later** |
| Push triggers? | Upcoming appointment / Owner MOVE-CANCEL reply / Queue backing up (multi-select) | **All three selected** |

**Notes:** Web calendar is the first real screen built in the currently-blank `apps/web` Next.js scaffold. Owner push clarified via follow-up question — no owner-facing app exists in v1, so push ships staff-only with an extensible design.

---

## Appointment Lifecycle Status

| Question | Options | Selected |
|---|---|---|
| Appointment status set? | SCHEDULED/CHECKED_IN/COMPLETED/CANCELLED/NO_SHOW / You decide | **You decide → SCHEDULED / CHECKED_IN / COMPLETED / CANCELLED / NO_SHOW** |

---

## Multi-pet / Multi-service Visits

| Question | Options | Selected |
|---|---|---|
| Multiple pets per appointment? | One pet per appointment / Allow multiple pets | **Allow multiple pets per appointment** |

**Notes:** At queue handoff, one Appointment now spawns one QueueEntry per pet.

---

## Recurring Appointments

| Question | Options | Selected |
|---|---|---|
| Support recurring series? | No, book individually / Yes, basic recurrence | **Yes, basic recurrence** |

---

## Multi-vet Calendar Filtering

| Question | Options | Selected |
|---|---|---|
| Default multi-vet view? | All vets combined, filterable / You decide | **All vets combined, filterable** |

---

## Claude's Discretion

- Exact booking-horizon cap value — recommended 90 days
- Exact no-show grace-window duration — recommended 15-30 minutes
- Recurring-appointment data model/UI shape (e.g. `recurringSeriesId`)
- BullMQ job design for no-show sweep and reminder cadence
- Exact push notification copy/payload shape
- Whether per-vet availability is edited from a dedicated Settings screen or inline in the calendar
- Walk-in capacity guard (locked to "no hard limit")
- Per-vet vs per-clinic availability (locked to "per-vet")
- Queue order for checked-in scheduled patients (locked to "by scheduled time")
- Patient selection lookup when booking (locked to "same as check-in")
- Appointment status set (locked to the 5-state lifecycle)

## Deferred Ideas

- Owner-facing push notifications — deferred until an owner mobile app/PWA exists (none in v1); push service designed to be extensible toward this
- Configurable walk-in-capacity reservation/buffer — deferred; relying on natural scheduling discipline for Beta instead
- Full appointment-change audit UI beyond the standard project-wide audit-trail convention — not a distinct feature, assumed automatic
