import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { ReplayPriority, ConflictSeverity, ResolutionState } from '@breeyo/types';
import { ReplayIngestService, type ReplayIngestPrismaClient } from '../services/replayIngest.service.js';
import type { ReplayBroadcastService } from '../services/replayBroadcast.service.js';
import { QueuePreemptionService } from '../../queue/services/queuePreemption.service.js';

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CLINIC_ID = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000010';
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000099';
const DEVICE_ID = 'device-abc';

function key(clinicId: string, deviceId: string, operationId: string) {
  return `${clinicId}:${deviceId}:${operationId}`;
}

/**
 * A stateful in-memory fake of the minimal Prisma delegate surface
 * ReplayIngestService needs (matches the mock-repository convention in
 * apps/api/src/modules/queue/__tests__/queue.service.test.ts). Stateful so
 * the idempotency tests can prove a *second* call sees the receipt the
 * *first* call created, instead of just asserting on call arguments.
 */
function createMockDb() {
  const receipts = new Map<string, { operationId: string; [key: string]: unknown }>();
  const conflictsByOperation = new Map<string, { id: string; [key: string]: unknown }>();
  const openConflictsByEntity = new Map<string, boolean>();
  let conflictSeq = 0;
  let failureSeq = 0;

  const db: ReplayIngestPrismaClient & {
    __receipts: typeof receipts;
    __conflicts: typeof conflictsByOperation;
    __seedOpenConflict: (clinicId: string, domain: string, entityType: string, entityId: string) => void;
  } = {
    syncReplayReceipt: {
      findUnique: vi.fn(async ({ where: { clinicId_deviceId_operationId } }) => {
        const { clinicId, deviceId, operationId } = clinicId_deviceId_operationId;
        return receipts.get(key(clinicId, deviceId, operationId)) ?? null;
      }),
      // Verify-fix 10.9: mirrors the real `[clinicId, deviceId, operationId]`
      // unique constraint -- a `create` for a key that already has a row
      // throws a real `Prisma.PrismaClientKnownRequestError` (P2002), same
      // as Postgres would, instead of silently overwriting. This is what
      // lets a fake, single-threaded `Promise.all` still reproduce the
      // findUnique-then-create race: both calls' `findUnique` resolve
      // "not found" before either `create` runs, so the SECOND `create` to
      // reach this mock hits the same conflict a real concurrent duplicate
      // request would.
      create: vi.fn(async ({ data }) => {
        const recordKey = key(data.clinicId as string, data.deviceId as string, data.operationId as string);
        if (receipts.has(recordKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.19.3',
          });
        }
        const record = { ...data };
        receipts.set(recordKey, record);
        return record;
      }),
    },
    syncConflictRecord: {
      findUnique: vi.fn(async ({ where: { clinicId_deviceId_operationId } }) => {
        const { clinicId, deviceId, operationId } = clinicId_deviceId_operationId;
        return conflictsByOperation.get(key(clinicId, deviceId, operationId)) ?? null;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const entityKey = `${where.clinicId}:${where.domain}:${where.entityType}:${where.entityId}`;
        return openConflictsByEntity.get(entityKey) ? { id: 'existing-open-conflict' } : null;
      }),
      create: vi.fn(async ({ data }) => {
        conflictSeq += 1;
        const record = { id: `conflict-${conflictSeq}`, ...data };
        conflictsByOperation.set(key(data.clinicId as string, data.deviceId as string, data.operationId as string), record);
        return record;
      }),
    },
    syncFailureTask: {
      create: vi.fn(async ({ data }) => {
        failureSeq += 1;
        return { id: `failure-${failureSeq}`, ...data };
      }),
    },
    __receipts: receipts,
    __conflicts: conflictsByOperation,
    __seedOpenConflict: (clinicId, domain, entityType, entityId) => {
      openConflictsByEntity.set(`${clinicId}:${domain}:${entityType}:${entityId}`, true);
    },
  };

  return db;
}

function buildEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: DEVICE_ID,
    operationId: 'op-1',
    clinicId: CLINIC_ID,
    userId: USER_ID,
    domain: 'queue',
    entityType: 'QueueEntry',
    entityId: 'entity-1',
    priority: ReplayPriority.QUEUE_HIGH,
    createdAt: new Date().toISOString(),
    payload: { status: 'WAITING' },
    ...overrides,
  };
}

function buildConflictEnvelope(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    conflictId: 'conflict-envelope-1',
    clinicId: CLINIC_ID,
    deviceId: DEVICE_ID,
    operationId: 'op-conflict-1',
    domain: 'emr',
    entityType: 'Consultation',
    entityId: 'consultation-1',
    severity: ConflictSeverity.OPERATIONAL,
    localPayload: { notes: 'local notes' },
    serverPayload: { notes: 'server notes' },
    resolutionState: ResolutionState.OPEN,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockBroadcast() {
  return {
    emitReplayApplied: vi.fn(),
    emitReplayConflictOpened: vi.fn(),
    emitReplayFailureEscalated: vi.fn(),
  };
}

describe('ReplayIngestService', () => {
  let db: ReturnType<typeof createMockDb>;
  let broadcast: ReturnType<typeof createMockBroadcast>;
  let service: ReplayIngestService;
  const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_ID };

  beforeEach(() => {
    db = createMockDb();
    broadcast = createMockBroadcast();
    service = new ReplayIngestService(db, broadcast as unknown as ReplayBroadcastService);
  });

  it('acknowledges a valid operation and persists exactly one replay receipt', async () => {
    const result = await service.ingest(context, { operations: [buildEnvelope()] });

    expect(result.acknowledgedOperationIds).toEqual(['op-1']);
    expect(db.syncReplayReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on deviceId + operationId + clinicId: replaying the same operation twice produces one receipt, not two', async () => {
    const envelope = buildEnvelope({ operationId: 'op-dup' });

    const first = await service.ingest(context, { operations: [envelope] });
    const second = await service.ingest(context, { operations: [envelope] });

    expect(first.acknowledgedOperationIds).toEqual(['op-dup']);
    expect(second.acknowledgedOperationIds).toEqual(['op-dup']);
    // Only the FIRST call actually creates a receipt row; the second call's
    // findUnique sees it already exists and short-circuits to a no-op.
    expect(db.syncReplayReceipt.create).toHaveBeenCalledTimes(1);
    expect(db.__receipts.size).toBe(1);
  });

  it('treats flapping duplicate replay (rapid resend before the first ack lands) the same way as a clean duplicate', async () => {
    const envelope = buildEnvelope({ operationId: 'op-flap' });
    await service.ingest(context, { operations: [envelope] });
    await service.ingest(context, { operations: [envelope] });
    await service.ingest(context, { operations: [envelope] });

    expect(db.syncReplayReceipt.create).toHaveBeenCalledTimes(1);
  });

  it('never trusts clinicId/userId from the envelope -- always persists the authenticated session values', async () => {
    const spoofedEnvelope = buildEnvelope({ clinicId: OTHER_CLINIC_ID, userId: OTHER_USER_ID, operationId: 'op-spoof' });

    await service.ingest(context, { operations: [spoofedEnvelope] });

    expect(db.syncReplayReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clinicId: CLINIC_ID, userId: USER_ID }),
      }),
    );
  });

  it('persists a conflict record instead of silently applying a last-write-wins overwrite', async () => {
    const conflict = buildConflictEnvelope();

    const result = await service.ingest(context, { operations: [], conflicts: [conflict] });

    expect(db.syncConflictRecord.create).toHaveBeenCalledTimes(1);
    expect(db.syncConflictRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          localPayloadJson: conflict.localPayload,
          serverPayloadJson: conflict.serverPayload,
          severity: ConflictSeverity.OPERATIONAL,
          originatingUserId: USER_ID,
        }),
      }),
    );
    expect(result.conflictsCreated).toHaveLength(1);
  });

  it('is idempotent for conflicts too: replaying the same conflict envelope twice creates only one conflict record', async () => {
    const conflict = buildConflictEnvelope({ operationId: 'op-conflict-dup' });

    await service.ingest(context, { operations: [], conflicts: [conflict] });
    await service.ingest(context, { operations: [], conflicts: [conflict] });

    expect(db.syncConflictRecord.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a SAFETY_CRITICAL conflict envelope with no resolutionOwnerUserId as a failure task, not a silently-accepted conflict (D-24)', async () => {
    const invalidConflict = buildConflictEnvelope({
      operationId: 'op-safety-no-owner',
      severity: ConflictSeverity.SAFETY_CRITICAL,
      // resolutionOwnerUserId intentionally omitted
    });

    const result = await service.ingest(context, { operations: [], conflicts: [invalidConflict] });

    expect(db.syncConflictRecord.create).not.toHaveBeenCalled();
    expect(db.syncFailureTask.create).toHaveBeenCalledTimes(1);
    expect(result.failureTaskIds).toHaveLength(1);
  });

  it('creates a failure task instead of throwing when an operation envelope fails schema validation (T-10-01)', async () => {
    const malformed = { deviceId: DEVICE_ID }; // missing every other required field

    const result = await service.ingest(context, { operations: [malformed] });

    expect(db.syncReplayReceipt.create).not.toHaveBeenCalled();
    expect(db.syncFailureTask.create).toHaveBeenCalledTimes(1);
    expect(result.failureTaskIds).toHaveLength(1);
    expect(result.acknowledgedOperationIds).toHaveLength(0);
  });

  it('defers (does not acknowledge) a new operation targeting an entity that already has an open conflict, instead of stacking more writes on disputed state (D-05)', async () => {
    db.__seedOpenConflict(CLINIC_ID, 'emr', 'Consultation', 'consultation-1');

    const envelope = buildEnvelope({
      operationId: 'op-on-disputed-entity',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-1',
    });

    const result = await service.ingest(context, { operations: [envelope] });

    expect(result.acknowledgedOperationIds).toEqual([]);
    expect(result.deferredOperationIds).toEqual(['op-on-disputed-entity']);
    expect(db.syncReplayReceipt.create).not.toHaveBeenCalled();
  });

  it('processes an unrelated entity normally even while another entity has an open conflict', async () => {
    db.__seedOpenConflict(CLINIC_ID, 'emr', 'Consultation', 'consultation-1');

    const envelope = buildEnvelope({ operationId: 'op-unrelated', domain: 'queue', entityType: 'QueueEntry', entityId: 'entity-2' });

    const result = await service.ingest(context, { operations: [envelope] });

    expect(result.acknowledgedOperationIds).toEqual(['op-unrelated']);
    expect(result.deferredOperationIds).toEqual([]);
  });
});

// Verify-fix 10.3: `ReplayBroadcastService` was built (Plan 10-05 Task 2) but
// never actually called from `ReplayIngestService` -- the browser
// stale-state push it exists to drive was dead in production. These prove
// the shared replay-ingress entry point now emits the scoped broadcast a
// real HTTP replay through `POST /sync/replay` (`routes.ts`'s `buildService`)
// triggers, not just that the underlying DB row changed.
describe('ReplayIngestService replay-broadcast wiring (verify-fix 10.3)', () => {
  let db: ReturnType<typeof createMockDb>;
  let broadcast: ReturnType<typeof createMockBroadcast>;
  let service: ReplayIngestService;
  const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_ID };

  beforeEach(() => {
    db = createMockDb();
    broadcast = createMockBroadcast();
    service = new ReplayIngestService(db, broadcast as unknown as ReplayBroadcastService);
  });

  it('emits a clinic-scoped REPLAY_APPLIED broadcast after a real operation replay is applied', async () => {
    const envelope = buildEnvelope({ operationId: 'op-broadcast-1', domain: 'queue', entityId: 'entity-broadcast-1' });

    await service.ingest(context, { operations: [envelope] });

    expect(broadcast.emitReplayApplied).toHaveBeenCalledTimes(1);
    expect(broadcast.emitReplayApplied).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      domain: 'queue',
      entityIds: ['entity-broadcast-1'],
    });
    expect(broadcast.emitReplayConflictOpened).not.toHaveBeenCalled();
  });

  it('does not re-emit REPLAY_APPLIED for an idempotent duplicate replay of an already-acknowledged operation', async () => {
    const envelope = buildEnvelope({ operationId: 'op-broadcast-dup' });
    await service.ingest(context, { operations: [envelope] });
    broadcast.emitReplayApplied.mockClear();

    await service.ingest(context, { operations: [envelope] });

    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
  });

  it('emits a clinic-scoped REPLAY_CONFLICT_OPENED broadcast after a new conflict record is persisted', async () => {
    const conflict = buildConflictEnvelope({ operationId: 'op-conflict-broadcast', entityId: 'consultation-broadcast-1' });

    await service.ingest(context, { operations: [], conflicts: [conflict] });

    expect(broadcast.emitReplayConflictOpened).toHaveBeenCalledTimes(1);
    expect(broadcast.emitReplayConflictOpened).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      domain: 'emr',
      entityIds: ['consultation-broadcast-1'],
    });
    expect(broadcast.emitReplayApplied).not.toHaveBeenCalled();
  });

  it('emits a clinic-scoped REPLAY_FAILURE_ESCALATED broadcast when a malformed envelope creates a failure task', async () => {
    const malformed = { deviceId: DEVICE_ID, entityId: 'entity-malformed-1' };

    await service.ingest(context, { operations: [malformed] });

    expect(broadcast.emitReplayFailureEscalated).toHaveBeenCalledTimes(1);
    expect(broadcast.emitReplayFailureEscalated).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      domain: 'unknown',
      entityIds: ['entity-malformed-1'],
    });
  });

  it('defaults to a no-op broadcast when no ReplayBroadcastService is injected (no crash, matches BrowserSyncService convention)', async () => {
    const bareService = new ReplayIngestService(db);
    const envelope = buildEnvelope({ operationId: 'op-no-broadcast' });

    await expect(bareService.ingest(context, { operations: [envelope] })).resolves.toBeDefined();
  });
});

/**
 * Verify-fix 10.7: `QueuePreemptionService.pauseLowerTierReplayForQueue`
 * (T-10-05, D-12 to D-14) was built in Plan 10-02 but had no live caller --
 * a client that skips both the mobile coordinator's own tier-sequencing AND
 * the queue-specific `/queue/sync/replay` endpoint (e.g. a buggy client, or
 * a direct API call) could get a lower-tier write applied through this
 * shared `/sync/replay` ingress with zero server-side ordering enforcement.
 * These prove the shared entry point itself now enforces queue-first
 * ordering, independent of what order the caller submitted operations in.
 */
describe('ReplayIngestService server-side queue-first preemption (verify-fix 10.7)', () => {
  let db: ReturnType<typeof createMockDb>;
  let broadcast: ReturnType<typeof createMockBroadcast>;
  let service: ReplayIngestService;
  const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_ID };

  beforeEach(() => {
    db = createMockDb();
    broadcast = createMockBroadcast();
    service = new ReplayIngestService(db, broadcast as unknown as ReplayBroadcastService, new QueuePreemptionService());
  });

  it('defers a CLINICAL_MEDIUM operation submitted directly to the shared ingress while a QUEUE_HIGH operation in the same batch is still outstanding, and applies the QUEUE_HIGH operation', async () => {
    // Deliberately submitted CLINICAL_MEDIUM FIRST in the array -- a
    // compliant mobile coordinator would never do this, but nothing stops a
    // client bypassing it (or calling this endpoint directly) from doing
    // exactly this. There is no dedicated queue endpoint in play here at
    // all: this is `POST /sync/replay` alone proving the enforcement.
    const clinical = buildEnvelope({
      operationId: 'op-clinical-1',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-preempt-1',
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });
    const queueHigh = buildEnvelope({
      operationId: 'op-queue-1',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-preempt-1',
      priority: ReplayPriority.QUEUE_HIGH,
    });

    const result = await service.ingest(context, { operations: [clinical, queueHigh] });

    expect(result.acknowledgedOperationIds).toEqual(['op-queue-1']);
    expect(result.deferredOperationIds).toEqual(['op-clinical-1']);
    expect(db.__receipts.size).toBe(1);
    expect(db.syncReplayReceipt.create).toHaveBeenCalledTimes(1);
    expect(db.syncReplayReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ operationId: 'op-queue-1' }) }),
    );
  });

  it.each([ReplayPriority.CLINICAL_MEDIUM, ReplayPriority.INVENTORY_MEDIUM, ReplayPriority.ANCILLARY_LOW])(
    'defers a %s operation while QUEUE_HIGH work is outstanding for the same clinic',
    async (priority) => {
      const lowerTier = buildEnvelope({
        operationId: `op-lower-${priority}`,
        domain: 'inventory',
        entityType: 'StockMovement',
        entityId: `entity-lower-${priority}`,
        priority,
      });
      const queueHigh = buildEnvelope({
        operationId: `op-queue-for-${priority}`,
        domain: 'queue',
        entityType: 'QueueEntry',
        entityId: `entity-queue-${priority}`,
        priority: ReplayPriority.QUEUE_HIGH,
      });

      const result = await service.ingest(context, { operations: [lowerTier, queueHigh] });

      expect(result.deferredOperationIds).toContain(`op-lower-${priority}`);
      expect(result.acknowledgedOperationIds).toContain(`op-queue-for-${priority}`);
    },
  );

  it('applies a CLINICAL_MEDIUM operation once every QUEUE_HIGH operation in the batch has already been acknowledged', async () => {
    const queueHigh = buildEnvelope({
      operationId: 'op-queue-2',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-preempt-2',
      priority: ReplayPriority.QUEUE_HIGH,
    });
    const clinical = buildEnvelope({
      operationId: 'op-clinical-2',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-preempt-2',
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });

    // QUEUE_HIGH ordered first this time -- it gets applied, clearing the
    // batch's outstanding backlog before CLINICAL_MEDIUM is reached.
    const result = await service.ingest(context, { operations: [queueHigh, clinical] });

    expect(result.acknowledgedOperationIds).toEqual(['op-queue-2', 'op-clinical-2']);
    expect(result.deferredOperationIds).toEqual([]);
  });

  it('a QUEUE_HIGH operation with no other pending QUEUE_HIGH work never gets deferred (D-12: queue is always tier 0)', async () => {
    const queueHigh = buildEnvelope({ operationId: 'op-queue-solo', priority: ReplayPriority.QUEUE_HIGH });

    const result = await service.ingest(context, { operations: [queueHigh] });

    expect(result.acknowledgedOperationIds).toEqual(['op-queue-solo']);
    expect(result.deferredOperationIds).toEqual([]);
  });

  it('a QUEUE_HIGH operation deferred by an open conflict still counts as outstanding, so a same-batch lower-tier operation stays deferred too (D-05 + D-12 to D-14)', async () => {
    db.__seedOpenConflict(CLINIC_ID, 'queue', 'QueueEntry', 'entity-disputed');

    const queueHigh = buildEnvelope({
      operationId: 'op-queue-disputed',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-disputed',
      priority: ReplayPriority.QUEUE_HIGH,
    });
    const clinical = buildEnvelope({
      operationId: 'op-clinical-behind-disputed-queue',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-behind-disputed-queue',
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });

    const result = await service.ingest(context, { operations: [queueHigh, clinical] });

    expect(result.deferredOperationIds).toEqual(['op-queue-disputed', 'op-clinical-behind-disputed-queue']);
    expect(result.acknowledgedOperationIds).toEqual([]);
  });

  it('D-37: a CLINICAL_MEDIUM operation carrying a safety-critical payload gets no severity-based bypass of queue-first preemption -- it waits its own turn like any other CLINICAL_MEDIUM item', async () => {
    const queueHigh = buildEnvelope({
      operationId: 'op-queue-3',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-preempt-3',
      priority: ReplayPriority.QUEUE_HIGH,
    });
    const clinical = buildEnvelope({
      operationId: 'op-clinical-safety-critical',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-safety-critical',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      payload: { assessment: 'anaphylaxis, requires immediate review' },
    });

    const result = await service.ingest(context, { operations: [clinical, queueHigh] });

    expect(result.deferredOperationIds).toEqual(['op-clinical-safety-critical']);
  });

  it('a QUEUE_HIGH operation already acknowledged before this batch (a harmless duplicate resend) does not falsely defer an unrelated lower-tier operation', async () => {
    const queueHigh = buildEnvelope({
      operationId: 'op-queue-already-acked',
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: 'entity-already-acked',
      priority: ReplayPriority.QUEUE_HIGH,
    });
    // Pre-acknowledge it in an earlier call, matching a real flapping resend.
    await service.ingest(context, { operations: [queueHigh] });

    const clinical = buildEnvelope({
      operationId: 'op-clinical-after-duplicate-queue',
      domain: 'emr',
      entityType: 'Consultation',
      entityId: 'consultation-after-duplicate-queue',
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });

    // Same duplicate QUEUE_HIGH resent again, ahead of the new clinical op.
    const result = await service.ingest(context, { operations: [queueHigh, clinical] });

    expect(result.acknowledgedOperationIds).toEqual(['op-queue-already-acked', 'op-clinical-after-duplicate-queue']);
    expect(result.deferredOperationIds).toEqual([]);
  });
});

/**
 * Verify-fix 10.9: the `findUnique` -> `create` idempotency check for
 * `SyncReplayReceipt` has no transaction and no catch around a concurrent
 * duplicate's P2002 unique-violation on `[clinicId, deviceId, operationId]`.
 * `Promise.all` below fires two `ingest()` calls for the exact same
 * operation without awaiting between them, so both `findUnique` calls
 * resolve "not found" before either `create` runs -- a genuine race, not
 * two sequential idempotent calls (the existing "is idempotent" test above
 * already covers the sequential case and never touches this code path).
 */
describe('ReplayIngestService concurrent duplicate replay (verify-fix 10.9)', () => {
  let db: ReturnType<typeof createMockDb>;
  let broadcast: ReturnType<typeof createMockBroadcast>;
  let service: ReplayIngestService;
  const context = { clinicId: CLINIC_ID, userId: USER_ID, deviceId: DEVICE_ID };

  beforeEach(() => {
    db = createMockDb();
    broadcast = createMockBroadcast();
    service = new ReplayIngestService(db, broadcast as unknown as ReplayBroadcastService);
  });

  it('two genuinely concurrent replays of the same operation both resolve successfully with equivalent ack envelopes, and only one receipt row is created', async () => {
    const envelope = buildEnvelope({ operationId: 'op-concurrent-1' });

    const [first, second] = await Promise.all([
      service.ingest(context, { operations: [envelope] }),
      service.ingest(context, { operations: [envelope] }),
    ]);

    expect(first.acknowledgedOperationIds).toEqual(['op-concurrent-1']);
    expect(second.acknowledgedOperationIds).toEqual(['op-concurrent-1']);
    expect(first.deferredOperationIds).toEqual([]);
    expect(second.deferredOperationIds).toEqual([]);
    expect(first.failureTaskIds).toEqual([]);
    expect(second.failureTaskIds).toEqual([]);

    // The real proof: exactly one row exists, and exactly one of the two
    // concurrent `create` calls actually landed -- the other hit P2002 and
    // was translated into a re-fetch instead of propagating as a 500.
    expect(db.__receipts.size).toBe(1);
    expect(db.syncReplayReceipt.create).toHaveBeenCalledTimes(2);
  });

  it('does not let a genuine P2002 race propagate as an uncaught error', async () => {
    const envelope = buildEnvelope({ operationId: 'op-concurrent-2' });

    await expect(
      Promise.all([
        service.ingest(context, { operations: [envelope] }),
        service.ingest(context, { operations: [envelope] }),
      ]),
    ).resolves.toBeDefined();
  });
});
