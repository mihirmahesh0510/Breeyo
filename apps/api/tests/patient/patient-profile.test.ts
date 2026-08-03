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

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

async function registerPatient(token: string) {
  const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      owner: { mobile, name: 'Test Owner' },
      pet: { name: 'Buddy', species: 'DOG' },
    },
  });
  return res.json().data;
}

describe('Pet Profile (PAT-05)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('returns pet with owner info and visit history', async () => {
    const { accessToken } = await setupTestContext();
    const { pet } = await registerPatient(accessToken);

    // Check in the pet to create a visit, then complete it
    const checkInRes = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/check-in',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { petId: pet.id, visitReason: 'Vaccination' },
    });
    const entry = checkInRes.json().data;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'IN_CONSULT' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'DONE' },
    });

    const profileRes = await app.inject({
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(profileRes.statusCode).toBe(200);
    const profile = profileRes.json().data;
    expect(profile.name).toBe('Buddy');
    expect(profile.owner).toBeDefined();
    expect(profile.owner.name).toBe('Test Owner');
    expect(profile.visitHistory).toBeDefined();
    expect(profile.visitHistory.length).toBeGreaterThanOrEqual(1);
  });

  it('visit history sorted newest first (D-31)', async () => {
    const { accessToken } = await setupTestContext();
    const { pet } = await registerPatient(accessToken);

    // Create first visit
    const entry1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/check-in',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { petId: pet.id, visitReason: 'Vaccination' },
    });
    const entry1 = entry1Res.json().data;

    // Complete first visit
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry1.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'IN_CONSULT' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry1.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'DONE' },
    });

    // Create second visit (re-check-in)
    const entry2Res = await app.inject({
      method: 'POST',
      url: '/api/v1/queue/check-in',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { petId: pet.id, visitReason: 'Follow-up', reCheckIn: true },
    });
    const entry2 = entry2Res.json().data;

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry2.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'IN_CONSULT' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/queue/${entry2.id}/status`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'DONE' },
    });

    const profileRes = await app.inject({
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const profile = profileRes.json().data;
    expect(profile.visitHistory.length).toBe(2);
    // Newest first
    const dates = profile.visitHistory.map((v: any) =>
      new Date(v.checkedInAt).getTime(),
    );
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });

  it('visit history scoped to current clinic only (D-29)', async () => {
    const ctx1 = await setupTestContext();
    const ctx2 = await setupTestContext();

    // Register patient in clinic 1
    const { pet } = await registerPatient(ctx1.accessToken);

    // Check in at clinic 1
    await app.inject({
      method: 'POST',
      url: '/api/v1/queue/check-in',
      headers: { authorization: `Bearer ${ctx1.accessToken}` },
      payload: { petId: pet.id },
    });

    // Clinic 2 should not see this pet's profile
    const profileRes = await app.inject({
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${ctx2.accessToken}` },
    });

    // Either 404 or empty visit history depending on RLS
    expect([200, 404]).toContain(profileRes.statusCode);
    if (profileRes.statusCode === 200) {
      expect(profileRes.json().data.visitHistory).toHaveLength(0);
    }
  });

  it('returns empty visit history for new pet', async () => {
    const { accessToken } = await setupTestContext();
    const { pet } = await registerPatient(accessToken);

    const profileRes = await app.inject({
      method: 'GET',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(profileRes.statusCode).toBe(200);
    expect(profileRes.json().data.visitHistory).toHaveLength(0);
  });
});

describe('Update Pet Profile (D-30)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('updates pet optional fields', async () => {
    const { accessToken } = await setupTestContext();
    const { pet } = await registerPatient(accessToken);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { weight: 30, color: 'Brown', notes: 'Updated notes' },
    });

    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json().data;
    expect(updated.weight).toBe(30);
    expect(updated.color).toBe('Brown');
    expect(updated.notes).toBe('Updated notes');
  });

  it('does not allow changing pet to different owner', async () => {
    const { accessToken } = await setupTestContext();
    const { pet } = await registerPatient(accessToken);

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/pets/${pet.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { ownerId: '00000000-0000-0000-0000-000000000999' },
    });

    // Should either ignore the ownerId field or return 400
    if (updateRes.statusCode === 200) {
      // ownerId should not have changed
      expect(updateRes.json().data.ownerId).toBe(pet.ownerId);
    } else {
      expect(updateRes.statusCode).toBe(400);
    }
  });
});

describe('Lookup by Mobile (QUE-06)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('finds owner and all pets by mobile number', async () => {
    const { accessToken } = await setupTestContext();

    // Register owner with 2 pets
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/v1/patients/register',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        owner: { mobile: '9876543210', name: 'Rahul Kumar' },
        pet: { name: 'Buddy', species: 'DOG' },
      },
    });
    const ownerId = reg1.json().data.owner.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/owners/${ownerId}/pets`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Whiskers', species: 'CAT' },
    });

    const lookupRes = await app.inject({
      method: 'GET',
      url: '/api/v1/owners/lookup?mobile=9876543210',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(lookupRes.statusCode).toBe(200);
    const owner = lookupRes.json().data;
    expect(owner.name).toBe('Rahul Kumar');
    expect(owner.pets).toHaveLength(2);
  });

  it('returns 404 for unregistered mobile', async () => {
    const { accessToken } = await setupTestContext();

    const lookupRes = await app.inject({
      method: 'GET',
      url: '/api/v1/owners/lookup?mobile=9999999999',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(lookupRes.statusCode).toBe(404);
  });
});
