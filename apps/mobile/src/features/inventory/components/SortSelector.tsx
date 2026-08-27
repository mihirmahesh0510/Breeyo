import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet, colors } from '@breeyo/ui';
import type { InventorySortOption } from '../hooks/useInventoryApi';

export interface SortOption {
  value: InventorySortOption;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'stock_level_asc', label: 'Stock Level (Low First)' },
  { value: 'created_at_desc', label: 'Recently Added' },
  { value: 'expiry_asc', label: 'Expiring Soon' },
  { value: 'category_asc', label: 'Category' },
];

export interface SortSelectorProps {
  selectedSort: InventorySortOption;
  onSortChange: (sort: InventorySortOption) => void;
  testID?: string;
}

function getSortLabel(value: InventorySortOption): string {
  return SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Name (A-Z)';
}

/**
 * Sort selector (Claude's Discretion: bottom sheet pattern, per UI-SPEC Sort
 * Selector Behavior). Default sort: "Name (A-Z)".
 */
export function SortSelector({ selectedSort, onSortChange, testID }: SortSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <View testID={testID}>
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${getSortLabel(selectedSort)}`}
        testID="sort-selector-trigger"
      >
        <MaterialCommunityIcons name="sort" size={16} color="#49454F" />
        <Text variant="labelSmall" style={styles.triggerLabel}>
          SORT: {getSortLabel(selectedSort).toUpperCase()}
        </Text>
      </Pressable>

      <BottomSheet
        visible={open}
        onDismiss={() => setOpen(false)}
        title="Sort"
        testID="sort-selector-sheet"
      >
        {SORT_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={styles.option}
            onPress={() => {
              onSortChange(option.value);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === selectedSort }}
            testID={`sort-option-${option.value}`}
          >
            <Text
              variant="bodyLarge"
              style={option.value === selectedSort ? styles.optionSelected : styles.optionText}
            >
              {option.label}
            </Text>
            {option.value === selectedSort && (
              <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
            )}
          </Pressable>
        ))}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  triggerLabel: {
    color: '#49454F',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  optionText: {
    color: '#1C1B1F',
  },
  optionSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
