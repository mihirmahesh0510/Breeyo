import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';

interface QuickPickChipsProps {
  chips: string[];
  selectedChips: string[];
  onToggle: (chip: string) => void;
  onAddCustom: (term: string) => void;
}

export function QuickPickChips({
  chips,
  selectedChips,
  onToggle,
  onAddCustom,
}: QuickPickChipsProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTerm, setCustomTerm] = useState('');

  const handleAddCustom = () => {
    const trimmed = customTerm.trim();
    if (trimmed) {
      onAddCustom(trimmed);
      setCustomTerm('');
      setShowCustomInput(false);
    }
  };

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

        <Pressable
          style={styles.addChip}
          onPress={() => setShowCustomInput(true)}
          accessibilityRole="button"
          accessibilityLabel="Add custom item"
        >
          <Text style={styles.addChipText}>+ Add custom</Text>
        </Pressable>
      </View>

      {showCustomInput && (
        <View style={styles.customInputRow}>
          <TextInput
            style={styles.customInput}
            value={customTerm}
            onChangeText={setCustomTerm}
            placeholder="Enter custom item..."
            placeholderTextColor="#79747E"
            onSubmitEditing={handleAddCustom}
            autoFocus
          />
          <Pressable style={styles.addButton} onPress={handleAddCustom}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
          <Pressable
            style={styles.cancelButton}
            onPress={() => {
              setShowCustomInput(false);
              setCustomTerm('');
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      )}
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
  addChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderStyle: 'dashed',
  },
  addChipText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
  },
  customInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1C1B1F',
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2E7D32',
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#49454F',
    fontSize: 13,
  },
});
