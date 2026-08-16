# PRD-03: Patient Registration & Walk-in Queue

**Type:** Lightweight PRD
**Phase:** 03 - Patient Registration & Walk-in Queue
**Status:** Implemented
**Author:** Breeyo Product Team
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 3 delivers the core daily workflow of every Indian veterinary clinic: registering walk-in patients and managing the consultation queue. In a market where 80%+ of vet visits are unscheduled walk-ins, the queue is not just a feature -- it is the application. This phase replaces paper registers, verbal name-calling, and mental patient tracking with a mobile-first, real-time digital queue board that any staff member can view and update from any device.

The system enables a front-desk user or solo vet to register a pet owner by mobile number (the universal Indian identity), link one or more companion animals to that owner, and check them into the queue with exactly two taps. Returning patients are auto-detected by mobile number and auto-filled -- no re-registration needed. All connected devices see queue changes in real time via Socket.IO within 1-2 seconds. The queue board is organized into three sections (In Consult, Waiting, Done) that mirror the physical whiteboard workflow already familiar to Indian vets.

For existing practices migrating to Breeyo, a CSV bulk-import feature allows batch upload of historical patient records with per-row validation and structured error reporting, so clinics can go live without re-entering years of data. A guided first-use onboarding flow ensures new users understand the queue-centered workflow immediately after completing clinic setup.

This is the highest-impact phase in the Breeyo roadmap. Every subsequent feature -- consultations (Phase 4), inventory (Phase 5), billing (Phase 6), reminders (Phase 7), and scheduling (Phase 8) -- depends on the patient records and queue infrastructure built here.

---

## 2. Problem Statement

### Current State

Indian solo and small-team veterinary clinics (1-3 vets, 0-2 support staff) rely on manual systems to manage their daily patient flow:

- **Paper registers** record owner name, pet name, and visit date in ruled notebooks. These are unsearchable, deteriorate with use, and cannot be accessed remotely or shared between devices.
- **Verbal queue management** means the receptionist (or the vet themselves) shouts the next patient's name into the waiting area. There is no visibility into queue position, estimated wait time, or current status for anyone -- staff or owner.
- **Mental tracking** of which patient is next, who has been seen, and who left without being seen relies entirely on human memory. No-shows go unrecorded.
- **No returning-patient detection** means owners repeat their mobile number, name, and pet details at every visit. Vets have no quick access to visit history, forcing them to flip through notebooks or ask the owner to recall past treatments.
- **No data portability** means practices that have maintained spreadsheets or legacy records cannot bring their patient data into a new system without manual re-entry -- a prohibitive barrier to adoption.

### Impact

- **Vets lose 5-10 minutes per patient** on administrative overhead (looking up records, asking repeated questions, managing the queue verbally), adding up to 1-2 hours per day for a 15-patient clinic.
- **Owners wait without information**, leading to frustration, walkaways, and lost revenue.
- **No-shows go untracked**, making it impossible to optimize scheduling or follow up with absent patients.
- **Visit history is fragmented** across notebooks, making continuity of care difficult and error-prone.
- **Practice migration is blocked** by the cost of manually re-entering existing records, discouraging clinics from adopting any digital solution.

### Desired Outcome

A front-desk user or solo vet can register walk-in patients and manage the consultation queue as the primary daily workflow, with real-time updates visible on all connected devices. Returning patients are checked in within two taps in under 15 seconds. Existing practices can bulk-import their patient records from CSV files. The queue is the home screen -- the first thing a vet sees after login.

---

## 3. Target Users & Personas

### Primary: Dr. Priya Sharma -- Solo Vet / Owner-Operator

| Attribute | Detail |
|---|---|
| **Role** | Veterinarian and clinic owner-operator |
| **Clinic size** | Solo practice, no receptionist |
| **Daily volume** | 15-20 patients/day, mostly walk-ins |
| **Device** | Android phone (mid-range, Android 8+), occasionally a tablet |
| **Language** | English UI, but types owner/pet names in Hindi/Devanagari |
| **Pain points** | Does everything herself: registers patients, manages the queue, consults, and bills. Cannot afford to spend time on admin between consultations. Needs minimal taps and maximum glanceability. |
| **Goal** | Glance at the queue between consults, tap "Call Next", see who is waiting, and never lose track of a patient. The queue screen is her home screen. |
| **Key behavior** | Uses the app as both registrar and clinician. Needs the queue to feel like the whiteboard in her current clinic -- live-updating, glanceable, clear patient flow. |

### Primary: Receptionist Rekha -- Front Desk Staff

| Attribute | Detail |
|---|---|
| **Role** | Front-desk staff at a 2-vet clinic |
| **Daily volume** | 20-25 patients/day |
| **Device** | Android phone, shared clinic tablet |
| **Language** | Hindi-first, comfortable with English UI labels |
| **Pain points** | Owners arrive in bursts (morning rush). Needs to check in patients as fast as possible. Frequently asked "How long will it take?" and currently has no answer. Manually re-enters returning patient info every visit. |
| **Goal** | Check in a walk-in patient in under 15 seconds. Answer "You are 4th in line, about 20 minutes" with confidence. |
| **Key behavior** | Spends 90% of her time on the queue screen. Registers new patients, checks in returning ones, updates statuses as the vet calls patients in. Both she and the vets see the same queue and can perform the same actions -- they coordinate verbally (small teams). |

### Tertiary: Pet Owner Ananya

| Attribute | Detail |
|---|---|
| **Role** | Pet owner visiting the clinic |
| **Interaction** | Indirect -- her data is entered by Rekha or Dr. Priya |
| **Pain points** | Repeats her name, phone, and pet details every visit. Waits without knowing her position or estimated time. |
| **Goal** | Walk in, be recognized by mobile number, and have her pets remembered from previous visits. |
| **Key behavior** | Gives her mobile number at the desk. Expects the clinic to remember her and her pets from past visits. |

---

## 4. Strategic Context

### Product Strategy Alignment

Breeyo's product thesis is that **the queue is the hub**. Unlike Western vet software that centers on appointments and calendars, Breeyo centers on the walk-in queue because that matches how 80%+ of Indian vet visits actually happen. Phase 3 establishes this hub.

The walk-in queue is the home screen (established in Phase 1, D-06). The vet sees their primary workflow immediately after login. The queue should feel like the whiteboard in real vet clinics -- live-updating, glanceable, showing clear patient flow.

Every subsequent phase builds on top of the patient records and queue infrastructure created here:

| Future Phase | Dependency on Phase 3 |
|---|---|
| Phase 4: EMR & Clinical Records | Consultation starts when a queue entry moves to "In Consult". Pet and owner records provide the patient context for SOAP notes, vitals, and prescriptions. |
| Phase 5: Inventory Management | Dispensed items are linked to consultation records, which trace back to queue entries and pet records. |
| Phase 6: Invoicing & Payments | Invoice is linked to a queue entry / visit. Owner record provides billing contact. |
| Phase 7: WhatsApp Communication | Reminders and invoice delivery require owner mobile numbers and pet records from Phase 3. |
| Phase 8: Scheduling & Calendar | Scheduled appointments merge into the walk-in queue built here. |
| Phase 9: Web Dashboard | Web queue board renders the same queue data. Owner portal accesses pet profiles. |

### Market Context

- **40,000+ targetable vet clinics** in India, mostly operating on paper records, WhatsApp for communication, and manual invoicing. No dominant digital solution exists for Indian small clinics.
- **$2.8B TAM** in Indian veterinary services with pet ownership growing 10-15% annually (32M+ pets).
- **Walk-in culture**: Indian vet clinics operate predominantly on a walk-in basis. Fewer than 10% of clinics use appointment systems, and even those see a majority of walk-ins.
- **Solo vet focus**: Typical target user sees 15-25 patients/day. Multi-vet clinics see 30-50. Clinics operate on thin margins (subscription must stay within INR 999-3,000/month).
- **Mobile-first**: Clinic staff (including vets) use smartphones as their primary computing device. Desktops are rare in small clinics.
- **Multilingual names**: Owner and pet names are frequently in Hindi/Devanagari. Search and display must support Unicode. "Kitna saal ka hai?" (How many years old?) -- approximate age input matches how Indian vets actually ask about pet age.
- **Companion animals only**: Target market is urban/metro companion animal clinics (dogs, cats, birds, rabbits, fish, reptiles). Livestock vets have fundamentally different workflows and are not in scope.

### Competitive Differentiation

- **2-tap check-in** for returning patients (vs. re-entering all details at every visit).
- **Real-time queue sync** across all devices via WebSocket (vs. single-terminal or paper systems).
- **Estimated wait time** based on actual clinic data (vs. guesswork).
- **CSV bulk import** with per-row validation (vs. manual re-entry for practice migration).
- **Mobile-first** design optimized for one-handed use on mid-range Android (vs. desktop-first Western software).
- **Mobile number as universal key** with auto-detect for returning owners (vs. forcing account creation).

---

## 5. Solution Overview

### 5.1 Patient Registration

#### 5.1.1 Two-Step Registration Wizard (D-01)

Patient registration follows a two-step wizard matching the Phase 2 wizard UX pattern (D-11):

**Step 1: Owner Information (D-08)**
- Mobile number (10-digit Indian format, starts with 6-9, required) (D-42)
- Owner name (required, supports Hindi/Devanagari) (D-41)
- Alternate phone (optional)
- Email (optional)
- Address (optional -- collected if needed for invoicing later)

**Step 2: Pet Information (D-04)**
- Pet name (required, supports Hindi/Devanagari) (D-41)
- Species (required, searchable dropdown with companion animals: dogs, cats, birds, rabbits, fish, reptiles) (D-02, D-03)
- Breed (optional, searchable list filtered by selected species with common breeds suggested) (D-43)
- Approximate age -- "Years" and "Months" number fields (most owners don't know exact DOB, system calculates approximate DOB for records) (D-10)
- Weight (optional)
- Color/markings (optional)
- Microchip ID (optional)
- Photo (optional, camera/gallery -- helps identify patients visually when multiple pets of same breed visit) (D-09)
- Notes (optional, free text for behavioral warnings, allergies, special handling needs -- visible to vet during consultation) (D-11)

Minimal required fields (D-04): mobile number, owner name, pet name, and species. Everything else is optional. Get the patient in fast; details can be filled during consultation.

#### 5.1.2 Quick Inline Registration (D-12)

A streamlined registration path is available directly from the check-in flow. When the mobile number entered during check-in does not match an existing owner, the system offers a quick inline registration with minimal fields only (owner mobile + name, pet name + species). The full two-step wizard remains available from the Patients tab. Quick registration gets walk-ins into the queue as fast as possible.

#### 5.1.3 Returning Owner Detection (D-05, D-06)

Mobile number serves as the unique key for owners within a clinic (D-06). One owner per mobile number prevents duplicates at source:

- When a mobile number is entered in Step 1, the system auto-detects if the owner already exists.
- If found, the owner's details are auto-filled and the user proceeds directly to pet selection (for check-in) or new pet registration.
- If the mobile number exists, the system shows the existing owner profile instead of creating a new record. No re-registration for returning patients (D-05).

#### 5.1.4 Multi-Pet Support (PAT-03, D-07)

One owner can have unlimited pets. After completing pet registration in Step 2, an "Add another pet" button loops back to the pet form for multi-pet owners. No limit on pets per owner. The owner profile shows all linked pets.

#### 5.1.5 Patient Search (PAT-04, D-25, D-26)

Live search bar on the Patients tab with results updating as the user types (debounced). Searches owner name, mobile number, and pet name simultaneously via `pg_trgm` trigram indexing. Matching owner and their pets are grouped together in results.

- **Default view** (D-26): Recent patients sorted by most recent visit. Shows pet name, species icon, owner name, last visit date. Search bar always visible at top.
- **Trigram matching**: Handles typos and partial inputs (e.g., "Priy" matches "Priya").
- **Cross-script search**: Works across both English and Hindi/Devanagari scripts (D-41).

#### 5.1.6 Pet Profile & Visit History (PAT-05, D-27, D-28, D-29, D-30, D-31)

**Pet profile page layout (D-27):**
- Top: pet photo (if exists), name, species, breed, age, weight, owner name + phone
- Middle: quick stats (total visits, last visit date)
- Bottom: visit history timeline (date, reason, vet name) -- tap visit to expand details (EMR data added in Phase 4)

**Visit history (D-31):** Chronological timeline with newest visit at top. Each visit displayed as a card with date, reason, vet name, and brief summary. Simple and scannable.

**Owner-to-pet navigation (D-28):** Owner card with pet list. Tap owner to see owner details (name, mobile, address) plus all their pets as cards. Tap any pet to navigate to pet profile.

**Visit history scope (D-29):** Shows current clinic only. No cross-clinic data for Beta. Cross-clinic sharing deferred to post-Beta.

**Edit mode (D-30):** Tap "Edit" button to enable editing. Save/Cancel buttons appear. Explicit mode prevents accidental changes.

**No pet merge tool for Beta (D-32):** If duplicates arise, admin handles manually via database or support. Build merge UI only if it becomes a real problem.

#### 5.1.7 CSV Bulk Import (PAT-06)

For existing practices migrating to Breeyo:

- Upload a CSV file with owner and pet data via `expo-document-picker` on mobile
- Server-side parsing with `papaparse` (header mode) via `@fastify/multipart` for file upload
- Per-row validation using existing Zod schemas from `@breeyo/validators`
- Required fields per row: owner_name, mobile, pet_name, species
- Mobile numbers validated as 10-digit Indian format (starts with 6-9)
- Species validated against the allowed companion animal list (case-insensitive)
- Duplicate owner detection by mobile number: if owner already exists, new pets are linked to the existing owner (upsert-or-skip)
- Multiple rows with the same mobile number are grouped under one owner
- Structured result response: `{ imported: [...], errors: [{ row, field, message }] }`
- Failed rows downloadable as a CSV with an added "error" column
- Template CSV downloadable from the app
- Maximum file size: 5MB (approximately 10,000 records)
- Processing is asynchronous for files with > 100 rows with progress indication
- Successfully imported records are immediately searchable
- UTF-8/BOM handling for Devanagari text in CSV

### 5.2 Walk-in Queue Management

#### 5.2.1 Two-Tap Check-In (QUE-01, D-13)

The check-in flow for returning patients is exactly two taps:

1. **Tap 1**: FAB on the queue screen opens a check-in bottom sheet with mobile number input (auto-focused, numeric keyboard). Type the mobile number -- the system auto-shows owner + pets (D-13).
2. **Tap 2**: Tap the pet to check in. Done.

For new patients, the flow extends to include the quick inline registration (D-12) before check-in.

**Post check-in (D-14, D-15, D-16):**
- Optional visit reason quick-select bottom sheet with common reasons: Vaccination, Sick visit, Follow-up, Deworming, Grooming, Other. Quick tap or skip (D-14).
- Optional emergency priority toggle: emergency patients get a red badge and jump to the top of the queue. Normal patients enter at the bottom. Simple binary -- emergency or not (D-15).
- Post check-in feedback: toast notification "Buddy checked in -- Position #5" and return to queue view. Patient appears at bottom of Waiting section with badge. Non-disruptive (D-16).

#### 5.2.2 Queue Board Display (QUE-02, D-20, D-21)

The queue screen is the home screen, divided into three sections (D-20):

1. **In Consult** (top, highlighted) -- patients currently being seen. Card shows treating vet name, e.g., "with Dr. Priya" (D-37).
2. **Waiting** (middle, ordered by position) -- patients in the queue, with emergency entries at the top.
3. **Done** (bottom, collapsed/dimmed) -- patients whose consultation is complete.

Full day view on one screen. The queue should feel like the whiteboard in real vet clinics.

**Queue card information (D-21):** Pet name, species icon, owner name, check-in time, queue position, status badge, visit reason (if entered). Emergency patients shown with red border/icon.

#### 5.2.3 Status Transitions (QUE-04, D-17, D-18, D-22)

Queue entries follow this state machine:

```
[Waiting] --> [In Consult] --> [Done]
    |                           ^
    +--------> [No-show] ------+
```

Valid transitions:
- `Waiting` -> `In Consult` (via "Call Next" button or direct tap to call a specific patient)
- `Waiting` -> `No-show` (patient left without being seen)
- `In Consult` -> `Done` (consultation complete)
- `In Consult` -> `No-show` (patient left during consult -- rare but possible)

**Interaction patterns:**
- **"Call Next" button (D-17)**: prominent button at top of queue. Calls the next Waiting patient, auto-moves them to In Consult. Can also tap any specific patient card to call them directly (skip queue for emergencies).
- **Tap status badge (D-18)**: cycles through valid next statuses. Waiting -> In Consult -> Done. Linear flow matches consultation lifecycle.
- **Long-press for No-show (D-22)**: long-press status badge shows "Mark No-show" option. Card moves to Done section with "No-show" label. Counts as visit for analytics, no consultation recorded.

#### 5.2.4 Queue Position & Estimated Wait (QUE-03, D-19)

- **Queue position**: count of Waiting entries ahead of the current entry.
- **Estimated wait**: simple average calculation (D-19):
  - Formula: `estimated_wait = queue_position * average_consultation_duration`
  - Average consultation duration = mean time from `In Consult` to `Done` over the last 7 days
  - If fewer than 5 data points exist (new clinic), default to 15 minutes per consultation
  - Displayed as "~15 min wait" -- gets smarter with data over time
  - Recalculated whenever the queue changes

#### 5.2.5 Call Next Patient (QUE-05, D-17)

A prominent "Call Next" button at the top of the queue screen:
- Moves the first `Waiting` entry to `In Consult`
- Emergency entries are called first, regardless of check-in order (emergency FIFO)
- If another patient is already `In Consult`, the vet is prompted to complete or reassign
- Triggers real-time updates to all connected devices
- Shows the called patient's name prominently via toast/snackbar

#### 5.2.6 Auto-Fill Returning Patients (QUE-06, D-05)

When a known mobile number is entered during check-in:
- Owner details are auto-populated
- All linked pets are shown for selection
- The most recently visited pet is highlighted
- Total time to check-in a returning patient: under 15 seconds
- No re-registration -- the system finds the existing owner and all their pets (D-05)

#### 5.2.7 Real-Time Sync (QUE-02, D-33, D-34, D-35)

All queue operations are synchronized across connected devices in real time:

- **Transport (D-33)**: Socket.IO with WebSocket upgrade. New check-ins and status changes appear on all connected devices within 1-2 seconds. No manual refresh needed.
- **Events scoped to clinic tenant**: a device only receives events for its own clinic (RLS-consistent).
- **Conflict resolution (D-35)**: Last-write-wins. Most recent timestamp wins. Toast notifies the other user: "Status updated by Dr. Priya". Simple and pragmatic for small teams.
- **Offline behavior (D-34)**: Show last-known queue state with yellow "Offline -- data may be outdated" banner. Reconnect auto-syncs full queue state. No offline queue modifications -- check-in requires connectivity. Full offline queuing deferred to Phase 10.
- **Notifications (D-24)**: Subtle sound + haptic notification when new patient checks in or status changes on another device. Configurable per-user (on/off).

#### 5.2.8 Same-Day Re-Check-In (D-40)

Same-day re-check-in is allowed with confirmation: "Buddy was already seen today. Check in again?" Handles legitimate same-day return visits (e.g., post-surgery check, different issue).

#### 5.2.9 Auto-Archive (D-23, D-39)

At midnight (or configurable clinic closing time), the queue resets:
- Done and No-show entries are archived to visit history
- Fresh queue each morning
- In Consult entries persist past midnight auto-archive (rare edge case -- only carryover In Consults remain) (D-39)
- Archived entries remain accessible in pet visit history
- Implemented as a scheduled BullMQ job

#### 5.2.10 Queue Capacity (D-38)

Unlimited queue size. No artificial cap. 15-25 patients/day is typical, and a scrollable list handles any volume.

### 5.3 Multi-User Queue Workflow (D-36, D-37)

**Same view, same actions for all roles (D-36)**: Front desk and vet see the same queue, can both check in, call next, and change status. Solo vets do everything themselves. Multi-staff clinics coordinate verbally (small teams).

**In Consult cards show treating vet name (D-37)**: "with Dr. Priya" below the status badge. Useful when a clinic has 2+ vets.

### 5.4 Data Entry & Accessibility (D-41, D-42, D-43)

- **Unicode/Hindi support (D-41)**: All name fields (owner and pet) accept both English and Devanagari scripts. Search works across both scripts. No transliteration needed.
- **Indian mobile number validation (D-42)**: 10-digit format with auto-format display (98765 43210). Validates: must start with 6-9, exactly 10 digits. Numeric keyboard auto-opens. No country code prefix for Beta (India-only).
- **Contextual form suggestions (D-43)**: Breed dropdown suggests common breeds after species is selected. Age defaults to years. Notes field shows placeholder hints. Mobile field remembers recent entries for quick access.

### 5.5 Guided Onboarding (ONB-01)

After the clinic setup wizard (Phase 1) is complete and the user first lands on the queue screen:

- An **OnboardingCard** component on the QueueScreen shows a checklist with progress tracking:
  1. Register your first patient
  2. Check in a patient
  3. Proceed to consultation
- Each step deep-links to the relevant action (registration, check-in)
- Steps auto-complete when the corresponding action is performed (via hooks in PatientService and QueueService)
- Can be skipped/dismissed -- the dismissal is persisted to the database
- The full onboarding path completes when Phase 6 adds invoicing (extensible design with JSONB state on the Clinic model)
- If no patients exist yet, a friendly empty state with illustration suggests: "Register your first patient to get started" with a prominent CTA

---

## 6. Success Metrics

### Primary Metrics (Phase 3 Gate Criteria)

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Owner + pet registration** | User can register a pet owner by mobile number and link multiple pets to that owner | Integration tests + manual QA |
| 2 | **2-tap check-in** | User can check in a walk-in patient in 2 taps or fewer, with returning patients auto-filling from existing records | Client-side timing from FAB tap to queue entry; target < 15 seconds for returning patients |
| 3 | **Real-time queue display** | Walk-in queue displays in real time on all connected devices, showing position and estimated wait for each entry | Socket.IO event delivery latency < 2 seconds (P95) |
| 4 | **Status transitions** | User can move patients through queue statuses (Waiting, In Consult, Done, No-show) and call next patient into consultation | State machine validation tests |
| 5 | **Patient search** | User can search patients by owner name, mobile number, or pet name and view a pet's complete visit history | Trigram search response time < 300ms (P95) |
| 6 | **CSV bulk import** | User can bulk-import owners and pets from a CSV file with validation errors surfaced per row | Import result tracking; > 95% of rows in valid CSVs import successfully |
| 7 | **Guided onboarding** | New clinic sees a guided first-use prompt after setup wizard with skip option | Onboarding state model verified |

### Secondary Metrics (Tracked, not gating)

| Metric | Target | Measurement |
|---|---|---|
| **Registration completion rate** | > 90% of started registrations completed | Funnel tracking: wizard step 1 start -> step 2 complete |
| **Daily active queue users** | Clinic uses the queue on > 80% of operating days | Daily queue activity per clinic |
| **Average queue entries per day** | 10-25 per active clinic | Count of queue entries per clinic per day |
| **No-show rate** | Tracked (no target) | Percentage of queue entries ending in No-show status |
| **Wait time estimation accuracy** | Within +/- 5 minutes of actual wait 70% of the time | Compare estimated wait at check-in to actual time called |
| **Onboarding completion rate** | ~67% of new users complete the checklist (SaaS industry benchmark) | Onboarding step tracking |

### Technical Metrics

| Metric | Target | Measurement |
|---|---|---|
| **API response time (P95)** | < 200ms for queue operations | Server-side request logging |
| **Socket.IO event latency (P95)** | < 500ms from server emit to client receipt | Client-side event timing |
| **Search response time (P95)** | < 300ms for trigram search queries | Server-side request logging |
| **CSV import throughput** | 1,000 rows/minute | Server-side processing timing |
| **Queue screen load time** | < 1.5 seconds on 4G connection | Client-side performance measurement |
| **Cold start** | < 3 seconds on mid-range Android | Measured from Phase 3, final verification in Phase 10 |

---

## 7. User Stories & Requirements

### 7.1 Patient Registration

#### PAT-01: Register Owner by Mobile Number

**As a** front-desk user or solo vet,
**I want to** register a new pet owner using their mobile number as the primary identifier,
**so that** I can create their record in the system, detect them instantly on future visits, and link their pets.

**Acceptance Criteria:**
- [ ] Mobile number field accepts exactly 10 digits, must start with 6-9 (Indian format) (D-42)
- [ ] Mobile number auto-formats for display as "98765 43210" (D-42)
- [ ] Numeric keyboard auto-opens when the mobile number field is focused (D-42)
- [ ] Mobile number is validated in real-time (not on submit)
- [ ] If mobile number already exists for this clinic, the existing owner is shown with an option to proceed to their profile (D-05, D-06)
- [ ] Owner name field is required and supports Hindi/Devanagari characters (D-41)
- [ ] Email, address, and alternate phone fields are optional (D-08)
- [ ] Form shows inline validation errors below each field
- [ ] Submitting the form creates the owner record and advances to Step 2 (pet info) (D-01)
- [ ] The owner record is scoped to the current clinic tenant (RLS enforced)

**Edge Cases:**
- Mobile number with country code prefix (+91): strip the prefix and validate remaining 10 digits
- Mobile number with leading zero (0XXXXXXXXXX): strip the zero and validate remaining 10 digits
- Owner name with only spaces: reject with validation error
- Duplicate mobile detected mid-form: show the existing owner's name and ask "Is this [Owner Name]?" with options to proceed to their profile or enter a different number
- Network failure during submission: show error toast, retain form data, allow retry

---

#### PAT-02: Register Pet Linked to Owner

**As a** front-desk user or solo vet,
**I want to** register a pet and link it to an owner,
**so that** the pet's records are associated with the correct owner for future visits and clinical records.

**Acceptance Criteria:**
- [ ] Step 2 of the wizard shows the owner's name at the top for confirmation (D-01)
- [ ] Pet name is required and supports Hindi/Devanagari characters (D-41)
- [ ] Species is required, selectable from a searchable dropdown of companion animals: dogs, cats, birds, rabbits, fish, reptiles (D-02, D-03)
- [ ] Breed field is optional, with a searchable list filtered by selected species. Common breeds suggested after species is selected (D-43). Custom entry supported for exotic pets (D-02)
- [ ] Approximate age input via "Years" and "Months" number fields. System calculates approximate DOB for records (D-10)
- [ ] Weight field is optional, accepts decimal values in kg
- [ ] Color/markings field is optional, free text
- [ ] Microchip ID field is optional, alphanumeric
- [ ] Optional pet photo via camera/gallery (D-09)
- [ ] Optional notes field for behavioral warnings, allergies, special handling needs (D-11)
- [ ] Submitting creates the pet record linked to the owner
- [ ] After creation, user is offered: "Add another pet" (loops back to pet form -- D-07), "Check in now?", or navigate to patient list

**Edge Cases:**
- User presses back during Step 2: owner record is already saved, user returns to Step 1 with owner data pre-filled
- Same pet name for same owner: allow it (owners may have two dogs both named "Bruno") but show a warning
- Breed list is empty for a species: show only a free-text breed input
- Very long pet name: truncate display with ellipsis, store full name

---

#### PAT-03: Link Multiple Pets to One Owner

**As a** front-desk user,
**I want to** add additional pets to an existing owner,
**so that** all of an owner's animals are accessible from one profile.

**Acceptance Criteria:**
- [ ] Owner profile screen shows an "Add Pet" button
- [ ] Adding a pet from the owner profile pre-fills the owner and skips Step 1
- [ ] "Add another pet" button after completing pet registration loops back to the pet form (D-07)
- [ ] Owner profile lists all linked pets with name, species icon, and breed
- [ ] Each pet card is tappable to view the pet profile
- [ ] No limit on the number of pets per owner (D-07)
- [ ] Deleting a pet does not affect the owner or other pets (soft delete)

**Edge Cases:**
- Owner with 10+ pets: list scrolls smoothly without performance issues
- Adding a pet while another staff member is viewing the same owner: the new pet appears via real-time sync

---

#### PAT-04: Search Patients by Owner Name, Mobile, or Pet Name

**As a** clinic staff member,
**I want to** search for patients by owner name, mobile number, or pet name,
**so that** I can quickly find any record without scrolling through lists.

**Acceptance Criteria:**
- [ ] Search bar prominently placed at the top of the Patients tab, always visible (D-26)
- [ ] Search is triggered on input with debounce (200-500ms range). No search button needed (D-25)
- [ ] Minimum 2 characters to trigger search
- [ ] Results show owner name, mobile, and pet names -- matching owner + their pets grouped together (D-25)
- [ ] Results ranked by relevance (exact matches first, then fuzzy via `pg_trgm`)
- [ ] Mobile number search supports partial matching (e.g., "9876" finds "9876543210")
- [ ] Hindi/Devanagari search terms work correctly (D-41)
- [ ] Each result is tappable to navigate to the owner or pet profile
- [ ] "No results" state shows a helpful message and a "Register new patient" CTA
- [ ] Default view (no search query): recent patients sorted by most recent visit (D-26)
- [ ] Search responds within 300ms (P95) for clinics with up to 10,000 patient records

**Edge Cases:**
- Search term matches both an owner name and a pet name: show both, clearly labeled
- Search term is only digits: prioritize mobile number matching
- Search with leading/trailing spaces: trim before searching
- Very common names (e.g., "Sharma"): paginate results (show first 20, load more on scroll)
- Empty search field: show recently accessed patients (D-26)

---

#### PAT-05: View Pet Profile with Visit History

**As a** veterinarian,
**I want to** view a pet's profile and complete visit history,
**so that** I have context for the current consultation.

**Acceptance Criteria:**
- [ ] Pet profile top section: pet photo (if exists), name, species, breed, age, weight, owner name + phone (D-27)
- [ ] Middle section: quick stats -- total visits, last visit date (D-27)
- [ ] Bottom section: visit history timeline in reverse chronological order (newest first) (D-27, D-31)
- [ ] Each visit displayed as a card: date, reason, vet name, brief summary. Tap to expand (D-31)
- [ ] Owner information displayed with navigation link to owner profile (D-28)
- [ ] Owner profile shows owner details (name, mobile, address) + list of pet cards. Tap any pet to go to pet profile (D-28)
- [ ] Visit history shows current clinic only (D-29)
- [ ] "Edit" button enables edit mode with Save/Cancel buttons (D-30)
- [ ] "Check In" button allows direct check-in from the pet profile
- [ ] Visit history loads incrementally (pagination for pets with many visits)
- [ ] If the pet has no visit history, show an encouraging empty state

**Edge Cases:**
- Pet with 100+ visits: pagination and smooth scrolling
- Pet details edited by another device simultaneously: last-write-wins, no conflict UI needed (D-35)
- Visit data from before CSV import: show with appropriate context

---

#### PAT-06: Bulk Import from CSV

**As a** clinic owner migrating from paper or spreadsheet records,
**I want to** upload a CSV file of my existing patients,
**so that** I don't have to re-enter hundreds of records manually.

**Acceptance Criteria:**
- [ ] "Import Patients" option available in clinic settings
- [ ] Downloadable CSV template with column headers and example rows
- [ ] Template columns: owner_name, mobile, email, address, pet_name, species, breed, gender, dob, weight, color, microchip
- [ ] File size limit: 5MB (approximately 10,000 records)
- [ ] Upload via `expo-document-picker` on mobile; accepts `.csv` files
- [ ] Server-side parsing with `papaparse` in header mode via `@fastify/multipart`
- [ ] Per-row validation: each row validated independently using existing Zod schemas
- [ ] Required fields per row: owner_name, mobile, pet_name, species
- [ ] Mobile numbers validated as 10-digit Indian format (starts with 6-9)
- [ ] Species validated against the allowed companion animal list (case-insensitive)
- [ ] Duplicate owner detection by mobile: if owner exists, new pets linked to existing owner
- [ ] Multiple rows with the same mobile grouped under one owner
- [ ] Processing is asynchronous for files with > 100 rows
- [ ] Progress indicator shows processing state
- [ ] Results summary: `{ imported: [...], errors: [{ row, field, message }] }`
- [ ] Failed rows downloadable as a CSV with an added "error" column
- [ ] Successfully imported records are immediately searchable
- [ ] UTF-8/BOM handling for Devanagari text

**Edge Cases:**
- CSV with BOM (byte order mark): handle gracefully
- CSV with inconsistent column order: match by header name, not position
- Empty rows: skip silently
- Row with mobile matching existing owner but different owner name: link pets to existing owner, log a warning
- CSV with 10,000+ rows: reject with a message suggesting splitting the file
- Upload interrupted (network failure): no partial import; overall result reported
- Special characters in CSV fields (commas in names): handle proper CSV escaping
- Devanagari text in CSV: handle UTF-8 encoding correctly

---

### 7.2 Queue Management

#### QUE-01: Two-Tap Check-In for Walk-In Patients

**As a** receptionist or solo vet,
**I want to** check in a returning patient with just two taps,
**so that** I can handle the morning rush without delays.

**Acceptance Criteria:**
- [ ] Queue screen has a prominent FAB (Floating Action Button) (D-13)
- [ ] Tapping the FAB opens a check-in bottom sheet with mobile number input (auto-focused, numeric keyboard) (D-13)
- [ ] After entering the mobile number, if owner is found: owner name is displayed, linked pets shown as tappable cards. Tapping a pet checks them in immediately (D-13)
- [ ] If owner is not found, the flow transitions to quick inline registration (D-12) or full registration wizard (PAT-01)
- [ ] Optional visit reason quick-select: Vaccination, Sick visit, Follow-up, Deworming, Grooming, Other (D-14)
- [ ] Optional emergency priority toggle: emergency patients get red badge and jump to top of queue (D-15)
- [ ] After check-in, toast notification: "Buddy checked in -- Position #5" and return to queue view (D-16)
- [ ] Haptic feedback on successful check-in (D-24)
- [ ] Total check-in time for returning patients: < 15 seconds

**Edge Cases:**
- Owner has only one pet: auto-select that pet, reducing to near-single-tap check-in
- Owner has 5+ pets: scrollable pet list within the bottom sheet
- Same pet checked in twice on same day: confirmation dialog "Buddy was already seen today. Check in again?" (D-40)
- Check-in during network outage: blocked -- show offline banner. No offline queue modifications (D-34). Full offline queuing deferred to Phase 10.

---

#### QUE-02: Real-Time Queue Across All Devices

**As a** clinic staff member,
**I want to** see queue changes on my device in real time without refreshing,
**so that** I always know the current state of the queue.

**Acceptance Criteria:**
- [ ] All queue operations (add, status change) are broadcast instantly via Socket.IO (D-33)
- [ ] Events are scoped to the clinic tenant (no cross-tenant leakage, consistent with RLS)
- [ ] Queue updates appear on all connected devices within 1-2 seconds (D-33)
- [ ] Socket.IO uses WebSocket with long-polling fallback
- [ ] On app foreground (after being backgrounded), the client fetches the full queue state to sync
- [ ] Subtle sound + haptic notification when new patient checks in or status changes on another device. Configurable per-user on/off (D-24)
- [ ] While offline, the user sees the last-known queue state with yellow "Offline -- data may be outdated" banner (D-34)
- [ ] On reconnect, auto-syncs full queue state (D-34)
- [ ] No offline queue modifications allowed -- check-in requires connectivity (D-34)
- [ ] Conflict resolution: last-write-wins based on `updatedAt` timestamp. Toast notifies: "Status updated by Dr. Priya" (D-35)

**Edge Cases:**
- Two devices update the same entry simultaneously: last-write-wins, toast notification to the other user (D-35)
- Device has been offline for hours: full state sync on reconnect, not incremental events
- Socket.IO connection drops during a status update: the REST API call still completes; missed events are recovered on reconnect
- Client receives events out of order: use `updatedAt` to apply only newer updates
- 5+ devices connected to the same clinic: Socket.IO rooms handle fan-out efficiently

---

#### QUE-03: Queue Position and Estimated Wait Time

**As a** receptionist,
**I want to** tell a pet owner their queue position and estimated wait time,
**so that** I can set expectations and reduce "how much longer?" questions.

**Acceptance Criteria:**
- [ ] Each waiting entry shows its position (e.g., "3rd in line")
- [ ] Each waiting entry shows an estimated wait time (e.g., "~15 min wait") (D-19)
- [ ] Wait time calculated as: `position * average_consultation_duration` (D-19)
- [ ] Average consultation duration computed from the last 7 days of In Consult to Done transitions
- [ ] If fewer than 5 data points exist, default to 15 minutes per consultation
- [ ] Wait time rounded to the nearest 5 minutes
- [ ] Wait time updates when any queue entry's status changes (recalculated for all waiting entries)
- [ ] Emergency entries show "Next" instead of a wait time (they are at the top)
- [ ] Position and wait time are visible on the queue entry card

**Edge Cases:**
- Clinic's first day (no historical data): use 15-minute default, display "(estimated)" label
- Outlier consultations (> 60 minutes): cap at the 90th percentile when calculating average
- Queue with 0 waiting patients: no position or wait time shown
- All entries are emergency: position calculated by check-in order within emergency entries

---

#### QUE-04: Update Queue Entry Status

**As a** clinic staff member,
**I want to** change a patient's queue status,
**so that** the queue reflects reality and everyone knows who is being seen.

**Acceptance Criteria:**
- [ ] Queue entry statuses: `Waiting`, `In Consult`, `Done`, `No-show`
- [ ] Status badge is color-coded: Waiting (amber), In Consult (blue), Done (green), No-show (grey) (D-18)
- [ ] Tapping status badge cycles through valid next statuses: Waiting -> In Consult -> Done (D-18)
- [ ] Long-press status badge shows "Mark No-show" option (D-22)
- [ ] Only valid transitions are available (as defined in the state machine)
- [ ] Transitioning to In Consult records the consult start time and treating vet name (D-37)
- [ ] Transitioning to Done records the consult end time
- [ ] No-show cards move to Done section with "No-show" label. Counts as visit for analytics, no consultation recorded (D-22)
- [ ] All status changes trigger Socket.IO events for real-time sync (D-33)
- [ ] Status changes are logged for analytics (wait time, consult duration)

**Edge Cases:**
- Moving a patient to In Consult when another patient is already In Consult (solo vet): prompt "Move [current patient] to Done?" with confirm
- Attempting an invalid transition: transition not available in the UI; API returns 422 if attempted directly
- Rapid status changes (double-tap): debounce; only the first tap registers
- Status change fails (network): show error toast, revert the optimistic UI update

---

#### QUE-05: Call Next Patient

**As a** veterinarian,
**I want to** press "Call Next" to automatically advance the queue,
**so that** I don't have to manually find and update the next patient.

**Acceptance Criteria:**
- [ ] "Call Next" button prominently displayed at the top of the queue screen (D-17)
- [ ] Pressing "Call Next" moves the first Waiting entry to In Consult (D-17)
- [ ] Emergency entries are called first, regardless of check-in order (emergency FIFO)
- [ ] Can also tap any specific patient card to call them directly (skip queue for emergencies) (D-17)
- [ ] A confirmation toast shows: "Calling [Pet Name] ([Owner Name])"
- [ ] The called patient's card is briefly highlighted/animated
- [ ] If the waiting list is empty, the button is disabled with label "No patients waiting"
- [ ] "Call Next" triggers a real-time event so other devices see the update (D-33)
- [ ] In Consult card shows treating vet name: "with Dr. Priya" (D-37)

**Edge Cases:**
- "Call Next" pressed simultaneously on two devices: last-write-wins; one device may see a brief inconsistency before syncing (D-35)
- Vet wants to skip a patient and call a specific one: tap that patient's card and select "Call In" from the action menu (D-17)
- All remaining patients are no-shows: button is disabled
- Pressing "Call Next" during network outage: show error toast; requires connectivity (D-34)

---

#### QUE-06: Auto-Fill Returning Patients on Check-In

**As a** receptionist,
**I want** the system to auto-fill details for returning patients,
**so that** I can check them in faster and avoid asking for information they've already given.

**Acceptance Criteria:**
- [ ] When a known mobile number is entered during check-in, owner details are auto-populated (D-05)
- [ ] System auto-detects returning owner by mobile number -- finds existing owner + all their pets (D-05)
- [ ] All linked pets are shown with their names and species icons for selection
- [ ] The most recently visited pet is shown first / highlighted
- [ ] Auto-filled data can be reviewed before confirming check-in
- [ ] No re-registration for returning patients -- the system uses the existing records (D-06)

**Edge Cases:**
- Owner's details have changed: auto-filled data is viewable; changes can be made from the owner profile
- Owner has a pet that has been soft-deleted: deleted pets are not shown in the auto-fill list
- Owner found but has no pets (all deleted): redirect to pet registration (Step 2)

---

### 7.3 Onboarding

#### ONB-01: Guided First-Use Onboarding

**As a** new clinic user who just completed the setup wizard,
**I want to** understand how to use the queue and registration features,
**so that** I can start seeing patients immediately without reading a manual.

**Acceptance Criteria:**
- [ ] Onboarding state model stored as JSONB on the Clinic model, tracking step completion
- [ ] OnboardingCard component displayed on the QueueScreen showing a progress checklist
- [ ] Three onboarding steps with deep-links to relevant actions:
  1. "Register your first patient" (links to registration wizard)
  2. "Check in a patient" (links to check-in flow)
  3. "Proceed to consultation" (links to queue Call Next)
- [ ] Steps auto-complete when the corresponding action is performed (hooks in PatientService and QueueService)
- [ ] "Skip" / dismiss option that persists to the database (does not reappear)
- [ ] Second user in the same clinic sees the OnboardingCard if the clinic's onboarding is still in progress
- [ ] If the queue is empty, an additional empty-state illustration with CTA: "Register your first patient to get started"
- [ ] Extensible design: full onboarding path completes when Phase 6 adds invoicing step

**Edge Cases:**
- User force-closes the app during onboarding: resume at the last completed step on next launch
- User navigates away during onboarding: card remains on QueueScreen until dismissed
- markStepComplete is idempotent (calling it multiple times for the same step has no additional effect)

---

## 8. Out of Scope

The following items are explicitly excluded from Phase 3 and deferred to future phases:

| Item | Deferred To | Rationale |
|---|---|---|
| **SOAP notes / consultation records** | Phase 4 | Phase 3 creates the queue entry; Phase 4 adds clinical content (EMR). |
| **Vaccination and deworming records** | Phase 4 | Clinical data belongs in the consultation phase. |
| **Inventory management** | Phase 5 | Separate bounded context, depends on Phase 4. |
| **Billing and invoicing** | Phase 6 | Depends on consultation records from Phase 4. |
| **WhatsApp notifications to owners** | Phase 7 | Requires WhatsApp simulator infrastructure; Phase 3 focuses on clinic-side workflow. |
| **Appointment scheduling** | Phase 8 | Walk-in queue is the primary workflow; appointments are layered on top later. |
| **Web dashboard / queue view** | Phase 9 | Web app is Phase 9; Phase 3 is mobile-only. |
| **Offline queue modifications** | Phase 10 | Phase 3 shows last-known state with banner but requires connectivity for modifications. Full offline queuing deferred to Phase 10 (D-34). |
| **Cross-clinic patient data sharing** | Post-Beta | Visit history shows current clinic only (D-29). Cross-clinic sharing uses Phase 1 consent model, deferred. |
| **Pet record merge tool** | Post-Beta | If duplicates arise, admin handles manually. Build merge UI only if it becomes a real problem (D-32). |
| **Livestock species** | Out of scope | Companion animals only (D-03). Livestock vets have different workflows. |
| **Owner-facing wait time display** | Future | Phase 3 shows wait times to staff only. |
| **Multi-vet queue lanes** | Future | Phase 3 supports single queue; multi-lane is a future enhancement. |
| **NFC/QR code check-in** | Future | Design the check-in flow to be extensible so NFC/QR can be added later. |
| **Multi-language UI** | Future | Phase 3 supports Hindi/Devanagari in data fields but UI labels remain in English. |
| **Pet photo upload as required field** | N/A | Photo is optional (D-09). Not essential for the core registration flow. |
| **Pet transfer between owners** | Future | Rare scenario; handle manually for now. |

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Status | Impact if Delayed |
|---|---|---|---|
| **Phase 1: Auth & RBAC** | Feature | Complete | Cannot authenticate users, enforce role-based permissions, or scope data to clinic tenants. Phase 3 is blocked. |
| **Phase 2: Design System** | Feature | Complete | No component library for queue cards, FAB, bottom sheet, search bar, status badges, or toast notifications. All Phase 3 UI depends on Phase 2 components. |
| **PostgreSQL `pg_trgm` extension** | Infrastructure | Available | Fuzzy search falls back to `ILIKE`, which is slower and less accurate for name matching. |
| **Socket.IO server** | Infrastructure | In Phase 3 scope | No real-time sync across devices. Fall back to manual refresh/polling (severely degraded UX). |
| **Redis** | Infrastructure | Available | BullMQ jobs (auto-archive, async CSV import) cannot run. Fall back to cron for archive, synchronous for CSV. |
| **BullMQ** | Infrastructure | Available | Async CSV processing and midnight auto-archive depend on BullMQ workers. |
| **Expo SDK 52** | Framework | In use | Mobile app foundation. |
| **React Native Paper v5 (MD3)** | UI Library | In use | Material Design 3 component library for atoms, molecules, and organisms. |
| **expo-document-picker** | Library | In Phase 3 scope | CSV file selection on mobile for bulk import (PAT-06). |
| **papaparse** | Library | In Phase 3 scope | Server-side CSV parsing for bulk import (PAT-06). |
| **@fastify/multipart** | Library | In Phase 3 scope | File upload handling for CSV import endpoint. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Socket.IO scalability with many concurrent clinics** | Medium | Medium | Each clinic is a Socket.IO room. Load test with 100 concurrent rooms x 5 devices each. ECS can horizontally scale Socket.IO with sticky sessions. |
| **Trigram search performance on large datasets** | Low | Medium | `pg_trgm` GIN indexes are highly optimized. Test with 50,000 patient records per clinic. Add `LIMIT` and pagination to all search queries. |
| **Last-write-wins causes data loss on concurrent edits** | Low | Low | In practice, queue operations are sequential (one person manages the queue). For edge cases, the "lost" update is a status change that can be re-applied with one tap. Toast notification informs the other user (D-35). |
| **CSV import with malformed data** | High | Low | Per-row validation ensures bad rows do not block good rows. Structured error reporting with row number, field, and message helps users fix and re-upload. |
| **10-digit mobile validation rejects valid numbers** | Low | Medium | Some Indian mobile numbers may have unusual formats (e.g., landlines). Auto-strip +91 prefix and leading zero. |
| **Hindi/Devanagari rendering issues** | Low | Medium | Test with common Hindi names. Use system fonts that include Devanagari glyphs. React Native handles Unicode natively. pg_trgm supports Unicode. |
| **Midnight auto-archive runs while clinic is still active** | Medium | Medium | Archive runs at midnight in the clinic's configured timezone. In Consult entries persist past midnight (D-39). Done/No-show only are archived. |
| **Large queue (30+ patients) causes scroll performance issues** | Low | Medium | Use `FlatList` with `windowSize` optimization. Queue entries are simple cards with minimal layout complexity. Unlimited queue size is supported (D-38). |
| **Optimistic UI update conflicts with server response** | Medium | Low | If the server rejects an update (e.g., invalid transition), revert the optimistic update and show an error toast. |
| **CSV upload on mobile (file picker limitations)** | Medium | Medium | `expo-document-picker` supports CSV files. Test on Android 10+ and iOS 15+. Web import available in Phase 9 as a fallback. |
| **Offline connectivity during check-in** | Medium | High | Phase 3 requires connectivity for all modifications (D-34). Show clear offline banner. Full offline queuing is deferred to Phase 10. |

---

## 10. Open Questions

| # | Question | Context | Proposed Answer | Status |
|---|---|---|---|---|
| OQ-01 | Should we support multiple pets checking in simultaneously for the same owner (e.g., owner brings 2 dogs)? | Owner Ananya brings both Bruno and Luna. Currently, she would need to check in each pet separately. | Allow multi-select of pets during check-in. Each pet gets its own queue entry but check-in is a single flow. | **Proposed** |
| OQ-02 | Should emergency entries always auto-jump to the top, or should the vet confirm priority? | A receptionist marks an entry as emergency. If it auto-jumps, it could disrupt the flow. | Auto-jump to top of waiting list (D-15). Emergency is a clinical judgment made at check-in. The vet can reorder manually if needed. | **Proposed** |
| OQ-03 | How should we handle the case where a clinic has no operating hours configured and auto-archive has no timezone? | Phase 1 may not require timezone configuration. | Default to IST (UTC+5:30) since all target clinics are in India. Make timezone configurable in clinic settings (D-23). | **Proposed** |
| OQ-04 | Should the queue show entries from previous days that were not archived (e.g., server was down at midnight)? | If the auto-archive job fails, stale entries would appear the next morning. | On queue load, check for entries older than 24 hours. If found, auto-archive them and show a notification: "X entries from yesterday were archived." In Consult entries persist past midnight per D-39. | **Proposed** |
| OQ-05 | Should CSV import support updating existing records, or only creating new ones? | A clinic might want to re-import a corrected CSV. | Phase 3: create-only with upsert-or-skip for duplicate owners. Duplicate owners (by mobile) get new pets linked; duplicate pets are created as new records with a warning. Update-via-import is deferred. | **Proposed** |
| OQ-06 | Should we track which vet saw each patient in the queue? | For solo vets, this is irrelevant. For 2-vet clinics, it is useful. | Yes -- In Consult cards show treating vet name (D-37). Store `seen_by` (vet user ID) when transitioning to In Consult. Surfaced in analytics in Phase 8. | **Resolved** |
| OQ-07 | What happens if a pet owner disputes their queue position? | Social dynamics in waiting rooms. | The receptionist can manually reorder the queue or call a specific patient directly by tapping their card (D-17). This is a staff-side tool, not owner-facing. | **Proposed** |
| OQ-08 | Should the 2-tap check-in support NFC/QR code for returning patients? | Some clinics might issue pet tags with QR codes. | Out of scope for Phase 3. Design the check-in flow to be extensible (input method is abstracted), so NFC/QR can be added later. | **Deferred** |
| OQ-09 | How do we handle a pet that is deceased? | Owner's pet may have passed away but the record should be retained for history. | Add a "deceased" flag on pet records. Deceased pets are hidden from check-in but visible in the owner's pet list (greyed out) and in visit history. | **Proposed** |
| OQ-10 | Should bulk import be available on mobile, or only via a web interface? | File management on mobile is cumbersome for large CSVs. | Offer on mobile (via `expo-document-picker`) for all file sizes up to 5MB. For larger imports or more comfortable file management, recommend the web interface (Phase 9). | **Proposed** |
| OQ-11 | What is the maximum import file size and row count? | Need to balance import capability with server processing time and memory. | 5MB limit (approximately 10,000 records). Files with > 100 rows are processed asynchronously. Files exceeding 10,000 rows should be split. | **Resolved** |

---

*This PRD covers requirements PAT-01 through PAT-06, QUE-01 through QUE-06, and ONB-01. Implementation decisions D-01 through D-43 from the Phase 3 context document are incorporated throughout.*

*Phase: 03 - Patient Registration & Walk-in Queue*
*Last updated: 2026-08-03*
