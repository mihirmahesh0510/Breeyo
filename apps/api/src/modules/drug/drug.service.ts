import type { DrugRepository } from './drug.repository.js';

export class DrugService {
  constructor(private readonly repository: DrugRepository) {}

  async searchDrugs(clinicId: string, query: string, limit = 20) {
    return this.repository.searchDrugs(clinicId, query, limit);
  }

  async getAllDrugs(clinicId: string) {
    return this.repository.getAllDrugs(clinicId);
  }

  async getDosageRange(clinicId: string, drugId: string, species: string) {
    return this.repository.getDrugWithDosage(clinicId, drugId, species);
  }
}
