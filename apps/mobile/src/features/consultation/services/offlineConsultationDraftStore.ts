/**
 * Offline consultation draft persistence (Plan 10-03 Task 1, D-01, D-05,
 * D-06, D-15 to D-17). Losing connectivity must never force
 * `ConsultationScreen.tsx` into read-only mode for SOAP notes, vitals, or
 * prescriptions already in scope for editing -- this module is what makes
 * an offline edit durable across an app restart instead of living only in
 * `useConsultationDraftStore`'s in-memory zustand state.
 *
 * Built directly on Plan 10-01's shared `offlineDb.ts` rather than a
 * second local database: `consultation_draft_snapshot` is the SAME
 * same-day working-set table (D-15 to D-17, D-35) every other domain
 * adapter's snapshot lives in, and `sync_operations` is the SAME replay
 * ledger `useOfflineQueueActions.ts` enqueues into (Plan 10-02) -- just
 * tagged `CLINICAL_MEDIUM` here instead of `QUEUE_HIGH` so
 * `syncCoordinator.ts` replays it in its own tier, never preempting or
 * being preempted outside the locked priority ladder (D-12 to D-14, D-37).
 *
 * No `expo-secure-store`/`expo-haptics`/`react-native` import here (unlike
 * `useOfflineQueueActions.ts`) -- this module only needs `expo-sqlite`
 * (via `offlineDb.ts`, already mockable in vitest's plain-node environment
 * the same way `offlineDb.test.ts` mocks it), so it stays directly testable
 * without an RN-free helper split. The caller (`ConsultationScreen.tsx` /
 * `useAutoSave.ts`) resolves `deviceId` itself, the same way
 * `useOfflineQueueActions.ts` does for queue offline actions.
 */
import type * as SQLite from 'expo-sqlite';
import { ReplayPriority } from '@breeyo/types';
import type { OfflineOperationEnvelope, SaveDraftInput } from '@breeyo/types';
import {
  enqueueOperation,
  readWorkingSetSnapshot,
  writeWorkingSetSnapshot,
} from '../../offline-sync/db/offlineDb';
import { ApiClientError } from '../../../lib/api';

/**
 * D-02: distinguishes "the server was never reached" (persist the draft
 * locally and enqueue for replay) from "the server responded, and
 * rejected the request" (e.g. `CONSULTATION_LOCKED`, a validation error --
 * a real error that must surface to the caller, not be silently captured
 * as an offline edit). Duplicated from
 * `apps/mobile/src/features/queue/lib/queue-offline-utils.ts`'s own
 * `isNetworkFailure` rather than imported cross-feature -- same convention
 * that module documents for itself: `apiClient` only ever throws
 * `ApiClientError` for a request that reached the server and got a
 * response.
 */
export function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiClientError);
}

/** Wire contract with `apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts`. */
export const EMR_SYNC_DOMAIN = 'emr';
export const CONSULTATION_DRAFT_ENTITY_TYPE = 'CONSULTATION_DRAFT_SAVE';

/**
 * D-12 to D-14, D-37: consultation replay always tags `CLINICAL_MEDIUM`,
 * never `QUEUE_HIGH` -- the shared `syncCoordinator.ts` (Plan 10-01) owns
 * tier ordering/preemption; this module never reimplements or overrides it.
 */
export const CLINICAL_MEDIUM = ReplayPriority.CLINICAL_MEDIUM;

/** The `SaveDraftInput` fields diffed for changed-field metadata -- kept in
 *  sync with `CLINICAL_DRAFT_FIELDS` in the API's
 *  `clinicalConflict.service.ts` (duplicated rather than shared, since
 *  mobile and API are separate packages with no shared runtime module for
 *  this list beyond the `SaveDraftInput` type itself). */
const DRAFT_FIELDS = [
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

/**
 * Order-independent structural equality, same rationale as the API's own
 * `clinicalConflict.service.ts#deepEqual`: `JSON.stringify` equality is
 * sensitive to object key insertion order and would misclassify two
 * equivalent drafts built via different code paths as "changed".
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

/** Fields present in `current` that differ from `baseline` -- the "local
 *  changed-field metadata" the plan calls for, computed against the last
 *  known-synced snapshot rather than just "is this non-empty". */
export function computeChangedFields(baseline: SaveDraftInput, current: SaveDraftInput): string[] {
  return DRAFT_FIELDS.filter(
    (field) => !deepEqual((current as Record<string, unknown>)[field], (baseline as Record<string, unknown>)[field]),
  );
}

export interface ConsultationDraftReplayPayload {
  draft: SaveDraftInput;
  baseline: SaveDraftInput;
}

export interface BuildConsultationDraftEnvelopeInput {
  operationId: string;
  consultationId: string;
  deviceId: string;
  clinicId: string;
  userId: string;
  draft: SaveDraftInput;
  baseline: SaveDraftInput;
  createdAt: string;
}

export function buildConsultationDraftEnvelope(
  input: BuildConsultationDraftEnvelopeInput,
): OfflineOperationEnvelope<ConsultationDraftReplayPayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: EMR_SYNC_DOMAIN,
    entityType: CONSULTATION_DRAFT_ENTITY_TYPE,
    entityId: input.consultationId,
    priority: CLINICAL_MEDIUM,
    createdAt: input.createdAt,
    payload: { draft: input.draft, baseline: input.baseline },
  };
}

export interface SaveOfflineConsultationDraftInput {
  consultationId: string;
  clinicId: string;
  deviceId: string;
  userId: string;
  /** The device's own current draft state. */
  draft: SaveDraftInput;
  /** The draft snapshot last known to be in sync with the server, before
   *  this offline editing session began -- the diff base for both
   *  `changedFields` here and the field-level three-way merge the API's
   *  `consultationOfflineReplay.service.ts` runs on replay. */
  baseline: SaveDraftInput;
  /** Local id generator, injectable for deterministic tests. */
  generateOperationId?: () => string;
  now?: () => Date;
}

/** The shape persisted in `consultation_draft_snapshot.data_json` and
 *  returned by `loadOfflineConsultationDraft`. */
export interface OfflineConsultationDraftSnapshot {
  draft: SaveDraftInput;
  baseline: SaveDraftInput;
  changedFields: string[];
  /** The operationId of the most recently enqueued `sync_operations` row
   *  for this consultation+device -- carried along purely for traceability
   *  (which replay envelope reflects this exact snapshot content). */
  lastOperationId: string;
}

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Persists a consultation draft to the on-device same-day working set
 * (D-15 to D-17) so it survives an app restart while offline, and enqueues
 * a `CLINICAL_MEDIUM` replay envelope carrying the full draft+baseline for
 * reconnect (D-12 to D-14, D-37 -- the shared coordinator handles ordering,
 * this module only tags the tier).
 *
 * Idempotent-ish by content: if the draft AND baseline are byte-for-byte
 * (deep) unchanged since the last offline save for this consultation,
 * neither the snapshot write nor a new replay envelope happens -- this is
 * what keeps a stuck-offline device's repeated auto-save retries (every few
 * seconds, per `useAutoSave.ts`) from flooding the replay ledger with
 * redundant operations while nothing has actually changed. Whenever the
 * draft DOES change again, a fresh operationId is enqueued alongside the
 * earlier one(s) -- replaying an earlier, now-superseded envelope first is
 * harmless, since each one fully reconciles against the live server draft
 * on its own via the same review-before-overwrite classification, and the
 * LAST envelope to replay reflects the true final edit state either way.
 */
export async function saveOfflineConsultationDraft(
  db: SQLite.SQLiteDatabase,
  input: SaveOfflineConsultationDraftInput,
): Promise<OfflineConsultationDraftSnapshot> {
  const existing = await readWorkingSetSnapshot(db, 'consultation_draft_snapshot', input.consultationId);
  const existingData = existing?.data as OfflineConsultationDraftSnapshot | undefined;

  if (existingData && deepEqual(existingData.draft, input.draft) && deepEqual(existingData.baseline, input.baseline)) {
    // Nothing changed since the last offline save for this consultation --
    // skip both the snapshot write and the replay enqueue.
    return existingData;
  }

  const changedFields = computeChangedFields(input.baseline, input.draft);
  const now = input.now ?? (() => new Date());
  const generateOperationId = input.generateOperationId ?? generateLocalId;
  const operationId = generateOperationId();

  const snapshot: OfflineConsultationDraftSnapshot = {
    draft: input.draft,
    baseline: input.baseline,
    changedFields,
    lastOperationId: operationId,
  };

  await writeWorkingSetSnapshot(db, 'consultation_draft_snapshot', {
    entityId: input.consultationId,
    clinicId: input.clinicId,
    deviceId: input.deviceId,
    data: snapshot,
    // A consultation being actively edited is always "of today" from the
    // moment it is written -- the shared same-day working-set anchor
    // (D-35) is what actually governs whether it stays editable across a
    // midnight-spanning offline stretch, not this record date.
    recordDate: now().toISOString(),
  });

  const envelope = buildConsultationDraftEnvelope({
    operationId,
    consultationId: input.consultationId,
    deviceId: input.deviceId,
    clinicId: input.clinicId,
    userId: input.userId,
    draft: input.draft,
    baseline: input.baseline,
    createdAt: now().toISOString(),
  });

  await enqueueOperation(db, {
    operationId: envelope.operationId,
    deviceId: envelope.deviceId,
    clinicId: envelope.clinicId,
    userId: envelope.userId,
    domain: envelope.domain,
    entityType: envelope.entityType,
    entityId: envelope.entityId,
    priority: envelope.priority,
    payload: envelope.payload,
    createdAt: envelope.createdAt,
  });

  return snapshot;
}

/**
 * Loads the persisted offline draft for a consultation, if one exists.
 * Returns `null` when nothing has been saved offline yet -- the normal case
 * whenever the device has never lost connectivity while editing this
 * consultation.
 */
export async function loadOfflineConsultationDraft(
  db: SQLite.SQLiteDatabase,
  consultationId: string,
): Promise<OfflineConsultationDraftSnapshot | null> {
  const row = await readWorkingSetSnapshot(db, 'consultation_draft_snapshot', consultationId);
  if (!row) {
    return null;
  }
  return row.data as OfflineConsultationDraftSnapshot;
}
