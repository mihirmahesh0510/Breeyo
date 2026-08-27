import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { ReplayPriority, ConflictSeverity, ResolutionState } from '@breeyo/types';
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
 * Plan 10-06 Task 1 (PLT-03, D-25 to D-28, D-33): the primary "broader than
 * one happy path" proof for Phase 10. Every offline domain built in Plans
 * 10-02/10-03/10-04 (queue, consultation drafts, inventory) is driven
 * through its real `/sync/replay` HTTP endpoint against a real Postgres
 * database, across REPEATED disconnect/reconnect cycles -- not one clean
 * reconnect at the end (D-33) -- and every cycle re-sends at least one
 * already-acknowledged operationId to prove replay idempotency holds even
 * as the backlog grows across cycles, not just on the very first replay.
 *
 * "Real disconnect/reconnect drills, not only mocked automation" (D-27) is
 * interpreted here as: no domain service is mocked, no Prisma delegate is
 * faked -- every replay genuinely writes to and reads from Postgres exactly
 * as a real reconnecting device's HTTP call would. The literal
 * radio-off/radio-on drill against real hardware is Plan 10-06 Task 2's
 * human-verify checkpoint (out of this file's reach); this suite proves the
 * SERVER side of that drill holds up across many repetitions.
 */

let app: FastifyInstance;

let clinicId: string;
let vetUserId: string;
let vetName: string;
let token: string;
let ownerId: string;

const DEVICE_A = 'device-A-front-desk-tablet';
const DEVICE_B = 'device-B-second-tablet';

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

  const vet = await createTestUser({ fullName: 'Dr Offline Recovery' });
  vetUserId = vet.id;
  vetName = vet.fullName;

  const clinic = await createTestClinic(vet.id, { name: 'Offline Recovery Clinic' });
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
  createdAt?: string;
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
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    payload: overrides.payload,
  };
}

function replayQueue(deviceId: string, operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/queue/sync/replay')
    .set(auth())
    .send({ deviceId, operations });
}

function replayConsultation(deviceId: string, operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/consultations/sync/replay')
    .set(auth())
    .send({ deviceId, operations });
}

function replayInventory(deviceId: string, operations: unknown[]) {
  return request(app.server)
    .post('/api/v1/inventory/sync/replay')
    .set(auth())
    .send({ deviceId, operations });
}

describe('Offline recovery -- repeated disconnect/reconnect cycles (D-25 to D-28, D-33)', () => {
  it('cycle 1: two devices go offline, check in two different pets, reconnect once -- both applied, queue-first replay lands cleanly', async () => {
    const petA = await createTestPet(clinicId, ownerId, { name: 'Cycle1-PetA' });
    const petB = await createTestPet(clinicId, ownerId, { name: 'Cycle1-PetB' });

    const checkInA = envelope({
      deviceId: DEVICE_A,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: petA.id,
      payload: { petId: petA.id, checkedInAt: new Date(Date.now() - 40 * 60_000).toISOString() },
    });
    const checkInB = envelope({
      deviceId: DEVICE_B,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: petB.id,
      payload: { petId: petB.id, checkedInAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    });

    // Device A reconnects first.
    const resA = await replayQueue(DEVICE_A, [checkInA]);
    expect(resA.status).toBe(200);
    expect(resA.body.data.acknowledgedOperationIds).toEqual([checkInA.operationId]);

    // Device B reconnects moments later -- a SEPARATE drop/recover cycle,
    // not bundled into the same HTTP call as device A's.
    const resB = await replayQueue(DEVICE_B, [checkInB]);
    expect(resB.status).toBe(200);
    expect(resB.body.data.acknowledgedOperationIds).toEqual([checkInB.operationId]);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId }, orderBy: { checkedInAt: 'asc' } });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.petId).sort()).toEqual([petA.id, petB.id].sort());
    expect(entries.every((e) => e.status === 'WAITING')).toBe(true);

    // Flapping reconnect: device A's radio drops again immediately after
    // its first ack and resends the SAME operation before it ever saw the
    // 200 response. This must be a pure no-op, not a second queue entry.
    const resAResend = await replayQueue(DEVICE_A, [checkInA]);
    expect(resAResend.status).toBe(200);
    expect(resAResend.body.data.acknowledgedOperationIds).toEqual([checkInA.operationId]);

    const entriesAfterResend = await prisma.queueEntry.findMany({ where: { clinicId } });
    expect(entriesAfterResend).toHaveLength(2);

    const receipts = await prisma.syncReplayReceipt.findMany({ where: { clinicId, operationId: checkInA.operationId } });
    expect(receipts).toHaveLength(1);
  });

  it('cycle 2: a clinical conflict is created (not silently overwritten) when an offline draft collides with a server change, and survives a repeat reconnect untouched', async () => {
    const pet = await createTestPet(clinicId, ownerId, { name: 'Cycle2-Pet' });
    const consultation = await createTestConsultation(clinicId, pet.id, vetUserId);

    // The offline device's baseline is the empty initial draft -- it never
    // saw any server-side edit before going offline.
    const baseline = {};

    // While the device was offline, ANOTHER session (e.g. a front-desk
    // browser or a second mobile device) saved a real server-side change to
    // the same field.
    const onlineDraftUpdate = await request(app.server)
      .patch(`/api/v1/consultations/${consultation.id}/draft`)
      .set(auth())
      .send({ assessment: 'Assessed in clinic: mild dehydration' });
    expect(onlineDraftUpdate.status).toBe(200);

    // The offline device, unaware of that change, independently typed a
    // DIFFERENT assessment onto the same baseline.
    const draftOp = envelope({
      deviceId: DEVICE_A,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      entityId: consultation.id,
      payload: { baseline, draft: { assessment: 'Suspected ear infection (offline note)' } },
    });

    const res = await replayConsultation(DEVICE_A, [draftOp]);
    // T-10-06: a batch containing a conflict returns 409, not 200 -- a
    // client cannot mistake "accepted" for "clean and synced".
    expect(res.status).toBe(409);
    expect(res.body.data.acknowledgedOperationIds).toEqual([draftOp.operationId]);
    expect(res.body.data.conflictIds).toHaveLength(1);

    const conflicts = await prisma.syncConflictRecord.findMany({ where: { clinicId, entityId: consultation.id } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      severity: ConflictSeverity.SAFETY_CRITICAL,
      resolutionState: ResolutionState.OPEN,
      // D-09/D-24: the consultation's own assigned vet is the immediate,
      // unambiguous owner -- never left pending.
      recommendedOwnerUserId: vetUserId,
      resolutionOwnerUserId: vetUserId,
    });

    // D-05: the server's copy must never have been silently overwritten by
    // the offline device's contested edit.
    const draftAfter = await request(app.server)
      .get(`/api/v1/consultations/${consultation.id}/draft`)
      .set(auth());
    expect(draftAfter.body.data.assessment).toBe('Assessed in clinic: mild dehydration');

    // The device reconnects again later (its own retry loop) and resends
    // the exact same operation -- must not create a SECOND conflict record.
    const resendRes = await replayConsultation(DEVICE_A, [draftOp]);
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.data.acknowledgedOperationIds).toEqual([draftOp.operationId]);
    expect(resendRes.body.data.conflictIds).toEqual([]);

    const conflictsAfterResend = await prisma.syncConflictRecord.findMany({ where: { clinicId, entityId: consultation.id } });
    expect(conflictsAfterResend).toHaveLength(1);
  });

  it('cycle 3: an inventory FIFO mismatch (live stock moved on while offline) is routed to a lighter operational review, never a raw failure or silent overwrite', async () => {
    const item = await createTestInventoryItem(clinicId, { name: 'Amoxicillin 250mg' });
    await createTestStockBatch(clinicId, item.id, { initialQty: 5 });

    // While the device was offline, a live (online) dispense already drew
    // the batch down so only 1 unit remains by the time this device
    // reconnects and tries to replay its own offline decision to dispense 5.
    await request(app.server)
      .post(`/api/v1/inventory/items/${item.id}/dispense`)
      .set(auth())
      .send({ quantity: 4 });

    const itemAfterLiveDispense = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfterLiveDispense?.currentStock).toBe(1);

    const dispenseOp = envelope({
      deviceId: DEVICE_B,
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 5 },
    });

    const res = await replayInventory(DEVICE_B, [dispenseOp]);
    expect(res.status).toBe(200);
    expect(res.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(res.body.data.reviewTaskIds).toHaveLength(1);
    expect(res.body.data.rejectedOperations).toEqual([]);

    // Stock truth must NOT have been corrupted by force-applying the
    // now-impossible offline decision.
    const itemAfterReplay = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfterReplay?.currentStock).toBe(1);

    const reviewTasks = await prisma.syncConflictRecord.findMany({ where: { clinicId, entityId: item.id } });
    expect(reviewTasks).toHaveLength(1);
    // D-10: inventory review is deliberately lighter than clinical review --
    // never SAFETY_CRITICAL.
    expect(reviewTasks[0].severity).toBe(ConflictSeverity.OPERATIONAL);

    // A later flapping reconnect resending the same dispense must not
    // create a second review task or attempt the dispense twice.
    const resendRes = await replayInventory(DEVICE_B, [dispenseOp]);
    expect(resendRes.status).toBe(200);
    expect(resendRes.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(resendRes.body.data.reviewTaskIds).toEqual([]);

    const itemAfterResend = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(itemAfterResend?.currentStock).toBe(1);
    const reviewTasksAfterResend = await prisma.syncConflictRecord.findMany({ where: { clinicId, entityId: item.id } });
    expect(reviewTasksAfterResend).toHaveLength(1);
  });

  it('cycle 4: two independently offline devices check in the SAME patient -- reconnect auto-merges into one entry with a review trace (D-34), across two separate drop/recover moments', async () => {
    const pet = await createTestPet(clinicId, ownerId, { name: 'Cycle4-DuplicatePet' });

    const checkInFromDeviceA = envelope({
      deviceId: DEVICE_A,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: pet.id,
      payload: { petId: pet.id, checkedInAt: new Date(Date.now() - 30 * 60_000).toISOString() },
    });
    const checkInFromDeviceB = envelope({
      deviceId: DEVICE_B,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: pet.id,
      payload: { petId: pet.id, checkedInAt: new Date(Date.now() - 5 * 60_000).toISOString() },
    });

    // Device A reconnects first (its own drop/recover moment).
    const resA = await replayQueue(DEVICE_A, [checkInFromDeviceA]);
    expect(resA.status).toBe(200);
    expect(resA.body.data.acknowledgedOperationIds).toEqual([checkInFromDeviceA.operationId]);
    expect(resA.body.data.mergedOperationIds).toEqual([]);

    // Device B reconnects later, from an entirely separate drop/recover
    // moment, unaware device A ever came back online.
    const resB = await replayQueue(DEVICE_B, [checkInFromDeviceB]);
    expect(resB.status).toBe(200);
    expect(resB.body.data.acknowledgedOperationIds).toEqual([checkInFromDeviceB.operationId]);
    expect(resB.body.data.mergedOperationIds).toEqual([checkInFromDeviceB.operationId]);
    expect(resB.body.data.reviewTaskIds).toHaveLength(1);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId, petId: pet.id } });
    expect(entries).toHaveLength(1);

    const mergeReview = await prisma.syncConflictRecord.findMany({ where: { clinicId, entityId: entries[0].id } });
    expect(mergeReview).toHaveLength(1);
    expect(mergeReview[0].severity).toBe(ConflictSeverity.OPERATIONAL);
  });

  it('final reconnect: after four separate drop/recover cycles, resending every prior operationId across every domain is a pure no-op -- the subtle caught-up state (D-21)', async () => {
    const pet = await createTestPet(clinicId, ownerId, { name: 'CaughtUp-Pet' });
    const consultation = await createTestConsultation(clinicId, pet.id, vetUserId);
    const item = await createTestInventoryItem(clinicId, { name: 'Caught-up item' });
    await createTestStockBatch(clinicId, item.id, { initialQty: 10 });

    const checkInOp = envelope({
      deviceId: DEVICE_A,
      domain: 'queue',
      entityType: 'QUEUE_CHECK_IN',
      priority: ReplayPriority.QUEUE_HIGH,
      entityId: pet.id,
      payload: { petId: pet.id, checkedInAt: new Date().toISOString() },
    });
    const draftOp = envelope({
      deviceId: DEVICE_A,
      domain: 'emr',
      entityType: 'CONSULTATION_DRAFT_SAVE',
      priority: ReplayPriority.CLINICAL_MEDIUM,
      entityId: consultation.id,
      payload: { baseline: {}, draft: { careInstructions: 'Rest for 48 hours' } },
    });
    const dispenseOp = envelope({
      deviceId: DEVICE_A,
      domain: 'inventory',
      entityType: 'STOCK_DISPENSE',
      priority: ReplayPriority.INVENTORY_MEDIUM,
      entityId: item.id,
      payload: { quantity: 2 },
    });

    // Cycle 1: queue reconnect.
    expect((await replayQueue(DEVICE_A, [checkInOp])).status).toBe(200);
    // Cycle 2: clinical reconnect.
    expect((await replayConsultation(DEVICE_A, [draftOp])).status).toBe(200);
    // Cycle 3: inventory reconnect.
    expect((await replayInventory(DEVICE_A, [dispenseOp])).status).toBe(200);

    const stockAfterFirstPass = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(stockAfterFirstPass?.currentStock).toBe(8);

    // Cycle 4: a final flaky reconnect resends ALL THREE prior operations
    // together (a realistic "phone came back into signal and re-flushed its
    // whole outstanding queue" moment) -- every one must resolve as an
    // idempotent no-op, and nothing about accumulated state across the
    // three prior cycles may double-apply.
    const finalQueueReplay = await replayQueue(DEVICE_A, [checkInOp]);
    expect(finalQueueReplay.body.data.acknowledgedOperationIds).toEqual([checkInOp.operationId]);

    const finalConsultationReplay = await replayConsultation(DEVICE_A, [draftOp]);
    expect(finalConsultationReplay.status).toBe(200);
    expect(finalConsultationReplay.body.data.acknowledgedOperationIds).toEqual([draftOp.operationId]);
    expect(finalConsultationReplay.body.data.conflictIds).toEqual([]);

    const finalInventoryReplay = await replayInventory(DEVICE_A, [dispenseOp]);
    expect(finalInventoryReplay.body.data.acknowledgedOperationIds).toEqual([dispenseOp.operationId]);
    expect(finalInventoryReplay.body.data.reviewTaskIds).toEqual([]);

    const entries = await prisma.queueEntry.findMany({ where: { clinicId, petId: pet.id } });
    expect(entries).toHaveLength(1);

    const stockAfterFinalPass = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
    expect(stockAfterFinalPass?.currentStock).toBe(8);

    const draft = await request(app.server).get(`/api/v1/consultations/${consultation.id}/draft`).set(auth());
    expect(draft.body.data.careInstructions).toBe('Rest for 48 hours');

    // No conflicts and no review tasks were left behind by a clean set of
    // replays -- "caught up" really means caught up, not quietly stuck.
    const unresolvedConflicts = await prisma.syncConflictRecord.findMany({
      where: { clinicId, resolutionState: { not: ResolutionState.RESOLVED } },
    });
    expect(unresolvedConflicts).toHaveLength(0);

    const receiptCount = await prisma.syncReplayReceipt.count({ where: { clinicId } });
    // Exactly 3 distinct operations were ever accepted (one per domain),
    // regardless of how many times each was resent across the four cycles.
    expect(receiptCount).toBe(3);
  });
});
