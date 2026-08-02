import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp, closeTestApp } from './helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  prisma,
} from './helpers/factories.js';
import { getBasePrisma } from '../src/lib/prisma-rls.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

const TEST_PASSWORD = 'SecureP@ss123';

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

describe('Tenant Isolation', () => {
  let userA: Awaited<ReturnType<typeof createTestUser>>;
  let userB: Awaited<ReturnType<typeof createTestUser>>;
  let clinicA: Awaited<ReturnType<typeof createTestClinic>>;
  let clinicB: Awaited<ReturnType<typeof createTestClinic>>;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    await cleanupTestData();

    // Flush Redis permission cache
    const keys = await app.redis.keys('perms:*');
    if (keys.length > 0) {
      await app.redis.del(...keys);
    }

    // Create two users, two clinics, memberships, and tokens
    userA = await createTestUser({
      email: 'user-a@test.com',
      fullName: 'User A',
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });
    userB = await createTestUser({
      email: 'user-b@test.com',
      fullName: 'User B',
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });

    clinicA = await createTestClinic(userA.id, { name: 'Clinic A' });
    clinicB = await createTestClinic(userB.id, { name: 'Clinic B' });

    await createTestClinicMember(userA.id, clinicA.id, 'Admin');
    await createTestClinicMember(userB.id, clinicB.id, 'Admin');

    const tokensA = await createTestTokens(app, userA.id, clinicA.id);
    const tokensB = await createTestTokens(app, userB.id, clinicB.id);
    tokenA = tokensA.accessToken;
    tokenB = tokensB.accessToken;
  });

  // ----------------------------------------------------------------
  // Test 1: API-level isolation
  // ----------------------------------------------------------------
  it('should isolate permissions at the API level -- User A cannot see Clinic B data', async () => {
    // User A requests permissions scoped to Clinic A
    const responseA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(responseA.statusCode).toBe(200);
    const bodyA = responseA.json();
    expect(bodyA.data.permissions).toBeDefined();
    expect(Array.isArray(bodyA.data.permissions)).toBe(true);
    // Admin should have permissions
    expect(bodyA.data.permissions.length).toBeGreaterThan(0);

    // User B requests permissions scoped to Clinic B
    const responseB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(responseB.statusCode).toBe(200);
    const bodyB = responseB.json();
    expect(bodyB.data.permissions).toBeDefined();

    // Both should have their own permissions, but tokens are scoped to
    // their own clinic. User A's token targets Clinic A only.
    // Attempting to access Clinic B with User A's token is impossible because
    // the token's clinicId is Clinic A.

    // Create a cross-clinic token -- User A with Clinic B
    const crossToken = app.jwt.sign(
      { sub: userA.id, clinicId: clinicB.id, type: 'access' },
      { expiresIn: '15m' },
    );

    const crossResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${crossToken}` },
    });

    expect(crossResponse.statusCode).toBe(200);
    const crossBody = crossResponse.json();
    // User A is NOT a member of Clinic B, so should have NO permissions
    expect(crossBody.data.permissions).toEqual([]);
  });

  // ----------------------------------------------------------------
  // Test 2: Database-level RLS isolation
  // ----------------------------------------------------------------
  it('should enforce RLS at the database level -- tenant clients only see their own clinic members', async () => {
    // Skip if DATABASE_URL_APP is not set (RLS requires the breeyo_app role)
    if (!process.env.DATABASE_URL_APP) {
      console.warn('Skipping RLS DB test: DATABASE_URL_APP not set');
      return;
    }

    // Use a raw PrismaClient connected as breeyo_app to test RLS directly.
    // SET LOCAL + query must be inside a single $transaction to persist the setting.
    const appClient = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_APP,
    });

    try {
      // Query clinic_members scoped to Clinic A via RLS
      const membersA = await appClient.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.clinic_id = '${clinicA.id}'`);
        return tx.clinicMember.findMany();
      });

      // All returned members should belong to Clinic A
      expect(membersA.length).toBeGreaterThan(0);
      for (const m of membersA) {
        expect(m.clinicId).toBe(clinicA.id);
      }

      // Query clinic_members scoped to Clinic B via RLS
      const membersB = await appClient.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.clinic_id = '${clinicB.id}'`);
        return tx.clinicMember.findMany();
      });

      // All returned members should belong to Clinic B
      expect(membersB.length).toBeGreaterThan(0);
      for (const m of membersB) {
        expect(m.clinicId).toBe(clinicB.id);
      }

      // Cross-check: Clinic A members must NOT appear in Clinic B results
      const memberIdsA = new Set(membersA.map((m) => m.id));
      const memberIdsB = new Set(membersB.map((m) => m.id));

      for (const id of memberIdsA) {
        expect(memberIdsB.has(id)).toBe(false);
      }
    } finally {
      await appClient.$disconnect();
    }
  });

  // ----------------------------------------------------------------
  // Test 3: Cross-creation isolation (audit logs)
  // ----------------------------------------------------------------
  it('should isolate audit logs across tenants -- Clinic A logs not visible in Clinic B context', async () => {
    // Create an audit log entry in Clinic A's context using the base client
    const basePrisma = getBasePrisma();

    await basePrisma.authAuditLog.create({
      data: {
        userId: userA.id,
        clinicId: clinicA.id,
        event: 'TENANT_ISOLATION_TEST',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        metadata: { test: 'cross-creation-isolation' },
      },
    });

    // Also create one in Clinic B's context
    await basePrisma.authAuditLog.create({
      data: {
        userId: userB.id,
        clinicId: clinicB.id,
        event: 'TENANT_ISOLATION_TEST_B',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        metadata: { test: 'cross-creation-isolation-b' },
      },
    });

    // Skip RLS-specific checks if DATABASE_URL_APP is not set
    if (!process.env.DATABASE_URL_APP) {
      console.warn('Skipping RLS audit log test: DATABASE_URL_APP not set');
      return;
    }

    // Use a raw PrismaClient connected as breeyo_app to test RLS directly.
    const appClient = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_APP,
    });

    try {
      // Query audit logs scoped to Clinic B via RLS
      const logsB = await appClient.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.clinic_id = '${clinicB.id}'`);
        return tx.authAuditLog.findMany();
      });
      const eventsB = logsB.map((l) => l.event);

      // Clinic A's test log should NOT appear in Clinic B's results
      expect(eventsB).not.toContain('TENANT_ISOLATION_TEST');
      // Clinic B's own log should appear
      expect(eventsB).toContain('TENANT_ISOLATION_TEST_B');

      // Query audit logs scoped to Clinic A via RLS
      const logsA = await appClient.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.clinic_id = '${clinicA.id}'`);
        return tx.authAuditLog.findMany();
      });
      const eventsA = logsA.map((l) => l.event);

      // Clinic B's test log should NOT appear in Clinic A's results
      expect(eventsA).not.toContain('TENANT_ISOLATION_TEST_B');
      // Clinic A's own log should appear
      expect(eventsA).toContain('TENANT_ISOLATION_TEST');
    } finally {
      await appClient.$disconnect();
    }
  });

  // ----------------------------------------------------------------
  // Test 4: Owner multi-clinic access (D-25)
  // ----------------------------------------------------------------
  it('should allow an owner to see all their clinics via GET /api/v1/auth/clinics (D-25)', async () => {
    // User A owns Clinic A (already created). Create Clinic C also owned by A.
    const clinicC = await createTestClinic(userA.id, { name: 'Clinic C' });
    await createTestClinicMember(userA.id, clinicC.id, 'Admin');

    // User A lists clinics -- should see Clinic A and Clinic C
    const responseA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/clinics',
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(responseA.statusCode).toBe(200);
    const bodyA = responseA.json();
    const clinicNamesA = bodyA.data.clinics.map((c: any) => c.name);
    expect(clinicNamesA).toContain('Clinic A');
    expect(clinicNamesA).toContain('Clinic C');
    expect(clinicNamesA).not.toContain('Clinic B');

    // User B lists clinics -- should only see Clinic B
    const responseB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/clinics',
      headers: { authorization: `Bearer ${tokenB}` },
    });

    expect(responseB.statusCode).toBe(200);
    const bodyB = responseB.json();
    const clinicNamesB = bodyB.data.clinics.map((c: any) => c.name);
    expect(clinicNamesB).toContain('Clinic B');
    expect(clinicNamesB).not.toContain('Clinic A');
    expect(clinicNamesB).not.toContain('Clinic C');
    expect(bodyB.data.clinics).toHaveLength(1);
  });

  // ----------------------------------------------------------------
  // Test 5: Staff isolation (D-26)
  // ----------------------------------------------------------------
  it('should isolate staff to only their assigned clinics (D-26)', async () => {
    // Create Clinic C owned by A
    const clinicC = await createTestClinic(userA.id, { name: 'Clinic C' });
    await createTestClinicMember(userA.id, clinicC.id, 'Admin');

    // Create staff User C as FrontDesk in Clinic A
    const userC = await createTestUser({
      email: 'user-c@test.com',
      fullName: 'User C (FrontDesk)',
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });
    await createTestClinicMember(userC.id, clinicA.id, 'FrontDesk');

    // User C with Clinic A token can access Clinic A data
    const tokenCForA = (await createTestTokens(app, userC.id, clinicA.id)).accessToken;

    const responseCInA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenCForA}` },
    });

    expect(responseCInA.statusCode).toBe(200);
    const permsCInA = responseCInA.json().data.permissions;
    expect(permsCInA.length).toBeGreaterThan(0);
    // FrontDesk should have VIEW_PATIENTS
    expect(permsCInA).toContain('VIEW_PATIENTS');

    // User C attempts to access Clinic B -- should get no permissions
    const tokenCForB = app.jwt.sign(
      { sub: userC.id, clinicId: clinicB.id, type: 'access' },
      { expiresIn: '15m' },
    );

    const responseCInB = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenCForB}` },
    });

    expect(responseCInB.statusCode).toBe(200);
    expect(responseCInB.json().data.permissions).toEqual([]);

    // User C attempts to access Clinic C -- should get no permissions
    const tokenCForC = app.jwt.sign(
      { sub: userC.id, clinicId: clinicC.id, type: 'access' },
      { expiresIn: '15m' },
    );

    const responseCInC = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenCForC}` },
    });

    expect(responseCInC.statusCode).toBe(200);
    expect(responseCInC.json().data.permissions).toEqual([]);

    // User C lists clinics -- should only see Clinic A
    const clinicsC = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/clinics',
      headers: { authorization: `Bearer ${tokenCForA}` },
    });

    expect(clinicsC.statusCode).toBe(200);
    const clinicNamesC = clinicsC.json().data.clinics.map((c: any) => c.name);
    expect(clinicNamesC).toContain('Clinic A');
    expect(clinicNamesC).not.toContain('Clinic B');
    expect(clinicNamesC).not.toContain('Clinic C');
  });

  // ----------------------------------------------------------------
  // Test 6: Deactivated membership isolation
  // ----------------------------------------------------------------
  it('should prevent access after membership deactivation', async () => {
    // Create staff User C as FrontDesk in Clinic A
    const userC = await createTestUser({
      email: 'user-c@test.com',
      fullName: 'User C (FrontDesk)',
      isEmailVerified: true,
      password: TEST_PASSWORD,
    });
    const memberC = await createTestClinicMember(userC.id, clinicA.id, 'FrontDesk');

    const tokenCForA = (await createTestTokens(app, userC.id, clinicA.id)).accessToken;

    // Verify User C can access Clinic A data before deactivation
    const beforeResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenCForA}` },
    });

    expect(beforeResponse.statusCode).toBe(200);
    expect(beforeResponse.json().data.permissions.length).toBeGreaterThan(0);

    // Deactivate User C's Clinic A membership
    await prisma.clinicMember.update({
      where: { id: memberC.id },
      data: { isActive: false },
    });

    // Flush the permission cache for User C
    const cacheKeys = await app.redis.keys(`perms:${userC.id}:*`);
    if (cacheKeys.length > 0) {
      await app.redis.del(...cacheKeys);
    }

    // User C should now get no permissions for Clinic A
    const afterResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenCForA}` },
    });

    expect(afterResponse.statusCode).toBe(200);
    expect(afterResponse.json().data.permissions).toEqual([]);

    // User C should no longer see Clinic A in their clinic list
    const clinicsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/clinics',
      headers: { authorization: `Bearer ${tokenCForA}` },
    });

    expect(clinicsResponse.statusCode).toBe(200);
    const clinicNames = clinicsResponse.json().data.clinics.map((c: any) => c.name);
    expect(clinicNames).not.toContain('Clinic A');
  });
});
