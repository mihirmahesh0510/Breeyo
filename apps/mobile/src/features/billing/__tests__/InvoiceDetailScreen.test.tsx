/**
 * The invoice detail screen, the refund sheet and the credit-note screen,
 * tested at their decision layer.
 *
 * ## Why this file imports `lib/` modules rather than rendering the screens
 *
 * `apps/mobile` cannot render a React Native component under test: vitest runs
 * the `node` environment with no Metro/Babel transform, so `import
 * 'react-native'` fails at parse time, and `react-test-renderer` is not
 * installed. Plans 06-14 through 06-21 each hit this and each resolved it the
 * same way — the decisions move into React-Native-free modules and the `.tsx`
 * becomes a thin renderer.
 *
 * A rendering test would be strictly weaker than what is here: it could assert
 * that a button is on screen, but not that the void request carries the field
 * the server requires, nor that a refund above the fetched maximum never leaves
 * the device. Those are the assertions this file exists for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CREDIT_NOTE_REASONS,
  INVOICE_STATUSES,
  isValidInvoiceTransition,
  type InvoiceStatus,
} from '@breeyo/types';
import { invoiceActionSet } from '../lib/invoice-actions';
import {
  INVOICE_SCREEN_COPY,
  buildVoidPayload,
  ownerLine,
  patientLine,
  screenTitleFor,
  showBalanceDue,
  voidSuccessToast,
} from '../lib/invoice-screen';
import {
  REFUND_COPY,
  buildRefundInput,
  isDigitalLeg,
  refundBoundFor,
  refundConfirmCopy,
  refundFailureMessage,
  splitDisplayRows,
  type RefundableSummary,
} from '../lib/refund-form';
import {
  CREDIT_NOTE_COPY,
  CREDIT_NOTE_REASON_OPTIONS,
  buildCreditNoteInput,
  creditLineFrom,
  creditLinePaise,
  creditTotalPaise,
  type CreditLineDraft,
} from '../lib/credit-note-form';
import { ApiClientError } from '../../../lib/api';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function screenSource(filename: string): string {
  return readFileSync(join(__dirname, '..', 'screens', filename), 'utf8');
}

const CASH_LEG = {
  paymentId: '11111111-1111-4111-8111-111111111111',
  method: 'cash',
  channel: 'manual',
  capturedPaise: 40_000,
  refundedPaise: 0,
  refundablePaise: 40_000,
};

const DIGITAL_LEG = {
  paymentId: '22222222-2222-4222-8222-222222222222',
  method: 'upi',
  channel: 'razorpay',
  capturedPaise: 85_000,
  refundedPaise: 0,
  refundablePaise: 85_000,
};

const SPLIT_SUMMARY: RefundableSummary = {
  refundablePaise: 125_000,
  legs: [CASH_LEG, DIGITAL_LEG],
};

const DIGITAL_ONLY: RefundableSummary = {
  refundablePaise: 85_000,
  legs: [DIGITAL_LEG],
};

function lineItem(id: string, description: string, lineTotalPaise: number) {
  return { id, description, lineTotalPaise };
}

// ─── 1. The screen's frame ──────────────────────────────────────────────────

describe('the invoice detail screen renders the documented frame', () => {
  it('titles the screen from the invoice number, with a draft fallback', () => {
    expect(screenTitleFor('INV-202608-0001')).toBe('Invoice #INV-202608-0001');
    expect(screenTitleFor(null)).toBe('Draft Invoice');
  });

  it('renders the patient, owner, items header and error state verbatim', () => {
    expect(patientLine({ name: 'Bruno', species: 'dog' })).toBe('Patient: Bruno (dog)');
    expect(ownerLine({ name: 'R. Iyer', mobile: '9876543210' })).toBe(
      'Owner: R. Iyer — 9876543210',
    );
    expect(INVOICE_SCREEN_COPY.itemsHeader).toBe('Items');
    expect(INVOICE_SCREEN_COPY.errorTitle).toBe(
      'Could not load invoice. Go back and try again.',
    );
    expect(INVOICE_SCREEN_COPY.goBack).toBe('Go Back');
  });

  it('shows the balance-due line only while money is still outstanding', () => {
    expect(showBalanceDue('PARTIALLY_PAID', 85_000)).toBe(true);
    expect(showBalanceDue('PAID', 0)).toBe(false);
    expect(showBalanceDue('DRAFT', 125_000)).toBe(false);
    expect(INVOICE_SCREEN_COPY.balanceDue(85_000)).toBe('Balance Due: ₹850.00');
  });

  it('wires all three PDF actions', () => {
    const source = screenSource('InvoiceDetailScreen.tsx');

    expect(source).toMatch(/printInvoice/);
    expect(source).toMatch(/generateInvoice/);
    expect(source).toMatch(/saveInvoice/);
  });
});

// ─── 2. The seven-status action matrix (T-06-110) ───────────────────────────

describe('the action set the screen renders for each status', () => {
  /**
   * Written independently of `lib/invoice-actions.ts`: this asks the shared
   * transition table directly, so the two agreeing is an assertion rather than
   * a restatement of the same code.
   */
  function expectedFromTransitionTable(status: InvoiceStatus, hasPayments: boolean) {
    const advances = (to: InvoiceStatus) => status !== to && isValidInvoiceTransition(status, to);
    const editable = advances('FINALIZED');
    const adjustable = status !== 'DRAFT' && status !== 'VOIDED';

    return {
      pay: ['UNPAID', 'PARTIALLY_PAID', 'PAID'].some((to) => advances(to as InvoiceStatus)),
      print: !editable,
      share: !editable,
      download: !editable,
      void: advances('VOIDED'),
      creditNote: adjustable,
      refund: adjustable && hasPayments,
      edit: editable,
      delete: editable,
    };
  }

  it.each(INVOICE_STATUSES)('%s agrees with isValidInvoiceTransition', (status) => {
    for (const hasPayments of [true, false]) {
      const actual = invoiceActionSet({ status, hasPayments });
      const expected = expectedFromTransitionTable(status, hasPayments);

      expect({
        pay: actual.pay,
        print: actual.print,
        share: actual.share,
        download: actual.download,
        void: actual.void,
        creditNote: actual.creditNote,
        refund: actual.refund,
        edit: actual.edit,
        delete: actual.delete,
      }).toEqual(expected);
    }
  });

  it('surfaces a billing exception rather than silently shortening the row (D-36)', () => {
    const flagged = invoiceActionSet({
      status: 'PAID',
      hasPayments: true,
      exceptionFlag: 'overpayment',
    });

    expect(flagged.blockedByException).toBe(true);
    expect(flagged.refund).toBe(false);
    expect(flagged.creditNote).toBe(false);
    // Document actions survive: staff resolving an exception have to read it.
    expect(flagged.print).toBe(true);

    expect(INVOICE_SCREEN_COPY.exceptionBanner('overpayment')).toBe(
      'More money was collected than this invoice is for. A staff member needs to resolve it before this invoice can change.',
    );
    expect(INVOICE_SCREEN_COPY.exceptionBanner('payment_after_void')).toBe(
      'A payment landed on this invoice after it was voided. A staff member needs to resolve it before this invoice can change.',
    );
    expect(INVOICE_SCREEN_COPY.exceptionBanner(null)).toBeNull();
  });
});

// ─── 3. Void (D-26, D-34) ───────────────────────────────────────────────────

describe('voiding an invoice', () => {
  it('sends restoreStock: true, the only value the wire carries (D-34)', () => {
    expect(buildVoidPayload('Duplicate invoice')).toEqual({
      reason: 'Duplicate invoice',
      restoreStock: true,
    });
  });

  it('rejects an empty reason before any request is sent', () => {
    expect(() => buildVoidPayload('   ')).toThrow();
  });

  it("reports what the server actually restored, in the spec's two strings", () => {
    expect(voidSuccessToast(3)).toBe('Invoice voided. Items returned to stock.');
    expect(voidSuccessToast(0)).toBe('Invoice voided');
  });
});

// ─── 4. Refunds (D-12, D-42, T-06-111) ──────────────────────────────────────

describe('the refund sheet', () => {
  it('uses the UI-SPEC refund copy verbatim', () => {
    expect(REFUND_COPY.sheetTitle).toBe('Process Refund');
    expect(REFUND_COPY.fullRefund).toBe('Full Refund');
    expect(REFUND_COPY.partialRefund).toBe('Partial Refund');
    expect(REFUND_COPY.partialAmountLabel).toBe('Refund Amount (₹)');
    expect(REFUND_COPY.maximum(125_000)).toBe('Maximum: ₹1,250.00');
    expect(REFUND_COPY.digitalNote).toBe(
      'Digital refunds processed via Razorpay (2-5 business days)',
    );
    expect(REFUND_COPY.cashNote).toBe('Cash refund recorded as manual adjustment');
    expect(REFUND_COPY.successToast(125_000)).toBe('Refund of ₹1,250.00 processed');
  });

  it('bounds a partial refund by the selected leg, not the invoice total (D-42)', () => {
    expect(refundBoundFor(SPLIT_SUMMARY, null)).toBe(125_000);
    expect(refundBoundFor(SPLIT_SUMMARY, CASH_LEG.paymentId)).toBe(40_000);
    expect(refundBoundFor(SPLIT_SUMMARY, DIGITAL_LEG.paymentId)).toBe(85_000);
  });

  it('rejects a partial refund above the fetched maximum before any request', () => {
    expect(() =>
      buildRefundInput({
        type: 'partial',
        amountPaise: 200_000,
        paymentId: null,
        summary: SPLIT_SUMMARY,
      }),
    ).toThrow('Refund exceeds the refundable balance on this invoice');

    // The per-leg bound is enforced too: ₹500 is inside the invoice total but
    // outside the cash leg it was aimed at.
    expect(() =>
      buildRefundInput({
        type: 'partial',
        amountPaise: 50_000,
        paymentId: CASH_LEG.paymentId,
        summary: SPLIT_SUMMARY,
      }),
    ).toThrow('Refund exceeds the refundable balance on this invoice');
  });

  it('builds a valid per-leg refund body', () => {
    expect(
      buildRefundInput({
        type: 'partial',
        amountPaise: 25_000,
        paymentId: CASH_LEG.paymentId,
        summary: SPLIT_SUMMARY,
        reason: 'Owner returned the collar',
      }),
    ).toEqual({
      type: 'partial',
      amountPaise: 25_000,
      paymentId: CASH_LEG.paymentId,
      method: 'cash',
      reason: 'Owner returned the collar',
    });

    expect(
      buildRefundInput({
        type: 'full',
        amountPaise: 85_000,
        paymentId: DIGITAL_LEG.paymentId,
        summary: DIGITAL_ONLY,
      }),
    ).toMatchObject({ type: 'full', method: 'razorpay' });
  });

  it('picks the confirmation body from the leg being reversed', () => {
    expect(isDigitalLeg(DIGITAL_LEG)).toBe(true);
    expect(isDigitalLeg(CASH_LEG)).toBe(false);

    const digital = refundConfirmCopy(true, 85_000);
    expect(digital.title).toBe('Process refund?');
    expect(digital.body).toBe(
      '₹850.00 will be refunded to the original payment method via Razorpay. This typically takes 2-5 business days.',
    );
    expect(digital.confirmLabel).toBe('Process Refund');

    const cash = refundConfirmCopy(false, 40_000);
    expect(cash.title).toBe('Record cash refund?');
    expect(cash.body).toBe(
      '₹400.00 cash refund will be recorded. Please hand the cash to the owner.',
    );
    expect(cash.confirmLabel).toBe('Record Refund');
    expect(cash.cancelLabel).toBe('Cancel');
  });

  it('shows both portions when the invoice was settled as a split', () => {
    expect(splitDisplayRows(SPLIT_SUMMARY)).toEqual([
      'Digital: ₹850.00 via Razorpay',
      'Cash: ₹400.00 refunded manually',
    ]);
    // One leg is not a split, so there is nothing to disambiguate.
    expect(splitDisplayRows(DIGITAL_ONLY)).toBeNull();
  });

  it('surfaces a concurrent REFUND_EXCEEDS_PAID as the documented failure copy', () => {
    const error = new ApiClientError(
      'A refund of 200000 paise exceeds the 125000 paise still refundable on this invoice',
      'REFUND_EXCEEDS_PAID',
      400,
    );

    expect(refundFailureMessage(error)).toBe(
      'Refund failed: A refund of 200000 paise exceeds the 125000 paise still refundable on this invoice. Please try again.',
    );
    expect(refundFailureMessage(new Error('Network request failed'))).toBe(
      'Refund failed: Network request failed. Please try again.',
    );
  });
});

// ─── 5. Credit notes (D-19, D-22, T-06-112) ─────────────────────────────────

describe('the credit note screen', () => {
  it('uses the UI-SPEC credit-note copy verbatim', () => {
    expect(CREDIT_NOTE_COPY.screenTitle).toBe('Credit Note');
    expect(CREDIT_NOTE_COPY.referencedInvoice('INV-202608-0001')).toBe(
      'For Invoice #INV-202608-0001',
    );
    expect(CREDIT_NOTE_COPY.reasonLabel).toBe('Reason');
    expect(CREDIT_NOTE_COPY.itemsHeader).toBe('Items to Credit');
    expect(CREDIT_NOTE_COPY.selectInstruction).toBe('Select items and amounts to credit');
    expect(CREDIT_NOTE_COPY.creditTotal(60_000)).toBe('Credit Amount: ₹600.00');
    expect(CREDIT_NOTE_COPY.notesLabel).toBe('Notes (optional)');
    expect(CREDIT_NOTE_COPY.notesPlaceholder).toBe('Additional details...');
    expect(CREDIT_NOTE_COPY.issueButton).toBe('Issue Credit Note');
    expect(CREDIT_NOTE_COPY.cancelButton).toBe('Cancel');
    expect(CREDIT_NOTE_COPY.successToast).toBe('Credit note issued');
  });

  it('offers exactly the five documented reasons, from the validator vocabulary', () => {
    expect(CREDIT_NOTE_REASON_OPTIONS.map((option) => option.value)).toEqual([
      ...CREDIT_NOTE_REASONS,
    ]);
    expect(CREDIT_NOTE_REASON_OPTIONS.map((option) => option.label)).toEqual([
      'Incorrect charge',
      'Service not provided',
      'Product returned',
      'Price adjustment',
      'Other',
    ]);
  });

  it('seeds each row from the original line total', () => {
    const draft = creditLineFrom(lineItem('line-1', 'General Consultation', 59_000));

    expect(draft).toMatchObject({
      invoiceLineItemId: 'line-1',
      description: 'General Consultation',
      lineTotalPaise: 59_000,
      selected: false,
      amountInput: '590.00',
    });
    expect(CREDIT_NOTE_COPY.itemLine('General Consultation', 59_000)).toBe(
      'General Consultation — ₹590.00',
    );
  });

  it('rejects a per-line credit above the original, client-side (T-06-112)', () => {
    const draft = creditLineFrom(lineItem('line-1', 'General Consultation', 59_000));

    expect(creditLinePaise({ ...draft, amountInput: '590.00' })).toEqual({
      ok: true,
      paise: 59_000,
    });
    expect(creditLinePaise({ ...draft, amountInput: '600' })).toEqual({
      ok: false,
      error: 'Cannot credit more than ₹590.00 on this line',
    });
    expect(creditLinePaise({ ...draft, amountInput: '10.005' })).toMatchObject({ ok: false });
  });

  it('totals only the selected rows', () => {
    const drafts: CreditLineDraft[] = [
      { ...creditLineFrom(lineItem('a', 'Consult', 59_000)), selected: true },
      { ...creditLineFrom(lineItem('b', 'Dressing', 20_000)), selected: false },
      {
        ...creditLineFrom(lineItem('c', 'Deworming', 30_000)),
        selected: true,
        amountInput: '100',
      },
    ];

    expect(creditTotalPaise(drafts)).toBe(69_000);
  });

  it('builds a credit-note body from the selected rows only', () => {
    const drafts: CreditLineDraft[] = [
      { ...creditLineFrom(lineItem('a', 'Consult', 59_000)), selected: true },
      { ...creditLineFrom(lineItem('b', 'Dressing', 20_000)), selected: false },
    ];

    expect(
      buildCreditNoteInput({ reason: 'incorrect_charge', notes: undefined, drafts }),
    ).toEqual({
      reason: 'incorrect_charge',
      items: [{ invoiceLineItemId: 'a', creditAmountPaise: 59_000 }],
    });
  });

  it("requires notes when the reason is Other, with the schema's own message", () => {
    const drafts: CreditLineDraft[] = [
      { ...creditLineFrom(lineItem('a', 'Consult', 59_000)), selected: true },
    ];

    expect(() => buildCreditNoteInput({ reason: 'other', notes: '  ', drafts })).toThrow(
      'Notes are required when the reason is Other',
    );
    expect(
      buildCreditNoteInput({ reason: 'other', notes: 'Charged the wrong owner', drafts }),
    ).toMatchObject({ reason: 'other', notes: 'Charged the wrong owner' });
  });

  it('refuses to submit with nothing selected', () => {
    const drafts: CreditLineDraft[] = [
      creditLineFrom(lineItem('a', 'Consult', 59_000)),
    ];

    expect(() =>
      buildCreditNoteInput({ reason: 'incorrect_charge', notes: undefined, drafts }),
    ).toThrow();
  });
});
