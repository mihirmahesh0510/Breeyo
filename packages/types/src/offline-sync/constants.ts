/**
 * Locked replay priority ladder (D-12 to D-14). Queue work always replays
 * first; there is no severity-based exception (D-37) -- a safety-critical
 * clinical conflict still waits its own CLINICAL_MEDIUM turn instead of
 * preempting queue replay during reconnect.
 */
export enum ReplayPriority {
  QUEUE_HIGH = 'QUEUE_HIGH',
  CLINICAL_MEDIUM = 'CLINICAL_MEDIUM',
  INVENTORY_MEDIUM = 'INVENTORY_MEDIUM',
  ANCILLARY_LOW = 'ANCILLARY_LOW',
}

/** Index position doubles as replay order for the sync coordinator. */
export const REPLAY_PRIORITIES = [
  ReplayPriority.QUEUE_HIGH,
  ReplayPriority.CLINICAL_MEDIUM,
  ReplayPriority.INVENTORY_MEDIUM,
  ReplayPriority.ANCILLARY_LOW,
] as const;

/**
 * Sync visibility states surfaced to staff (D-18 to D-21): a calm PENDING
 * badge rather than repeated banners, an in-progress REPLAYING state,
 * actionable CONFLICT/FAILED states that escalate into the failure center,
 * and a subtle CAUGHT_UP recovery cue rather than loud celebration.
 */
export enum SyncVisibilityState {
  PENDING = 'PENDING',
  REPLAYING = 'REPLAYING',
  CONFLICT = 'CONFLICT',
  FAILED = 'FAILED',
  CAUGHT_UP = 'CAUGHT_UP',
}

export const SYNC_VISIBILITY_STATES = [
  SyncVisibilityState.PENDING,
  SyncVisibilityState.REPLAYING,
  SyncVisibilityState.CONFLICT,
  SyncVisibilityState.FAILED,
  SyncVisibilityState.CAUGHT_UP,
] as const;

/**
 * Conflict severity (D-06, D-10, D-24): clinical/safety-relevant conflicts
 * get the strongest review posture; queue/inventory conflicts use a lighter
 * operational review flow.
 */
export enum ConflictSeverity {
  OPERATIONAL = 'OPERATIONAL',
  SAFETY_CRITICAL = 'SAFETY_CRITICAL',
}

export const CONFLICT_SEVERITIES = [ConflictSeverity.OPERATIONAL, ConflictSeverity.SAFETY_CRITICAL] as const;

/**
 * Lifecycle of a conflict or failure task from first detection through
 * resolution. GUIDED_RETRY and ESCALATED are the two D-22/D-23 checkpoints:
 * the originating user's guided retry, then handoff to the next owner
 * (the assigned clinician for SAFETY_CRITICAL items per D-24, or any other
 * on-duty clinician if that owner is unreachable per D-36).
 */
export enum ResolutionState {
  OPEN = 'OPEN',
  GUIDED_RETRY = 'GUIDED_RETRY',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

export const RESOLUTION_STATES = [
  ResolutionState.OPEN,
  ResolutionState.GUIDED_RETRY,
  ResolutionState.ESCALATED,
  ResolutionState.RESOLVED,
] as const;

export interface GuidedRetryPolicy {
  maxGuidedRetries: number;
  escalationAfterGuidedRetry: boolean;
}

/**
 * D-22/D-23: the originating user gets exactly one guided retry before the
 * item escalates automatically -- not zero (silent failure) and not
 * unbounded (staff stuck retrying forever with no handoff).
 */
export const DEFAULT_GUIDED_RETRY_POLICY: GuidedRetryPolicy = {
  maxGuidedRetries: 1,
  escalationAfterGuidedRetry: true,
};
