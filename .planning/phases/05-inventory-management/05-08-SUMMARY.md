---
phase: 05-inventory-management
plan: 08
subsystem: inventory-hsn-gst
tags: [prisma, zod, types, constants, mobile-form, TDD]
dependency_graph:
  requires: [inventory-types, inventory-validators, inventory-item-crud-api, inventory-mobile-list-and-item-screens]
  provides: [inventory-item-hsn-sac-gst-fields]
  affects: [06-04]
tech_stack:
  added: []
  patterns: [zod-optional-nullable-field, category-based-reference-data-without-enforcement]
key_files:
  created:
    - packages/types/src/constants/hsn-codes.ts
    - apps/mobile/src/features/inventory/components/GstRatePicker.tsx
  modified:
    - apps/api/prisma/schema.prisma
    - packages/types/src/inventory.ts
    - packages/types/src/constants/index.ts
    - packages/validators/src/inventory.ts
    - packages/validators/src/__tests__/inventory.validators.test.ts
    - apps/api/src/modules/inventory/inventory-item.repository.ts
    - apps/api/src/modules/inventory/inventory-item.service.ts
    - apps/api/src/modules/inventory/__tests__/inventory.fixtures.ts
    - apps/api/src/modules/inventory/__tests__/inventory-item.service.test.ts
    - apps/mobile/src/features/inventory/screens/ItemFormScreen.tsx
    - apps/mobile/src/features/inventory/components/ItemDetailsTab.tsx
metrics:
  duration: ~1.5 hours
  completed: 2026-08-13
  tasks_completed: 2
  tasks_total: 2
---

# Phase 05 Plan 08: HSN/SAC Code + GST Rate on Inventory Items Summary

Added `hsnSacCode` (String?, 4-8 digit regex) and `gstRate` (Decimal(5,2)?, 0-28% range) to `InventoryItem` end-to-end -- Prisma schema, shared types, zod validators, item CRUD repository/service, veterinary HSN reference constants, and mobile item form + item profile Details tab. Per D-62, both fields are fully optional on every item regardless of category, with no save-time enforcement (unlike D-27's category-based expiry requirement) -- this was verified by an explicit test case and no category-conditional validation was added anywhere in the stack.

## What Was Built

### Task 1: Schema, shared types, validators, HSN constants, API service (TDD)

- **`apps/api/prisma/schema.prisma`** -- added `hsnSacCode String? @map("hsn_sac_code")` and `gstRate Decimal? @map("gst_rate") @db.Decimal(5, 2)` to the `InventoryItem` model, directly after `currentStock`. `npx prisma validate` passes; `npx prisma generate` regenerated the client (required for the API's `tsc` to type-check the fields on `InventoryItem` return values -- see Deviations for why this step mattered).
- **`packages/types/src/inventory.ts`** -- added `hsnSacCode: string | null` and `gstRate: number | null` to `InventoryItem`, `CreateItemInput`, and `UpdateItemInput`.
- **`packages/types/src/constants/hsn-codes.ts`** (new) -- `GST_RATE_SLABS = [0, 5, 12, 18, 28] as const`; `COMMON_VET_HSN_CODES` with all 14 entries from the plan (4 medicine, 2 vaccine, 3 surgical supply, 2 lab consumable, 2 food/supplement, 1 equipment), each `{ code, description, category, defaultGstRate }`; `getHsnSuggestions(category)` filtering helper. Re-exported via `packages/types/src/constants/index.ts`.
- **`packages/validators/src/inventory.ts`** -- added to `createItemSchema`: `hsnSacCode: z.string().regex(/^[0-9]{4,8}$/, 'HSN/SAC code must be 4-8 digits').nullable().optional()` and `gstRate: z.number().min(0, 'GST rate cannot be negative').max(28, 'GST rate cannot exceed 28%').nullable().optional()`. `updateItemSchema` (derived via `createItemSchema.partial().omit({barcodes:true})`) inherits both automatically as optional partial fields -- no separate edit needed.
- **`apps/api/src/modules/inventory/inventory-item.repository.ts`** -- `create()` now includes `hsnSacCode: input.hsnSacCode ?? null` and `gstRate: input.gstRate ?? null` in the Prisma create payload; `update()` includes both fields in the conditional spread (`...(input.hsnSacCode !== undefined && { hsnSacCode: input.hsnSacCode })`, same pattern as every other optional field). `findById`/`list` needed no changes -- Prisma returns all model columns by default.
- **`apps/api/src/modules/inventory/inventory-item.service.ts`** -- `createItem()` now normalizes omitted `hsnSacCode`/`gstRate` to explicit `null` before calling `repository.create()` (see Deviations for why this one-line normalization was added).
- **`apps/api/src/modules/inventory/__tests__/inventory.fixtures.ts`** -- `mockItem` now carries `hsnSacCode: '30049099'`, `gstRate: 12`; added `mockItemNoHsn` (both null, category `general_supply`) for the "not set" UI/logic paths; `mockItemVaccine`/`mockItemEquipment` also updated with `hsnSacCode`/`gstRate` (one populated, one null) since `InventoryItem` no longer allows omitting these fields on a typed object literal.
- **Tests (TDD)** -- `apps/api/src/modules/inventory/__tests__/inventory-item.service.test.ts`: 22 new cases across `createItem` (valid/missing HSN+GST, 4/6/8-digit codes, non-numeric/too-short/too-long rejection, all 5 GST slabs accepted, >28 and negative rejected, medicine-category item without HSN succeeds per D-62), `updateItem` (hsnSacCode-only, gstRate-only, clearing to null, invalid gstRate rejected), and `getItem` (returns both fields; returns null for `mockItemNoHsn`). Also extended `packages/validators/src/__tests__/inventory.validators.test.ts` with 21 new cases (schema-level equivalents plus `GST_RATE_SLABS`/`COMMON_VET_HSN_CODES`/`getHsnSuggestions` constant tests) since the plan's own top-level `<verification>` section names that file explicitly.

### Task 2: Mobile item form and Details tab

- **`apps/mobile/src/features/inventory/components/GstRatePicker.tsx`** (new) -- chip row for "None" + the 5 `GST_RATE_SLABS` values. Built with raw `Pressable`/`Text` (not `@breeyo/ui`'s `BreeyoChip`) because the plan requires the exact selected/unselected colors (`primaryContainer` `#C8E6C9` / `surfaceVariant` `#F5F0EB`) and `BreeyoChip` doesn't expose a style override -- it just forwards to `react-native-paper`'s `Chip` with its own theme-driven selected color. Props: `value: number | null`, `onChange`, `label` (default `"GST Rate"`), helper text "Select the applicable GST slab for this item".
- **`apps/mobile/src/features/inventory/screens/ItemFormScreen.tsx`** -- added HSN/SAC Code field (label "HSN/SAC Code (optional)", `keyboardType="number-pad"`, `maxLength={8}`, placeholder "e.g., 30049099", helper "4-8 digit code for GST invoicing") and the `GstRatePicker`, positioned after Par Level and before the Schedule H toggle. Category-aware autocomplete: typing 2+ digits shows up to 5 suggestions from `getHsnSuggestions(category)` filtered by code prefix, rendered as tappable rows below the input; tapping one fills `hsnSacCode` and auto-selects the suggestion's `defaultGstRate` in the picker. Both fields flow through `buildPayload()` (used by `handleSave`) and the silent create-mode draft-item payload, and are pre-filled from `existingItemQuery.data` in edit mode. Inline validation errors surface via the existing `errors.hsnSacCode`/zod-issue mapping.
- **`apps/mobile/src/features/inventory/components/ItemDetailsTab.tsx`** -- new "HSN/SAC & GST" section above "Barcodes": shows `HSN/SAC Code: [code] ([description])` when a `COMMON_VET_HSN_CODES` match exists (else just the code), or "HSN/SAC Code: Not set" in muted text; shows `GST Rate: [rate]%` plus a `primaryContainer`-colored chip, or "GST Rate: Clinic default" in muted text; when both are absent, an italic prompt "Set HSN code and GST rate for GST-compliant invoicing" appears.
- **`apps/mobile/src/features/inventory/hooks/useInventoryApi.ts`** -- no changes needed. `useCreateItem`/`useUpdateItem` are already typed against `CreateItemSchemaInput`/`UpdateItemSchemaInput` (the zod-inferred types from `@breeyo/validators`, per Plan 05-04's documented type-inference workaround), so once `createItemSchema`/`updateItemSchema` gained `hsnSacCode`/`gstRate`, both mutation hooks picked up the new optional fields automatically -- confirmed via a clean mobile `tsc` run, not just visual inspection.

## Deviations from Plan (with justification)

| Plan text | What was actually built | Why |
|---|---|---|
| File paths use generic `packages/shared/src/types/inventory.types.ts`, `packages/shared/src/validators/inventory.validators.ts`, `packages/shared/src/constants/hsn-codes.ts` | Used the real paths from Plan 05-01: `packages/types/src/inventory.ts`, `packages/validators/src/inventory.ts`, `packages/types/src/constants/hsn-codes.ts` | Per the orchestrator's brief and 05-01-SUMMARY.md's documented mapping -- this repo has separate `@breeyo/types`/`@breeyo/validators` packages, not a unified `shared` package. |
| Plan step 3 implies editing `UpdateItemInput` explicitly if not derived from `.partial()` | `packages/types/src/inventory.ts`'s `UpdateItemInput` is a hand-written interface (not derived), so `hsnSacCode?`/`gstRate?` were added directly to it as the plan's own fallback instruction specifies | Matches the plan's own conditional guidance ("If `UpdateItemInput` is defined separately ... add the same two optional fields"). |
| `createItemSchema.parse()` output passed straight through to `repository.create()` with no service-layer change (plan's step 8 says "Ensure the validated output is passed through without stripping") | Added a 4-line normalization in `InventoryItemService.createItem()` that maps omitted `hsnSacCode`/`gstRate` to explicit `null` before calling `repository.create()` | Without this, `createItemSchema`'s `.nullable().optional()` fields are simply absent from the zod output when omitted (not `null`), so a test asserting "repository.create called with hsnSacCode null and gstRate null" (a literal behavior bullet in the plan) would fail on an object with the keys missing entirely rather than set to `null`. This single normalization satisfies that exact bullet without changing the schema's public contract (still nullable + optional, matching D-62). |
| No explicit instruction to run `prisma generate` | Ran `npx prisma generate` after the schema edit, before running `apps/api`'s `tsc` | Without regenerating the Prisma client, `@prisma/client`'s `InventoryItem` type still lacked `hsnSacCode`/`gstRate`, causing 7 `tsc` errors (both in the repository's `create()` call and in test assertions reading `result.hsnSacCode` off a mocked-but-Prisma-typed return value). This is the same category of gap Plan 05-01 flagged for the *database* migration (deliberately not run due to pre-existing migration-history drift unrelated to this plan) -- but the Prisma Client generation step is local codegen only, has no database dependency, and is required for the API to compile at all, so it was run. |
| Plan's `<action>` for the mobile form doesn't specify how the "FlatList" of suggestions should coexist with the screen's existing top-level `ScrollView` | Rendered suggestions as a `.map()`'d list of `Pressable` rows inside a `View`, not a literal `FlatList` | React Native warns/misbehaves when a `VirtualizedList` (which `FlatList` is) is nested inside a plain `ScrollView` -- exactly the situation here, since `ItemFormScreen`'s entire body is one `ScrollView`. A max-5-item mapped list is visually and functionally identical to a `FlatList` for this size and avoids the nested-virtualization warning. |
| Plan's autocomplete behavior text says suggestions come from `getHsnSuggestions(category)` gated only by "typed at least 2 digits" | Suggestions are `getHsnSuggestions(category)` further filtered by `entry.code.startsWith(typedDigits)` | A category can have multiple HSN entries (e.g. `medicine` has 4); filtering by what's actually been typed makes the autocomplete useful rather than always showing the same fixed list regardless of input, which is the ordinary meaning of "autocomplete." |
| Plan step 9 ("Task 2") mentions only `ItemFormScreen.tsx`/`ItemDetailsTab.tsx`/`GstRatePicker.tsx`/`useInventoryApi.ts` in files_modified | `useInventoryApi.ts` was read and verified but not modified | Per the plan's own step 4 fallback instruction ("If they pass the form data object through directly, no change is needed") -- confirmed via a clean `tsc` run that the zod-inferred mutation types already widened automatically once the shared schemas changed. |

## Verification

- `npx prisma validate` (from `apps/api/`) -- **"The schema at prisma/schema.prisma is valid"**
- `npx prisma generate` (from `apps/api/`) -- **Prisma Client generated successfully**
- `npx vitest run apps/api/src/modules/inventory/__tests__/inventory-item.service.test.ts --reporter=verbose` -- **40 passed (40)**, 22 of which are new HSN/GST cases
- `npx vitest run packages/validators/src/__tests__/inventory.validators.test.ts --reporter=verbose` -- **57 passed (57)**, 21 of which are new HSN/GST cases
- `npx vitest run apps/api/src/modules/inventory/__tests__/ --reporter=verbose` (full inventory module suite) -- **8 files, 110 passed**
- `npx vitest run apps/api/src/` (full API unit suite, regression check) -- **18 files, 263 passed**, no regressions
- `npx tsc --noEmit -p apps/api/tsconfig.json` -- **exit 0**
- `npx tsc --noEmit -p apps/mobile/tsconfig.json` -- **exit 0** (same as baseline's exit code); diffed against `.pre-existing-tsc-baseline.txt`: **empty diff, 71 errors in both** -- zero new TypeScript errors introduced by any file this plan touched
- `npx vitest run` (full `apps/mobile` suite, regression check) -- **12 files, 162 passed**, no regressions

## Self-Check: PASSED

- [x] All 2 created files exist on disk (`hsn-codes.ts`, `GstRatePicker.tsx`); all 11 modified files updated
- [x] TDD honored for the schema/service layer: HSN/GST test cases were added to `inventory-item.service.test.ts` and `inventory.validators.test.ts` covering every behavior bullet in the plan (4/6/8-digit acceptance, non-numeric/too-short/too-long rejection, all 5 GST slabs, out-of-range/negative rejection, partial-update cases, D-62's no-category-enforcement case) and run to a passing state alongside the implementation
- [x] D-62 respected throughout: no category-conditional validation was added anywhere (schema, service, repository, or mobile form) for `hsnSacCode`/`gstRate` -- confirmed by an explicit test (`creates a medicine-category item without hsnSacCode/gstRate`) and by the constants file's `getHsnSuggestions` being pure reference data with no gating logic
- [x] All acceptance-criteria grep strings from both tasks verified present via direct `grep` against every named file, including the single-line literal forms (`hsnSacCode: z.string().regex`, `gstRate: z.number().min(0`) the plan's acceptance criteria check for
- [x] `npx tsc --noEmit -p apps/mobile/tsconfig.json` diffed against `.pre-existing-tsc-baseline.txt` with an automated `diff` command -- empty diff, confirming zero new errors (not just a matching count)
- [x] Full API (263 tests) and full mobile (162 tests) suites re-run after all changes to confirm no regressions
- [x] Deviations documented with concrete evidence (grep output, `tsc` error counts) rather than silently diverging from the plan's generic snippets
