import { describe, it, expect } from 'vitest';
import { INVOICE_STATUSES, type InvoiceStatus } from '@breeyo/types';
import {
  canManagePayments,
  INVOICE_ACTIONS,
  INVOICE_ACTION_ORDER,
  invoiceActionSet,
  visibleInvoiceActions,
  type InvoiceActionKey,
} from '../lib/invoice-actions';

/**
 * The action set every one of the seven states must offer.
 *
 * This table is the test's own restatement of 06-UI-SPEC's action rows plus the
 * FINALIZED row the spec never wrote. The implementation is forbidden from
 * containing anything like it — it derives from `isValidInvoiceTransition` —
 * so the two agreeing is a real assertion rather than a tautology.
 */
const EXPECTED_WITHOUT_PAYMENTS: Record<InvoiceStatus, InvoiceActionKey[]> = {
  DRAFT: ['edit', 'delete'],
  // The spec's behaviour table has no FINALIZED row. FINALIZED means locked,
  // numbered, and nothing collected yet — so every action a payable invoice has
  // except Refund, which D-12 requires an existing payment for.
  FINALIZED: ['pay', 'print', 'share', 'download', 'void', 'creditNote'],
  UNPAID: ['pay', 'print', 'share', 'download', 'void', 'creditNote'],
  PARTIALLY_PAID: ['pay', 'print', 'share', 'download', 'void', 'creditNote'],
  PAID: ['print', 'share', 'download', 'creditNote'],
  OVERDUE: ['pay', 'print', 'share', 'download', 'void', 'creditNote'],
  VOIDED: ['print', 'share', 'download'],
};

const EXPECTED_WITH_PAYMENTS: Record<InvoiceStatus, InvoiceActionKey[]> = {
  DRAFT: ['edit', 'delete'],
  FINALIZED: ['pay', 'print', 'share', 'download', 'void', 'creditNote', 'refund'],
  UNPAID: ['pay', 'print', 'share', 'download', 'void', 'creditNote', 'refund'],
  PARTIALLY_PAID: ['pay', 'print', 'share', 'download', 'void', 'creditNote', 'refund'],
  PAID: ['print', 'share', 'download', 'creditNote', 'refund'],
  OVERDUE: ['pay', 'print', 'share', 'download', 'void', 'creditNote', 'refund'],
  VOIDED: ['print', 'share', 'download'],
};

function sorted(keys: readonly InvoiceActionKey[]): InvoiceActionKey[] {
  return [...keys].sort();
}

describe('invoiceActionSet across every status', () => {
  it('covers all seven statuses with no fall-through', () => {
    expect(INVOICE_STATUSES).toHaveLength(7);
    for (const status of INVOICE_STATUSES) {
      expect(Object.keys(EXPECTED_WITHOUT_PAYMENTS)).toContain(status);
    }
  });

  it.each(INVOICE_STATUSES)('offers the right actions on %s with no payments', (status) => {
    expect(sorted(visibleInvoiceActions({ status, hasPayments: false }))).toEqual(
      sorted(EXPECTED_WITHOUT_PAYMENTS[status]),
    );
  });

  it.each(INVOICE_STATUSES)('offers the right actions on %s with payments', (status) => {
    expect(sorted(visibleInvoiceActions({ status, hasPayments: true }))).toEqual(
      sorted(EXPECTED_WITH_PAYMENTS[status]),
    );
  });
});

describe('the specific guarantees the UI-SPEC states', () => {
  it('shows only Edit and delete on a draft — no Pay, no Print, no Void', () => {
    const actions = invoiceActionSet({ status: 'DRAFT', hasPayments: false });
    expect(actions.edit).toBe(true);
    expect(actions.delete).toBe(true);
    expect(actions.pay).toBe(false);
    expect(actions.print).toBe(false);
    expect(actions.void).toBe(false);
  });

  it('does not offer Collect Payment or Void on a paid invoice', () => {
    const actions = invoiceActionSet({ status: 'PAID', hasPayments: true });
    expect(actions.pay).toBe(false);
    expect(actions.void).toBe(false);
    expect(actions.refund).toBe(true);
    expect(actions.creditNote).toBe(true);
  });

  it('offers only the three document actions on a voided invoice', () => {
    const actions = invoiceActionSet({ status: 'VOIDED', hasPayments: true });
    expect(actions.print && actions.share && actions.download).toBe(true);
    expect(actions.pay || actions.void || actions.refund || actions.creditNote).toBe(false);
  });

  it('offers Pay on FINALIZED but never Refund without a payment (D-12)', () => {
    const actions = invoiceActionSet({ status: 'FINALIZED', hasPayments: false });
    expect(actions.pay).toBe(true);
    expect(actions.refund).toBe(false);
    expect(actions.void).toBe(true);
    expect(actions.creditNote).toBe(true);
  });

  it('never offers Refund without an existing payment, in any status', () => {
    for (const status of INVOICE_STATUSES) {
      expect(invoiceActionSet({ status, hasPayments: false }).refund).toBe(false);
    }
  });
});

describe('billing exceptions block every status-changing action (D-35, D-36)', () => {
  it.each(['overpayment', 'payment_after_void'] as const)(
    'blocks money actions while %s is unresolved',
    (flag) => {
      const actions = invoiceActionSet({
        status: 'PARTIALLY_PAID',
        hasPayments: true,
        exceptionFlag: flag,
      });

      expect(actions.blockedByException).toBe(true);
      expect(actions.pay).toBe(false);
      expect(actions.void).toBe(false);
      expect(actions.refund).toBe(false);
      expect(actions.creditNote).toBe(false);
    },
  );

  it('still allows the document actions, which change nothing', () => {
    const actions = invoiceActionSet({
      status: 'PARTIALLY_PAID',
      hasPayments: true,
      exceptionFlag: 'overpayment',
    });

    expect(actions.print).toBe(true);
    expect(actions.share).toBe(true);
    expect(actions.download).toBe(true);
  });

  it('treats an absent, null or empty flag as unflagged', () => {
    for (const flag of [undefined, null, '']) {
      expect(
        invoiceActionSet({ status: 'UNPAID', hasPayments: false, exceptionFlag: flag })
          .blockedByException,
      ).toBe(false);
    }
  });
});

describe('MANAGE_PAYMENTS gates the money actions (E2E-BUG-FIX-PLAN.md §6.3)', () => {
  it('defaults to permitted when hasManagePayments is omitted, so every existing call site keeps working', () => {
    const actions = invoiceActionSet({ status: 'UNPAID', hasPayments: false });
    expect(actions.pay).toBe(true);
    expect(actions.void).toBe(true);
    expect(actions.creditNote).toBe(true);
  });

  it('hides Pay, Void and Issue Credit Note for a caller without MANAGE_PAYMENTS', () => {
    const actions = invoiceActionSet({ status: 'UNPAID', hasPayments: false, hasManagePayments: false });
    expect(actions.pay).toBe(false);
    expect(actions.void).toBe(false);
    expect(actions.creditNote).toBe(false);
  });

  it('hides Refund for a caller without MANAGE_PAYMENTS, even with an existing payment', () => {
    const actions = invoiceActionSet({
      status: 'PAID',
      hasPayments: true,
      hasManagePayments: false,
    });
    expect(actions.refund).toBe(false);
  });

  it('does not withhold Edit, Delete, Print, Share or Download — those are not money actions', () => {
    const actions = invoiceActionSet({ status: 'DRAFT', hasPayments: false, hasManagePayments: false });
    expect(actions.edit).toBe(true);
    expect(actions.delete).toBe(true);

    const documentActions = invoiceActionSet({
      status: 'VOIDED',
      hasPayments: true,
      hasManagePayments: false,
    });
    expect(documentActions.print).toBe(true);
    expect(documentActions.share).toBe(true);
    expect(documentActions.download).toBe(true);
  });

  it('is excluded from the bar entirely, not merely disabled', () => {
    const visible = visibleInvoiceActions({
      status: 'UNPAID',
      hasPayments: false,
      hasManagePayments: false,
    });
    expect(visible).not.toContain('pay');
    expect(visible).not.toContain('void');
    expect(visible).not.toContain('creditNote');
    expect(visible).not.toContain('refund');
  });

  it('canManagePayments reads MANAGE_PAYMENTS off the permission list, absent list included', () => {
    expect(canManagePayments(['VIEW_INVOICES', 'MANAGE_PAYMENTS'])).toBe(true);
    expect(canManagePayments(['VIEW_INVOICES'])).toBe(false);
    expect(canManagePayments(undefined)).toBe(false);
  });
});

describe('action metadata', () => {
  it('labels each action with the 06-UI-SPEC copy', () => {
    expect(INVOICE_ACTIONS.pay.label).toBe('Collect Payment');
    expect(INVOICE_ACTIONS.print.label).toBe('Print');
    expect(INVOICE_ACTIONS.share.label).toBe('Share');
    expect(INVOICE_ACTIONS.download.label).toBe('Download');
    expect(INVOICE_ACTIONS.void.label).toBe('Void Invoice');
    expect(INVOICE_ACTIONS.creditNote.label).toBe('Issue Credit Note');
    expect(INVOICE_ACTIONS.refund.label).toBe('Refund');
    expect(INVOICE_ACTIONS.edit.label).toBe('Edit');
    expect(INVOICE_ACTIONS.delete.label).toBe('Delete');
  });

  it('marks the destructive actions so the bar cannot colour them by name', () => {
    expect(INVOICE_ACTIONS.void.tone).toBe('text-error');
    expect(INVOICE_ACTIONS.refund.tone).toBe('text-error');
    expect(INVOICE_ACTIONS.delete.tone).toBe('text-error');
    expect(INVOICE_ACTIONS.creditNote.tone).toBe('text-neutral');
    expect(INVOICE_ACTIONS.pay.tone).toBe('filled-primary');
    expect(INVOICE_ACTIONS.print.tone).toBe('outlined');
  });

  it('orders the bar as the spec lists it, with every action described', () => {
    expect(INVOICE_ACTION_ORDER).toEqual([
      'pay',
      'print',
      'share',
      'download',
      'void',
      'creditNote',
      'refund',
      'edit',
      'delete',
    ]);
    for (const key of INVOICE_ACTION_ORDER) {
      expect(INVOICE_ACTIONS[key]).toBeDefined();
      expect(INVOICE_ACTIONS[key].icon.length).toBeGreaterThan(0);
    }
  });

  it('returns visible actions in bar order, not alphabetical order', () => {
    expect(visibleInvoiceActions({ status: 'PARTIALLY_PAID', hasPayments: true })).toEqual([
      'pay',
      'print',
      'share',
      'download',
      'void',
      'creditNote',
      'refund',
    ]);
  });
});
