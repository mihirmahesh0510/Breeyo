import { describe, it, expect } from 'vitest';
import { parseDosageMg } from '../../src/features/prescription/utils/parseDosageMg';

describe('parseDosageMg', () => {
  it('extracts the numeric value from a bare number (assumed mg)', () => {
    expect(parseDosageMg('250')).toBe(250);
  });

  it('extracts the numeric value when the unit is mg', () => {
    expect(parseDosageMg('250mg')).toBe(250);
    expect(parseDosageMg('12.5 mg')).toBe(12.5);
    expect(parseDosageMg('250MG')).toBe(250);
  });

  it('returns null when the unit is not mg', () => {
    expect(parseDosageMg('5ml')).toBeNull();
    expect(parseDosageMg('2 tablets')).toBeNull();
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseDosageMg('')).toBeNull();
    expect(parseDosageMg('   ')).toBeNull();
    expect(parseDosageMg('as needed')).toBeNull();
  });
});
