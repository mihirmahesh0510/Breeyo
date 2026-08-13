import React from 'react';
import { View, Pressable, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCategoryIcon, getCategoryLabel, getStockLevelStatus } from '@breeyo/types';
import type { InventoryItem } from '@breeyo/types';

export interface InventoryItemCardProps {
  item: InventoryItem;
  /**
   * Nearest active-batch expiry, if known. The list API (GET /inventory/items)
   * does not currently return per-item batch/expiry data (only the
   * expiry_asc SORT resolves it server-side), so callers on the default sort
   * order will typically render this card without an expiry badge until a
   * future API pass adds it to the list payload -- see 05-04-SUMMARY.md.
   */
  nearestExpiry?: Date | null;
  onPress: () => void;
  testID?: string;
}

const COLORS = {
  primary: '#2E7D32',
  tertiary: '#E65100',
  tertiaryContainer: '#FFE0B2',
  onTertiaryContainer: '#BF360C',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  onSurfaceVariant: '#49454F',
  surfaceVariant: '#F5F0EB',
} as const;

const STOCK_STATUS_COLOR: Record<string, string> = {
  healthy: COLORS.primary,
  warning: COLORS.tertiary,
  critical: COLORS.error,
  no_par_level: COLORS.onSurfaceVariant,
};

function formatExpiryBadge(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Exp: ${day} ${months[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
}

export function InventoryItemCard({ item, nearestExpiry, onPress, testID }: InventoryItemCardProps) {
  const status = getStockLevelStatus(item.currentStock, item.parLevel);
  const stockColor = STOCK_STATUS_COLOR[status];
  const isOutOfStock = item.currentStock === 0;

  const now = new Date();
  const isExpired = !!nearestExpiry && nearestExpiry.getTime() <= now.getTime();

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${getCategoryLabel(item.category)}`}
      testID={testID}
    >
      <View style={styles.iconWrap}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.photo} />
        ) : (
          <MaterialCommunityIcons
            name={getCategoryIcon(item.category) as any}
            size={28}
            color={COLORS.onSurfaceVariant}
          />
        )}
      </View>

      <View style={styles.centerColumn}>
        <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="bodySmall" style={styles.category}>
          {getCategoryLabel(item.category)}
        </Text>
        <View style={styles.badgeRow}>
          {nearestExpiry && (
            <View
              style={[
                styles.badge,
                { backgroundColor: isExpired ? COLORS.errorContainer : COLORS.tertiaryContainer },
              ]}
            >
              <Text
                variant="labelSmall"
                style={{ color: isExpired ? COLORS.onErrorContainer : COLORS.onTertiaryContainer }}
              >
                {formatExpiryBadge(nearestExpiry)}
              </Text>
            </View>
          )}
          {item.scheduleH && (
            <View style={[styles.badge, { backgroundColor: COLORS.tertiaryContainer }]}>
              <Text variant="labelSmall" style={{ color: COLORS.onTertiaryContainer }}>
                Schedule H
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.rightColumn}>
        {isOutOfStock ? (
          <Text variant="bodySmall" style={[styles.stockText, { color: COLORS.error }]}>
            Out of stock
          </Text>
        ) : (
          <Text variant="bodySmall" style={[styles.stockText, { color: stockColor }]}>
            In stock: {item.currentStock} {item.unit}
          </Text>
        )}
        <Text variant="bodySmall" style={styles.priceText}>
          Rs {item.sellingPrice}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 72,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  photo: {
    width: 40,
    height: 40,
  },
  centerColumn: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#1C1B1F',
    fontWeight: '600',
  },
  category: {
    color: COLORS.onSurfaceVariant,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rightColumn: {
    alignItems: 'flex-end',
  },
  stockText: {
    fontWeight: '500',
  },
  priceText: {
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
});
