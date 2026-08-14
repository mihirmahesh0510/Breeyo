import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ServiceCatalog } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { CATALOG_SEARCH_DEBOUNCE_MS, CATALOG_SEARCH_MIN_CHARS } from '../lib/builder-state';

/**
 * The D-02 service catalog behind the builder's `Add Service` sheet.
 *
 * Two hooks rather than one because the endpoints differ in kind: `/services`
 * is the full list the sheet shows before anything is typed, and
 * `/services/search` is a pg_trgm relevance query. Merging them would mean
 * either issuing a search for the empty string or filtering the full list
 * client-side, and the second stops being correct the moment a clinic's catalog
 * outgrows one response.
 */

interface ServiceCatalogListResponse {
  data: ServiceCatalog[];
}

/** Shared prefix so a mutation can invalidate both hooks with one key. */
export const SERVICE_CATALOG_QUERY_KEY = ['billing', 'services'] as const;

/**
 * Debounce identical in shape to `usePatientSearch`'s. Duplicated rather than
 * shared for the same reason that one is: it is eight lines, and the alternative
 * is a `hooks/` module that every feature imports for a `setTimeout`.
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

/**
 * The whole active catalog: six presets plus whatever the clinic has added.
 *
 * `activeClinicId` is in the key for the same reason it is in every other
 * billing query's (T-06-92) — a clinic switch must miss the cache rather than
 * render another tenant's price list. Five minutes of `staleTime`: reference
 * data that changes only when an admin edits it, and every such edit invalidates
 * this key explicitly through `useCreateCustomService`.
 */
export function useServiceCatalog() {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: [...SERVICE_CATALOG_QUERY_KEY, activeClinicId],
    queryFn: () =>
      apiClient<ServiceCatalogListResponse>('/api/v1/billing/services', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 300_000,
    select: (response) => response.data,
  });
}

/**
 * Live catalog search (06-UI-SPEC "Search Behavior": 300ms, 2 characters).
 *
 * The term is debounced here rather than at the call site because the sheet's
 * search field is a controlled input whose every keystroke would otherwise be a
 * request. Below two characters the query is disabled outright — not merely
 * empty — so React Query holds no entry for a one-character term that would be
 * re-rendered as "no results" on the way to a real one.
 */
export function useServiceCatalogSearch(term: string) {
  const { accessToken, activeClinicId } = useAuth();
  const debouncedTerm = useDebounce(term, CATALOG_SEARCH_DEBOUNCE_MS);
  const isSearchable = debouncedTerm.trim().length >= CATALOG_SEARCH_MIN_CHARS;

  const query = useQuery({
    queryKey: [...SERVICE_CATALOG_QUERY_KEY, activeClinicId, 'search', debouncedTerm],
    queryFn: () =>
      apiClient<ServiceCatalogListResponse>(
        `/api/v1/billing/services/search?q=${encodeURIComponent(debouncedTerm.trim())}`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && !!activeClinicId && isSearchable,
    staleTime: 60_000,
    select: (response) => response.data,
  });

  return {
    debouncedTerm,
    isSearchable,
    results: query.data ?? [],
    isSearching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
