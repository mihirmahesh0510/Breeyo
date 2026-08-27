import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { SaveDraftInput, AddendumEntry } from '@breeyo/types';

export class EmrRepository {
  // TenantPrismaClient rather than the `DbClient` union: this repository uses
  // the interactive `$transaction(async (tx) => ...)` overload, which does not
  // resolve through a union. It is only ever constructed per request.
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * Creates a new consultation in draft state.
   */
  async createConsultation(
    clinicId: string,
    petId: string,
    vetId: string,
    queueEntryId: string | null,
    visitType: string,
  ) {
    return this.prisma.consultation.create({
      data: {
        clinicId,
        petId,
        vetId,
        queueEntryId,
        visitType,
        status: 'draft',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Finds a pet within the calling clinic.
   *
   * AC-4 (access-control audit): `createConsultation` took `clinicId` and
   * `petId` as independent parameters and never checked the referenced pet
   * actually belongs to that clinic before creating the `Consultation` row —
   * RLS protects the row being written (`Consultation.clinicId`), not a
   * foreign-key target in another table (`Pet.clinicId`). Mirrors
   * `QueueRepository.findPetInClinic`'s exact shape (D-30 defence in depth:
   * an explicit clinicId filter that fails cleanly with a 404 rather than
   * surfacing a constraint error).
   */
  async findPetInClinic(clinicId: string, petId: string) {
    return this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
      select: { id: true },
    });
  }

  /**
   * Finds an active (draft) consultation for a pet at a clinic.
   * D-06: One active consultation per patient at a time.
   */
  async findActiveConsultation(clinicId: string, petId: string) {
    return this.prisma.consultation.findFirst({
      where: { clinicId, petId, status: 'draft' },
    });
  }

  /**
   * Saves draft data to the ConsultationDraft table (not Consultation).
   * No audit triggers on drafts (Pitfall 7).
   */
  async saveDraft(
    consultationId: string,
    clinicId: string,
    data: SaveDraftInput,
  ) {
    return this.prisma.consultationDraft.upsert({
      where: { consultationId },
      create: {
        consultationId,
        clinicId,
        data: data as any,
      },
      update: {
        data: data as any,
      },
    });
  }

  /**
   * Loads the current draft data for a consultation.
   */
  async loadDraft(consultationId: string) {
    const draft = await this.prisma.consultationDraft.findUnique({
      where: { consultationId },
    });
    return draft?.data ?? null;
  }

  /**
   * Finalizes a consultation in a transaction:
   * 1. Updates Consultation with all draft data
   * 2. Upserts Vitals
   * 3. Replaces Prescriptions
   * 4. Deletes ConsultationDraft
   */
  async finalizeConsultation(
    consultationId: string,
    clinicId: string,
    draftData: any,
    durationMinutes: number,
    followUpDate?: string,
    followUpReason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Update consultation with draft data
      const consultation = await tx.consultation.update({
        where: { id: consultationId },
        data: {
          status: 'finalized',
          finalizedAt: new Date(),
          durationMinutes,
          subjective: draftData.subjective ?? undefined,
          objective: draftData.objective ?? undefined,
          assessment: draftData.assessment ?? undefined,
          plan: draftData.plan ?? undefined,
          careInstructions: draftData.careInstructions ?? undefined,
          referral: draftData.referral ?? undefined,
          rxNotes: draftData.rxNotes ?? undefined,
          followUpDate: followUpDate ? new Date(followUpDate) : undefined,
          followUpReason: followUpReason ?? undefined,
        },
      });

      // Upsert vitals if present
      if (draftData.vitals) {
        await tx.vitals.upsert({
          where: { consultationId },
          create: {
            consultationId,
            weightKg: draftData.vitals.weightKg,
            temperatureC: draftData.vitals.temperatureC,
            heartRateBpm: draftData.vitals.heartRateBpm,
            respiratoryRate: draftData.vitals.respiratoryRate,
          },
          update: {
            weightKg: draftData.vitals.weightKg,
            temperatureC: draftData.vitals.temperatureC,
            heartRateBpm: draftData.vitals.heartRateBpm,
            respiratoryRate: draftData.vitals.respiratoryRate,
          },
        });
      }

      // Replace prescriptions if present
      if (draftData.prescriptions?.length > 0) {
        await tx.prescription.deleteMany({ where: { consultationId } });
        await tx.prescription.createMany({
          data: draftData.prescriptions.map((rx: any, index: number) => ({
            consultationId,
            drugId: rx.drugId || null,
            drugName: rx.drugName,
            formulationId: rx.formulationId || null,
            formulation: rx.formulation,
            strength: rx.strength,
            dosage: rx.dosage,
            dosageMg: rx.dosageMg || null,
            route: rx.route,
            frequency: rx.frequency,
            duration: rx.duration,
            durationDays: rx.durationDays || null,
            clinicalInstructions: rx.clinicalInstructions || null,
            ownerInstructions: rx.ownerInstructions || null,
            dispensed: rx.dispensed ?? false,
            inventoryItemId: rx.inventoryItemId || null,
            sortOrder: rx.sortOrder ?? index,
          })),
        });
      }

      // Delete draft record
      await tx.consultationDraft.deleteMany({
        where: { consultationId },
      });

      return consultation;
    });
  }

  /**
   * Updates the pet's weight from vitals.
   * D-14/D-69: Auto-update pet profile weight.
   */
  async updatePetWeight(petId: string, weightKg: number) {
    await this.prisma.pet.update({
      where: { id: petId },
      data: { weight: weightKg },
    });
  }

  /**
   * Updates a queue entry status to DONE with completedAt timestamp.
   * D-04: End Consultation marks queue entry as Done.
   */
  async updateQueueEntryStatus(
    queueEntryId: string,
    status: string,
    completedAt: Date,
  ) {
    await this.prisma.queueEntry.update({
      where: { id: queueEntryId },
      data: { status: status as any, completedAt },
    });
  }

  /**
   * Returns full consultation with vitals, prescriptions, and attachments.
   */
  async getConsultation(consultationId: string, clinicId: string) {
    return this.prisma.consultation.findFirst({
      where: { id: consultationId, clinicId },
      include: {
        vitals: true,
        prescriptions: { orderBy: { sortOrder: 'asc' } },
        attachments: true,
        vet: { select: { id: true, fullName: true, licenseNumber: true } },
        pet: { include: { owner: true } },
      },
    });
  }

  /**
   * Returns consultation summaries for a pet, ordered newest first.
   * Only finalized consultations.
   */
  async getHistory(clinicId: string, petId: string, limit: number) {
    return this.prisma.consultation.findMany({
      where: { clinicId, petId, status: 'finalized' },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        visitType: true,
        status: true,
        startedAt: true,
        finalizedAt: true,
        durationMinutes: true,
        assessment: true,
        vetId: true,
        vet: { select: { fullName: true } },
        _count: {
          select: {
            prescriptions: true,
            attachments: true,
          },
        },
      },
    });
  }

  /**
   * Appends an addendum to a finalized consultation.
   */
  async addAddendum(consultationId: string, addendum: AddendumEntry) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { addenda: true },
    });

    const currentAddenda = (consultation?.addenda as any[]) ?? [];
    const updatedAddenda = [...currentAddenda, addendum];

    return this.prisma.consultation.update({
      where: { id: consultationId },
      data: { addenda: updatedAddenda },
    });
  }

  /**
   * Saves prescriptions for a consultation (delete + recreate).
   */
  async savePrescriptions(consultationId: string, items: any[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.prescription.deleteMany({ where: { consultationId } });
      if (items.length > 0) {
        await tx.prescription.createMany({
          data: items.map((rx, index) => ({
            consultationId,
            drugId: rx.drugId || null,
            drugName: rx.drugName,
            formulationId: rx.formulationId || null,
            formulation: rx.formulation,
            strength: rx.strength,
            dosage: rx.dosage,
            dosageMg: rx.dosageMg || null,
            route: rx.route,
            frequency: rx.frequency,
            duration: rx.duration,
            durationDays: rx.durationDays || null,
            clinicalInstructions: rx.clinicalInstructions || null,
            ownerInstructions: rx.ownerInstructions || null,
            dispensed: rx.dispensed ?? false,
            inventoryItemId: rx.inventoryItemId || null,
            sortOrder: rx.sortOrder ?? index,
          })),
        });
      }
    });
  }
}
