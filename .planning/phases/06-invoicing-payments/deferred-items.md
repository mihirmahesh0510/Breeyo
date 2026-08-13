# Deferred Items — Phase 06

Out-of-scope discoveries logged during execution. Not fixed by the plan that
found them.

## Found during 06-02 (D-30 tenant-handle conversion)

### 1. `inventory` module is still on the admin client and is unowned — RESOLVED in 06-20

**Resolved by plan 06-20** (commit `cd80720`), which folded the conversion into
its own scope rather than adding the allowlist entry this item warned about.
`scripts/check-tenant-client.sh` therefore ships with no inventory allowlist.
Original text preserved below.

---


`apps/api/src/modules/inventory/inventory.routes.ts` and
`dispense.routes.ts` construct eight services from `fastify.prisma`:
`InventoryItemRepository`, `StockReceiptService`, `StockMovementService`,
`FifoDispenseService`, `StockAdjustmentService`, `StockTakeService`,
`ParLevelAlertService`, `WantListService`.

Plan 06-02 covers six modules; plan 06-20 is scoped to "the remaining two
modules (notifications, clinic)". **Inventory is in neither.** It is Phase 5
work that landed after the 06-20 plan text was written. All six inventory
tables (`inventory_items`, `inventory_barcodes`, `stock_batches`,
`stock_movements`, `clinic_inventory_categories`, `clinic_inventory_units`)
received RLS policies in plan 06-00, so the policies exist but nothing
reaches them through the tenant handle.

Impact: the same D-30 class of defect this phase is closing, on stock and
dispense data. Needs an owner before the `scripts/check-tenant-client.sh`
gate in 06-20 Task 2 lands, or the gate will need an allowlist entry — which
06-20's plan text explicitly wants to avoid.

### 2. `prisma/seed.ts` does not load `.env`

`pnpm db:seed` fails with `Environment variable not found: DATABASE_URL`
because `prisma/seed.ts` never calls `dotenv.config()` — unlike
`tests/helpers/setup.ts`, which does. Works only when the variables are
already exported into the shell.

Impact: a fresh checkout cannot seed RBAC reference data with the documented
command, and every `roles`/`permissions`-dependent test fails (22 of them)
until it is seeded. One-line fix, but it is unrelated to the D-30 work.

### 3. `QueueRepository.archiveEntries(today)` has no `clinicId` parameter

Called by the midnight-archive cron job across all clinics by design. It is
one of the documented admin-client exemptions 06-20 Task 1 is meant to write
up. Recorded here so the exemption list is complete: the job legitimately
needs the raw client, which is why `DbClient` keeps a `PrismaClient` arm.

## Found during 06-20 (exemption list + CI gate)

### 4. The `tests/inventory/` integration suite is entirely `it.todo`

All 80 tests across nine files in `apps/api/tests/inventory/` are placeholders:
`item-crud` (21), `stock-receipt` (12), `fifo-dispense` (10), `stock-movement`
(9), `stock-adjustment` (8), `par-level-alerts` (6), `barcode-lookup` (5),
`offline-queue` (5), `want-list` (4). Phase 5 shipped the module with unit
tests over mocked Prisma clients and no HTTP-level coverage at all.

Plan 06-20 added three HTTP tests to `tenant-isolation.test.ts` covering the
paths its conversion touched (list, receive→dispense, cross-tenant IDOR), but
that is tenancy coverage, not functional coverage — FIFO ordering, expiry
blocking, batch override, insufficient-stock handling and the offline replay
queue remain unexercised against a real database.

Impact: out of scope for a tenancy plan, but the inventory write path is now
one of the least-covered surfaces in the API relative to its risk.

### 6. `pnpm --filter @breeyo/mobile exec tsc --noEmit` reports 61 pre-existing errors

Found during 06-04. The mobile typecheck does not currently exit 0, independent
of anything Phase 6 has touched. Every error is in one of two buckets:

- **`packages/ui/src/**/*.ts` (16 files, the bulk of the errors).** These are
  `.ts` files — not `.tsx` — calling `React.createElement` against
  `react-native-paper` components. Under the resolved Paper typings, `Text`
  requires a `children` prop that the positional-argument call style does not
  satisfy, and `WizardStepper.ts` additionally casts the MD3 colour object to
  `Record<string, string>` when `elevation` is a nested object.
- **9 `apps/mobile` feature files** (`ConsultationScreen.tsx`,
  `PatientDetailScreen.tsx`, `AuthProvider.tsx`, `useFileUpload.ts`, others).

Verified unrelated to 06-04: filtering the tsc output for `gst|billing|invoice|
slab|hsn` matches **0** lines, and neither `GstRatePicker.tsx` nor
`ItemFormScreen.tsx` — the two mobile consumers of the constants 06-04 changed —
appears in the error set.

Impact: plan 06-04's verification block asks for a clean mobile typecheck, which
cannot be satisfied without fixing Phase 2 UI-library code. Needs an owner before
any mobile billing plan (06-12 onward) can use a green typecheck as its gate.

### 5. (withdrawn) `apps/mobile` tests in CI

Recorded as a suspected gap, then disproved before filing: `turbo test
--dry-run` lists `@breeyo/mobile#test` among the ten tasks the root `pnpm test`
runs, so 06-01's `pdf-deps.test.ts` is already covered by CI. No action needed.
