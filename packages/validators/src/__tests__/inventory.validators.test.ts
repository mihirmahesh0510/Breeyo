import { describe, it, expect } from 'vitest';
import {
  createItemSchema,
  updateItemSchema,
  stockReceiptSchema,
  dispenseSchema,
  stockAdjustmentSchema,
  stockTakeSchema,
  barcodeEntrySchema,
} from '../inventory.js';
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  ADJUSTMENT_REASONS,
  BARCODE_FORMATS,
  GST_RATE_SLABS,
  COMMON_VET_HSN_CODES,
  getHsnSuggestions,
} from '@breeyo/types';

describe('createItemSchema', () => {
  it('accepts a valid item', () => {
    const result = createItemSchema.safeParse({
      name: 'Amoxicillin 250mg Tab',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = createItemSchema.safeParse({
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative selling price', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional parLevel, scheduleH, notes, photoUrl', () => {
    const result = createItemSchema.safeParse({
      name: 'Amoxicillin 250mg Tab',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      parLevel: 50,
      scheduleH: true,
      notes: 'Store below 25C',
      photoUrl: 'https://example.com/photo.jpg',
    });
    expect(result.success).toBe(true);
  });

  // INV-09: HSN/SAC code + GST rate, fully optional per D-62 (no category enforcement)
  it('accepts an item with hsnSacCode and gstRate', () => {
    const result = createItemSchema.safeParse({
      name: 'Amoxicillin 250mg Tab',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      hsnSacCode: '30049099',
      gstRate: 12,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an item without hsnSacCode and gstRate (both optional)', () => {
    const result = createItemSchema.safeParse({
      name: 'Amoxicillin 250mg Tab',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects hsnSacCode with non-numeric characters', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      hsnSacCode: 'ABC123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects hsnSacCode shorter than 4 digits', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      hsnSacCode: '300',
    });
    expect(result.success).toBe(false);
  });

  it('rejects hsnSacCode longer than 8 digits', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      hsnSacCode: '123456789',
    });
    expect(result.success).toBe(false);
  });

  it.each(['3004', '300490', '30049099'])('accepts a %s-digit HSN code', (hsnSacCode) => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      hsnSacCode,
    });
    expect(result.success).toBe(true);
  });

  it.each([0, 5, 18, 40])('accepts gstRate of %i', (gstRate) => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      gstRate,
    });
    expect(result.success).toBe(true);
  });

  it('rejects gstRate above the highest GST 2.0 slab', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      gstRate: 45,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative gstRate', () => {
    const result = createItemSchema.safeParse({
      name: 'Test',
      category: 'medicine',
      unit: 'tablets',
      sellingPrice: 5.5,
      gstRate: -5,
    });
    expect(result.success).toBe(false);
  });

  it('accepts hsnSacCode/gstRate on a non-medicine category (D-62: no category-based enforcement)', () => {
    const result = createItemSchema.safeParse({
      name: 'Stethoscope',
      category: 'equipment',
      unit: 'pieces',
      sellingPrice: 1500,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateItemSchema', () => {
  it('accepts a partial update', () => {
    const result = updateItemSchema.safeParse({ sellingPrice: 6.0 });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object', () => {
    const result = updateItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  // INV-09
  it('accepts a partial update with only hsnSacCode', () => {
    const result = updateItemSchema.safeParse({ hsnSacCode: '23099090' });
    expect(result.success).toBe(true);
  });

  it('accepts a partial update with only gstRate', () => {
    const result = updateItemSchema.safeParse({ gstRate: 18 });
    expect(result.success).toBe(true);
  });

  it('rejects a partial update with an invalid hsnSacCode', () => {
    const result = updateItemSchema.safeParse({ hsnSacCode: 'XYZ' });
    expect(result.success).toBe(false);
  });

  it('rejects a partial update with an out-of-range gstRate', () => {
    const result = updateItemSchema.safeParse({ gstRate: 45 });
    expect(result.success).toBe(false);
  });
});

describe('stockReceiptSchema', () => {
  it('accepts a valid stock receipt', () => {
    const result = stockReceiptSchema.safeParse({
      quantity: 100,
      lotNumber: 'LOT-2026-A',
      expiryDate: '2027-06-15',
      purchasePrice: 3.25,
      supplier: 'ABC Pharma',
    });
    expect(result.success).toBe(true);
  });

  it('rejects quantity of 0', () => {
    const result = stockReceiptSchema.safeParse({ quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = stockReceiptSchema.safeParse({ quantity: -5 });
    expect(result.success).toBe(false);
  });

  it('accepts a receipt with no expiry date', () => {
    const result = stockReceiptSchema.safeParse({ quantity: 10 });
    expect(result.success).toBe(true);
  });

  it('validates expiryDate is in the future when provided', () => {
    const result = stockReceiptSchema.safeParse({
      quantity: 10,
      expiryDate: '2020-01-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a future expiryDate', () => {
    const result = stockReceiptSchema.safeParse({
      quantity: 10,
      expiryDate: '2027-06-15',
    });
    expect(result.success).toBe(true);
  });
});

describe('dispenseSchema', () => {
  it('accepts a minimal dispense input', () => {
    const result = dispenseSchema.safeParse({ quantity: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts optional overrideBatchId and consultationId', () => {
    const result = dispenseSchema.safeParse({
      quantity: 5,
      overrideBatchId: 'batch_123',
      consultationId: 'cons_456',
    });
    expect(result.success).toBe(true);
  });

  it('rejects quantity of 0', () => {
    const result = dispenseSchema.safeParse({ quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = dispenseSchema.safeParse({ quantity: -2 });
    expect(result.success).toBe(false);
  });
});

describe('stockAdjustmentSchema', () => {
  it('requires a reason from the preset list', () => {
    const result = stockAdjustmentSchema.safeParse({
      quantity: 3,
      type: 'remove',
      reason: 'damage',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing reason', () => {
    const result = stockAdjustmentSchema.safeParse({
      quantity: 3,
      type: 'remove',
    });
    expect(result.success).toBe(false);
  });

  it.each(['damage', 'theft', 'correction', 'expired_disposal', 'stock_take', 'other'])(
    'accepts reason %s',
    (reason) => {
      const result = stockAdjustmentSchema.safeParse({
        quantity: 1,
        type: 'add',
        reason,
      });
      expect(result.success).toBe(true);
    },
  );

  it('rejects an unknown reason', () => {
    const result = stockAdjustmentSchema.safeParse({
      quantity: 1,
      type: 'add',
      reason: 'not_a_real_reason',
    });
    expect(result.success).toBe(false);
  });
});

describe('stockTakeSchema', () => {
  it('accepts a stock-take with at least one entry', () => {
    const result = stockTakeSchema.safeParse({
      entries: [{ itemId: 'item_1', actualCount: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty entries array', () => {
    const result = stockTakeSchema.safeParse({ entries: [] });
    expect(result.success).toBe(false);
  });
});

describe('barcodeEntrySchema', () => {
  it('accepts a valid ean13 barcode', () => {
    const result = barcodeEntrySchema.safeParse({
      code: '8901234567890',
      format: 'ean13',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown format', () => {
    const result = barcodeEntrySchema.safeParse({
      code: '8901234567890',
      format: 'qr_code',
    });
    expect(result.success).toBe(false);
  });
});

describe('inventory constants', () => {
  it('INVENTORY_CATEGORIES has exactly 7 predefined entries', () => {
    expect(INVENTORY_CATEGORIES).toHaveLength(7);
  });

  it('INVENTORY_UNITS has at least 10 predefined entries', () => {
    expect(INVENTORY_UNITS.length).toBeGreaterThanOrEqual(10);
  });

  it('ADJUSTMENT_REASONS has exactly 6 entries', () => {
    expect(ADJUSTMENT_REASONS).toHaveLength(6);
  });

  it('BARCODE_FORMATS has exactly 5 entries', () => {
    expect(BARCODE_FORMATS).toHaveLength(5);
  });

  // INV-09
  it('GST_RATE_SLABS equals the post-GST-2.0 Indian slabs', () => {
    expect(GST_RATE_SLABS).toEqual([0, 5, 18, 40]);
  });

  it('COMMON_VET_HSN_CODES has at least 10 entries covering medicine, vaccine, surgical, and food categories', () => {
    expect(COMMON_VET_HSN_CODES.length).toBeGreaterThanOrEqual(10);
    const categories = new Set(COMMON_VET_HSN_CODES.map((c) => c.category));
    expect(categories).toContain('medicine');
    expect(categories).toContain('vaccine');
    expect(categories).toContain('surgical_supply');
    expect(categories).toContain('food_supplement');
  });

  it('getHsnSuggestions filters by category', () => {
    const suggestions = getHsnSuggestions('vaccine');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.category === 'vaccine')).toBe(true);
  });

  it('getHsnSuggestions returns an empty array for a category with no predefined codes', () => {
    expect(getHsnSuggestions('general_supply')).toEqual([]);
  });
});
