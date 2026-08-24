/**
 * RN-free decision layer behind `ClinicalConflictResolutionSheet.tsx`
 * (Plan 10-03 Task 2, D-05, D-08, D-09, D-11, D-24). Kept out of the `.tsx`
 * for the same reason `apps/mobile/src/features/billing/lib/payment-collection.ts`
 * and `apps/mobile/src/features/queue/lib/queue-board-utils.ts` exist:
 * `apps/mobile` runs vitest in a plain `node` environment with no
 * Metro/Babel transform, so anything importing `react-native` cannot be
 * exercised directly in a test -- the actual comparison/visibility/action
 * decisions live here as plain functions over plain objects instead.
 */
import { ConflictSeverity, ResolutionState } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';

/**
 * The five explicit resolution actions D-08/D-11 call for -- deliberately
 * NOT a single generic "retry" action. `KEEP_LOCAL`/`KEEP_SERVER` are
 * whole-record choices; `MERGE_SAFE_FIELDS` applies only the fields that
 * were never actually in dispute; `RETRY` re-attempts the guided retry the
 * originating user owns first (D-22); `ESCALATE` hands the conflict to the
 * next owner (D-23, D-24, D-36).
 */
export const CLINICAL_CONFLICT_RESOLUTION_ACTIONS = [
  'KEEP_LOCAL',
  'KEEP_SERVER',
  'MERGE_SAFE_FIELDS',
  'RETRY',
  'ESCALATE',
] as const;

export type ClinicalConflictResolutionActionType = (typeof CLINICAL_CONFLICT_RESOLUTION_ACTIONS)[number];

/** Human-readable labels for the `SaveDraftInput` fields a conflict can name
 *  -- kept in sync with `CLINICAL_DRAFT_FIELDS` in the API's
 *  `clinicalConflict.service.ts` and `DRAFT_FIELDS` in
 *  `offlineConsultationDraftStore.ts`. */
export const CLINICAL_FIELD_LABELS: Record<string, string> = {
  vitals: 'Vitals',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  careInstructions: 'Care Instructions',
  referral: 'Referral',
  rxNotes: 'Prescription Notes',
  prescriptions: 'Prescriptions',
};

export interface ClinicalConflictSummary {
  conflictId: string;
  entityId: string;
  severity: ConflictSeverity;
  /** Fields both devices changed to different values -- the explicit
   *  compare target (D-08). Never auto-resolved (D-05, D-06, D-07). */
  conflictingFields: string[];
  /** Fields only the offline device changed -- eligible for the sheet's
   *  MERGE_SAFE_FIELDS action, never applied without the clinician's
   *  explicit tap. */
  safeMergeFields: string[];
  localPayload: SaveDraftInput;
  serverPayload: SaveDraftInput;
  recommendedOwnerUserId?: string;
  resolutionState: ResolutionState;
}

export interface ClinicalConflictFieldComparisonRow {
  field: string;
  label: string;
  localValue: unknown;
  serverValue: unknown;
}

/**
 * D-08: builds the explicit local-vs-server comparison rows for every
 * disputed field -- the structured resolution sheet's core content, never a
 * generic "something changed, retry?" message.
 */
export function buildFieldComparisonRows(
  conflict: Pick<ClinicalConflictSummary, 'conflictingFields' | 'localPayload' | 'serverPayload'>,
): ClinicalConflictFieldComparisonRow[] {
  return conflict.conflictingFields.map((field) => ({
    field,
    label: CLINICAL_FIELD_LABELS[field] ?? field,
    localValue: (conflict.localPayload as Record<string, unknown>)[field],
    serverValue: (conflict.serverPayload as Record<string, unknown>)[field],
  }));
}

/** D-07: the merge-safe-fields action is only meaningful (and only ever
 *  shown as available) when there is at least one field that was NOT part
 *  of the dispute. */
export function isMergeSafeFieldsAvailable(conflict: Pick<ClinicalConflictSummary, 'safeMergeFields'>): boolean {
  return conflict.safeMergeFields.length > 0;
}

/**
 * D-11: unresolved conflicts stay persistently visible until they are
 * actually cleared -- only `RESOLVED` ever hides this sheet/its entry in a
 * failure-center list. `OPEN`, `GUIDED_RETRY`, and `ESCALATED` are all
 * still-open states (D-22/D-23's own checkpoints along the way), not silent
 * dead ends.
 */
export function isUnresolved(resolutionState: ResolutionState): boolean {
  return resolutionState !== ResolutionState.RESOLVED;
}

/**
 * D-09/D-24: only a SAFETY_CRITICAL conflict routes escalation to a named
 * clinician -- this sheet is built for exactly that case (clinical
 * conflicts are always SAFETY_CRITICAL per `clinicalConflict.service.ts`),
 * so the escalate action always has someone to name when this returns
 * non-null.
 */
export function escalationOwnerLabel(
  conflict: Pick<ClinicalConflictSummary, 'recommendedOwnerUserId' | 'severity'>,
  resolveName: (userId: string) => string,
): string | null {
  if (conflict.severity !== ConflictSeverity.SAFETY_CRITICAL) return null;
  if (!conflict.recommendedOwnerUserId) return null;
  return resolveName(conflict.recommendedOwnerUserId);
}

/** Which actions the sheet should render as enabled for a given conflict --
 *  MERGE_SAFE_FIELDS is omitted entirely (not just disabled) when there is
 *  nothing safe to merge, so the sheet never offers an action that would be
 *  a silent no-op. */
export function availableActions(
  conflict: Pick<ClinicalConflictSummary, 'safeMergeFields'>,
): ClinicalConflictResolutionActionType[] {
  return CLINICAL_CONFLICT_RESOLUTION_ACTIONS.filter((action) =>
    action === 'MERGE_SAFE_FIELDS' ? isMergeSafeFieldsAvailable(conflict) : true,
  );
}
