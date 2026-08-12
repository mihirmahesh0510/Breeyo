import { useState, useEffect } from 'react';

/**
 * Simple debounce hook. Returns the debounced value after the specified delay.
 * Mirrors the pattern in `features/patient/hooks/usePatientSearch.ts`.
 */
function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export const INVENTORY_SEARCH_DEBOUNCE_MS = 300;
export const INVENTORY_SEARCH_MIN_CHARS = 2;

interface SearchDerivedState {
  /** True once a query has actually reached the minimum character count. */
  isSearchActive: boolean;
  /** True while the debounce timer is still pending (used to show a spinner before the API call fires). */
  isSearching: boolean;
}

/**
 * Pure decision logic for the 2-character minimum (D-31), split out from the
 * stateful `useDebounce` timer plumbing above so it's testable without
 * rendering a component (this repo's react-test-renderer/react-native version
 * pairing is broken for hook-rendering tests — see useInventorySearch.test.ts).
 */
export function getSearchDerivedState(
  searchTerm: string,
  debouncedSearch: string,
  minChars: number = INVENTORY_SEARCH_MIN_CHARS,
): SearchDerivedState {
  const isSearchActive = debouncedSearch.trim().length >= minChars;
  const isSearching = searchTerm.trim().length >= minChars && searchTerm !== debouncedSearch;
  return { isSearchActive, isSearching };
}

interface UseInventorySearchReturn extends SearchDerivedState {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  debouncedSearch: string;
}

/**
 * Debounced search state for the inventory list (D-31): 300ms debounce, 2-char
 * minimum before a search is considered "active" and sent to the API.
 * Search fields covered by the API: item name, barcode number, category.
 */
export function useInventorySearch(): UseInventorySearchReturn {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, INVENTORY_SEARCH_DEBOUNCE_MS);
  const derived = getSearchDerivedState(searchTerm, debouncedSearch);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    ...derived,
  };
}
