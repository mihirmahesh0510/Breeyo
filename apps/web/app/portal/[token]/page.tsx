'use client';

// Plan 09-06 Task 1: the owner-portal overview-first route (D-46 to D-51,
// D-57, D-60, D-63, OWN-01, OWN-02). Deliberately a separate, simpler
// 'use client' page -- no `DashboardShell`, no `useAuth`, no Socket.IO; see
// `PortalShell.tsx`'s header comment for why.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { OwnerPortalInvoiceSummary } from '@breeyo/types';
import { apiClient } from '../../../src/lib/api';
import { PortalShell, type PortalShellRenderContext } from '../../../src/features/owner-portal/components/PortalShell';
import { OwnerSummaryCard } from '../../../src/features/owner-portal/components/OwnerSummaryCard';
import { VisitTimeline } from '../../../src/features/owner-portal/components/VisitTimeline';
import type { VisitCardEntry } from '../../../src/features/owner-portal/components/VisitCard';
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

function usePetInvoices(token: string, petId: string | null) {
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
  }, [token, petId]);

  return { invoices, isLoading, setInvoices };
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

function OverviewTab({ token, context }: { token: string; context: PortalShellRenderContext }) {
  const { visits } = usePetRecords(token, context.selectedPetId);
  const mostRecentVisit = visits?.[0] ?? null;

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
      />
    </div>
  );
}

function RecordsTab({ token, context }: { token: string; context: PortalShellRenderContext }) {
  const { visits, isLoading } = usePetRecords(token, context.selectedPetId);

  if (isLoading && !visits) {
    return <p className={styles.stateText}>Loading records…</p>;
  }

  return <VisitTimeline visits={visits ?? []} />;
}

// Task 1 placeholder -- Task 2 replaces this with `InvoiceList` +
// `CheckoutHandoffSheet` (per-pet browsing, multi-invoice selection, and the
// explicit Razorpay handoff). Kept intentionally minimal here so Task 1's
// route does not depend on a Task 2 file that does not exist yet.
function InvoicesTab({ token, context }: { token: string; context: PortalShellRenderContext }) {
  const { invoices, isLoading } = usePetInvoices(token, context.selectedPetId);

  if (isLoading && !invoices) {
    return <p className={styles.stateText}>Loading invoices…</p>;
  }

  if (!invoices || invoices.length === 0) {
    return <p className={styles.stateText}>No invoices yet</p>;
  }

  return (
    <ul className={styles.tabBody} data-testid="invoice-placeholder-list">
      {invoices.map((invoice) => (
        <li key={invoice.invoiceId} className={styles.stateText}>
          {invoice.invoiceNumber ?? invoice.invoiceId} — {invoice.status}
        </li>
      ))}
    </ul>
  );
}

export default function OwnerPortalOverviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  return (
    <PortalShell token={token}>
      {(context) => {
        if (context.activeTab === 'RECORDS') {
          return <RecordsTab token={token} context={context} />;
        }
        if (context.activeTab === 'INVOICES') {
          return <InvoicesTab token={token} context={context} />;
        }
        return <OverviewTab token={token} context={context} />;
      }}
    </PortalShell>
  );
}
