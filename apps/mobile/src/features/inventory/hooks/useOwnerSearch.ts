import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { PatientSearchResult } from '@breeyo/types';

/**
 * Debounced owner search backing `OwnerAttributionPicker` (D-60). There is no
 * owner-only search endpoint in this repo -- `/api/v1/patients/search`
 * returns one row per pet (with the owner's id/name/mobile attached), the
 * same endpoint and debounce pattern `usePatientSearch` (Phase 3, D-25) uses
 * for the EMR patient search. This hook dedupes those pet-level rows down to
 * one row per owner, since attaching a counter sale to an owner (not a
 * specific pet) is all D-60 needs.
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

export interface OwnerSearchResult {
  ownerId: string;
  ownerName: string;
  mobile: string;
}

interface PatientSearchResponse {
  data: PatientSearchResult[];
}

function dedupeByOwner(results: PatientSearchResult[]): OwnerSearchResult[] {
  const seen = new Map<string, OwnerSearchResult>();
  for (const result of results) {
    if (!seen.has(result.ownerId)) {
      seen.set(result.ownerId, {
        ownerId: result.ownerId,
        ownerName: result.ownerName,
        mobile: result.mobile,
      });
    }
  }
  return Array.from(seen.values());
}

export function useOwnerSearch() {
  const { accessToken } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedTerm = useDebounce(searchTerm, 300);

  const query = useQuery({
    queryKey: ['patients', 'search', 'owners', debouncedTerm],
    queryFn: () =>
      apiClient<PatientSearchResponse>(
        `/api/v1/patients/search?q=${encodeURIComponent(debouncedTerm)}&limit=30`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && debouncedTerm.length >= 2,
    staleTime: 60_000,
    select: (response) => dedupeByOwner(response.data),
  });

  return {
    searchTerm,
    setSearchTerm,
    debouncedTerm,
    results: query.data ?? [],
    isSearching: query.isFetching,
    isError: query.isError,
  };
}
