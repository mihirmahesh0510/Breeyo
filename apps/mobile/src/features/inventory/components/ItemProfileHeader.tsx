import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCategoryIcon, getCategoryLabel, getStockLevelStatus } from '@breeyo/types';
import type { InventoryItem } from '@breeyo/types';

export interface ItemProfileHeaderProps {
  item: InventoryItem;
  /** Latest batch purchase price, if any active batch has one. */
  latestPurchasePrice?: number | null;
  testID?: string;
}

const COLORS = {
  primary: '#2E7D32',
  tertiary: '#E65100',
  tertiaryContainer: '#FFE0B2',
  onTertiaryContainer: '#BF360C',
  error: '#BA1A1A',
  onSurfaceVariant: '#49454F',
  surfaceVariant: '#F5F0EB',
} as const;

const STOCK_STATUS_COLOR: Record<string, string> = {
  healthy: COLORS.primary,
  warning: COLORS.tertiary,
  critical: COLORS.error,
  no_par_level: COLORS.onSurfaceVariant,
};

export function ItemProfileHeader({ item, latestPurchasePrice, testID }: ItemProfileHeaderProps) {
  const status = getStockLevelStatus(item.currentStock, item.parLevel);
  const stockColor = STOCK_STATUS_COLOR[status];

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.topRow}>
        <View style={styles.photoWrap}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.photo} />
          ) : (
            <MaterialCommunityIcons
              name={getCategoryIcon(item.category) as any}
              size={32}
              color={COLORS.onSurfaceVariant}
            />
          )}
        </View>

        <View style={styles.infoColumn}>
          <Text variant="headlineMedium" style={styles.name}>
            {item.name}
          </Text>

          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <MaterialCommunityIcons
                name={getCategoryIcon(item.category) as any}
                size={14}
                color={COLORS.onSurfaceVariant}
              />
              <Text variant="bodySmall" style={styles.categoryLabel}>
                {getCategoryLabel(item.category)}
              </Text>
            </View>
            {item.scheduleH && (
              <View style={styles.scheduleHBadge}>
                <Text variant="labelSmall" style={{ color: COLORS.onTertiaryContainer }}>
                  Schedule H
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <Text variant="headlineMedium" style={[styles.stockLine, { color: stockColor }]}>
        In stock: {item.currentStock} {item.unit}
      </Text>

      <Text variant="bodyLarge" style={styles.sellingPrice}>
        Selling: Rs {item.sellingPrice}
      </Text>

      {latestPurchasePrice != null && (
        <Text variant="bodySmall" style={styles.purchasePrice}>
          Purchase: Rs {latestPurchasePrice}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  photoWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  photo: {
    width: 56,
    height: 56,
  },
  infoColumn: {
    flex: 1,
  },
  name: {
    color: '#1C1B1F',
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryLabel: {
    color: COLORS.onSurfaceVariant,
  },
  scheduleHBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: COLORS.tertiaryContainer,
  },
  stockLine: {
    fontWeight: '700',
    marginBottom: 4,
  },
  sellingPrice: {
    color: '#1C1B1F',
  },
  purchasePrice: {
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
});
