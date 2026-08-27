'use client';

// WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): "View Receipt" (from
// `InvoiceDetailSheet` and `PaymentResultBanner`) previously pointed
// straight at the scoped API contract endpoint
// (`GET /api/v1/owner-portal/:token/invoices/:invoiceId/receipt`), which
// returns bare JSON with no HTML template -- a pet owner tapping the link
// saw raw `{"data": {...}}` in their browser. This route is the internal,
// formatted stand-in `usePortalReceiptUrl` now points at: it fetches the
// exact same scoped endpoint client-side (the same pattern every other
// owner-portal route in this app uses -- see `PortalBody.tsx`) and renders
// the result through `ReceiptView` instead of exposing the raw payload.
//
// Deliberately does NOT render inside `PortalShell` (no pet switcher, no
// tab bar, no `usePortalSession` deep-link resolution) -- this is a single
// standalone document opened in a new tab from an invoice/checkout-success
// context, not a tab of the portal shell itself.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '../../../../../../src/lib/api';
import { ReceiptView, type OwnerPortalReceiptData } from '../../../../../../src/features/owner-portal/components/ReceiptView';
import styles from './receipt-page.module.css';

interface ReceiptResponse {
  data: OwnerPortalReceiptData;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; receipt: OwnerPortalReceiptData };

export default function OwnerPortalReceiptPage() {
  const params = useParams<{ token: string; invoiceId: string }>();
  const { token, invoiceId } = params;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    apiClient<ReceiptResponse>(`/api/v1/owner-portal/${token}/invoices/${invoiceId}/receipt`)
      .then((response) => {
        if (!cancelled) setState({ status: 'ready', receipt: response.data });
      })
      .catch(() => {
        // 404 (no receipt yet), 403 (out of scope), or a network error all
        // collapse to the same "can't show this" message -- this route
        // never distinguishes them for the owner, matching
        // `usePortalReceiptUrl`'s existence check upstream, which should
        // already have kept a broken link from being clicked in the first
        // place.
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [token, invoiceId]);

  if (state.status === 'loading') {
    return (
      <div className={styles.centered} data-testid="receipt-page-loading">
        <p>Loading receipt…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.centered} data-testid="receipt-page-error">
        <p>We couldn&rsquo;t load this receipt. Contact your clinic if this keeps happening.</p>
      </div>
    );
  }

  return <ReceiptView receipt={state.receipt} />;
}
