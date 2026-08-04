import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { ObjectiveData } from '@breeyo/types';
import { BodySystemChecklist } from './BodySystemChecklist';

interface ObjectiveSectionProps {
  data: ObjectiveData;
  onChange: (data: ObjectiveData) => void;
}

export function ObjectiveSection({ data, onChange }: ObjectiveSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Physical Examination</Text>
      <BodySystemChecklist
        systems={data.bodySystems}
        onChange={(bodySystems) => onChange({ ...data, bodySystems })}
      />
      <TextInput
        style={styles.textArea}
        value={data.notes}
        onChangeText={(notes) => onChange({ ...data, notes })}
        placeholder="Other examination findings..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Additional notes text input"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#79747E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 16,
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
    marginHorizontal: 16,
    marginTop: 12,
  },
});
