# PRD-09b: Pet Owner Portal

**Type:** Lightweight PRD
**Phase:** 09b - Pet Owner Portal (Part 2 of Phase 9)
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 9b delivers a no-login, no-install web portal that pet owners access through tokenised magic links sent via WhatsApp. When an owner taps the link, they land on an overview-first home page showing pet snapshot cards and an unpaid invoice summary with balanced emphasis -- not a pay-first page. The portal provides read-only medical history organised as a visit timeline per pet (diagnosis paired with plain-language glosses, prescriptions as simple usage cards), upcoming care dates (vaccination and deworming due dates plus the next scheduled appointment), and pet-scoped invoices with Razorpay checkout supporting single or combined multi-invoice payment across pets. Links expire after 7 days with a built-in reissue path; expired links show a dedicated recovery screen, while invalid or tampered links return a 403-style no-data page with clinic contact only. The portal enforces strict data isolation: each token scopes access to a single owner's pets and invoices, and a token mismatch exposes zero data. No app install, no account creation, and no login are required. The portal deploys within the same Next.js `apps/web` package as the Phase 9a admin dashboard but on entirely separate routes with token-based authentication instead of JWT sessions.

---

## 2. Problem Statement

Pet owners at Indian veterinary clinics face five distinct friction points that a no-install portal is uniquely positioned to solve:

1. **No structured access to medical records.** After a visit, the owner relies on a paper prescription or a WhatsApp photo of handwritten notes. If they need to recall a past diagnosis, check a drug dosage, or share records with another vet, they have nothing structured to reference. The clinic has the data in Breeyo, but the owner cannot see it.

2. **Missed preventive care.** Vaccination and deworming schedules are tracked inside Breeyo (Phase 4) but are invisible to the owner between visits. Owners forget due dates, leading to missed boosters and preventable disease. The clinic sends WhatsApp reminders (Phase 7), but the owner has no persistent surface to check upcoming dates themselves.

3. **Payment friction.** Clinics issue paper receipts or verbal amounts. Owners who want to pay later -- after lab results come back, after payday, or simply after getting home -- have no self-service payment option. They must call or visit, and the clinic must chase payments manually. Breeyo already integrates Razorpay (Phase 6), but the payment link is one-directional; the owner cannot browse their invoices and choose what to pay.

4. **No appointment visibility.** Owners who booked a follow-up through the clinic have no way to confirm the date, time, or assigned vet without calling. The scheduling data exists in Phase 8, but it is not surfaced to the owner.

5. **App install barrier.** Requiring a pet owner to install a dedicated app for occasional, read-only access is disproportionate. Owners in tier-2 and tier-3 Indian cities are reluctant to install apps for services they use a few times a year. WhatsApp is already on every phone; a magic link that opens in the browser is the lowest-friction path.

The owner portal eliminates these friction points by using the communication channel owners already use (WhatsApp), the platform they already have (a web browser), and the data Breeyo already holds (EMR, invoices, schedules, vaccination records). It requires no login, no password, no app install, and no account creation.

---

## 3. Target Users & Personas

### Primary: Pet Owner Ananya

- **Age:** 31
- **Location:** Pune, India (tier-1 city)
- **Pets:** 1 Labrador (Bruno, 3 years old), 1 cat (Mimi, 1 year old)
- **Tech comfort:** Moderate -- uses WhatsApp, Google Pay, and Swiggy daily; rarely installs new apps
- **Clinic relationship:** Visits Dr. Priya's clinic 4-6 times per year for vaccinations, deworming, and the occasional illness. Receives WhatsApp messages from the clinic for appointment reminders.
- **Key need:** Tap a link in WhatsApp to see Bruno's vaccination status, check when Mimi's next deworming is due, review the prescription from last week's visit, and pay the outstanding Rs. 1,200 invoice -- all without installing anything or creating an account.
- **Frustration:** "I got a WhatsApp reminder that Bruno's booster is due but I can't remember if he got the last one. I'd have to dig through old WhatsApp messages or call the clinic."
- **Portal interaction pattern:** Opens the portal 2-4 times per 7-day link window. First opens immediately after receiving the WhatsApp link (post-visit review). May return once more to pay an invoice or check an upcoming due date.

### Secondary: Clinic Staff (Dr. Priya / Rekha) -- as portal link senders

- **Context:** After a consultation, Dr. Priya or front desk staff Rekha sends the owner a magic link via WhatsApp so the owner can review records and pay at their convenience. The link is generated from the Breeyo mobile app or web dashboard.
- **Key need:** One-action link generation. No manual URL construction, no owner onboarding to manage.
- **Frustration:** "I spend 10 minutes after each consultation explaining the prescription and vaccination schedule over WhatsApp. If the owner could just see it themselves, I'd save hours each week."
- **Portal interaction:** Does not use the portal directly. Sees portal-related exceptions (e.g., unpaid invoices, reissue requests) on the admin dashboard or mobile app.

---

## 4. Strategic Context

### No-Extra-App Posture

Breeyo's core product decision is that pet owners should not need to install a separate app. The mobile app (`@breeyo/mobile`) serves clinic staff; the owner portal is a lightweight web surface accessed through the channel owners already use. This is documented in `PROJECT.md` as a deliberate strategic choice, not a deferral.

### Phase 9 Split

Phase 9 is split into two PRDs:
- **PRD-09a** covers the admin web dashboard (browser-based clinic management for Admin and Front Desk roles).
- **PRD-09b** (this document) covers the pet owner portal (no-login, token-based, read-only records + payment).

Both deploy within the same `apps/web` Next.js package but serve entirely different audiences with different authentication models (JWT session vs. magic-link token), different data scopes (full clinic RBAC vs. owner-scoped read-only), and different design postures (dense operational vs. warm consumer).

### Requirements Addressed

| Requirement | Description |
|---|---|
| **OWN-01** | Pet owner can open a magic link from WhatsApp and view their pet's EMR history (diagnosis + prescriptions only) without logging in or installing an app |
| **OWN-02** | Pet owner can view past invoices with payment status |
| **OWN-03** | Pet owner can pay outstanding invoices via UPI through Razorpay |
| **OWN-04** | Magic links expire after 7 days with a clear expired-link screen and built-in reissue path |
| **OWN-05** | Portal loads within 3 seconds on a 4G connection (FCP performance budget) |
| **OWN-06** | Strict data isolation -- owner sees only their own pets and invoices; token mismatch returns 403 with no data exposed |
| **OWN-07** | Pet owner can see upcoming vaccination/deworming due dates and next scheduled appointment per pet |

### Competitive Advantage

No competing veterinary PMS in the Indian market offers a no-install owner portal with integrated UPI payment. Most clinics communicate records via WhatsApp photos of paper prescriptions. This feature turns every clinic visit into a digital touchpoint, reduces payment collection effort, and improves preventive care compliance through visible due dates. Every magic link sent is a Breeyo-branded touchpoint that demonstrates value to the pet owner -- creating word-of-mouth demand for clinics that do not yet use Breeyo.

### Design Philosophy

The portal is intentionally **overview-first, not pay-first** (D-46). When the owner opens the link, they see their pet's health snapshot -- pet cards with medical previews above the fold -- not an invoice demanding payment. When an unpaid balance exists, it receives **equal emphasis** alongside medical records, not dominant emphasis (D-47, D-48). When no unpaid balance exists, the home emphasises pet records first (D-50). This builds trust and positions Breeyo as a health platform, not a billing collector.

---

## 5. Solution Overview

### 5.1 Magic Link Access (OWN-01, OWN-04, OWN-06)

| Capability | Details |
|---|---|
| **Link generation** | Clinic staff triggers link creation from the Breeyo mobile app or web dashboard. The system generates a unique token hashed server-side, scoped to the specific owner and their pets/invoices at that clinic. |
| **Delivery** | The link is sent via WhatsApp through the Phase 7 WhatsApp pipeline. URL format: `portal.breeyo.app/v/{token}` -- short, WhatsApp-friendly, no query parameters (02-UI-SPEC). |
| **Token validation** | Server-side hash comparison against `OwnerPortalMagicLink.tokenHash`. Valid tokens return `READY` with clinic, owner, pet, and deep-link metadata. Tampered or mismatched tokens return `INVALID` with a 403-style no-data envelope. (D-64, D-67) |
| **Expiry** | 7-day window from `expiresAt`. Expired tokens return `EXPIRED` with reissue eligibility. (D-64) |
| **Reissue** | Expired links show a dedicated screen with a built-in "Request New Link" action. Tapping it creates a new `OwnerPortalMagicLink` row with a fresh hash, supersedes the previous link, and enqueues a WhatsApp message through the Phase 7 pipeline. (D-67) |
| **Invalid links** | Tampered, malformed, or scope-mismatched tokens render a 403-style page with no portal data, no retry CTA, and clinic contact only. (D-64, OWN-06) |
| **No login** | No login, no password, no account creation, no app install. Access is purely token-based. |

### 5.2 Owner Overview Home (D-46 through D-56)

The landing page after tapping a valid magic link. The portal defaults to an owner overview page -- not a pay-first page and not directly to a pet record (D-46).

| Element | Details |
|---|---|
| **Trust banner** | Always visible. Explains that the portal is a secure link from the owner's clinic, valid for 7 days, with no login required. Uses plain-language reassurance, not a technical security console. (D-56, D-65, D-68) |
| **Pet snapshot cards** | One card per pet, showing name, species, breed, age, and a rich medical preview (last visit, vaccination status). Cards appear above the fold. (D-49) |
| **Upcoming care dates** | Vaccination due dates, deworming due dates, and next scheduled appointment per pet. Color-coded: red for overdue, amber for due soon (within 7 days), neutral for upcoming. (OWN-07) |
| **Unpaid invoice summary** | When unpaid invoices exist: one total due amount plus the individual invoice list. Equal emphasis alongside pet records, not dominant. (D-47, D-48, D-51) |
| **No unpaid balance** | When there is no unpaid balance, the home emphasises pet records first. No billing-related messaging. (D-50) |
| **Clinic help** | Call Clinic and WhatsApp Clinic actions are always visible -- in a sticky footer or persistent help bar on every portal screen. (D-52, D-79) |
| **Session continuity** | Within the valid 7-day window, the portal remembers the last tab and selected pet and restores that context on return. (D-53) |

### 5.3 Portal Navigation (D-57 through D-64)

| Element | Details |
|---|---|
| **Top-level tabs** | `Overview`, `Records`, `Invoices`. No separate Payments tab -- payments stay inside invoice flows. (D-57, D-62) |
| **Pet switcher** | Multi-pet owners use a pet switcher under the trust banner. Switching pets updates Records and Invoices within the shared portal shell. (D-58) |
| **Invoice scoping** | Invoices are nested under each pet in navigation, not a global owner-wide invoice list. However, payment selection can combine invoices across pets into one checkout. (D-59, D-69, D-70) |
| **Deep links** | WhatsApp links can target a specific invoice or visit. Deep links open the specific target first; the rest of the portal remains fully reachable afterward. (D-60, D-63) |
| **Responsive layout** | Mobile-first single column. 320px min, 375px target, 768px max. The portal never becomes multi-column. 16px horizontal padding on mobile, 480px max readable content width on larger screens. (02-UI-SPEC) |

### 5.4 Read-Only Medical History (OWN-01, D-61, D-73 through D-77)

| Element | Details |
|---|---|
| **Visit timeline** | Read-only visit history organised as a chronological timeline per pet. Most recent visit first. Each visit row shows clinic date, diagnosis, and prescription cards. (D-61) |
| **Mixed clinical + plain language** | Clinical terminology remains visible (the real diagnosis name, the real drug name) but is paired with simpler owner-friendly wording where useful. Abbreviations and shorthand are expanded or paired with understandable wording. (D-73, D-76) |
| **Diagnosis glosses** | Each diagnosis entry includes a short plain-language gloss where useful (e.g., "Otitis Externa" paired with "Ear infection"). (D-75) |
| **Prescription usage cards** | Prescriptions appear as simple usage cards showing drug name, dosage, frequency, duration, and owner-friendly instructions -- not raw data rows or narrative notes. (D-74) |
| **Light action guidance** | Record views include light action guidance when useful (e.g., "Continue medication for 5 more days") but do not become a heavy coaching product. (D-77) |
| **Excluded data** | Internal SOAP free-text, clinician-only notes, differential diagnoses, staff comments, and clinician-only attachments are not shown. The portal projects diagnosis and prescription data only. |

### 5.5 Upcoming Care Dates (OWN-07)

A per-pet section surfaced on the Overview tab within the `OwnerSummaryCard`:

| Element | Details |
|---|---|
| **Vaccination due dates** | Vaccine name and next due date. Status classification: overdue (nextDueDate < today), due soon (within 7 days), upcoming (beyond 7 days). Color-coded: red (#BA1A1A) for overdue, amber (#E65100) for due soon, neutral for upcoming. |
| **Deworming due date** | Drug name and next due date from the most recent deworming record. Same status color coding. |
| **Next appointment** | Scheduled date/time, reason label, and assigned staff name. Sourced from Phase 8 Appointment model filtered to future CONFIRMED or EXPECTED status. |
| **No data** | When no upcoming care exists, show a brief reassuring message (e.g., "No vaccinations due right now") rather than a raw empty state. |
| **No action** | Owners can view dates but cannot reschedule, cancel, or book appointments from the portal. "To reschedule, please contact [Clinic Name]" with tappable clinic contact. |

### 5.6 Invoices and Payment (OWN-02, OWN-03, D-59, D-66 through D-72)

| Element | Details |
|---|---|
| **Invoice browsing** | Pet-scoped invoice list with status chips (Paid, Unpaid, Overdue, Processing) and per-row selection controls. (D-59) |
| **Invoice detail** | Detailed invoice view with line items, amounts, status, receipt access, and PDF/document links. PDFs and documents are accessible from invoice detail views, not from home cards. (D-54, D-55) |
| **Single invoice payment** | Owner taps "Pay Invoice" on an unpaid invoice. |
| **Multi-invoice combined payment** | Owner selects multiple invoices -- including across different pets -- into one combined checkout. (D-69, D-70) |
| **Explicit checkout handoff** | Before opening Razorpay, the portal shows a concise handoff sheet: total amount, invoices included, pet-by-pet breakdown, a note about secure external payment, and what to expect on return. (D-66) |
| **Razorpay checkout** | Payment processes through the existing Phase 6 Razorpay integration. UPI is primary; card and net banking are available as secondary Razorpay options. Full invoice amount only; partial payment not supported. |
| **Payment success return** | Success summary with receipt access shown before any further navigation. (D-71) |
| **Payment failure return** | Failure summary with retry choices and clinic help available. (D-72) |
| **Payment status** | Payment status and receipt history live inside invoice detail views, not as a large home-screen widget. (D-54) |

### 5.7 Trust and Security (OWN-06, D-56, D-65, D-68)

| Element | Details |
|---|---|
| **Trust banner** | Always visible. Plain-language explanation of secure clinic-linked access. Not a separate intro gate. Not a technical security console. (D-65, D-68) |
| **Token scoping** | Each token is hashed server-side and scoped to a specific owner, their pets, and their invoices at that clinic. Access scope is re-checked on every request via `AccessScopeService`. |
| **403 no-data response** | Invalid, tampered, or scope-mismatched tokens return a 403-style response with zero data exposed. The portal renders a minimal page with clinic contact only. |
| **Rate limiting** | Portal API endpoints are rate-limited per token to prevent abuse. |
| **Audit logging** | All token accesses are logged for audit purposes. |
| **No write access** | The portal is read-only for medical records. The only write action is payment processing, which delegates to Razorpay and the existing billing service. |

### 5.8 Portal Support Boundaries (D-78 through D-81)

| Element | Details |
|---|---|
| **Link recovery** | Supported. Expired links show "Request New Link" which generates a fresh WhatsApp link. (D-78) |
| **Payment recovery** | Supported. Failed or interrupted payments show retry options and clinic contact. (D-78) |
| **No correction requests** | The portal does not add a structured correction-request workflow for records or invoices in Phase 9. (D-80) |
| **Escalation path** | Clinic contact actions (Call Clinic, WhatsApp Clinic) are available from everywhere in the portal. (D-79) |
| **Helpful-first** | The portal tries to be helpful first with clear wording and retry options, then falls back to human clinic support. (D-81) |

### 5.9 Clinic Help / Contact (D-52, D-79)

Always visible in a sticky footer or persistent help bar on every portal screen:

- **Call Clinic** -- tappable phone number that initiates a call
- **WhatsApp Clinic** -- tappable action that opens a WhatsApp chat with the clinic
- **Clinic name** for context

This ensures the owner never feels stranded in a self-service interface without a way to reach a human.

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Portal access** | Pet owner can open a magic link from WhatsApp and view their pet's EMR history, upcoming care dates, past invoices, and pay any outstanding balance via UPI -- without logging in or installing an app | Manual QA + integration tests |
| 2 | **Data isolation** | Owner portal enforces strict data isolation -- owner sees only their own pets and invoices; token mismatch returns 403 with no data exposed | Automated cross-owner access tests |
| 3 | **Expired link recovery** | Expired links show a dedicated recovery screen with "Request New Link"; tapping it delivers a fresh WhatsApp link | Integration test + manual QA |
| 4 | **Invalid link security** | Invalid/tampered tokens render a 403-style no-data page with clinic contact only -- zero data exposed | Automated tests for tampered, malformed, and scope-mismatched tokens |
| 5 | **Portal load time** | First Contentful Paint under 3 seconds on a mobile 4G connection (OWN-05) | Lighthouse CI budget (`lighthouserc.owner-portal.json`) |
| 6 | **Payment flow** | Owner can select one or multiple invoices (including across pets), see an explicit checkout handoff, complete Razorpay payment, and see a success/failure return state | Manual QA + integration tests |
| 7 | **Upcoming care dates** | Owner can see upcoming vaccination due dates, deworming due dates, and next scheduled appointment per pet on the Overview tab | Component tests + manual QA |
| 8 | **Session continuity** | Within the 7-day token window, the portal restores the owner's last viewed tab and selected pet after refresh or return from payment | Integration test |

---

## 7. User Stories & Requirements

### 7.1 Magic Link Access (OWN-01, OWN-04, OWN-06)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-01 | As Owner Ananya, I want to tap a WhatsApp link and immediately see my pet's records without installing an app or creating an account. | Tapping a valid magic link opens the portal in the device's default browser. No login, password, or app install required. The portal resolves the token server-side and renders the Overview tab with pet data. |
| US-OWN-02 | As Owner Ananya, I want to see a helpful message if my magic link has expired, with a way to get a new one. | Expired links (older than 7 days) render a dedicated expired-link screen showing "This link has expired" with the 7-day rule explained, a "Request New Link" button, and the clinic's phone/WhatsApp contact. Tapping "Request New Link" delivers a fresh link to the owner's WhatsApp. No medical or billing data is shown for expired tokens. |
| US-OWN-03 | As a system, I must ensure that a magic link token only grants access to the specific owner's data. | Valid tokens return data scoped to the owner's pets and invoices only. Requests for another owner's pet ID return 403 with no data. Tampered or malformed tokens return 403 with no data and no retry CTA. All token access attempts are logged. |
| US-OWN-04 | As Owner Ananya, I want the portal to feel trustworthy so I know it is genuinely from my clinic. | A trust banner is always visible explaining secure clinic-linked access, 7-day validity, and no login required. Clinic branding (name) appears in the sticky header. Clinic contact (phone + WhatsApp) is always reachable. |

### 7.2 Owner Overview Home (D-46 through D-56)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-05 | As Owner Ananya, I want to see all my pets with a health snapshot when I open the portal, so I get an immediate overview. | Valid magic link opens the portal on the Overview tab by default (unless a deep link targets a specific invoice or visit). Pet snapshot cards appear above the fold with name, species, breed, age, and medical preview. Page loads fully within 3 seconds on 4G. |
| US-OWN-06 | As Owner Ananya, I want to know if I have any outstanding invoices without the portal feeling like a payment demand. | When unpaid invoices exist, home shows total due plus individual invoice list with equal emphasis alongside pet records. When no unpaid balance exists, no billing-related messaging appears. |

### 7.3 Pet Records (OWN-01, D-61, D-73 through D-77)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-07 | As Owner Ananya, I want to see Bruno's past visits with diagnoses and prescriptions so I can reference his medical history. | Records tab shows a chronological visit timeline (most recent first). Each visit shows date, diagnosis with plain-language gloss, and prescription usage cards. Internal clinical notes, SOAP free-text, and clinician-only attachments are not shown. View is read-only. |
| US-OWN-08 | As Owner Ananya, I want prescriptions shown in a way I can understand, not raw medical data. | Each prescription appears as a simple usage card: drug name, dosage, frequency, duration, and owner-friendly instructions. Clinical abbreviations are expanded or paired with understandable wording. |

### 7.4 Upcoming Care Dates (OWN-07)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-09 | As Owner Ananya, I want to see when Bruno's next vaccination and deworming are due so I don't miss preventive care. | Overview tab shows upcoming vaccination due dates (vaccine name, date, overdue/due-soon/upcoming status) and deworming due date (drug name, date) per pet. Overdue items are red; due-soon items (within 7 days) are amber; upcoming items are neutral. Empty sections show a reassuring message. |
| US-OWN-10 | As Owner Ananya, I want to see my next appointment details so I know when to visit the clinic. | Overview tab shows next scheduled appointment per pet: date/time, reason, assigned vet name. Sourced from Appointment records with CONFIRMED or EXPECTED status. Appointment cannot be modified from the portal. Includes "To reschedule, please contact [Clinic Name]" with tappable contact. |

### 7.5 Invoices and Payment (OWN-02, OWN-03, D-59 through D-72)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-11 | As Owner Ananya, I want to see invoices for each pet so I can track what I owe. | Invoices tab shows a pet-scoped list with invoice number, date, amount, and status badge (Paid, Unpaid, Overdue). Pet switcher changes the invoice list. |
| US-OWN-12 | As Owner Ananya, I want to tap an invoice to see line-item details. | Invoice detail shows line items, amounts, status, and receipt access for paid invoices. Internal cost codes, markup details, and clinic-internal notes are not shown. |
| US-OWN-13 | As Owner Ananya, I want to pay one or multiple invoices via UPI directly from the portal. | Owner can select one invoice ("Pay Invoice") or multiple invoices across pets ("Pay Selected Invoices"). Before opening Razorpay, a checkout handoff sheet shows: amount, invoices included, pet breakdown, secure external payment note. UPI is primary; card and net banking available via Razorpay. Full invoice amount only; partial payment not supported. |
| US-OWN-14 | As Owner Ananya, I want clear feedback after payment succeeds or fails. | On success: summary screen with receipt access shown before any further navigation. On failure or interruption: failure summary with retry option and clinic help (Call + WhatsApp). Owner is not left on a dead-end screen. |

### 7.6 Multi-Pet and Navigation (D-57 through D-63)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-15 | As Owner Ananya with two pets, I want to see records and invoices for each pet without needing separate links. | Pet switcher under the trust banner allows switching between pets. Records and Invoices tabs update to the selected pet. All pets registered to the owner at this clinic are accessible from one link. |
| US-OWN-16 | As Owner Ananya, when I tap a WhatsApp deep link to a specific invoice, I want to go there directly but still access the rest of the portal. | Deep links open the specific target (invoice or visit) first. After viewing, the full portal remains reachable via tabs and navigation. |

### 7.7 Contact and Support (D-52, D-78 through D-81)

| ID | Story | Acceptance Criteria |
|---|---|---|
| US-OWN-17 | As Owner Ananya, I want to be able to contact the clinic from any page of the portal. | Call Clinic and WhatsApp Clinic actions are visible on every portal screen (sticky footer or persistent help bar). Tapping the phone number initiates a call. Tapping WhatsApp opens a chat with the clinic. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 9b:

- **App install for owners** -- The portal is browser-only. No mobile app for pet owners. This is a deliberate product decision, not a deferral.
- **Owner login or account creation** -- Access is purely token-based. No persistent owner account with login credentials.
- **Appointment booking, rescheduling, or cancellation** -- Owners can view appointment dates but cannot modify them. They contact the clinic to reschedule.
- **Record editing or correction requests** -- The portal is strictly read-only for medical records. No structured correction-request workflow. (D-80)
- **In-portal messaging or chat** -- Owners use WhatsApp or phone to communicate with the clinic. No in-portal chat.
- **Partial payments** -- Invoice payment is full-amount only. Partial payment support is deferred.
- **Multi-clinic view** -- If an owner visits multiple Breeyo clinics, each clinic sends a separate link. No unified cross-clinic owner view.
- **Push notifications to owners** -- Communication remains via WhatsApp from the clinic.
- **Prescription refill requests** -- Owners cannot request refills from the portal.
- **Lab results, X-ray images, and diagnostic media** -- Text-based diagnosis and prescriptions only. Diagnostic attachments are not surfaced in Phase 9.
- **Vaccination history PDF download** -- Not included in Phase 9b scope. May be added in a future phase.
- **Portal analytics for clinics** -- Clinic-facing analytics on portal usage (open rates, payment conversion) are not part of this phase.
- **Branding customisation** -- Clinics cannot customise portal colors or greeting text in Phase 9. Standard Breeyo-branded portal with clinic name.
- **Clinician browser access** -- Clinicians do not get browser access in Phase 9. (09-CONTEXT D-15)
- **SMS fallback for link delivery** -- Magic links are delivered via WhatsApp only. SMS delivery is not supported.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phase 4: EMR & Clinical Records** | Feature prerequisite | Visit history, diagnosis, prescriptions, vaccination records, and deworming records must be complete and queryable. Portal records service projects from these Phase 4 models. |
| **Phase 5: Inventory Management** | Feature prerequisite | Dispensed items and inventory data referenced in invoice line items. |
| **Phase 6: Invoicing & Payments** | Feature prerequisite | Invoice lifecycle, Razorpay Payment Links, webhook handler, receipt generation, and payment status must be operational. Portal checkout delegates to the existing billing/Razorpay flow. |
| **Phase 7: WhatsApp Communication** | Feature prerequisite | WhatsApp message pipeline for magic link delivery and reissue. The portal reissue service enqueues WhatsApp messages through Phase 7 infrastructure. |
| **Phase 8: Scheduling & Calendar** | Feature prerequisite | Appointment model with status (CONFIRMED/EXPECTED) and scheduling data needed for upcoming care dates (OWN-07). |
| **Phase 9a: Web Dashboard foundation** | Technical prerequisite | Next.js `apps/web` package scaffold, shared design tokens, and CSS custom properties. Portal deploys within the same package on separate routes. |
| **Razorpay** | External service | Payment processing depends on Razorpay availability and UPI reliability in India. |
| **WhatsApp delivery** | External service | Magic link delivery depends on WhatsApp message pipeline (Phase 7 simulator or real API). |
| **Owner-pet data association** | Data prerequisite | Owner mobile number (used for WhatsApp) must be stored and reliably linked to pets. Established in Phase 3. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low magic link open rates | Medium | High -- feature unused | Optimise WhatsApp message copy. Train clinic staff on when/how to send links. Track open rates. The portal's overview-first design (not pay-first) helps make the link feel valuable, not transactional. |
| Token security breach | Low | Critical -- data leakage | Server-side token hash validation (not client-side JWT). Per-request scope enforcement via `AccessScopeService`. 403 no-data response for any mismatch. Rate limiting per token. Audit logging of all access attempts. |
| Payment failures (Razorpay/UPI) | Medium | Medium -- revenue impact | Explicit checkout handoff prepares owner for external flow. Clear failure return state with retry option and clinic contact. Delegate to the proven Phase 6 Razorpay integration rather than building a separate payment path. |
| 4G performance on mid-range phones | Medium | Medium -- abandonment | Lighthouse CI budget enforces FCP under 3 seconds on mobile 4G. Minimal JS bundle. Purpose-built HTML/CSS components (no heavyweight component library). Razorpay SDK loaded asynchronously only when payment is initiated. Inter font subset to Latin + Devanagari at under 20KB. |
| Token sharing by owners | Medium | Low -- limited exposure | Accepted trade-off. The link shows only read-only medical records and invoice amounts. No editing capability. 7-day expiry limits the window. Document in clinic terms of service. |
| Owner confusion with no-login model | Medium | Medium -- support burden | Trust banner provides plain-language reassurance. Clinic contact always visible. Portal tries to be helpful first with clear wording, then falls back to human clinic support. (D-81) |
| Expired link frustration | Medium | Low -- recoverable | Dedicated expired-link screen with built-in "Request New Link" action. One tap to get a fresh WhatsApp link. Clear 7-day rule explanation. |
| Multi-pet invoice checkout complexity | Low | Medium -- payment errors | Checkout handoff sheet shows explicit per-pet, per-invoice breakdown before payment. Server-side invoice snapshot prevents client-side total manipulation. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | Should the 7-day token duration be clinic-configurable, or fixed for all clinics in Phase 9? | D-64 establishes 7 days. Some clinics may want shorter (security) or longer (convenience). Fixed is simpler for Phase 9; configurability could come later. | Product |
| 2 | Should the portal support Hindi from launch, or start English-only? | 02-UI-SPEC includes Hindi translations for portal copy. The i18n infrastructure exists in `@breeyo/ui`. Whether Hindi is shipped in Phase 9 or deferred depends on translation readiness. | Product + Localisation |
| 3 | What Open Graph meta tags should be configured for WhatsApp link previews? | WhatsApp displays link previews with title, description, and image. Proper OG tags (clinic name, "View your pet's records", Breeyo logo) improve open rates. | Engineering |
| 4 | Should portal access be automatically logged as a "pet owner engagement" metric visible to clinic staff on the admin dashboard? | This crosses into Phase 9a analytics territory. Useful for clinics but adds scope. | Product |
| 5 | When lab results/diagnostic media are added in a future phase, should they be automatically visible to owners, or should the vet explicitly "publish" results to the portal? | Affects future portal scope. Recording the question now for continuity. | Product |
| 6 | Should the portal include a lightweight NPS or satisfaction prompt after payment? | Could provide useful feedback data. Must not be intrusive or block the payment success flow. | Product |
| 7 | What is the exact rate limit per token for portal API endpoints? | Must balance abuse prevention against legitimate multi-tab or refresh-heavy usage patterns. | Engineering |

---

*This is a Lightweight PRD for the pet owner portal. Detailed technical design lives in the Phase 9 plan files (09-01 through 09-07), UI contract in 09-UI-SPEC.md, and implementation decisions in 09-CONTEXT.md (D-46 through D-81).*
