---
phase: 10-offline-hardening-integration-polish
plan: 03
subsystem: offline-consultation-drafts-and-clinical-conflict-resolution
tags: [zustand, expo-sqlite, expo-secure-store, fastify, zod, TDD, clinical-conflict, review-before-overwrite, clinician-ownership]
dependency_graph:
  requires: [10-01]
  provides: [offline-consultation-draft-store, clinical-conflict-classification, consultation-offline-replay, clinical-conflict-resolution-sheet, consultation-sync-endpoint]
  affects: [10-05, 10-06]
tech_stack:
  added: []
  patterns: [same-day-working-set-snapshot-reuse, three-way-diff-baseline, whole-record-hold-on-any-conflict, field-granularity-safe-merge, clinician-owned-safety-critical-conflict]
key_files:
  created:
    - apps/mobile/src/features/consultation/services/offlineConsultationDraftStore.ts
    - apps/mobile/src/features/consultation/services/__tests__/offlineConsultationDraftStore.test.ts
    - apps/mobile/src/features/consultation/lib/clinical-conflict-resolution.ts
    - apps/mobile/src/features/consultation/components/ClinicalConflictResolutionSheet.tsx
    - apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx
    - apps/mobile/src/features/consultation/hooks/__tests__/useConsultationDraft.test.ts
    - apps/api/src/modules/emr/services/clinicalConflict.service.ts
    - apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts
    - apps/api/src/modules/emr/controllers/consultationSync.controller.ts
    - apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts
    - apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts
  modified:
    - apps/mobile/src/features/consultation/screens/ConsultationScreen.tsx
    - apps/mobile/src/features/consultation/hooks/useAutoSave.ts
    - apps/mobile/src/features/consultation/hooks/useConsultationDraft.ts
    - apps/mobile/src/features/consultation/components/DraftIndicator.tsx
    - apps/mobile/src/features/offline-sync/db/offlineDb.ts
    - apps/api/src/modules/emr/emr.routes.ts
    - vitest.config.ts (repo root; appended Plan 10-03 mobile consultation + API EMR test paths)
metrics:
  duration: ~1 session, fully TDD (RED confirmed before every implementation file)
  completed: 2026-08-24
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 03: Offline Consultation Drafts and Clinician-Owned Clinical Conflict Resolution Summary

Made EMR note-taking (SOAP notes, vitals, prescriptions) survive real connectivity loss without ever forcing `ConsultationScreen.tsx` into read-only mode: an offline edit is now persisted to the same-day on-device working set (surviving an app restart, not just living in zustand memory) and tagged `CLINICAL_MEDIUM` for reconnect. Server-side, offline consultation replay reconciles against the live draft with a strict three-way diff: a field only the offline device touched auto-merges (D-07); a field BOTH sides changed to different values makes the ENTIRE replay a `SAFETY_CRITICAL` conflict, held for explicit clinician review rather than partially applied (D-05, D-06) — with the consultation's own assigned vet (`vetId`) named as both `recommendedOwnerUserId` and `resolutionOwnerUserId` immediately (D-09, D-24). `ClinicalConflictResolutionSheet.tsx` renders the disputed fields side by side with five explicit actions (keep-local, keep-server, merge-safe-fields, retry, escalate) and stays visible for every non-`RESOLVED` state (D-08, D-11).

Built strictly test-first: every acceptance criterion had a failing test confirmed RED before its implementation was written (including one file where the implementation was written before its test by mistake — caught immediately, deleted, and rebuilt in the correct RED-then-GREEN order; see Deviations).

## What Was Built

### Task 1: Offline consultation draft persistence + consultation-screen wiring (TDD)

- **`apps/mobile/src/features/consultation/services/offlineConsultationDraftStore.ts`** (new) — `saveOfflineConsultationDraft`/`loadOfflineConsultationDraft`, `CLINICAL_MEDIUM` (= `ReplayPriority.CLINICAL_MEDIUM`), `computeChangedFields`, `buildConsultationDraftEnvelope`, `isNetworkFailure`. Built directly on Plan 10-01's shared `offlineDb.ts` rather than a second local database: persists into the SAME `consultation_draft_snapshot` same-day working-set table (D-15 to D-17, D-35) every domain adapter's snapshot lives in, and enqueues into the SAME `sync_operations` replay ledger Plan 10-02's queue actions use — just tagged `CLINICAL_MEDIUM` instead of `QUEUE_HIGH`. Content-addressed idempotency: re-saving a byte-for-byte-unchanged draft (deep-equal, not `JSON.stringify`, so key-order differences never false-positive) skips both the snapshot write and a new replay enqueue, so a device stuck offline retrying its 3-second auto-save doesn't flood the ledger; a genuinely new edit always gets a fresh `operationId` and its own envelope.
- **`apps/api/src/modules/offline-sync/db/offlineDb.ts` gained `readWorkingSetSnapshot`** — the read counterpart Plan 10-01 never needed (queue/inventory only ever wrote a snapshot for optimistic rendering off other in-memory state); the consultation draft store needs to read one back to restore state across an app restart.
- **`useConsultationDraft.ts` gained `syncedSnapshot`** — the draft state last confirmed in sync with the server (set on `loadFromDraft`, advanced on `markSaved`, reset on `reset`). This is the three-way-diff baseline both the mobile offline store and the API's `clinicalConflict.service.ts` need: without it there is no way to tell "this device actually changed this field" apart from "this field simply arrived pre-populated from the last load."
- **`useAutoSave.ts`** now distinguishes a network failure (`isNetworkFailure`, same `ApiClientError`-based check as Plan 10-02's queue hook, duplicated per this repo's per-feature-scoping convention) from a real server rejection (423 lock, validation). A network failure sets a new `isOffline` flag (never `saveError`) and best-effort persists the draft locally via `saveOfflineConsultationDraft`; a real rejection keeps the existing `saveError` behavior untouched. `forceSave` (used by "Save & Leave" and "End Consultation") got the same treatment so ending a consultation while offline doesn't drop the final edits.
- **`DraftIndicator.tsx`** gained a fourth `'offline'` status ("Saved offline -- will sync when back online") distinct from `'error'` — reassuring, not alarming, per D-19, and never conflated with an actual failure the clinician needs to act on.
- **`ConsultationScreen.tsx`** wires `isOffline` into `draftStatus`, and on load (for an existing consultation) checks `loadOfflineConsultationDraft` for a locally-persisted draft and replays it through the store's normal `update*` setters on top of the server's copy — which naturally marks those fields dirty again so `useAutoSave` re-attempts syncing them once back online.
- Tests: `offlineConsultationDraftStore.test.ts` (10 — persistence, restart-survival, changed-field diffing, envelope tagging, dedup-vs-fresh-enqueue, same-day scoping, network-failure classification), `useConsultationDraft.test.ts` (4 — `syncedSnapshot` baseline behavior; this hook has no `react-native` import so it is directly testable, unlike most of this feature).

### Task 2: Clinical conflict classification, consultation replay, and resolution sheet (TDD)

- **`apps/api/src/modules/emr/services/clinicalConflict.service.ts`** (new) — `classifyClinicalConflict` (+ thin `ClinicalConflictService` wrapper class) runs a field-granularity three-way diff over `CLINICAL_DRAFT_FIELDS` (the `SaveDraftInput` top-level fields: vitals, subjective, objective, assessment, plan, careInstructions, referral, rxNotes, prescriptions). A field only the offline device touched is a `safeMergeFields` entry (D-07); a field both sides changed to the SAME value is treated as a non-conflict; a field both sides changed to DIFFERENT values is a `conflictingFields` entry and `mergedPayload` NEVER gets the local value for it (always the server's) — so even a caller that blindly persisted `mergedPayload` could not silently apply a contested edit. `hasConflict` (any conflicting field) sets `severity: SAFETY_CRITICAL` and `recommendedOwnerUserId` to the caller-supplied `assignedClinicianId`.
- **`apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts`** (new) — `ConsultationOfflineReplayService.replayConsultationDraft` mirrors `queueOfflineReplay.service.ts`'s shape (same idempotency ledger via `SyncReplayReceipt`, same envelope validation) but with the stricter clinical review posture: when `classifyClinicalConflict` reports ANY conflicting field, the WHOLE replay is held — not even the same replay's non-conflicting fields get written — and a `SyncConflictRecord` is created with `severity: SAFETY_CRITICAL`, both full payloads (D-08), and BOTH `recommendedOwnerUserId`/`resolutionOwnerUserId` set immediately to the consultation's own `vetId` (a consultation always has a definite assigned clinician, so there is no ambiguity window unlike the generic shared ingress). Otherwise, `mergedPayload` is written via the gateway's `saveDraft` (D-07 safe auto-merge).
- **`apps/api/src/modules/emr/controllers/consultationSync.controller.ts`** (new) — `POST /consultations/sync/replay`, wired into `emr.routes.ts` as a fixed segment (same non-colliding-with-`:consultationId` pattern queue's `/queue/sync/replay` uses). Returns **409** (not 200) whenever any operation in the batch produced a conflict, carrying `conflictIds` — per the plan's "returns conflict envelopes instead of success when review is required."
- **`apps/mobile/src/features/consultation/lib/clinical-conflict-resolution.ts`** (new, RN-free) — `buildFieldComparisonRows`, `isMergeSafeFieldsAvailable`, `isUnresolved` (D-11: only `RESOLVED` clears visibility; `OPEN`/`GUIDED_RETRY`/`ESCALATED` all stay visible), `escalationOwnerLabel` (D-09/D-24, defensively `null` for anything not `SAFETY_CRITICAL`), `availableActions` (omits `MERGE_SAFE_FIELDS` entirely — not just disabled — when nothing is safely mergeable, so the sheet never offers a silent no-op).
- **`apps/mobile/src/features/consultation/components/ClinicalConflictResolutionSheet.tsx`** (new) — renders the field-by-field local-vs-server comparison and five explicit actions (`onKeepLocal`, `onKeepServer`, `onMergeSafeFields` (conditionally shown), `onRetry`, `onEscalate`) on top of `@breeyo/ui`'s `BottomSheet`, names the recommended clinician via `escalationOwnerLabel`, and returns `null` (unmounts) only once `isUnresolved` says the conflict is actually `RESOLVED`.
- Tests: `clinicalConflict.service.test.ts` (12), `consultationOfflineReplay.service.test.ts` (10), `ClinicalConflictResolutionSheet.test.tsx` (16 — pure-function cases plus component-source assertions for the five actions/`buildFieldComparisonRows`/`isUnresolved`/`escalationOwnerLabel`, following this repo's established convention of testing RN-free decision layers directly since `apps/mobile` runs vitest in plain `node` with no Metro/Babel transform).

## Deviations From the Plan (flagged, not silently made)

1. **A file was implemented before its test, caught, and redone.** While building the resolution sheet, `clinical-conflict-resolution.ts` was written first out of habit from having just finished its companion component's design. This was caught before running any test, the file was deleted, the test (`ClinicalConflictResolutionSheet.test.tsx`) was written and confirmed RED against the actual missing module, and the implementation was then restored verbatim. Flagged here rather than silently corrected, per the TDD mandate's "never write implementation before its test."
2. **`useConsultationDraft.ts`, `useAutoSave.ts`, and `DraftIndicator.tsx` touched, though not named in the plan's `files_modified` list** (only `ConsultationScreen.tsx` was named for mobile screen changes). Reachability required it: `useConsultationDraft.ts` needed a `syncedSnapshot` baseline for any diff to be possible at all, `useAutoSave.ts` is where the actual network-failure detection and save-retry loop already lived (the plan's "losing connectivity never forces read-only" behavior has nowhere else to hook in), and `DraftIndicator.tsx` needed a fourth status so an offline save isn't visually indistinguishable from a real failure. Same kind of necessary-reachability deviation Plan 10-02 documented for `queue.routes.ts`/`CheckInSheet.tsx`.
3. **`offlineDb.ts` gained `readWorkingSetSnapshot`, not named in the plan.** Plan 10-01 built `writeWorkingSetSnapshot` for every domain's same-day snapshot table but no domain needed to read one back until this plan's restart-survival requirement. Extending the existing shared file (additive only, no existing function touched) rather than duplicating snapshot-table SQL inside `offlineConsultationDraftStore.ts` matches Plan 10-02's own precedent of extending shared 10-01 infrastructure when a gap is found.
4. **`apps/mobile/src/features/consultation/hooks/__tests__/useConsultationDraft.test.ts` added, not required by the plan's verify command.** `useConsultationDraft.ts` has no `react-native` import (only `zustand`/`@breeyo/types`), so unlike most of this feature it is directly testable under vitest's plain `node` environment — added for TDD coverage of the new `syncedSnapshot` behavior the offline draft store depends on, since an untested diff-baseline would undermine confidence in every downstream conflict classification.
5. **The resolution sheet's "merge safe fields" action is a UI affordance, not a wired backend endpoint.** The plan's acceptance criteria for `ClinicalConflictResolutionSheet.tsx` are about rendering the structured comparison and explicit actions, and about unresolved conflicts staying visible — not about a live "apply this resolution" API route. No such endpoint exists yet (there is no `PATCH /consultations/sync/conflicts/:id/resolve` or similar); the sheet's action callbacks (`onKeepLocal`/`onKeepServer`/`onMergeSafeFields`/`onRetry`/`onEscalate`) are typed and ready for a caller to wire to one. Building that endpoint (plus a failure-center screen to surface conflicts in the first place) reads as Plan 10-05's territory (sync visibility/failure ownership, D-18 to D-24) rather than this plan's clinical-conflict-classification scope, and is called out here rather than silently left implicit.
6. **New consultation creation (`POST /consultations`) still requires connectivity.** Only editing an ALREADY-created consultation's draft works offline in this plan, matching the plan's explicit scope ("consultation notes remain editable offline" — not "consultations can be created offline"). Creating a brand-new consultation needs a server-assigned id and a lock acquisition, neither of which this plan's offline surface covers.

## Task Commits

Both tasks were implemented and verified together in one session (the mobile store, the API classification/replay services, and the resolution sheet share fixtures and were developed in the same TDD loop); committed as a single commit per this plan's completion.

_All TDD tasks followed the iron law: the failing test was written and run first (confirmed RED), then the minimal implementation was added until it passed -- including the one file where this was violated and corrected (Deviation 1)._

## Verification

```
npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx
```
38/38 passing (10 + 12 + 16).

Additional verification run beyond the plan's gate:
- `apps/api/src/modules/emr/__tests__/` (targeted): 5 files, 66 tests passing (28 + 10 + 12 + 11 + 5), no regressions in existing `emr.service.test.ts`/`emr.controller.test.ts`/`consultation-lock.test.ts`.
- `apps/mobile` full suite: **50 test files, 791 tests passed**, 0 failed.
- `apps/api` full suite (real Postgres 16 + Redis 7): see final report for pass/fail counts once the run completes.
- `npx tsc --noEmit` in both `apps/api` and `apps/mobile`: no new type errors introduced by any file this plan touched (both packages carry pre-existing, unrelated type errors predating this plan, confirmed by diffing the error list before and after).

## Verify-Fix Follow-Up

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.1**: a `no-mistakes --verify phase 10` pass found that `ConsultationOfflineReplayService.replayConsultationDraft` never read `consultation.status` before running the draft/conflict diff. A late offline replay landing after the target consultation was already finalized (its `ConsultationDraft` row deleted at finalize time) got misread as `EMPTY_DRAFT`, and the offline edit was either silently dropped or reconstituted an orphan `ConsultationDraft` row nothing downstream ever reads.

Fixed by branching on `consultation.status === 'finalized'` immediately after `getConsultation` resolves and before `loadDraft`/`classifyClinicalConflict` run at all (Task 2's own `ConsultationOfflineReplayGateway`/`ConsultationRecord` types already exposed `status`, they just weren't checked). The finalized path never reads or writes `ConsultationDraft`; it instead builds an `AddendumEntry` from the changed `CLINICAL_DRAFT_FIELDS` (relative to the offline device's own last-known baseline) and calls `EmrRepository.addAddendum` -- Phase 4's existing addendum-only post-finalization edit mechanism (`04-CONTEXT.md`), authored by the originating offline user (`context.userId`) with the envelope's own `createdAt` as the addendum timestamp where parseable. Recorded as **D-38** in `10-CONTEXT.md`.

TDD: three new tests added to `consultationOfflineReplay.service.test.ts` (routes to `addAddendum` and never touches `loadDraft`/`saveDraft`/`ConsultationDraft`; no-op when the offline draft has no real field changes; duplicate/flapping resend of the same `operationId` stays idempotent) -- confirmed RED against the pre-fix code (asserting `loadDraft` was NOT called failed because it WAS called) before the fix made them pass.

Verify: `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts` -- 25/25 passing (13 + 12).

---

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.5**: **Deviation 5 above is now resolved.** `ClinicalConflictResolutionSheet.tsx`'s `onKeepLocal`/`onKeepServer`/`onMergeSafeFields`/`onEscalate` actions had a live endpoint to call for the first time: `POST /consultations/:consultationId/conflicts/:conflictId/resolve`.

New `apps/api/src/modules/emr/services/consultationConflictResolution.service.ts` (`ConsultationConflictResolutionService.resolveConflict`) accepts `KEEP_LOCAL` / `KEEP_SERVER` / `MERGE_SAFE_FIELDS` / `ESCALATE` -- a deliberate subset of the mobile sheet's own action union (which also lists `RETRY`; the real `SyncFailureCenterScreen.tsx` wiring from verify-fix 10.4 never routes `RETRY` through `onResolveClinicalConflict`, it goes to the screen's separate `onRetry` callback, i.e. finding 10.6's guided-retry route -- a retry is not a resolution of this record and has no field-level outcome for this endpoint to apply). `KEEP_LOCAL`/`KEEP_SERVER` are whole-record choices (the full `localPayloadJson`/`serverPayloadJson` snapshot); `MERGE_SAFE_FIELDS` reruns `classifyClinicalConflict`'s real three-way diff (reusing `CLINICAL_DRAFT_FIELDS`, not a new field notion) against a new `baselinePayloadJson` column added to `SyncConflictRecord` and populated by `consultationOfflineReplay.service.ts`'s `createConflictRecord` at conflict-creation time -- a legacy row without one conservatively yields zero safe fields rather than ever guessing a disputed field is safe (D-05/D-06). Any resolution that changes clinical data writes through `EmrRepository.saveDraft` while the consultation is still a draft, or through `EmrRepository.addAddendum` (verify-fix 10.1's same post-finalization pattern) if it has since finalized. `ESCALATE` only transitions `resolutionState` to `ESCALATED`, deliberately leaving `currentOwnerUserId`/`recommendedOwnerUserId` untouched for finding 10.6's `retryEscalation.service.ts`/on-duty-roster hand-off to build on. Resolving an already-`RESOLVED` conflict is rejected with a 409 `CONFLICT_ALREADY_RESOLVED`, not a silent no-op. The conflict lookup is scoped to `context.clinicId` (server-derived from the authenticated session) and cross-checked against the URL's `consultationId`/`entityType`/`domain`, so a conflict id from another clinic 404s as `CONFLICT_NOT_FOUND` without confirming whether the row exists elsewhere.

TDD: `consultationConflictResolution.service.test.ts` (11 unit tests against fakes, one action at a time, plus the already-resolved/tenant-isolation/entity-mismatch/missing-consultation guards) and a new real-HTTP-plus-real-Postgres suite, `apps/api/tests/emr/consultation-conflict-resolve.test.ts` (8 tests), that drives every conflict through the actual `/consultations/sync/replay` endpoint first (no service mocked) before resolving it, including a genuine cross-clinic tenant-isolation case with a second real clinic/user/token. A regression-catching mutation check (temporarily disabling the already-resolved guard) confirmed the corresponding test actually fails without the guard before it was restored.

Verify: `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/api/src/modules/emr/__tests__/consultationConflictResolution.service.test.ts apps/api/tests/emr/consultation-conflict-resolve.test.ts` -- 44/44 passing (18 + 12 + 11 + 8, `consultationOfflineReplay.service.test.ts` gaining one net-new assertion for the `baselinePayloadJson` persistence this fix also relies on).

**Update (verify-fix 10.6):** the `ESCALATE` action's "deliberately leaving `currentOwnerUserId` untouched for finding 10.6" deferral noted above is now resolved. `ConsultationConflictResolutionService` takes an optional injected `OnDutyRosterProvider` and, on `ESCALATE`, reassigns `currentOwnerUserId` to a different real on-duty clinician via the same `resolveNextOnDutyClinicianId` helper `retryEscalation.service.ts`'s own escalation paths use (D-24, D-39) -- throwing (409 `NO_ON_DUTY_CLINICIAN_AVAILABLE`, or 500 `ROSTER_PROVIDER_REQUIRED` if none is wired in) rather than leaving the conflict pinned to the same clinician when nobody else is on duty. See `10-05-SUMMARY.md`'s verify-fix 10.6 follow-up for the full fix description and verify output.
