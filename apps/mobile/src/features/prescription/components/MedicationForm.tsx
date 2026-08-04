import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type {
  DrugSearchResult,
  DrugFormulation,
  PrescriptionItem,
  DosageWarning,
  RouteOfAdmin,
} from '@breeyo/types';
import {
  MEDICATION_FREQUENCIES,
  ROUTES_OF_ADMINISTRATION,
  DURATION_OPTIONS,
} from '@breeyo/types';
import { useDosageCalculation } from '../../consultation/hooks/useDosageCalculation';
import { DosageWarningBanner } from './DosageWarning';
import { OwnerInstructionsPreview } from './OwnerInstructionsPreview';

interface MedicationFormProps {
  drug?: DrugSearchResult | null;
  existingItem?: PrescriptionItem | null;
  petWeightKg?: number;
  petSpecies?: string;
  onSave: (item: PrescriptionItem) => void;
  onCancel: () => void;
}

const FORM_ROUTE_MAP: Record<string, RouteOfAdmin> = {
  tablet: 'Oral',
  capsule: 'Oral',
  suspension: 'Oral',
  powder: 'Oral',
  injectable: 'Injectable (SC)',
  drops: 'Eye Drops',
  ointment: 'Topical',
  spray: 'Topical',
};

function ChipGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { value: string; label: string }[] | string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const displayLabel = typeof option === 'string' ? option : option.label;
          const isSelected = selected === value;
          return (
            <Pressable
              key={value}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(value)}
              accessibilityLabel={displayLabel}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextSelected,
                ]}
              >
                {displayLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function MedicationForm({
  drug,
  existingItem,
  petWeightKg,
  petSpecies,
  onSave,
  onCancel,
}: MedicationFormProps) {
  const { validateDosage, generateInstructions } = useDosageCalculation();
  const isEditing = !!existingItem;

  // Form state
  const [drugName, setDrugName] = useState(
    existingItem?.drugName || drug?.name || '',
  );
  const [selectedFormulation, setSelectedFormulation] =
    useState<DrugFormulation | null>(null);
  const [selectedFormType, setSelectedFormType] = useState(
    existingItem?.formulation || '',
  );
  const [dosage, setDosage] = useState(
    existingItem?.dosageMg?.toString() || '',
  );
  const [route, setRoute] = useState<string>(existingItem?.route || '');
  const [frequency, setFrequency] = useState(existingItem?.frequency || '');
  const [duration, setDuration] = useState(existingItem?.duration || '');
  const [customDuration, setCustomDuration] = useState('');
  const [dispensed, setDispensed] = useState(existingItem?.dispensed ?? true);
  const [clinicalNotes, setClinicalNotes] = useState(
    existingItem?.clinicalInstructions || '',
  );
  const [dosageWarning, setDosageWarning] = useState<DosageWarning | null>(
    null,
  );

  // Initialize formulation from existing item or drug
  useEffect(() => {
    if (existingItem?.formulation && drug?.formulations) {
      const match = drug.formulations.find(
        (f) => f.form === existingItem.formulation,
      );
      if (match) {
        setSelectedFormulation(match);
        setSelectedFormType(match.form);
      }
    } else if (drug?.formulations?.length === 1) {
      setSelectedFormulation(drug.formulations[0]);
      setSelectedFormType(drug.formulations[0].form);
      // Auto-suggest route
      const suggestedRoute = FORM_ROUTE_MAP[drug.formulations[0].form];
      if (suggestedRoute && !route) {
        setRoute(suggestedRoute);
      }
    }
  }, [drug, existingItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormulationSelect = useCallback(
    (formType: string) => {
      setSelectedFormType(formType);
      const match = drug?.formulations?.find((f) => f.form === formType);
      setSelectedFormulation(match || null);

      // Auto-suggest route based on formulation
      const suggestedRoute = FORM_ROUTE_MAP[formType];
      if (suggestedRoute) {
        setRoute(suggestedRoute);
      }
    },
    [drug],
  );

  // Dosage validation - debounced
  useEffect(() => {
    if (!dosage || !drug?.id || !petWeightKg || !petSpecies) {
      setDosageWarning(null);
      return;
    }

    const doseMg = parseFloat(dosage);
    if (isNaN(doseMg) || doseMg <= 0) {
      setDosageWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      const warning = await validateDosage(
        doseMg,
        petWeightKg,
        drug.id,
        petSpecies,
      );
      setDosageWarning(warning);
    }, 500);

    return () => clearTimeout(timer);
  }, [dosage, drug?.id, petWeightKg, petSpecies, validateDosage]);

  // Build partial prescription for live preview
  const partialPrescription: Partial<PrescriptionItem> = useMemo(
    () => ({
      drugName,
      formulation: selectedFormType,
      strength: selectedFormulation?.strength || '',
      dosage,
      route: route as RouteOfAdmin,
      frequency,
      duration: duration === 'Custom' ? customDuration : duration,
    }),
    [
      drugName,
      selectedFormType,
      selectedFormulation,
      dosage,
      route,
      frequency,
      duration,
      customDuration,
    ],
  );

  const ownerInstructions = useMemo(
    () => generateInstructions(partialPrescription),
    [generateInstructions, partialPrescription],
  );

  const handleSave = useCallback(() => {
    const finalDuration = duration === 'Custom' ? customDuration : duration;
    const durationDays =
      DURATION_OPTIONS.find((d) => d.value === duration)?.days ?? null;

    const item: PrescriptionItem = {
      id: existingItem?.id,
      drugId: drug?.id || null,
      drugName,
      formulationId: selectedFormulation?.id || null,
      formulation: selectedFormType,
      strength: selectedFormulation?.strength || '',
      dosage,
      dosageMg: dosage ? parseFloat(dosage) : null,
      route: (route as RouteOfAdmin) || 'Oral',
      frequency,
      duration: finalDuration,
      durationDays,
      clinicalInstructions: clinicalNotes || null,
      ownerInstructions: ownerInstructions || null,
      dispensed,
      inventoryItemId: null,
      sortOrder: existingItem?.sortOrder ?? 0,
    };

    onSave(item);
  }, [
    drug,
    drugName,
    selectedFormulation,
    selectedFormType,
    dosage,
    route,
    frequency,
    duration,
    customDuration,
    clinicalNotes,
    ownerInstructions,
    dispensed,
    existingItem,
    onSave,
  ]);

  const canSave = drugName.trim().length > 0 && frequency && duration;

  const formulationOptions = drug?.formulations?.map((f) => f.form) || [];
  const routeOptions = ROUTES_OF_ADMINISTRATION.map((r) => ({
    value: r,
    label: r,
  }));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Drug Name */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Drug Name</Text>
          <TextInput
            style={styles.textInput}
            value={drugName}
            onChangeText={setDrugName}
            placeholder="Drug name"
            placeholderTextColor="#79747E"
            editable={!drug}
          />
        </View>

        {/* Formulation Chips */}
        {formulationOptions.length > 0 && (
          <ChipGroup
            label="Formulation"
            options={formulationOptions.map((f) => ({ value: f, label: f }))}
            selected={selectedFormType}
            onSelect={handleFormulationSelect}
          />
        )}

        {/* Dosage */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Dosage (mg)</Text>
          <TextInput
            style={styles.textInput}
            value={dosage}
            onChangeText={setDosage}
            placeholder="Enter dosage in mg"
            placeholderTextColor="#79747E"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Dosage Warning */}
        {dosageWarning && petWeightKg && (
          <DosageWarningBanner warning={dosageWarning} />
        )}

        {/* Route */}
        <ChipGroup
          label="Route"
          options={routeOptions}
          selected={route}
          onSelect={setRoute}
        />

        {/* Frequency */}
        <ChipGroup
          label="Frequency"
          options={[...MEDICATION_FREQUENCIES]}
          selected={frequency}
          onSelect={setFrequency}
        />

        {/* Duration */}
        <ChipGroup
          label="Duration"
          options={[...DURATION_OPTIONS].map((d) => ({
            value: d.value,
            label: d.label,
          }))}
          selected={duration}
          onSelect={setDuration}
        />

        {/* Custom Duration Input */}
        {duration === 'Custom' && (
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Custom Duration</Text>
            <TextInput
              style={styles.textInput}
              value={customDuration}
              onChangeText={setCustomDuration}
              placeholder="e.g., 21 days"
              placeholderTextColor="#79747E"
            />
          </View>
        )}

        {/* Dispensed / Prescribed toggle */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleButton, dispensed && styles.toggleSelected]}
              onPress={() => setDispensed(true)}
              accessibilityLabel="Dispensed"
              accessibilityRole="button"
              accessibilityState={{ selected: dispensed }}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={16}
                color={dispensed ? '#FFFFFF' : '#49454F'}
              />
              <Text
                style={[
                  styles.toggleText,
                  dispensed && styles.toggleTextSelected,
                ]}
              >
                Dispensed
              </Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, !dispensed && styles.toggleSelected]}
              onPress={() => setDispensed(false)}
              accessibilityLabel="Prescribed"
              accessibilityRole="button"
              accessibilityState={{ selected: !dispensed }}
            >
              <MaterialCommunityIcons
                name="file-document-outline"
                size={16}
                color={!dispensed ? '#FFFFFF' : '#49454F'}
              />
              <Text
                style={[
                  styles.toggleText,
                  !dispensed && styles.toggleTextSelected,
                ]}
              >
                Prescribed
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Clinical Notes */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Clinical Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={clinicalNotes}
            onChangeText={setClinicalNotes}
            placeholder="Additional clinical notes..."
            placeholderTextColor="#79747E"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Owner Instructions Preview */}
        {ownerInstructions ? (
          <OwnerInstructionsPreview instructions={ownerInstructions} />
        ) : null}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={canSave ? handleSave : undefined}
          disabled={!canSave}
          accessibilityLabel={isEditing ? 'Save medication' : 'Add medication'}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.saveButtonText,
              !canSave && styles.saveButtonTextDisabled,
            ]}
          >
            {isEditing ? 'Save' : 'Add'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
  },
  multilineInput: {
    height: 80,
    paddingTop: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    backgroundColor: '#FFFBF5',
  },
  chipSelected: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  chipText: {
    fontSize: 13,
    color: '#49454F',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    backgroundColor: '#FFFBF5',
  },
  toggleSelected: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  toggleText: {
    fontSize: 13,
    color: '#49454F',
  },
  toggleTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E7E0EC',
    backgroundColor: '#FFFBF5',
  },
  cancelButton: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CAC4D0',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#49454F',
  },
  saveButton: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#2E7D32',
  },
  saveButtonDisabled: {
    backgroundColor: '#CAC4D0',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: '#79747E',
  },
});
