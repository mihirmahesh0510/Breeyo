import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useWhatsAppUIStore } from '../store/whatsappUIStore';
import { whatsappKeys } from './whatsapp-query-keys';
import type { WhatsAppInbox } from '@breeyo/types';

/**
 * WHA-05: inbox thread list, copying `useQueue.ts`'s auth-guard/staleTime/
 * refetchOnReconnect shape, extended to `useInfiniteQuery` so the cursor
 * pagination `GET /whatsapp/threads?...&cursor=` exposes on the client the
 * same way it is offered by the server, without a second ad-hoc hook.
 *
 * Reads the active filter/search from `useWhatsAppUIStore` (UI-SPEC:
 * "only one primary filter is active at a time") so the inbox screen only
 * needs to render, never re-derive query params. `refetch`/`isRefetching`
 * back UI-SPEC's pull-to-refresh; `loadMore`/`isLoadingMore` back scrolling
 * past the first page.
 */
export function useWhatsAppThreads() {
  const { accessToken, activeClinicId } = useAuth();
  const activeFilter = useWhatsAppUIStore((s) => s.activeFilter);
  const searchQuery = useWhatsAppUIStore((s) => s.searchQuery);

  const query = useInfiniteQuery({
    queryKey: whatsappKeys.threads(activeClinicId ?? '', activeFilter, searchQuery),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter: activeFilter });
      if (searchQuery) params.set('search', searchQuery);
      if (pageParam) params.set('cursor', pageParam);
      return apiClient<{ data: WhatsAppInbox }>(
        `/api/v1/whatsapp/threads?${params.toString()}`,
        { token: accessToken! },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnReconnect: true,
    select: (data) => ({
      threads: data.pages.flatMap((page) => page.data.threads),
      nextCursor: data.pages[data.pages.length - 1]?.data.nextCursor ?? null,
    }),
  });

  return {
    ...query,
    threads: query.data?.threads ?? [],
    nextCursor: query.data?.nextCursor ?? null,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  };
}
