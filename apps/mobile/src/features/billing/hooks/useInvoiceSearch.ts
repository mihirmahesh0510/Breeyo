import { useEffect, useState } from 'react';

/**
 * Debounced search state for the invoice list.
 *
 * 300ms / 2 characters, per 06-UI-SPEC.md's `## Search Behavior (Phase 6)` —
 * the same numbers Phase 3's patient search and Phase 5's inventory search use,
 * so the three list screens feel identical under the thumb.
 *
 * The pure decision logic is split out of the timer plumbing for the same
 * reason `useInventorySearch.ts` splits it: this repo cannot render a hook
 * under test (vitest `node` environment, no Metro transform), so the part that
 * carries the behaviour has to be callable without one.
 */

export const INVOICE_SEARCH_DEBOUNCE_MS = 300;
export const INVOICE_SEARCH_MIN_CHARS = 2;

function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

interface SearchDerivedState {
  /** True once the debounced query has reached the minimum character count. */
  isSearchActive: boolean;
  /** True while the debounce timer has not yet caught up to the latest keystroke. */
  isSearching: boolean;
}

export function getSearchDerivedState(
  searchTerm: string,
  debouncedSearch: string,
  minChars: number = INVOICE_SEARCH_MIN_CHARS,
): SearchDerivedState {
  const isSearchActive = debouncedSearch.trim().length >= minChars;
  const isSearching = searchTerm.trim().length >= minChars && searchTerm !== debouncedSearch;
  return { isSearchActive, isSearching };
}

interface UseInvoiceSearchReturn extends SearchDerivedState {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  debouncedSearch: string;
}

export function useInvoiceSearch(): UseInvoiceSearchReturn {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, INVOICE_SEARCH_DEBOUNCE_MS);

  return {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    ...getSearchDerivedState(searchTerm, debouncedSearch),
  };
}
