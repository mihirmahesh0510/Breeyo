import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let accessToken: string;
let userId: string;
let clinicId: string;

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

async function makePet() {
  const owner = await createTestPetOwner(clinicId);
  return createTestPet(clinicId, owner.id);
}

/**
 * Directly inserts an EXPECTED queue entry with an explicit queuePriorityAt,
 * bypassing checkIn() -- this is what plan 08-09's sweep will do (create an
 * EXPECTED row with queuePriorityAt = appointment.scheduledFor), simulated
 * here with a raw Prisma write since the sweep itself is a later plan.
 */
async function insertExpectedEntry(
  petId: string,
  queuePriorityAt: Date,
  overrides: { isEmergency?: boolean; checkedInAt?: Date } = {},
) {
  return prisma.queueEntry.create({
    data: {
      clinicId,
      petId,
      checkedInBy: userId,
      status: 'EXPECTED',
      position: 0,
      isEmergency: overrides.isEmergency ?? false,
      queuePriorityAt,
      // Deliberately stale unless overridden: a real discriminator for D-11
      // (the WAITING transition must overwrite this to "now", not leave the
      // sweep's creation-time default in place).
      checkedInAt: overrides.checkedInAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });
}

async function checkIn(overrides: { isEmergency?: boolean; visitReason?: string } = {}) {
  const pet = await makePet();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { petId: pet.id, ...overrides },
  });
  return res.json().data;
}

async function transitionStatus(entryId: string, status: string) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/queue/${entryId}/status`,
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { status },
  });
}

async function getBoard() {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return res.json().data;
}

async function callNext() {
  return app.inject({
    method: 'POST',
    url: '/api/v1/queue/call-next',
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();
  });
  await cleanupTestData();

  const ctx = await setupTestContext();
  accessToken = ctx.accessToken;
  userId = ctx.user.id;
  clinicId = ctx.clinic.id;
});

describe('Queue priority ordering (D-10, D-11, D-34)', () => {
  it('walk-in check-in sets queuePriorityAt to now', async () => {
    const entry = await checkIn();

    const fetched = await prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });

    const deltaMs = Math.abs(fetched.queuePriorityAt.getTime() - fetched.checkedInAt.getTime());
    expect(deltaMs).toBeLessThanOrEqual(1000);
  });

  it('scheduled patient checking in later still sorts first (D-10)', async () => {
    const scheduledPet = await makePet();
    // The scheduled slot's queuePriorityAt is set well before "now" -- the
    // walk-in's queuePriorityAt (set to the instant it checks in) is always
    // later than this, regardless of what wall-clock time the suite runs at.
    const slotTime = new Date(Date.now() - 5 * 60 * 1000);
    const expectedEntry = await insertExpectedEntry(scheduledPet.id, slotTime);

    // A walk-in checks in after the scheduled entry was created (later
    // queuePriorityAt), but the scheduled patient physically arrives and is
    // checked in second (later checkedInAt) -- D-10 says it must still sort
    // ahead of the walk-in on the visible board.
    const walkinEntry = await checkIn();

    const transitionRes = await transitionStatus(expectedEntry.id, 'WAITING');
    expect(transitionRes.statusCode).toBe(200);

    const board = await getBoard();
    expect(board.waiting).toHaveLength(2);
    expect(board.waiting[0].id).toBe(expectedEntry.id);
    expect(board.waiting[1].id).toBe(walkinEntry.id);
  });

  it('emergency still outranks priority time', async () => {
    const scheduledPet = await makePet();
    const slotTime = new Date(Date.now() - 10 * 60 * 1000);
    const expectedEntry = await insertExpectedEntry(scheduledPet.id, slotTime);
    await transitionStatus(expectedEntry.id, 'WAITING');

    const emergencyEntry = await checkIn({ isEmergency: true });

    const board = await getBoard();
    expect(board.waiting).toHaveLength(2);
    expect(board.waiting[0].id).toBe(emergencyEntry.id);
    expect(board.waiting[0].isEmergency).toBe(true);
    expect(board.waiting[1].id).toBe(expectedEntry.id);
  });

  it('call-next agrees with the board', async () => {
    const scheduledPet = await makePet();
    const slotTime = new Date(Date.now() - 10 * 60 * 1000);
    const expectedEntry = await insertExpectedEntry(scheduledPet.id, slotTime);
    await transitionStatus(expectedEntry.id, 'WAITING');
    await checkIn();

    const board = await getBoard();
    expect(board.waiting.length).toBeGreaterThan(0);

    const res = await callNext();
    expect(res.statusCode).toBe(200);
    const called = res.json().data;

    expect(called.id).toBe(board.waiting[0].id);
  });

  it('early check-in does not change priority (D-11)', async () => {
    const scheduledPet = await makePet();
    // Slot time is in the future -- the patient checks in early, before
    // their slot, but the queue priority must stay pinned to the slot time.
    const slotTime = new Date(Date.now() + 60 * 60 * 1000);
    const expectedEntry = await insertExpectedEntry(scheduledPet.id, slotTime);

    const beforeTransition = new Date();
    const res = await transitionStatus(expectedEntry.id, 'WAITING');
    expect(res.statusCode).toBe(200);

    const fetched = await prisma.queueEntry.findUniqueOrThrow({ where: { id: expectedEntry.id } });
    expect(fetched.queuePriorityAt.toISOString()).toBe(slotTime.toISOString());
    expect(fetched.checkedInAt.getTime()).toBeGreaterThanOrEqual(beforeTransition.getTime() - 1000);
  });

  it('simultaneous double-booked entries tiebreak by checkedInAt (D-34)', async () => {
    const petA = await makePet();
    const petB = await makePet();
    // D-14 double-booking: two appointments at the identical slot time.
    const identicalSlotTime = new Date(Date.now() - 60 * 1000);
    const entryA = await insertExpectedEntry(petA.id, identicalSlotTime);
    const entryB = await insertExpectedEntry(petB.id, identicalSlotTime);

    await transitionStatus(entryA.id, 'WAITING');
    await transitionStatus(entryB.id, 'WAITING');

    // Force explicit, five-second-apart checkedInAt values so ordering is
    // deterministic rather than dependent on the wall-clock gap between the
    // two PATCH requests above.
    const earlier = new Date(Date.now() - 10000);
    const later = new Date(Date.now() - 5000);
    await prisma.queueEntry.update({ where: { id: entryA.id }, data: { checkedInAt: later } });
    await prisma.queueEntry.update({ where: { id: entryB.id }, data: { checkedInAt: earlier } });

    const board = await getBoard();
    expect(board.waiting).toHaveLength(2);
    // Both share identical queuePriorityAt; entryB has the earlier checkedInAt.
    expect(board.waiting[0].id).toBe(entryB.id);
    expect(board.waiting[1].id).toBe(entryA.id);
  });
});
