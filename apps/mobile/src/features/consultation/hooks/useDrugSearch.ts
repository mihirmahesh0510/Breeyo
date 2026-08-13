import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { DrugEntry, DrugSearchResult } from '@breeyo/types';

interface DrugListResponse {
  data: DrugEntry[];
}

export function useDrugSearch() {
  const { accessToken } = useAuth();
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drugsQuery = useQuery({
    queryKey: ['drugs'],
    queryFn: () =>
      apiClient<DrugListResponse>('/api/v1/drugs', {
        token: accessToken!,
      }),
    enabled: !!accessToken,
    staleTime: Infinity,
    select: (response) => response.data,
  });

  const results: DrugSearchResult[] = useMemo(() => {
    if (!query.trim() || !drugsQuery.data) return [];
    const lowerQuery = query.toLowerCase().trim();
    return drugsQuery.data
      .filter(
        (drug) =>
          drug.name.toLowerCase().includes(lowerQuery) ||
          drug.genericName.toLowerCase().includes(lowerQuery),
      )
      .map((drug) => ({
        id: drug.id,
        name: drug.name,
        genericName: drug.genericName,
        category: drug.category,
        formulations: drug.formulations,
      }));
  }, [query, drugsQuery.data]);

  const searchDrugs = useCallback((text: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setQuery(text);
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setQuery('');
  }, []);

  return {
    drugs: drugsQuery.data ?? [],
    searchDrugs,
    clearSearch,
    results,
    isLoading: drugsQuery.isLoading,
    query,
  };
}
