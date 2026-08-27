'use client';

// Finding 9.3 (PHASE-09-VERIFY-FIX-PLAN.md, D-71): `InvoiceDetailSheet` and
// `PaymentResultBanner` were both built to render a `receiptUrl` no backend
// contract ever produced -- the real `PaymentReceipt` route is
// staff-only/authenticated and was never exposed through the owner-portal's
// public contract. This hook is the frontend wiring for the new scoped
// `GET /owner-portal/:token/invoices/:invoiceId/receipt` route
// (`apps/api/src/modules/owner-portal/receipt.controller.ts`).
//
// It checks the receipt actually exists (a 404 means the invoice has no
// captured payment yet) BEFORE ever handing back a URL, rather than always
// building one from `token`/`invoiceId` and letting a click 404 -- both
// `InvoiceDetailSheet` and `PaymentResultBanner` already render their "View
// Receipt" link conditionally on `receiptUrl` being non-null.
//
// WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): that scoped endpoint
// returns bare `200 application/json` -- no HTML template, no content
// negotiation -- so a `receiptUrl` built from `apiUrl(path)` sent an owner
// tapping "View Receipt" straight to raw `{"data": {...}}` in their
// browser. The existence check below still calls that JSON endpoint (an
// invoice with no captured payment must not render a link that 404s on
// click), but the URL handed back now points at the internal Next.js page
// route (`apps/web/app/portal/[token]/invoice/[invoiceId]/receipt/page.tsx`)
// that fetches the same data and renders it as a formatted receipt.
import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';

interface ReceiptResponse {
  data: {
    invoiceId: string;
    receiptNumber: string;
    amountPaise: number;
    method: string;
    transactionRef: string | null;
    issuedAt: string;
  };
}

/**
 * `invoiceId` of `null` (no invoice open yet, or a checkout that hasn't
 * resolved to `'success'`) skips the fetch entirely and resolves to `null`.
 */
export function usePortalReceiptUrl(token: string, invoiceId: string | null): string | null {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setReceiptUrl(null);
      return;
    }

    let cancelled = false;
    const path = `/api/v1/owner-portal/${token}/invoices/${invoiceId}/receipt`;
    const internalRoute = `/portal/${token}/invoice/${invoiceId}/receipt`;

    apiClient<ReceiptResponse>(path)
      .then(() => {
        if (!cancelled) setReceiptUrl(internalRoute);
      })
      .catch(() => {
        // 404 (no receipt yet), 403 (out of scope), or a network error all
        // collapse to "no link to show" -- never a link that 404s on click.
        if (!cancelled) setReceiptUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [token, invoiceId]);

  return receiptUrl;
}
