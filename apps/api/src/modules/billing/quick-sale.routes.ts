import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { PermissionService } from '../auth/permission.service.js';
import { StockMovementService } from '../inventory/stock-movement.service.js';
import { InvoiceRepository } from './invoice.repository.js';
import { StockValidatorService } from './stock-validator.service.js';
import { QuickSaleService } from './quick-sale.service.js';
import { createQuickSaleController } from './quick-sale.controller.js';

/**
 * D-04 Quick Sale route plugin.
 *
 * A file of its own rather than an addition to `billing.routes.ts`, so this
 * plan's file ownership stays disjoint from the plan editing that file in
 * parallel. Paths carry no version prefix — `app.ts` applies it at registration.
 *
 * ## Gated, unlike the D-03 hook
 *
 * Quick Sale is a user-initiated invoice creation performed by whoever is
 * standing at the counter, so it sits behind `CREATE_INVOICES` exactly as the
 * rest of the D-01/D-06 builder does. That is the opposite of the D-03
 * End-Consultation path, which is server-initiated on a Clinician's behalf and
 * therefore has no HTTP surface and no permission check at all. The two are not
 * interchangeable: gating the hook would break D-03, and un-gating this would
 * break D-05.
 */
export default async function quickSaleRoutes(fastify: FastifyInstance) {
  /**
   * D-30: built per request from the tenant handle, never a plugin-scope
   * singleton. The stock validator is shared with the repository so the
   * deduction and the invoice writes observe the same instance, matching how
   * `billing.routes.ts` assembles the invoice service.
   */
  const buildQuickSaleService = (db: TenantPrismaClient) => {
    const stockValidator = new StockValidatorService(db, new StockMovementService(db));
    return new QuickSaleService(new InvoiceRepository(db, stockValidator), stockValidator, db);
  };

  const controller = createQuickSaleController(buildQuickSaleService);

  // `requirePermission` reads `request.server.permissionService`, and Fastify's
  // plugin encapsulation means a sibling plugin's decoration never reaches this
  // scope — without this every request here 500s on an undefined service. Same
  // fix as `billing.routes.ts`, `inventory.routes.ts` and `clinic.routes.ts`.
  //
  // Admin client by design (D-30 exemption): permission resolution runs during
  // `authenticate`, before `tenantContext` creates `request.db`, and reads the
  // global reference tables that establish the tenant in the first place.
  const permissionService = new PermissionService(fastify.prisma, fastify.redis); // D-30 exemption
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  fastify.post('/billing/quick-sale', {
    preHandler: [authenticate, tenantContext, requirePermission('CREATE_INVOICES')],
    handler: controller.createHandler,
  });
}
