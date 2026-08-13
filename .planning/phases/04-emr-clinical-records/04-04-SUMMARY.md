---
phase: 04-emr-clinical-records
plan: 04
subsystem: mobile-consultation
tags: [mobile, consultation, SOAP, accordion, auto-save, lock, draft]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [consultation-screen, consultation-review, draft-store, auto-save, consultation-lock]
  affects: [04-05, 04-06]
tech_stack:
  added: []
  patterns: [zustand-store, debounced-auto-save, heartbeat-lock, accordion-ui, quick-pick-chips]
key_files:
  created:
    - apps/mobile/src/features/consultation/screens/ConsultationScreen.tsx
    - apps/mobile/src/features/consultation/screens/ConsultationReviewScreen.tsx
    - apps/mobile/src/features/consultation/components/PatientBanner.tsx
    - apps/mobile/src/features/consultation/components/VisitTypeSelector.tsx
    - apps/mobile/src/features/consultation/components/QuickPickChips.tsx
    - apps/mobile/src/features/consultation/components/VitalsSection.tsx
    - apps/mobile/src/features/consultation/components/SubjectiveSection.tsx
    - apps/mobile/src/features/consultation/components/ObjectiveSection.tsx
    - apps/mobile/src/features/consultation/components/BodySystemChecklist.tsx
    - apps/mobile/src/features/consultation/components/AssessmentSection.tsx
    - apps/mobile/src/features/consultation/components/PlanSection.tsx
    - apps/mobile/src/features/consultation/components/CareInstructionsSection.tsx
    - apps/mobile/src/features/consultation/components/ReferralSection.tsx
    - apps/mobile/src/features/consultation/components/FloatingActionBar.tsx
    - apps/mobile/src/features/consultation/components/DraftIndicator.tsx
    - apps/mobile/src/features/consultation/components/ConsultationLockBanner.tsx
    - apps/mobile/src/features/consultation/hooks/useConsultationDraft.ts
    - apps/mobile/src/features/consultation/hooks/useAutoSave.ts
    - apps/mobile/src/features/consultation/hooks/useConsultationLock.ts
  modified: []
decisions:
  - D-04-04-1: Used plain React Native components instead of react-native-paper (not in mobile dependencies)
  - D-04-04-2: Accordion implemented inline in ConsultationScreen (no external accordion library)
  - D-04-04-3: CareInstructionsSection uses chip array + free text rather than single string to match care instructions constant structure
metrics:
  duration: 8 minutes
  completed: 2026-08-04T15:43:10Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 04 Plan 04: Mobile Consultation Screen Summary

Accordion-based SOAP consultation screen with 7 sections, Zustand draft store, 3-second debounced auto-save, and 60-second lock heartbeat.

## What Was Built

### Task 1: Components and Screens (16 files)

**Components (14 files):**

1. **PatientBanner** -- Sticky top banner displaying pet name/species/age/weight, owner name/phone, visit reason chip (green), and behavioral warning chips (red). Uses emoji species icons.

2. **VisitTypeSelector** -- 3-option segmented control (General Consultation, Surgery, Vaccination) with green highlight on selection. Drives visit-type-specific chip options across sections.

3. **QuickPickChips** -- Reusable horizontal wrapping chip group. Selected chips highlighted green. "Add custom" dashed-border chip with inline TextInput for arbitrary entries. Used by Subjective, Plan, and Care Instructions sections.

4. **VitalsSection** -- 4 numeric inputs (Weight/Temperature/Heart Rate/Respiratory Rate). Species-aware range hints from VITALS_NORMAL_RANGES. Color-coded borders via checkVitalRange: green (normal), orange (slightly abnormal), red (critically abnormal). Warning text for out-of-range values.

5. **SubjectiveSection** -- "Owner Reports" and "History" sub-sections. QuickPickChips loaded from QUICK_PICK_CHIPS[visitType].subjective. Multiline TextInputs for free text.

6. **ObjectiveSection** -- "Physical Examination" header with BodySystemChecklist and additional notes TextInput.

7. **BodySystemChecklist** -- 8 body systems from BODY_SYSTEMS constant. Normal/Abnormal toggle per system. Abnormal expands (200ms animation) to reveal sub-finding checkboxes and notes input. 44px minimum tap targets.

8. **AssessmentSection** -- Single multiline TextInput for diagnosis/assessment.

9. **PlanSection** -- QuickPickChips for action items from QUICK_PICK_CHIPS[visitType].plan plus free text.

10. **CareInstructionsSection** -- QuickPickChips from CARE_INSTRUCTION_CHIPS plus free text.

11. **ReferralSection** -- Horizontal scrolling specialist type chips from SPECIALIST_TYPES, reason text area, Routine/Urgent toggle.

12. **FloatingActionBar** -- Fixed bottom pill-shaped bar (28px radius, elevation 3) with 4 action icons: microphone (pulsing orange when recording), pill (Rx), camera-plus, clock-plus-outline. Hidden when consultation is locked.

13. **DraftIndicator** -- Shows "Draft -- auto-saved [time]" (saved), "Unsaved changes" with pulsing dot (dirty), "Saving..." (saving), "Could not save draft. Will retry." (error).

14. **ConsultationLockBanner** -- Orange banner with lock icon showing "Dr. [Name] is currently consulting this patient." Take Over button visible for stale locks with confirmation dialog.

**Screens (2 files):**

15. **ConsultationScreen** -- Main consultation screen with:
    - PatientBanner (sticky top)
    - VisitTypeSelector (new consultations only)
    - DraftIndicator
    - 7 AccordionItem sections in fixed order: Vitals, Subjective, Objective, Assessment, Plan, Prescriptions (placeholder), Files (placeholder)
    - Single-expand behavior (tapping one collapses the other)
    - "End Consultation" button navigating to review screen
    - Back navigation dialog: "Leave consultation?" with "Save & Leave" and "Delete Draft" options (delete requires secondary confirmation)
    - FloatingActionBar at bottom

16. **ConsultationReviewScreen** -- Read-only summary with ReviewCard components for each SOAP section. Empty sections show "Not recorded". Warning text about finalization permanence. "Edit" returns to ConsultationScreen. "Confirm & Finalize" triggers FollowUpSheet (bottom sheet modal with date/reason inputs and Save/Skip buttons), then POST to finalize endpoint.

### Task 2: Hooks (3 files)

17. **useConsultationDraft** -- Zustand store (create from zustand) for ConsultationDraftState. Actions: setConsultationId, setVisitType, toggleSection (single-expand), updateVitals/Subjective/Objective/Assessment/Plan/CareInstructions/Referral/RxNotes, markSaved, markSaving, setFinalizing, loadFromDraft, reset. Every update sets isDirty=true. Initial state has all fields empty/null.

18. **useAutoSave** -- Subscribes to Zustand store changes. 3-second debounce (3000ms) after any field change. PATCH to /api/v1/consultations/:id/draft. Suppressed when isFinalizing=true. Error retry after 5 seconds. forceSave() for finalization: cancels timer, sets isFinalizing, saves synchronously. serializeDraft extracts only SOAP data (no UI state).

19. **useConsultationLock** -- Check lock status on mount via GET /api/v1/consultations/:id/lock. 60-second heartbeat interval (60000ms) via POST /heartbeat. Release lock on unmount via DELETE /lock. Release on 30-second app background (30000ms) via AppState listener. Re-establishes heartbeat when app returns to foreground.

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| Prescriptions placeholder | ConsultationScreen.tsx | AccordionItem "Prescriptions" | Intentional -- Plan 05 will implement prescription module |
| Files placeholder | ConsultationScreen.tsx | AccordionItem "Files" | Intentional -- Plan 06 will implement file attachments |
| FloatingActionBar Rx/Camera/Timer handlers | ConsultationScreen.tsx | handleRx/handleCamera/handleTimer | Intentional -- callbacks are placeholder no-ops until Plans 05/06 |

All stubs are intentional placeholders for future plans and do not prevent the consultation screen's core goal from being achieved.

## Self-Check: PASSED

- [x] All 19 files created and exist on disk
- [x] Commit b75452a exists in git log
- [x] All acceptance criteria verified via grep
- [x] Line count minimums met (ConsultationScreen: 524, PatientBanner: 126, BodySystemChecklist: 266, useAutoSave: 108)
