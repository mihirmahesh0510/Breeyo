import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  VACCINATION_INTERVALS,
  calculateNextDueDate,
} from '@breeyo/types';
import { colors } from '@breeyo/ui';

interface VaccinationFormProps {
  species: string;
  petAgeDays: number;
  onDataChange: (data: VaccinationFormData) => void;
  onGenerateCertificate?: () => void;
}

export interface VaccinationFormData {
  vaccineName: string;
  batchNumber: string;
  manufacturer: string;
  expiryDate: string;
  nextDueDate: string;
  isValid: boolean;
}

function formatDateForDisplay(date: Date | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0] || '';
}

export function VaccinationForm({
  species,
  petAgeDays,
  onDataChange,
  onGenerateCertificate,
}: VaccinationFormProps) {
  const [vaccineName, setVaccineName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [nextDueDateOverride, setNextDueDateOverride] = useState('');
  const [showVaccineList, setShowVaccineList] = useState(false);

  // Get vaccine options for this species
  const vaccineOptions = useMemo(() => {
    const speciesUpper = species.toUpperCase();
    const seen = new Set<string>();
    return VACCINATION_INTERVALS
      .filter((v) => v.species === speciesUpper)
      .filter((v) => {
        if (seen.has(v.vaccineName)) return false;
        seen.add(v.vaccineName);
        return true;
      })
      .map((v) => v.vaccineName);
  }, [species]);

  // Auto-calculate next due date
  const calculatedNextDue = useMemo(() => {
    if (!vaccineName) return null;
    return calculateNextDueDate(
      vaccineName,
      species.toUpperCase(),
      petAgeDays,
      new Date(),
    );
  }, [vaccineName, species, petAgeDays]);

  const effectiveNextDue = nextDueDateOverride || formatDateForDisplay(calculatedNextDue);

  // Notify parent of data changes
  const updateParent = useCallback(
    (name: string, batch: string, mfr: string, expiry: string, nextDue: string) => {
      onDataChange({
        vaccineName: name,
        batchNumber: batch,
        manufacturer: mfr,
        expiryDate: expiry,
        nextDueDate: nextDue,
        isValid: name.trim().length > 0,
      });
    },
    [onDataChange],
  );

  const handleVaccineSelect = useCallback(
    (name: string) => {
      setVaccineName(name);
      setShowVaccineList(false);
      setNextDueDateOverride('');
      updateParent(name, batchNumber, manufacturer, expiryDate, '');
    },
    [batchNumber, manufacturer, expiryDate, updateParent],
  );

  const handleVaccineNameChange = useCallback(
    (name: string) => {
      setVaccineName(name);
      setShowVaccineList(name.length > 0);
      updateParent(name, batchNumber, manufacturer, expiryDate, effectiveNextDue);
    },
    [batchNumber, manufacturer, expiryDate, effectiveNextDue, updateParent],
  );

  const handleBatchChange = useCallback(
    (val: string) => {
      setBatchNumber(val);
      updateParent(vaccineName, val, manufacturer, expiryDate, effectiveNextDue);
    },
    [vaccineName, manufacturer, expiryDate, effectiveNextDue, updateParent],
  );

  const handleManufacturerChange = useCallback(
    (val: string) => {
      setManufacturer(val);
      updateParent(vaccineName, batchNumber, val, expiryDate, effectiveNextDue);
    },
    [vaccineName, batchNumber, expiryDate, effectiveNextDue, updateParent],
  );

  const handleExpiryChange = useCallback(
    (val: string) => {
      setExpiryDate(val);
      updateParent(vaccineName, batchNumber, manufacturer, val, effectiveNextDue);
    },
    [vaccineName, batchNumber, manufacturer, effectiveNextDue, updateParent],
  );

  const handleNextDueOverride = useCallback(
    (val: string) => {
      setNextDueDateOverride(val);
      updateParent(vaccineName, batchNumber, manufacturer, expiryDate, val);
    },
    [vaccineName, batchNumber, manufacturer, expiryDate, updateParent],
  );

  // Filter vaccine suggestions
  const filteredVaccines = useMemo(() => {
    if (!vaccineName.trim()) return vaccineOptions;
    const lower = vaccineName.toLowerCase();
    return vaccineOptions.filter((v) => v.toLowerCase().includes(lower));
  }, [vaccineName, vaccineOptions]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Vaccination Details</Text>

      {/* Vaccine Name */}
      <View style={styles.field}>
        <Text style={styles.label}>Vaccine Name</Text>
        <TextInput
          style={styles.input}
          value={vaccineName}
          onChangeText={handleVaccineNameChange}
          placeholder="Search or type vaccine name"
          placeholderTextColor="#79747E"
          onFocus={() => setShowVaccineList(true)}
          accessibilityLabel="Vaccine name input"
        />
        {showVaccineList && filteredVaccines.length > 0 && (
          <View style={styles.dropdownList}>
            {filteredVaccines.map((name) => (
              <Pressable
                key={name}
                style={styles.dropdownItem}
                onPress={() => handleVaccineSelect(name)}
              >
                <Text style={styles.dropdownText}>{name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Batch / Lot Number */}
      <View style={styles.field}>
        <Text style={styles.label}>Batch / Lot Number</Text>
        <TextInput
          style={styles.input}
          value={batchNumber}
          onChangeText={handleBatchChange}
          placeholder="e.g., LOT-2024-001"
          placeholderTextColor="#79747E"
          accessibilityLabel="Batch number input"
        />
      </View>

      {/* Manufacturer */}
      <View style={styles.field}>
        <Text style={styles.label}>Manufacturer</Text>
        <TextInput
          style={styles.input}
          value={manufacturer}
          onChangeText={handleManufacturerChange}
          placeholder="e.g., Nobivac, Canigen"
          placeholderTextColor="#79747E"
          accessibilityLabel="Manufacturer input"
        />
      </View>

      {/* Expiry Date */}
      <View style={styles.field}>
        <Text style={styles.label}>Expiry Date</Text>
        <TextInput
          style={styles.input}
          value={expiryDate}
          onChangeText={handleExpiryChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#79747E"
          accessibilityLabel="Expiry date input"
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

      {/* Generate Certificate Button */}
      {onGenerateCertificate && (
        <Pressable
          style={styles.certificateButton}
          onPress={onGenerateCertificate}
        >
          <Text style={styles.certificateButtonText}>Generate Certificate</Text>
        </Pressable>
      )}
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
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginTop: 2,
    maxHeight: 150,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  dropdownText: {
    fontSize: 14,
    color: '#1C1B1F',
  },
  certificateButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  certificateButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
});
