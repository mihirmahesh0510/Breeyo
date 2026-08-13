import { describe, it, expect } from 'vitest';
import {
  isExpiryRequiredForCategory,
  buildStockReceiptSubmission,
  EMPTY_STOCK_RECEIPT_FORM,
} from '../../src/features/inventory/lib/stock-receipt-logic';
import type { StockReceiptFormData } from '../../src/features/inventory/lib/stock-receipt-logic';

// `stock-receipt-logic.ts` has no React/React Native imports (only
// @breeyo/types and @breeyo/validators, both plain TS), so it can be
// unit-tested directly without mocking a component's import graph -- see
// that file's header comment and 05-04-SUMMARY.md finding #5 on why
// react-test-renderer is broken in this repo.

function makeFormData(overrides: Partial<StockReceiptFormData> = {}): StockReceiptFormData {
  return { ...EMPTY_STOCK_RECEIPT_FORM, ...overrides };
}

function futureDateString(daysFromNow = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function pastDateString(daysAgo = 30): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('isExpiryRequiredForCategory (D-27)', () => {
  it('requires expiry for medicine, vaccine, and lab_consumable', () => {
    expect(isExpiryRequiredForCategory('medicine')).toBe(true);
    expect(isExpiryRequiredForCategory('vaccine')).toBe(true);
    expect(isExpiryRequiredForCategory('lab_consumable')).toBe(true);
  });

  it('does not require expiry for equipment, general_supply, or a custom category', () => {
    expect(isExpiryRequiredForCategory('equipment')).toBe(false);
    expect(isExpiryRequiredForCategory('general_supply')).toBe(false);
    expect(isExpiryRequiredForCategory('surgical_supply')).toBe(false);
    expect(isExpiryRequiredForCategory('my-custom-category')).toBe(false);
  });
});

describe('buildStockReceiptSubmission', () => {
  it('rejects a blank quantity with the UI-SPEC required-field message', () => {
    const result = buildStockReceiptSubmission(makeFormData({ quantity: '' }), 'general_supply');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Enter the quantity received');
    }
  });

  it('rejects a blank quantity that is only whitespace', () => {
    const result = buildStockReceiptSubmission(makeFormData({ quantity: '   ' }), 'general_supply');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Enter the quantity received');
    }
  });

  it('requires an expiry date for a medicine item and reports the category in the message', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({ quantity: '100' }),
      'medicine',
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.expiryDate).toBe('Expiry date is required for medicine items');
      expect(result.errors.quantity).toBeUndefined();
    }
  });

  it('does not require an expiry date for a non-expiry category', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({ quantity: '100' }),
      'equipment',
    );
    expect(result.success).toBe(true);
  });

  it('succeeds for a medicine item once a future expiry date is supplied', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({ quantity: '100', expiryDate: futureDateString() }),
      'medicine',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.quantity).toBe(100);
      expect(result.payload.expiryDate).toBe(futureDateString());
    }
  });

  it('rejects a past expiry date via the shared stockReceiptSchema', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({ quantity: '100', expiryDate: pastDateString() }),
      'medicine',
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.expiryDate).toBe('Expiry date must be in the future');
    }
  });

  it('rejects a non-positive quantity via the shared stockReceiptSchema', () => {
    const result = buildStockReceiptSubmission(makeFormData({ quantity: '0' }), 'general_supply');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Quantity must be greater than 0');
    }
  });

  it('converts optional blank fields (lot number, purchase price, supplier) to null', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({ quantity: '10', lotNumber: '  ', purchasePrice: '', supplier: '   ' }),
      'general_supply',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.lotNumber).toBeNull();
      expect(result.payload.purchasePrice).toBeNull();
      expect(result.payload.supplier).toBeNull();
    }
  });

  it('passes through a trimmed lot number, purchase price, and supplier', () => {
    const result = buildStockReceiptSubmission(
      makeFormData({
        quantity: '10',
        lotNumber: '  LOT123  ',
        purchasePrice: '45.50',
        supplier: '  Acme Distributors  ',
      }),
      'general_supply',
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.lotNumber).toBe('LOT123');
      expect(result.payload.purchasePrice).toBe(45.5);
      expect(result.payload.supplier).toBe('Acme Distributors');
    }
  });
});
