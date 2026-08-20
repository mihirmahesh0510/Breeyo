'use client';

import { useState, type ReactNode } from 'react';
import type { DashboardPanelId } from '@breeyo/types';
import { AppSidebar } from './AppSidebar';
import { AppTopBar } from './AppTopBar';
import styles from './DashboardShell.module.css';

export interface DashboardShellProps {
  visiblePanelIds: DashboardPanelId[];
  clinicName?: string;
  userName: string;
  roleLabel: string;
  searchSlot?: ReactNode;
  children: ReactNode;
}

/**
 * The Phase 9 web shell (09-UI-SPEC.md "Dashboard Navigation"): a left
 * sidebar on large screens, a collapsible drawer from 768px to 1023px (the
 * toggle button + `.sidebarSlotOpen` class, driven by the media query in
 * `DashboardShell.module.css` rather than a JS media-query hook, so there is
 * no layout flash before hydration), the sticky top bar, and a module slot.
 *
 * D-01, D-04: this only ever wraps content -- it does not itself decide
 * what "today-first" or "action-first" means, so it stays reusable for every
 * future module page, not only the home cockpit.
 */
export function DashboardShell({
  visiblePanelIds,
  clinicName,
  userName,
  roleLabel,
  searchSlot,
  children,
}: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.drawerToggle}
        aria-label="Toggle navigation"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((open) => !open)}
      >
        <span aria-hidden="true">☰</span>
      </button>

      <div className={drawerOpen ? `${styles.sidebarSlot} ${styles.sidebarSlotOpen}` : styles.sidebarSlot}>
        <AppSidebar visiblePanelIds={visiblePanelIds} />
      </div>

      <div className={styles.main}>
        <AppTopBar clinicName={clinicName} userName={userName} roleLabel={roleLabel} searchSlot={searchSlot} />
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
