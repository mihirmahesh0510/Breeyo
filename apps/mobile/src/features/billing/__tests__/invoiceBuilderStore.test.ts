import { describe, it, expect, beforeEach } from 'vitest';
import { invoiceLineItemInputSchema } from '@breeyo/validators';
import {
  useInvoiceBuilderStore,
  toInvoiceLineItemInputs,
  type InvoiceBuilderLineInput,
  type InvoiceBuilderDraft,
} from '../stores/invoiceBuilderStore';

/**
 * The builder's client-owned draft state (T-06-102, T-06-107).
 *
 * Two properties carry the security weight of this file and are asserted rather
 * than assumed:
 *
 *  1. **No money total is representable.** A key enumeration fails if any
 *     total-shaped field is ever added, because a client-held total is the
 *     figure an attacker would edit and the figure that silently drifts from
 *     the server's.
 *  2. **The state serialises straight into the request body.** Every line is
 *     parsed by the real `invoiceLineItemInputSchema` — the same object the
 *     Fastify handler parses — so a shape the server would 400 cannot be
 *     assembled here in the first place.
 */

const consultationLine: InvoiceBuilderLineInput = {
  lineType: 'service',
  serviceCatalogId: '11111111-1111-4111-8111-111111111111',
  description: 'General Consultation',
  quantity: 1,
  unitPricePaise: 50_000,
  taxTreatment: 'exempt',
  gstRatePercent: 0,
};

const productLine: InvoiceBuilderLineInput = {
  lineType: 'product',
  inventoryItemId: '22222222-2222-4222-8222-222222222222',
  stockMovementId: '33333333-3333-4333-8333-333333333333',
  description: 'Amoxicillin 250mg',
  quantity: 2,
  unitPricePaise: 12_500,
  hsnSacCode: '30041020',
  taxTreatment: 'taxable',
  gstRatePercent: 5,
};

function resetStore(): void {
  useInvoiceBuilderStore.getState().reset();
}

function state() {
  return useInvoiceBuilderStore.getState();
}

describe('invoiceBuilderStore', () => {
  beforeEach(resetStore);

  describe('addLine', () => {
    it('appends a line and stamps it with a unique local id', () => {
      state().addLine(consultationLine);

      const { lines } = state();
      expect(lines).toHaveLength(1);
      expect(lines[0].description).toBe('General Consultation');
      expect(lines[0].localId).toBeTruthy();
    });

    it('does NOT merge two adds of the same service — two consultations are two lines', () => {
      state().addLine(consultationLine);
      state().addLine(consultationLine);

      const { lines } = state();
      expect(lines).toHaveLength(2);
      expect(lines[0].quantity).toBe(1);
      expect(lines[1].quantity).toBe(1);
      expect(lines[0].localId).not.toBe(lines[1].localId);
    });

    it('preserves add order so the invoice reads in the order it was built', () => {
      state().addLine(consultationLine);
      state().addLine(productLine);

      expect(state().lines.map((line) => line.description)).toEqual([
        'General Consultation',
        'Amoxicillin 250mg',
      ]);
    });
  });

  describe('updateLineQuantity', () => {
    it('updates the named line only', () => {
      state().addLine(consultationLine);
      state().addLine(productLine);
      const target = state().lines[1].localId;

      state().updateLineQuantity(target, 5);

      expect(state().lines[0].quantity).toBe(1);
      expect(state().lines[1].quantity).toBe(5);
    });

    it('rejects a quantity of zero — removal is an explicit removeLine', () => {
      state().addLine(productLine);
      const target = state().lines[0].localId;

      state().updateLineQuantity(target, 0);

      expect(state().lines).toHaveLength(1);
      expect(state().lines[0].quantity).toBe(2);
    });

    it('rejects a negative or fractional quantity', () => {
      state().addLine(productLine);
      const target = state().lines[0].localId;

      state().updateLineQuantity(target, -3);
      expect(state().lines[0].quantity).toBe(2);

      state().updateLineQuantity(target, 1.5);
      expect(state().lines[0].quantity).toBe(2);
    });

    it('ignores an unknown local id rather than throwing', () => {
      state().addLine(productLine);

      state().updateLineQuantity('no-such-line', 9);

      expect(state().lines[0].quantity).toBe(2);
    });
  });

  describe('setLineDiscount', () => {
    it('records the type and the raw value without applying it', () => {
      state().addLine(consultationLine);
      const target = state().lines[0].localId;

      state().setLineDiscount(target, 'percent', 10);

      expect(state().lines[0].discountType).toBe('percent');
      expect(state().lines[0].discountValue).toBe(10);
      // The line's own price is untouched: the server applies discounts.
      expect(state().lines[0].unitPricePaise).toBe(50_000);
    });

    it('clears the discount when passed nulls', () => {
      state().addLine(consultationLine);
      const target = state().lines[0].localId;
      state().setLineDiscount(target, 'flat', 5_000);

      state().setLineDiscount(target, null, null);

      expect(state().lines[0].discountType).toBeUndefined();
      expect(state().lines[0].discountValue).toBeUndefined();
    });
  });

  describe('removeLine', () => {
    it('removes only the named line', () => {
      state().addLine(consultationLine);
      state().addLine(productLine);
      const target = state().lines[0].localId;

      state().removeLine(target);

      expect(state().lines).toHaveLength(1);
      expect(state().lines[0].description).toBe('Amoxicillin 250mg');
    });
  });

  describe('invoice-level options', () => {
    it('records the invoice discount, due date and notes', () => {
      state().setInvoiceDiscount('percent', 100);
      state().setDueDate('2026-09-01T00:00:00.000Z');
      state().setNotes('Payment terms: 7 days');

      expect(state().invoiceDiscountType).toBe('percent');
      // D-40: no approval threshold — 100% is a legal input, not an error.
      expect(state().invoiceDiscountValue).toBe(100);
      expect(state().dueDate).toBe('2026-09-01T00:00:00.000Z');
      expect(state().notes).toBe('Payment terms: 7 days');
    });
  });

  describe('hydrate and reset', () => {
    const draft: InvoiceBuilderDraft = {
      invoiceDiscountType: 'flat',
      invoiceDiscountValue: 25_000,
      dueDate: '2026-08-20T00:00:00.000Z',
      notes: 'Recheck in a week',
      lineItems: [
        {
          lineType: 'product',
          serviceCatalogId: null,
          inventoryItemId: '22222222-2222-4222-8222-222222222222',
          stockMovementId: '33333333-3333-4333-8333-333333333333',
          description: 'Amoxicillin 250mg',
          hsnSacCode: '30041020',
          quantity: 3,
          unitPricePaise: 12_500,
          discountType: null,
          discountValue: null,
          taxTreatment: 'taxable',
          gstRatePercent: 5,
        },
      ],
    };

    it('replaces every field from the fetched draft', () => {
      state().addLine(consultationLine);
      state().setNotes('stale note');

      state().hydrate(draft);

      expect(state().lines).toHaveLength(1);
      expect(state().lines[0].description).toBe('Amoxicillin 250mg');
      expect(state().lines[0].quantity).toBe(3);
      expect(state().lines[0].localId).toBeTruthy();
      expect(state().invoiceDiscountType).toBe('flat');
      expect(state().invoiceDiscountValue).toBe(25_000);
      expect(state().dueDate).toBe('2026-08-20T00:00:00.000Z');
      expect(state().notes).toBe('Recheck in a week');
    });

    it('maps a null persisted discount back to an absent one', () => {
      state().hydrate(draft);

      expect(state().lines[0].discountType).toBeUndefined();
      expect(state().lines[0].discountValue).toBeUndefined();
    });

    it('reset clears every line so the next patient starts empty (T-06-107)', () => {
      state().hydrate(draft);
      state().setNotes('previous patient');

      state().reset();

      expect(state().lines).toEqual([]);
      expect(state().invoiceDiscountType).toBeNull();
      expect(state().invoiceDiscountValue).toBeNull();
      expect(state().dueDate).toBeNull();
      expect(state().notes).toBe('');
    });
  });

  describe('T-06-102: no money total is representable in client state', () => {
    it('holds no total, subtotal or tax-head key', () => {
      state().addLine(consultationLine);
      state().setInvoiceDiscount('percent', 10);

      const keys = Object.keys(state());
      const forbidden = keys.filter((key) => /total|subtotal|cgst|sgst|igst|tax/i.test(key));

      expect(forbidden).toEqual([]);
    });

    it('holds no numeric state field beyond the discount value the user typed', () => {
      state().addLine(consultationLine);

      const numericKeys = Object.entries(state())
        .filter(([, value]) => typeof value === 'number')
        .map(([key]) => key);

      expect(numericKeys).toEqual([]);
    });
  });

  describe('serialisation into the request body', () => {
    it('drops localId and produces a payload the shared schema accepts', () => {
      state().addLine(consultationLine);
      state().addLine(productLine);
      state().setLineDiscount(state().lines[0].localId, 'percent', 10);

      const payload = toInvoiceLineItemInputs(state().lines);

      expect(payload).toHaveLength(2);
      for (const line of payload) {
        expect(line).not.toHaveProperty('localId');
        const parsed = invoiceLineItemInputSchema.safeParse(line);
        expect(parsed.success, JSON.stringify(parsed)).toBe(true);
      }
    });

    it('carries no key the shared line-item schema does not accept', () => {
      state().addLine(productLine);

      const [line] = toInvoiceLineItemInputs(state().lines);
      const allowed = new Set([
        'lineType',
        'serviceCatalogId',
        'inventoryItemId',
        'stockMovementId',
        'description',
        'quantity',
        'unitPricePaise',
        'discountType',
        'discountValue',
        'hsnSacCode',
        'taxTreatment',
        'gstRatePercent',
      ]);

      expect(Object.keys(line).filter((key) => !allowed.has(key))).toEqual([]);
    });
  });
});
