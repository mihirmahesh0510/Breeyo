import { describe, it, expect } from 'vitest';
import type { ClinicInvoiceHeader, CreditNote, Payment, Refund } from '@breeyo/types';
import {
  INVOICE_DETAIL_COPY,
  clinicHeaderRows,
  linkedCreditNoteLabel,
  paymentHistoryRows,
  voidConfirmCopy,
  voidedStampFields,
} from '../lib/invoice-detail';

const CLINIC: ClinicInvoiceHeader = {
  name: 'Happy Paws Veterinary Clinic',
  address: '12 MG Road, Bengaluru 560001',
  contactPhone: '+91 98765 43210',
  gstin: '29ABCDE1234F1Z5',
  logoUrl: null,
  stateCode: '29',
  gstEnabled: true,
  bankDetails: null,
  invoiceFooterText: null,
};

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    method: 'cash',
    channel: 'manual',
    amountPaise: 123_435,
    status: 'captured',
    razorpayPaymentLinkId: null,
    razorpayPaymentId: null,
    shortUrl: null,
    paymentGroupId: null,
    expiresAt: null,
    paidAt: new Date('2026-08-14T04:00:00.000Z'),
    failureReason: null,
    recordedById: 'user-1',
    createdAt: new Date('2026-08-14T04:00:00.000Z'),
    updatedAt: new Date('2026-08-14T04:00:00.000Z'),
    ...overrides,
  };
}

function refund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: 'ref-1',
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    paymentId: 'pay-1',
    method: 'cash',
    amountPaise: 50_000,
    status: 'processed',
    razorpayRefundId: null,
    reason: 'Overcharged',
    processedAt: new Date('2026-08-14T05:30:00.000Z'),
    failureReason: null,
    createdById: 'user-1',
    createdAt: new Date('2026-08-14T05:30:00.000Z'),
    updatedAt: new Date('2026-08-14T05:30:00.000Z'),
    ...overrides,
  };
}

function creditNote(overrides: Partial<CreditNote> = {}): CreditNote {
  return {
    id: 'cn-1',
    clinicId: 'clinic-1',
    invoiceId: 'inv-1',
    creditNoteNumber: 'CN-202608-0001',
    reason: 'incorrect_charge',
    notes: null,
    subtotalPaise: 50_000,
    taxableValuePaise: 50_000,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 50_000,
    issuedById: 'user-1',
    issuedAt: new Date('2026-08-14T06:00:00.000Z'),
    createdAt: new Date('2026-08-14T06:00:00.000Z'),
    ...overrides,
  };
}

describe('copy contract', () => {
  it('quotes 06-UI-SPEC verbatim', () => {
    expect(INVOICE_DETAIL_COPY.paymentHistoryHeader).toBe('Payment History');
    expect(INVOICE_DETAIL_COPY.voidConfirmTitle).toBe('Void this invoice?');
    expect(INVOICE_DETAIL_COPY.voidRestoreStockCheckbox).toBe('Return dispensed items to stock?');
    expect(INVOICE_DETAIL_COPY.voidConfirmButton).toBe('Void Invoice');
    expect(INVOICE_DETAIL_COPY.cancelButton).toBe('Cancel');
    expect(INVOICE_DETAIL_COPY.voidedStamp).toBe('VOIDED');
  });
});

describe('clinicHeaderRows — T-06-137', () => {
  it('renders the GSTIN row for a registered clinic', () => {
    const rows = clinicHeaderRows(CLINIC, true);
    expect(rows.name).toBe('Happy Paws Veterinary Clinic');
    expect(rows.address).toBe('12 MG Road, Bengaluru 560001');
    expect(rows.phone).toBe('+91 98765 43210');
    expect(rows.gstin).toBe('GSTIN: 29ABCDE1234F1Z5');
  });

  // An unregistered clinic that displays a GSTIN claims a registration it does
  // not hold. The invoice's own frozen snapshot decides, not the clinic's
  // current setting, so a historical invoice keeps telling the truth.
  it('omits the GSTIN row entirely when the invoice snapshot says GST was off', () => {
    expect(clinicHeaderRows(CLINIC, false).gstin).toBeNull();
  });

  it('omits the GSTIN row when the clinic holds no GSTIN, even with GST on', () => {
    expect(clinicHeaderRows({ ...CLINIC, gstin: null }, true).gstin).toBeNull();
  });

  it('omits the GSTIN row for a blank GSTIN string', () => {
    expect(clinicHeaderRows({ ...CLINIC, gstin: '   ' }, true).gstin).toBeNull();
  });
});

describe('paymentHistoryRows — T-06-138', () => {
  const NOW = new Date('2026-08-14T04:10:00.000Z');

  it('renders one row per payment and one per refund', () => {
    const rows = paymentHistoryRows([payment()], [refund()], NOW);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.kind === 'payment')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'refund')).toHaveLength(1);
  });

  it('is empty rather than fabricating a row when nothing was collected', () => {
    expect(paymentHistoryRows([], [], NOW)).toEqual([]);
  });

  it('maps each method and channel onto its 06-UI-SPEC icon', () => {
    const [cash] = paymentHistoryRows([payment({ method: 'cash' })], [], NOW);
    expect(cash.icon).toBe('cash');

    const [upi] = paymentHistoryRows(
      [payment({ id: 'p2', method: 'upi', channel: 'manual' })],
      [],
      NOW,
    );
    expect(upi.icon).toBe('upi');

    const [card] = paymentHistoryRows(
      [payment({ id: 'p3', method: 'card', channel: 'manual' })],
      [],
      NOW,
    );
    expect(card.icon).toBe('card');

    // Channel wins over method: a gateway leg is a Razorpay row whichever
    // instrument the owner ended up using.
    const [gateway] = paymentHistoryRows(
      [payment({ id: 'p4', method: 'upi', channel: 'razorpay' })],
      [],
      NOW,
    );
    expect(gateway.icon).toBe('razorpay');

    const [reversal] = paymentHistoryRows([], [refund()], NOW);
    expect(reversal.icon).toBe('refund');
  });

  it('formats money through the shared paise formatter and refunds as negative', () => {
    const rows = paymentHistoryRows([payment()], [refund()], NOW);
    const paid = rows.find((r) => r.kind === 'payment')!;
    const returned = rows.find((r) => r.kind === 'refund')!;

    expect(paid.amount).toBe('₹1,234.35');
    expect(returned.amount).toBe('-₹500.00');
  });

  it('stamps each row DD MMM YYYY, HH:MM', () => {
    const [row] = paymentHistoryRows(
      [payment({ paidAt: new Date('2026-08-14T09:05:00.000Z') })],
      [],
      NOW,
    );
    expect(row.timestamp).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
  });

  it('shows the transaction reference as a caption when there is one', () => {
    const [withRef] = paymentHistoryRows(
      [payment({ razorpayPaymentId: 'pay_MkT9xQ2' })],
      [],
      NOW,
    );
    expect(withRef.reference).toBe('Ref: pay_MkT9xQ2');

    const [withoutRef] = paymentHistoryRows([payment()], [], NOW);
    expect(withoutRef.reference).toBeNull();
  });

  it('counts down a pending link in whole minutes', () => {
    const [row] = paymentHistoryRows(
      [
        payment({
          status: 'pending',
          channel: 'razorpay',
          method: 'upi',
          paidAt: null,
          expiresAt: new Date('2026-08-14T04:22:00.000Z'),
        }),
      ],
      [],
      NOW,
    );
    expect(row.pending).toBe('Pending — expires in 12 min');
  });

  it('says a pending link expired rather than counting down past zero', () => {
    const [row] = paymentHistoryRows(
      [
        payment({
          status: 'pending',
          channel: 'razorpay',
          paidAt: null,
          expiresAt: new Date('2026-08-14T03:00:00.000Z'),
        }),
      ],
      [],
      NOW,
    );
    expect(row.pending).toBe('Pending — expired');
  });

  it('notes a failed leg with its reason so a dispute has an on-screen record', () => {
    const [row] = paymentHistoryRows(
      [payment({ status: 'failed', paidAt: null, failureReason: 'Insufficient funds' })],
      [],
      NOW,
    );
    expect(row.note).toBe('Failed — Insufficient funds');
  });

  it('orders newest first', () => {
    const rows = paymentHistoryRows(
      [payment({ id: 'old', paidAt: new Date('2026-08-13T04:00:00.000Z') })],
      [refund({ id: 'new', processedAt: new Date('2026-08-14T05:30:00.000Z') })],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
  });
});

describe('linkedCreditNoteLabel', () => {
  it('renders the 06-UI-SPEC linked credit note line', () => {
    expect(linkedCreditNoteLabel(creditNote())).toBe('Credit Note: CN-202608-0001 — ₹500.00');
  });
});

describe('voidedStampFields', () => {
  it('carries the stamp, the date and the reason', () => {
    const fields = voidedStampFields(new Date('2026-08-14T06:00:00.000Z'), 'Billed the wrong pet');
    expect(fields.stamp).toBe('VOIDED');
    expect(fields.date).toMatch(/^Voided on \d{2} [A-Z][a-z]{2} \d{4}$/);
    expect(fields.reason).toBe('Reason: Billed the wrong pet');
  });

  it('drops the reason line when none was recorded', () => {
    expect(voidedStampFields(new Date('2026-08-14T06:00:00.000Z'), null).reason).toBeNull();
  });

  it('drops the date line when the timestamp is missing', () => {
    expect(voidedStampFields(null, 'Duplicate').date).toBeNull();
  });
});

describe('voidConfirmCopy', () => {
  it('interpolates the number and the amount into the spec body', () => {
    expect(voidConfirmCopy('INV-202608-0042', 123_435).body).toBe(
      'Invoice #INV-202608-0042 for ₹1,234.35 will be marked as void. This cannot be undone.',
    );
  });

  it('names the invoice as a draft when it has no number yet', () => {
    expect(voidConfirmCopy(null, 100_000).body).toContain('This invoice');
  });
});
