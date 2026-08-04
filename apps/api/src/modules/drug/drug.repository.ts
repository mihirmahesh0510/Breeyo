import type { PrismaClient } from '@prisma/client';

export class DrugRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async searchDrugs(query: string, limit = 20) {
    return this.prisma.drug.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { genericName: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { formulations: true, dosageRanges: true },
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  async getAllDrugs() {
    return this.prisma.drug.findMany({
      where: { isActive: true },
      include: { formulations: true, dosageRanges: true },
      orderBy: { name: 'asc' },
    });
  }

  async getDrugWithDosage(drugId: string, species: string) {
    return this.prisma.drug.findUnique({
      where: { id: drugId },
      include: {
        formulations: true,
        dosageRanges: { where: { species } },
      },
    });
  }
}
