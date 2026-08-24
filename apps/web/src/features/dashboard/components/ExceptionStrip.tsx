import type { DashboardPanelSummary } from '@breeyo/types';
import styles from './ExceptionStrip.module.css';

export interface ExceptionStripProps {
  /** The cockpit's `ALERTS` panel. Absent while the cockpit is still loading. */
  panel?: DashboardPanelSummary;
}

/**
 * Top-of-home exception list (D-06: renders first in the scroll order,
 * ahead of every module panel). Deliberately has no section heading of its
 * own -- it is a strip, not another `PriorityPanel` -- so it reads as more
 * urgent than the panels below it rather than as one more section among
 * equals.
 *
 * D-44: this shows the current count on every render; fading a specific
 * alert after it has been acknowledged is a `PriorityPanel`/module-local
 * concern once an item has an explicit "seen" action, not something this
 * shared strip tracks itself.
 */
export function ExceptionStrip({ panel }: ExceptionStripProps) {
  const itemCount = panel?.itemCount ?? 0;

  if (itemCount === 0) {
    return (
      <section className={styles.strip} data-testid="exception-strip" aria-label="Alerts and exceptions">
        <p className={styles.emptyText}>Nothing needs attention right now</p>
      </section>
    );
  }

  return (
    <section className={styles.strip} data-testid="exception-strip" aria-label="Alerts and exceptions">
      <div className={styles.summary}>
        <span className={styles.count}>{itemCount}</span>
        <span className={styles.label}>item(s) need attention</span>
      </div>
      <div className={styles.actions}>
        {panel?.quickActions.map((action) => (
          <a key={action.actionId} href={action.href} className={styles.actionButton}>
            {action.label}
          </a>
        ))}
      </div>
    </section>
  );
}
