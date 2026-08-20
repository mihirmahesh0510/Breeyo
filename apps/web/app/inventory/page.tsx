'use client';

// D-26, D-30 to D-37: the richest browser module in Phase 9 -- Stock &
// Batches (default, D-32), Reordering, and Analytics inside one module shell
// (D-31), with a strong-confirmation flow for risky stock changes (D-34)
// and an explicit mobile-first scanning boundary (D-37) instead of a
// browser camera workflow.
import { useState } from 'react';
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useAuth } from '../../src/lib/AuthProvider';
import { useDashboardCockpit } from '../../src/features/dashboard/hooks/useDashboardCockpit';
import { DashboardShell } from '../../src/components/app-shell/DashboardShell';
import {
  useInventoryWorkbench,
  type InventoryWebTab,
  type InventoryStockRow,
} from '../../src/features/inventory/hooks/useInventoryWorkbench';
import { InventoryTabBar } from '../../src/features/inventory/components/InventoryTabBar';
import { InventoryActionTable } from '../../src/features/inventory/components/InventoryActionTable';
import { InventoryReorderPanel } from '../../src/features/inventory/components/InventoryReorderPanel';
import { InventoryAnalyticsPanel } from '../../src/features/inventory/components/InventoryAnalyticsPanel';
import { RiskyStockChangeDialog } from '../../src/features/inventory/components/RiskyStockChangeDialog';
import styles from './inventory.module.css';

export default function InventoryPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  // D-83: if `inventoryEnabled` is revoked while this page is open, the very
  // next cockpit fetch this hook makes redirects away from here.
  const cockpit = useDashboardCockpit({ currentModulePanelId: 'INVENTORY' });

  const [activeTab, setActiveTab] = useState<InventoryWebTab>('stock');
  const workbench = useInventoryWorkbench(activeTab);
  const [pendingRemoval, setPendingRemoval] = useState<InventoryStockRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!ready) {
    return null;
  }

  const visiblePanelIds = cockpit.data?.panels.map((panel) => panel.panelId) ?? [];

  const handleAddStock = async (itemId: string, quantity: number, reason: string) => {
    await workbench.adjustStock(itemId, { quantity, type: 'add', reason });
  };

  const confirmRemoval = async (reason: string, notes: string) => {
    if (!pendingRemoval) return;
    setIsSubmitting(true);
    try {
      await workbench.adjustStock(pendingRemoval.itemId, {
        quantity: 1,
        type: 'remove',
        reason,
        notes: notes || undefined,
      });
      setPendingRemoval(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardShell visiblePanelIds={visiblePanelIds} userName={user?.fullName ?? ''} roleLabel="Staff">
      <main className={styles.page}>
        <h1 className={styles.title}>Inventory</h1>
        {/* D-37: browser inventory never adds a camera workflow -- scanning stays mobile-first. */}
        <p className={styles.scanningNotice}>
          Use mobile scanner for barcode capture. {workbench.data?.scanningBoundaryMessage ?? ''}
        </p>

        <InventoryTabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {workbench.error ? (
          <p className={styles.errorText}>Could not refresh live clinic data. Retry this panel or reopen the module.</p>
        ) : null}
        {workbench.isLoading ? <p>Loading…</p> : null}

        {workbench.data?.stockAndBatches ? (
          <InventoryActionTable
            rows={workbench.data.stockAndBatches.rows}
            writeAllowed={workbench.data.stockAndBatches.writeAllowed}
            onAddStock={handleAddStock}
            onRequestRemoveStock={(row) => setPendingRemoval(row)}
          />
        ) : null}

        {workbench.data?.reordering ? (
          <InventoryReorderPanel
            payload={workbench.data.reordering}
            onExport={workbench.exportAnalytics}
            onOpenItem={() => setActiveTab('stock')}
          />
        ) : null}

        {workbench.data?.analytics ? (
          <InventoryAnalyticsPanel payload={workbench.data.analytics} onExport={workbench.exportAnalytics} />
        ) : null}

        <RiskyStockChangeDialog
          open={pendingRemoval !== null}
          itemName={pendingRemoval?.name ?? ''}
          actorName={user?.fullName ?? 'You'}
          isLoading={isSubmitting}
          onConfirm={confirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        />
      </main>
    </DashboardShell>
  );
}
