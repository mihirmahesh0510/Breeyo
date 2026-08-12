import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { SoapFieldName } from '../hooks/useVoiceTranscription';

interface AssessmentSectionProps {
  value: string;
  onChange: (text: string) => void;
  onFieldFocus?: (field: SoapFieldName) => void;
}

export function AssessmentSection({ value, onChange, onFieldFocus }: AssessmentSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Diagnosis / Assessment</Text>
      <TextInput
        style={styles.textArea}
        value={value}
        onChangeText={onChange}
        onFocus={() => onFieldFocus?.('assessment')}
        placeholder="Enter diagnosis or clinical assessment..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Assessment text input"
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
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
  },
});
