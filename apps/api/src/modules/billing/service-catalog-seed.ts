import type { PrismaClient } from '@prisma/client';
import type { ServiceCategory } from '@breeyo/types';

export interface ServiceCatalogPreset {
  name: string;
  category: ServiceCategory;
  defaultPricePaise: number;
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null;
  sortOrder: number;
}

/**
 * 20 default veterinary service presets for Indian vet clinics (ONB-02).
 * Prices in paise (₹500 = 50000 paise), conservative metro/Tier 1 defaults.
 * Each clinic gets its own copy so prices can be customized independently.
 */
export const SERVICE_CATALOG_SEED_DATA: ServiceCatalogPreset[] = [
  { sortOrder: 1, name: 'General Consultation', category: 'consultation', defaultPricePaise: 50000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 2, name: 'Follow-Up Consultation', category: 'consultation', defaultPricePaise: 30000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 3, name: 'Home Visit Consultation', category: 'consultation', defaultPricePaise: 80000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 4, name: 'Emergency Consultation', category: 'emergency', defaultPricePaise: 100000, sacCode: '999399', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 5, name: 'Vaccination - Core', category: 'vaccination', defaultPricePaise: 60000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 6, name: 'Vaccination - Non-Core', category: 'vaccination', defaultPricePaise: 90000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 7, name: 'Deworming', category: 'preventive', defaultPricePaise: 30000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 8, name: 'Tick & Flea Treatment', category: 'preventive', defaultPricePaise: 50000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 9, name: 'Spay/Neuter (Small)', category: 'surgery', defaultPricePaise: 800000, sacCode: '999313', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 10, name: 'Spay/Neuter (Large)', category: 'surgery', defaultPricePaise: 1200000, sacCode: '999313', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 11, name: 'Minor Surgery', category: 'surgery', defaultPricePaise: 500000, sacCode: '999313', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 12, name: 'Major Surgery', category: 'surgery', defaultPricePaise: 1200000, sacCode: '999313', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 13, name: 'Dental Cleaning', category: 'dental', defaultPricePaise: 350000, sacCode: '999311', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 14, name: 'Dental Extraction', category: 'dental', defaultPricePaise: 500000, sacCode: '999313', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 15, name: 'X-Ray', category: 'diagnostic', defaultPricePaise: 80000, sacCode: '999312', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 16, name: 'Ultrasound', category: 'diagnostic', defaultPricePaise: 150000, sacCode: '999312', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 17, name: 'Lab Test - Basic (CBC)', category: 'diagnostic', defaultPricePaise: 80000, sacCode: '999312', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 18, name: 'Lab Test - Comprehensive', category: 'diagnostic', defaultPricePaise: 250000, sacCode: '999312', hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 19, name: 'Grooming - Basic', category: 'grooming', defaultPricePaise: 80000, sacCode: '998612', hsnCode: null, gstRateOverride: 18 },
  { sortOrder: 20, name: 'Grooming - Full', category: 'grooming', defaultPricePaise: 150000, sacCode: '998612', hsnCode: null, gstRateOverride: 18 },
];

/**
 * Seeds the service catalog with 20 preset services for a specific clinic.
 * Creates per-clinic copies so each clinic can customize prices independently.
 * Idempotent: skips if the clinic already has preset services.
 */
export async function seedServiceCatalog(
  prisma: PrismaClient,
  clinicId: string,
): Promise<number> {
  const existingCount = await prisma.serviceCatalog.count({
    where: { clinicId, isPreset: true },
  });

  if (existingCount > 0) return 0;

  const entries = SERVICE_CATALOG_SEED_DATA.map((preset) => ({
    clinicId,
    name: preset.name,
    category: preset.category,
    price: preset.defaultPricePaise,
    sacCode: preset.sacCode,
    hsnCode: preset.hsnCode,
    gstRateOverride: preset.gstRateOverride,
    isActive: true,
    isPreset: true,
    sortOrder: preset.sortOrder,
  }));

  const result = await prisma.serviceCatalog.createMany({ data: entries });
  return result.count;
}
