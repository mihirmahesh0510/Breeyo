import { describe, it, expect } from 'vitest';
import {
  formatPaiseINR,
  formatPaiseCompact,
  invoiceStatusLabel,
  invoiceStatusColors,
} from '../lib/format';

/**
 * The cross-implementation table.
 *
 * These seven expected strings are the output of the API's
 * `apps/api/src/modules/billing/money.ts#formatPaiseINR` for the same seven
 * inputs. They are hardcoded here rather than imported because the API module
 * pulls in `@prisma/client`, which cannot load in the mobile test environment —
 * so the guard against the two implementations drifting apart has to be a
 * literal table, not a shared import.
 *
 * If someone changes either formatter's `Intl` options (locale, currency,
 * fraction digits), one of these rows fails.
 */
const API_PARITY_TABLE: ReadonlyArray<[number, string]> = [
  [0, '₹0.00'],
  [1, '₹0.01'],
  [99, '₹0.99'],
  [100, '₹1.00'],
  [50000, '₹500.00'],
  [123435, '₹1,234.35'],
  [100000000, '₹10,00,000.00'],
];

describe('formatPaiseINR', () => {
  it('renders paise as a rupee currency string with Indian grouping', () => {
    expect(formatPaiseINR(123435)).toBe('₹1,234.35');
    expect(formatPaiseINR(0)).toBe('₹0.00');
    expect(formatPaiseINR(50000)).toBe('₹500.00');
  });

  it('groups in lakhs and crores, not thousands', () => {
    // 10 lakh. Thousands grouping would produce ₹1,000,000.00.
    expect(formatPaiseINR(100000000)).toBe('₹10,00,000.00');
  });

  it('renders a negative amount with the sign ahead of the symbol (credit notes, refunds)', () => {
    expect(formatPaiseINR(-50000)).toBe('-₹500.00');
  });

  it('renders sub-rupee negatives without losing the sign', () => {
    expect(formatPaiseINR(-50)).toBe('-₹0.50');
  });

  it.each(API_PARITY_TABLE)(
    'agrees with the API formatter for %i paise',
    (paise, expected) => {
      expect(formatPaiseINR(paise)).toBe(expected);
    },
  );

  it('throws on a non-integer input, naming the value', () => {
    // 1234.35 is a rupee float that leaked past the paise boundary. Rendering
    // it would show ₹12.34 for ₹1,234.35 — the 100x error D-31 exists to stop.
    expect(() => formatPaiseINR(1234.35)).toThrow(/1234\.35/);
  });

  it('throws on NaN and Infinity rather than rendering "₹NaN"', () => {
    expect(() => formatPaiseINR(Number.NaN)).toThrow();
    expect(() => formatPaiseINR(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('formatPaiseCompact', () => {
  it('drops the paise component for a whole-rupee amount above ₹999', () => {
    expect(formatPaiseCompact(12345600)).toBe('₹1,23,456');
    expect(formatPaiseCompact(100000)).toBe('₹1,000');
  });

  it('keeps the paise component when the amount is not a whole rupee', () => {
    // Rounding here would misstate money on a card staff read to collect cash.
    expect(formatPaiseCompact(123435)).toBe('₹1,234.35');
  });

  it('keeps the paise component at or below ₹999, where the full string fits', () => {
    expect(formatPaiseCompact(50000)).toBe('₹500.00');
    expect(formatPaiseCompact(99900)).toBe('₹999.00');
    expect(formatPaiseCompact(0)).toBe('₹0.00');
  });

  it('throws on a non-integer input, like formatPaiseINR', () => {
    expect(() => formatPaiseCompact(1234.35)).toThrow();
  });
});

describe('invoiceStatusLabel', () => {
  it('returns the uppercase badge label for every status', () => {
    expect(invoiceStatusLabel('DRAFT')).toBe('DRAFT');
    expect(invoiceStatusLabel('PAID')).toBe('PAID');
    expect(invoiceStatusLabel('PARTIALLY_PAID')).toBe('PARTIALLY PAID');
    expect(invoiceStatusLabel('OVERDUE')).toBe('OVERDUE');
    expect(invoiceStatusLabel('VOIDED')).toBe('VOIDED');
  });

  it('D-46: labels FINALIZED and UNPAID distinctly enough to tell apart at a glance', () => {
    const finalized = invoiceStatusLabel('FINALIZED');
    const unpaid = invoiceStatusLabel('UNPAID');

    expect(finalized).not.toBe(unpaid);
    expect(finalized).toBe('AWAITING PAYMENT');
    expect(unpaid).toBe('UNPAID');
  });
});

describe('invoiceStatusColors', () => {
  it('encodes the UI-SPEC Invoice Status Color Map verbatim', () => {
    expect(invoiceStatusColors('DRAFT')).toMatchObject({
      background: '#F5F0EB',
      text: '#49454F',
    });
    expect(invoiceStatusColors('PAID')).toMatchObject({
      background: '#DCE4FA',
      text: '#1E2A6E',
    });
    expect(invoiceStatusColors('PARTIALLY_PAID')).toMatchObject({
      background: '#DCE4FA',
      text: '#1E2A6E',
    });
    expect(invoiceStatusColors('OVERDUE')).toMatchObject({
      background: '#FFE0B2',
      text: '#BF360C',
    });
    expect(invoiceStatusColors('VOIDED')).toMatchObject({
      background: '#FFDAD6',
      text: '#410002',
    });
    expect(invoiceStatusColors('FINALIZED')).toMatchObject({
      background: '#D7CCC8',
      text: '#3E2723',
    });
  });

  it('D-46: FINALIZED and UNPAID are visually distinguishable, not identical swatches', () => {
    const finalized = invoiceStatusColors('FINALIZED');
    const unpaid = invoiceStatusColors('UNPAID');

    // The UI-SPEC colour map gives both `secondaryContainer`. Identical
    // swatches plus near-identical meaning is exactly the confusion D-46 names.
    const finalizedSwatch = `${finalized.background}/${finalized.text}/${finalized.border ?? 'none'}`;
    const unpaidSwatch = `${unpaid.background}/${unpaid.text}/${unpaid.border ?? 'none'}`;
    expect(finalizedSwatch).not.toBe(unpaidSwatch);

    // Unpaid escalates toward the Overdue treatment: same body, tertiary outline.
    expect(unpaid.border).toBe('#E65100');
    expect(finalized.border).toBeUndefined();
  });

  it('returns a colour pair for every status in the union', () => {
    const statuses = [
      'DRAFT',
      'FINALIZED',
      'UNPAID',
      'PARTIALLY_PAID',
      'PAID',
      'OVERDUE',
      'VOIDED',
    ] as const;

    for (const status of statuses) {
      const colors = invoiceStatusColors(status);
      expect(colors.background).toMatch(/^#[0-9A-F]{6}$/i);
      expect(colors.text).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
