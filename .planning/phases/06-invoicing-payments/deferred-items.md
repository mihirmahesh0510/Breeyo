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

**STATUS: RESOLVED** by hotfix **06-00b** (`apps/api/src/lib/prisma-rls.ts`).
Re-verified from plan 06-08 after merging: `finalize-stock.test.ts` 7/7, all 25
plan tests, full API suite **759 passed / 0 failed** — with no change to any file
delivered by 06-08. Retained here as a record of the defect and its resolution.

**Originally:** severity blocker, escalated under deviation Rule 4 (architectural),
NOT fixed by plan 06-08. Owning file `apps/api/src/lib/prisma-rls.ts` (plan 06-02),
outside 06-08's scope.

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

**Why it was not auto-fixed in 06-08.** A correct fix changes the tenancy primitive
all five completed phases run on, and had to simultaneously preserve T-06-01 (GUC
provably transaction-local and on the same connection as the guarded query) and
06-02's deliberate `TenantPrismaClient` / `TenantTransactionClient` typing that
exists to prevent casting between extended and raw handles. That is well beyond a
plan scoped to "expose the invoice domain over HTTP", so it was escalated rather
than patched around, and the failing test was left failing rather than skipped so
the defect could not be mistaken for flakiness.

**Resolution (hotfix 06-00b).** `createTenantClient` now overrides `$transaction`
itself: one real `base.$transaction` is opened, the RLS GUC is set once on that
connection, and the callback receives the raw unextended `tx`. Statements inside an
interactive transaction are no longer re-wrapped into separate transactions, so
rollback rolls back and `FOR UPDATE` holds for the full transaction.
`TenantPrismaClient.$transaction` is narrowed to the interactive overload and
`TenantTransactionClient` keeps the same removed-key set, so 06-02's typing
invariant survives intact. Direct (non-transactional) calls on the handle still go
through the `$allOperations` extension exactly as before.

**Current state.** Resolved and re-verified. `tests/billing/finalize-stock.test.ts`
is 7/7 including the `concurrent` case; full API suite 759 passed / 0 failed.

**What later plans can rely on.** An interactive `$transaction` on `request.db` is
genuinely atomic. `invoice.repository.ts`'s "Finalize atomicity" invariant #3 holds
at runtime, and row locks taken inside a finalize are held to commit.

### 12. `seed.ts` could not revoke a permission (fixed in this plan)

`seed.ts` only ever `upsert`ed role-permission rows, so removing a permission from
`DEFAULT_ROLE_PERMISSIONS` had no effect on an already-seeded database. The D-05
removal of `CREATE_INVOICES` from Clinician would have passed on fresh CI and been
inert on every dev and staging environment. Fixed in commit `9e68d03`: the seed now
deletes per-role grants whose code is no longer in the map. Recorded here because
any future role-permission removal depends on this behaviour, and because existing
environments still need `redis-cli --scan --pattern 'perms:*' | xargs -r redis-cli del`
plus a reseed for the change to take effect.

### 13. Razorpay test credentials still not provisioned (plan 06-09)

`RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` are still absent, so **no code
in this phase has ever spoken to Razorpay**. Plan 06-09's coverage is mock-only by
design: the SDK is replaced at the module boundary and everything below it — the
AES-256-GCM envelope on the clinic row, `decryptSecret`, the routes, the payment
rows, the derived invoice status — runs for real.

What mocks cannot establish, and what a live test key must confirm before Beta:

* that a real `paymentLink.create` accepts our exact param set (`accept_partial`,
  `reminder_enable`, `notify`, `notes`, a 36-character `reference_id`);
* that `expire_by = now + 960s` is in fact accepted under real network latency —
  the buffer exists precisely because the 15-minute boundary fails intermittently,
  and only a live call can demonstrate it does not;
* the concrete shape of a real SDK rejection, which `normalizeRazorpayError`
  currently parses from the documented `{ statusCode, error: { code, description } }`
  form;
* that `short_url` renders a scannable UPI QR on a real device.

Blocking for staging sign-off, not for merge. 06-RESEARCH's
`## Environment Availability` already flags the per-clinic **live** accounts as the
long-lead item (KYC for 20 pilot clinics); this entry is about the shared **test**
key, which is a five-minute signup and should be done before plan 06-10's webhook
work, since a webhook cannot be exercised end to end without one.

### 14. D-39 combined multi-invoice payment link — groundwork only (plan 06-09)

D-39 confirms one Razorpay link settling several of an owner's invoices is in
scope for Phase 6. Plan 06-09 lays the groundwork but does not implement it:

* `Payment.paymentGroupId` is populated on every link created, so a single-invoice
  link is already the degenerate group of one. The later change is a loop over
  invoice ids sharing a group id, not a data backfill.
* `createPaymentLink` accepts a `paymentGroupId` option, and `retryPaymentLink`
  carries the existing group forward rather than minting a new one.
* `createPaymentLinkSchema` in `@breeyo/validators` already takes
  `invoiceIds: string[]` (max 20), and plan 06-03 relaxed the unique constraint to
  `(razorpayPaymentLinkId, invoiceId)` for this.

Still to build: the multi-invoice endpoint, per-invoice amount allocation for a
partial settlement, the webhook fan-out that settles every invoice in a group from
one `payment_link.paid`, and the UI for picking invoices. The webhook fan-out is
the substantive part and belongs with plan 06-10, which owns that worker.

### 15. Billing exceptions LIST endpoint and screen (plan 06-12)

D-35 and D-36 flag an invoice with `exception_flag` (`payment_after_void`,
`overpayment`) and block every further status-changing action on it until staff
resolve it. Plan 06-10's webhook worker sets the flag; nothing read it.

Plan 06-12 closed the discoverability half only: `GET /billing/dashboard` now
returns `billingExceptionCount`, so a flagged invoice is *visible* rather than
being a silent dead end where staff can no longer act on an invoice and cannot
see why.

Still to build:
* `GET /billing/exceptions` returning `BillingExceptionListItem[]` — the type is
  already defined in `@breeyo/types` and unused.
* A resolve action writing `exception_resolved_at` / `exception_resolved_by_id` /
  `exception_notes`; those columns exist and nothing writes them, so a flagged
  invoice currently cannot be un-flagged through the product at all.
* The mobile surface: a banner on the Billing tab tapping through to the list.

The dashboard count already filters on `exception_resolved_at IS NULL`, so the
resolve action needs no change to the aggregate.

### 16. Intermittent failure in `tests/billing/invoice-lock.test.ts` (observed during plan 06-12)

`BIL-03 status transitions and D-21 immutability > rejects a void that asks not
to restore stock rather than silently ignoring the request` failed once in four
consecutive full-suite runs and passes reliably in isolation. Not caused by plan
06-12 — the plan touches no void path — and out of scope for it under the
executor's scope boundary, but recorded so the next Wave 8 owner does not
rediscover it as a new regression.

Suspected cause: shared-database ordering between suites. `vitest.config.ts` sets
`fileParallelism: false`, so the suites are sequential, but each calls
`cleanupTestData()` in `beforeEach` against one database; a suite whose teardown
overlaps the next suite's seed would produce exactly this shape. Worth confirming
before treating it as flaky-by-nature.

## Found during 06-16 (mobile invoice builder)

### 17. A percentage discount is applied 100x too small by the server

`InvoiceService.resolveInvoiceDiscount` (`apps/api/src/modules/billing/invoice.service.ts:921-930`)
treats the incoming `discountValue` as a percentage **multiplied by 100**:

```ts
// percent, stored as percent x 100
return Math.min(Math.round((basePaise * value) / 10_000), basePaise);
```

but `createDraft` and `updateDraft` store `parsed.invoiceDiscountValue` /
`line.discountValue` **verbatim**, with no multiplication anywhere on the way
in. The scaling `packages/validators/src/billing.ts:120-125` documents ("The
service multiplies on the way in. Do not send basis points here.") does not
happen.

Consequence: a client that sends the schema-legal `10` for "10% off" gets
`base * 10 / 10000` = **0.1%** off. A 10% discount on Rs 5,000 comes out as
Rs 5 instead of Rs 500.

The client cannot compensate. `discountGuard` in the shared schema rejects a
`percent` value above 100, so sending `1000` for 10% is unrepresentable — the
schema and the service disagree about the unit, and the schema is the one both
sides parse. Plan 06-16 therefore sends a whole percentage (0-100) as the schema
specifies, which is the correct client behaviour against the documented
contract.

Fix belongs in `apps/api` (plan 06-06's file): either multiply by 100 at the two
store sites, or divide by 100 rather than 10,000 in `resolveInvoiceDiscount` and
correct the comment. Out of scope for 06-16 under the executor's scope boundary
(a pre-existing defect in another plan's files, in a different app).

**This blocks D-07 end to end** — percentage discounts are silently near-noops
today — so it wants an owner before Phase 6 closes. Flat discounts are
unaffected: `type === 'flat'` returns `Math.min(value, basePaise)` with no
scaling, and that path is correct.

---

## Found during 06-21 (invoice builder screen and its entry routes)

### 18. A consultation whose D-03 draft-invoice hook failed is unbillable from the picker

The D-06 Path B picker (`app/(app)/billing/from-consultation.tsx`) lists DRAFT
invoices, because there is no consultation-list endpoint and because D-03 makes
"a completed consultation without an invoice" an off-happy-path state. The full
reasoning is in `src/features/billing/lib/consultation-picker.ts`.

The gap that leaves: `EmrService.createDraftInvoiceForConsultation` catches and
logs its own failure rather than failing the consultation
(`apps/api/src/modules/emr/emr.service.ts:258-272`). A consultation whose hook
failed therefore has no draft, does not appear in the picker, and cannot be
billed through either Path A or Path B — the visit is complete, the stock is
dispensed, and no invoice exists or can be created from the UI.

The fix is server-side and small: either a reconciliation query
(`GET /billing/consultations/unbilled` — finalized consultations with no invoice
row) that the picker unions in, or a retry of the hook. It is not a client-side
scan of consultations, which would not scale.

Impact is bounded by how often the hook fails, which is currently unmeasured —
the catch logs but increments no counter. Worth a metric either way.

### 19. `/(app)/billing/:invoiceId` (invoice detail) does not exist yet

Plan 06-15's screen. Three call sites now navigate to it: the dashboard's list
rows, and the builder on both finalize-success and `INVOICE_NOT_DRAFT`. Until
the route file exists those pushes are inert.

Plan 06-21 routed all three through `BILLING_ROUTES.invoiceDetail(id)` so the
path is declared once. Whoever creates the detail screen must place it at
`app/(app)/billing/[invoiceId].tsx` — a **sibling** of `(tabs)`, not a child of
it, for the reason in item 20.

**RESOLVED by plan 06-22.** `app/(app)/billing/[invoiceId].tsx` exists at the
required path and all three call sites now resolve. The plan's own file list
said `billing/invoice/[invoiceId].tsx`; this item won, because the three shipped
call sites already pointed at the one-segment path and moving them would have
been a wider change than adding the route. `BILLING_ROUTES` gained
`creditNote(id)` (`billing/credit-note/[invoiceId]`, two segments, so it does
not compete with the dynamic sibling) and `editDraft(id)`.

### 20. `BILLING_ROUTES` pointed into a directory that cannot exist (corrected)

Plan 06-14 declared `consultationPicker` and `quickSale` under
`/(app)/(tabs)/billing/...`. That namespace cannot resolve:
`app/(app)/(tabs)/billing.tsx` is a **file** — the Billing tab itself — so there
is no `(tabs)/billing/` directory for a child route to live in, and every push
to one of those paths silently did nothing. Since the FAB's New Invoice sheet is
the primary entry point to the whole billing flow, it was a dead end on the
first tap.

Corrected in plan 06-21 to `/(app)/billing/...`, matching `settings` (which was
already right) and the `patient/register` precedent for a full-screen form that
pushes over the tab bar.

**Plan 06-18 must create Quick Sale at `app/(app)/billing/quick-sale.tsx`**, not
under `(tabs)`. The constant is already pointing there.

---

## Found during 06-17 (invoice detail hooks and components)

### 1. `markPaidBodySchema` is not shared, so the client cannot parse before it sends

Six of the seven money-state writes in `usePaymentMutations` validate their body
with the same schema object the Fastify handler parses, imported from
`@breeyo/validators`: `recordPaymentSchema`, `voidInvoiceSchema`,
`refundInputSchema`, `creditNoteSchema`. `POST /billing/invoices/:id/mark-paid`
is the exception. Its schema lives at
`apps/api/src/modules/billing/billing.schema.ts:55` as `markPaidBodySchema` and
is not re-exported by the shared package, so `lib/payment-mutations.ts` carries
a type-only `MarkPaidInput` interface and no runtime parse.

Writing a second copy of the schema on the client is the exact drift every other
body in that module exists to avoid — the two would agree until one of them
changed — so the type-only contract is deliberate rather than an oversight.

Fix: move `markPaidBodySchema` into `packages/validators/src/billing.ts`
alongside `recordPaymentSchema` and have `billing.schema.ts` re-export it, then
swap the type-only interface for a `parseMarkPaidInput`. It touches a shared
package and the API module, which is outside a mobile-only plan's scope and
would conflict with sibling plans executing in the same wave.

Impact today is low: the body is three fields, two optional, and the server's
parse is the control. It is a consistency and fail-fast gap, not a correctness
one.

### 2. `voidInvoiceSchema` accepts `restoreStock: true` only, but the UI asks the question

**Resolved 2026-08-14, same day:** 06-CONTEXT.md's D-34 now states explicitly
that the void confirmation UI should be a single confirm action, not a
checkbox — D-26's original yes/no prompt is superseded now that restoration is
fully automatic and deterministic by item provenance. Plan 06-22 should build
the confirm-only sheet described there, not the checkbox this item originally
flagged as unresolved.

D-26 promised the vet the choice "Return dispensed items to stock?" and
`VoidConfirmSheet` renders it. D-34 then narrowed the behaviour: the server
decides *which* movements reverse (billing-time lines yes, consultation-dispensed
drugs no), and `voidInvoiceSchema` was tightened to `z.literal(true)`
accordingly, so an opt-out is unrepresentable on the wire.

The sheet still reports the checkbox value unchanged to its caller (T-06-115
requires exactly that), and `parseVoidInput` rejects `false` loudly rather than
coercing it — a silently-ignored opt-out would leave a vet believing stock stayed
deducted when it did not.

That leaves a real product question this plan cannot settle alone: either the
checkbox should not be offered at all (D-34 having removed the decision from the
user), or the schema should accept `false` and the server should honour it for
billing-time lines. Plan 06-22 wires the sheet and will hit this immediately;
whichever way it goes, D-26 and D-34 want reconciling in `06-CONTEXT.md`.

**CLOSED by plan 06-22, first branch taken.** The checkbox is gone. The sheet
now states `Stock added at billing time will be returned automatically; items
already given to the patient will not.` and its single confirm sends
`restoreStock: true`. `VoidConfirmPayload.restoreStock` narrowed from `boolean`
to the literal `true`, so the opt-out is no longer representable in the
component's own types either.

The schema was deliberately *not* relaxed to accept `false`: honouring an
opt-out would mean the server skipping a reversal for a line whose stock it
knows it added, leaving the inventory figure wrong with no record of why. The
value stays on the payload so the intent is explicit in the request and the
audit log (T-06-115).

Which of the two UI-SPEC void toasts appears is now decided by the server's
`restoredMovementCount`, not by a control: `Invoice voided. Items returned to
stock.` when something actually came back, `Invoice voided` when nothing did.
Both spec strings survive, and neither is a claim the stock ledger cannot
support.

---

## `apps/mobile` typecheck does not exit 0 (found during plan 06-18)

`pnpm --filter @breeyo/mobile exec tsc --noEmit` exits 1 with **61 errors**,
none of them in Phase 6 billing code. Two acceptance criteria in 06-18 required
exit 0, so this is recorded rather than silently passed over.

Grouped by cause:

* **`packages/ui` atoms/molecules/organisms (~40 errors).** Every wrapper that
  forwards to the local `Typography` fails with "Property 'children' is missing
  in type ...". Affects `IconButton`, `NotificationBadge`, `StatusBadge`,
  `TextInput`, `AccordionItem`, `EmptyState`, `FormField`, `NotificationItem`,
  `BottomSheet`, `BottomTabBar`, `Card`, `Modal`, `NavigationBar`,
  `NotificationList`, `QueueCard`, `WizardStepper`. One prop-type fix in the
  Typography wrapper likely clears the whole group.
* **Absent modules.** `expo-image-manipulator`
  (`features/attachment/hooks/useFileUpload.ts`) and `expo-speech-recognition`
  (`features/consultation/hooks/useVoiceTranscription.ts`) are imported but not
  installed. Note these are *installs*, so they are out of scope for automatic
  repair by an executor regardless.
* **`app/setup-wizard/_layout.tsx`.** Two relative imports need explicit `.js`
  extensions under `moduleResolution: node16`.
* **Route prop passing.** `app/(app)/owner/[ownerId].tsx`,
  `app/(app)/patient/[petId].tsx` and `app/(app)/patient/register.tsx` pass
  props to screen components whose signatures take none.
* **Phase 3/4 screens.** `PatientDetailScreen.tsx` (the `WeightTrendChart`
  `Visit` vs `Record<string, unknown>` mismatch), `ConsultationScreen.tsx`,
  `CareInstructionsSection.tsx`, `CheckInSheet.tsx`, `AuthProvider.tsx`.

Out of scope for 06-18 under the executor's scope boundary: all of it is
pre-existing, spread across four packages, and owned by Phases 1-5. Verified
instead that **zero** errors fall in the eleven files 06-18 created. The two
errors in `PatientDetailScreen.tsx` are pre-existing; their line numbers moved
from 169-170 to 172-173 only because 06-18 inserted three lines above them.

Wants an owner before Phase 6 closes if the phase's exit criteria include a
clean mobile typecheck.
