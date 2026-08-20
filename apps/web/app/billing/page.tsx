'use client';

// D-22, D-24, D-40, D-42, D-43: the browser billing workbench -- collection,
// unpaid/overdue review, payment history, and refund/void admin actions
// that stay Admin-only per D-22.
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useAuth } from '../../src/lib/AuthProvider';
import { useDashboardCockpit } from '../../src/features/dashboard/hooks/useDashboardCockpit';
import { DashboardShell } from '../../src/components/app-shell/DashboardShell';
import { useBillingWorkbench } from '../../src/features/billing/hooks/useBillingWorkbench';
import { BillingWorkbench } from '../../src/features/billing/components/BillingWorkbench';
import styles from './billing.module.css';

export default function BillingPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  // D-83: if `billingEnabled` is revoked while this page is open, the very
  // next cockpit fetch this hook makes redirects away from here.
  const cockpit = useDashboardCockpit({ currentModulePanelId: 'BILLING' });

  const workbench = useBillingWorkbench();

  if (!ready) {
    return null;
  }

  const visiblePanelIds = cockpit.data?.panels.map((panel) => panel.panelId) ?? [];

  const handleRefresh = () => {
    workbench.acknowledgeAndRefetch();
  };

  const handleReviewChanges = () => {
    workbench.dismissRealtimeNotice();
  };

  return (
    <DashboardShell visiblePanelIds={visiblePanelIds} userName={user?.fullName ?? ''} roleLabel="Staff">
      <main className={styles.page}>
        <h1 className={styles.title}>Billing</h1>

        {workbench.error ? (
          <p className={styles.errorText}>Could not refresh live clinic data. Retry this panel or reopen the module.</p>
        ) : null}
        {workbench.isLoading && !workbench.data ? <p>Loading…</p> : null}

        {workbench.data ? (
          <BillingWorkbench
            data={workbench.data}
            actorName={user?.fullName ?? 'You'}
            hasRealtimeStaleNotice={workbench.realtimeNotice !== null}
            onRefresh={handleRefresh}
            onReviewChanges={handleReviewChanges}
            onCollectPayment={workbench.collectPayment}
            onRefund={workbench.refundInvoice}
            onVoid={workbench.voidInvoice}
          />
        ) : null}
      </main>
    </DashboardShell>
  );
}
