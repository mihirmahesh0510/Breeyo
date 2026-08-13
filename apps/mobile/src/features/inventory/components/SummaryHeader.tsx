import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { SkeletonLoader } from '@breeyo/ui';
import type { InventorySummary } from '@breeyo/types';

export interface SummaryHeaderProps {
  summary: InventorySummary | undefined;
  isLoading: boolean;
  onLowStockPress: () => void;
  onExpiringPress: () => void;
  testID?: string;
}

/** Formats a rupee amount without decimals for the summary card (D-32). */
function formatRupees(value: number): string {
  return `Rs ${Math.round(value).toLocaleString('en-IN')}`;
}

function SummaryCard({
  label,
  value,
  color,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  color?: string;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <View style={styles.card} testID={testID}>
      <Text
        variant="headlineMedium"
        style={[styles.cardValue, color ? { color } : null]}
      >
        {value}
      </Text>
      <Text variant="titleMedium" style={styles.cardLabel}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={styles.pressableCard}
    >
      {content}
    </Pressable>
  );
}

export function SummaryHeader({
  summary,
  isLoading,
  onLowStockPress,
  onExpiringPress,
  testID,
}: SummaryHeaderProps) {
  if (isLoading) {
    return (
      <View style={styles.row} testID={testID ? `${testID}-loading` : undefined}>
        <SkeletonLoader type="card" count={4} testID="summary-header-skeleton" />
      </View>
    );
  }

  const totalItems = summary?.totalItems ?? 0;
  const lowStockCount = summary?.lowStockCount ?? 0;
  const expiringCount = summary?.expiringCount ?? 0;
  const totalValue = summary?.totalValue ?? 0;

  return (
    <View style={styles.row} testID={testID}>
      <SummaryCard label="Total Items" value={String(totalItems)} testID="summary-total-items" />
      <SummaryCard
        label="Low Stock"
        value={String(lowStockCount)}
        color={lowStockCount > 0 ? COLORS.tertiary : undefined}
        onPress={onLowStockPress}
        testID="summary-low-stock"
      />
      <SummaryCard
        label="Expiring Soon"
        value={String(expiringCount)}
        color={expiringCount > 0 ? COLORS.tertiary : undefined}
        onPress={onExpiringPress}
        testID="summary-expiring-soon"
      />
      <SummaryCard label="Total Value" value={formatRupees(totalValue)} testID="summary-total-value" />
    </View>
  );
}

const COLORS = {
  tertiary: '#E65100',
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  pressableCard: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  card: {
    height: 64,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F5F0EB',
    justifyContent: 'center',
  },
  cardValue: {
    fontWeight: '700',
    color: '#1C1B1F',
  },
  cardLabel: {
    color: '#49454F',
  },
});
