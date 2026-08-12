import React, { useCallback, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, SkeletonLoader, showToast } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { useWantList } from '../hooks/useInventoryApi';
import { WantListItem } from '../components/WantListItem';
import { WhatsAppShareButton } from '../components/WhatsAppShareButton';
import { exportWantListCSV } from '../services/csv-export.service';

const COLORS = {
  onSurfaceVariant: '#49454F',
} as const;

/**
 * Want-list screen (D-06/D-24/D-28) -- items below par level, with a
 * WhatsApp share and a CSV export alternative. 3 screen states per the
 * plan: loading, populated, empty ("No items below par level" / "All items
 * are adequately stocked."), plus an error state with pull-to-refresh.
 */
export function WantListScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const queryClient = useQueryClient();
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  const wantListQuery = useWantList(activeClinicId);

  const handleItemPress = useCallback(
    (itemId: string) => {
      router.push(`/(app)/(tabs)/inventory/${itemId}` as any);
    },
    [router],
  );

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'want-list', activeClinicId] });
  }, [queryClient, activeClinicId]);

  const handleExportCSV = useCallback(async () => {
    if (!wantListQuery.data || wantListQuery.data.length === 0) return;
    setIsExportingCSV(true);
    try {
      await exportWantListCSV(wantListQuery.data, 'Breeyo Clinic');
    } catch {
      showToast('error', 'Could not export CSV. Please try again.');
    } finally {
      setIsExportingCSV(false);
    }
  }, [wantListQuery.data]);

  const items = wantListQuery.data ?? [];
  const isEmpty = !wantListQuery.isLoading && !wantListQuery.isError && items.length === 0;

  return (
    <View style={styles.container} testID="want-list-screen">
      <Stack.Screen options={{ title: 'Want List' }} />

      <Text variant="bodyMedium" style={styles.subtitle}>
        Items below par level
      </Text>

      {wantListQuery.isLoading ? (
        <SkeletonLoader type="listRow" count={6} testID="want-list-skeleton" />
      ) : wantListQuery.isError ? (
        <EmptyState
          title="Could not load want-list"
          description="Pull down to try again."
          actionLabel="Retry"
          onAction={handleRefresh}
          testID="want-list-error-state"
        />
      ) : isEmpty ? (
        <EmptyState
          title="No items below par level"
          description="All items are adequately stocked."
          testID="want-list-empty-state"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WantListItem item={item} onPress={handleItemPress} testID={`want-list-item-${item.id}`} />
          )}
          refreshing={wantListQuery.isFetching}
          onRefresh={handleRefresh}
          contentContainerStyle={styles.listContent}
          testID="want-list-flatlist"
        />
      )}

      {!isEmpty && !wantListQuery.isLoading && !wantListQuery.isError && (
        <View style={styles.footer}>
          <WhatsAppShareButton clinicId={activeClinicId} testID="want-list-whatsapp-share" />
          <Button
            variant="outlined"
            label="Export CSV"
            onPress={handleExportCSV}
            loading={isExportingCSV}
            disabled={isExportingCSV}
            testID="want-list-export-csv"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  subtitle: {
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  listContent: {
    paddingBottom: 16,
  },
  footer: {
    padding: 16,
    gap: 8,
  },
});
