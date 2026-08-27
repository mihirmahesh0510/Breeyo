import type { FastifyInstance } from 'fastify';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { createQueueController } from './queue.controller.js';
import { WebQueueService } from './web-queue.service.js';
import { createWebQueueController } from './web-queue.controller.js';
import { createQueueSyncController, buildQueueOfflineReplayService } from './controllers/queueSync.controller.js';
import { BrowserSyncService } from '../../realtime/browser-sync.service.js';
import { ReplayBroadcastService } from '../sync/services/replayBroadcast.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requireBrowserModuleAccess } from '../web-dashboard/browser-access.middleware.js';
import { requirePermission } from '../../middleware/authorize.js';
import { PermissionService } from '../auth/permission.service.js';
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
  // D-30 exemption: `PushTriggerService` itself is built from the admin-scoped
  // `fastify.prisma` (matching `scheduling.routes.ts`'s own construction) -- it only resolves
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

  // Plan 10-02 (PLT-03, D-01 to D-03, D-12 to D-14, D-34): queue-specific
  // offline replay reconciliation. Deliberately its own controller/service
  // rather than folded into `controller` above -- `QueueOfflineReplayService`
  // applies replayed mobile envelopes (idempotent via the shared
  // `SyncReplayReceipt` ledger from Plan 10-01), not live authenticated
  // requests, so it needs its own request/response shape.
  //
  // Verify-fix 10.3: `fastify.io` is shared as the same plugin-scope
  // singleton `BrowserSyncService` already uses below -- a mobile replay
  // through this endpoint now actually pushes to an open browser queue
  // board instead of `ReplayBroadcastService` sitting unreached.
  const replayBroadcast = new ReplayBroadcastService(fastify.io);
  const queueSyncController = createQueueSyncController((db) => buildQueueOfflineReplayService(db, replayBroadcast));

  // Plan 09-04: the browser queue workbench (D-07, D-40, D-41, D-43). Shares
  // `fastify.io` as its realtime transport with `QueueService` above
  // (`BrowserSyncService` publishes on its own browser-only channel,
  // `socket.events.ts`, not `SOCKET_EVENTS`), and wraps a fresh
  // `QueueService` per request from the same tenant-scoped handle (D-30) --
  // it does not reach across requests for the one `buildService` closure
  // above, keeping this plugin-scope block free of any shared mutable state
  // beyond the two intentional singletons it already had.
  const browserSyncService = new BrowserSyncService(fastify.io);
  const buildWebQueueService = (db: TenantPrismaClient) =>
    new WebQueueService(db, new QueueService(new QueueRepository(db), fastify.io, pushTriggers), browserSyncService);
  const webQueueController = createWebQueueController(buildWebQueueService);

  const preHandler = [authenticate, tenantContext];

  // `auth.routes.ts`'s `fastify.decorate('permissionService', ...)` never
  // reaches this sibling `app.register(...)` call — same plugin-encapsulation
  // wall billing/inventory/whatsapp/scheduling/clinic routes each hit and
  // resolved the same way: re-decorate locally, guarded against clobbering.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // E2E-BUG-FIX-PLAN.md §3.6: board read requires VIEW_QUEUE; every
  // mutation (including call-next, which advances queue state) requires
  // MANAGE_QUEUE.
  const viewHandler = [authenticate, tenantContext, requirePermission('VIEW_QUEUE')];
  const manageHandler = [authenticate, tenantContext, requirePermission('MANAGE_QUEUE')];

  // Get queue board (QUE-03)
  fastify.get('/queue', {
    preHandler: viewHandler,
    handler: controller.getQueueBoardHandler,
  });

  // Check in a patient (QUE-01)
  fastify.post('/queue/check-in', {
    preHandler: manageHandler,
    handler: controller.checkInHandler,
  });

  // Update queue entry status (QUE-04)
  fastify.patch('/queue/:entryId/status', {
    preHandler: manageHandler,
    handler: controller.updateStatusHandler,
  });

  // Call next patient (QUE-05)
  fastify.post('/queue/call-next', {
    preHandler: manageHandler,
    handler: controller.callNextHandler,
  });

  // Archive entries from before today (D-23)
  fastify.post('/queue/archive', {
    preHandler: manageHandler,
    handler: controller.archiveEntriesHandler,
  });

  // Plan 10-02: mobile offline queue replay on reconnect. Queue-first
  // (D-12): this is the ONE endpoint every offline queue mutation (check-in,
  // status transition, no-show, call-next) replays through, never shared
  // with lower-tier (clinical/inventory/ancillary) replay traffic.
  fastify.post('/queue/sync/replay', {
    preHandler,
    handler: queueSyncController.replayHandler,
  });

  // Plan 09-04: browser queue workbench. Registered after the fixed
  // `/queue/archive` path but before nothing that could shadow it -- neither
  // segment is parametric, so Fastify's radix router cannot confuse them.
  const webQueuePreHandler = [...preHandler, requireBrowserModuleAccess('QUEUE')];

  fastify.get('/queue/web/board', {
    preHandler: webQueuePreHandler,
    handler: webQueueController.getBoardHandler,
  });
  fastify.post('/queue/web/entries/:queueEntryId/status', {
    preHandler: webQueuePreHandler,
    handler: webQueueController.updateEntryStatusHandler,
  });
}
