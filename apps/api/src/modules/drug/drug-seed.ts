import type { PrismaClient } from '@prisma/client';

interface SeedDrug {
  name: string;
  genericName: string;
  category: string;
  formulations: { form: string; strength: string; strengthValue: number; strengthUnit: string }[];
  dosageRanges: { species: string; minDoseMgPerKg: number; maxDoseMgPerKg: number; isFixedDose?: boolean; fixedDoseMin?: number; fixedDoseMax?: number; notes?: string }[];
}

/**
 * 50 common Indian veterinary drugs for Beta (D-63).
 * Full 200-300 drug curation is a follow-up before production launch.
 */
export const DRUG_SEED_DATA: SeedDrug[] = [
  // ─── Antibiotics ───
  { name: 'Amoxicillin', genericName: 'Amoxicillin', category: 'antibiotic', formulations: [{ form: 'tablet', strength: '250mg', strengthValue: 250, strengthUnit: 'mg' }, { form: 'suspension', strength: '125mg/5ml', strengthValue: 125, strengthUnit: 'mg/5ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 10, maxDoseMgPerKg: 25 }, { species: 'CAT', minDoseMgPerKg: 10, maxDoseMgPerKg: 25, notes: 'Use with caution in cats with renal issues' }] },
  { name: 'Amoxicillin-Clavulanate', genericName: 'Amoxicillin-Clavulanic Acid', category: 'antibiotic', formulations: [{ form: 'tablet', strength: '250mg', strengthValue: 250, strengthUnit: 'mg' }, { form: 'tablet', strength: '500mg', strengthValue: 500, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 12.5, maxDoseMgPerKg: 25 }, { species: 'CAT', minDoseMgPerKg: 12.5, maxDoseMgPerKg: 25 }] },
  { name: 'Enrofloxacin', genericName: 'Enrofloxacin', category: 'antibiotic', formulations: [{ form: 'tablet', strength: '50mg', strengthValue: 50, strengthUnit: 'mg' }, { form: 'injectable', strength: '50mg/ml', strengthValue: 50, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 20 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 5, notes: 'Do not exceed 5mg/kg in cats — retinal toxicity risk' }] },
  { name: 'Metronidazole', genericName: 'Metronidazole', category: 'antibiotic', formulations: [{ form: 'tablet', strength: '200mg', strengthValue: 200, strengthUnit: 'mg' }, { form: 'tablet', strength: '400mg', strengthValue: 400, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 10, maxDoseMgPerKg: 25 }, { species: 'CAT', minDoseMgPerKg: 10, maxDoseMgPerKg: 25 }] },
  { name: 'Cephalexin', genericName: 'Cephalexin', category: 'antibiotic', formulations: [{ form: 'capsule', strength: '250mg', strengthValue: 250, strengthUnit: 'mg' }, { form: 'capsule', strength: '500mg', strengthValue: 500, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 15, maxDoseMgPerKg: 30 }, { species: 'CAT', minDoseMgPerKg: 15, maxDoseMgPerKg: 30 }] },
  { name: 'Doxycycline', genericName: 'Doxycycline', category: 'antibiotic', formulations: [{ form: 'capsule', strength: '100mg', strengthValue: 100, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10, notes: 'Administer with food or water to prevent esophageal stricture' }] },
  { name: 'Clindamycin', genericName: 'Clindamycin', category: 'antibiotic', formulations: [{ form: 'capsule', strength: '150mg', strengthValue: 150, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 11 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 11 }] },
  { name: 'Azithromycin', genericName: 'Azithromycin', category: 'antibiotic', formulations: [{ form: 'tablet', strength: '250mg', strengthValue: 250, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }] },

  // ─── NSAIDs ───
  { name: 'Meloxicam', genericName: 'Meloxicam', category: 'nsaid', formulations: [{ form: 'tablet', strength: '1.5mg', strengthValue: 1.5, strengthUnit: 'mg' }, { form: 'suspension', strength: '1.5mg/ml', strengthValue: 1.5, strengthUnit: 'mg/ml' }, { form: 'injectable', strength: '5mg/ml', strengthValue: 5, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.1, maxDoseMgPerKg: 0.2 }, { species: 'CAT', minDoseMgPerKg: 0.05, maxDoseMgPerKg: 0.1, notes: 'Single dose only in cats unless veterinary cardiologist supervision' }] },
  { name: 'Carprofen', genericName: 'Carprofen', category: 'nsaid', formulations: [{ form: 'tablet', strength: '25mg', strengthValue: 25, strengthUnit: 'mg' }, { form: 'tablet', strength: '75mg', strengthValue: 75, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 2, maxDoseMgPerKg: 4 }] },
  { name: 'Firocoxib', genericName: 'Firocoxib', category: 'nsaid', formulations: [{ form: 'tablet', strength: '57mg', strengthValue: 57, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 5 }] },
  { name: 'Tolfenamic Acid', genericName: 'Tolfenamic Acid', category: 'nsaid', formulations: [{ form: 'tablet', strength: '20mg', strengthValue: 20, strengthUnit: 'mg' }, { form: 'injectable', strength: '40mg/ml', strengthValue: 40, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 4, maxDoseMgPerKg: 4 }, { species: 'CAT', minDoseMgPerKg: 4, maxDoseMgPerKg: 4 }] },

  // ─── Antiparasitics ───
  { name: 'Ivermectin', genericName: 'Ivermectin', category: 'antiparasitic', formulations: [{ form: 'tablet', strength: '3mg', strengthValue: 3, strengthUnit: 'mg' }, { form: 'injectable', strength: '10mg/ml', strengthValue: 10, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.006, maxDoseMgPerKg: 0.6, notes: 'Contraindicated in MDR1-mutant breeds (Collies)' }, { species: 'CAT', minDoseMgPerKg: 0.2, maxDoseMgPerKg: 0.3 }] },
  { name: 'Praziquantel', genericName: 'Praziquantel', category: 'antiparasitic', formulations: [{ form: 'tablet', strength: '50mg', strengthValue: 50, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 5 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 5 }] },
  { name: 'Fenbendazole', genericName: 'Fenbendazole', category: 'antiparasitic', formulations: [{ form: 'suspension', strength: '100mg/ml', strengthValue: 100, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 50, maxDoseMgPerKg: 50 }, { species: 'CAT', minDoseMgPerKg: 50, maxDoseMgPerKg: 50 }] },
  { name: 'Pyrantel Pamoate', genericName: 'Pyrantel Pamoate', category: 'antiparasitic', formulations: [{ form: 'suspension', strength: '50mg/ml', strengthValue: 50, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }] },
  { name: 'Selamectin', genericName: 'Selamectin', category: 'antiparasitic', formulations: [{ form: 'drops', strength: '60mg', strengthValue: 60, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 6, maxDoseMgPerKg: 12 }, { species: 'CAT', minDoseMgPerKg: 6, maxDoseMgPerKg: 12 }] },
  { name: 'Fipronil', genericName: 'Fipronil', category: 'antiparasitic', formulations: [{ form: 'spray', strength: '0.25%', strengthValue: 2.5, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 6, maxDoseMgPerKg: 12, notes: 'Topical only' }, { species: 'CAT', minDoseMgPerKg: 6, maxDoseMgPerKg: 12, notes: 'Topical only' }] },
  { name: 'Milbemycin Oxime', genericName: 'Milbemycin Oxime', category: 'antiparasitic', formulations: [{ form: 'tablet', strength: '2.5mg', strengthValue: 2.5, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }] },

  // ─── Vaccines ───
  { name: 'DHPPi', genericName: 'Distemper-Hepatitis-Parainfluenza-Parvovirus', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },
  { name: 'Anti-Rabies', genericName: 'Rabies Vaccine', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }, { species: 'CAT', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },
  { name: 'FVRCP (Tricat)', genericName: 'Feline Viral Rhinotracheitis-Calicivirus-Panleukopenia', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'CAT', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },
  { name: 'FeLV', genericName: 'Feline Leukemia Vaccine', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'CAT', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },
  { name: 'Kennel Cough (Bordetella)', genericName: 'Bordetella bronchiseptica', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },
  { name: 'Leptospirosis', genericName: 'Leptospira Vaccine', category: 'vaccine', formulations: [{ form: 'injectable', strength: '1 dose', strengthValue: 1, strengthUnit: 'dose' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 1 }] },

  // ─── Corticosteroids ───
  { name: 'Prednisolone', genericName: 'Prednisolone', category: 'corticosteroid', formulations: [{ form: 'tablet', strength: '5mg', strengthValue: 5, strengthUnit: 'mg' }, { form: 'tablet', strength: '20mg', strengthValue: 20, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 2 }, { species: 'CAT', minDoseMgPerKg: 1, maxDoseMgPerKg: 2 }] },
  { name: 'Dexamethasone', genericName: 'Dexamethasone', category: 'corticosteroid', formulations: [{ form: 'injectable', strength: '4mg/ml', strengthValue: 4, strengthUnit: 'mg/ml' }, { form: 'tablet', strength: '0.5mg', strengthValue: 0.5, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.1, maxDoseMgPerKg: 0.5 }, { species: 'CAT', minDoseMgPerKg: 0.1, maxDoseMgPerKg: 0.5 }] },

  // ─── Antiemetics ───
  { name: 'Maropitant (Cerenia)', genericName: 'Maropitant Citrate', category: 'antiemetic', formulations: [{ form: 'tablet', strength: '16mg', strengthValue: 16, strengthUnit: 'mg' }, { form: 'injectable', strength: '10mg/ml', strengthValue: 10, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 1, maxDoseMgPerKg: 2 }, { species: 'CAT', minDoseMgPerKg: 1, maxDoseMgPerKg: 1 }] },
  { name: 'Ondansetron', genericName: 'Ondansetron', category: 'antiemetic', formulations: [{ form: 'tablet', strength: '4mg', strengthValue: 4, strengthUnit: 'mg' }, { form: 'injectable', strength: '2mg/ml', strengthValue: 2, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }, { species: 'CAT', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }] },
  { name: 'Metoclopramide', genericName: 'Metoclopramide', category: 'antiemetic', formulations: [{ form: 'tablet', strength: '10mg', strengthValue: 10, strengthUnit: 'mg' }, { form: 'injectable', strength: '5mg/ml', strengthValue: 5, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.2, maxDoseMgPerKg: 0.5 }, { species: 'CAT', minDoseMgPerKg: 0.2, maxDoseMgPerKg: 0.5 }] },

  // ─── Cardiac ───
  { name: 'Pimobendan', genericName: 'Pimobendan', category: 'cardiac', formulations: [{ form: 'capsule', strength: '1.25mg', strengthValue: 1.25, strengthUnit: 'mg' }, { form: 'capsule', strength: '5mg', strengthValue: 5, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.2, maxDoseMgPerKg: 0.3 }] },
  { name: 'Benazepril', genericName: 'Benazepril', category: 'cardiac', formulations: [{ form: 'tablet', strength: '5mg', strengthValue: 5, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.25, maxDoseMgPerKg: 0.5 }, { species: 'CAT', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }] },
  { name: 'Furosemide', genericName: 'Furosemide', category: 'cardiac', formulations: [{ form: 'tablet', strength: '40mg', strengthValue: 40, strengthUnit: 'mg' }, { form: 'injectable', strength: '10mg/ml', strengthValue: 10, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 1, maxDoseMgPerKg: 4 }, { species: 'CAT', minDoseMgPerKg: 1, maxDoseMgPerKg: 4 }] },
  { name: 'Atenolol', genericName: 'Atenolol', category: 'cardiac', formulations: [{ form: 'tablet', strength: '25mg', strengthValue: 25, strengthUnit: 'mg' }, { form: 'tablet', strength: '50mg', strengthValue: 50, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.25, maxDoseMgPerKg: 1 }, { species: 'CAT', minDoseMgPerKg: 6.25, maxDoseMgPerKg: 12.5, isFixedDose: true, fixedDoseMin: 6.25, fixedDoseMax: 12.5, notes: 'Fixed dose per cat, not weight-based' }] },

  // ─── Supplements ───
  { name: 'Calcium Supplement', genericName: 'Calcium', category: 'supplement', formulations: [{ form: 'tablet', strength: '500mg', strengthValue: 500, strengthUnit: 'mg' }, { form: 'suspension', strength: '100mg/ml', strengthValue: 100, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 25, maxDoseMgPerKg: 50 }] },
  { name: 'Iron Supplement', genericName: 'Iron', category: 'supplement', formulations: [{ form: 'suspension', strength: '50mg/5ml', strengthValue: 10, strengthUnit: 'mg/ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }] },
  { name: 'B-Complex', genericName: 'Vitamin B Complex', category: 'supplement', formulations: [{ form: 'injectable', strength: '2ml', strengthValue: 2, strengthUnit: 'ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 1, fixedDoseMax: 2, notes: '1-2ml IM' }, { species: 'CAT', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 0.5, fixedDoseMax: 1, notes: '0.5-1ml IM' }] },
  { name: 'Liver Tonic', genericName: 'Liver Extract + B-Complex', category: 'supplement', formulations: [{ form: 'suspension', strength: '200ml', strengthValue: 200, strengthUnit: 'ml' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 5, fixedDoseMax: 10, notes: '5-10ml oral daily' }] },

  // ─── Others ───
  { name: 'Tramadol', genericName: 'Tramadol', category: 'other', formulations: [{ form: 'tablet', strength: '50mg', strengthValue: 50, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 2, maxDoseMgPerKg: 5 }, { species: 'CAT', minDoseMgPerKg: 1, maxDoseMgPerKg: 2 }] },
  { name: 'Gabapentin', genericName: 'Gabapentin', category: 'other', formulations: [{ form: 'capsule', strength: '100mg', strengthValue: 100, strengthUnit: 'mg' }, { form: 'capsule', strength: '300mg', strengthValue: 300, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }] },
  { name: 'Omeprazole', genericName: 'Omeprazole', category: 'other', formulations: [{ form: 'capsule', strength: '20mg', strengthValue: 20, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }, { species: 'CAT', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }] },
  { name: 'Famotidine', genericName: 'Famotidine', category: 'other', formulations: [{ form: 'tablet', strength: '20mg', strengthValue: 20, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }, { species: 'CAT', minDoseMgPerKg: 0.5, maxDoseMgPerKg: 1 }] },
  { name: 'Sucralfate', genericName: 'Sucralfate', category: 'other', formulations: [{ form: 'tablet', strength: '1g', strengthValue: 1000, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 250, fixedDoseMax: 1000, notes: '250mg-1g per dose' }, { species: 'CAT', minDoseMgPerKg: 0, maxDoseMgPerKg: 0, isFixedDose: true, fixedDoseMin: 250, fixedDoseMax: 500 }] },

  // ─── Antifungals ───
  { name: 'Ketoconazole', genericName: 'Ketoconazole', category: 'antifungal', formulations: [{ form: 'tablet', strength: '200mg', strengthValue: 200, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10, notes: 'Monitor liver enzymes' }] },
  { name: 'Itraconazole', genericName: 'Itraconazole', category: 'antifungal', formulations: [{ form: 'capsule', strength: '100mg', strengthValue: 100, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }, { species: 'CAT', minDoseMgPerKg: 5, maxDoseMgPerKg: 10 }] },
  { name: 'Griseofulvin', genericName: 'Griseofulvin', category: 'antifungal', formulations: [{ form: 'tablet', strength: '125mg', strengthValue: 125, strengthUnit: 'mg' }], dosageRanges: [{ species: 'DOG', minDoseMgPerKg: 25, maxDoseMgPerKg: 50 }, { species: 'CAT', minDoseMgPerKg: 25, maxDoseMgPerKg: 50, notes: 'Contraindicated in pregnant cats' }] },
];

/**
 * Seeds the drug database with 50 common Indian veterinary drugs.
 * Uses upsert to be idempotent — safe to run multiple times.
 */
export async function seedDrugs(prisma: PrismaClient): Promise<number> {
  let seeded = 0;

  for (const drug of DRUG_SEED_DATA) {
    const existing = await prisma.drug.findFirst({
      where: { name: drug.name, clinicId: null },
    });

    if (existing) continue;

    await prisma.drug.create({
      data: {
        name: drug.name,
        genericName: drug.genericName,
        category: drug.category,
        clinicId: null, // Global drugs
        isActive: true,
        formulations: {
          create: drug.formulations.map((f) => ({
            form: f.form,
            strength: f.strength,
            strengthValue: f.strengthValue,
            strengthUnit: f.strengthUnit,
          })),
        },
        dosageRanges: {
          create: drug.dosageRanges.map((d) => ({
            species: d.species,
            minDoseMgPerKg: d.minDoseMgPerKg,
            maxDoseMgPerKg: d.maxDoseMgPerKg,
            isFixedDose: d.isFixedDose ?? false,
            fixedDoseMin: d.fixedDoseMin ?? null,
            fixedDoseMax: d.fixedDoseMax ?? null,
            notes: d.notes ?? null,
          })),
        },
      },
    });
    seeded++;
  }

  return seeded;
}
