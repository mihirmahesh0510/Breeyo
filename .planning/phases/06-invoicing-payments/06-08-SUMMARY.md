---
phase: 06-invoicing-payments
plan: "08"
subsystem: billing
tags: [http, authorization, rbac, integration-tests, bil-01, bil-02, bil-03, bil-07]
status: blocked
requires: ["06-02", "06-03", "06-04", "06-05", "06-06", "06-07"]
provides:
  - "/api/v1/billing/* HTTP surface for the invoice domain (12 routes, 3 permission gates)"
  - "billing.schema.ts local param/query/body schemas"
  - "invoice.controller.ts safeParse handlers on the tenant client"
  - "D-05-correct role seeding, with role-permission reconciliation"
  - "Phase 5 inventory test factories + dispenseForTest"
affects: ["06-09", "06-10", "06-12", "06-13", "06-16"]
tech-stack:
  added: []
  patterns:
    - "requirePermission first used outside auth; permissionService must be decorated per plugin scope"
    - "supertest against app.server confirmed working (settles 06-PATTERNS.md Warning 5)"
key-files:
  created:
    - apps/api/src/modules/billing/billing.schema.ts
    - apps/api/src/modules/billing/invoice.controller.ts
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/tests/billing/invoice-create.test.ts
    - apps/api/tests/billing/finalize-stock.test.ts
    - apps/api/tests/billing/invoice-lock.test.ts
  modified:
    - apps/api/src/app.ts
    - apps/api/prisma/seed.ts
    - apps/api/tests/helpers/factories.ts
decisions:
  - "Void restoreStock:false is rejected (400) rather than honoured — voidInvoiceSchema accepts only true per D-34"
  - "preview-totals takes invoiceId in the body, not the path, so the fixed route cannot be shadowed by /invoices/:invoiceId"
  - "mark-paid uses a local narrow body schema, not recordPaymentSchema, so the client never computes a money figure"
  - "seed.ts now reconciles role permissions (deletes grants no longer in the map)"
metrics:
  duration: ~55m
  tasks: 3
  commits: 5
  tests_added: 25
  completed: 2026-08-14
---

# Phase 6 Plan 08: Invoice HTTP Surface & BIL-01/02/03 Integration Tests Summary

Exposed the invoice domain over `/api/v1/billing/*` with three permission gates and
proved BIL-01, BIL-03 and most of BIL-02 against a real database — and in doing so
uncovered a pre-existing defect that makes tenant-client transactions non-atomic,
which blocks the concurrency half of BIL-02.

## Status: BLOCKED — architectural decision required

24 of 25 new tests pass. The full API suite is **751 passed, 1 failed**. The single
failure is `finalize-stock.test.ts -t "concurrent"`, and it is failing because of a
real overselling bug, not a flaky test. See "Blocker" below and
`deferred-items.md` (BLOCKER-06-08-01).

## What was built

**`billing.schema.ts`** — `invoiceParamsSchema`, `petParamsSchema`,
`consultationParamsSchema`, a `previewTotalsBodySchema`, a `markPaidBodySchema`,
and a re-export of `invoiceListQuerySchema` so handlers have one import site.

**`invoice.controller.ts`** — 12 handlers. Every one `safeParse`s (zero `.parse`
calls), resolves its service from `request.db` as its first statement, passes
`request.user.activeClinicId` as the tenant, and returns `{ data }` / `{ error: { code, message } }`.
Domain errors propagate to `error-handler.ts` untouched.

**`billing.routes.ts`** — 12 routes, three gates: `VIEW_INVOICES` for reads,
`CREATE_INVOICES` for draft/finalize writes, `MANAGE_PAYMENTS` for void, mark-paid
and mark-unpaid (money state, not document state).

**`seed.ts`** — `CREATE_INVOICES` removed from Clinician, `VIEW_INVOICES` retained.

## Answers to the questions the plan asked

**Did supertest work against `buildTestApp()`?** Yes, cleanly, with no fallback to
`app.inject` — all three new files use `request(app.server)`. This settles
06-PATTERNS.md Warning 5 in favour of CLAUDE.md's documented convention: new
integration tests in this phase should use supertest. `app.inject` in
`tenant-isolation.test.ts` is legacy, not a constraint.

**Observed outcome pair from the concurrent-finalize test:** `[200, 200]` — both
finalizes succeeded and the batch's `current_qty` ended at **-1**. The expected
pair is one 2xx and one 409. This is the blocker.

**How the post-dispense fixture is produced:** `dispenseForTest` in `factories.ts`
delegates to Phase 5's own `FifoDispenseService`, so the fixture is whatever Phase 5
actually produces (batch decremented **and** `dispensed` movement inserted) and
cannot drift. Phase 5 shipped no factories of its own, so `createTestInventoryItem`
and `createTestStockBatch` were added alongside it rather than a second set being
defined elsewhere.

**`perms:*` cache flush procedure after the D-05 seed change:**

```bash
redis-cli --scan --pattern 'perms:*' | xargs -r redis-cli del
pnpm --filter @breeyo/api db:seed
```

Both steps are required, and the reseed is now load-bearing — see Deviation 2.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `permissionService` is not visible across plugin scopes

- **Found during:** Task 2 — every billing request 500'd with
  `Cannot read properties of undefined (reading 'getUserPermissions')`.
- **Cause:** `requirePermission` reads `request.server.permissionService`, but
  `auth.routes.ts` decorates it inside its own encapsulated plugin, so a sibling
  plugin never sees it. `dispense.routes.ts` documents having hit exactly this and
  fixed it the same way.
- **Fix:** decorate `permissionService` in `billing.routes.ts`'s own scope, guarded
  by `hasDecorator`, with the D-30 exemption comment (permission resolution runs
  before `tenantContext` and reads the un-RLS'd reference tables).
- **Commit:** 9e68d03

### 2. [Rule 2 - Missing critical functionality] The seed could not actually revoke a permission

- **Found during:** Task 2, verifying the D-05 change took effect.
- **Issue:** `seed.ts` only ever `upsert`s role-permission rows. Removing
  `CREATE_INVOICES` from the Clinician map therefore had **no effect** on any
  already-seeded database — the stale grant survived, confirmed by querying
  `role_permissions` after a reseed. The D-05 fix would have passed on fresh CI and
  been inert on every dev and staging environment, which is precisely where it
  matters.
- **Fix:** the seed now reconciles per role, deleting grants whose permission code
  is no longer in `DEFAULT_ROLE_PERMISSIONS`. Per-user
  `user_permission_overrides` are deliberately untouched.
- **Commit:** 9e68d03

### 3. [Rule 3 - Blocking] Service constructor signatures differ from the plan's snippet

- The plan's DI snippet was `new InvoiceRepository(db)` /
  `new InvoiceService(repository, stockValidator, db)`. As 06-07 actually shipped
  them, `InvoiceRepository` takes `(db, stockValidator)` and `StockValidatorService`
  takes `(db, stockMovementService)`. Wired to the real signatures.

### 4. [Rule 3] `preview-totals` needs an invoice id

The plan's route table has `POST /billing/invoices/preview-totals` with no id, but
`InvoiceService.previewTotals(clinicId, invoiceId)` computes from persisted line
items. The id travels in the body via `previewTotalsBodySchema`; the path stays
fixed so it cannot be shadowed by `/billing/invoices/:invoiceId`.

### 5. [Rule 3] `quantityRemaining` is spelled `currentQty`

The plan's assertions and grep gate name `StockBatch.quantityRemaining`; Phase 5's
column is `currentQty`. Tests assert on `currentQty` and name their local
before/after variables `quantityRemaining*`, which is what the gate is really
checking for — a recorded-value comparison rather than a hard-coded number.

### 6. [Rule 3] `restoreStock: false` is rejected, not honoured

The plan's behaviour list says a void with `restoreStock: false` "creates no
movements". The shipped `voidInvoiceSchema` (06-04, D-34) validates
`z.literal(true)`, so `false` is a 400. The test asserts the rejection **and** that
nothing moved and the invoice did not become VOIDED, which preserves the intent.

## Blocker — BLOCKER-06-08-01 (Rule 4, architectural)

`createTenantClient` in `apps/api/src/lib/prisma-rls.ts` (plan 06-02) binds the RLS
GUC by wrapping every operation in `$allOperations` with its own
`base.$transaction([...])`. That wrapper also applies to operations issued on the
`tx` handle of an interactive `$transaction(async (tx) => ...)`, so each statement
inside what looks like one transaction runs in its **own** short transaction.

Two consequences, both demonstrated:

1. **`SELECT ... FOR UPDATE` releases its lock immediately.** Two concurrent
   finalizes for the last unit of a batch both succeeded; `current_qty` ended at -1.
2. **Rollback does not roll back.** A write inside
   `db.$transaction(async (tx) => { ...write...; throw })` persists. Expected 5,
   observed 2.

`invoice.repository.ts` documents "Finalize atomicity" as invariant #3. That
invariant does not hold at runtime, and the same applies to EMR and inventory
writes on the HTTP path. It went unnoticed because every earlier transactional test
— including `tests/billing/numbering-concurrency.test.ts` — drives the plain admin
`PrismaClient`, whose `$transaction` is genuine. This plan is the first to run a
transactional write through `request.db`.

**Not auto-fixed** because a correct fix changes the tenancy primitive all five
completed phases run on, and must simultaneously preserve T-06-01 (GUC provably
transaction-local, on the same connection as the guarded query) and 06-02's
deliberate `TenantPrismaClient` / `TenantTransactionClient` typing. Candidate
approaches — overriding `$transaction` in a client extension and yielding the raw
`tx`, or tracking depth in `AsyncLocalStorage` and short-circuiting
`$allOperations` — each carry correctness and typing consequences well beyond a
plan scoped to "expose the invoice domain over HTTP".

The `concurrent` test is **left failing deliberately**. It encodes a stated success
criterion and threat T-06-132; skipping it would hide a live overselling defect.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @breeyo/api exec tsc --noEmit` | passes |
| `bash scripts/check-tenant-client.sh` | passes, 24 files scanned |
| `tests/billing/invoice-create.test.ts` | 10/10 pass |
| `tests/billing/finalize-stock.test.ts` | 6/7 pass (`concurrent` fails — blocker) |
| `tests/billing/invoice-lock.test.ts` | 8/8 pass |
| `tests/tenant-isolation.test.ts` after the seed change | 20/20 pass |
| Full API suite | 751 passed, **1 failed**, 80 todo |
| 401 without a token / 403 without the permission | both asserted |

## Success criteria

| Criterion | Met |
|---|---|
| Twelve endpoints, three permission gates | yes |
| Clinician denied interactive creation; End-Consultation path stays open | yes |
| Insufficient stock returns 409 with every shortfall, mutates nothing | yes |
| Consultation-sourced finalize leaves batches untouched; mixed provenance deducts only manual lines | yes |
| Concurrent finalizes produce exactly one success | **NO — blocked** |
| Finalized invoices reject PATCH and DELETE | yes |
| Cross-tenant invoice access returns 404 | yes |

## Notes for later plans

- **06-09/06-10 (Razorpay):** `POST /billing/invoices/:id/void` returns
  `cancelledPaymentLinkIds` in its response body. Nothing cancels them at the
  gateway yet — that is the payment module's job (D-35).
- **06-12 (End Consultation):** call `InvoiceService.createDraftFromConsultation`
  directly. Do **not** route it through the HTTP endpoint added here, which is
  gated on `CREATE_INVOICES` and would 403 for the Clinician triggering it.
- **06-13/06-16:** any new product line must leave `stockMovementId` null when the
  invoice is to deduct for it, and set it when Phase 5 already did.
- Local test databases follow the per-worktree convention (`breeyo_wt0608`);
  `apps/api` has no `test` script in run mode — use `pnpm exec vitest run`, since
  the bare `vitest` script watches outside CI.

## Self-Check: PASSED

All six created files exist on disk; all five commits (`ebc91c7`, `9678291`,
`9e68d03`, `33163bd`, `e742ecc`) are present in `git log`.
