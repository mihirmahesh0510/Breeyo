'use client';

import type { OwnerPortalTabId } from '@breeyo/types';
import styles from './PortalTabBar.module.css';

const TABS: Array<{ id: OwnerPortalTabId; label: string }> = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'RECORDS', label: 'Records' },
  { id: 'INVOICES', label: 'Invoices' },
];

export interface PortalTabBarProps {
  activeTab: OwnerPortalTabId;
  onTabChange: (tab: OwnerPortalTabId) => void;
}

/**
 * D-57, D-62: exactly these three top-level tabs. Payments deliberately do
 * NOT get their own tab -- they stay inside the Invoices flow.
 */
export function PortalTabBar({ activeTab, onTabChange }: PortalTabBarProps) {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="Owner portal sections">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={isActive ? `${styles.tab} ${styles.activeTab}` : styles.tab}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
