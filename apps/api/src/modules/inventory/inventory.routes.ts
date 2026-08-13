import type { FastifyInstance } from 'fastify';
import { InventoryItemRepository } from './inventory-item.repository.js';
import { InventoryItemService } from './inventory-item.service.js';
import { StockReceiptService } from './stock-receipt.service.js';
import { BarcodeLookupService } from './barcode-lookup.service.js';
import { InventoryController } from './inventory-item.controller.js';
import { PermissionService } from '../auth/permission.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requireInventoryPermission } from './middleware/inventory-permissions.middleware.js';

export default async function inventoryRoutes(fastify: FastifyInstance) {
  const repository = new InventoryItemRepository(fastify.prisma);
  const service = new InventoryItemService(repository);
  const stockReceiptService = new StockReceiptService(fastify.prisma);
  const barcodeLookupService = new BarcodeLookupService(repository);
  const controller = new InventoryController(service, stockReceiptService, barcodeLookupService);

  // Fastify's plugin encapsulation means auth.routes.ts's own
  // `fastify.decorate('permissionService', ...)` never reaches this sibling
  // plugin's scope, so `requireInventoryPermission`'s `request.server.permissionService`
  // read was always undefined here. Decorate locally, matching clinic.routes.ts's
  // real working pattern (bug found via live E2E testing, not caught by unit tests
  // since those mock the permission check itself).
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', new PermissionService(fastify.prisma, fastify.redis));
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
}
