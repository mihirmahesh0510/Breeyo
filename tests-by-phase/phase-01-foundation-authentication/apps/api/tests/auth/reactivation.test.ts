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

describe('Staff reactivation', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Flush Redis permission cache
    const keys = await app.redis.keys('perms:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  });

  describe('PUT /api/v1/auth/staff/:memberId/reactivate', () => {
    it('should reactivate a deactivated member and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Create and deactivate a staff user
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Deactivate via API
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Verify deactivated
      const deactivated = await prisma.clinicMember.findUnique({ where: { id: member.id } });
      expect(deactivated!.isActive).toBe(false);

      // Reactivate
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/reactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.member).toBeDefined();
      expect(body.data.member.isActive).toBe(true);

      // Verify in database
      const reactivated = await prisma.clinicMember.findUnique({ where: { id: member.id } });
      expect(reactivated!.isActive).toBe(true);

      // Verify linked user is also active
      const updatedUser = await prisma.user.findUnique({ where: { id: staffUser.id } });
      expect(updatedUser!.isActive).toBe(true);
    });

    it('should preserve member roles after reactivation', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Deactivate
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Reactivate
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/reactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Verify roles are still there
      const memberRoles = await prisma.clinicMemberRole.findMany({
        where: { clinicMemberId: member.id },
        include: { role: true },
      });
      expect(memberRoles).toHaveLength(1);
      expect(memberRoles[0].role.name).toBe('FrontDesk');
    });

    it('should write USER_REACTIVATED audit event', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Deactivate
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Reactivate
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/reactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { event: 'USER_REACTIVATED', clinicId: clinic.id },
      });
      expect(audit).not.toBeNull();
      expect(audit!.metadata).toBeDefined();
      expect((audit!.metadata as any).targetUserId).toBe(staffUser.id);
    });

    it('should return 409 when reactivating an already active member', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Try reactivating an already active member
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/reactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.code).toBe('ALREADY_ACTIVE');
    });

    it('should return 403 without MANAGE_USERS permission', async () => {
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id, 'Clinician');
      const { accessToken } = await createTestTokens(app, user.id, clinic.id);

      // Create a deactivated staff user
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Deactivate via DB
      await prisma.clinicMember.update({
        where: { id: member.id },
        data: { isActive: false },
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/reactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Sole-admin deactivation guard', () => {
    it('should return 409 when trying to deactivate the sole admin', async () => {
      const { user, clinic, accessToken } = await setupAdminWithToken();

      // Find the admin's clinic member
      const adminMember = await prisma.clinicMember.findFirst({
        where: { userId: user.id, clinicId: clinic.id },
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${adminMember!.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.error.message).toContain('another admin');
    });

    it('should allow deactivating one of two admins', async () => {
      const { user, clinic, accessToken } = await setupAdminWithToken();

      // Create a second admin
      const secondAdmin = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const secondMember = await createTestClinicMember(secondAdmin.id, clinic.id, 'Admin');

      // Now deactivate the second admin -- should succeed because the first admin remains
      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${secondMember.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      // Verify the second admin is deactivated
      const deactivated = await prisma.clinicMember.findUnique({ where: { id: secondMember.id } });
      expect(deactivated!.isActive).toBe(false);
    });
  });
});
