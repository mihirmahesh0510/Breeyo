import type { ConflictSeverity, ReplayPriority, ResolutionState, SyncVisibilityState } from './constants.js';

/**
 * An offline-created or offline-modified operation waiting to replay to the
 * server. Every mobile domain adapter (queue, EMR, inventory, ...) wraps its
 * domain payload in this envelope so replay ingress can apply one shared
 * ownership/priority contract before any domain handler runs.
 */
export interface OfflineOperationEnvelope<TPayload = unknown> {
  deviceId: string;
  operationId: string;
  clinicId: string;
  userId: string;
  domain: string;
  entityType: string;
  entityId: string;
  priority: ReplayPriority;
  createdAt: string;
  payload: TPayload;
}

/**
 * One replay attempt for an OfflineOperationEnvelope. Persisted so guided
 * retry (D-22, D-23) can tell "never tried" apart from "tried and failed
 * once" apart from "exhausted the guided retry and needs escalation."
 */
export interface OfflineOperationAttempt {
  operationId: string;
  deviceId: string;
  clinicId: string;
  attemptNumber: number;
  attemptedAt: string;
  succeeded: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Reference to a same-day working-set snapshot row (queue, active patient,
 * consultation draft, or inventory-in-motion). `workingSetAnchoredAt` is
 * captured once, the instant the device goes offline -- D-35 requires the
 * same-day window to track that moment rather than the current calendar
 * date, so an overnight shift spanning midnight does not get demoted to
 * read-only fallback mid-shift.
 */
export interface WorkingSetSnapshotRef {
  clinicId: string;
  deviceId: string;
  domain: string;
  entityType: string;
  entityId: string;
  workingSetAnchoredAt: string;
  isFullyEditable: boolean;
}

/**
 * A structured, review-before-overwrite conflict record (D-05 to D-10).
 * Both `localPayload` and `serverPayload` are mandatory so the resolution
 * sheet can always compare local and server state explicitly (D-08).
 * SAFETY_CRITICAL conflicts additionally require `resolutionOwnerUserId`
 * (enforced in the zod schema, not just this type) because D-24 and D-36
 * require an accountable clinician -- or on-duty fallback -- rather than an
 * anonymous queue of disputed records.
 */
export interface SyncConflictEnvelope<TPayload = unknown> {
  conflictId: string;
  clinicId: string;
  deviceId: string;
  operationId: string;
  domain: string;
  entityType: string;
  entityId: string;
  severity: ConflictSeverity;
  localPayload: TPayload;
  serverPayload: TPayload;
  recommendedOwnerUserId?: string;
  resolutionOwnerUserId?: string;
  resolutionState: ResolutionState;
  createdAt: string;
}

/**
 * The actionable failure-center record (D-20, D-22, D-23). First retry stays
 * with the originating user; escalation only happens after a guided retry
 * fails, never immediately and never only by silent manual handoff.
 */
export interface SyncFailureTaskRecord {
  taskId: string;
  clinicId: string;
  operationId: string;
  domain: string;
  originatingUserId: string;
  currentOwnerUserId: string;
  guidedRetryCount: number;
  resolutionState: ResolutionState;
  nextSuggestedAction: string;
  lastAttemptedAt: string;
  createdAt: string;
}

/**
 * Server response to a batch of replayed operations. `deferredOperationIds`
 * holds operations the coordinator should re-send after higher-priority
 * tiers finish (D-12 to D-14); it is a scheduling signal, not an error.
 */
export interface ReplayAckEnvelope {
  deviceId: string;
  clinicId: string;
  acknowledgedOperationIds: string[];
  deferredOperationIds: string[];
  conflictsCreated: SyncConflictEnvelope[];
  failureTaskIds: string[];
  processedAt: string;
  visibilityState: SyncVisibilityState;
}
