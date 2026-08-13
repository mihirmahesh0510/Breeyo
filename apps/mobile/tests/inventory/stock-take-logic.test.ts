import { describe, it, expect } from 'vitest';
import {
  getDiscrepancy,
  getDiscrepancyStatus,
  isStockTakeSessionExpired,
  buildStockTakeSubmission,
  formatSignedQuantity,
  computeClientSummary,
  STOCK_TAKE_SESSION_TTL_MS,
} from '../../src/features/inventory/lib/stock-take-logic';

describe('stock-take-logic', () => {
  describe('getDiscrepancy', () => {
    it('is 0 when actual matches system quantity', () => {
      expect(getDiscrepancy(10, 10)).toBe(0);
    });

    it('is positive when overcounted', () => {
      expect(getDiscrepancy(13, 10)).toBe(3);
    });

    it('is negative when undercounted', () => {
      expect(getDiscrepancy(7, 10)).toBe(-3);
    });
  });

  describe('getDiscrepancyStatus', () => {
    it('returns "match" for zero difference', () => {
      expect(getDiscrepancyStatus(5, 5)).toBe('match');
    });

    it('returns "over" for a positive difference', () => {
      expect(getDiscrepancyStatus(8, 5)).toBe('over');
    });

    it('returns "under" for a negative difference', () => {
      expect(getDiscrepancyStatus(2, 5)).toBe('under');
    });
  });

  describe('formatSignedQuantity', () => {
    it('prefixes positive numbers with +', () => {
      expect(formatSignedQuantity(4)).toBe('+4');
    });

    it('leaves negative numbers as-is', () => {
      expect(formatSignedQuantity(-4)).toBe('-4');
    });

    it('renders zero as "0"', () => {
      expect(formatSignedQuantity(0)).toBe('0');
    });
  });

  describe('isStockTakeSessionExpired (D-37/D-40 24h TTL)', () => {
    it('is never expired when no session has started', () => {
      expect(isStockTakeSessionExpired(null)).toBe(false);
    });

    it('is not expired just under 24h after starting', () => {
      const startedAt = new Date(1_000_000);
      const now = startedAt.getTime() + STOCK_TAKE_SESSION_TTL_MS - 1000;
      expect(isStockTakeSessionExpired(startedAt, now)).toBe(false);
    });

    it('is expired just over 24h after starting', () => {
      const startedAt = new Date(1_000_000);
      const now = startedAt.getTime() + STOCK_TAKE_SESSION_TTL_MS + 1000;
      expect(isStockTakeSessionExpired(startedAt, now)).toBe(true);
    });

    it('is not expired exactly at the 24h boundary', () => {
      const startedAt = new Date(1_000_000);
      const now = startedAt.getTime() + STOCK_TAKE_SESSION_TTL_MS;
      expect(isStockTakeSessionExpired(startedAt, now)).toBe(false);
    });
  });

  describe('buildStockTakeSubmission', () => {
    it('maps entries into the stockTakeSchema shape', () => {
      const result = buildStockTakeSubmission([
        { itemId: 'item-1', actualCount: 5 },
        { itemId: 'item-2', actualCount: 0 },
      ]);
      expect(result).toEqual({
        entries: [
          { itemId: 'item-1', actualCount: 5 },
          { itemId: 'item-2', actualCount: 0 },
        ],
      });
    });

    it('throws on an empty entry list (schema requires at least 1)', () => {
      expect(() => buildStockTakeSubmission([])).toThrow();
    });

    it('throws on a negative actual count', () => {
      expect(() => buildStockTakeSubmission([{ itemId: 'item-1', actualCount: -1 }])).toThrow();
    });
  });

  describe('computeClientSummary (D-40 pre-save preview)', () => {
    it('counts matches, over, and under correctly', () => {
      const summary = computeClientSummary([
        { itemId: '1', itemName: 'A', systemQty: 10, actualCount: 10 }, // match
        { itemId: '2', itemName: 'B', systemQty: 10, actualCount: 13 }, // over +3
        { itemId: '3', itemName: 'C', systemQty: 10, actualCount: 8 }, // under -2
      ]);

      expect(summary.itemsCounted).toBe(3);
      expect(summary.matches).toBe(1);
      expect(summary.discrepancies).toBe(2);
      expect(summary.overCount).toBe(1);
      expect(summary.underCount).toBe(1);
    });

    it('computes valueDifference from sellingPrice when known, 0 when unknown', () => {
      const summary = computeClientSummary([
        { itemId: '1', itemName: 'A', systemQty: 10, actualCount: 13, sellingPrice: 50 }, // +3 * 50 = 150
        { itemId: '2', itemName: 'B', systemQty: 10, actualCount: 8 }, // no price -> 0 contribution
      ]);

      expect(summary.results[0].valueDifference).toBe(150);
      expect(summary.results[1].valueDifference).toBe(0);
      expect(summary.totalValueDifference).toBe(150);
    });

    it('returns a zeroed summary for an empty entry list', () => {
      const summary = computeClientSummary([]);
      expect(summary).toEqual({
        itemsCounted: 0,
        matches: 0,
        discrepancies: 0,
        overCount: 0,
        underCount: 0,
        totalValueDifference: 0,
        results: [],
      });
    });
  });
});
