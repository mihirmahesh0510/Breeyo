/**
 * `EditPetForm`'s React-Native-free decision layer.
 *
 * `apps/mobile` cannot render a React Native component under test (see
 * `queue-board-utils.ts` for why), so the diffing and validation logic lives
 * here where it can be exercised directly.
 */

import type { Pet, Species } from '@breeyo/types';

export interface EditPetFormValues {
  name: string;
  species: Species;
  breed: string;
  birthYear: string;
  birthMonth: string;
  weight: string;
  color: string;
  microchipId: string;
  notes: string;
}

type EditablePet = Pick<
  Pet,
  'name' | 'species' | 'breed' | 'birthYear' | 'birthMonth' | 'weight' | 'color' | 'microchipId' | 'notes'
>;

export function editPetFormValuesFromPet(pet: EditablePet): EditPetFormValues {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    birthYear: pet.birthYear != null ? String(pet.birthYear) : '',
    birthMonth: pet.birthMonth != null ? String(pet.birthMonth) : '',
    weight: pet.weight != null ? String(pet.weight) : '',
    color: pet.color ?? '',
    microchipId: pet.microchipId ?? '',
    notes: pet.notes ?? '',
  };
}

export function validateEditPetForm(form: EditPetFormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.name.trim()) {
    errors.name = 'Pet name is required';
  }

  if (form.weight && (isNaN(Number(form.weight)) || Number(form.weight) < 0)) {
    errors.weight = 'Weight must be a positive number';
  }

  if (form.birthMonth) {
    const month = Number(form.birthMonth);
    if (isNaN(month) || month < 1 || month > 12) {
      errors.birthMonth = 'Birth month must be between 1 and 12';
    }
  }

  if (form.birthYear) {
    const year = Number(form.birthYear);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > currentYear) {
      errors.birthYear = `Birth year must be between 1900 and ${currentYear}`;
    }
  }

  return errors;
}

export function buildPetUpdates(
  form: EditPetFormValues,
  pet: EditablePet,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    name: form.name.trim(),
  };

  if (form.species !== pet.species) {
    updates.species = form.species;
  }
  if (form.breed.trim() !== (pet.breed ?? '')) {
    updates.breed = form.breed.trim() || null;
  }
  const priorBirthYear = pet.birthYear != null ? String(pet.birthYear) : '';
  if (form.birthYear !== priorBirthYear) {
    updates.birthYear = form.birthYear ? Number(form.birthYear) : null;
  }
  const priorBirthMonth = pet.birthMonth != null ? String(pet.birthMonth) : '';
  if (form.birthMonth !== priorBirthMonth) {
    updates.birthMonth = form.birthMonth ? Number(form.birthMonth) : null;
  }
  if (form.weight !== (pet.weight != null ? String(pet.weight) : '')) {
    updates.weight = form.weight ? Number(form.weight) : null;
  }
  if (form.color.trim() !== (pet.color ?? '')) {
    updates.color = form.color.trim() || null;
  }
  if (form.microchipId.trim() !== (pet.microchipId ?? '')) {
    updates.microchipId = form.microchipId.trim() || null;
  }
  if (form.notes.trim() !== (pet.notes ?? '')) {
    updates.notes = form.notes.trim() || null;
  }

  return updates;
}
