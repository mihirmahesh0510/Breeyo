/**
 * WHA-05 / D-20 — the WhatsApp module's single composition root: repositories,
 * services, the inbound router (with the REAL booking and reminder handlers
 * injected — no more no-op defaults), the two BullMQ queues, the two workers,
 * the reminder-sweep scheduler, the read/action routes, and the webhook
 * plugin, all in one place. Mirrors `vaccination.routes.ts`'s wiring shape.
 *
 * This file REPLACES the interim scaffolding plan 07-09 added directly to
 * `app.ts` (its own header comment called out this file as the eventual real
 * composition). Every collaborator below is constructed from `fastify.prisma`
 * (the admin-role client) — never `request.db` — matching every other
 * WhatsApp collaborator (`WhatsAppRepository`'s own header comment) and every
 * other Phase 3/4 module's route-plugin convention. Tenant isolation for this
 * module is the explicit `clinicId` parameter each repository/service method
 * takes, deliberately not FORCE RLS (07-RESEARCH § Pitfall 5: FORCE RLS
 * against the admin role returns zero rows, since the admin role is exactly
 * the role RLS is designed to bypass).
 */

import type { FastifyInstance } from 'fastify';
import { WhatsAppRepository } from './whatsapp.repository.js';
import { SendAuthorizationService } from './send-authorization.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { InboxService } from './inbox.service.js';
import { DeliveryStatusService } from './delivery-status.service.js';
import { InboundRouterService } from './inbound-router.service.js';
import { createWhatsAppQueues } from './whatsapp-queue.js';
import { createOutboundWorker } from './workers/outbound.worker.js';
import { createSimulatorWorker } from './workers/simulator.worker.js';
import { createWhatsAppController } from './whatsapp.controller.js';
import { BookingRepository } from './booking/booking.repository.js';
import { BookingService } from './booking/booking.service.js';
import { SlotService } from './booking/slot.service.js';
import { createBookingInboundHandler } from './booking/booking-inbound.handler.js';
import { ReminderSourceRepository } from './reminders/reminder-source.repository.js';
import { ReminderTaskRepository } from './reminders/reminder-task.repository.js';
import { ReminderTaskService, createReminderReplyHandler } from './reminders/reminder-task.service.js';
import { registerReminderSweep } from './reminders/reminder-sweep.job.js';
import whatsappWebhookRoutes from './whatsapp.webhook.routes.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';

export default async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  const isTest = process.env.NODE_ENV === 'test';

  // Fastify's plugin encapsulation means auth.routes.ts's/clinic.routes.ts's
  // own `fastify.decorate('permissionService', ...)` never reaches this
  // sibling plugin's scope, so `requirePermission`'s
  // `request.server.permissionService` read would otherwise be undefined
  // here. Decorate locally, matching clinic.routes.ts/inventory.routes.ts's
  // own copy of this exact pattern (inventory.routes.ts's own header comment
  // documents the same bug, found via live E2E testing).
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', new PermissionService(fastify.prisma, fastify.redis));
  }

  // ─── Repositories (fastify.prisma — the admin role; see file header) ─────
  const repository = new WhatsAppRepository(fastify.prisma);
  const bookingRepository = new BookingRepository(fastify.prisma);
  const reminderSourceRepository = new ReminderSourceRepository(fastify.prisma);
  const reminderTaskRepository = new ReminderTaskRepository(fastify.prisma);
  void reminderSourceRepository; // Consumed by the sweep job (07-11), not the route surface itself.

  // ─── Queues, closed on Fastify's onClose hook ─────────────────────────────
  const queues = createWhatsAppQueues(fastify.redis);
  fastify.addHook('onClose', async () => {
    await queues.close();
  });

  // ─── Services ──────────────────────────────────────────────────────────
  const authz = new SendAuthorizationService(repository);
  const whatsAppService = new WhatsAppService(
    repository,
    authz,
    fastify.prisma,
    queues.outbound,
    fastify.io ?? null,
  );
  const inboxService = new InboxService(fastify.prisma);
  const deliveryStatusService = new DeliveryStatusService(repository, fastify.prisma, fastify.io ?? null);

  const slotService = new SlotService(fastify.prisma);
  const bookingService = new BookingService({
    repository: bookingRepository,
    prisma: fastify.prisma,
    whatsAppService,
  });

  // The REAL BookingInboundHandler (07-10), replacing InboundRouterService's
  // no-op default.
  const bookingHandler = createBookingInboundHandler({
    prisma: fastify.prisma,
    repository,
    bookingService,
    slotService,
    outboundQueue: queues.outbound,
  });

  const reminderTaskService = new ReminderTaskService(reminderTaskRepository, repository, fastify.prisma);
  // The REAL ReminderReplyHandler (07-11), replacing InboundRouterService's
  // no-op default.
  const reminderHandler = createReminderReplyHandler({ taskService: reminderTaskService });

  const inboundRouter = new InboundRouterService({
    repository,
    prisma: fastify.prisma,
    deliveryStatusService,
    bookingHandler,
    reminderHandler,
  });

  // ─── Workers (self-guard on NODE_ENV === 'test', Pitfall 7) ───────────────
  const outboundWorker = createOutboundWorker({
    prisma: fastify.prisma,
    redis: fastify.redis,
    repository,
    deliveryStatusService,
    simulatorQueue: queues.simulator,
  });
  const simulatorWorker = createSimulatorWorker({
    prisma: fastify.prisma,
    redis: fastify.redis,
    deliveryStatusService,
    inboundRouter,
  });
  fastify.addHook('onClose', async () => {
    await outboundWorker?.close();
    await simulatorWorker?.close();
  });

  // ─── Reminder sweep scheduler (Pitfall 2: Redis-coordinated, once across
  // N ECS tasks) — registered only outside test, exactly like the existing
  // midnight-archive/expiry-cron/overdue-invoices precedents at app.ts. ──────
  if (!isTest) {
    await registerReminderSweep(queues.outbound);
  }

  // ─── Controller + routes ───────────────────────────────────────────────
  const controller = createWhatsAppController({ inboxService, whatsAppService });

  const preHandler = [authenticate, tenantContext];
  const sendPreHandler = [authenticate, tenantContext, requirePermission('SEND_WHATSAPP')];

  fastify.get('/whatsapp/threads', { preHandler, handler: controller.listThreadsHandler });
  fastify.get('/whatsapp/threads/:threadId', { preHandler, handler: controller.getThreadHandler });
  fastify.post('/whatsapp/send', { preHandler: sendPreHandler, handler: controller.sendTemplateHandler });
  fastify.post(
    '/whatsapp/messages/:messageId/retry',
    { preHandler: sendPreHandler, handler: controller.retryMessageHandler },
  );

  // ─── Webhook plugin (07-09) — encapsulated child registration so its
  // scoped raw-body content-type parser stays confined to the two webhook
  // routes and never leaks onto the routes registered above (see that
  // file's own header comment on why this must stay a separate plugin). ────
  await fastify.register(whatsappWebhookRoutes);

  fastify.log.info('WhatsApp routes registered');
}
