import { z } from 'zod';
import { offlineOperationEnvelopeSchema, saveDraftSchema } from '@breeyo/validators';
import { ConflictSeverity, ResolutionState } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import { classifyClinicalConflict } from './clinicalConflict.service.js';

/** Wire contract with `apps/mobile/src/features/consultation/services/offlineConsultationDraftStore.ts`. */
export const EMR_SYNC_DOMAIN = 'emr';
export const CONSULTATION_DRAFT_ENTITY_TYPE = 'CONSULTATION_DRAFT_SAVE';

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
}

/** Same `SyncReplayReceipt` idempotency ledger every other domain adapter
 *  reads/writes (Plan 10-01's shared table) -- not a second ledger. */
export interface ConsultationReplayReceiptStore {
  findUnique(args: {
    where: { clinicId_deviceId_operationId: { clinicId: string; deviceId: string; operationId: string } };
  }): Promise<{ operationId: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ operationId: string }>;
}

/** Backed by the same `SyncConflictRecord` table the shared replay ingress
 *  and `queueOfflineReplay.service.ts` use, created here with
 *  `severity: SAFETY_CRITICAL` (D-06) instead of `OPERATIONAL`. */
export interface ClinicalConflictRecordStore {
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
}

export interface ConsultationOfflineReplayContext {
  clinicId: string;
  userId: string;
  deviceId: string;
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

    const serverDraft = (await this.gateway.loadDraft(consultation.id)) ?? EMPTY_DRAFT;

    const classification = classifyClinicalConflict({
      baseline,
      local: draft,
      server: serverDraft,
      assignedClinicianId: consultation.vetId,
    });

    if (classification.hasConflict) {
      const conflictId = await this.createConflictRecord(context, {
        operationId: envelope.operationId,
        consultationId: consultation.id,
        localPayload: draft,
        serverPayload: serverDraft,
        ownerUserId: classification.recommendedOwnerUserId!,
      });
      // A receipt is still recorded so a flapping resend of THIS operationId
      // resolves as an idempotent no-op instead of creating a second
      // conflict record for the same offline edit.
      await this.recordReceipt(context, envelope.operationId, consultation.id);
      return {
        operationId: envelope.operationId,
        status: 'CONFLICT_CREATED',
        consultationId: consultation.id,
        conflictId,
      };
    }

    if (classification.safeMergeFields.length > 0) {
      // D-07: only clearly non-destructive fields ever reach here --
      // classifyClinicalConflict already excluded anything the server also
      // touched from `mergedPayload`'s applied set.
      await this.gateway.saveDraft(consultation.id, context.clinicId, classification.mergedPayload);
    }

    await this.recordReceipt(context, envelope.operationId, consultation.id);
    return { operationId: envelope.operationId, status: 'APPLIED', consultationId: consultation.id };
  }

  private async recordReceipt(
    context: ConsultationOfflineReplayContext,
    operationId: string,
    consultationId: string,
  ): Promise<void> {
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
  }

  private async createConflictRecord(
    context: ConsultationOfflineReplayContext,
    input: {
      operationId: string;
      consultationId: string;
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
