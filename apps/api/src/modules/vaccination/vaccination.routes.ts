import type { FastifyInstance } from 'fastify';
import { VaccinationRepository } from './vaccination.repository.js';
import { VaccinationService } from './vaccination.service.js';
import { VaccinationController } from './vaccination.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function vaccinationRoutes(fastify: FastifyInstance) {
  // D-30: vaccination_records and deworming_records are clinic-scoped and only
  // isolated when reached via the tenant handle.
  const buildService = (db: TenantPrismaClient) =>
    new VaccinationService(new VaccinationRepository(db), db);

  const controller = new VaccinationController(buildService);

  // AC-3 (access-control audit): `auth.routes.ts`'s
  // `fastify.decorate('permissionService', ...)` never reaches this sibling
  // `app.register(...)` call -- Fastify's plugin encapsulation scopes it to
  // auth's own child context. Same wall every other module hits, resolved
  // the same way: re-decorate locally, guarded against clobbering.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // AC-3: this module had zero permission checks -- vaccination/deworming
  // records are clinical records, gated the same as `emr.routes.ts` (VIEW_EMR
  // to read, EDIT_EMR to record a vaccination/deworming).
  const viewHandler = [authenticate, tenantContext, requirePermission('VIEW_EMR')];
  const editHandler = [authenticate, tenantContext, requirePermission('EDIT_EMR')];

  // Vaccination records
  fastify.post('/pets/:petId/vaccinations', { preHandler: editHandler, handler: controller.addVaccination });
  fastify.get('/pets/:petId/vaccinations', { preHandler: viewHandler, handler: controller.getVaccinationHistory });

  // Deworming records
  fastify.post('/pets/:petId/deworming', { preHandler: editHandler, handler: controller.addDeworming });
  fastify.get('/pets/:petId/deworming', { preHandler: viewHandler, handler: controller.getDewormingHistory });

  // Preventive care status
  fastify.get('/pets/:petId/preventive-care', { preHandler: viewHandler, handler: controller.getPreventiveCareStatus });

  // Vaccination certificate
  fastify.get('/pets/:petId/vaccinations/:vaccinationId/certificate', { preHandler: viewHandler, handler: controller.getCertificateData });
}
