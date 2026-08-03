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

async function registerPatient(
  token: string,
  ownerData: { mobile: string; name: string },
  petData: { name: string; species: string },
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/patients/register',
    headers: { authorization: `Bearer ${token}` },
    payload: { owner: ownerData, pet: petData },
  });
  return res.json().data;
}

describe('Patient Search (PAT-04)', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  it('finds owner by exact mobile number', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'Rahul Kumar' },
      { name: 'Buddy', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=9876543210',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].ownerName).toBe('Rahul Kumar');
  });

  it('finds owner by partial name (trigram match)', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'Rahul Kumar' },
      { name: 'Buddy', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=Rahul',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].ownerName).toContain('Rahul');
  });

  it('finds pet by name', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'Rahul Kumar' },
      { name: 'Buddy', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=Buddy',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].petName).toBe('Buddy');
  });

  it('returns grouped results: owner with their pets', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'Rahul Kumar' },
      { name: 'Buddy', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=Rahul',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty('ownerId');
    expect(results[0]).toHaveProperty('ownerName');
    expect(results[0]).toHaveProperty('petId');
    expect(results[0]).toHaveProperty('petName');
  });

  it('limits results to 20 by default', async () => {
    const { accessToken } = await setupTestContext();

    // Register several patients with "Test" in name
    for (let i = 0; i < 5; i++) {
      const mobile = `${6000000000 + Math.floor(Math.random() * 3999999999)}`;
      await registerPatient(
        accessToken,
        { mobile, name: `TestOwner${i}` },
        { name: `TestPet${i}`, species: 'DOG' },
      );
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=Test',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('scopes search to current clinic only (RLS)', async () => {
    const ctx1 = await setupTestContext();
    const ctx2 = await setupTestContext();

    await registerPatient(
      ctx1.accessToken,
      { mobile: '9876543210', name: 'ClinicOneOwner' },
      { name: 'ClinicOnePet', species: 'DOG' },
    );

    // Search from clinic 2 should not find clinic 1's patient
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=ClinicOneOwner',
      headers: { authorization: `Bearer ${ctx2.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBe(0);
  });

  it('handles Hindi/Devanagari names (D-41)', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'राहुल कुमार' },
      { name: 'शेरू', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/patients/search?q=${encodeURIComponent('राहुल')}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].ownerName).toBe('राहुल कुमार');
  });

  it('ranks results by relevance score', async () => {
    const { accessToken } = await setupTestContext();
    await registerPatient(
      accessToken,
      { mobile: '9876543210', name: 'Rahul Kumar' },
      { name: 'Buddy', species: 'DOG' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=Rahul',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const results = res.json().data;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toHaveProperty('relevance');
    expect(typeof results[0].relevance).toBe('number');
  });

  it('rejects search query shorter than 2 characters', async () => {
    const { accessToken } = await setupTestContext();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/patients/search?q=R',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(400);
  });
});
