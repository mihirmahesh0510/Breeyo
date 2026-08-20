import type { DashboardPanelSummary } from '@breeyo/types';
import styles from './UserManagementMiniPanel.module.css';

export interface UserManagementMiniPanelProps {
  /** The cockpit's `USERS` panel. Only ever passed when the caller's role has `usersEnabled` (D-21). */
  panel: DashboardPanelSummary;
}

/**
 * D-11: an inline home-surface awareness panel for staff/access
 * follow-through -- not the full admin module (that is `/users`, D-21,
 * D-28). Only ever rendered when the cockpit response includes a `USERS`
 * panel at all, so this component itself never has to re-check
 * authorization -- its mere presence in the tree already means the caller
 * is authorized (D-20's "hidden, not locked" contract is enforced one level
 * up, by the page deciding whether to render it).
 */
export function UserManagementMiniPanel({ panel }: UserManagementMiniPanelProps) {
  return (
    <section className={styles.panel} data-testid="panel-USERS-mini" aria-label={panel.title}>
      <div className={styles.header}>
        <h2 className={styles.title}>{panel.title}</h2>
        <span className={styles.count}>{panel.itemCount} active</span>
      </div>
      <div className={styles.actions}>
        {panel.quickActions.map((action) => (
          <a key={action.actionId} href={action.href} className={styles.actionButton}>
            {action.label}
          </a>
        ))}
      </div>
    </section>
  );
}
