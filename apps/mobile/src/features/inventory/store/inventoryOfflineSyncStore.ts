import { create } from 'zustand';

/**
 * D-18 to D-21: a calm, per-domain pending-sync counter using the SAME
 * shared `SyncVisibilityState` vocabulary Plan 10-02's `queueOfflineStore.ts`
 * uses for its own pending marker -- not a bespoke inventory-only state enum.
 * A dedicated inventory store (like queue's own `queueOfflineStore.ts`) is
 * appropriate here; it is the STATE ENUM that must stay shared, not
 * necessarily a single cross-domain store instance.
 *
 * Split out of `useOfflineStockActions.ts` into its own store module (F8,
 * matching `queueOfflineStore.ts`'s convention) so `buildReplayCycleDeps.ts`
 * can decrement it on a confirmed replay without importing the hook file --
 * the hook pulls in `AuthProvider.tsx`, which `buildReplayCycleDeps.ts`
 * (a plain function with no React context) has no business depending on.
 */
export interface InventoryOfflineSyncState {
  pendingCount: number;
  incrementPending: () => void;
  /** F8: called on a confirmed replay (`buildReplayCycleDeps.ts`'s
   *  `sendOperation`) so a successfully-synced offline action stops being
   *  counted as pending -- floored at 0 so an out-of-order or duplicate
   *  acknowledgement can never drive the count negative. */
  decrementPending: () => void;
  reset: () => void;
}

export const useInventoryOfflineSyncStore = create<InventoryOfflineSyncState>((set) => ({
  pendingCount: 0,
  incrementPending: () => set((state) => ({ pendingCount: state.pendingCount + 1 })),
  decrementPending: () => set((state) => ({ pendingCount: Math.max(0, state.pendingCount - 1) })),
  reset: () => set({ pendingCount: 0 }),
}));
