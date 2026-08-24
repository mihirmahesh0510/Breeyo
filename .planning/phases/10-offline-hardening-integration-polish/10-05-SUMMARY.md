---
phase: 10-offline-hardening-integration-polish
plan: 05
subsystem: sync-visibility-ux-retry-escalation-replay-broadcasts-and-browser-optimistic-concurrency
tags: [zustand, react-native-paper, fastify, zod, socket.io, TDD, guided-retry, escalation, stale-state, optimistic-concurrency]
dependency_graph:
  requires: [10-01, 10-02, 10-03, 10-04]
  provides: [sync-status-badge, sync-failure-center, retry-escalation-service, replay-broadcast-service, web-replay-stale-state, browser-write-version-check]
  affects: [10-06]
tech_stack:
  added: []
  patterns:
    - calm-badge-plus-actionable-failure-center (D-18 to D-21)
    - originating-user-then-clinician-then-any-on-duty-clinician escalation ladder (D-22 to D-24, D-36)
    - ownership-only-escalation-never-touches-replay-priority (D-37)
    - scoped-per-clinic-room realtime broadcast (mirrors BrowserSyncService)
    - browser-write-side optimistic-concurrency check reusing the existing read-side knownVersion/staleVersion epoch-ms scheme
key_files:
  created:
    - apps/mobile/src/features/offline-sync/lib/sync-status.ts
    - apps/mobile/src/features/offline-sync/store/syncUiStore.ts
    - apps/mobile/src/features/offline-sync/hooks/useSyncStatus.ts
    - apps/mobile/src/features/offline-sync/components/SyncStatusBadge.tsx
    - apps/mobile/src/features/offline-sync/screens/SyncFailureCenterScreen.tsx
    - apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx
    - apps/api/src/modules/sync/services/retryEscalation.service.ts
    - apps/api/src/modules/sync/services/replayBroadcast.service.ts
    - apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts
    - apps/web/src/features/dashboard/hooks/useReplayStaleState.ts
    - apps/web/src/features/queue/hooks/useQueueReplayRealtime.ts
    - apps/web/src/features/inventory/hooks/useInventoryReplayRealtime.ts
    - apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx
  modified:
    - apps/mobile/src/features/offline-sync/db/offlineDb.ts (added read helpers for the sync-visibility aggregate)
    - apps/api/src/realtime/browser-sync.service.ts (added checkWriteVersion + staleWriteConflictError)
    - apps/api/src/realtime/__tests__/browser-sync.service.test.ts
    - apps/api/src/modules/queue/queue.schema.ts (statusUpdateBodySchema + expectedVersion)
    - apps/api/src/modules/queue/web-queue.service.ts (updateEntryStatus version check)
    - apps/api/src/modules/queue/web-queue.controller.ts
    - apps/api/src/modules/queue/__tests__/web-queue.service.test.ts
    - apps/api/src/modules/billing/billing.schema.ts (collectPaymentBodySchema + webRefundBodySchema + webVoidBodySchema)
    - apps/api/src/modules/billing/billing-workbench.service.ts (assertInvoiceVersionCurrent on collect/refund/void)
    - apps/api/src/modules/billing/workbench.controller.ts
    - apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts
    - apps/api/src/modules/inventory/inventory.schema.ts (webStockAdjustmentBodySchema)
    - apps/api/src/modules/inventory/inventory-web.service.ts (adjustStock version check)
    - apps/api/src/modules/inventory/inventory-web.controller.ts
    - apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts
    - vitest.config.ts (repo root; appended Plan 10-05 mobile offline-sync .tsx test glob)
metrics:
  duration: ~1 session, fully TDD (RED confirmed before every implementation file)
  completed: 2026-08-24
  tasks_completed: 2
  tasks_total: 2
---

# Phase 10 Plan 05: Sync Visibility UX, Retry Escalation, Replay Broadcasts, and Browser Optimistic-Concurrency Enforcement Summary

Built the cross-cutting layer that sits on top of Plans 10-02/10-03/10-04's queue/EMR/inventory offline-replay work: a calm, always-visible mobile sync badge plus an actionable failure center with explicit guided-retry/escalation ownership (D-18 to D-24, D-36, D-11), a server-side `retryEscalation.service.ts` that moves a stuck safety-critical conflict from the originating clinician to another on-duty clinician without ever touching replay priority (D-37), scoped `replayBroadcast.service.ts` events so mobile replays surface stale/conflict prompts on browser tabs (D-40) through the **existing** `StaleStateBanner`, and — per the plan's extended Task 2 scope — closed a real, `no-mistakes`-flagged gap in Phase 9's shipped code: browser mutation endpoints (queue status update, billing collect/refund/void, inventory adjust) now verify an `expectedVersion` against the row's live version and REJECT a stale write with a 409 `STALE_WRITE_CONFLICT` instead of silently applying it.

Built strictly test-first: every acceptance criterion had a failing test confirmed RED before its implementation was written.

## What Was Built

### Task 1: Mobile sync badge, failure center, and retry-ownership UX (TDD)

- **`apps/mobile/src/features/offline-sync/lib/sync-status.ts`** (new, RN-free — same pattern as `queue-offline-utils.ts`/`clinical-conflict-resolution.ts`, since `apps/mobile`'s vitest runs in plain `node` with no Metro/Babel transform): `deriveVisibilityState` mirrors `ReplayIngestService.deriveVisibilityState`'s precedence (FAILED > CONFLICT > REPLAYING > PENDING > CAUGHT_UP) for the on-device aggregate; `badgeCopy` is deliberately calm prose (never `!`, never the word "error") per D-19; `shouldShowRecoveryCue` fires only on a genuine transition INTO `CAUGHT_UP` from a real prior state (D-21 — never on cold start, never repeatedly); `isUnresolved` gates D-11's "stays visible until cleared"; `toFailureCenterItemFromTask`/`toFailureCenterItemFromConflict` normalize `SyncFailureTaskRecord` and `SyncConflictEnvelope` into one `FailureCenterItem` shape; `groupFailureCenterItems` buckets into `needsYourRetry` (owned by viewer, not escalated), `escalatedToClinician` (ESCALATED **and** `SAFETY_CRITICAL` only — D-24), and `operationalReview` (everything else unresolved, including a non-safety-critical ESCALATED item, per D-10's lighter review with no clinician hand-off).
- **`apps/mobile/src/features/offline-sync/store/syncUiStore.ts`** (zustand, RN-free, same convention as `queueOfflineStore.ts`) — holds `counts`, `visibilityState`, `failureItems`, and derives `showRecoveryCue` from the previous→current state transition on every `setSummary` call.
- **`apps/mobile/src/features/offline-sync/hooks/useSyncStatus.ts`** — polls the on-device `sync_operations`/`sync_conflicts`/`sync_failure_tasks` tables (via three new read helpers added to `offlineDb.ts`: `countPendingSyncOperations`, `listUnresolvedSyncFailureTasks`, `listUnresolvedSyncConflicts`) every 5s and writes the aggregate into `syncUiStore` — the single shared source both UI pieces below read from.
- **`apps/mobile/src/features/offline-sync/components/SyncStatusBadge.tsx`** — an always-visible, non-blocking element (never `Alert`/modal) that renders `badgeCopy` or the subtle `RECOVERY_CUE_COPY` when `showRecoveryCue` is true, and exposes `onPress` only for the two actionable states (CONFLICT/FAILED) to route into the failure center.
- **`apps/mobile/src/features/offline-sync/screens/SyncFailureCenterScreen.tsx`** — groups every unresolved item via `groupFailureCenterItems` into the three named sections ("Needs your retry", "Escalated to clinician", "Operational review"), shows both `originatingUserId` and `currentOwnerUserId` per row (via an injected `resolveUserName`, matching `ClinicalConflictResolutionSheet.tsx`'s convention), and offers explicit Retry/Escalate actions rather than a generic toast. D-11 is enforced structurally by the shared grouping function (a `RESOLVED` item never reaches any group), not by anything screen-local.
- Tests: `SyncFailureCenterScreen.test.tsx` (41) — direct unit coverage of every `sync-status.ts` function (precedence, calm-copy assertions, recovery-cue transition matrix, grouping including the safety-critical-vs-operational ESCALATED split), `syncUiStore.ts` behavior, and component-source-assertion checks (same technique `ClinicalConflictResolutionSheet.test.tsx` established, since `react-native`/`react-native-paper` cannot be rendered under this repo's plain-`node` mobile vitest environment) for `SyncStatusBadge.tsx`, `SyncFailureCenterScreen.tsx`, and `useSyncStatus.ts`.

### Task 2: Guided retry/escalation, scoped replay broadcasts, web stale-state hooks, and the browser optimistic-concurrency gap (TDD)

- **`apps/api/src/modules/sync/services/retryEscalation.service.ts`** (new) — an ownership-only state machine over `SyncFailureTask`/`SyncConflictRecord` rows (`OPEN → GUIDED_RETRY → ESCALATED`), reading/writing through a minimal injected Prisma-delegate interface (matches `ReplayIngestPrismaClient`'s convention). `assignOriginatingUserRetry` only advances the state — ownership was already resolved correctly at creation time by `replayIngest.service.ts` (originating user for a plain failure task or an `OPERATIONAL` conflict; the assigned clinician for a `SAFETY_CRITICAL` conflict per D-09). `recordGuidedRetryFailure` moves everything to `ESCALATED` (D-23 is explicit that escalation is automatic after a failed guided retry), but only reassigns ownership for a `SAFETY_CRITICAL` conflict — to a **different** on-duty clinician via an injected `OnDutyRosterProvider`, never the same one whose retry just failed (D-24). `reassignUnreachableEscalatedOwner` implements D-36's "escalates further" half: if the already-escalated clinician is also unreachable, it reassigns to yet another on-duty clinician — the roster-provider contract explicitly documents it must never include Admin, and the service throws (`NO_ON_DUTY_CLINICIAN_AVAILABLE`) rather than silently stalling or falling back to Admin when nobody else is available.
- **D-37 proof**: neither `RetryEscalationConflictRow`/`RetryEscalationTaskRow` nor any `update()` call this service makes has a `priority`/`replayPriority` field at all — enforced structurally, not just by convention. Tests assert (a) the locked `REPLAY_PRIORITIES` ladder keeps `QUEUE_HIGH` ahead of `CLINICAL_MEDIUM` independent of any conflict severity/state, and (b) every escalation `update()` call's `data` payload never carries a `priority`/`replayPriority` key.
- **`apps/api/src/modules/sync/services/replayBroadcast.service.ts`** (new) — `REPLAY_BROADCAST_EVENTS` (`replay:applied`, `replay:conflict-opened`, `replay:failure-escalated`), mirroring `BrowserSyncService`'s `io: Server | null` no-op-when-null convention and its `clinic:${clinicId}` room scoping (T-10-09: never a global/unscoped broadcast). Payload carries only `clinicId`/`domain`/`entityIds`/optional `dateWindow` — never the replayed data itself.
- **`apps/web/src/features/dashboard/hooks/useReplayStaleState.ts`** (new) — the missing realtime half of Phase 9's `StaleStateBanner`/`resolveStaleStatus`: `onReplayApplied`/`onReplayConflictOpened` (fed by the domain-scoped realtime hooks below) flip a `watchedEntityIds`-filtered `'fresh' | 'stale' | 'conflict'` status, `conflict` never downgrades back to `stale` on a later apply for the same entity, and `acknowledge()` is the `StaleStateBanner` "Refresh" action. Proven against the **real** `StaleStateBanner` component (a render test drives the actual banner, not a mock).
- **`apps/web/src/features/queue/hooks/useQueueReplayRealtime.ts`** / **`apps/web/src/features/inventory/hooks/useInventoryReplayRealtime.ts`** (new) — ported from `useQueueRealtime.ts`'s own socket setup (same auth handshake, transport, reconnection policy), each filtering the shared `replay:applied`/`replay:conflict-opened` events down to their own domain (defense in depth beyond the server's room scoping) before forwarding to `useReplayStaleState`'s handlers.
- **Closing the browser optimistic-concurrency gap** (the `no-mistakes` finding cited in `10-CONTEXT.md`'s Reusable Assets note): `knownVersion` was read-only — checked on every board/workbench read to decide `fresh`/`stale`, but no mutation endpoint ever verified a caller's claimed version before writing, so `StaleStateBanner`'s `conflict` state was purely decorative and a stale browser tab could silently clobber a row a mobile replay or another session had just changed. This violates D-05 ("review before overwrite, not silent last-write-wins") on the browser side of exactly the offline-recovery race this phase exists to harden.
  - `BrowserSyncService` gained `checkWriteVersion(currentVersion, expectedVersion?)` (`'ok' | 'stale'`, always `'ok'` when `expectedVersion` is absent — strictly additive) and a `staleWriteConflictError(...)` factory producing a 409 `STALE_WRITE_CONFLICT` whose `.conflict` mirrors `SyncConflictEnvelope`'s domain/entityType/entityId/severity shape (`currentVersion`/`expectedVersion` stand in for `localPayload`/`serverPayload` since the write is rejected *before* anything is applied — there is no local payload to snapshot).
  - `queue.schema.ts`'s `statusUpdateBodySchema` (shared with mobile via `@breeyo/validators`'s `queueStatusUpdateSchema`) gained an optional `expectedVersion`; `web-queue.service.ts`'s `updateEntryStatus` checks it against the live `queueEntry.updatedAt` before calling `QueueService.updateStatus`.
  - `billing.schema.ts` gained `expectedVersion` on `collectPaymentBodySchema` directly (already web-only) and two new **web-only wrapper schemas**, `webRefundBodySchema`/`webVoidBodySchema` (extending the shared mobile `refundInputSchema`/`voidInvoiceSchema` with the same field) so the mobile refund/void forms are untouched; `billing-workbench.service.ts`'s `collectPayment`/`refundInvoice`/`voidInvoice` all run `assertInvoiceVersionCurrent` against the live `invoice.updatedAt` before delegating to `PaymentService`/`RefundService`/`InvoiceService`.
  - `inventory.schema.ts` gained a new web-only `webStockAdjustmentBodySchema` (extending the shared mobile `stockAdjustmentSchema`, keeping D-37's mobile-first barcode-scan flow untouched); `inventory-web.service.ts`'s `adjustStock` checks the live `inventoryItem.updatedAt` before delegating to `StockAdjustmentService`.
  - Every check is a no-op when `expectedVersion` is omitted (verified by an explicit test on each of the three services), so no existing caller (nothing sent this field before this plan) is a breaking change.
- Tests: `retryEscalation.service.test.ts` (20 — guided retry, clinician escalation with on-duty reassignment, D-36 further-reassignment, D-37's two structural proofs, plus `ReplayBroadcastService`'s scoped-emission/no-op-when-null behavior in the same file per this plan's file list), `replayStaleState.test.tsx` (12 — the stale/conflict state machine, a render test against the real `StaleStateBanner`, and the two domain-scoped realtime hooks via a mocked `socket.io-client`), `browser-sync.service.test.ts` (+4), `web-queue.service.test.ts` (+3), `billing-workbench.service.test.ts` (+5), `inventory-web.service.test.ts` (+3).

## Deviations From the Plan (flagged, not silently made)

1. **`retryEscalation.service.test.ts` also contains `ReplayBroadcastService`'s tests.** The plan's `files_modified` list names only one API sync test file for this task (no separate `replayBroadcast.service.test.ts`), and the `<verify>` command only runs that one file — both services are exercised there as two `describe` blocks rather than splitting into a second test file the plan never names.
2. **`groupFailureCenterItems` gates "Escalated to clinician" on `severity === SAFETY_CRITICAL`, not merely `resolutionState === ESCALATED`.** The plan's acceptance criteria say the section is for "escalated items" without spelling out the non-safety-critical case explicitly. Since `SyncFailureTask` has no severity column at all and D-10 requires a *lighter* review for operational items (no clinician hand-off), routing a non-safety-critical `ESCALATED` item into "Operational review" instead keeps the three sections mutually exclusive and honest about who is actually expected to act — covered by an explicit test.
3. **`useQueueReplayRealtime`/`useInventoryReplayRealtime` take `accessToken`/`activeClinicId` as explicit parameters** rather than calling `useAuth()` internally the way `useQueueRealtime.ts` does. This keeps them trivially composable from `useReplayStaleState`'s call site (which already has those values from its own page-level `useAuth()` call) and easier to unit test in isolation; the underlying socket setup (auth handshake, transport, reconnection policy) is otherwise identical.
4. **Neither `useReplayStaleState`/`useQueueReplayRealtime`/`useInventoryReplayRealtime` nor `SyncStatusBadge`/`SyncFailureCenterScreen` were wired into a live screen/page.** The plan's files list and acceptance criteria scope this plan to the hooks/components/services and their tests, not to editing `QueueBoard.tsx`/`BillingWorkbench.tsx`/a mobile navigator to mount them — matching the same class of "built, tested, ready to adopt" scope note Plan 10-04 flagged for `useOfflineStockActions.ts` not being wired into every stock screen.
5. **`offlineDb.ts` was modified** (three new read helpers) even though it is not in this plan's `files_modified` list. `useSyncStatus.ts` needs to read the local `sync_operations`/`sync_conflicts`/`sync_failure_tasks` tables Plan 10-01 already created — adding the read counterparts to the same file that owns every other read/write helper for those tables (rather than duplicating raw SQL elsewhere) is the same reasoning Plan 10-03 used when it added `readWorkingSetSnapshot` to this file for the first time.

## Task Commits

Both tasks were implemented and verified together in one session (the mobile UX and the API/web services share the same `ResolutionState`/`ConflictSeverity`/`SyncVisibilityState` vocabulary and were developed in the same TDD loop); the version-check gap closure is committed separately from the UX/escalation/broadcast work, since it touches Phase 9 modules (queue/billing/inventory web services) rather than Phase 10's own sync module.

_All TDD tasks followed the iron law: the failing test was written and run first (confirmed RED), then the minimal implementation was added until it passed._

## Verification

```
npx vitest run apps/mobile/src/features/offline-sync/__tests__/SyncFailureCenterScreen.test.tsx apps/api/src/modules/sync/__tests__/retryEscalation.service.test.ts apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx apps/api/src/modules/queue/__tests__/web-queue.service.test.ts apps/api/src/modules/billing/__tests__/billing-workbench.service.test.ts apps/api/src/modules/inventory/__tests__/inventory-web.service.test.ts
```
111/111 passing (41 + 20 + 12 + 9 + 15 + 14).

Additional verification run beyond the plan's gate:
- `apps/api` full suite (real Postgres 16 + Redis 7): **172 test files (163 passed, 9 skipped — pre-existing DB-fixture-dependent files), 2142 tests (2062 passed, 80 todo — pre-existing)**, 0 failed. (Grew from 10-04's 171 files/2107 tests by exactly this plan's 35 new test cases: 20 in `retryEscalation.service.test.ts` + 3/5/3/4 added to `web-queue`/`billing-workbench`/`inventory-web`/`browser-sync`.)
- `apps/mobile` full suite: **52 test files, 847 tests passed**, 0 failed (grew from 10-04's 806 by exactly this plan's 41 new `SyncFailureCenterScreen.test.tsx` cases).
- Root aggregate `npx vitest run` (the cross-package sweep `vitest.config.ts` defines): **69 test files, 1004 tests passed**, 0 failed (grew from 10-04's 916).
- `npx tsc --noEmit` in `apps/api`: only the same 5 pre-existing errors 10-04 documented (`replayIngest.service.test.ts`'s own module-resolution issue) — zero new errors from any file this plan touched or created.
- `npx tsc --noEmit` in `apps/web`: only pre-existing `@testing-library/jest-dom` matcher-typing gaps (`toBeInTheDocument`/`toHaveTextContent`/`toHaveAttribute` not augmented onto `Assertion<T>` in this package's `tsconfig`) that affect every jest-dom-using test file in this package, including several this plan did not touch (`portal-shell.test.tsx`, `upcoming-care.test.tsx`, `queue-board.test.tsx`, `visit-timeline.test.tsx`) and one pre-existing `TS2493` in `use-portal-receipt-url.test.ts` — this plan's own `replayStaleState.test.tsx` shows the same pre-existing jest-dom pattern (4 lines) and nothing else; neither package's `build` script runs `tsc` as a gate.
