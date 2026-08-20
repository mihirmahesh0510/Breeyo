'use client';

import styles from './StaleStateBanner.module.css';

export interface StaleStateBannerProps {
  /** `StaleStateStatus` minus `'fresh'` (`@breeyo/types`) -- this banner has nothing to say once data is fresh. */
  status: 'stale' | 'conflict';
  onRefresh: () => void;
  onReviewChanges: () => void;
}

/**
 * D-40: when a browser and a mobile session collide on the same row, this
 * surfaces the conflict/stale state instead of letting a write silently
 * overwrite data that changed elsewhere. `Refresh` re-pulls the current
 * server state; `Review changes` is for a caller that wants to show a diff
 * or the other session's edit before deciding.
 */
export function StaleStateBanner({ status, onRefresh, onReviewChanges }: StaleStateBannerProps) {
  return (
    <div className={styles.banner} role="status" data-testid="stale-state-banner">
      <p className={styles.message}>
        {status === 'conflict'
          ? 'This record changed elsewhere while you were viewing it.'
          : 'This data may be out of date.'}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.refreshButton} onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" className={styles.reviewButton} onClick={onReviewChanges}>
          Review changes
        </button>
      </div>
    </div>
  );
}
