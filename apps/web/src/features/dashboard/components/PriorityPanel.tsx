import type { DashboardPanelSummary } from '@breeyo/types';
import styles from './PriorityPanel.module.css';

export interface PriorityPanelProps {
  panel: DashboardPanelSummary;
  /** Where the panel's "Open <title>" link goes. */
  openModuleHref: string;
}

/**
 * Shared home-panel wrapper (D-05, D-08): title, an action-ready count, a
 * quick action per D-03, and an "open module" link into the full-depth
 * page. Used for Queue, Scheduling, Billing, Inventory, and the
 * Owner/WhatsApp Exceptions section -- User Management gets its own
 * `UserManagementMiniPanel` instead (D-11's staff/access follow-through
 * needs a different action shape).
 */
export function PriorityPanel({ panel, openModuleHref }: PriorityPanelProps) {
  return (
    <section className={styles.panel} data-testid={`panel-${panel.panelId}`} aria-label={panel.title}>
      <div className={styles.header}>
        <h2 className={styles.title}>{panel.title}</h2>
        <span className={styles.count}>{panel.itemCount}</span>
      </div>

      {panel.itemCount === 0 ? (
        <p className={styles.emptyText}>
          Today&apos;s queue, schedule, billing, and stock are up to date. Open a panel below to review details.
        </p>
      ) : null}

      <div className={styles.actions}>
        {panel.quickActions.map((action) => (
          <a key={action.actionId} href={action.href} className={styles.actionButton}>
            {action.label}
          </a>
        ))}
        <a href={openModuleHref} className={styles.openModuleLink}>
          Open {panel.title}
        </a>
      </div>
    </section>
  );
}
