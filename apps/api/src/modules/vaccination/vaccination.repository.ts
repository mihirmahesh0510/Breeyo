import type { DbClient } from '../../lib/prisma-rls.js';

export class VaccinationRepository {
  constructor(private readonly prisma: DbClient) {}

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
      nextDueDate: Date | null;
    },
  ) {
    return this.prisma.vaccinationRecord.create({
      data: {
        clinicId,
        petId,
        consultationId,
        vaccineName: data.vaccineName,
        batchNumber: data.batchNumber ?? null,
        manufacturer: data.manufacturer ?? null,
        expiryDate: data.expiryDate ?? null,
        administeredAt: new Date(),
        administeredBy: data.administeredBy,
        nextDueDate: data.nextDueDate,
      },
    });
  }

  async createDeworming(
    clinicId: string,
    petId: string,
    consultationId: string | null,
    data: {
      drugName: string;
      administeredBy: string;
      nextDueDate: Date | null;
    },
  ) {
    return this.prisma.dewormingRecord.create({
      data: {
        clinicId,
        petId,
        consultationId,
        drugName: data.drugName,
        administeredAt: new Date(),
        administeredBy: data.administeredBy,
        nextDueDate: data.nextDueDate,
      },
    });
  }

  async getVaccinationRecords(clinicId: string, petId: string) {
    return this.prisma.vaccinationRecord.findMany({
      where: { clinicId, petId },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async getDewormingRecords(clinicId: string, petId: string) {
    return this.prisma.dewormingRecord.findMany({
      where: { clinicId, petId },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async getLatestVaccinationByName(clinicId: string, petId: string, vaccineName: string) {
    return this.prisma.vaccinationRecord.findFirst({
      where: { clinicId, petId, vaccineName },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async getLatestDeworming(clinicId: string, petId: string) {
    return this.prisma.dewormingRecord.findFirst({
      where: { clinicId, petId },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async getOverdueVaccinations(clinicId: string, petId: string) {
    const now = new Date();
    const records = await this.prisma.vaccinationRecord.findMany({
      where: {
        clinicId,
        petId,
        nextDueDate: { lt: now },
      },
      select: { vaccineName: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    });
    return records;
  }

  async getDueSoonVaccinations(clinicId: string, petId: string, withinDays = 7) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);

    const records = await this.prisma.vaccinationRecord.findMany({
      where: {
        clinicId,
        petId,
        nextDueDate: { gte: now, lte: threshold },
      },
      select: { vaccineName: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    });
    return records;
  }

  async getVaccinationById(id: string) {
    return this.prisma.vaccinationRecord.findUnique({
      where: { id },
      include: {
        pet: { include: { owner: true } },
        clinic: true,
      },
    });
  }
}
