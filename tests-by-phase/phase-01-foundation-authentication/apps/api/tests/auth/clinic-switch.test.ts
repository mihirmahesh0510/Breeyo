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

describe('Clinic switching', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/v1/auth/clinics', () => {
    it('should return all active clinics for authenticated user', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic1 = await createTestClinic(user.id, { name: 'Clinic Alpha' });
      const clinic2 = await createTestClinic(user.id, { name: 'Clinic Beta' });
      await createTestClinicMember(user.id, clinic1.id, 'Admin');
      await createTestClinicMember(user.id, clinic2.id, 'Clinician');
      const { accessToken } = await createTestTokens(app, user.id, clinic1.id);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/clinics',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.clinics).toBeDefined();
      expect(body.data.clinics).toHaveLength(2);

      const clinicNames = body.data.clinics.map((c: any) => c.name);
      expect(clinicNames).toContain('Clinic Alpha');
      expect(clinicNames).toContain('Clinic Beta');

      // Each clinic should include roles
      const alpha = body.data.clinics.find((c: any) => c.name === 'Clinic Alpha');
      expect(alpha.roles).toBeDefined();
      expect(alpha.roles).toContain('Admin');
    });

    it('should not include inactive clinic memberships', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic1 = await createTestClinic(user.id, { name: 'Active Clinic' });
      const clinic2 = await createTestClinic(user.id, { name: 'Inactive Clinic' });
      await createTestClinicMember(user.id, clinic1.id, 'Admin');
      const inactiveMember = await createTestClinicMember(user.id, clinic2.id, 'FrontDesk');

      // Deactivate the second membership
      await prisma.clinicMember.update({
        where: { id: inactiveMember.id },
        data: { isActive: false },
      });

      const { accessToken } = await createTestTokens(app, user.id, clinic1.id);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/clinics',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.clinics).toHaveLength(1);
      expect(body.data.clinics[0].name).toBe('Active Clinic');
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/clinics',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/auth/active-clinic', () => {
    it('should return new token pair when switching to a valid clinic', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic1 = await createTestClinic(user.id, { name: 'Clinic Alpha' });
      const clinic2 = await createTestClinic(user.id, { name: 'Clinic Beta' });
      await createTestClinicMember(user.id, clinic1.id, 'Admin');
      await createTestClinicMember(user.id, clinic2.id, 'Clinician');
      const { accessToken } = await createTestTokens(app, user.id, clinic1.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/active-clinic',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { clinicId: clinic2.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.accessToken).toBeDefined();
      expect(body.data.refreshToken).toBeDefined();
      expect(body.data.expiresIn).toBe(900);
      expect(body.data.clinic.id).toBe(clinic2.id);
      expect(body.data.clinic.name).toBe('Clinic Beta');

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { userId: user.id, event: 'ACTIVE_CLINIC_SWITCH' },
      });
      expect(audit).not.toBeNull();
    });

    it('should return 403 when switching to a clinic user is not a member of', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic1 = await createTestClinic(user.id, { name: 'Clinic Alpha' });
      await createTestClinicMember(user.id, clinic1.id, 'Admin');
      const { accessToken } = await createTestTokens(app, user.id, clinic1.id);

      // Create another clinic owned by a different user
      const otherUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const otherClinic = await createTestClinic(otherUser.id, { name: 'Other Clinic' });
      await createTestClinicMember(otherUser.id, otherClinic.id, 'Admin');

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/active-clinic',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { clinicId: otherClinic.id },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/active-clinic',
        payload: { clinicId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
