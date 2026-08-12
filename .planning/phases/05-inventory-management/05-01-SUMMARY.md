---
phase: 05-inventory-management
plan: 01
subsystem: inventory-shared-foundation
tags: [types, validators, constants, prisma, rls, fixtures, test-scaffolds, zod, TDD]
dependency_graph:
  requires: []
  provides: [inventory-types, inventory-validators, inventory-constants, inventory-schema, inventory-fixtures, wave-0-scaffolds]
  affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08]
tech_stack:
  added: []
  patterns: [zod-schema-validation, prisma-rls-tenant-isolation, pg-trgm-search, cuid-vs-uuid-ids, it-todo-scaffolds]
key_files:
  created:
    - packages/types/src/inventory.ts
    - packages/types/src/constants/inventory-categories.ts
    - packages/types/src/constants/inventory-units.ts
    - packages/types/src/constants/adjustment-reasons.ts
    - packages/types/src/constants/stock-movement-types.ts
    - packages/types/src/constants/barcode-formats.ts
    - packages/validators/src/inventory.ts
    - packages/validators/src/__tests__/inventory.validators.test.ts
    - apps/api/src/modules/inventory/__tests__/inventory.fixtures.ts
    - apps/api/tests/inventory/item-crud.test.ts
    - apps/api/tests/inventory/stock-receipt.test.ts
    - apps/api/tests/inventory/stock-adjustment.test.ts
    - apps/api/tests/inventory/fifo-dispense.test.ts
    - apps/api/tests/inventory/stock-movement.test.ts
    - apps/api/tests/inventory/par-level-alerts.test.ts
    - apps/api/tests/inventory/want-list.test.ts
    - apps/api/tests/inventory/barcode-lookup.test.ts
    - apps/api/tests/inventory/offline-queue.test.ts
  modified:
    - packages/types/src/index.ts
    - packages/types/src/constants/index.ts
    - packages/validators/src/index.ts
    - apps/api/prisma/schema.prisma
metrics:
  duration: ~45 minutes
  completed: 2026-08-12
  tasks_completed: 2
  tasks_total: 2
---

# Phase 05 Plan 01: Inventory Shared Foundation Summary

Shared TypeScript types, zod validators, constants, Prisma schema, test fixtures, and Wave 0 scaffolds for Phase 5 inventory management. TDD applied to Task 1 (test-first for zod validators); Task 2 is schema/fixtures work per plan.

## What Was Built

### Task 1: Shared types, constants, validators (TDD)

- **`packages/types/src/inventory.ts`** -- `InventoryItem`, `StockBatch`, `StockMovement`, `InventoryBarcode`, `ClinicInventoryCategory`, `ClinicInventoryUnit` (D-61), `BarcodeConflict`/`AddBarcodeResult` (D-63), input types (`CreateItemInput`, `UpdateItemInput`, `StockReceiptInput`, `DispenseInput` with `ownerId` per D-60, `StockAdjustmentInput`, `StockTakeInput`), query result types (`LowStockItem`, `ExpiringBatchItem`, `WantListItem`, `BatchDeduction`, `DispenseResult`, `BarcodeLookupResult`, `InventorySummary`), and the `getStockLevelStatus()` helper implementing the healthy/warning/critical/no_par_level thresholds from the UI-SPEC color map.
- **Constants** (`packages/types/src/constants/`): `inventory-categories.ts` (7 entries, D-29), `inventory-units.ts` (10 entries, D-05), `adjustment-reasons.ts` (6 entries, D-04), `stock-movement-types.ts` (6 entries, D-45), `barcode-formats.ts` (5 entries, D-15, plus `VISION_CAMERA_BARCODE_TYPES` mapping for the scanner).
- **`packages/validators/src/inventory.ts`** -- `createItemSchema`/`updateItemSchema` (category/unit are free-text since D-05/D-29/D-61 allow custom values, not enum-restricted), `stockReceiptSchema` (quantity positive int; `expiryDate` validated as a real, future date via `.refine()` -- the plan's literal `z.string().datetime()` was replaced because the behavior spec requires accepting plain dates like `'2027-06-15'`, which `datetime()` rejects), `dispenseSchema` (adds `ownerId` per D-60), `stockAdjustmentSchema` (reason required, enum-restricted to the 6 presets), `stockTakeSchema`/`stockTakeEntrySchema`, `barcodeEntrySchema` (format enum-restricted to the 5 supported 1D formats).
- **`packages/validators/src/__tests__/inventory.validators.test.ts`** -- written first, confirmed failing (`Cannot find module '../inventory.js'`) before any implementation existed, then implementation was added until all 33 assertions passed.

### Task 2: Prisma schema, RLS, fixtures, Wave 0 scaffolds

- **`apps/api/prisma/schema.prisma`** -- appended `InventoryItem`, `InventoryBarcode`, `StockBatch`, `StockMovement` (with `ownerId`/`unitPrice` per D-60 and the `[clinicId, type, invoiceId]` index for Phase 6's uninvoiced-counter-sale query), `ClinicInventoryCategory`/`ClinicInventoryUnit` (D-61, `@@unique([clinicId, value])`). Added reverse relations `inventoryItems`/`inventoryCategories`/`inventoryUnits` on `Clinic` and `stockMovements` on `PetOwner` (the real model backing the `Owner` TS type). `StockMovement.owner` relates to `PetOwner`, not a nonexistent `Owner` model.
- **`apps/api/src/modules/inventory/__tests__/inventory.fixtures.ts`** -- all fixtures from the plan (`mockClinic`, `mockUser`, `mockInventoryManager`, `mockItem`/`mockItemVaccine`/`mockItemEquipment`, `mockBatch1`/`mockBatch2`/`mockExpiredBatch`, `mockBarcode`, `mockMovement`, `mockCounterSaleMovement`, `mockClinicCategory`, `mockClinicUnit`), typed against the real `@breeyo/types` interfaces.
- **9 Wave 0 scaffold files** under `apps/api/tests/inventory/` using `describe`/`it.todo`, covering all 8 requirements (INV-01 through INV-08) plus the D-45/D-46 stock-movement history behavior.

## Deviations from Plan (with justification)

The plan's file paths use a generic `packages/shared/...` and root-level `prisma/schema.prisma` / `tests/inventory/...` layout that does not exist in this repo. All paths were mapped to the real, established monorepo structure:

| Plan path | Actual path used | Why |
|---|---|---|
| `packages/shared/src/types/inventory.types.ts` | `packages/types/src/inventory.ts` | Repo has separate `@breeyo/types`/`@breeyo/validators` packages, not a unified `shared` package. Matches sibling files `emr.ts`, `drug.ts`, `billing.ts` (no `.types` suffix). |
| `packages/shared/src/validators/inventory.validators.ts` | `packages/validators/src/inventory.ts` | Same reason; matches sibling `emr.ts`, `prescription.ts`. |
| `packages/shared/src/constants/*.ts` | `packages/types/src/constants/*.ts` | Constants live in `@breeyo/types`, e.g. existing `species.ts`. |
| `packages/shared/src/validators/__tests__/inventory.validators.test.ts` | `packages/validators/src/__tests__/inventory.validators.test.ts` | Matches existing `emr.validators.test.ts` location. |
| `prisma/schema.prisma` | `apps/api/prisma/schema.prisma` | Schema lives under `apps/api`, as the task brief itself flagged. |
| `apps/api/src/lib/prisma.ts` (read_first) | `apps/api/src/lib/prisma-rls.ts` | That's the actual RLS client file; `prisma.ts` doesn't exist. |
| `tests/inventory/*.test.ts` | `apps/api/tests/inventory/*.test.ts` | `apps/api/vitest.config.ts` includes `tests/**/*.test.ts`; no root-level `tests/` dir exists or is wired into any test runner. |
| Owner relation on `StockMovement` | `PetOwner` Prisma model (not `Owner`) | The Prisma model is `PetOwner`; `Owner` is only the TS-level type alias in `@breeyo/types` (see existing `patient.ts`). The plan's snippet said "Owner (already exists from Phase 3)" which doesn't match the real model name. |
| Prisma IDs: `@id @default(cuid())` | `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` | Every existing model in the schema uses Postgres `gen_random_uuid()` with `@db.Uuid`, not Prisma's `cuid()`. Followed the established convention instead of the plan's generic snippet. |
| RLS policy predicate `current_setting('app.current_clinic_id', true)` | Not applied as a migration; schema only (see below) | The actually-used runtime code (`apps/api/src/lib/prisma-rls.ts`, `apps/api/prisma/post-migrate.sql`) uses `app.clinic_id`, not `app.current_clinic_id` (the latter only appears in one older, seemingly-inconsistent `phase-03-patient-queue-rls.sql` file). Documented for the plan that implements the actual RLS SQL script so it stays consistent with `prisma-rls.ts`. |
| `stockReceiptSchema.expiryDate: z.string().datetime()` | `z.string().refine(...)` checking a parseable, future date | The plan's own `<behavior>` bullets require accepting a plain date like `'2027-06-15'` and rejecting past dates. Zod's `.datetime()` requires full ISO-8601 with a time component and does not check "in the future," so it would fail the plan's own test cases. |
| `createItemSchema` importing `CATEGORY_VALUES`/`UNIT_VALUES` for enum restriction | Left as free `z.string().min(1)`, imports omitted | D-05/D-29/D-61 explicitly make category/unit "predefined + custom" (any clinic-typed string is valid), so enum-restricting them would break custom categories. The plan's own code sample also never actually used those imports against the field. |
| `stockAdjustmentSchema`/`barcodeEntrySchema` importing `ADJUSTMENT_REASON_VALUES`/`BARCODE_FORMAT_VALUES` from `@breeyo/types` | Kept as a real cross-package import (not inlined) | Verified this works end-to-end once `@breeyo/types` is built (`pnpm --filter @breeyo/types build`), matching how `turbo.json`'s `test` task already declares `dependsOn: ["^build"]`. Existing validator files (`prescription.ts`, `patient.ts`) inline their enums instead, but importing the real shared constant is more correct per the plan's `key_links` intent, and the repo's own build graph already assumes packages are built before tests run. |

## Database Migration -- Deliberately Skipped

`npx prisma migrate dev --name add_inventory_models` was **not** run against the local dev Postgres (docker container `breeyo-postgres-1` on port 5433, which *is* reachable). Investigation showed the migration history is already out of sync with the live database: `prisma/migrations/` only contains 2 recorded migrations (`20260802111747_init`, `20260802162311_add_consent_records`), but the live database already has all 29 Phase 1-4 tables (`consultations`, `prescriptions`, `vaccination_records`, etc.) that were never captured as migrations -- confirmed via `npx prisma migrate diff --from-migrations ... --to-schema-datamodel schema.prisma`, which produced `CREATE TABLE` statements for every Phase 3/4 table as if they didn't exist yet. Running `migrate dev` in this state would generate a migration that tries to recreate already-existing tables and fail (or worse, corrupt migration history) -- a pre-existing repo issue unrelated to this plan. Per the task's explicit fallback instruction, `prisma validate` and `prisma generate` were run instead and both passed; the RLS SQL (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`) and the `pg_trgm` index from the plan's Task 2 step 3-4 were **not** applied to the database for the same reason and are left for the plan that actually wires up the inventory module and can coordinate with whoever owns fixing the migration-history drift.

## Verification

- `npx vitest run packages/validators/src/__tests__/inventory.validators.test.ts --reporter=verbose` -- **33 passed (33)**
- `npx prisma validate` (from `apps/api/`) -- **"The schema at prisma/schema.prisma is valid"**
- `npx prisma generate` (from `apps/api/`) -- **Prisma Client generated successfully**
- `npx tsc --noEmit` in `packages/types/` and `packages/validators/` -- **both exit 0**
- `npx vitest run tests/inventory --reporter=verbose` (from `apps/api/`) -- **9 files skipped, 80 todo, 0 failed**
- `npx tsc --noEmit` in `apps/api/` -- **exit 0** (fixtures file introduces no type errors)

## Self-Check: PASSED

- [x] All 18 created files exist on disk; 4 modified files updated
- [x] Test written before implementation (confirmed failing on `Cannot find module`, then passing after implementation)
- [x] All acceptance-criteria grep strings verified present
- [x] 7 categories / 10 units / 6 adjustment reasons / 6 movement types / 5 barcode formats confirmed by test assertions
- [x] RLS policies and pg_trgm index intentionally deferred (documented above), not silently skipped
