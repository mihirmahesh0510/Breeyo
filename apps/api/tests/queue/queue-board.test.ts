import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let accessToken: string;
let clinicId: string;

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

async function registerAndCheckIn(
  token: string,
  overrides: { isEmergency?: boolean; visitReason?: string } = {},
) {
  const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      owner: { mobile, name: 'Test Owner' },
      pet: { name: `Pet-${mobile.slice(-4)}`, species: 'DOG' },
    },
  });
  const { pet } = regRes.json().data;

  const checkInRes = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${token}` },
    payload: { petId: pet.id, ...overrides },
  });
  return checkInRes.json().data;
}

async function getBoard(token: string) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/queue',
    headers: { authorization: `Bearer ${token}` },
  });
  return res.json().data;
}

async function transitionStatus(
  token: string,
  entryId: string,
  status: string,
) {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/v1/queue/${entryId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status },
  });
  return res;
}

async function callNext(token: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/queue/call-next',
    headers: { authorization: `Bearer ${token}` },
  });
  return res;
}

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(async () => {
  // Clean queue entries and patient data before each test
  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();
  });
  await cleanupTestData();

  // Create fresh test context
  const ctx = await setupTestContext();
  accessToken = ctx.accessToken;
  clinicId = ctx.clinic.id;
});

describe('Queue Board', () => {
  describe('get queue board', () => {
    it('returns entries grouped by status: inConsult, waiting, done', async () => {
      // Check in 3 patients
      const entry1 = await registerAndCheckIn(accessToken);
      const entry2 = await registerAndCheckIn(accessToken);
      const entry3 = await registerAndCheckIn(accessToken);

      // Transition entry1 to IN_CONSULT
      await transitionStatus(accessToken, entry1.id, 'IN_CONSULT');

      // Transition entry3 to IN_CONSULT then DONE
      await transitionStatus(accessToken, entry3.id, 'IN_CONSULT');
      await transitionStatus(accessToken, entry3.id, 'DONE');

      const board = await getBoard(accessToken);

      expect(board).toHaveProperty('inConsult');
      expect(board).toHaveProperty('waiting');
      expect(board).toHaveProperty('done');
      expect(Array.isArray(board.inConsult)).toBe(true);
      expect(Array.isArray(board.waiting)).toBe(true);
      expect(Array.isArray(board.done)).toBe(true);

      // entry1 should be in inConsult
      expect(board.inConsult).toHaveLength(1);
      expect(board.inConsult[0].id).toBe(entry1.id);

      // entry2 should be in waiting
      expect(board.waiting).toHaveLength(1);
      expect(board.waiting[0].id).toBe(entry2.id);

      // entry3 should be in done
      expect(board.done).toHaveLength(1);
      expect(board.done[0].id).toBe(entry3.id);
    });

    it('waiting entries ordered by isEmergency desc, checkedInAt asc', async () => {
      // Check in a normal patient first
      const normalEntry = await registerAndCheckIn(accessToken, {
        isEmergency: false,
      });

      // Small delay to ensure different checkedInAt timestamps
      await new Promise((r) => setTimeout(r, 50));

      // Check in an emergency patient second
      const emergencyEntry = await registerAndCheckIn(accessToken, {
        isEmergency: true,
      });

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(2);
      // Emergency should be first despite being checked in later
      expect(board.waiting[0].id).toBe(emergencyEntry.id);
      expect(board.waiting[0].isEmergency).toBe(true);
      expect(board.waiting[1].id).toBe(normalEntry.id);
      expect(board.waiting[1].isEmergency).toBe(false);
    });

    it('excludes archived entries', async () => {
      const entry = await registerAndCheckIn(accessToken);

      // Directly archive the entry via Prisma
      await prisma.queueEntry.update({
        where: { id: entry.id },
        data: { archivedAt: new Date() },
      });

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(0);
      expect(board.inConsult).toHaveLength(0);
      expect(board.done).toHaveLength(0);
    });

    it('includes pet and owner info on each entry', async () => {
      await registerAndCheckIn(accessToken);

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(1);
      const entry = board.waiting[0];

      // Should include nested pet object with name
      expect(entry).toHaveProperty('pet');
      expect(entry.pet).toHaveProperty('name');
      expect(typeof entry.pet.name).toBe('string');

      // Should include nested owner object with name
      expect(entry.pet).toHaveProperty('owner');
      expect(entry.pet.owner).toHaveProperty('name');
      expect(typeof entry.pet.owner.name).toBe('string');
    });
  });

  describe('queue position and estimated wait (QUE-03)', () => {
    it('computes position dynamically based on WAITING entries ahead', async () => {
      // Check in 3 patients
      await registerAndCheckIn(accessToken);
      await new Promise((r) => setTimeout(r, 20));
      await registerAndCheckIn(accessToken);
      await new Promise((r) => setTimeout(r, 20));
      await registerAndCheckIn(accessToken);

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(3);
      expect(board.waiting[0].computedPosition).toBe(1);
      expect(board.waiting[1].computedPosition).toBe(2);
      expect(board.waiting[2].computedPosition).toBe(3);
    });

    it('emergency patients are position 1 regardless of check-in time', async () => {
      // Check in normal patient first
      await registerAndCheckIn(accessToken, { isEmergency: false });
      await new Promise((r) => setTimeout(r, 50));

      // Check in emergency patient second
      await registerAndCheckIn(accessToken, { isEmergency: true });

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(2);
      // Emergency is sorted first, so computedPosition should be 1
      const emergencyEntry = board.waiting.find(
        (e: { isEmergency: boolean }) => e.isEmergency,
      );
      expect(emergencyEntry).toBeDefined();
      expect(emergencyEntry.computedPosition).toBe(1);
    });

    it('estimated wait = position x rolling 7-day average consultation time', async () => {
      await registerAndCheckIn(accessToken);

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(1);
      // estimatedWaitSeconds should exist on waiting entries
      expect(board.waiting[0]).toHaveProperty('estimatedWaitSeconds');
      expect(typeof board.waiting[0].estimatedWaitSeconds).toBe('number');
      expect(board.waiting[0].estimatedWaitSeconds).toBeGreaterThan(0);
    });

    it('defaults to 15 min per consultation when fewer than 5 data points', async () => {
      // Fresh clinic with no consultation history, so avg will return null
      // and service defaults to 900 seconds (15 min)
      await registerAndCheckIn(accessToken);
      await new Promise((r) => setTimeout(r, 20));
      await registerAndCheckIn(accessToken);

      const board = await getBoard(accessToken);

      expect(board.waiting).toHaveLength(2);
      // Position 1 x 900 = 900 seconds
      expect(board.waiting[0].estimatedWaitSeconds).toBe(900);
      // Position 2 x 900 = 1800 seconds
      expect(board.waiting[1].estimatedWaitSeconds).toBe(1800);
    });
  });

  describe('call next (QUE-05)', () => {
    it('selects oldest WAITING entry', async () => {
      // Check in 2 patients in order
      const entry1 = await registerAndCheckIn(accessToken);
      await new Promise((r) => setTimeout(r, 50));
      const entry2 = await registerAndCheckIn(accessToken);

      const res = await callNext(accessToken);

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      // Should select the first (oldest) patient
      expect(data.id).toBe(entry1.id);
    });

    it('selects emergency patients before non-emergency (FIFO within each group)', async () => {
      // Check in normal patient first
      const normalEntry = await registerAndCheckIn(accessToken, {
        isEmergency: false,
      });
      await new Promise((r) => setTimeout(r, 50));

      // Check in emergency patient second
      const emergencyEntry = await registerAndCheckIn(accessToken, {
        isEmergency: true,
      });

      const res = await callNext(accessToken);

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      // Emergency should be called first despite being checked in later
      expect(data.id).toBe(emergencyEntry.id);
    });

    it('transitions selected entry to IN_CONSULT', async () => {
      await registerAndCheckIn(accessToken);

      const res = await callNext(accessToken);

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.status).toBe('IN_CONSULT');
    });

    it('assigns treating vet to the entry (D-37)', async () => {
      // Re-create context to capture the user id
      const user = await createTestUser();
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id);
      const { accessToken: vetToken } = await createTestTokens(
        app,
        user.id,
        clinic.id,
      );

      // Register and check in under this vet's clinic
      const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/register',
        headers: { authorization: `Bearer ${vetToken}` },
        payload: {
          owner: { mobile, name: 'Vet Test Owner' },
          pet: { name: 'VetPet', species: 'CAT' },
        },
      });
      const { pet } = regRes.json().data;

      await app.inject({
        method: 'POST',
        url: '/api/v1/queue/check-in',
        headers: { authorization: `Bearer ${vetToken}` },
        payload: { petId: pet.id },
      });

      const res = await callNext(vetToken);

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.treatingVetId).toBe(user.id);
    });

    it('returns 404 when no patients waiting', async () => {
      const res = await callNext(accessToken);

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NO_PATIENTS_WAITING');
    });
  });
});
