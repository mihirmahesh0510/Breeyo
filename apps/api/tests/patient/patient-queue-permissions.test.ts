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
  createTestPetOwner,
  createTestPet,
  prisma,
} from '../helpers/factories.js';

/**
 * E2E-BUG-FIX-PLAN.md §3.6: `patient.routes.ts` and `queue.routes.ts` shared
 * one `preHandler = [authenticate, tenantContext]` array across every route,
 * with zero `requirePermission(...)` calls, despite `seed.ts` already
 * defining VIEW_PATIENTS/EDIT_PATIENTS/VIEW_QUEUE/MANAGE_QUEUE per role.
 *
 * `InventoryManager` has VIEW_PATIENTS but not EDIT_PATIENTS, and has neither
 * VIEW_QUEUE nor MANAGE_QUEUE at all (see seed.ts DEFAULT_ROLE_PERMISSIONS) —
 * exactly the fixture needed to prove each route is gated on the right code.
 * `FrontDesk` has every permission these two modules require.
 */

let app: FastifyInstance;

let clinicId: string;
let frontDeskToken: string;
let inventoryManagerToken: string;
let ownerId: string;
let petId: string;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();

  // PermissionService caches resolved permissions in Redis under `perms:*` —
  // fresh users each test still share a Redis instance across test files.
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const ownerUser = await createTestUser();
  const clinic = await createTestClinic(ownerUser.id);
  clinicId = clinic.id;

  const frontDeskUser = await createTestUser();
  await createTestClinicMember(frontDeskUser.id, clinicId, 'FrontDesk');
  ({ accessToken: frontDeskToken } = await createTestTokens(app, frontDeskUser.id, clinicId));

  const inventoryUser = await createTestUser();
  await createTestClinicMember(inventoryUser.id, clinicId, 'InventoryManager');
  ({ accessToken: inventoryManagerToken } = await createTestTokens(app, inventoryUser.id, clinicId));

  const owner = await createTestPetOwner(clinicId);
  ownerId = owner.id;
  const pet = await createTestPet(clinicId, ownerId);
  petId = pet.id;
});

function expectForbidden(response: request.Response) {
  expect(response.status).toBe(403);
  expect(response.body.error.code).toBe('FORBIDDEN');
}

function expectNotForbidden(response: request.Response) {
  expect(response.status).not.toBe(403);
}

describe('Patient/queue route permission gating (E2E-BUG-FIX-PLAN.md §3.6)', () => {
  describe('VIEW_PATIENTS-gated routes', () => {
    it('GET /owners/lookup — InventoryManager (has VIEW_PATIENTS) is not forbidden', async () => {
      const res = await request(app.server)
        .get('/api/v1/owners/lookup?mobile=9876543210')
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectNotForbidden(res);
    });

    it('GET /owners/:ownerId — InventoryManager is not forbidden', async () => {
      const res = await request(app.server)
        .get(`/api/v1/owners/${ownerId}`)
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectNotForbidden(res);
    });

    it('GET /patients/search — InventoryManager is not forbidden', async () => {
      const res = await request(app.server)
        .get('/api/v1/patients/search?q=test')
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectNotForbidden(res);
    });

    it('GET /patients/recent — InventoryManager is not forbidden', async () => {
      const res = await request(app.server)
        .get('/api/v1/patients/recent')
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectNotForbidden(res);
    });

    it('GET /pets/:petId — InventoryManager is not forbidden', async () => {
      const res = await request(app.server)
        .get(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectNotForbidden(res);
    });
  });

  describe('EDIT_PATIENTS-gated routes (InventoryManager lacks this)', () => {
    it('POST /owners is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/owners')
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({ name: 'Test Owner', mobile: '9876500001' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/owners')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ name: 'Test Owner', mobile: '9876500002' });
      expectNotForbidden(allowed);
    });

    it('POST /owners/:ownerId/pets is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post(`/api/v1/owners/${ownerId}/pets`)
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({ name: 'Rex', species: 'DOG' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post(`/api/v1/owners/${ownerId}/pets`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ name: 'Rex', species: 'DOG' });
      expectNotForbidden(allowed);
    });

    it('POST /patients/register is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/patients/register')
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({
          owner: { name: 'New Owner', mobile: '9876500003' },
          pet: { name: 'Milo', species: 'DOG' },
        });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/patients/register')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({
          owner: { name: 'New Owner', mobile: '9876500004' },
          pet: { name: 'Milo', species: 'DOG' },
        });
      expectNotForbidden(allowed);
    });

    it('PATCH /pets/:petId is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({ name: 'Renamed' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .patch(`/api/v1/pets/${petId}`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ name: 'Renamed' });
      expectNotForbidden(allowed);
    });
  });

  describe('Queue routes — InventoryManager has neither VIEW_QUEUE nor MANAGE_QUEUE', () => {
    it('GET /queue is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .get('/api/v1/queue')
        .set('Authorization', `Bearer ${inventoryManagerToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get('/api/v1/queue')
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectNotForbidden(allowed);
    });

    it('POST /queue/check-in is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/queue/check-in')
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({ petId });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/queue/check-in')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ petId });
      expectNotForbidden(allowed);
    });

    it('PATCH /queue/:entryId/status is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const entry = await prisma.queueEntry.create({
        data: {
          clinicId,
          petId,
          checkedInBy: (await prisma.clinicMember.findFirstOrThrow({ where: { clinicId } })).userId,
          position: 1,
          queuePriorityAt: new Date(0),
        },
      });

      const denied = await request(app.server)
        .patch(`/api/v1/queue/${entry.id}/status`)
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({ status: 'IN_CONSULTATION' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .patch(`/api/v1/queue/${entry.id}/status`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ status: 'IN_CONSULTATION' });
      expectNotForbidden(allowed);
    });

    it('POST /queue/call-next requires MANAGE_QUEUE (mutates state) — forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/queue/call-next')
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({});
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/queue/call-next')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({});
      expectNotForbidden(allowed);
    });

    it('POST /queue/archive is forbidden for InventoryManager, allowed for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/queue/archive')
        .set('Authorization', `Bearer ${inventoryManagerToken}`)
        .send({});
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/queue/archive')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({});
      expectNotForbidden(allowed);
    });
  });
});
