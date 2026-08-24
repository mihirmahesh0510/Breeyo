'use client';

import type { AnalyticsPayload } from '../hooks/useInventoryWorkbench';
import styles from './InventoryAnalyticsPanel.module.css';

export interface InventoryAnalyticsPanelProps {
  payload: AnalyticsPayload;
  onExport: (format: 'csv' | 'pdf') => void;
}

/**
 * D-29, D-36: operational summaries (stock turnover, expiry risk, low
 * stock) plus CSV/PDF export -- action-ready cards, not a separate
 * chart-first analytics dashboard.
 */
export function InventoryAnalyticsPanel({ payload, onExport }: InventoryAnalyticsPanelProps) {
  return (
    <section aria-label="Analytics" className={styles.panel}>
      <div className={styles.actions}>
        {payload.exportActions.map((action) => (
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

      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <h3 className={styles.metricTitle}>Stock Turnover (30 days)</h3>
          {payload.stockTurnover.length === 0 ? (
            <p className={styles.emptyText}>No dispensing activity in the last 30 days.</p>
          ) : (
            <ul className={styles.metricList}>
              {payload.stockTurnover.map((row) => (
                <li key={row.itemId}>
                  {row.itemName}: {row.dispensedLast30Days} dispensed
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.metricCard}>
          <h3 className={styles.metricTitle}>Expiry Risk</h3>
          {payload.expiryRisk.length === 0 ? (
            <p className={styles.emptyText}>No batches are expiring soon.</p>
          ) : (
            <ul className={styles.metricList}>
              {payload.expiryRisk.map((row) => (
                <li key={row.batchId}>
                  {row.itemName} ({row.lotNumber ?? 'no lot'}): expires {new Date(row.expiryDate).toLocaleDateString()}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.metricCard}>
          <h3 className={styles.metricTitle}>Low Stock</h3>
          {payload.lowStock.length === 0 ? (
            <p className={styles.emptyText}>Every item is above its par level.</p>
          ) : (
            <ul className={styles.metricList}>
              {payload.lowStock.map((row) => (
                <li key={row.id}>
                  {row.name}: {row.currentStock} / {row.parLevel}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
