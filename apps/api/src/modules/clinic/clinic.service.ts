import type { PrismaClient } from '@prisma/client';

export class ClinicService {
  constructor(private readonly prisma: PrismaClient) {}

  async getClinic(clinicId: string) {
    return this.prisma.clinic.findUniqueOrThrow({ where: { id: clinicId } });
  }

  async updateProfile(
    clinicId: string,
    data: {
      name?: string;
      address?: string;
      contactPhone?: string;
      city?: string;
      gstin?: string;
    },
  ) {
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data,
    });
  }

  async updateWorkingHours(clinicId: string, hours: Record<string, unknown>) {
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: { workingHours: hours },
    });
  }

  async completeWizard(clinicId: string) {
    const clinic = await this.prisma.clinic.findUniqueOrThrow({
      where: { id: clinicId },
    });

    // Idempotent: if already completed, return existing record
    if (clinic.wizardCompletedAt) {
      return clinic;
    }

    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: { wizardCompletedAt: new Date() },
    });
  }
}
