import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp, closeTestApp } from './helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestServiceCatalogEntry,
  createTestPrescription,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
  createTestWhatsAppReminderTask,
  prisma,
} from './helpers/factories.js';
import { getBasePrisma, createTenantClient } from '../src/lib/prisma-rls.js';
import { QueueRepository } from '../src/modules/queue/queue.repository.js';
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

  // ----------------------------------------------------------------
  // Phase 3/4 table isolation (D-30, plan 06-00)
  // ----------------------------------------------------------------
  // These read through `createTenantClient` -- the breeyo_app handle that
  // binds app.clinic_id -- NOT through `prisma` from factories.ts, which
  // connects as breeyo_admin and bypasses RLS by design.
  describe('Phase 3/4 table isolation via tenant client (D-30)', () => {
    const requiresAppDb = () => {
      if (!process.env.DATABASE_URL_APP) {
        console.warn('Skipping RLS DB test: DATABASE_URL_APP not set');
        return true;
      }
      return false;
    };

    it('tenant handle scopes pets', async () => {
      if (requiresAppDb()) return;

      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const petA = await createTestPet(clinicA.id, ownerA.id, { name: 'Pet A' });
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'Pet B' });

      const petsSeenByA = await createTenantClient(clinicA.id).pet.findMany();
      const idsSeenByA = petsSeenByA.map((p) => p.id);

      expect(idsSeenByA).toContain(petA.id);
      expect(idsSeenByA).not.toContain(petB.id);
      for (const p of petsSeenByA) {
        expect(p.clinicId).toBe(clinicA.id);
      }
    });

    it('tenant handle scopes consultations', async () => {
      if (requiresAppDb()) return;

      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const petA = await createTestPet(clinicA.id, ownerA.id);
      const petB = await createTestPet(clinicB.id, ownerB.id);
      const consultA = await createTestConsultation(clinicA.id, petA.id, userA.id);
      const consultB = await createTestConsultation(clinicB.id, petB.id, userB.id);

      const seenByA = await createTenantClient(clinicA.id).consultation.findMany();
      const idsSeenByA = seenByA.map((c) => c.id);

      expect(idsSeenByA).toContain(consultA.id);
      expect(idsSeenByA).not.toContain(consultB.id);
    });

    it('tenant handle scopes service_catalog', async () => {
      if (requiresAppDb()) return;

      const serviceA = await createTestServiceCatalogEntry(clinicA.id, {
        name: 'Consultation Fee A',
      });
      const serviceB = await createTestServiceCatalogEntry(clinicB.id, {
        name: 'Consultation Fee B',
      });

      const seenByA = await createTenantClient(clinicA.id).serviceCatalog.findMany();
      const idsSeenByA = seenByA.map((s) => s.id);

      expect(idsSeenByA).toContain(serviceA.id);
      expect(idsSeenByA).not.toContain(serviceB.id);

      // ...and the mirror direction, so a policy that hides everything cannot pass.
      const seenByB = await createTenantClient(clinicB.id).serviceCatalog.findMany();
      const idsSeenByB = seenByB.map((s) => s.id);
      expect(idsSeenByB).toContain(serviceB.id);
      expect(idsSeenByB).not.toContain(serviceA.id);
    });

    it('tenant handle blocks cross-tenant write', async () => {
      if (requiresAppDb()) return;

      const ownerB = await createTestPetOwner(clinicB.id);
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'Pet B' });

      // The RLS USING clause hides the row, so Prisma reports record-not-found.
      await expect(
        createTenantClient(clinicA.id).pet.update({
          where: { id: petB.id },
          data: { name: 'Hijacked' },
        }),
      ).rejects.toThrow();

      // The row is untouched when read with the RLS-bypassing admin client.
      const after = await prisma.pet.findUnique({ where: { id: petB.id } });
      expect(after?.name).toBe('Pet B');
    });

    it('child table isolation -- prescriptions inherit their consultation clinic', async () => {
      if (requiresAppDb()) return;

      const ownerB = await createTestPetOwner(clinicB.id);
      const petB = await createTestPet(clinicB.id, ownerB.id);
      const consultB = await createTestConsultation(clinicB.id, petB.id, userB.id);
      const rxB = await createTestPrescription(consultB.id, { drugName: 'Meloxicam B' });

      // prescriptions has no clinic_id -- it is scoped through consultations.
      const seenByA = await createTenantClient(clinicA.id).prescription.findMany();
      expect(seenByA.map((p) => p.id)).not.toContain(rxB.id);

      const seenByB = await createTenantClient(clinicB.id).prescription.findMany();
      expect(seenByB.map((p) => p.id)).toContain(rxB.id);
    });

    // The tenant handle wraps every operation in its own $transaction to bind
    // app.clinic_id. `EmrRepository.finalizeConsultation` and
    // `savePrescriptions` use the interactive `$transaction(async (tx) => ...)`
    // overload, so the binding has to survive one transaction nested inside
    // another -- otherwise plan 06-02's emr conversion would silently run the
    // EMR write path unscoped.
    it('tenant handle keeps scoping inside an interactive $transaction', async () => {
      if (requiresAppDb()) return;

      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const petA = await createTestPet(clinicA.id, ownerA.id);
      const petB = await createTestPet(clinicB.id, ownerB.id);
      const consultA = await createTestConsultation(clinicA.id, petA.id, userA.id);
      const consultB = await createTestConsultation(clinicB.id, petB.id, userB.id);

      const dbA = createTenantClient(clinicA.id);

      // Reads inside the interactive transaction stay scoped.
      const seenInsideTx = await dbA.$transaction(async (tx) => {
        const rows = await tx.consultation.findMany();
        return rows.map((c) => c.id);
      });
      expect(seenInsideTx).toContain(consultA.id);
      expect(seenInsideTx).not.toContain(consultB.id);

      // `EmrRepository.updateAddenda` updates by id with no clinicId filter,
      // so RLS is the only thing standing between clinic A and clinic B's
      // consultation here.
      await expect(
        dbA.$transaction(async (tx) => {
          await tx.consultation.update({
            where: { id: consultB.id },
            data: { status: 'finalized' },
          });
        }),
      ).rejects.toThrow();

      const after = await prisma.consultation.findUnique({ where: { id: consultB.id } });
      expect(after?.status).toBe('draft');
    });
  });

  // ----------------------------------------------------------------
  // HTTP-layer tenant scoping (D-30, plan 06-02)
  // ----------------------------------------------------------------
  // The block above proves the *tenant handle* isolates rows. These prove the
  // shipped HTTP routes actually go through that handle: before plan 06-02
  // every module built its repository from `fastify.prisma` (breeyo_admin,
  // which bypasses RLS by design), so the isolation above protected nothing
  // that a real request could reach.
  describe('HTTP-layer tenant scoping (D-30)', () => {
    const authFor = (token: string) => ({ authorization: `Bearer ${token}` });

    /** Checks a pet into its own clinic's queue over HTTP. */
    async function checkIn(token: string, petId: string) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/queue/check-in',
        headers: authFor(token),
        payload: { petId, visitReason: 'Scoping fixture' },
      });
      expect(response.statusCode).toBe(201);
      return response.json().data;
    }

    it('HTTP pets scoping -- /patients/recent never crosses clinics', async () => {
      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const petA = await createTestPet(clinicA.id, ownerA.id, { name: 'Recent A' });
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'Recent B' });

      // /patients/recent joins queue_entries, so each pet needs a visit.
      await checkIn(tokenA, petA.id);
      await checkIn(tokenB, petB.id);

      const responseA = await app.inject({
        method: 'GET',
        url: '/api/v1/patients/recent',
        headers: authFor(tokenA),
      });
      expect(responseA.statusCode).toBe(200);
      const petIdsA = responseA.json().data.map((r: { petId: string }) => r.petId);
      expect(petIdsA).toContain(petA.id);
      expect(petIdsA).not.toContain(petB.id);

      // Mirror direction, so a policy that hides everything cannot pass.
      const responseB = await app.inject({
        method: 'GET',
        url: '/api/v1/patients/recent',
        headers: authFor(tokenB),
      });
      expect(responseB.statusCode).toBe(200);
      const petIdsB = responseB.json().data.map((r: { petId: string }) => r.petId);
      expect(petIdsB).toContain(petB.id);
      expect(petIdsB).not.toContain(petA.id);
    });

    it('HTTP pet IDOR -- GET /pets/:petId on another clinic pet is 404, not 200 or 500', async () => {
      const ownerB = await createTestPetOwner(clinicB.id);
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'IDOR target' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/pets/${petB.id}`,
        headers: authFor(tokenA),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('PET_NOT_FOUND');

      // Clinic B still reaches its own pet -- the route is not simply broken.
      const ownResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/pets/${petB.id}`,
        headers: authFor(tokenB),
      });
      expect(ownResponse.statusCode).toBe(200);
    });

    it('HTTP queue scoping -- GET /queue returns only the caller clinic entries', async () => {
      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const petA = await createTestPet(clinicA.id, ownerA.id, { name: 'Queue A' });
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'Queue B' });

      const entryA = await checkIn(tokenA, petA.id);
      const entryB = await checkIn(tokenB, petB.id);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/queue',
        headers: authFor(tokenA),
      });
      expect(response.statusCode).toBe(200);

      const board = response.json().data;
      const allEntries = [...board.waiting, ...board.inConsult, ...board.done];
      const entryIds = allEntries.map((e: { id: string }) => e.id);

      expect(entryIds).toContain(entryA.id);
      expect(entryIds).not.toContain(entryB.id);
      for (const entry of allEntries) {
        expect(entry.clinicId).toBe(clinicA.id);
      }
    });

    // This is the case that actually discriminates `request.db` from
    // `fastify.prisma`. Every other test in this block passes on the admin
    // client too, because each repository method already carries an explicit
    // `clinicId` WHERE clause. `QueueService.checkIn` never verifies that the
    // pet belongs to the calling clinic, so the explicit-filter layer does not
    // cover it -- only the RLS layer does, and RLS only applies if the route
    // actually holds the tenant handle.
    it('HTTP cross-tenant pull -- clinic A cannot pull clinic B pet onto its queue board', async () => {
      const ownerB = await createTestPetOwner(clinicB.id, { name: 'Owner B Secret' });
      const petB = await createTestPet(clinicB.id, ownerB.id, { name: 'PetB Secret' });

      // Clinic A checks in a pet id it does not own.
      const attempt = await app.inject({
        method: 'POST',
        url: '/api/v1/queue/check-in',
        headers: authFor(tokenA),
        payload: { petId: petB.id, visitReason: 'Cross-tenant attempt' },
      });

      // Rejected cleanly -- not a 201, and not a 500 leaking a constraint error.
      expect(attempt.statusCode).toBe(404);
      expect(attempt.json().error.code).toBe('PET_NOT_FOUND');

      // ...and no orphan row was written against clinic B's pet.
      const orphans = await prisma.queueEntry.findMany({ where: { petId: petB.id } });
      expect(orphans).toHaveLength(0);

      const board = await app.inject({
        method: 'GET',
        url: '/api/v1/queue',
        headers: authFor(tokenA),
      });
      expect(board.statusCode).toBe(200);

      const serialized = JSON.stringify(board.json().data);
      expect(serialized).not.toContain('PetB Secret');
      expect(serialized).not.toContain('Owner B Secret');
      expect(serialized).not.toContain(petB.id);
    });

    // ----------------------------------------------------------------
    // Inventory (plan 06-20 scope addition)
    // ----------------------------------------------------------------
    // The inventory module landed in Phase 5, after plan 06-20's file list was
    // written, and was still on `fastify.prisma` when this plan started -- its
    // six RLS policies from 06-00 existed with nothing reaching them. Its
    // integration suite is entirely `it.todo`, so these are the only runtime
    // proof that the conversion works and did not break the write path.

    /** Creates an inventory item over HTTP and returns it. */
    async function createItem(token: string, name: string) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory/items',
        headers: authFor(token),
        payload: { name, category: 'MEDICINE', unit: 'TABLET', sellingPrice: 10 },
      });
      expect(response.statusCode).toBe(201);
      return response.json().data;
    }

    it('HTTP inventory scoping -- GET /inventory/items never crosses clinics', async () => {
      const itemA = await createItem(tokenA, 'Amoxicillin A');
      const itemB = await createItem(tokenB, 'Amoxicillin B');

      const responseA = await app.inject({
        method: 'GET',
        url: '/api/v1/inventory/items',
        headers: authFor(tokenA),
      });
      expect(responseA.statusCode).toBe(200);

      const serialized = JSON.stringify(responseA.json().data);
      expect(serialized).toContain(itemA.id);
      expect(serialized).not.toContain(itemB.id);
      expect(serialized).not.toContain('Amoxicillin B');

      // Mirror direction, so a policy that hides everything cannot pass.
      const responseB = await app.inject({
        method: 'GET',
        url: '/api/v1/inventory/items',
        headers: authFor(tokenB),
      });
      expect(responseB.statusCode).toBe(200);
      const serializedB = JSON.stringify(responseB.json().data);
      expect(serializedB).toContain(itemB.id);
      expect(serializedB).not.toContain(itemA.id);
    });

    // The riskiest part of the conversion. `StockReceiptService.receiveStock`
    // and `FifoDispenseService.dispense` both use the *interactive*
    // `$transaction(async (tx) => ...)` overload, and dispense issues a raw
    // `SELECT ... FOR UPDATE` through `tx.$queryRaw`. Running those through the
    // tenant handle nests one transaction inside the extension's own, so this
    // asserts the write path still works end to end rather than only that reads
    // are filtered.
    it('HTTP inventory write path -- receive then dispense works through the tenant handle', async () => {
      const item = await createItem(tokenA, 'Meloxicam A');

      const receipt = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/items/${item.id}/receive`,
        headers: authFor(tokenA),
        payload: { quantity: 20, costPrice: 5, batchNumber: 'B-1' },
      });
      expect(receipt.statusCode).toBe(201);

      const dispense = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/items/${item.id}/dispense`,
        headers: authFor(tokenA),
        payload: { quantity: 3 },
      });
      expect(dispense.statusCode).toBe(200);

      // Stock actually moved -- the nested transaction committed.
      const after = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
      expect(Number(after?.currentStock)).toBe(17);

      const movements = await prisma.stockMovement.findMany({ where: { itemId: item.id } });
      expect(movements.length).toBeGreaterThan(0);
      for (const movement of movements) {
        expect(movement.clinicId).toBe(clinicA.id);
      }
    });

    it('HTTP inventory IDOR -- clinic A cannot dispense or read clinic B stock', async () => {
      const itemB = await createItem(tokenB, 'Ketamine B');

      const receipt = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/items/${itemB.id}/receive`,
        headers: authFor(tokenB),
        payload: { quantity: 10, costPrice: 50, batchNumber: 'CTRL-1' },
      });
      expect(receipt.statusCode).toBe(201);

      // Read attempt: must not return clinic B's item to clinic A.
      const read = await app.inject({
        method: 'GET',
        url: `/api/v1/inventory/items/${itemB.id}`,
        headers: authFor(tokenA),
      });
      expect(read.statusCode).not.toBe(200);
      expect(JSON.stringify(read.json())).not.toContain('Ketamine B');

      // Write attempt: must not deduct stock from clinic B's controlled drug.
      const dispense = await app.inject({
        method: 'POST',
        url: `/api/v1/inventory/items/${itemB.id}/dispense`,
        headers: authFor(tokenA),
        payload: { quantity: 4 },
      });
      expect(dispense.statusCode).not.toBe(200);

      const after = await prisma.inventoryItem.findUnique({ where: { id: itemB.id } });
      expect(Number(after?.currentStock)).toBe(10);

      const foreignMovements = await prisma.stockMovement.findMany({
        where: { itemId: itemB.id, clinicId: clinicA.id },
      });
      expect(foreignMovements).toHaveLength(0);
    });

    // ----------------------------------------------------------------
    // WhatsApp (Phase 7, plan 07-12). `whatsapp_*` tables are deliberately
    // NOT given RLS policies (prisma/post-migrate.sql section 9: FORCE RLS
    // against the admin role every WhatsApp repository is built from would
    // return zero rows -- RESEARCH Pitfall 5). Tenant isolation for these
    // tables lives ENTIRELY in the explicit-clinicId application layer, so
    // proving it means going through the HTTP API, not a tenant Prisma
    // client -- there is no RLS policy here for that client to demonstrate.
    // ----------------------------------------------------------------
    it('whatsapp_threads and whatsapp_messages created by clinic A are invisible to clinic B through the API', async () => {
      const ownerA = await createTestPetOwner(clinicA.id, { name: 'WA Owner A Secret' });
      const threadA = await createTestWhatsAppThread(clinicA.id, ownerA.id, { lastMessageAt: new Date() });
      await createTestWhatsAppMessage(clinicA.id, threadA.id, { body: 'WA Message A Secret' });

      // Clinic B's own list never contains clinic A's thread or its data.
      const listB = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/threads',
        headers: authFor(tokenB),
      });
      expect(listB.statusCode).toBe(200);
      const idsB = listB.json().data.threads.map((t: { id: string }) => t.id);
      expect(idsB).not.toContain(threadA.id);
      expect(JSON.stringify(listB.json())).not.toContain('WA Owner A Secret');

      // Clinic B cannot fetch clinic A's thread by id -- 404, never 403 or a
      // body field disclosing that the thread exists.
      const detailB = await app.inject({
        method: 'GET',
        url: `/api/v1/whatsapp/threads/${threadA.id}`,
        headers: authFor(tokenB),
      });
      expect(detailB.statusCode).toBe(404);
      expect(detailB.json().error.code).toBe('THREAD_NOT_FOUND');
      expect(JSON.stringify(detailB.json())).not.toContain('WA Message A Secret');

      // Clinic A still reaches its own thread -- the route is not simply broken.
      const detailA = await app.inject({
        method: 'GET',
        url: `/api/v1/whatsapp/threads/${threadA.id}`,
        headers: authFor(tokenA),
      });
      expect(detailA.statusCode).toBe(200);
      expect(JSON.stringify(detailA.json())).toContain('WA Message A Secret');
    });

    it("whatsapp_reminder_tasks created for clinic A never surface in clinic B's inbox", async () => {
      const ownerA = await createTestPetOwner(clinicA.id);
      const petA = await createTestPet(clinicA.id, ownerA.id, { name: 'WA Pet A Secret' });
      const threadA = await createTestWhatsAppThread(clinicA.id, ownerA.id, {
        needsAction: true,
        needsActionReason: 'NO_REPLY_AFTER_MAX_ATTEMPTS',
        lastMessageAt: new Date(),
      });
      await createTestWhatsAppReminderTask(clinicA.id, ownerA.id, petA.id, {
        state: 'CAPPED_NEEDS_ACTION',
        sourceLabel: 'WA Reminder A Secret',
      });

      // Clinic B's "Needs action" filter never surfaces clinic A's thread.
      const needsActionB = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/threads?filter=needs_action',
        headers: authFor(tokenB),
      });
      expect(needsActionB.statusCode).toBe(200);
      const idsB = needsActionB.json().data.threads.map((t: { id: string }) => t.id);
      expect(idsB).not.toContain(threadA.id);
      expect(JSON.stringify(needsActionB.json())).not.toContain('WA Pet A Secret');

      // Clinic A's own "Needs action" filter DOES surface it -- proving the
      // filter itself works and the isolation above is real, not a broken route.
      const needsActionA = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/threads?filter=needs_action',
        headers: authFor(tokenA),
      });
      const idsA = needsActionA.json().data.threads.map((t: { id: string }) => t.id);
      expect(idsA).toContain(threadA.id);
    });

    it('static helper preserved -- QueueRepository.getTodayIST() stays callable without an instance', () => {
      // The per-request refactor must not turn this into an instance method:
      // the midnight-archive cron job calls it with no repository in scope.
      const today = QueueRepository.getTodayIST();

      expect(today).toBeInstanceOf(Date);

      // Midnight IST == 18:30 UTC the previous day.
      expect(today.getUTCHours()).toBe(18);
      expect(today.getUTCMinutes()).toBe(30);
      expect(today.getUTCSeconds()).toBe(0);
      expect(today.getUTCMilliseconds()).toBe(0);

      // Deterministic for a fixed input.
      const fixed = QueueRepository.getTodayIST(new Date('2026-08-14T09:00:00Z'));
      expect(fixed.toISOString()).toBe('2026-08-13T18:30:00.000Z');
    });
  });
});
