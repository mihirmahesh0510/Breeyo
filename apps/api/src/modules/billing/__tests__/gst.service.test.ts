import { describe, it, expect } from 'vitest';
import {
  allocateInvoiceDiscount,
  computeInvoiceTax,
  type TaxableLine,
} from '../gst.service.js';

const INTRA_STATE = { gstEnabled: true, isInterState: false } as const;
const INTER_STATE = { gstEnabled: true, isInterState: true } as const;

/** An exempt veterinary consultation — Notification 12/2017-CT(R) Entry 46. */
const exemptLine = (overrides: Partial<TaxableLine> = {}): TaxableLine => ({
  lineId: 'consultation',
  taxableValuePaise: 50_000,
  gstRatePercent: 0,
  taxTreatment: 'exempt',
  hsnSacCode: '998351',
  ...overrides,
});

/** A taxable dispensed product. */
const taxableLine = (overrides: Partial<TaxableLine> = {}): TaxableLine => ({
  lineId: 'dewormer',
  taxableValuePaise: 100_000,
  gstRatePercent: 18,
  taxTreatment: 'taxable',
  hsnSacCode: '3004',
  ...overrides,
});

describe('computeInvoiceTax — exempt supplies', () => {
  it('charges no tax on an exempt veterinary service even when GST is enabled', () => {
    const result = computeInvoiceTax([exemptLine()], INTRA_STATE);

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.lines[0]).toMatchObject({
      lineId: 'consultation',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    });
    expect(result.taxableValuePaise).toBe(50_000);
    expect(result.grandTotalPaise).toBe(50_000);
  });

  it('charges no tax on an exempt line carrying a non-zero clinic rate', () => {
    // A mis-configured catalog rate must not be able to tax an exempt supply.
    const result = computeInvoiceTax(
      [exemptLine({ gstRatePercent: 18 })],
      INTRA_STATE,
    );

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
  });

  it('charges no tax on a nil_rated line', () => {
    const result = computeInvoiceTax(
      [exemptLine({ taxTreatment: 'nil_rated' })],
      INTRA_STATE,
    );

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
  });
});

describe('computeInvoiceTax — intra-state supplies', () => {
  it('splits the tax into CGST and SGST summing to the exact total', () => {
    const result = computeInvoiceTax([taxableLine()], INTRA_STATE);

    expect(result.cgstPaise + result.sgstPaise).toBe(18_000);
    expect(result.igstPaise).toBe(0);
    expect(result.documentType).toBe('tax_invoice');
  });

  it('assigns the odd paise to CGST deterministically', () => {
    // 33333 paise at 5% is 1666.65 paise, which rounds to an odd 1667.
    const result = computeInvoiceTax(
      [taxableLine({ taxableValuePaise: 33_333, gstRatePercent: 5 })],
      INTRA_STATE,
    );

    const line = result.lines[0];
    expect(line.cgstPaise + line.sgstPaise).toBe(1667);
    expect(line.cgstPaise - line.sgstPaise).toBe(1);
    expect(line.cgstPaise).toBe(834);
    expect(line.sgstPaise).toBe(833);
  });
});

describe('computeInvoiceTax — inter-state supplies', () => {
  it('produces IGST only, with no CGST and no SGST', () => {
    const result = computeInvoiceTax([taxableLine()], INTER_STATE);

    expect(result.igstPaise).toBe(18_000);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.lines[0]).toMatchObject({
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 18_000,
    });
  });

  it('charges the same total inter-state as intra-state for the same base and rate', () => {
    const line = taxableLine({ taxableValuePaise: 33_333, gstRatePercent: 5 });
    const intra = computeInvoiceTax([line], INTRA_STATE);
    const inter = computeInvoiceTax([line], INTER_STATE);

    expect(intra.lines[0].cgstPaise + intra.lines[0].sgstPaise).toBe(
      inter.lines[0].igstPaise,
    );
  });

  it('leaves an exempt line untaxed inter-state too', () => {
    const result = computeInvoiceTax([exemptLine()], INTER_STATE);
    expect(result.igstPaise).toBe(0);
  });
});

describe('computeInvoiceTax — invoice-level rounding (Section 170 / Rule 51)', () => {
  // Three taxable lines whose per-line tax is 280 paise each (140 CGST + 140
  // SGST). Rounding per line would give 3 x 100 = 300 paise per head; rounding
  // once at invoice level gives round(420) = 400. The two disagree, which is
  // exactly what proves the rounding happened at invoice level.
  const threeRateInvoice: TaxableLine[] = [
    taxableLine({ lineId: 'a', taxableValuePaise: 5_600, gstRatePercent: 5 }),
    taxableLine({ lineId: 'b', taxableValuePaise: 1_556, gstRatePercent: 18 }),
    taxableLine({ lineId: 'c', taxableValuePaise: 700, gstRatePercent: 40 }),
  ];

  it('rounds each tax head once to a whole rupee', () => {
    const result = computeInvoiceTax(threeRateInvoice, INTRA_STATE);

    expect(result.cgstPaise % 100).toBe(0);
    expect(result.sgstPaise % 100).toBe(0);
    expect(result.igstPaise % 100).toBe(0);
    expect(result.cgstPaise).toBe(400);
    expect(result.sgstPaise).toBe(400);
  });

  it('never rounds per line: the invoice head differs from the sum of per-line rounded values', () => {
    const result = computeInvoiceTax(threeRateInvoice, INTRA_STATE);

    const perLineRounded = result.lines.reduce(
      (acc, line) => acc + Math.round(line.cgstPaise / 100) * 100,
      0,
    );

    expect(perLineRounded).toBe(300);
    expect(result.cgstPaise).toBe(400);
    expect(result.cgstPaise).not.toBe(perLineRounded);
  });

  it('records roundOffPaise as the sum of the three head rounding deltas', () => {
    const result = computeInvoiceTax(threeRateInvoice, INTRA_STATE);

    // cgst 400 - 420 = -20, sgst 400 - 420 = -20, igst 0 - 0 = 0.
    expect(result.roundOffPaise).toBe(-40);
  });

  it('is zero when every head already lands on a whole rupee', () => {
    const result = computeInvoiceTax([taxableLine()], INTRA_STATE);
    expect(result.roundOffPaise).toBe(0);
  });

  it('closes the arithmetic exactly across three distinct invoice shapes', () => {
    const shapes: { name: string; lines: TaxableLine[] }[] = [
      { name: 'all taxable, three rates', lines: threeRateInvoice },
      { name: 'all exempt', lines: [exemptLine()] },
      {
        name: 'mixed exempt and taxable',
        lines: [exemptLine(), taxableLine({ taxableValuePaise: 33_333, gstRatePercent: 5 })],
      },
    ];

    for (const shape of shapes) {
      const result = computeInvoiceTax(shape.lines, INTRA_STATE);
      expect(
        result.taxableValuePaise +
          result.cgstPaise +
          result.sgstPaise +
          result.igstPaise +
          result.roundOffPaise,
      ).toBe(result.grandTotalPaise);
    }
  });
});

describe('computeInvoiceTax — document type (CGST Rule 46A)', () => {
  it('types an all-exempt invoice as a bill of supply', () => {
    expect(computeInvoiceTax([exemptLine()], INTRA_STATE).documentType).toBe(
      'bill_of_supply',
    );
  });

  it('types an all-taxable invoice as a tax invoice', () => {
    expect(computeInvoiceTax([taxableLine()], INTRA_STATE).documentType).toBe(
      'tax_invoice',
    );
  });

  it('types a mixed exempt and taxable invoice as invoice_cum_bill_of_supply', () => {
    const result = computeInvoiceTax([exemptLine(), taxableLine()], INTRA_STATE);

    expect(result.documentType).toBe('invoice_cum_bill_of_supply');
    expect(result.taxableValuePaise).toBe(150_000);
    expect(result.cgstPaise).toBe(9_000);
    expect(result.sgstPaise).toBe(9_000);
  });

  it('counts a nil_rated line as exempt for Rule 46A purposes', () => {
    const result = computeInvoiceTax(
      [exemptLine({ taxTreatment: 'nil_rated' }), taxableLine()],
      INTRA_STATE,
    );
    expect(result.documentType).toBe('invoice_cum_bill_of_supply');
  });

  it('types an empty invoice as a plain invoice rather than throwing', () => {
    const result = computeInvoiceTax([], INTRA_STATE);

    expect(result.documentType).toBe('invoice');
    expect(result.lines).toEqual([]);
    expect(result.taxableValuePaise).toBe(0);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.roundOffPaise).toBe(0);
    expect(result.grandTotalPaise).toBe(0);
  });
});

describe('computeInvoiceTax — unregistered clinic (gstEnabled false)', () => {
  const opts = { gstEnabled: false, isInterState: false };

  it('computes no tax and types the document as a plain invoice', () => {
    // Section 122: an unregistered clinic collecting GST commits an offence.
    const result = computeInvoiceTax([exemptLine(), taxableLine()], opts);

    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.roundOffPaise).toBe(0);
    expect(result.documentType).toBe('invoice');
    expect(result.taxableValuePaise).toBe(150_000);
    expect(result.grandTotalPaise).toBe(150_000);
    for (const line of result.lines) {
      expect(line.cgstPaise).toBe(0);
      expect(line.sgstPaise).toBe(0);
      expect(line.igstPaise).toBe(0);
    }
  });

  it('returns before rate validation, so stale rate data cannot block an invoice', () => {
    expect(() =>
      computeInvoiceTax([taxableLine({ gstRatePercent: 12 })], opts),
    ).not.toThrow();
  });
});

describe('computeInvoiceTax — rate validation', () => {
  it('throws naming a rate that is not a current GST slab', () => {
    // 12% and 28% were retired by GST 2.0, effective 22 September 2025.
    expect(() =>
      computeInvoiceTax([taxableLine({ gstRatePercent: 12 })], INTRA_STATE),
    ).toThrow(/12/);
    expect(() =>
      computeInvoiceTax([taxableLine({ gstRatePercent: 28 })], INTRA_STATE),
    ).toThrow(/28/);
  });

  it('accepts every current slab', () => {
    for (const rate of [0, 5, 18, 40]) {
      expect(() =>
        computeInvoiceTax([taxableLine({ gstRatePercent: rate })], INTRA_STATE),
      ).not.toThrow();
    }
  });
});

describe('computeInvoiceTax — determinism', () => {
  it('returns the same result for the same input across repeated calls', () => {
    const lines = [exemptLine(), taxableLine({ taxableValuePaise: 33_333, gstRatePercent: 5 })];

    expect(computeInvoiceTax(lines, INTRA_STATE)).toEqual(
      computeInvoiceTax(lines, INTRA_STATE),
    );
  });

  it('does not mutate the input lines', () => {
    const lines = [taxableLine()];
    const snapshot = structuredClone(lines);

    computeInvoiceTax(lines, INTRA_STATE);

    expect(lines).toEqual(snapshot);
  });
});

describe('allocateInvoiceDiscount — pro-rata invoice discount (D-07, Section 15(3)(a))', () => {
  it('pro-rates the discount across all lines including exempt ones', () => {
    const discounted = allocateInvoiceDiscount(
      [exemptLine(), taxableLine()],
      10_000,
    );

    expect(discounted[0].allocatedInvoiceDiscountPaise).toBe(3_333);
    expect(discounted[1].allocatedInvoiceDiscountPaise).toBe(6_667);
    expect(
      discounted.reduce((acc, l) => acc + l.allocatedInvoiceDiscountPaise, 0),
    ).toBe(10_000);

    expect(discounted[0].taxableValuePaise).toBe(46_667);
    expect(discounted[1].taxableValuePaise).toBe(93_333);
  });

  it('keeps the per-line taxable values summing exactly to the invoice taxable value', () => {
    const discounted = allocateInvoiceDiscount(
      [exemptLine(), taxableLine()],
      10_000,
    );
    const result = computeInvoiceTax(discounted, INTRA_STATE);

    const lineSum = discounted.reduce((acc, l) => acc + l.taxableValuePaise, 0);
    expect(lineSum).toBe(result.taxableValuePaise);
    expect(result.taxableValuePaise).toBe(140_000);
  });

  it('reduces the taxable value before tax, never the grand total after it', () => {
    const discounted = allocateInvoiceDiscount(
      [exemptLine(), taxableLine()],
      10_000,
    );
    const result = computeInvoiceTax(discounted, INTRA_STATE);

    // Tax is charged on 93_333, not on the pre-discount 100_000.
    expect(result.cgstPaise + result.sgstPaise).toBe(16_800);
    expect(result.documentType).toBe('invoice_cum_bill_of_supply');
    expect(result.grandTotalPaise).toBe(156_800);
  });

  it('gives the exempt line its share of the discount but still charges it no tax', () => {
    const discounted = allocateInvoiceDiscount(
      [exemptLine(), taxableLine()],
      10_000,
    );
    const result = computeInvoiceTax(discounted, INTRA_STATE);

    expect(discounted[0].allocatedInvoiceDiscountPaise).toBeGreaterThan(0);
    expect(result.lines[0]).toMatchObject({
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    });
  });

  it('is a no-op for a zero discount', () => {
    const discounted = allocateInvoiceDiscount([exemptLine(), taxableLine()], 0);

    expect(discounted[0].taxableValuePaise).toBe(50_000);
    expect(discounted[1].taxableValuePaise).toBe(100_000);
    expect(discounted[0].allocatedInvoiceDiscountPaise).toBe(0);
    expect(discounted[1].allocatedInvoiceDiscountPaise).toBe(0);
  });

  it('supports a 100% discount (D-40 permits it with no approval threshold)', () => {
    const discounted = allocateInvoiceDiscount(
      [exemptLine(), taxableLine()],
      150_000,
    );

    expect(discounted.reduce((acc, l) => acc + l.taxableValuePaise, 0)).toBe(0);
    expect(computeInvoiceTax(discounted, INTRA_STATE).grandTotalPaise).toBe(0);
  });

  it('throws when the discount exceeds the invoice taxable value', () => {
    expect(() =>
      allocateInvoiceDiscount([exemptLine(), taxableLine()], 150_001),
    ).toThrow(/exceeds/i);
  });

  it('throws on a negative discount', () => {
    expect(() => allocateInvoiceDiscount([taxableLine()], -1)).toThrow(
      /negative|invalid/i,
    );
  });

  it('does not mutate the input lines', () => {
    const lines = [exemptLine(), taxableLine()];
    const snapshot = structuredClone(lines);

    allocateInvoiceDiscount(lines, 10_000);

    expect(lines).toEqual(snapshot);
  });

  it('returns an empty array for an empty invoice', () => {
    expect(allocateInvoiceDiscount([], 0)).toEqual([]);
  });
});
