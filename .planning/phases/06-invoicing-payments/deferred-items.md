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

## Found during 06-06 (numbering, encryption, billing audit log)

### 7. `@breeyo/api`'s `test` script is `vitest` (watch mode), not `vitest run`

`apps/api/package.json` sets `"test": "vitest"`. Every plan in this phase writes
its verify block as `pnpm --filter @breeyo/api test -- <file>`, which therefore
starts an interactive **watch session** rather than a one-shot run. It never
exits, so an agent or CI step invoking it either hangs until timeout or reports
a misleading status — in this plan's case the watcher was still running after
600 s and then exited **1** when a scratch file was deleted, which looks exactly
like a test failure and is not one.

Every sibling package uses the one-shot form (`packages/ui`, `packages/types`,
`packages/validators` all run `vitest run`), so `apps/api` is the outlier.

Workaround used here: invoke `./node_modules/.bin/vitest run` directly.

Impact: low severity, high nuisance, and it actively produces false failure
signals. One-line fix (`"test": "vitest run"`, with a separate `test:watch`),
but changing the API's test entrypoint mid-phase would touch every remaining
plan's verify block, so it is recorded rather than done here.

### 8. `prisma/seed.ts` is required before the API suite passes (extends item 2)

Confirming and quantifying deferred item 2 from 06-02. On a freshly migrated
database the full API suite reports **25 failed / 560 passed**; every failure is
a `403` from a permission check, because `roles` and `permissions` are empty.
After running the seed the same suite is **585 passed / 0 failed** (9 skipped,
80 todo).

The seed cannot be run with the documented `pnpm db:seed` because `seed.ts`
never calls `dotenv.config()`; it must be invoked with `DATABASE_URL` exported
into the shell.

Impact: any executor or reviewer running the API suite on a new worktree
database will see 25 red tests that have nothing to do with their change. Worth
fixing (one `dotenv.config()` call) before the next wave, so the phase's test
signal is trustworthy by default.

## Found during 06-07 (invoice domain: repository, stock validator, service)

### 9. Two different FIFO orderings now exist for the same batch table

`FifoDispenseService.dispense` (Phase 5) selects batches with
`ORDER BY received_at ASC`. `StockValidatorService.reserveAndDeduct` (this plan)
selects with `ORDER BY expiry_date ASC NULLS LAST, received_at ASC`, because
06-07's acceptance criteria require expiry-ascending selection and
first-expiry-first-out is the correct practice for pharmaceuticals.

The two agree whenever expiries are absent or ordered the same way as receipts,
which is the common case, and both exclude expired batches identically. They
diverge when an older-received batch has a later expiry than a newer-received
one: Phase 5 draws from the older receipt, Phase 6 from the earlier expiry.

Not fixed here because changing Phase 5's shipped dispense ordering is outside
this plan's scope and would need its own regression pass. Worth reconciling on
one ordering (recommend FEFO everywhere) before the phase closes.

### 10. `voidInvoice` cancels Razorpay links locally but nothing calls the gateway yet

D-35 requires that voiding an invoice with an active payment link cancels that
link at Razorpay. `InvoiceRepository.voidInvoice` marks the local `payments`
rows `cancelled` inside the void transaction and returns
`cancelledPaymentLinkIds` so a caller can perform the API call, and
`InvoiceService.voidInvoice` propagates that list to its own caller.

The gateway call itself is not implemented — it belongs to the Razorpay module
(plan 06-09/06-10). Until that lands, a voided invoice's link is dead in this
system but still live at Razorpay. The state needed to close it is present and
must not be dropped when the payment module is wired.

### 11. `middleware/error-handler.ts` previously discarded `error.details`

Fixed in this plan (commit `aafc966`) rather than deferred, because BIL-02
requires the 409 to name every short item and the handler forwarded only
`error.clinics`. Recorded here so other modules know the channel now exists:
any 4xx domain error may carry a `details` object and it will reach the client.
The `>= 500` branch returns before that point, so nothing internal can leak.

## Found during 06-08 (invoice HTTP surface)

### BLOCKER-06-08-01 — `createTenantClient` interactive transactions are not atomic

**Severity: blocker.** Escalated under deviation Rule 4 (architectural). NOT fixed
by plan 06-08. Owning file `apps/api/src/lib/prisma-rls.ts` (plan 06-02), outside
06-08's scope.

**What was observed.** Two concurrent `POST /billing/invoices/:id/finalize`
requests, each claiming the last unit of the same `StockBatch`, BOTH returned 200
and the batch's `current_qty` ended at **-1**. Stock was oversold.

**Root cause.** `createTenantClient` binds the RLS GUC by wrapping every operation:

```ts
base.$extends({
  query: {
    async $allOperations({ args, query }) {
      const [, result] = await base.$transaction([
        base.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`,
        query(args),
      ]);
      return result;
    },
  },
});
```

That extension also applies to operations issued on the `tx` handle of an
interactive `$transaction(async (tx) => ...)`, and its body opens a **new**
transaction on `base`. So every statement inside what looks like one transaction
runs in its own short transaction:

* `SELECT ... FOR UPDATE` acquires its row lock and **releases it immediately**,
  so two finalizes both see the batch as available — hence the oversell.
* The transaction is not atomic at all. Proven directly: a write inside
  `db.$transaction(async (tx) => { ...write...; throw })` **persists** after the
  throw. Expected 5, observed 2.

**Blast radius.** Every module that takes `request.db` and calls `$transaction`
believing it atomic — billing (finalize, void, mark-paid), EMR, inventory.
`invoice.repository.ts` documents "Finalize atomicity" as invariant #3; that
invariant does not hold at runtime. It went unnoticed because every earlier
transactional test — including `tests/billing/numbering-concurrency.test.ts` —
drives the plain admin `PrismaClient`, whose `$transaction` is genuine. Plan 06-08
is the first to run a transactional write through the HTTP tenant handle.

**Why not auto-fixed.** A correct fix changes the tenancy primitive all five
completed phases run on, and must simultaneously preserve T-06-01 (GUC provably
transaction-local and on the same connection as the guarded query) and 06-02's
deliberate `TenantPrismaClient` / `TenantTransactionClient` typing that exists to
prevent casting between extended and raw handles. Candidate approaches —
overriding `$transaction` in a client extension and yielding the raw `tx`, or
tracking depth in `AsyncLocalStorage` and short-circuiting `$allOperations` — each
carry correctness and typing consequences well beyond a plan scoped to "expose the
invoice domain over HTTP".

**Current state.** `tests/billing/finalize-stock.test.ts -t "concurrent"` is left
**failing on purpose**. It encodes a stated success criterion of plan 06-08 and
threat T-06-132; silencing it would hide a live overselling defect. Rest of the API
suite is green: 751 passed, 1 failed.

### 12. `seed.ts` could not revoke a permission (fixed in this plan)

`seed.ts` only ever `upsert`ed role-permission rows, so removing a permission from
`DEFAULT_ROLE_PERMISSIONS` had no effect on an already-seeded database. The D-05
removal of `CREATE_INVOICES` from Clinician would have passed on fresh CI and been
inert on every dev and staging environment. Fixed in commit `9e68d03`: the seed now
deletes per-role grants whose code is no longer in the map. Recorded here because
any future role-permission removal depends on this behaviour, and because existing
environments still need `redis-cli --scan --pattern 'perms:*' | xargs -r redis-cli del`
plus a reseed for the change to take effect.
