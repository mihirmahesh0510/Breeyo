import type { PreventiveCareStatus } from '@breeyo/types';
import { calculateNextDueDate, DEWORMING_INTERVALS } from '@breeyo/types';
import type { VaccinationRepository } from './vaccination.repository.js';

export class VaccinationService {
  constructor(private readonly repository: VaccinationRepository) {}

  async createVaccination(
    clinicId: string,
    petId: string,
    consultationId: string | null,
    petSpecies: string,
    petAgeDays: number,
    data: {
      vaccineName: string;
      batchNumber?: string | null;
      manufacturer?: string | null;
      expiryDate?: Date | null;
      administeredBy: string;
      nextDueDate?: Date | null;
    },
  ) {
    let nextDueDate = data.nextDueDate ?? null;

    if (!nextDueDate) {
      nextDueDate = calculateNextDueDate(
        data.vaccineName,
        petSpecies,
        petAgeDays,
        new Date(),
      );
    }

    return this.repository.createVaccination(clinicId, petId, consultationId, {
      vaccineName: data.vaccineName,
      batchNumber: data.batchNumber,
      manufacturer: data.manufacturer,
      expiryDate: data.expiryDate,
      administeredBy: data.administeredBy,
      nextDueDate,
    });
  }

  async createDeworming(
    clinicId: string,
    petId: string,
    consultationId: string | null,
    _petSpecies: string,
    petAgeDays: number,
    data: {
      drugName: string;
      administeredBy: string;
      nextDueDate?: Date | null;
    },
  ) {
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

    return this.repository.createDeworming(clinicId, petId, consultationId, {
      drugName: data.drugName,
      administeredBy: data.administeredBy,
      nextDueDate,
    });
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
