import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { WantListItem as WantListItemType } from '@breeyo/types';
import { colors as COLORS } from '@breeyo/ui';

export interface WantListItemProps {
  item: WantListItemType;
  onPress: (itemId: string) => void;
  testID?: string;
}

/**
 * Want-list row (D-06/D-24) -- 56px, balanced 12px padding per UI-SPEC:
 * "[Item Name] -- Current: [N], Par: [parLevel]", tappable through to item detail.
 */
export function WantListItem({ item, onPress, testID }: WantListItemProps) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, current stock ${item.currentStock}, par level ${item.parLevel}`}
      testID={testID}
    >
      <View style={styles.textColumn}>
        <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="bodySmall" style={styles.meta}>
          Current: {item.currentStock}, Par: {item.parLevel}
        </Text>
      </View>
      <Text variant="labelMedium" style={styles.deficit}>
        -{item.deficit} {item.unit}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  textColumn: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: '#1C1B1F',
    fontWeight: '600',
  },
  meta: {
    color: COLORS.onSurfaceVariant,
  },
  deficit: {
    color: COLORS.tertiary,
    fontWeight: '700',
  },
});
