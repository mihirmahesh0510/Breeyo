import { create } from 'zustand';

/** D-18: single = default scan-and-show-card mode; continuous = camera stays
 *  active accumulating a list; stockTake = continuous + per-item count entry (D-38). */
export type ScannerMode = 'single' | 'continuous' | 'stockTake';

export interface ScannedItem {
  code: string;
  itemId: string;
  itemName: string;
  scannedAt: number;
}

/** RESEARCH.md Pitfall 2: a barcode sitting in frame keeps re-triggering the
 *  detector every frame; codes scanned again within this window are treated
 *  as duplicates of the same physical scan, not a new one. */
export const DUPLICATE_SCAN_WINDOW_MS = 1500;

interface ScannerState {
  scannedItems: ScannedItem[];
  mode: ScannerMode;
  torchOn: boolean;
  lastScannedCode: string;
  lastScanTime: number;

  addScannedItem: (item: ScannedItem) => void;
  clearScannedItems: () => void;
  setMode: (mode: ScannerMode) => void;
  setTorch: (on: boolean) => void;
  setLastScanned: (code: string) => void;
  isDuplicate: (code: string) => boolean;
}

export const useScannerStore = create<ScannerState>((set, get) => ({
  scannedItems: [],
  mode: 'single',
  torchOn: false,
  lastScannedCode: '',
  lastScanTime: 0,

  // Newest scan first -- matches D-18's continuous scan list ("scan 20
  // items, review ... in one go") reading top-to-bottom as most-recent-first.
  addScannedItem: (item) => set((state) => ({ scannedItems: [item, ...state.scannedItems] })),

  clearScannedItems: () => set({ scannedItems: [] }),

  setMode: (mode) => set({ mode }),

  setTorch: (on) => set({ torchOn: on }),

  setLastScanned: (code) => set({ lastScannedCode: code, lastScanTime: Date.now() }),

  isDuplicate: (code) => {
    const { lastScannedCode, lastScanTime } = get();
    if (code !== lastScannedCode) return false;
    return Date.now() - lastScanTime < DUPLICATE_SCAN_WINDOW_MS;
  },
}));
