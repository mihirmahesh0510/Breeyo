# PRD-04: EMR & Clinical Records

**Type:** Lightweight PRD
**Phase:** 04 - EMR & Clinical Records
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 4 delivers the clinical heart of Breeyo -- the Electronic Medical Records (EMR) system that transforms the platform from a queue management tool into a full veterinary practice management system. This phase enables veterinarians to conduct complete consultations with structured SOAP notes, species-aware vitals recording, a pre-seeded searchable drug database (200-300 common Indian veterinary drugs), voice-to-text transcription (English + Hindi), file attachments, vaccination and deworming tracking, printable PDF documents (consultation summary, prescription pad, vaccination certificate), and a complete audit trail on all clinical data.

The consultation workflow centers on an accordion-based single-page form with 7 collapsible sections, auto-saving drafts every 3 seconds, a floating quick-action bar for rapid access to voice dictation, prescriptions, camera, and follow-up reminders, and an explicit finalization step with a summary review screen before the record is locked. Three visit type templates (General Consultation, Surgery, Vaccination) provide context-specific quick-pick chips for faster documentation. Prescriptions feature a client-side cached drug search with species-specific dosage suggestions and soft warnings, and pet owners receive auto-generated owner-friendly dosage instructions on professionally branded PDFs.

Phase 4 builds directly on Phase 3's queue-to-consultation transition and extends pet profiles with clinical data, preventive care status (color-coded vaccination and deworming tracking), and weight trends. It prepares the data model for Phase 5 (Inventory -- dispensed medications link to stock), Phase 6 (Invoicing -- consultation services and dispensed items flow to invoices), and Phase 7 (WhatsApp -- follow-up reminders and preventive care due dates trigger automated messages).

---

## 2. Problem Statement

Indian veterinary clinics -- over 40,000 of them -- overwhelmingly rely on paper-based medical records, handwritten prescriptions, and mental recall for clinical history. This creates several cascading failures:

- **Lost clinical context.** When a pet returns weeks or months later, the vet spends 3-5 minutes flipping through paper registers to reconstruct past diagnoses, prescriptions, and vaccination dates -- if the file can be found at all. In many cases, the history is simply unavailable, forcing the vet to rely on the owner's verbal recall.
- **Prescription errors without a safety net.** Handwritten prescriptions are prone to dosage mistakes, especially when calculating species-specific doses by weight. Solo vets do not have a pharmacist backstop. There is no system to flag when a dose falls outside the recommended range for a species.
- **Missing preventive care tracking.** Vaccination boosters and deworming doses are due on species- and age-specific schedules. Without a tracking system, vets depend on pet owners to remember (most do not). Missed preventive care is a major source of avoidable illness in companion animals and lost revenue for the clinic.
- **No audit trail.** Paper records can be lost, overwritten, or made illegible. There is no way to determine who recorded what, when a diagnosis was made, or whether a prescription was changed after the fact. This creates liability exposure and erodes trust with pet owners.
- **Slow documentation.** Vets spend significant time writing notes after each consultation, often staying late to update records. Many Indian solo vets see 15-25 patients daily with minimal staff support -- documentation competes directly with patient throughput.
- **Unprofessional output.** Handwritten prescriptions and lack of printed vaccination certificates reduce the clinic's perceived professionalism and create compliance issues for pet owners who need documentation for pet travel, apartment complexes, or rabies verification.

Phase 3 solved the first half of the daily clinic workflow: getting the patient checked in and through the queue. Phase 4 solves the second half: what happens once the vet is face-to-face with the patient. Without structured clinical records, Breeyo is a queue manager, not a practice management system.

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Solo Vet / Clinician

- **Role:** Owner-operator who conducts all consultations, prescribes medications, and administers vaccinations.
- **Context:** Sees 15-25 patients per day, mostly walk-ins. Uses her phone as the primary device. Speaks Hinglish (Hindi-English mix) during consultations. Dispenses most medications in-house rather than writing prescriptions for external purchase. Operates with minimal staff (perhaps one receptionist).
- **Phase 4 needs:** Fast clinical documentation that does not slow her down between patients. Voice input for hands-free note-taking during physical exams. A drug database that already has common Indian veterinary drugs so she does not need to set anything up on day one. Printable prescriptions that look professional. Vaccination certificates for rabies compliance and pet travel. Quick access to a pet's previous visit history during the current consultation.
- **Frustrations:** Systems that require too many taps to document a routine consultation. Empty drug databases that require hours of manual data entry before first use. Voice recognition that does not understand Hindi or medical terminology. Records that cannot be retrieved during the next visit.

### Secondary: Receptionist Rekha -- Front Desk Staff

- **Role:** Manages the queue, checks in patients, and handles owner-facing administrative tasks. Assigned the Front Desk role with limited permissions.
- **Context:** Does not conduct consultations but may need to look up medical records when owners call with questions. May generate and share PDF documents (prescriptions, vaccination certificates) on behalf of the vet after a consultation is finalized.
- **Phase 4 needs:** Read-only access to finalized consultation records and medical history. Ability to generate and share PDFs from finalized consultations. Visibility into when a consultation is finalized (queue status transitions to DONE).
- **Frustrations:** Being asked by an owner for information about a pet's last visit and having no way to look it up. Not knowing when the vet has finished a consultation because there is no status signal.

---

## 4. Strategic Context

- **Market positioning:** EMR is the single most important differentiator for a veterinary practice management system. Without clinical records, Breeyo is a queue manager with limited stickiness. With structured EMR, it becomes the daily system of record -- the tool vets open first and close last every day. This is the phase that determines whether the product achieves product-market fit.
- **Competitive edge:** Existing solutions targeting Indian vets (Pet360, Simplivet, VetBuddy, Vetlify, VetPort) are either desktop-first, lack India-specific drug databases, or do not offer Hindi voice input and mobile-optimized clinical workflows. Breeyo's mobile-first accordion consultation screen with pre-seeded Indian drug data and Hinglish voice transcription addresses unmet needs that desktop-first competitors cannot.
- **Platform stickiness:** Once a vet's clinical records are in Breeyo, switching costs increase dramatically. Medical history, prescription patterns, vaccination schedules, and owner-linked data create long-term data gravity that makes the platform defensible.
- **Revenue enabler:** Phase 4 directly enables the revenue-generating phases that follow. Phase 5 (Inventory) links dispensed medications to stock. Phase 6 (Invoicing) pulls consultation services and dispensed items into invoices. Without EMR, billing cannot be automated -- and billing is where the subscription justifies its cost.
- **Downstream data flow:** Phase 7 (WhatsApp) sends automated follow-up reminders and vaccination/deworming due-date notifications using data created here. Phase 9 (Owner Portal) displays consultation summaries, prescriptions, and vaccination certificates to pet owners. The data model built in Phase 4 feeds every subsequent phase.
- **Seed data strategy (ONB-02):** The system ships with a pre-loaded drug database (200-300 common Indian veterinary drugs with species-specific dosage ranges), breed lists per species, and 20 default service catalog presets (consultation, vaccination, surgery, grooming) with GST/SAC codes. This eliminates the cold-start problem that kills adoption of empty platforms. A new clinic can start prescribing and billing from their first patient.
- **Cost efficiency:** All voice transcription uses free device-native speech-to-text as the primary mechanism, with cloud APIs as an optional future upgrade. PDF generation uses Expo's built-in tools. File storage uses S3 with presigned URLs (no server bandwidth cost). This keeps per-clinic operating costs near zero for the EMR module, aligning with the price sensitivity constraint (subscriptions must stay within Rs 999-3,000/month).

---

## 5. Solution Overview

### 5.1 Consultation Workflow

| Capability | Details |
|---|---|
| **Consultation entry** | Vet taps an "In Consult" queue card (from Phase 3's Call Next) to open the consultation screen. Deliberate tap-to-open -- not auto-opened on Call Next -- so the vet controls when they are ready to start documenting. |
| **Visit type selection** (D-11, D-12) | 3 system templates at consultation start: General Consultation, Surgery, Vaccination. Each template provides context-specific quick-pick chips in the SOAP sections. No custom templates for Beta. |
| **Patient banner** (D-02, D-03) | Compact sticky header (56px) showing pet name, species, age, weight, owner name + phone. Visit reason chip (from Phase 3 check-in) and behavioral warnings/allergies displayed below. Always visible while scrolling through sections. |
| **Accordion layout** (D-01) | Single scrollable page with 7 collapsible sections in fixed order: Vitals, Subjective, Objective, Assessment, Plan, Prescriptions, Files. One section expanded at a time. Vitals auto-expands on first open. |
| **Auto-save drafts** (D-05) | Every change triggers a 3-second debounced save to the server via PATCH endpoint. Draft indicator shows last-save timestamp. Work is preserved if the vet is interrupted, the app crashes, or the phone battery dies. "End Consultation" still required to finalize. |
| **Consultation locking** (D-06) | One active consultation per patient at a time. If another vet tries to open the same patient, they see "Dr. X is currently consulting this patient." Lock uses a 5-minute TTL in Redis with 60-second heartbeat renewal. Stale locks (no heartbeat for 5+ minutes) can be overridden with a warning. |
| **Resume flow** | If the vet navigates away from the consultation (back to queue, app backgrounded, phone call), a resume banner appears on the queue screen: "[Pet Name] has a consultation in progress. Tap to resume." Draft state is fully restored on resume. |
| **Duration tracking** (D-13) | System auto-records start time (consultation opened) and end time (finalized). Duration shown on visit history. Feeds into Phase 3's queue wait time estimation (D-19 in Phase 3). |
| **End Consultation** (D-04, D-08) | Explicit button at the bottom of the consultation screen. Tapping it triggers: (1) cancel pending auto-save, (2) synchronous save of current state, (3) navigate to a summary review screen showing all recorded data across sections. Vet reviews and confirms with "Confirm & Finalize" before the record is permanently locked. |
| **Follow-up reminder** (D-09) | After tapping "Confirm & Finalize," an optional follow-up sheet appears. Vet can pick a date + reason, or skip. Creates a reminder attached to the pet. Phase 7 (WhatsApp) will send automated reminders based on this. |
| **Floating quick-action bar** (D-10) | Pill-shaped bar (56px, elevation 3) fixed at screen bottom with 4 icons: Mic (voice dictation), Rx (add prescription), Camera (attach file), Timer (set follow-up). Quick access without scrolling to find sections. Visible only during active draft consultation. |

### 5.2 SOAP Notes & Clinical Data Entry

| Capability | Details |
|---|---|
| **Structured + free-text hybrid** (D-15) | Every SOAP section offers quick-pick chips (common findings as tappable tags) plus a free-text area. Faster for routine cases (tap chips), flexible for unusual presentations (type free text). Chips are always visible within expanded sections, wrapping to multiple lines. |
| **Template-specific chips** (D-16) | General Consultation: common symptoms (vomiting, diarrhea, lethargy, loss of appetite, coughing, itching). Surgery: surgical terms (incision, sutures, drain). Vaccination: vaccine names, reaction symptoms. |
| **Custom terms** (D-17) | Vets can add custom quick-pick terms that appear alongside defaults. Custom terms persist per vet for future consultations, personalizing the chip set over time. |
| **Subjective section** (D-18) | Two labeled sub-sections: "Owner Reports" (what the owner told the vet) and "History" (vet's notes on presentation history, prior conditions). Each has chips + free-text. Duration of symptoms captured in free text, not structured fields. |
| **Objective section** (D-19) | Body system physical exam checklist with 8 systems: Eyes, Ears, Skin/Coat, Oral, Lymph Nodes, Abdomen, Heart/Lungs, Musculoskeletal. Each system has a Normal/Abnormal toggle (default: Normal). Toggling to Abnormal expands the row to show common sub-findings as checkboxes plus a notes field for describing the finding. |
| **Assessment section** (D-20) | Free text only. No structured diagnosis codes for Beta. Vet writes diagnosis in their own words. |
| **Plan section** (D-21) | Structured action items as chips (Follow-up, Lab Retest, Diet Change, Exercise Restriction, Referral, Other) plus a free-text area for treatment plan details. Selected action items connect to the follow-up reminder feature (D-09). |
| **Care instructions** (D-50) | Dedicated text field separate from the Plan section. Quick-pick chips: "Soft food," "NPO (nothing by mouth)," "Exercise restriction," "Cone/collar," "Wound care," "Keep dry," "Rest." Shows prominently on owner-facing PDFs and the prescription pad. |
| **Referral** (D-49) | Optional section with specialist type dropdown (Surgeon, Dermatologist, Ophthalmologist, Cardiologist, Oncologist, Radiologist, Neurologist, Other), referral reason text, and urgency toggle (Routine/Urgent). Appears on the clinical record PDF. |

### 5.3 Vitals Recording

| Capability | Details |
|---|---|
| **Core vitals** (D-22) | Weight (kg), Temperature (C), Heart Rate (bpm), Respiratory Rate (breaths/min). Four vitals cover the vast majority of consultations. |
| **Species-aware normal ranges** (D-23) | System knows normal ranges per species (e.g., dog temp 38.0-39.2 C, cat 38.0-39.5 C, rabbit 38.5-40.0 C, bird 40.0-42.0 C). Values displayed with color-coded indicators: green (normal), orange (slightly abnormal -- within 10% of the range boundary), red (critically abnormal -- beyond 10% of the boundary). Normal range hint shown below each field. |
| **Weight auto-update** (D-14) | Recording weight in vitals automatically updates the pet profile's weight to the latest value when the consultation is finalized. |
| **Weight trend chart** (D-24) | Line chart showing weight over time on the pet profile page only (not during consultation). Visible when 3+ weight data points exist. Helps vets spot growth patterns, weight loss, or obesity trends at a glance. |

### 5.4 Prescriptions

| Capability | Details |
|---|---|
| **Searchable drug database** (D-25, D-27) | Pre-seeded with 200-300 common Indian veterinary drugs (antibiotics, anti-parasitic, NSAIDs, vaccines, supplements). Each drug entry includes: name, generic name, category, formulations (tablet, suspension, injectable, drops, ointment), strength per formulation, and species-specific dosage ranges. Full drug list cached client-side (~50KB) for instant search with no network dependency. |
| **Species-specific dosing suggestions** (D-26) | System shows recommended mg/kg dosage range based on the pet's species and weight. Example: "Recommended: 10-25 mg/kg (280-700mg for 28kg dog)." |
| **Soft dosage warnings** (D-28) | If the vet enters a dose outside the species-specific range, a warning banner appears (tertiaryContainer background) showing the recommended range with the note "You can override this recommendation." Vet can proceed regardless -- this is a clinical safety net, not a blocker. Override is logged in the audit trail. |
| **Medication entry** (D-29, D-30, D-31, D-32) | Add medications one at a time via "Add Medication" button (or Rx icon in floating bar). Each entry captures: drug name + formulation, dosage, route of administration (dropdown: Oral, Injectable IV/IM/SC, Topical, Eye Drops, Ear Drops, Inhalation, Rectal), frequency (quick-select chips: Once daily, Twice daily, Three times daily, Every 8 hours, As needed PRN, Before meals, After meals, Custom), and duration (dropdown: 3/5/7/10/14/30 days, Until finished, As needed PRN, Ongoing/Chronic, Custom). |
| **Dispensed vs. Prescribed** (D-33, D-34) | Toggle per medication. "Dispensed" = medication given from clinic stock (default, reflecting Indian vet clinic reality where most vets dispense in-house). "Prescribed" = owner buys externally. Dispensed items carry a nullable `inventory_item_id` foreign key prepared for Phase 5 inventory linking. |
| **Owner-friendly instructions** (D-35) | System auto-generates plain-language dosage instructions from the clinical data: e.g., "1 tablet twice daily for 5 days." Clinical record stores both the clinical format and the friendly version. Owner-facing PDFs use the friendly version. Vet can edit the auto-generated text if needed. |
| **Repeat Rx** (D-36) | From the medical history bottom sheet during a consultation, vet taps "Repeat Rx" on a past visit to copy all prescriptions into the current consultation. Vet adjusts doses, durations, or formulations as needed. Time saver for follow-up visits. Toast: "Prescriptions copied from [date] visit." |
| **General Rx notes** (D-37) | One notes field at the bottom of all prescriptions for special instructions applicable to the entire prescription set (not per-drug). |
| **No drug interaction checks** (D-38) | Deferred due to complexity and liability risk. Vets rely on professional training. |
| **No favorite prescriptions** (D-39) | Deferred. "Repeat Rx" from past visits covers the quick-reuse need for Beta. |

### 5.5 Vaccination & Preventive Care

| Capability | Details |
|---|---|
| **Vaccination recording** (D-40) | Template includes: vaccine name (searchable), batch/lot number, manufacturer, expiry date, next due date (auto-calculated, overridable). Creates proper vaccination certificate data. |
| **Auto-calculated next due dates** (D-42) | System calculates next due date based on standard vaccination intervals with age-dependent rules. Puppy series (DHPPi): every 21 days from 6-16 weeks. Adult boosters: annually. Rabies: annually from 12 weeks. Intervals modeled with `minAgeDays`, `maxAgeDays`, and `isBooster` fields to handle the puppy-vs-adult distinction correctly. Vet can override. |
| **Vaccination certificate** (D-41) | Printable PDF branded with clinic header (logo, name, address, phone), pet details, vaccine name, batch/lot number, manufacturer, date administered, vet name + license number, and next due date. Critical for rabies compliance and pet travel in India. |
| **Deworming tracker** (D-43) | Similar to vaccination tracker -- records drug name, date administered, and next due date with age-dependent intervals (puppy: every 14 days; young dog 3-6 months: every 30 days; adult: every 90 days). |
| **Preventive care summary card** (D-44) | Dedicated section on pet profile showing vaccination and deworming status with color-coded badges. Green/check-circle (up to date), yellow/clock-alert (due soon -- within 7 days), red/alert-circle (overdue). Next due dates displayed. Gives the vet a 2-second health snapshot before or during a consultation. |

### 5.6 Voice-to-Text

| Capability | Details |
|---|---|
| **Mic button** (D-51) | On the floating quick-action bar. One tap starts recording. Voice output goes to the currently active/last-tapped SOAP text field. |
| **Record-then-transcribe** (D-52) | Vet presses record, speaks, presses stop. Audio processed by device-native STT engine. Brief processing delay ("Transcribing..." with spinner). Result inserted directly into the target text field for inline editing. Better accuracy than real-time streaming in noisy clinic environments (animals barking, multiple conversations). |
| **English + Hindi auto-detect** (D-53) | Transcription handles both English and Hindi (Devanagari). Vet can speak in either language or mix them (Hinglish) within the same utterance. Hindi set as primary language model (`hi-IN`) because Hindi models on Android handle English words within Hindi better than the reverse. |
| **Device-native primary, cloud fallback** (D-54) | Primary: device-native speech-to-text via `expo-speech-recognition` (wraps iOS SFSpeechRecognizer + Android SpeechRecognizer). Free and offline-capable. Fallback: device on-device recognition when connectivity is poor. Cloud API (Google Cloud Speech-to-Text V2 Chirp model) available as a future upgrade path for clinics needing better Hindi accuracy. |
| **No recording duration limit** (D-55) | Vet controls start/stop. Some consultations may require longer dictation. |
| **Medical term auto-formatting** (D-56) | Basic post-transcription formatting: capitalize recognized drug names, format temperature/weight units (e.g., "39 degree celsius" becomes "39 C"), correct common medical abbreviations. |
| **SOAP text fields only** (D-57) | Voice input targets free-text SOAP fields only. Not used for drug name search or structured fields (dropdowns, toggles) where accuracy risks are too high for voice recognition. |

### 5.7 File Attachments

| Capability | Details |
|---|---|
| **Multiple input sources** (D-59) | Camera capture (direct from floating bar Camera icon), gallery selection (choose existing photo), file picker (PDF, DICOM documents). All accessible via the attachment picker action sheet. |
| **Attachment metadata** (D-60) | Each file has a type classification dropdown (Lab Report, X-ray, Ultrasound, ECG, Photo, Other) and an optional text description. |
| **File limits** (D-61) | 10MB per file. Allowed types: JPEG, PNG, PDF, DICOM. Images above 5MB auto-compressed using `expo-image-manipulator` before upload. Maximum 10 files per consultation. |
| **S3 storage** | Files uploaded to AWS S3 (Mumbai region) via presigned URLs generated by the API. File metadata (type, name, size, S3 key, description) stored in PostgreSQL. Upload progress shown via linear indicator. |
| **DICOM handling** | DICOM files can be uploaded and stored. A placeholder card displays: "DICOM file -- view on web dashboard." Inline rendering on mobile is not supported for Beta. Web-based viewing deferred to Phase 9. |

### 5.8 Printable Documents

| Capability | Details |
|---|---|
| **Owner summary** (D-45) | Clean format for pet owners: pet name, date, diagnosis, prescriptions with owner-friendly dosage instructions, care instructions, follow-up date. Does NOT include raw SOAP notes or detailed vitals. |
| **Clinical record** (D-45) | Full format for clinical use: all vitals, complete SOAP notes (Subjective, Objective, Assessment, Plan), prescriptions with clinical dosage, file attachment list, referral information, addenda. |
| **Prescription pad** (D-47) | Formatted like a traditional paper prescription pad: clinic header, pet/owner information, Rx symbol, numbered medication list with owner-friendly dosage instructions, route and dispensed/prescribed status, general Rx notes, vet signature line. |
| **Vaccination certificate** (D-41) | Clinic-branded certificate with pet details, vaccine name, batch/lot number, manufacturer, expiry date, date administered, next due date, vet name + license number. |
| **Branded header** (D-46) | All PDFs include clinic logo (if uploaded, embedded as base64 for iOS compatibility), clinic name, address, and phone at top. Vet name + license number in footer. |
| **English only** (D-48) | All printable documents are English-only for Beta. Hindi localization deferred to v2 (LOC-01/LOC-02). |
| **Generation & sharing** | PDFs generated client-side using `expo-print` (printToFileAsync with HTML templates). Shared via `expo-sharing` which opens the native share sheet (WhatsApp, email, AirDrop, print, etc.). Generation target: under 3 seconds on mid-range device. |

### 5.9 Medical History & Timeline

| Capability | Details |
|---|---|
| **Compact list view** (D-58) | Medical history on pet profile shows a compact timeline: date + visit type + 1-line assessment summary + vet name + duration per row. Newest visits at top. Tap any row to expand to full consultation detail screen. |
| **History during consultation** (D-07) | "View History" button opens a bottom sheet overlay with past visits. Vet can reference old records (diagnoses, prescriptions, vitals) without leaving the current consultation. Each past visit shows a "Repeat Rx" button if prescriptions exist. |
| **Consultation detail screen** | Read-only view of a finalized consultation showing all sections (vitals, SOAP, prescriptions, attachments, care instructions, referral). Addendum section at the bottom for post-finalization notes. |

### 5.10 Audit Trail

| Capability | Details |
|---|---|
| **Immutable audit log** (D-62) | All EMR changes (consultations, vitals, prescriptions, attachments, vaccination records, deworming records) are audit-trailed via PostgreSQL triggers. Extends Phase 1's immutable append-only audit trail pattern (D-35/D-36). |
| **Captured data** | Each audit entry records: table name, record ID, action (INSERT/UPDATE/DELETE), actor ID, clinic ID, timestamp, old values (JSONB), new values (JSONB), and changed field names (text array). |
| **Immutability enforcement** | UPDATE and DELETE permissions revoked on the `audit_log` table for the application database role (`breeyo_app`). Audit entries can only be inserted, never modified or removed. |
| **Draft exclusion** | Auto-save drafts write to a separate `consultation_drafts` table that does NOT have audit triggers, avoiding performance overhead from frequent saves (every 3 seconds). Audit triggers fire only on the finalized `consultations` table and its related tables. Only the final clinical record is audited. |

### 5.11 Service Catalog Seed Data (ONB-02)

| Capability | Details |
|---|---|
| **Default service presets** | 20 pre-configured billable service entries seeded per clinic on creation: consultation types (General, Follow-Up, Home Visit, Emergency), vaccination services, surgery categories (Spay/Neuter, Minor, Major), diagnostics (X-Ray, Ultrasound, Lab Tests), dental, grooming, and preventive care. Each entry includes a default price, GST/SAC code, and GST rate. |
| **Phase 6 readiness** | The ServiceCatalog Prisma model and seed data are created in Phase 4 (plan 04-08) so the Phase 6 invoice builder has billable services to reference from day one, without blocking Phase 6 on data setup. |
| **Idempotent seeding** | Seed function is idempotent -- calling it on a clinic that already has presets creates no duplicates. |

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **SOAP note + vitals creation** | User can create SOAP notes (Subjective, Objective, Assessment, Plan) and record vitals (weight, temperature, heart rate, respiratory rate) during a consultation | Integration tests verifying consultation creation, SOAP data storage, and vitals recording with species-aware range validation |
| 2 | **Prescription writing** | User can write prescriptions with drug name, dosage, frequency, and duration from a pre-loaded drug database | Integration tests covering drug search, prescription CRUD, dosage validation with soft warnings, and owner-friendly instruction generation |
| 3 | **Voice-to-text transcription** | User can use voice-to-text to transcribe clinical notes into a text field on their phone | Integration tests with mocked STT engine; manual QA on physical device for Hindi, English, and Hinglish accuracy |
| 4 | **Medical history with attachments** | User can view a complete medical history timeline for any pet, including attached lab/imaging files | Integration tests for pet consultation history API and file attachment retrieval via presigned URLs |
| 5 | **Audit trail completeness** | All EMR changes are audit-trailed with who changed what and when | Automated tests verifying audit log entries on INSERT, UPDATE, DELETE for all EMR tables; immutability test confirming UPDATE/DELETE on audit_log is denied |
| 6 | **Seed data availability** | System ships with drug database (200-300 drugs with species-specific dosage ranges), breed lists per species, and 20 default service catalog presets with GST/SAC codes | Seed data integrity tests verifying record counts, data structure, and searchability on first clinic login |

---

## 7. User Stories & Requirements

### Consultation Lifecycle

| ID | Story | Acceptance Criteria |
|---|---|---|
| EMR-01 | As a vet, I want to create SOAP notes for a consultation so I can document my clinical findings in a structured format. | Consultation screen shows 7 accordion sections (Vitals, Subjective, Objective, Assessment, Plan, Prescriptions, Files). Each SOAP section supports quick-pick chips + free-text input. Sections expand/collapse independently (one at a time by default). Visit type (General/Surgery/Vaccination) selectable at start. Template-specific chips load based on visit type. Subjective has "Owner Reports" and "History" sub-sections. Objective has body system checklist with Normal/Abnormal toggles and expandable sub-findings. Assessment is free text. Plan has action item chips + free text. |
| EMR-02 | As a vet, I want to record vitals so I can track my patient's physical measurements over time. | Vitals section captures weight (kg), temperature (C), heart rate (bpm), respiratory rate (breaths/min). Species-aware normal ranges displayed as hints below each field. Values outside range highlighted with color-coded indicators (green = normal, orange = slightly abnormal within 10% of boundary, red = critically abnormal beyond 10%). Recording weight auto-updates pet profile weight on finalization. |
| EMR-03 | As a vet, I want to write prescriptions with drug details so my patients receive accurate medication instructions. | Drug search returns results from pre-seeded database of 200-300 Indian vet drugs (cached client-side for instant search). Each drug shows formulations and strength. Species-specific dosage suggestion displayed as hint text. Soft warning when dosage is outside recommended mg/kg range (vet can override; override audit-logged). Each medication captures: drug + formulation, dosage, route, frequency, duration, dispensed/prescribed flag. Owner-friendly instructions auto-generated. "Repeat Rx" copies all prescriptions from a past visit. General Rx notes field at bottom of prescription list. |
| EMR-04 | As a vet, I want to view a pet's complete medical history so I can make informed clinical decisions. | Medical history shows compact timeline (date, visit type, 1-line assessment summary, vet name, duration) with newest first. Tap expands to full consultation detail. History accessible during active consultation via bottom sheet overlay without leaving the current consultation. Pet profile extended with preventive care card, weight trend chart, and enhanced visit timeline. |
| EMR-05 | As a vet, I want to use voice-to-text so I can document notes hands-free during physical examinations. | Mic button on floating bar starts recording. Device-native STT processes speech (English + Hindi auto-detect, Hinglish handled). No duration limit. Result inserted into the active/last-focused SOAP text field. Basic medical term auto-formatting (capitalize drug names, format temperature/weight units). Works offline via on-device recognition. Microphone permission requested on first use. Voice restricted to SOAP text fields only (not structured fields or drug search). |
| EMR-06 | As a vet, I want to attach lab and imaging files so all diagnostic results are linked to the consultation. | Camera capture, gallery selection, and file picker (PDF/DICOM) available via floating bar Camera icon or Files section. Each attachment has file type dropdown (Lab Report, X-ray, Ultrasound, ECG, Photo, Other) + optional description. Limits enforced: 10MB max per file, JPEG/PNG/PDF/DICOM only, auto-compress images above 5MB, max 10 files per consultation. Files uploaded to S3 via presigned URLs with progress indication and retry on failure. |
| EMR-07 | As a clinic owner, I want all EMR changes audit-trailed so I have a verifiable record of clinical documentation. | PostgreSQL triggers log all INSERT, UPDATE, DELETE on consultation, vitals, prescription, attachment, vaccination, and deworming tables. Audit log captures actor ID, clinic ID, timestamp, old values (JSONB), new values (JSONB), and changed field names. Audit log is append-only (UPDATE/DELETE revoked on audit table for app role). Draft auto-saves excluded from audit triggers (only finalized records audited). |

### Consultation Workflow

| ID | Story | Acceptance Criteria |
|---|---|---|
| D-04/D-08 | As a vet, I want to explicitly finalize a consultation with a review step so I control when the record is locked. | "End Consultation" button triggers: cancel pending auto-save, synchronous save, navigate to review screen. Review shows all sections as read-only summary. "Not recorded" for empty sections. Warning: "Once finalized, this record cannot be edited. Addenda can be added later." "Confirm & Finalize" locks the record. Queue entry transitions to DONE. Consultation duration calculated. Toast: "Consultation finalized." Navigate back to queue. |
| D-05 | As a vet, I want my work auto-saved so I do not lose data if interrupted. | All changes auto-saved with 3-second debounce via PATCH /api/v1/consultations/{id}/draft. Draft indicator shows "Draft -- auto-saved [HH:MM AM/PM]" on success, "Unsaved changes" (tertiary) when dirty, "Could not save draft. Will retry." (error) on failure with 5-second auto-retry. |
| D-06 | As a vet, I want only one person consulting a patient at a time so there are no conflicting edits. | Lock acquired on consultation screen open (5-minute TTL, 60-second heartbeat renewal). Other vets see "Dr. [Name] is currently consulting this patient." Stale locks (no heartbeat for 5+ minutes) can be overridden with a "Take Over" option and explicit warning. |
| D-09 | As a vet, I want to optionally set a follow-up reminder when ending a consultation. | After "Confirm & Finalize," a follow-up sheet appears with date picker and reason field. Vet can set reminder or skip. Reminder attached to the pet with date and reason. Toast: "Follow-up reminder set for [DD MMM YYYY]." |

### Vaccination & Preventive Care

| ID | Story | Acceptance Criteria |
|---|---|---|
| D-40/D-42 | As a vet, I want to record vaccinations with auto-calculated next due dates so the preventive care schedule stays accurate. | Vaccination form captures: vaccine name (searchable), batch/lot number, manufacturer, expiry date. System auto-calculates next due date based on species, age, and vaccine-specific intervals (puppy series vs. adult booster). Auto-calculated date displayed with option to override. Record linked to consultation and pet. |
| D-41 | As a vet, I want to generate a vaccination certificate PDF so pet owners have official documentation. | PDF includes: clinic branded header, pet details, vaccine name, batch/lot, manufacturer, date administered, vet name + license number, next due date. Shareable via native share sheet. |
| D-43 | As a vet, I want to track deworming history with next due dates so I can monitor preventive care compliance. | Deworming record captures drug name, date administered, next due date (auto-calculated based on age-dependent intervals). Records linked to pet profile. |
| D-44 | As a vet, I want a color-coded preventive care summary on the pet profile so I can see status at a glance. | Preventive care card shows vaccination status and deworming status. Color-coded badges: green/check (up to date), yellow/clock-alert (due soon within 7 days), red/alert (overdue). Next due dates displayed. "No vaccination or deworming records yet." when empty. |

### Seed Data & Service Catalog

| ID | Story | Acceptance Criteria |
|---|---|---|
| ONB-02 | As a new clinic, I want the system to ship with ready-to-use clinical data so I can start immediately. | Drug database: 200-300 common Indian vet drugs with generic names, categories, formulations with strengths, and species-specific dosage ranges (dog, cat, rabbit, bird). Breed lists per species pre-loaded. 20 default service catalog presets with category, default price, GST/SAC codes seeded per clinic. Seed function is idempotent. |

### Printable Documents

| ID | Story | Acceptance Criteria |
|---|---|---|
| D-45/D-46/D-47 | As a vet, I want to generate branded PDF documents so pet owners receive professional clinical documentation. | Four PDF templates available from finalized consultation detail: Owner Summary (clean, owner-facing), Clinical Record (full SOAP detail), Prescription Pad (traditional format), Vaccination Certificate (for vaccination visits only). All PDFs include branded header (clinic logo as base64, name, address, phone) and footer (vet name, license number). Generated client-side via expo-print in under 3 seconds. Shared via native share sheet. English only for Beta. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 4:

- **Custom consultation templates (user-created)** -- System ships with 3 built-in templates (General, Surgery, Vaccination). Custom template creation deferred to post-Beta if vets request it (D-12).
- **Drug interaction checking** -- Deferred due to the complexity of building a comprehensive veterinary pharmacology interaction database and the liability risk of incomplete coverage. Vets rely on professional training (D-38).
- **Favorite/saved prescription combos** -- "Repeat Rx" from past visits covers the quick-reuse need for Beta (D-39).
- **Hindi PDFs** -- All printable documents are English-only. Hindi localization is a v2 requirement (LOC-01/LOC-02) (D-48).
- **Structured diagnosis codes** -- Assessment section is free text only. ICD-10-VET equivalent or structured diagnosis taxonomy deferred to post-Beta if analytics/reporting needs emerge (D-20).
- **AI-assisted SOAP mapping from voice** -- Full structured auto-mapping of voice dictation to specific SOAP fields is deferred per PROJECT.md. Basic speech-to-text into a text field is the Beta scope.
- **Weight trend chart during consultation** -- Chart available on pet profile page only, not in the vitals section during consultation (D-24).
- **Drug database admin UI** -- Drug data is pre-seeded via database migration. Updates require a code deploy or migration. Admin UI for drug management deferred to web dashboard in Phase 9.
- **DICOM viewing on mobile** -- DICOM files can be uploaded and stored. A placeholder card displays with a download option. Inline rendering not supported on mobile. Web-based viewing deferred to Phase 9.
- **Cloud speech-to-text API integration** -- Device-native STT is the Beta default (free, offline-capable). Cloud API (Google Cloud STT V2 or Sarvam AI) is a future upgrade for clinics needing better Hindi accuracy.
- **N/A toggle per SOAP section** -- Every section is always present. Accordion collapsed by default means untouched sections have zero cognitive cost. An N/A toggle adds UI complexity without meaningful time savings.
- **Body Condition Score (BCS) or additional vitals** -- Only the 4 core vitals (weight, temperature, heart rate, respiratory rate) for Beta. BCS requires a visual reference scale with body silhouettes.
- **Structured surgical fields** -- Surgery template uses the same SOAP structure with surgery-specific quick-pick chips. No additional structured fields (anesthesia type, incision site picker) for Beta.
- **Inventory stock deduction** -- Dispensed/prescribed flag and nullable `inventory_item_id` are data-model ready, but actual stock deduction is activated in Phase 5.
- **Invoice generation from consultation** -- Consultation services and dispensed medications flow to invoices in Phase 6. Phase 4 creates the service catalog presets to prepare for this.
- **WhatsApp reminders** -- Follow-up reminder dates and vaccination/deworming due dates are stored. Automated WhatsApp delivery is Phase 7.
- **Owner portal access to records** -- Consultation summaries, prescriptions, and vaccination certificates are viewable by pet owners via the Phase 9 owner portal.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phase 3 (Patient Registration & Walk-in Queue)** | Internal prerequisite | Queue-to-consultation transition (Call Next, In Consult status), pet profile data model, owner/pet records, visit history timeline, WebSocket real-time sync -- all prerequisites for Phase 4. |
| **Phase 2 (Design System)** | Internal prerequisite | AccordionItem, BottomSheet, Chip, Card, FAB, StatusBadge, Toast, FormField, and other base components consumed directly. Design tokens (colors, spacing, typography, animation timings) inherited without modification. |
| **Phase 1 (Auth & Tenancy)** | Internal prerequisite | Authentication middleware, RBAC permission enforcement, RLS multi-tenancy on all new EMR tables, and immutable audit trail patterns (D-35/D-36) extended to all clinical data. |
| **AWS S3 (Mumbai region)** | External service | File attachment storage for consultation images, lab reports, and documents. Development uses local file system or MinIO Docker container as substitute. |
| **Device-native STT engines** | Platform dependency | Voice-to-text depends on iOS SFSpeechRecognizer and Android SpeechRecognizer availability and quality. Mid-range Android phones (Android 8+) must support on-device recognition. |
| **Expo SDK 55** | Technical dependency | expo-speech-recognition (3.1.2), expo-print (55.0.13), expo-sharing, expo-image-picker, expo-document-picker, expo-image-manipulator, expo-file-system, expo-camera -- all verified at v55.x. |
| **Drug data curation** | Manual effort | No open-source, machine-readable database of Indian veterinary drugs with species-specific dosage ranges exists. Data must be manually curated from CDSCO approved drug lists, veterinary pharmacology references, and community sources (Scribd, Wikipedia). A practicing vet should validate the data before Beta launch. |
| **PostgreSQL 16 with RLS** | Technical | All new EMR tables require RLS policies for multi-tenant data isolation. Audit triggers must work correctly with the `breeyo_app` database role and RLS context. |
| **Redis 7** | Infrastructure | Consultation locking (TTL-based locks with heartbeat) depends on Redis. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Hindi voice-to-text accuracy is poor on mid-range Android devices** | Medium | High -- vets abandon the voice feature if transcription is unreliable for Hindi/Hinglish | Set `lang: 'hi-IN'` as primary (Hindi models handle embedded English better than reverse). Provide `contextualStrings` with common drug names and medical terms. Communicate that voice is "best effort" and needs review. Track voice adoption metrics. Plan cloud API upgrade path for clinics needing better accuracy. |
| **Drug database has dosage errors or missing entries** | Medium | High -- incorrect dosage ranges are a clinical safety risk; missing common drugs frustrate vets | Source data from CDSCO approved list + veterinary pharmacology references. All dosage warnings are "soft" (suggestions, not blocks) -- vet always has override authority. Plan a clinical review step with a practicing vet before Beta launch. Design the seed data as a JSON file that can be updated via migration without code changes. |
| **Consultation lock becomes stale after app crash** | Medium | Medium -- other vets see "Dr. X is consulting" indefinitely for a vet who is no longer active | 5-minute TTL lock in Redis with 60-second heartbeat renewal. If heartbeat stops (crash, battery death), lock auto-expires. "Take Over" option for stale locks with explicit warning: "Dr. X's session may have been interrupted. Take over this consultation?" |
| **Auto-save race condition with finalization** | Low | High -- finalized records missing last-second changes or draft overwriting finalized state | On "End Consultation": (1) cancel pending auto-save timer, (2) execute synchronous save, (3) then finalize. Use `isFinalizing` mutex flag in Zustand store to prevent concurrent save operations. |
| **PDF images do not render on iOS** | Medium | Medium -- clinic logo and file thumbnails appear as broken images in generated PDFs | Convert all images to base64 data URIs before embedding in HTML templates. iOS WKWebView (used by expo-print) does not support local `file://` URLs in HTML. Store base64 version of clinic logo alongside the file URL. |
| **Drug search feels slow on mid-range phones** | Low | Medium -- lag between typing and results causes vets to skip drug search and type manually | Load full drug list (~50KB for 300 entries) into client-side cache on app start. Search entirely client-side with simple string matching. Use React Query with `staleTime: Infinity` for the drug list. No network round-trip during search. |
| **Vaccination interval edge cases (puppy vs. adult)** | Medium | Medium -- incorrect next-due-date calculations lead to wrong preventive care schedules | Model intervals with age-dependent rules: `minAgeDays`, `maxAgeDays`, `isBooster` fields. Puppy series uses 21-day intervals (6-16 weeks), adult boosters use 365-day intervals (16+ weeks). Auto-calculated dates can be manually overridden by the vet. |
| **Audit trail triggers slow down auto-save writes** | Low | Medium -- database write queue backs up during active consultations | Audit triggers fire only on finalized `consultations` table, NOT on `consultation_drafts`. Drafts are ephemeral; only the final clinical state is audited. Draft table has no triggers. |
| **No open-source Indian veterinary drug database exists** | High | Medium -- significant manual effort required for drug data preparation | Budget substantial time for drug data curation. Sources: CDSCO approved list, Scribd community documents, Wikipedia veterinary drug lists, VetGeni (for reference only, proprietary). Target 200-300 drugs covering antibiotics, anti-parasitics, NSAIDs, vaccines, and supplements. JSON seed file format allows updates via database migration. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | Who validates the seed drug database (200-300 drugs) before Beta launch? | No open-source Indian vet drug database with species-specific dosage ranges exists. Data will be curated from CDSCO lists, pharmacology references, and community sources. A practicing veterinarian should review for clinical accuracy, especially species-specific dosage ranges and formulation data. | Product + Clinical Advisor |
| 2 | Which cloud STT provider should be used if device-native accuracy proves insufficient for Hindi? | Google Cloud Speech-to-Text V2 (Chirp model) has strong Hindi support at approximately $0.006/15 seconds. Sarvam AI is India-native at Rs 30/hour. Both have free tiers. Decision can be deferred since device-native STT is the Beta default (zero cost). | Engineering |
| 3 | Should finalized consultations support addendum-only editing or full edits with audit trail? | Medical record immutability is the standard in both human and veterinary EMR systems. Recommended approach (already designed): addendum-only. Original record cannot be modified after finalization; additional notes appended with timestamp and author attribution. The addendum itself is audit-trailed. Full editing with audit trail is an alternative but weakens the immutability guarantee. | Product |
| 4 | How should the consultation entry work from the queue -- auto-open on "Call Next" or tap to open? | Recommended (already designed): tap-to-open. Vets may call the next patient while finishing notes on the previous patient. Auto-opening the consultation screen would interrupt. The "In Consult" queue card serves as a clear entry point when the vet is ready. | Product + Engineering |
| 5 | What additional vitals beyond the 4 core should be planned for post-Beta? | Body Condition Score (BCS) is the most commonly requested additional vital. It requires a visual reference scale (1-9 scale with body silhouettes). Other candidates: SpO2, blood pressure, pain score. None are in Beta scope but the data model should accommodate future additions. | Product + Clinical Advisor |
| 6 | What is the retention policy for consultation draft data after finalization? | Auto-save drafts write to `consultation_drafts` (no audit triggers). After finalization, the draft data is effectively superseded by the finalized record in the audited `consultations` table. Should drafts be deleted immediately after finalization, retained for N days as a safety net, or kept indefinitely? | Engineering |
| 7 | How do we handle DICOM file viewing when the vet needs to view uploaded images? | For Beta, DICOM upload and storage are supported but inline viewing on mobile is not feasible (no React Native DICOM viewer works in Expo). Options: (a) placeholder with download link, (b) link to a web-based viewer via Phase 9 web dashboard, (c) rely on external DICOM viewer apps on the device. | Engineering |

---

*This is a Lightweight PRD for the EMR & Clinical Records phase. Detailed technical design lives in the planning packet: 04-CONTEXT.md (62 implementation decisions), 04-RESEARCH.md (technology evaluation), 04-UI-SPEC.md (visual and interaction contract), and individual plan files 04-01-PLAN.md through 04-08-PLAN.md.*
