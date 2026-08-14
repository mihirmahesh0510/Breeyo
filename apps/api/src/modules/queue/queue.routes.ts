import type { FastifyInstance } from 'fastify';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { createQueueController } from './queue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function queueRoutes(fastify: FastifyInstance) {
  // D-30: per-request construction from the tenant-scoped handle. `fastify.io`
  // stays a plugin-scope singleton -- the Socket.IO server is transport, not
  // tenant data, and must not be rebuilt per request.
  const buildService = (db: TenantPrismaClient) =>
    new QueueService(new QueueRepository(db), fastify.io);

  const controller = createQueueController(buildService);

  const preHandler = [authenticate, tenantContext];

  // Get queue board (QUE-03)
  fastify.get('/queue', {
    preHandler,
    handler: controller.getQueueBoardHandler,
  });

  // Check in a patient (QUE-01)
  fastify.post('/queue/check-in', {
    preHandler,
    handler: controller.checkInHandler,
  });

  // Update queue entry status (QUE-04)
  fastify.patch('/queue/:entryId/status', {
    preHandler,
    handler: controller.updateStatusHandler,
  });

  // Call next patient (QUE-05)
  fastify.post('/queue/call-next', {
    preHandler,
    handler: controller.callNextHandler,
  });

  // Archive entries from before today (D-23)
  fastify.post('/queue/archive', {
    preHandler,
    handler: controller.archiveEntriesHandler,
  });
}
