import { describe, it, expect } from 'vitest';
import {
  INVOICE_STATUS,
  INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  isValidInvoiceTransition,
  isInvoiceActionBlocked,
  BILLING_EXCEPTION_FLAGS,
  PAYMENT_METHODS,
  PAYMENT_CHANNELS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  REFUND_METHODS,
  INVOICE_SOURCES,
  DISCOUNT_TYPES,
  type InvoiceStatus,
} from '../constants/invoice-status.js';
import {
  GST_RATE_SLABS,
  GSTIN_REGEX,
  stateCodeFromGstin,
  TAX_TREATMENTS,
  INVOICE_DOCUMENT_TYPES,
  VETERINARY_SAC,
  VETERINARY_SAC_LEGACY,
  MAX_DOCUMENT_NUMBER_LENGTH,
  B2C_ADDRESS_REQUIRED_ABOVE_PAISE,
} from '../constants/gst.js';

// ─── Behaviour 1: every D-20 transition is permitted ────────────────────────

const VALID_TRANSITIONS: ReadonlyArray<[InvoiceStatus, InvoiceStatus]> = [
  ['DRAFT', 'FINALIZED'],
  ['FINALIZED', 'UNPAID'],
  ['FINALIZED', 'VOIDED'],
  ['UNPAID', 'PARTIALLY_PAID'],
  ['UNPAID', 'PAID'],
  ['UNPAID', 'OVERDUE'],
  ['UNPAID', 'VOIDED'],
  ['PARTIALLY_PAID', 'PAID'],
  ['PARTIALLY_PAID', 'OVERDUE'],
  ['PARTIALLY_PAID', 'VOIDED'],
  ['OVERDUE', 'PARTIALLY_PAID'],
  ['OVERDUE', 'PAID'],
  ['OVERDUE', 'VOIDED'],
];

describe('isValidInvoiceTransition — D-20 permitted transitions', () => {
  it.each(VALID_TRANSITIONS)('permits %s -> %s', (from, to) => {
    expect(isValidInvoiceTransition(from, to)).toBe(true);
  });

  it('exposes exactly the seven D-20 states', () => {
    expect(INVOICE_STATUSES).toEqual([
      'DRAFT',
      'FINALIZED',
      'UNPAID',
      'PARTIALLY_PAID',
      'PAID',
      'OVERDUE',
      'VOIDED',
    ]);
    expect(Object.values(INVOICE_STATUS)).toHaveLength(7);
  });

  it('has a transition list for every state', () => {
    for (const status of INVOICE_STATUSES) {
      expect(Array.isArray(INVOICE_TRANSITIONS[status])).toBe(true);
    }
  });
});

// ─── Behaviour 2: PAID and VOIDED are terminal ──────────────────────────────

describe('isValidInvoiceTransition — terminal states', () => {
  const others = (self: InvoiceStatus) => INVOICE_STATUSES.filter((s) => s !== self);

  it.each(others('PAID'))('rejects PAID -> %s', (to) => {
    expect(isValidInvoiceTransition('PAID', to)).toBe(false);
  });

  it.each(others('VOIDED'))('rejects VOIDED -> %s', (to) => {
    expect(isValidInvoiceTransition('VOIDED', to)).toBe(false);
  });

  it('declares no outgoing transitions for PAID or VOIDED', () => {
    expect(INVOICE_TRANSITIONS.PAID).toEqual([]);
    expect(INVOICE_TRANSITIONS.VOIDED).toEqual([]);
  });

  it('rejects VOIDED -> PAID so a late webhook cannot reopen a voided invoice (D-35)', () => {
    expect(isValidInvoiceTransition('VOIDED', 'PAID')).toBe(false);
  });
});

// ─── Behaviour 3: a draft cannot be paid without being finalized ────────────

describe('isValidInvoiceTransition — DRAFT is not payable', () => {
  it('rejects DRAFT -> PAID', () => {
    expect(isValidInvoiceTransition('DRAFT', 'PAID')).toBe(false);
  });

  it('rejects DRAFT -> PARTIALLY_PAID, UNPAID, OVERDUE and VOIDED', () => {
    expect(isValidInvoiceTransition('DRAFT', 'PARTIALLY_PAID')).toBe(false);
    expect(isValidInvoiceTransition('DRAFT', 'UNPAID')).toBe(false);
    expect(isValidInvoiceTransition('DRAFT', 'OVERDUE')).toBe(false);
    expect(isValidInvoiceTransition('DRAFT', 'VOIDED')).toBe(false);
  });
});

// ─── Behaviour 4: idempotent same-state re-application ──────────────────────

describe('isValidInvoiceTransition — idempotent re-application', () => {
  it.each<InvoiceStatus>(['PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERDUE'])(
    'treats %s -> %s as a permitted no-op (Razorpay redelivers events out of order)',
    (status) => {
      expect(isValidInvoiceTransition(status, status)).toBe(true);
    },
  );

  it.each<InvoiceStatus>(['DRAFT', 'FINALIZED'])(
    'rejects %s -> %s because re-entering it is a real state change, not a no-op',
    (status) => {
      expect(isValidInvoiceTransition(status, status)).toBe(false);
    },
  );

  it('never lets PARTIALLY_PAID fall back to UNPAID (D-37 split-payment timeout)', () => {
    expect(isValidInvoiceTransition('PARTIALLY_PAID', 'UNPAID')).toBe(false);
    expect(isValidInvoiceTransition('PARTIALLY_PAID', 'PARTIALLY_PAID')).toBe(true);
  });
});

// ─── Billing exceptions (D-35, D-36) ────────────────────────────────────────

describe('isInvoiceActionBlocked — D-35 / D-36 exception gate', () => {
  it('does not block an invoice with no exception', () => {
    expect(isInvoiceActionBlocked(null)).toBe(false);
  });

  it('blocks status-changing actions while an exception is unresolved', () => {
    expect(isInvoiceActionBlocked(BILLING_EXCEPTION_FLAGS.PAYMENT_AFTER_VOID)).toBe(true);
    expect(isInvoiceActionBlocked(BILLING_EXCEPTION_FLAGS.OVERPAYMENT)).toBe(true);
  });
});

// ─── Payment / refund / source literals match schema.prisma ─────────────────

describe('billing string-literal unions', () => {
  it('matches the literals written into schema.prisma by plan 06-03', () => {
    expect(PAYMENT_METHODS).toEqual(['cash', 'upi', 'card']);
    expect(PAYMENT_CHANNELS).toEqual(['manual', 'razorpay']);
    expect(PAYMENT_STATUSES).toEqual(['pending', 'captured', 'failed', 'expired', 'cancelled']);
    expect(REFUND_STATUSES).toEqual(['pending', 'processed', 'failed']);
    expect(REFUND_METHODS).toEqual(['razorpay', 'cash']);
    expect(INVOICE_SOURCES).toEqual(['consultation', 'manual', 'quick_sale']);
    expect(DISCOUNT_TYPES).toEqual(['percent', 'flat']);
  });
});

// ─── Behaviour 5: GST 2.0 slabs ─────────────────────────────────────────────

describe('GST_RATE_SLABS — GST 2.0, effective 2025-09-22', () => {
  it('is exactly [0, 5, 18, 40]', () => {
    expect(GST_RATE_SLABS).toEqual([0, 5, 18, 40]);
  });

  it('does not contain the retired 12 slab', () => {
    expect(GST_RATE_SLABS).not.toContain(12);
  });

  it('does not contain the retired 28 slab', () => {
    expect(GST_RATE_SLABS).not.toContain(28);
  });

  it('exposes the Finding G1 / G4 constant set', () => {
    expect(TAX_TREATMENTS).toEqual(['exempt', 'taxable', 'nil_rated']);
    expect(INVOICE_DOCUMENT_TYPES).toEqual([
      'invoice',
      'tax_invoice',
      'bill_of_supply',
      'invoice_cum_bill_of_supply',
    ]);
    expect(VETERINARY_SAC).toBe('998351');
    expect(VETERINARY_SAC_LEGACY).toEqual(['999311', '999312', '999313', '999399', '998612']);
    expect(MAX_DOCUMENT_NUMBER_LENGTH).toBe(16);
    expect(B2C_ADDRESS_REQUIRED_ABOVE_PAISE).toBe(5_000_000);
  });
});

// ─── Behaviour 6: GSTIN format ──────────────────────────────────────────────

describe('GSTIN_REGEX', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(GSTIN_REGEX.test('27AAPFU0939F1ZV')).toBe(true);
  });

  it('rejects a 14-character string', () => {
    expect('27AAPFU0939F1Z').toHaveLength(14);
    expect(GSTIN_REGEX.test('27AAPFU0939F1Z')).toBe(false);
  });

  it('rejects a lowercase string', () => {
    expect(GSTIN_REGEX.test('27aapfu0939f1zv')).toBe(false);
  });

  it('rejects a string missing the Z at position 14', () => {
    expect(GSTIN_REGEX.test('27AAPFU0939F1AV')).toBe(false);
  });

  it('rejects a 16-character string', () => {
    expect(GSTIN_REGEX.test('27AAPFU0939F1ZVX')).toBe(false);
  });
});

describe('stateCodeFromGstin', () => {
  it('returns the first two digits of a valid GSTIN', () => {
    expect(stateCodeFromGstin('27AAPFU0939F1ZV')).toBe('27');
  });

  it('returns null for a malformed GSTIN rather than a plausible-looking prefix', () => {
    expect(stateCodeFromGstin('27aapfu0939f1zv')).toBeNull();
    expect(stateCodeFromGstin('')).toBeNull();
  });
});
