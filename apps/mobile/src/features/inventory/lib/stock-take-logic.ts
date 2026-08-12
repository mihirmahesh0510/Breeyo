/**
 * Pure, React-free stock-take logic (D-37/D-38/D-40) -- extracted for direct
 * vitest testability, per the `lib/`-extraction convention established by
 * Plan 05-06 (`lib/fifo-dispense-logic.ts`, `lib/stock-adjustment-logic.ts`)
 * since `@testing-library/react-native`'s renderer is broken in this repo
 * (05-04-SUMMARY.md finding #5).
 */
import { stockTakeSchema } from '@breeyo/validators';
import type { StockTakeEntry, StockTakeSummary, StockTakeResult } from '@breeyo/types';

export type DiscrepancyStatus = 'match' | 'over' | 'under';

/** 24h of inactivity auto-discards a stock-take session (D-37/D-40 -- no
 *  formal audit module, but a session left open this long is stale). */
export const STOCK_TAKE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** actualCount - systemQty. Positive = overcounted, negative = undercounted. */
export function getDiscrepancy(actualCount: number, systemQty: number): number {
  return actualCount - systemQty;
}

export function getDiscrepancyStatus(actualCount: number, systemQty: number): DiscrepancyStatus {
  const diff = getDiscrepancy(actualCount, systemQty);
  if (diff === 0) return 'match';
  return diff > 0 ? 'over' : 'under';
}

/**
 * Whether a stock-take session started at `startedAt` has exceeded the 24h
 * TTL. An inactive session (`startedAt === null`) is never "expired" -- there
 * is nothing to discard.
 */
export function isStockTakeSessionExpired(startedAt: Date | null, now: number = Date.now()): boolean {
  if (!startedAt) return false;
  return now - startedAt.getTime() > STOCK_TAKE_SESSION_TTL_MS;
}

export interface StockTakeSubmissionEntry {
  itemId: string;
  actualCount: number;
}

/**
 * Maps the store's entry list into the exact `stockTakeSchema` shape and
 * validates it (min 1 entry, non-negative integer counts) before the caller
 * POSTs to /inventory/stock-take. Throws a ZodError on an empty/invalid
 * entry list -- the screen is expected to disable "Complete Stock-Take"
 * until at least one entry exists, so this is a defensive last check.
 */
export function buildStockTakeSubmission(entries: StockTakeSubmissionEntry[]) {
  return stockTakeSchema.parse({
    entries: entries.map((e) => ({ itemId: e.itemId, actualCount: e.actualCount })),
  });
}

/** Convenience formatter for the discrepancy value shown next to a row/summary line, e.g. "+3" / "-2" / "0". */
export function formatSignedQuantity(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export interface StockTakeCountedEntry {
  itemId: string;
  itemName: string;
  systemQty: number;
  actualCount: number;
  /** Known only when the entry was added via the item picker (which fetches
   *  full InventoryItem rows); barcode-scanned entries don't carry a price
   *  (see useBarcodeScan.ts's ScanResultItemView), so their contribution to
   *  the *client-side preview's* valueDifference is 0 -- the authoritative
   *  value difference always comes from the server's response after Save,
   *  computed from the real DB price regardless of what this preview knew. */
  sellingPrice?: number;
}

/**
 * D-40: client-side discrepancy summary, computed *before* the stock-take is
 * actually persisted -- lets "Complete Stock-Take" show a review screen with
 * Save/Discard (per the UI-SPEC's "summary... Saveable as record" framing)
 * without committing anything until "Save Stock-Take" is tapped. The POST
 * /inventory/stock-take endpoint has no dry-run mode (it's a single
 * transactional commit -- see stock-take.service.ts), so this mirrors its
 * exact discrepancy math (`difference = actualCount - systemQty`) to produce
 * an equivalent preview; the authoritative summary (esp. valueDifference,
 * which needs the real per-item sellingPrice from the DB) still comes from
 * the server's response once Save actually submits.
 */
export function computeClientSummary(entries: StockTakeCountedEntry[]): StockTakeSummary {
  const results: StockTakeResult[] = entries.map((e) => {
    const difference = getDiscrepancy(e.actualCount, e.systemQty);
    return {
      itemId: e.itemId,
      itemName: e.itemName,
      systemQty: e.systemQty,
      actualQty: e.actualCount,
      difference,
      // `|| 0` normalizes a -0 result (e.g. difference=-2, no known price ->
      // -2*0 === -0) to a plain 0 for clean equality checks/display.
      valueDifference: difference * (e.sellingPrice ?? 0) || 0,
    };
  });

  return {
    itemsCounted: results.length,
    matches: results.filter((r) => r.difference === 0).length,
    discrepancies: results.filter((r) => r.difference !== 0).length,
    overCount: results.filter((r) => r.difference > 0).length,
    underCount: results.filter((r) => r.difference < 0).length,
    totalValueDifference: results.reduce((sum, r) => sum + r.valueDifference, 0),
    results,
  };
}

// Re-export so callers that only need the type don't need a second import.
export type { StockTakeEntry };
