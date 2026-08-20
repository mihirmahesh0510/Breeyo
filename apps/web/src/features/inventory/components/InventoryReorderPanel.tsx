'use client';

import type { ReorderingPayload } from '../hooks/useInventoryWorkbench';
import styles from './InventoryReorderPanel.module.css';

export interface InventoryReorderPanelProps {
  payload: ReorderingPayload;
  onExport: (format: 'csv' | 'pdf') => void;
  onOpenItem: (itemId: string) => void;
}

const URGENCY_TITLE: Record<'critical' | 'warning', string> = {
  critical: 'Critical',
  warning: 'Low Stock',
};

/**
 * D-35, D-36: want-list grouped by urgency, connected to the same stock data
 * as the Stock & Batches tab rather than reading as an isolated report.
 * Renders the server's exact action copy ("Open item", "Export CSV",
 * "Export PDF") instead of hardcoding new labels.
 */
export function InventoryReorderPanel({ payload, onExport, onOpenItem }: InventoryReorderPanelProps) {
  const openItemAction = payload.actions.find((action) => action.actionId === 'open-item');
  const exportActions = payload.actions.filter((action) => action.actionId !== 'open-item');

  return (
    <section aria-label="Reordering" className={styles.panel}>
      <div className={styles.actions}>
        {exportActions.map((action) => (
          <button
            key={action.actionId}
            type="button"
            className={styles.actionButton}
            onClick={() => onExport(action.actionId === 'export-csv' ? 'csv' : 'pdf')}
          >
            {action.label}
          </button>
        ))}
      </div>

      {payload.groups.length === 0 ? (
        <p className={styles.emptyText}>No items are below par level right now.</p>
      ) : (
        payload.groups.map((group) => (
          <div key={group.urgency} className={styles.group}>
            <h3 className={styles.groupTitle}>{URGENCY_TITLE[group.urgency]}</h3>
            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.id} className={styles.item}>
                  <span className={styles.itemName}>{item.name}</span>
                  <span className={styles.itemMeta}>
                    Current: {item.currentStock} / Par: {item.parLevel}
                  </span>
                  <button type="button" className={styles.actionButton} onClick={() => onOpenItem(item.id)}>
                    {openItemAction?.label ?? 'Open item'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
