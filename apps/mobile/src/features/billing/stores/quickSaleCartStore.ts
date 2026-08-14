/**
 * The D-04 Quick Sale counter-sale cart.
 *
 * ## NO TOTAL, TAX OR SUBTOTAL MAY BE STORED HERE
 *
 * This is the load-bearing constraint of the module, and
 * `__tests__/quickSaleCartStore.test.ts` enumerates the state's keys to enforce
 * it. The counter-sale case makes the reason unusually concrete (T-06-122): the
 * customer is standing at the counter holding cash while the figure is read
 * aloud. A total computed here would be a second implementation of the invoice
 * arithmetic — including the per-head rounding applied once at invoice level
 * under Section 170 / Rule 51 — and the two would disagree on the first sale
 * with a fractional tax head. That disagreement is not a rendering bug; it is
 * an argument with a customer about money.
 *
 * The figure the cart displays comes from the server's Quick Sale preview, and
 * the authoritative one from the invoice the checkout returns. Neither is
 * stored here.
 *
 * ## `addItem` merges — the deliberate opposite of `invoiceBuilderStore`
 *
 * Adding a product already in this cart increments its quantity instead of
 * appending a second row. `invoiceBuilderStore.addLine` does the reverse and
 * keeps duplicates apart. Both are correct for their surface, and the
 * divergence is intentional rather than an inconsistency to be tidied away:
 *
 *  * A counter sale of two identical tins is **one line of quantity two**. That
 *    is what the customer is buying and what the receipt should read.
 *  * Two consultations on one visit are **two billable events** — a second
 *    opinion, or a re-examination later the same day — each with its own
 *    description and possibly its own discount. Collapsing them would misstate
 *    the invoice.
 *
 * ## No persistence, by decision (D-48)
 *
 * Plain `create<T>` with no middleware of any kind — no storage layer, no dev
 * tooling wrapper, no draft-mutation helper. That is the convention set by
 * `features/queue/store/queueUIStore.ts` and asserted by a phase-level grep
 * gate, which matches on the middleware names as literals; this note therefore
 * describes the prohibition without writing them, since a gate that trips on
 * the comment explaining it is worse than no gate.
 *
 * D-48 confirms that a cart lost to a crash or force-close is an accepted loss:
 * staff simply re-add the items. So there is deliberately no recovery
 * machinery. The store is module-level and therefore outlives the screen, which
 * is exactly why `reset()` exists and why the screen calls it on unmount
 * (T-06-124) — without that, the next customer's sale would open holding the
 * previous customer's cart, and if nobody noticed, bill them for it.
 */

import { create } from 'zustand';
import type { StockShortfall } from '@breeyo/types';

/** One product in the cart. Priced from the item's current selling price. */
export interface QuickSaleCartItem {
  inventoryItemId: string;
  description: string;
  quantity: number;
  /**
   * Display only. The server re-reads the item's selling price when it builds
   * the invoice, so this never travels back over the wire — see
   * {@link toQuickSaleItems}.
   */
  unitPricePaise: number;
}

/** What a caller supplies to {@link QuickSaleCartState.addItem}. */
export type QuickSaleCartItemInput = Omit<QuickSaleCartItem, 'quantity'> & {
  /** Defaults to 1 — one scan is one unit. */
  quantity?: number;
};

/**
 * `inventoryItemId` to the quantity the clinic actually has, from the server's
 * 409. Deliberately not part of a cart item: it is a fact about the stock
 * ledger at the moment of a rejected checkout, not a property of the line.
 */
export type QuickSaleShortfalls = Readonly<Record<string, number>>;

interface QuickSaleCartState {
  items: QuickSaleCartItem[];
  shortfalls: QuickSaleShortfalls;

  addItem: (item: QuickSaleCartItemInput) => void;
  incrementQuantity: (inventoryItemId: string) => void;
  decrementQuantity: (inventoryItemId: string) => void;
  setQuantity: (inventoryItemId: string, quantity: number) => void;
  removeItem: (inventoryItemId: string) => void;
  setShortfalls: (shortfalls: readonly StockShortfall[]) => void;
  reset: () => void;
}

const EMPTY_STATE = {
  items: [] as QuickSaleCartItem[],
  shortfalls: {} as QuickSaleShortfalls,
} satisfies Omit<
  QuickSaleCartState,
  | 'addItem'
  | 'incrementQuantity'
  | 'decrementQuantity'
  | 'setQuantity'
  | 'removeItem'
  | 'setShortfalls'
  | 'reset'
>;

/**
 * Drops one item's shortfall.
 *
 * Every quantity mutation runs this for the row it touched, so correcting a
 * short line re-enables checkout immediately rather than after another rejected
 * round trip. The staff member has already been told the available figure; a
 * second 409 to confirm they typed it correctly is a wasted request made while
 * a customer waits.
 */
function withoutShortfall(
  shortfalls: QuickSaleShortfalls,
  inventoryItemId: string,
): QuickSaleShortfalls {
  if (!(inventoryItemId in shortfalls)) return shortfalls;
  const next = { ...shortfalls };
  delete next[inventoryItemId];
  return next;
}

export const useQuickSaleCartStore = create<QuickSaleCartState>((set) => ({
  ...EMPTY_STATE,

  addItem: ({ quantity = 1, ...item }) =>
    set((state) => {
      if (!Number.isInteger(quantity) || quantity < 1) return state;

      const existing = state.items.find(
        (line) => line.inventoryItemId === item.inventoryItemId,
      );

      // The merge. See the module note: a repeat scan is another unit of the
      // same line, not another line.
      if (existing) {
        return {
          items: state.items.map((line) =>
            line.inventoryItemId === item.inventoryItemId
              ? { ...line, quantity: line.quantity + quantity }
              : line,
          ),
          shortfalls: withoutShortfall(state.shortfalls, item.inventoryItemId),
        };
      }

      return { items: [...state.items, { ...item, quantity }] };
    }),

  incrementQuantity: (inventoryItemId) =>
    set((state) => ({
      items: state.items.map((line) =>
        line.inventoryItemId === inventoryItemId
          ? { ...line, quantity: line.quantity + 1 }
          : line,
      ),
      shortfalls: withoutShortfall(state.shortfalls, inventoryItemId),
    })),

  /**
   * At quantity one this removes the row.
   *
   * That is the opposite of `invoiceBuilderStore.updateLineQuantity`, which
   * refuses to reach zero so that a line can only leave through an explicit,
   * confirmed removal. The counter is a different interaction: stepping the
   * last unit off a scanned item is how staff undo a mis-scan mid-sale, and
   * making them find a separate control for it — with a confirmation — while a
   * customer waits is friction the POS path cannot carry. Nothing is lost
   * either way: re-scanning the barcode restores the row.
   */
  decrementQuantity: (inventoryItemId) =>
    set((state) => {
      const existing = state.items.find(
        (line) => line.inventoryItemId === inventoryItemId,
      );
      if (!existing) return state;

      if (existing.quantity <= 1) {
        return {
          items: state.items.filter((line) => line.inventoryItemId !== inventoryItemId),
          shortfalls: withoutShortfall(state.shortfalls, inventoryItemId),
        };
      }

      return {
        items: state.items.map((line) =>
          line.inventoryItemId === inventoryItemId
            ? { ...line, quantity: line.quantity - 1 }
            : line,
        ),
        shortfalls: withoutShortfall(state.shortfalls, inventoryItemId),
      };
    }),

  /**
   * The numeric input's setter. Zero, negatives and fractions are rejected
   * rather than applied: they are unrepresentable on the wire — `quickSaleSchema`
   * requires a positive integer — so accepting one here would only defer the
   * failure to the moment of checkout, and treating zero as a deletion would
   * drop a line while the customer is still adding to it.
   */
  setQuantity: (inventoryItemId, quantity) =>
    set((state) => {
      if (!Number.isInteger(quantity) || quantity < 1) return state;
      return {
        items: state.items.map((line) =>
          line.inventoryItemId === inventoryItemId ? { ...line, quantity } : line,
        ),
        shortfalls: withoutShortfall(state.shortfalls, inventoryItemId),
      };
    }),

  removeItem: (inventoryItemId) =>
    set((state) => ({
      items: state.items.filter((line) => line.inventoryItemId !== inventoryItemId),
      shortfalls: withoutShortfall(state.shortfalls, inventoryItemId),
    })),

  /**
   * Replaces the shortfall map wholesale from a rejected checkout.
   *
   * A merge would be wrong: the server evaluated the whole cart, so an item
   * absent from the new list is an item that is no longer short.
   */
  setShortfalls: (shortfalls) =>
    set(() => ({
      shortfalls: Object.fromEntries(
        shortfalls.map((entry) => [entry.inventoryItemId, entry.available]),
      ),
    })),

  reset: () => set({ ...EMPTY_STATE, items: [], shortfalls: {} }),
}));

/**
 * The cart as `quickSaleSchema`'s `items`.
 *
 * ## The shape is bare on purpose (D-34)
 *
 * Each entry is `{ inventoryItemId, quantity }` and nothing else — in
 * particular it carries no `stockMovementId`. That absence is load-bearing, not
 * an omission:
 *
 *  * A Quick Sale's stock has not moved when this request is sent. The dispense
 *    *is* the request, so finalize performs its own FIFO deduction and creates
 *    the movement.
 *  * `restoreToStock` treats a line's `stockMovementId` as proof the movement
 *    pre-dated the invoice — a drug administered during a consultation — and
 *    skips it on void. A Quick Sale line carrying one would therefore stop D-34
 *    restoring counter-sale stock, which is the exact case D-34 exists to
 *    cover.
 *
 * The test parses this function's output with the real `quickSaleSchema` and
 * asserts the key set exactly, so widening the shape fails a test rather than
 * quietly breaking void restoration months later.
 *
 * No money is sent. `unitPricePaise` is display state; the server re-reads the
 * item's own selling price, which is the only price a counter sale has.
 */
export function toQuickSaleItems(
  items: readonly QuickSaleCartItem[],
): { inventoryItemId: string; quantity: number }[] {
  return items.map((item) => ({
    inventoryItemId: item.inventoryItemId,
    quantity: item.quantity,
  }));
}

/** True while any cart row is still short — the checkout button's disable gate. */
export function hasUnresolvedShortfall(shortfalls: QuickSaleShortfalls): boolean {
  return Object.keys(shortfalls).length > 0;
}
