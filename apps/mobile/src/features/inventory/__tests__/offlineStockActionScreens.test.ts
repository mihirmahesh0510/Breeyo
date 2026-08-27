import { describe, it, expect } from 'vitest';
import { getDispenseQueuedToast } from '../lib/fifo-dispense-logic';
import { getStockReceiptQueuedToast } from '../lib/stock-receipt-logic';
import { getAdjustmentQueuedToast } from '../lib/stock-adjustment-logic';

/**
 * Verify-fix 10.2 (D-04, D-10, D-15 to D-17): `DispenseScreen.tsx`,
 * `StockReceiptScreen.tsx`, and `StockAdjustmentSheet.tsx` still called only
 * the online-only mutation hooks in `useInventoryApi.ts`/`useFifoDispense.ts`
 * directly -- a real network failure just set `serverError` and stopped,
 * even though `useOfflineStockActions.ts` (Plan 10-04) was already built,
 * tested, and ready to capture the action locally instead (10-04-SUMMARY.md
 * Deviation 2). This file covers the two testable slices of that fix:
 *
 *  1. The queued-for-sync toast copy each screen shows on the offline
 *     fallback path -- genuine pure-function behavioral tests (no RN
 *     import), same rationale as `stock-receipt-logic.ts`'s/
 *     `stock-adjustment-logic.ts`'s own header comments.
 *  2. Source assertions on the three screen files themselves, confirming
 *     the network-failure branch actually calls the corresponding
 *     `useOfflineStockActions` function instead of only `setServerError` --
 *     the same "RN import -- exercised via source assertions" convention
 *     `offlineStockActions.test.ts` (this same directory) already
 *     established for `useOfflineStockActions.ts`, since `apps/mobile`
 *     cannot render a `react-native`/`react-native-paper`/`expo-router`
 *     component under vitest's plain-node environment (see that file's
 *     bottom describe block and `BillingDashboardScreen.test.tsx`'s header
 *     comment for the same constraint documented elsewhere in this repo).
 */

describe('queued-for-sync toast copy (D-19 to D-21 calm, non-blocking marker)', () => {
  it('getDispenseQueuedToast is distinct from the online success toast wording', () => {
    expect(getDispenseQueuedToast(3, 'tablets', 'Amoxicillin 250mg')).toBe(
      '3 tablets of Amoxicillin 250mg dispensed -- will sync when back online',
    );
  });

  it('getStockReceiptQueuedToast is distinct from the online success toast wording', () => {
    expect(getStockReceiptQueuedToast(20, 'vials', 'Rabisin')).toBe(
      '20 vials of Rabisin received -- will sync when back online',
    );
  });

  it('getAdjustmentQueuedToast carries add/remove wording exactly like getAdjustmentSuccessToast, plus the sync caveat', () => {
    expect(getAdjustmentQueuedToast('add', 4, 'tablets', 'Amoxicillin 250mg')).toBe(
      '4 tablets added to Amoxicillin 250mg -- will sync when back online',
    );
    expect(getAdjustmentQueuedToast('remove', 4, 'tablets', 'Amoxicillin 250mg')).toBe(
      '4 tablets removed from Amoxicillin 250mg -- will sync when back online',
    );
  });
});

describe('DispenseScreen.tsx / StockReceiptScreen.tsx / StockAdjustmentSheet.tsx wiring (RN import -- exercised via source assertions, matching offlineStockActions.test.ts\'s own convention)', () => {
  async function readSource(relativePath: string): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf-8');
  }

  it('DispenseScreen.tsx falls through to useOfflineStockActions.dispenseOffline (single-attempt, no second online call) on a network failure instead of only setting serverError', async () => {
    const source = await readSource('../screens/DispenseScreen.tsx');

    expect(source).toMatch(/useOfflineStockActions/);
    expect(source).toMatch(/isNetworkFailure/);
    expect(source).toMatch(/offlineStockActions\.dispenseOffline\(/);
    expect(source).toMatch(/getDispenseQueuedToast/);
    // F3: the doubled-retry bug this replaces -- the screen already made its
    // own online attempt via `dispenseStock.mutateAsync`, so the fallback
    // must never call the online-attempting `dispenseStock` hook method too.
    expect(source).not.toMatch(/offlineStockActions\.dispenseStock\(/);

    // The network-failure branch must not be a dead end that only shows
    // serverError -- it must route through the offline hook first.
    const catchBlock = source.slice(source.indexOf('} catch (err)'));
    expect(catchBlock.indexOf('isNetworkFailure')).toBeGreaterThan(-1);
    expect(catchBlock.indexOf('offlineStockActions.dispenseOffline')).toBeGreaterThan(
      catchBlock.indexOf('isNetworkFailure'),
    );
  });

  it('StockReceiptScreen.tsx falls through to useOfflineStockActions.receiveOffline (single-attempt, no second online call) on a network failure instead of only setting serverError', async () => {
    const source = await readSource('../screens/StockReceiptScreen.tsx');

    expect(source).toMatch(/useOfflineStockActions/);
    expect(source).toMatch(/isNetworkFailure/);
    expect(source).toMatch(/offlineStockActions\.receiveOffline\(/);
    expect(source).toMatch(/getStockReceiptQueuedToast/);
    expect(source).not.toMatch(/offlineStockActions\.receiveStock\(/);

    const catchBlock = source.slice(source.indexOf('} catch (err)'));
    expect(catchBlock.indexOf('isNetworkFailure')).toBeGreaterThan(-1);
    expect(catchBlock.indexOf('offlineStockActions.receiveOffline')).toBeGreaterThan(
      catchBlock.indexOf('isNetworkFailure'),
    );
  });

  it('StockAdjustmentSheet.tsx falls through to useOfflineStockActions.adjustOffline (single-attempt, no second online call) on a network failure instead of only setting serverError', async () => {
    const source = await readSource('../screens/StockAdjustmentSheet.tsx');

    expect(source).toMatch(/useOfflineStockActions/);
    expect(source).toMatch(/isNetworkFailure/);
    expect(source).toMatch(/offlineStockActions\.adjustOffline\(/);
    expect(source).toMatch(/getAdjustmentQueuedToast/);
    expect(source).not.toMatch(/offlineStockActions\.adjustStock\(/);

    const catchBlock = source.slice(source.indexOf('} catch (err)'));
    expect(catchBlock.indexOf('isNetworkFailure')).toBeGreaterThan(-1);
    expect(catchBlock.indexOf('offlineStockActions.adjustOffline')).toBeGreaterThan(
      catchBlock.indexOf('isNetworkFailure'),
    );

    // StockAdjustmentSheet needs a `category` to seed the offline working-set
    // cache the first time an item is touched offline (StockActionKnownItem
    // requires it) -- the sheet had no such prop before this fix.
    expect(source).toMatch(/category/);
  });

  it('the route wrapper passes the item\'s real category into StockAdjustmentSheet so the offline fallback can seed its working-set cache', async () => {
    const source = await readSource('../../../../app/(app)/(tabs)/inventory/[itemId]/adjust.tsx');
    expect(source).toMatch(/category=\{itemQuery\.data\.category\}/);
  });
});
