import { describe, it, expect } from 'vitest';
import {
  isBatchExpired,
  sortBatchesByReceivedAt,
  selectFifoBatch,
  clampQuantity,
  formatExpiryDate,
  getInsufficientStockError,
  getExpiredBatchError,
  buildDispenseSubmission,
} from '../../src/features/inventory/lib/fifo-dispense-logic';
import type { StockBatch } from '@breeyo/types';

// `fifo-dispense-logic.ts` has no React/React Native imports (only
// @breeyo/validators/@breeyo/types, plain TS), so it can be unit-tested
// directly without mocking a component's import graph -- see that file's
// header comment and 05-04-SUMMARY.md finding #5 on react-test-renderer
// being broken in this repo.

function makeBatch(overrides: Partial<StockBatch> = {}): StockBatch {
  return {
    id: 'batch-1',
    itemId: 'item-1',
    clinicId: 'clinic-1',
    lotNumber: 'LOT-1',
    expiryDate: null,
    purchasePrice: null,
    supplier: null,
    initialQty: 10,
    currentQty: 10,
    receivedAt: new Date('2026-01-01'),
    isExpired: false,
    ...overrides,
  };
}

describe('isBatchExpired (D-25)', () => {
  it('is true when the server-computed isExpired flag is set', () => {
    expect(isBatchExpired(makeBatch({ isExpired: true }))).toBe(true);
  });

  it('is true when expiryDate is in the past, even if isExpired is false', () => {
    expect(isBatchExpired(makeBatch({ isExpired: false, expiryDate: new Date('2020-01-01') }))).toBe(true);
  });

  it('is false when there is no expiryDate and isExpired is false', () => {
    expect(isBatchExpired(makeBatch({ isExpired: false, expiryDate: null }))).toBe(false);
  });

  it('is false when expiryDate is in the future', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    expect(isBatchExpired(makeBatch({ isExpired: false, expiryDate: future }))).toBe(false);
  });

  it('handles a string expiryDate the same as a Date instance', () => {
    expect(isBatchExpired(makeBatch({ isExpired: false, expiryDate: '2020-01-01' as unknown as Date }))).toBe(true);
  });
});

describe('sortBatchesByReceivedAt (FIFO order)', () => {
  it('sorts oldest receivedAt first', () => {
    const oldest = makeBatch({ id: 'oldest', receivedAt: new Date('2025-01-01') });
    const middle = makeBatch({ id: 'middle', receivedAt: new Date('2025-06-01') });
    const newest = makeBatch({ id: 'newest', receivedAt: new Date('2026-01-01') });

    const sorted = sortBatchesByReceivedAt([newest, oldest, middle]);
    expect(sorted.map((b) => b.id)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('does not mutate the input array', () => {
    const batches = [makeBatch({ id: 'a', receivedAt: new Date('2026-01-02') }), makeBatch({ id: 'b', receivedAt: new Date('2026-01-01') })];
    const original = [...batches];
    sortBatchesByReceivedAt(batches);
    expect(batches).toEqual(original);
  });
});

describe('selectFifoBatch (D-22 auto-select)', () => {
  it('picks the oldest non-expired batch with stock', () => {
    const oldExpired = makeBatch({ id: 'old-expired', receivedAt: new Date('2025-01-01'), isExpired: true });
    const oldestValid = makeBatch({ id: 'oldest-valid', receivedAt: new Date('2025-06-01'), currentQty: 5 });
    const newer = makeBatch({ id: 'newer', receivedAt: new Date('2026-01-01'), currentQty: 5 });

    const selected = selectFifoBatch([newer, oldExpired, oldestValid]);
    expect(selected?.id).toBe('oldest-valid');
  });

  it('skips expired batches even when they are the oldest', () => {
    const expiredOldest = makeBatch({ id: 'expired-oldest', receivedAt: new Date('2025-01-01'), isExpired: true });
    const validNewer = makeBatch({ id: 'valid-newer', receivedAt: new Date('2025-06-01') });

    const selected = selectFifoBatch([expiredOldest, validNewer]);
    expect(selected?.id).toBe('valid-newer');
  });

  it('skips depleted batches (currentQty 0)', () => {
    const depleted = makeBatch({ id: 'depleted', receivedAt: new Date('2025-01-01'), currentQty: 0 });
    const withStock = makeBatch({ id: 'with-stock', receivedAt: new Date('2025-06-01'), currentQty: 3 });

    const selected = selectFifoBatch([depleted, withStock]);
    expect(selected?.id).toBe('with-stock');
  });

  it('returns null when every batch is expired or depleted', () => {
    const expired = makeBatch({ id: 'expired', isExpired: true });
    const depleted = makeBatch({ id: 'depleted', currentQty: 0 });
    expect(selectFifoBatch([expired, depleted])).toBeNull();
  });

  it('returns null for an empty batch list', () => {
    expect(selectFifoBatch([])).toBeNull();
  });
});

describe('clampQuantity', () => {
  it('clamps a value below min up to min', () => {
    expect(clampQuantity(0, 1, 10)).toBe(1);
  });

  it('clamps a value above max down to max', () => {
    expect(clampQuantity(20, 1, 10)).toBe(10);
  });

  it('leaves an in-range value unchanged', () => {
    expect(clampQuantity(5, 1, 10)).toBe(5);
  });

  it('falls back to min when max < min (zero-stock edge case)', () => {
    expect(clampQuantity(5, 1, 0)).toBe(1);
  });

  it('falls back to min for non-finite input (NaN from a cleared text field)', () => {
    expect(clampQuantity(Number.NaN, 1, 10)).toBe(1);
  });
});

describe('formatExpiryDate', () => {
  it('formats a Date as DD MMM YYYY', () => {
    expect(formatExpiryDate(new Date('2026-08-13'))).toBe('13 Aug 2026');
  });

  it('formats a date string the same way', () => {
    expect(formatExpiryDate('2026-08-13')).toBe('13 Aug 2026');
  });

  it('returns null for null/undefined', () => {
    expect(formatExpiryDate(null)).toBeNull();
    expect(formatExpiryDate(undefined)).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(formatExpiryDate('not-a-date')).toBeNull();
  });
});

describe('getInsufficientStockError (exact UI-SPEC copy)', () => {
  it('returns null when quantity is within available stock', () => {
    expect(getInsufficientStockError(5, 10, 'tablets')).toBeNull();
  });

  it('returns the exact UI-SPEC message when quantity exceeds available stock', () => {
    expect(getInsufficientStockError(15, 10, 'tablets')).toBe(
      'Only 10 tablets available. Enter a smaller quantity.',
    );
  });

  it('treats an exact match as sufficient (not an error)', () => {
    expect(getInsufficientStockError(10, 10, 'tablets')).toBeNull();
  });
});

describe('getExpiredBatchError (exact UI-SPEC copy)', () => {
  it('returns the exact UI-SPEC message with the formatted expiry date', () => {
    expect(getExpiredBatchError(new Date('2026-01-15'))).toBe('Cannot dispense -- batch expired on 15 Jan 2026');
  });

  it('falls back to "unknown date" when expiryDate is missing', () => {
    expect(getExpiredBatchError(null)).toBe('Cannot dispense -- batch expired on unknown date');
  });
});

describe('buildDispenseSubmission (D-22 override, D-25 blocking, D-60 ownerId)', () => {
  const fifoBatch = makeBatch({ id: 'fifo-batch', currentQty: 10 });

  it('succeeds without overrideBatchId when dispensing from the FIFO batch itself', () => {
    const result = buildDispenseSubmission({
      quantity: 2,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.quantity).toBe(2);
      expect(result.payload.overrideBatchId).toBeUndefined();
    }
  });

  it('includes overrideBatchId when the selected batch differs from the FIFO batch (D-22)', () => {
    const overrideBatch = makeBatch({ id: 'override-batch', currentQty: 10 });
    const result = buildDispenseSubmission({
      quantity: 2,
      available: 10,
      unit: 'tablets',
      selectedBatch: overrideBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.overrideBatchId).toBe('override-batch');
    }
  });

  it('blocks dispensing when the batch in use is expired (D-25)', () => {
    const expiredBatch = makeBatch({ id: 'expired-batch', isExpired: true, expiryDate: new Date('2026-01-01') });
    const result = buildDispenseSubmission({
      quantity: 1,
      available: 10,
      unit: 'tablets',
      selectedBatch: expiredBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.batch).toBe('Cannot dispense -- batch expired on 01 Jan 2026');
    }
  });

  it('blocks dispensing when there is no batch to dispense from at all', () => {
    const result = buildDispenseSubmission({
      quantity: 1,
      available: 10,
      unit: 'tablets',
      selectedBatch: null,
      fifoBatchId: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.batch).toBe('No available batch to dispense from.');
    }
  });

  it('rejects a quantity greater than available stock with the exact UI-SPEC message', () => {
    const result = buildDispenseSubmission({
      quantity: 99,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.quantity).toBe('Only 10 tablets available. Enter a smaller quantity.');
    }
  });

  it('passes consultationId through for consultation-linked dispensing (D-49)', () => {
    const result = buildDispenseSubmission({
      quantity: 1,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
      consultationId: 'consult-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.consultationId).toBe('consult-1');
    }
  });

  it('passes ownerId through for counter-sale owner attribution (D-60)', () => {
    const result = buildDispenseSubmission({
      quantity: 1,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
      consultationId: null,
      ownerId: 'owner-1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.ownerId).toBe('owner-1');
    }
  });

  it('defaults consultationId/invoiceId/ownerId to null when not provided (counter sale, no owner attached)', () => {
    const result = buildDispenseSubmission({
      quantity: 1,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payload.consultationId).toBeNull();
      expect(result.payload.invoiceId).toBeNull();
      expect(result.payload.ownerId).toBeNull();
    }
  });

  it('rejects a non-positive quantity via the shared dispenseSchema', () => {
    const result = buildDispenseSubmission({
      quantity: 0,
      available: 10,
      unit: 'tablets',
      selectedBatch: fifoBatch,
      fifoBatchId: 'fifo-batch',
    });
    expect(result.success).toBe(false);
  });
});
