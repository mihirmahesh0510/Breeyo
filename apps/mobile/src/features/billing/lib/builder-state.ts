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

import type { StockShortfall } from '@breeyo/types';
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
