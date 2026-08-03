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

describe('Patient Registration', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('register owner (PAT-01)', () => {
    it('creates owner with mobile number and name for a clinic', async () => {
      const { accessToken } = await setupTestContext();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.mobile).toBe('9876543210');
      expect(body.data.name).toBe('Rahul Kumar');
      expect(body.data.id).toBeDefined();
    });

    it('returns existing owner if mobile already registered at clinic (D-06)', async () => {
      const { accessToken } = await setupTestContext();

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const owner1 = res1.json().data;

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const owner2 = res2.json().data;

      expect(owner1.id).toBe(owner2.id);
    });

    it('allows same mobile at different clinics (per-clinic uniqueness)', async () => {
      const ctx1 = await setupTestContext();
      const ctx2 = await setupTestContext();

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${ctx1.accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${ctx2.accessToken}` },
        payload: { mobile: '9876543210', name: 'Same Mobile Different Clinic' },
      });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
      expect(res1.json().data.id).not.toBe(res2.json().data.id);
    });

    it('rejects invalid mobile number format', async () => {
      const { accessToken } = await setupTestContext();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '12345', name: 'Test' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('stores mobile as raw 10 digits without spaces', async () => {
      const { accessToken } = await setupTestContext();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '98765 43210', name: 'Test' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.mobile).toBe('9876543210');
    });
  });

  describe('register pet (PAT-02)', () => {
    it('creates pet linked to owner with required fields (name + species)', async () => {
      const { accessToken } = await setupTestContext();

      // Create owner first
      const ownerRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const ownerId = ownerRes.json().data.id;

      const petRes = await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Buddy', species: 'DOG' },
      });

      expect(petRes.statusCode).toBe(201);
      const pet = petRes.json().data;
      expect(pet.name).toBe('Buddy');
      expect(pet.species).toBe('DOG');
      expect(pet.ownerId).toBe(ownerId);
    });

    it('accepts all optional fields (breed, age, weight, color, microchip, notes)', async () => {
      const { accessToken } = await setupTestContext();

      const ownerRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const ownerId = ownerRes.json().data.id;

      const petRes = await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          name: 'Buddy',
          species: 'DOG',
          breed: 'Labrador',
          birthYear: 2022,
          birthMonth: 6,
          weight: 25.5,
          color: 'Golden',
          microchipId: 'MC123456789',
          notes: 'Friendly dog',
        },
      });

      expect(petRes.statusCode).toBe(201);
      const pet = petRes.json().data;
      expect(pet.breed).toBe('Labrador');
      expect(pet.weight).toBe(25.5);
      expect(pet.color).toBe('Golden');
    });

    it('rejects pet registration for non-existent owner', async () => {
      const { accessToken } = await setupTestContext();

      const petRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners/00000000-0000-0000-0000-000000000999/pets',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Buddy', species: 'DOG' },
      });

      expect(petRes.statusCode).toBe(404);
    });

    it('rejects livestock species (D-03 companion animals only)', async () => {
      const { accessToken } = await setupTestContext();

      const ownerRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const ownerId = ownerRes.json().data.id;

      const petRes = await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Gaumata', species: 'COW' },
      });

      expect(petRes.statusCode).toBe(400);
    });
  });

  describe('multiple pets per owner (PAT-03)', () => {
    it('links multiple pets to same owner', async () => {
      const { accessToken } = await setupTestContext();

      const ownerRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const ownerId = ownerRes.json().data.id;

      const pet1Res = await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Buddy', species: 'DOG' },
      });

      const pet2Res = await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Whiskers', species: 'CAT' },
      });

      expect(pet1Res.statusCode).toBe(201);
      expect(pet2Res.statusCode).toBe(201);
      expect(pet1Res.json().data.ownerId).toBe(ownerId);
      expect(pet2Res.json().data.ownerId).toBe(ownerId);
    });

    it('returns all pets when querying owner', async () => {
      const { accessToken } = await setupTestContext();

      const ownerRes = await app.inject({
        method: 'POST',
        url: '/api/v1/owners',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { mobile: '9876543210', name: 'Rahul Kumar' },
      });
      const ownerId = ownerRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Buddy', species: 'DOG' },
      });

      await app.inject({
        method: 'POST',
        url: `/api/v1/owners/${ownerId}/pets`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Whiskers', species: 'CAT' },
      });

      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/owners/${ownerId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(detailRes.statusCode).toBe(200);
      const owner = detailRes.json().data;
      expect(owner.pets).toHaveLength(2);
      const petNames = owner.pets.map((p: any) => p.name).sort();
      expect(petNames).toEqual(['Buddy', 'Whiskers']);
    });
  });

  describe('combined registration via POST /api/v1/patients/register', () => {
    it('registers owner and pet in a single call', async () => {
      const { accessToken } = await setupTestContext();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/register',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          owner: { mobile: '9876543210', name: 'Rahul Kumar' },
          pet: { name: 'Buddy', species: 'DOG' },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.owner.id).toBeDefined();
      expect(body.data.pet.id).toBeDefined();
      expect(body.data.owner.mobile).toBe('9876543210');
      expect(body.data.pet.name).toBe('Buddy');
    });

    it('returns existing owner + new pet if mobile already exists (D-05/D-06)', async () => {
      const { accessToken } = await setupTestContext();

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/register',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          owner: { mobile: '9876543210', name: 'Rahul Kumar' },
          pet: { name: 'Buddy', species: 'DOG' },
        },
      });
      const firstOwner = res1.json().data.owner;

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/patients/register',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          owner: { mobile: '9876543210', name: 'Rahul Kumar' },
          pet: { name: 'Whiskers', species: 'CAT' },
        },
      });
      const secondOwner = res2.json().data.owner;

      // Same owner returned
      expect(firstOwner.id).toBe(secondOwner.id);
      // Different pets
      expect(res1.json().data.pet.name).toBe('Buddy');
      expect(res2.json().data.pet.name).toBe('Whiskers');
    });
  });
});
