---
phase: 05-inventory-management
plan: 02
subsystem: inventory-item-api
tags: [fastify, prisma, zod, rls, pg-trgm, permissions, TDD]
dependency_graph:
  requires: [inventory-types, inventory-validators, inventory-constants, inventory-schema, inventory-fixtures]
  provides: [inventory-item-crud-api, stock-receipt-api, barcode-lookup-api, inventory-permission-middleware]
  affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08]
tech_stack:
  added: []
  patterns: [permission-code-based-authorization, prisma-transaction, raw-sql-pg-trgm-search, presigned-url-mock-pattern, factory-vs-class-controller]
key_files:
  created:
    - apps/api/src/modules/inventory/middleware/inventory-permissions.middleware.ts
    - apps/api/src/modules/inventory/inventory-item.repository.ts
    - apps/api/src/modules/inventory/inventory-item.service.ts
    - apps/api/src/modules/inventory/stock-receipt.service.ts
    - apps/api/src/modules/inventory/barcode-lookup.service.ts
    - apps/api/src/modules/inventory/inventory-item.controller.ts
    - apps/api/src/modules/inventory/inventory.routes.ts
    - apps/api/src/modules/inventory/inventory.schema.ts
    - apps/api/src/modules/inventory/__tests__/inventory-item.service.test.ts
    - apps/api/src/modules/inventory/__tests__/barcode-lookup.test.ts
    - apps/api/src/modules/inventory/__tests__/inventory-permissions.middleware.test.ts
    - apps/api/src/modules/inventory/__tests__/inventory-item.controller.test.ts
    - apps/api/prisma/rls/phase-05-inventory-rls.sql
  modified:
    - apps/api/src/app.ts
    - apps/api/prisma/seed.ts
metrics:
  duration: ~2.5 hours
  completed: 2026-08-12
  tasks_completed: 2
  tasks_total: 2
---

# Phase 05 Plan 02: Inventory Item API Summary

Item CRUD API with pg_trgm search, stock receipt (D-11/D-27), barcode lookup + catalog sync (D-19), D-63 barcode conflict handling, D-61 clinic-custom categories/units, D-64 item photo presigned upload, and D-41–D-44 permission middleware. TDD applied to Task 1 (all four inventory test files written and confirmed failing before any implementation existed); Task 2's controller/routes have their own test file per the orchestrator's instruction, matching this repo's `emr.controller.test.ts` mocked-handler style since there's no route-level integration-test convention in this codebase.

## What Was Built

### Task 1: Repository, services, permission middleware (TDD)

- **`inventory-item.repository.ts`** — `InventoryItemRepository` class (constructor takes `PrismaClient`, matching `PatientRepository`'s convention — not RLS's `request.db`, which no other module actually wires up either; see Deviations). `create()`/`update()` run in a `$transaction`, upserting a `ClinicInventoryCategory`/`ClinicInventoryUnit` row via `upsert(... update: {})` (D-61's "`INSERT ... ON CONFLICT DO NOTHING`") whenever the caller's category/unit isn't in `CATEGORY_VALUES`/`UNIT_VALUES`. `list()` handles 5 sort options; search (pg_trgm `similarity()` + ILIKE + barcode-code match, D-31) and `expiry_asc` (raw `LEFT JOIN stock_batches ... GROUP BY` for nearest active-batch expiry) both resolve an ordered id list via raw SQL first, then re-fetch with `include: { barcodes: true }` and re-sort in memory to preserve relevance/expiry order while still using Prisma relations for the page payload. `getSummary()` computes totals via two raw aggregate queries. `addBarcode()` catches Prisma's `P2002` on the `[code, clinicId]` unique constraint and returns `{ success: false, conflict: { itemId, itemName } }` (D-63) instead of throwing. `generatePhotoUploadUrl()` mirrors `attachment.service.ts`'s dev/prod URL-construction pattern (D-64), returning null (not throwing) when the item isn't found for the clinic, so the service layer owns the 404.
- **`inventory-item.service.ts`** — `InventoryItemService` validates with `createItemSchema`/`updateItemSchema`/`barcodeEntrySchema` (defense-in-depth, same double-validation pattern as `patient.service.ts`), translates repository `null` results into a typed `ITEM_NOT_FOUND` 404 error (`getItem`, `updateItem`, `getPhotoUploadUrl`), and passes the D-63 `AddBarcodeResult` shape through unchanged for the controller to map to a 409.
- **`stock-receipt.service.ts`** — `StockReceiptService.receiveStock()`: looks up the item, enforces D-27 (expiry required for `medicine`/`vaccine`/`lab_consumable`) with a 400 `VALIDATION_ERROR`, then in one transaction creates a new `StockBatch` (D-11, always new — never merges), computes the new running total from the item's last movement, creates a `received` `StockMovement`, and increments `InventoryItem.currentStock`.
- **`barcode-lookup.service.ts`** — `BarcodeLookupService.lookup()` wraps `repository.findByBarcode()`'s raw-row-or-null into `BarcodeLookupResult` (`{ found: false }` or `{ found: true, item, barcodeEntry }`); `getCatalog()` passes through to `repository.getBarcodeCatalog()` for D-19 incremental offline sync.
- **`middleware/inventory-permissions.middleware.ts`** — see Deviations: reimplemented against the real permission-code system instead of the plan's role-string sketch.
- **Tests** — `inventory-item.service.test.ts` (18 tests: create/update/get/list/summary/categories/units/addBarcode/photo-upload-url, including D-61 and D-63 cases), `barcode-lookup.test.ts` (4 tests), `inventory-permissions.middleware.test.ts` (8 tests, added beyond the plan's file list — see Deviations). All confirmed failing (`Cannot find module`) before implementation existed, then made to pass.

### Task 2: Controller, routes, app wiring

- **`inventory-item.controller.ts`** — `InventoryController` **class** (constructor DI of the three services) with `safeParse`-then-400 validation on every handler, matching the `{error:{code,message}}` convention from `error-handler.ts`. `addBarcode` maps a `{success:false}` result to `409 BARCODE_CONFLICT` with a typed `existingItem` field (D-63). All other thrown service errors (`ITEM_NOT_FOUND`, `VALIDATION_ERROR`) propagate to Fastify's global `errorHandler`, same as `emr`/`patient`.
- **`inventory.schema.ts`** — local zod schemas for params/query (`itemParamsSchema`, `barcodeParamsSchema`, `listQuerySchema`, `lookupQuerySchema`, `catalogQuerySchema`), mirroring the `patient.schema.ts`/`emr.schema.ts` convention. Not in the plan's literal file list but necessary to match how every other module structures request validation — noted as an added supporting file, not a deviation from any explicit instruction.
- **`inventory.routes.ts`** — registers all 13 routes from the plan under paths relative to the `/api/v1` prefix applied at `app.ts` registration (e.g. `/inventory/items`, not `/api/v1/inventory/items` — matches how `patient.routes.ts` registers `/patients/register` rather than the full prefixed path). DI wiring: `InventoryItemRepository → InventoryItemService + StockReceiptService (own PrismaClient) + BarcodeLookupService → InventoryController`. `preHandler: [authenticate, tenantContext, requireInventoryPermission(action)]` per route, matching the plan's `viewInventory`/`manageStock` annotations.
- **`app.ts`** — registered `inventoryRoutes` under `/api/v1` after the Phase 4 modules.
- **`inventory-item.controller.test.ts`** — 7 tests added (createItem happy/400, getItem, addBarcode success/409-conflict, receiveStock, lookupBarcode), mocking the three services the same way `emr.controller.test.ts` mocks `EmrService`/`ConsultationLockService` — there's no Fastify-app-level route-integration-test convention anywhere in this codebase to match instead.

### Database: seed.ts and RLS

- **`prisma/seed.ts`** — added 4 new permission codes (`MANAGE_INVENTORY_STOCK`, `DISPENSE_INVENTORY`, `MANAGE_INVENTORY_PRICES`, `EXPORT_INVENTORY_DATA`) alongside the existing `VIEW_INVENTORY`/`MANAGE_INVENTORY`, and updated `DEFAULT_ROLE_PERMISSIONS` so Clinician/FrontDesk/InventoryManager match D-41 through D-44 (see Deviations for why role assignment moved here instead of a role-string map).
- **`prisma/rls/phase-05-inventory-rls.sql`** (new) — `CREATE EXTENSION IF NOT EXISTS pg_trgm`, a GIN trigram index on `inventory_items.name`, and RLS `ENABLE`/`CREATE POLICY` for all 6 inventory tables (`inventory_items`, `inventory_barcodes`, `stock_batches`, `stock_movements`, `clinic_inventory_categories`, `clinic_inventory_units`), keyed on `app.clinic_id` (confirmed against `prisma-rls.ts`'s `SET LOCAL app.clinic_id` and `post-migrate.sql`'s policies — not the inconsistent `app.current_clinic_id` used in `phase-03-patient-queue-rls.sql`). Placed alongside `phase-03-patient-queue-rls.sql` in `prisma/rls/`, following that file's exact per-phase pattern rather than folding into `post-migrate.sql` (which only covers 3 cross-cutting tables, not the phase 3/4-style tenant tables).

## Verification

- `npx vitest run apps/api/src/modules/inventory/__tests__/ --reporter=verbose` — **4 files passed, 37 tests passed** (18 service + 4 barcode-lookup + 8 permission-middleware + 7 controller)
- `npx tsc --noEmit -p apps/api/tsconfig.json` — **exit 0**
- `npx vitest run apps/api/src/ --reporter=verbose` (full API unit suite, to check for regressions) — **13 files passed, 180 tests passed**
- RLS SQL syntax verified by running `phase-05-inventory-rls.sql` inside a `BEGIN; ... ROLLBACK;` transaction against the real dev Postgres container with disposable stub tables standing in for the 6 real ones (which don't exist yet — see below); all 6 policies were created successfully, then rolled back, leaving the dev DB untouched.

## Deviations from Plan (with justification)

| Plan text | What was actually built | Why |
|---|---|---|
| `middleware/inventory-permissions.middleware.ts`: hardcoded map of role-name strings (`admin`/`clinician`/`inventory_manager`/`front_desk`) read off `request.user.role`, plus a `request.user.customPermissions` override check | `INVENTORY_PERMISSIONS` maps each action to a **permission code** (`VIEW_INVENTORY`, `MANAGE_INVENTORY_STOCK`, `DISPENSE_INVENTORY`, `MANAGE_INVENTORY_PRICES`, `EXPORT_INVENTORY_DATA`); `requireInventoryPermission()` calls `request.server.permissionService.getUserPermissions()`, identically to how `requirePermission()` in `middleware/authorize.ts` already gates every other module's routes (`auth.routes.ts`, `clinic.routes.ts`) | `request.user` (set by `authenticate.ts`) only ever carries `{ id, activeClinicId }` — there is no `.role` field anywhere in this codebase, and no `customPermissions` concept either. Role → permission resolution is *always* done through `ClinicMember → ClinicMemberRole → Role → RolePermission` plus per-user `UserPermissionOverride` rows via `PermissionService`, whose returned list already has overrides folded in. Following the plan's literal snippet would have required inventing a parallel, unused authorization mechanism instead of matching the one real convention this codebase actually has. |
| Same middleware file: role rules encoded directly in the middleware | D-41–D-44 role→permission mapping instead lives in `prisma/seed.ts`'s `DEFAULT_ROLE_PERMISSIONS` (Clinician gets `DISPENSE_INVENTORY`; FrontDesk gets `MANAGE_INVENTORY_STOCK` but not dispense/prices; InventoryManager gets all four new codes; Admin gets everything via the existing `PERMISSIONS.map(p => p.code)`) | This is where every other role/permission default in the app already lives — putting D-41–D-44 there instead of hardcoding it in the middleware keeps the "who can do what" answer in one place and makes it overridable per-user through the existing `UserPermissionOverride` mechanism (Admin can override per-user per Phase 1 D-16), which the plan's own middleware sketch couldn't support since it read a nonexistent field. |
| `InventoryController` constructor/handlers implied to look like `EmrController`/`PatientController` (factory functions `createXController()` returning a plain handlers object) — but acceptance criteria explicitly requires `class InventoryController` | Implemented as an actual `class` with arrow-function instance properties for handlers (so they can be passed directly as Fastify handlers without losing `this`) | The plan's acceptance_criteria section literally greps for `class InventoryController`, which conflicts with the rest of the codebase's factory-function controller convention. Honored the literal, checkable acceptance criterion; kept everything else (safeParse validation, `{error:{code,message}}` shape, `request.user.activeClinicId`) identical to the factory-based controllers so the deviation is purely structural. |
| Repository/service input types described loosely as `CreateItemInput`/`UpdateItemInput` etc. from `@breeyo/types` | Repository methods typed against the *zod-inferred* types (`CreateItemSchemaInput`, `UpdateItemSchemaInput` from `@breeyo/validators`) instead | `barcodeEntrySchema.format` is `z.enum(BARCODE_FORMAT_VALUES as [string, ...string[]])`, which zod infers as plain `string`, not the `BarcodeFormat` literal union `@breeyo/types.CreateItemInput.barcodes[].format` expects. Passing the already-validated, already-defaulted zod output straight through avoids fighting a type mismatch that has no runtime consequence (this is a Plan 05-01 pre-existing choice, not introduced here). |
| Return types for `findByBarcode`/`lookup`/`addBarcode` implied to line up 1:1 with `@breeyo/types` interfaces (`InventoryItem.sellingPrice: number`, etc.) | Repository methods return raw Prisma rows (with `Decimal` fields) without coercion; `BarcodeLookupService.lookup()` does one `as unknown as BarcodeLookupResult` cast at its single return site instead of manually converting every `Decimal` | Prisma returns `Decimal` objects for `sellingPrice`/`purchasePrice`/`unitPrice`; no existing module in this codebase (patient, EMR, billing) converts Decimal to `number` before returning — they all return raw Prisma shapes and let JSON serialization (`Decimal.prototype.toJSON`) handle the wire format. Matching that existing precedent instead of introducing a one-off Decimal-to-number mapper that no other module has. |
| `apps/api/src/lib/prisma.ts` (read_first target) | Used `fastify.prisma` (the plugin-decorated base `PrismaClient`, same as `PatientRepository`/`EmrRepository`) for all repository/service constructors, not `request.db` from `tenant-context.ts` | `apps/api/src/lib/prisma-rls.ts`'s `createTenantClient()` is what `tenant-context.ts` assigns to `request.db`, but a repo-wide grep shows **no module** actually consumes `request.db` — every repository (`PatientRepository`, `EmrRepository`, and now `InventoryItemRepository`) takes `fastify.prisma` and relies on explicit `clinicId` filters in every query instead. Matched the pattern every other module actually uses rather than being the first to wire up a code path nothing else exercises. |
| Task 1 test scope per plan's `<action>` §6: only `inventory-item.service.test.ts` and `barcode-lookup.test.ts` | Added `inventory-permissions.middleware.test.ts` (8 tests) and, for Task 2, `inventory-item.controller.test.ts` (7 tests) | Per the orchestrator's explicit instruction ("Task 2 ... should still have tests"), and because the middleware's authorization logic was substantially redesigned from the plan's literal snippet (see above) — a dedicated test suite verifies the D-41–D-44 role rules actually hold under the real permission-code mechanism, rather than trusting an untested rewrite. |
| D-61 custom category/unit `label` vs `value` | Both set to the exact string the caller typed for `category`/`unit` (`{ value: category, label: category }`), not a separate slugified value + human label | `CreateItemInput`/`UpdateItemInput` only carry a single `category: string` / `unit: string` field — there's no separate "display label" input to slugify from. Storing the exact typed string for both keeps `InventoryItem.category` and the merged category-list `value` identical (so future item creation can pick the same string back out of the list), avoiding an invented slugification scheme the plan never specified. |

## Database Migration — Deliberately Not Applied (continuing Plan 05-01's documented gap)

Per the orchestrator's explicit instruction, `prisma migrate dev` was **not** run. Verified directly against the live dev Postgres (`breeyo-postgres-1`, port 5433): the database currently has only 13 tables (`auth_audit_log`, `clinic_member_roles`, `clinic_members`, `clinics`, `consent_records`, `device_tokens`, `notifications`, `permissions`, `refresh_tokens`, `role_permissions`, `roles`, `users`) — **none** of the Phase 3/4/5 tables (`pets`, `pet_owners`, `consultations`, `inventory_items`, etc.) exist yet, confirming the migration-history drift Plan 05-01 flagged is real and unrelated to this plan. This also means:
- All 37 inventory tests in this plan are unit tests against a **mocked** `InventoryItemRepository`/`PrismaClient` — no test in this plan touches the real database, matching the existing `src/**/*.test.ts` convention used by every other module's unit tests (integration tests live separately under `tests/**/*.test.ts` and require a real DB, per `vitest.config.ts`).
- `prisma/rls/phase-05-inventory-rls.sql` could not be applied against the real `inventory_items`/etc. tables (they don't exist). It was instead verified for syntax correctness by running it inside a `BEGIN; ... ROLLBACK;` transaction against the live dev container with disposable stand-in tables of the same names — all 6 `CREATE POLICY` statements succeeded, confirming the SQL is correct, then the transaction was rolled back so nothing persisted. **This file still needs to be run for real** (as `breeyo_admin`, immediately after whoever resolves the migration-history drift runs `prisma migrate dev`/`deploy` for Phase 3 through 5's models), the same manual-step nature as `prisma/rls/phase-03-patient-queue-rls.sql`.

## Self-Check: PASSED

- [x] All 13 created files exist on disk; 2 modified files updated
- [x] TDD: `inventory-item.service.test.ts`, `barcode-lookup.test.ts`, `inventory-permissions.middleware.test.ts` written first, confirmed failing (`Failed to load url ... Does the file exist?`) before any implementation file existed, then implementation added until all passed
- [x] All acceptance-criteria grep strings verified present in every file (`class InventoryItemRepository`, `create(`, `list(`, `findByBarcode(`, `getBarcodeCatalog(`, `similarity`, `listCategories(`, `listUnits(`, `generatePhotoUploadUrl(`, `ClinicInventoryCategory`, `class InventoryItemService`, `createItem`, `listItems`, `getSummary`, `getCategories`, `getPhotoUploadUrl`, `class StockReceiptService`, `receiveStock`, `EXPIRY_REQUIRED_CATEGORIES`, `class BarcodeLookupService`, `lookup`, `getCatalog`, `INVENTORY_PERMISSIONS`, `requireInventoryPermission`, `class InventoryController`, `BARCODE_CONFLICT`, all 13 route paths, `inventoryRoutes` in `app.ts`)
- [x] `npx vitest run apps/api/src/modules/inventory/__tests__/ --reporter=verbose` — 4 files, 37 tests, all passed
- [x] `npx tsc --noEmit -p apps/api/tsconfig.json` — exit 0
- [x] Full API unit suite (`src/**/*.test.ts`) re-run to confirm no regressions — 13 files, 180 tests, all passed
- [x] RLS SQL and pg_trgm index written and syntax-verified in a rolled-back transaction; not applied to the real dev DB because the target tables don't exist yet (pre-existing migration drift, not introduced by this plan) — documented, not silently skipped
