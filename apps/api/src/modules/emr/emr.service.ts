import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  createConsultationSchema,
  saveDraftSchema,
  finalizeConsultationSchema,
  addendumSchema,
} from '@breeyo/validators';
import type {
  CreateConsultationInput,
  SaveDraftInput,
  FinalizeInput,
  SpeciesDosage,
  PrescriptionItem,
} from '@breeyo/types';
import type { EmrRepository } from './emr.repository.js';
import type { ConsultationLockService } from './consultation-lock.service.js';
import type { DosageService } from './dosage.service.js';
import type { InvoiceService } from '../billing/invoice.service.js';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';

/**
 * The actor name recorded against the D-03 draft-invoice hook.
 *
 * `finalize` is handed a `vetId` but no display name, and `BillingActor`
 * requires one. On this path the name is never persisted: the only consumer of
 * `BillingActor.userName` is `StockValidatorService.reserveAndDeduct`, and
 * seeding a draft deducts nothing — the stock already moved when the clinician
 * dispensed. Fetching the user row purely to fill a field nobody reads would
 * add a query to the finalize hot path, so a constant is used and the reason
 * recorded here.
 */
const END_CONSULTATION_ACTOR_NAME = 'End Consultation (system)';

export class EmrService {
  constructor(
    private readonly repository: EmrRepository,
    private readonly lockService: ConsultationLockService,
    private readonly dosageService: DosageService,
    private readonly prisma: TenantPrismaClient,
    /**
     * D-03's draft-invoice collaborator. Optional on purpose: the EMR unit
     * suites construct this service with four arguments and are not exercising
     * billing at all. A null service means the draft hook is disabled, which is
     * the correct behaviour for those tests — and, because the hook is
     * best-effort anyway, an unwired service degrades exactly as a failing one
     * does rather than breaking the clinical path.
     */
    private readonly invoiceService?: InvoiceService,
  ) {}

  /**
   * Creates a new consultation and acquires a lock.
   * D-06: Rejects if pet already has an active (draft) consultation.
   */
  async createConsultation(
    clinicId: string,
    petId: string,
    vetId: string,
    vetName: string,
    input: CreateConsultationInput,
  ) {
    const parsed = createConsultationSchema.parse(input);

    // D-06: Check for active consultation
    const existing = await this.repository.findActiveConsultation(clinicId, parsed.petId);
    if (existing) {
      const lockStatus = await this.lockService.isLocked(existing.id);
      const error = new Error(
        `Pet already has an active consultation${lockStatus.locked ? ` (locked by ${lockStatus.vetName})` : ''}`,
      ) as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ACTIVE_CONSULTATION_EXISTS';
      throw error;
    }

    const consultation = await this.repository.createConsultation(
      clinicId,
      parsed.petId,
      vetId,
      parsed.queueEntryId ?? null,
      parsed.visitType,
    );

    // Acquire lock
    await this.lockService.acquireLock(consultation.id, vetId, vetName);

    return consultation;
  }

  /**
   * Saves draft data without audit trail overhead.
   * D-05: Auto-save drafts as vet types.
   * D-69: Weight updates immediately on auto-save.
   */
  async saveDraft(
    consultationId: string,
    clinicId: string,
    vetId: string,
    data: SaveDraftInput,
  ) {
    const parsed = saveDraftSchema.parse(data);

    // Security: verify the consultation belongs to the caller's clinic before
    // touching the lock or draft — otherwise a caller from another clinic with
    // a valid consultationId could read/overwrite another clinic's draft.
    const consultation = await this.repository.getConsultation(consultationId, clinicId);
    if (!consultation) {
      const error = new Error('Consultation not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'CONSULTATION_NOT_FOUND';
      throw error;
    }

    // Verify lock is held by this vet
    const lockStatus = await this.lockService.isLocked(consultationId);
    if (lockStatus.locked && lockStatus.vetName) {
      // Lock exists — check if it's this vet's lock via heartbeat
      const heartbeatOk = await this.lockService.heartbeat(consultationId, vetId);
      if (!heartbeatOk) {
        const error = new Error('Consultation is locked by another vet') as Error & { statusCode: number; code: string };
        error.statusCode = 423;
        error.code = 'CONSULTATION_LOCKED';
        throw error;
      }
    }

    await this.repository.saveDraft(consultationId, clinicId, parsed);

    // D-69: Immediately update pet weight if vitals.weightKg changed
    if (parsed.vitals?.weightKg != null) {
      await this.repository.updatePetWeight(consultation.petId, parsed.vitals.weightKg);
    }
  }

  /**
   * Finalizes a consultation: locks record, sets duration, updates queue status.
   * D-04: End Consultation marks queue entry as Done.
   * D-13/D-70: Records start/end timestamps and calculates duration.
   * D-14: Auto-updates pet weight from vitals.
   */
  async finalize(
    consultationId: string,
    clinicId: string,
    vetId: string,
    input?: FinalizeInput,
  ) {
    const parsed = input ? finalizeConsultationSchema.parse(input) : {};

    // Load the consultation to get startedAt and queueEntryId
    const consultation = await this.repository.getConsultation(consultationId, clinicId);
    if (!consultation) {
      const error = new Error('Consultation not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'CONSULTATION_NOT_FOUND';
      throw error;
    }

    if (consultation.status === 'finalized') {
      const error = new Error('Consultation is already finalized') as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ALREADY_FINALIZED';
      throw error;
    }

    // Load draft data
    const draftData = await this.repository.loadDraft(consultationId) as any;

    // D-28: Audit any dosage warnings the vet overrode before finalizing
    await this.auditDosageOverrides(consultationId, clinicId, vetId, consultation, draftData);

    // D-13/D-70: Calculate duration
    const durationMinutes = Math.round(
      (Date.now() - new Date(consultation.startedAt).getTime()) / 60000,
    );

    // Finalize in transaction
    const finalized = await this.repository.finalizeConsultation(
      consultationId,
      clinicId,
      draftData ?? {},
      durationMinutes,
      parsed.followUpDate,
      parsed.followUpReason,
    );

    // D-14: Auto-update pet weight from vitals
    if (draftData?.vitals?.weightKg != null) {
      await this.repository.updatePetWeight(consultation.petId, draftData.vitals.weightKg);
    }

    // D-04: Update queue entry to DONE if linked
    if (consultation.queueEntryId) {
      await this.repository.updateQueueEntryStatus(
        consultation.queueEntryId,
        'DONE',
        new Date(),
      );
    }

    // Release lock
    await this.lockService.releaseLock(consultationId, vetId);

    // D-03: seed the draft invoice the front desk will collect against.
    await this.seedDraftInvoice(clinicId, consultationId, vetId);

    // EMR-07 / D-62: Audit trail for consultation finalization
    await writeAuditLog(this.prisma, AuditEvent.CONSULTATION_FINALIZED, {
      userId: vetId,
      clinicId,
      metadata: {
        consultationId,
        petId: consultation.petId,
        visitType: consultation.visitType,
      },
    });

    return finalized;
  }

  /**
   * D-03: creates the draft invoice for a consultation that has just been
   * finalized, pre-populated with everything the clinician dispensed.
   *
   * ## Why this is not a permission-checked call
   *
   * The trigger is a Clinician ending a consultation, and D-05 deliberately
   * does NOT grant the Clinician role `CREATE_INVOICES` — only Front Desk and
   * Admin hold it. This is therefore a server-initiated internal service call
   * with no HTTP surface and no authorization check. The *gated* surface onto
   * the same method is `POST /billing/invoices/from-consultation/:consultationId`,
   * which the Front Desk uses from the D-06 picker and which `billing.routes.ts`
   * puts behind `CREATE_INVOICES`.
   *
   * Conflating the two breaks one decision or the other: routing this through
   * the HTTP endpoint would 403 the exact role D-03 depends on, and gating
   * `InvoiceService.createDraftFromConsultation` itself would break the phase's
   * primary invoice-creation flow.
   *
   * ## Why it is best-effort
   *
   * A billing failure must never prevent a vet from closing a medical record
   * (T-06-84), so this sits outside the repository's finalize transaction and
   * swallows nothing quietly. It runs after the queue-entry update — so a draft
   * can never exist for a consultation that failed to finalize — and before the
   * `CONSULTATION_FINALIZED` audit write, which keeps finalize one logical
   * operation.
   *
   * Idempotency is the service's own: `createDraftFromConsultation` reads the
   * existing draft first and catches `P2002` from the
   * `invoices_one_draft_per_consultation` partial unique index, so a retried
   * End Consultation returns the first draft rather than seeding a second.
   */
  private async seedDraftInvoice(
    clinicId: string,
    consultationId: string,
    vetId: string,
  ): Promise<void> {
    if (!this.invoiceService) return;

    try {
      await this.invoiceService.createDraftFromConsultation(clinicId, consultationId, {
        userId: vetId,
        userName: END_CONSULTATION_ACTOR_NAME,
      });
    } catch (err) {
      // Matches the dosage-override precedent below rather than introducing a
      // second best-effort idiom. `EmrService` holds no logger reference, and
      // adding one for this single call would leave the two side effects in the
      // same method reporting failures two different ways; the summary records
      // migrating both to the Fastify logger as a follow-up.
      console.error(
        `[EmrService] D-03 draft invoice creation failed for consultation ${consultationId}`,
        err,
      );
    }
  }

  /**
   * Best-effort audit of D-28 dosage warning overrides: for each prescribed item
   * with a known drug and dose, checks it against the species dosage range and
   * writes a PRESCRIPTION_DOSAGE_OVERRIDDEN entry when the vet's entered dose
   * was outside the recommended range. Never blocks finalize.
   */
  private async auditDosageOverrides(
    consultationId: string,
    clinicId: string,
    vetId: string,
    consultation: { pet: { species: string; weight: number | null } },
    draftData: any,
  ): Promise<void> {
    const prescriptions: PrescriptionItem[] = draftData?.prescriptions ?? [];
    if (prescriptions.length === 0) return;

    try {
      for (const item of prescriptions) {
        if (!item.drugId || item.dosageMg == null) continue;

        // Only skip when the drug/species dosage row genuinely doesn't exist —
        // any other failure below propagates to the outer catch.
        const speciesDosage = await this.prisma.speciesDosage.findFirst({
          where: { drugId: item.drugId, species: consultation.pet.species },
        });
        if (!speciesDosage) continue;

        const petWeightKg = draftData?.vitals?.weightKg ?? consultation.pet.weight;
        if (!petWeightKg) continue;

        const warning = this.dosageService.validateDosage(item.dosageMg, petWeightKg, {
          id: speciesDosage.id,
          drugId: speciesDosage.drugId,
          species: speciesDosage.species,
          minDoseMgPerKg: Number(speciesDosage.minDoseMgPerKg),
          maxDoseMgPerKg: Number(speciesDosage.maxDoseMgPerKg),
          isFixedDose: speciesDosage.isFixedDose,
          fixedDoseMin: speciesDosage.fixedDoseMin != null ? Number(speciesDosage.fixedDoseMin) : null,
          fixedDoseMax: speciesDosage.fixedDoseMax != null ? Number(speciesDosage.fixedDoseMax) : null,
          notes: speciesDosage.notes,
        });

        if (warning) {
          await writeAuditLog(this.prisma, AuditEvent.PRESCRIPTION_DOSAGE_OVERRIDDEN, {
            userId: vetId,
            clinicId,
            metadata: {
              consultationId,
              drugName: item.drugName,
              enteredDoseMg: item.dosageMg,
              recommendedRange: `${warning.recommendedMinMg}-${warning.recommendedMaxMg}mg`,
            },
          });
        }
      }
    } catch (err) {
      // Best-effort: never block finalize on the dosage-override audit. Surface
      // the failure via the logger instead of swallowing it outright.
      console.error('[EmrService] dosage override audit failed', err);
    }
  }

  /**
   * Adds an addendum to a finalized consultation.
   * Post-finalization edits are addendum-only.
   */
  async addAddendum(
    consultationId: string,
    clinicId: string,
    vetId: string,
    vetName: string,
    text: string,
  ) {
    const parsed = addendumSchema.parse({ text });

    // Verify consultation is finalized
    const consultation = await this.repository.getConsultation(consultationId, clinicId);
    if (!consultation) {
      const error = new Error('Consultation not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'CONSULTATION_NOT_FOUND';
      throw error;
    }

    if (consultation.status !== 'finalized') {
      const error = new Error('Addenda can only be added to finalized consultations') as Error & { statusCode: number; code: string };
      error.statusCode = 400;
      error.code = 'NOT_FINALIZED';
      throw error;
    }

    const addendum = {
      id: crypto.randomUUID(),
      text: parsed.text,
      addedBy: vetId,
      addedByName: vetName,
      addedAt: new Date(),
    };

    const result = await this.repository.addAddendum(consultationId, addendum);

    // EMR-07 / D-62: Audit trail for addenda
    await writeAuditLog(this.prisma, AuditEvent.ADDENDUM_ADDED, {
      userId: vetId,
      clinicId,
      metadata: {
        consultationId,
        addendumId: addendum.id,
      },
    });

    return result;
  }

  /**
   * Returns the in-progress draft view of a consultation: the consultation row
   * with its SOAP/vitals/prescriptions fields overridden by the live draft data
   * (ConsultationDraft.data) while the consultation is still in `draft` status.
   * Falls back to the consultation row's own values once finalized (no draft
   * row exists anymore at that point).
   */
  async getDraftData(consultationId: string, clinicId: string) {
    const consultation = await this.repository.getConsultation(consultationId, clinicId);
    if (!consultation) {
      const error = new Error('Consultation not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'CONSULTATION_NOT_FOUND';
      throw error;
    }

    if (consultation.status !== 'draft') {
      return consultation;
    }

    const draftData = await this.repository.loadDraft(consultationId) as any;
    if (!draftData) {
      return consultation;
    }

    return {
      ...consultation,
      vitals: draftData.vitals ?? consultation.vitals,
      subjective: draftData.subjective ?? consultation.subjective,
      objective: draftData.objective ?? consultation.objective,
      assessment: draftData.assessment ?? consultation.assessment,
      plan: draftData.plan ?? consultation.plan,
      careInstructions: draftData.careInstructions ?? consultation.careInstructions,
      referral: draftData.referral ?? consultation.referral,
      rxNotes: draftData.rxNotes ?? consultation.rxNotes,
      prescriptions: draftData.prescriptions ?? consultation.prescriptions,
    };
  }

  /**
   * Returns full consultation with vitals, prescriptions, attachments.
   */
  async getConsultation(consultationId: string, clinicId: string) {
    return this.repository.getConsultation(consultationId, clinicId);
  }

  /**
   * Returns consultation history for a pet, ordered newest first.
   * EMR-04: Complete medical history timeline.
   */
  async getHistory(clinicId: string, petId: string, limit = 50) {
    const results = await this.repository.getHistory(clinicId, petId, limit);

    return results.map((r) => ({
      id: r.id,
      visitType: r.visitType,
      status: r.status,
      startedAt: r.startedAt,
      finalizedAt: r.finalizedAt,
      durationMinutes: r.durationMinutes,
      assessment: r.assessment,
      vetId: r.vetId,
      vetName: r.vet.fullName,
      prescriptionCount: r._count.prescriptions,
      attachmentCount: r._count.attachments,
    }));
  }

  /**
   * Renews the consultation lock heartbeat.
   */
  async heartbeat(consultationId: string, vetId: string) {
    return this.lockService.heartbeat(consultationId, vetId);
  }

  /**
   * Validates a prescription dosage against species-specific ranges.
   * D-28: Soft dosage warning.
   */
  validatePrescriptionDosage(
    enteredDoseMg: number,
    petWeightKg: number,
    speciesDosage: SpeciesDosage,
  ) {
    return this.dosageService.validateDosage(enteredDoseMg, petWeightKg, speciesDosage);
  }

  /**
   * Generates owner-friendly prescription instructions.
   * D-35: Both clinical + owner-friendly dosage language.
   */
  generateOwnerInstructions(prescription: PrescriptionItem) {
    return this.dosageService.generateOwnerInstructions(prescription);
  }
}
