'use client';

// D-07, D-40, D-41, D-43: the browser queue workbench -- queue-first, kept
// deliberately separate from `/schedule`'s week grid (D-07), with inline
// stale/conflict prompts (D-40, D-42) ahead of any toast.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useAuth } from '../../src/lib/AuthProvider';
import { useDashboardCockpit } from '../../src/features/dashboard/hooks/useDashboardCockpit';
import { DashboardShell } from '../../src/components/app-shell/DashboardShell';
import { useQueueBoard } from '../../src/features/queue/hooks/useQueueBoard';
import { useQueueRealtime, type QueueBoardSyncPayload } from '../../src/features/queue/hooks/useQueueRealtime';
import { QueueBoard } from '../../src/features/queue/components/QueueBoard';
import styles from './queue.module.css';

export default function QueuePage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const router = useRouter();
  // D-83: if `queueEnabled` is revoked while this page is open, the very
  // next cockpit fetch this hook makes redirects away from here.
  const cockpit = useDashboardCockpit({ currentModulePanelId: 'QUEUE' });

  const queueBoard = useQueueBoard();
  const [realtimeNotice, setRealtimeNotice] = useState<QueueBoardSyncPayload | null>(null);

  // D-40/D-42: a push that arrives while this tab is open surfaces as an
  // inline stale prompt, never a silent re-render of the board underneath
  // whatever the caller is looking at.
  const handleSync = useCallback((payload: QueueBoardSyncPayload) => {
    setRealtimeNotice(payload);
  }, []);
  useQueueRealtime(handleSync);

  if (!ready) {
    return null;
  }

  const visiblePanelIds = cockpit.data?.panels.map((panel) => panel.panelId) ?? [];

  const handleRefresh = () => {
    setRealtimeNotice(null);
    queueBoard.acknowledgeAndRefetch();
  };

  const handleReviewChanges = () => {
    if (realtimeNotice?.reviewPath) {
      router.push(realtimeNotice.reviewPath);
    }
    setRealtimeNotice(null);
  };

  return (
    <DashboardShell visiblePanelIds={visiblePanelIds} userName={user?.fullName ?? ''} roleLabel="Staff">
      <main className={styles.page}>
        <h1 className={styles.title}>Queue</h1>

        {queueBoard.error ? (
          <p className={styles.errorText}>Could not refresh live clinic data. Retry this panel or reopen the module.</p>
        ) : null}
        {queueBoard.isLoading && !queueBoard.data ? <p>Loading…</p> : null}

        {queueBoard.data ? (
          <QueueBoard
            board={queueBoard.data}
            hasRealtimeStaleNotice={realtimeNotice !== null}
            onRefresh={handleRefresh}
            onReviewChanges={handleReviewChanges}
            onUpdateStatus={queueBoard.updateStatus}
          />
        ) : null}
      </main>
    </DashboardShell>
  );
}
