import type { ReactNode } from 'react';
import styles from './AppTopBar.module.css';

export interface AppTopBarProps {
  clinicName?: string;
  userName: string;
  roleLabel: string;
  /**
   * D-10: module-local search/action slot only. There is no global command
   * bar in Phase 9 -- callers pass their own module-scoped search/filter
   * control here (or nothing, as the dashboard home does), never a
   * clinic-wide search.
   */
  searchSlot?: ReactNode;
}

/**
 * The sticky top bar from 09-UI-SPEC.md's "Dashboard Navigation": clinic
 * switcher, current user, current role badge, and the one module-local
 * search/action slot -- D-09 and D-10 keep this deliberately thin, with no
 * persistent clinic-wide activity feed and no global command bar anywhere
 * in this component.
 */
export function AppTopBar({ clinicName, userName, roleLabel, searchSlot }: AppTopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.clinicSwitcher} data-testid="clinic-switcher">
        {clinicName ?? 'Clinic'}
      </div>
      <div className={styles.searchSlot} data-testid="module-local-search-slot">
        {searchSlot}
      </div>
      <div className={styles.identity}>
        <span className={styles.userName}>{userName}</span>
        <span className={styles.roleBadge}>{roleLabel}</span>
      </div>
    </header>
  );
}
