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
});
