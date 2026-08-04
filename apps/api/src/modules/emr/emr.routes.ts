import type { FastifyInstance } from 'fastify';
import { EmrRepository } from './emr.repository.js';
import { EmrService } from './emr.service.js';
import { ConsultationLockService } from './consultation-lock.service.js';
import { DosageService } from './dosage.service.js';
import { createEmrController } from './emr.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function emrRoutes(fastify: FastifyInstance) {
  const repository = new EmrRepository(fastify.prisma);
  const lockService = new ConsultationLockService(fastify.prisma);
  const dosageService = new DosageService();
  const service = new EmrService(repository, lockService, dosageService);
  const controller = createEmrController(service, lockService);

  const preHandler = [authenticate, tenantContext];

  // Consultation lifecycle
  fastify.post('/consultations', { preHandler, handler: controller.createHandler });
  fastify.get('/consultations/:consultationId', { preHandler, handler: controller.getConsultationHandler });
  fastify.get('/consultations/:consultationId/draft', { preHandler, handler: controller.getDraftHandler });
  fastify.patch('/consultations/:consultationId/draft', { preHandler, handler: controller.saveDraftHandler });
  fastify.post('/consultations/:consultationId/finalize', { preHandler, handler: controller.finalizeHandler });
  fastify.post('/consultations/:consultationId/addendum', { preHandler, handler: controller.addAddendumHandler });

  // Lock management
  fastify.post('/consultations/:consultationId/heartbeat', { preHandler, handler: controller.heartbeatHandler });
  fastify.get('/consultations/:consultationId/lock', { preHandler, handler: controller.checkLockHandler });

  // Dosage validation
  fastify.post('/consultations/validate-dosage', { preHandler, handler: controller.validateDosageHandler });

  // Medical history timeline (EMR-04)
  fastify.get('/pets/:petId/history', { preHandler, handler: controller.getHistoryHandler });
}
