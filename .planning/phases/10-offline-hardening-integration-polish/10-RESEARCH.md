# Phase 10: Offline Hardening & Integration Polish - Research

**Researched:** 2026-05-07  
**Domain:** Offline-first mobile sync, domain-aware conflict handling, reconnect prioritization, cross-surface replay visibility, and end-to-end resilience proof  
**Confidence:** HIGH for architecture shape, replay priorities, and conflict model; MEDIUM for final performance envelope on real mid-range Android hardware until the earlier phases are implemented.

## Summary

Phase 10 should add a dedicated **`offline-sync` capability** that sits beside the existing queue, EMR, inventory, billing, WhatsApp, and web-dashboard bounded contexts rather than burying offline logic separately inside each screen. The mobile app should own a local SQLite-backed operations ledger and same-day working-set cache; the API should own idempotent replay ingestion, conflict records, failure tasks, and replay broadcasts to mobile/web clients.

Recommended architecture:

1. **Authoritative local write queue:** use `expo-sqlite` for `sync_operations`, `sync_conflicts`, `sync_failure_tasks`, and same-day cache tables. Use transactional writes (`withTransactionAsync`) for enqueue + snapshot updates. This satisfies D-01 through D-04 and D-15 through D-17.
2. **Domain-aware sync coordinator:** use a shared `offline-sync` contract layer plus a mobile `SyncCoordinator` that always replays **queue actions first**, then replays the remaining backlog by operational priority tier rather than raw timestamp order. This satisfies D-12 through D-14 exactly.
3. **Human-reviewed conflicts, not silent merge:** use server-side conflict records with explicit local/server payload snapshots. Clinical conflicts get a structured compare-and-resolve sheet with clinician ownership; queue and inventory conflicts get lighter operational review cards. This fits D-05 through D-11 and rejects broad last-write-wins behavior.
4. **React Query is cache, not authority:** persist query cache for reads and resumed app state, but keep the authoritative write backlog in SQLite. TanStack Query's `offlineFirst` mode and persisted cache are useful for reads, but generic paused-mutation persistence should not replace the explicit sync queue because the phase needs domain-specific ordering, retry ownership, and review-before-overwrite semantics.
5. **Avoid WatermelonDB as the primary sync engine for this phase:** WatermelonDB's generic pull/push protocol and default client-wins conflict resolver are strong for broad offline CRUD, but they conflict with Breeyo's locked decisions requiring clinician-owned resolution, explicit local/server comparison sheets, and operational replay tiers. Use a custom domain-aware queue over `expo-sqlite` instead.

The offline data window should stay intentionally narrow: **today's queue, active patients, today's consultations/drafts, and inventory items in motion** are the main offline dataset. Historical records outside the active working set can appear only as limited read-only fallback context. This avoids the anti-pattern in architecture research that warned against syncing full EMR history to every device.

The final proof bar for Phase 10 must combine automated integration coverage with **real disconnect/reconnect drills on a mid-range Android device**. Automated tests should prove replay ordering, conflict detection, and cross-module handoffs; manual verification must prove multi-drop recovery, several-hour usability, and the WhatsApp-triggered clinic flow named in D-29.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01 to D-04: Check-in, barcode scanning, and note-taking must remain fully editable offline; safe live-service actions are captured locally and synced later; offline queue entries are operationally real; stock actions reconcile after reconnect.
- D-05 to D-11: Default conflict posture is review-before-overwrite; EMR gets strongest protection; auto-merge is only for clearly non-destructive cases; clinical resolution uses a structured compare sheet; clinician owns clinical conflict resolution when possible; queue/inventory use lighter operational review; unresolved conflicts remain visible until cleared.
- D-12 to D-14: Queue replay is first on reconnect, remaining work replays by operational priority tier, and higher-priority work can preempt lower-priority backlog replay.
- D-15 to D-17: Offline data target is a same-day working set centered on current queue, active patients, today's consultations, and stock in motion; older data can be limited read-only fallback only.
- D-18 to D-21: Sync state is always visible; pending work uses a calm persistent badge; failed items escalate into an actionable failure center; successful recovery uses a subtle cue.
- D-22 to D-24: Originating user owns the first retry, guided retry happens before escalation, and safety-critical escalation hands off to the assigned clinician.
- D-25 to D-33: Phase completion requires more than one happy path, including offline recovery and a WhatsApp-triggered clinic flow; proof must use real disconnect/reconnect drills, fix integrity issues first, fix even non-critical proof failures before sign-off, cover mid-range Android under flaky networks, remain useful for several hours offline, and include multiple drop/recover cycles.

### Deferred Ideas (OUT OF SCOPE)
- None. The discuss artifact kept all ideas inside Phase 10 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLT-03 | Core mobile flows (checkin, barcode scan, note-taking) work offline with auto-sync | Shared offline-sync contracts, SQLite operations ledger, queue-first replay coordinator, domain-specific replay adapters, explicit conflict records, calm badge + failure center UX, and automated/manual reconnect proof |

## Goal Coverage Beyond REQ-IDs

The roadmap goal adds two additional planning obligations beyond PLT-03:

1. **Cross-surface integration proof** — walk-in through invoice payment must work across mobile and web after replay/reconnect.
2. **Graceful conflict handling** — replay cannot silently lose data; conflict ownership and visibility are part of the deliverable, not optional polish.
</phase_requirements>

## Standard Stack

| Library / System | Purpose in Phase 10 | Recommendation |
|------------------|--------------------|----------------|
| `expo-sqlite` | Authoritative local operations ledger and same-day working-set cache on mobile | Use transactional tables for operations, attempts, conflicts, failure tasks, queue snapshot, active patient snapshot, consultation draft snapshot, and inventory working-set snapshot |
| TanStack Query | Persisted read cache and reconnect-friendly server-state invalidation | Use `PersistQueryClientProvider`, `createAsyncStoragePersister`, and `networkMode: 'offlineFirst'` for reads; do not make paused mutations the authoritative write queue |
| Zustand | Ephemeral sync UX state | Use for visible sync badge state, currently open failure-center section, and replay-progress UI only; keep authoritative data out of Zustand |
| Fastify + REST | Idempotent replay ingestion and domain-specific sync endpoints | Add an API `sync` module that validates replay envelopes, applies idempotency by `deviceId + operationId`, persists conflict/failure records, and emits replay broadcasts |
| Prisma + PostgreSQL | Server persistence for replay receipts, conflict records, retry tasks, and domain-side reconciliation state | Add clinic-scoped sync tables and indexes on replay idempotency, conflict visibility, and retry ownership |
| Socket.IO + Redis | Post-replay live updates to other mobile and web clients | Broadcast only the affected domain/window so browser/mobile prompt stale-state review instead of silently overwriting local views |
| BullMQ + Redis | Retry scheduling, escalation timing, and delayed replay continuation | Use named queues such as `sync-retry`, `sync-escalation`, and `replay-broadcast` with bounded retries and priority-aware scheduling |
| Maestro + Vitest | Automated resilience proof | Use Vitest for sync engine/domain adapters and Maestro for user-path drills across disconnect/reconnect cycles; keep real-device human verification as a blocking checkpoint |

## Architecture Patterns

### Recommended Module Structure

```text
packages/shared/src/offline-sync/
  constants.ts
  types.ts
  schemas.ts

apps/mobile/src/features/offline-sync/
  db/offlineDb.ts
  services/syncCoordinator.ts
  services/retryGuide.ts
  hooks/useSyncStatus.ts
  store/syncUiStore.ts
  components/SyncStatusBadge.tsx
  screens/SyncFailureCenterScreen.tsx

apps/api/src/modules/sync/
  services/replayIngest.service.ts
  services/retryEscalation.service.ts
  services/replayBroadcast.service.ts
  controllers/replay.controller.ts
  routes.ts

apps/api/src/modules/queue/
  services/queueOfflineReplay.service.ts

apps/api/src/modules/emr/
  services/consultationOfflineReplay.service.ts
  services/clinicalConflict.service.ts

apps/api/src/modules/inventory/
  services/inventoryOfflineReplay.service.ts
  services/inventoryConflictReview.service.ts
```

### Pattern 1: Queue-First Replay Ladder

Replay order should be explicit and shared across mobile + API:

1. `QUEUE_HIGH`
2. `CLINICAL_MEDIUM`
3. `INVENTORY_MEDIUM`
4. `ANCILLARY_LOW` (notifications, secondary refreshes, non-critical derived updates)

This is not just a sort key. The coordinator must allow a newly arrived higher-priority item to preempt lower-priority replay that has not started yet. That is the concrete implementation of D-12 through D-14.

### Pattern 2: Structured Conflict Records Instead of Generic Client-Wins

Use one canonical conflict envelope that stores:

- `conflictId`
- `clinicId`
- `domain`
- `entityType`
- `entityId`
- `localPayloadJson`
- `serverPayloadJson`
- `localChangedFieldsJson`
- `serverChangedFieldsJson`
- `recommendedOwnerUserId`
- `severity`
- `resolutionState`

Clinical conflicts should open a structured resolution sheet comparing local vs server values side by side, with explicit actions such as `KEEP_LOCAL_FIELD`, `KEEP_SERVER_FIELD`, `MERGE_SAFE_FIELDS`, and `ESCALATE_TO_CLINICIAN`. Queue and inventory should use lighter cards that highlight only the operational mismatch and offer a guided retry or review choice.

### Pattern 3: Same-Day Working Set Cache

Follow the roadmap and architecture research by caching only:

- today's queue
- active patients referenced by pending queue or consultation work
- today's consultation drafts / active consultation context
- inventory items actively scanned, dispensed, received, or adjusted today

Historical records can be retained as narrow read-only fallback summaries but not as a full offline mirror of the clinic database.

### Pattern 4: Originating-User Retry, Then Escalate

Every failed replay item should persist a `SyncFailureTask` with:

- `originatingUserId`
- `currentOwnerUserId`
- `guidedRetryCount`
- `nextSuggestedAction`
- `escalationRole`

First retry stays with the originating user. After a guided retry fails, escalate. For safety-critical EMR conflicts, escalation owner should be the assigned clinician per D-24. For queue/inventory operational items, escalation can move to the current staff role responsible for that workflow, but the failure must remain visible until resolved.

### Pattern 5: Replay Broadcasts Must Respect Phase 9 Stale-State Rules

When offline replay changes queue, billing, or inventory state, web/mobile clients should receive **scoped replay broadcasts** that invalidate only affected data windows and trigger stale-state prompts where a user is actively viewing an overtaken record. Do not silently replace an in-progress browser view.

## Data Model Guidance

Recommended server-side Prisma additions:

- `SyncReplayReceipt` — idempotency ledger for `deviceId + operationId + clinicId`
- `SyncConflictRecord` — persistent compare-and-resolve object for replay conflicts
- `SyncFailureTask` — actionable retry/escalation item shown in the failure center
- `DeviceSyncCursor` — optional per-device watermark for replay acknowledgements and same-day refresh windows

Important fields:

- `SyncReplayReceipt.deviceId`
- `SyncReplayReceipt.operationId`
- `SyncReplayReceipt.domain`
- `SyncReplayReceipt.status`
- `SyncConflictRecord.localPayloadJson`
- `SyncConflictRecord.serverPayloadJson`
- `SyncConflictRecord.recommendedOwnerUserId`
- `SyncConflictRecord.resolutionState`
- `SyncFailureTask.originatingUserId`
- `SyncFailureTask.currentOwnerUserId`
- `SyncFailureTask.guidedRetryCount`
- `SyncFailureTask.nextSuggestedAction`

Recommended local SQLite tables:

- `sync_operations`
- `sync_operation_attempts`
- `sync_conflicts`
- `sync_failure_tasks`
- `queue_snapshot`
- `active_patient_snapshot`
- `consultation_draft_snapshot`
- `inventory_working_set_snapshot`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authoritative offline writes | React Query paused mutations as the only write queue | Explicit SQLite operations ledger + SyncCoordinator | Breeyo needs queue-first replay, persistent failure ownership, and domain-specific conflict semantics |
| Broad automatic conflict merge | Generic last-write-wins or per-column client-wins everywhere | Conflict envelopes + clinical resolution sheet + lighter queue/inventory review | D-05 through D-10 reject silent overwrite and broad auto-merge |
| Full offline clinic mirror | Complete patient/EMR/history database on device | Same-day working-set cache plus narrow read-only fallback | Matches D-15 through D-17 and avoids the architecture anti-pattern for EMR bloat |
| Replay ordering | Timestamp-only FIFO | Explicit operational priority tiers with queue-first preemption | D-12 through D-14 are stronger than normal FIFO replay |
| Sync visibility | Toast-only success/failure alerts | Calm persistent badge + actionable failure center + subtle recovery cue | D-18 through D-21 define the UX posture explicitly |
| Real-device proof | Emulator-only confidence | Vitest + Maestro + blocking human verification on mid-range Android | D-27 and D-31 through D-33 require real disconnect/reconnect drills |

## Common Pitfalls

1. **Using WatermelonDB sync as-is.** Its default conflict direction is too generic for clinician-owned review and structured comparison.
2. **Treating offline queue entries as draft placeholders.** D-03 says they are operationally real to staff on the device.
3. **Replaying raw timestamp order.** That violates the reconnect priority decisions.
4. **Caching too much clinical history.** Architecture research explicitly warns against syncing full EMR history to devices.
5. **Hiding pending or failed sync state behind transient banners.** This violates D-18 through D-20 and makes the app feel untrustworthy.
6. **Stopping after one clean reconnect.** The proof bar requires repeated drop/recover cycles and several-hour usability.
7. **Running proof only on emulator or simulator.** The phase requires a real mid-range Android drill.

## Open Questions (RESOLVED FOR PLANNING)

1. **Which local data layer best fits the phase?** Resolved for planning: `expo-sqlite` for authoritative local queue + snapshots, TanStack Query persistence for read cache, and no WatermelonDB primary sync engine.
2. **How should replay priorities be represented?** Resolved for planning: explicit shared priority enums `QUEUE_HIGH`, `CLINICAL_MEDIUM`, `INVENTORY_MEDIUM`, `ANCILLARY_LOW` with queue-first preemption.
3. **How should clinical conflicts differ from queue/inventory conflicts?** Resolved for planning: structured compare-and-resolve sheet with clinician ownership for EMR; lighter operational review cards for queue and inventory.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + Maestro |
| Quick API/mobile command | `npx vitest run apps/api/src/modules/sync/__tests__ apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/offline-sync/__tests__` |
| Full suite command | `npm test && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PLT-03 | Queue check-ins can be created offline, remain visible locally, and replay before lower-priority work | integration | `npx vitest run apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts` | Wave 0 |
| PLT-03 | Consultation notes stay editable offline and conflicts open a structured compare-and-resolve flow owned by the clinician when required | integration/component | `npx vitest run apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx` | Wave 0 |
| PLT-03 | Barcode scan and stock changes work offline and reconcile with FIFO-safe operational review on reconnect | integration | `npx vitest run apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts` | Wave 0 |
| PLT-03 | Sync status, pending work, failure ownership, and escalation remain visible in normal clinic use | component/integration | `npx vitest run apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts` | Wave 0 |
| PLT-03 + roadmap goal | Walk-in → consultation → dispense → invoice/payment and WhatsApp-triggered recovery flows survive disconnect/reconnect cycles and resync across mobile/web | e2e | `npx vitest run apps/api/tests/integration/offline-recovery.e2e.test.ts apps/api/tests/integration/walkin-to-payment.e2e.test.ts apps/web/tests/integration/reconnect-live-sync.test.ts && npx maestro test apps/mobile/.maestro/offline-recovery.yaml && npx maestro test apps/mobile/.maestro/whatsapp-triggered-flow.yaml` | Wave 0 |

### Wave 0 Gaps

- [ ] `packages/shared/src/offline-sync/__tests__/schemas.test.ts`
- [ ] `apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts`
- [ ] `apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts`
- [ ] `apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts`
- [ ] `apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts`
- [ ] `apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts`
- [ ] `apps/api/src/modules/emr/__tests__/clinicalConflict.service.test.ts`
- [ ] `apps/mobile/src/features/consultation/__tests__/ClinicalConflictResolutionSheet.test.tsx`
- [ ] `apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts`
- [ ] `apps/mobile/src/features/inventory/__tests__/offlineStockActions.test.ts`
- [ ] `apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx`
- [ ] `apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts`
- [ ] `apps/api/tests/integration/offline-recovery.e2e.test.ts`
- [ ] `apps/api/tests/integration/walkin-to-payment.e2e.test.ts`
- [ ] `apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts`
- [ ] `apps/web/tests/integration/reconnect-live-sync.test.ts`
- [ ] `apps/mobile/.maestro/offline-recovery.yaml`
- [ ] `apps/mobile/.maestro/multi-drop-recovery.yaml`
- [ ] `apps/mobile/.maestro/whatsapp-triggered-flow.yaml`

## Security and Privacy Considerations

- Derive `clinicId`, `userId`, and role server-side for replayed operations; never trust client-supplied clinic ownership.
- Validate every replay envelope with shared zod schemas before any domain handler runs.
- Store only the same-day working set locally; do not cache full historical EMR or cross-clinic data on-device.
- Persist conflict and failure ownership records so unresolved safety-critical items remain auditable and visible.
- Make replay ingestion idempotent by `deviceId + operationId` to prevent duplicate queue entries, stock deductions, or consultation changes after reconnect flapping.
- Emit scoped replay broadcasts so web/mobile surfaces can prompt stale-state review without exposing unrelated clinic data.

## Sources

### Primary
- `.planning/phases/10-offline-hardening-integration-polish/10-CONTEXT.md` — locked Phase 10 decisions D-01 through D-33.
- `.planning/ROADMAP.md` — Phase 10 goal, success criteria, and requirement mapping.
- `.planning/REQUIREMENTS.md` — PLT-03.
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` — queue-first operating model and prior explicit offline deferral.
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` — consultation draft, audit sensitivity, and medical-integrity constraints.
- `.planning/phases/05-inventory-management/05-CONTEXT.md` — offline barcode scanning assumptions, FIFO stock model, and stock-in-motion semantics.
- `.planning/phases/07-whatsapp-communication/07-CONTEXT.md` — WhatsApp-triggered clinic flows and retry/task patterns.
- `.planning/phases/08-scheduling-calendar/08-CONTEXT.md` and `08-RESEARCH.md` — queue/schedule coexistence and stale-state/live-sync expectations.
- `.planning/phases/09-web-dashboard-owner-portal/09-CONTEXT.md` and `09-RESEARCH.md` — browser stale/conflict prompts and cross-device live-sync posture.
- `.planning/research/ARCHITECTURE.md` — offline-first sync queue pattern and anti-pattern against full EMR mirror.
- `.planning/research/PITFALLS.md` — offline support pitfalls, conflict gotchas, and real-device verification checklist.
- `.planning/research/STACK.md` — React Query persistence, Zustand, Expo, Redis, BullMQ, and mobile-offline stack guidance.

### External Documentation Notes
- TanStack Query docs: persisted React Native query cache via `PersistQueryClientProvider` and `createAsyncStoragePersister`; `networkMode: 'offlineFirst'`; paused mutation resumption requires a default mutation function.
- Expo SQLite docs: `withTransactionAsync` for atomic commit/rollback, `prepareAsync` and `executeAsync` for repeated statements, and explicit finalization of prepared statements.
- WatermelonDB docs: generic `pull` / `push` sync protocol and conflict resolver exist, but the default conflict style is too broad for Breeyo's clinician-owned review requirements.

## Metadata

**Confidence breakdown:**
- SQLite-backed authoritative write queue: HIGH
- Queue-first replay ordering and preemption: HIGH
- Clinical conflict ownership and resolution sheet model: HIGH
- Web stale-state surfacing after replay: HIGH
- Real-device performance budget before implementation: MEDIUM

**Research date:** 2026-05-07  
**Valid until:** 2026-06-07; refresh if the mobile local-storage strategy or replay-conflict posture changes.
