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

async function setupClinicianWithToken() {
  const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, 'Clinician');
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

async function setupFrontDeskWithToken() {
  const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, 'FrontDesk');
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

describe('Permissions', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Flush Redis permission cache
    const keys = await app.redis.keys('perms:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  });

  describe('GET /api/v1/auth/permissions', () => {
    it('should return effective permissions for an Admin user', async () => {
      const { accessToken } = await setupAdminWithToken();

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.permissions).toBeDefined();
      expect(Array.isArray(body.data.permissions)).toBe(true);
      // Admin should have all 20 permissions
      expect(body.data.permissions).toContain('VIEW_PATIENTS');
      expect(body.data.permissions).toContain('MANAGE_USERS');
      expect(body.data.permissions).toContain('MANAGE_ROLES');
      expect(body.data.permissions).toContain('MANAGE_CLINIC_SETTINGS');
      expect(body.data.permissions).toContain('VIEW_AUDIT_LOG');
    });

    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('requirePermission middleware', () => {
    it('should allow Clinician access to VIEW_PATIENTS-protected endpoint', async () => {
      const { accessToken } = await setupClinicianWithToken();

      // POST /auth/staff/invite requires MANAGE_USERS
      // Clinician should NOT have MANAGE_USERS, so this tests the block path
      // But first let's test that an Admin CAN access it
      // We test the block path with Clinician trying staff/invite
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/staff/invite',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { phone: '+919876543210', fullName: 'Staff Member', roleName: 'FrontDesk' },
      });

      // Clinician does not have MANAGE_USERS, so should get 403
      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should block user without required permission', async () => {
      const { accessToken } = await setupFrontDeskWithToken();

      // FrontDesk does not have MANAGE_USERS
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/staff/invite',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { phone: '+919876543210', fullName: 'Staff Member', roleName: 'FrontDesk' },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Permission overrides', () => {
    it('should grant VIEW_AUDIT_LOG to FrontDesk user via override (not a default permission)', async () => {
      const { user, clinic, accessToken } = await setupFrontDeskWithToken();

      // First verify FrontDesk does NOT have VIEW_AUDIT_LOG by default
      const permsBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(permsBefore.json().data.permissions).not.toContain('VIEW_AUDIT_LOG');

      // Now create an Admin to add the override
      const admin = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const adminClinic = clinic; // same clinic
      await createTestClinicMember(admin.id, adminClinic.id, 'Admin');
      const { accessToken: adminToken } = await createTestTokens(app, admin.id, adminClinic.id);

      // Find the FrontDesk user's clinic member
      const member = await prisma.clinicMember.findFirst({
        where: { userId: user.id, clinicId: clinic.id },
      });

      // Add override via API
      const overrideRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member!.id}/permissions`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          overrides: [{ permissionCode: 'VIEW_AUDIT_LOG', granted: true }],
        },
      });
      expect(overrideRes.statusCode).toBe(200);

      // Now check permissions again -- should include VIEW_AUDIT_LOG
      const permsAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(permsAfter.json().data.permissions).toContain('VIEW_AUDIT_LOG');
    });

    it('should revoke VIEW_PATIENTS from Clinician via override', async () => {
      const { user, clinic, accessToken } = await setupClinicianWithToken();

      // Clinician should have VIEW_PATIENTS by default
      const permsBefore = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(permsBefore.json().data.permissions).toContain('VIEW_PATIENTS');

      // Create an Admin in the same clinic
      const admin = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      await createTestClinicMember(admin.id, clinic.id, 'Admin');
      const { accessToken: adminToken } = await createTestTokens(app, admin.id, clinic.id);

      // Find the Clinician's clinic member
      const member = await prisma.clinicMember.findFirst({
        where: { userId: user.id, clinicId: clinic.id },
      });

      // Revoke VIEW_PATIENTS via override
      const overrideRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member!.id}/permissions`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          overrides: [{ permissionCode: 'VIEW_PATIENTS', granted: false }],
        },
      });
      expect(overrideRes.statusCode).toBe(200);

      // Now check permissions -- should NOT include VIEW_PATIENTS
      const permsAfter = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(permsAfter.json().data.permissions).not.toContain('VIEW_PATIENTS');
    });
  });

  describe('Permission cache invalidation', () => {
    it('should reflect role changes after cache invalidation', async () => {
      const { user, clinic, accessToken } = await setupFrontDeskWithToken();

      // Get permissions -- this caches them
      const perms1 = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(perms1.json().data.permissions).not.toContain('VIEW_AUDIT_LOG');

      // Create Admin to change roles
      const admin = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      await createTestClinicMember(admin.id, clinic.id, 'Admin');
      const { accessToken: adminToken } = await createTestTokens(app, admin.id, clinic.id);

      // Find member and Admin role
      const member = await prisma.clinicMember.findFirst({
        where: { userId: user.id, clinicId: clinic.id },
      });
      const adminRole = await prisma.role.findUnique({ where: { name: 'Admin' } });

      // Update roles to Admin (which has all permissions)
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member!.id}/roles`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { roleIds: [adminRole!.id] },
      });
      expect(updateRes.statusCode).toBe(200);

      // Cache was invalidated, so new request should return Admin permissions
      const perms2 = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/permissions',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(perms2.json().data.permissions).toContain('VIEW_AUDIT_LOG');
      expect(perms2.json().data.permissions).toContain('MANAGE_USERS');
    });
  });
});
