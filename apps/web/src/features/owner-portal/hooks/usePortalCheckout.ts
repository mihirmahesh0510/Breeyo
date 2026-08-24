'use client';

// Plan 09-06 Task 2: combined one-or-many-invoice checkout (D-59, D-66,
// D-69 to D-72, OWN-03).
//
// Deviation worth flagging (see 09-06-SUMMARY.md "Deviations" for the full
// writeup): `PaymentService.createPaymentLink`/`createCombinedPaymentLink`
// (apps/api/src/modules/billing/payment.service.ts) never sets Razorpay's
// `callback_url`, so Razorpay's own hosted page does not redirect back into
// this portal after the owner pays or cancels, and no endpoint reports a
// checkout session's live status back to this client either (`returnState`
// on `OwnerPortalCheckoutSession` is written once at creation as `'pending'`
// and never updated by any route this phase built). There is therefore no
// server-driven signal this hook can wait on for "the owner has returned
// and here is what happened".
//
// What this hook does instead, and why it is honest rather than a guess:
//   - `startCheckout` failing (a thrown error from `POST /checkout` itself,
//     e.g. a stale/void invoice) maps to `'failure'` -- this is a real,
//     synchronous failure signal from the API.
//   - `openPaymentHandoff` opens the Razorpay `shortUrl` in a new tab and
//     starts listening for this tab regaining focus (`visibilitychange`).
//     On refocus, it calls `onRefetchInvoices` (supplied by the caller) and
//     leaves the actual success/failure read to the invoice data itself --
//     this hook only flips to `'interrupted'` if the owner returns and the
//     selected invoices still show a balance, which is the closest honest
//     read available without a webhook-fed status endpoint. It never
//     fabricates a `'success'`; the caller decides that itself once a
//     refetch shows the balance actually cleared (see
//     `app/portal/[token]/invoice/[invoiceId]/page.tsx`).
import { useCallback, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api';

export interface PortalCheckoutPetBreakdownEntry {
  petId: string;
  petName: string | null;
  invoiceIds: string[];
  amountPaise: number;
}

export interface PortalCheckoutPaymentLink {
  paymentLinkId: string;
  shortUrl: string;
  expiresAt: string;
  amountPaise: number;
}

/** Mirrors `PortalCheckoutResult` (`apps/api/src/modules/owner-portal/portal-checkout.service.ts`). */
export interface PortalCheckoutResult {
  checkoutSessionId: string;
  amountDuePaise: number;
  petBreakdown: PortalCheckoutPetBreakdownEntry[];
  paymentLink: PortalCheckoutPaymentLink;
  returnState: 'success' | 'failed' | 'interrupted' | 'pending';
}

export type PortalCheckoutReturnState = 'idle' | 'success' | 'failure' | 'interrupted';

export interface UsePortalCheckoutResult {
  selectedInvoiceIds: string[];
  toggleInvoiceSelection: (invoiceId: string) => void;
  clearSelection: () => void;
  isSubmitting: boolean;
  error: Error | null;
  checkoutResult: PortalCheckoutResult | null;
  returnState: PortalCheckoutReturnState;
  startCheckout: () => Promise<PortalCheckoutResult | null>;
  openPaymentHandoff: (onReturnFocus: () => void) => void;
  markReturn: (state: PortalCheckoutReturnState) => void;
  reset: () => void;
}

interface CheckoutResponse {
  data: PortalCheckoutResult;
}

/**
 * `POST /api/v1/owner-portal/:token/checkout` (OWN-03, D-59, D-66, D-69,
 * D-70). `magicLinkId` is required by the API's cross-check against the
 * token's own resolved scope (T-09-15) -- the caller supplies it from
 * `session.magicLinkId`, never a value this hook invents.
 */
export function usePortalCheckout(token: string, magicLinkId: string | undefined): UsePortalCheckoutResult {
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<PortalCheckoutResult | null>(null);
  const [returnState, setReturnState] = useState<PortalCheckoutReturnState>('idle');
  const focusListenerRef = useRef<(() => void) | null>(null);

  const toggleInvoiceSelection = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds((current) =>
      current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId],
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedInvoiceIds([]), []);

  const startCheckout = useCallback(async () => {
    if (!magicLinkId || selectedInvoiceIds.length === 0) {
      return null;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await apiClient<CheckoutResponse>(`/api/v1/owner-portal/${token}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ magicLinkId, selectedInvoiceIds }),
      });
      setCheckoutResult(response.data);
      setReturnState('idle');
      return response.data;
    } catch (err) {
      setError(err as Error);
      setReturnState('failure');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [token, magicLinkId, selectedInvoiceIds]);

  /**
   * Opens the Razorpay handoff in a NEW tab (not a full-page navigation) so
   * this portal tab stays alive and can detect the owner's return via the
   * Page Visibility API -- `onReturnFocus` is the caller's cue to re-fetch
   * invoice balances and decide success vs. interrupted for itself.
   */
  const openPaymentHandoff = useCallback((onReturnFocus: () => void) => {
    if (!checkoutResult) return;
    window.open(checkoutResult.paymentLink.shortUrl, '_blank', 'noopener,noreferrer');

    if (focusListenerRef.current) {
      document.removeEventListener('visibilitychange', focusListenerRef.current);
    }
    const listener = () => {
      if (document.visibilityState === 'visible') {
        onReturnFocus();
      }
    };
    focusListenerRef.current = listener;
    document.addEventListener('visibilitychange', listener);
  }, [checkoutResult]);

  const markReturn = useCallback((state: PortalCheckoutReturnState) => setReturnState(state), []);

  const reset = useCallback(() => {
    setSelectedInvoiceIds([]);
    setCheckoutResult(null);
    setReturnState('idle');
    setError(null);
    if (focusListenerRef.current) {
      document.removeEventListener('visibilitychange', focusListenerRef.current);
      focusListenerRef.current = null;
    }
  }, []);

  return {
    selectedInvoiceIds,
    toggleInvoiceSelection,
    clearSelection,
    isSubmitting,
    error,
    checkoutResult,
    returnState,
    startCheckout,
    openPaymentHandoff,
    markReturn,
    reset,
  };
}
