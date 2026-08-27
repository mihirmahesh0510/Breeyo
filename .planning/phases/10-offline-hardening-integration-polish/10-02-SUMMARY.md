---
phase: 10-offline-hardening-integration-polish
plan: 02
subsystem: offline-queue-actions-and-replay
tags: [zustand, expo-secure-store, fastify, zod, TDD, replay, idempotency, preemption, auto-merge]
dependency_graph:
  requires: [10-01]
  provides: [offline-queue-actions, queue-offline-store, queue-replay-reconciliation, queue-preemption-service, queue-sync-endpoint]
  affects: [10-03, 10-04, 10-05, 10-06]
tech_stack:
  added: []
  patterns: [network-vs-server-error-classification, local-queue-projection-merge, queue-first-preemption, duplicate-checkin-auto-merge, operational-review-via-shared-conflict-table]
key_files:
  created:
    - apps/mobile/src/features/queue/hooks/useOfflineQueueActions.ts
    - apps/mobile/src/features/queue/store/queueOfflineStore.ts
    - apps/mobile/src/features/queue/store/__tests__/queueOfflineStore.test.ts
    - apps/mobile/src/features/queue/lib/queue-offline-utils.ts
    - apps/mobile/src/features/queue/lib/__tests__/queue-offline-utils.test.ts
    - apps/api/src/modules/queue/services/queueOfflineReplay.service.ts
    - apps/api/src/modules/queue/services/queuePreemption.service.ts
    - apps/api/src/modules/queue/controllers/queueSync.controller.ts
    - apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts
    - apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts
  modified:
    - apps/mobile/src/features/queue/screens/QueueScreen.tsx
    - apps/mobile/src/features/queue/components/QueueCardItem.tsx
    - apps/mobile/src/features/queue/components/CheckInSheet.tsx
    - apps/mobile/src/features/queue/components/OfflineBanner.tsx
    - apps/api/src/modules/queue/queue.routes.ts
    - vitest.config.ts (repo root; appended Plan 10-02 mobile queue test path)
metrics:
  duration: ~1 session, fully TDD (RED confirmed before every implementation file)
  completed: 2026-08-24
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 02: Offline Queue Actions and Queue-First Replay Summary

Made the walk-in queue fully operational offline: check-in/status-transition/no-show/call-next all fall back to a locally-queued `QUEUE_HIGH` operation instead of hard-failing when the server is unreachable, the queue board renders those entries immediately as real (not placeholder) work with a quiet pending marker, and the server-side replay path is idempotent, queue-first, and auto-merges duplicate offline check-ins of the same patient from two devices into one queue entry (D-34) rather than creating a second live entry.

Built strictly test-first: every acceptance criterion had a failing test confirmed RED before its implementation was written.

## What Was Built

### Task 1: Mobile offline queue actions, local store, optimistic rendering (TDD)

- **`apps/mobile/src/features/queue/lib/queue-offline-utils.ts`** (new, RN-free — same pattern as the existing `queue-optimistic.ts`/`queue-board-utils.ts`, since `apps/mobile`'s vitest runs in plain `node` with no Metro/Babel transform and cannot import `react-native`/`expo-haptics` directly): `buildQueueCheckInEnvelope`/`buildQueueStatusTransitionEnvelope` (both stamp `ReplayPriority.QUEUE_HIGH`), `isNetworkFailure` (an `ApiClientError` means the server was reached and responded — not a connectivity failure, must not be swallowed into an offline capture), `mergeLocalQueueEntriesIntoBoard` (renders a pending local entry in the SAME section a synced entry with that status would occupy, annotated with `pendingReplayState`, never a separate "pending" area), `findEntryInBoard`.
- **`apps/mobile/src/features/queue/store/queueOfflineStore.ts`** (zustand, RN-free) — `localEntriesById` keyed by queue entry id, `applyLocalQueueOperation` (`CHECK_IN` | `STATUS_TRANSITION`, the latter accepting an optional `baseEntry` so an already-synced entry mutated offline for the first time can be seeded), `pendingReplayState` per entry (reusing the shared `SyncVisibilityState` rather than a bespoke enum), `markReplaySucceeded`/`markReplayFailed`/`clearLocalEntry`.
- **`apps/mobile/src/features/queue/hooks/useOfflineQueueActions.ts`** — `checkIn`/`updateStatus`/`noShow`/`callNext`/`enqueueOfflineOperation`. Every mutation tries the normal online request first (unchanged behavior on a healthy connection); only a network failure (not a server rejection like `SAME_DAY_RECHECK`) triggers the offline fallback: persist a `QUEUE_HIGH` envelope into the Plan 10-01 SQLite ledger (`enqueueOperation`) and project the change into `queueOfflineStore` so it renders immediately. A per-installation device id is generated once and persisted via `expo-secure-store` (no existing device-id resolver was present anywhere in the mobile app to reuse).
- **Wired into `QueueScreen.tsx`** (the plan's `QueueBoardScreen.tsx` — see deviation 1): merges `queueOfflineStore`'s local entries onto the fetched board before rendering (`mergedQueueData`), routes `handleStatusChange`/`handleNoShow`/`handleCallNext`/`handleExpectedCheckIn`/`handleExpectedNoShow`'s `onError` into the offline hook when the online mutation fails for a connectivity reason, and removes the `isOffline`-based disabling of the FAB/Call Next button/board (offline no longer blocks queue interaction, per D-01 to D-03).
- **`QueueCardItem.tsx`** renders a quiet `cloud-sync-outline`/`cloud-alert` marker next to the pet name when an entry carries a pending/failed `pendingReplayState` — never a blocking modal, never a separate section (D-19).
- **`OfflineBanner.tsx`** copy changed from "Queue may be outdated" to "Changes will sync when you're back online" — the old wording implied broken/stale data, which stopped being true once offline queue actions became real work (D-03).
- Tests: `queue-offline-utils.test.ts` (12), `queueOfflineStore.test.ts` (7) — both RN-free and run directly under vitest.

### Task 2: Queue replay reconciliation, preemption, D-34 auto-merge (TDD)

- **`apps/api/src/modules/queue/services/queuePreemption.service.ts`** — `QueuePreemptionService` with `canRunQueueReplayNow()` (always `true`) and `pauseLowerTierReplayForQueue({ currentTierPriority, queueHighPendingCount })`. D-37 is enforced structurally: the input type has no severity field at all, so nothing can key off conflict severity to skip the pause — a `SAFETY_CRITICAL` item in `CLINICAL_MEDIUM` still waits behind pending `QUEUE_HIGH` work like any other `CLINICAL_MEDIUM` item.
- **`apps/api/src/modules/queue/services/queueOfflineReplay.service.ts`** — `QueueOfflineReplayService.replayQueueOperation` dispatches on `entityType` (`QUEUE_CHECK_IN` | `QUEUE_STATUS_TRANSITION`) after validating the envelope with the shared `offlineOperationEnvelopeSchema` and checking idempotency against the **same** `SyncReplayReceipt` table Plan 10-01's `ReplayIngestService` uses (read/write directly, not a second ledger). Status transitions reuse the exact Phase 3 rules (`isValidTransition`, `treatingVetId`/`calledAt`/`completedAt`/`checkedInAt`+position-on-WAITING stamping) so a replay can never produce a state the live online path couldn't. Mismatches (`entry` missing, already archived, invalid transition) call `createOperationalReviewTask` — a lightweight `OPERATIONAL`-severity row in the shared `SyncConflictRecord` table (D-10) — instead of silently overwriting.
  - **D-34**: a check-in replay that finds an existing active entry for the same pet/day (necessarily from a different operation, since this operation's own id was just proven new by the receipt check) auto-merges into it — keeps the earlier entry's check-in time/position, discards the duplicate, records one lightweight review note — rather than creating a second live entry. A dedicated end-to-end test drives two independent `QueueOfflineReplayService.replayQueueOperation` calls from two device contexts through an in-memory fake gateway and asserts exactly one entry results.
- **`apps/api/src/modules/queue/controllers/queueSync.controller.ts`** — `createQueueSyncController`/`buildQueueOfflineReplayService`. Iterates a batch's operations in order, dispatches `QUEUE_HIGH` envelopes to `replayQueueOperation`, and defers (untouched) any non-`QUEUE_HIGH` envelope that lands in this endpoint by mistake rather than absorbing it — the queue endpoint never processes lower-tier work and never downgrades queue replay into a shared tier.
- **Wired into `queue.routes.ts`** — new `POST /api/v1/queue/sync/replay` route, `authenticate` + `tenantContext` guarded, alongside the existing queue routes (see deviation 2).
- Tests: `queuePreemption.service.test.ts` (9), `queueOfflineReplay.service.test.ts` (12, including the D-34 merge test and the full-flow two-device test).

## Deviations From the Plan (flagged, not silently made)

1. **`QueueBoardScreen.tsx` → `QueueScreen.tsx`.** No `QueueBoardScreen.tsx` exists in this repo; the actual queue screen (with the check-in FAB, call-next button, board, and offline banner already wired up) is `apps/mobile/src/features/queue/screens/QueueScreen.tsx`. Same kind of stale-path correction 10-01 made for `packages/shared`.
2. **`queue.routes.ts` and `CheckInSheet.tsx` touched, though not in the plan's `files_modified` list.** Neither `queueOfflineReplay.service.ts`/`queuePreemption.service.ts`/`queueSync.controller.ts` nor `useOfflineQueueActions.ts` are reachable from real traffic without route registration and a real UI call site. `queueSync.controller.ts`'s handler is registered as a new route inside the existing `queue.routes.ts` (not a new top-level `app.ts` registration) and `CheckInSheet.tsx`'s check-in call was switched from the old always-online `useCheckIn()` to `useOfflineQueueActions().checkIn()` — otherwise the flagship "offline check-in" behavior the plan opens with would be entirely unreachable dead code. `useCheckIn.ts` itself was left unchanged (still used by `RegisterPatientScreen.tsx`'s new-patient-registration-then-check-in flow, which is out of this plan's stated scope — only "returning-patient check-in" is named in the plan's behavior list).
3. **Two new RN-free helper files not named in the plan**: `apps/mobile/src/features/queue/lib/queue-offline-utils.ts` (envelope builders, network-error classification, board-merge logic) and its test. Following the established `queue-optimistic.ts`/`queue-board-utils.ts` convention documented in `QueueBoard.test.tsx`'s own header comment — `apps/mobile` runs vitest in plain `node` with no Metro/Babel transform, so any file importing `react-native`/`expo-haptics` (which `useOfflineQueueActions.ts`/`QueueScreen.tsx` both do) cannot be exercised directly; the actual decisions live in this RN-free module instead.
4. **No device-id resolver existed anywhere in the mobile app to reuse** (confirmed by search — push notification registration only references an endpoint path, never generates or resolves a device id itself). `useOfflineQueueActions.ts` adds a minimal one (`getOrCreateDeviceId`, backed by `expo-secure-store`, the same mechanism already used for auth tokens) scoped to this hook rather than building a separate shared device-identity subsystem.
5. **Offline call-next has no live server to authoritatively pick "next."** The online path is unchanged (still calls `POST /queue/call-next`, letting the server pick). Only on a network failure does the mobile hook fall back to the caller's own already-merged local `waiting` array (`currentWaitingEntries[0]`) and issue that as a normal `STATUS_TRANSITION` envelope to `IN_CONSULT` — server-side this is indistinguishable from any other offline status transition and goes through the same Phase 3 state-machine validation on replay.
6. **Offline check-in assumes the pet/owner have already been resolved client-side** (via `CheckInSheet.tsx`'s existing `useLookupOwner` lookup, which may itself be served from React Query's cache if queried earlier while online). This plan does not solve "search for a brand-new mobile number from a cold, fully offline start" — that is the same-day active-patient/working-set caching concern the phase context assigns to a different domain adapter, not queue's own replay/action hook.
7. **`apps/api/.env` created locally (git-ignored, not committed)** so the full DB-backed API test suite could run against the already-running local Postgres/Redis dev containers — `tests/helpers/setup.ts` loads `apps/api/.env` via `dotenv` and none existed in this worktree.

## `queue-handoff.service.test.ts` (Phase 8)

Already existed (`apps/api/src/modules/scheduling/__tests__/queue-handoff.service.test.ts`, 9 tests, from Phase 8's scheduling/queue handoff work) — not created or modified. Re-run after this plan's changes: still 9/9 passing, confirming the EXPECTED-arrival handoff semantics (`queuePriorityAt` pinned to slot time, EXPECTED excluded from midnight archive, etc.) are untouched by the new queue replay path.

## Task Commits

Both tasks were implemented and verified together in one session (the two services' tests share fixtures and were developed in the same TDD loop); committed as a single commit per this plan's completion.

_All TDD tasks followed the iron law: the failing test was written and run first (confirmed RED), then the minimal implementation was added until it passed._

## Verification

```
npx vitest run apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts
```
21/21 passing (12 + 9).

Additional verification run beyond the plan's gate:
- `apps/api` full suite (real Postgres 16 + Redis 7, `apps/api/.env` pointed at the local dev containers): **159 test files, 1990 tests passed**, 0 failed (9 skipped, 80 todo — pre-existing).
- `apps/mobile` full suite: **47 test files, 761 tests passed**, 0 failed.
- Root aggregate `npx vitest run` (the cross-package sweep `vitest.config.ts` defines): **56 test files, 790 tests passed**, 0 failed.
- `npx tsc --noEmit` in `apps/api` and `apps/mobile`: no new type errors introduced by any file this plan touched (both packages carry pre-existing, unrelated type errors predating this plan; neither package's `build` script actually runs `tsc` as a gate).

## Verify-Fix Follow-Up

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.7**: a `no-mistakes --verify phase 10` pass found `QueuePreemptionService.pauseLowerTierReplayForQueue` -- correctly built by this plan's own Task 1 -- had zero live callers anywhere in the codebase. `queueSync.controller.ts` only exposes `canRunQueueReplayNow()` (always `true`, since queue is always tier 0) but never calls `pauseLowerTierReplayForQueue` against any other tier, and no other replay path called it either. A client that skipped the mobile coordinator's own tier-sequencing -- a buggy client, or a direct API call -- got zero server-side D-12 to D-14 ordering enforcement: nothing stopped a `CLINICAL_MEDIUM`/`INVENTORY_MEDIUM`/`ANCILLARY_LOW` operation from being applied ahead of outstanding `QUEUE_HIGH` work.

Fixed in `apps/api/src/modules/sync/services/replayIngest.service.ts` (Plan 10-01's shared `/sync/replay` ingress, reachable for any domain by any client). `ReplayIngestService.ingest` now pre-scans each clinic-scoped batch for `QUEUE_HIGH` envelopes that do not already have a `SyncReplayReceipt` (so a harmless duplicate resend never falsely counts as outstanding backlog), builds a `queueHighPending` set from that, and calls `QueuePreemptionService.pauseLowerTierReplayForQueue({ currentTierPriority, queueHighPendingCount: queueHighPending.size })` before applying any non-`QUEUE_HIGH` operation. A deferred operation is pushed to `deferredOperationIds` and never gets a receipt written. A `QUEUE_HIGH` operation itself skips the check entirely (D-12: always tier 0), and one deferred by an open conflict (D-05) is deliberately NOT removed from the pending set -- an unresolved conflict means the queue-tier operation is still not acknowledged, so lower tiers keep waiting on it too. D-37 holds structurally: `pauseLowerTierReplayForQueue`'s input has no severity field at all, so a `CLINICAL_MEDIUM` operation carrying a safety-critical payload gets no bypass.

TDD: eight new unit tests in `replayIngest.service.test.ts` (batch-local preemption across all three lower tiers, ordering-independence, the open-conflict-keeps-pending-set case, the D-37 no-bypass case, and the duplicate-resend false-positive guard) plus a new real-HTTP-plus-real-Postgres suite, `apps/api/tests/sync/replay-ingest-server-side-enforcement.test.ts`, that fires a `CLINICAL_MEDIUM` operation directly at `POST /sync/replay` (never `/queue/sync/replay`, never through a mobile coordinator) alongside outstanding `QUEUE_HIGH` work and confirms it is deferred via both the HTTP response and a direct `SyncReplayReceipt` lookup. Confirmed RED against the pre-fix code (reverted via `git checkout`, re-applied via a saved patch) before the fix made all 8 new unit tests and both new integration tests pass.

Verify: `npx vitest run apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts apps/api/src/modules/queue/__tests__/queuePreemption.service.test.ts apps/api/tests/sync/replay-ingest-server-side-enforcement.test.ts` -- see `.planning/phases/10-offline-hardening-integration-polish/10-01-SUMMARY.md`'s Verify-Fix Follow-Up for the full pass/fail counts at every suite level (verify-fix 10.7 and 10.9 land in the same file and were verified together).

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.11**: a `no-mistakes --verify phase 10` pass found `QueueOfflineReplayService.replayCheckIn`'s D-34 auto-merge branch kept whichever operation's replay reached the server first, not the one with the chronologically earlier payload `checkedInAt`. Two offline devices checking in the same patient at different real-world instants could replay out of network-arrival order (e.g. a spotty connection delays the earlier device's replay), and the merge would silently keep the later check-in's timestamp as the entry's `queuePriorityAt` -- unfairly jumping that patient ahead of others who genuinely checked in earlier, in a way no amount of retrying would ever self-correct.

Fixed in `apps/api/src/modules/queue/services/queueOfflineReplay.service.ts`: `replayCheckIn`'s merge branch now compares the newly-arriving operation's payload `checkedInAt` against `existingActive.queuePriorityAt` -- which already holds the FIRST operation's own payload `checkedInAt` (see the existing "preserves the offline device's original check-in instant as `queuePriorityAt`" rule) rather than the entry's DB-default `checkedInAt` column (which is just the row-creation instant for both the online and offline paths, never backdated). When the newly-arriving operation's `checkedInAt` is actually earlier, `gateway.updateEntry` corrects the entry's `queuePriorityAt` to that true earlier instant -- the merge still keeps a single live entry (D-34's core guarantee is unchanged), only its ordering timestamp is corrected. `status` stays `MERGED_DUPLICATE_CHECK_IN` either way.

TDD: two new tests in `queueOfflineReplay.service.test.ts`'s D-34 describe block -- one simulates operation B (`checkedInAt` = T1, earlier) replaying AFTER operation A (`checkedInAt` = T2, later) already created the live entry, and asserts `gateway.updateEntry` is called with the entry id and the earlier `queuePriorityAt`; a companion test confirms `updateEntry` is NOT called when the newly-arriving operation is not actually earlier (no regression on the ordinary "later operation loses" case). Confirmed RED against the pre-fix code (the new "keeps the chronologically earlier" test failed: `updateEntry` was never called) before the fix made both new tests pass without touching the two pre-existing D-34 tests.

Verify: `npx vitest run apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts`.
- `queueOfflineReplay.service.test.ts`: 19/19 passing (17 pre-existing + 2 new).
- Root `npx vitest run`: 83 test files, 1136 tests passed, 0 failed.
- `apps/api` full suite (real Postgres 16 + Redis 7): 173 test files passed, 9 skipped, 2153 tests passed, 80 todo (pre-existing), 0 failed.
- `apps/mobile` full suite: 54 test files, 878 tests passed, 0 failed (unaffected, included for completeness since this verify-fix session covered both 10.8 and 10.11).
