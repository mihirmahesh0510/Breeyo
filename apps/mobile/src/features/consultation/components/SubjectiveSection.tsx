import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { SubjectiveData, VisitType } from '@breeyo/types';
import { QUICK_PICK_CHIPS } from '@breeyo/types';
import { QuickPickChips } from './QuickPickChips';

interface SubjectiveSectionProps {
  data: SubjectiveData;
  onChange: (data: SubjectiveData) => void;
  visitType: VisitType;
}

export function SubjectiveSection({ data, onChange, visitType }: SubjectiveSectionProps) {
  const chipOptions = [...QUICK_PICK_CHIPS[visitType].subjective];

  const handleToggleChip = (chip: string) => {
    const updated = data.chips.includes(chip)
      ? data.chips.filter((c) => c !== chip)
      : [...data.chips, chip];
    onChange({ ...data, chips: updated });
  };

  const handleAddCustomChip = (term: string) => {
    if (!data.chips.includes(term)) {
      onChange({ ...data, chips: [...data.chips, term] });
    }
  };

  // Combine preset chips with any custom ones the user has added
  const allChips = [
    ...chipOptions,
    ...data.chips.filter((c) => !chipOptions.includes(c)),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Owner Reports</Text>
      <QuickPickChips
        chips={allChips}
        selectedChips={data.chips}
        onToggle={handleToggleChip}
        onAddCustom={handleAddCustomChip}
      />
      <TextInput
        style={styles.textArea}
        value={data.ownerReports}
        onChangeText={(text) => onChange({ ...data, ownerReports: text })}
        placeholder="What did the owner report?"
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Owner reports text input"
      />

      <Text style={[styles.sectionLabel, styles.historyLabel]}>History</Text>
      <TextInput
        style={styles.textArea}
        value={data.history}
        onChangeText={(text) => onChange({ ...data, history: text })}
        placeholder="Presentation history, prior conditions..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="History text input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#79747E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  historyLabel: {
    marginTop: 16,
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
