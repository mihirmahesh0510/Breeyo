# Phase 7: WhatsApp Communication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 07-whatsapp-communication
**Areas discussed:** Reminder cadence & escalation, Booking approval flow, Consent & opt-out scope, Simulator demo realism

---

## Reminder cadence & escalation

| Option | Description | Selected |
|--------|-------------|----------|
| On the follow-up date | Fires once, exact date, no lead time | |
| 1 day before + on the date | Two touches: heads-up + reminder | ✓ |
| Configurable lead time | Admin sets days-before in Config screen | |

**Question:** When should the automated follow-up reminder fire relative to the follow-up date (Phase 4 D-09)?
**User's choice:** 1 day before + on the date

| Option | Description | Selected |
|--------|-------------|----------|
| X days before (configurable) | Reuses Phase 5's expiry-lead-time picker pattern | |
| On the due date only | Simplest, one reminder | |
| Before + on the date | Heads-up + reminder on the day | ✓ |

**Question:** When should the vaccine/deworming due reminder fire relative to the due date (Phase 4 D-42/D-43)?
**User's choice:** Before + on the date

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot, no auto-repeat | Fires once, staff can manually retry | |
| Bounded escalation | Resends after N days, capped, then flags for staff | ✓ |

**Question:** If an owner doesn't respond, should the system resend automatically?
**User's choice:** Bounded escalation

| Option | Description | Selected |
|--------|-------------|----------|
| Single reminder on overdue flag | Fires once when invoice flagged overdue | |
| Escalating repeats until paid | Resends every few days until paid/voided | |
| Manual only — staff triggers | No automation, front desk sends by hand | ✓ |

**Question:** How should automated overdue-invoice payment reminders behave (deferred from Phase 6)?
**User's choice:** Manual only — staff triggers
**Notes:** Deliberate exception to the bounded-escalation pattern chosen for follow-up/vaccine/deworming — confirmed explicitly in a follow-up question that escalation does NOT extend to payment reminders.

| Option | Description | Selected |
|--------|-------------|----------|
| 2 attempts, 3 days apart | Short window, low nag risk | |
| 3 attempts, escalating gaps | More persistent, more scheduling complexity | |
| You decide | Claude picks a sensible default | ✓ |

**Question:** How many total escalation attempts and how far apart?
**User's choice:** You decide
**Notes:** Recorded in CONTEXT.md as Claude's Discretion with recommended default of 2 attempts, 3 days apart.

| Option | Description | Selected |
|--------|-------------|----------|
| Flag 'Needs action' in inbox | Thread gets needs-action indicator, no further automation | ✓ |
| Silently stop | No flag, thread goes quiet | |

**Question:** After the escalation cap is reached with no reply, what happens?
**User's choice:** Flag 'Needs action' in inbox

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 3 days before | Simple, no new config screen | ✓ |
| Reuse Phase 5 pattern (config picker) | Admin picks 15/30/60/90 days | |

**Question:** Vaccine/deworming 'before' reminder lead time — fixed or configurable?
**User's choice:** Fixed 3 days before

| Option | Description | Selected |
|--------|-------------|----------|
| Manual-only stands for payment | Escalation only applies to follow-up/vaccine/deworming | ✓ |
| Apply escalation to payment too | Reconsider, contradicts earlier manual-only choice | |

**Question:** Does bounded escalation apply to payment reminders too?
**User's choice:** Manual-only stands for payment

---

## Booking approval flow

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-confirm if slot is open | Confirms immediately if slot free | ✓ |
| Staff review before confirming | Lands as Needs action, staff must confirm | |

**Question:** Does a requested booking slot auto-confirm or require staff review first?
**User's choice:** Auto-confirm if slot is open

| Option | Description | Selected |
|--------|-------------|----------|
| First request wins the slot | First-come-first-served | ✓ |
| Both land as requests, staff decides | No slot-locking at request time | |

**Question:** If two owners request the same slot before staff can act, what happens?
**User's choice:** First request wins the slot

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, confirmed bookings block the slot | Slot disappears from future offers | ✓ |
| No enforcement in Phase 7 | Known gap until Phase 8's calendar | |

**Question:** Should a confirmed booking block that slot from other WhatsApp requests?
**User's choice:** Yes, confirmed bookings block the slot

| Option | Description | Selected |
|--------|-------------|----------|
| Staff-only via action cards | Owner can't self-serve move/cancel | ✓ |
| Owner can self-serve via quick replies | Owner taps Cancel/Move directly | |

**Question:** Who can move/cancel a confirmed booking, and can the owner self-serve?
**User's choice:** Staff-only via action cards

---

## Consent & opt-out scope

| Option | Description | Selected |
|--------|-------------|----------|
| Reminders = Payment/Follow-up/Vaccine/Deworming; Transactional = Invoice delivery/Booking confirmation | Matches WhatsApp's own marketing/utility distinction | ✓ |
| Only Payment/Follow-up/Vaccine/Deworming stoppable; Invoice delivery also silenceable | Narrower — only booking confirmation always sends | |

**Question:** Which templates count as STOP-able reminders vs. always-attempted transactional messages?
**User's choice:** Reminders = Payment/Follow-up/Vaccine/Deworming; Transactional = Invoice delivery/Booking confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Global per-owner toggle | One STOP silences all reminder templates, all pets | ✓ |
| Per-category opt-out | Owner can stop specific categories independently | |

**Question:** Does opt-out apply globally per-owner or per reminder-category?
**User's choice:** Global per-owner toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Implied consent from registration | No separate WhatsApp opt-in screen | |
| Explicit opt-in, logged via ConsentRecord | Reuses Phase 1's existing consent model | ✓ |

**Question:** Is there an explicit opt-in step, or is registration implied consent?
**User's choice:** Explicit opt-in, logged via ConsentRecord

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow send | Consent warning shown, staff can proceed | ✓ |
| Block send until consent captured | Send disabled until consent recorded | |

**Question:** If no consent record exists, does send get blocked or just warned?
**User's choice:** Warn but allow send

---

## Simulator demo realism

| Option | Description | Selected |
|--------|-------------|----------|
| Staff manually triggers canned replies | Deterministic, scriptable via Config | |
| Auto-reply after a short delay | Threads feel alive without touching Config | ✓ |

**Question:** How does a simulated owner reply get produced during demos/QA?
**User's choice:** Auto-reply after a short delay

| Option | Description | Selected |
|--------|-------------|----------|
| Global toggle for next send(s) | Single control affecting whatever's sent next | ✓ |
| Per-owner/thread override | Admin sets a specific owner's channel behavior | |

**Question:** Do deterministic failure/delay/invalid-number controls apply globally or per-owner/thread?
**User's choice:** Global toggle for next send(s)

| Option | Description | Selected |
|--------|-------------|----------|
| Always the positive/default path | Simulator always picks Confirm | ✓ |
| Admin sets the outcome per scenario | Pre-picks the quick-reply outcome | |

**Question:** When a booking action card offers Confirm/Move/Cancel, how does the simulator pick?
**User's choice:** Always the positive/default path

---

## Claude's Discretion

- Exact escalation attempt count and interval for bounded reminder escalation (recommended default: 2 attempts, 3 days apart)
- BullMQ job scheduling design for reminder cadence (delay jobs, repeatable jobs, or daily cron sweep matching Phase 5's pattern)
- Provider abstraction layer interface shape (simulator + future real Meta API)
- Booking slot-blocking data model (no real calendar exists yet)
- Exact auto-reply delay timing for simulator realism
- `ConsentRecord.consentType` naming convention and where consent gets captured in the flow
- Template variable rendering and validation approach
- Retry/backoff mechanics for provider-level delivery failures (distinct from escalation-on-no-reply)

## Deferred Ideas

- Configurable reminder lead times (admin-adjustable, like Phase 5's expiry lead-time picker) — Beta ships fixed values
- Per-category opt-out granularity — Beta keeps a single global toggle
- Owner self-service booking move/cancel via quick-reply — staff-only for Beta
- Escalating/automated payment reminders — manual-only for Beta
- Admin-scriptable simulator outcomes for booking action cards — always positive-path for Beta

---

## Plan review follow-up (2026-08-15)

Gaps found while reviewing the 16 phase plans (07-01 through 07-16) against CONTEXT.md/UI-SPEC.md/VALIDATION.md. Recorded as D-21 through D-28 in CONTEXT.md.

| Option | Description | Selected |
|--------|-------------|----------|
| Ask which pet during booking | Add a pet-selection step to the WhatsApp booking conversation | ✓ |
| Defer to check-in | Leave pet unspecified; staff sorts it out in person | |

**Question:** The booking flow never captured which pet an appointment was for — how should a multi-pet owner's pet get identified?
**User's choice:** Ask which pet during booking → D-21

| Option | Description | Selected |
|--------|-------------|----------|
| Restrict to Front Desk + Admin only | Tighter permission for booking cancel/move and consent/opt-out changes | |
| Keep SEND_WHATSAPP for everything | One permission gates all WhatsApp actions | ✓ |

**Question:** Should booking cancel/move and consent/opt-out changes require a tighter permission than SEND_WHATSAPP?
**User's choice:** Keep SEND_WHATSAPP for everything → D-22

| Option | Description | Selected |
|--------|-------------|----------|
| Omit the pay button/link, same template | payment_link becomes optional | ✓ |
| Separate paid-invoice template | Distinct template with different copy | |

**Question:** How should a paid invoice's WhatsApp send actually omit the payment CTA (per UI-SPEC)?
**User's choice:** Omit the pay button/link, same template → D-23

| Option | Description | Selected |
|--------|-------------|----------|
| Staff marks consent granted | A control in the app for front desk to mark consent | |
| Owner opts in via WhatsApp reply | First message includes an opt-in quick reply | |
| Out of scope for Beta — no UI trigger | Consent capture happens outside this phase's code | ✓ |

**Question:** Nothing in the plan actually triggers a WhatsApp consent grant (D-12) — how should consent get captured?
**User's choice:** Out of scope for Beta — no UI trigger → D-24
**Notes:** Every Phase 7 send will show the missing-consent warning until a future phase adds a capture mechanism — accepted as a known Beta limitation.

| Option | Description | Selected |
|--------|-------------|----------|
| Release the slot immediately | Freed for new WhatsApp requests right away | ✓ |
| Keep it blocked for that day | Safer against double-book race, wastes the slot | |

**Question:** After staff cancels/moves a confirmed booking, should the slot become bookable again via WhatsApp?
**User's choice:** Release the slot immediately → D-25

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only receipt | Shows booking-confirmed status, not tappable | |
| Live button with an action | Tapping it opens booking detail | ✓ |

**Question:** Given D-06's auto-confirm, what should the confirm_booking action card actually do when tapped?
**User's choice:** Live button with an action → D-26

| Option | Description | Selected |
|--------|-------------|----------|
| One-shot, auto-reverts | Reverts to normal delivery after the next send | |
| Sticky until manually reverted | Stays in the chosen mode until Admin switches it back | ✓ |

**Question:** Should the simulator's deterministic failure/delay toggle (D-16) auto-revert after one send, given the risk of a forgotten toggle silently failing a live demo?
**User's choice:** Sticky until manually reverted → D-27
**Notes:** User accepted the demo-risk tradeoff explicitly after it was flagged.

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress the escalation resend | Owner gets one reminder touch that day, not two | ✓ |
| Let both send | Some redundancy is acceptable | |

**Question:** Vaccine/deworming ADVANCE-touch escalation can land on the same day as the ON_DATE touch's first send — should one be suppressed?
**User's choice:** Suppress the escalation resend → D-28
