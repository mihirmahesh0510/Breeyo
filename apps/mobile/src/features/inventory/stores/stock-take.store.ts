import { create } from 'zustand';
import type { StockTakeEntry } from '@breeyo/types';
import { isStockTakeSessionExpired } from '../lib/stock-take-logic';

export interface StockTakeEntryState extends StockTakeEntry {
  itemName: string;
  unit: string;
  systemQty: number;
  /** Known only when added via the item picker (see StockTakeScreen);
   *  omitted for barcode-scanned entries. Used only for the client-side
   *  discrepancy preview (lib/stock-take-logic.ts's computeClientSummary) --
   *  the authoritative value difference always comes from the server. */
  sellingPrice?: number;
}

interface StockTakeState {
  entries: Map<string, StockTakeEntryState>;
  isActive: boolean;
  startedAt: Date | null;

  /** Adds (or re-adds) an item to the in-progress session. Re-scanning/re-selecting
   *  an item already in the session updates its systemQty/itemName/unit but preserves
   *  whatever actualCount the vet already entered. Starts the session (sets isActive +
   *  startedAt) if this is the first entry. */
  addEntry: (
    itemId: string,
    itemName: string,
    unit: string,
    systemQty: number,
    sellingPrice?: number,
  ) => void;
  updateCount: (itemId: string, actualCount: number) => void;
  removeEntry: (itemId: string) => void;
  clear: () => void;
  getEntries: () => StockTakeEntry[];
  /** D-37/D-40: true once the session has been open (isActive) for >24h. */
  isExpired: () => boolean;
}

/**
 * Stock-take session store (D-37, D-38, D-40). Per the plan's UI-SPEC
 * reference, sessions are meant to "persist via Zustand persist (survives
 * app backgrounding)". Not using zustand's `persist` middleware here --
 * `@react-native-async-storage/async-storage` (the storage adapter `persist`
 * needs on React Native) is not installed anywhere in this monorepo
 * (confirmed via apps/mobile/package.json), and no store in this feature
 * uses `persist` either (see offline-queue.store.ts's identical deviation
 * note from Plan 05-05). Plain in-memory Zustand state already survives
 * normal app backgrounding (the JS context stays alive while the app is
 * merely backgrounded, not killed by the OS) -- the case this store does
 * NOT survive is the OS fully killing the process, which would need real
 * disk persistence via a new dependency, out of scope here.
 */
export const useStockTakeStore = create<StockTakeState>((set, get) => ({
  entries: new Map(),
  isActive: false,
  startedAt: null,

  addEntry: (itemId, itemName, unit, systemQty, sellingPrice) =>
    set((state) => {
      const next = new Map(state.entries);
      const existing = next.get(itemId);
      next.set(itemId, {
        itemId,
        itemName,
        unit,
        systemQty,
        sellingPrice: sellingPrice ?? existing?.sellingPrice,
        // Preserve an already-entered count when re-scanning the same item;
        // default a brand-new entry's count to the system quantity (D-37:
        // the vet adjusts from there rather than starting at a blank/zero
        // count that would otherwise flag every uncounted item as "under").
        actualCount: existing?.actualCount ?? systemQty,
      });
      return {
        entries: next,
        isActive: true,
        startedAt: state.startedAt ?? new Date(),
      };
    }),

  updateCount: (itemId, actualCount) =>
    set((state) => {
      const existing = state.entries.get(itemId);
      if (!existing) return state;
      const next = new Map(state.entries);
      next.set(itemId, { ...existing, actualCount });
      return { entries: next };
    }),

  removeEntry: (itemId) =>
    set((state) => {
      if (!state.entries.has(itemId)) return state;
      const next = new Map(state.entries);
      next.delete(itemId);
      return { entries: next };
    }),

  clear: () => set({ entries: new Map(), isActive: false, startedAt: null }),

  getEntries: () =>
    Array.from(get().entries.values()).map((e) => ({ itemId: e.itemId, actualCount: e.actualCount })),

  isExpired: () => {
    const { startedAt, isActive } = get();
    if (!isActive) return false;
    return isStockTakeSessionExpired(startedAt);
  },
}));
