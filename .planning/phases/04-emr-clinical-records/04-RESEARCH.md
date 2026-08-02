# Phase 4: EMR & Clinical Records - Research

**Researched:** 2026-04-19
**Domain:** Veterinary EMR, SOAP notes, drug database, voice-to-text, PDF generation, audit trails
**Confidence:** HIGH (core stack verified; domain patterns well-established)

## Summary

Phase 4 is the clinical heart of Breeyo -- it transforms a queue management tool into a full veterinary practice management system. The phase spans eight interconnected domains: SOAP note forms, veterinary drug database, voice-to-text transcription, PDF document generation, file attachments, audit trails, vaccination/deworming tracking, and dosage safety. Each domain has mature library support within the Expo/React Native ecosystem, but the veterinary drug database is the one area requiring significant manual data curation since no open-source, India-specific veterinary drug database exists.

The most important architectural insight is that the consultation screen is a single long-lived form with auto-saving drafts -- not a multi-page wizard. The accordion pattern (from Phase 2 design system) drives the UX: collapsible sections for Vitals, Subjective, Objective, Assessment, Plan, Prescriptions, and Files. Voice-to-text uses `expo-speech-recognition` with device-native STT as the primary mechanism (free, offline-capable) and Google Cloud Speech-to-Text V2 as the cloud option for higher Hindi accuracy. PDF generation uses Expo's built-in `expo-print` (printToFileAsync) which converts HTML templates to PDF files -- no native module installation required. The audit trail extends Phase 1's append-only pattern using PostgreSQL triggers on all EMR tables.

**Primary recommendation:** Build the consultation screen as an accordion-based single-page form with auto-save, use `expo-speech-recognition` for device-native STT with cloud API fallback, use `expo-print` for PDF generation from HTML templates, hand-curate the veterinary drug database from CDSCO and public veterinary pharmacology sources, and extend Phase 1's PostgreSQL trigger-based audit trail to all EMR tables.

## Project Constraints (from CLAUDE.md)

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries
- NEVER save to root folder -- use /src, /tests, /docs, /config, /scripts, /examples
- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- Build: `npm run build`, Test: `npm test`, Lint: `npm run lint`

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Accordion-based consultation screen layout -- collapsible sections on one page. Fixed order: Vitals -> Subjective -> Objective -> Assessment -> Plan -> Prescriptions -> Files
- **D-02:** Compact sticky patient banner at top -- pet name, species, age, weight, owner name + phone
- **D-03:** Visit reason chip + behavioral warnings/allergies from pet profile shown below patient banner
- **D-04:** Explicit "End Consultation" button to finalize -- marks queue entry as Done, saves all EMR data, returns to queue
- **D-05:** Auto-save drafts every few seconds. Draft indicator shown. "End Consultation" still required to finalize and lock the record
- **D-06:** One active consultation per patient at a time -- concurrent edit lock
- **D-07:** Side panel / bottom sheet for viewing previous consultations during current one
- **D-08:** Summary review screen before finalizing
- **D-09:** Optional follow-up reminder at End Consultation
- **D-10:** Floating quick-action bar at bottom -- icons: Mic, Rx, Camera, Timer
- **D-11:** 3 visit type templates: General Consultation, Surgery, Vaccination
- **D-12:** System templates only for Beta -- no user-created custom templates
- **D-13:** Auto-track consultation duration
- **D-14:** Vitals auto-update pet profile weight
- **D-15:** Structured + free-text hybrid for all SOAP sections -- quick-pick chips + text areas
- **D-16:** Template-specific quick-pick chips
- **D-17:** Pre-loaded chips + vet can add custom terms
- **D-18:** Subjective section: "Owner reports" + "History" sub-sections
- **D-19:** Objective section: body system physical exam checklist (Eyes, Ears, Skin/Coat, Oral, Lymph nodes, Abdomen, Heart/Lungs, Musculoskeletal) with Normal/Abnormal toggle and expandable sub-findings
- **D-20:** Assessment section: free text only
- **D-21:** Plan section: structured action items as chips + free-text
- **D-22:** Core vitals: weight, temperature, heart rate, respiratory rate
- **D-23:** Species-aware normal ranges for vitals with red/orange highlighting
- **D-24:** Weight trend chart on pet profile page only
- **D-25:** Searchable drug database pre-seeded with 200-300 common Indian veterinary drugs
- **D-26:** Species-specific dosage suggestions based on pet weight
- **D-27:** Formulation-aware drug database (tablet, suspension, injectable, drops)
- **D-28:** Soft dosage warning if vet enters dose outside species-specific range
- **D-29:** Add medications one at a time with list display
- **D-30:** Route of administration dropdown
- **D-31:** Quick-select common frequencies as chips
- **D-32:** Flexible duration options dropdown
- **D-33:** Dispensed vs Prescribed flag per medication
- **D-34:** Prescription data model prepared for inventory linking (nullable inventory_item_id)
- **D-35:** Clinical + owner-friendly dosage language auto-generation
- **D-36:** "Repeat Rx" from past visits
- **D-37:** General Rx notes field at bottom
- **D-38:** No drug interaction checks for Beta
- **D-39:** No favorite prescriptions for Beta
- **D-40:** Vaccination template: vaccine name, batch/lot, manufacturer, expiry, next due date
- **D-41:** Printable vaccination certificate PDF
- **D-42:** Vaccination tracker per pet with auto-calculated next due dates
- **D-43:** Deworming tracker similar to vaccination tracker
- **D-44:** Preventive care summary card on pet profile
- **D-45:** Shareable consultation summary: Owner summary + Clinical record formats
- **D-46:** Branded PDF header on all documents (clinic logo, name, address, phone)
- **D-47:** Standalone prescription pad PDF
- **D-48:** English-only PDFs for Beta
- **D-49:** Optional referral section in consultation
- **D-50:** Care Instructions text field per consultation with quick-picks
- **D-51:** Mic button on floating quick-action bar
- **D-52:** Record-then-transcribe mode
- **D-53:** English + Hindi auto-detect (Hinglish support)
- **D-54:** Cloud speech API with offline fallback
- **D-55:** No recording duration limit
- **D-56:** Basic medical term auto-formatting post-transcription
- **D-57:** Voice for SOAP text fields only
- **D-58:** Compact list view for history timeline
- **D-59:** Camera + gallery + file picker for attachments
- **D-60:** Attachment metadata: file type dropdown + optional text description
- **D-61:** File limits: 10MB per file, JPEG/PNG/PDF/DICOM, auto-compress above 5MB, max 10 per consultation
- **D-62:** All EMR changes audit-trailed -- extends Phase 1 immutable append-only pattern

### Claude's Discretion
- Consultation entry flow from queue (auto-open EMR on "Call Next" vs tap to open)
- Resume flow when vet leaves consultation in progress (banner vs In Consult card)
- Post-finalization editability approach (addendum-only vs full edit with audit trail)
- Additional vitals beyond 4 core (e.g., body condition score BCS)
- Surgery template specific fields (structured surgical fields vs extended SOAP hints)
- Recording UI indicator during voice dictation (overlay vs minimal)
- SOAP quick-pick chips collapsibility behavior
- N/A toggle per SOAP section for quick visits
- Drug database maintenance and admin controls

### Deferred Ideas (OUT OF SCOPE)
- Custom consultation templates (user-created) -- post-Beta
- Drug interaction checking -- deferred due to complexity and liability
- Favorite/saved prescriptions -- "Repeat Rx" covers this for Beta
- Hindi PDFs -- v2 scope
- Structured diagnosis codes in Assessment -- free text only for Beta
- AI-assisted SOAP mapping from voice -- deferred
- Weight trend chart during consultation -- pet profile page only
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EMR-01 | User can create SOAP notes (Subjective, Objective, Assessment, Plan) for a consultation | Accordion-based form pattern with quick-pick chips + free-text; AccordionItem component from Phase 2 design system; Zustand for form state with auto-save |
| EMR-02 | User can record vitals (weight, temperature, heart rate, respiratory rate) | Species-aware normal ranges data model; vitals section at top of accordion; auto-update pet profile weight via API |
| EMR-03 | User can write prescriptions with drug name, dosage, frequency, and duration | Pre-seeded drug database with 200-300 Indian vet drugs; species-specific dosage ranges; formulation-aware search; soft warnings for out-of-range doses |
| EMR-04 | User can view complete medical history timeline for any pet | Compact list view extending Phase 3 pet profile; consultation detail expansion; bottom sheet for history during active consultation |
| EMR-05 | User can use voice-to-text to transcribe clinical notes into a text field | `expo-speech-recognition` for device-native STT; Google Cloud Speech-to-Text V2 for cloud fallback with Hindi/English; record-then-transcribe pattern |
| EMR-06 | User can attach lab/imaging result files to a consultation record | `expo-image-picker`, `expo-document-picker`, `expo-image-manipulator` for capture/compress; S3 presigned URL upload; metadata model for file type classification |
| EMR-07 | All EMR changes are audit-trailed (who changed what, when) | PostgreSQL trigger-based append-only audit log extending Phase 1 pattern (D-35/D-36); captures field-level changes with actor, timestamp, old/new values |
</phase_requirements>

## Standard Stack

### Core (Phase 4 Specific)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-speech-recognition | 3.1.2 | Device-native speech-to-text | Wraps iOS SFSpeechRecognizer + Android SpeechRecognizer; Expo config plugin handles permissions; supports on-device recognition, interim results, language hints |
| expo-print | 55.0.13 | HTML-to-PDF generation | Built-in Expo SDK; `printToFileAsync` converts HTML to PDF in app cache; no native module installation; supports page sizing and margins |
| expo-sharing | 55.0.18 | Share PDFs via WhatsApp/email | Built-in Expo SDK; opens native share sheet for generated PDF files |
| expo-image-picker | 55.0.18 | Camera + gallery for attachments | Built-in Expo SDK; capture photos or select from gallery; supports quality/compression options |
| expo-document-picker | 55.0.13 | File picker for PDFs/DICOM | Built-in Expo SDK; access device file system for document selection |
| expo-image-manipulator | 55.0.15 | Image compression before upload | Built-in Expo SDK; resize and compress images on-device before S3 upload |
| expo-file-system | 55.0.16 | File operations and upload | Built-in Expo SDK; read file info, manage cache, upload via `uploadAsync` |
| expo-camera | 55.0.15 | Direct camera access for attachments | Built-in Expo SDK; quick-action camera capture from floating bar |

### Supporting (From Project Stack)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 | Schema validation for EMR forms | Validate all consultation data, prescription entries, vitals ranges at input boundaries |
| date-fns | 4.1.0 | Date calculations for vaccination schedules | Next-due-date computation, duration formatting, IST timezone handling |
| @tanstack/react-query | 5+ | Server state for consultation data | Fetch/cache consultations, medical history, drug search results; optimistic updates for auto-save |
| zustand | 5+ | Client-side form state | Consultation draft state, active section tracking, voice recording state, prescription list management |
| socket.io-client | 4+ | Real-time consultation lock | Broadcast consultation lock/unlock events; notify other users of active consultations |

### Cloud API (Optional Enhancement)

| Service | Purpose | When to Use | Cost |
|---------|---------|-------------|------|
| Google Cloud Speech-to-Text V2 (Chirp) | Hindi/English cloud transcription | When device-native STT accuracy is insufficient for Hindi/Hinglish | ~$0.006/15s for short audio; free tier: 60 min/month |
| Sarvam AI Speech-to-Text | India-optimized Hindi STT | Alternative to Google if Hindi accuracy is priority | Rs 30/hour (~$0.36/hour) |
| AWS S3 (Mumbai region) | File attachment storage | All consultation file attachments | ~$0.023/GB/month |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-speech-recognition | @react-native-voice/voice | Older library, less Expo-native integration, but more battle-tested |
| expo-print (HTML-to-PDF) | react-native-html-to-pdf | More features but requires dev client build; expo-print is simpler and built-in |
| expo-print | Server-side PDF generation | More consistent output but adds server dependency and latency; not needed for Beta scale |
| Google Cloud STT | Reverie AI or Sarvam AI | Better Hindi accuracy from India-native providers, but smaller ecosystem and potential availability risk |
| S3 presigned URLs | Direct API upload | Presigned URLs offload bandwidth from API server; standard pattern for mobile file uploads |

**Installation:**
```bash
# All Expo SDK packages (installed via expo)
npx expo install expo-speech-recognition expo-print expo-sharing expo-image-picker expo-document-picker expo-image-manipulator expo-file-system expo-camera

# Already in project from prior phases
# zod, date-fns, @tanstack/react-query, zustand, socket.io-client
```

**Version verification:** All Expo SDK packages verified at v55.x (Expo SDK 55, current as of 2026-04-19). Non-Expo packages verified against npm registry same date.

## Architecture Patterns

### Recommended Project Structure

```
packages/shared/src/
  types/
    emr.ts                    # Consultation, SOAP, Vitals, Prescription types
    drug.ts                   # Drug, Formulation, DosageRange types
    vaccination.ts            # Vaccination, Deworming, PreventiveCare types
    attachment.ts             # FileAttachment, AttachmentMetadata types
  validators/
    emr.validators.ts         # Zod schemas for consultation data
    prescription.validators.ts # Zod schemas for prescription entries
    vitals.validators.ts      # Zod schemas with species-aware range checks
  constants/
    vitals-ranges.ts          # Normal ranges per species per vital
    quick-pick-chips.ts       # Template-specific chip definitions
    vaccination-intervals.ts  # Standard vaccination schedules per species
    frequencies.ts            # Common medication frequencies
    routes.ts                 # Routes of administration
    durations.ts              # Duration options
    body-systems.ts           # Physical exam checklist systems + sub-findings

apps/api/src/
  modules/emr/
    emr.routes.ts             # Fastify route definitions
    emr.controller.ts         # Request handlers
    emr.service.ts            # Business logic
    emr.repository.ts         # Prisma queries
    consultation-lock.service.ts  # Concurrent edit prevention
  modules/drug/
    drug.routes.ts
    drug.controller.ts
    drug.service.ts
    drug.repository.ts
    drug-seed.ts              # Pre-seeded drug database (200-300 drugs)
  modules/attachment/
    attachment.routes.ts
    attachment.controller.ts
    attachment.service.ts     # S3 presigned URL generation
  modules/audit/
    audit.service.ts          # Shared audit trail service
    audit.triggers.sql        # PostgreSQL trigger definitions

apps/mobile/src/
  features/consultation/
    screens/
      ConsultationScreen.tsx      # Main accordion-based consultation
      ConsultationReviewScreen.tsx # Summary before finalization
    components/
      PatientBanner.tsx           # Sticky top banner
      VitalsSection.tsx           # Vitals form with range indicators
      SubjectiveSection.tsx       # Owner reports + history
      ObjectiveSection.tsx        # Physical exam checklist
      AssessmentSection.tsx       # Free-text assessment
      PlanSection.tsx             # Action items + free-text
      PrescriptionSection.tsx     # Drug search + medication list
      FilesSection.tsx            # Attachments gallery
      FloatingActionBar.tsx       # Mic, Rx, Camera, Timer buttons
      QuickPickChips.tsx          # Reusable chip selector
      BodySystemChecklist.tsx     # Physical exam system-by-system
    hooks/
      useConsultationDraft.ts     # Auto-save logic with Zustand
      useConsultationLock.ts      # WebSocket-based locking
      useVoiceTranscription.ts    # STT integration
      useDrugSearch.ts            # Debounced drug search
      useDosageCalculation.ts     # Weight-based dosage computation
  features/prescription/
    components/
      DrugSearchModal.tsx         # Searchable drug picker
      MedicationCard.tsx          # Individual medication display
      DosageWarning.tsx           # Soft warning component
      RepeatRxSheet.tsx           # Bottom sheet for repeating past Rx
  features/pdf/
    templates/
      consultation-summary.ts     # HTML template for owner summary
      clinical-record.ts          # HTML template for clinical record
      prescription-pad.ts         # HTML template for prescription pad
      vaccination-certificate.ts  # HTML template for vaccination cert
    hooks/
      useGeneratePdf.ts           # PDF generation + sharing logic
  features/attachment/
    components/
      AttachmentGallery.tsx       # File list with thumbnails
      AttachmentPicker.tsx        # Camera/gallery/file picker
    hooks/
      useFileUpload.ts            # S3 presigned URL upload logic
  features/history/
    components/
      MedicalTimeline.tsx         # Compact visit history list
      HistoryBottomSheet.tsx      # History overlay during consultation
      VaccinationCard.tsx         # Vaccination status display
      DewormingCard.tsx           # Deworming status display
      PreventiveCareCard.tsx      # Combined preventive care summary
      WeightTrendChart.tsx        # Weight over time on pet profile
```

### Pattern 1: Accordion-Based Consultation Form

**What:** Single-page form with collapsible sections managed by Zustand store. Each section is an AccordionItem (Phase 2 component) containing section-specific content. Auto-save fires on a debounced timer after any field change.

**When to use:** The main consultation screen. This is the central UI of Phase 4.

**Example:**
```typescript
// Source: Architecture pattern based on Phase 2 AccordionItem + Phase 4 decisions
interface ConsultationDraftState {
  consultationId: string;
  visitType: 'general' | 'surgery' | 'vaccination';
  expandedSections: Set<string>;
  vitals: VitalsData;
  subjective: SubjectiveData;
  objective: ObjectiveData;
  assessment: string;
  plan: PlanData;
  prescriptions: PrescriptionItem[];
  attachments: AttachmentMeta[];
  careInstructions: string;
  referral: ReferralData | null;
  isDirty: boolean;
  lastSavedAt: Date | null;
  toggleSection: (section: string) => void;
  updateField: <K extends keyof ConsultationDraftState>(
    field: K,
    value: ConsultationDraftState[K]
  ) => void;
  reset: () => void;
}

// Auto-save hook
function useAutoSave(consultationId: string, draft: ConsultationDraftState) {
  const saveMutation = useMutation({
    mutationFn: (data: ConsultationDraftPayload) =>
      api.patch(`/api/v1/consultations/${consultationId}/draft`, data),
  });

  useEffect(() => {
    if (!draft.isDirty) return;
    const timer = setTimeout(() => {
      saveMutation.mutate(serializeDraft(draft));
    }, 3000); // 3-second debounce per D-05
    return () => clearTimeout(timer);
  }, [draft, draft.isDirty]);
}
```

### Pattern 2: Drug Search with Dosage Safety

**What:** Debounced search against pre-seeded drug database. Results filtered by formulation, with species-specific dosage ranges shown. Soft warning when entered dose falls outside recommended mg/kg range.

**When to use:** Prescription section of the consultation form.

**Example:**
```typescript
// Source: Pattern based on D-25 through D-28 decisions
interface DrugEntry {
  id: string;
  name: string;
  genericName: string;
  category: 'antibiotic' | 'nsaid' | 'antiparasitic' | 'vaccine' | 'other';
  formulations: DrugFormulation[];
}

interface DrugFormulation {
  id: string;
  drugId: string;
  form: 'tablet' | 'suspension' | 'injectable' | 'drops' | 'ointment' | 'powder';
  strength: string;        // e.g., "250mg", "50mg/ml"
  strengthValue: number;   // numeric value for calculation
  strengthUnit: string;    // "mg", "mg/ml", "IU"
}

interface SpeciesDosage {
  drugId: string;
  species: 'dog' | 'cat' | 'bird' | 'rabbit';
  minDoseMgPerKg: number;
  maxDoseMgPerKg: number;
  isFixedDose: boolean;    // some cat drugs are per-animal, not per-kg
  fixedDoseMin?: number;
  fixedDoseMax?: number;
  notes: string | null;    // "Contraindicated in cats", etc.
}

// Dosage validation
function validateDosage(
  enteredDoseMg: number,
  petWeightKg: number,
  speciesDosage: SpeciesDosage
): DosageWarning | null {
  if (speciesDosage.isFixedDose) {
    if (
      enteredDoseMg < (speciesDosage.fixedDoseMin ?? 0) ||
      enteredDoseMg > (speciesDosage.fixedDoseMax ?? Infinity)
    ) {
      return {
        level: 'warning',
        message: `Recommended: ${speciesDosage.fixedDoseMin}-${speciesDosage.fixedDoseMax}mg per animal`,
        enteredDose: enteredDoseMg,
      };
    }
    return null;
  }

  const dosePerKg = enteredDoseMg / petWeightKg;
  if (
    dosePerKg < speciesDosage.minDoseMgPerKg ||
    dosePerKg > speciesDosage.maxDoseMgPerKg
  ) {
    return {
      level: 'warning',
      message: `Recommended: ${speciesDosage.minDoseMgPerKg}-${speciesDosage.maxDoseMgPerKg} mg/kg (${(speciesDosage.minDoseMgPerKg * petWeightKg).toFixed(1)}-${(speciesDosage.maxDoseMgPerKg * petWeightKg).toFixed(1)}mg for ${petWeightKg}kg)`,
      enteredDosePerKg: dosePerKg,
    };
  }
  return null;
}
```

### Pattern 3: Voice-to-Text Integration

**What:** Two-tier STT: device-native (free, offline-capable) as primary, cloud API as optional enhancement. Record-then-transcribe pattern -- vet presses record, speaks, presses stop, result inserted into active text field.

**When to use:** Mic button in floating quick-action bar for SOAP text fields.

**Example:**
```typescript
// Source: expo-speech-recognition API + D-51 through D-57 decisions
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

function useVoiceTranscription(onResult: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    setTranscript(text);
    if (event.isFinal) {
      const formatted = formatMedicalTerms(text);
      onResult(formatted);
      setIsRecording(false);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.warn('STT error:', event.error);
    setIsRecording(false);
  });

  const startRecording = async () => {
    const { granted } = await ExpoSpeechRecognitionModule
      .requestPermissionsAsync();
    if (!granted) return;

    setIsRecording(true);
    ExpoSpeechRecognitionModule.start({
      lang: 'hi-IN',          // Hindi as primary; handles English within Hindi
      interimResults: true,
      continuous: true,        // No duration limit (D-55)
      requiresOnDeviceRecognition: false, // Allow cloud if available
      contextualStrings: [
        'temperature', 'heart rate', 'respiratory rate',
        'amoxicillin', 'meloxicam', 'ivermectin',
        // Add common vet terms for hint vocabulary
      ],
    });
  };

  const stopRecording = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  return { isRecording, transcript, startRecording, stopRecording };
}

// Basic medical term formatting (D-56)
function formatMedicalTerms(text: string): string {
  const drugNames = ['amoxicillin', 'meloxicam', 'ivermectin', 'metronidazole'];
  let formatted = text;
  for (const drug of drugNames) {
    const regex = new RegExp(`\\b${drug}\\b`, 'gi');
    formatted = formatted.replace(
      regex,
      drug.charAt(0).toUpperCase() + drug.slice(1)
    );
  }
  // Format temperature/weight units
  formatted = formatted.replace(/(\d+)\s*degree[s]?\s*(celsius|c)\b/gi, '$1\u00B0C');
  formatted = formatted.replace(/(\d+)\s*kg\b/gi, '$1 kg');
  return formatted;
}
```

### Pattern 4: HTML-to-PDF Generation

**What:** Build PDF documents from HTML templates using `expo-print.printToFileAsync`. Templates are TypeScript functions that return HTML strings with inline CSS. Share via `expo-sharing`.

**When to use:** Consultation summary, prescription pad, vaccination certificate generation.

**Example:**
```typescript
// Source: expo-print API + D-45 through D-48 decisions
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

function buildPrescriptionPadHtml(
  clinic: ClinicInfo,
  consultation: ConsultationData,
  prescriptions: PrescriptionItem[]
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 20mm 15mm; }
        body { font-family: 'Helvetica', sans-serif; font-size: 12pt; color: #1C1B1F; }
        .header { text-align: center; border-bottom: 2px solid #2E7D32; padding-bottom: 8px; margin-bottom: 16px; }
        .clinic-name { font-size: 18pt; font-weight: 500; color: #2E7D32; }
        .clinic-info { font-size: 9pt; color: #49454F; }
        .patient-info { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 10pt; }
        .rx-symbol { font-size: 16pt; font-weight: 500; margin-bottom: 8px; }
        .medication { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #CAC4D0; }
        .drug-name { font-weight: 500; font-size: 12pt; }
        .dosage-friendly { font-size: 11pt; color: #49454F; margin-top: 4px; }
        .footer { position: fixed; bottom: 0; width: 100%; font-size: 9pt; color: #49454F; border-top: 1px solid #CAC4D0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${clinic.logoBase64 ? `<img src="data:image/png;base64,${clinic.logoBase64}" height="40" />` : ''}
        <div class="clinic-name">${clinic.name}</div>
        <div class="clinic-info">${clinic.address} | ${clinic.phone}</div>
      </div>
      <div class="patient-info">
        <div><strong>${consultation.petName}</strong> (${consultation.species})</div>
        <div>Owner: ${consultation.ownerName}</div>
        <div>Date: ${formatDate(consultation.date)}</div>
      </div>
      <div class="rx-symbol">Rx</div>
      ${prescriptions.map((rx, i) => `
        <div class="medication">
          <div class="drug-name">${i + 1}. ${rx.drugName} (${rx.formulation}) - ${rx.strength}</div>
          <div class="dosage-friendly">${rx.ownerFriendlyInstructions}</div>
          <div style="font-size: 9pt; color: #79747E;">Route: ${rx.route} | ${rx.dispensed ? 'Dispensed' : 'Prescribed'}</div>
        </div>
      `).join('')}
      ${consultation.rxNotes ? `<div style="margin-top: 16px;"><strong>Notes:</strong> ${consultation.rxNotes}</div>` : ''}
      <div class="footer">
        <div>${consultation.vetName} | Lic: ${consultation.vetLicenseNumber}</div>
      </div>
    </body>
    </html>
  `;
}

async function generateAndSharePdf(html: string, filename: string) {
  const { uri } = await Print.printToFileAsync({ html });
  // Rename from cache to meaningful filename
  const pdfUri = `${FileSystem.cacheDirectory}${filename}.pdf`;
  await FileSystem.moveAsync({ from: uri, to: pdfUri });
  await Sharing.shareAsync(pdfUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${filename}`,
    UTI: 'com.adobe.pdf',
  });
}
```

### Pattern 5: PostgreSQL Audit Trail Triggers

**What:** Immutable append-only audit log using PostgreSQL triggers. Every INSERT, UPDATE, DELETE on EMR tables writes a record to `audit_log` with actor, action, table, row ID, old values, new values, and timestamp.

**When to use:** All EMR tables -- consultations, vitals, prescriptions, attachments, vaccination records.

**Example:**
```sql
-- Source: Phase 1 audit pattern (D-35/D-36) extended for EMR
-- Audit log table (created in Phase 1, shared across all modules)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id UUID NOT NULL REFERENCES users(id),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability: revoke UPDATE and DELETE on audit_log
REVOKE UPDATE, DELETE ON audit_log FROM app_role;

-- Index for querying audit trail by record
CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_log_clinic ON audit_log(clinic_id, created_at DESC);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, clinic_id, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT',
      current_setting('app.current_user_id')::UUID,
      current_setting('app.current_clinic_id')::UUID,
      to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, clinic_id, old_values, new_values, changed_fields)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE',
      current_setting('app.current_user_id')::UUID,
      current_setting('app.current_clinic_id')::UUID,
      to_jsonb(OLD), to_jsonb(NEW),
      ARRAY(SELECT key FROM jsonb_each(to_jsonb(OLD))
            WHERE to_jsonb(OLD) -> key IS DISTINCT FROM to_jsonb(NEW) -> key));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, actor_id, clinic_id, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE',
      current_setting('app.current_user_id')::UUID,
      current_setting('app.current_clinic_id')::UUID,
      to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply to all EMR tables
CREATE TRIGGER consultation_audit AFTER INSERT OR UPDATE OR DELETE
  ON consultations FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER prescription_audit AFTER INSERT OR UPDATE OR DELETE
  ON prescriptions FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER vitals_audit AFTER INSERT OR UPDATE OR DELETE
  ON vitals FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER attachment_audit AFTER INSERT OR UPDATE OR DELETE
  ON consultation_attachments FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER vaccination_audit AFTER INSERT OR UPDATE OR DELETE
  ON vaccination_records FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### Anti-Patterns to Avoid

- **Multi-page wizard for consultation:** The consultation is NOT a wizard. It is one scrollable page with accordion sections. Vets jump between sections non-linearly (e.g., fill vitals, skip to prescriptions, come back to assessment). A wizard forces linear flow that fights clinical workflow.
- **Client-side audit logging:** Audit trail MUST be server-side in PostgreSQL triggers. Client-side logging can be bypassed, missed on crash, or manipulated. Medical records demand server-enforced immutability.
- **Real-time character-by-character auto-save:** Auto-save should be debounced (3 seconds after last change), not on every keystroke. Mid-range Android devices will struggle with per-keystroke API calls during active typing.
- **Storing files in PostgreSQL:** Store file metadata in PostgreSQL, actual files in S3. Binary blobs in the database degrade query performance and backup times.
- **Hardcoding drug data in frontend:** Drug data lives in the database, queried via API. Frontend caches search results but does not contain the full drug list. This allows updates without app releases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speech-to-text | Custom audio recording + cloud API integration from scratch | `expo-speech-recognition` wrapping native platform STT | Platform STT handles audio capture, noise cancellation, language models; months of work to replicate |
| PDF generation | Custom PDF byte-level construction or server-side rendering | `expo-print` (printToFileAsync with HTML templates) | HTML/CSS is a well-known layout language; expo-print delegates to native WebView PDF rendering |
| Image compression | Manual JPEG quality reduction or pixel manipulation | `expo-image-manipulator` | Native-optimized compression handles EXIF rotation, format conversion, quality settings |
| File upload to S3 | Custom multipart upload, progress tracking, retry logic | S3 presigned URLs with `expo-file-system.uploadAsync` | Presigned URLs handle auth, S3 handles storage; uploadAsync provides progress callbacks |
| Dosage calculation | Free-form text-only dosage entry | Structured dosage model with species-specific mg/kg ranges and soft validation | Dosage errors are the highest-liability risk in vet PMS; structured validation catches common mistakes |
| Vaccination schedules | Ad-hoc date entry for next due | Pre-defined vaccination interval constants with auto-calculation | Standard intervals (rabies annual, DHPPiL boosters) are well-established; manual date entry invites errors |
| Audit trail | Application-level logging or middleware-based audit | PostgreSQL triggers on tables | Triggers fire regardless of how data is modified (API, migration, direct query); cannot be bypassed by application bugs |
| Drug database | Empty database requiring manual data entry by each clinic | Pre-seeded database from CDSCO list + veterinary pharmacology sources | Vets expect drugs to be there from day one; empty database is a deal-breaker for adoption |

**Key insight:** The drug database is the only component that requires significant manual curation. Every other domain has mature library support. Budget substantial time for drug data preparation and validation.

## Common Pitfalls

### Pitfall 1: Auto-Save Conflicts with Finalization

**What goes wrong:** Auto-save creates a race condition where a save fires at the same moment the vet taps "End Consultation". The finalization may save stale data, or the auto-save may overwrite the finalization status.
**Why it happens:** Debounced timers and user actions are independent; without coordination, they can fire simultaneously.
**How to avoid:** When "End Consultation" is tapped: (1) cancel any pending auto-save timer, (2) save the current draft synchronously, (3) then finalize. Use a mutex/flag in the Zustand store: `isFinalizing: boolean`.
**Warning signs:** Consultations show as "draft" after vet confirms finalization; finalized records missing last-second changes.

### Pitfall 2: Hindi Speech-to-Text Accuracy on Mid-Range Devices

**What goes wrong:** Device-native STT on mid-range Android phones has poor Hindi recognition accuracy, especially for medical terminology. Vets speak Hinglish (mixed Hindi/English) which confuses language-specific models.
**Why it happens:** On-device models are optimized for the device's primary language; medical vocabulary is not in the training data; Hinglish is a code-switching pattern that single-language models handle poorly.
**How to avoid:** (1) Set `lang: 'hi-IN'` as primary -- Hindi models on Android handle English words within Hindi better than the reverse. (2) Provide `contextualStrings` with common drug names and medical terms. (3) Clearly communicate to users that voice transcription is "best effort" and needs review. (4) Plan for cloud API upgrade path for clinics that need better accuracy.
**Warning signs:** Transcription output is gibberish for Hindi speakers; drug names consistently misspelled; vet abandons voice feature.

### Pitfall 3: Consultation Lock Stale After App Crash

**What goes wrong:** Vet opens consultation (acquires lock), app crashes or phone dies, lock is never released. Other vets see "Dr. X is currently consulting" indefinitely.
**Why it happens:** Client-side lock release depends on clean app shutdown; crashes bypass all cleanup code.
**How to avoid:** (1) Use a lock with TTL (e.g., 5-minute expiry). (2) Client sends heartbeat every 60 seconds to renew lock. (3) If heartbeat stops, lock auto-expires. (4) When a vet tries to open a locked consultation, check lock freshness; if stale (>5 min since last heartbeat), allow override with warning.
**Warning signs:** Multiple "consultation locked" complaints from clinics where the locking vet has already left for the day.

### Pitfall 4: PDF Image Handling on iOS

**What goes wrong:** Clinic logo or attached images don't render in generated PDFs on iOS.
**Why it happens:** `expo-print.printToFileAsync` uses WKWebView on iOS, which does not support loading local file URLs in HTML. Images referenced as `file://...` paths will not render.
**How to avoid:** Convert all images to base64 data URIs before embedding in HTML templates. For clinic logos, store the base64 version alongside the file URL. For consultation attachments in PDFs, use thumbnails converted to base64.
**Warning signs:** PDFs show broken image icons on iOS but work fine on Android.

### Pitfall 5: Drug Database Search Performance

**What goes wrong:** Searching 300 drugs with debounced keystrokes feels slow on mid-range phones, especially if the query hits the API on every change.
**Why it happens:** Network round-trip for each keystroke, even debounced, adds 200-500ms latency per query. Database query on top of that.
**How to avoid:** (1) Load the full drug list into client-side cache on app start (300 entries is ~50KB -- trivially cacheable). (2) Search client-side with a fuzzy match algorithm (simple `includes` or Levenshtein distance). (3) Only hit the API if the drug is not found locally (for future updates). Use React Query's `staleTime: Infinity` for the drug list.
**Warning signs:** Noticeable lag between typing and search results appearing; vets skip drug search and type names manually.

### Pitfall 6: Vaccination Interval Edge Cases

**What goes wrong:** Auto-calculated "next due" dates don't account for puppies vs adults, or first dose vs booster intervals.
**Why it happens:** Vaccination intervals differ by age bracket (puppy series every 2-4 weeks, adult boosters annually or every 3 years). A single interval per vaccine is insufficient.
**How to avoid:** Model vaccination intervals with age-dependent rules:
```typescript
interface VaccinationInterval {
  vaccineName: string;
  species: string;
  intervalDays: number;
  minAgeDays: number;     // Applies when pet age >= this
  maxAgeDays: number | null; // Applies when pet age < this (null = no upper bound)
  isBooster: boolean;
}
```
**Warning signs:** Puppies getting 1-year intervals instead of 2-4 week intervals; adult dogs getting puppy schedules.

### Pitfall 7: Audit Trail Performance Impact

**What goes wrong:** Audit triggers on every EMR table slow down write operations, especially for auto-save which fires every 3 seconds during a consultation.
**Why it happens:** Each auto-save generates an audit log entry with full JSONB snapshot of old and new values.
**How to avoid:** (1) Auto-save writes to a `consultation_drafts` table that does NOT have audit triggers. (2) Audit triggers only on the finalized `consultations` table and its related tables. (3) When consultation is finalized, draft is copied to the audited table. Draft changes are not individually audited -- only the final state matters.
**Warning signs:** Auto-save latency increases as consultation gets longer; database write queue backs up.

## Code Examples

### Prisma Schema for EMR (Core Tables)

```prisma
// Source: Phase 4 data model based on D-01 through D-62 decisions

model Consultation {
  id              String   @id @default(uuid())
  clinicId        String   @map("clinic_id")
  petId           String   @map("pet_id")
  vetId           String   @map("vet_id")
  queueEntryId    String?  @map("queue_entry_id")
  visitType       String   @default("general") // general, surgery, vaccination
  status          String   @default("draft")    // draft, finalized
  startedAt       DateTime @default(now()) @map("started_at")
  finalizedAt     DateTime? @map("finalized_at")
  durationMinutes Int?     @map("duration_minutes")

  // SOAP sections (JSONB for flexibility)
  subjective      Json?    // { ownerReports: string, history: string, chips: string[] }
  objective       Json?    // { bodySystems: BodySystemExam[], notes: string }
  assessment      String?  // Free text (D-20)
  plan            Json?    // { actionItems: string[], freeText: string }

  // Additional sections
  careInstructions String? @map("care_instructions")
  referral        Json?    // { specialistType, reason, urgency } (D-49)
  rxNotes         String?  @map("rx_notes") // General Rx notes (D-37)

  // Follow-up
  followUpDate    DateTime? @map("follow_up_date")
  followUpReason  String?   @map("follow_up_reason")

  // Relations
  clinic          Clinic   @relation(fields: [clinicId], references: [id])
  pet             Pet      @relation(fields: [petId], references: [id])
  vet             User     @relation(fields: [vetId], references: [id])
  vitals          Vitals?
  prescriptions   Prescription[]
  attachments     ConsultationAttachment[]

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@map("consultations")
}

model Vitals {
  id              String   @id @default(uuid())
  consultationId  String   @unique @map("consultation_id")
  weightKg        Decimal? @map("weight_kg")
  temperatureC    Decimal? @map("temperature_c")
  heartRateBpm    Int?     @map("heart_rate_bpm")
  respiratoryRate Int?     @map("respiratory_rate")

  consultation    Consultation @relation(fields: [consultationId], references: [id])

  @@map("vitals")
}

model Drug {
  id              String   @id @default(uuid())
  name            String   // Brand or common name
  genericName     String   @map("generic_name")
  category        String   // antibiotic, nsaid, antiparasitic, vaccine, etc.
  isActive        Boolean  @default(true) @map("is_active")

  formulations    DrugFormulation[]
  dosageRanges    SpeciesDosage[]

  @@map("drugs")
}

model DrugFormulation {
  id              String   @id @default(uuid())
  drugId          String   @map("drug_id")
  form            String   // tablet, suspension, injectable, drops, ointment
  strength        String   // "250mg", "50mg/ml"
  strengthValue   Decimal  @map("strength_value")
  strengthUnit    String   @map("strength_unit")

  drug            Drug     @relation(fields: [drugId], references: [id])

  @@map("drug_formulations")
}

model SpeciesDosage {
  id              String   @id @default(uuid())
  drugId          String   @map("drug_id")
  species         String   // dog, cat, bird, rabbit
  minDoseMgPerKg  Decimal  @map("min_dose_mg_per_kg")
  maxDoseMgPerKg  Decimal  @map("max_dose_mg_per_kg")
  isFixedDose     Boolean  @default(false) @map("is_fixed_dose")
  fixedDoseMin    Decimal? @map("fixed_dose_min")
  fixedDoseMax    Decimal? @map("fixed_dose_max")
  notes           String?

  drug            Drug     @relation(fields: [drugId], references: [id])

  @@unique([drugId, species])
  @@map("species_dosages")
}

model Prescription {
  id                    String   @id @default(uuid())
  consultationId        String   @map("consultation_id")
  drugId                String?  @map("drug_id")
  drugName              String   @map("drug_name")     // Denormalized for audit
  formulationId         String?  @map("formulation_id")
  formulation           String                          // Denormalized
  strength              String
  dosage                String                          // "250mg" or "5ml"
  dosageMg              Decimal? @map("dosage_mg")      // Numeric for validation
  route                 String                          // Oral, Injectable, etc.
  frequency             String                          // Once daily, etc.
  duration              String                          // 5 days, etc.
  durationDays          Int?     @map("duration_days")
  clinicalInstructions  String?  @map("clinical_instructions")
  ownerInstructions     String?  @map("owner_instructions") // Auto-generated friendly
  dispensed             Boolean  @default(false)
  inventoryItemId       String?  @map("inventory_item_id") // Nullable for Phase 5 (D-34)
  sortOrder             Int      @map("sort_order")

  consultation          Consultation @relation(fields: [consultationId], references: [id])

  @@map("prescriptions")
}

model VaccinationRecord {
  id              String    @id @default(uuid())
  clinicId        String    @map("clinic_id")
  petId           String    @map("pet_id")
  consultationId  String?   @map("consultation_id")
  vaccineName     String    @map("vaccine_name")
  batchNumber     String?   @map("batch_number")
  manufacturer    String?
  expiryDate      DateTime? @map("expiry_date")
  administeredAt  DateTime  @map("administered_at")
  administeredBy  String    @map("administered_by") // vet user ID
  nextDueDate     DateTime? @map("next_due_date")

  clinic          Clinic    @relation(fields: [clinicId], references: [id])
  pet             Pet       @relation(fields: [petId], references: [id])

  @@map("vaccination_records")
}

model DewormingRecord {
  id              String    @id @default(uuid())
  clinicId        String    @map("clinic_id")
  petId           String    @map("pet_id")
  consultationId  String?   @map("consultation_id")
  drugName        String    @map("drug_name")
  administeredAt  DateTime  @map("administered_at")
  administeredBy  String    @map("administered_by")
  nextDueDate     DateTime? @map("next_due_date")

  clinic          Clinic    @relation(fields: [clinicId], references: [id])
  pet             Pet       @relation(fields: [petId], references: [id])

  @@map("deworming_records")
}

model ConsultationAttachment {
  id              String   @id @default(uuid())
  consultationId  String   @map("consultation_id")
  fileType        String   @map("file_type")  // lab_report, xray, ultrasound, ecg, photo, other
  fileName        String   @map("file_name")
  mimeType        String   @map("mime_type")
  fileSizeBytes   Int      @map("file_size_bytes")
  s3Key           String   @map("s3_key")
  s3Url           String?  @map("s3_url")     // Pre-signed URL for access
  thumbnailS3Key  String?  @map("thumbnail_s3_key")
  description     String?
  uploadedBy      String   @map("uploaded_by")
  uploadedAt      DateTime @default(now()) @map("uploaded_at")

  consultation    Consultation @relation(fields: [consultationId], references: [id])

  @@map("consultation_attachments")
}
```

### Vaccination Interval Constants

```typescript
// Source: Indian veterinary vaccination guidelines (vetic.in, Virbac India, WSAVA)
export const VACCINATION_INTERVALS: VaccinationInterval[] = [
  // Dogs - Puppy Series
  { vaccineName: 'DHPPi (Canine Distemper Combo)', species: 'dog',
    intervalDays: 21, minAgeDays: 42, maxAgeDays: 120, isBooster: false },
  { vaccineName: 'DHPPi (Canine Distemper Combo)', species: 'dog',
    intervalDays: 365, minAgeDays: 120, maxAgeDays: null, isBooster: true },
  { vaccineName: 'Anti-Rabies', species: 'dog',
    intervalDays: 365, minAgeDays: 90, maxAgeDays: null, isBooster: false },
  { vaccineName: 'Kennel Cough (Bordetella)', species: 'dog',
    intervalDays: 365, minAgeDays: 112, maxAgeDays: null, isBooster: true },
  { vaccineName: 'Canine Coronavirus', species: 'dog',
    intervalDays: 21, minAgeDays: 42, maxAgeDays: 120, isBooster: false },
  { vaccineName: 'Leptospira', species: 'dog',
    intervalDays: 365, minAgeDays: 56, maxAgeDays: null, isBooster: true },

  // Cats
  { vaccineName: 'FVRCP (Feline Distemper Combo)', species: 'cat',
    intervalDays: 21, minAgeDays: 56, maxAgeDays: 112, isBooster: false },
  { vaccineName: 'FVRCP (Feline Distemper Combo)', species: 'cat',
    intervalDays: 365, minAgeDays: 112, maxAgeDays: null, isBooster: true },
  { vaccineName: 'Anti-Rabies', species: 'cat',
    intervalDays: 365, minAgeDays: 90, maxAgeDays: null, isBooster: false },
  { vaccineName: 'FeLV (Feline Leukemia)', species: 'cat',
    intervalDays: 21, minAgeDays: 56, maxAgeDays: 112, isBooster: false },
];

// Common deworming intervals
export const DEWORMING_INTERVALS = {
  puppy: { intervalDays: 14, minAgeDays: 14, maxAgeDays: 90 },    // Every 2 weeks
  youngDog: { intervalDays: 30, minAgeDays: 90, maxAgeDays: 180 }, // Monthly
  adultDog: { intervalDays: 90, minAgeDays: 180, maxAgeDays: null }, // Every 3 months
  kitten: { intervalDays: 14, minAgeDays: 14, maxAgeDays: 90 },
  adultCat: { intervalDays: 90, minAgeDays: 90, maxAgeDays: null },
};
```

### Species-Aware Vitals Normal Ranges

```typescript
// Source: Standard veterinary reference ranges
export const VITALS_NORMAL_RANGES: Record<string, VitalRanges> = {
  dog: {
    temperatureC: { min: 38.0, max: 39.2, unit: '\u00B0C' },
    heartRateBpm: { min: 60, max: 140, unit: 'bpm' },
    respiratoryRate: { min: 10, max: 30, unit: 'breaths/min' },
  },
  cat: {
    temperatureC: { min: 38.0, max: 39.5, unit: '\u00B0C' },
    heartRateBpm: { min: 140, max: 220, unit: 'bpm' },
    respiratoryRate: { min: 20, max: 30, unit: 'breaths/min' },
  },
  rabbit: {
    temperatureC: { min: 38.5, max: 40.0, unit: '\u00B0C' },
    heartRateBpm: { min: 120, max: 150, unit: 'bpm' },
    respiratoryRate: { min: 30, max: 60, unit: 'breaths/min' },
  },
  bird: {
    temperatureC: { min: 40.0, max: 42.0, unit: '\u00B0C' },
    heartRateBpm: { min: 200, max: 600, unit: 'bpm' },
    respiratoryRate: { min: 15, max: 30, unit: 'breaths/min' },
  },
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @react-native-voice/voice for STT | expo-speech-recognition | 2024-2025 | Native Expo config plugin; better platform integration; on-device recognition support |
| react-native-html-to-pdf | expo-print (printToFileAsync) | Expo SDK 49+ | No additional native module needed; built into Expo SDK; consistent cross-platform behavior |
| Manual S3 SDK integration | Presigned URLs + expo-file-system.uploadAsync | 2024+ | Simpler client code; no AWS SDK on device; better for mobile bandwidth |
| Google Cloud STT V1 | Google Cloud STT V2 (Chirp model) | 2024 | Dramatically better Hindi/Hinglish support; 100+ language models; better noise handling |
| Application-level audit logging | PostgreSQL trigger-based audit | Ongoing best practice | Cannot be bypassed by application bugs; works for any data modification path |

**Deprecated/outdated:**
- `expo-speech` (npm: expo-speech) is text-to-speech (TTS), NOT speech-to-text. Do not confuse them.
- `react-native-pdf-lib` (Hopding) has not been actively maintained; use `expo-print` for generation and `react-native-pdf` for viewing.

## Open Questions

1. **Veterinary Drug Data Source**
   - What we know: CDSCO publishes a list of approved veterinary drugs. Scribd has a "Common Veterinary Drugs in India" document. VetGeni has 739 drugs but is proprietary. Wikipedia has a list of veterinary drugs.
   - What's unclear: No single open-source, machine-readable database of Indian veterinary drugs with species-specific dosage ranges exists. Data will need to be manually curated from multiple sources.
   - Recommendation: Curate initial 200-300 drug seed file from CDSCO approved list + common clinical references. Structure as a JSON seed file that can be loaded via Prisma seed. Plan for a clinical review step where a practicing vet validates the data before Beta launch.

2. **DICOM Viewer on Mobile**
   - What we know: D-61 allows DICOM uploads. DICOM is a complex medical imaging format.
   - What's unclear: Whether a React Native DICOM viewer exists that works in Expo. Most DICOM viewers are web-based (Cornerstone.js) or desktop-only.
   - Recommendation: For Beta, support DICOM file upload and storage only. Display a "DICOM file" placeholder with download option. Do not attempt to render DICOM images inline on mobile. If viewing is needed, use a web-based DICOM viewer (link to web dashboard in Phase 9).

3. **Cloud STT Cost at Scale**
   - What we know: Google Cloud STT costs ~$0.006/15 seconds. Sarvam AI costs Rs 30/hour. Free tiers exist.
   - What's unclear: How much voice transcription a typical vet will use per day, and whether device-native STT is "good enough" to avoid cloud costs entirely.
   - Recommendation: Start with device-native STT only (zero cost). Add cloud API as a future "premium" feature if device-native accuracy proves insufficient. This keeps the Beta cost-efficient per the price sensitivity constraint.

4. **Post-Finalization Editability (Claude's Discretion)**
   - What we know: Medical records need immutability for compliance.
   - What's unclear: Should finalized consultations be editable at all?
   - Recommendation: Use addendum-only model. After finalization, vet can add an addendum (new text appended with timestamp) but cannot modify the original record. This is the standard in human and veterinary EMR systems. The addendum itself is audit-trailed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API server | Yes | 24.13.1 | -- |
| npm | Package management | Yes | 11.8.0 | -- |
| Expo CLI | Mobile build | Yes | 55.0.24 | -- |
| Docker | Local dev (PostgreSQL, Redis) | Yes | 28.3.2 | -- |
| PostgreSQL | Database | Via Docker | 16+ (Docker image) | -- |
| Redis | Caching, consultation lock | Via Docker | 7+ (Docker image) | -- |
| AWS S3 | File attachment storage | External service | -- | Local file storage for dev |
| Google Cloud STT | Cloud voice transcription | External service | V2 | Device-native STT (free) |

**Missing dependencies with no fallback:**
- None -- all critical dependencies are available locally or have viable dev-mode alternatives.

**Missing dependencies with fallback:**
- AWS S3: Use local file system or MinIO Docker container for development. Production uses S3 Mumbai.
- Google Cloud STT: Device-native STT handles all development and testing. Cloud STT is optional enhancement.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (from STACK.md) |
| Config file | vitest.config.ts (created in Phase 1) |
| Quick run command | `npm test -- --run --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EMR-01 | Create SOAP notes for a consultation | unit + integration | `npx vitest run tests/emr/consultation.test.ts -t "SOAP"` | Wave 0 |
| EMR-02 | Record vitals with species-aware ranges | unit | `npx vitest run tests/emr/vitals.test.ts` | Wave 0 |
| EMR-03 | Write prescriptions with drug/dosage/frequency/duration | unit + integration | `npx vitest run tests/emr/prescription.test.ts` | Wave 0 |
| EMR-04 | View medical history timeline | integration | `npx vitest run tests/emr/history.test.ts` | Wave 0 |
| EMR-05 | Voice-to-text transcription into text field | integration (mock STT) | `npx vitest run tests/emr/voice.test.ts` | Wave 0 |
| EMR-06 | Attach lab/imaging files to consultation | integration | `npx vitest run tests/emr/attachment.test.ts` | Wave 0 |
| EMR-07 | Audit trail on all EMR changes | integration | `npx vitest run tests/emr/audit.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (affected test files only)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/emr/consultation.test.ts` -- SOAP creation, draft auto-save, finalization, consultation lock
- [ ] `tests/emr/vitals.test.ts` -- vitals recording, species-aware range validation, weight auto-update
- [ ] `tests/emr/prescription.test.ts` -- drug search, dosage validation, prescription CRUD, repeat Rx
- [ ] `tests/emr/history.test.ts` -- medical history timeline, history during consultation
- [ ] `tests/emr/voice.test.ts` -- STT integration mock, medical term formatting
- [ ] `tests/emr/attachment.test.ts` -- file upload, compression, metadata, S3 presigned URL
- [ ] `tests/emr/audit.test.ts` -- audit log creation on insert/update/delete, immutability verification
- [ ] `tests/emr/vaccination.test.ts` -- vaccination record CRUD, next-due-date calculation, deworming
- [ ] `tests/emr/drug-seed.test.ts` -- drug database seed integrity, search, dosage ranges
- [ ] `tests/emr/pdf.test.ts` -- HTML template rendering, PDF generation (mock expo-print)
- [ ] `tests/emr/fixtures/` -- shared test data (mock consultation, mock drugs, mock pets with species)

## Sources

### Primary (HIGH confidence)
- [expo-speech-recognition GitHub](https://github.com/jamsch/expo-speech-recognition) -- API, features, platform support, offline mode
- [Expo Print Documentation](https://docs.expo.dev/versions/latest/sdk/print/) -- printToFileAsync API, parameters, limitations
- [Expo ImagePicker Documentation](https://docs.expo.dev/versions/latest/sdk/imagepicker/) -- camera/gallery integration
- [Expo DocumentPicker Documentation](https://docs.expo.dev/versions/latest/sdk/document-picker/) -- file selection API
- [Expo Sharing Documentation](https://docs.expo.dev/versions/latest/sdk/sharing/) -- native share sheet
- npm registry -- verified package versions on 2026-04-19

### Secondary (MEDIUM confidence)
- [CDSCO Veterinary Drugs List](https://cdsco.gov.in/opencms/export/sites/CDSCO_WEB/Pdf-documents/listofveDrugs.pdf) -- India-approved veterinary drugs
- [Indian Vaccination Schedules](https://vetic.in/blog/dogs/essential-vaccines-for-dogs-and-puppies/) -- vaccination intervals for Indian companion animals
- [Virbac India Vaccination Guide](https://in.virbac.com/every-advice/dog-vaccination-guide.html) -- manufacturer vaccination recommendations
- [Google Cloud Speech-to-Text V2](https://cloud.google.com/speech-to-text) -- Hindi/English support, Chirp model capabilities
- [Sarvam AI STT](https://www.sarvam.ai/apis/speech-to-text) -- India-native STT, Rs 30/hour pricing
- [PostgreSQL Audit Patterns](https://www.enterprisedb.com/postgres-tutorials/working-postgres-audit-triggers) -- trigger-based audit trail
- [Reverie STT Comparison](https://reverieinc.com/blog/speech-text-api-comparison/) -- India STT API landscape 2026

### Tertiary (LOW confidence)
- [VetGeni Drug Database](https://www.vetgeni.com/veterinary-drug-database) -- 739 drugs; proprietary, used for reference only
- [Scribd: Common Veterinary Drugs in India](https://www.scribd.com/document/892286090/Drugs-Generally-Used-in-Veterinary-Clinics-in-Indi) -- community-contributed drug list; needs verification
- [WSAVA Vaccination Guidelines](https://wsava.org/wp-content/uploads/2020/01/WSAVA-Vaccination-Guidelines-2015.pdf) -- global vaccination guidelines (2015, may need update check)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are Expo SDK built-ins or verified npm packages with recent updates
- Architecture: HIGH -- accordion form pattern, Zustand state, auto-save, audit triggers are well-established patterns
- Drug database: MEDIUM -- no single authoritative open-source source; manual curation required from multiple references
- Voice-to-text: MEDIUM -- library verified and capable, but Hindi/Hinglish accuracy on mid-range devices is uncertain until real-world testing
- Vaccination intervals: MEDIUM -- based on multiple Indian veterinary sources; should be validated by a practicing vet before Beta
- Pitfalls: HIGH -- based on known patterns in EMR systems, mobile STT, and PostgreSQL audit trails
- PDF generation: HIGH -- expo-print is a stable, built-in Expo SDK feature with well-documented API

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days -- stable domain; library versions may increment but APIs stable)
