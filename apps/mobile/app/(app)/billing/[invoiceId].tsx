import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { InvoiceDetailScreen } from '../../../src/features/billing/screens/InvoiceDetailScreen';

/**
 * `/billing/[invoiceId]` — the D-18 full in-app invoice view.
 *
 * ## A sibling of `(tabs)`, not a child of it
 *
 * `app/(app)/(tabs)/billing.tsx` is a *file* — the Billing tab itself — so
 * there is no `(tabs)/billing/` directory a child route could live in, and a
 * push to one silently does nothing. `settings`, `new`, `quick-sale` and
 * `from-consultation` are all siblings for the same reason; this completes the
 * set (deferred item 19, logged by plan 06-21).
 *
 * Three call sites already navigate here through
 * `BILLING_ROUTES.invoiceDetail(id)` and were inert until this file existed:
 * the dashboard's list rows, the builder's finalize-success replace, and the
 * builder's `INVOICE_NOT_DRAFT` 409 recovery.
 *
 * ## Why the dynamic segment does not swallow its static siblings
 *
 * Expo Router resolves a static segment ahead of a dynamic one at the same
 * depth, so `/billing/settings` still reaches `settings.tsx` rather than
 * arriving here with `invoiceId === 'settings'`. `credit-note/[invoiceId]` is
 * two segments deep and does not compete at all.
 *
 * A thin delegate in the shape `patient/[petId].tsx` set: the param is read
 * here rather than in the screen, so the screen stays mountable from anywhere.
 */
export default function InvoiceDetailRoute() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();

  if (!invoiceId) return null;

  return <InvoiceDetailScreen invoiceId={invoiceId} />;
}
