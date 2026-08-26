# Phase 10 Verify Fix Plan

**Date:** 2026-08-26
**Source:** `/breeyo-build --verify phase 10` — 5 parallel independent reviews (one per plan grouping: foundation/10-01, queue+inventory/10-02+10-04, EMR/10-03, sync-UX+version-check/10-05, integration-proof+performance/10-06+10-07) against `.planning/phases/10-offline-hardening-integration-polish/10-CONTEXT.md` and `10-VALIDATION.md`, cross-checked by me against the live implementation and dev database.
**Purpose:** For every confirmed finding from that verify pass, identify the fix shape and which docs need updating alongside the code.

**Scope boundary:** Phase 10 only. The phase is unmerged (still on `breeyo/phase-10-offline-hardening-integration-polish`), not yet pushed through the no-mistakes gate — these fixes land in that same worktree before the gate push happens.

---

## Decisions resolved before fixing (2026-08-26)

Two findings needed a real product/design call before any code could be written. Both resolved with the user:

- **10.1 (late EMR replay after finalization):** auto-apply as an addendum, reusing Phase 4's existing `EmrService`/`EmrRepository.addAddendum` post-finalization edit path — not a new review-task type.
- **10.6 (on-duty roster source):** `OnDutyRosterProvider` resolves from Phase 8's existing `availability.repository.ts#listClinicVets(clinicId)`, minus the unreachable clinician — no new shift/on-duty tracking concept.

All other findings are code fixes with no open product question — the locked `10-CONTEXT.md` decisions already answer what correct behavior looks like; the gap was that the code didn't yet deliver it.

---

## How to read this

Each item has: **files**, **root cause**, **fix shape**, and **doc updates required**. All 11 items are owned by Phase 10's existing plans (10-01 through 10-06) — none require a new plan number.

---

### 10.1 EMR replay doesn't check `consultation.status` — late replay after finalization can silently misapply/lose a clinical edit — **needs-a-decision (RESOLVED: addendum)**

**Status: ✅ Fixed in `55bdcf5`**

- **Files:** `apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts` (never reads `consultation.status`), `apps/api/src/modules/emr/emr.service.ts` (`addAddendum`, the existing mechanism to reuse), `apps/api/src/modules/emr/emr.repository.ts` (`getConsultation`, `addAddendum`).
- **Root cause:** the replay path treats every consultation as still-draft. A `getConsultation` for an already-finalized consultation returns a real row with `status: 'FINALIZED'`, but the service never inspects it before running the draft/conflict diff — `loadDraft` returns `null` (the draft row was deleted at finalization), gets treated as `EMPTY_DRAFT`, and the offline edit is either silently dropped or recreates an orphan `ConsultationDraft` row nothing ever reads.
- **Fix shape:** at the top of `consultationOfflineReplay.service.ts`'s reconciliation function, branch on `consultation.status === 'FINALIZED'` (or whatever the real enum value is — check `emr.repository.ts`) before running the draft-diff path at all. Route finalized-target replays through `EmrService.addAddendum` instead, translating the offline SOAP/vitals/prescription payload into an addendum entry (author = originating user, timestamp = original offline edit time if available, else replay time). TDD: failing test first — replay against a finalized consultation must call `addAddendum` (or the underlying repository method) and must NOT touch `ConsultationDraft` at all.
- **Doc updates:** new D-38 in `10-CONTEXT.md` recording this resolution; new row in `10-VALIDATION.md`'s per-task table for `10-03-02` covering finalized-consultation replay; `10-03-SUMMARY.md` gets a follow-up note.

---

### 10.2 Inventory offline actions never wired into any screen — **no decision needed**

**Status: ✅ Fixed in `4985761`**

- **Files:** `apps/mobile/src/features/inventory/screens/DispenseScreen.tsx` (still uses `useFifoDispense`), `apps/mobile/src/features/inventory/screens/StockReceiptScreen.tsx` (still uses `useReceiveStock`), the stock-adjustment sheet, `apps/mobile/src/features/inventory/hooks/useOfflineStockActions.ts` (correctly built, just unreached).
- **Root cause:** Plan 10-04 built and unit-tested the full offline action store/hook but only wired the barcode scanner's read/cache-seed path; the actual mutation screens were left on their original network-only hooks.
- **Fix shape:** in each screen, catch the network-failure branch of the existing mutation (same pattern already used in `CheckInSheet.tsx`/`QueueScreen.tsx` for Plan 10-02) and fall through to `useOfflineStockActions`'s offline equivalent instead of just setting `serverError`. TDD: failing component test per screen asserting a network failure results in a queued `INVENTORY_MEDIUM` operation, not a dead-end error state.
- **Doc updates:** `10-VALIDATION.md` row `10-04-01` needs the screen-level assertion it was missing; `10-04-SUMMARY.md`'s "Deviation 2" note gets marked resolved.

---

### 10.3 `ReplayBroadcastService` never called from replay-ingest — browser stale-state push is dead in production — **no decision needed**

**Status: ✅ Fixed in `f5ce535`**

- **Files:** `apps/api/src/modules/sync/services/replayIngest.service.ts`, `apps/api/src/modules/queue/services/queueOfflineReplay.service.ts`, `apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts`, `apps/api/src/modules/inventory/services/inventoryOfflineReplay.service.ts`, `apps/api/src/modules/sync/services/replayBroadcast.service.ts` (correctly built, just unreached), and the web side: `apps/web/src/features/queue/components/QueueBoard.tsx` / `apps/web/src/features/billing/components/BillingWorkbench.tsx` (hardcode `status="stale"`, never wired to receive `"conflict"`), `apps/web/src/lib/api.ts` (`apiClient` doesn't forward `.conflict` onto `ApiClientError`).
- **Root cause:** each domain replay service applies its mutation (or creates a conflict) and returns, without ever calling `ReplayBroadcastService.emit*`. On the web side, the real pages never mount `useQueueReplayRealtime`/`useInventoryReplayRealtime`/`useReplayStaleState`, and `apiClient` doesn't carry the `.conflict` payload far enough for a real handler to use even if one existed.
- **Fix shape:** (a) each domain replay service calls the appropriate `ReplayBroadcastService.emit*` after a successful apply or a new conflict/failure-task creation, scoped to the affected clinic/domain/entity; (b) `apiClient` forwards `.conflict` onto `ApiClientError` alongside the existing `.details`; (c) `QueueBoard.tsx`/`BillingWorkbench.tsx` mount the real `useQueueReplayRealtime`/`useInventoryReplayRealtime`/`useReplayStaleState` hooks and drive `StaleStateBanner`'s actual `status` from them instead of the hardcoded `"stale"`; (d) `useBillingWorkbench.ts`'s `collectPayment` 409 handler calls `onReplayConflictOpened` instead of only setting a generic `mutationError`. TDD: failing test first for each — a real replay through the HTTP route results in a captured socket emission (test the emit, not just the service's internal state), and a real 409 HTTP response (supertest) carries `.conflict`.
- **Doc updates:** `10-VALIDATION.md` rows `10-05-02` and the `reconnect-live-sync.test.ts` row need real page-level assertions added, not just hook-level; `10-05-SUMMARY.md` and `10-06-SUMMARY.md` both get follow-up notes since both currently under-flag this as a phase-completion blocker.

---

### 10.4 `ClinicalConflictResolutionSheet` (D-08) never mounted in a real screen — **no decision needed**

**Status: ✅ Fixed in `682a976`**

- **Files:** `apps/mobile/src/features/consultation/components/ClinicalConflictResolutionSheet.tsx` (correctly built, just unreached), `apps/mobile/src/features/offline-sync/screens/SyncFailureCenterScreen.tsx` (renders only the generic row today).
- **Root cause:** `SyncFailureCenterScreen.tsx` was built domain-agnostic and never special-cases a `SAFETY_CRITICAL` clinical conflict to open the structured sheet instead of the generic retry/escalate row.
- **Fix shape:** in `SyncFailureCenterScreen.tsx`, when a failure-center item's `domain === 'emr'` (or equivalent) and `severity === 'SAFETY_CRITICAL'`, tapping it opens `ClinicalConflictResolutionSheet` instead of (or in addition to) the generic row. TDD: failing component test asserting a clinical conflict item's tap target opens the structured sheet.
- **Doc updates:** `10-VALIDATION.md` row for `SyncFailureCenterScreen.test.tsx` gets a domain-routing assertion added; `10-05-SUMMARY.md` follow-up note.

---

### 10.5 No route can move a `SyncConflictRecord` to `RESOLVED` — **no decision needed**

**Status: ✅ Fixed in `6178f86`**

- **Files:** `apps/api/src/modules/emr/controllers/consultationSync.controller.ts` (no resolve handler), `apps/api/src/modules/emr/emr.routes.ts` (no resolve route registered), `apps/mobile/src/features/consultation/components/ClinicalConflictResolutionSheet.tsx` (already defines the five actions — `KEEP_LOCAL_FIELD`/`KEEP_SERVER_FIELD`/`MERGE_SAFE_FIELDS`/retry/escalate — that just need somewhere to POST to).
- **Root cause:** the mobile UI (and 10-03-PLAN.md's own action text) already specify the valid resolution actions; the API side was never built to receive them.
- **Fix shape:** add `POST /consultations/:consultationId/conflicts/:conflictId/resolve` accepting one of the sheet's five actions, applying the corresponding field-level merge (or escalation), and transitioning `SyncConflictRecord.resolutionState` to `RESOLVED` (or `ESCALATED` for the escalate action, deferring to `retryEscalation.service.ts` — see 10.6). TDD: failing test per action verifying the correct field-level outcome and the state transition.
- **Doc updates:** `10-VALIDATION.md` needs a new row for this endpoint; `10-03-SUMMARY.md`'s Deviation 5 note gets marked resolved.

---

### 10.6 `retryEscalation.service.ts` has no live caller; `OnDutyRosterProvider` has no implementation — **needs-a-decision (RESOLVED: `listClinicVets`)**

**Status: ✅ Fixed in `5ded1ef`**

- **Files:** `apps/api/src/modules/sync/services/retryEscalation.service.ts` (correctly built, just unreached), `apps/api/src/modules/sync/routes.ts` (no retry/escalate route), a new `apps/api/src/modules/sync/services/onDutyRoster.service.ts` (or similar) implementing `OnDutyRosterProvider` against `apps/api/src/modules/scheduling/availability.repository.ts#listClinicVets`.
- **Root cause:** the escalation state machine and its interface were built ahead of both (a) a real route to trigger it, and (b) a concrete roster implementation — both were left as an explicit, disclosed deferral in `10-05-SUMMARY.md`.
- **Fix shape:** (a) implement `OnDutyRosterProvider.listOtherOnDutyClinicianIds(clinicId, excludeUserId)` by calling `listClinicVets(clinicId)` and filtering out `excludeUserId`; (b) add `POST /sync/failures/:failureTaskId/retry` and `POST /sync/failures/:failureTaskId/escalate` routes wiring to `retryEscalation.service.ts`; (c) wire the mobile `SyncFailureCenterScreen`'s Retry/Escalate buttons to these real endpoints instead of dead callbacks. TDD: failing test first for the roster provider (real `listClinicVets` call, correct exclusion) and for each route (real HTTP call transitions `SyncFailureTask.resolutionState`/`currentOwnerUserId` correctly).
- **Doc updates:** new D-39 in `10-CONTEXT.md` recording the roster resolution; `10-VALIDATION.md` gets new rows for both routes; `10-05-SUMMARY.md` Deviation note marked resolved.

---

### 10.7 Server-side `queuePreemption.service.ts` is dead code — **no decision needed**

- **Files:** `apps/api/src/modules/queue/services/queuePreemption.service.ts` (`pauseLowerTierReplayForQueue`, correctly built, just unreached), `apps/api/src/modules/queue/controllers/queueSync.controller.ts`, and by extension `apps/api/src/modules/emr/controllers/consultationSync.controller.ts` / `apps/api/src/modules/inventory/controllers/inventorySync.controller.ts` (whichever replay path should consult it).
- **Root cause:** 10-02-PLAN.md's own threat model (T-10-05) names this service as the mitigation for "lower-tier backlog starving live queue recovery" via any replay path, not only the mobile coordinator's own ordering — but no controller ever calls it, so a client bypassing the mobile coordinator (a buggy client, or a direct API call) gets no server-side ordering enforcement at all.
- **Fix shape:** wire `replayIngest.service.ts` (the shared entry point every domain replay goes through) to call `canRunQueueReplayNow`/`pauseLowerTierReplayForQueue` before applying a non-`QUEUE_HIGH` operation, deferring it if `QUEUE_HIGH` work is pending for the same clinic — genuine server-side enforcement, not just a mobile-side convention. TDD: failing test proving a direct API replay of a `CLINICAL_MEDIUM` operation is deferred while `QUEUE_HIGH` work is outstanding for the same clinic, even without going through the mobile coordinator.
- **Doc updates:** `10-VALIDATION.md` row `10-02-02` gets a server-side-enforcement assertion; `10-02-SUMMARY.md` follow-up note.

---

### 10.8 `clearWorkingSetAnchor` never called — same-day boundary defeated after first offline stretch — **no decision needed**

- **Files:** `apps/mobile/src/features/offline-sync/db/offlineDb.ts` (`clearWorkingSetAnchor`, correctly built, just unreached), `apps/mobile/src/features/offline-sync/services/syncCoordinator.ts` (the natural call site — reconnect/replay-complete).
- **Root cause:** the anchor-freeze mechanism (D-35) was built correctly but nothing calls the corresponding clear function once a reconnect cycle fully drains.
- **Fix shape:** in `syncCoordinator.ts`, once `runReplayCycle` finishes with an empty backlog across all tiers (the `CAUGHT_UP` transition), call `clearWorkingSetAnchor` so the next offline stretch gets a fresh anchor. TDD: failing test proving the anchor is cleared after a full successful replay cycle and gets re-created (to the new current time) on the next offline write.
- **Doc updates:** `10-VALIDATION.md` row `10-01-02` gets an anchor-lifecycle assertion added; `10-01-SUMMARY.md` follow-up note.

---

### 10.9 Unhandled `P2002` on concurrent duplicate replay — **no decision needed**

- **Files:** `apps/api/src/modules/sync/services/replayIngest.service.ts` (the `findUnique` → `create` pair).
- **Root cause:** no transaction or catch around the idempotency check-then-act; a genuine concurrent duplicate submission throws an uncaught `PrismaClientKnownRequestError` (P2002) that falls through to a generic 500.
- **Fix shape:** wrap the check-then-create in a `try/catch` (or a single upsert-style operation) that treats a P2002 on the exact `[clinicId, deviceId, operationId]` unique constraint as "already acknowledged" and returns the existing receipt's ack envelope instead of erroring. TDD: failing test using `Promise.all` to fire two genuinely concurrent identical replay requests, asserting both resolve successfully with equivalent ack envelopes and only one DB row exists.
- **Doc updates:** `10-VALIDATION.md` row `10-01-02` gets a concurrency-race assertion; `10-01-SUMMARY.md` follow-up note.

---

### 10.10 Browser version-check is check-then-act; only mock-based tests exist — **no decision needed**

- **Files:** `apps/api/src/realtime/browser-sync.service.ts` (`checkWriteVersion`), `apps/api/src/modules/queue/web-queue.service.ts`, `apps/api/src/modules/billing/billing-workbench.service.ts`, `apps/api/src/modules/inventory/inventory-web.service.ts`.
- **Root cause:** the version check and the eventual write are two separate reads/writes with no atomicity between them, and every existing test mocks the DB layer rather than proving behavior against two genuinely concurrent real writers.
- **Fix shape:** convert each write path's persistence step to a single conditional update (e.g. `UPDATE ... WHERE id = $1 AND updated_at = $2`, checking affected-row count is exactly 1; or wrap the read-check-write in one Prisma `$transaction` with a `SELECT ... FOR UPDATE`-equivalent) so the version check and the write are atomic. Add a real integration test (supertest against a live server + live Postgres) firing two genuinely concurrent requests with the same stale `expectedVersion` and asserting exactly one succeeds and one gets a real 409 with `.conflict` on the wire.
- **Doc updates:** `10-VALIDATION.md` row `10-05-02` gets a real-concurrency + HTTP-level assertion; `10-05-SUMMARY.md` follow-up note.

---

### 10.11 D-34 merge can pick the later-arriving replay over the earlier check-in — **no decision needed, low priority**

- **Files:** `apps/api/src/modules/queue/services/queueOfflineReplay.service.ts` (`replayCheckIn`).
- **Root cause:** the merge keeps whichever operation's replay reaches the server first, not the one with the earlier payload-provided `checkedInAt`.
- **Fix shape:** when merging, compare the two operations' payload `checkedInAt` timestamps (not arrival order) and keep the entry with the earlier one, updating position/metadata accordingly if the "losing" operation was actually first. TDD: failing test simulating out-of-order arrival (later network delivery of the chronologically-earlier check-in) and asserting the earlier timestamp wins.
- **Doc updates:** `10-VALIDATION.md` row `10-02-02` gets an out-of-order-arrival assertion; `10-02-SUMMARY.md` follow-up note.

---

## Execution order

10.1 and 10.6 had their decisions resolved above and now proceed as normal TDD fixes alongside the rest. 10.5 (resolve route) should land after 10.4 (sheet wiring) since the sheet is what calls it, and after 10.1 is at least started (both touch EMR conflict lifecycle). 10.6 (retry/escalate routes) should land after 10.3 (broadcast wiring) since escalation events are one of the broadcast types. Otherwise items are independent and can proceed in any order.
