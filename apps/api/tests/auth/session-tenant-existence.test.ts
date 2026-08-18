import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from '../helpers/factories.js';

/**
 * E2E-BUG-FIX-PLAN.md §1.1: `authenticate()` only verifies the JWT signature
 * + `type === 'access'`. `tenantContext()` only checked `activeClinicId` is a
 * non-empty string. Neither checked that the user/clinic membership behind
 * the session still exists — a stale session (account deactivated, clinic
 * membership removed) could reach every module's handler with nothing behind
 * `clinicId`, including DB-dependent writes.
 *
 * Chosen fix (D-XX, recorded in 01-CONTEXT.md): fold the check into
 * `PermissionService.getUserPermissionsResult`, which already runs
 * `clinicMember.findFirst({ isActive: true, ... })` — `tenantContext` now
 * reads its `exists` flag and rejects with 401 SESSION_EXPIRED instead of
 * silently proceeding. Exercised against a route with no `requirePermission`
 * at all (vaccination) to prove this is enforced universally, not only where
 * a permission check happens to already run.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }
});

describe('tenantContext rejects a session whose ClinicMember no longer exists (E2E-BUG-FIX-PLAN.md §1.1)', () => {
  it('401s a route with no requirePermission at all once the membership is deactivated', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    await createTestClinicMember(user.id, clinic.id, 'Clinician');
    const { accessToken } = await createTestTokens(app, user.id, clinic.id);

    // Sanity check: the session works before deactivation.
    const before = await request(app.server)
      .get('/api/v1/patients/recent')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).not.toBe(401);

    await prisma.clinicMember.updateMany({
      where: { userId: user.id, clinicId: clinic.id },
      data: { isActive: false },
    });
    // The real deactivation flow (auth.service.ts's deactivateMember) also
    // invalidates the permission cache immediately after the DB write — a
    // raw `updateMany` bypasses that, so mirror it here rather than let a
    // warm 5-minute cache mask the very thing this test asserts.
    await app.redis.del(`perms:${user.id}:${clinic.id}`);

    const afterDeactivation = await request(app.server)
      .get(`/api/v1/pets/${'11111111-1111-4111-8111-111111111111'}/vaccinations`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(afterDeactivation.status).toBe(401);
    expect(afterDeactivation.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('401s before reaching a route that also gates on requirePermission', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    await createTestClinicMember(user.id, clinic.id, 'Admin');
    const { accessToken } = await createTestTokens(app, user.id, clinic.id);

    await prisma.clinicMember.updateMany({
      where: { userId: user.id, clinicId: clinic.id },
      data: { isActive: false },
    });

    const response = await request(app.server)
      .get('/api/v1/patients/recent')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('still allows a request from a genuinely active membership', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    await createTestClinicMember(user.id, clinic.id, 'Admin');
    const { accessToken } = await createTestTokens(app, user.id, clinic.id);

    const response = await request(app.server)
      .get('/api/v1/patients/recent')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).not.toBe(401);
  });

  it('401s when the clinicId in the token never had a membership at all', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    // Deliberately never create a ClinicMember row for this (user, clinic) pair.
    const { accessToken } = await createTestTokens(app, user.id, clinic.id);

    const response = await request(app.server)
      .get('/api/v1/patients/recent')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_EXPIRED');
  });
});
