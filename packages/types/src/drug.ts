export type DrugCategory = 'antibiotic' | 'nsaid' | 'antiparasitic' | 'vaccine' | 'antifungal' | 'corticosteroid' | 'antiemetic' | 'cardiac' | 'supplement' | 'other';
export type FormulationType = 'tablet' | 'suspension' | 'injectable' | 'drops' | 'ointment' | 'powder' | 'capsule' | 'spray';
export type RouteOfAdmin = 'Oral' | 'Injectable (IV)' | 'Injectable (IM)' | 'Injectable (SC)' | 'Topical' | 'Eye Drops' | 'Ear Drops' | 'Inhalation' | 'Rectal';

export interface DrugEntry {
  id: string;
  name: string;
  genericName: string;
  category: DrugCategory;
  isActive: boolean;
  formulations: DrugFormulation[];
  dosageRanges: SpeciesDosage[];
}

export interface DrugFormulation {
  id: string;
  drugId: string;
  form: FormulationType;
  strength: string;
  strengthValue: number;
  strengthUnit: string;
}

export interface SpeciesDosage {
  id: string;
  drugId: string;
  species: string;
  minDoseMgPerKg: number;
  maxDoseMgPerKg: number;
  isFixedDose: boolean;
  fixedDoseMin: number | null;
  fixedDoseMax: number | null;
  notes: string | null;
}

export interface PrescriptionItem {
  id?: string;
  drugId: string | null;
  drugName: string;
  formulationId: string | null;
  formulation: string;
  strength: string;
  dosage: string;
  dosageMg: number | null;
  route: RouteOfAdmin;
  frequency: string;
  duration: string;
  durationDays: number | null;
  clinicalInstructions: string | null;
  ownerInstructions: string | null;
  dispensed: boolean;
  inventoryItemId: string | null;
  sortOrder: number;
}

export interface DosageWarning {
  level: 'warning';
  message: string;
  enteredDose: number;
  enteredDosePerKg?: number;
  recommendedMinMg: number;
  recommendedMaxMg: number;
}

export interface DrugSearchResult {
  id: string;
  name: string;
  genericName: string;
  category: DrugCategory;
  formulations: DrugFormulation[];
}
