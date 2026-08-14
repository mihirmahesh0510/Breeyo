import type { DbClient } from '../../lib/prisma-rls.js';

export class DrugRepository {
  constructor(private readonly prisma: DbClient) {}

  /**
   * Drugs are either global (clinicId null, shared seed data) or
   * clinic-owned. Every query is scoped to global rows plus the
   * caller's own clinic so custom drugs don't leak across tenants.
   */
  async searchDrugs(clinicId: string, query: string, limit = 20) {
    return this.prisma.drug.findMany({
      where: {
        isActive: true,
        OR: [{ clinicId: null }, { clinicId }],
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { genericName: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: { formulations: true, dosageRanges: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  async getAllDrugs(clinicId: string) {
    return this.prisma.drug.findMany({
      where: { isActive: true, OR: [{ clinicId: null }, { clinicId }] },
      include: { formulations: true, dosageRanges: true },
      orderBy: { name: 'asc' },
    });
  }

  async getDrugWithDosage(clinicId: string, drugId: string, species: string) {
    return this.prisma.drug.findFirst({
      where: { id: drugId, OR: [{ clinicId: null }, { clinicId }] },
      include: {
        formulations: true,
        dosageRanges: { where: { species } },
      },
    });
  }
}
