import type { FastifyInstance } from 'fastify';
import { PatientRepository } from './patient.repository.js';
import { PatientService } from './patient.service.js';
import { createPatientController } from './patient.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function patientRoutes(fastify: FastifyInstance) {
  // D-30: the service is built per request from `request.db`, the
  // tenant-scoped handle `tenantContext` installs, rather than once at plugin
  // scope from the breeyo_admin client, which bypasses RLS by design. This is
  // the reference factory shape for every clinic-scoped module; plans 06-08
  // and 06-20 copy it verbatim.
  const buildService = (db: TenantPrismaClient) =>
    new PatientService(new PatientRepository(db));

  const controller = createPatientController(buildService);

  const preHandler = [authenticate, tenantContext];

  // Owner registration
  fastify.post('/owners', {
    preHandler,
    handler: controller.registerOwnerHandler,
  });

  // Lookup owner by mobile (QUE-06: returning patient auto-fill)
  fastify.get('/owners/lookup', {
    preHandler,
    handler: controller.lookupByMobileHandler,
  });

  // Get owner detail with pets
  fastify.get('/owners/:ownerId', {
    preHandler,
    handler: controller.getOwnerDetailHandler,
  });

  // Register pet under owner
  fastify.post('/owners/:ownerId/pets', {
    preHandler,
    handler: controller.registerPetHandler,
  });

  // Combined registration (D-12: quick inline registration)
  fastify.post('/patients/register', {
    preHandler,
    handler: controller.registerPatientHandler,
  });

  // Search patients (PAT-04: trigram search)
  fastify.get('/patients/search', {
    preHandler,
    handler: controller.searchPatientsHandler,
  });

  // Recent patients (D-26: default Patients tab view)
  fastify.get('/patients/recent', {
    preHandler,
    handler: controller.getRecentPatientsHandler,
  });

  // Pet profile (PAT-05)
  fastify.get('/pets/:petId', {
    preHandler,
    handler: controller.getPetProfileHandler,
  });

  // Update pet (D-30: edit mode)
  fastify.patch('/pets/:petId', {
    preHandler,
    handler: controller.updatePetHandler,
  });
}
