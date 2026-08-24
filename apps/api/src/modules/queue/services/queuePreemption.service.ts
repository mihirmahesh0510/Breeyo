import { ReplayPriority } from '@breeyo/types';

export interface PauseLowerTierReplayInput {
  /** The priority tier a caller is about to process (or continue draining). */
  currentTierPriority: ReplayPriority;
  /** Count of not-yet-acknowledged QUEUE_HIGH operations for this clinic/device. */
  queueHighPendingCount: number;
}

export interface PauseLowerTierReplayResult {
  shouldPause: boolean;
  reason?: string;
}

/**
 * Centralizes D-12 to D-14 (queue-first reconnect priority) on the server
 * side so any replay path -- the queue-specific endpoint in
 * `queueSync.controller.ts` today, and any future EMR/inventory/ancillary
 * replay endpoint -- enforces "queue always replays first, and can
 * preempt/interrupt unsent lower-tier work" the same way, instead of each
 * domain inventing its own ad hoc ordering or timer.
 *
 * This mirrors `preemptLowerPriorityReplay` in the mobile
 * `syncCoordinator.ts` (which drains the on-device backlog in tier order),
 * but answers the server-side question: "given what is still pending for
 * this device/clinic, may a lower tier proceed right now, or must it yield
 * back to queue replay first?"
 *
 * D-37 is enforced structurally, not by convention: `PauseLowerTierReplayInput`
 * has no severity field at all, so there is no parameter a caller could set
 * to let a SAFETY_CRITICAL clinical conflict skip the pause. A clinical
 * conflict of any severity sitting in CLINICAL_MEDIUM waits its own
 * CLINICAL_MEDIUM turn behind QUEUE_HIGH exactly like any other
 * CLINICAL_MEDIUM item -- it never reaches this class with a "let me
 * through anyway" flag to check.
 */
export class QueuePreemptionService {
  /**
   * Queue replay (D-12) is never blocked by any other tier's state -- it is
   * always tier 0. Kept as an explicit method (rather than a bare `true`
   * inlined at call sites) so `queueSync.controller.ts` documents the
   * "queue replay is never downgraded into a generic background tier"
   * guarantee at the call site instead of asserting it silently.
   */
  canRunQueueReplayNow(): boolean {
    return true;
  }

  /**
   * D-14: a lower tier (anything after QUEUE_HIGH in `REPLAY_PRIORITIES`)
   * must pause -- leaving its own remaining work in place, not dropping it
   * -- for as long as QUEUE_HIGH operations are still pending for this
   * device/clinic. QUEUE_HIGH itself is never paused, regardless of what a
   * caller passes for `queueHighPendingCount`.
   */
  pauseLowerTierReplayForQueue(input: PauseLowerTierReplayInput): PauseLowerTierReplayResult {
    if (input.currentTierPriority === ReplayPriority.QUEUE_HIGH) {
      return { shouldPause: false };
    }

    if (input.queueHighPendingCount > 0) {
      return {
        shouldPause: true,
        reason: 'QUEUE_HIGH operations are pending replay and must be applied first (D-12 to D-14).',
      };
    }

    return { shouldPause: false };
  }
}
