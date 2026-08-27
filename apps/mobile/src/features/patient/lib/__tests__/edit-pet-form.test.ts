import { describe, it, expect } from 'vitest';
import type { Pet } from '@breeyo/types';
import { buildPetUpdates, validateEditPetForm } from '../edit-pet-form';

const PET: Pet = {
  id: 'pet-1',
  name: 'Buddy',
  species: 'DOG',
  breed: 'Labrador',
  birthYear: 2020,
  birthMonth: 6,
  weight: 25,
  color: 'Golden',
  microchipId: 'MC-1',
  notes: '',
} as any;

function formFrom(pet: Pet) {
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

describe('buildPetUpdates', () => {
  it('includes species when it changed', () => {
    const form = { ...formFrom(PET), species: 'CAT' as const };
    const updates = buildPetUpdates(form, PET);
    expect(updates.species).toBe('CAT');
  });

  it('includes birthYear and birthMonth when changed', () => {
    const form = { ...formFrom(PET), birthYear: '2019', birthMonth: '3' };
    const updates = buildPetUpdates(form, PET);
    expect(updates.birthYear).toBe(2019);
    expect(updates.birthMonth).toBe(3);
  });

  it('omits unchanged fields entirely', () => {
    const updates = buildPetUpdates(formFrom(PET), PET);
    expect(updates).not.toHaveProperty('species');
    expect(updates).not.toHaveProperty('birthYear');
    expect(updates).not.toHaveProperty('birthMonth');
    expect(updates).not.toHaveProperty('breed');
  });

  it('clears birthYear/birthMonth to null when the field is emptied', () => {
    const form = { ...formFrom(PET), birthYear: '', birthMonth: '' };
    const updates = buildPetUpdates(form, PET);
    expect(updates.birthYear).toBeNull();
    expect(updates.birthMonth).toBeNull();
  });
});

describe('validateEditPetForm', () => {
  it('requires a name', () => {
    const errors = validateEditPetForm({ ...formFrom(PET), name: '  ' });
    expect(errors.name).toBeDefined();
  });

  it('rejects a birth month outside 1-12', () => {
    const errors = validateEditPetForm({ ...formFrom(PET), birthMonth: '13' });
    expect(errors.birthMonth).toBeDefined();
  });

  it('rejects a birth year in the future', () => {
    const errors = validateEditPetForm({ ...formFrom(PET), birthYear: '2099' });
    expect(errors.birthYear).toBeDefined();
  });

  it('passes for a valid, unchanged form', () => {
    const errors = validateEditPetForm(formFrom(PET));
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
