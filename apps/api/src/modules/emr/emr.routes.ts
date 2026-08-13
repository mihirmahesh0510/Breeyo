import type { FastifyInstance } from 'fastify';
import { EmrRepository } from './emr.repository.js';
import { EmrService } from './emr.service.js';
import { ConsultationLockService } from './consultation-lock.service.js';
import { DosageService } from './dosage.service.js';
import { createEmrController } from './emr.controller.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function emrRoutes(fastify: FastifyInstance) {
  // Stateless and I/O-free -- pure dosage arithmetic, no tenant dimension.
  // Stays a plugin-scope singleton.
  const dosageService = new DosageService();

  // D-72: bus for lock takeover push notifications (same BullMQ queue/worker
  // pattern already used by the notifications module). A BullMQ producer, not
  // tenant data, so it stays plugin-scope with its teardown hook intact.
  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });

  // D-30: everything that touches clinic rows is built per request from the
  // tenant-scoped handle. `lockService` is constructed once per request and
  // shared with `EmrService` so both observe the same lock state.
  const buildServices = (db: TenantPrismaClient) => {
    const lockService = new ConsultationLockService(db);
    const emrService = new EmrService(
      new EmrRepository(db),
      lockService,
      dosageService,
      db,
    );
    return { emrService, lockService };
  };

  const controller = createEmrController(buildServices, notificationBus);

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
  fastify.post('/consultations/:consultationId/lock', { preHandler, handler: controller.acquireLockHandler });
  fastify.delete('/consultations/:consultationId/lock', { preHandler, handler: controller.releaseLockHandler });

  // Dosage validation
  fastify.post('/consultations/validate-dosage', { preHandler, handler: controller.validateDosageHandler });

  // Medical history timeline (EMR-04)
  fastify.get('/pets/:petId/history', { preHandler, handler: controller.getHistoryHandler });
}
