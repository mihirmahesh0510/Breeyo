import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Button, FormField } from '@breeyo/ui';
import type { Pet } from '@breeyo/types';

interface EditPetFormProps {
  pet: Pet;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function EditPetForm({ pet, onSave, onCancel, isSaving }: EditPetFormProps) {
  const [name, setName] = useState(pet.name);
  const [breed, setBreed] = useState(pet.breed ?? '');
  const [weight, setWeight] = useState(pet.weight != null ? String(pet.weight) : '');
  const [color, setColor] = useState(pet.color ?? '');
  const [microchipId, setMicrochipId] = useState(pet.microchipId ?? '');
  const [notes, setNotes] = useState(pet.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Pet name is required';
    }

    if (weight && (isNaN(Number(weight)) || Number(weight) < 0)) {
      newErrors.weight = 'Weight must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    const updates: Record<string, unknown> = {
      name: name.trim(),
    };

    // Only include changed fields
    if (breed.trim() !== (pet.breed ?? '')) {
      updates.breed = breed.trim() || null;
    }
    if (weight !== (pet.weight != null ? String(pet.weight) : '')) {
      updates.weight = weight ? Number(weight) : null;
    }
    if (color.trim() !== (pet.color ?? '')) {
      updates.color = color.trim() || null;
    }
    if (microchipId.trim() !== (pet.microchipId ?? '')) {
      updates.microchipId = microchipId.trim() || null;
    }
    if (notes.trim() !== (pet.notes ?? '')) {
      updates.notes = notes.trim() || null;
    }

    await onSave(updates);
  };

  return (
    <View style={styles.container} testID="edit-pet-form">
      <Text variant="titleLarge" style={styles.title}>
        Edit Pet Details
      </Text>

      <View style={styles.fieldGroup}>
        <FormField
          label="Name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          required
          testID="edit-pet-name"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Breed"
          value={breed}
          onChangeText={setBreed}
          testID="edit-pet-breed"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Weight (kg)"
          value={weight}
          onChangeText={setWeight}
          error={errors.weight}
          testID="edit-pet-weight"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Color"
          value={color}
          onChangeText={setColor}
          testID="edit-pet-color"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Microchip ID"
          value={microchipId}
          onChangeText={setMicrochipId}
          testID="edit-pet-microchip"
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Notes"
          value={notes}
          onChangeText={setNotes}
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
