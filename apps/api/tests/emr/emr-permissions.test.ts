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
  createTestConsultation,
  prisma,
} from '../helpers/factories.js';

/**
 * ACCESS-CONTROL-FIX-PLAN.md AC-3: `emr.routes.ts` (all routes),
 * `attachment.routes.ts`, and `vaccination.routes.ts` shared one bare
 * `preHandler = [authenticate, tenantContext]` across every route, with zero
 * `requirePermission(...)` calls, despite `seed.ts` already defining
 * VIEW_EMR/EDIT_EMR per role.
 *
 * `FrontDesk` has neither VIEW_EMR nor EDIT_EMR (see seed.ts
 * DEFAULT_ROLE_PERMISSIONS) -- exactly the fixture needed to prove each
 * route is actually gated. `Clinician` has both.
 */

let app: FastifyInstance;

let clinicId: string;
let frontDeskToken: string;
let clinicianToken: string;
let clinicianUserId: string;
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

  // PermissionService caches resolved permissions in Redis under `perms:*` --
  // fresh users each test still share a Redis instance across test files.
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) {
    await app.redis.del(...keys);
  }

  const clinicOwnerUser = await createTestUser();
  const clinic = await createTestClinic(clinicOwnerUser.id);
  clinicId = clinic.id;

  const frontDeskUser = await createTestUser();
  await createTestClinicMember(frontDeskUser.id, clinicId, 'FrontDesk');
  ({ accessToken: frontDeskToken } = await createTestTokens(app, frontDeskUser.id, clinicId));

  const clinicianUser = await createTestUser();
  clinicianUserId = clinicianUser.id;
  await createTestClinicMember(clinicianUser.id, clinicId, 'Clinician');
  ({ accessToken: clinicianToken } = await createTestTokens(app, clinicianUser.id, clinicId));

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

describe('EMR/attachment/vaccination route permission gating (AC-3)', () => {
  describe('emr.routes.ts', () => {
    it('POST /consultations (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ petId, visitType: 'general' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ petId, visitType: 'general' });
      expectNotForbidden(allowed);
    });

    it('GET /consultations/:consultationId (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('PATCH /consultations/:consultationId/draft (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .patch(`/api/v1/consultations/${consultation.id}/draft`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ assessment: 'test' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .patch(`/api/v1/consultations/${consultation.id}/draft`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ assessment: 'test' });
      expectNotForbidden(allowed);
    });

    it('POST /consultations/:consultationId/finalize (EDIT_EMR) is forbidden for FrontDesk', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .post(`/api/v1/consultations/${consultation.id}/finalize`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({});
      expectForbidden(denied);
    });

    it('POST /consultations/sync/replay (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .post('/api/v1/consultations/sync/replay')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ deviceId: 'device-1', operations: [] });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post('/api/v1/consultations/sync/replay')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ deviceId: 'device-1', operations: [] });
      expectNotForbidden(allowed);
    });

    it('GET /pets/:petId/history (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .get(`/api/v1/pets/${petId}/history`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/pets/${petId}/history`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('POST /consultations/:consultationId/heartbeat (EDIT_EMR) is forbidden for FrontDesk', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .post(`/api/v1/consultations/${consultation.id}/heartbeat`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({});
      expectForbidden(denied);
    });

    it('GET /consultations/:consultationId/lock (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}/lock`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}/lock`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('POST /consultations/validate-dosage (EDIT_EMR) is forbidden for FrontDesk', async () => {
      const denied = await request(app.server)
        .post('/api/v1/consultations/validate-dosage')
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ enteredDoseMg: 10, petWeightKg: 5, speciesDosage: {} });
      expectForbidden(denied);
    });
  });

  describe('attachment.routes.ts', () => {
    it('POST /consultations/:consultationId/attachments (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .post(`/api/v1/consultations/${consultation.id}/attachments`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ fileType: 'PHOTO', fileName: 'x.jpg', mimeType: 'image/jpeg', fileSizeBytes: 1000 });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post(`/api/v1/consultations/${consultation.id}/attachments`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ fileType: 'PHOTO', fileName: 'x.jpg', mimeType: 'image/jpeg', fileSizeBytes: 1000 });
      expectNotForbidden(allowed);
    });

    it('GET /consultations/:consultationId/attachments (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}/attachments`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/consultations/${consultation.id}/attachments`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('DELETE /consultations/:consultationId/attachments/:id (EDIT_EMR) is forbidden for FrontDesk', async () => {
      const consultation = await createTestConsultation(clinicId, petId, clinicianUserId);

      const denied = await request(app.server)
        .delete(`/api/v1/consultations/${consultation.id}/attachments/nonexistent-id`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);
    });
  });

  describe('vaccination.routes.ts', () => {
    it('POST /pets/:petId/vaccinations (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .post(`/api/v1/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ vaccineName: 'Rabies' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post(`/api/v1/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ vaccineName: 'Rabies' });
      expectNotForbidden(allowed);
    });

    it('GET /pets/:petId/vaccinations (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .get(`/api/v1/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/pets/${petId}/vaccinations`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('GET /pets/:petId/preventive-care (VIEW_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .get(`/api/v1/pets/${petId}/preventive-care`)
        .set('Authorization', `Bearer ${frontDeskToken}`);
      expectForbidden(denied);

      const allowed = await request(app.server)
        .get(`/api/v1/pets/${petId}/preventive-care`)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expectNotForbidden(allowed);
    });

    it('POST /pets/:petId/deworming (EDIT_EMR) is forbidden for FrontDesk, allowed for Clinician', async () => {
      const denied = await request(app.server)
        .post(`/api/v1/pets/${petId}/deworming`)
        .set('Authorization', `Bearer ${frontDeskToken}`)
        .send({ drugName: 'Drontal' });
      expectForbidden(denied);

      const allowed = await request(app.server)
        .post(`/api/v1/pets/${petId}/deworming`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({ drugName: 'Drontal' });
      expectNotForbidden(allowed);
    });
  });
});

describe('EMR consultation offline replay: petId cross-clinic validation (AC-4)', () => {
  it('rejects creating a consultation whose petId belongs to a different clinic, with 404, and creates no Consultation row', async () => {
    const otherClinicOwner = await createTestUser();
    const otherClinic = await createTestClinic(otherClinicOwner.id, { name: 'Other Clinic' });
    const otherOwner = await createTestPetOwner(otherClinic.id);
    const otherClinicPet = await createTestPet(otherClinic.id, otherOwner.id);

    const res = await request(app.server)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${clinicianToken}`)
      .send({ petId: otherClinicPet.id, visitType: 'general' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PET_NOT_FOUND');

    const createdConsultations = await prisma.consultation.findMany({
      where: { petId: otherClinicPet.id },
    });
    expect(createdConsultations).toHaveLength(0);
  });
});
