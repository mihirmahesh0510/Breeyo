import { create } from 'zustand';

/**
 * Ephemeral UI state for the Billing tab.
 *
 * No middleware, no persistence — the same convention as `queueUIStore.ts`.
 * Server state lives in React Query; this store holds only what the UI needs to
 * agree on across components within a session.
 *
 * `isOffline` is written by `useInvoiceSocket` from the Socket.IO connection
 * lifecycle and read by the dashboard's offline banner. It is a store rather
 * than hook-local state because D-41 makes offline a cross-screen concern for
 * every money-affecting billing screen: the Payment Collection sheet, Quick
 * Sale, Credit Note and Refund flows all have to block their action on it, and
 * they are not all mounted under the same component.
 */
interface BillingUIState {
  isOffline: boolean;
  setOffline: (offline: boolean) => void;
}

export const useBillingUIStore = create<BillingUIState>((set) => ({
  isOffline: false,
  setOffline: (isOffline) => set({ isOffline }),
}));
