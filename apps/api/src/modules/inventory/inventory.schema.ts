import { z } from 'zod';

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

export type ListQuery = z.infer<typeof listQuerySchema>;
