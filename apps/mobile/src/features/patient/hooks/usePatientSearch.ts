import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { PatientSearchResult } from '@breeyo/types';

/**
 * Simple debounce hook. Returns the debounced value after the specified delay.
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

interface PatientSearchResponse {
  data: PatientSearchResult[];
}

/**
 * Hook for debounced patient search using React Query.
 *
 * Search is enabled once the debounced term reaches 2+ characters.
 * Results are cached by query term with a 60-second stale time.
 */
export function usePatientSearch() {
  const { accessToken } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedTerm = useDebounce(searchTerm, 300);

  const query = useQuery({
    queryKey: ['patients', 'search', debouncedTerm],
    queryFn: () =>
      apiClient<PatientSearchResponse>(
        `/api/v1/patients/search?q=${encodeURIComponent(debouncedTerm)}&limit=30`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && debouncedTerm.length >= 2,
    staleTime: 60_000,
    select: (response) => response.data,
  });

  return {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
    results: query.data ?? [],
    isSearching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
