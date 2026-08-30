import { describe, it, expect } from 'vitest';
import { isRequiredFieldsValid } from '../item-form-validation';

const VALID = {
  name: 'Amoxicillin 250mg',
  category: 'Medicine',
  unit: 'Tablet',
  sellingPrice: '45',
};

describe('isRequiredFieldsValid (E2E-BUG-FIX-PLAN.md §5.1)', () => {
  it('is valid when name, category, unit and a positive price are all set', () => {
    expect(isRequiredFieldsValid(VALID)).toBe(true);
  });

  it('is invalid when name is blank', () => {
    expect(isRequiredFieldsValid({ ...VALID, name: '  ' })).toBe(false);
  });

  it('is invalid when category is blank', () => {
    expect(isRequiredFieldsValid({ ...VALID, category: '' })).toBe(false);
  });

  it('is invalid when unit is blank', () => {
    expect(isRequiredFieldsValid({ ...VALID, unit: '' })).toBe(false);
  });

  it('is invalid when selling price is blank', () => {
    expect(isRequiredFieldsValid({ ...VALID, sellingPrice: '' })).toBe(false);
  });

  it('is invalid when selling price is zero or negative', () => {
    expect(isRequiredFieldsValid({ ...VALID, sellingPrice: '0' })).toBe(false);
    expect(isRequiredFieldsValid({ ...VALID, sellingPrice: '-5' })).toBe(false);
  });

  it('is invalid when selling price is not a number', () => {
    expect(isRequiredFieldsValid({ ...VALID, sellingPrice: 'abc' })).toBe(false);
  });
});
