import { z } from 'zod';
import { ADJUSTMENT_REASON_VALUES, BARCODE_FORMAT_VALUES } from '@breeyo/types';

export const barcodeEntrySchema = z.object({
  code: z.string().min(1).max(50),
  format: z.enum(BARCODE_FORMAT_VALUES as [string, ...string[]]),
});

export const createItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(200),
  // Category/unit accept predefined values (INVENTORY_CATEGORIES / INVENTORY_UNITS)
  // plus clinic-added custom values per D-05/D-29/D-61 — validated as non-empty free text here.
  category: z.string().min(1, 'Select a category'),
  unit: z.string().min(1, 'Select a unit'),
  sellingPrice: z.number().positive('Enter a valid price').max(999999.99),
  parLevel: z.number().int().positive().nullable().optional(),
  scheduleH: z.boolean().optional().default(false),
  notes: z.string().max(1000).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  // INV-09: HSN/SAC code and GST rate are fully optional on every item regardless of
  // category, per D-62 (no category-based enforcement, unlike D-27's expiry requirement).
  hsnSacCode: z.string().regex(/^[0-9]{4,8}$/, 'HSN/SAC code must be 4-8 digits').nullable().optional(),
  // Ceiling is the highest current GST 2.0 slab (see GST_RATE_SLABS in
  // @breeyo/types). It was 28 before the 56th Council notification retired that
  // slab and introduced a higher one; leaving it there would have rejected the
  // very rate the shared GstRatePicker now offers.
  gstRate: z.number().min(0, 'GST rate cannot be negative').max(40, 'GST rate cannot exceed 40%').nullable().optional(),
  barcodes: z.array(barcodeEntrySchema).optional().default([]),
});

export const updateItemSchema = createItemSchema.partial().omit({ barcodes: true });

function isValidFutureDateString(value: string): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

export const stockReceiptSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  lotNumber: z.string().max(100).nullable().optional(),
  expiryDate: z
    .string()
    .nullable()
    .optional()
    .refine((val) => val === null || val === undefined || !Number.isNaN(new Date(val).getTime()), {
      message: 'Invalid expiry date',
    })
    .refine((val) => val === null || val === undefined || isValidFutureDateString(val), {
      message: 'Expiry date must be in the future',
    }),
  purchasePrice: z.number().positive().max(999999.99).nullable().optional(),
  supplier: z.string().max(200).nullable().optional(),
});

export const dispenseSchema = z.object({
  quantity: z.number().int().positive('Quantity must be greater than 0'),
  overrideBatchId: z.string().optional(),
  consultationId: z.string().nullable().optional(),
  invoiceId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

export const stockAdjustmentSchema = z.object({
  quantity: z.number().int().positive('Enter quantity'),
  type: z.enum(['add', 'remove']),
  reason: z.enum(ADJUSTMENT_REASON_VALUES as [string, ...string[]], {
    required_error: 'Select a reason for this adjustment',
  }),
  notes: z.string().max(500).nullable().optional(),
});

export const stockTakeEntrySchema = z.object({
  itemId: z.string().min(1),
  actualCount: z.number().int().min(0),
});

export const stockTakeSchema = z.object({
  entries: z.array(stockTakeEntrySchema).min(1),
});

export type CreateItemSchemaInput = z.infer<typeof createItemSchema>;
export type UpdateItemSchemaInput = z.infer<typeof updateItemSchema>;
export type StockReceiptSchemaInput = z.infer<typeof stockReceiptSchema>;
export type DispenseSchemaInput = z.infer<typeof dispenseSchema>;
export type StockAdjustmentSchemaInput = z.infer<typeof stockAdjustmentSchema>;
export type StockTakeSchemaInput = z.infer<typeof stockTakeSchema>;
export type BarcodeEntrySchemaInput = z.infer<typeof barcodeEntrySchema>;
