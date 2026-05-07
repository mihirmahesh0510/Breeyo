---
phase: 10
slug: offline-hardening-integration-polish
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + maestro |
| **Config file** | `vitest.config.ts` and `apps/mobile/.maestro/` — Wave 0 installs if missing |
| **Quick run command** | `npx vitest run apps/api/src/modules/sync/__tests__ apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/offline-sync/__tests__` |
| **Full suite command** | `npm test && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run apps/api/src/modules/sync/__tests__ apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/offline-sync/__tests__`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green and Maestro flows must pass
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PLT-03 | T-10-01 / T-10-02 | Replay envelopes reject malformed payloads and shared priority/visibility contracts stay canonical | unit | `npx vitest run packages/shared/src/offline-sync/__tests__/schemas.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | PLT-03 | T-10-03 | Local queue + replay ingress stay transactional and idempotent before domain plans build on them | integration/schema | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts && npx prisma validate --schema apps/api/prisma/schema.prisma` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | PLT-03 | T-10-04 | Offline queue entries remain locally real and replay before lower-priority items | integration | `npx vitest run apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | PLT-03 | T-10-05 / T-10-06 | Consultation drafts remain editable offline and conflicts open clinician-owned structured review | integration/component | `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` | ❌ W0 | ⬜ pending |
| 10-04-01 | 04 | 2 | PLT-03 | T-10-07 | Barcode and stock actions queue offline and reconcile without bypassing FIFO-safe operational review | integration | `npx vitest run apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-01 | 05 | 3 | PLT-03 | T-10-08 / T-10-09 | Sync badge, failure center, retry ownership, and replay broadcasts stay visible and scoped | integration/component | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx` | ❌ W0 | ⬜ pending |
| 10-06-01 | 06 | 4 | PLT-03 | T-10-10 / T-10-11 | Offline recovery, golden path, WhatsApp-triggered flow, and browser replay visibility all pass automated proof harnesses | e2e | `npx vitest run apps/api/tests/integration/offline-recovery.e2e.test.ts apps/api/tests/integration/walkin-to-payment.e2e.test.ts apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts apps/web/tests/integration/reconnect-live-sync.test.ts && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/offline-sync/__tests__/schemas.test.ts` — replay envelope, priority, and conflict-state stubs
- [ ] `apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts` — queue-first replay and preemption stubs
- [ ] `apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts` — idempotent ingest + conflict persistence stubs
- [ ] `apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts` — offline check-in replay stubs
- [ ] `apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts` — reconnect priority/preemption stubs
- [ ] `apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts` — consultation replay + draft persistence stubs
- [ ] `apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts` — compare-and-resolve + clinician ownership stubs
- [ ] `apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` — structured local/server comparison sheet stubs
- [ ] `apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts` — barcode/stock replay stubs
- [ ] `apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts` — offline stock action UI hook stubs
- [ ] `apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx` — failure center, calm badge, recovery cue stubs
- [ ] `apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts` — guided retry and escalation ownership stubs
- [ ] `apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx` — stale-state prompt and replay broadcast stubs
- [ ] `apps/api/tests/integration/offline-recovery.e2e.test.ts` — multiple drop/recover cycle integration stubs
- [ ] `apps/api/tests/integration/walkin-to-payment.e2e.test.ts` — golden path integration stubs
- [ ] `apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts` — WhatsApp-triggered clinic flow integration stubs
- [ ] `apps/web/tests/integration/reconnect-live-sync.test.ts` — browser replay/live-sync integration stubs
- [ ] `apps/mobile/.maestro/offline-recovery.yaml` — real disconnect/reconnect drill script
- [ ] `apps/mobile/.maestro/multi-drop-recovery.yaml` — repeated drop/recover drill script
- [ ] `apps/mobile/.maestro/whatsapp-triggered-flow.yaml` — WhatsApp-triggered recovery drill script

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mid-range Android device remains usable offline for several hours while check-in, note-taking, and barcode workflows continue to queue safely | PLT-03 | Hardware responsiveness, radio instability, and clinic-floor ergonomics cannot be proven by unit tests | Use a mid-range Android 8+ device, disable connectivity, perform repeated queue, consultation, and barcode actions over several hours, reconnect intermittently at least three times, and verify the badge/failure center/recovery cue states remain trustworthy |
| Browser views show replayed queue/inventory changes after mobile reconnect without silently overwriting an active browser edit | PLT-03 + roadmap goal | Requires observing mobile + web together and judging stale-state prompt timing/clarity | Open mobile and browser for the same clinic, make offline mobile changes, reconnect, verify browser updates within the expected window and surfaces a stale/review prompt when the browser was already editing overtaken state |
| Final phase proof includes the WhatsApp-triggered clinic path and walk-in-to-payment golden path on real devices/networks | PLT-03 + roadmap goal | Real disconnect/reconnect drills and payment/WhatsApp handoffs are not fully credible in mocks alone | Run the Phase 10 proof checklist on real devices, including at least one WhatsApp-triggered flow, one full walk-in-to-payment flow, and multiple drop/recover cycles before approval |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
