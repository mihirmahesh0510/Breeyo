---
phase: 10-offline-hardening-integration-polish
plan: 01
subsystem: offline-sync-shared-foundation
tags: [types, zod, expo-sqlite, prisma, rls, TDD, replay, idempotency]
dependency_graph:
  requires: []
  provides: [offline-sync-contracts, sync-coordinator, replay-ingest-service, phase-10-prisma-models]
  affects: [10-02, 10-03, 10-04, 10-05]
tech_stack:
  added: []
  patterns: [zod-envelope-validation, queue-first-priority-ladder-with-preemption, idempotent-replay-receipt, working-set-anchor-frozen-at-offline-start]
key_files:
  created:
    - packages/types/src/offline-sync/constants.ts
    - packages/types/src/offline-sync/types.ts
    - packages/validators/src/offline-sync/schemas.ts
    - packages/validators/src/offline-sync/__tests__/schemas.test.ts
    - apps/mobile/src/features/offline-sync/db/offlineDb.ts
    - apps/mobile/src/features/offline-sync/db/__tests__/offlineDb.test.ts
    - apps/mobile/src/features/offline-sync/services/syncCoordinator.ts
    - apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts
    - apps/api/src/modules/sync/services/replayIngest.service.ts
    - apps/api/src/modules/sync/routes.ts
    - apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts
  modified:
    - packages/types/src/index.ts
    - packages/validators/src/index.ts
    - apps/api/prisma/schema.prisma (appended SyncReplayReceipt, SyncConflictRecord, SyncFailureTask, DeviceSyncCursor)
    - apps/api/prisma/post-migrate.sql (appended RLS section for the 4 new tables)
    - apps/api/src/app.ts (registered sync routes)
    - vitest.config.ts (repo root; added Phase 10 Wave 1 test paths)
metrics:
  duration: ~3 hours across 2 subagent tasks + 1 direct blocking step
  completed: 2026-08-24
  tasks_completed: 3
  tasks_total: 3
---

# Phase 10 Plan 01: Offline-Sync Shared Foundation Summary

Shared Phase 10 offline-sync contract layer, a transactional local SQLite foundation on mobile, an idempotent/conflict-aware replay-ingest API, and four new Prisma models with RLS — built strictly test-first across all three tasks. Task 3's `prisma db push` + `prisma generate` (deliberately kept separate and blocking per the plan) ran clean with no data loss, and `post-migrate.sql`'s RLS policies for the new tables were applied and verified enabled.

Contracts live in this repo's established convention, not the plan's literal (stale) `packages/shared/...` paths: types/constants in `packages/types/src/offline-sync/`, zod schemas in `packages/validators/src/offline-sync/`, barrel-exported from each package's `src/index.ts` — same correction Phase 9's 09-01 plan had to make for the same reason (`packages/shared` was migrated away in Phase 9).

## What Was Built

### Task 1: Shared contracts (TDD)

- **`packages/types/src/offline-sync/constants.ts`** — `ReplayPriority` enum + `REPLAY_PRIORITIES` (`QUEUE_HIGH, CLINICAL_MEDIUM, INVENTORY_MEDIUM, ANCILLARY_LOW` — D-12 to D-14), `SyncVisibilityState`/`SYNC_VISIBILITY_STATES` (`PENDING, REPLAYING, CONFLICT, FAILED, CAUGHT_UP` — D-18 to D-21), `ConflictSeverity`/`CONFLICT_SEVERITIES` (`OPERATIONAL, SAFETY_CRITICAL`), `ResolutionState`/`RESOLUTION_STATES` (`OPEN, GUIDED_RETRY, ESCALATED, RESOLVED`), `DEFAULT_GUIDED_RETRY_POLICY` (`{ maxGuidedRetries: 1, escalationAfterGuidedRetry: true }` — D-22/D-23).
- **`packages/types/src/offline-sync/types.ts`** — `OfflineOperationEnvelope` (required `deviceId`, `operationId`, `clinicId`, `userId`, `domain`, `entityType`, `entityId`, `priority`, `createdAt`, `payload`), `OfflineOperationAttempt`, `WorkingSetSnapshotRef` (carries `workingSetAnchoredAt`, per D-35), `SyncConflictEnvelope`, `SyncFailureTaskRecord`, `ReplayAckEnvelope`.
- **`packages/validators/src/offline-sync/schemas.ts`** — `offlineOperationEnvelopeSchema` (rejects missing clinic/user/device ownership, rejects unknown priority codes) and `syncConflictEnvelopeSchema` (requires `localPayload`/`serverPayload`, requires `resolutionOwnerUserId` when `severity === 'SAFETY_CRITICAL'`).
- **Tests** — `packages/validators/src/offline-sync/__tests__/schemas.test.ts`, 20 tests, written and confirmed RED before implementation.

### Task 2: Local storage, sync coordinator, replay ingress, Prisma models (TDD)

- **`apps/mobile/src/features/offline-sync/db/offlineDb.ts`** — `initializeOfflineDb`, `writeOfflineTransaction` (wraps `withTransactionAsync`); tables `sync_operations`, `sync_operation_attempts`, `sync_conflicts`, `sync_failure_tasks`, and the four same-day snapshot tables, each carrying `working_set_anchored_at`. `getOrCreateWorkingSetAnchor` sets this once at offline-start and never recomputes it from the current calendar date — the concrete implementation of D-35 (same-day window survives a midnight rollover mid-outage).
- **`apps/mobile/src/features/offline-sync/services/syncCoordinator.ts`** — `runReplayCycle`, `preemptLowerPriorityReplay`. Drains `QUEUE_HIGH → CLINICAL_MEDIUM → INVENTORY_MEDIUM → ANCILLARY_LOW`, re-scanning higher tiers after every send so a newly-arrived higher-priority op preempts in-flight lower-tier work. Has an explicit test proving D-37: a `SAFETY_CRITICAL` conflict never jumps its `CLINICAL_MEDIUM` tier ahead of `QUEUE_HIGH`.
- **`apps/api/src/modules/sync/services/replayIngest.service.ts` + `routes.ts`** — `POST /api/v1/sync/replay`, `authenticate` + `tenantContext` guarded. Parses every envelope with the Task 1 zod schemas, enforces idempotency via a `findUnique` on `[clinicId, deviceId, operationId]` before creating a receipt (duplicate/flapping replay is a no-op, not a duplicate write), defers rather than overwrites an operation targeting an entity with an already-open conflict (D-05), and derives `clinicId`/`userId` from the authenticated session context — never from the envelope body (a dedicated test submits a spoofed `clinicId`/`userId` and confirms the session-derived values win).
- **`apps/api/prisma/schema.prisma`** — `SyncReplayReceipt`, `SyncConflictRecord`, `SyncFailureTask`, `DeviceSyncCursor`, each with an explicit `clinic Clinic @relation(...)` and `Clinic`-side back-relation array (learning directly from the Phase 9 no-mistakes review, which had caught 5 new Phase 9 tables missing exactly this). Indexes: `@@unique([clinicId, deviceId, operationId])` (the idempotency guard), `[clinicId, resolutionState, severity]`, `[clinicId, currentOwnerUserId, resolutionState]`, `[clinicId, domain, lastAcknowledgedAt]`.
- **`apps/api/prisma/post-migrate.sql`** — new section 11: `ENABLE`/`FORCE ROW LEVEL SECURITY` + 4 `CREATE POLICY` statements (select/insert/update/delete) for all 4 new tables, matching the exact pattern every other clinic-scoped table in the file uses. Applied directly (not left for later) — this is the same gap a `no-mistakes` review caught in Phase 9's shipped code, closed here proactively instead of retroactively.
- **Tests** — `syncCoordinator.test.ts` (8), `offlineDb.test.ts` (8, bonus coverage beyond the plan's verify gate), `replayIngest.service.test.ts` (10, including the spoofed-ownership security test and a `SAFETY_CRITICAL`-without-owner rejection test).

### Task 3: Blocking schema push (not a subagent task — run directly)

- `npx prisma db push --schema apps/api/prisma/schema.prisma` against the local dev Postgres (`docker` container `breeyo-postgres-1`, port 5433) — succeeded with **no data-loss confirmation needed** (purely additive: 4 new tables, no existing model touched), so the plan's "stop and surface the prompt" fallback wasn't triggered.
- `npx prisma generate --schema apps/api/prisma/schema.prisma` — regenerated the Prisma client.
- Applied `apps/api/prisma/post-migrate.sql` directly against the dev database via `docker exec ... psql` (no npm script wires this in; it's a manual step in this repo, same as it was for Phase 9). Verified via `pg_class.relrowsecurity`/`relforcerowsecurity` that all 4 new tables have RLS enabled and forced.

## Deviations From the Plan (flagged, not silently made)

1. **`packages/shared/...` → `@breeyo/types` + `@breeyo/validators`.** Same correction Phase 9's 09-01 plan had to make. The plan's literal paths are stale; this repo migrated away from `packages/shared` during Phase 9 and it no longer exists.
2. **No separate `controller.ts`/`schema.ts` for the sync module.** The plan's own `files_modified` list for Task 2 names only `replayIngest.service.ts` and `routes.ts` — kept the route handler and body schema inline in `routes.ts` rather than introducing a fuller split some older modules use.
3. **`replayIngest.service.ts` takes a minimal local `ReplayIngestPrismaClient` interface**, not the full generated Prisma type, since Task 2 was written and tested (TDD, mocked Prisma delegate) before Task 3 generated the real client. `routes.ts` casts `request.db` into that shape with a comment explaining the seam — this resolved cleanly once Task 3's `prisma generate` ran; no follow-up change was needed.
4. **`vitest.config.ts` (repo root) extended, not replaced** — added Wave 1's mobile/API/validators test globs to the existing include list Phase 9 had already established, following the same pattern rather than inventing a new mechanism.

## Task Commits

1. **Task 1: shared contracts** — `2fabfb0` (feat)
2. **Task 2: local storage, replay ingress, Prisma models** — `6e84d13` (feat)
3. **Task 3: schema push + RLS** — no tracked file changes (pure infra step: `prisma db push`/`generate` against the dev DB, `post-migrate.sql` applied via `psql`); verified via `pg_class` query and a full Wave 1 test re-run, not committed as a separate commit.

_All TDD tasks followed the iron law: the failing test was written and run first (confirmed RED), then the minimal implementation was added until it passed._

## Verification

```
npx vitest run apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts packages/validators/src/offline-sync/__tests__/schemas.test.ts
```

38/38 tests passing. `npx prisma validate --schema apps/api/prisma/schema.prisma` valid. Full repo `npx vitest run` (491 tests) green with the generated client in place — the 12 pre-`prisma generate` failures seen mid-Task-2 (`Cannot find module '.prisma/client/default'`) are gone now that Task 3 has run.

## Verify-Fix Follow-Up

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.9**: a `no-mistakes --verify phase 10` pass found the `SyncReplayReceipt` idempotency check in `apps/api/src/modules/sync/services/replayIngest.service.ts` -- a `findUnique` on `[clinicId, deviceId, operationId]` followed by a `create` -- had no transaction and no catch around the create. Two genuinely concurrent replay requests for the exact same operation could both see "no existing receipt" from `findUnique` before either `create` ran, and the second `create` to reach Postgres would throw an uncaught `PrismaClientKnownRequestError` (P2002) on the `[clinicId, deviceId, operationId]` unique constraint, surfacing as a generic 500 to a legitimate concurrent duplicate replay instead of the idempotent no-op every other duplicate path in this service already provides.

Fixed by wrapping the `create` call in a `try/catch`: on a `P2002` whose failing constraint is this receipt's own unique key, the service re-fetches the real (winning) receipt via the same `findUnique` shape and returns it as an ordinary acknowledged operation, matching this repo's established pattern (`inventory-item.repository.ts`'s barcode uniqueness handling, `billing/invoice.service.ts`'s one-draft-per-consultation handling). If no receipt is found on re-fetch (an unexpected case, since the `P2002` must have come from something), the original error is re-thrown rather than silently swallowed.

TDD: `createMockDb()` in `replayIngest.service.test.ts` was extended so its `syncReplayReceipt.create` mock throws a real `Prisma.PrismaClientKnownRequestError('...', { code: 'P2002', clientVersion: '6.19.3' })` when called twice for the same key -- mirroring the real unique index -- which two new unit tests exercise via `Promise.all` (JS's single-threaded interleaving still reproduces the race here: both calls' `findUnique` resolve "not found" before either `create` runs, since `Promise.all` starts both calls before awaiting either). A new real-HTTP-plus-real-Postgres test in `apps/api/tests/sync/replay-ingest-server-side-enforcement.test.ts` fires two genuinely concurrent `POST /sync/replay` requests for the same operation and confirms both resolve 200 with equivalent ack envelopes and exactly one `SyncReplayReceipt` row exists in the database -- re-run four times in isolation against the pre-fix code to confirm the race reliably reproduces (it is not a flaky, order-dependent artifact) before the fix made it reliably pass.

Verify: `npx vitest run apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts apps/api/tests/sync/replay-ingest-server-side-enforcement.test.ts`.
- `replayIngest.service.test.ts`: 26/26 passing (18 pre-existing + 8 new: 6 for verify-fix 10.7, 2 for verify-fix 10.9).
- `replay-ingest-server-side-enforcement.test.ts` (new file): 3/3 passing.
- Root `npx vitest run`: 83 test files, 1130 tests passed, 0 failed.
- `apps/api` full suite (real Postgres 16 + Redis 7): 173 test files passed, 9 skipped, 2151 tests passed, 80 todo (pre-existing), 0 failed.

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.8**: a `no-mistakes --verify phase 10` pass found `clearWorkingSetAnchor` in `apps/mobile/src/features/offline-sync/db/offlineDb.ts` -- correctly built to clear the same-day working-set anchor (D-35) once a device fully reconnects -- had zero live callers. `runReplayCycle` in `syncCoordinator.ts` (the natural call site: it already knows exactly when every priority tier's local backlog has drained) never invoked it, so after the first offline stretch the anchor stayed frozen forever, silently defeating D-35's same-day working-set boundary for every subsequent offline stretch on that device.

Fixed by giving `ReplayCycleDeps` an optional `clearWorkingSetAnchor` dependency and `ReplayCycleResult` a `caughtUp` field. After the drain loop, `runReplayCycle` re-checks every priority tier's pending count fresh (deliberately not trusting the loop's own natural exit, since a head-of-line failure earlier in the same cycle can advance `priorityIndex` past a tier that still has a real pending operation left in it) and only calls `deps.clearWorkingSetAnchor()` when the backlog is genuinely empty across ALL tiers. The real caller wires this to `clearWorkingSetAnchor(db)`; the dependency stays optional so existing tests/callers that don't care about the anchor lifecycle are unaffected.

TDD: three new unit tests in `syncCoordinator.test.ts` cover the hook firing only on a genuine full drain, NOT firing when a tier is left with a leftover failed operation, and the dependency staying optional. A new integration test in `offlineDb.test.ts` composes `runReplayCycle` with the REAL `getOrCreateWorkingSetAnchor`/`clearWorkingSetAnchor` functions against the fake SQLite db, proving the `sync_meta` anchor row is actually deleted after a fully-caught-up cycle and that the next `getOrCreateWorkingSetAnchor` call (simulating the next offline stretch) mints a genuinely new anchor value rather than reusing the stale one. Confirmed RED against the pre-fix code (all four new assertions failed with `caughtUp`/anchor-clearing behavior undefined) before the fix made them pass.

Verify: `npx vitest run apps/mobile/src/features/offline-sync/__tests__/syncCoordinator.test.ts apps/mobile/src/features/offline-sync/__tests__/offlineDb.test.ts`.
- `syncCoordinator.test.ts`: 11/11 passing (8 pre-existing + 3 new).
- `offlineDb.test.ts`: 9/9 passing (8 pre-existing + 1 new).
- Root `npx vitest run`: 83 test files, 1136 tests passed, 0 failed.
- `apps/mobile` full suite: 54 test files, 878 tests passed, 0 failed.
- `apps/api` full suite (real Postgres 16 + Redis 7): 173 test files passed, 9 skipped, 2153 tests passed, 80 todo (pre-existing), 0 failed.

## Second Review Round Follow-Up (F2, resolved)

A second `no-mistakes` code-review pass (after all 11 `PHASE-10-VERIFY-FIX-PLAN.md` findings closed) found that `runReplayCycle` (this plan's own `syncCoordinator.ts`, above) had no live caller anywhere in the shipped mobile app -- nothing observed a device's connectivity and actually triggered a replay cycle on reconnect, so every domain's offline-captured work (queue, EMR, inventory) sat in local storage until some other code path happened to call it, which none did. Every downstream replay/broadcast/anchor-clearing mechanism this phase built (including verify-fix 10.8's `clearWorkingSetAnchor` wiring, directly above) was correctly built but effectively unreachable in production for this reason.

Fixed with three new files: `apps/mobile/src/features/offline-sync/services/connectivityReplayDriver.ts` (fires `runReplayCycle` exactly once per genuine offline->online transition, debounced against overlapping cycles), `apps/mobile/src/features/offline-sync/services/buildReplayCycleDeps.ts` (assembles `ReplayCycleDeps` from the real `offlineDb`/`apiClient`/device id), and `apps/mobile/src/features/offline-sync/providers/ConnectivityReplayProvider.tsx` (a render-nothing component subscribing to `@react-native-community/netinfo`, mounted inside `AuthProvider` in `apps/mobile/app/_layout.tsx` so it has an access token/active clinic before driving any replay). A related gap (F9, same review round) was fixed in the same driver: a cold app launch/login that is already online, with offline-captured work left over from a prior session, has no offline->online transition to detect -- `connectivityReplayDriver.ts` now also checks `hasPendingWork()` once on the very first connectivity snapshot and fires immediately if it resolves true.

Verify: `npx vitest run apps/mobile/src/features/offline-sync/__tests__/connectivityReplayDriver.test.ts apps/mobile/src/features/offline-sync/__tests__/offlineDb.test.ts apps/mobile/src/features/offline-sync/__tests__/buildReplayCycleDeps.test.ts`.
