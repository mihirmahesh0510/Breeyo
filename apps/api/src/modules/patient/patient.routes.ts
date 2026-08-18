import type { FastifyInstance } from 'fastify';
import { PatientRepository } from './patient.repository.js';
import { PatientService } from './patient.service.js';
import { createPatientController } from './patient.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
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

  // `auth.routes.ts`'s `fastify.decorate('permissionService', ...)` never
  // reaches this sibling `app.register(...)` call — Fastify's plugin
  // encapsulation scopes it to auth's own child context. Same wall
  // billing/inventory/whatsapp/scheduling/clinic routes each hit and resolved
  // the same way: re-decorate locally, guarded so a shared decoration (if one
  // ever is reachable) is not clobbered.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // E2E-BUG-FIX-PLAN.md §3.6: read routes require VIEW_PATIENTS, writes
  // require EDIT_PATIENTS — mirrors seed.ts's DEFAULT_ROLE_PERMISSIONS split.
  const viewHandler = [authenticate, tenantContext, requirePermission('VIEW_PATIENTS')];
  const editHandler = [authenticate, tenantContext, requirePermission('EDIT_PATIENTS')];

  // Owner registration
  fastify.post('/owners', {
    preHandler: editHandler,
    handler: controller.registerOwnerHandler,
  });

  // Lookup owner by mobile (QUE-06: returning patient auto-fill)
  fastify.get('/owners/lookup', {
    preHandler: viewHandler,
    handler: controller.lookupByMobileHandler,
  });

  // Get owner detail with pets
  fastify.get('/owners/:ownerId', {
    preHandler: viewHandler,
    handler: controller.getOwnerDetailHandler,
  });

  // Register pet under owner
  fastify.post('/owners/:ownerId/pets', {
    preHandler: editHandler,
    handler: controller.registerPetHandler,
  });

  // Combined registration (D-12: quick inline registration)
  fastify.post('/patients/register', {
    preHandler: editHandler,
    handler: controller.registerPatientHandler,
  });

  // Search patients (PAT-04: trigram search)
  fastify.get('/patients/search', {
    preHandler: viewHandler,
    handler: controller.searchPatientsHandler,
  });

  // Recent patients (D-26: default Patients tab view)
  fastify.get('/patients/recent', {
    preHandler: viewHandler,
    handler: controller.getRecentPatientsHandler,
  });

  // Pet profile (PAT-05)
  fastify.get('/pets/:petId', {
    preHandler: viewHandler,
    handler: controller.getPetProfileHandler,
  });

  // Update pet (D-30: edit mode)
  fastify.patch('/pets/:petId', {
    preHandler: editHandler,
    handler: controller.updatePetHandler,
  });
}
