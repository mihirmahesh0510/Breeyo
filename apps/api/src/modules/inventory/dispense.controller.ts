import type { FastifyRequest, FastifyReply } from 'fastify';
import { dispenseSchema, stockAdjustmentSchema, stockTakeSchema } from '@breeyo/validators';
import type { FifoDispenseService } from './fifo-dispense.service.js';
import type { StockAdjustmentService } from './stock-adjustment.service.js';
import type { StockTakeService } from './stock-take.service.js';
import type { StockMovementService } from './stock-movement.service.js';
import type { ParLevelAlertService } from './par-level-alert.service.js';
import type { WantListService } from './want-list.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  itemParamsSchema,
  movementParamsSchema,
  movementQuerySchema,
  alertsQuerySchema,
} from './inventory.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export interface DispenseServices {
  fifoDispenseService: FifoDispenseService;
  stockAdjustmentService: StockAdjustmentService;
  stockTakeService: StockTakeService;
  stockMovementService: StockMovementService;
  parLevelAlertService: ParLevelAlertService;
  wantListService: WantListService;
}

/**
 * D-30: every handler resolves `this.buildServices(request.db)` as its first
 * statement, so each request gets services bound to its own tenant-scoped
 * handle. See `dispense.routes.ts`.
 */
export class DispenseController {
  constructor(
    private readonly buildServices: (db: TenantPrismaClient) => DispenseServices,
  ) {}

  /** POST /inventory/items/:itemId/dispense -- D-22 FIFO dispense with override, D-60 unitPrice/ownerId */
  dispense = async (request: FastifyRequest, reply: FastifyReply) => {
    const { fifoDispenseService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = dispenseSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await fifoDispenseService.dispense(
      request.user.activeClinicId,
      params.data.itemId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
      body.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** POST /inventory/movements/:movementId/return -- D-51/D-57 return-to-stock */
  returnToStock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { fifoDispenseService } = this.buildServices(request.db);
    const params = movementParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const result = await fifoDispenseService.returnToStock(
      request.user.activeClinicId,
      params.data.movementId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
    );

    return reply.status(200).send({ data: result });
  };

  /** POST /inventory/items/:itemId/adjust -- D-04 required-reason stock adjustment */
  adjustStock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { stockAdjustmentService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = stockAdjustmentSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await stockAdjustmentService.adjust(
      request.user.activeClinicId,
      params.data.itemId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
      body.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** POST /inventory/stock-take -- D-37/D-40 discrepancy calculation + summary */
  processStockTake = async (request: FastifyRequest, reply: FastifyReply) => {
    const { stockTakeService } = this.buildServices(request.db);
    const body = stockTakeSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await stockTakeService.processStockTake(
      request.user.activeClinicId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
      body.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/items/:itemId/movements -- D-46 chronological timeline, paginated */
  getMovementHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { stockMovementService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const query = movementQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const result = await stockMovementService.getHistory(
      request.user.activeClinicId,
      params.data.itemId,
      query.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/items/:itemId/movements/export -- D-47 CSV export data */
  getMovementsForExport = async (request: FastifyRequest, reply: FastifyReply) => {
    const { stockMovementService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const result = await stockMovementService.getMovementsForExport(
      request.user.activeClinicId,
      params.data.itemId,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/alerts -- D-21/D-26 combined Attention card data */
  getAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
    const { parLevelAlertService } = this.buildServices(request.db);
    const query = alertsQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const clinicId = request.user.activeClinicId;
    const leadDays = query.data.leadDays ?? 30;

    const [lowStock, expiringSoon, expired, counts] = await Promise.all([
      parLevelAlertService.getLowStockItems(clinicId),
      parLevelAlertService.getExpiringSoonItems(clinicId, leadDays),
      parLevelAlertService.getExpiredItems(clinicId),
      parLevelAlertService.getAlertCounts(clinicId, leadDays),
    ]);

    return reply.status(200).send({ data: { lowStock, expiringSoon, expired, counts } });
  };

  /** GET /inventory/want-list -- D-06/D-24 items below par, biggest deficit first */
  getWantList = async (request: FastifyRequest, reply: FastifyReply) => {
    const { wantListService } = this.buildServices(request.db);
    const result = await wantListService.getWantList(request.user.activeClinicId);
    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/want-list/text -- D-28 WhatsApp-ready plain text */
  getWantListText = async (request: FastifyRequest, reply: FastifyReply) => {
    const { wantListService } = this.buildServices(request.db);
    const text = await wantListService.getWantListWhatsAppText(request.user.activeClinicId);
    return reply.status(200).send({ data: { text } });
  };
}
