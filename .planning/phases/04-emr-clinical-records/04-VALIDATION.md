---
phase: 04
slug: emr-clinical-records
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | EMR-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | EMR-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | EMR-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | EMR-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | EMR-05 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | EMR-06 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 04-03-03 | 03 | 2 | EMR-07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test framework installation (vitest, @testing-library/react-native)
- [ ] Shared test fixtures (mock consultation data, drug database seeds, pet/owner fixtures)
- [ ] API test helpers (authenticated request factory, database seeding/teardown)

*Planner will refine these based on final plan structure.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Voice-to-text transcription | EMR-05 | Requires device microphone + speech recognition API | Record sample dictation on device, verify text appears in field |
| PDF generation visual layout | EMR-06 | Visual inspection of branded PDF output | Generate consultation summary PDF, verify clinic header, vet footer, content layout |
| Camera/gallery file attachment | EMR-04 | Requires device camera/gallery access | Take photo via camera button, verify thumbnail + metadata displayed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
