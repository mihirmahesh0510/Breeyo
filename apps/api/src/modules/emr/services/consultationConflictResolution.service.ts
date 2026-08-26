import { ResolutionState } from '@breeyo/types';
import type { SaveDraftInput, AddendumEntry } from '@breeyo/types';
import { classifyClinicalConflict, CLINICAL_DRAFT_FIELDS } from './clinicalConflict.service.js';
import { EMR_SYNC_DOMAIN, CONSULTATION_DRAFT_ENTITY_TYPE } from './consultationOfflineReplay.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';
import {
  resolveNextOnDutyClinicianId,
  type OnDutyRosterProvider,
} from '../../sync/services/retryEscalation.service.js';

/** The exact `Consultation.status` string value once a consultation has been
 *  finalized -- same constant `consultationOfflineReplay.service.ts` uses
 *  (not an enum; the column is a plain default-`'draft'` string). */
const FINALIZED_CONSULTATION_STATUS = 'finalized';

/**
 * Verify-fix 10.5 (D-05 to D-11): the four resolution actions that actually
 * reach this endpoint. Deliberately a SUBSET of the mobile sheet's own
 * `CLINICAL_CONFLICT_RESOLUTION_ACTIONS`
 * (`apps/mobile/.../clinical-conflict-resolution.ts`) -- that union also
 * lists `RETRY`, but `SyncFailureCenterScreen.tsx`'s real wiring (verify-fix
 * 10.4) never routes `RETRY` through `onResolveClinicalConflict`; it goes to
 * the screen's separate `onRetry` callback, which is finding 10.6's guided
 * retry route (`retryEscalation.service.ts`'s `assignOriginatingUserRetry`).
 * A "retry" is not a resolution of this conflict record -- it is another
 * attempt at the same replay -- so it has no field-level outcome to apply
 * here and is intentionally not one of this service's actions.
 */
export const CONSULTATION_CONFLICT_RESOLUTION_ACTIONS = [
  'KEEP_LOCAL',
  'KEEP_SERVER',
  'MERGE_SAFE_FIELDS',
  'ESCALATE',
] as const;

export type ConsultationConflictResolutionAction = (typeof CONSULTATION_CONFLICT_RESOLUTION_ACTIONS)[number];

/** Minimal shape this service needs from the `SyncConflictRecord` row.
 *  Deliberately not the generated Prisma model type, matching
 *  `ConsultationRecord`'s convention in `consultationOfflineReplay.service.ts`
 *  -- a plain in-memory fake can stand in for `db.syncConflictRecord` in
 *  tests. */
export interface ConflictRecordRow {
  id: string;
  clinicId: string;
  domain: string;
  entityType: string;
  entityId: string;
  severity: string;
  baselinePayloadJson: unknown;
  localPayloadJson: unknown;
  serverPayloadJson: unknown;
  recommendedOwnerUserId: string | null;
  currentOwnerUserId: string;
  resolutionState: string;
}

/** Backed by the same `SyncConflictRecord` table
 *  `consultationOfflineReplay.service.ts`'s `ClinicalConflictRecordStore`
 *  writes to -- this is the read/update half of the same table, not a
 *  second store. `findFirst` is scoped by BOTH `id` and `clinicId` so a
 *  conflict id from a different clinic never resolves (T-10-01/tenant
 *  isolation) -- the same shape the RLS-bound `TenantPrismaClient` already
 *  enforces at the database level, asserted explicitly here too so this
 *  service is safe even against a non-RLS fake in a unit test. */
export interface ConflictResolutionRecordStore {
  findFirst(args: { where: { id: string; clinicId: string } }): Promise<ConflictRecordRow | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<ConflictRecordRow>;
}

/** The subset of `EmrRepository`'s public surface this service depends on.
 *  Method names/signatures intentionally match `EmrRepository` exactly, the
 *  same convention `ConsultationOfflineReplayGateway` uses, so a real
 *  `EmrRepository` instance satisfies this interface structurally. */
export interface ConsultationConflictResolutionGateway {
  getConsultation(consultationId: string, clinicId: string): Promise<{ id: string; clinicId: string; status: string } | null>;
  saveDraft(consultationId: string, clinicId: string, data: SaveDraftInput): Promise<void>;
  addAddendum(consultationId: string, addendum: AddendumEntry): Promise<unknown>;
}

export interface ConsultationConflictResolutionContext {
  clinicId: string;
  userId: string;
  /** Same `(request as any).userName ?? 'Unknown'` fallback convention the
   *  live `addAddendumHandler`/late-replay-as-addendum path already use. */
  userName?: string;
}

export type ConsultationConflictResolutionState = 'RESOLVED' | 'ESCALATED';

export interface ConsultationConflictResolutionOutcome {
  conflictId: string;
  consultationId: string;
  action: ConsultationConflictResolutionAction;
  resolutionState: ConsultationConflictResolutionState;
  /** The `CLINICAL_DRAFT_FIELDS` that were actually written -- empty for
   *  `ESCALATE` (no field-level change), empty for `KEEP_SERVER` (the
   *  server's payload is already the live state), and possibly empty for
   *  `MERGE_SAFE_FIELDS` when nothing was safe to merge. */
  appliedFields: string[];
  message: string;
}

function resolutionError(message: string, statusCode: number, code: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/** Order-independent-enough field diff for the fixed top-level
 *  `CLINICAL_DRAFT_FIELDS` set -- same `JSON.stringify` comparison
 *  `buildChangedFieldsSummary` in `consultationOfflineReplay.service.ts`
 *  already uses for the same purpose (a plain JSON-shaped payload, not a
 *  hand-rolled deep-equal). */
function differingFields(a: SaveDraftInput, b: SaveDraftInput): string[] {
  return CLINICAL_DRAFT_FIELDS.filter((field) => {
    const aValue = (a as Record<string, unknown>)[field];
    const bValue = (b as Record<string, unknown>)[field];
    return JSON.stringify(aValue) !== JSON.stringify(bValue);
  });
}

function buildAppliedFieldsSummary(payload: SaveDraftInput, fields: string[]): string {
  return fields
    .map((field) => `${field}: ${JSON.stringify((payload as Record<string, unknown>)[field])}`)
    .join('; ');
}

/**
 * Server-side handler for `POST
 * /consultations/:consultationId/conflicts/:conflictId/resolve` (verify-fix
 * 10.5, closing the gap D-05 to D-11 left open: nothing could ever move a
 * `SyncConflictRecord` to `RESOLVED`). Reuses `clinicalConflict.service.ts`'s
 * own notion of "fields" (`CLINICAL_DRAFT_FIELDS`,
 * `classifyClinicalConflict`) rather than inventing a second one, and reuses
 * `EmrService`/`EmrRepository`'s addendum-only post-finalization edit path
 * (verify-fix 10.1) as the write path whenever the resolution lands after
 * the consultation has since been finalized.
 */
export class ConsultationConflictResolutionService {
  constructor(
    private readonly gateway: ConsultationConflictResolutionGateway,
    private readonly conflictRecords: ConflictResolutionRecordStore,
    // Verify-fix 10.3's convention: defaults to a no-op broadcast; the
    // controller wires a real `ReplayBroadcastService(fastify.io)` in.
    private readonly broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
    // Verify-fix 10.6: optional so every existing caller/test that never
    // exercises the ESCALATE action keeps working unchanged; the controller
    // wires a real `ClinicVetRosterProvider` in (same instance
    // `retryEscalation.service.ts`'s live routes use) so ESCALATE actually
    // hands the conflict to a different on-duty clinician (D-24, D-36)
    // instead of only flipping `resolutionState`.
    private readonly onDutyRosterProvider?: OnDutyRosterProvider,
  ) {}

  async resolveConflict(
    context: ConsultationConflictResolutionContext,
    consultationId: string,
    conflictId: string,
    action: ConsultationConflictResolutionAction,
  ): Promise<ConsultationConflictResolutionOutcome> {
    // T-10-01/tenant isolation: scoped by `context.clinicId`, which is
    // always derived server-side from the authenticated session
    // (`request.user.activeClinicId`), never from the request body/params --
    // a spoofed `conflictId` belonging to another clinic finds no row here
    // and resolves as a 404, the same as it would for a real consultation
    // lookup elsewhere in this module.
    const record = await this.conflictRecords.findFirst({
      where: { id: conflictId, clinicId: context.clinicId },
    });

    if (
      !record ||
      record.entityId !== consultationId ||
      record.entityType !== CONSULTATION_DRAFT_ENTITY_TYPE ||
      record.domain !== EMR_SYNC_DOMAIN
    ) {
      // Deliberately the same message/code whether the row doesn't exist at
      // all, belongs to another clinic, or belongs to a different
      // consultation than the one named in the URL -- never confirms which
      // case it was (no existence leak across the tenant boundary).
      throw resolutionError(
        `No conflict found for id "${conflictId}" on consultation "${consultationId}" in this clinic.`,
        404,
        'CONFLICT_NOT_FOUND',
      );
    }

    if (record.resolutionState === ResolutionState.RESOLVED) {
      // D-11-adjacent: resolving an already-resolved conflict a second time
      // is rejected loudly, not silently ignored -- a double-resolve is
      // exactly the kind of hidden double-apply this endpoint must not mask.
      throw resolutionError(
        'This conflict has already been resolved.',
        409,
        'CONFLICT_ALREADY_RESOLVED',
      );
    }

    if (action === 'ESCALATE') {
      // Verify-fix 10.6: closes the gap verify-fix 10.5 deliberately left
      // open -- ESCALATE now actually reassigns `currentOwnerUserId` to a
      // DIFFERENT on-duty clinician (D-24), using the exact same
      // roster-exhaustion/never-Admin behavior
      // `retryEscalation.service.ts`'s own escalation paths use
      // (`resolveNextOnDutyClinicianId`, shared rather than reimplemented).
      // Every EMR `SyncConflictRecord` this endpoint ever sees is
      // SAFETY_CRITICAL (`clinicalConflict.service.ts` only ever sets
      // `severity` to `SAFETY_CRITICAL` or `null`-meaning-no-conflict), so
      // there is always a real clinician hand-off to make here -- unlike
      // `recordGuidedRetryFailure`'s OPERATIONAL branch, which deliberately
      // leaves ownership untouched (D-10).
      const nextOwnerUserId = await resolveNextOnDutyClinicianId(
        this.onDutyRosterProvider,
        context.clinicId,
        record.currentOwnerUserId,
      );

      await this.conflictRecords.update({
        where: { id: conflictId },
        data: { resolutionState: ResolutionState.ESCALATED, currentOwnerUserId: nextOwnerUserId },
      });

      this.broadcast.emitReplayFailureEscalated({
        clinicId: context.clinicId,
        domain: EMR_SYNC_DOMAIN,
        entityIds: [consultationId],
      });

      return {
        conflictId,
        consultationId,
        action,
        resolutionState: 'ESCALATED',
        appliedFields: [],
        message: 'Conflict escalated to another on-duty clinician for review; no field-level change was applied.',
      };
    }

    const localPayload = record.localPayloadJson as SaveDraftInput;
    const serverPayload = record.serverPayloadJson as SaveDraftInput;

    let finalPayload: SaveDraftInput;
    let appliedFields: string[];

    if (action === 'KEEP_LOCAL') {
      // Whole-record choice (per the sheet's own doc comment: "KEEP_LOCAL/
      // KEEP_SERVER are whole-record choices") -- adopt every field this
      // device's offline draft carried, not just the ones that conflicted.
      finalPayload = localPayload;
      appliedFields = differingFields(localPayload, serverPayload);
    } else if (action === 'KEEP_SERVER') {
      // Whole-record choice the other way: discard the local edits
      // entirely. The server payload is already the live state, so there is
      // nothing to write.
      finalPayload = serverPayload;
      appliedFields = [];
    } else {
      // MERGE_SAFE_FIELDS: reruns `classifyClinicalConflict`'s real
      // three-way diff using the baseline captured at conflict-creation
      // time (verify-fix 10.5's `baselinePayloadJson` column) -- the exact
      // same "only the local device changed it" test D-07 defines, applied
      // at resolution time instead of guessed at. Falls back to treating
      // the local payload itself as the baseline for any legacy row created
      // before this column existed, which conservatively degrades to "no
      // field counts as safe" rather than ever guessing a disputed field is
      // safe to auto-apply (D-05/D-06).
      const baselinePayload = (record.baselinePayloadJson as SaveDraftInput | null) ?? localPayload;
      const classification = classifyClinicalConflict({
        baseline: baselinePayload,
        local: localPayload,
        server: serverPayload,
        assignedClinicianId: record.recommendedOwnerUserId ?? record.currentOwnerUserId,
      });
      finalPayload = classification.mergedPayload;
      appliedFields = classification.safeMergeFields;
    }

    const consultation = await this.gateway.getConsultation(consultationId, context.clinicId);
    if (!consultation) {
      throw resolutionError('Consultation not found for this clinic.', 404, 'CONSULTATION_NOT_FOUND');
    }

    let message: string;
    if (action === 'KEEP_SERVER') {
      message = 'Kept the server version; no field-level change was applied.';
    } else if (appliedFields.length === 0) {
      message =
        action === 'MERGE_SAFE_FIELDS'
          ? 'No fields were safe to merge; server version retained for every field.'
          : 'No field changes to apply -- local and server payloads already matched.';
    } else if (consultation.status === FINALIZED_CONSULTATION_STATUS) {
      // Same "post-finalization edits are addendum-only" pattern verify-fix
      // 10.1 uses for a late replay: the consultation finalized sometime
      // between this conflict being created and now, so there is no draft
      // row left to write into.
      const addendum: AddendumEntry = {
        id: crypto.randomUUID(),
        text: `Sync conflict resolved (${action}) after this consultation was finalized (auto-applied as addendum). Updated fields -- ${buildAppliedFieldsSummary(finalPayload, appliedFields)}`,
        addedBy: context.userId,
        addedByName: context.userName ?? 'Unknown',
        addedAt: new Date(),
      };
      await this.gateway.addAddendum(consultationId, addendum);
      message = 'Applied as a clinical addendum: consultation was already finalized.';
    } else {
      await this.gateway.saveDraft(consultationId, context.clinicId, finalPayload);
      message = 'Applied to the in-progress draft.';
    }

    await this.conflictRecords.update({
      where: { id: conflictId },
      data: { resolutionState: ResolutionState.RESOLVED },
    });

    this.broadcast.emitReplayApplied({
      clinicId: context.clinicId,
      domain: EMR_SYNC_DOMAIN,
      entityIds: [consultationId],
    });

    return {
      conflictId,
      consultationId,
      action,
      resolutionState: 'RESOLVED',
      appliedFields,
      message,
    };
  }
}
