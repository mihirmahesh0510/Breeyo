# Deferred Items — Phase 06

Out-of-scope discoveries logged during execution. Not fixed by the plan that
found them.

## Found during 06-02 (D-30 tenant-handle conversion)

### 1. `inventory` module is still on the admin client and is unowned

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
