'use client';

// Plan 09-06: the owner-portal tab body (D-46 to D-51, D-57, D-59, D-60,
// D-63, D-66, D-69 to D-72, OWN-01 to OWN-03), shared by the overview route
// (`page.tsx`) and the invoice deep-link route
// (`invoice/[invoiceId]/page.tsx`).
//
// Deviation: this was originally written directly inside `page.tsx` with
// `PortalBody` as a second named export, so the invoice deep-link route
// could import and reuse it. `next build`'s page-shape typechecking
// rejects that -- "PortalBody is not a valid Page export field" -- because
// the App Router restricts `app/**/page.tsx` files to a fixed export
// surface (`default`, `generateStaticParams`, `metadata`, etc.), not
// arbitrary named exports. Discovered by running `pnpm --filter @breeyo/web
// build` (hard rule 5) partway through Task 2 rather than only at the very
// end, this file is the fix: the same component, just no longer inside a
// file `next build` treats as a route module.
//
// All tab bodies live inside this ONE component rather than three
// separately-mounted per-tab components: `usePortalCheckout`'s selection
// state (and the fetched pet records/invoices caches) need to survive a
// pet switch AND a tab switch. If each tab's body were its own component
// only rendered while `activeTab` matched, switching away and back would
// unmount/remount it and silently drop the owner's invoice selection --
// exactly the kind of dead end D-69/D-70's cross-pet combined checkout
// depends on not happening.
import { useEffect, useState } from 'react';
import type { OwnerPortalInvoiceSummary } from '@breeyo/types';
import { apiClient } from '../../../src/lib/api';
import type { PortalShellRenderContext } from '../../../src/features/owner-portal/components/PortalShell';
import { OwnerSummaryCard } from '../../../src/features/owner-portal/components/OwnerSummaryCard';
import { VisitTimeline } from '../../../src/features/owner-portal/components/VisitTimeline';
import type { VisitCardEntry } from '../../../src/features/owner-portal/components/VisitCard';
import { InvoiceList } from '../../../src/features/owner-portal/components/InvoiceList';
import { InvoiceDetailSheet } from '../../../src/features/owner-portal/components/InvoiceDetailSheet';
import { CheckoutHandoffSheet } from '../../../src/features/owner-portal/components/CheckoutHandoffSheet';
import { PaymentResultBanner } from '../../../src/features/owner-portal/components/PaymentResultBanner';
import { usePortalCheckout } from '../../../src/features/owner-portal/hooks/usePortalCheckout';
import { usePortalCareDates } from '../../../src/features/owner-portal/hooks/usePortalCareDates';
import { usePortalReceiptUrl } from '../../../src/features/owner-portal/hooks/usePortalReceiptUrl';
import styles from './portal-page.module.css';

interface RecordsResponse {
  data: { visits: VisitCardEntry[] };
}

interface InvoicesResponse {
  data: { invoices: OwnerPortalInvoiceSummary[] };
}

function usePetRecords(token: string, petId: string | null) {
  const [visits, setVisits] = useState<VisitCardEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!petId) {
      setVisits(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient<RecordsResponse>(`/api/v1/owner-portal/${token}/records?petId=${petId}`)
      .then((response) => {
        if (!cancelled) setVisits(response.data.visits);
      })
      .catch(() => {
        if (!cancelled) setVisits([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, petId]);

  return { visits, isLoading };
}

function usePetInvoices(token: string, petId: string | null, refetchKey: number) {
  const [invoices, setInvoices] = useState<OwnerPortalInvoiceSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!petId) {
      setInvoices(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient<InvoicesResponse>(`/api/v1/owner-portal/${token}/invoices?petId=${petId}`)
      .then((response) => {
        if (!cancelled) setInvoices(response.data.invoices);
      })
      .catch(() => {
        if (!cancelled) setInvoices([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, petId, refetchKey]);

  return { invoices, isLoading };
}

/** D-49: pet snapshot cards, above the fold, on Overview -- rich medical preview posture, not billing-only. */
function PetSnapshotGrid({ context }: { context: PortalShellRenderContext }) {
  return (
    <div className={styles.petGrid} data-testid="pet-snapshot-grid">
      {context.session.pets.map((pet) => (
        <div key={pet.petId} className={styles.petCard}>
          <div>
            <p className={styles.petName}>{pet.name}</p>
            <p className={styles.petSpecies}>{pet.species}</p>
          </div>
          {pet.hasUnpaidInvoice ? <span className={styles.unpaidBadge}>Payment due</span> : null}
        </div>
      ))}
    </div>
  );
}

export interface PortalBodyProps {
  token: string;
  context: PortalShellRenderContext;
  /** D-60, D-63: the invoice deep-link route pre-opens this id, but every other tab stays reachable. */
  initialOpenInvoiceId?: string;
}

export function PortalBody({ token, context, initialOpenInvoiceId }: PortalBodyProps) {
  const { visits, isLoading: visitsLoading } = usePetRecords(token, context.selectedPetId);
  const { careDates } = usePortalCareDates(token, context.selectedPetId);
  const [invoiceRefetchKey, setInvoiceRefetchKey] = useState(0);
  const { invoices, isLoading: invoicesLoading } = usePetInvoices(token, context.selectedPetId, invoiceRefetchKey);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(initialOpenInvoiceId ?? null);
  const [showCheckoutSheet, setShowCheckoutSheet] = useState(false);

  const checkout = usePortalCheckout(token, context.session.magicLinkId);

  const mostRecentVisit = visits?.[0] ?? null;
  const openInvoice = invoices?.find((invoice) => invoice.invoiceId === openInvoiceId) ?? null;

  // Finding 9.3 (D-71): "receipt access" for the open invoice sheet, and for
  // the checkout success banner (the first invoice paid in this checkout --
  // a combined multi-invoice payment issues one receipt per invoice leg, see
  // `webhook.worker.ts`, so this links the first rather than attempting to
  // surface every leg's receipt on one banner). Both resolve to `null` until
  // a receipt is confirmed to exist server-side.
  const openInvoiceReceiptUrl = usePortalReceiptUrl(token, openInvoice?.invoiceId ?? null);
  const successReceiptInvoiceId =
    checkout.returnState === 'success' ? checkout.selectedInvoiceIds[0] ?? null : null;
  const successReceiptUrl = usePortalReceiptUrl(token, successReceiptInvoiceId);

  const handleProceedToCheckout = async () => {
    const result = await checkout.startCheckout();
    if (result) {
      setShowCheckoutSheet(true);
    }
  };

  const handleConfirmHandoff = () => {
    setShowCheckoutSheet(false);
    checkout.openPaymentHandoff(() => {
      // D-71/D-72: on return focus, re-fetch this pet's invoices and let
      // the actual balance decide success vs. interrupted -- see
      // usePortalCheckout.ts's header comment for why nothing here ever
      // fabricates a `'success'` outcome.
      setInvoiceRefetchKey((n) => n + 1);
      const stillOwed = checkout.selectedInvoiceIds.some((id) => {
        const invoice = invoices?.find((candidate) => candidate.invoiceId === id);
        return !invoice || invoice.balancePaise > 0;
      });
      checkout.markReturn(stillOwed ? 'interrupted' : 'success');
    });
  };

  if (context.activeTab === 'RECORDS') {
    if (visitsLoading && !visits) {
      return <p className={styles.stateText}>Loading records…</p>;
    }
    return <VisitTimeline visits={visits ?? []} />;
  }

  if (context.activeTab === 'INVOICES') {
    return (
      <div className={styles.tabBody}>
        {checkout.returnState !== 'idle' ? (
          <PaymentResultBanner
            state={checkout.returnState}
            receiptUrl={successReceiptUrl}
            onRetry={() => {
              checkout.reset();
            }}
          />
        ) : null}

        {invoicesLoading && !invoices ? (
          <p className={styles.stateText}>Loading invoices…</p>
        ) : (
          <InvoiceList
            invoices={invoices ?? []}
            selectedInvoiceIds={checkout.selectedInvoiceIds}
            onToggleSelect={checkout.toggleInvoiceSelection}
            onOpenInvoice={setOpenInvoiceId}
            onProceedToCheckout={handleProceedToCheckout}
          />
        )}

        {openInvoice ? (
          <InvoiceDetailSheet
            invoice={openInvoice}
            receiptUrl={openInvoiceReceiptUrl}
            onClose={() => setOpenInvoiceId(null)}
            onPay={(invoiceId) => {
              if (!checkout.selectedInvoiceIds.includes(invoiceId)) {
                checkout.toggleInvoiceSelection(invoiceId);
              }
              setOpenInvoiceId(null);
            }}
          />
        ) : null}

        {showCheckoutSheet && checkout.checkoutResult ? (
          <CheckoutHandoffSheet
            amountDuePaise={checkout.checkoutResult.amountDuePaise}
            petBreakdown={checkout.checkoutResult.petBreakdown}
            isSubmitting={checkout.isSubmitting}
            onConfirm={handleConfirmHandoff}
            onCancel={() => setShowCheckoutSheet(false)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.tabBody}>
      <PetSnapshotGrid context={context} />
      <OwnerSummaryCard
        totalDuePaise={context.session.totalDuePaise}
        recentVisit={
          mostRecentVisit
            ? {
                visitDate: mostRecentVisit.visitDate,
                visitReason: mostRecentVisit.visitReason,
                diagnosisGloss: mostRecentVisit.diagnosisGloss,
              }
            : null
        }
        careDates={careDates}
      />
    </div>
  );
}
