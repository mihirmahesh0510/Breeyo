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

const TEST_PASSWORD = 'SecureP@ss123';

async function setupAdminWithToken() {
  const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, 'Admin');
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

describe('Clinic profile API', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Flush Redis permission cache
    const keys = await app.redis.keys('perms:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  });

  describe('PUT /api/v1/clinics/current/profile', () => {
    it('should update clinic name and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/clinics/current/profile',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          name: 'Updated Clinic Name',
          city: 'Mumbai',
          gstin: '27AABCU9603R1ZM',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.name).toBe('Updated Clinic Name');
      expect(body.data.city).toBe('Mumbai');
      expect(body.data.gstin).toBe('27AABCU9603R1ZM');

      // Verify in database
      const updated = await prisma.clinic.findUnique({ where: { id: clinic.id } });
      expect(updated!.name).toBe('Updated Clinic Name');
      expect(updated!.city).toBe('Mumbai');
    });

    it('should return 403 without MANAGE_CLINIC_SETTINGS permission', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id, 'FrontDesk');
      const { accessToken } = await createTestTokens(app, user.id, clinic.id);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/clinics/current/profile',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Should Fail' },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT /api/v1/clinics/current/hours', () => {
    it('should save working hours JSON and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const workingHours = {
        monday: { open: '09:00', close: '18:00', closed: false },
        tuesday: { open: '09:00', close: '18:00', closed: false },
        wednesday: { open: '09:00', close: '18:00', closed: false },
        thursday: { open: '09:00', close: '18:00', closed: false },
        friday: { open: '09:00', close: '18:00', closed: false },
        saturday: { open: '10:00', close: '14:00', closed: false },
        sunday: { open: '', close: '', closed: true },
      };

      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/clinics/current/hours',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { hours: workingHours },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.workingHours).toBeDefined();
      expect(body.data.workingHours.monday.open).toBe('09:00');
      expect(body.data.workingHours.sunday.closed).toBe(true);

      // Verify in database
      const updated = await prisma.clinic.findUnique({ where: { id: clinic.id } });
      expect(updated!.workingHours).toBeDefined();
      expect((updated!.workingHours as any).monday.open).toBe('09:00');
    });
  });

  describe('GET /api/v1/clinics/current', () => {
    it('should return clinic with workingHours and wizardCompletedAt', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Set working hours and wizard completion on the clinic
      await prisma.clinic.update({
        where: { id: clinic.id },
        data: {
          workingHours: { monday: { open: '09:00', close: '17:00', closed: false } },
          wizardCompletedAt: new Date('2025-01-01T00:00:00Z'),
          city: 'Delhi',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/clinics/current',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.id).toBe(clinic.id);
      expect(body.data.workingHours).toBeDefined();
      expect(body.data.workingHours.monday.open).toBe('09:00');
      expect(body.data.wizardCompletedAt).toBeDefined();
      expect(body.data.city).toBe('Delhi');
    });
  });

  describe('POST /api/v1/clinics/current/wizard-complete', () => {
    it('should set wizardCompletedAt and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/clinics/current/wizard-complete',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.wizardCompletedAt).toBeDefined();

      // Verify in database
      const updated = await prisma.clinic.findUnique({ where: { id: clinic.id } });
      expect(updated!.wizardCompletedAt).not.toBeNull();
    });

    it('should be idempotent when wizard is already completed', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Complete wizard the first time
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/clinics/current/wizard-complete',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(first.statusCode).toBe(200);
      const firstBody = first.json();
      const firstTimestamp = firstBody.data.wizardCompletedAt;

      // Complete wizard again -- should return same timestamp (idempotent)
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/clinics/current/wizard-complete',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(second.statusCode).toBe(200);
      const secondBody = second.json();
      expect(secondBody.data.wizardCompletedAt).toBe(firstTimestamp);
    });
  });
});
