import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { FAB, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SearchBar, EmptyState, BreeyoIconButton, SkeletonLoader } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import {
  useInventoryItems,
  useInventorySummary,
  useInventoryAlerts,
  useInventoryCategories,
  type InventorySortOption,
} from '../hooks/useInventoryApi';
import { useInventorySearch } from '../hooks/useInventorySearch';
import { SummaryHeader } from '../components/SummaryHeader';
import { AttentionCard } from '../components/AttentionCard';
import { InventoryItemCard } from '../components/InventoryItemCard';
import { CategoryFilterChips } from '../components/CategoryFilterChips';
import { SortSelector } from '../components/SortSelector';
import type { InventoryItem } from '@breeyo/types';

/**
 * Minimal, self-contained connectivity check for the D-19/UI-SPEC "Offline"
 * screen state. `@react-native-community/netinfo` is not an installed
 * dependency in this repo (Plan 05-05, running concurrently in this same
 * worktree, owns the real offline-queue/sync implementation and may add it).
 * TODO(Plan 05-05): replace with the real useNetworkStatus/useOfflineSync
 * hook once that lands -- this always reports "online" for now, so the
 * Offline banner exists and is wired but never actually shows yet.
 */
function useIsOffline(): boolean {
  return false;
}

export function InventoryListScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();

  const { searchTerm, setSearchTerm, debouncedSearch, isSearchActive, isSearching } =
    useInventorySearch();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSort, setSelectedSort] = useState<InventorySortOption>('name_asc');
  const [refreshing, setRefreshing] = useState(false);

  const itemsQuery = useInventoryItems(activeClinicId, {
    search: debouncedSearch,
    category: selectedCategory,
    sort: selectedSort,
  });
  const summaryQuery = useInventorySummary(activeClinicId);
  const alertsQuery = useInventoryAlerts(activeClinicId);
  const categoriesQuery = useInventoryCategories(activeClinicId);

  const handleSelectItem = useCallback(
    (itemId: string) => {
      // Route not yet wired into the Expo Router tree (out of this plan's file
      // scope) -- placeholder path for the future item-detail route.
      router.push(`/(app)/(tabs)/inventory/${itemId}` as any);
    },
    [router],
  );

  const handleAddItem = useCallback(() => {
    router.push('/(app)/(tabs)/inventory/add' as any);
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventory', 'items', activeClinicId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory', 'summary', activeClinicId] }),
      queryClient.invalidateQueries({ queryKey: ['inventory', 'alerts', activeClinicId] }),
    ]);
    setRefreshing(false);
  }, [queryClient, activeClinicId]);

  const items = itemsQuery.data?.items ?? [];
  const categories = categoriesQuery.data ?? [];
  const isInitialLoading = itemsQuery.isLoading && !itemsQuery.data;
  const isEmpty = !isInitialLoading && !isSearchActive && items.length === 0 && !itemsQuery.isError;
  const isSearchNoResults =
    isSearchActive && !itemsQuery.isFetching && items.length === 0 && !itemsQuery.isError;

  return (
    <View style={styles.container} testID="inventory-list-screen">
      {isOffline && (
        <View style={styles.offlineBanner} testID="inventory-offline-banner">
          <Text variant="bodySmall" style={styles.offlineText}>
            You are offline. Showing cached data.
          </Text>
        </View>
      )}

      <SummaryHeader
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        onLowStockPress={() => {
          /* AttentionCard renders inline below; scroll handled by the FlatList's natural position. */
        }}
        onExpiringPress={() => {
          /* see above */
        }}
        testID="inventory-summary-header"
      />

      <AttentionCard
        alerts={alertsQuery.data}
        onItemPress={handleSelectItem}
        testID="inventory-attention-card"
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBarWrap}>
          <SearchBar
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search by name, barcode, or category"
            testID="inventory-search-bar"
          />
        </View>
        <BreeyoIconButton
          icon="barcode-scan"
          accessibilityLabel="Scan barcode"
          onPress={() => router.push('/(app)/(tabs)/inventory/scan' as any)}
          testID="inventory-scan-button"
        />
      </View>

      {searchTerm.length > 0 && searchTerm.length < 2 && (
        <Text variant="bodySmall" style={styles.searchHint}>
          Type at least 2 characters to search
        </Text>
      )}

      <CategoryFilterChips
        categories={categories}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
        testID="inventory-category-chips"
      />

      <View style={styles.sortRow}>
        <SortSelector
          selectedSort={selectedSort}
          onSortChange={setSelectedSort}
          testID="inventory-sort-selector"
        />
      </View>

      <View style={styles.listArea}>
        {isInitialLoading ? (
          <SkeletonLoader type="listRow" count={8} testID="inventory-list-skeleton" />
        ) : itemsQuery.isError ? (
          <EmptyState
            title="Could not load inventory"
            description="Could not load inventory. Pull down to try again."
            testID="inventory-error-state"
          />
        ) : isEmpty ? (
          <EmptyState
            title="No inventory items yet"
            description="Tap Add Item to add your first product."
            testID="inventory-empty-state"
          />
        ) : isSearchNoResults ? (
          <EmptyState
            title="No items found"
            description="Try a different name or barcode number."
            testID="inventory-search-no-results"
          />
        ) : (
          <FlatList<InventoryItem>
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <InventoryItemCard
                item={item}
                onPress={() => handleSelectItem(item.id)}
                testID={`inventory-item-${item.id}`}
              />
            )}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.listContent}
            testID="inventory-item-list"
          />
        )}
      </View>

      <FAB
        icon="plus"
        label="Add Item"
        onPress={handleAddItem}
        style={styles.fab}
        color="#FFFFFF"
        testID="inventory-add-fab"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  offlineBanner: {
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineText: {
    color: '#1C1B1F',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
  searchBarWrap: {
    flex: 1,
  },
  searchHint: {
    paddingHorizontal: 16,
    paddingTop: 4,
    color: '#49454F',
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  listArea: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: '#2E7D32',
  },
});
