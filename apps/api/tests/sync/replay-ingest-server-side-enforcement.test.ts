import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ReplayPriority } from '@breeyo/types';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';

/**
 * Verify-fix 10.7 + 10.9: real HTTP + real Postgres proof for two gaps in
 * `ReplayIngestService` (the generic `POST /sync/replay` ingress, reachable
 * for any domain by any client -- not only the mobile coordinator, and not
 * only through a domain-specific replay route):
 *
 * - 10.7: `QueuePreemptionService.pauseLowerTierReplayForQueue` (D-12 to
 *   D-14) was built but had no live caller. A client that skips the mobile
 *   coordinator's own tier-sequencing entirely and calls this shared
 *   endpoint directly got zero server-side ordering enforcement.
 * - 10.9: the `findUnique` -> `create` idempotency check for
 *   `SyncReplayReceipt` had no catch around a genuinely concurrent
 *   duplicate's P2002 unique-violation, so a real race produced an
 *   uncaught 500 instead of an idempotent ack.
 *
 * Matches `retry-escalation-routes.test.ts` / `offline-recovery.e2e.test.ts`
 * convention: nothing mocked, every assertion is against a real HTTP
 * response and/or a real database row.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let token: string;

const DEVICE_A = 'device-server-side-enforcement-A';

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const vet = await createTestUser({ fullName: 'Dr Server Side Enforcement' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'Server Side Enforcement Clinic' });
  clinicId = clinic.id;
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function envelope(overrides: {
  deviceId: string;
  operationId?: string;
  domain: string;
  entityType: string;
  entityId: string;
  priority: ReplayPriority;
  payload?: unknown;
}) {
  return {
    deviceId: overrides.deviceId,
    operationId: overrides.operationId ?? randomUUID(),
    // Ignored server-side (session wins) but must be non-empty to pass the
    // shared envelope schema -- see `offlineOperationEnvelopeSchema`.
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: overrides.domain,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    priority: overrides.priority,
    createdAt: new Date().toISOString(),
    payload: overrides.payload ?? {},
  };
}

function replay(deviceId: string, operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/sync/replay')
    .set(auth())
    .send({ deviceId, operations });
}

describe('POST /sync/replay server-side queue-first preemption (verify-fix 10.7, D-12 to D-14, T-10-05)', () => {
  it('defers a CLINICAL_MEDIUM operation while QUEUE_HIGH work is outstanding for the same clinic, submitted directly to the shared endpoint -- not through the mobile coordinator or the dedicated /queue/sync/replay route', async () => {
    const clinicalOperationId = randomUUID();
    const queueOperationId = randomUUID();

    // Deliberately: (1) hits the GENERIC /sync/replay endpoint directly,
    // never /queue/sync/replay; (2) lists the CLINICAL_MEDIUM operation
    // FIRST, exactly the ordering a buggy/bypassing client (not the real
    // mobile coordinator) might send. Proving THIS still gets deferred is
    // what proves server-side enforcement independent of client behavior.
    const clinical = envelope({
      deviceId: DEVICE_A,
      operationId: clinicalOperationId,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      entityId: randomUUID(),
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });
    const queueHigh = envelope({
      deviceId: DEVICE_A,
      operationId: queueOperationId,
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: randomUUID(),
      priority: ReplayPriority.QUEUE_HIGH,
    });

    const res = await replay(DEVICE_A, [clinical, queueHigh]);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([queueOperationId]);
    expect(res.body.data.deferredOperationIds).toEqual([clinicalOperationId]);

    // Real DB proof, not just the HTTP response: the deferred operation
    // genuinely never got a receipt written -- it was NOT applied.
    const clinicalReceipt = await prisma.syncReplayReceipt.findUnique({
      where: { clinicId_deviceId_operationId: { clinicId, deviceId: DEVICE_A, operationId: clinicalOperationId } },
    });
    expect(clinicalReceipt).toBeNull();

    const queueReceipt = await prisma.syncReplayReceipt.findUnique({
      where: { clinicId_deviceId_operationId: { clinicId, deviceId: DEVICE_A, operationId: queueOperationId } },
    });
    expect(queueReceipt).not.toBeNull();
  });

  it('applies the same CLINICAL_MEDIUM operation once no QUEUE_HIGH work remains outstanding', async () => {
    const clinicalOperationId = randomUUID();
    const queueOperationId = randomUUID();

    // QUEUE_HIGH ordered first this time -- it is applied, clearing the
    // batch's outstanding backlog before CLINICAL_MEDIUM is reached.
    const queueHigh = envelope({
      deviceId: DEVICE_A,
      operationId: queueOperationId,
      domain: 'queue',
      entityType: 'QueueEntry',
      entityId: randomUUID(),
      priority: ReplayPriority.QUEUE_HIGH,
    });
    const clinical = envelope({
      deviceId: DEVICE_A,
      operationId: clinicalOperationId,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      entityId: randomUUID(),
      priority: ReplayPriority.CLINICAL_MEDIUM,
    });

    const res = await replay(DEVICE_A, [queueHigh, clinical]);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([queueOperationId, clinicalOperationId]);
    expect(res.body.data.deferredOperationIds).toEqual([]);
  });
});

describe('POST /sync/replay concurrent duplicate replay (verify-fix 10.9)', () => {
  it('two genuinely concurrent HTTP requests replaying the same operation both resolve successfully with equivalent ack envelopes, and only one SyncReplayReceipt row exists', async () => {
    const operationId = randomUUID();
    const entityId = randomUUID();
    const op = envelope({
      deviceId: DEVICE_A,
      operationId,
      domain: 'inventory',
      entityType: 'StockMovement',
      entityId,
      priority: ReplayPriority.INVENTORY_MEDIUM,
    });

    // Real concurrency: two independent HTTP requests fired without
    // awaiting between them, each opening its own connection/transaction --
    // not two sequential `await`s, which would never race.
    const [first, second] = await Promise.all([replay(DEVICE_A, [op]), replay(DEVICE_A, [op])]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.acknowledgedOperationIds).toEqual([operationId]);
    expect(second.body.data.acknowledgedOperationIds).toEqual([operationId]);
    expect(first.body.data.deferredOperationIds).toEqual([]);
    expect(second.body.data.deferredOperationIds).toEqual([]);
    expect(first.body.data.failureTaskIds).toEqual([]);
    expect(second.body.data.failureTaskIds).toEqual([]);

    const receipts = await prisma.syncReplayReceipt.findMany({
      where: { clinicId, deviceId: DEVICE_A, operationId },
    });
    expect(receipts).toHaveLength(1);
  });
});
