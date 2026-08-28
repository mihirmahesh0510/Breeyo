import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { offlineOperationEnvelopeSchema, saveDraftSchema } from '@breeyo/validators';
import { ConflictSeverity, ResolutionState } from '@breeyo/types';
import type { SaveDraftInput, AddendumEntry } from '@breeyo/types';
import { classifyClinicalConflict, CLINICAL_DRAFT_FIELDS } from './clinicalConflict.service.js';
import { ReplayBroadcastService } from '../../sync/services/replayBroadcast.service.js';

/** Wire contract with `apps/mobile/src/features/consultation/services/offlineConsultationDraftStore.ts`. */
export const EMR_SYNC_DOMAIN = 'emr';
export const CONSULTATION_DRAFT_ENTITY_TYPE = 'CONSULTATION_DRAFT_SAVE';

/** The exact `Consultation.status` string value (`prisma/schema.prisma`,
 *  `emr.service.ts`/`emr.repository.ts`) once a consultation has been
 *  finalized. Not an enum -- the column is a plain default-`'draft'` string. */
const FINALIZED_CONSULTATION_STATUS = 'finalized';

/**
 * The offline device's own current draft (`draft`) plus the draft snapshot
 * it last knew to be in sync with the server (`baseline`) -- the three-way
 * diff base `clinicalConflict.service.ts` needs to tell "the server also
 * changed this since I went offline" apart from "the server just still has
 * whatever it always had."
 */
const consultationDraftReplayPayloadSchema = z.object({
  draft: saveDraftSchema,
  baseline: saveDraftSchema,
});

/**
 * Minimal shape this service needs from a consultation row. Deliberately
 * not the generated Prisma `Consultation` model type -- matches
 * `QueueEntryRecord`'s convention in `queueOfflineReplay.service.ts`, so a
 * plain in-memory fake can stand in for `EmrRepository` in tests.
 */
export interface ConsultationRecord {
  id: string;
  clinicId: string;
  /** D-09/D-24: the consultation's own owning vet is always the assigned
   *  clinician a SAFETY_CRITICAL conflict is routed to. */
  vetId: string;
  status: string;
}

/**
 * The subset of `EmrRepository`'s public surface this service depends on.
 * Method names/signatures intentionally match `EmrRepository` exactly so a
 * real `EmrRepository` instance satisfies this interface structurally, the
 * same way `QueueRepository` does for `QueueOfflineReplayGateway`.
 */
export interface ConsultationOfflineReplayGateway {
  getConsultation(consultationId: string, clinicId: string): Promise<ConsultationRecord | null>;
  loadDraft(consultationId: string): Promise<SaveDraftInput | null>;
  saveDraft(consultationId: string, clinicId: string, data: SaveDraftInput): Promise<void>;
  /** Matches `EmrRepository.addAddendum` exactly (verify-fix 10.1) -- the
   *  post-finalization editability mechanism Phase 4 already built
   *  (`04-CONTEXT.md`: "addendum-only"). A finalized consultation's late
   *  offline replay is routed here instead of the draft/conflict-diff path. */
  addAddendum(consultationId: string, addendum: AddendumEntry): Promise<unknown>;
}

/** Same `SyncReplayReceipt` idempotency ledger every other domain adapter
 *  reads/writes (Plan 10-01's shared table) -- not a second ledger. */
export interface ConsultationReplayReceiptStore {
  findUnique(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<{ operationId: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ operationId: string }>;
  delete(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<unknown>;
}

/** Backed by the same `SyncConflictRecord` table the shared replay ingress
 *  and `queueOfflineReplay.service.ts` use, created here with
 *  `severity: SAFETY_CRITICAL` (D-06) instead of `OPERATIONAL`. */
export interface ClinicalConflictRecordStore {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

/**
 * AC-3 (access-control audit): this replay path had NO permission check at
 * all, unlike `inventoryOfflineReplay.service.ts`'s per-entity
 * `INVENTORY_PERMISSIONS` check (`dispense.routes.ts`) -- a device replaying
 * through `/consultations/sync/replay` could write/overwrite clinical drafts
 * regardless of whether the authenticated user actually holds `EDIT_EMR`.
 * Kept as a local interface (not the concrete `PermissionService` import)
 * matching `InventoryOfflineReplayService`'s own `PermissionsProvider`
 * convention. */
export interface PermissionsProvider {
  getUserPermissions(userId: string, clinicId: string): Promise<string[]>;
}

/** Every consultation replay envelope is a `CONSULTATION_DRAFT_SAVE`
 *  mutation -- the same permission the live PATCH
 *  `/consultations/:consultationId/draft` route requires via `editHandler`
 *  in `emr.routes.ts`. */
const REQUIRED_REPLAY_PERMISSION = 'EDIT_EMR';

function forbiddenError(entityType: string, requiredPermission: string): Error & { statusCode: number; code: string } {
  const error = new Error(`Permission denied: ${entityType} requires ${requiredPermission}`) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  return error;
}

export interface ConsultationOfflineReplayContext {
  clinicId: string;
  userId: string;
  deviceId: string;
  /** Same `(request as any).userName ?? 'Unknown'` fallback convention as
   *  the live `addAddendumHandler` in `emr.controller.ts` -- optional here
   *  because most callers/tests only need `userId` for authorship. */
  userName?: string;
}

export type ConsultationReplayOutcomeStatus =
  | 'APPLIED'
  | 'ACKNOWLEDGED_DUPLICATE'
  | 'CONFLICT_CREATED'
  | 'REJECTED';

export interface ConsultationReplayOutcome {
  operationId: string;
  status: ConsultationReplayOutcomeStatus;
  consultationId?: string;
  conflictId?: string;
  message?: string;
}

const EMPTY_DRAFT: SaveDraftInput = {};

function stringField(raw: unknown, field: string): string {
  if (raw && typeof raw === 'object' && field in raw) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return 'unknown';
}

/**
 * Verify-fix 10.1: for a late replay against an already-finalized
 * consultation, only the top-level `SaveDraftInput` fields the offline
 * device actually changed relative to its own last-known baseline become
 * addendum content -- same field set (`CLINICAL_DRAFT_FIELDS`) the
 * still-in-draft conflict diff reconciles on, so "changed" means the same
 * thing in both paths. Returns `null` when the offline edit turns out to
 * be a no-op (nothing to append), matching the safe-merge no-op case just
 * above it.
 */
function buildChangedFieldsSummary(draft: SaveDraftInput, baseline: SaveDraftInput): string | null {
  const changedFields = CLINICAL_DRAFT_FIELDS.filter((field) => {
    const draftValue = (draft as Record<string, unknown>)[field];
    const baselineValue = (baseline as Record<string, unknown>)[field];
    return JSON.stringify(draftValue) !== JSON.stringify(baselineValue);
  });

  if (changedFields.length === 0) return null;

  const details = changedFields
    .map((field) => `${field}: ${JSON.stringify((draft as Record<string, unknown>)[field])}`)
    .join('; ');

  return `Updated fields -- ${details}`;
}

/** Prefers the offline device's own edit timestamp (envelope `createdAt`)
 *  over the replay's arrival time, falling back only when it is missing or
 *  unparseable. */
function parseEnvelopeCreatedAt(createdAt: string): Date {
  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Server-side reconciliation for offline consultation draft edits (PLT-03,
 * D-05 to D-09, D-24). Mirrors `QueueOfflineReplayService`'s shape (same
 * idempotency ledger, same envelope schema, same
 * reject-malformed/reject-duplicate structure) but the clinical domain's
 * review posture is stricter: where a queue mismatch gets a lightweight
 * `OPERATIONAL` review note and moves on, ANY genuinely overlapping clinical
 * edit here becomes a `SAFETY_CRITICAL` conflict record and the ENTIRE
 * replay is held back -- not even the same replay's non-conflicting fields
 * are written -- until a clinician resolves it (D-06: clinical records are
 * the most conflict-sensitive domain and get the strongest protection).
 */
export class ConsultationOfflineReplayService {
  constructor(
    private readonly gateway: ConsultationOfflineReplayGateway,
    private readonly replayReceipts: ConsultationReplayReceiptStore,
    private readonly conflictRecords: ClinicalConflictRecordStore,
    // AC-3: no default -- every real call site must supply a real
    // `PermissionService`. Only test doubles construct this without one.
    private readonly permissionsProvider: PermissionsProvider,
    // Verify-fix 10.3: defaults to a no-op broadcast, matching
    // `ReplayIngestService`'s/`QueueOfflineReplayService`'s own convention;
    // `consultationSync.controller.ts` wires a real
    // `ReplayBroadcastService(fastify.io)` in for production.
    private readonly broadcast: ReplayBroadcastService = new ReplayBroadcastService(null),
  ) {}

  async replayConsultationDraft(
    context: ConsultationOfflineReplayContext,
    raw: unknown,
  ): Promise<ConsultationReplayOutcome> {
    const parsedEnvelope = offlineOperationEnvelopeSchema.safeParse(raw);
    if (!parsedEnvelope.success) {
      return {
        operationId: stringField(raw, 'operationId'),
        status: 'REJECTED',
        message: parsedEnvelope.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const envelope = parsedEnvelope.data;

    if (envelope.entityType !== CONSULTATION_DRAFT_ENTITY_TYPE) {
      return {
        operationId: envelope.operationId,
        status: 'REJECTED',
        message: `Unsupported consultation replay entityType: ${envelope.entityType}`,
      };
    }

    // AC-3: enforced here, not only as a route-level preHandler -- this
    // service is the one place every consultation draft replay actually
    // flows through regardless of which route dispatches into it, matching
    // `InventoryOfflineReplayService`'s own enforce-in-the-service
    // convention (D-41-D-44) for a payload a route-level preHandler cannot
    // otherwise inspect.
    const userPermissions = await this.permissionsProvider.getUserPermissions(context.userId, context.clinicId);
    if (!userPermissions.includes(REQUIRED_REPLAY_PERMISSION)) {
      throw forbiddenError(envelope.entityType, REQUIRED_REPLAY_PERMISSION);
    }

    const existingReceipt = await this.replayReceipts.findUnique({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId: envelope.operationId,
        },
      },
    });

    if (existingReceipt) {
      // A duplicate or flapping replay of an already-processed operation is
      // a no-op, not a second write and not a second conflict record.
      return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE' };
    }

    const parsedPayload = consultationDraftReplayPayloadSchema.safeParse(envelope.payload);
    if (!parsedPayload.success) {
      return {
        operationId: envelope.operationId,
        status: 'REJECTED',
        message: parsedPayload.error.issues.map((issue) => issue.message).join(', '),
      };
    }
    const { draft, baseline } = parsedPayload.data;

    const consultation = await this.gateway.getConsultation(envelope.entityId, context.clinicId);
    if (!consultation) {
      return { operationId: envelope.operationId, status: 'REJECTED', message: 'Consultation not found for this clinic.' };
    }

    // Verify-fix 10.1: a consultation finalized before this offline edit
    // reconnects has no draft row left to diff against (finalization
    // deletes it) -- `loadDraft` would return null, get misread as
    // `EMPTY_DRAFT`, and either silently drop the edit or recreate an
    // orphan `ConsultationDraft` row nothing reads. Branch out BEFORE the
    // draft/conflict-diff path runs at all: route through Phase 4's
    // existing addendum mechanism instead (04-CONTEXT.md: "addendum-only"
    // post-finalization editability).
    if (consultation.status === FINALIZED_CONSULTATION_STATUS) {
      return this.replayAsAddendum(context, envelope, consultation, draft, baseline);
    }

    const serverDraft = (await this.gateway.loadDraft(consultation.id)) ?? EMPTY_DRAFT;

    const classification = classifyClinicalConflict({
      baseline,
      local: draft,
      server: serverDraft,
      assignedClinicianId: consultation.vetId,
    });

    if (classification.hasConflict) {
      // WR-1: reserve this operationId's receipt BEFORE creating the
      // conflict record -- so two genuinely concurrent replays of the same
      // operationId cannot both pass the earlier `findUnique` check and
      // both create a duplicate conflict record. Only the request that wins
      // the receipt-create race proceeds; the loser acknowledges untouched.
      const reservation = await this.recordReceipt(context, envelope.operationId, consultation.id);
      if (reservation.raced) {
        // WR-1: lost the race to reserve this operationId's receipt -- a
        // concurrent replay of the SAME operation already won and is the
        // request of record.
        return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE', consultationId: consultation.id };
      }
      let conflictId: string;
      try {
        conflictId = await this.createConflictRecord(context, {
          operationId: envelope.operationId,
          consultationId: consultation.id,
          baselinePayload: baseline,
          localPayload: draft,
          serverPayload: serverDraft,
          ownerUserId: classification.recommendedOwnerUserId!,
        });
      } catch (error) {
        // WR-1: the conflict record never actually got created -- release
        // the reservation so a legitimate retry of this operationId is not
        // permanently told "already handled".
        await this.releaseReceipt(context, envelope.operationId);
        throw error;
      }

      // Verify-fix 10.3: D-05/D-06/D-08 -- a SAFETY_CRITICAL conflict is
      // exactly the case an already-open browser/mobile view must not
      // silently keep rendering stale/disputed state for. This runs AFTER
      // the conflict record already durably exists, so a failure here must
      // not release the receipt -- that would let a retry create a
      // duplicate conflict record.
      this.broadcast.emitReplayConflictOpened({
        clinicId: context.clinicId,
        domain: EMR_SYNC_DOMAIN,
        entityIds: [consultation.id],
      });
      return {
        operationId: envelope.operationId,
        status: 'CONFLICT_CREATED',
        consultationId: consultation.id,
        conflictId,
      };
    }

    // WR-1: reserve this operationId's receipt BEFORE saving the draft --
    // same reasoning as the conflict branch above: only the winner of the
    // receipt-create race ever calls `saveDraft`.
    const reservation = await this.recordReceipt(context, envelope.operationId, consultation.id);
    if (reservation.raced) {
      // WR-1: lost the race to reserve this operationId's receipt -- a
      // concurrent replay of the SAME operation already won and is the
      // request of record.
      return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE', consultationId: consultation.id };
    }

    try {
      if (classification.safeMergeFields.length > 0) {
        // D-07: only clearly non-destructive fields ever reach here --
        // classifyClinicalConflict already excluded anything the server also
        // touched from `mergedPayload`'s applied set.
        await this.gateway.saveDraft(consultation.id, context.clinicId, classification.mergedPayload);
      }
    } catch (error) {
      await this.releaseReceipt(context, envelope.operationId);
      throw error;
    }

    // Verify-fix 10.3: applied even for the true-no-op branch above (no
    // safe-merge fields) -- the replay was still processed and acknowledged,
    // matching `emitReplayApplied`'s "affected views should refresh" intent.
    // This runs AFTER `saveDraft` already durably committed (when it ran at
    // all), so a failure here must not release the receipt.
    this.broadcast.emitReplayApplied({
      clinicId: context.clinicId,
      domain: EMR_SYNC_DOMAIN,
      entityIds: [consultation.id],
    });
    return { operationId: envelope.operationId, status: 'APPLIED', consultationId: consultation.id };
  }

  /**
   * Verify-fix 10.1 / D-38: a replay whose target consultation is already
   * `finalized` never runs the draft/conflict diff -- `ConsultationDraft`
   * is not read (`loadDraft`) or written (`saveDraft`) at all in this path.
   * Instead the changed SOAP/vitals/prescription fields (relative to the
   * offline device's own last-known baseline) are translated into a single
   * addendum entry via Phase 4's existing addendum-only post-finalization
   * edit mechanism (`04-CONTEXT.md`), authored by the originating offline
   * user.
   */
  private async replayAsAddendum(
    context: ConsultationOfflineReplayContext,
    envelope: z.infer<typeof offlineOperationEnvelopeSchema>,
    consultation: ConsultationRecord,
    draft: SaveDraftInput,
    baseline: SaveDraftInput,
  ): Promise<ConsultationReplayOutcome> {
    const changedFieldsText = buildChangedFieldsSummary(draft, baseline);

    // WR-1: reserve this operationId's receipt BEFORE adding the addendum --
    // so two genuinely concurrent replays of the same operationId cannot
    // both pass the earlier `findUnique` check and both append a duplicate
    // addendum entry.
    const reservation = await this.recordReceipt(context, envelope.operationId, consultation.id);
    if (reservation.raced) {
      // WR-1: lost the race to reserve this operationId's receipt -- a
      // concurrent replay of the SAME operation already won and is the
      // request of record.
      return { operationId: envelope.operationId, status: 'ACKNOWLEDGED_DUPLICATE', consultationId: consultation.id };
    }

    try {
      if (changedFieldsText) {
        const addendum: AddendumEntry = {
          id: crypto.randomUUID(),
          text: `Offline edit synced after this consultation was finalized (auto-applied as addendum). ${changedFieldsText}`,
          addedBy: context.userId,
          addedByName: context.userName ?? 'Unknown',
          // Original offline edit time when the envelope's `createdAt` is a
          // valid timestamp, else the replay's own time.
          addedAt: parseEnvelopeCreatedAt(envelope.createdAt),
        };
        await this.gateway.addAddendum(consultation.id, addendum);
      }
    } catch (error) {
      await this.releaseReceipt(context, envelope.operationId);
      throw error;
    }

    if (changedFieldsText) {
      // Verify-fix 10.3: only for a genuine apply (a real addendum was
      // added) -- the true-no-op case just below never touched anything, so
      // it must not fire a broadcast implying a view refresh is warranted.
      // This runs AFTER `addAddendum` already durably committed, so a
      // failure here must not release the receipt.
      this.broadcast.emitReplayApplied({
        clinicId: context.clinicId,
        domain: EMR_SYNC_DOMAIN,
        entityIds: [consultation.id],
      });
    }
    return {
      operationId: envelope.operationId,
      status: 'APPLIED',
      consultationId: consultation.id,
      message: changedFieldsText
        ? 'Applied as a clinical addendum: consultation was already finalized.'
        : 'No field changes to apply: consultation was already finalized.',
    };
  }

  private async recordReceipt(
    context: ConsultationOfflineReplayContext,
    operationId: string,
    consultationId: string,
  ): Promise<{ raced: boolean }> {
    try {
      await this.replayReceipts.create({
        data: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId,
          userId: context.userId,
          domain: EMR_SYNC_DOMAIN,
          entityType: CONSULTATION_DRAFT_ENTITY_TYPE,
          entityId: consultationId,
        },
      });
      return { raced: false };
    } catch (err) {
      // WR-1: the `findUnique` in `replayConsultationDraft` and this
      // `create` are not transactional, so a genuinely concurrent duplicate
      // replay of the same operationId can both see no existing receipt and
      // both reach here (both after already running their own mutation
      // above). The `[clinicId, deviceId, operationId]` unique constraint
      // lets exactly one of them win; the loser hits P2002. Matching
      // `replayIngest.service.ts`'s "Verify-fix 10.9" pattern: treat that as
      // "already acknowledged by the request that won the race" and let the
      // caller return an idempotent-duplicate outcome instead of this
      // surfacing as an unhandled 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const racedReceipt = await this.replayReceipts.findUnique({
          where: {
            clinicId_deviceId_operationId: {
              clinicId: context.clinicId,
              deviceId: context.deviceId,
              operationId,
            },
          },
        });
        if (racedReceipt) {
          return { raced: true };
        }
      }
      throw err;
    }
  }

  /**
   * WR-1: releases a receipt this same request just reserved (via
   * `recordReceipt`, above) after the mutation that followed the reservation
   * turned out to fail -- so a legitimate later retry of this exact
   * operationId is not permanently and incorrectly told "already handled"
   * for a mutation that never actually applied.
   */
  private async releaseReceipt(context: ConsultationOfflineReplayContext, operationId: string): Promise<void> {
    await this.replayReceipts.delete({
      where: {
        clinicId_deviceId_operationId: {
          clinicId: context.clinicId,
          deviceId: context.deviceId,
          operationId,
        },
      },
    });
  }

  private async createConflictRecord(
    context: ConsultationOfflineReplayContext,
    input: {
      operationId: string;
      consultationId: string;
      baselinePayload: SaveDraftInput;
      localPayload: SaveDraftInput;
      serverPayload: SaveDraftInput;
      ownerUserId: string;
    },
  ): Promise<string> {
    const record = await this.conflictRecords.create({
      data: {
        clinicId: context.clinicId,
        deviceId: context.deviceId,
        operationId: input.operationId,
        domain: EMR_SYNC_DOMAIN,
        entityType: CONSULTATION_DRAFT_ENTITY_TYPE,
        entityId: input.consultationId,
        severity: ConflictSeverity.SAFETY_CRITICAL,
        // verify-fix 10.5: persisted so `POST .../conflicts/:conflictId/resolve`'s
        // MERGE_SAFE_FIELDS action can rerun `classifyClinicalConflict`'s real
        // three-way diff at resolution time instead of guessing from only the
        // two payload snapshots.
        baselinePayloadJson: input.baselinePayload,
        localPayloadJson: input.localPayload,
        serverPayloadJson: input.serverPayload,
        // D-09/D-24: a consultation always has a definite owning vet, so
        // (unlike the generic shared ingress, which may only have a
        // "recommended" owner) both fields are set immediately -- there is
        // no ambiguity window where a SAFETY_CRITICAL clinical conflict has
        // no accountable owner.
        recommendedOwnerUserId: input.ownerUserId,
        resolutionOwnerUserId: input.ownerUserId,
        originatingUserId: context.userId,
        currentOwnerUserId: input.ownerUserId,
        resolutionState: ResolutionState.OPEN,
      },
    });
    return record.id;
  }
}
