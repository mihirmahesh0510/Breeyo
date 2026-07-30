# Phase 4: EMR & Clinical Records - Research Addendum
# Service Catalog Presets for ONB-02

**Researched:** 2026-07-30
**Domain:** Service catalog data model, Indian veterinary pricing, GST HSN/SAC classification, seed data
**Confidence:** MEDIUM-HIGH (pricing is region-variable; GST classification verified; data model is straightforward)

## Summary

This addendum covers the **default service catalog presets** portion of requirement ONB-02: "System ships with seed data: common veterinary drug database (200-300 entries), breed lists per species, and default service catalog presets (consultation, vaccination, surgery, grooming)."

The drug database is covered in plan 04-02 (`drug-seed.ts`). Breed lists are covered in Phase 3's 03-01. This research addresses only the service catalog: the pre-loaded list of billable services that Indian vet clinics commonly offer. These become selectable line items on invoices (Phase 6) and must be available from Phase 4 onward so consultations can reference them.

Phase 6 (plan 06-01) already defines a `PRESET_SERVICES` constant with 6 entries and a `ServiceCatalog` Prisma model. However, that constant is a minimal placeholder with only `{ name, price }`. This research expands that to 20 services with categories, realistic Indian pricing, and GST/SAC classification -- providing the data the planner needs to create a service catalog seed file that mirrors the drug seed pattern from 04-02.

**Primary recommendation:** Create a `service-catalog-seed.ts` file in `apps/api/src/modules/billing/` that exports a `SERVICE_CATALOG_SEED_DATA` array of 20 preset services with category, default price (in paise), SAC/HSN code, and GST rate. Seed function runs during clinic onboarding (creates per-clinic copies from the global template). This replaces the hardcoded 6-entry `PRESET_SERVICES` constant in Phase 6's billing constants.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Service catalog data definition | Shared types (packages/shared) | -- | Types/constants shared between API and mobile |
| Service catalog seed data | API / Backend | -- | Seed file lives in API, runs during Prisma seed or clinic onboarding |
| Per-clinic service CRUD | API / Backend | -- | CRUD endpoints already planned in Phase 6 (06-02 service-catalog.controller) |
| Service picker UI | Mobile (React Native) | -- | ServicePicker component already planned in Phase 6 (06-03) |
| GST rate/SAC code storage | Database (PostgreSQL) | -- | Part of ServiceCatalog and ClinicBillingSettings models |

---

## Relationship to Existing Plans

### What Phase 6 Already Defines

Phase 6 plan 06-01 creates:
- `ServiceCatalog` Prisma model: `{ id, clinicId, name, price, isActive, isPreset, createdAt, updatedAt }`
- `PRESET_SERVICES` constant: 6 entries with `{ name, price }` only
- `serviceCatalogSchema` zod validator: `{ name, price, isActive }`
- `ServiceCatalogController` in 06-02: listServices, createService, updateService, seedPresetServices

### What This Addendum Adds

1. **Expanded seed data** (20 services vs 6) with categories, realistic pricing, SAC/HSN codes
2. **Category taxonomy** for organizing services in the picker UI
3. **GST classification** per service (exempt vs 18%) based on SAC code
4. **Data model extensions** -- adding `category`, `sacCode`, `gstRateOverride` fields to ServiceCatalog

### Integration Points

- The expanded `PRESET_SERVICES` replaces the 6-entry version in `packages/shared/src/constants/billing.constants.ts`
- The seed function mirrors the drug seed pattern: `seedServiceCatalog(prisma, clinicId)` -- called during clinic onboarding
- Phase 6 `ServiceCatalogController.seedPresetServices()` already has an endpoint for this
- Phase 6 `ServicePicker` component consumes `GET /api/v1/billing/services` which returns the catalog

---

## Service Catalog Data Model

### Prisma Model Extension

The existing `ServiceCatalog` model in Phase 6's schema needs these additional fields:

```prisma
model ServiceCatalog {
  id              String   @id @default(cuid())
  clinicId        String   @map("clinic_id")
  name            String
  category        String   @default("general")  // NEW: service category
  price           Int                            // in paise
  sacCode         String?  @map("sac_code")      // NEW: GST SAC code
  hsnCode         String?  @map("hsn_code")      // NEW: for product-type services
  gstRateOverride Decimal? @map("gst_rate_override") // NEW: null = use clinic default
  isActive        Boolean  @default(true) @map("is_active")
  isPreset        Boolean  @default(false) @map("is_preset")
  sortOrder       Int      @default(0) @map("sort_order") // NEW: display ordering

  clinic          Clinic   @relation(fields: [clinicId], references: [id])

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@index([clinicId, isActive])
  @@index([clinicId, category])
  @@map("service_catalog")
}
```

**New fields rationale:**
- `category`: Groups services in the mobile ServicePicker component (searchable, filterable)
- `sacCode`: GST SAC code for invoicing. Pre-filled for presets; clinic can override for customs
- `hsnCode`: HSN code for product-type line items (medicines, accessories). Null for services
- `gstRateOverride`: Allows per-service GST rate override (e.g., grooming at 18%, clinical services at 0%). When null, uses clinic default from ClinicBillingSettings
- `sortOrder`: Controls display order within category

### TypeScript Type Extension

```typescript
// Extends ServiceCatalog from packages/shared/src/types/billing.types.ts
export interface ServiceCatalog {
  id: string;
  clinicId: string;
  name: string;
  category: ServiceCategory;
  price: number;           // paise
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null; // percentage, null = clinic default
  isActive: boolean;
  isPreset: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceCategory =
  | 'consultation'
  | 'vaccination'
  | 'surgery'
  | 'diagnostic'
  | 'dental'
  | 'grooming'
  | 'preventive'
  | 'emergency'
  | 'other';
```

### Zod Schema Extension

```typescript
// Extends serviceCatalogSchema from packages/shared/src/schemas/billing.schemas.ts
export const serviceCatalogSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum([
    'consultation', 'vaccination', 'surgery', 'diagnostic',
    'dental', 'grooming', 'preventive', 'emergency', 'other'
  ]).default('other'),
  price: z.number().int().nonnegative(),
  sacCode: z.string().max(10).optional(),
  hsnCode: z.string().max(10).optional(),
  gstRateOverride: z.number().min(0).max(100).optional(),
  isActive: z.boolean().default(true),
});
```

---

## Default Preset Services (20 entries)

Curated from real Indian veterinary clinic rate cards (Magicvets Petcare, Vetic, and other metro-city clinics). Prices are representative defaults for metro/Tier 1 cities -- clinics customize after onboarding. [ASSUMED]

### Service Catalog Seed Data

| # | Name | Category | Default Price (paise) | INR | SAC/HSN Code | GST Rate | Notes |
|---|------|----------|----------------------|-----|-------------|----------|-------|
| 1 | General Consultation | consultation | 50000 | 500 | 999311 | Exempt | In-clinic consultation [CITED: casahuja.com/2025/12/gst-classification-and-taxability.html] |
| 2 | Follow-Up Consultation | consultation | 30000 | 300 | 999311 | Exempt | Return visit within 7 days |
| 3 | Home Visit Consultation | consultation | 80000 | 800 | 999311 | Exempt | House call (metro pricing) [CITED: magicvets.com/home/rate-card/] |
| 4 | Emergency Consultation | emergency | 100000 | 1,000 | 999399 | Exempt | After-hours / critical [CITED: casahuja.com] |
| 5 | Vaccination - Core | vaccination | 60000 | 600 | 999311 | Exempt | DHPPi / FVRCP / Anti-Rabies (vaccine cost separate if inventory-tracked) |
| 6 | Vaccination - Non-Core | vaccination | 90000 | 900 | 999311 | Exempt | Kennel Cough / Corona / Leptospira |
| 7 | Deworming | preventive | 30000 | 300 | 999311 | Exempt | Administration fee (medicine cost separate if inventory-tracked) |
| 8 | Tick & Flea Treatment | preventive | 50000 | 500 | 999311 | Exempt | Anti-tick injection / spot-on application |
| 9 | Spay/Neuter (Small) | surgery | 800000 | 8,000 | 999313 | Exempt | Under 10kg [CITED: vetic.in spay cost guide] |
| 10 | Spay/Neuter (Large) | surgery | 1200000 | 12,000 | 999313 | Exempt | Over 10kg |
| 11 | Minor Surgery | surgery | 500000 | 5,000 | 999313 | Exempt | Wound suturing, abscess drain, lump removal |
| 12 | Major Surgery | surgery | 1200000 | 12,000 | 999313 | Exempt | Orthopedic, laparotomy, tumor excision |
| 13 | Dental Cleaning | dental | 350000 | 3,500 | 999311 | Exempt | Ultrasonic scaling under sedation |
| 14 | Dental Extraction | dental | 500000 | 5,000 | 999313 | Exempt | Per tooth / per session |
| 15 | X-Ray | diagnostic | 80000 | 800 | 999312 | Exempt | Single view [CITED: casahuja.com -- diagnostic services exempt] |
| 16 | Ultrasound | diagnostic | 150000 | 1,500 | 999312 | Exempt | Abdominal / pregnancy |
| 17 | Lab Test - Basic (CBC) | diagnostic | 80000 | 800 | 999312 | Exempt | Complete blood count |
| 18 | Lab Test - Comprehensive | diagnostic | 250000 | 2,500 | 999312 | Exempt | CBC + biochemistry + urinalysis |
| 19 | Grooming - Basic | grooming | 80000 | 800 | 998612 | 18% | Bath + nail trim + ear clean (cosmetic, NOT exempt) [CITED: casahuja.com -- cosmetic grooming is taxable at 18%] |
| 20 | Grooming - Full | grooming | 150000 | 1,500 | 998612 | 18% | Bath + haircut + nail + ear + anal gland |

### Pricing Philosophy

- Prices are **conservative defaults** for metro/Tier 1 Indian cities [ASSUMED]
- Clinics in Tier 2/3 cities will lower prices during onboarding setup
- Surgery prices are **service fees only** -- anesthesia drugs, consumables, and medicines are billed separately via inventory (Phase 5)
- Vaccination service fee covers administration; the vaccine itself is an inventory item billed as a PRODUCT line on the invoice
- All prices stored in **paise** (integer) per project convention

---

## GST / SAC Code Classification

### Veterinary Service SAC Codes

| SAC Code | Description | GST Rate | Applicable Services |
|----------|-------------|----------|---------------------|
| 999311 | Clinical consultation & examination | Exempt (0%) | Consultations, vaccinations (administration), deworming, preventive care [CITED: casahuja.com] |
| 999312 | Diagnostic services (lab, imaging, pathology) | Exempt (0%) | X-Ray, ultrasound, blood tests, urinalysis [CITED: casahuja.com] |
| 999313 | Surgeries, implants, anaesthesia | Exempt (0%) | All surgical procedures [CITED: casahuja.com] |
| 999321 | Hospitalisation & inpatient care | Exempt (0%) | Day boarding for medical observation |
| 999399 | Emergency & critical care | Exempt (0%) | After-hours emergencies [CITED: casahuja.com] |
| 998612 | Grooming & cosmetic services | 18% | Baths, haircuts, nail trimming (cosmetic) [CITED: casahuja.com -- cosmetic unless medically prescribed] |

**Key legal boundary (from casahuja.com):** [CITED: casahuja.com/2025/12/gst-classification-and-taxability.html]
- "A service is exempt only when clinical records support diagnostic or therapeutic intent."
- Grooming, boarding, and training are **taxable at 18%** unless medically prescribed with clinical documentation.
- Veterinary healthcare services (consultation, diagnosis, surgery, treatment) are **exempt under Entry 46 of Notification No. 12/2017 -- Central Tax (Rate)**.

### Product HSN Codes (for inventory items on invoices)

| HSN Code | Description | GST Rate |
|----------|-------------|----------|
| 3004 | Veterinary medicines (retail packaged) | 5% [CITED: vakilsearch.com/hsn-code/search/veterinary-medicine] |
| 3002 | Vaccines (sera, toxins, cultures) | 5% |
| 2309 | Pet food & supplements | 0-18% (varies) |
| 4201 | Pet accessories (collars, leashes) | 18% |

### GST Handling in the Data Model

The `gstRateOverride` field on `ServiceCatalog` enables per-service GST rates:
- **Clinical services** (SAC 9993xx): `gstRateOverride = 0` (exempt)
- **Grooming services** (SAC 998612): `gstRateOverride = 18`
- **Custom services**: Clinic sets during creation; defaults to clinic-level GST rate from `ClinicBillingSettings`

Phase 6 decision D-17 says "Basic GST line (single rate, no CGST/SGST split)" -- but this means a **single rate per line item**, not that all items must share the same rate. The `gstRateOverride` allows mixed rates on one invoice while keeping GST simple (no CGST/SGST split).

**Important caveat for planner:** D-17 explicitly defers full GST compliance with CGST/SGST/IGST and HSN/SAC codes to v2. The SAC codes and per-service GST rates in this seed data are **forward-compatible infrastructure** -- they populate the database fields but the Phase 6 invoice calculator uses the clinic-level default GST rate only. Activating per-line-item GST rates is a v2 enhancement. For Beta, the fields exist but are not consumed by the GST calculation engine.

---

## Seed Data Approach

### Pattern: Mirror the Drug Seed from 04-02

The drug seed in `apps/api/src/modules/drug/drug-seed.ts` exports:
- A `DRUG_SEED_DATA` array of drug entries
- A `seedDrugs(prisma: PrismaClient)` function that upserts all drugs

The service catalog seed follows the same pattern:

```typescript
// apps/api/src/modules/billing/service-catalog-seed.ts

export interface ServiceCatalogPreset {
  name: string;
  category: ServiceCategory;
  defaultPricePaise: number;
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null; // null = use clinic default
  sortOrder: number;
}

export const SERVICE_CATALOG_SEED_DATA: ServiceCatalogPreset[] = [
  {
    name: 'General Consultation',
    category: 'consultation',
    defaultPricePaise: 50000,
    sacCode: '999311',
    hsnCode: null,
    gstRateOverride: 0,
    sortOrder: 1,
  },
  // ... 19 more entries per the table above
];

/**
 * Seeds service catalog presets for a specific clinic.
 * Called during clinic onboarding (first-time setup).
 * Creates per-clinic copies so each clinic can customize prices.
 *
 * Idempotent: skips if clinic already has preset services.
 */
export async function seedServiceCatalog(
  prisma: PrismaClient,
  clinicId: string
): Promise<number> {
  // Check if clinic already has presets
  const existingPresets = await prisma.serviceCatalog.count({
    where: { clinicId, isPreset: true },
  });

  if (existingPresets > 0) {
    return 0; // Already seeded
  }

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
```

### Per-Clinic Customization Pattern

Services are **per-clinic**, not global:
1. On clinic onboarding, `seedServiceCatalog(prisma, clinicId)` creates 20 preset entries for that clinic
2. Each clinic gets its own copies with `isPreset: true`
3. Clinic can: change prices, deactivate services, add custom services (`isPreset: false`)
4. Preset services are never deleted -- only deactivated (soft delete via `isActive: false`)
5. Custom services added by the clinic have `isPreset: false` and can be deleted

This pattern matches how the drug database works: global seed data, but each clinic's service list is independent.

### Seeding Trigger Points

The seed function should be called:
1. **During Prisma seed** (`prisma/seed.ts`): For development/testing -- seed a demo clinic
2. **During clinic onboarding** (Phase 1 clinic setup flow): When a new clinic is created
3. **Via API endpoint** (`POST /api/v1/billing/services/seed-presets`): Manual trigger if somehow missed

Phase 6 plan 06-02 already defines `seedPresetServices` in the `ServiceCatalogController`. The implementation calls `seedServiceCatalog(prisma, clinicId)`.

---

## How Services Connect to Invoices (Phase 6)

### Invoice Line Item Flow

```
ServiceCatalog (seed) --> ServicePicker (mobile) --> InvoiceLineItem (invoice)
                              |                          |
                              | user selects              | stored on invoice
                              v                          v
                         { serviceId, name,         { type: 'SERVICE',
                           price, category }          name, unitPricePaise,
                                                      serviceId, quantity }
```

1. Front desk opens InvoiceBuilder
2. Taps "Add Service" -- opens ServicePicker bottom sheet
3. ServicePicker shows categorized list from `GET /api/v1/billing/services`
4. User taps a service (e.g., "General Consultation - Rs 500")
5. Service is added as an `InvoiceLineItem` with `type: SERVICE`, `serviceId` reference, and default price
6. User can adjust quantity and price before finalizing

### Key Contract Points

- `InvoiceLineItem.serviceId` references `ServiceCatalog.id` (nullable FK)
- `InvoiceLineItem.type` is `SERVICE` (vs `PRODUCT` for inventory items)
- Price on the line item is a **snapshot** -- changing the catalog price later does not affect existing invoices
- The `serviceId` is a reference for reporting/analytics, not a live dependency

---

## Common Pitfalls

### Pitfall 1: Global vs Per-Clinic Service Catalog Confusion

**What goes wrong:** Implementing services as a global table where all clinics share the same records. When one clinic changes a price, all clinics see the change.
**Why it happens:** Seems simpler to have one table without clinicId scoping.
**How to avoid:** Services are per-clinic from day one. The seed function creates **copies** for each clinic. The `clinicId` filter is mandatory on all queries. This aligns with the multi-tenant RLS pattern used throughout the project.
**Warning signs:** Two clinics showing the same custom service that only one created.

### Pitfall 2: Hardcoding GST Rate Across All Services

**What goes wrong:** Applying the clinic's default 18% GST rate to grooming (correct) AND clinical services (should be exempt). Clinics get charged GST on exempt services.
**Why it happens:** Phase 6 D-17 says "single configurable GST rate" which could be misread as "same rate for everything."
**How to avoid:** Store `gstRateOverride` per service in the catalog. For Beta, the invoice engine uses the clinic default rate (D-17) -- but the data model is ready for per-line-item rates in v2. The seed data populates correct rates now so migration is just flipping the switch.
**Warning signs:** Invoices charging 18% GST on consultation fees (which are exempt).

### Pitfall 3: Price Drift Between Catalog and Invoice

**What goes wrong:** Changing a service price in the catalog retroactively affects the display of old invoices.
**Why it happens:** Invoice line items store a serviceId reference and look up the current price instead of snapshotting it.
**How to avoid:** `InvoiceLineItem.unitPricePaise` is a **snapshot** copied from the catalog at invoice creation time. The `serviceId` is for reference/reporting only. This is already how Phase 6 designs it -- but seed data tests should verify the snapshot behavior.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default service prices are representative of metro/Tier 1 Indian vet clinic pricing | Default Preset Services | LOW -- clinics customize prices during onboarding; defaults are starting points only |
| A2 | 20 preset services cover the common service offerings of Indian solo vet clinics | Default Preset Services | LOW -- clinics can add custom services; more presets can be added in updates |
| A3 | Per-service GST rate override is compatible with Phase 6 D-17 "single rate" decision | GST Handling | MEDIUM -- D-17 might intend strict single-rate; but data model extension is non-breaking and the override is ignored until v2 |
| A4 | ServiceCategory enum values cover the common groupings | Data Model | LOW -- new categories can be added as string values |
| A5 | SAC code 999311 applies to veterinary consultations (not just human healthcare) | GST Classification | LOW -- verified via casahuja.com GST framework and Entry 46 exemption notification, but a practicing CA should confirm |

---

## Test Specifications

### Service Catalog Seed Tests

```typescript
// apps/api/src/modules/billing/__tests__/service-catalog-seed.test.ts

describe('Service Catalog Seed Data', () => {
  it('should have exactly 20 preset services', () => {
    expect(SERVICE_CATALOG_SEED_DATA).toHaveLength(20);
  });

  it('should have sentinel entries', () => {
    const names = SERVICE_CATALOG_SEED_DATA.map(s => s.name);
    expect(names).toContain('General Consultation');
    expect(names).toContain('Vaccination - Core');
    expect(names).toContain('Spay/Neuter (Small)');
    expect(names).toContain('X-Ray');
    expect(names).toContain('Grooming - Basic');
  });

  it('should have all prices in paise (positive integers)', () => {
    SERVICE_CATALOG_SEED_DATA.forEach(s => {
      expect(Number.isInteger(s.defaultPricePaise)).toBe(true);
      expect(s.defaultPricePaise).toBeGreaterThan(0);
    });
  });

  it('should have valid categories', () => {
    const validCategories = [
      'consultation', 'vaccination', 'surgery', 'diagnostic',
      'dental', 'grooming', 'preventive', 'emergency', 'other',
    ];
    SERVICE_CATALOG_SEED_DATA.forEach(s => {
      expect(validCategories).toContain(s.category);
    });
  });

  it('should have SAC codes for all clinical services', () => {
    SERVICE_CATALOG_SEED_DATA
      .filter(s => s.category !== 'grooming' && s.category !== 'other')
      .forEach(s => {
        expect(s.sacCode).toBeTruthy();
        expect(s.sacCode).toMatch(/^99\d{4}$/);
      });
  });

  it('should have gstRateOverride=0 for exempt clinical services', () => {
    SERVICE_CATALOG_SEED_DATA
      .filter(s => ['consultation','vaccination','surgery','diagnostic',
                     'dental','preventive','emergency'].includes(s.category))
      .forEach(s => {
        expect(s.gstRateOverride).toBe(0);
      });
  });

  it('should have gstRateOverride=18 for grooming services', () => {
    SERVICE_CATALOG_SEED_DATA
      .filter(s => s.category === 'grooming')
      .forEach(s => {
        expect(s.gstRateOverride).toBe(18);
      });
  });

  it('should have sequential sort orders', () => {
    const orders = SERVICE_CATALOG_SEED_DATA.map(s => s.sortOrder);
    const unique = new Set(orders);
    expect(unique.size).toBe(orders.length); // No duplicates
  });
});

describe('seedServiceCatalog', () => {
  it('should create 20 entries for a new clinic', async () => {
    // Mock prisma.serviceCatalog.count -> 0
    // Mock prisma.serviceCatalog.createMany
    // Assert createMany called with 20 entries, all having clinicId and isPreset=true
  });

  it('should be idempotent (skip if presets exist)', async () => {
    // Mock prisma.serviceCatalog.count -> 20
    // Assert createMany NOT called
    // Assert return value is 0
  });
});
```

---

## Impact on Existing Phase 6 Plans

### Changes Required in 06-01 (Shared Types)

1. **Extend `ServiceCatalog` type** with `category`, `sacCode`, `hsnCode`, `gstRateOverride`, `sortOrder`
2. **Add `ServiceCategory` type** enum
3. **Extend `serviceCatalogSchema`** zod validator with new fields
4. **Replace `PRESET_SERVICES` constant** -- the 6-entry `{ name, price }` array becomes a 20-entry `SERVICE_CATALOG_SEED_DATA` array with full metadata. Keep `PRESET_SERVICES` as a derived constant for backward compat:
   ```typescript
   // Backward-compatible constant (derived from seed data)
   export const PRESET_SERVICES = SERVICE_CATALOG_SEED_DATA.map(s => ({
     name: s.name,
     price: s.defaultPricePaise,
   }));
   ```

### Changes Required in 06-01 (Prisma Schema)

1. Add `category`, `sacCode`, `hsnCode`, `gstRateOverride`, `sortOrder` fields to `ServiceCatalog` model
2. Add indexes on `[clinicId, category]` and `[clinicId, isActive]`

### Changes Required in 06-02 (API)

1. `ServiceCatalogController.seedPresetServices()` calls `seedServiceCatalog(prisma, clinicId)` instead of inline seed
2. `ServiceCatalogController.listServices()` returns services grouped by category
3. Add optional `category` filter to list endpoint

### Changes Required in 06-03 (Mobile)

1. `ServicePicker` groups services by category with section headers
2. `useServices()` hook returns services with category for grouping

### No Changes Required

- Invoice state machine, payment flow, PDF generation, GST calculation engine (Beta uses clinic default rate per D-17)
- The new fields are additive and backward-compatible

---

## Sources

### Primary (HIGH confidence)
- [casahuja.com GST Classification Framework](https://www.casahuja.com/2025/12/gst-classification-and-taxability.html) -- Comprehensive GST classification for veterinary and pet-care services with SAC codes, exempt vs taxable boundaries, and legal citations
- [busy.in SAC Code 998351](https://busy.in/sac-code-998351/) -- SAC code reference for pet veterinary services, GST rate confirmation
- [busy.in SAC Code 998352](https://busy.in/sac-code-998352/) -- SAC code reference for livestock veterinary services

### Secondary (MEDIUM confidence)
- [Magicvets Petcare Rate Card](https://www.magicvets.com/home/rate-card/) -- Real Indian veterinary clinic pricing (Delhi NCR), comprehensive service and surgery price list
- [vetic.in Spay Cost Guide](https://vetic.in/blog/dogs/puppy-spay-cost-vs-adult-dog-spay-cost-complete-price-guide-in-india/) -- Spay/neuter pricing across Indian clinic tiers
- [pawversesocial.com Vaccination Cost Breakdown](https://pawversesocial.com/blog/pet-vaccination-cost-in-india-an-honest-price-breakdown-2026) -- 2026 vaccination pricing in India
- [vakilsearch.com HSN Code Veterinary Medicine](https://vakilsearch.com/hsn-code/search/veterinary-medicine) -- HSN codes for veterinary medicines
- [digittrix.com Top Veterinary Clinics India 2026](https://www.digittrix.com/blogs/top-veterinary-care-clinics-india-in-india-2026-reviews-pricing) -- Consultation fee ranges across Indian cities

### Tertiary (LOW confidence)
- Training data knowledge of Indian veterinary practice patterns [ASSUMED]
- Default pricing estimates for Tier 1/2 cities [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Service list completeness: MEDIUM-HIGH -- based on real clinic rate cards but may miss niche services
- Pricing accuracy: MEDIUM -- prices vary significantly by city and clinic tier; these are customizable defaults
- GST/SAC classification: HIGH -- verified against casahuja.com comprehensive GST framework with legal citations
- Data model design: HIGH -- straightforward extension of existing ServiceCatalog Prisma model
- Integration with Phase 6: HIGH -- all integration points already planned in Phase 6 plans

**Research date:** 2026-07-30
**Valid until:** 2026-08-30 (30 days -- stable domain; GST rates may change with government notifications)
