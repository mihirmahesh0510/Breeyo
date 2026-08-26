---
phase: 10
slug: offline-hardening-integration-polish
status: approved
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
| **Quick run command** | `npx vitest run packages/shared/src/offline-sync/__tests__/schemas.test.ts apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts apps/mobile/src/features/queue/__tests__/QueueBoardScreen.offline.test.tsx apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts apps/api/src/modules/scheduling/__tests__/queue-handoff.service.test.ts apps/mobile/src/features/consultation/__tests__/ConsultationScreen.offline.test.tsx apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts apps/mobile/src/features/offline-sync/__tests__/SyncStatusBadge.test.tsx apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx apps/web/src/features/billing/__tests__/billing-workbench.test.tsx apps/web/tests/integration/reconnect-live-sync.test.ts apps/web/src/lib/__tests__/api.test.ts apps/web/src/features/queue/__tests__/queue-board.test.tsx` |
| **Full suite command** | `npm test && npx prisma validate --schema apps/api/prisma/schema.prisma && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/multi-drop-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's exact `<automated>` command from its source plan so validation stays scoped to the files and behavior that task actually changed.
- **After every plan wave:** Run `npm test && npx prisma validate --schema apps/api/prisma/schema.prisma`
- **Before `/gsd-verify-work`:** Full suite must be green, all three Maestro flows must pass, and the blocking human checkpoint in `10-06-PLAN.md` must still approve on real hardware.
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | PLT-03 | T-10-01 / T-10-02 | Replay envelopes reject malformed payloads and shared priority/visibility contracts stay canonical | unit | `npx vitest run packages/shared/src/offline-sync/__tests__/schemas.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | PLT-03 | T-10-03 | Local queue and active-patient snapshots plus replay ingress stay transactional/idempotent, and out-of-window reads remain bounded read-only fallback | integration/schema | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts && npx prisma validate --schema apps/api/prisma/schema.prisma` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | PLT-03 | T-10-03 | Local database schema and generated client exist before any later replay plan executes | schema | `npx prisma db push --schema apps/api/prisma/schema.prisma && npx prisma generate --schema apps/api/prisma/schema.prisma` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | PLT-03 | T-10-04 | Offline queue entries remain locally real on the queue board, preserve scheduled metadata, and do not demote `EXPECTED` arrivals while disconnected | component | `npx vitest run apps/mobile/src/features/queue/__tests__/QueueBoardScreen.offline.test.tsx` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | PLT-03 | T-10-04 / T-10-05 / T-10-06 | Queue replay stays idempotent under the canonical clinic-scoped receipt key, preempts lower tiers, preserves Phase 8 `EXPECTED`-arrival handoff semantics, and creates operational review instead of silent overwrite | integration | `npx vitest run apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts apps/api/src/modules/scheduling/__tests__/queue-handoff.service.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | PLT-03 | T-10-05 / T-10-06 | Consultation drafts remain editable offline, active-patient snapshot fallback stays available, and broader history does not expand past bounded read-only fallback | component | `npx vitest run apps/mobile/src/features/consultation/__tests__/ConsultationScreen.offline.test.tsx` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 2 | PLT-03 | T-10-05 / T-10-06 / T-10-07 | Consultation replay opens clinician-owned structured review, limits safe auto-merge, and keeps unresolved clinical conflicts visible | integration/component | `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` | ❌ W0 | ⬜ pending |
| 10-03-02 (verify-fix 10.1) | 03 | 2 | PLT-03 | T-10-05 / T-10-06 | A late offline replay whose target consultation is already `finalized` (D-38) is auto-applied as a clinical addendum via `EmrRepository.addAddendum`, and never reads or writes `ConsultationDraft` -- fixes the prior gap where `consultation.status` was never checked before running the draft/conflict diff | unit | `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts` | ✅ | ✅ done |
| 10-04-01 | 04 | 2 | PLT-03 | T-10-07 | Barcode and stock actions queue offline from the bounded working set, use bounded fallback/active-patient context, and remain usable during disconnects | component | `npx vitest run apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts` | ❌ W0 | ⬜ pending |
| 10-04-02 | 04 | 2 | PLT-03 | T-10-07 / T-10-08 / T-10-09 | Inventory replay is idempotent, FIFO-safe, and operationally reviewable when live stock state diverges | integration | `npx vitest run apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-01 | 05 | 3 | PLT-03 | T-10-08 | Sync badge, failure-center grouping, and subtle caught-up state stay visible without intrusive banners | component | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/SyncStatusBadge.test.tsx apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx` | ❌ W0 | ⬜ pending |
| 10-05-01 (verify-fix 10.4) | 05 | 3 | PLT-03 | T-10-08 | Domain-routing assertion: `SyncFailureCenterScreen.tsx` opens the structured `ClinicalConflictResolutionSheet` (D-08) instead of the generic row when a failure-center item is an EMR (`domain === 'emr'`) `SAFETY_CRITICAL` conflict, via the real, directly-tested `isClinicalConflictItem`/`resolveItemPressAction` routing decision in `lib/sync-status.ts`; a non-EMR or non-`SAFETY_CRITICAL` item's tap resolves to `NONE` and its row keeps its existing lighter-weight Retry/Escalate-only markup untouched -- fixes the prior gap where `ClinicalConflictResolutionSheet.tsx` was correctly built (Plan 10-03 Task 2) but never mounted anywhere reachable | unit/component | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` | ✅ | ✅ done |
| 10-05-02 | 05 | 3 | PLT-03 | T-10-08 / T-10-09 / T-10-10 | Guided retry ownership, clinician escalation, queue/inventory/billing stale-state prompts, and rejected (not silently applied) stale browser writes stay explicit and scoped | integration/component | `npx vitest run apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx apps/web/src/features/billing/__tests__/billing-workbench.test.tsx apps/api/src/modules/queue/__tests__/web-queue.service.test.ts apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts` | ❌ W0 | ⬜ pending |
| 10-05-02 (verify-fix 10.3) | 05 | 3 | PLT-03 | T-10-08 / T-10-09 / T-10-10 | REAL page-level proof, not just hook-level: each domain replay service (`replayIngest`, `queueOfflineReplay`, `consultationOfflineReplay`, `inventoryOfflineReplay`) now calls `ReplayBroadcastService.emit*` after a successful apply or a new conflict/failure-task record, scoped to clinic/domain/entity; `apiClient` forwards a raw error response's `.conflict` field onto `ApiClientError` alongside `.details`; and the real `QueuePage`/`BillingPage` (via `QueueBoard.tsx` mounting `useQueueReplayRealtime`+`useReplayStaleState`, and `useBillingWorkbench.ts`'s `collectPayment` 409 handler feeding the same mechanism) render `StaleStateBanner` with `status="conflict"` off a genuine scoped broadcast / rejected stale write -- not the previously-hardcoded `"stale"` string -- fixes the prior gap where `ReplayBroadcastService` was built but never called, and the browser pages never mounted the hooks that would have consumed it | unit/integration/component | `npx vitest run apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/web/src/lib/__tests__/api.test.ts apps/web/src/features/queue/__tests__/queue-board.test.tsx apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` | ✅ | ✅ done |
| 10-03-02 (verify-fix 10.5) | 03 | 2 | PLT-03 | T-10-05 / T-10-06 | `POST /consultations/:consultationId/conflicts/:conflictId/resolve` moves a `SyncConflictRecord` off `OPEN`/`GUIDED_RETRY`/`ESCALATED` via one of `ClinicalConflictResolutionSheet.tsx`'s four resolve actions -- `KEEP_LOCAL`/`KEEP_SERVER` (whole-record choices) and `MERGE_SAFE_FIELDS` (reruns `classifyClinicalConflict`'s real three-way diff against the conflict's now-persisted `baselinePayloadJson`) write through `EmrRepository.saveDraft` or, when the consultation finalized before resolution, `EmrRepository.addAddendum` (verify-fix 10.1's same post-finalization pattern); `ESCALATE` only transitions to `ESCALATED` (ownership hand-off is finding 10.6's job); resolving an already-`RESOLVED` conflict is rejected with a 409, not a silent no-op; and a conflict id from another clinic 404s rather than leaking -- fixes the prior gap where nothing could ever move a `SyncConflictRecord` to `RESOLVED` | unit/integration | `npx vitest run apps/api/src/modules/emr/__tests__/consultationConflictResolution.service.test.ts apps/api/tests/emr/consultation-conflict-resolve.test.ts` | ✅ | ✅ done |
| 10-06-01 | 06 | 4 | PLT-03 | T-10-10 / T-10-11 | Offline recovery, golden path, WhatsApp-triggered flow, browser replay visibility, WhatsApp thread/log integrity, and repeated disconnect drills all pass automated proof harnesses | e2e | `npx vitest run apps/api/tests/integration/offline-recovery.e2e.test.ts apps/api/tests/integration/walkin-to-payment.e2e.test.ts apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts apps/web/tests/integration/reconnect-live-sync.test.ts && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/multi-drop-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` | ❌ W0 | ⬜ pending |
| 10-06-02 | 06 | 4 | PLT-03 | T-10-10 / T-10-11 | Human sign-off remains blocked until the automated proof passes and the real-device drill confirms repeated drop/recover resilience plus WhatsApp thread/log integrity on target Android hardware | integration/manual | `npx vitest run apps/api/tests/integration/offline-recovery.e2e.test.ts apps/api/tests/integration/walkin-to-payment.e2e.test.ts apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts apps/web/tests/integration/reconnect-live-sync.test.ts && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/multi-drop-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` | ✅ planned | ⬜ pending |
| 10-07-01 | 07 | 4 | PLT-07 | T-10-13 / T-10-15 | API p95, queue latency, and cold-start benchmarks produce structured output with measured values, not self-reported estimates, against representative data | unit/benchmark | `npx vitest run apps/api/tests/performance/api-p95.bench.ts apps/api/tests/performance/queue-realtime-latency.bench.ts && npx tsx apps/mobile/tests/performance/cold-start.bench.ts --emulator 2>&1 \| head -5 && npx tsx scripts/perf-report.ts --help` | ❌ W0 | ⬜ pending |
| 10-07-02 | 07 | 4 | PLT-07 | T-10-13 / T-10-15 | All API endpoint groups show p95 under 500ms and queue real-time p95 under 2000ms on the assembled system; any bottleneck is fixed and re-measured | integration/benchmark | `npx vitest run apps/api/tests/performance/api-p95.bench.ts apps/api/tests/performance/queue-realtime-latency.bench.ts 2>&1 \| npx tsx scripts/perf-report.ts && echo "All API and queue targets PASS"` | ❌ W0 | ⬜ pending |
| 10-07-03 | 07 | 4 | PLT-07 | T-10-13 / T-10-14 | Human confirms cold start under 3s, API p95 under 500ms, and queue update under 2s on real mid-range Android hardware (not emulator) | benchmark/manual | `npx tsx apps/mobile/tests/performance/cold-start.bench.ts 2>&1 \| tail -3 && npx tsx scripts/perf-report.ts` | ✅ planned | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/offline-sync/__tests__/schemas.test.ts` — replay envelope, priority, and conflict-state stubs
- [ ] `apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts` — queue-first replay and preemption stubs
- [ ] `apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts` — idempotent ingest + conflict persistence stubs
- [ ] `apps/mobile/src/features/queue/__tests__/QueueBoardScreen.offline.test.tsx` — local queue truth and quiet pending-marker stubs
- [ ] `apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts` — offline check-in replay stubs
- [ ] `apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts` — reconnect priority/preemption stubs
- [ ] `apps/api/src/modules/scheduling/__tests__/queue-handoff.service.test.ts` — `EXPECTED`-arrival handoff regression stubs
- [ ] `apps/mobile/src/features/consultation/__tests__/ConsultationScreen.offline.test.tsx` — offline draft persistence and editable-screen stubs
- [ ] `apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts` — consultation replay + draft persistence stubs
- [ ] `apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts` — compare-and-resolve + clinician ownership stubs
- [ ] `apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` — structured local/server comparison sheet stubs
- [ ] `apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts` — barcode/stock replay stubs
- [ ] `apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts` — offline stock action UI hook stubs
- [ ] `apps/mobile/src/features/offline-sync/__tests__/SyncStatusBadge.test.tsx` — calm badge and subtle recovery cue stubs
- [x] `apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx` — failure center, calm badge, recovery cue stubs (verify-fix 10.4: adds the `isClinicalConflictItem`/`resolveItemPressAction` domain-routing assertions -- an EMR `SAFETY_CRITICAL` item opens `ClinicalConflictResolutionSheet`, every other item does not)
- [ ] `apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts` — guided retry and escalation ownership stubs
- [ ] `apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx` — stale-state prompt and replay broadcast stubs
- [ ] `apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` — billing stale-state prompt stubs
- [ ] `apps/api/tests/integration/offline-recovery.e2e.test.ts` — multiple drop/recover cycle integration stubs
- [ ] `apps/api/tests/integration/walkin-to-payment.e2e.test.ts` — golden path integration stubs
- [ ] `apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts` — WhatsApp-triggered clinic flow integration stubs
- [ ] `apps/web/tests/integration/reconnect-live-sync.test.ts` — browser replay/live-sync integration stubs (verify-fix 10.3: proves the reusable stale-state MECHANISM composed with real production hooks in isolated widgets; the REAL `QueuePage`/`BillingPage` rendering that same mechanism is covered separately below)
- [x] `apps/web/src/features/queue/__tests__/queue-board.test.tsx` — verify-fix 10.3: the real `QueuePage` renders `StaleStateBanner` with `status="conflict"` off a genuine scoped `replay:conflict-opened` broadcast, not just `"stale"`
- [x] `apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` — verify-fix 10.3: the real `BillingPage` renders `StaleStateBanner` with `status="conflict"` off a genuine 409 `STALE_WRITE_CONFLICT` `.conflict` payload from `collectPayment`
- [x] `apps/web/src/lib/__tests__/api.test.ts` — verify-fix 10.3: `apiClient` forwards a raw error response's `.conflict` field onto `ApiClientError`
- [ ] `apps/mobile/.maestro/offline-recovery.yaml` — real disconnect/reconnect drill script
- [ ] `apps/mobile/.maestro/multi-drop-recovery.yaml` — repeated drop/recover drill script
- [ ] `apps/mobile/.maestro/whatsapp-triggered-flow.yaml` — WhatsApp-triggered recovery drill script
- [ ] `apps/api/tests/performance/api-p95.bench.ts` — API p95 latency benchmark across endpoint groups
- [ ] `apps/api/tests/performance/queue-realtime-latency.bench.ts` — queue real-time update round-trip latency benchmark
- [ ] `apps/mobile/tests/performance/cold-start.bench.ts` — mobile cold-start measurement via adb
- [ ] `apps/mobile/.maestro/cold-start-measurement.yaml` — Maestro cold-start launch-to-visible flow
- [ ] `scripts/perf-report.ts` — aggregated performance pass/fail report

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mid-range Android device remains usable offline for several hours while check-in, note-taking, and barcode workflows continue to queue safely | PLT-03 | Hardware responsiveness, radio instability, and clinic-floor ergonomics cannot be proven by unit tests | Use a mid-range Android 8+ device, disable connectivity, perform repeated queue, consultation, and barcode actions over several hours, reconnect intermittently at least three times, and verify the badge/failure center/recovery cue states remain trustworthy |
| Browser views show replayed queue/inventory/billing changes after mobile reconnect without silently overwriting an active browser edit | PLT-03 + roadmap goal | Requires observing mobile + web together and judging stale-state prompt timing/clarity across multiple operational surfaces | Open mobile and browser for the same clinic, make offline mobile changes, reconnect, verify browser updates within the expected window and surfaces a stale/review prompt when the browser was already editing overtaken queue, inventory, or billing state |
| Final phase proof includes the WhatsApp-triggered clinic path and walk-in-to-payment golden path on real devices/networks | PLT-03 + roadmap goal | Real disconnect/reconnect drills and payment/WhatsApp handoffs are not fully credible in mocks alone | Run the Phase 10 proof checklist on real devices, including at least one WhatsApp-triggered flow, one full walk-in-to-payment flow, multiple drop/recover cycles, and explicit confirmation that the WhatsApp action stayed attached to the correct thread and message log after replay |
| All three PLT-07 performance targets pass on real mid-range Android hardware: cold start under 3s, API p95 under 500ms, queue real-time update under 2s | PLT-07 | Emulator measurements are insufficient per D-31; real-device SoC and memory constraints affect cold start and rendering performance in ways that emulators cannot reproduce | Connect a Galaxy A14, Redmi Note 12, or equivalent mid-range Android device; cold-launch the app 5 times and average TotalTime under 3000ms; confirm queue status changes appear within 2s visually; review aggregated `scripts/perf-report.ts` output showing PASS for all three categories |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
