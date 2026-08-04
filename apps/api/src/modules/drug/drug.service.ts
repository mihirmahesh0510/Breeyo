import type { DrugRepository } from './drug.repository.js';

export class DrugService {
  constructor(private readonly repository: DrugRepository) {}

  async searchDrugs(query: string, limit = 20) {
    return this.repository.searchDrugs(query, limit);
  }

  async getAllDrugs() {
    return this.repository.getAllDrugs();
  }

  async getDosageRange(drugId: string, species: string) {
    return this.repository.getDrugWithDosage(drugId, species);
  }
}
