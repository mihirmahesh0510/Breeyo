import { ConflictSeverity } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';

/**
 * The SOAP-note/vitals/prescription fields `consultationOfflineReplay.service.ts`
 * reconciles on every replay. Fixed at the top level of `SaveDraftInput` --
 * field-level (not sub-item-level) granularity is the plan's explicitly
 * chosen boundary for "clearly non-destructive" (D-07): two devices editing
 * different top-level sections (e.g. one adds care instructions, the other
 * records vitals) merge safely, but two devices touching the SAME field
 * (even a list field like `prescriptions`) never get array-merged --
 * they're always routed to clinician review (D-06) rather than guessed at.
 */
export const CLINICAL_DRAFT_FIELDS = [
  'vitals',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'careInstructions',
  'referral',
  'rxNotes',
  'prescriptions',
] as const;

export type ClinicalDraftField = (typeof CLINICAL_DRAFT_FIELDS)[number];

export interface ClassifyClinicalConflictInput {
  /** The draft snapshot as last confirmed in sync with the server, before
   *  this device's offline editing session began. The three-way diff base. */
  baseline: SaveDraftInput;
  /** The offline device's own current draft state. */
  local: SaveDraftInput;
  /** The server's current live draft (what another device may have written
   *  while this device was offline). */
  server: SaveDraftInput;
  /** D-09/D-24: the clinician who owns this consultation -- always the
   *  recommended (and, per this service's caller, assigned) owner for any
   *  SAFETY_CRITICAL conflict this classification produces. */
  assignedClinicianId: string;
}

export interface ClinicalConflictClassification {
  hasConflict: boolean;
  severity: ConflictSeverity | null;
  /** Fields both sides changed to DIFFERENT values since baseline -- these
   *  are exactly what D-05/D-06 forbid auto-resolving. */
  conflictingFields: ClinicalDraftField[];
  /** Fields only the offline device changed (server left them at baseline)
   *  -- D-07's "clearly non-destructive" case, safe to auto-merge. */
  safeMergeFields: ClinicalDraftField[];
  /** The server's current draft with every `safeMergeFields` entry
   *  overwritten by the local value. Conflicting fields are NEVER present
   *  here with the local value -- they always keep the server's copy, so a
   *  caller that blindly persisted `mergedPayload` could never silently
   *  apply a contested edit (D-05: review before overwrite). */
  mergedPayload: SaveDraftInput;
  /** Only set when `hasConflict` is true. */
  recommendedOwnerUserId?: string;
}

/**
 * Order-independent structural equality for plain JSON-shaped values
 * (objects/arrays/primitives) -- deliberately NOT `JSON.stringify` equality,
 * which is sensitive to object key insertion order and would misclassify
 * two objects with the same fields built via different code paths (e.g.
 * `{...base, x}` vs a freshly constructed literal) as "changed".
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }

  return false;
}

/**
 * Server-side clinical conflict classification (D-05 to D-09, D-24). A
 * three-way diff against the pre-offline-edit baseline, at the granularity
 * of `SaveDraftInput`'s own top-level fields:
 *
 * - Neither side touched a field, or only the SERVER touched it -> the
 *   server's value stands; nothing to merge, nothing to flag.
 * - Only the LOCAL (offline) device touched a field -> D-07 safe auto-merge:
 *   the field is clearly non-destructive (the server never saw a competing
 *   edit to it) and is applied onto `mergedPayload`.
 * - BOTH sides touched a field and landed on the identical value -> treated
 *   as a non-conflict (there is nothing left to reconcile).
 * - BOTH sides touched a field and landed on DIFFERENT values -> D-06/D-07:
 *   this is exactly the case broad auto-merge must reject. The field is
 *   recorded in `conflictingFields`, `mergedPayload` keeps the SERVER's
 *   value (never silently overwritten with the local edit), and the whole
 *   classification comes back `hasConflict: true` /
 *   `severity: SAFETY_CRITICAL` with `recommendedOwnerUserId` set to the
 *   assigned clinician (D-09/D-24) so escalation always has a named owner.
 */
export function classifyClinicalConflict(
  input: ClassifyClinicalConflictInput,
): ClinicalConflictClassification {
  const { baseline, local, server, assignedClinicianId } = input;

  const conflictingFields: ClinicalDraftField[] = [];
  const safeMergeFields: ClinicalDraftField[] = [];
  const mergedPayload: SaveDraftInput = { ...server };

  for (const field of CLINICAL_DRAFT_FIELDS) {
    const baselineVal = (baseline as Record<string, unknown>)[field];
    const localVal = (local as Record<string, unknown>)[field];
    const serverVal = (server as Record<string, unknown>)[field];

    const localChanged = !deepEqual(localVal, baselineVal);
    const serverChanged = !deepEqual(serverVal, baselineVal);

    if (localChanged && serverChanged) {
      if (!deepEqual(localVal, serverVal)) {
        conflictingFields.push(field);
      }
      // Either a genuine conflict (server's value stays in mergedPayload,
      // already there from the initial spread) or both sides converged on
      // the same value (server's copy is that same value) -- either way,
      // nothing further to do for this field.
      continue;
    }

    if (localChanged && !serverChanged) {
      safeMergeFields.push(field);
      (mergedPayload as Record<string, unknown>)[field] = localVal;
    }
  }

  const hasConflict = conflictingFields.length > 0;

  return {
    hasConflict,
    severity: hasConflict ? ConflictSeverity.SAFETY_CRITICAL : null,
    conflictingFields,
    safeMergeFields,
    mergedPayload,
    recommendedOwnerUserId: hasConflict ? assignedClinicianId : undefined,
  };
}

/**
 * Thin service wrapper (matches this module's other stateless services'
 * class-based shape) around `classifyClinicalConflict`. Kept as a class so
 * `consultationSync.controller.ts`/`consultationOfflineReplay.service.ts`
 * can depend on an injectable collaborator the same way they depend on
 * `ConsultationLockService`/`DosageService`, even though the classification
 * itself has no state or I/O.
 */
export class ClinicalConflictService {
  classifyClinicalConflict(input: ClassifyClinicalConflictInput): ClinicalConflictClassification {
    return classifyClinicalConflict(input);
  }
}
