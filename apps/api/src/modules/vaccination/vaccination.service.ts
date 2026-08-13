import type { PrismaClient } from '@prisma/client';
import type { PreventiveCareStatus } from '@breeyo/types';
import { calculateNextDueDate, DEWORMING_INTERVALS } from '@breeyo/types';
import type { VaccinationRepository } from './vaccination.repository.js';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';

function petNotFoundError() {
  const error = new Error('Pet not found at this clinic') as Error & { statusCode: number; code: string };
  error.statusCode = 404;
  error.code = 'PET_NOT_FOUND';
  return error;
}

function petBirthDateMissingError() {
  const error = new Error('Pet is missing birth year/month, required to schedule vaccination/deworming intervals') as Error & { statusCode: number; code: string };
  error.statusCode = 400;
  error.code = 'PET_BIRTH_DATE_MISSING';
  return error;
}

function calculateAgeDays(birthYear: number, birthMonth: number): number {
  const birthDate = new Date(Date.UTC(birthYear, birthMonth - 1, 1));
  return Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
}

export class VaccinationService {
  constructor(
    private readonly repository: VaccinationRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Loads the pet scoped to this clinic and derives species/age from its
   * own record -- never trusts client-supplied species/age, and rejects
   * petIds belonging to another clinic.
   */
  private async getPetForClinic(clinicId: string, petId: string) {
    const pet = await this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
      select: { species: true, birthYear: true, birthMonth: true },
    });

    if (!pet) {
      throw petNotFoundError();
    }
    if (pet.birthYear == null || pet.birthMonth == null) {
      throw petBirthDateMissingError();
    }

    return {
      species: pet.species,
      ageDays: calculateAgeDays(pet.birthYear, pet.birthMonth),
    };
  }

  async createVaccination(
    clinicId: string,
    petId: string,
    consultationId: string | null,
    data: {
      vaccineName: string;
      batchNumber?: string | null;
      manufacturer?: string | null;
      expiryDate?: Date | null;
      administeredBy: string;
      nextDueDate?: Date | null;
    },
  ) {
    const { species: petSpecies, ageDays: petAgeDays } = await this.getPetForClinic(clinicId, petId);

    let nextDueDate = data.nextDueDate ?? null;

    if (!nextDueDate) {
      nextDueDate = calculateNextDueDate(
        data.vaccineName,
        petSpecies,
        petAgeDays,
        new Date(),
      );
    }

    const record = await this.repository.createVaccination(clinicId, petId, consultationId, {
      vaccineName: data.vaccineName,
      batchNumber: data.batchNumber,
      manufacturer: data.manufacturer,
      expiryDate: data.expiryDate,
      administeredBy: data.administeredBy,
      nextDueDate,
    });

    // EMR-07 / D-62: Audit trail for vaccination records
    await writeAuditLog(this.prisma, AuditEvent.VACCINATION_RECORDED, {
      userId: data.administeredBy,
      clinicId,
      metadata: {
        petId,
        vaccineName: data.vaccineName,
        recordId: record.id,
      },
    });

    return record;
  }

  async createDeworming(
    clinicId: string,
    petId: string,
    consultationId: string | null,
    data: {
      drugName: string;
      administeredBy: string;
      nextDueDate?: Date | null;
    },
  ) {
    const { ageDays: petAgeDays } = await this.getPetForClinic(clinicId, petId);

    let nextDueDate = data.nextDueDate ?? null;

    if (!nextDueDate) {
      const now = new Date();
      let intervalDays: number;

      if (petAgeDays < DEWORMING_INTERVALS.puppy.maxAgeDays) {
        intervalDays = DEWORMING_INTERVALS.puppy.intervalDays;
      } else if (petAgeDays < DEWORMING_INTERVALS.kittenPuppy3to6months.maxAgeDays) {
        intervalDays = DEWORMING_INTERVALS.kittenPuppy3to6months.intervalDays;
      } else {
        intervalDays = DEWORMING_INTERVALS.adult.intervalDays;
      }

      nextDueDate = new Date(now);
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
    }

    const record = await this.repository.createDeworming(clinicId, petId, consultationId, {
      drugName: data.drugName,
      administeredBy: data.administeredBy,
      nextDueDate,
    });

    // EMR-07 / D-62: Audit trail for deworming records
    await writeAuditLog(this.prisma, AuditEvent.DEWORMING_RECORDED, {
      userId: data.administeredBy,
      clinicId,
      metadata: {
        petId,
        drugName: data.drugName,
        recordId: record.id,
      },
    });

    return record;
  }

  async getPreventiveCareStatus(
    clinicId: string,
    petId: string,
  ): Promise<PreventiveCareStatus> {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [overdueVax, dueSoonVax, latestDeworming] = await Promise.all([
      this.repository.getOverdueVaccinations(clinicId, petId),
      this.repository.getDueSoonVaccinations(clinicId, petId),
      this.repository.getLatestDeworming(clinicId, petId),
    ]);

    // Vaccination status
    let vaccinationStatus: PreventiveCareStatus['vaccinationStatus'];
    let vaccinationNextDue: Date | null = null;
    const vaccinationOverdueItems: string[] = [];

    if (overdueVax.length > 0) {
      vaccinationStatus = 'overdue';
      vaccinationOverdueItems.push(...overdueVax.map((v) => v.vaccineName));
      vaccinationNextDue = overdueVax[0].nextDueDate;
    } else if (dueSoonVax.length > 0) {
      vaccinationStatus = 'dueSoon';
      vaccinationNextDue = dueSoonVax[0].nextDueDate;
    } else {
      vaccinationStatus = 'upToDate';
    }

    // Deworming status
    let dewormingStatus: PreventiveCareStatus['dewormingStatus'];
    let dewormingNextDue: Date | null = null;

    if (!latestDeworming) {
      dewormingStatus = 'overdue';
    } else if (!latestDeworming.nextDueDate) {
      dewormingStatus = 'upToDate';
    } else if (latestDeworming.nextDueDate < now) {
      dewormingStatus = 'overdue';
      dewormingNextDue = latestDeworming.nextDueDate;
    } else if (latestDeworming.nextDueDate <= sevenDaysFromNow) {
      dewormingStatus = 'dueSoon';
      dewormingNextDue = latestDeworming.nextDueDate;
    } else {
      dewormingStatus = 'upToDate';
      dewormingNextDue = latestDeworming.nextDueDate;
    }

    return {
      vaccinationStatus,
      vaccinationNextDue,
      vaccinationOverdueItems,
      dewormingStatus,
      dewormingNextDue,
    };
  }

  async getVaccinationHistory(clinicId: string, petId: string) {
    return this.repository.getVaccinationRecords(clinicId, petId);
  }

  async getDewormingHistory(clinicId: string, petId: string) {
    return this.repository.getDewormingRecords(clinicId, petId);
  }

  async getCertificateData(clinicId: string, petId: string, vaccinationId: string) {
    const record = await this.repository.getVaccinationById(vaccinationId);

    if (!record) {
      const error = new Error('Vaccination record not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'VACCINATION_NOT_FOUND';
      throw error;
    }

    if (record.clinicId !== clinicId || record.petId !== petId) {
      const error = new Error('Vaccination record not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'VACCINATION_NOT_FOUND';
      throw error;
    }

    return {
      clinic: {
        name: record.clinic.name,
        address: record.clinic.address,
        phone: record.clinic.contactPhone,
        logoUrl: record.clinic.logoUrl,
      },
      pet: {
        name: record.pet.name,
        species: record.pet.species,
        breed: record.pet.breed,
        birthYear: record.pet.birthYear,
        birthMonth: record.pet.birthMonth,
        weight: record.pet.weight,
        microchipId: record.pet.microchipId,
        owner: {
          name: record.pet.owner.name,
          phone: record.pet.owner.mobile,
        },
      },
      vaccine: {
        name: record.vaccineName,
        batchNumber: record.batchNumber,
        manufacturer: record.manufacturer,
        expiryDate: record.expiryDate,
        administeredAt: record.administeredAt,
        nextDueDate: record.nextDueDate,
      },
      vet: {
        id: record.administeredBy,
      },
    };
  }
}
