import React from 'react';
import { QuickSaleScreen } from '../../../src/features/billing/screens/QuickSaleScreen';

/**
 * D-04 Quick Sale, the counter-sale path.
 *
 * A sibling of `(tabs)`, not a child, for the same reason `billing/settings`
 * is: it is a full-screen flow that pushes over the tab bar, the way
 * `patient/register` does. Plan 06-14 recorded a `(tabs)/billing/quick-sale`
 * path, which would require converting `(tabs)/billing.tsx` into a directory —
 * a restructure of a screen this plan does not own. `BILLING_ROUTES.quickSale`
 * is corrected to match this file instead; see `06-18-SUMMARY.md`.
 */
export default function QuickSaleRoute() {
  return <QuickSaleScreen />;
}
