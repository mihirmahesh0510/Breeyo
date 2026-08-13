import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import type { VitalsData } from '@breeyo/types';
import { VITALS_NORMAL_RANGES, checkVitalRange } from '@breeyo/types';

interface VitalsSectionProps {
  vitals: VitalsData;
  onChange: (vitals: VitalsData) => void;
  species: string;
}

interface VitalFieldConfig {
  key: keyof VitalsData;
  rangeKey: string;
  label: string;
  unit: string;
  placeholder: string;
}

const VITAL_FIELDS: VitalFieldConfig[] = [
  { key: 'weightKg', rangeKey: 'weightKg', label: 'Weight', unit: 'kg', placeholder: '0.0' },
  { key: 'temperatureC', rangeKey: 'temperatureC', label: 'Temperature', unit: '\u00B0C', placeholder: '38.5' },
  { key: 'heartRateBpm', rangeKey: 'heartRateBpm', label: 'Heart Rate', unit: 'bpm', placeholder: '80' },
  { key: 'respiratoryRate', rangeKey: 'respiratoryRate', label: 'Respiratory Rate', unit: 'breaths/min', placeholder: '20' },
];

const STATUS_COLORS = {
  normal: '#2E7D32',
  slightlyAbnormal: '#E65100',
  criticallyAbnormal: '#BA1A1A',
} as const;

const STATUS_BG_COLORS = {
  normal: 'transparent',
  slightlyAbnormal: 'rgba(230, 81, 0, 0.1)',
  criticallyAbnormal: 'rgba(186, 26, 26, 0.1)',
} as const;

export function VitalsSection({ vitals, onChange, species }: VitalsSectionProps) {
  const speciesRanges = VITALS_NORMAL_RANGES[species.toLowerCase()];

  const handleChange = (key: keyof VitalsData, text: string) => {
    const value = text === '' ? null : parseFloat(text);
    if (text !== '' && isNaN(value as number)) return;
    onChange({ ...vitals, [key]: value });
  };

  return (
    <View style={styles.container}>
      {VITAL_FIELDS.map((field) => {
        const value = vitals[field.key];
        const rangeInfo = speciesRanges?.[field.rangeKey];
        const rangeCheck =
          value !== null && value !== undefined
            ? checkVitalRange(species, field.rangeKey, value)
            : null;
        const status = rangeCheck?.status || 'normal';
        const borderColor = value !== null ? STATUS_COLORS[status] : '#CAC4D0';
        const bgColor = STATUS_BG_COLORS[status];

        return (
          <View key={field.key} style={styles.fieldContainer}>
            <Text style={styles.label}>
              {field.label} ({field.unit})
            </Text>
            <TextInput
              style={[
                styles.input,
                { borderColor, backgroundColor: bgColor || '#FFFBF5' },
              ]}
              value={value !== null && value !== undefined ? String(value) : ''}
              onChangeText={(text) => handleChange(field.key, text)}
              placeholder={field.placeholder}
              placeholderTextColor="#79747E"
              keyboardType="numeric"
              accessibilityLabel={`${field.label} input`}
            />
            {rangeInfo && (
              <Text style={styles.rangeHint}>
                Normal: {rangeInfo.min}-{rangeInfo.max} {rangeInfo.unit}
              </Text>
            )}
            {rangeCheck && status !== 'normal' && (
              <Text style={[styles.warningText, { color: STATUS_COLORS[status] }]}>
                Outside normal range for {species}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  fieldContainer: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#1C1B1F',
  },
  rangeHint: {
    fontSize: 11,
    color: '#79747E',
  },
  warningText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
