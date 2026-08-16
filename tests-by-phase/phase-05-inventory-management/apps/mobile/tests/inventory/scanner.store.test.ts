import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScannerStore } from '../../src/features/inventory/stores/scanner.store';

const initialState = useScannerStore.getState();

describe('scanner.store', () => {
  beforeEach(() => {
    useScannerStore.setState(
      {
        scannedItems: [],
        mode: 'single',
        torchOn: false,
        lastScannedCode: '',
        lastScanTime: 0,
      },
      false,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isDuplicate', () => {
    it('returns false for a code that has never been scanned', () => {
      expect(useScannerStore.getState().isDuplicate('12345')).toBe(false);
    });

    it('returns true for the same code scanned again within the 1500ms window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      useScannerStore.getState().setLastScanned('12345');

      vi.setSystemTime(1_000_000 + 1000); // 1000ms later, inside the window
      expect(useScannerStore.getState().isDuplicate('12345')).toBe(true);
    });

    it('returns false once 1500ms has elapsed since the last scan of that code', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      useScannerStore.getState().setLastScanned('12345');

      vi.setSystemTime(1_000_000 + 1500); // exactly at the boundary -- no longer a duplicate
      expect(useScannerStore.getState().isDuplicate('12345')).toBe(false);

      vi.setSystemTime(1_000_000 + 5000);
      expect(useScannerStore.getState().isDuplicate('12345')).toBe(false);
    });

    it('returns false for a different code even within the debounce window', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      useScannerStore.getState().setLastScanned('12345');

      vi.setSystemTime(1_000_000 + 200);
      expect(useScannerStore.getState().isDuplicate('67890')).toBe(false);
    });
  });

  describe('addScannedItem', () => {
    it('prepends new scans so the most recent scan is first', () => {
      const itemA = { code: 'a', itemId: '1', itemName: 'Item A', scannedAt: 1 };
      const itemB = { code: 'b', itemId: '2', itemName: 'Item B', scannedAt: 2 };

      useScannerStore.getState().addScannedItem(itemA);
      useScannerStore.getState().addScannedItem(itemB);

      expect(useScannerStore.getState().scannedItems.map((i) => i.code)).toEqual(['b', 'a']);
    });
  });

  describe('clearScannedItems', () => {
    it('empties the scanned items list', () => {
      useScannerStore.getState().addScannedItem({ code: 'a', itemId: '1', itemName: 'Item A', scannedAt: 1 });
      useScannerStore.getState().clearScannedItems();
      expect(useScannerStore.getState().scannedItems).toEqual([]);
    });
  });

  describe('setMode / setTorch', () => {
    it('setMode switches the scanner mode', () => {
      expect(useScannerStore.getState().mode).toBe('single');
      useScannerStore.getState().setMode('continuous');
      expect(useScannerStore.getState().mode).toBe('continuous');
      useScannerStore.getState().setMode('stockTake');
      expect(useScannerStore.getState().mode).toBe('stockTake');
    });

    it('setTorch toggles torchOn', () => {
      expect(useScannerStore.getState().torchOn).toBe(false);
      useScannerStore.getState().setTorch(true);
      expect(useScannerStore.getState().torchOn).toBe(true);
      useScannerStore.getState().setTorch(false);
      expect(useScannerStore.getState().torchOn).toBe(false);
    });
  });

  describe('setLastScanned', () => {
    it('records both the code and the current timestamp', () => {
      vi.useFakeTimers();
      vi.setSystemTime(42_000);
      useScannerStore.getState().setLastScanned('999');
      expect(useScannerStore.getState().lastScannedCode).toBe('999');
      expect(useScannerStore.getState().lastScanTime).toBe(42_000);
    });
  });
});

void initialState;
