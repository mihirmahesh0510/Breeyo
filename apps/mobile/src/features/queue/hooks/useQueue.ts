import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueBoard } from '@breeyo/types';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useQueue() {
  const { accessToken, activeClinicId } = useAuth();
  const today = formatDate(new Date());

  return useQuery({
    queryKey: ['queue', activeClinicId, today],
    queryFn: () =>
      apiClient<{ data: QueueBoard }>(`/api/v1/queue?date=${today}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    select: (response) => response.data,
  });
}
