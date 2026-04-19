# Phase 4: EMR & Clinical Records - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Full consultation workflow for veterinarians: SOAP notes, vitals recording, prescriptions with a searchable drug database, voice-to-text clinical note transcription, medical history timeline, lab/imaging file attachments, and a complete audit trail. Delivers 3 visit type templates (General, Surgery, Vaccination), printable PDFs (consultation summary, prescription pad, vaccination certificate), and preventive care tracking (vaccination + deworming schedules). Phase 4 builds on Phase 3's queue-to-consultation transition and extends pet profiles with clinical data.

</domain>

<decisions>
## Implementation Decisions

### Consultation Workflow
- **D-01:** Accordion-based consultation screen layout -- collapsible sections on one page. Tap section header to expand/collapse. Fixed order for Beta: Vitals -> Subjective -> Objective -> Assessment -> Plan -> Prescriptions -> Files
- **D-02:** Compact sticky patient banner at top -- pet name, species, age, weight, owner name + phone. Always visible while scrolling through sections
- **D-03:** Visit reason chip + behavioral warnings/allergies from pet profile shown below patient banner. Gives vet immediate context from check-in (Phase 3, D-14) and pet profile notes (Phase 3, D-11)
- **D-04:** Explicit "End Consultation" button to finalize -- marks queue entry as Done, saves all EMR data, returns to queue. No auto-finalize
- **D-05:** Auto-save drafts as vet types -- save every few seconds. Draft indicator shown. If vet gets interrupted, work is preserved. "End Consultation" still required to finalize and lock the record
- **D-06:** One active consultation per patient at a time -- if another vet tries to open, they see "Dr. X is currently consulting". Prevents concurrent edit conflicts
- **D-07:** Side panel / bottom sheet for viewing previous consultations during current one -- "View history" button opens overlay with past visits. Vet references old records without leaving current consultation
- **D-08:** Summary review screen before finalizing -- tapping "End Consultation" shows review screen with vitals, diagnosis, prescriptions, follow-up. Vet confirms before record is locked
- **D-09:** Optional follow-up reminder at End Consultation -- pick a date + reason. Creates a reminder attached to the pet. Phase 7 (WhatsApp) will send automated reminders based on this
- **D-10:** Floating quick-action bar at bottom -- icons: Mic (voice), Rx (add prescription), Camera (attach file), Timer (follow-up). Quick access without scrolling to find sections
- **D-11:** 3 visit type templates at consultation start: General Consultation, Surgery, Vaccination. Dropdown selection when opening a new consultation
- **D-12:** System templates only for Beta -- no user-created custom templates. Built-in templates ship with the 3 types. Custom template creation deferred to post-Beta
- **D-13:** Auto-track consultation duration -- system records start time (consultation opened) and end time (finalized). Duration shown on visit history. Feeds into Phase 3's queue wait estimation (D-19)
- **D-14:** Vitals auto-update pet profile weight -- when vet records weight in vitals, pet profile weight updates to latest value automatically

### SOAP Notes & Data Entry
- **D-15:** Structured + free-text hybrid for all SOAP sections -- quick-pick chips (common findings as tappable tags) PLUS free-text area per section. Faster for common cases, flexible for unusual ones
- **D-16:** Template-specific quick-pick chips -- General: common symptoms (vomiting, diarrhea, lethargy). Surgery: surgical terms (incision, sutures, drain). Vaccination: vaccine names, reaction symptoms
- **D-17:** Pre-loaded chips + vet can add custom terms that appear alongside defaults. Personalizes over time
- **D-18:** Subjective section has labeled sub-sections: "Owner reports" (what the owner told the vet) and "History" (vet's notes on presentation history, prior conditions). Duration of symptoms captured in free text, not structured fields
- **D-19:** Objective section includes a body system physical exam checklist: Eyes, Ears, Skin/Coat, Oral, Lymph nodes, Abdomen, Heart/Lungs, Musculoskeletal. Each system: Normal/Abnormal toggle. If Abnormal, expands to show common sub-findings as checkboxes + notes field
- **D-20:** Assessment section is free text only -- no structured diagnosis codes. Vet writes diagnosis in their own words
- **D-21:** Plan section supports structured action items (Follow-up, Lab retest, Diet change, Exercise restriction) as chips + free-text area. Selected items connect to the follow-up reminder feature (D-09)

### Vitals
- **D-22:** Core vitals: weight, temperature, heart rate, respiratory rate (per EMR-02 requirements)
- **D-23:** Species-aware normal ranges for vitals -- system knows normal ranges per species (dog temp 38-39.2C, cat 38-39.5C). Values outside range highlighted in red/orange for quick abnormality spotting
- **D-24:** Weight trend chart on pet profile page only (not during consultation). Shows weight over last visits for growth/loss tracking

### Prescriptions
- **D-25:** Searchable drug database -- vet types drug name, system suggests from pre-loaded database. Pre-seeded with 200-300 common Indian veterinary drugs (antibiotics, anti-parasitic, NSAIDs, vaccines) with standard dosage ranges per species
- **D-26:** Species-specific dosage suggestions based on pet weight -- system uses pet's species to show correct mg/kg range. Drug entries include per-species dosage data
- **D-27:** Formulation-aware drug database -- entries include formulations (tablet, suspension, injectable, drops). Vet selects drug + formulation. Affects route and dosage calculation
- **D-28:** Soft dosage warning if vet enters dose outside species-specific range -- yellow warning with entered vs recommended range. Vet can override. Logged in audit trail
- **D-29:** Add medications one at a time with list display -- "Add Medication" button opens drug search. After adding, medication appears in a list. Tap again for next drug. List shows all prescribed drugs with edit/remove
- **D-30:** Route of administration dropdown per medication -- Oral, Injectable (IV/IM/SC), Topical, Eye drops, Ear drops, Inhalation, Rectal
- **D-31:** Quick-select common frequencies -- chips: Once daily, Twice daily, Three times daily, Every 8 hours, As needed (PRN), Before meals, After meals + custom text option
- **D-32:** Flexible duration options -- dropdown: 3 days, 5 days, 7 days, 10 days, 14 days, 30 days, Until finished, As needed (PRN), Ongoing/Chronic, Custom (enter days)
- **D-33:** Dispensed vs Prescribed flag per medication -- toggle: "Dispensed" (from clinic stock) or "Prescribed" (owner buys externally). Dispensed items designed to link to inventory in Phase 5
- **D-34:** Prescription data model prepared for inventory linking -- nullable inventory_item_id on prescription items. Actual stock deduction activated when Phase 5 inventory system is built
- **D-35:** Both clinical + owner-friendly dosage language -- vet enters clinical format. System auto-generates owner-friendly instructions (e.g., "1 tablet twice daily for 5 days"). Clinical record keeps both. Owner PDF uses friendly version
- **D-36:** "Repeat Rx" from past visits -- in history bottom sheet, vet taps "Repeat Rx" to copy all prescriptions into current consultation. Vet adjusts doses/duration. Time saver for follow-ups
- **D-37:** General Rx notes field at bottom of all prescriptions (not per-drug). One notes area for special instructions
- **D-38:** No drug interaction checks for Beta -- vets rely on training. Interaction checking deferred due to complexity and liability risk
- **D-39:** No favorite prescriptions for Beta -- "Repeat Rx" from past visits covers the quick-reuse need

### Vaccination & Preventive Care
- **D-40:** Vaccination template includes: vaccine name (searchable), batch/lot number, manufacturer, expiry date, next due date. Creates proper vaccination certificate data
- **D-41:** Printable vaccination certificate PDF -- branded with clinic header, pet details, vaccine name, batch, date, vet name + license, next due date. Critical for rabies compliance and pet travel
- **D-42:** Vaccination tracker per pet -- system maintains vaccination schedule. Auto-calculates next due dates based on standard intervals. Shows overdue vaccines on pet profile. Feeds into Phase 7 WhatsApp reminders
- **D-43:** Deworming tracker similar to vaccination tracker -- tracks deworming history with drug name, date, next due date. Shows overdue deworming on pet profile
- **D-44:** Preventive care summary card on pet profile -- dedicated section showing: vaccination status (up to date / overdue), deworming status, next due dates. Color-coded: green (up to date), red (overdue), yellow (due soon)

### Printable Documents
- **D-45:** Shareable consultation summary with two formats: "Owner summary" (clean: pet name, date, diagnosis, prescriptions, follow-up) and "Clinical record" (full: vitals, SOAP notes, prescriptions, files summary). Vet picks which to generate
- **D-46:** Branded PDF header on all documents -- clinic logo (if uploaded), clinic name, address, phone number at top. Vet name + license number in footer
- **D-47:** Standalone prescription pad PDF -- formatted like traditional paper prescription pad: clinic header, pet/owner info, medications with owner-friendly dosage instructions, vet signature line
- **D-48:** English-only PDFs for Beta -- Hindi localization comes in v2 (LOC-01/LOC-02)

### Referrals
- **D-49:** Optional referral section in consultation -- specialist type (dropdown), referral reason (text), urgency (routine/urgent). Shows on clinical record PDF

### Care Instructions
- **D-50:** Dedicated "Care Instructions" text field per consultation (separate from Plan section) -- shows prominently on owner summary PDF and prescription pad. Common quick-picks: Soft food, NPO, Exercise restriction, Cone/collar, Wound care

### Voice-to-Text
- **D-51:** Mic button on floating quick-action bar -- one tap starts recording. Voice output goes to the currently active/last-tapped text field
- **D-52:** Record-then-transcribe mode -- vet presses record, speaks, presses stop. Audio sent to cloud API for transcription. Brief processing delay. Result inserted directly into field for inline editing
- **D-53:** English + Hindi auto-detect -- transcription handles both English and Hindi (Devanagari). Vet can speak in either or mix them (Hinglish). Auto-detects language per phrase
- **D-54:** Cloud speech API with offline fallback -- primary: cloud API for best accuracy (especially Hindi). Fallback: device-native speech-to-text (Google/Apple on-device) when offline. Auto-switches based on connectivity
- **D-55:** No recording duration limit -- vet controls start/stop. Some consultations may need longer dictation
- **D-56:** Basic medical term auto-formatting post-transcription -- capitalize recognized drug names, format temperature/weight units, correct common medical abbreviations
- **D-57:** Voice for SOAP text fields only -- not for drug name search or structured fields. Accuracy risks too high for drug name recognition

### Medical History & Attachments
- **D-58:** Compact list view for history timeline -- date + visit type + 1-line summary per row. Tap to open full detail screen. Shows more visits without scrolling. Better for pets with long histories. Newest at top (Phase 3, D-31)
- **D-59:** Camera + gallery + file picker for attachments -- take photo (camera), choose from gallery, upload file (PDF, DICOM). Camera accessible via floating quick-action bar
- **D-60:** Attachment metadata -- each attachment has: file type dropdown (Lab report, X-ray, Ultrasound, ECG, Photo, Other) + optional text description
- **D-61:** File limits: 10MB per file, allowed types JPEG/PNG/PDF/DICOM, auto-compress photos above 5MB, max 10 files per consultation

### Audit Trail
- **D-62:** All EMR changes audit-trailed (per EMR-07) -- who changed what and when. Follows Phase 1 immutable append-only audit trail pattern (D-35/D-36). Extends to all clinical record fields

### Claude's Discretion
- Consultation entry flow from queue (auto-open EMR on "Call Next" vs tap to open)
- Resume flow when vet leaves consultation in progress (banner vs In Consult card as resume point)
- Post-finalization editability approach (addendum-only vs full edit with audit trail)
- Additional vitals beyond 4 core (e.g., body condition score BCS)
- Surgery template specific fields (structured surgical fields vs extended SOAP hints)
- Recording UI indicator during voice dictation (overlay vs minimal)
- SOAP quick-pick chips collapsibility behavior
- N/A toggle per SOAP section for quick visits (template-driven vs always present)
- Drug database maintenance and admin controls

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value (mobile-first for solo vets), constraints (mid-range Android 8+, offline support, price sensitivity), key decisions
- `.planning/REQUIREMENTS.md` -- EMR-01 through EMR-07 are the requirements for this phase
- `.planning/ROADMAP.md` -- Phase 4 goal, success criteria, dependency on Phase 3

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` -- Auth system, RBAC, multi-tenant with RLS, API conventions (D-27-D-30), immutable audit trail patterns (D-34-D-36), multi-clinic support (D-22-D-26)
- `.planning/phases/02-ui-ux-design-design-system/02-CONTEXT.md` -- Design system: Material Design 3 (D-01), warm colors (D-02), 7-level typography (D-03), 8px spacing (D-04), compact density for EMR (D-32), progressive disclosure (D-35), step-by-step wizards (D-11), bottom tab bar (D-25), FABs (D-30), accordion/bottom sheet patterns
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` -- Queue-to-consultation transition: Call Next (D-17), status cycling (D-18), visit reason at check-in (D-14), pet profile layout (D-27), visit history timeline (D-31), WebSocket real-time sync (D-33), behavioral notes field (D-11)
- `.planning/phases/02-ui-ux-design-design-system/02-UI-SPEC.md` -- UI design contract with component inventory, design tokens, screen states

### Technology Stack
- `.planning/research/STACK.md` -- React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Prisma, TypeScript, Zustand, React Query, zod

No additional external specs or ADRs -- requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet -- Phases 1-3 create the foundation (auth, design system, queue). Phase 4 is the first heavy clinical data feature consuming all three

### Established Patterns
- Monorepo structure from Phase 1 -- EMR module follows the same bounded context pattern
- PostgreSQL RLS multi-tenancy from Phase 1 -- all clinical data scoped to clinic tenant
- Auth middleware from Phase 1 -- all EMR endpoints require authentication with role-based access
- Design system from Phase 2 -- accordion, bottom sheet, FAB, chips, cards, status badges all drawn from component library
- API conventions from Phase 1 (D-27-D-30) -- REST endpoints follow `/api/v1/{resource}` pattern
- WebSocket real-time from Phase 3 -- queue status changes (Call Next -> In Consult -> Done) drive consultation lifecycle
- Pet profile from Phase 3 (D-27) -- Phase 4 extends with clinical data (vitals history, vaccination/deworming cards, weight trend)

### Integration Points
- Queue system (Phase 3) -- consultation opens from queue, ends with Done status. Consultation duration feeds queue wait estimation
- Pet profile (Phase 3) -- extended with preventive care card, weight trend, and clinical visit data
- Future: Inventory (Phase 5) -- prescription dispensed flag links to inventory items via nullable foreign key
- Future: Invoicing (Phase 6) -- consultation services and dispensed medications flow to invoice
- Future: WhatsApp (Phase 7) -- follow-up reminders and vaccination/deworming due dates trigger automated messages
- Future: Owner Portal (Phase 9) -- consultation summaries, prescriptions, and vaccination certificates visible to pet owners

</code_context>

<specifics>
## Specific Ideas

- Consultation feels like a structured but fast workflow -- accordion sections let vet jump to what they need, quick-pick chips reduce typing, voice handles the rest
- Physical exam checklist with expandable sub-findings brings structured clinical data without forcing the vet to type everything out
- Drug database pre-seeded with 200-300 common Indian vet drugs -- day one utility, not an empty system that needs setup
- Species-specific dosing with soft warnings is a clinical safety net without being a blocker -- vet always has final say
- "Dispensed vs Prescribed" flag on medications reflects Indian vet clinic reality where most vets dispense in-house
- Vaccination certificate is critical for Indian pet owners -- rabies compliance, pet travel, apartment complex requirements
- Preventive care card on pet profile gives the vet a 2-second health snapshot: are vaccinations current? Deworming on track?
- Record-then-transcribe for voice -- better accuracy in noisy clinic environments (animals barking, multiple conversations)
- English + Hindi voice recognition matches how Indian vets actually speak during consultations (Hinglish is the norm)

</specifics>

<deferred>
## Deferred Ideas

- Custom consultation templates (user-created) -- post-Beta if vets request
- Drug interaction checking -- deferred due to complexity, liability risk, and need for comprehensive veterinary pharmacology database
- Favorite/saved prescriptions -- "Repeat Rx" from past visits covers the quick-reuse need for Beta
- Hindi PDFs -- v2 scope (LOC-01/LOC-02 in REQUIREMENTS.md)
- Structured diagnosis codes in Assessment -- free text only for Beta. Structured diagnosis taxonomy added post-Beta if analytics/reporting needs it
- AI-assisted SOAP mapping from voice (structured auto-mapping of dictation to SOAP fields) -- deferred per PROJECT.md (basic speech-to-text first)
- Weight trend chart during consultation (in vitals section) -- deferred to pet profile page only

None -- all ideas that emerged stayed within phase scope or were explicitly deferred above.

</deferred>

---

*Phase: 04-emr-clinical-records*
*Context gathered: 2026-04-19*
