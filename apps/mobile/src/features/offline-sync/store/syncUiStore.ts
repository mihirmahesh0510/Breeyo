import { create } from 'zustand';
import { SyncVisibilityState } from '@breeyo/types';
import {
  deriveVisibilityState,
  emptySyncStatusCounts,
  shouldShowRecoveryCue,
  type FailureCenterItem,
  type SyncStatusCounts,
} from '../lib/sync-status';

/**
 * Cross-domain sync-visibility store (Plan 10-05 Task 1, D-18 to D-24).
 * Mirrors `queueOfflineStore.ts`'s convention (plain zustand, no
 * `react-native` import so it stays directly unit-testable) -- this store
 * is the ONE place `SyncStatusBadge.tsx` and `SyncFailureCenterScreen.tsx`
 * both read from, so the calm badge and the actionable failure center never
 * drift out of sync with each other.
 */
interface SyncUiStoreState {
  counts: SyncStatusCounts;
  visibilityState: SyncVisibilityState;
  /** D-21: null until the first real update -- prevents a bogus recovery cue firing on app start with nothing pending. */
  previousVisibilityState: SyncVisibilityState | null;
  showRecoveryCue: boolean;
  failureItems: FailureCenterItem[];
  setSummary: (counts: SyncStatusCounts) => void;
  setFailureItems: (items: FailureCenterItem[]) => void;
  dismissRecoveryCue: () => void;
  reset: () => void;
}

const initialState = {
  counts: emptySyncStatusCounts(),
  visibilityState: SyncVisibilityState.CAUGHT_UP,
  previousVisibilityState: null as SyncVisibilityState | null,
  showRecoveryCue: false,
  failureItems: [] as FailureCenterItem[],
};

export const useSyncUiStore = create<SyncUiStoreState>((set, get) => ({
  ...initialState,

  setSummary: (counts) => {
    const nextState = deriveVisibilityState(counts);
    const { visibilityState: previousVisibilityState } = get();
    const recoveryCue = shouldShowRecoveryCue(previousVisibilityState, nextState);

    set({
      counts,
      visibilityState: nextState,
      previousVisibilityState,
      showRecoveryCue: recoveryCue,
    });
  },

  setFailureItems: (items) => set({ failureItems: items }),

  dismissRecoveryCue: () => set({ showRecoveryCue: false }),

  reset: () => set({ ...initialState }),
}));
