import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CreditNoteScreen } from '../../../../src/features/billing/screens/CreditNoteScreen';

/**
 * `/billing/credit-note/[invoiceId]` — D-19 / D-22's credit note against an
 * existing invoice.
 *
 * The parameter is the *invoice* being credited, not the credit note: the note
 * does not exist yet, and its number is assigned by the server inside the
 * issuing transaction (D-19's gap-free `CN-YYYYMM-XXXX` counter).
 *
 * Two segments under `billing/`, so it does not compete with the one-segment
 * `[invoiceId]` detail route beside it. Reached from the detail screen's
 * `Issue Credit Note` action via `BILLING_ROUTES.creditNote(id)`.
 */
export default function CreditNoteRoute() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();

  if (!invoiceId) return null;

  return <CreditNoteScreen invoiceId={invoiceId} />;
}
