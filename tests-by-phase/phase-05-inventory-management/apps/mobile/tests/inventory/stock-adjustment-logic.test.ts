import { describe, it, expect } from 'vitest';
import {
  computeSignedAdjustmentQuantity,
  getAdjustmentSuccessToast,
  buildStockAdjustmentSubmission,
} from '../../src/features/inventory/lib/stock-adjustment-logic';

// `stock-adjustment-logic.ts` has no React/React Native imports (only
// @breeyo/validators, plain TS), so it can be unit-tested directly without
// mocking a component's import graph -- see that file's header comment and
// 05-04-SUMMARY.md finding #5 on why react-test-renderer is broken in this repo.

describe('computeSignedAdjustmentQuantity (D-04)', () => {
  it('returns a positive delta for "add"', () => {
    expect(computeSignedAdjustmentQuantity('add', 10)).toBe(10);
  });

  it('returns a negative delta for "remove"', () => {
    expect(computeSignedAdjustmentQuantity('remove', 10)).toBe(-10);
  });

  it('handles zero without sign confusion', () => {
    expect(computeSignedAdjustmentQuantity('add', 0)).toBe(0);
    expect(computeSignedAdjustmentQuantity('remove', 0)).toBe(-0);
  });
});

describe('getAdjustmentSuccessToast', () => {
  it('produces the "added to" toast for an add adjustment', () => {
    expect(getAdjustmentSuccessToast('add', 5, 'tablets', 'Amoxicillin 250mg')).toBe(
      '5 tablets added to Amoxicillin 250mg',
    );
  });

  it('produces the "removed from" toast for a remove adjustment', () => {
    expect(getAdjustmentSuccessToast('remove', 5, 'tablets', 'Amoxicillin 250mg')).toBe(
      '5 tablets removed from Amoxicillin 250mg',
    );
  });
});

describe('buildStockAdjustmentSubmission (D-04: required reason)', () => {
  it('rejects a blank quantity', () => {
    const result = buildStockAdjustmentSubmission('', 'add', 'damage', '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Enter quantity');
    }
  });

  it('rejects a missing reason with the exact UI-SPEC message', () => {
    const result = buildStockAdjustmentSubmission('5', 'remove', '', '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.reason).toBe('Select a reason for this adjustment');
    }
  });

  it('reports both quantity and reason errors together when both are missing', () => {
    const result = buildStockAdjustmentSubmission('', 'add', '', '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Enter quantity');
      expect(result.errors.reason).toBe('Select a reason for this adjustment');
    }
  });

  it('rejects a reason not in the ADJUSTMENT_REASONS preset list', () => {
    const result = buildStockAdjustmentSubmission('5', 'add', 'not-a-real-reason', '');
    expect(result.success).toBe(false);
  });

  it('succeeds for a valid add adjustment with a preset reason', () => {
    const result = buildStockAdjustmentSubmission('12', 'add', 'correction', '');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.quantity).toBe(12);
      expect(result.payload.type).toBe('add');
      expect(result.payload.reason).toBe('correction');
      expect(result.payload.notes).toBeNull();
    }
  });

  it('succeeds for a valid remove adjustment and trims notes', () => {
    const result = buildStockAdjustmentSubmission('3', 'remove', 'expired_disposal', '  batch opened too early  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.type).toBe('remove');
      expect(result.payload.reason).toBe('expired_disposal');
      expect(result.payload.notes).toBe('batch opened too early');
    }
  });

  it('rejects a non-positive quantity via the shared stockAdjustmentSchema', () => {
    const result = buildStockAdjustmentSubmission('0', 'add', 'other', '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBeDefined();
    }
  });

  it('accepts all six ADJUSTMENT_REASONS preset values', () => {
    const reasons = ['damage', 'theft', 'correction', 'expired_disposal', 'stock_take', 'other'];
    for (const reason of reasons) {
      const result = buildStockAdjustmentSubmission('1', 'add', reason, '');
      expect(result.success).toBe(true);
    }
  });
});
