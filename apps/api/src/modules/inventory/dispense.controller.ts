import type { FastifyRequest, FastifyReply } from 'fastify';
import { dispenseSchema, stockAdjustmentSchema, stockTakeSchema } from '@breeyo/validators';
import type { FifoDispenseService } from './fifo-dispense.service.js';
import type { StockAdjustmentService } from './stock-adjustment.service.js';
import type { StockTakeService } from './stock-take.service.js';
import type { StockMovementService } from './stock-movement.service.js';
import type { ParLevelAlertService } from './par-level-alert.service.js';
import type { WantListService } from './want-list.service.js';
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

export class DispenseController {
  constructor(
    private readonly fifoDispenseService: FifoDispenseService,
    private readonly stockAdjustmentService: StockAdjustmentService,
    private readonly stockTakeService: StockTakeService,
    private readonly stockMovementService: StockMovementService,
    private readonly parLevelAlertService: ParLevelAlertService,
    private readonly wantListService: WantListService,
  ) {}

  /** POST /inventory/items/:itemId/dispense -- D-22 FIFO dispense with override, D-60 unitPrice/ownerId */
  dispense = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = dispenseSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await this.fifoDispenseService.dispense(
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
    const params = movementParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const result = await this.fifoDispenseService.returnToStock(
      request.user.activeClinicId,
      params.data.movementId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
    );

    return reply.status(200).send({ data: result });
  };

  /** POST /inventory/items/:itemId/adjust -- D-04 required-reason stock adjustment */
  adjustStock = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = stockAdjustmentSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await this.stockAdjustmentService.adjust(
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
    const body = stockTakeSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await this.stockTakeService.processStockTake(
      request.user.activeClinicId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
      body.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/items/:itemId/movements -- D-46 chronological timeline, paginated */
  getMovementHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const query = movementQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const result = await this.stockMovementService.getHistory(
      request.user.activeClinicId,
      params.data.itemId,
      query.data,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/items/:itemId/movements/export -- D-47 CSV export data */
  getMovementsForExport = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const result = await this.stockMovementService.getMovementsForExport(
      request.user.activeClinicId,
      params.data.itemId,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/alerts -- D-21/D-26 combined Attention card data */
  getAlerts = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = alertsQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const clinicId = request.user.activeClinicId;
    const leadDays = query.data.leadDays ?? 30;

    const [lowStock, expiringSoon, expired, counts] = await Promise.all([
      this.parLevelAlertService.getLowStockItems(clinicId),
      this.parLevelAlertService.getExpiringSoonItems(clinicId, leadDays),
      this.parLevelAlertService.getExpiredItems(clinicId),
      this.parLevelAlertService.getAlertCounts(clinicId, leadDays),
    ]);

    return reply.status(200).send({ data: { lowStock, expiringSoon, expired, counts } });
  };

  /** GET /inventory/want-list -- D-06/D-24 items below par, biggest deficit first */
  getWantList = async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await this.wantListService.getWantList(request.user.activeClinicId);
    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/want-list/text -- D-28 WhatsApp-ready plain text */
  getWantListText = async (request: FastifyRequest, reply: FastifyReply) => {
    const text = await this.wantListService.getWantListWhatsAppText(request.user.activeClinicId);
    return reply.status(200).send({ data: { text } });
  };
}
