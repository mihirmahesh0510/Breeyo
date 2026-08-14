import { create } from 'zustand';
import type { WaInboxFilter } from '@breeyo/types';

/**
 * WHA-05 / UI-SPEC Interaction Contract: "Filters are horizontal chips below
 * the title; only one primary filter is active at a time." Copies the plain
 * `create<T>()` shape of `queueUIStore.ts` -- no middleware, no persistence.
 */
interface WhatsAppUIState {
  /** The single active inbox filter chip. Setting it replaces, never accumulates. */
  activeFilter: WaInboxFilter;
  searchQuery: string;
  isOffline: boolean;
  setActiveFilter: (filter: WaInboxFilter) => void;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  setOffline: (offline: boolean) => void;
}

export const useWhatsAppUIStore = create<WhatsAppUIState>((set) => ({
  activeFilter: 'all',
  searchQuery: '',
  isOffline: false,
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clearSearch: () => set({ searchQuery: '' }),
  setOffline: (isOffline) => set({ isOffline }),
}));
