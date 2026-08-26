import { ConflictSeverity, ResolutionState, SyncVisibilityState } from '@breeyo/types';
import type { SyncConflictEnvelope, SyncFailureTaskRecord } from '@breeyo/types';

/**
 * RN-free sync-visibility logic (Plan 10-05 Task 1, D-18 to D-24, D-11).
 * `apps/mobile` runs vitest in a plain `node` environment with no
 * Metro/Babel transform (see `queue-offline-utils.ts` / `clinical-conflict-resolution.ts`
 * for the established precedent), so every decision the badge and failure
 * center make lives here, fully unit-testable, while the `.tsx` files stay
 * thin renderers.
 */

export interface SyncStatusCounts {
  pendingCount: number;
  replayingCount: number;
  conflictCount: number;
  failedCount: number;
}

export function emptySyncStatusCounts(): SyncStatusCounts {
  return { pendingCount: 0, replayingCount: 0, conflictCount: 0, failedCount: 0 };
}

/**
 * D-18 to D-21: the same precedence `ReplayIngestService.deriveVisibilityState`
 * uses server-side, mirrored here for the on-device aggregate: an actionable
 * FAILED/CONFLICT state always outranks the calm PENDING/REPLAYING states,
 * and CAUGHT_UP is the only state with nothing outstanding at all.
 */
export function deriveVisibilityState(counts: SyncStatusCounts): SyncVisibilityState {
  if (counts.failedCount > 0) return SyncVisibilityState.FAILED;
  if (counts.conflictCount > 0) return SyncVisibilityState.CONFLICT;
  if (counts.replayingCount > 0) return SyncVisibilityState.REPLAYING;
  if (counts.pendingCount > 0) return SyncVisibilityState.PENDING;
  return SyncVisibilityState.CAUGHT_UP;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * D-19: calm, persistent badge copy -- never an exclamation mark, never the
 * word "error", and never phrased as a blocking failure even for FAILED
 * (that state escalates into the actionable failure center, this badge just
 * names what is going on).
 */
export function badgeCopy(state: SyncVisibilityState, counts: SyncStatusCounts): string {
  switch (state) {
    case SyncVisibilityState.FAILED:
      return `${pluralize(counts.failedCount, 'item')} need your attention`;
    case SyncVisibilityState.CONFLICT:
      return `${pluralize(counts.conflictCount, 'item')} need review`;
    case SyncVisibilityState.REPLAYING:
      return 'Syncing…';
    case SyncVisibilityState.PENDING:
      return `${pluralize(counts.pendingCount, 'update')} waiting to sync`;
    case SyncVisibilityState.CAUGHT_UP:
    default:
      return 'All synced up';
  }
}

/** D-21: short enough to render as a subtle inline cue, not a banner. */
export const RECOVERY_CUE_COPY = 'Back in sync';

/**
 * D-21: fires only on a genuine transition INTO CAUGHT_UP from some other
 * state -- never on first mount with nothing pending (there is nothing to
 * "recover" from) and never repeatedly while already caught up.
 */
export function shouldShowRecoveryCue(
  previous: SyncVisibilityState | null,
  current: SyncVisibilityState,
): boolean {
  if (current !== SyncVisibilityState.CAUGHT_UP) return false;
  if (previous === null) return false;
  return previous !== SyncVisibilityState.CAUGHT_UP;
}

/** D-11: everything except RESOLVED stays visible in the failure center. */
export function isUnresolved(state: ResolutionState): boolean {
  return state !== ResolutionState.RESOLVED;
}

export type FailureCenterItemKind = 'FAILURE_TASK' | 'CONFLICT';

/**
 * One unified row the failure center groups and renders -- a `SyncFailureTaskRecord`
 * (a raw replay envelope that never even parsed, D-01 to D-04) and a
 * `SyncConflictEnvelope` (a domain-detected mismatch, D-05 to D-10) are
 * different tables server-side, but staff see the same three grouped
 * sections regardless of which produced the item.
 */
export interface FailureCenterItem {
  kind: FailureCenterItemKind;
  id: string;
  domain: string;
  entityId: string | null;
  originatingUserId: string;
  currentOwnerUserId: string;
  resolutionState: ResolutionState;
  /** `null` for a `SyncFailureTaskRecord` -- envelope-validation failures have no clinical/operational severity. */
  severity: ConflictSeverity | null;
  guidedRetryCount: number;
  nextSuggestedAction: string | null;
  lastAttemptedAt: string;
  /** verify-fix 10.4: only populated for `kind: 'CONFLICT'` items -- the
   *  raw local/server payloads a `SyncConflictEnvelope` carries, needed to
   *  build the structured `ClinicalConflictResolutionSheet` comparison
   *  (D-08). `undefined` for a `FAILURE_TASK` (an envelope-validation
   *  failure has no domain payload to compare). */
  localPayload?: unknown;
  serverPayload?: unknown;
}

export function toFailureCenterItemFromTask(task: SyncFailureTaskRecord): FailureCenterItem {
  return {
    kind: 'FAILURE_TASK',
    id: task.taskId,
    domain: task.domain,
    entityId: null,
    originatingUserId: task.originatingUserId,
    currentOwnerUserId: task.currentOwnerUserId,
    resolutionState: task.resolutionState,
    severity: null,
    guidedRetryCount: task.guidedRetryCount,
    nextSuggestedAction: task.nextSuggestedAction,
    lastAttemptedAt: task.lastAttemptedAt,
  };
}

export function toFailureCenterItemFromConflict(conflict: SyncConflictEnvelope): FailureCenterItem {
  // `SyncConflictEnvelope` (the shared wire/local-cache shape) has no
  // separate `originatingUserId` field the way `SyncFailureTaskRecord`
  // does -- D-08/D-09 resolve a conflict straight to its accountable owner
  // at creation time (the assigned clinician for SAFETY_CRITICAL, D-09)
  // rather than routing through an "originating user retries first" step,
  // so there is no distinct originator to surface here; both fields report
  // the same resolved owner.
  const ownerUserId = conflict.resolutionOwnerUserId ?? conflict.recommendedOwnerUserId ?? 'unknown';
  return {
    kind: 'CONFLICT',
    id: conflict.conflictId,
    domain: conflict.domain,
    entityId: conflict.entityId,
    originatingUserId: ownerUserId,
    currentOwnerUserId: ownerUserId,
    resolutionState: conflict.resolutionState,
    severity: conflict.severity,
    guidedRetryCount: 0,
    nextSuggestedAction: null,
    lastAttemptedAt: conflict.createdAt,
    localPayload: conflict.localPayload,
    serverPayload: conflict.serverPayload,
  };
}

/**
 * verify-fix 10.4 (D-08/D-09): true exactly when a failure-center item is
 * an EMR clinical conflict serious enough (SAFETY_CRITICAL) that tapping it
 * in the failure center must open the structured
 * `ClinicalConflictResolutionSheet` instead of the generic retry/escalate
 * row -- D-08 requires the explicit local-vs-server comparison sheet for
 * exactly this case, never a silent auto-resolve or a bare retry toast.
 * Every other domain (queue/inventory operational review, D-10) keeps its
 * existing lighter-weight row untouched. The `localPayload`/`serverPayload`
 * check is what naturally excludes `FAILURE_TASK`-kind items (they never
 * carry a domain payload to compare) without needing a separate `kind`
 * check.
 */
export function isClinicalConflictItem(item: FailureCenterItem): boolean {
  return (
    item.domain === 'emr' &&
    item.severity === ConflictSeverity.SAFETY_CRITICAL &&
    item.localPayload !== undefined &&
    item.serverPayload !== undefined
  );
}

export type FailureCenterItemPressAction =
  | { kind: 'OPEN_CLINICAL_CONFLICT_SHEET'; item: FailureCenterItem }
  | { kind: 'NONE' };

/**
 * verify-fix 10.4: the routing decision `SyncFailureCenterScreen.tsx`
 * renders off of when a row is tapped -- kept here, RN-free, so the actual
 * decision is a real, directly-testable function rather than something only
 * provable by reading JSX off disk (matches this file's existing pattern of
 * keeping every visibility/grouping decision out of the `.tsx` layer).
 */
export function resolveItemPressAction(item: FailureCenterItem): FailureCenterItemPressAction {
  if (isClinicalConflictItem(item)) {
    return { kind: 'OPEN_CLINICAL_CONFLICT_SHEET', item };
  }
  return { kind: 'NONE' };
}

export interface FailureCenterGroups {
  needsYourRetry: FailureCenterItem[];
  escalatedToClinician: FailureCenterItem[];
  operationalReview: FailureCenterItem[];
}

/**
 * D-20, D-22 to D-24, D-10: three mutually-exclusive, unresolved-only
 * buckets.
 *
 * - "Needs your retry": the viewer is the current owner and the item has
 *   not (yet) been escalated (D-22 -- the originating/current user's first
 *   guided retry).
 * - "Escalated to clinician": ESCALATED *and* SAFETY_CRITICAL (D-24) -- the
 *   one case that hands off to a named clinician (or, per D-36, another
 *   on-duty clinician if the first is unreachable).
 * - "Operational review": everything else still unresolved -- OPERATIONAL
 *   items nobody-in-particular needs to chase (D-10's lighter review), any
 *   ESCALATED item that is NOT safety-critical, and any item owned by
 *   someone other than the viewer that has not escalated.
 */
export function groupFailureCenterItems(items: FailureCenterItem[], viewerUserId: string): FailureCenterGroups {
  const unresolved = items.filter((item) => isUnresolved(item.resolutionState));

  const needsYourRetry = unresolved.filter(
    (item) => item.currentOwnerUserId === viewerUserId && item.resolutionState !== ResolutionState.ESCALATED,
  );

  const escalatedToClinician = unresolved.filter(
    (item) => item.resolutionState === ResolutionState.ESCALATED && item.severity === ConflictSeverity.SAFETY_CRITICAL,
  );

  const bucketed = new Set([...needsYourRetry, ...escalatedToClinician]);
  const operationalReview = unresolved.filter((item) => !bucketed.has(item));

  return { needsYourRetry, escalatedToClinician, operationalReview };
}
