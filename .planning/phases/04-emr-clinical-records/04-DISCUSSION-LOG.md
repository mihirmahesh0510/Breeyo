# Phase 4: EMR & Clinical Records - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 04-EMR & Clinical Records
**Areas discussed:** Consultation workflow, SOAP & prescription entry, Voice-to-text experience, History & attachments

---

## Consultation Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-open EMR on "Call Next" | Queue status changes AND EMR opens automatically | |
| Tap patient card to open EMR | Call Next changes status but stays on queue, vet taps card to open EMR | |
| You decide | Claude picks the approach | ✓ |

**User's choice:** Claude's discretion
**Notes:** Vet controls when to start documenting vs zero-tap convenience

| Option | Description | Selected |
|--------|-------------|----------|
| Tabbed sections | Tabs at top: Vitals, SOAP, Rx, Files | |
| Single scrollable form | All sections on one scrollable page | |
| Accordion sections | Collapsible sections on one page | ✓ |
| You decide | | |

**User's choice:** Accordion sections

| Option | Description | Selected |
|--------|-------------|----------|
| Compact patient banner | Sticky top bar with key pet/owner info | ✓ |
| Full patient card | Larger card with photo and last visit summary | |
| You decide | | |

**User's choice:** Compact patient banner

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "End Consultation" button | Bottom button to finalize, marks Done, saves data | ✓ |
| Auto-save + manual close | Auto-save drafts, End button finalizes | |
| You decide | | |

**User's choice:** Explicit "End Consultation" button

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-save drafts | Save every few seconds, draft indicator shown | ✓ |
| Save only on End Consultation | No drafts, data saved only on finalize | |
| You decide | | |

**User's choice:** Auto-save drafts

| Option | Description | Selected |
|--------|-------------|----------|
| Side panel / bottom sheet | "View history" opens overlay with past visits | ✓ |
| Navigate away with back | Go to pet profile, return to consultation | |
| You decide | | |

**User's choice:** Side panel / bottom sheet

| Option | Description | Selected |
|--------|-------------|----------|
| One active consultation per patient | Only one vet can consult same patient | ✓ |
| Multiple allowed | Multiple vets, last-write-wins | |
| You decide | | |

**User's choice:** One active consultation per patient

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed order for Beta | Vitals -> S -> O -> A -> P -> Rx -> Files | ✓ |
| Customizable per user | Vet reorders in settings | |
| You decide | | |

**User's choice:** Fixed order for Beta

| Option | Description | Selected |
|--------|-------------|----------|
| Queue-only entry | All consultations start from queue | |
| Direct from pet profile | Open consultation without queue check-in | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Resume banner on queue | Prominent banner at top for resuming | |
| In Consult card acts as resume | Tap the In Consult card to reopen | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Addendum only | Original locked, addendum notes only | |
| Full edit with audit trail | Edit any field, all changes logged | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, optional follow-up field | Date + reason at End Consultation | ✓ |
| Not in this phase | Follow-ups in Phase 7/8 | |
| You decide | | |

**User's choice:** Yes, optional follow-up field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show context at top | Visit reason chip + warnings below banner | ✓ |
| Vet checks pet profile separately | No automatic context display | |
| You decide | | |

**User's choice:** Yes, show context at top

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, floating quick-action bar | Mic, Rx, Camera, Timer icons at bottom | ✓ |
| No, use accordion sections | All actions within sections | |
| You decide | | |

**User's choice:** Yes, floating quick-action bar

| Option | Description | Selected |
|--------|-------------|----------|
| General + Surgery + Vaccination | 3 templates | ✓ |
| General + Vaccination only | 2 templates | |
| You decide | | |

**User's choice:** General + Surgery + Vaccination

| Option | Description | Selected |
|--------|-------------|----------|
| System templates only for Beta | 3 built-in only | ✓ |
| User-created templates | Save any consultation as template | |
| You decide | | |

**User's choice:** System templates only for Beta

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, shareable summary | PDF with diagnosis, Rx, follow-up | ✓ |
| Not in Phase 4 | Sharing in Phase 7/8 | |
| You decide | | |

**User's choice:** Yes, shareable summary

| Option | Description | Selected |
|--------|-------------|----------|
| Both formats available | Owner summary + Clinical record | ✓ |
| Clinical summary only | | |
| Full consultation record | | |
| You decide | | |

**User's choice:** Both formats available

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, branded header | Clinic logo, name, contact at top | ✓ |
| Plain, no branding | | |
| You decide | | |

**User's choice:** Yes, branded header

| Option | Description | Selected |
|--------|-------------|----------|
| Summary review before finalizing | Review screen with vitals, Rx, follow-up | ✓ |
| Direct finalize with dialog | Simple Yes/No confirmation | |
| You decide | | |

**User's choice:** Summary review before finalizing

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-update pet profile | Vitals weight updates profile automatically | ✓ |
| Separate, manual update | Independent weights | |
| You decide | | |

**User's choice:** Yes, auto-update pet profile

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-track consultation duration | Records start/end time automatically | ✓ |
| No time tracking for Beta | | |
| You decide | | |

**User's choice:** Auto-track consultation duration

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, species-aware normal ranges | Values outside range highlighted | ✓ |
| No highlighting for Beta | Plain numbers only | |
| You decide | | |

**User's choice:** Yes, species-aware normal ranges

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, mini weight chart | Sparkline in vitals section | |
| Weight history in pet profile only | Trend on profile page, not consultation | ✓ |
| You decide | | |

**User's choice:** Weight history in pet profile only

| Option | Description | Selected |
|--------|-------------|----------|
| Add body condition score (BCS) | 1-9 scale | |
| Stick with 4 core vitals | Weight, temp, HR, RR only | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Specific surgical fields | Anesthesia, procedure, findings, post-op, suture date | |
| Extended SOAP only | Same SOAP with hints | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

---

## SOAP & Prescription Entry

| Option | Description | Selected |
|--------|-------------|----------|
| Free-text per section | Multi-line text with placeholder hints | |
| Structured + free-text hybrid | Quick-pick chips + free-text area | ✓ |
| You decide | | |

**User's choice:** Structured + free-text hybrid

| Option | Description | Selected |
|--------|-------------|----------|
| Searchable drug database | Pre-loaded database with auto-suggest | ✓ |
| Free-text drug entry | Manual typing in separate fields | |
| You decide | | |

**User's choice:** Searchable drug database

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, auto-suggest dose by weight | Species-specific mg/kg calculation | ✓ |
| Database for names only | Manual dosage entry | |
| You decide | | |

**User's choice:** Yes, auto-suggest dose by weight

| Option | Description | Selected |
|--------|-------------|----------|
| Add one at a time with list | "Add Medication" button, list below | ✓ |
| Quick multi-add bottom sheet | Stays open for rapid entry | |
| You decide | | |

**User's choice:** Add one at a time with list

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-loaded + vet can add custom | System chips + user-added terms | ✓ |
| Pre-loaded only for Beta | Fixed set, no customization | |
| You decide | | |

**User's choice:** Pre-loaded + vet can add custom

| Option | Description | Selected |
|--------|-------------|----------|
| Both: clinical + owner-friendly | Auto-generated owner language | ✓ |
| Clinical format only | | |
| You decide | | |

**User's choice:** Both: clinical + owner-friendly

| Option | Description | Selected |
|--------|-------------|----------|
| Basic interaction checks | Flag common interactions | |
| No interaction checks for Beta | Vets rely on training | ✓ |
| You decide | | |

**User's choice:** No interaction checks for Beta

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, link Rx to inventory | Check clinic stock, "Dispense from stock" | ✓ |
| Prescriptions standalone for now | | |
| You decide | | |

**User's choice:** Yes, link Rx to inventory
**Notes:** Phase 4 prepares data model (nullable inventory_item_id). Actual stock deduction in Phase 5/6

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, dispensed vs prescribed flag | Toggle per medication | ✓ |
| All prescriptions same type | | |
| You decide | | |

**User's choice:** Yes, dispensed vs prescribed flag

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, template-specific chips | Different chips per visit type | ✓ |
| Same chips for all types | Universal set | |
| You decide | | |

**User's choice:** Yes, template-specific chips

| Option | Description | Selected |
|--------|-------------|----------|
| Quick-select common frequencies | Dropdown/chips with common options + custom | ✓ |
| Free-text only | | |
| You decide | | |

**User's choice:** Quick-select common frequencies

| Option | Description | Selected |
|--------|-------------|----------|
| Free text only | Assessment purely free text | ✓ |
| Searchable diagnosis list + free text | Structured diagnosis + text | |
| You decide | | |

**User's choice:** Free text only

| Option | Description | Selected |
|--------|-------------|----------|
| Structured action items + free text | Quick-add for common actions + text | ✓ |
| Free text only | | |
| You decide | | |

**User's choice:** Structured action items + free text

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, vaccine batch tracking | Name, batch/lot, manufacturer, expiry, next due | ✓ |
| Basic vaccine record only | Name, date, next due only | |
| You decide | | |

**User's choice:** Yes, vaccine batch tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, vaccination certificate PDF | Branded certificate with batch details | ✓ |
| Use general summary PDF | | |
| You decide | | |

**User's choice:** Yes, vaccination certificate PDF

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-seeded with common drugs | 200-300 drugs with dosage ranges | ✓ |
| Empty, vet populates | | |
| You decide | | |

**User's choice:** Pre-seeded with common drugs

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, copy from past visit | "Repeat Rx" copies prescriptions | ✓ |
| Manual re-entry each time | | |
| You decide | | |

**User's choice:** Yes, copy from past visit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, standalone prescription pad | Formatted like traditional paper Rx pad | ✓ |
| Included in consultation summary | | |
| You decide | | |

**User's choice:** Yes, standalone prescription pad

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, body system checklist | Normal/Abnormal toggle per system | ✓ |
| Free text only | | |
| You decide | | |

**User's choice:** Yes, body system checklist

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable with sub-findings | Common sub-findings checkboxes + notes | ✓ |
| Normal/Abnormal + notes only | | |
| You decide | | |

**User's choice:** Expandable with sub-findings

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, vaccination tracker | Auto-calculates next due, shows overdue | ✓ |
| Manual next-due date only | | |
| You decide | | |

**User's choice:** Yes, vaccination tracker

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, deworming schedule | Track history with next due dates | ✓ |
| Use general consultation records | | |
| You decide | | |

**User's choice:** Yes, deworming schedule

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, preventive care card | Color-coded vaccination + deworming status | ✓ |
| Data visible in visit history | | |
| You decide | | |

**User's choice:** Yes, preventive care card

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, labeled sub-sections | "Owner reports" + "History" | ✓ |
| Single free-text area | | |
| You decide | | |

**User's choice:** Yes, labeled sub-sections

| Option | Description | Selected |
|--------|-------------|----------|
| Symptom + duration | Quick-picks with duration field | |
| Duration in free text | Natural language duration | ✓ |
| You decide | | |

**User's choice:** Duration in free text

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Chips always shown | |
| Collapsible after selection | Collapse to show selected only | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, N/A toggle per section | Collapsible skip for quick visits | |
| All sections always present | | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, bilingual Rx output | English + Hindi dosage instructions | |
| English only for Beta | Hindi in v2 | ✓ |
| You decide | | |

**User's choice:** English only for Beta

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, flexible duration options | Specific days + Until finished, PRN, Ongoing, Custom | ✓ |
| Number of days only | | |
| You decide | | |

**User's choice:** Yes, flexible duration options

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, saved Rx favorites | Star/save prescription combinations | |
| Not for Beta | Repeat Rx covers this | ✓ |
| You decide | | |

**User's choice:** Not for Beta

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, species-specific dosing | Per-species mg/kg data | ✓ |
| Generic dosage range only | | |
| You decide | | |

**User's choice:** Yes, species-specific dosing

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, soft warning | Yellow warning if outside range, vet can override | ✓ |
| No warning, suggestion only | | |
| You decide | | |

**User's choice:** Yes, soft warning

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, route selection | Dropdown: Oral, Injectable, Topical, etc. | ✓ |
| Included in notes only | | |
| You decide | | |

**User's choice:** Yes, route selection

| Option | Description | Selected |
|--------|-------------|----------|
| Instructions field per consultation | Dedicated "Care Instructions" with quick-picks | ✓ |
| Part of the Plan section | | |
| You decide | | |

**User's choice:** Instructions field per consultation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, formulation-aware | Entries include tablet/suspension/injectable/drops | ✓ |
| Drug name only | | |
| You decide | | |

**User's choice:** Yes, formulation-aware

| Option | Description | Selected |
|--------|-------------|----------|
| General Rx notes only | One notes field at bottom of all prescriptions | ✓ |
| Yes, per-drug notes | Notes field per medication entry | |
| You decide | | |

**User's choice:** General Rx notes only

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, referral field | Specialist type, reason, urgency | ✓ |
| Not for Beta | | |
| You decide | | |

**User's choice:** Yes, referral field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, record service fees in EMR | Bridge to Phase 6 invoicing | |
| Fees handled in invoicing only | No fee tracking in EMR | ✓ |
| You decide | | |

**User's choice:** Fees handled in invoicing only

---

## Voice-to-Text Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Floating quick-action bar | Mic on quick-action bar, outputs to active field | ✓ |
| Inside each text field | Mic icon inside every text field | |
| Both locations | Quick-action bar + per-field mic | |
| You decide | | |

**User's choice:** Floating quick-action bar

| Option | Description | Selected |
|--------|-------------|----------|
| Real-time streaming | Text appears word by word as vet speaks | |
| Record then transcribe | Record, stop, cloud processes, result appears | ✓ |
| You decide | | |

**User's choice:** Record then transcribe

| Option | Description | Selected |
|--------|-------------|----------|
| English + Hindi auto-detect | Both languages, auto-detects per phrase | ✓ |
| English only for Beta | | |
| You decide | | |

**User's choice:** English + Hindi auto-detect

| Option | Description | Selected |
|--------|-------------|----------|
| Review + edit before inserting | Preview overlay with Accept/Re-record | |
| Direct insert, edit in field | Inserted directly, vet edits inline | ✓ |
| You decide | | |

**User's choice:** Direct insert, edit in field

| Option | Description | Selected |
|--------|-------------|----------|
| Cloud API with offline fallback | Primary cloud, fallback device-native STT | ✓ |
| Cloud API only | Voice requires internet | |
| You decide | | |

**User's choice:** Cloud API with offline fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Recording overlay with timer | Full-width overlay with waveform | |
| Minimal indicator | Red mic button + small timer | |
| You decide | | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| 60 seconds per recording | Cap with multiple recordings | |
| No limit | Vet controls start/stop | ✓ |
| You decide | | |

**User's choice:** No limit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, basic medical term formatting | Capitalize drugs, format units | ✓ |
| Raw transcription only | | |
| You decide | | |

**User's choice:** Yes, basic medical term formatting

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, voice drug search | Dictate drug name to search database | |
| Voice for notes only | Not for drug search/structured fields | ✓ |
| You decide | | |

**User's choice:** Voice for notes only

---

## History & Attachments

| Option | Description | Selected |
|--------|-------------|----------|
| Card-based timeline | Visit cards with expand inline | |
| Compact list view | Dense list, tap to open detail screen | ✓ |
| You decide | | |

**User's choice:** Compact list view

| Option | Description | Selected |
|--------|-------------|----------|
| Camera + gallery + file picker | All three options for attachments | ✓ |
| Camera + gallery only | Photos only, no file upload | |
| You decide | | |

**User's choice:** Camera + gallery + file picker

| Option | Description | Selected |
|--------|-------------|----------|
| Type + description | Dropdown type + optional text description | ✓ |
| File only, no metadata | | |
| You decide | | |

**User's choice:** Type + description

| Option | Description | Selected |
|--------|-------------|----------|
| 10MB per file, common types | JPEG/PNG/PDF/DICOM, auto-compress, max 10 files | ✓ |
| Generous limits | 50MB, any image/PDF | |
| You decide | | |

**User's choice:** 10MB per file, common types

---

## Claude's Discretion

- Consultation entry flow from queue (auto-open vs tap-to-open)
- Resume flow for interrupted consultations
- Post-finalization editability (addendum vs full edit)
- Additional vitals (BCS)
- Surgery template field structure
- Recording UI indicator
- SOAP chips collapsibility
- N/A toggle per SOAP section

## Deferred Ideas

- Custom consultation templates -- post-Beta
- Drug interaction checking -- complexity + liability
- Favorite prescriptions -- Repeat Rx covers this
- Hindi PDFs -- v2 localization scope
- Structured diagnosis codes -- post-Beta if analytics needs
- AI-assisted SOAP mapping from voice -- per PROJECT.md deferral
- Weight trend during consultation -- pet profile only
