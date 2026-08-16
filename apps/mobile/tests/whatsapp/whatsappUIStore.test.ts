import { describe, it, expect, beforeEach } from 'vitest';
import { useWhatsAppUIStore } from '../../src/features/whatsapp/store/whatsappUIStore';

const initialState = useWhatsAppUIStore.getState();

describe('whatsappUIStore', () => {
  beforeEach(() => {
    useWhatsAppUIStore.setState(
      { activeFilter: 'all', searchQuery: '', isOffline: false },
      false,
    );
  });

  it('has the UI-SPEC default state: all filter, empty search, online', () => {
    const state = useWhatsAppUIStore.getState();
    expect(state.activeFilter).toBe('all');
    expect(state.searchQuery).toBe('');
    expect(state.isOffline).toBe(false);
  });

  it('setActiveFilter("failed") updates activeFilter and leaves searchQuery untouched', () => {
    useWhatsAppUIStore.getState().setSearchQuery('Asha');
    useWhatsAppUIStore.getState().setActiveFilter('failed');

    const state = useWhatsAppUIStore.getState();
    expect(state.activeFilter).toBe('failed');
    expect(state.searchQuery).toBe('Asha');
  });

  it('setActiveFilter is exclusive -- setting needs_action after failed leaves only needs_action active', () => {
    useWhatsAppUIStore.getState().setActiveFilter('failed');
    useWhatsAppUIStore.getState().setActiveFilter('needs_action');

    expect(useWhatsAppUIStore.getState().activeFilter).toBe('needs_action');
  });

  it('setSearchQuery updates searchQuery; clearSearch resets it to empty string', () => {
    useWhatsAppUIStore.getState().setSearchQuery('Asha');
    expect(useWhatsAppUIStore.getState().searchQuery).toBe('Asha');

    useWhatsAppUIStore.getState().clearSearch();
    expect(useWhatsAppUIStore.getState().searchQuery).toBe('');
  });

  it('setOffline(true) then setOffline(false) round-trips', () => {
    useWhatsAppUIStore.getState().setOffline(true);
    expect(useWhatsAppUIStore.getState().isOffline).toBe(true);

    useWhatsAppUIStore.getState().setOffline(false);
    expect(useWhatsAppUIStore.getState().isOffline).toBe(false);
  });

  it('restores to the initial state shape used elsewhere in this file', () => {
    expect(initialState.activeFilter).toBe('all');
  });
});
