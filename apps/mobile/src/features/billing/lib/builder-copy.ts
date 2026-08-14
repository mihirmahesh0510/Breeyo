/**
 * The invoice builder's copy contract and its presentation decisions.
 *
 * Every string here is quoted from `06-UI-SPEC.md`'s "Invoice Builder Screen"
 * copy table or its destructive-actions row, and every one is asserted verbatim
 * by `__tests__/builder-copy.test.ts`. Copy lives in a module rather than in
 * JSX for the reason 06-14 established: `apps/mobile` cannot render a React
 * Native component under test, so a string inside a `.tsx` is a string nothing
 * can check.
 *
 * ## Two transliterations from the spec
 *
 *  * `Rs` becomes `₹`. The spec writes `Rs [N]` throughout; the product renders
 *    the rupee sign, because `formatPaiseINR` — the single money formatter —
 *    emits `₹` from `Intl` for `en-IN`. 06-14 made the same substitution.
 *  * `--` becomes `—`. The patient banner is specified as
 *    `[Pet Name] ([Species]) -- Owner: [Owner Name]`; the double hyphen is how
 *    the source markdown renders an em dash, and a literal `--` on screen would
 *    read as a typo.
 *
 * Nothing in this module computes money.
 */

import type { ServiceCatalog, StockShortfall, TaxBreakdown } from '@breeyo/types';

export const BUILDER_COPY = {
  /** Screen title when the front desk is billing a completed consultation. */
  screenTitleForPet: (petName: string) => `Invoice for ${petName}`,
  screenTitleStandalone: 'New Invoice',
  patientBanner: (petName: string, species: string, ownerName: string) =>
    `${petName} (${species}) — Owner: ${ownerName}`,

  sectionServices: 'Services',
  sectionProducts: 'Products',
  productsAutoFillNote: 'Dispensed items from consultation',
  addService: 'Add Service',
  addProduct: 'Add Product',
  serviceSearchPlaceholder: 'Search services',
  addCustomService: 'Add Custom Service',
  /**
   * 06-UI-SPEC gives the catalog sheet no empty-state copy. This follows the
   * dashboard's shape ("No invoices yet") and points at the way out, because the
   * sheet is never truly empty — `Add Custom Service` is always below it.
   */
  catalogEmpty: 'No services match. Add a custom service below.',
  customServiceNamePlaceholder: 'Service name',
  customServicePricePlaceholder: 'Price (₹)',

  qtyLabel: 'Qty',
  rateLabel: 'Rate',
  amountLabel: 'Amount',
  addDiscount: 'Add Discount',
  addInvoiceDiscount: 'Add Invoice Discount',
  discountValuePlaceholder: 'Discount',
  discountTypePercent: '%',
  discountTypeFlat: '₹',

  subtotalLabel: 'Subtotal',
  discountLabel: 'Discount',
  grandTotalLabel: 'Grand Total',
  cgstLabel: 'CGST',
  sgstLabel: 'SGST',
  igstLabel: 'IGST',
  roundOffLabel: 'Round Off',
  /**
   * The round-off figure is a GSTR-1 disclosure — `Σ (rounded − exact)` across
   * the three heads — and is deliberately NOT a component of the grand total,
   * because the heads are already rounded. Saying so is the difference between
   * a staff member trusting the column and trying to re-add it.
   */
  roundOffHint: 'GST rounding disclosure. Not added to the grand total.',

  dueDateLabel: 'Due Date',
  dueDateDefaultNote: (days: number) => `${days} days from today (clinic default)`,

  notesLabel: 'Invoice Notes (optional)',
  notesPlaceholder: 'Payment terms, special instructions...',

  /** Inline confirmation, per the UI-SPEC destructive-actions table. */
  removeConfirm: (itemName: string) => `Remove ${itemName}?`,
  removeConfirmAccept: 'Remove',
  removeConfirmCancel: 'Keep',

  /**
   * BIL-02. Built from the 409's structured `available` and `requested` rather
   * than from the API's message text, so the sentence stays under the client's
   * control and cannot be emptied by a server-side rewording.
   */
  stockShortfall: (shortfall: StockShortfall) =>
    `${shortfall.description} has insufficient stock (${shortfall.available} available, ${shortfall.requested} requested)`,

  /** D-45. Out-of-stock entries are shown disabled, never hidden. */
  outOfStock: 'Out of stock',
  unavailable: 'Unavailable',
} as const;

// ─── Totals rows (BIL-07, T-06-103) ─────────────────────────────────────────

export interface GstRow {
  key: 'cgst' | 'sgst' | 'igst';
  label: string;
  paise: number;
}

/**
 * Which GST rows a breakdown warrants — the whole of the GST display decision,
 * in one testable function.
 *
 * Three rules, in order:
 *
 *  1. **A clinic that is not GST-registered never sees a GST row.** Most solo
 *     vets are below the ₹20 lakh threshold and must not collect GST at all;
 *     showing the line would invite them to (D-17, Section 122). The
 *     `gstEnabled` gate comes first precisely so no combination of values can
 *     get past it.
 *  2. **IGST or the CGST/SGST pair, never both.** A supply is either
 *     inter-state or intra-state. A breakdown carrying all three is malformed;
 *     IGST wins, because the inter-state classification is the one that would
 *     have set it.
 *  3. **A zero head is omitted.** An exempt-only invoice from a registered
 *     clinic is a Bill of Supply with no tax to show.
 *
 * It returns the server's paise values untouched. No addition, no rounding, no
 * re-derivation — the heads are already rounded to whole rupees at invoice
 * level under Section 170 / Rule 51, and a second rounding here would disagree
 * with the figure on the filed return.
 */
export function gstRowsFor(
  breakdown: TaxBreakdown | undefined,
  gstEnabled: boolean,
): GstRow[] {
  if (!breakdown || !gstEnabled) return [];

  if (breakdown.igstPaise !== 0) {
    return [{ key: 'igst', label: BUILDER_COPY.igstLabel, paise: breakdown.igstPaise }];
  }

  const rows: GstRow[] = [];
  if (breakdown.cgstPaise !== 0) {
    rows.push({ key: 'cgst', label: BUILDER_COPY.cgstLabel, paise: breakdown.cgstPaise });
  }
  if (breakdown.sgstPaise !== 0) {
    rows.push({ key: 'sgst', label: BUILDER_COPY.sgstLabel, paise: breakdown.sgstPaise });
  }
  return rows;
}

/** The disclosure row appears only when there is something to disclose. */
export function showRoundOffRow(roundOffPaise: number | undefined): boolean {
  return roundOffPaise !== undefined && roundOffPaise !== 0;
}

// ─── Service catalog (D-02, D-45) ───────────────────────────────────────────

/**
 * A catalog row as the sheet renders it.
 *
 * `outOfStock` is not a `ServiceCatalog` field — services have no stock. It is
 * here because plan 06-21 composes this same sheet over inventory items for the
 * `Add Product` path, and D-45's rule (show it, disable it, say why) has to be
 * expressed once rather than twice.
 */
export interface ServiceCatalogEntry extends ServiceCatalog {
  outOfStock?: boolean;
}

/**
 * D-02's ordering: the six presets first, then the clinic's own services.
 *
 * Within each group, `sortOrder` then name. The name tiebreak matters because
 * seeded presets can share a `sortOrder`, and an unstable list reorders itself
 * under the user's finger between renders.
 *
 * Returns a new array — `Array.prototype.sort` mutates, and the input is a
 * React Query cache entry.
 */
export function sortCatalogEntries<T extends ServiceCatalog>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export interface CatalogEntryAvailability {
  selectable: boolean;
  /** Rendered beside the name when the entry cannot be added. */
  note: string | null;
}

/**
 * D-45: an entry that cannot be added is shown greyed out with the reason,
 * never hidden and never silently selectable.
 *
 * Hiding it is the tempting alternative and it is worse: the front desk knows
 * the clinic stocks the item, cannot find it, and either re-searches or bills it
 * as a custom line at a made-up price. Leaving it selectable is worse still —
 * finalize would fail with a 409 after the owner has been quoted a total.
 */
export function catalogEntryAvailability(entry: ServiceCatalogEntry): CatalogEntryAvailability {
  if (entry.outOfStock) return { selectable: false, note: BUILDER_COPY.outOfStock };
  if (!entry.isActive) return { selectable: false, note: BUILDER_COPY.unavailable };
  return { selectable: true, note: null };
}
