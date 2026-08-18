---
phase: 03
slug: patient-registration-walk-in-queue
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (latest, TypeScript-native) |
| **Config file** | `vitest.config.ts` (expected from Phase 1 setup) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose` (affected module tests)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | PAT-01 | unit + integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "register owner"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PAT-02 | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "register pet"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | PAT-03 | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "multiple pets"` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | PAT-04 | integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient.repository.test.ts -t "search"` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | PAT-05 | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "pet profile"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | QUE-01 | unit + integration | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "check in"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | QUE-02 | integration | `npx vitest run apps/api/src/modules/queue/__tests__/queue.socket.test.ts -t "broadcast"` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | QUE-03 | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "position"` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 1 | QUE-04 | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.state-machine.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 1 | QUE-05 | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "call next"` | ❌ W0 | ⬜ pending |
| 03-02-06 | 02 | 1 | QUE-06 | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "lookup by mobile"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/modules/patient/__tests__/patient.service.test.ts` — stubs for PAT-01, PAT-02, PAT-03, PAT-05, QUE-06
- [ ] `apps/api/src/modules/patient/__tests__/patient.repository.test.ts` — stubs for PAT-04 (search with pg_trgm)
- [ ] `apps/api/src/modules/queue/__tests__/queue.service.test.ts` — stubs for QUE-01, QUE-03, QUE-05
- [ ] `apps/api/src/modules/queue/__tests__/queue.state-machine.test.ts` — stubs for QUE-04
- [ ] `apps/api/src/modules/queue/__tests__/queue.socket.test.ts` — stubs for QUE-02 (Socket.IO broadcast integration)
- [ ] `packages/shared/src/schemas/__tests__/patient.schema.test.ts` — zod schema validation tests
- [ ] `packages/shared/src/schemas/__tests__/queue.schema.test.ts` — zod schema validation tests
- [ ] Test helpers: Prisma test client factory with test DB, Socket.IO test server mock

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time queue updates across devices | QUE-02 | Requires multiple simultaneous device connections | Open queue on 2 browser tabs, check in patient on tab 1, verify tab 2 updates within 2 seconds |
| 2-tap check-in UX flow | QUE-01 | UX interaction count is a design measure, not a unit test | On mobile device: tap FAB, enter mobile number, tap pet — verify only 2 taps after FAB |
| Sound + haptic notification on queue change | D-24 | Hardware-dependent | Enable notifications, change queue status on device A, verify sound/haptic on device B |
| Post-fix navigation smoke test (E2E-BUG-FIX-PLAN.md §3.1–3.4) | PAT-05 | Four hardcoded route strings broke navigation four times in this phase alone with nothing catching it; a manual tap-through until an automated navigation harness exists | Tap through: Patients list → pet profile → owner detail → register-new-patient-from-owner, and back, on a real device/emulator. All four must land, not 404 |

---

## E2E Bug Fix Additions (E2E-BUG-FIX-PLAN.md, 2026-08-19)

| # | Behavior | Test | Why it matters |
|---|----------|------|-----------------|
| §3.5 | Check-in with a known mobile number surfaces the existing owner's pets, not the "new patient" path | `apps/mobile/src/features/queue/lib/__tests__/check-in-sheet.test.ts` (`deriveOwnerLookupState`) | The single most important test added in this pass — `CheckInSheet.tsx` previously double-unwrapped the lookup response (`lookupQuery.data?.data`), so 100% of returning patients were funneled into full re-registration. Zero tests existed for `CheckInSheet` before this fix. |
| §3.6 | Patient/queue routes reject roles missing the required permission, and accept roles that have it | `apps/api/tests/patient/patient-queue-permissions.test.ts` | `patient.routes.ts`/`queue.routes.ts` had zero `requirePermission(...)` calls despite `seed.ts` defining the codes. Role × route matrix: `InventoryManager` (VIEW_PATIENTS only, no queue access) → 403 on every EDIT_PATIENTS/queue route; `FrontDesk` (has all of them) → not forbidden. |
| §3.7 | Editing a pet's species, birth year, or birth month persists the change | `apps/mobile/src/features/patient/lib/__tests__/edit-pet-form.test.ts` (`buildPetUpdates`, `validateEditPetForm`) | `EditPetForm` previously had no species/age fields at all, even though the API and mutation type already accepted them. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (Plan 01 Task 3 creates all Wave 0 scaffolds)
