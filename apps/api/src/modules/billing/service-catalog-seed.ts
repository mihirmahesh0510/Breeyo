import type { PrismaClient } from '@prisma/client';
import type { ServiceCategory } from '@breeyo/types';
import { VETERINARY_SAC } from '@breeyo/types';

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
 *
 * ## SAC codes (follow-up A1, decided 2026-08-14)
 *
 * Every clinical preset carries {@link VETERINARY_SAC} — `998351`, the code
 * Notification No. 12/2017-Central Tax (Rate) Entry 46 exempts. Before
 * 2026-08-14 this list shipped the `9993xx` family instead, recorded now as
 * `VETERINARY_SAC_LEGACY_CORRECTABLE`. No invoice was ever mis-taxed by that —
 * the tax engine reads `gstRateOverride` and `taxTreatment`, never the SAC
 * string — but the code is printed on a legal document, so new clinics get the
 * right one.
 *
 * Clinics seeded before that date keep their existing rows. Correcting them is
 * an explicit Admin action on the Billing Settings screen
 * (`POST /billing/settings/sac-codes/update`), never an automatic migration:
 * their accountant may already have set these codes by hand.
 *
 * The two grooming rows keep `998612` and their 18% override. Grooming is not
 * veterinary healthcare, Entry 46 does not reach it, and stamping the
 * nil-rated veterinary SAC onto a taxable line would be a worse document than
 * the one it replaced.
 */
export const SERVICE_CATALOG_SEED_DATA: ServiceCatalogPreset[] = [
  { sortOrder: 1, name: 'General Consultation', category: 'consultation', defaultPricePaise: 50000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 2, name: 'Follow-Up Consultation', category: 'consultation', defaultPricePaise: 30000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 3, name: 'Home Visit Consultation', category: 'consultation', defaultPricePaise: 80000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 4, name: 'Emergency Consultation', category: 'emergency', defaultPricePaise: 100000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 5, name: 'Vaccination - Core', category: 'vaccination', defaultPricePaise: 60000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 6, name: 'Vaccination - Non-Core', category: 'vaccination', defaultPricePaise: 90000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 7, name: 'Deworming', category: 'preventive', defaultPricePaise: 30000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 8, name: 'Tick & Flea Treatment', category: 'preventive', defaultPricePaise: 50000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 9, name: 'Spay/Neuter (Small)', category: 'surgery', defaultPricePaise: 800000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 10, name: 'Spay/Neuter (Large)', category: 'surgery', defaultPricePaise: 1200000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 11, name: 'Minor Surgery', category: 'surgery', defaultPricePaise: 500000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 12, name: 'Major Surgery', category: 'surgery', defaultPricePaise: 1200000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 13, name: 'Dental Cleaning', category: 'dental', defaultPricePaise: 350000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 14, name: 'Dental Extraction', category: 'dental', defaultPricePaise: 500000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 15, name: 'X-Ray', category: 'diagnostic', defaultPricePaise: 80000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 16, name: 'Ultrasound', category: 'diagnostic', defaultPricePaise: 150000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 17, name: 'Lab Test - Basic (CBC)', category: 'diagnostic', defaultPricePaise: 80000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
  { sortOrder: 18, name: 'Lab Test - Comprehensive', category: 'diagnostic', defaultPricePaise: 250000, sacCode: VETERINARY_SAC, hsnCode: null, gstRateOverride: 0 },
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
