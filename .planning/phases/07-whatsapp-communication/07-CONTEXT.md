# Phase 7: WhatsApp Communication - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The clinic communicates with pet owners via WhatsApp for automated reminders (follow-up, vaccine-due, deworming-due), invoice delivery, and appointment booking — all through a simulator with a clean abstraction layer swappable for the real Meta Business API later. Delivers: provider abstraction layer, six Beta message templates, booking conversation flow with provisional slot records, reminder scheduling with bounded escalation, consent/opt-out tracking, and a mobile staff inbox/thread log for every message flow. Phase 7 sits on top of Phase 4 (follow-up/vaccine/deworming due dates), Phase 5 (want-list share), and Phase 6 (invoice delivery, payment reminders). It does NOT build a real calendar (Phase 8 owns that) or a general customer-support chat — booking records here are explicitly provisional and confirmed bookings do not auto-enter the walk-in queue.

07-UI-SPEC.md (approved 2026-05-06) already locks the screens, copy, interaction contract, and component inventory for this phase. This discussion focused only on implementation decisions the UI-SPEC left open: reminder cadence/escalation, booking approval flow, consent/opt-out scope, and simulator demo behavior.

</domain>

<decisions>
## Implementation Decisions

### Reminder Cadence & Escalation
- **D-01:** Follow-up reminder fires twice — 1 day before the follow-up date set at consultation end (Phase 4 D-09), and again on the date itself.
- **D-02:** Vaccine/deworming due reminder fires twice — a fixed 3 days before the due date (Phase 4 D-42/D-43), and again on the due date. Not configurable for Beta (no admin picker, unlike Phase 5's expiry lead-time config).
- **D-03:** Bounded escalation on no-reply — if the owner doesn't respond to a follow-up/vaccine/deworming reminder, the system resends. Claude's discretion on exact count/spacing; recommended default is 2 total attempts, 3 days apart.
- **D-04:** After the escalation cap is reached with no reply, the thread is flagged "Needs action" in the inbox (using the filter chip already in UI-SPEC). No further automated sends happen after that — a human decides whether to call the owner.
- **D-05:** Payment reminders for overdue invoices (deferred from Phase 6) are manual-only in Phase 7 — no automated sending or escalation logic at all. Front desk sends the "Payment reminder" template by hand from invoice detail. This is a deliberate exception to D-03's escalation pattern — do not generalize escalation to payment reminders.

### Booking Approval Flow
- **D-06:** Booking requests auto-confirm as soon as the requested clinic-hours slot is open — no staff review gate before the owner gets a confirmation. Staff still see the booking land in the thread via the ConversationActionCard.
- **D-07:** Slot conflicts resolve first-come-first-served — the first booking request to arrive takes the slot; a second request for the same slot is told it's unavailable and prompted to pick another.
- **D-08:** A confirmed Phase 7 booking blocks that clinic-hours slot from being offered to other WhatsApp booking requests for that day, even though there's no real calendar yet (Phase 8 owns that). This is enforcement inside Phase 7's own booking-request logic, not a calendar integration.
- **D-09:** Moving or cancelling a confirmed booking is staff-only, via the Move/Cancel action cards already speced in UI-SPEC. No owner self-service quick-replies for changing a booking in Beta — an owner who wants to change a booking contacts the clinic and staff acts on it.

### Consent & Opt-Out Scope
- **D-10:** Template category split — "Payment reminder", "Follow-up reminder", "Vaccine due", and "Deworming due" are reminder-category templates an owner can silence via STOP. "Invoice delivery" and "Booking confirmation" are transactional — always attempted regardless of STOP status (per UI-SPEC's existing STOP-state copy: "Transactional messages still need staff review").
- **D-11:** Opt-out is a single global per-owner toggle — one STOP silences all reminder-category templates across all of that owner's pets. No per-category opt-out granularity in Beta (there's no WhatsApp-native mechanism for it without adding new quick-reply chips beyond what UI-SPEC defines).
- **D-12:** WhatsApp communication requires explicit opt-in consent, captured and logged via Phase 1's existing `ConsentRecord` model (new `consentType` value, e.g. `whatsapp_communication`) rather than treating patient registration as implied consent. Reuses the existing consent infrastructure instead of building a parallel one.
- **D-13:** Missing consent does not block sending — the TemplateSendSheet shows its already-speced consent/preference warning, but staff can proceed anyway. Consent tracking is for audit/compliance visibility, not an operational gate, for Beta.

### Simulator Demo Realism
- **D-14:** Simulated owner replies are auto-generated after a short delay rather than manually triggered by staff — threads feel alive for pilot-clinic demos without anyone touching the Config screen mid-demo.
- **D-15:** For booking action cards (Confirm/Move/Cancel), the simulator's auto-reply always takes the positive/default path (Confirm). Cancel/Move scenarios are not auto-simulated in Beta — those still require someone to drive the thread manually if a demo needs to show them.
- **D-16:** The deterministic failure/delayed-delivery/invalid-number controls (already locked in UI-SPEC's SimulatorControlCard) apply as a global toggle affecting the next send(s), not a per-owner/thread override. Simpler single control surface; matches the SimulatorControlCard states as speced.

### Research-Driven Decisions (post-07-RESEARCH.md, 2026-08-12)
- **D-17:** Mobile UI library — spike the React Native Paper v5 integration in Wave 0 before building Phase 7 screens. Add `@breeyo/ui`, `react-native-paper`, `react-native-reanimated`, and `react-native-gesture-handler` to `apps/mobile` and verify Expo SDK 52 compatibility. If the spike proves fiddly mid-phase, fall back to plain RN components matching UI-SPEC's token values (spacing, color, typography, touch targets) — but the spike happens first, not a silent implementer decision.
- **D-18:** Invoice PDF delivery — `invoice_delivery` sends link-only in Beta (payment link + invoice number/amount as template variables), no PDF attachment. This is a deliberate, documented deviation from UI-SPEC's "automatically includes invoice PDF" line, driven by: PDFs are generated client-side via `expo-print` (not installed), the attachment service returns a mock presigned URL in dev, and Phase 6 (invoicing) itself isn't built yet. Keep `WaMediaRef` in the provider port so real attachment is additive later.
- **D-19:** Missing Phase 3–6 Prisma migrations are in scope as Wave 0 of Phase 7. Only 2 migrations exist for 29 schema models; the dev/CI database has no `pets`, `consultations`, `vaccination_records`, etc. Phase 7 cannot be verified against a fresh database without this. Framed as a prerequisite, not scope creep.
- **D-20:** `SEND_WHATSAPP` permission stays granted to Admin, Clinician, and Front Desk (unchanged) — a vet sending a follow-up template from a consultation is sensible. UI-SPEC's "Access is limited to Front Desk and Admin" applies to the Inbox/Thread *screens* (gated on Front Desk + Admin) and the Config screen (gated on existing `MANAGE_CLINIC_SETTINGS`, Admin-only) — not to the send action itself.

### Claude's Discretion
- Exact escalation attempt count and interval for bounded reminder escalation (D-03) — recommended default: 2 attempts, 3 days apart
- BullMQ job scheduling design for reminder cadence (delay jobs, repeatable jobs, or cron sweep matching Phase 5's daily-expiry-cron pattern)
- Provider abstraction layer interface shape (how the simulator and future real Meta API both implement it)
- Booking slot-blocking data model (how "confirmed booking blocks a slot" is represented without a real calendar)
- Exact auto-reply delay timing for simulator realism (D-14)
- `ConsentRecord.consentType` naming convention and where in the flow consent gets captured (registration vs. first WhatsApp send)
- Template variable rendering and validation approach
- Retry/backoff mechanics for provider-level delivery failures (distinct from the escalation-on-no-reply behavior in D-03/D-04)
- Unstructured free-text inbound replies (not matching a recognized button/list payload) are logged as a plain inbound message in the thread for staff to read; they do NOT auto-flag "Needs action" — Beta has no NLP and this keeps the behavior simple and predictable
- A reminder message already QUEUED or dispatched before an owner's STOP is processed still gets sent; only sends enqueued after the STOP is recorded are blocked — avoids clawing back a message already in flight
- A reminder task blocked by owner opt-out is marked CANCELLED (not left PENDING) so the daily sweep doesn't retry it indefinitely — keeps D-03/D-04's bounded-escalation guarantee true even for opted-out owners
- The booking module's `expireStaleRequests` function is wired into the daily reminder sweep so abandoned WhatsApp booking requests (`AWAITING_SLOT_CHOICE` with no reply) transition to `EXPIRED`; no new "Needs action" surfacing for stale bookings in Beta

### Plan Review Follow-Up Decisions (post-07-PLAN review, 2026-08-15)
- **D-21:** The WhatsApp booking conversation asks the owner which pet the appointment is for as part of the flow (a list-message step for multi-pet owners), rather than deferring pet identification to in-person check-in. Booking records must carry a `petId` like every other Phase 7 flow.
- **D-22:** `SEND_WHATSAPP` stays the single permission gate for all WhatsApp-related actions in Beta — booking cancel, booking move, owner opt-out toggling, and consent grant/withdrawal are gated by the same permission as sending, granted to Admin, Clinician, and Front Desk (unchanged from D-20). No tighter permission scope for these administrative actions in Beta.
- **D-23:** Paid-invoice WhatsApp sends use the same `invoice_delivery` template but omit the payment link/CTA — `payment_link` becomes an optional template variable, rendered only when the invoice is unpaid. No separate paid-invoice template.
- **D-24:** WhatsApp consent capture is out of scope for Phase 7's UI — no screen or quick-reply in this phase triggers a `ConsentRecord` grant. The consent lookup and warn-but-allow behavior (D-13) stays as spec'd, but actually populating a `whatsapp_communication` `ConsentRecord` is deferred to a future phase or an external/manual process. Every Phase 7 send will show the missing-consent warning until that exists — a known, accepted Beta limitation, not a bug to fix in this phase.
- **D-25:** Cancelling or moving a confirmed WhatsApp booking immediately releases its `WhatsAppSlotHold`, making the slot available again to new WhatsApp booking requests the same day.
- **D-26:** The `confirm_booking` `ConversationActionCard` is a live, tappable action (not a read-only receipt) — tapping it opens the full booking detail, consistent with how the Move/Cancel cards behave, even though D-06 means there's no approval step to perform.
- **D-27:** The simulator's deterministic failure/delayed-delivery/invalid-number toggle (D-16) is sticky per-clinic — it stays in the selected mode until an Admin manually reverts it in the Config screen. No auto-revert-after-next-send behavior in Beta. (Accepted risk: a demo can silently keep failing if staff forgets to revert it — flagged during review, user chose to keep it sticky anyway.)
- **D-28:** When an unanswered ADVANCE-touch escalation resend would land on the same day as the independent ON_DATE touch's first send (vaccine/deworming reminders, where the 3-day escalation interval coincides with the 3-day lead time), the escalation resend is suppressed — the owner receives at most one reminder message per source/kind per day.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value (mobile-first for solo vets), WhatsApp dependency constraint (Meta Business verification not started, simulator-first), price sensitivity, India data residency
- `.planning/REQUIREMENTS.md` — WHA-01 through WHA-05 are the requirements for this phase
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, dependency on Phase 6, 10-plan breakdown (07-01 through 07-10)

### UI Design Contract
- `.planning/phases/07-whatsapp-communication/07-UI-SPEC.md` — Approved UI design contract (2026-05-06). Locks: screen surfaces (Inbox, Thread, TemplateSendSheet, Config), spacing/typography/color tokens, copywriting contract (all six template names, empty/error state copy, STOP/invalid-number warning text), interaction contract (inbox filters, thread bubbles, booking action cards, simulator admin controls), component inventory, accessibility contract. Downstream agents MUST read this before planning screens — do not re-derive UI decisions already locked here.

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` — RBAC with per-user permission overrides (D-16), multi-tenant RLS (D-22-D-26), API conventions `/api/v1/{resource}` (D-27-D-30), immutable audit trail pattern (D-34-D-36), existing `ConsentRecord` model (consent-based cross-clinic sharing, D-25) — reused in this phase for WhatsApp opt-in (D-12)
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` — Follow-up reminders stored silently at consultation end, Phase 7 sends them (D-09); vaccination tracker with next-due-date calculation feeds Phase 7 reminders (D-42); deworming tracker similarly feeds Phase 7 (D-43)
- `.planning/phases/05-inventory-management/05-CONTEXT.md` — Want-list WhatsApp share as plain formatted text (D-24), configurable expiry lead-time picker pattern (D-21) considered and explicitly NOT reused for vaccine/deworming reminders (D-02 uses a fixed value instead)
- `.planning/phases/06-invoicing-payments/06-CONTEXT.md` — Invoice PDF sharing via WhatsApp abstraction layer (D-16); automated overdue payment reminders explicitly deferred to Phase 7 (resolved here as manual-only, D-05); one-invoice-per-pet model (D-27)

### Technology Stack
- `.planning/research/STACK.md` — React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Prisma, TypeScript, Zustand, React Query, zod, BullMQ

No additional external specs or ADRs — requirements fully captured in decisions above, REQUIREMENTS.md, and 07-UI-SPEC.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/modules/notifications/notification-bus.ts` — BullMQ `Queue`-based event bus (`emit`/`emitBulk` with retry/backoff job options). The WhatsApp provider abstraction and reminder scheduling can follow this same shape rather than inventing a new dispatch pattern
- `apps/api/src/lib/audit-log.ts` — existing audit trail utility; extend to log WhatsApp message sends/status changes per D-16's audit expectations from Phase 1
- `ConsentRecord` model (`apps/api/prisma/schema.prisma`) — generic consent model (`consentType`, `purposeText`, `grantedAt`/`withdrawnAt`, `actorId`) already exists from Phase 1. Reused directly for D-12 rather than creating a WhatsApp-specific consent table
- `packages/ui/src/wireframes/whatsapp/MessageLogScreen.stories.ts` — Phase 2 wireframe already sketches a WhatsApp message log screen; check for reusable layout/component decisions before building the real Inbox/Thread screens

### Established Patterns
- Monorepo bounded-context module structure from Phase 1 — WhatsApp module follows `apps/api/src/modules/whatsapp/` (or similar) pattern
- PostgreSQL RLS multi-tenancy from Phase 1 — all WhatsApp messages/threads/booking records scoped to clinic tenant
- BullMQ workers from Phase 1's notification system — reminder scheduling (D-01/D-02) and escalation (D-03) likely implemented as delayed/repeatable jobs following this existing pattern
- Daily cron pattern from Phase 5 (D-56, daily expiry check) — a similar daily sweep could drive due-date reminder triggers (D-02) rather than per-item scheduled jobs, Claude's discretion on which fits better
- Zod schema validation and Prisma Client Extensions for RLS — same conventions as every prior phase

### Integration Points
- EMR (Phase 4) — follow-up reminder dates and vaccination/deworming due dates are the trigger inputs for D-01/D-02
- Inventory (Phase 5) — want-list WhatsApp share (D-24) uses the same abstraction layer Phase 7 builds
- Billing (Phase 6) — invoice PDF delivery and payment reminder template (manual-only per D-05) both send through this phase's abstraction layer
- Owner Portal (Phase 9) — may eventually surface WhatsApp thread history or consent status to owners; not in scope for Phase 7
- Scheduling (Phase 8) — Phase 7's provisional booking records are a known, deliberate gap until Phase 8's real calendar exists (D-08's slot-blocking is a stopgap, not calendar integration)

</code_context>

<specifics>
## Specific Ideas

- The "before + on the date" two-touch reminder pattern (D-01, D-02) mirrors how a caring front-desk staff member would actually nudge an owner — one advance heads-up, one on the day
- Bounded escalation with a hard stop into "Needs action" (D-03/D-04) keeps the system from nagging owners indefinitely while still surfacing genuinely stuck cases to a human
- Payment reminders staying manual-only (D-05) is a deliberate carve-out — money conversations are the one place staff want direct control rather than an automated chase, especially in a pilot with small clinics who know their patients personally
- Auto-confirm booking (D-06) plus slot-blocking (D-08) tries to get the convenience of a real booking bot without pretending Phase 7 has a real calendar — it's an honest stopgap, not a workaround
- Auto-replying simulator (D-14) exists specifically so a solo vet or sales demo to a pilot clinic doesn't require someone hand-puppeting "the owner" during a live walkthrough
- Reusing `ConsentRecord` (D-12) instead of a new WhatsApp-specific consent table keeps the audit/compliance story consistent across the whole app rather than fragmenting it per feature

</specifics>

<deferred>
## Deferred Ideas

- Configurable reminder lead times (admin-adjustable, like Phase 5's expiry lead-time picker) — Beta ships fixed values (1 day before follow-up, 3 days before vaccine/deworming due) per D-01/D-02; configurability deferred to post-Beta if clinics ask for it
- Per-category opt-out granularity (owner silences vaccine reminders but keeps payment reminders) — deferred; D-11 keeps opt-out as a single global toggle for Beta
- Owner self-service booking move/cancel via quick-reply — deferred; D-09 keeps this staff-only for Beta
- Escalating/automated payment reminders — deferred; D-05 keeps payment reminders manual-only for Beta, revisit post-Beta once real payment behavior data exists
- Admin-scriptable simulator outcomes (choosing which quick-reply the simulated owner "picks" per scenario) — deferred; D-15 keeps the auto-reply always taking the positive/default path for Beta

None of the above are scope creep — all stayed within Phase 7's domain (reminders, invoice delivery, booking, simulator, logging) and were narrowed to a Beta-appropriate default rather than expanded.

</deferred>

---

*Phase: 07-whatsapp-communication*
*Context gathered: 2026-08-12*
