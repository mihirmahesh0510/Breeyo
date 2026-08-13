---
phase: 04-emr-clinical-records
plan: 06
subsystem: mobile-emr-features
tags: [voice-to-text, file-attachments, medical-history, preventive-care, pdf-generation, mobile]
dependency_graph:
  requires: [04-01, 04-02, 04-03]
  provides: [voice-transcription, file-upload, history-timeline, preventive-care-tracking, pdf-documents]
  affects: [consultation-screen, pet-profile]
tech_stack:
  added: [expo-speech-recognition, expo-image-manipulator, expo-file-system, expo-print, expo-sharing, expo-document-picker, react-native-svg]
  patterns: [presigned-url-upload, html-to-pdf, speech-to-text, bottom-sheet-modal]
key_files:
  created:
    - apps/mobile/src/features/consultation/hooks/useVoiceTranscription.ts
    - apps/mobile/src/features/consultation/components/VoiceRecordingOverlay.tsx
    - apps/mobile/src/features/attachment/hooks/useFileUpload.ts
    - apps/mobile/src/features/attachment/components/AttachmentPicker.tsx
    - apps/mobile/src/features/attachment/components/AttachmentMetaForm.tsx
    - apps/mobile/src/features/attachment/components/AttachmentCard.tsx
    - apps/mobile/src/features/attachment/components/AttachmentGallery.tsx
    - apps/mobile/src/features/consultation/components/FilesSection.tsx
    - apps/mobile/src/features/history/components/HistoryBottomSheet.tsx
    - apps/mobile/src/features/history/components/HistoryItem.tsx
    - apps/mobile/src/features/history/components/MedicalTimeline.tsx
    - apps/mobile/src/features/history/components/PreventiveCareCard.tsx
    - apps/mobile/src/features/history/components/VaccinationTracker.tsx
    - apps/mobile/src/features/history/components/DewormingTracker.tsx
    - apps/mobile/src/features/history/components/WeightTrendChart.tsx
    - apps/mobile/src/features/pdf/templates/consultation-summary.ts
    - apps/mobile/src/features/pdf/templates/clinical-record.ts
    - apps/mobile/src/features/pdf/templates/prescription-pad.ts
    - apps/mobile/src/features/pdf/templates/vaccination-certificate.ts
    - apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts
    - apps/mobile/src/features/pdf/components/ShareOptionsSheet.tsx
  modified: []
decisions:
  - "D-51-D57: Voice-to-text uses expo-speech-recognition with Hindi primary (hi-IN), continuous mode, medical term formatting"
  - "D-59-D61: File attachments enforce 10MB limit, 10 files per consultation, auto-compress images >5MB"
  - "D-68: Image attachments open full-screen viewer; PDF/DICOM show type icons"
  - "D-07/D-36: History bottom sheet with Repeat Rx per visit"
  - "D-44: Preventive care card with upToDate/dueSoon/overdue status badges"
  - "D-45-D48: Four PDF templates with clinic branding, base64 logo support for iOS"
metrics:
  duration: ~15m
  completed: 2025-08-04
  tasks_completed: 2
  tasks_total: 2
  files_created: 21
  files_modified: 0
  lines_added: 4523
---

# Phase 04 Plan 06: Voice, Attachments, History, PDF Generation Summary

Voice-to-text transcription with expo-speech-recognition (Hindi+English), file attachment workflow with S3 presigned URL upload and image compression, medical history bottom sheet with Repeat Rx, preventive care status tracking, weight trend SVG chart, and 4 PDF document templates (owner summary, clinical record, prescription pad, vaccination certificate) using expo-print.

## Tasks Completed

### Task 1: Voice-to-text, File Attachments, History & Preventive Care (15 files)

**Voice-to-Text:**
- `useVoiceTranscription.ts`: Full expo-speech-recognition integration with `ExpoSpeechRecognitionModule`, Hindi primary (`hi-IN`), continuous mode, interim results, contextual strings (drug names), `formatMedicalTerms()` for capitalizing drugs and formatting temperature/weight units, `lastFocusedField` ref for targeting SOAP text fields
- `VoiceRecordingOverlay.tsx`: Pulsing orange (#E65100) dot, "Recording..." with duration counter, "Transcribing..." with spinner, interim transcript display

**File Attachments:**
- `useFileUpload.ts`: Validates size (10MB) and MIME type, compresses images >5MB via expo-image-manipulator, presigned URL flow (request -> S3 PUT -> confirm), progress tracking
- `AttachmentPicker.tsx`: ActionSheet with "Take Photo", "Choose from Gallery", "Upload File" using expo-image-picker and expo-document-picker
- `AttachmentMetaForm.tsx`: File type dropdown (Lab Report, X-ray, Ultrasound, ECG, Photo, Other) + optional description
- `AttachmentCard.tsx`: Image thumbnail (80px) with full-screen viewer, PDF/DICOM icon display, upload progress, error retry, remove with confirmation
- `AttachmentGallery.tsx`: Horizontal ScrollView with 8px gap
- `FilesSection.tsx`: "No files attached." empty state, "Maximum 10 files reached" limit message, "Add File" button

**Medical History:**
- `HistoryBottomSheet.tsx`: Animated slide-up bottom sheet, fetches from `/api/v1/pets/:petId/history`, skeleton loading, empty state, error with retry
- `HistoryItem.tsx`: 56px compact row with date, visit type badge, assessment, vet name, duration, "Repeat Rx" button, expandable detail
- `MedicalTimeline.tsx`: Timeline-style FlatList with colored dots and cards for pet profile page

**Preventive Care:**
- `PreventiveCareCard.tsx`: Card with vaccination + deworming status rows, `upToDate` (green), `dueSoon` (orange), `overdue` (red) status badges, next due dates
- `VaccinationTracker.tsx`: FlatList of vaccination records with status badges
- `DewormingTracker.tsx`: FlatList of deworming records with status badges
- `WeightTrendChart.tsx`: SVG-based line chart (react-native-svg) with 3+ data point threshold, current weight callout, insufficient data display

### Task 2: PDF Templates & Generation (6 files)

**Templates (4 HTML builders):**
- `consultation-summary.ts`: `buildOwnerSummaryHtml()` - owner-friendly with diagnosis, prescriptions (owner instructions), care instructions, follow-up date
- `clinical-record.ts`: `buildClinicalRecordHtml()` - full SOAP with vitals grid, body system exam table, prescriptions (clinical dosage), attachments list, referral, addenda
- `prescription-pad.ts`: `buildPrescriptionPadHtml()` - traditional Rx pad format with numbered medications, owner-friendly instructions, dispensed status, vet signature line
- `vaccination-certificate.ts`: `buildVaccinationCertificateHtml()` - formal certificate with pet details (microchip, color), vaccine info (batch/lot, manufacturer, expiry), certification statement, seal area

**Generation & Sharing:**
- `useGeneratePdf.ts`: `printToFileAsync` for HTML-to-PDF, `shareAsync` for native share sheet, 4 generate functions (owner summary, clinical record, prescription pad, vaccination certificate), base64 logo support for iOS compatibility
- `ShareOptionsSheet.tsx`: Bottom sheet with format options based on visit type (vaccination adds certificate option), "Generating PDF..." spinner

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit  | Description                                                |
|------|---------|------------------------------------------------------------|
| 1+2  | af3c07b | feat(phase-04): implement Plan 04-06 voice, attachments, history, PDFs |

## Known Stubs

None. All components are fully implemented with proper API integration, error handling, and loading states. The expo packages (expo-speech-recognition, expo-print, expo-file-system, expo-sharing, expo-image-manipulator, expo-document-picker) must be installed separately in the mobile app.

## Dependencies Note

The following expo packages are referenced but may need explicit installation:
- `expo-speech-recognition` (voice-to-text)
- `expo-image-manipulator` (image compression)
- `expo-file-system` (S3 upload)
- `expo-print` (HTML-to-PDF)
- `expo-sharing` (native share sheet)
- `expo-document-picker` (file selection)
- `react-native-svg` (weight trend chart)

These are standard Expo ecosystem packages. Install via: `npx expo install <package-name>`

## Self-Check: PASSED

- All 21 files exist at their expected paths
- Commit af3c07b verified in git log
- All acceptance criteria patterns found in respective files
- No file deletions
- No untracked files left behind
