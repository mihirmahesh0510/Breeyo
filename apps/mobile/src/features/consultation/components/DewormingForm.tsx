import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import { DEWORMING_INTERVALS } from '@breeyo/types';

interface DewormingFormProps {
  petAgeDays: number;
  onDataChange: (data: DewormingFormData) => void;
}

export interface DewormingFormData {
  drugName: string;
  nextDueDate: string;
  isValid: boolean;
}

function formatDateForDisplay(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0] || '';
}

function calculateDewormingNextDue(petAgeDays: number, administeredDate: Date): Date | null {
  let intervalDays: number;

  if (petAgeDays <= DEWORMING_INTERVALS.puppy.maxAgeDays) {
    intervalDays = DEWORMING_INTERVALS.puppy.intervalDays;
  } else if (petAgeDays <= (DEWORMING_INTERVALS.kittenPuppy3to6months.maxAgeDays ?? 180)) {
    intervalDays = DEWORMING_INTERVALS.kittenPuppy3to6months.intervalDays;
  } else {
    intervalDays = DEWORMING_INTERVALS.adult.intervalDays;
  }

  const nextDue = new Date(administeredDate);
  nextDue.setDate(nextDue.getDate() + intervalDays);
  return nextDue;
}

export function DewormingForm({
  petAgeDays,
  onDataChange,
}: DewormingFormProps) {
  const [drugName, setDrugName] = useState('');
  const [nextDueDateOverride, setNextDueDateOverride] = useState('');

  // Auto-calculate next due date based on pet age
  const calculatedNextDue = useMemo(() => {
    return calculateDewormingNextDue(petAgeDays, new Date());
  }, [petAgeDays]);

  const effectiveNextDue = nextDueDateOverride || formatDateForDisplay(calculatedNextDue);

  const updateParent = useCallback(
    (name: string, nextDue: string) => {
      onDataChange({
        drugName: name,
        nextDueDate: nextDue,
        isValid: name.trim().length > 0,
      });
    },
    [onDataChange],
  );

  const handleDrugNameChange = useCallback(
    (val: string) => {
      setDrugName(val);
      updateParent(val, effectiveNextDue);
    },
    [effectiveNextDue, updateParent],
  );

  const handleNextDueOverride = useCallback(
    (val: string) => {
      setNextDueDateOverride(val);
      updateParent(drugName, val);
    },
    [drugName, updateParent],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Deworming Details</Text>

      {/* Drug Name */}
      <View style={styles.field}>
        <Text style={styles.label}>Drug Name</Text>
        <TextInput
          style={styles.input}
          value={drugName}
          onChangeText={handleDrugNameChange}
          placeholder="e.g., Praziquantel, Fenbendazole"
          placeholderTextColor="#79747E"
          accessibilityLabel="Drug name input"
        />
      </View>

      {/* Next Due Date */}
      <View style={styles.field}>
        <Text style={styles.label}>Next Due Date</Text>
        {calculatedNextDue && !nextDueDateOverride ? (
          <Text style={styles.autoCalculated}>
            Auto-calculated: {formatDateForDisplay(calculatedNextDue)}
          </Text>
        ) : null}
        <TextInput
          style={styles.input}
          value={nextDueDateOverride || formatDateForDisplay(calculatedNextDue)}
          onChangeText={handleNextDueOverride}
          placeholder="YYYY-MM-DD (auto-calculated if blank)"
          placeholderTextColor="#79747E"
          accessibilityLabel="Next due date input"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFBF5',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
  },
  autoCalculated: {
    fontSize: 12,
    color: '#2E7D32',
    fontStyle: 'italic',
    marginBottom: 4,
  },
});
