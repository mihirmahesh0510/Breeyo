import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface QuickPickChipsProps {
  chips: string[];
  selectedChips: string[];
  onToggle: (chip: string) => void;
}

export function QuickPickChips({
  chips,
  selectedChips,
  onToggle,
}: QuickPickChipsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
        {chips.map((chip) => {
          const isSelected = selectedChips.includes(chip);
          return (
            <Pressable
              key={chip}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onToggle(chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {chip}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3EDF7',
    borderWidth: 1,
    borderColor: '#CAC4D0',
  },
  chipSelected: {
    backgroundColor: '#C8E6C9',
    borderColor: '#2E7D32',
  },
  chipText: {
    fontSize: 13,
    color: '#49454F',
  },
  chipTextSelected: {
    color: '#1B5E20',
    fontWeight: '500',
  },
});
