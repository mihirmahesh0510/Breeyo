import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, SkeletonLoader, colors } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItem, useItemMovements, fetchMovementsForExport } from '../hooks/useInventoryApi';
import { exportStockMovementsCSV } from '../services/csv-export.service';
import { ItemProfileHeader } from '../components/ItemProfileHeader';
import { BatchList } from '../components/BatchList';
import { StockMovementTimeline } from '../components/StockMovementTimeline';
import { ItemDetailsTab } from '../components/ItemDetailsTab';

type DetailTab = 'batches' | 'history' | 'details';

export function InventoryItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const { activeClinicId, accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<DetailTab>('batches');
  const [movementsPage, setMovementsPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const itemQuery = useInventoryItem(activeClinicId, itemId);
  const movementsQuery = useItemMovements(activeClinicId, itemId, movementsPage);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['inventory', 'item', activeClinicId, itemId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', 'movements', activeClinicId, itemId] });
  }, [queryClient, activeClinicId, itemId]);

  const handleEdit = useCallback(() => {
    router.push(`/(app)/(tabs)/inventory/${itemId}/edit` as any);
  }, [router, itemId]);

  // Receive Stock / Dispense / Adjust flows are built in Plan 06 -- these
  // navigate to their future routes rather than performing any action here.
  const handleReceiveStock = useCallback(() => {
    router.push(`/(app)/(tabs)/inventory/${itemId}/receive` as any);
  }, [router, itemId]);
  const handleDispense = useCallback(() => {
    router.push(`/(app)/(tabs)/inventory/${itemId}/dispense` as any);
  }, [router, itemId]);
  const handleAdjust = useCallback(() => {
    router.push(`/(app)/(tabs)/inventory/${itemId}/adjust` as any);
  }, [router, itemId]);
  // Disposing an expired batch is a stock adjustment (reason='expired_disposal'),
  // also owned by Plan 06 -- routes to the same future adjust flow, pre-filled
  // with the batch to dispose.
  const handleDisposeBatch = useCallback(
    (batchId: string) => {
      router.push(`/(app)/(tabs)/inventory/${itemId}/adjust?batchId=${batchId}&reason=expired_disposal` as any);
    },
    [router, itemId],
  );
  const handleRemoveBarcode = useCallback(() => {
    router.push(`/(app)/(tabs)/inventory/${itemId}/edit` as any);
  }, [router, itemId]);

  // D-47: uses the shared csv-export.service.ts (papaparse + BOM +
  // expo-file-system + expo-sharing, per RESEARCH.md's exact pattern)
  // instead of hand-rolling CSV generation inline.
  const handleExportCSV = useCallback(async () => {
    if (!itemId || !activeClinicId) return;
    setIsExporting(true);
    try {
      const movements = await fetchMovementsForExport(accessToken, itemId);
      await exportStockMovementsCSV(movements, itemQuery.data?.name ?? 'item');
    } finally {
      setIsExporting(false);
    }
  }, [itemId, activeClinicId, accessToken, itemQuery.data?.name]);

  if (itemQuery.isLoading) {
    return (
      <View style={styles.container} testID="inventory-item-detail-loading">
        <SkeletonLoader type="card" count={1} testID="item-detail-header-skeleton" />
        <SkeletonLoader type="listRow" count={3} testID="item-detail-tabs-skeleton" />
      </View>
    );
  }

  if (itemQuery.isError || !itemQuery.data) {
    return (
      <View style={styles.centered} testID="inventory-item-detail-error">
        <EmptyState
          title="Could not load item"
          description="Could not load item. Go back and try again."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const item = itemQuery.data;
  const batches = item.batches ?? [];
  const latestPurchasePrice = batches.find((b) => b.purchasePrice != null)?.purchasePrice ?? null;
  const latestSupplier = batches.find((b) => b.supplier)?.supplier ?? null;
  const movements = movementsQuery.data?.movements ?? [];
  const hasMoreMovements = movementsQuery.data
    ? movementsQuery.data.page * movementsQuery.data.limit < movementsQuery.data.total
    : false;

  return (
    <>
      <Stack.Screen
        options={{
          title: item.name,
          headerRight: () => (
            <Button variant="text" label="Edit" onPress={handleEdit} testID="item-detail-edit-button" />
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={itemQuery.isFetching} onRefresh={handleRefresh} tintColor={colors.primary} />}
        testID="inventory-item-detail-screen"
      >
        <ItemProfileHeader item={item} latestPurchasePrice={latestPurchasePrice} testID="item-detail-header" />

        <View style={styles.tabBar}>
          <TabButton label={`Batches (${batches.length})`} active={activeTab === 'batches'} onPress={() => setActiveTab('batches')} testID="item-tab-batches" />
          <TabButton label="History" active={activeTab === 'history'} onPress={() => setActiveTab('history')} testID="item-tab-history" />
          <TabButton label="Details" active={activeTab === 'details'} onPress={() => setActiveTab('details')} testID="item-tab-details" />
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'batches' && (
            <BatchList batches={batches} unit={item.unit} onDispose={handleDisposeBatch} testID="item-detail-batches" />
          )}
          {activeTab === 'history' && (
            <StockMovementTimeline
              movements={movements}
              unit={item.unit}
              isLoading={movementsQuery.isFetching || isExporting}
              onLoadMore={() => setMovementsPage((p) => p + 1)}
              onExportCSV={handleExportCSV}
              hasMore={hasMoreMovements}
              testID="item-detail-history"
            />
          )}
          {activeTab === 'details' && (
            <ItemDetailsTab
              item={item}
              isEditing={false}
              onRemoveBarcode={handleRemoveBarcode}
              latestSupplier={latestSupplier}
              testID="item-detail-details"
            />
          )}
        </View>

        <View style={styles.actionsRow}>
          <Button variant="outlined" label="Receive Stock" onPress={handleReceiveStock} testID="item-detail-receive-button" />
          <Button variant="filled" label="Dispense" onPress={handleDispense} testID="item-detail-dispense-button" />
          <Button variant="text" label="Adjust" onPress={handleAdjust} testID="item-detail-adjust-button" />
        </View>
      </ScrollView>
    </>
  );
}

function TabButton({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <View style={[styles.tabButtonWrap, active ? styles.tabButtonActive : null]}>
      <Text
        variant="titleMedium"
        style={active ? styles.tabButtonTextActive : styles.tabButtonText}
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        testID={testID}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
    paddingHorizontal: 8,
  },
  tabButtonWrap: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    color: '#49454F',
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabContent: {
    minHeight: 200,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
});
