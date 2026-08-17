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
import { QUEUE_BACKLOG_THRESHOLD, SCHEDULING_TIMEZONE } from '@breeyo/types';

let app: FastifyInstance;
let token: string;
let userId: string;
let clinicId: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

/**
 * Creates a test user, clinic, and clinic member, then generates auth tokens.
 */
async function setupAuthenticatedUser() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

/**
 * Registers an owner + pet via the combined registration endpoint and returns the data.
 */
async function createTestPatient(appInstance: FastifyInstance, authToken: string) {
  const registerRes = await appInstance.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${authToken}` },
    payload: {
      owner: {
        mobile: `${6000000000 + Math.floor(Math.random() * 3999999999)}`,
        name: 'Test Owner',
      },
      pet: { name: 'Buddy', species: 'DOG' },
    },
  });
  return registerRes.json().data;
}

/**
 * Shorthand for the check-in POST request.
 */
function checkIn(
  authToken: string,
  payload: { petId: string; visitReason?: string; isEmergency?: boolean; reCheckIn?: boolean },
) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${authToken}` },
    payload,
  });
}

describe('Queue Check-in (QUE-01)', () => {
  beforeEach(async () => {
    // Clean queue entries first (depends on Pet), then other tables
    await prisma.queueEntry.deleteMany();
    await prisma.pet.deleteMany();
    await prisma.petOwner.deleteMany();
    await cleanupTestData();

    // Set up fresh authenticated user for each test
    const setup = await setupAuthenticatedUser();
    token = setup.token;
    userId = setup.user.id;
    clinicId = setup.clinic.id;
  });

  it('creates queue entry for a pet', async () => {
    const patient = await createTestPatient(app, token);
    const petId = patient.pet.id;

    const res = await checkIn(token, { petId });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.petId).toBe(petId);
    expect(body.data.status).toBe('WAITING');
    expect(body.data.position).toBe(1);
    expect(body.data.isEmergency).toBe(false);
    expect(body.data.visitReason).toBeNull();
    expect(body.data.checkedInAt).toBeDefined();
    // Includes nested pet and owner
    expect(body.data.pet).toBeDefined();
    expect(body.data.pet.owner).toBeDefined();
  });

  it('assigns correct position based on waiting count', async () => {
    // Create two patients
    const patient1 = await createTestPatient(app, token);
    const patient2 = await createTestPatient(app, token);

    // Check in first pet
    const res1 = await checkIn(token, { petId: patient1.pet.id });
    expect(res1.statusCode).toBe(201);
    expect(res1.json().data.position).toBe(1);

    // Check in second pet -- should be position 2
    const res2 = await checkIn(token, { petId: patient2.pet.id });
    expect(res2.statusCode).toBe(201);
    expect(res2.json().data.position).toBe(2);
  });

  it('sets emergency flag when isEmergency is true (D-15)', async () => {
    const patient = await createTestPatient(app, token);

    const res = await checkIn(token, {
      petId: patient.pet.id,
      isEmergency: true,
    });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.data.isEmergency).toBe(true);
  });

  it('records visit reason if provided (D-14)', async () => {
    const patient = await createTestPatient(app, token);

    const res = await checkIn(token, {
      petId: patient.pet.id,
      visitReason: 'Vaccination',
    });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.data.visitReason).toBe('Vaccination');
  });

  it('records checkedInBy user ID', async () => {
    const patient = await createTestPatient(app, token);

    const res = await checkIn(token, { petId: patient.pet.id });

    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.data.checkedInBy).toBe(userId);
  });

  it('rejects check-in if pet is already in todays queue with WAITING or IN_CONSULT status', async () => {
    const patient = await createTestPatient(app, token);
    const petId = patient.pet.id;

    // First check-in succeeds
    const res1 = await checkIn(token, { petId });
    expect(res1.statusCode).toBe(201);

    // Second check-in for the same pet should fail with 409
    const res2 = await checkIn(token, { petId });
    expect(res2.statusCode).toBe(409);

    const body = res2.json();
    expect(body.error.code).toBe('ALREADY_IN_QUEUE');
  });

  it('rejects check-in when the pet has an EXPECTED entry today (D-08, D-13)', async () => {
    const patient = await createTestPatient(app, token);
    const petId = patient.pet.id;

    // Simulates what plan 08-09's sweep will do: create an EXPECTED row
    // ahead of the patient's arrival, stamped with the slot time.
    await prisma.queueEntry.create({
      data: {
        clinicId,
        petId,
        checkedInBy: userId,
        status: 'EXPECTED',
        position: 0,
        isEmergency: false,
        queuePriorityAt: new Date(),
      },
    });

    const res = await checkIn(token, { petId });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_IN_QUEUE');
  });

  it('allows re-check-in if pet was already DONE today with confirmation flag (D-40)', async () => {
    const patient = await createTestPatient(app, token);
    const petId = patient.pet.id;

    // Step 1: Check in the pet
    const checkInRes = await checkIn(token, { petId });
    expect(checkInRes.statusCode).toBe(201);
    const entryId = checkInRes.json().data.id;

    // Step 2: Transition WAITING -> IN_CONSULT -> DONE
    const toConsultRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entryId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'IN_CONSULT' },
    });
    expect(toConsultRes.statusCode).toBe(200);

    const toDoneRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entryId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'DONE' },
    });
    expect(toDoneRes.statusCode).toBe(200);

    // Step 3: Try to check in again without reCheckIn flag -- should get SAME_DAY_RECHECK error
    const reCheckRes = await checkIn(token, { petId });
    expect(reCheckRes.statusCode).toBe(409);
    expect(reCheckRes.json().error.code).toBe('SAME_DAY_RECHECK');

    // Step 4: Check in again WITH reCheckIn: true -- should succeed
    const reCheckConfirmedRes = await checkIn(token, { petId, reCheckIn: true });
    expect(reCheckConfirmedRes.statusCode).toBe(201);

    const body = reCheckConfirmedRes.json();
    expect(body.data.petId).toBe(petId);
    expect(body.data.status).toBe('WAITING');
  });
});

describe('Queue backlog push trigger wiring (D-27 trigger 3, SCH-05)', () => {
  beforeEach(async () => {
    // Unlike the describe block above, this one does NOT also run the raw
    // `queueEntry`/`pet`/`petOwner` deletes ahead of `cleanupTestData()` --
    // `cleanupTestData()` already deletes those in FK-safe order (Phase 8's
    // `appointmentPet`/`appointment` before `pet`/`petOwner`, per its own
    // comment), and running the raw deletes first can 500 on
    // `appointment_pets_pet_id_fkey` if any other suite left appointment
    // fixtures referencing these pets.
    await cleanupTestData();

    const setup = await setupAuthenticatedUser();
    token = setup.token;
    userId = setup.user.id;
    clinicId = setup.clinic.id;
  });

  /**
   * `queue.routes.ts` builds the LIVE `QueueService` behind the real
   * `POST /api/v1/queue/check-in` endpoint. This exercises that real HTTP
   * route (not a hand-wired `QueueService` instance, which `tests/scheduling/
   * push-triggers.test.ts` already covers for the service logic in
   * isolation) end to end: check in enough distinct pets to cross
   * `QUEUE_BACKLOG_THRESHOLD`, then assert the Redis debounce key
   * `PushTriggerService.notifyQueueBacklog` sets actually got created. If
   * `queue.routes.ts` ever regresses back to `new QueueService(new
   * QueueRepository(db), fastify.io)` (the `pushTriggers` third argument
   * omitted, always defaulting to `null`, exactly the bug this test was
   * added to catch), the `if (this.pushTriggers)` guard in
   * `queue.service.ts#checkIn` silently no-ops and this key never appears --
   * this test would go red on that regression, while every assertion above
   * in this file (which only checks the HTTP response body) would stay
   * green.
   */
  it('checking in enough patients through the real endpoint creates the Redis backlog debounce key', async () => {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: SCHEDULING_TIMEZONE });
    const backlogKey = `scheduling:backlog-alert:${clinicId}:${todayIST}`;

    // Sanity: key must not pre-exist so a later `.get` truly proves this
    // check-in run is what created it.
    expect(await app.redis.get(backlogKey)).toBeNull();

    for (let i = 0; i < QUEUE_BACKLOG_THRESHOLD; i += 1) {
      const patient = await createTestPatient(app, token);
      const res = await checkIn(token, { petId: patient.pet.id });
      expect(res.statusCode).toBe(201);
    }

    expect(await app.redis.get(backlogKey)).toBe('1');
  });

  it('does not create the debounce key when the waiting count stays below the threshold', async () => {
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: SCHEDULING_TIMEZONE });
    const backlogKey = `scheduling:backlog-alert:${clinicId}:${todayIST}`;

    for (let i = 0; i < QUEUE_BACKLOG_THRESHOLD - 1; i += 1) {
      const patient = await createTestPatient(app, token);
      const res = await checkIn(token, { petId: patient.pet.id });
      expect(res.statusCode).toBe(201);
    }

    expect(await app.redis.get(backlogKey)).toBeNull();
  });
});
