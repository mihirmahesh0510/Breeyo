import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { PlanData, VisitType } from '@breeyo/types';
import { QUICK_PICK_CHIPS } from '@breeyo/types';
import { QuickPickChips } from './QuickPickChips';
import type { SoapFieldName } from '../hooks/useVoiceTranscription';

interface PlanSectionProps {
  data: PlanData;
  onChange: (data: PlanData) => void;
  visitType: VisitType;
  onFieldFocus?: (field: SoapFieldName) => void;
}

export function PlanSection({ data, onChange, visitType, onFieldFocus }: PlanSectionProps) {
  const chipOptions = [...QUICK_PICK_CHIPS[visitType].plan];

  const handleToggle = (chip: string) => {
    const updated = data.actionItems.includes(chip)
      ? data.actionItems.filter((c) => c !== chip)
      : [...data.actionItems, chip];
    onChange({ ...data, actionItems: updated });
  };

  // Combine preset chips with any custom ones the user has added
  const allChips = [
    ...chipOptions,
    ...data.actionItems.filter((c) => !chipOptions.includes(c)),
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Action Items</Text>
      <QuickPickChips
        chips={allChips}
        selectedChips={data.actionItems}
        onToggle={handleToggle}
      />
      <TextInput
        style={styles.textArea}
        value={data.freeText}
        onChangeText={(text) => onChange({ ...data, freeText: text })}
        onFocus={() => onFieldFocus?.('plan.freeText')}
        placeholder="Treatment plan, additional instructions..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Plan details text input"
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
