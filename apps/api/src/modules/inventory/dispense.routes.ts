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
  // directly from fastify.prisma/fastify.redis.
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
  const permissionService = new PermissionService(fastify.prisma, fastify.redis);
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

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
