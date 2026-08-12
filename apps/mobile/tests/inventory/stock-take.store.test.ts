import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStockTakeStore } from '../../src/features/inventory/stores/stock-take.store';
import { STOCK_TAKE_SESSION_TTL_MS } from '../../src/features/inventory/lib/stock-take-logic';

describe('stock-take.store', () => {
  beforeEach(() => {
    useStockTakeStore.setState({ entries: new Map(), isActive: false, startedAt: null }, false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addEntry', () => {
    it('adds a new entry, defaulting actualCount to systemQty', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Amoxicillin', 'tablets', 20);
      const entry = useStockTakeStore.getState().entries.get('item-1');
      expect(entry).toEqual({
        itemId: 'item-1',
        itemName: 'Amoxicillin',
        unit: 'tablets',
        systemQty: 20,
        sellingPrice: undefined,
        actualCount: 20,
      });
    });

    it('starts the session (isActive + startedAt) on the first entry', () => {
      expect(useStockTakeStore.getState().isActive).toBe(false);
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      expect(useStockTakeStore.getState().isActive).toBe(true);
      expect(useStockTakeStore.getState().startedAt).not.toBeNull();
    });

    it('does not reset startedAt when a second entry is added', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      const firstStartedAt = useStockTakeStore.getState().startedAt;
      useStockTakeStore.getState().addEntry('item-2', 'Item 2', 'pieces', 3);
      expect(useStockTakeStore.getState().startedAt).toBe(firstStartedAt);
    });

    it('re-adding the same item preserves an already-entered actualCount', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      useStockTakeStore.getState().updateCount('item-1', 9);
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      expect(useStockTakeStore.getState().entries.get('item-1')?.actualCount).toBe(9);
    });

    it('stores an optional sellingPrice', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5, 99.5);
      expect(useStockTakeStore.getState().entries.get('item-1')?.sellingPrice).toBe(99.5);
    });
  });

  describe('updateCount', () => {
    it('updates the actualCount for an existing entry', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      useStockTakeStore.getState().updateCount('item-1', 3);
      expect(useStockTakeStore.getState().entries.get('item-1')?.actualCount).toBe(3);
    });

    it('is a no-op for an item not in the session', () => {
      useStockTakeStore.getState().updateCount('missing-item', 3);
      expect(useStockTakeStore.getState().entries.size).toBe(0);
    });
  });

  describe('removeEntry', () => {
    it('removes an entry from the session', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      useStockTakeStore.getState().removeEntry('item-1');
      expect(useStockTakeStore.getState().entries.has('item-1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('resets entries, isActive, and startedAt', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      useStockTakeStore.getState().clear();
      expect(useStockTakeStore.getState().entries.size).toBe(0);
      expect(useStockTakeStore.getState().isActive).toBe(false);
      expect(useStockTakeStore.getState().startedAt).toBeNull();
    });
  });

  describe('getEntries', () => {
    it('returns the plain {itemId, actualCount} shape stockTakeSchema expects', () => {
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      useStockTakeStore.getState().updateCount('item-1', 7);
      expect(useStockTakeStore.getState().getEntries()).toEqual([{ itemId: 'item-1', actualCount: 7 }]);
    });
  });

  describe('isExpired', () => {
    it('is false when no session is active', () => {
      expect(useStockTakeStore.getState().isExpired()).toBe(false);
    });

    it('is false for a session younger than 24h', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      vi.setSystemTime(1_000_000 + STOCK_TAKE_SESSION_TTL_MS - 1000);
      expect(useStockTakeStore.getState().isExpired()).toBe(false);
    });

    it('is true for a session older than 24h', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      useStockTakeStore.getState().addEntry('item-1', 'Item', 'pieces', 5);
      vi.setSystemTime(1_000_000 + STOCK_TAKE_SESSION_TTL_MS + 1000);
      expect(useStockTakeStore.getState().isExpired()).toBe(true);
    });
  });
});
