# PRD-07: WhatsApp Communication

**Type:** Full PRD
**Phase:** 07 - WhatsApp Communication
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 7 introduces WhatsApp-based communication between veterinary clinics and pet owners, enabling automated preventive-care reminders, invoice delivery, and appointment booking through a conversational interface. All communication runs through a simulator that faithfully reproduces the WhatsApp Business API contract, allowing the team to build, test, and ship the full feature set without waiting for Meta Business API approval. The simulator is swappable for the real Meta API via a single configuration change, with no code modifications required in the application layer. Every message -- sent or received -- is logged and surfaced in a mobile inbox that clinic staff use daily, ensuring full visibility and auditability of all owner interactions.

This phase sits on top of Phases 4 (EMR), 5 (Inventory), and 6 (Invoicing), integrating with vaccination/deworming records for preventive-care reminders, with invoices for payment delivery, and with the clinic's operating hours for appointment booking slots. It is the first phase where Breeyo reaches outside the clinic's walls to directly engage pet owners.

---

## 2. Problem Statement

Indian veterinary clinics lose significant revenue and compromise animal welfare due to missed follow-ups. Pet owners forget vaccination schedules, skip deworming doses, and lose paper invoices. Clinics that attempt manual WhatsApp communication face three problems:

1. **No automation.** Clinic staff manually compose and send individual WhatsApp messages for reminders. A clinic with 500 active patients cannot sustain this -- reminders stop being sent within weeks.
2. **No record keeping.** Messages sent from personal WhatsApp accounts are not logged against patient records. When an owner calls back asking "what was my dog's next vaccine date?", the vet has no searchable record.
3. **No booking path.** Owners who want to schedule a visit must call during clinic hours. Missed calls mean missed appointments, especially for working pet owners who cannot call during business hours.

WhatsApp is the dominant messaging platform in India with over 500 million users. Pet owners already expect to communicate with service providers via WhatsApp. Breeyo must meet owners where they are.

However, the WhatsApp Business API requires Meta approval, which is an external dependency with unpredictable timelines. Building directly against the live API would block the entire feature. A simulator-first approach lets the team deliver, test, and validate the complete user experience while the Meta approval process runs in parallel.

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Solo Vet / Admin

- **Role:** Owner-operator who configures WhatsApp templates, reviews the inbox for booking requests, and monitors reminder delivery status.
- **Context:** Wants automated reminders to replace the manual follow-up calls she currently makes (or forgets to make). Reviews the WhatsApp inbox between consultations to approve bookings and check for failed deliveries.
- **Needs:** Template configuration that works without technical knowledge. Clear visibility into what messages were sent and whether they were delivered. Confidence that switching from simulator to real WhatsApp requires no rework.
- **Frustrations:** Tools that require technical setup to configure message templates. Reminder systems that fail silently. Communication tools that do not integrate with patient records.

### Primary: Receptionist Rekha -- Front Desk Staff

- **Role:** Day-to-day manager of the WhatsApp inbox. Responds to booking requests, retries failed messages, corrects invalid phone numbers, and sends invoices to owners after consultations.
- **Context:** Sits at the front desk with the clinic's phone. Between walk-in check-ins, she monitors the WhatsApp inbox for new booking requests and failed messages that need attention. Sends invoice PDFs to owners as they leave.
- **Needs:** A simple inbox that surfaces what needs attention first. One-tap invoice sending from the billing screen. Clear guidance when a message fails (why it failed, what to do). Ability to correct an owner's phone number without navigating away from the thread.
- **Frustrations:** Switching between WhatsApp and the clinic app. Copy-pasting invoice details into personal WhatsApp. Not knowing which reminders were actually delivered.

### Primary: Owner Ananya -- Pet Owner

- **Role:** Receives WhatsApp messages from the clinic and interacts with booking flows.
- **Context:** Working professional with two dogs. Relies on the clinic to remind her about vaccinations and deworming. Prefers to book appointments via WhatsApp rather than calling during work hours.
- **Needs:** Timely reminders she can act on. Easy appointment booking without installing an app. Invoice receipts she can save in her chat history. Ability to opt out of non-essential reminders.
- **Frustrations:** Clinics that never follow up. Having to call during business hours to book. Losing paper invoices and not having digital copies.

---

## 4. Strategic Context

- **Market fit:** WhatsApp has 500M+ users in India. Veterinary clinics that communicate via WhatsApp report 40-60% higher follow-up compliance compared to SMS or phone calls. Building WhatsApp into Breeyo is not a nice-to-have -- it is table stakes for the Indian market.
- **Revenue impact:** Automated reminders directly drive repeat visits. Each reminder that converts to a visit generates consultation revenue plus potential dispensing revenue. For a clinic seeing 20 patients/day, even a 10% increase in follow-up visits from reminders translates to meaningful revenue growth.
- **Platform positioning:** Breeyo becomes more than an internal clinic tool -- it becomes the communication bridge between clinic and owner. This increases switching costs and deepens platform stickiness.
- **Simulator-first strategy:** The Meta WhatsApp Business API approval process can take 2-8 weeks and may require iteration. Building against a simulator means the feature ships on schedule regardless of Meta's timeline. The abstraction layer also future-proofs the system for alternative channels (SMS fallback, Telegram, etc.) without architectural changes.
- **Dependency chain:** WhatsApp communication depends on EMR (Phase 4) for vaccination/deworming records, Inventory (Phase 5) for dispensing context, and Invoicing (Phase 6) for invoice PDFs and payment links. Phase 8 (Scheduling) will later extend the booking flow to auto-enter confirmed appointments into the queue.
- **Consent compliance:** India's data protection regulations and WhatsApp's own policies require explicit owner consent for non-transactional messages. Building consent management from the start avoids retrofitting and potential policy violations.

---

## 5. Solution Overview

### 5.1 Provider Abstraction Layer (WHA-04)

| Capability | Details |
|---|---|
| **Provider registry** | A registry pattern where messaging providers (simulator, Meta WhatsApp Business API, future SMS/Telegram) register themselves. The active provider is selected via environment configuration (`WHATSAPP_PROVIDER=simulator` or `WHATSAPP_PROVIDER=meta`). |
| **Simulator pipeline** | A local simulator that accepts the same request contract as the Meta API, persists messages to the database, simulates delivery status callbacks (queued -> sent -> delivered), and supports deterministic failure scenarios configured by admin. |
| **Provider interface** | A TypeScript interface (`WhatsAppProvider`) that all providers implement: `sendTemplate()`, `sendFreeform()`, `handleWebhook()`, `getDeliveryStatus()`. Application code never references a specific provider. |
| **Template rendering** | Templates are stored as parameterized strings with variable placeholders (e.g., `{{ownerName}}`, `{{petName}}`, `{{vaccineDueDate}}`). The rendering engine resolves variables from context and validates all required variables are present before dispatch. |
| **Config swap** | Switching from simulator to Meta API requires changing one environment variable and providing Meta API credentials. No code changes, no redeployment of application logic. |

### 5.2 Consent & Preference Management

| Capability | Details |
|---|---|
| **Owner consent** | Consent is captured per owner with granularity: `reminders` (vaccination, deworming, follow-up), `invoices` (transactional), `bookings` (booking confirmations/updates). Owners can opt out of reminder categories while still receiving transactional messages. |
| **Preference storage** | Consent preferences stored on the Owner model with timestamps for audit. Default: opted-in for all categories on first registration (soft consent). |
| **STOP handling** | If an owner sends STOP (or the simulator emulates it), reminder messages are suppressed. Transactional messages (invoices, booking confirmations) still require staff review before sending. |
| **Staff visibility** | The thread view shows consent state clearly. Staff see warnings when attempting to send to an opted-out owner. |

### 5.3 Automated Reminders (WHA-01)

| Capability | Details |
|---|---|
| **Follow-up reminders** | Triggered N days after a consultation (configurable per clinic, default: 7 days). Template includes pet name, consultation date, and clinic contact. |
| **Vaccination-due reminders** | Triggered when a pet's next vaccination date is approaching (configurable lead time, default: 7 days before due). Template includes pet name, vaccine name, and due date. |
| **Deworming-due reminders** | Triggered when a pet's next deworming date is approaching (configurable lead time, default: 7 days before due). Template includes pet name, treatment name, and due date. |
| **Scheduling** | Reminders are scheduled via BullMQ jobs. A daily scanner identifies pets with upcoming due dates and enqueues reminder jobs. Jobs respect clinic operating hours (no messages sent outside 8 AM - 8 PM IST). |
| **Bounded retries** | Failed reminder deliveries retry up to 3 times with exponential backoff (1h, 4h, 12h). After 3 failures, the reminder is marked as permanently failed and surfaces in the inbox as "Needs action" for staff review. |
| **Deduplication** | The system prevents duplicate reminders for the same pet + reminder type + due date within a configurable window (default: 48 hours). |

### 5.4 Invoice Delivery (WHA-02)

| Capability | Details |
|---|---|
| **Invoice send** | Staff can send an invoice to the pet owner via WhatsApp from the invoice detail screen. The message includes the invoice PDF as an attachment and, for unpaid invoices, a Razorpay payment link. |
| **Payment reminder** | Staff can send a payment reminder for overdue invoices. Template includes amount due, invoice number, and payment link. |
| **Paid invoice receipt** | When an invoice is marked paid, staff can send a receipt confirmation. Template includes amount paid, invoice number, and payment date. No payment link included. |
| **Context send** | The "Send Template" bottom sheet pre-fills recipient, template, and variables from the invoice context. Staff confirm before sending. |

### 5.5 Appointment Booking via Conversation (WHA-03)

| Capability | Details |
|---|---|
| **Booking conversation flow** | A structured conversation flow where the simulated owner can request an appointment. The flow collects: pet selection (if owner has multiple pets), preferred date, preferred time slot, and reason for visit. |
| **Slot selection** | Available slots are derived from clinic operating hours and slot duration (configurable, default: 30 minutes). The system presents available slots for the requested date. |
| **Provisional capture** | When an owner selects a slot, a provisional booking is created with a 15-minute hold. If the owner does not confirm within 15 minutes, the slot is released. |
| **Staff actions** | Staff can confirm, cancel, or move a booking from the thread view using action cards. Confirmation sends a booking confirmation template to the owner. |
| **No queue auto-entry** | Confirmed Phase 7 bookings do NOT auto-enter the walk-in queue (that integration comes in Phase 8). Staff see helper text: "Check in manually when the owner arrives." |
| **Booking record** | Each booking is persisted with status (provisional, confirmed, cancelled, completed, no-show), linked to the owner, pet, and WhatsApp thread. |

### 5.6 Message Logging & Mobile Inbox (WHA-05)

| Capability | Details |
|---|---|
| **Message persistence** | Every message (outgoing and simulated incoming) is persisted with: sender, recipient, template used, variables resolved, delivery status, timestamps, and failure reason if applicable. |
| **Inbox screen** | A WhatsApp-style thread list grouped by owner mobile number. Each row shows owner name, last message preview, timestamp, and status indicator (delivered, failed, needs action). |
| **Thread screen** | Chat-bubble UI showing the full conversation history with an owner. Outgoing messages align right (green-tinted). Simulated incoming messages align left. Context cards appear inline for invoices, reminders, and bookings. |
| **Filtering** | Horizontal filter chips on the inbox: All, Invoices, Reminders, Bookings, Failed, Needs action. |
| **Search** | Search by owner name, mobile number, pet name, invoice number, or booking reference. |
| **Failed message handling** | Failed messages show the failure reason inline. Staff can retry, call the owner, or mark as resolved. |
| **Invalid number correction** | When a message fails due to an invalid number, staff can correct the owner's phone number directly from the thread view without navigating to the owner profile. The corrected number is saved to the owner record and the message is retried. |

### 5.7 Simulator Admin Controls

| Capability | Details |
|---|---|
| **Config screen** | Admin-only screen for configuring simulator behavior: default delivery mode (instant success, delayed delivery, deterministic failure, invalid number). |
| **Deterministic failures** | Admin can configure specific owner numbers or message types to always fail, enabling QA of failure handling flows without randomness. |
| **Delivery delay** | Admin can set a simulated delivery delay (e.g., 5 seconds) to test the queued -> sent -> delivered status progression. |
| **Provider label** | The simulator is labeled as "Simulator" in config and log surfaces. Thread views maintain the WhatsApp-like appearance regardless of provider. |

### 5.8 Cross-Module Send Integrations

| Capability | Details |
|---|---|
| **Invoice detail** | "Send via WhatsApp" action on the invoice detail screen opens the TemplateSendSheet pre-filled with invoice template, owner, and invoice variables. |
| **Pet profile** | "Send Reminder" action on vaccination/deworming cards opens the TemplateSendSheet pre-filled with the appropriate reminder template. |
| **Consultation completion** | After finalizing a consultation, an optional prompt offers to send a follow-up reminder (scheduled, not immediate). |
| **Owner preference UX** | Owner profile shows WhatsApp preference toggles: reminders ON/OFF, invoices ON/OFF, bookings ON/OFF. Changes update consent record. |

### 5.9 API Design

- REST API with `/api/v1/whatsapp/{resource}` convention.
- Module structure: `modules/whatsapp/` with provider, template, inbox, booking, reminder, and config sub-modules.
- WebSocket events for real-time inbox updates (new message, status change).
- All endpoints require authentication. Inbox/thread endpoints require Front Desk or Admin role. Config endpoints require Admin role.
- Rate limiting: standard 200 req/min. Template send limited to 60/min per clinic to prevent abuse.

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Reminder delivery** | Automated follow-up, vaccination-due, and deworming-due reminders are sent via WhatsApp (simulated) without manual staff intervention | Integration tests verify reminder scheduling, dispatch, and delivery status progression |
| 2 | **Invoice delivery** | Staff can send invoices (with PDF attachment and payment link) to owners via WhatsApp from the invoice detail screen | Integration test: invoice send -> message persisted -> delivery status updated -> thread visible in inbox |
| 3 | **Booking conversation** | Owner can request, select a slot, and confirm an appointment through a WhatsApp conversation flow (simulated) | Integration test: booking request -> slot selection -> provisional hold -> confirmation -> booking record created |
| 4 | **Provider swappability** | Switching from simulator to Meta API requires only a configuration change (environment variable + credentials), with zero application code modifications | Verification: swap `WHATSAPP_PROVIDER` env var, confirm all existing tests pass against the provider interface |
| 5 | **Message logging** | All WhatsApp message flows (reminders, invoices, bookings, retries, failures) are persisted and viewable in the mobile inbox | Integration test: every message type appears in inbox with correct status, thread view shows full history |
| 6 | **Failure handling** | Failed messages surface in inbox with reason, retry capability, and resolution tracking | Integration test: simulate failure -> inbox shows "Failed" filter -> staff retries -> status updates |
| 7 | **Consent compliance** | Opted-out owners do not receive reminder messages; transactional messages require staff review | Integration test: owner opts out -> scheduled reminder is suppressed -> transactional send shows warning |

---

## 7. User Stories & Requirements

### WHA-01: Automated Reminders

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-01.1 | As a vet, I want the system to automatically send vaccination-due reminders to pet owners via WhatsApp so that pets do not miss their scheduled vaccinations. | 1. A daily scanner job identifies pets with vaccination due dates within the configured lead time (default: 7 days). 2. A reminder message is queued using the "Vaccine due" template with pet name, vaccine name, and due date. 3. The message is dispatched via the active provider (simulator). 4. Delivery status progresses through queued -> sent -> delivered. 5. The reminder appears in the owner's thread in the mobile inbox. 6. No reminder is sent if the owner has opted out of reminders. 7. No duplicate reminder is sent for the same pet + vaccine + due date within 48 hours. |
| WHA-01.2 | As a vet, I want the system to automatically send deworming-due reminders to pet owners via WhatsApp so that pets stay on their deworming schedule. | 1. A daily scanner job identifies pets with deworming due dates within the configured lead time. 2. A reminder message is queued using the "Deworming due" template with pet name, treatment name, and due date. 3. Delivery and logging behavior identical to WHA-01.1. 4. Consent and deduplication rules apply. |
| WHA-01.3 | As a vet, I want the system to automatically send follow-up reminders after consultations so that owners bring their pets back for post-treatment check-ups. | 1. When a consultation is finalized, a follow-up reminder job is scheduled for N days later (configurable, default: 7). 2. The reminder uses the "Follow-up reminder" template with pet name, original consultation date, and clinic contact. 3. The reminder is dispatched at the scheduled time, respecting clinic operating hours (8 AM - 8 PM IST). 4. Consent and deduplication rules apply. |
| WHA-01.4 | As a vet, I want failed reminders to retry automatically with bounded retries so that transient failures do not cause missed reminders. | 1. A failed reminder retries up to 3 times with exponential backoff (1h, 4h, 12h). 2. Each retry attempt is logged with timestamp and failure reason. 3. After 3 failures, the reminder is marked "permanently failed." 4. Permanently failed reminders appear in the inbox under the "Failed" and "Needs action" filters. 5. Staff can manually retry or mark as resolved from the thread view. |
| WHA-01.5 | As a vet, I want to configure reminder lead times and follow-up intervals per clinic so that reminders match my practice's protocols. | 1. Admin can set vaccination reminder lead time (days before due date, default: 7). 2. Admin can set deworming reminder lead time (default: 7). 3. Admin can set follow-up reminder interval (days after consultation, default: 7). 4. Changes take effect for newly scheduled reminders; already-queued reminders are not retroactively changed. |

### WHA-02: Invoice Delivery

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-02.1 | As a receptionist, I want to send an invoice to the pet owner via WhatsApp so that they have a digital copy and a payment link. | 1. Invoice detail screen shows a "Send via WhatsApp" action button. 2. Tapping opens the TemplateSendSheet pre-filled with: recipient (owner name + mobile), template ("Invoice delivery"), invoice number, amount, line item summary, and PDF attachment reference. 3. For unpaid invoices, the Razorpay payment link is included in the template. 4. For paid invoices, the payment link is omitted. 5. Staff confirms and taps "Send Template." 6. Message is dispatched, logged, and appears in the owner's thread. 7. A success toast ("Message queued") is shown. |
| WHA-02.2 | As a receptionist, I want to send a payment reminder for overdue invoices so that owners are prompted to pay. | 1. Overdue invoices show a "Send Payment Reminder" action. 2. TemplateSendSheet opens with the "Payment reminder" template, amount due, invoice number, and payment link. 3. Staff confirms and sends. 4. Message is logged and appears in thread. |
| WHA-02.3 | As an owner, I want to receive my invoice as a PDF on WhatsApp so that I have a permanent digital record. | 1. The invoice delivery message includes the invoice PDF as an attachment. 2. The PDF is the same GST-compliant format generated in Phase 6. 3. The attachment reference is visible in the thread view as a context card with invoice number and amount. |

### WHA-03: Appointment Booking via Conversation

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-03.1 | As an owner, I want to request an appointment via WhatsApp so that I can book without calling the clinic. | 1. The simulated owner can initiate a booking request via a scripted quick-reply. 2. The system responds with available dates (next 7 days). 3. The owner selects a date, and the system responds with available time slots derived from clinic hours and slot duration. 4. The owner selects a slot. 5. A provisional booking is created with a 15-minute hold timer. 6. The owner is prompted to confirm. 7. On confirmation, the booking status changes to "confirmed" and a "Booking confirmation" template is sent. |
| WHA-03.2 | As a receptionist, I want to see booking requests in my WhatsApp inbox so that I can confirm, move, or cancel them. | 1. Booking conversations appear in the inbox with a "Bookings" filter. 2. The thread view shows action cards: "Confirm Booking," "Move Booking," "Cancel Booking," "Call Owner." 3. Confirming sends a booking confirmation message to the owner. 4. Cancelling requires a confirmation bottom sheet with reason. The cancellation is logged and the owner is notified. 5. Moving allows staff to select a different date/time and notifies the owner of the change. |
| WHA-03.3 | As a receptionist, I want provisional bookings to auto-expire if the owner does not confirm so that slots are not held indefinitely. | 1. A provisional booking has a 15-minute TTL. 2. If the owner does not confirm within 15 minutes, the booking status changes to "expired" and the slot is released. 3. The expiration is logged in the thread. 4. Staff see a system message: "Booking request expired -- slot released." |
| WHA-03.4 | As a receptionist, I want confirmed bookings to show a manual check-in reminder so that I know to add the patient to the queue when they arrive. | 1. Confirmed booking cards in the thread show helper text: "Check in manually when the owner arrives." 2. No automatic queue entry occurs (Phase 8 integration). 3. The booking detail shows pet name, owner name, date, time, and reason for visit. |
| WHA-03.5 | As an owner, I want to select which pet the appointment is for when I have multiple pets so that the booking is recorded against the correct animal. | 1. If the owner has multiple pets registered, the booking flow presents a pet selection step. 2. The selected pet is linked to the booking record. 3. If the owner has only one pet, the pet selection step is skipped and the single pet is auto-selected. |

### WHA-04: Provider Abstraction Layer

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-04.1 | As a developer, I want a clean provider interface so that I can swap the WhatsApp simulator for the real Meta API without changing application code. | 1. A `WhatsAppProvider` TypeScript interface exists with methods: `sendTemplate()`, `sendFreeform()`, `handleWebhook()`, `getDeliveryStatus()`. 2. Both `SimulatorProvider` and `MetaApiProvider` implement this interface. 3. The active provider is selected by the `WHATSAPP_PROVIDER` environment variable. 4. All application code references the provider through the registry, never directly. |
| WHA-04.2 | As an admin, I want the simulator to faithfully reproduce the Meta API contract so that features validated against the simulator work without changes on the real API. | 1. The simulator accepts the same request payload structure as the Meta API. 2. The simulator returns the same response structure. 3. The simulator fires delivery status webhooks (queued -> sent -> delivered) matching the Meta webhook format. 4. The simulator supports configurable delay between status transitions. |
| WHA-04.3 | As an admin, I want to configure the simulator to produce deterministic failures so that I can test error handling without randomness. | 1. Admin config screen allows setting: specific owner numbers that always fail, specific template types that always fail, delivery delay duration, invalid-number simulation for specific numbers. 2. Failure scenarios are deterministic and repeatable. 3. Normal (non-configured) messages succeed immediately or with configured delay. |
| WHA-04.4 | As a developer, I want all six Beta templates rendered with variable substitution so that messages are personalized and complete. | 1. Six templates exist: Invoice delivery, Payment reminder, Follow-up reminder, Vaccine due, Deworming due, Booking confirmation. 2. Each template has defined required variables (e.g., `{{ownerName}}`, `{{petName}}`, `{{dueDate}}`). 3. The rendering engine substitutes all variables and validates none are missing before dispatch. 4. Templates are stored in the database, editable by admin in future phases. |

### WHA-05: Message Logging & Mobile Inbox

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-05.1 | As a receptionist, I want a WhatsApp inbox in the mobile app so that I can see all owner conversations in one place. | 1. The inbox screen shows a list of threads grouped by owner mobile number. 2. Each thread row displays: owner name, mobile number, last message preview (truncated), timestamp, and status indicator. 3. Unread/needs-action threads show an orange dot indicator. 4. Failed threads show a red indicator. 5. Threads are sorted by most recent activity. 6. Pull-to-refresh reloads the thread list. |
| WHA-05.2 | As a receptionist, I want to filter the inbox by message type so that I can quickly find what needs my attention. | 1. Horizontal filter chips below the screen title: All, Invoices, Reminders, Bookings, Failed, Needs action. 2. Only one filter is active at a time. 3. Active filter chip uses accent green styling. 4. "Failed" filter shows only threads with at least one failed message. 5. "Needs action" filter shows threads with unresolved actions (failed retries, pending bookings, invalid numbers). |
| WHA-05.3 | As a receptionist, I want to search the inbox so that I can find a specific owner or message. | 1. Search bar at the top of the inbox. 2. Search matches: owner name, mobile number, pet name, invoice number, booking reference. 3. Results update as the user types (debounced, 300ms). 4. Empty search results show: "No threads match your search." |
| WHA-05.4 | As a receptionist, I want to view a full conversation thread with an owner so that I can see the complete communication history. | 1. Thread screen shows chat-bubble UI with outgoing messages (right-aligned, green-tinted) and incoming messages (left-aligned, secondary surface). 2. Each bubble shows: message text, timestamp, and status badge (Queued, Sent, Delivered, Failed, Replied). 3. Context cards appear inline for invoices (with amount), reminders (with due date), and bookings (with date/time). 4. Failed messages show failure reason text and action buttons: Retry, Call Owner, Mark Resolved. 5. Scrolls to the most recent message on open. |
| WHA-05.5 | As a receptionist, I want to correct an invalid phone number from the thread view so that I can fix the issue and retry without navigating away. | 1. When a message fails due to an invalid number, the thread shows an "Invalid number" warning with the current number. 2. A "Correct Number" action opens an inline editor. 3. Staff enters the corrected number. 4. A confirmation bottom sheet asks: "Update owner's mobile number to +91XXXXXXXXXX?" 5. On confirmation, the owner record is updated, and the failed message is automatically retried. 6. If the corrected number also fails, the failure surfaces again with retry options. |
| WHA-05.6 | As a receptionist, I want to see the owner's WhatsApp preferences in the thread so that I know if they have opted out of certain message types. | 1. Thread header or info section shows consent status: reminders (ON/OFF), invoices (ON/OFF), bookings (ON/OFF). 2. If an owner has opted out of reminders, a warning banner appears: "Owner has opted out of reminders. Transactional messages still need staff review." 3. If staff attempts to send a suppressed message type, a confirmation dialog warns about the opt-out before allowing manual override. |
| WHA-05.7 | As an admin, I want to manage owner WhatsApp preferences from the owner profile so that I can respect owner communication choices. | 1. Owner profile shows WhatsApp preference toggles: reminders, invoices, bookings. 2. Toggling OFF shows a confirmation: "Stop reminders for this owner? Non-essential reminders will no longer be sent." Confirm: "Stop Reminders." Cancel: "Keep Reminders." 3. Changes are saved to the owner's consent record with timestamp. 4. Changes take effect immediately for future messages; already-queued messages are not recalled. |
| WHA-05.8 | As a receptionist, I want real-time updates in the inbox so that new messages and status changes appear without refreshing. | 1. New messages appear in the inbox and active thread via WebSocket in real time. 2. Delivery status changes (queued -> sent -> delivered -> failed) update the thread bubble status badge in real time. 3. Inbox thread ordering updates when a new message arrives in a thread. 4. If WebSocket is disconnected, an offline banner appears: "You are offline. New WhatsApp actions will send when you reconnect." |

### Cross-Module Integration

| ID | Story | Acceptance Criteria |
|---|---|---|
| WHA-INT.1 | As a receptionist, I want to send an invoice via WhatsApp directly from the invoice detail screen so that I do not have to navigate to the WhatsApp inbox to find the owner. | 1. Invoice detail screen shows "Send via WhatsApp" button. 2. Tapping opens TemplateSendSheet pre-filled with invoice context. 3. After sending, the user can optionally navigate to the thread or return to the invoice. |
| WHA-INT.2 | As a vet, I want to send a vaccination or deworming reminder from the pet profile so that I can manually trigger a reminder outside the automated schedule. | 1. Pet profile vaccination/deworming cards show "Send Reminder" action. 2. Tapping opens TemplateSendSheet with the appropriate template and pre-filled variables (pet name, vaccine/treatment name, due date). 3. Message is dispatched and logged. |
| WHA-INT.3 | As a vet, I want to be prompted to schedule a follow-up reminder after finalizing a consultation so that I do not forget to set it up. | 1. After consultation finalization, a prompt appears: "Schedule a follow-up reminder?" with options: "Yes, in 7 days" (default), "Custom date," "Skip." 2. Selecting yes or custom schedules the reminder job. 3. Skipping dismisses with no reminder scheduled. 4. The reminder job respects consent and deduplication rules. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 7:

- **Real Meta WhatsApp Business API integration** -- All development is against the simulator. The Meta API provider implementation exists as a code skeleton only, to be completed when Meta approval is received.
- **Free-text NLP / AI-powered conversation** -- The booking flow uses structured quick-replies and scripted responses only. No natural language understanding is built in Beta.
- **Media messages beyond PDF attachments** -- Images, videos, and voice notes are not supported in Beta. Only PDF invoice attachments are included.
- **Group messaging / broadcast lists** -- All messages are 1:1 between clinic and owner.
- **WhatsApp-to-queue auto-entry** -- Confirmed bookings do not auto-enter the walk-in queue. That integration is Phase 8 (Scheduling & Calendar).
- **Multi-language templates** -- Templates are English-only for Beta. The i18n infrastructure from Phase 2 is available for future localization.
- **Owner-initiated free-text messages** -- The simulator handles scripted quick-reply responses only. Owners cannot send arbitrary text messages to the clinic.
- **WhatsApp catalog / product messaging** -- WhatsApp Business catalog features are not in scope.
- **Payment status webhooks via WhatsApp** -- Razorpay payment status updates are handled by the existing Phase 6 webhook, not by WhatsApp message status.
- **Web dashboard surface for WhatsApp** -- Phase 7 is mobile-only. Web inbox is Phase 9.
- **SMS fallback channel** -- The abstraction layer supports future SMS providers, but no SMS provider is implemented in this phase.
- **Template approval workflow** -- In production, Meta requires template pre-approval. This workflow is deferred until Meta API integration.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phase 4 -- EMR & Clinical Records** | Internal | Vaccination and deworming records (due dates, treatment names) are the data source for preventive-care reminders. Consultation finalization triggers follow-up reminder scheduling. |
| **Phase 5 -- Inventory Management** | Internal | Dispensing context may appear in follow-up reminder templates (e.g., medication reminders). |
| **Phase 6 -- Invoicing & Payments** | Internal | Invoice PDFs, payment links, and invoice status are required for invoice delivery and payment reminder templates. |
| **Phase 3 -- Patient Registration** | Internal | Owner mobile numbers and pet records are the foundation for all WhatsApp communication. |
| **BullMQ + Redis** | Infrastructure | Reminder scheduling, retry queues, and delivery status processing depend on BullMQ workers backed by Redis. |
| **Meta WhatsApp Business API approval** | External | Real WhatsApp delivery requires Meta approval. This is NOT a blocker for Phase 7 (simulator-first), but is required before production WhatsApp delivery. |
| **WhatsApp Business Platform pricing** | External | Meta charges per conversation (user-initiated vs. business-initiated). Cost model affects reminder frequency recommendations but does not block development. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Meta Business API not approved by launch** | High | High -- all WhatsApp communication remains simulated in production | This is the highest external dependency. Mitigation: simulator provides full feature parity for staff training and workflow validation. Approval process started in parallel. SMS fallback channel can be added via the same provider abstraction if WhatsApp approval is significantly delayed. |
| **Simulator fidelity gap with real API** | Medium | Medium -- edge cases in production that were not caught in simulation | The simulator implements the exact Meta API webhook contract. Delivery status lifecycle matches documented Meta behavior. Integration tests run against the provider interface, not the simulator directly. A "smoke test" suite exists that can run against the real API once credentials are available. |
| **Owner consent violations** | Low | Critical -- WhatsApp account ban or regulatory issues | Consent management is built-in from day one. STOP handling suppresses non-transactional messages immediately. Audit trail logs all consent changes. Template content reviewed for compliance before production use. |
| **Reminder scheduling overload** | Medium | Medium -- reminder jobs overwhelm the worker queue for large clinics | Bounded concurrency on reminder workers (configurable, default: 5 concurrent). Daily scanner runs during off-peak hours (2 AM IST). Rate limiting on template sends (60/min per clinic). Monitoring on queue depth and processing lag. |
| **Invalid phone numbers at scale** | Medium | Low -- messages fail but the correction flow handles it | Invalid number detection surfaces in the inbox. Staff can correct numbers inline. Corrected numbers are validated before retry. Bulk import (Phase 3) validates phone number format but cannot verify WhatsApp registration. |
| **Booking slot conflicts** | Low | Low -- provisional booking hold prevents double-booking | 15-minute TTL on provisional bookings with automatic expiration. Slot availability is recalculated on each request. Concurrent booking requests for the same slot are handled by optimistic locking. |
| **Staff overwhelmed by inbox volume** | Medium | Medium -- important messages (failures, bookings) get buried | "Needs action" and "Failed" filters surface urgent items first. Unread/needs-action indicators use orange/red visual weight. Future phases can add notification badges and push alerts for critical inbox items. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | What is the maximum number of reminders per day per clinic? | Clinics with large patient bases could generate hundreds of reminders daily. Need to define a daily cap or throttling policy to manage costs when switching to the real API (Meta charges per conversation). | Product + Engineering |
| 2 | Should booking confirmation require staff approval or auto-confirm? | Current design has the owner confirm, then staff can act. An alternative is requiring staff approval before confirmation. This affects workflow speed vs. staff control. | Product |
| 3 | What is the template variable fallback when data is missing? | If a pet has no recorded vaccine name (e.g., "next vaccination due" without specifying which vaccine), should the template use a generic fallback or skip the message? | Product + Engineering |
| 4 | Should the system support multiple phone numbers per owner? | Some owners may have a primary and secondary phone. Currently the system uses the single mobile number from the Owner record. WhatsApp may be registered on a different number than the one used for OTP login. | Product |
| 5 | What is the retention policy for WhatsApp message logs? | Messages accumulate over time. Need to define retention duration (90 days, 1 year, indefinite) and archival strategy. | Product + Engineering |
| 6 | How should the system handle owners who are on the old (non-WhatsApp) communication path? | Some owners may not use WhatsApp. Should there be a flag to mark owners as "WhatsApp not available" to prevent repeated failed sends? | Product |
| 7 | Should the follow-up reminder be opt-in per consultation or always scheduled? | Current design always schedules a follow-up after consultation finalization. Some consultations (e.g., grooming) may not warrant a follow-up. Should the vet choose per consultation? | Product |
| 8 | What happens when the clinic changes operating hours after bookings are confirmed? | If slots were booked during the old hours and the clinic shrinks its hours, confirmed bookings in the removed slots need handling. | Engineering |
| 9 | What is the cost projection for WhatsApp Business API conversations at 500-patient clinic scale? | Meta charges differently for user-initiated vs. business-initiated conversations. Need cost modeling to set appropriate reminder frequency defaults. | Product + Business |
| 10 | Should the simulator persist messages across server restarts? | Current design persists to the database (same as production). Confirm this is desired vs. an in-memory-only option for faster test cycles. | Engineering |

---

*This is a Full PRD for Phase 7: WhatsApp Communication. Technical implementation details are captured in the 10 plan files (07-01 through 07-10) in the planning directory. UI design contract is in 07-UI-SPEC.md.*
