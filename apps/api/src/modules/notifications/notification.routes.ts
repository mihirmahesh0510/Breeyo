import type { FastifyInstance } from 'fastify';
import { NotificationService } from './notification.service.js';
import { createNotificationController } from './notification.controller.js';
import { createNotificationBus } from './notification-bus.js';
import { createNotificationWorker } from './notification.worker.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // D-30: the four clinic-scoped handlers build their service per request from
  // `request.db`, the tenant-scoped handle `tenantContext` installs, rather than
  // once at plugin scope from the breeyo_admin client, which bypasses RLS by
  // design. Same factory shape as patient.routes.ts.
  const buildService = (db: TenantPrismaClient) => new NotificationService(db);

  // Admin client by design: BullMQ worker has no request context, and
  // `device_tokens` is user-scoped with no clinic_id column and no RLS policy,
  // so its two routes carry `authenticate` without `tenantContext` and never
  // have a `request.db`. Both derive tenancy from data they already hold — the
  // worker from its durable job payload's clinicId, device tokens from the
  // authenticated userId. (D-30 exemption)
  const adminDb = fastify.prisma; // D-30 exemption

  const deviceTokenService = new NotificationService(adminDb);
  const controller = createNotificationController(buildService, deviceTokenService);

  // Initialize notification bus and worker
  const bus = createNotificationBus(fastify.redis);
  const worker = createNotificationWorker(fastify.redis, adminDb);

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
