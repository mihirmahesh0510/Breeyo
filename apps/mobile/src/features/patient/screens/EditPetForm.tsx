import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Button, FormField } from '@breeyo/ui';
import type { Pet } from '@breeyo/types';
import { SpeciesBreedPicker } from '../components/SpeciesBreedPicker';
import { buildPetUpdates, editPetFormValuesFromPet, validateEditPetForm } from '../lib/edit-pet-form';

interface EditPetFormProps {
  pet: Pet;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function EditPetForm({ pet, onSave, onCancel, isSaving }: EditPetFormProps) {
  const [form, setForm] = useState(() => editPetFormValuesFromPet(pet));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = async () => {
    const newErrors = validateEditPetForm(form);
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    await onSave(buildPetUpdates(form, pet));
  };

  return (
    <View style={styles.container} testID="edit-pet-form">
      <Text variant="titleLarge" style={styles.title}>
        Edit Pet Details
      </Text>

      <View style={styles.fieldGroup}>
        <FormField
          label="Name"
          value={form.name}
          onChangeText={(name) => setForm((f) => ({ ...f, name }))}
          error={errors.name}
          required
          testID="edit-pet-name"
        />
      </View>

      <View style={styles.fieldGroup}>
        <SpeciesBreedPicker
          species={form.species}
          breed={form.breed}
          onSpeciesChange={(species) => setForm((f) => ({ ...f, species }))}
          onBreedChange={(breed) => setForm((f) => ({ ...f, breed }))}
          testID="edit-pet-species-breed"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Birth Year"
          value={form.birthYear}
          onChangeText={(birthYear) => setForm((f) => ({ ...f, birthYear }))}
          error={errors.birthYear}
          testID="edit-pet-birth-year"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Birth Month (1-12)"
          value={form.birthMonth}
          onChangeText={(birthMonth) => setForm((f) => ({ ...f, birthMonth }))}
          error={errors.birthMonth}
          testID="edit-pet-birth-month"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Weight (kg)"
          value={form.weight}
          onChangeText={(weight) => setForm((f) => ({ ...f, weight }))}
          error={errors.weight}
          testID="edit-pet-weight"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Color"
          value={form.color}
          onChangeText={(color) => setForm((f) => ({ ...f, color }))}
          testID="edit-pet-color"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Microchip ID"
          value={form.microchipId}
          onChangeText={(microchipId) => setForm((f) => ({ ...f, microchipId }))}
          testID="edit-pet-microchip"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Notes"
          value={form.notes}
          onChangeText={(notes) => setForm((f) => ({ ...f, notes }))}
          testID="edit-pet-notes"
        />
      </View>

      <View style={styles.actions}>
        <Button
          variant="outlined"
          label="Cancel"
          onPress={onCancel}
          disabled={isSaving}
          testID="edit-pet-cancel"
        />
        <Button
          variant="filled"
          label="Save"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          testID="edit-pet-save"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontWeight: '700',
    marginBottom: 16,
    color: '#1C1B1F',
  },
  fieldGroup: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
});
