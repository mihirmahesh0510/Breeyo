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
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestInventoryItem,
  createTestStockBatch,
  prisma,
} from '../helpers/factories.js';

/**
 * WR-10: `QueuePreemptionService.pauseLowerTierReplayForQueue` (D-12 to
 * D-14) was only ever wired into the generic `POST /sync/replay` ingress
 * (Verify-fix 10.7), but the mobile app's real reconnect/replay flow
 * (`buildReplayCycleDeps.ts`'s `REPLAY_PATH_BY_DOMAIN`) never calls that
 * endpoint -- it only ever calls the three domain-specific endpoints
 * (`/queue/sync/replay`, `/inventory/sync/replay`,
 * `/consultations/sync/replay`). Enforcement was unreachable for real
 * traffic. This suite proves the fix: the domain-specific INVENTORY and EMR
 * replay endpoints now genuinely defer a lower-tier operation while
 * QUEUE_HIGH work the calling device reports is still outstanding, verified
 * against the real `SyncReplayReceipt` ledger (not a bare client-supplied
 * count) -- real HTTP + real Postgres, matching
 * `replay-ingest-server-side-enforcement.test.ts`'s convention.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let ownerId: string;
let token: string;

const DEVICE_A = 'device-domain-replay-preemption-A';

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

  const vet = await createTestUser({ fullName: 'Dr Domain Replay Preemption' });
  vetUserId = vet.id;

  const clinic = await createTestClinic(vet.id, { name: 'Domain Replay Preemption Clinic' });
  clinicId = clinic.id;
  await createTestClinicMember(vet.id, clinic.id, 'Admin');
  token = (await createTestTokens(app, vet.id, clinic.id)).accessToken;

  const owner = await createTestPetOwner(clinicId);
  ownerId = owner.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

function envelope(overrides: {
  deviceId: string;
  operationId?: string;
  domain: string;
  entityType: string;
  entityId: string;
  priority: ReplayPriority;
  payload: unknown;
}) {
  return {
    deviceId: overrides.deviceId,
    operationId: overrides.operationId ?? randomUUID(),
    clinicId: 'ignored-by-server',
    userId: 'ignored-by-server',
    domain: overrides.domain,
    entityType: overrides.entityType,
    entityId: overrides.entityId,
    priority: overrides.priority,
    createdAt: new Date().toISOString(),
    payload: overrides.payload,
  };
}

function replayInventory(deviceId: string, operations: unknown[], pendingQueueHighOperationIds: string[] = []) {
  return request(app.server)
    .post('/api/v1/inventory/sync/replay')
    .set(auth())
    .send({ deviceId, operations, pendingQueueHighOperationIds });
}

function replayConsultation(deviceId: string, operations: unknown[], pendingQueueHighOperationIds: string[] = []) {
  return request(app.server)
    .post('/api/v1/consultations/sync/replay')
    .set(auth())
    .send({ deviceId, operations, pendingQueueHighOperationIds });
}

function replayQueue(deviceId: string, operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/queue/sync/replay')
    .set(auth())
    .send({ deviceId, operations });
}

describe('POST /inventory/sync/replay -- server-side queue-first preemption (WR-10, D-12 to D-14)', () => {
  it('defers an INVENTORY_MEDIUM replay while the device reports a still-outstanding QUEUE_HIGH operationId', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Preemption Item A' });
    await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    const pendingQueueOperationId = randomUUID();
    const dispenseOp = envelope({
      deviceId: DEVICE_A,
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 2 },
    });

    const res = await replayInventory(DEVICE_A, [dispenseOp], [pendingQueueOperationId]);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([]);
    expect(res.body.data.deferredOperationIds).toEqual([dispenseOp.operationId]);

    // Real DB proof: never applied -- no receipt, stock untouched.
    const receipt = await prisma.syncReplayReceipt.findUnique({
      where: { clinicId_deviceId_operationId: { clinicId, deviceId: DEVICE_A, operationId: dispenseOp.operationId } },
    });
    expect(receipt).toBeNull();

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfter?.currentStock).toBe(10);
  });

  it('applies the INVENTORY_MEDIUM replay normally when no QUEUE_HIGH work is reported as pending', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Preemption Item B' });
    await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    const dispenseOp = envelope({
      deviceId: DEVICE_A,
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 2 },
    });

    const res = await replayInventory(DEVICE_A, [dispenseOp], []);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(res.body.data.deferredOperationIds).toEqual([]);

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfter?.currentStock).toBe(8);
  });

  it('applies normally once the reported QUEUE_HIGH operationId has already been replayed (receipted) for real', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Preemption Item C' });
    await createTestStockBatch(clinicId, item.id, { initialQty: 10 });
    const pet = await createTestPet(clinicId, ownerId, { name: 'Preemption-Pet' });

    // A genuinely-applied QUEUE_HIGH check-in through the real queue replay
    // path -- this is what "already replayed" looks like in practice.
    const checkInOp = envelope({
      deviceId: DEVICE_A,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: pet.id,
      payload: { petId: pet.id, checkedInAt: new Date().toISOString() },
    });
    const queueRes = await replayQueue(DEVICE_A, [checkInOp]);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.data.acknowledgedOperationIds).toEqual([checkInOp.operationId]);

    const dispenseOp = envelope({
      deviceId: DEVICE_A,
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 2 },
    });

    // The device is slow to notice the queue op is already acknowledged and
    // still reports it as pending -- the server must verify, not trust.
    const res = await replayInventory(DEVICE_A, [dispenseOp], [checkInOp.operationId]);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(res.body.data.deferredOperationIds).toEqual([]);

    const itemAfter = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfter?.currentStock).toBe(8);
  });
});

describe('POST /consultations/sync/replay -- server-side queue-first preemption (WR-10, D-12 to D-14)', () => {
  it('defers a CLINICAL_MEDIUM replay while the device reports a still-outstanding QUEUE_HIGH operationId', async () => {
    const pet = await createTestPet(clinicId, ownerId, { name: 'Preemption-EMR-Pet-A' });
    const consultation = await createTestConsultation(clinicId, pet.id, vetUserId);

    const pendingQueueOperationId = randomUUID();
    const draftOp = envelope({
      deviceId: DEVICE_A,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      entityId: consultation.id,
      payload: { baseline: {}, draft: { assessment: 'Should not apply while queue is pending' } },
    });

    const res = await replayConsultation(DEVICE_A, [draftOp], [pendingQueueOperationId]);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([]);
    expect(res.body.data.deferredOperationIds).toEqual([draftOp.operationId]);

    const receipt = await prisma.syncReplayReceipt.findUnique({
      where: { clinicId_deviceId_operationId: { clinicId, deviceId: DEVICE_A, operationId: draftOp.operationId } },
    });
    expect(receipt).toBeNull();

    const draftAfter = await request(app.server).get(`/api/v1/consultations/${consultation.id}/draft`).set(auth());
    expect(draftAfter.body.data.assessment).not.toBe('Should not apply while queue is pending');
  });

  it('applies the CLINICAL_MEDIUM replay normally when no QUEUE_HIGH work is reported as pending', async () => {
    const pet = await createTestPet(clinicId, ownerId, { name: 'Preemption-EMR-Pet-B' });
    const consultation = await createTestConsultation(clinicId, pet.id, vetUserId);

    const draftOp = envelope({
      deviceId: DEVICE_A,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      entityId: consultation.id,
      payload: { baseline: {}, draft: { assessment: 'Applied with no queue backlog' } },
    });

    const res = await replayConsultation(DEVICE_A, [draftOp], []);

    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([draftOp.operationId]);
    expect(res.body.data.deferredOperationIds).toEqual([]);

    const draftAfter = await request(app.server).get(`/api/v1/consultations/${consultation.id}/draft`).set(auth());
    expect(draftAfter.body.data.assessment).toBe('Applied with no queue backlog');
  });
});
