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
let userId: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  // Clean queue entries, pets, and owners before each test to avoid conflicts
  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();
    await tx.authAuditLog.deleteMany();
    await tx.notification.deleteMany();
    await tx.deviceToken.deleteMany();
    await tx.refreshToken.deleteMany();
    await tx.userPermissionOverride.deleteMany();
    await tx.clinicMemberRole.deleteMany();
    await tx.clinicMember.deleteMany();
    await tx.clinic.deleteMany();
    await tx.user.deleteMany();
  });

  // Create fresh user + clinic + membership for each test
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);

  userId = user.id;
  clinicId = clinic.id;

  const tokens = await createTestTokens(app, user.id, clinic.id);
  accessToken = tokens.accessToken;
});

/**
 * Helper: registers a patient and checks them into the queue.
 * Returns the queue entry from the check-in response.
 */
async function createCheckedInPatient(appInstance: FastifyInstance, token: string) {
  const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
  const regRes = await appInstance.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      owner: { mobile, name: 'Test Owner' },
      pet: { name: 'Buddy', species: 'DOG' },
    },
  });
  const { pet } = regRes.json().data;

  const checkInRes = await appInstance.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${token}` },
    payload: { petId: pet.id },
  });
  return checkInRes.json().data;
}

/**
 * Helper: transitions a queue entry to a given status.
 */
async function transitionTo(
  appInstance: FastifyInstance,
  token: string,
  entryId: string,
  status: string,
) {
  return appInstance.inject({
    method: 'PATCH',
    url: `/api/v1/queue/${entryId}/status`,
    headers: { authorization: `Bearer ${token}` },
    payload: { status },
  });
}

describe('Queue Status Transitions (QUE-04)', () => {
  it('transitions WAITING -> IN_CONSULT', async () => {
    const entry = await createCheckedInPatient(app, accessToken);
    expect(entry.status).toBe('WAITING');

    const res = await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('IN_CONSULT');
    expect(body.data.id).toBe(entry.id);
  });

  it('transitions IN_CONSULT -> DONE', async () => {
    const entry = await createCheckedInPatient(app, accessToken);

    // First move to IN_CONSULT
    await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');

    // Then move to DONE
    const res = await transitionTo(app, accessToken, entry.id, 'DONE');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('DONE');
    expect(body.data.id).toBe(entry.id);
  });

  it('transitions WAITING -> NO_SHOW (long-press)', async () => {
    const entry = await createCheckedInPatient(app, accessToken);
    expect(entry.status).toBe('WAITING');

    const res = await transitionTo(app, accessToken, entry.id, 'NO_SHOW');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('NO_SHOW');
    expect(body.data.id).toBe(entry.id);
  });

  it('transitions IN_CONSULT -> NO_SHOW', async () => {
    const entry = await createCheckedInPatient(app, accessToken);

    // First move to IN_CONSULT
    await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');

    // Then mark as NO_SHOW
    const res = await transitionTo(app, accessToken, entry.id, 'NO_SHOW');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('NO_SHOW');
    expect(body.data.id).toBe(entry.id);
  });

  it('rejects invalid transition WAITING -> DONE', async () => {
    const entry = await createCheckedInPatient(app, accessToken);
    expect(entry.status).toBe('WAITING');

    const res = await transitionTo(app, accessToken, entry.id, 'DONE');

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects invalid transition DONE -> WAITING (terminal state)', async () => {
    const entry = await createCheckedInPatient(app, accessToken);

    // Move through valid transitions to DONE
    await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');
    await transitionTo(app, accessToken, entry.id, 'DONE');

    // Attempt to transition back from terminal state
    const res = await transitionTo(app, accessToken, entry.id, 'WAITING');

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects invalid transition NO_SHOW -> WAITING (terminal state)', async () => {
    const entry = await createCheckedInPatient(app, accessToken);

    // Move to NO_SHOW (valid from WAITING)
    await transitionTo(app, accessToken, entry.id, 'NO_SHOW');

    // Attempt to transition back from terminal state
    const res = await transitionTo(app, accessToken, entry.id, 'WAITING');

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('INVALID_TRANSITION');
  });

  it('sets treatingVetId on transition to IN_CONSULT (D-37)', async () => {
    const entry = await createCheckedInPatient(app, accessToken);

    const res = await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.treatingVetId).toBeDefined();
    expect(body.data.treatingVetId).toBe(userId);
  });

  it('sets calledAt timestamp on transition to IN_CONSULT', async () => {
    const entry = await createCheckedInPatient(app, accessToken);
    expect(entry.calledAt).toBeNull();

    const beforeCall = new Date();
    const res = await transitionTo(app, accessToken, entry.id, 'IN_CONSULT');
    const afterCall = new Date();

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.calledAt).toBeDefined();
    expect(body.data.calledAt).not.toBeNull();

    // Verify the timestamp is within the expected range
    const calledAt = new Date(body.data.calledAt);
    expect(calledAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000);
    expect(calledAt.getTime()).toBeLessThanOrEqual(afterCall.getTime() + 1000);
  });

  it('sets completedAt timestamp on transition to DONE or NO_SHOW', async () => {
    // Test DONE path
    const entry1 = await createCheckedInPatient(app, accessToken);
    await transitionTo(app, accessToken, entry1.id, 'IN_CONSULT');

    const beforeDone = new Date();
    const doneRes = await transitionTo(app, accessToken, entry1.id, 'DONE');
    const afterDone = new Date();

    expect(doneRes.statusCode).toBe(200);
    const doneBody = doneRes.json();
    expect(doneBody.data.completedAt).toBeDefined();
    expect(doneBody.data.completedAt).not.toBeNull();

    const doneCompletedAt = new Date(doneBody.data.completedAt);
    expect(doneCompletedAt.getTime()).toBeGreaterThanOrEqual(beforeDone.getTime() - 1000);
    expect(doneCompletedAt.getTime()).toBeLessThanOrEqual(afterDone.getTime() + 1000);

    // Test NO_SHOW path
    const entry2 = await createCheckedInPatient(app, accessToken);

    const beforeNoShow = new Date();
    const noShowRes = await transitionTo(app, accessToken, entry2.id, 'NO_SHOW');
    const afterNoShow = new Date();

    expect(noShowRes.statusCode).toBe(200);
    const noShowBody = noShowRes.json();
    expect(noShowBody.data.completedAt).toBeDefined();
    expect(noShowBody.data.completedAt).not.toBeNull();

    const noShowCompletedAt = new Date(noShowBody.data.completedAt);
    expect(noShowCompletedAt.getTime()).toBeGreaterThanOrEqual(beforeNoShow.getTime() - 1000);
    expect(noShowCompletedAt.getTime()).toBeLessThanOrEqual(afterNoShow.getTime() + 1000);
  });
});
