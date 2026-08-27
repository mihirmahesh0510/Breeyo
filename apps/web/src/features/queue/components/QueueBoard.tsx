'use client';

import { useMemo } from 'react';
import type { QueueBoardResponse, QueueEntry } from '../hooks/useQueueBoard';
import { StaleStateBanner } from '../../dashboard/components/StaleStateBanner';
import { useReplayStaleState } from '../../dashboard/hooks/useReplayStaleState';
import { useQueueReplayRealtime } from '../hooks/useQueueReplayRealtime';
import { useAuth } from '../../../lib/AuthProvider';
import styles from './QueueBoard.module.css';

export interface QueueBoardProps {
  board: QueueBoardResponse;
  /** D-40/D-42: a realtime browser-sync push not yet acknowledged -- independent of `board.staleState`, which only reflects the last fetch. */
  hasRealtimeStaleNotice: boolean;
  onRefresh: () => void;
  onReviewChanges: () => void;
  onUpdateStatus: (entryId: string, status: string) => void;
}

/** The one forward action each status offers on the browser board -- mirrors QUE-04's transition table. */
const NEXT_ACTION: Partial<Record<string, { status: string; label: string }>> = {
  EXPECTED: { status: 'WAITING', label: 'Check In' },
  WAITING: { status: 'IN_CONSULT', label: 'Call In' },
  IN_CONSULT: { status: 'DONE', label: 'Mark Done' },
};

function QueueRow({
  entry,
  onUpdateStatus,
}: {
  entry: QueueEntry;
  onUpdateStatus: (entryId: string, status: string) => void;
}) {
  const nextAction = NEXT_ACTION[entry.status];

  return (
    <li className={entry.isEmergency ? `${styles.row} ${styles.emergencyRow}` : styles.row} data-testid={`queue-row-${entry.id}`}>
      <span className={styles.petName}>{entry.petName ?? 'Unknown pet'}</span>
      <span className={styles.meta}>
        {entry.ownerName ?? 'Unknown owner'}
        {entry.visitReason ? ` — ${entry.visitReason}` : ''}
        {entry.isEmergency ? ' — Emergency' : ''}
        {typeof entry.computedPosition === 'number' ? ` — #${entry.computedPosition}` : ''}
      </span>
      {nextAction ? (
        <button type="button" className={styles.actionButton} onClick={() => onUpdateStatus(entry.id, nextAction.status)}>
          {nextAction.label}
        </button>
      ) : null}
    </li>
  );
}

function QueueSection({
  title,
  entries,
  emptyText,
  onUpdateStatus,
}: {
  title: string;
  entries: QueueEntry[];
  emptyText: string;
  onUpdateStatus: (entryId: string, status: string) => void;
}) {
  return (
    <section aria-label={title} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {entries.length === 0 ? (
        <p className={styles.emptyText}>{emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <QueueRow key={entry.id} entry={entry} onUpdateStatus={onUpdateStatus} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * D-07, D-41: the browser queue stays queue-first -- four sectioned lists
 * (Expected Arrivals, Waiting, In Consult, Done), never a week-calendar
 * grid the way `/schedule` is. Expected Arrivals is its own section rather
 * than merged into Waiting, matching mobile's own board split
 * (`QueueService.getQueueBoard`) exactly.
 *
 * D-40/D-42: two independent stale signals both render the same shared
 * `StaleStateBanner` rather than a toast -- `board.staleState` (the server's
 * own answer, from the last fetch's `knownVersion` comparison) and
 * `hasRealtimeStaleNotice` (a push that arrived after that fetch, before the
 * caller has acted on it). Either one is enough to show the banner; neither
 * silently re-renders the board out from under an in-progress read.
 *
 * Verify-fix 10.3: a THIRD stale signal now feeds the same banner --
 * `useReplayStaleState`, driven by `useQueueReplayRealtime`'s scoped
 * `replay:applied`/`replay:conflict-opened` broadcasts for the entries this
 * board actually has rendered. Unlike the other two signals (always
 * `"stale"`), a genuine `replay:conflict-opened` (D-05 to D-10's
 * review-before-overwrite, e.g. a D-34 duplicate-check-in merge) renders the
 * real `"conflict"` copy instead of the previously-hardcoded `"stale"`
 * string.
 */
export function QueueBoard({ board, hasRealtimeStaleNotice, onRefresh, onReviewChanges, onUpdateStatus }: QueueBoardProps) {
  const { accessToken, activeClinicId } = useAuth();

  const watchedEntryIds = useMemo(
    () => [...board.expectedArrivals, ...board.waiting, ...board.inConsult, ...board.done].map((entry) => entry.id),
    [board],
  );
  const replayStale = useReplayStaleState(watchedEntryIds);
  useQueueReplayRealtime(accessToken, activeClinicId, replayStale.onReplayApplied, replayStale.onReplayConflictOpened);

  const showStaleBanner = board.staleState === 'stale' || hasRealtimeStaleNotice || replayStale.status !== 'fresh';
  const bannerStatus: 'stale' | 'conflict' = replayStale.status === 'conflict' ? 'conflict' : 'stale';

  const handleRefresh = () => {
    replayStale.acknowledge();
    onRefresh();
  };

  return (
    <div>
      {showStaleBanner ? (
        <StaleStateBanner status={bannerStatus} onRefresh={handleRefresh} onReviewChanges={onReviewChanges} />
      ) : null}

      <QueueSection
        title="Expected Arrivals"
        entries={board.expectedArrivals}
        emptyText="No scheduled arrivals right now."
        onUpdateStatus={onUpdateStatus}
      />
      <QueueSection title="Waiting" entries={board.waiting} emptyText="No one is waiting." onUpdateStatus={onUpdateStatus} />
      <QueueSection title="In Consult" entries={board.inConsult} emptyText="No patient is in consult." onUpdateStatus={onUpdateStatus} />
      <QueueSection title="Done Today" entries={board.done} emptyText="No one has been seen yet today." onUpdateStatus={onUpdateStatus} />
    </div>
  );
}
