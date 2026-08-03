import type { FastifyInstance } from 'fastify';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { createQueueController } from './queue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function queueRoutes(fastify: FastifyInstance) {
  const repository = new QueueRepository(fastify.prisma);
  const service = new QueueService(repository, fastify.io);
  const controller = createQueueController(service);

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
}
