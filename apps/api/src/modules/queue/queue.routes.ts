import type { FastifyInstance } from 'fastify';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { createQueueController } from './queue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { PushTriggerService } from '../scheduling/push-trigger.service.js';

export default async function queueRoutes(fastify: FastifyInstance) {
  // D-27 trigger 3 (queue-backlog push) fix: `fastify.notificationBus`
  // (decorated by `notification.routes.ts`) is not reachable here -- Fastify's
  // plugin encapsulation scopes a bare `fastify.decorate(...)` call to that
  // plugin's own child context, never to a sibling top-level
  // `app.register(...)` call. Same wall `scheduling.routes.ts` and
  // `whatsapp.routes.ts` already hit for their own `PushTriggerService`
  // wiring, resolved the same way: construct a fresh, cheap `NotificationBus`
  // (a thin BullMQ producer wrapper, no state to duplicate) at plugin scope
  // rather than depending on a decoration plugin isolation makes unreachable.
  // `PushTriggerService` itself is built from the admin-scoped `fastify.prisma`
  // (matching `scheduling.routes.ts`'s own construction) -- it only resolves
  // clinic staff recipients by an explicit `clinicId` filter, so it needs no
  // per-request tenant scoping, and stays a plugin-scope singleton just like
  // `fastify.io` below.
  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });
  const pushTriggers = new PushTriggerService(notificationBus, fastify.prisma, fastify.redis);

  // D-30: per-request construction from the tenant-scoped handle. `fastify.io`
  // stays a plugin-scope singleton -- the Socket.IO server is transport, not
  // tenant data, and must not be rebuilt per request. `pushTriggers` is a
  // plugin-scope singleton for the same reason.
  const buildService = (db: TenantPrismaClient) =>
    new QueueService(new QueueRepository(db), fastify.io, pushTriggers);

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
