import type { FastifyInstance } from 'fastify';
import { NotificationService } from './notification.service.js';
import { createNotificationController } from './notification.controller.js';
import { createNotificationBus } from './notification-bus.js';
import { createNotificationWorker } from './notification.worker.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function notificationRoutes(fastify: FastifyInstance) {
  const service = new NotificationService(fastify.prisma);
  const controller = createNotificationController(service);

  // Initialize notification bus and worker
  const bus = createNotificationBus(fastify.redis);
  const worker = createNotificationWorker(fastify.redis, fastify.prisma);

  // Decorate the bus on fastify so other modules can use it
  if (!fastify.hasDecorator('notificationBus')) {
    fastify.decorate('notificationBus', bus);
  }

  // Clean up on close
  fastify.addHook('onClose', async () => {
    await worker.close();
    await bus.close();
  });

  // Device token routes (no tenant context needed - user-scoped)
  fastify.post('/notifications/device-token', {
    preHandler: [authenticate],
    handler: controller.registerDeviceTokenHandler,
  });

  fastify.delete('/notifications/device-token', {
    preHandler: [authenticate],
    handler: controller.removeDeviceTokenHandler,
  });

  // Notification routes (require tenant context for clinic isolation)
  fastify.get('/notifications', {
    preHandler: [authenticate, tenantContext],
    handler: controller.listNotificationsHandler,
  });

  fastify.get('/notifications/unread-count', {
    preHandler: [authenticate, tenantContext],
    handler: controller.getUnreadCountHandler,
  });

  fastify.patch('/notifications/:id/read', {
    preHandler: [authenticate, tenantContext],
    handler: controller.markReadHandler,
  });

  fastify.patch('/notifications/read-all', {
    preHandler: [authenticate, tenantContext],
    handler: controller.markAllReadHandler,
  });
}
