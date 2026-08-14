/**
 * The invoice builder's client-owned line-item draft.
 *
 * ## Why a Zustand store exists here at all
 *
 * 06-PATTERNS.md's rule is that server state lives in React Query and Zustand
 * holds only ephemeral UI state. The builder's line-item draft is the one
 * legitimate exception in this feature: between "Add Service" and "Save Draft"
 * the lines exist nowhere but on the device, so there is no server state to
 * cache. The moment the draft is saved, the server's copy is authoritative
 * again and `hydrate` re-seeds this store from it.
 *
 * ## NO TOTAL, TAX OR SUBTOTAL MAY BE STORED HERE
 *
 * This is the load-bearing constraint of the module, and
 * `__tests__/invoiceBuilderStore.test.ts` enumerates the state's keys to
 * enforce it. Two independent reasons:
 *
 *  1. **Tampering (T-06-102).** A client that holds a grand total is a client
 *     that can send one. The finalize contract takes no money at all — see
 *     `finalizeInvoiceSchema` — and the server recomputes from the stored
 *     line items, so a total here could only ever be decoration over a figure
 *     the server will disagree with.
 *  2. **Drift (T-06-103).** The server's figure is `taxable + three already
 *     rounded tax heads`, with per-head rounding at invoice level under
 *     Section 170 / Rule 51 and a separate `roundOffPaise` disclosure. Any
 *     client-side re-derivation of that would be a second implementation of a
 *     statutory rounding rule, and the two would diverge on the first invoice
 *     with a fractional tax head.
 *
 * The live figure the builder displays comes from `usePreviewTotals`, and the
 * authoritative one from the finalize response. Neither is stored here.
 *
 * Plain `create<T>` with no middleware of any kind — no storage layer, no dev
 * tooling wrapper, no draft-mutation helper. That is the convention set by
 * `features/queue/store/queueUIStore.ts` and asserted by a phase-level grep
 * gate, which matches on the middleware names as literals; this note therefore
 * describes the prohibition without writing them, since a gate that trips on
 * the comment explaining it is worse than no gate.
 */

import { create } from 'zustand';
import type { DiscountType, InvoiceLineType, TaxTreatment } from '@breeyo/types';

/**
 * One editable line.
 *
 * Every field except `localId` is a field `invoiceLineItemInputSchema` accepts,
 * spelled identically. That is deliberate: `toInvoiceLineItemInputs` below only
 * has to drop `localId`, so there is no mapping layer between this shape and
 * the wire that could drift from the schema as either side changes.
 */
export interface InvoiceBuilderLine {
  /**
   * A client-side identity for list keys and for addressing a line in the
   * mutators. It exists because two adds of the same catalog service are two
   * distinct lines (see `addLine`), so `serviceCatalogId` is not unique and a
   * list index would be invalidated by every removal.
   *
   * Never sent to the server.
   */
  localId: string;
  lineType: InvoiceLineType;
  serviceCatalogId?: string;
  inventoryItemId?: string;
  /**
   * Present when Phase 5's dispense flow already decremented a batch for this
   * line. Finalize stamps the invoice id onto that movement instead of
   * deducting stock a second time.
   */
  stockMovementId?: string;
  description: string;
  quantity: number;
  unitPricePaise: number;
  hsnSacCode?: string;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
  /**
   * The discount the user typed, unapplied. `percent` carries a whole
   * percentage of 0-100 and `flat` carries integer paise; the server applies it
   * and pro-rates the invoice-level share across lines (D-07).
   */
  discountType?: DiscountType;
  discountValue?: number;
}

/** What a caller supplies to {@link InvoiceBuilderState.addLine}. */
export type InvoiceBuilderLineInput = Omit<InvoiceBuilderLine, 'localId'>;

/**
 * The saved-draft projection {@link InvoiceBuilderState.hydrate} accepts.
 *
 * Structurally a subset of `InvoiceDetail`, declared here rather than imported
 * as `Pick<InvoiceDetail, ...>` so that a draft assembled from a narrower
 * response — or from a test fixture — satisfies it without carrying the
 * fifty-odd fields of a full invoice. `dueDate` is a string because it crosses
 * the wire as ISO 8601.
 */
export interface InvoiceBuilderDraft {
  invoiceDiscountType: DiscountType | null;
  invoiceDiscountValue: number | null;
  dueDate: string | null;
  notes: string | null;
  lineItems: readonly InvoiceBuilderDraftLine[];
}

export interface InvoiceBuilderDraftLine {
  lineType: InvoiceLineType;
  serviceCatalogId: string | null;
  inventoryItemId: string | null;
  stockMovementId: string | null;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPricePaise: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
}

interface InvoiceBuilderState {
  lines: InvoiceBuilderLine[];
  invoiceDiscountType: DiscountType | null;
  /** Whole percent for `percent`, integer paise for `flat`. Never applied here. */
  invoiceDiscountValue: number | null;
  /** ISO 8601, or null to accept the clinic's default-due-days offset. */
  dueDate: string | null;
  notes: string;

  addLine: (line: InvoiceBuilderLineInput) => void;
  updateLineQuantity: (localId: string, quantity: number) => void;
  setLineDiscount: (localId: string, type: DiscountType | null, value: number | null) => void;
  removeLine: (localId: string) => void;
  setInvoiceDiscount: (type: DiscountType | null, value: number | null) => void;
  setDueDate: (dueDate: string | null) => void;
  setNotes: (notes: string) => void;
  hydrate: (draft: InvoiceBuilderDraft) => void;
  reset: () => void;
}

/**
 * Monotonic within the JS runtime, which is exactly the lifetime a list key
 * needs. `crypto.randomUUID` is not available on Hermes without a polyfill and
 * a uuid dependency would be three kilobytes for a value that never leaves the
 * device. The counter is module-scoped rather than store-scoped so that
 * `reset()` cannot reissue an id a still-mounted row is keyed by.
 */
let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `line-${localIdCounter}`;
}

const EMPTY_STATE = {
  lines: [] as InvoiceBuilderLine[],
  invoiceDiscountType: null,
  invoiceDiscountValue: null,
  dueDate: null,
  notes: '',
} satisfies Omit<
  InvoiceBuilderState,
  | 'addLine'
  | 'updateLineQuantity'
  | 'setLineDiscount'
  | 'removeLine'
  | 'setInvoiceDiscount'
  | 'setDueDate'
  | 'setNotes'
  | 'hydrate'
  | 'reset'
>;

/** `null` from the wire becomes an absent optional, which is what Zod expects. */
function optional<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export const useInvoiceBuilderStore = create<InvoiceBuilderState>((set) => ({
  ...EMPTY_STATE,

  /**
   * Appends. It deliberately does **not** merge a repeat of the same
   * `serviceCatalogId` into a quantity increment.
   *
   * A vet may legitimately bill two consultations on one visit — a second
   * opinion, or a re-examination later the same day — and each carries its own
   * description and possibly its own discount. Silently collapsing them would
   * misstate the invoice and destroy the per-line discount the front desk just
   * applied. This is the deliberate opposite of the Quick Sale cart (06-13),
   * where a repeated scan of the same barcode IS a quantity increment, because
   * a counter sale of two identical tins is one line by nature.
   */
  addLine: (line) =>
    set((state) => ({
      lines: [...state.lines, { ...line, localId: nextLocalId() }],
    })),

  /**
   * Zero is rejected rather than treated as a removal: a quantity stepper held
   * down to zero would otherwise delete a line without the `Remove [item name]?`
   * confirmation the UI-SPEC's destructive-actions table requires. Removal is
   * always the explicit `removeLine`.
   *
   * Non-integer and negative values are rejected for the same reason
   * `invoiceLineItemInputSchema` rejects them — they are unrepresentable on the
   * wire, so accepting them here would only defer the failure to submit time.
   */
  updateLineQuantity: (localId, quantity) =>
    set((state) => {
      if (!Number.isInteger(quantity) || quantity < 1) return state;
      return {
        lines: state.lines.map((line) =>
          line.localId === localId ? { ...line, quantity } : line,
        ),
      };
    }),

  setLineDiscount: (localId, type, value) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.localId === localId
          ? { ...line, discountType: optional(type), discountValue: optional(value) }
          : line,
      ),
    })),

  removeLine: (localId) =>
    set((state) => ({ lines: state.lines.filter((line) => line.localId !== localId) })),

  setInvoiceDiscount: (invoiceDiscountType, invoiceDiscountValue) =>
    set({ invoiceDiscountType, invoiceDiscountValue }),

  setDueDate: (dueDate) => set({ dueDate }),

  setNotes: (notes) => set({ notes }),

  /**
   * Replaces the whole state from a fetched draft.
   *
   * A merge would be wrong: the draft on the server is what the invoice
   * currently is, and anything in the store that is not in it has either been
   * removed elsewhere or belongs to a different invoice.
   *
   * `invoiceDiscountValue` is carried through unchanged. The server stores
   * exactly the value the client sent — a whole percentage for `percent` — so
   * the round trip needs no rescaling here.
   */
  hydrate: (draft) =>
    set({
      lines: draft.lineItems.map((item) => ({
        localId: nextLocalId(),
        lineType: item.lineType,
        serviceCatalogId: optional(item.serviceCatalogId),
        inventoryItemId: optional(item.inventoryItemId),
        stockMovementId: optional(item.stockMovementId),
        description: item.description,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        hsnSacCode: optional(item.hsnSacCode),
        taxTreatment: item.taxTreatment,
        gstRatePercent: item.gstRatePercent,
        discountType: optional(item.discountType),
        discountValue: optional(item.discountValue),
      })),
      invoiceDiscountType: draft.invoiceDiscountType,
      invoiceDiscountValue: draft.invoiceDiscountValue,
      dueDate: draft.dueDate,
      notes: draft.notes ?? '',
    }),

  /**
   * T-06-107. The builder is a shared module-level store, so without this a
   * front desk that backs out of one patient's invoice and starts another would
   * see the first patient's lines — and, if they did not notice, bill them.
   * Plan 06-21 owns the unmount cleanup that calls it.
   */
  reset: () => set({ ...EMPTY_STATE, lines: [] }),
}));

/**
 * The store's lines as the request body's `lineItems`.
 *
 * The only transformation is dropping `localId`. Every remaining key is spelled
 * as `invoiceLineItemInputSchema` spells it, and the test parses the output of
 * this function with that exact schema, so a rename on either side fails a test
 * rather than producing a 400 at the counter.
 *
 * `undefined` optionals are preserved rather than nulled: Zod's `.optional()`
 * accepts an absent key, not a null one.
 */
export function toInvoiceLineItemInputs(
  lines: readonly InvoiceBuilderLine[],
): Omit<InvoiceBuilderLine, 'localId'>[] {
  return lines.map(({ localId: _localId, ...rest }) => {
    const input: Omit<InvoiceBuilderLine, 'localId'> = {
      lineType: rest.lineType,
      description: rest.description,
      quantity: rest.quantity,
      unitPricePaise: rest.unitPricePaise,
      taxTreatment: rest.taxTreatment,
      gstRatePercent: rest.gstRatePercent,
    };

    // Assigned conditionally so an absent optional stays absent rather than
    // becoming an explicit `undefined` key, which `JSON.stringify` drops but
    // `Object.keys` does not — and the shape test enumerates keys.
    if (rest.serviceCatalogId !== undefined) input.serviceCatalogId = rest.serviceCatalogId;
    if (rest.inventoryItemId !== undefined) input.inventoryItemId = rest.inventoryItemId;
    if (rest.stockMovementId !== undefined) input.stockMovementId = rest.stockMovementId;
    if (rest.hsnSacCode !== undefined) input.hsnSacCode = rest.hsnSacCode;
    if (rest.discountType !== undefined) input.discountType = rest.discountType;
    if (rest.discountValue !== undefined) input.discountValue = rest.discountValue;

    return input;
  });
}
