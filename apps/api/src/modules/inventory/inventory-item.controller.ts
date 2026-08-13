import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  createItemSchema,
  updateItemSchema,
  barcodeEntrySchema,
  stockReceiptSchema,
} from '@breeyo/validators';
import type { InventoryItemService } from './inventory-item.service.js';
import type { StockReceiptService } from './stock-receipt.service.js';
import type { BarcodeLookupService } from './barcode-lookup.service.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  itemParamsSchema,
  barcodeParamsSchema,
  listQuerySchema,
  lookupQuerySchema,
  catalogQuerySchema,
} from './inventory.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export interface InventoryServices {
  service: InventoryItemService;
  stockReceiptService: StockReceiptService;
  barcodeLookupService: BarcodeLookupService;
}

/**
 * D-30: every handler resolves `this.buildServices(request.db)` as its first
 * statement, so each request gets services bound to its own tenant-scoped
 * handle. See `inventory.routes.ts`.
 */
export class InventoryController {
  constructor(
    private readonly buildServices: (db: TenantPrismaClient) => InventoryServices,
  ) {}

  /** POST /inventory/items */
  createItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const body = createItemSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const item = await service.createItem(
      request.user.activeClinicId,
      request.user.id,
      body.data,
    );

    return reply.status(201).send({ data: item });
  };

  /** PATCH /inventory/items/:itemId */
  updateItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = updateItemSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const item = await service.updateItem(
      request.user.activeClinicId,
      params.data.itemId,
      body.data,
    );

    return reply.status(200).send({ data: item });
  };

  /** GET /inventory/items/:itemId */
  getItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const item = await service.getItem(request.user.activeClinicId, params.data.itemId);

    return reply.status(200).send({ data: item });
  };

  /** GET /inventory/items */
  listItems = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const result = await service.listItems(request.user.activeClinicId, query.data);

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/items/summary */
  getSummary = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const summary = await service.getSummary(request.user.activeClinicId);
    return reply.status(200).send({ data: summary });
  };

  /** GET /inventory/categories — predefined + clinic-custom merged (D-61) */
  getCategories = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const categories = await service.getCategories(request.user.activeClinicId);
    return reply.status(200).send({ data: categories });
  };

  /** GET /inventory/units — predefined + clinic-custom merged (D-61) */
  getUnits = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const units = await service.getUnits(request.user.activeClinicId);
    return reply.status(200).send({ data: units });
  };

  /**
   * POST /inventory/items/:itemId/barcodes
   * D-63: on conflict (barcode already linked to a different item), returns
   * 409 with a typed `existingItem` field so the client doesn't need to parse
   * the message string.
   */
  addBarcode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = barcodeEntrySchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await service.addBarcode(
      request.user.activeClinicId,
      params.data.itemId,
      body.data,
    );

    if (!result.success) {
      return reply.status(409).send({
        error: {
          code: 'BARCODE_CONFLICT',
          message: `This barcode is linked to '${result.conflict.itemName}'`,
          existingItem: result.conflict,
        },
      });
    }

    return reply.status(201).send({ data: result.barcode });
  };

  /** DELETE /inventory/barcodes/:barcodeId */
  removeBarcode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const params = barcodeParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    await service.removeBarcode(request.user.activeClinicId, params.data.barcodeId);

    return reply.status(204).send();
  };

  /** POST /inventory/items/:itemId/receive — D-11: creates a new batch every time */
  receiveStock = async (request: FastifyRequest, reply: FastifyReply) => {
    const { stockReceiptService } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const body = stockReceiptSchema.safeParse(request.body);
    if (!body.success) return validationError(reply, body.error.errors);

    const result = await stockReceiptService.receiveStock(
      request.user.activeClinicId,
      params.data.itemId,
      request.user.id,
      (request as any).userName ?? 'Unknown',
      body.data,
    );

    return reply.status(201).send({ data: result });
  };

  /** POST /inventory/items/:itemId/photo-upload-url — D-64 */
  getPhotoUploadUrl = async (request: FastifyRequest, reply: FastifyReply) => {
    const { service } = this.buildServices(request.db);
    const params = itemParamsSchema.safeParse(request.params);
    if (!params.success) return validationError(reply, params.error.errors);

    const result = await service.getPhotoUploadUrl(
      request.user.activeClinicId,
      params.data.itemId,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/barcode-lookup */
  lookupBarcode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { barcodeLookupService } = this.buildServices(request.db);
    const query = lookupQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const result = await barcodeLookupService.lookup(
      request.user.activeClinicId,
      query.data.code,
    );

    return reply.status(200).send({ data: result });
  };

  /** GET /inventory/barcode-catalog — D-19 offline cache sync */
  getBarcodeCatalog = async (request: FastifyRequest, reply: FastifyReply) => {
    const { barcodeLookupService } = this.buildServices(request.db);
    const query = catalogQuerySchema.safeParse(request.query);
    if (!query.success) return validationError(reply, query.error.errors);

    const updatedSince = query.data.updatedSince ? new Date(query.data.updatedSince) : undefined;
    const result = await barcodeLookupService.getCatalog(
      request.user.activeClinicId,
      updatedSince,
    );

    return reply.status(200).send({ data: result });
  };
}
