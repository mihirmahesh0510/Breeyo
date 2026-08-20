'use client';

import type { InventoryWebTab } from '../hooks/useInventoryWorkbench';
import styles from './InventoryTabBar.module.css';

const TABS: Array<{ id: InventoryWebTab; label: string }> = [
  { id: 'stock', label: 'Stock & Batches' },
  { id: 'reordering', label: 'Reordering' },
  { id: 'analytics', label: 'Analytics' },
];

export interface InventoryTabBarProps {
  activeTab: InventoryWebTab;
  onTabChange: (tab: InventoryWebTab) => void;
}

/**
 * D-31, D-32: inventory stays one module with exactly these three sub-tabs,
 * defaulting to Stock & Batches -- the caller (`app/inventory/page.tsx`)
 * owns the default `activeTab` state; this component only renders it.
 */
export function InventoryTabBar({ activeTab, onTabChange }: InventoryTabBarProps) {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="Inventory sections">
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
