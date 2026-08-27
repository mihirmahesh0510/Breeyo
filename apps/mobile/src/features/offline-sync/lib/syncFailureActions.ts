/**
 * RN-free decision layer behind `SyncFailureCenterScreen.tsx`'s Retry/
 * Escalate actions (verify-fix 10.6, D-22, D-23/D-24/D-36). Kept out of the
 * `.tsx`/hook for the same reason `clinical-conflict-resolution.ts` and
 * `sync-status.ts` in this same feature exist: `apps/mobile` runs vitest in
 * a plain `node` environment with no Metro/Babel transform, so the actual
 * "which HTTP request does this action make" decision lives here as plain
 * functions over plain objects, fully unit-testable, while
 * `hooks/useSyncFailureActions.ts` stays a thin `apiClient` wrapper around
 * these builders.
 */
import type { FailureCenterItem } from './sync-status';
import { isClinicalConflictItem } from './sync-status';

export interface SyncFailureActionRequest {
  path: string;
  method: 'POST';
  body: Record<string, unknown>;
}

/**
 * D-22: the current owner's own guided retry. Applies uniformly to BOTH
 * `FAILURE_TASK` and `CONFLICT` kind items -- `RetryEscalationService`
 * (API) shares the same OPEN -> GUIDED_RETRY step for both, so there is no
 * clinical-vs-operational branch here the way there is for escalate.
 */
export function buildRetryRequest(item: FailureCenterItem): SyncFailureActionRequest {
  return {
    path: `/api/v1/sync/failures/${item.id}/retry`,
    method: 'POST',
    body: { kind: item.kind },
  };
}

/**
 * D-23/D-24/D-36: hand off to the next owner.
 *
 * A clinical (EMR, SAFETY_CRITICAL) conflict -- the one case
 * `ClinicalConflictResolutionSheet.tsx`'s own Escalate button reaches
 * (`isClinicalConflictItem`) -- routes through the EMR-specific `POST
 * /consultations/:consultationId/conflicts/:conflictId/resolve` endpoint
 * with `action: 'ESCALATE'` (verify-fix 10.5/10.6:
 * `ConsultationConflictResolutionService` now resolves real ownership via
 * the same on-duty roster provider). `item.entityId` is the consultation id
 * for a `CONFLICT`-kind item (`toFailureCenterItemFromConflict`).
 *
 * Every other item (a plain `FAILURE_TASK`, or an OPERATIONAL conflict --
 * D-10's lighter review) routes through the generic `POST
 * /sync/failures/:failureTaskId/escalate` route instead.
 */
export function buildEscalateRequest(item: FailureCenterItem): SyncFailureActionRequest {
  if (isClinicalConflictItem(item) && item.entityId) {
    return {
      path: `/api/v1/consultations/${item.entityId}/conflicts/${item.id}/resolve`,
      method: 'POST',
      body: { action: 'ESCALATE' },
    };
  }

  return {
    path: `/api/v1/sync/failures/${item.id}/escalate`,
    method: 'POST',
    body: { kind: item.kind },
  };
}
