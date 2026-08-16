import React, { useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SearchBar, SkeletonLoader, EmptyState } from '@breeyo/ui';
import type { WhatsAppThreadSummary } from '@breeyo/types';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';
import { useWhatsAppThreads } from '../hooks/useWhatsAppThreads';
import { useWhatsAppUIStore } from '../store/whatsappUIStore';
import { ThreadListItem } from '../components/ThreadListItem';
import { FailureFilterBar } from '../components/FailureFilterBar';
import { OfflineBanner } from '../../queue/components/OfflineBanner';

/**
 * WHA-05: the staff WhatsApp inbox, composed exactly as `QueueScreen.tsx`
 * composes its hooks -- `useWhatsAppSocket()` as a realtime side effect,
 * `useWhatsAppThreads()` for data, and `useWhatsAppUIStore` for the single
 * active filter chip and the search query. All four UI-SPEC screen states
 * (loading/empty/error/populated) render with the exact copy strings the
 * design contract locks.
 */
const EMPTY_TITLE = 'No WhatsApp messages yet';
const EMPTY_BODY =
  'Send an invoice, reminder, booking update, or clinical document to start the first owner thread.';
const ERROR_COPY = 'Could not load WhatsApp messages. Pull down to try again.';
const SEARCH_PLACEHOLDER = 'Search by name, mobile, pet, invoice or booking';

export function WhatsAppInboxScreen() {
  const router = useRouter();

  // Realtime inbox/thread updates (UI-SPEC: offline banner appears when the
  // socket drops and clears on reconnect).
  useWhatsAppSocket();

  const activeFilter = useWhatsAppUIStore((s) => s.activeFilter);
  const setActiveFilter = useWhatsAppUIStore((s) => s.setActiveFilter);
  const searchQuery = useWhatsAppUIStore((s) => s.searchQuery);
  const setSearchQuery = useWhatsAppUIStore((s) => s.setSearchQuery);

  const {
    threads,
    isLoading,
    isError,
    refetch,
    isRefetching,
    loadMore,
    isLoadingMore,
    nextCursor,
  } = useWhatsAppThreads();

  const handleThreadPress = useCallback(
    (threadId: string) => {
      router.push({ pathname: '/whatsapp/[threadId]', params: { threadId } });
    },
    [router],
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (nextCursor && !isLoadingMore) {
      loadMore();
    }
  }, [nextCursor, isLoadingMore, loadMore]);

  const showEmpty = !isLoading && !isError && threads.length === 0;

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>
        WhatsApp
      </Text>

      <OfflineBanner />

      <View style={styles.searchRow}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={SEARCH_PLACEHOLDER}
          testID="whatsapp-search-bar"
        />
      </View>

      <FailureFilterBar active={activeFilter} onChange={setActiveFilter} />

      {isError && (
        <View style={styles.errorBanner} testID="whatsapp-inbox-error">
          <Text variant="bodySmall" style={styles.bannerText}>
            {ERROR_COPY}
          </Text>
        </View>
      )}

      <View style={styles.listArea}>
        {isLoading ? (
          <SkeletonLoader type="listRow" count={6} testID="whatsapp-inbox-skeleton" />
        ) : showEmpty ? (
          <EmptyState title={EMPTY_TITLE} description={EMPTY_BODY} testID="whatsapp-inbox-empty" />
        ) : (
          <FlatList<WhatsAppThreadSummary>
            data={threads}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ThreadListItem thread={item} onPress={() => handleThreadPress(item.id)} />
            )}
            onRefresh={handleRefresh}
            refreshing={isRefetching}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            testID="whatsapp-inbox-list"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  title: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    color: '#1C1B1F',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
  },
  bannerText: {
    color: '#BA1A1A',
  },
  listArea: {
    flex: 1,
    paddingTop: 8,
  },
});
