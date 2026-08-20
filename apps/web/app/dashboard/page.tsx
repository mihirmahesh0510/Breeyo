'use client';

// D-01: this is the operations cockpit, not a static module switchboard and
// not a schedule-first landing page -- it is also the default browser route
// (09-UI-SPEC.md "Home is the default browser route"). The auth guard runs
// first, matching `app/schedule/page.tsx`'s T-08-72 precedent: no chrome, not
// even a loading skeleton, renders before `useRequireAuth` resolves.
import type { DashboardPanelId } from '@breeyo/types';
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useAuth } from '../../src/lib/AuthProvider';
import { useDashboardCockpit } from '../../src/features/dashboard/hooks/useDashboardCockpit';
import { DashboardShell } from '../../src/components/app-shell/DashboardShell';
import { ExceptionStrip } from '../../src/features/dashboard/components/ExceptionStrip';
import { PriorityPanel } from '../../src/features/dashboard/components/PriorityPanel';
import { UserManagementMiniPanel } from '../../src/features/dashboard/components/UserManagementMiniPanel';
import styles from './dashboard.module.css';

/** Where each module panel's "Open <title>" link goes -- OWNER_EXCEPTIONS has no deeper page of its own in Phase 9, so it stays on the home anchor. */
const OPEN_MODULE_HREF: Record<DashboardPanelId, string> = {
  ALERTS: '/dashboard#alerts',
  QUEUE: '/queue',
  SCHEDULING: '/schedule',
  BILLING: '/billing',
  INVENTORY: '/inventory',
  USERS: '/users',
  OWNER_EXCEPTIONS: '/dashboard#owner-exceptions',
};

// D-07: Queue and Scheduling render as separate panels, never blended into
// one board. This list is deliberately every module panel EXCEPT `USERS`
// (its own mini-panel component) and the two exception panels (`ALERTS` at
// the top via `ExceptionStrip`, `OWNER_EXCEPTIONS` rendered directly below,
// after Users, per D-06's locked order).
const MODULE_PANEL_IDS: DashboardPanelId[] = ['QUEUE', 'SCHEDULING', 'BILLING', 'INVENTORY'];

export default function DashboardHomePage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const cockpit = useDashboardCockpit();

  if (!ready) {
    return null;
  }

  const panels = cockpit.data?.panels ?? [];
  const visiblePanelIds = panels.map((panel) => panel.panelId);
  const alertsPanel = panels.find((panel) => panel.panelId === 'ALERTS');
  const usersPanel = panels.find((panel) => panel.panelId === 'USERS');
  const ownerExceptionsPanel = panels.find((panel) => panel.panelId === 'OWNER_EXCEPTIONS');
  const modulePanels = MODULE_PANEL_IDS.map((panelId) => panels.find((panel) => panel.panelId === panelId)).filter(
    (panel): panel is NonNullable<typeof panel> => Boolean(panel),
  );

  // Discretionary (09-CONTEXT.md leaves exact composition to the agent):
  // the cockpit response doesn't carry a `roleCode` field of its own, so the
  // role badge is inferred from whether the `USERS` panel is present --
  // Admin is the only Phase 9 role with `usersEnabled` by default (D-21).
  const roleLabel = usersPanel ? 'Admin' : 'Staff';

  return (
    <DashboardShell visiblePanelIds={visiblePanelIds} userName={user?.fullName ?? ''} roleLabel={roleLabel}>
      <main className={styles.page}>
        <h1 className={styles.title}>Home</h1>

        {cockpit.error ? (
          <div className={styles.centeredState}>
            <p className={styles.centeredStateBody}>
              Could not refresh live clinic data. Retry this panel or reopen the module.
            </p>
            <button type="button" className={styles.tryAgainButton} onClick={() => cockpit.refetch()}>
              Try Again
            </button>
          </div>
        ) : (
          <>
            <ExceptionStrip panel={alertsPanel} />

            {modulePanels.map((panel) => (
              <PriorityPanel key={panel.panelId} panel={panel} openModuleHref={OPEN_MODULE_HREF[panel.panelId]} />
            ))}

            {usersPanel ? <UserManagementMiniPanel panel={usersPanel} /> : null}

            {ownerExceptionsPanel ? (
              <PriorityPanel panel={ownerExceptionsPanel} openModuleHref={OPEN_MODULE_HREF.OWNER_EXCEPTIONS} />
            ) : null}
          </>
        )}
      </main>
    </DashboardShell>
  );
}
