import type { FastifyInstance } from 'fastify';
import { VaccinationRepository } from './vaccination.repository.js';
import { VaccinationService } from './vaccination.service.js';
import { VaccinationController } from './vaccination.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function vaccinationRoutes(fastify: FastifyInstance) {
  // D-30: vaccination_records and deworming_records are clinic-scoped and only
  // isolated when reached via the tenant handle.
  const buildService = (db: TenantPrismaClient) =>
    new VaccinationService(new VaccinationRepository(db), db);

  const controller = new VaccinationController(buildService);

  const preHandler = [authenticate, tenantContext];

  // Vaccination records
  fastify.post('/pets/:petId/vaccinations', { preHandler, handler: controller.addVaccination });
  fastify.get('/pets/:petId/vaccinations', { preHandler, handler: controller.getVaccinationHistory });

  // Deworming records
  fastify.post('/pets/:petId/deworming', { preHandler, handler: controller.addDeworming });
  fastify.get('/pets/:petId/deworming', { preHandler, handler: controller.getDewormingHistory });

  // Preventive care status
  fastify.get('/pets/:petId/preventive-care', { preHandler, handler: controller.getPreventiveCareStatus });

  // Vaccination certificate
  fastify.get('/pets/:petId/vaccinations/:vaccinationId/certificate', { preHandler, handler: controller.getCertificateData });
}
