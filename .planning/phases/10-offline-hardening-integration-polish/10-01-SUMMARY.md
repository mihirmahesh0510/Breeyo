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
