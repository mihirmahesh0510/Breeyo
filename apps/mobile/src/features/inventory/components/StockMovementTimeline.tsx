import React from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { EmptyState, colors as COLORS } from '@breeyo/ui';
import { STOCK_MOVEMENT_TYPES } from '@breeyo/types';
import type { StockMovement, MovementType } from '@breeyo/types';

export interface StockMovementTimelineProps {
  movements: StockMovement[];
  unit: string;
  isLoading: boolean;
  onLoadMore: () => void;
  onExportCSV: () => void;
  hasMore: boolean;
  testID?: string;
}

const MOVEMENT_COLOR_MAP: Record<string, string> = {
  primary: COLORS.primary,
  onSurfaceVariant: COLORS.onSurfaceVariant,
  error: COLORS.error,
};

function getMovementMeta(type: MovementType) {
  return (
    STOCK_MOVEMENT_TYPES.find((t) => t.value === type) ?? {
      value: type,
      label: type,
      icon: 'help-circle-outline',
      color: 'onSurfaceVariant',
    }
  );
}

function formatMovementLabel(movement: StockMovement, unit: string): string {
  const qty = Math.abs(movement.quantity);
  const signed = movement.quantity >= 0 ? `+${qty}` : `-${qty}`;

  switch (movement.type) {
    case 'received':
      return `Received [+${qty}] ${unit}`;
    case 'dispensed':
      return `Dispensed [-${qty}] ${unit}`;
    case 'adjusted':
      return `Adjusted [${signed}] ${unit} -- ${movement.reason ?? 'other'}`;
    case 'disposed':
      return `Disposed [-${qty}] ${unit} -- expired`;
    case 'stock_take':
      return `Stock-take [${signed}] ${unit}`;
    case 'returned':
      return `Returned [+${qty}] ${unit}`;
    default:
      return `${movement.type} [${signed}] ${unit}`;
  }
}

function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes} ${ampm}`;
}

function MovementRow({ movement, unit }: { movement: StockMovement; unit: string }) {
  const meta = getMovementMeta(movement.type);
  const color = MOVEMENT_COLOR_MAP[meta.color] ?? COLORS.onSurfaceVariant;
  const isCounterSale = movement.type === 'dispensed' && movement.consultationId === null;

  return (
    <View style={styles.row} testID={`movement-row-${movement.id}`}>
      <MaterialCommunityIcons name={meta.icon as any} size={20} color={color} style={styles.icon} />
      <View style={styles.textColumn}>
        <View style={styles.labelRow}>
          <Text variant="bodySmall" style={[styles.label, { color }]}>
            {formatMovementLabel(movement, unit)}
          </Text>
          {isCounterSale && (
            <View style={styles.counterSaleBadge}>
              <Text variant="labelSmall" style={{ color: COLORS.onSecondaryContainer }}>
                Counter Sale
              </Text>
            </View>
          )}
        </View>
        <Text variant="bodySmall" style={styles.meta}>
          {movement.userName} -- {formatTimestamp(movement.createdAt)}
        </Text>
      </View>
      <Text variant="bodySmall" style={styles.runningTotal}>
        Total: {movement.runningTotal}
      </Text>
    </View>
  );
}

export function StockMovementTimeline({
  movements,
  unit,
  isLoading,
  onLoadMore,
  onExportCSV,
  hasMore,
  testID,
}: StockMovementTimelineProps) {
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onExportCSV}
          style={styles.exportButton}
          accessibilityRole="button"
          testID="movement-export-csv-button"
        >
          <MaterialCommunityIcons name="download-outline" size={16} color={COLORS.primary} />
          <Text variant="bodySmall" style={styles.exportButtonText}>
            Export CSV
          </Text>
        </Pressable>
      </View>

      {movements.length === 0 && !isLoading ? (
        <EmptyState title="No stock movements yet" description="No stock movements yet." testID="movement-empty" />
      ) : (
        <FlatList
          data={movements}
          keyExtractor={(movement) => movement.id}
          scrollEnabled={false}
          renderItem={({ item }) => <MovementRow movement={item} unit={unit} />}
          onEndReached={() => {
            if (hasMore) onLoadMore();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  exportButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  row: {
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  icon: {
    marginRight: 8,
  },
  textColumn: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  label: {
    fontWeight: '600',
  },
  counterSaleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: COLORS.secondaryContainer,
  },
  meta: {
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  runningTotal: {
    color: COLORS.onSurfaceVariant,
    marginLeft: 8,
  },
});
