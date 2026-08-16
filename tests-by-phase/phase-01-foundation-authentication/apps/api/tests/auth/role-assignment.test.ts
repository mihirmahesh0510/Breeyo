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
  const { accessToken, refreshToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken, refreshToken };
}

describe('Staff management', () => {
  beforeEach(async () => {
    await cleanupTestData();
    // Flush Redis permission cache
    const keys = await app.redis.keys('perms:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }
  });

  describe('POST /api/v1/auth/staff/invite', () => {
    it('should create a staff member and return 201 when called by Admin', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/staff/invite',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          phone: '+919876543210',
          fullName: 'New Staff',
          roleName: 'FrontDesk',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.data.member).toBeDefined();
      expect(body.data.member.clinicId).toBe(clinic.id);
      expect(body.data.member.role).toBe('FrontDesk');

      // Verify the user was created in the database
      const newUser = await prisma.user.findFirst({
        where: { phone: '+919876543210' },
      });
      expect(newUser).not.toBeNull();
      expect(newUser!.fullName).toBe('New Staff');

      // Verify the ClinicMember was created
      const member = await prisma.clinicMember.findFirst({
        where: { userId: newUser!.id, clinicId: clinic.id },
      });
      expect(member).not.toBeNull();
      expect(member!.isActive).toBe(true);

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { event: 'USER_INVITED', clinicId: clinic.id },
      });
      expect(audit).not.toBeNull();
    });

    it('should return 403 without MANAGE_USERS permission', async () => {
      // Create a Clinician (no MANAGE_USERS)
      const user = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id, 'Clinician');
      const { accessToken } = await createTestTokens(app, user.id, clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/staff/invite',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          phone: '+919876543210',
          fullName: 'New Staff',
          roleName: 'FrontDesk',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PUT /api/v1/auth/staff/:memberId/roles', () => {
    it('should update roles and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Create a staff user with FrontDesk role
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Get Clinician role
      const clinicianRole = await prisma.role.findUnique({ where: { name: 'Clinician' } });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/roles`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { roleIds: [clinicianRole!.id] },
      });

      expect(response.statusCode).toBe(200);

      // Verify the role was updated
      const memberRoles = await prisma.clinicMemberRole.findMany({
        where: { clinicMemberId: member.id },
        include: { role: true },
      });
      expect(memberRoles).toHaveLength(1);
      expect(memberRoles[0].role.name).toBe('Clinician');

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { event: 'ROLE_ASSIGNED' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('PUT /api/v1/auth/staff/:memberId/permissions', () => {
    it('should set permission overrides and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Create a staff user with FrontDesk role
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/permissions`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          overrides: [
            { permissionCode: 'VIEW_AUDIT_LOG', granted: true },
            { permissionCode: 'VIEW_PATIENTS', granted: false },
          ],
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify the overrides were created
      const overrides = await prisma.userPermissionOverride.findMany({
        where: { clinicMemberId: member.id },
        include: { permission: true },
      });
      expect(overrides).toHaveLength(2);

      const auditLogOverride = overrides.find((o) => o.permission.code === 'VIEW_AUDIT_LOG');
      expect(auditLogOverride!.granted).toBe(true);

      const patientsOverride = overrides.find((o) => o.permission.code === 'VIEW_PATIENTS');
      expect(patientsOverride!.granted).toBe(false);

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { event: 'PERMISSION_OVERRIDE' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('PUT /api/v1/auth/staff/:memberId/deactivate', () => {
    it('should deactivate member and return 200', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Create a staff user
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);

      // Verify member is deactivated
      const updatedMember = await prisma.clinicMember.findUnique({
        where: { id: member.id },
      });
      expect(updatedMember!.isActive).toBe(false);

      // Verify audit log
      const audit = await prisma.authAuditLog.findFirst({
        where: { event: 'USER_DEACTIVATED' },
      });
      expect(audit).not.toBeNull();
    });

    it('should prevent deactivated user from logging in', async () => {
      const { clinic, accessToken } = await setupAdminWithToken();

      // Create a staff user
      const staffUser = await createTestUser({ isEmailVerified: true, password: TEST_PASSWORD });
      const member = await createTestClinicMember(staffUser.id, clinic.id, 'FrontDesk');

      // Deactivate the member
      await app.inject({
        method: 'PUT',
        url: `/api/v1/auth/staff/${member.id}/deactivate`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      // Try to login as the deactivated user
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: staffUser.email,
          password: TEST_PASSWORD,
        },
      });

      expect(loginResponse.statusCode).toBe(401);
      const body = loginResponse.json();
      expect(body.error.code).toBe('ACCOUNT_DEACTIVATED');
    });
  });

  describe('POST /api/v1/auth/password/change', () => {
    it('should change password and invalidate all sessions', async () => {
      const { user, clinic, accessToken } = await setupAdminWithToken();

      // Create a real login to get a proper refresh token in the database
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: TEST_PASSWORD },
      });
      const loginToken = loginRes.json().data.accessToken;
      const refreshToken = loginRes.json().data.refreshToken;

      const newPassword = 'NewSecureP@ss456';

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/change',
        headers: { authorization: `Bearer ${loginToken}` },
        payload: {
          currentPassword: TEST_PASSWORD,
          newPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.message).toBeDefined();

      // Verify audit logs
      const passwordAudit = await prisma.authAuditLog.findFirst({
        where: { userId: user.id, event: 'PASSWORD_CHANGE' },
      });
      expect(passwordAudit).not.toBeNull();

      const sessionAudit = await prisma.authAuditLog.findFirst({
        where: { userId: user.id, event: 'SESSION_REVOKED' },
      });
      expect(sessionAudit).not.toBeNull();
    });

    it('should reject invalid current password', async () => {
      const { accessToken } = await setupAdminWithToken();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/change',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewSecureP@ss456',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should make existing refresh tokens invalid after password change', async () => {
      const { user, clinic } = await setupAdminWithToken();

      // Login to get a real refresh token
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: user.email, password: TEST_PASSWORD },
      });
      const loginToken = loginRes.json().data.accessToken;
      const refreshToken = loginRes.json().data.refreshToken;

      // Change password
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/change',
        headers: { authorization: `Bearer ${loginToken}` },
        payload: {
          currentPassword: TEST_PASSWORD,
          newPassword: 'NewSecureP@ss456',
        },
      });

      // Try to use the old refresh token -- should fail
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/token/refresh',
        payload: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(401);
    });
  });
});
