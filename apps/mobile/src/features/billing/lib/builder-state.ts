/**
 * The invoice builder's React-Native-free decision layer.
 *
 * `apps/mobile` cannot render a React Native component under test: vitest runs
 * the `node` environment with no Metro/Babel transform, so `import
 * 'react-native'` fails at parse time, and `react-test-renderer` is not
 * installed. 06-14 hit the same wall and resolved it the same way, as did Phase
 * 5 before it. Everything in this module is therefore importable by a test —
 * and everything the builder decides lives here rather than inside a `.tsx`.
 *
 * Nothing in this file computes money. Discount input is parsed and validated
 * here, but it is reported upward as the raw type and value the user entered;
 * the server applies it, pro-rates the invoice-level share and computes every
 * total (T-06-102, T-06-103).
 */

import type { DiscountType, StockShortfall } from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';

// ─── Search and preview timing ──────────────────────────────────────────────

/** 06-UI-SPEC "Search Behavior (Phase 6)". The same figure Phase 3 and 5 use. */
export const CATALOG_SEARCH_DEBOUNCE_MS = 300;
export const CATALOG_SEARCH_MIN_CHARS = 2;

/**
 * The totals preview is debounced longer than search because it is a round trip
 * per keystroke on a *quantity* field, and a stale total on a screen the front
 * desk is about to finalize from is worse than a slightly late one.
 *
 * The timer itself lives at the call site (the screen, plan 06-21), not inside
 * `usePreviewTotals`. React Query's mutation API gives a hook no place to hold a
 * pending timer that survives a re-render without a ref the hook would then have
 * to expose for cleanup, and the screen already owns the effect that watches the
 * line list. `usePreviewTotals` is therefore an undebounced mutation plus this
 * constant, and 06-21 wires the delay.
 */
export const PREVIEW_TOTALS_DEBOUNCE_MS = 400;

/**
 * Whether a totals preview is worth issuing.
 *
 * Two gates. There is no draft id until the builder has saved once, and the
 * endpoint computes from *persisted* line items, so a preview before the first
 * save has nothing to read. And an empty line list would return a zeroed
 * breakdown that the screen would render as `₹0.00` — a figure indistinguishable
 * from a real one on the surface where cash is collected.
 */
export function shouldPreviewTotals(
  invoiceId: string | null | undefined,
  lineCount: number,
): boolean {
  return !!invoiceId && lineCount > 0;
}

// ─── BIL-02 stock shortfalls ────────────────────────────────────────────────

function isStockShortfall(value: unknown): value is StockShortfall {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.description === 'string' &&
    typeof candidate.requested === 'number' &&
    typeof candidate.available === 'number'
  );
}

/**
 * The per-item shortfall list carried by finalize's `INSUFFICIENT_STOCK` 409.
 *
 * Structural, never textual. `error-handler.ts` forwards `details` intact for
 * any status below 500, so the numbers arrive as numbers; parsing them back out
 * of the human-readable message would make the banner's copy hostage to a
 * server-side wording change, and would silently render nothing the first time
 * someone rephrased it.
 *
 * Returns an empty list — never throws and never returns null — because every
 * caller renders "no shortfalls" the same way as "not a stock error", and a
 * banner that crashes the finalize screen would be a worse failure than the
 * shortfall it was trying to report. An entry missing `available` or `requested`
 * is dropped rather than rendered with `undefined` in the sentence.
 */
export function stockShortfallsFrom(error: unknown): StockShortfall[] {
  if (!(error instanceof ApiClientError)) return [];
  if (error.code !== 'INSUFFICIENT_STOCK') return [];

  const raw = error.details?.shortfalls;
  if (!Array.isArray(raw)) return [];

  return raw.filter(isStockShortfall);
}

// ─── Line gross (display only) ──────────────────────────────────────────────

/**
 * The `Amount` column of a line-item row: unit price times quantity.
 *
 * This is the one multiplication the builder performs on a money value, and it
 * is bounded on every side that matters:
 *
 *  * Both operands are integers, so the product is exact — there is no rounding
 *    decision to get wrong and nothing to drift from.
 *  * It is **gross**. It excludes the line discount, the pro-rated invoice
 *    discount and every tax head, so it is not a total of anything and is not
 *    comparable to the server's `lineTotalPaise`.
 *  * It is never sent. The request body carries `unitPricePaise` and `quantity`
 *    as separate fields (see `invoiceLineItemInputSchema`) and the server does
 *    its own multiplication.
 *
 * It exists because 06-UI-SPEC's line-item row specifies an `Amount` column and
 * a line that has not been saved yet has no server-computed figure to show.
 */
export function lineGrossPaise(line: { unitPricePaise: number; quantity: number }): number {
  return line.unitPricePaise * line.quantity;
}

// ─── Due date (D-23) ────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Midnight UTC of the calendar day `date` falls on. */
function startOfDayUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * `now + days`, normalised to midnight so that two invoices raised on the same
 * day carry the same due date regardless of the hour.
 *
 * A negative offset is clamped to today: an invoice that falls due before it
 * was raised is immediately overdue, which would flag it on the dashboard the
 * moment it is finalized.
 *
 * The server applies the clinic's `defaultDueDays` itself when the request
 * omits `dueDate` (`InvoiceService.computeDueDate`), so this is only used once
 * the user has moved the picker off the default.
 */
export function dueDateFromOffset(days: number, now: Date = new Date()): string {
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  return new Date(startOfDayUtc(now) + safeDays * MS_PER_DAY).toISOString();
}

/** The inverse, for rendering a hydrated draft's due date back on the stepper. */
export function offsetFromDueDate(
  dueDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dueDate) return null;

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return null;

  return Math.round((startOfDayUtc(parsed) - startOfDayUtc(now)) / MS_PER_DAY);
}

// ─── Rupee input (T-06-105) ─────────────────────────────────────────────────

export type RupeeParseResult = { ok: true; paise: number } | { ok: false; error: string };

/** Digits, optionally a decimal point and one or two more digits. Nothing else. */
const RUPEE_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

export const RUPEE_ERRORS = {
  empty: 'Enter an amount',
  malformed: 'Enter a number, for example 250 or 250.50',
  tooPrecise: 'Amounts go to two decimal places',
} as const;

/**
 * The ONLY place in the builder where a rupee figure the user typed becomes
 * paise. Every other money value in this feature is already integer paise from
 * the server, and every display goes through `formatPaiseINR`.
 *
 * The conversion is done with integer arithmetic on the two digit groups rather
 * than by multiplying a parsed float, because `0.29 * 100` is
 * `28.999999999999996` and `Math.round` of a chain of such values is how a
 * clinic ends up a paisa short on a reconciliation. The pattern also rejects
 * exponent notation, a leading sign and a second decimal point, all of which
 * `Number()` would happily accept and silently reinterpret.
 *
 * Three or more decimal places are rejected rather than rounded: `10.005`
 * entered on a price field is a typo, and choosing a rounding direction on the
 * user's behalf is choosing which way the clinic loses money.
 */
export function parseRupeesToPaise(raw: string): RupeeParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: RUPEE_ERRORS.empty };

  const match = RUPEE_PATTERN.exec(trimmed);
  if (!match) {
    // Distinguish "too many decimals" from "not a number at all" so the inline
    // error tells the user what to change.
    const tooPrecise = /^\d+\.\d{3,}$/.test(trimmed);
    return { ok: false, error: tooPrecise ? RUPEE_ERRORS.tooPrecise : RUPEE_ERRORS.malformed };
  }

  const [, rupees, fraction = ''] = match;
  const paiseDigits = fraction.padEnd(2, '0');

  return { ok: true, paise: Number(rupees) * 100 + Number(paiseDigits) };
}

// ─── Discount input (T-06-104, D-07, D-40) ──────────────────────────────────

export type DiscountParseResult =
  | { ok: true; type: DiscountType; value: number }
  | { ok: false; error: string };

export const DISCOUNT_ERRORS = {
  /** Quoted from `discountGuard` in `@breeyo/validators` so both sides agree. */
  percentTooLarge: 'A percentage discount cannot exceed 100',
  percentNotWhole: 'Enter a whole percentage',
  empty: 'Enter a discount',
} as const;

/**
 * Validates what the user typed into a discount field and normalises it to the
 * unit the shared schema expects — a whole percentage for `percent`, integer
 * paise for `flat`.
 *
 * It does **not** apply the discount. The type and value are reported upward
 * and sent to the server, which applies them, pro-rates the invoice-level share
 * across lines and recomputes tax on the result. A client that applied its own
 * discount would produce a figure the server disagrees with the moment the
 * pro-rating rounds differently (T-06-103).
 *
 * D-40 sets no approval threshold: 100% is a legal input for Front Desk and
 * Admin alike, so the only rejection here is of a value the schema itself
 * cannot carry.
 */
export function parseDiscountInput(type: DiscountType, raw: string): DiscountParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: DISCOUNT_ERRORS.empty };

  if (type === 'flat') {
    const parsed = parseRupeesToPaise(trimmed);
    return parsed.ok ? { ok: true, type, value: parsed.paise } : parsed;
  }

  if (!/^\d+$/.test(trimmed)) return { ok: false, error: DISCOUNT_ERRORS.percentNotWhole };

  const percent = Number(trimmed);
  if (percent > 100) return { ok: false, error: DISCOUNT_ERRORS.percentTooLarge };

  return { ok: true, type, value: percent };
}
