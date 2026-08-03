import { describe, it } from 'vitest';

describe('Patient Registration', () => {
  describe('register owner (PAT-01)', () => {
    it.todo('creates owner with mobile number and name for a clinic');
    it.todo('returns existing owner if mobile already registered at clinic (D-06)');
    it.todo('allows same mobile at different clinics (per-clinic uniqueness)');
    it.todo('rejects invalid mobile number format');
    it.todo('stores mobile as raw 10 digits without spaces');
  });

  describe('register pet (PAT-02)', () => {
    it.todo('creates pet linked to owner with required fields (name + species)');
    it.todo('accepts all optional fields (breed, age, weight, color, microchip, notes)');
    it.todo('rejects pet registration for non-existent owner');
    it.todo('rejects livestock species (D-03 companion animals only)');
  });

  describe('multiple pets per owner (PAT-03)', () => {
    it.todo('links multiple pets to same owner');
    it.todo('returns all pets when querying owner');
  });

  describe('combined registration via POST /api/v1/patients/register', () => {
    it.todo('registers owner and pet in a single call');
    it.todo('returns existing owner + new pet if mobile already exists (D-05/D-06)');
  });
});
