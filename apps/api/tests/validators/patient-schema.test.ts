import { describe, it, expect } from 'vitest';
import {
  indianMobileSchema,
  ownerRegistrationSchema,
  petRegistrationSchema,
  patientSearchSchema,
} from '@breeyo/validators';

describe('Patient Validation Schemas', () => {
  describe('indianMobileSchema', () => {
    it('accepts valid 10-digit mobile starting with 9', () => {
      expect(indianMobileSchema.parse('9876543210')).toBe('9876543210');
    });

    it('accepts valid 10-digit mobile starting with 6', () => {
      expect(indianMobileSchema.parse('6123456789')).toBe('6123456789');
    });

    it('accepts valid 10-digit mobile starting with 7', () => {
      expect(indianMobileSchema.parse('7123456789')).toBe('7123456789');
    });

    it('accepts valid 10-digit mobile starting with 8', () => {
      expect(indianMobileSchema.parse('8123456789')).toBe('8123456789');
    });

    it('rejects mobile starting with 5', () => {
      expect(() => indianMobileSchema.parse('5123456789')).toThrow();
    });

    it('rejects mobile starting with 0', () => {
      expect(() => indianMobileSchema.parse('0123456789')).toThrow();
    });

    it('rejects 9-digit number', () => {
      expect(() => indianMobileSchema.parse('987654321')).toThrow();
    });

    it('rejects 11-digit number', () => {
      expect(() => indianMobileSchema.parse('98765432101')).toThrow();
    });

    it('strips spaces before validation', () => {
      expect(indianMobileSchema.parse('98765 43210')).toBe('9876543210');
    });

    it('strips multiple spaces', () => {
      expect(indianMobileSchema.parse('987 654 3210')).toBe('9876543210');
    });
  });

  describe('ownerRegistrationSchema', () => {
    it('accepts valid input with required fields', () => {
      const result = ownerRegistrationSchema.parse({
        mobile: '9876543210',
        name: 'Rahul Kumar',
      });
      expect(result.mobile).toBe('9876543210');
      expect(result.name).toBe('Rahul Kumar');
    });

    it('accepts optional email and address', () => {
      const result = ownerRegistrationSchema.parse({
        mobile: '9876543210',
        name: 'Priya Sharma',
        email: 'priya@example.com',
        address: '123 MG Road, Bangalore',
      });
      expect(result.email).toBe('priya@example.com');
      expect(result.address).toBe('123 MG Road, Bangalore');
    });

    it('rejects empty name', () => {
      expect(() =>
        ownerRegistrationSchema.parse({ mobile: '9876543210', name: '' }),
      ).toThrow();
    });

    it('rejects invalid email format', () => {
      expect(() =>
        ownerRegistrationSchema.parse({
          mobile: '9876543210',
          name: 'Test',
          email: 'not-an-email',
        }),
      ).toThrow();
    });

    it('accepts empty string as email (optional)', () => {
      const result = ownerRegistrationSchema.parse({
        mobile: '9876543210',
        name: 'Test',
        email: '',
      });
      expect(result.email).toBe('');
    });

    it('rejects invalid mobile', () => {
      expect(() =>
        ownerRegistrationSchema.parse({ mobile: '1234567890', name: 'Test' }),
      ).toThrow();
    });

    it('accepts Hindi/Devanagari owner name (D-41)', () => {
      const result = ownerRegistrationSchema.parse({
        mobile: '9876543210',
        name: 'राहुल कुमार',
      });
      expect(result.name).toBe('राहुल कुमार');
    });

    it('accepts mixed Hindi and English name (D-41)', () => {
      const result = ownerRegistrationSchema.parse({
        mobile: '9876543210',
        name: 'Rahul राहुल Kumar',
      });
      expect(result.name).toBe('Rahul राहुल Kumar');
    });
  });

  describe('petRegistrationSchema', () => {
    it('accepts valid input with required fields only', () => {
      const result = petRegistrationSchema.parse({
        name: 'Buddy',
        species: 'DOG',
      });
      expect(result.name).toBe('Buddy');
      expect(result.species).toBe('DOG');
    });

    it('accepts all valid species', () => {
      const validSpecies = ['DOG', 'CAT', 'BIRD', 'RABBIT', 'FISH', 'REPTILE', 'OTHER'] as const;
      for (const species of validSpecies) {
        expect(() =>
          petRegistrationSchema.parse({ name: 'Pet', species }),
        ).not.toThrow();
      }
    });

    it('rejects livestock species COW (D-03)', () => {
      expect(() =>
        petRegistrationSchema.parse({ name: 'Gaumata', species: 'COW' }),
      ).toThrow();
    });

    it('rejects livestock species BUFFALO (D-03)', () => {
      expect(() =>
        petRegistrationSchema.parse({ name: 'Bhains', species: 'BUFFALO' }),
      ).toThrow();
    });

    it('rejects livestock species GOAT (D-03)', () => {
      expect(() =>
        petRegistrationSchema.parse({ name: 'Bakri', species: 'GOAT' }),
      ).toThrow();
    });

    it('accepts optional fields', () => {
      const result = petRegistrationSchema.parse({
        name: 'Buddy',
        species: 'DOG',
        breed: 'Labrador',
        birthYear: 2021,
        birthMonth: 6,
        weight: 25.5,
        color: 'Golden',
        microchipId: 'MC123456',
        notes: 'Friendly dog',
      });
      expect(result.breed).toBe('Labrador');
      expect(result.weight).toBe(25.5);
    });

    it('rejects empty pet name', () => {
      expect(() =>
        petRegistrationSchema.parse({ name: '', species: 'DOG' }),
      ).toThrow();
    });

    it('rejects negative weight', () => {
      expect(() =>
        petRegistrationSchema.parse({
          name: 'Buddy',
          species: 'DOG',
          weight: -5,
        }),
      ).toThrow();
    });

    it('rejects birth year before 1990', () => {
      expect(() =>
        petRegistrationSchema.parse({
          name: 'Buddy',
          species: 'DOG',
          birthYear: 1989,
        }),
      ).toThrow();
    });

    it('rejects birth month outside 1-12', () => {
      expect(() =>
        petRegistrationSchema.parse({
          name: 'Buddy',
          species: 'DOG',
          birthMonth: 13,
        }),
      ).toThrow();
    });

    it('accepts Hindi/Devanagari pet name (D-41)', () => {
      const result = petRegistrationSchema.parse({
        name: 'शेरू',
        species: 'DOG',
      });
      expect(result.name).toBe('शेरू');
    });
  });

  describe('patientSearchSchema', () => {
    it('accepts valid search query', () => {
      const result = patientSearchSchema.parse({ q: 'Rahul' });
      expect(result.q).toBe('Rahul');
      expect(result.limit).toBe(20);
    });

    it('rejects query shorter than 2 characters', () => {
      expect(() => patientSearchSchema.parse({ q: 'R' })).toThrow();
    });

    it('accepts custom limit', () => {
      const result = patientSearchSchema.parse({ q: 'Buddy', limit: 10 });
      expect(result.limit).toBe(10);
    });

    it('coerces string limit to number', () => {
      const result = patientSearchSchema.parse({ q: 'Buddy', limit: '10' });
      expect(result.limit).toBe(10);
    });
  });
});
