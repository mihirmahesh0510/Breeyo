import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { StockMovementService } from './stock-movement.service.js';
import { FifoDispenseService } from './fifo-dispense.service.js';
import { StockAdjustmentService } from './stock-adjustment.service.js';
import { StockTakeService } from './stock-take.service.js';
import { StockReceiptService } from './stock-receipt.service.js';
import { ParLevelAlertService } from './par-level-alert.service.js';
import { WantListService } from './want-list.service.js';
import { DispenseController } from './dispense.controller.js';
import { SyncOperationService } from './sync-operation.service.js';
import { createInventorySyncController, buildInventoryOfflineReplayService } from './controllers/inventorySync.controller.js';
import { ReplayBroadcastService } from '../sync/services/replayBroadcast.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requireInventoryPermission } from './middleware/inventory-permissions.middleware.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function dispenseRoutes(fastify: FastifyInstance) {
  // D-30: every service is built per request from `request.db`, the
  // tenant-scoped handle `tenantContext` installs, rather than once at plugin
  // scope from the breeyo_admin client, which bypasses RLS by design. Phase 5
  // landed this module after plan 06-20 was written, so it was on the admin
  // client with its six RLS policies (added by 06-00) unreachable. Every route
  // below carries `tenantContext`, so `request.db` is always present.
  const buildServices = (db: TenantPrismaClient) => {
    // One StockMovementService and one ParLevelAlertService per request, shared
    // by their dependents exactly as the previous plugin-scope wiring did.
    const stockMovementService = new StockMovementService(db);
    const parLevelAlertService = new ParLevelAlertService(db);
    return {
      stockMovementService,
      parLevelAlertService,
      fifoDispenseService: new FifoDispenseService(db, stockMovementService),
      stockAdjustmentService: new StockAdjustmentService(db, stockMovementService),
      stockTakeService: new StockTakeService(db, stockMovementService),
      stockReceiptService: new StockReceiptService(db),
      wantListService: new WantListService(parLevelAlertService, db),
    };
  };

  const controller = new DispenseController(buildServices);

  // D-53: generic sync dispatcher's own PermissionService instance, built
  // directly from the admin client and the Redis handle.
  //
  // CORRECTED (found via live E2E testing): the comment this replaced claimed
  // building the instance locally was sufficient instead of decorating it --
  // it wasn't. `requireInventoryPermission` (used as a preHandler on every
  // route below) reads `request.server.permissionService` regardless of which
  // file registers the route, so without decorating it here, every dispense/
  // adjust/stock-take/alert/want-list request 500'd with "Cannot read
  // properties of undefined (reading 'getUserPermissions')". Fastify's plugin
  // encapsulation means auth.routes.ts's own decoration never reaches this
  // sibling plugin's scope -- decorate locally, matching inventory.routes.ts
  // and clinic.routes.ts's real working pattern.
  //
  // Admin client by design: runs before tenantContext (D-30 exemption) --
  // permission resolution executes during `authenticate`, before `request.db`
  // exists, and reads the global reference tables (`users`, `roles`,
  // `permissions`, `clinic_member_roles`) that plan 06-00 deliberately left
  // without RLS policies because they are what *establishes* the tenant.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  // Plan 10-04 (PLT-03, D-04, D-10): inventory-specific offline replay
  // reconciliation. Deliberately its own controller/service, distinct from
  // the pre-existing `SyncOperationService`/`/inventory/sync-operation`
  // dispatcher below (Phase 5, D-53, Redis-idempotency-keyed, no `return`
  // operation type) -- this one replays `INVENTORY_MEDIUM` envelopes through
  // the SAME shared `SyncReplayReceipt`/`SyncConflictRecord` ledger Plan
  // 10-01/10-02/10-03 use, matching this phase's cross-domain replay
  // contract rather than Phase 5's own bespoke one. Both endpoints stay live
  // side by side -- neither replaces the other in this plan.
  // Verify-fix 10.3: plugin-scope singleton, same `fastify.io` convention
  // `queue.routes.ts`/`emr.routes.ts` use -- a mobile inventory replay now
  // actually pushes to an open browser inventory view.
  const replayBroadcast = new ReplayBroadcastService(fastify.io ?? null);
  const inventorySyncController = createInventorySyncController((db) =>
    buildInventoryOfflineReplayService(db, permissionService, replayBroadcast),
  );

  // D-30: the sync dispatcher wraps three tenant-scoped services, so it is
  // built per request too. `permissionService` and `redis` are tenant-agnostic
  // and stay plugin-scope singletons closed over by the factory.
  const buildSyncOperationService = (db: TenantPrismaClient) => {
    const { fifoDispenseService, stockAdjustmentService, stockReceiptService } =
      buildServices(db);
    return new SyncOperationService(
      fifoDispenseService,
      stockAdjustmentService,
      stockReceiptService,
      permissionService,
      fastify.redis,
    );
  };

  const base = [authenticate, tenantContext];
  const dispense = [...base, requireInventoryPermission('dispense')];
  const manageStock = [...base, requireInventoryPermission('manageStock')];
  const viewInventory = [...base, requireInventoryPermission('viewInventory')];
  const exportData = [...base, requireInventoryPermission('exportData')];

  // FIFO dispense + return-to-stock (D-22, D-25, D-51, D-57, D-60)
  fastify.post('/inventory/items/:itemId/dispense', { preHandler: dispense, handler: controller.dispense });
  fastify.post('/inventory/movements/:movementId/return', { preHandler: dispense, handler: controller.returnToStock });

  // Stock adjustment + stock-take (D-04, D-37, D-40)
  fastify.post('/inventory/items/:itemId/adjust', { preHandler: manageStock, handler: controller.adjustStock });
  fastify.post('/inventory/stock-take', { preHandler: manageStock, handler: controller.processStockTake });

  // Plan 10-04: mobile offline inventory replay on reconnect (INVENTORY_MEDIUM
  // tier only). Only `base` (authenticate + tenantContext) runs as a
  // preHandler -- like `/inventory/sync-operation` below, the permission
  // requirement varies per replayed operation's entityType, which a
  // route-level preHandler can't inspect. `InventoryOfflineReplayService`
  // now enforces it per-entityType itself (matching
  // `SyncOperationService.execute()`'s D-41-D-44 pattern), since none of
  // `fifo-dispense.service.ts`, `stock-adjustment.service.ts`, or
  // `stock-receipt.service.ts` reference `PermissionService` at all.
  fastify.post('/inventory/sync/replay', {
    preHandler: base,
    handler: inventorySyncController.replayHandler,
  });

  // Stock movement history + CSV export (D-45, D-46, D-47)
  fastify.get('/inventory/items/:itemId/movements', { preHandler: viewInventory, handler: controller.getMovementHistory });
  fastify.get('/inventory/items/:itemId/movements/export', { preHandler: exportData, handler: controller.getMovementsForExport });

  // Par-level alerts + want-list (D-06, D-21, D-24, D-26, D-28)
  fastify.get('/inventory/alerts', { preHandler: viewInventory, handler: controller.getAlerts });
  fastify.get('/inventory/want-list', { preHandler: viewInventory, handler: controller.getWantList });
  fastify.get('/inventory/want-list/text', { preHandler: viewInventory, handler: controller.getWantListText });

  // D-53: generic sync dispatcher for the mobile offline queue (Plan 05-05) --
  // replays a queued receipt/dispense/adjustment through this one endpoint.
  // Only `base` (authenticate + tenantContext) runs as a preHandler -- the
  // permission check varies by the body's operationType, which Fastify's
  // route-level preHandler can't inspect, so SyncOperationService.execute()
  // enforces it per-request instead (see sync-operation.service.ts).
  fastify.post('/inventory/sync-operation', {
    preHandler: base,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const syncOperationService = buildSyncOperationService(request.db);
      const result = await syncOperationService.execute(
        request.user.activeClinicId,
        request.user.id,
        (request as any).userName ?? 'Unknown',
        request.body,
      );
      return reply.status(200).send({ data: result });
    },
  });
}
