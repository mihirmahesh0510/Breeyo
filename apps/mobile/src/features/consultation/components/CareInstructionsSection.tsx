import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { CARE_INSTRUCTION_CHIPS } from '@breeyo/types';
import { QuickPickChips } from './QuickPickChips';

interface CareInstructionsSectionProps {
  selectedChips: string[];
  freeText: string;
  onChipsChange: (chips: string[]) => void;
  onFreeTextChange: (text: string) => void;
}

export function CareInstructionsSection({
  selectedChips,
  freeText,
  onChipsChange,
  onFreeTextChange,
}: CareInstructionsSectionProps) {
  const chipOptions = [...CARE_INSTRUCTION_CHIPS];

  const handleToggle = (chip: string) => {
    const updated = selectedChips.includes(chip)
      ? selectedChips.filter((c) => c !== chip)
      : [...selectedChips, chip];
    onChipsChange(updated);
  };

  const handleAddCustom = (term: string) => {
    if (!selectedChips.includes(term)) {
      onChipsChange([...selectedChips, term]);
    }
  };

  // Combine preset chips with any custom ones
  const allChips = [
    ...chipOptions,
    ...selectedChips.filter((c) => !chipOptions.includes(c)),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Care Instructions</Text>
      <QuickPickChips
        chips={allChips}
        selectedChips={selectedChips}
        onToggle={handleToggle}
        onAddCustom={handleAddCustom}
      />
      <TextInput
        style={styles.textArea}
        value={freeText}
        onChangeText={onFreeTextChange}
        placeholder="Post-visit care for the pet owner..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Care instructions text input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 6,
  },
  textArea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
    marginTop: 8,
  },
});
