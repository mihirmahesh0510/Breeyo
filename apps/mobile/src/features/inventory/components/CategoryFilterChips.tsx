import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { BreeyoChip } from '@breeyo/ui';

export interface CategoryOption {
  value: string;
  label: string;
}

export interface CategoryFilterChipsProps {
  categories: CategoryOption[];
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
  testID?: string;
}

/**
 * Horizontal scroll of category filter chips (D-31). "All" plus the merged
 * predefined + clinic-custom categories from `useInventoryCategories` (D-61) --
 * not derived from the currently-loaded item page, so a custom category used
 * only by items outside the current filter/page still shows up as an option.
 */
export function CategoryFilterChips({
  categories,
  selectedCategory,
  onSelect,
  testID,
}: CategoryFilterChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      testID={testID}
    >
      <BreeyoChip
        label="All"
        selected={selectedCategory === null}
        onPress={() => onSelect(null)}
        testID="category-chip-all"
      />
      {categories.map((category) => (
        <BreeyoChip
          key={category.value}
          label={category.label}
          selected={selectedCategory === category.value}
          onPress={() => onSelect(category.value)}
          testID={`category-chip-${category.value}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
});
