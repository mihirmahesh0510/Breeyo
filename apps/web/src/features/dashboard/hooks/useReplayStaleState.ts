'use client';

// Plan 10-05 Task 2: browser stale-state review on replay overtakes.
// Phase 9's `StaleStateBanner.tsx` already renders a `'stale' | 'conflict'`
// prompt (D-40) driven by a server-computed `knownVersion` comparison on
// READ. This hook is the missing REALTIME half: when a mobile replay lands
// on a row an already-open browser tab is showing, the scoped
// `replay:applied` / `replay:conflict-opened` events (`replayBroadcast.service.ts`)
// flow through here so the SAME banner can prompt without waiting for the
// next manual refetch.
import { useCallback, useState } from 'react';

export type ReplayStaleStatus = 'fresh' | 'stale' | 'conflict';

export interface UseReplayStaleStateResult {
  status: ReplayStaleStatus;
  /** Feed a `REPLAY_APPLIED` broadcast's `entityIds` here. */
  onReplayApplied: (entityIds: string[]) => void;
  /** Feed a `REPLAY_CONFLICT_OPENED` broadcast's `entityIds` here. */
  onReplayConflictOpened: (entityIds: string[]) => void;
  /** The `StaleStateBanner` "Refresh" action -- acknowledges the current overtake and returns to `fresh`. */
  acknowledge: () => void;
}

/**
 * `watchedEntityIds` is the set of ids the caller currently has rendered
 * (e.g. every queue entry id on the board, or the one invoice id on an
 * open detail view) -- an event naming an entity NOT in this set is
 * irrelevant to what is on screen right now and is ignored, so a browser
 * tab showing clinic-wide unrelated activity does not light up on every
 * unrelated write.
 *
 * D-05/D-40: `conflict` always outranks `stale` and is never silently
 * downgraded by a later `REPLAY_APPLIED` for the same entity -- once a
 * genuine conflict has been opened server-side, only an explicit
 * `acknowledge()` (the caller's own "Refresh"/resolve action) clears it.
 */
export function useReplayStaleState(watchedEntityIds: string[]): UseReplayStaleStateResult {
  const [status, setStatus] = useState<ReplayStaleStatus>('fresh');

  const onReplayApplied = useCallback(
    (entityIds: string[]) => {
      if (!entityIds.some((id) => watchedEntityIds.includes(id))) return;
      setStatus((previous) => (previous === 'conflict' ? previous : 'stale'));
    },
    [watchedEntityIds],
  );

  const onReplayConflictOpened = useCallback(
    (entityIds: string[]) => {
      if (!entityIds.some((id) => watchedEntityIds.includes(id))) return;
      setStatus('conflict');
    },
    [watchedEntityIds],
  );

  const acknowledge = useCallback(() => setStatus('fresh'), []);

  return { status, onReplayApplied, onReplayConflictOpened, acknowledge };
}
