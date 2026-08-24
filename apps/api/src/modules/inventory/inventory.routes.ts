import type { FastifyInstance } from 'fastify';
import { InventoryItemRepository } from './inventory-item.repository.js';
import { InventoryItemService } from './inventory-item.service.js';
import { StockReceiptService } from './stock-receipt.service.js';
import { BarcodeLookupService } from './barcode-lookup.service.js';
import { InventoryController } from './inventory-item.controller.js';
import { StockMovementService } from './stock-movement.service.js';
import { ParLevelAlertService } from './par-level-alert.service.js';
import { WantListService } from './want-list.service.js';
import { StockAdjustmentService } from './stock-adjustment.service.js';
import { InventoryWebService } from './inventory-web.service.js';
import { InventoryWebController } from './inventory-web.controller.js';
import { AccessPolicyService } from '../web-dashboard/access-policy.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requireInventoryPermission } from './middleware/inventory-permissions.middleware.js';
import { requireBrowserModuleAccess } from '../web-dashboard/browser-access.middleware.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

export default async function inventoryRoutes(fastify: FastifyInstance) {
  // D-30: every service is built per request from `request.db`, the
  // tenant-scoped handle `tenantContext` installs, rather than once at plugin
  // scope from the breeyo_admin client, which bypasses RLS by design. Phase 5
  // landed this module after plan 06-20 was written, so it was on the admin
  // client with its six RLS policies (added by 06-00) unreachable. Same factory
  // shape as patient.routes.ts; every route below carries `tenantContext`, so
  // `request.db` is always present.
  const buildServices = (db: TenantPrismaClient) => {
    const repository = new InventoryItemRepository(db);
    return {
      service: new InventoryItemService(repository),
      stockReceiptService: new StockReceiptService(db),
      barcodeLookupService: new BarcodeLookupService(repository),
    };
  };

  const controller = new InventoryController(buildServices);

  // Plan 09-03: the browser inventory workbench (D-26, D-30 to D-37). Its own
  // factory, built alongside `buildServices` above rather than folded into
  // it, since none of these services are used by the mobile-facing handlers.
  const buildWebServices = (db: TenantPrismaClient) => {
    const stockMovementService = new StockMovementService(db);
    const parLevelAlertService = new ParLevelAlertService(db);
    return {
      inventoryWebService: new InventoryWebService(
        db,
        new AccessPolicyService(db),
        parLevelAlertService,
        new WantListService(parLevelAlertService, db),
        new StockAdjustmentService(db, stockMovementService),
      ),
    };
  };

  const webController = new InventoryWebController(buildWebServices);

  // Fastify's plugin encapsulation means auth.routes.ts's own
  // `fastify.decorate('permissionService', ...)` never reaches this sibling
  // plugin's scope, so `requireInventoryPermission`'s `request.server.permissionService`
  // read was always undefined here. Decorate locally, matching clinic.routes.ts's
  // real working pattern (bug found via live E2E testing, not caught by unit tests
  // since those mock the permission check itself).
  //
  // Admin client by design: runs before tenantContext (D-30 exemption) — the
  // permission check executes during `authenticate` and reads the global
  // reference tables 06-00 deliberately left without RLS policies.
  if (!fastify.hasDecorator('permissionService')) {
    // D-30 exemption
    fastify.decorate(
      'permissionService',
      new PermissionService(fastify.prisma, fastify.redis), // D-30 exemption
    );
  }

  const base = [authenticate, tenantContext];
  const viewInventory = [...base, requireInventoryPermission('viewInventory')];
  const manageStock = [...base, requireInventoryPermission('manageStock')];

  // Item CRUD (INV-01, INV-03)
  fastify.post('/inventory/items', { preHandler: manageStock, handler: controller.createItem });
  fastify.get('/inventory/items', { preHandler: viewInventory, handler: controller.listItems });
  fastify.get('/inventory/items/summary', { preHandler: viewInventory, handler: controller.getSummary });

  // Category/unit lists — predefined + clinic-custom merged (D-61)
  fastify.get('/inventory/categories', { preHandler: viewInventory, handler: controller.getCategories });
  fastify.get('/inventory/units', { preHandler: viewInventory, handler: controller.getUnits });

  fastify.get('/inventory/items/:itemId', { preHandler: viewInventory, handler: controller.getItem });
  fastify.patch('/inventory/items/:itemId', { preHandler: manageStock, handler: controller.updateItem });

  // Barcodes (D-16, D-63)
  fastify.post('/inventory/items/:itemId/barcodes', { preHandler: manageStock, handler: controller.addBarcode });
  fastify.delete('/inventory/barcodes/:barcodeId', { preHandler: manageStock, handler: controller.removeBarcode });

  // Stock receipt (D-11, D-27)
  fastify.post('/inventory/items/:itemId/receive', { preHandler: manageStock, handler: controller.receiveStock });

  // Item photo upload (D-64)
  fastify.post('/inventory/items/:itemId/photo-upload-url', { preHandler: manageStock, handler: controller.getPhotoUploadUrl });

  // Barcode lookup + offline catalog sync (INV-04, D-19)
  fastify.get('/inventory/barcode-lookup', { preHandler: viewInventory, handler: controller.lookupBarcode });
  fastify.get('/inventory/barcode-catalog', { preHandler: viewInventory, handler: controller.getBarcodeCatalog });

  // Browser inventory workbench (Plan 09-03, D-26, D-30 to D-37). Read
  // endpoints share the same `viewInventory` gate as the rest of this
  // module; `adjust-stock` additionally enforces the D-18 browser-specific
  // `inventoryWriteEnabled` check inside `InventoryWebService.adjustStock`
  // on top of the existing `manageStock` RBAC gate below -- Front Desk keeps
  // `manageStock` for mobile, but D-18 requires browser inventory to stay
  // view-only for that same role unless an Admin separately grants it.
  const webViewInventory = [...viewInventory, requireBrowserModuleAccess('INVENTORY')];
  const webManageStock = [...manageStock, requireBrowserModuleAccess('INVENTORY')];

  fastify.get('/inventory/web/workbench', { preHandler: webViewInventory, handler: webController.getWorkbench });
  fastify.post('/inventory/web/items/:itemId/adjust-stock', { preHandler: webManageStock, handler: webController.adjustStock });
  fastify.get('/inventory/web/exports/analytics.csv', { preHandler: webViewInventory, handler: webController.exportAnalyticsCsv });
  fastify.get('/inventory/web/exports/analytics.pdf', { preHandler: webViewInventory, handler: webController.exportAnalyticsPdf });
}
