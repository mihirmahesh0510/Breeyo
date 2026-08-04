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

export class EmrService {
  constructor(
    private readonly repository: EmrRepository,
    private readonly lockService: ConsultationLockService,
    private readonly dosageService: DosageService,
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
      const consultation = await this.repository.getConsultation(consultationId, clinicId);
      if (consultation) {
        await this.repository.updatePetWeight(consultation.petId, parsed.vitals.weightKg);
      }
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

    return finalized;
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

    return this.repository.addAddendum(consultationId, addendum);
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
