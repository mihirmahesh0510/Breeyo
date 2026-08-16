import { describe, it, expect } from 'vitest';
import {
  getSearchDerivedState,
  INVENTORY_SEARCH_DEBOUNCE_MS,
  INVENTORY_SEARCH_MIN_CHARS,
} from '../../src/features/inventory/hooks/useInventorySearch';

// Note: `useInventorySearch`'s stateful debounce timer (setTimeout + useState)
// is exercised implicitly through the screens that consume it. It isn't
// rendered directly here because this repo's react-test-renderer version is
// incompatible with the installed react-native/react pairing in the vitest
// "node" environment (confirmed pre-existing: no test anywhere in
// apps/mobile/tests currently renders a component or hook through
// @testing-library/react-native — every existing test, including
// dosage-parsing.test.ts and auth-flow.test.tsx, only exercises plain
// functions/modules). `getSearchDerivedState` is the pure decision logic
// extracted out of the hook specifically so the D-31 2-character-minimum
// behavior stays unit-testable without a renderer.

describe('getSearchDerivedState', () => {
  it('is inactive while below the 2-character minimum, even once debounced', () => {
    expect(getSearchDerivedState('a', 'a').isSearchActive).toBe(false);
    expect(getSearchDerivedState('', '').isSearchActive).toBe(false);
  });

  it('becomes active once the debounced value reaches 2+ characters', () => {
    expect(getSearchDerivedState('am', 'am').isSearchActive).toBe(true);
    expect(getSearchDerivedState('amoxicillin', 'amoxicillin').isSearchActive).toBe(true);
  });

  it('treats whitespace-only input as below the minimum', () => {
    expect(getSearchDerivedState('  ', '  ').isSearchActive).toBe(false);
  });

  it('is "searching" while the debounce timer has not caught up to the latest keystroke', () => {
    // User has typed past the min-chars threshold but the debounced value is stale.
    expect(getSearchDerivedState('amox', 'am').isSearching).toBe(true);
  });

  it('is not "searching" once debouncedSearch catches up to searchTerm', () => {
    expect(getSearchDerivedState('amox', 'amox').isSearching).toBe(false);
  });

  it('is not "searching" below the minimum character count, regardless of debounce lag', () => {
    expect(getSearchDerivedState('a', '').isSearching).toBe(false);
  });

  it('resets to inactive/not-searching when the term is cleared', () => {
    const state = getSearchDerivedState('', '');
    expect(state.isSearchActive).toBe(false);
    expect(state.isSearching).toBe(false);
  });

  it('respects a custom minChars override', () => {
    expect(getSearchDerivedState('ab', 'ab', 3).isSearchActive).toBe(false);
    expect(getSearchDerivedState('abc', 'abc', 3).isSearchActive).toBe(true);
  });
});

describe('debounce configuration constants (D-31)', () => {
  it('debounces at 300ms per the UI-SPEC Search Behavior table', () => {
    expect(INVENTORY_SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it('requires a 2-character minimum per the UI-SPEC Search Behavior table', () => {
    expect(INVENTORY_SEARCH_MIN_CHARS).toBe(2);
  });
});
