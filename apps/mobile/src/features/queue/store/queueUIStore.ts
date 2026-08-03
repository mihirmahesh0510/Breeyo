import { create } from 'zustand';

interface QueueUIState {
  isOffline: boolean;
  soundEnabled: boolean;
  showDoneSection: boolean;
  setOffline: (offline: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleDoneSection: () => void;
}

export const useQueueUIStore = create<QueueUIState>((set) => ({
  isOffline: false,
  soundEnabled: true,
  showDoneSection: false,
  setOffline: (isOffline) => set({ isOffline }),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  toggleDoneSection: () => set((state) => ({ showDoneSection: !state.showDoneSection })),
}));
