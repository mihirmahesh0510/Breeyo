import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { VisitType } from '@breeyo/types';

interface VisitTypeSelectorProps {
  value: VisitType;
  onChange: (type: VisitType) => void;
}

const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'general', label: 'General Consultation' },
  { value: 'surgery', label: 'Surgery' },
  { value: 'vaccination', label: 'Vaccination' },
];

export function VisitTypeSelector({ value, onChange }: VisitTypeSelectorProps) {
  return (
    <View style={styles.container}>
      {VISIT_TYPE_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  segmentSelected: {
    backgroundColor: '#C8E6C9',
  },
  label: {
    fontSize: 13,
    color: '#49454F',
    fontWeight: '500',
  },
  labelSelected: {
    color: '#1B5E20',
    fontWeight: '600',
  },
});
