import { describe, it, expect, beforeEach } from 'vitest';
import { quickSaleSchema } from '@breeyo/validators';
import type { StockShortfall } from '@breeyo/types';
import {
  useQuickSaleCartStore,
  toQuickSaleItems,
  hasUnresolvedShortfall,
  type QuickSaleCartItemInput,
} from '../stores/quickSaleCartStore';

/**
 * The D-04 counter-sale cart (T-06-122, T-06-124).
 *
 * Three properties carry the weight of this file and are asserted rather than
 * assumed:
 *
 *  1. **No money total is representable.** A key enumeration fails if a
 *     total-shaped field is ever added. The counter-sale total the customer is
 *     about to pay comes from the server; a second one held here would be the
 *     figure that silently disagrees with the invoice, at the counter, with
 *     cash already on the table.
 *  2. **Adding the same product twice merges.** This is the deliberate opposite
 *     of `invoiceBuilderStore.addLine`, and the divergence is the point: two
 *     tins of the same food is one line of quantity two, whereas two
 *     consultations are two billable events.
 *  3. **The cart serialises into the request body the server actually parses.**
 *     `toQuickSaleItems` output is parsed by the real `quickSaleSchema`, so a
 *     shape the Fastify handler would reject cannot be assembled here — and in
 *     particular the items carry no `stockMovementId`, which is what lets a
 *     voided counter sale restore its stock (D-34).
 */

const FOOD: QuickSaleCartItemInput = {
  inventoryItemId: '11111111-1111-4111-8111-111111111111',
  description: 'Royal Canin Adult 2kg',
  unitPricePaise: 125_000,
};

const SUPPLEMENT: QuickSaleCartItemInput = {
  inventoryItemId: '22222222-2222-4222-8222-222222222222',
  description: 'Calcium Syrup 200ml',
  unitPricePaise: 32_500,
};

const state = () => useQuickSaleCartStore.getState();

beforeEach(() => {
  state().reset();
});

describe('quickSaleCartStore', () => {
  describe('addItem', () => {
    it('adds a new product as a row of quantity one', () => {
      state().addItem(FOOD);

      expect(state().items).toHaveLength(1);
      expect(state().items[0]).toMatchObject({
        inventoryItemId: FOOD.inventoryItemId,
        description: FOOD.description,
        unitPricePaise: FOOD.unitPricePaise,
        quantity: 1,
      });
    });

    it('merges a repeat of the same product into one row of quantity two', () => {
      state().addItem(FOOD);
      state().addItem(FOOD);

      // The load-bearing divergence from the invoice builder. A second scan of
      // the same barcode is a second tin, not a second line.
      expect(state().items).toHaveLength(1);
      expect(state().items[0].quantity).toBe(2);
    });

    it('keeps distinct products as distinct rows', () => {
      state().addItem(FOOD);
      state().addItem(SUPPLEMENT);

      expect(state().items).toHaveLength(2);
      expect(state().items.map((item) => item.quantity)).toEqual([1, 1]);
    });

    it('merges by the requested quantity rather than always by one', () => {
      state().addItem({ ...FOOD, quantity: 3 });
      state().addItem({ ...FOOD, quantity: 2 });

      expect(state().items).toHaveLength(1);
      expect(state().items[0].quantity).toBe(5);
    });
  });

  describe('quantity mutators', () => {
    it('incrementQuantity raises the row by one', () => {
      state().addItem(FOOD);
      state().incrementQuantity(FOOD.inventoryItemId);

      expect(state().items[0].quantity).toBe(2);
    });

    it('decrementQuantity lowers the row by one', () => {
      state().addItem({ ...FOOD, quantity: 3 });
      state().decrementQuantity(FOOD.inventoryItemId);

      expect(state().items[0].quantity).toBe(2);
    });

    it('decrementQuantity at quantity one removes the row', () => {
      state().addItem(FOOD);
      state().addItem(SUPPLEMENT);

      state().decrementQuantity(FOOD.inventoryItemId);

      expect(state().items).toHaveLength(1);
      expect(state().items[0].inventoryItemId).toBe(SUPPLEMENT.inventoryItemId);
    });

    it('setQuantity replaces the row quantity', () => {
      state().addItem(FOOD);
      state().setQuantity(FOOD.inventoryItemId, 7);

      expect(state().items[0].quantity).toBe(7);
    });

    it('setQuantity rejects zero, negatives and fractions rather than deleting the row', () => {
      state().addItem({ ...FOOD, quantity: 4 });

      state().setQuantity(FOOD.inventoryItemId, 0);
      state().setQuantity(FOOD.inventoryItemId, -2);
      state().setQuantity(FOOD.inventoryItemId, 1.5);

      // Removal is always the explicit `removeItem`; a stepper held down must
      // not silently drop a line the customer is standing there to buy.
      expect(state().items).toHaveLength(1);
      expect(state().items[0].quantity).toBe(4);
    });

    it('removeItem drops only the addressed row', () => {
      state().addItem(FOOD);
      state().addItem(SUPPLEMENT);

      state().removeItem(FOOD.inventoryItemId);

      expect(state().items.map((item) => item.inventoryItemId)).toEqual([
        SUPPLEMENT.inventoryItemId,
      ]);
    });
  });

  describe('stock shortfalls', () => {
    const shortfall: StockShortfall = {
      inventoryItemId: FOOD.inventoryItemId,
      description: FOOD.description,
      requested: 5,
      available: 2,
    };

    it('setShortfalls indexes the server 409 by inventory item', () => {
      state().addItem({ ...FOOD, quantity: 5 });
      state().setShortfalls([shortfall]);

      expect(state().shortfalls[FOOD.inventoryItemId]).toBe(2);
      expect(hasUnresolvedShortfall(state().shortfalls)).toBe(true);
    });

    it('clears a row shortfall as soon as its quantity changes', () => {
      state().addItem({ ...FOOD, quantity: 5 });
      state().setShortfalls([shortfall]);

      state().setQuantity(FOOD.inventoryItemId, 2);

      // The checkout button is re-enabled by this, which is why it must not
      // require a second round trip to the server to clear.
      expect(state().shortfalls[FOOD.inventoryItemId]).toBeUndefined();
      expect(hasUnresolvedShortfall(state().shortfalls)).toBe(false);
    });

    it('clears a row shortfall when the row is removed', () => {
      state().addItem({ ...FOOD, quantity: 5 });
      state().setShortfalls([shortfall]);

      state().removeItem(FOOD.inventoryItemId);

      expect(hasUnresolvedShortfall(state().shortfalls)).toBe(false);
    });
  });

  describe('reset', () => {
    it('empties the cart and the shortfalls', () => {
      state().addItem(FOOD);
      state().addItem(SUPPLEMENT);
      state().setShortfalls([
        {
          inventoryItemId: FOOD.inventoryItemId,
          description: FOOD.description,
          requested: 2,
          available: 0,
        },
      ]);

      state().reset();

      // T-06-124: the screen calls this on unmount. Without it the next
      // customer's sale opens holding the previous customer's cart.
      expect(state().items).toEqual([]);
      expect(state().shortfalls).toEqual({});
    });
  });

  describe('the state holds no money total', () => {
    it('holds no total, subtotal or tax-head key', () => {
      state().addItem(FOOD);
      state().addItem(SUPPLEMENT);

      const keys = Object.keys(state());
      const forbidden = keys.filter((key) => /total|subtotal|cgst|sgst|igst|tax/i.test(key));

      expect(forbidden).toEqual([]);
    });

    it('holds no numeric state field at all', () => {
      state().addItem(FOOD);

      const numericKeys = Object.entries(state())
        .filter(([, value]) => typeof value === 'number')
        .map(([key]) => key);

      expect(numericKeys).toEqual([]);
    });
  });

  describe('toQuickSaleItems', () => {
    it('produces a body the real quickSaleSchema accepts', () => {
      state().addItem({ ...FOOD, quantity: 2 });
      state().addItem(SUPPLEMENT);

      const parsed = quickSaleSchema.safeParse({ items: toQuickSaleItems(state().items) });

      expect(parsed.success).toBe(true);
    });

    it('emits bare item/quantity pairs carrying no stock movement (D-34)', () => {
      state().addItem({ ...FOOD, quantity: 2 });

      const [item] = toQuickSaleItems(state().items);

      // A Quick Sale line must let finalize do its own deduction. If it instead
      // pointed at a pre-existing dispensed movement, voiding the invoice would
      // skip restoring the stock — the exact case D-34 exists to cover.
      expect(Object.keys(item).sort()).toEqual(['inventoryItemId', 'quantity']);
      expect(item).toEqual({ inventoryItemId: FOOD.inventoryItemId, quantity: 2 });
    });

    it('rejects an empty cart, as the server would', () => {
      const parsed = quickSaleSchema.safeParse({ items: toQuickSaleItems(state().items) });

      expect(parsed.success).toBe(false);
    });
  });
});
