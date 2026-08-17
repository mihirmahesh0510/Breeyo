import { create } from 'zustand';

interface ScheduleUIState {
  isOffline: boolean;
  selectedDate: Date;
  vetFilter: string | null; // D-23: null means "All Vets"
  setOffline: (offline: boolean) => void;
  setSelectedDate: (date: Date) => void;
  setVetFilter: (vetId: string | null) => void;
  goToToday: () => void;
}

// UI-only state: which day/vet the vet is currently looking at, and whether
// the schedule socket thinks it's offline. Everything fetched from the API
// is never stored here -- React Query owns all of that, keyed by
// `['schedule', activeClinicId, ...]`.
export const useScheduleUIStore = create<ScheduleUIState>((set) => ({
  isOffline: false,
  selectedDate: new Date(),
  vetFilter: null,
  setOffline: (isOffline) => set({ isOffline }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setVetFilter: (vetFilter) => set({ vetFilter }),
  goToToday: () => set({ selectedDate: new Date() }),
}));
