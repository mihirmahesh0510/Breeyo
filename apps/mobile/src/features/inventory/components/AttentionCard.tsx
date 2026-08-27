import React, { useState } from 'react';
import { View, Pressable, FlatList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Card, colors as COLORS } from '@breeyo/ui';
import type { LowStockItem, ExpiringBatchItem } from '@breeyo/types';
import type { AlertCounts } from '../hooks/useInventoryApi';

export interface AttentionCardAlerts {
  lowStock: LowStockItem[];
  expiringSoon: ExpiringBatchItem[];
  expired: ExpiringBatchItem[];
  counts: AlertCounts;
}

export interface AttentionCardProps {
  alerts: AttentionCardAlerts | undefined;
  onItemPress: (itemId: string) => void;
  testID?: string;
}

type AttentionTab = 'lowStock' | 'expiringSoon' | 'expired';

/** DD MMM YYYY formatting, matching the convention used across other feature files in this repo. */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function TabButton({
  label,
  count,
  selected,
  badgeColor,
  onPress,
  testID,
}: {
  label: string;
  count: number;
  selected: boolean;
  badgeColor: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, selected ? styles.tabButtonSelected : null]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Text
        variant="labelSmall"
        style={[styles.tabLabel, selected ? { color: badgeColor } : null]}
      >
        {label} ({count})
      </Text>
    </Pressable>
  );
}

function EmptyTabMessage({ text }: { text: string }) {
  return (
    <View style={styles.emptyTab}>
      <Text variant="bodySmall" style={styles.emptyTabText}>
        {text}
      </Text>
    </View>
  );
}

export function AttentionCard({ alerts, onItemPress, testID }: AttentionCardProps) {
  const [activeTab, setActiveTab] = useState<AttentionTab>('lowStock');

  const counts = alerts?.counts ?? { lowStockCount: 0, expiringCount: 0, expiredCount: 0 };
  const allClear = counts.lowStockCount === 0 && counts.expiringCount === 0 && counts.expiredCount === 0;

  // D-26: hidden entirely when there is nothing to show.
  if (!alerts || allClear) {
    return null;
  }

  return (
    <Card variant="elevated" testID={testID}>
      <Card.Header>
        <Text variant="titleMedium" style={styles.title}>
          Attention Needed
        </Text>
      </Card.Header>
      <Card.Body>
        <View style={styles.tabRow} accessibilityRole="tablist">
          <TabButton
            label="Low Stock"
            count={counts.lowStockCount}
            selected={activeTab === 'lowStock'}
            badgeColor={COLORS.tertiary}
            onPress={() => setActiveTab('lowStock')}
            testID="attention-tab-low-stock"
          />
          <TabButton
            label="Expiring Soon"
            count={counts.expiringCount}
            selected={activeTab === 'expiringSoon'}
            badgeColor={COLORS.tertiary}
            onPress={() => setActiveTab('expiringSoon')}
            testID="attention-tab-expiring-soon"
          />
          <TabButton
            label="Expired"
            count={counts.expiredCount}
            selected={activeTab === 'expired'}
            badgeColor={COLORS.error}
            onPress={() => setActiveTab('expired')}
            testID="attention-tab-expired"
          />
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'lowStock' && (
            alerts.lowStock.length === 0 ? (
              <EmptyTabMessage text="All items above par level." />
            ) : (
              <FlatList
                data={alerts.lowStock}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() => onItemPress(item.id)}
                    testID={`attention-low-stock-${item.id}`}
                  >
                    <Text variant="bodySmall" style={styles.rowText}>
                      {item.name} -- {item.currentStock} left (par: {item.parLevel})
                    </Text>
                  </Pressable>
                )}
              />
            )
          )}

          {activeTab === 'expiringSoon' && (
            alerts.expiringSoon.length === 0 ? (
              <EmptyTabMessage text="No items expiring soon." />
            ) : (
              <FlatList
                data={alerts.expiringSoon}
                keyExtractor={(batch) => batch.batchId}
                scrollEnabled={false}
                renderItem={({ item: batch }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() => onItemPress(batch.itemId)}
                    testID={`attention-expiring-${batch.batchId}`}
                  >
                    <Text variant="bodySmall" style={styles.rowText}>
                      {batch.itemName} -- Batch {batch.lotNumber ?? 'N/A'} expires{' '}
                      {formatDate(batch.expiryDate)}
                    </Text>
                  </Pressable>
                )}
              />
            )
          )}

          {activeTab === 'expired' && (
            alerts.expired.length === 0 ? (
              <EmptyTabMessage text="No expired items." />
            ) : (
              <FlatList
                data={alerts.expired}
                keyExtractor={(batch) => batch.batchId}
                scrollEnabled={false}
                renderItem={({ item: batch }) => (
                  <Pressable
                    style={styles.row}
                    onPress={() => onItemPress(batch.itemId)}
                    testID={`attention-expired-${batch.batchId}`}
                  >
                    <Text variant="bodySmall" style={styles.rowText}>
                      {batch.itemName} -- Batch {batch.lotNumber ?? 'N/A'} expired{' '}
                      {formatDate(batch.expiryDate)}
                    </Text>
                  </Pressable>
                )}
              />
            )
          )}
        </View>
      </Card.Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontWeight: '700',
    color: '#1C1B1F',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabButtonSelected: {
    backgroundColor: COLORS.primaryContainer,
  },
  tabLabel: {
    color: COLORS.onSurfaceVariant,
  },
  tabContent: {
    minHeight: 48,
  },
  emptyTab: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTabText: {
    color: COLORS.onSurfaceVariant,
  },
  row: {
    height: 48,
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  rowText: {
    color: '#1C1B1F',
  },
});
