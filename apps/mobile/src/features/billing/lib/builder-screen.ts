/**
 * The invoice builder screen's decision layer.
 *
 * `lib/builder-state.ts` (plan 06-16) owns the *inputs* the builder collects —
 * rupee parsing, discount validation, due-date offsets, the shortfall
 * extractor. This module owns what the *screen* decides: what goes in each
 * request body, what a finalize failure means, when the finalize button is
 * blocked, and what the totals section shows while a preview is in flight.
 *
 * It is React-Native-free for the reason recorded in 06-14, 06-15, 06-16 and
 * 06-23: vitest runs the `node` environment with no Metro transform, so
 * anything that imports `react-native` cannot be loaded by a test. Putting the
 * decisions here rather than in `InvoiceBuilderScreen.tsx` is what makes them
 * assertable at all.
 *
 * ## Nothing here computes money
 *
 * Not one function returns, sums or scales a total, a tax head or a taxable
 * value. The two request builders below are the only places this feature
 * assembles a body, and both are parsed by the shared schema from
 * `@breeyo/validators` — the exact object the Fastify handler parses — which
 * has no money field to carry and strips every key it does not declare
 * (T-06-102). The figures on screen come from `preview-totals` and from the
 * finalize response; see {@link totalsToRender}.
 *
 * The one arithmetic operation in the file is
 * {@link inventorySellingPriceToPaise}, which is a unit conversion on a single
 * price — not a total — and which delegates to plan 06-16's integer-safe parser
 * rather than multiplying a float (T-06-105).
 */

import {
  createInvoiceSchema,
  finalizeInvoiceSchema,
  type CreateInvoiceInput,
  type FinalizeInvoiceInput,
} from '@breeyo/validators';
import type {
  DiscountType,
  InventoryItem,
  InvoiceSource,
  ServiceCatalog,
  StockShortfall,
  TaxBreakdown,
  TaxTreatment,
} from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';
import { BUILDER_COPY } from './builder-copy';
import { parseRupeesToPaise, stockShortfallsFrom } from './builder-state';
import {
  toInvoiceLineItemInputs,
  type InvoiceBuilderDraft,
  type InvoiceBuilderDraftLine,
  type InvoiceBuilderLine,
  type InvoiceBuilderLineInput,
} from '../stores/invoiceBuilderStore';
import type { InvoiceTotalsAmounts } from '../components/InvoiceTotalsSection';

// ─── Copy ───────────────────────────────────────────────────────────────────

/**
 * The screen-level strings, quoted from 06-UI-SPEC's "Invoice Builder Screen"
 * copy table and its states contract.
 *
 * Separate from 06-16's `BUILDER_COPY` rather than merged into it because that
 * module is the *components'* copy contract and this plan may not change plan
 * 06-16's deliverables. Both are asserted verbatim by test, which is the point
 * of holding copy in a module at all: a string inside a `.tsx` is a string
 * nothing in this repo can check.
 */
export const BUILDER_SCREEN_COPY = {
  finalizeButton: 'Finalize Invoice',
  saveDraftButton: 'Save Draft',
  cancelButton: 'Cancel',

  finalizeSuccessToast: 'Invoice finalized',
  draftSavedToast: 'Invoice draft saved',

  /** 06-UI-SPEC "Invoice Builder Screen States" → Error. */
  saveErrorBanner: 'Could not save invoice. Please try again.',

  /**
   * The D-21 collision. 06-UI-SPEC has no copy for it because the spec does not
   * contemplate two people on one invoice, but a shared front desk makes it
   * routine: one person finalizes on the counter tablet while another still has
   * the builder open on a phone.
   *
   * It says what happened and what is about to happen, because a finalized
   * invoice is immutable — the edits on screen cannot be applied to it by any
   * retry, and silently dropping them or leaving the user tapping a button that
   * will never succeed are the two worse options.
   */
  alreadyFinalized: 'This invoice was already finalized. Opening the finalized invoice.',

  /** 06-UI-SPEC copy table → "Product search placeholder". */
  productSearchPlaceholder: 'Search inventory',
} as const;

// ─── Screen title (D-01, D-06) ──────────────────────────────────────────────

/**
 * `Invoice for [Pet Name]` when billing a patient, `New Invoice` otherwise.
 *
 * A blank-but-present name is treated as absent: `Invoice for ` with nothing
 * after it reads as a rendering bug, and the standalone title is always true.
 */
export function screenTitle(petName: string | null | undefined): string {
  const trimmed = petName?.trim();
  return trimmed ? BUILDER_COPY.screenTitleForPet(trimmed) : BUILDER_COPY.screenTitleStandalone;
}

// ─── Sections (D-01) ────────────────────────────────────────────────────────

export interface PartitionedLines {
  services: InvoiceBuilderLine[];
  products: InvoiceBuilderLine[];
  /**
   * Whether any product line came from Phase 5's dispense flow, which is the
   * only condition under which the `Dispensed items from consultation` caption
   * is a true statement.
   */
  hasDispensedProducts: boolean;
}

/**
 * Splits the line list into the screen's two sections.
 *
 * The caption is gated on `stockMovementId` rather than on the section being
 * non-empty. A product the front desk added by hand from the inventory sheet
 * has no stock movement behind it, and captioning it as dispensed would tell
 * the user the vet had already handed the item over — which is exactly the
 * question the caption exists to answer.
 */
export function partitionLines(lines: readonly InvoiceBuilderLine[]): PartitionedLines {
  const services = lines.filter((line) => line.lineType === 'service');
  const products = lines.filter((line) => line.lineType === 'product');

  return {
    services,
    products,
    hasDispensedProducts: products.some((line) => !!line.stockMovementId),
  };
}

// ─── Hydrating an existing draft (D-01, D-03) ───────────────────────────────

/**
 * The subset of a fetched invoice that `hydrate` accepts.
 *
 * 06-16 expected `InvoiceDetail` to satisfy `InvoiceBuilderDraft` structurally.
 * It does not, and the mismatch is the interesting kind: `InvoiceDetail.dueDate`
 * is declared `Date | null`, but the value that actually arrives is an ISO
 * **string**, because it crossed a JSON boundary and nothing revives it. The
 * declared type is a description of the server's in-memory shape, not of the
 * wire.
 *
 * So the input is typed as what genuinely arrives — either — and normalised to
 * the string the store and `updateDraftInvoiceSchema` both want. Passing a
 * `Date` straight through would have typechecked at the store's boundary in a
 * world where the field were really a `Date`, and would have produced
 * `"[object Object]"` on the wire in this one.
 *
 * Lines are ordered by `sortOrder` rather than trusted in array order: the rows
 * must not reshuffle under the user's finger between a refetch and a render.
 */
export interface HydratableInvoice {
  invoiceDiscountType: DiscountType | null;
  invoiceDiscountValue: number | null;
  dueDate: Date | string | null;
  notes: string | null;
  lineItems: readonly (InvoiceBuilderDraftLine & { sortOrder?: number })[];
}

export function draftFromInvoiceDetail(invoice: HydratableInvoice): InvoiceBuilderDraft {
  return {
    invoiceDiscountType: invoice.invoiceDiscountType,
    invoiceDiscountValue: invoice.invoiceDiscountValue,
    dueDate: toIsoStringOrNull(invoice.dueDate),
    notes: invoice.notes,
    lineItems: [...invoice.lineItems].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    ),
  };
}

/**
 * An unparseable date becomes `null` rather than `"Invalid Date"`, which the
 * server's `z.string().datetime()` would reject with a 400 on the next save —
 * turning a cosmetic problem into an invoice that cannot be saved at all.
 */
function toIsoStringOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// ─── The debounced preview's change signature ───────────────────────────────

/**
 * A stable string over everything the server's totals depend on.
 *
 * The screen debounces `preview-totals` on changes to this rather than on the
 * store object's identity, for two reasons that both cost real round trips:
 * Zustand hands out a new `lines` array on every mutation including ones that
 * change nothing billable, and `localId` — which is regenerated by `hydrate`
 * and never sent — would otherwise register as a change.
 *
 * It is built from `toInvoiceLineItemInputs`, the same projection the request
 * body uses, so the signature cannot drift from what is actually sent: a field
 * the server would price differently is a field in this string by construction.
 */
export function linesSignature(
  lines: readonly InvoiceBuilderLine[],
  invoiceDiscountType: DiscountType | null,
  invoiceDiscountValue: number | null,
): string {
  return JSON.stringify({
    lineItems: toInvoiceLineItemInputs(lines),
    invoiceDiscountType,
    invoiceDiscountValue,
  });
}

// ─── Request bodies (T-06-102) ──────────────────────────────────────────────

export interface DraftPayloadInput {
  lines: readonly InvoiceBuilderLine[];
  invoiceDiscountType: DiscountType | null;
  invoiceDiscountValue: number | null;
  dueDate: string | null;
  notes: string;
  petId: string | null;
  ownerId: string | null;
  consultationId: string | null;
  source: InvoiceSource;
}

/**
 * The create/update draft body.
 *
 * Most optionals are assigned conditionally rather than set to `null`, because
 * the shared schema's `.optional()` accepts an absent key and rejects a null
 * one — and because on the PATCH path an absent key means "unchanged" while a
 * present one means "set to this". Sending `dueDate: null` where the user
 * simply never touched the stepper would overwrite the clinic's default-due-days
 * offset with nothing.
 *
 * The invoice-level discount is the deliberate exception (CR-01), and the reason
 * is that the builder is the WHOLE draft, not a delta. The store is hydrated
 * from the invoice and every save replaces its line items wholesale, so "the
 * store has no discount" is a positive statement about what this invoice should
 * be — not an absence of information. Omitting the pair told the server
 * "unchanged", which is why a discount, once applied, could never be taken off
 * from this screen: the user cleared it, the request said nothing about it, and
 * it survived onto the finalized document. Both halves are sent together
 * because the shared `discountGuard` rejects half a discount in either spelling.
 *
 * The result is parsed by `createInvoiceSchema`, which carries no money field of
 * any kind and strips every key it does not declare. That parse is what makes
 * "the client cannot send a total" a property of the code rather than a promise:
 * a caller passing `grandTotalPaise` gets a body without one.
 */
export function buildDraftPayload(input: DraftPayloadInput): CreateInvoiceInput {
  const body: Record<string, unknown> = {
    source: input.source,
    lineItems: toInvoiceLineItemInputs(input.lines),
    invoiceDiscountType: input.invoiceDiscountType,
    invoiceDiscountValue: input.invoiceDiscountValue,
  };

  if (input.petId) body.petId = input.petId;
  if (input.ownerId) body.ownerId = input.ownerId;
  if (input.consultationId) body.consultationId = input.consultationId;
  if (input.dueDate) body.dueDate = input.dueDate;
  if (input.notes.trim()) body.notes = input.notes;

  return createInvoiceSchema.parse(body);
}

export interface FinalizeInputSource {
  dueDate: string | null;
  notes: string | null;
  placeOfSupplyStateCode: string | null;
}

/**
 * The finalize body — a due date, notes and a place of supply, and nothing else.
 *
 * No line items either: the invoice's contents are already persisted, and
 * finalize's job is to number it, freeze the tax snapshot and deduct stock in
 * one transaction. The server recomputes every figure from its own rows, so a
 * total in this body could only ever be a claim it would ignore — and a client
 * that can hold one is a client that can be modified to send `1`.
 *
 * `finalizeInvoiceSchema.parse` is load-bearing rather than decorative: it is
 * the same object the Fastify handler parses, and Zod strips unknown keys, so
 * the "no money in this body" property survives a future caller passing one.
 */
export function buildFinalizeInput(source: FinalizeInputSource): FinalizeInvoiceInput {
  const body: Record<string, unknown> = {};

  if (source.dueDate) body.dueDate = source.dueDate;
  if (source.notes?.trim()) body.notes = source.notes;
  if (source.placeOfSupplyStateCode) {
    body.placeOfSupplyStateCode = source.placeOfSupplyStateCode;
  }

  return finalizeInvoiceSchema.parse(body);
}

// ─── Finalize failures (BIL-02, D-21) ───────────────────────────────────────

export type FinalizeErrorKind = 'insufficient_stock' | 'not_draft' | 'other';

export interface FinalizeErrorOutcome {
  kind: FinalizeErrorKind;
  /** Non-empty only for `insufficient_stock`; drives `StockValidationBanner`. */
  shortfalls: StockShortfall[];
  /** Shown as a message; empty when the banner is speaking instead. */
  message: string;
  /** D-21: the invoice is no longer a draft, so the edits cannot be applied. */
  navigateToDetail: boolean;
  /** Whether the `Finalize Invoice` button should be disabled as a result. */
  blocksFinalize: boolean;
}

/**
 * Turns a finalize rejection into the three things the screen does about it.
 *
 * The two 409s are genuinely different failures and the plan is right to
 * separate them:
 *
 *  * `INSUFFICIENT_STOCK` is **recoverable in place**. The draft is still a
 *    draft; the front desk lowers a quantity or removes a line and finalizes
 *    again. Navigating away here would discard a fixable problem.
 *  * `INVOICE_NOT_DRAFT` is **not recoverable at all**. Someone else finalized
 *    this invoice, D-21 makes it immutable, and no retry from this screen can
 *    ever succeed. Leaving the user on a builder whose button will always fail
 *    is the worst of the options, so the screen says what happened and takes
 *    them to the invoice as it now stands.
 *
 * Everything else is treated as retryable: a 500 or a dropped connection has
 * not necessarily failed to finalize, and the user's edits are still on screen.
 *
 * Classification is on `code`, never on the message text — a server-side
 * rewording must not silently reclassify a failure.
 */
export function classifyFinalizeError(error: unknown): FinalizeErrorOutcome {
  if (error instanceof ApiClientError && error.code === 'INSUFFICIENT_STOCK') {
    return {
      kind: 'insufficient_stock',
      // Structural extraction from `details.shortfalls` (plan 06-16); an entry
      // missing its numbers is dropped rather than rendered with `undefined`.
      shortfalls: stockShortfallsFrom(error),
      message: '',
      navigateToDetail: false,
      blocksFinalize: true,
    };
  }

  if (error instanceof ApiClientError && error.code === 'INVOICE_NOT_DRAFT') {
    return {
      kind: 'not_draft',
      shortfalls: [],
      message: BUILDER_SCREEN_COPY.alreadyFinalized,
      navigateToDetail: true,
      blocksFinalize: true,
    };
  }

  return {
    kind: 'other',
    shortfalls: [],
    message: BUILDER_SCREEN_COPY.saveErrorBanner,
    navigateToDetail: false,
    blocksFinalize: false,
  };
}

/**
 * A stock rejection, pinned to the exact line list that caused it.
 *
 * The signature is what makes the block self-clearing. Without it the screen
 * would need to guess which edits count as "resolving" the shortfall — and
 * guessing wrong in the safe direction leaves the front desk with a permanently
 * disabled Finalize button and no way forward but backing out and losing the
 * invoice.
 */
export interface FinalizeBlock {
  signature: string;
  shortfalls: StockShortfall[];
}

/**
 * Whether `Finalize Invoice` is disabled by an earlier stock rejection.
 *
 * True only while the billable content is byte-for-byte what the server
 * rejected. Any edit that would change what is sent — a quantity, a removal, a
 * discount — produces a different signature and re-enables the button, which is
 * correct even when the edit does not obviously fix the shortfall: the server
 * is the authority on stock, and a second 409 is a cheap and honest answer,
 * whereas a button the user cannot re-enable is a dead end.
 */
export function isFinalizeBlocked(
  block: FinalizeBlock | null,
  lines: readonly InvoiceBuilderLine[],
  invoiceDiscountType: DiscountType | null,
  invoiceDiscountValue: number | null,
): boolean {
  if (!block) return false;
  return block.signature === linesSignature(lines, invoiceDiscountType, invoiceDiscountValue);
}

/**
 * Which rows `InvoiceLineItemRow` should mark with `hasShortfall`.
 *
 * Matched on `description`, because that is the only identifier the 409 carries
 * — `StockShortfall` has no line or item id. It is exact rather than fuzzy: a
 * near-match would highlight the wrong row, which is worse than highlighting
 * none, since the banner already names the item in full.
 */
export function shortfallLocalIds(
  lines: readonly InvoiceBuilderLine[],
  shortfalls: readonly StockShortfall[],
): string[] {
  if (shortfalls.length === 0) return [];
  const names = new Set(shortfalls.map((shortfall) => shortfall.description));
  return lines.filter((line) => names.has(line.description)).map((line) => line.localId);
}

// ─── Totals presentation (T-06-139) ─────────────────────────────────────────

/** The last figures the server returned, held so a refresh has something to dim. */
export interface PreviewResult {
  breakdown: TaxBreakdown;
  amounts: InvoiceTotalsAmounts;
}

export interface RenderedTotals {
  breakdown: TaxBreakdown | undefined;
  amounts: InvoiceTotalsAmounts | undefined;
  dimmed: boolean;
}

/**
 * What the totals section shows, including mid-refresh.
 *
 * The last successful figures stay on screen, dimmed, rather than blanking.
 * Blanking on every keystroke makes the grand total flicker on the one surface
 * where somebody is about to say a number out loud; dimming says "this is the
 * previous figure and a new one is coming" without ever showing a figure no
 * server produced.
 *
 * What it does NOT do is substitute client arithmetic for a missing response.
 * Before the first successful preview there is nothing to show, and the section
 * renders its own loading state — a `₹0.00` computed here would be
 * indistinguishable from a real total on the surface where cash is collected.
 */
export function totalsToRender(
  last: PreviewResult | null,
  isRefreshing: boolean,
): RenderedTotals {
  if (!last) {
    return { breakdown: undefined, amounts: undefined, dimmed: false };
  }
  return { breakdown: last.breakdown, amounts: last.amounts, dimmed: isRefreshing };
}

// ─── Catalog and inventory selections (D-02, D-45) ──────────────────────────

/**
 * A rate of zero means the line carries no tax, and `exempt` is how the tax
 * engine is told so. Sending `taxable` at 0% would produce the same money today
 * and the wrong document heading under CGST Rule 46A, which is a filing
 * question rather than a display one.
 */
function treatmentForRate(gstRatePercent: number): TaxTreatment {
  return gstRatePercent > 0 ? 'taxable' : 'exempt';
}

/** The clinic default stands in for an entry with no rate of its own (INV-09). */
function resolveRate(
  itemRate: number | null | undefined,
  clinicDefaultRate: number | null | undefined,
): number {
  return itemRate ?? clinicDefaultRate ?? 0;
}

/**
 * A D-02 catalog selection as a line.
 *
 * `price` is already integer paise on `ServiceCatalog`, so nothing is converted
 * here. Quantity starts at 1 and the front desk steps it up; two taps of the
 * same service deliberately produce two lines, per `addLine`'s contract.
 */
export function serviceLineFrom(
  entry: ServiceCatalog,
  clinicDefaultRate: number | null | undefined,
): InvoiceBuilderLineInput {
  const gstRatePercent = resolveRate(entry.gstRateOverride, clinicDefaultRate);
  const code = entry.sacCode ?? entry.hsnCode ?? undefined;

  const line: InvoiceBuilderLineInput = {
    lineType: 'service',
    serviceCatalogId: entry.id,
    description: entry.name,
    quantity: 1,
    unitPricePaise: entry.price,
    taxTreatment: treatmentForRate(gstRatePercent),
    gstRatePercent,
  };

  if (code) line.hsnSacCode = code;
  return line;
}

/**
 * A hand-entered service or product with no catalog/inventory backing —
 * `ServiceCatalogSheet.onAddCustom`/`ProductCatalogSheet.onAddCustom` hand
 * the screen a bare name+price pair rather than a catalog entry, so
 * `serviceLineFrom`/`inventoryLineFrom` (which both key off an entry's own
 * id and rate) don't apply. Falls back to the clinic default rate, same as
 * an override-less catalog entry.
 */
export function customLineFrom(
  lineType: 'service' | 'product',
  name: string,
  pricePaise: number,
  clinicDefaultRate: number | null | undefined,
): InvoiceBuilderLineInput {
  const gstRatePercent = resolveRate(undefined, clinicDefaultRate);

  return {
    lineType,
    description: name,
    quantity: 1,
    unitPricePaise: pricePaise,
    taxTreatment: treatmentForRate(gstRatePercent),
    gstRatePercent,
  };
}

/**
 * `InventoryItem.sellingPrice` is rupees as a `Decimal(10,2)`; every money value
 * in billing is integer paise (D-31). This is the conversion, and it is the only
 * one on the product path.
 *
 * It formats to two decimal places and hands the string to plan 06-16's
 * `parseRupeesToPaise`, which parses the two digit groups as integers. A direct
 * `sellingPrice * 100` would be a float multiply — `0.29 * 100` is
 * `28.999999999999996` — and rounding a chain of those is how a clinic ends up a
 * paisa short on a reconciliation (T-06-105).
 */
export function inventorySellingPriceToPaise(sellingPrice: number): number {
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return 0;

  const parsed = parseRupeesToPaise(sellingPrice.toFixed(2));
  return parsed.ok ? parsed.paise : 0;
}

/**
 * An inventory selection as a product line.
 *
 * No `stockMovementId`: adding an item here has dispensed nothing. Finalize
 * performs the FIFO deduction for a line without one, and stamps the invoice id
 * onto the existing movement for a line that has one — which is why a
 * consultation's dispensed items must keep theirs through `hydrate` and a
 * manually added product must not acquire one.
 */
export function inventoryLineFrom(
  item: InventoryItem,
  clinicDefaultRate: number | null | undefined,
): InvoiceBuilderLineInput {
  const gstRatePercent = resolveRate(item.gstRate, clinicDefaultRate);

  const line: InvoiceBuilderLineInput = {
    lineType: 'product',
    inventoryItemId: item.id,
    description: item.name,
    quantity: 1,
    unitPricePaise: inventorySellingPriceToPaise(item.sellingPrice),
    taxTreatment: treatmentForRate(gstRatePercent),
    gstRatePercent,
  };

  if (item.hsnSacCode) line.hsnSacCode = item.hsnSacCode;
  return line;
}
