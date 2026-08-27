import type { FastifyRequest, FastifyReply } from 'fastify';
import type { InventoryWebService, InventoryWebTab } from './inventory-web.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { itemParamsSchema, webStockAdjustmentBodySchema } from './inventory.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

const VALID_TABS: InventoryWebTab[] = ['stock', 'reordering', 'analytics'];

/** D-32: any unrecognized/omitted `tab` query value falls back to the default Stock & Batches tab. */
function parseTab(raw: unknown): InventoryWebTab {
  if (typeof raw === 'string' && (VALID_TABS as string[]).includes(raw)) {
    return raw as InventoryWebTab;
  }
  return 'stock';
}

export interface InventoryWebControllerServices {
  inventoryWebService: InventoryWebService;
}

/**
 * HTTP surface for the browser inventory workbench (D-26, D-30 to D-37).
 * D-30: every handler resolves `this.buildServices(request.db)` first, so
 * each request gets services bound to its own tenant-scoped handle, matching
 * `InventoryController`'s convention in this same module.
 */
export class InventoryWebController {
  constructor(
    private readonly buildServices: (db: TenantPrismaClient) => InventoryWebControllerServices,
  ) {}

  /** GET /inventory/web/workbench?tab=stock|reordering|analytics */
  getWorkbench = async (request: FastifyRequest, reply: FastifyReply) => {
    const { inventoryWebService } = this.buildServices(request.db);
    const tab = parseTab((request.query as Record<string, unknown> | undefined)?.tab);

    const data = await inventoryWebService.getWorkbench(
      request.user.activeClinicId,
      request.user.id,
      tab,
    );

    return reply.status(200).send({ data });
  };

  /**
   * POST /inventory/web/items/:itemId/adjust-stock
   * D-18: `InventoryWebService.adjustStock` throws a 403 FORBIDDEN error
   * when the caller's role lacks `inventoryWriteEnabled` -- that propagates
   * to the global error handler unchanged, same as every other structured
   * domain error in this module (see `inventory-item.controller.ts`).
   */
  adjustStock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { inventoryWebService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = webStockAdjustmentBodySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const { expectedVersion, ...adjustInput } = body.data;
    const result = await inventoryWebService.adjustStock(
      request.user.activeClinicId,
      request.user.id,
      (request as unknown as { userName?: string }).userName ?? 'Unknown',
      params.data.itemId,
      adjustInput,
      expectedVersion,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/web/exports/analytics.csv -- D-36 */
  exportAnalyticsCsv = async (request: FastifyRequest, reply: FastifyReply) => {
    const { inventoryWebService } = this.buildServices(request.db);
    const csv = await inventoryWebService.exportAnalyticsCsv(request.user.activeClinicId);

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="inventory-analytics.csv"');
    return reply.status(200).send(csv);
  };

  /** GET /inventory/web/exports/analytics.pdf -- D-36 */
  exportAnalyticsPdf = async (request: FastifyRequest, reply: FastifyReply) => {
    const { inventoryWebService } = this.buildServices(request.db);
    const pdf = await inventoryWebService.exportAnalyticsPdf(request.user.activeClinicId);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="inventory-analytics.pdf"');
    return reply.status(200).send(pdf);
  };
}
