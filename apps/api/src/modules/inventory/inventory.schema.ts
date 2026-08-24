import { z } from 'zod';
import { stockAdjustmentSchema } from '@breeyo/validators';

/** Params with itemId */
export const itemParamsSchema = z.object({
  itemId: z.string().min(1),
});

/** Params with barcodeId */
export const barcodeParamsSchema = z.object({
  barcodeId: z.string().min(1),
});

/** Query params for item list/search (D-31, D-36) */
export const listQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  sort: z
    .enum(['name_asc', 'stock_level_asc', 'created_at_desc', 'expiry_asc', 'category_asc'])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/** Query params for barcode lookup */
export const lookupQuerySchema = z.object({
  code: z.string().min(1, 'code is required'),
});

/** Query params for barcode catalog sync (D-19 incremental sync) */
export const catalogQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
});

/** Params with movementId (return-to-stock, D-51/D-57) */
export const movementParamsSchema = z.object({
  movementId: z.string().min(1),
});

/** Query params for movement history pagination (D-46) */
export const movementQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/** Query params for the alerts endpoint (D-21 configurable lead time) */
export const alertsQuerySchema = z.object({
  leadDays: z.coerce.number().int().positive().max(365).optional(),
});

/**
 * Plan 10-05, D-05: web-only wrapper around the shared mobile
 * `stockAdjustmentSchema` (`@breeyo/validators`), adding the same optional
 * `expectedVersion` epoch-ms field `webQueueBoardQuerySchema` established
 * for reads, now reused for a WRITE-side optimistic-concurrency check --
 * see `billing.schema.ts`'s `webRefundBodySchema` for the identical
 * rationale. The mobile barcode-scanner adjust flow (D-37: stays
 * mobile-first) keeps using the shared schema unmodified.
 */
export const webStockAdjustmentBodySchema = stockAdjustmentSchema.extend({
  expectedVersion: z.coerce.number().int().nonnegative().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
