import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  toPaise,
  fromPaise,
  formatPaiseINR,
  allocateProRata,
} from '../money.js';

describe('toPaise', () => {
  it('converts a two-decimal rupee string to integer paise', () => {
    expect(toPaise('499.99')).toBe(49999);
  });

  it('converts a whole-rupee string to integer paise', () => {
    expect(toPaise('500')).toBe(50000);
  });

  it('converts zero', () => {
    expect(toPaise(0)).toBe(0);
    expect(toPaise('0')).toBe(0);
    expect(toPaise('0.00')).toBe(0);
  });

  it('does not drift on values unrepresentable in binary floating point', () => {
    // 0.07 * 100 === 7.000000000000001 in IEEE-754 double arithmetic.
    expect(toPaise('0.07')).toBe(7);
    expect(toPaise('1234.35')).toBe(123435);
    expect(toPaise('19.99')).toBe(1999);
    expect(toPaise('1.10')).toBe(110);
    expect(toPaise('29.29')).toBe(2929);
  });

  it('accepts a Prisma Decimal (the Phase 5 sellingPrice / unitPrice column type)', () => {
    expect(toPaise(new Prisma.Decimal('499.99'))).toBe(49999);
    expect(toPaise(new Prisma.Decimal('500.00'))).toBe(50000);
    expect(toPaise(new Prisma.Decimal('0.07'))).toBe(7);
  });

  it('accepts a plain number', () => {
    expect(toPaise(499.99)).toBe(49999);
    expect(toPaise(500)).toBe(50000);
  });

  it('pads a single decimal place to two', () => {
    expect(toPaise('500.1')).toBe(50010);
    expect(toPaise(0.5)).toBe(50);
  });

  it('guards the 100x conversion error', () => {
    // The single most dangerous bug on a money boundary: treating a rupee value
    // as if it were already paise (or vice versa). A rupee value and a paise
    // value of the same magnitude must never be confused (D-31).
    expect(toPaise('500')).not.toBe(500);
    expect(toPaise('500')).toBe(50000);
    expect(toPaise('1')).toBe(100);
    expect(toPaise(new Prisma.Decimal('250'))).toBe(25000);
  });

  it('throws on a negative amount', () => {
    expect(() => toPaise('-1.00')).toThrow(/Invalid rupee amount/);
    expect(() => toPaise(-5)).toThrow(/Invalid rupee amount/);
  });

  it('throws on more than two decimal places rather than silently rounding', () => {
    // Silently rounding a third decimal is how sub-paise error enters a
    // financial record and stops an invoice reconciling.
    expect(() => toPaise('1.005')).toThrow(/Invalid rupee amount/);
    expect(() => toPaise('0.001')).toThrow(/Invalid rupee amount/);
  });

  it('throws on a non-numeric, empty or non-finite input', () => {
    expect(() => toPaise('')).toThrow(/Invalid rupee amount/);
    expect(() => toPaise('abc')).toThrow(/Invalid rupee amount/);
    expect(() => toPaise('1,234.00')).toThrow(/Invalid rupee amount/);
    expect(() => toPaise(Number.NaN)).toThrow(/Invalid rupee amount/);
    expect(() => toPaise(Number.POSITIVE_INFINITY)).toThrow(/Invalid rupee amount/);
  });

  it('names the offending value in the error message', () => {
    expect(() => toPaise('1.005')).toThrow(/1\.005/);
  });

  it('is exact for a large amount (a surgery invoice, well inside 2^53 paise)', () => {
    expect(toPaise('99999999.99')).toBe(9999999999);
  });
});

describe('fromPaise', () => {
  it('always renders exactly two decimal places', () => {
    expect(fromPaise(49999)).toBe('499.99');
    expect(fromPaise(50000)).toBe('500.00');
    expect(fromPaise(7)).toBe('0.07');
    expect(fromPaise(0)).toBe('0.00');
    expect(fromPaise(110)).toBe('1.10');
  });

  it('preserves the sign of a negative amount (a round-off delta or a refund)', () => {
    expect(fromPaise(-49999)).toBe('-499.99');
    expect(fromPaise(-50)).toBe('-0.50');
  });

  it('round-trips with toPaise', () => {
    for (const paise of [0, 1, 7, 99, 100, 1999, 49999, 123435, 9999999999]) {
      expect(toPaise(fromPaise(paise))).toBe(paise);
    }
  });
});

describe('formatPaiseINR', () => {
  it('formats paise as an Indian-grouped rupee string', () => {
    expect(formatPaiseINR(123435)).toBe('₹1,234.35');
  });

  it('formats zero with two decimal places', () => {
    expect(formatPaiseINR(0)).toBe('₹0.00');
  });

  it('uses lakh/crore grouping, not thousands grouping', () => {
    // en-IN groups as 1,23,456.78 — not 123,456.78.
    expect(formatPaiseINR(12345678)).toBe('₹1,23,456.78');
  });

  it('is stable across repeated calls (the formatter is cached, not mutated)', () => {
    expect(formatPaiseINR(49999)).toBe(formatPaiseINR(49999));
  });
});

describe('allocateProRata', () => {
  it('sums exactly to the total when the split is not clean', () => {
    const allocated = allocateProRata(100, [1, 1, 1]);
    expect(allocated.reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocated).toEqual([34, 33, 33]);
  });

  it('sums exactly to the total when every weight is zero', () => {
    const allocated = allocateProRata(7, [0, 0]);
    expect(allocated.reduce((a, b) => a + b, 0)).toBe(7);
    expect(allocated).toEqual([7, 0]);
  });

  it('returns an empty array for an empty weight list', () => {
    expect(allocateProRata(100, [])).toEqual([]);
  });

  it('returns all zeros when there is nothing to allocate', () => {
    expect(allocateProRata(0, [50000, 100000])).toEqual([0, 0]);
  });

  it('assigns the rounding remainder to the largest weight', () => {
    // 10000 across 50000/100000: 3333.33 and 6666.67 → the stray paise goes to
    // the 100000 line, which is the larger weight.
    expect(allocateProRata(10000, [50000, 100000])).toEqual([3333, 6667]);
  });

  it('breaks ties toward the lowest index so the result is deterministic', () => {
    expect(allocateProRata(10, [3, 3, 3])).toEqual([4, 3, 3]);
  });

  it('is exact for every combination of totals and weights', () => {
    const totals = [0, 1, 7, 99, 100, 997, 10000, 123457];
    const weightSets: number[][] = [
      [1],
      [1, 1],
      [1, 1, 1],
      [0, 0],
      [0, 5],
      [50000, 100000],
      [1, 2, 3, 4, 5],
      [999999, 1, 1],
      [7, 7, 7, 7, 7, 7, 7],
    ];
    for (const total of totals) {
      for (const weights of weightSets) {
        const allocated = allocateProRata(total, weights);
        expect(allocated).toHaveLength(weights.length);
        expect(allocated.reduce((a, b) => a + b, 0)).toBe(total);
        for (const part of allocated) {
          expect(Number.isInteger(part)).toBe(true);
        }
      }
    }
  });

  it('allocates a negative total exactly, for refund math (D-42)', () => {
    // A split-payment refund allocates a negative amount across legs; the
    // allocation must still close exactly and must not over-allocate the way
    // Math.floor would on a negative quotient.
    expect(allocateProRata(-100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-100);
    expect(allocateProRata(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocateProRata(-10000, [50000, 100000])).toEqual([-3333, -6667]);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const first = allocateProRata(10000, [50000, 100000, 1]);
    const second = allocateProRata(10000, [50000, 100000, 1]);
    expect(first).toEqual(second);
  });

  it('throws on a non-integer total or a negative weight', () => {
    expect(() => allocateProRata(10.5, [1, 1])).toThrow(/integer/i);
    expect(() => allocateProRata(100, [1, -1])).toThrow(/weight/i);
  });

  it('throws rather than silently losing precision above 2^53', () => {
    // total * weight is computed before the divide; past Number.MAX_SAFE_INTEGER
    // the product is no longer exact and the allocation would be wrong money.
    expect(() =>
      allocateProRata(1_000_000_000, [10_000_000_000, 1]),
    ).toThrow(/safe integer|precision/i);
  });
});
