---
phase: 06-invoicing-payments
plan: "07"
subsystem: invoice-domain
tags: [invoice, finalize, stock-validation, fifo, row-locking, state-machine, gst, void, tdd]
wave: 6
requires:
  - "06-03 (Invoice, InvoiceLineItem, Payment, Refund, CreditNote tables; invoices_one_draft_per_consultation partial unique index)"
  - "06-04 (InvoiceDetail/InvoiceListItem/StockShortfall types, isValidInvoiceTransition, isInvoiceActionBlocked, billing Zod schemas)"
  - "06-05 (allocateInvoiceDiscount, computeInvoiceTax, toPaise, fromPaise)"
  - "06-06 (nextDocumentNumber, writeBillingAuditLog, BillingAuditEvent)"
  - "Phase 5 (StockMovement, StockBatch, StockMovementService.recordMovement)"
provides:
  - "InvoiceRepository — dispensed-movement sourcing, draft CRUD, single-transaction finalize, void, derived payment state, list/detail projections"
  - "StockValidatorService — checkAvailability (read-only) and reserveAndDeduct/restoreToStock inside the caller's transaction"
  - "InvoiceService — draft assembly, finalize orchestration, buildProductLineStockPlan, state guards, markPaid/markUnpaid"
  - "FinalizeComputation / DraftInvoiceData / StockPlanLine contracts for downstream plans"
affects:
  - "06-08 (HTTP wiring and DB integration tests consume every method and error code here)"
  - "06-09/06-10 (payments and Razorpay: recomputePaymentState, cancelledPaymentLinkIds)"
  - "06-13/06-16 (both add product lines and must match the buildProductLineStockPlan provenance contract)"
tech-stack:
  added: []
  patterns:
    - "Pre-filtered stock plan handed down rather than re-derived, with a contract assertion at the receiving end"
    - "Two-pass lock-then-apply inside one transaction so a shortfall on the last item aborts with nothing to undo"
    - "Draft immutability enforced in the WHERE clause rather than by a service-layer check"
    - "Derived payment status recomputed inside the transaction that mutated the payment rows"
key-files:
  created:
    - apps/api/src/modules/billing/invoice.repository.ts
    - apps/api/src/modules/billing/stock-validator.service.ts
    - apps/api/src/modules/billing/invoice.service.ts
    - apps/api/src/modules/billing/__tests__/invoice.repository.test.ts
    - apps/api/src/modules/billing/__tests__/stock-validator.test.ts
    - apps/api/src/modules/billing/__tests__/invoice.service.test.ts
    - apps/api/src/modules/billing/__tests__/invoice-state.test.ts
  modified:
    - apps/api/src/middleware/error-handler.ts
    - .planning/phases/06-invoicing-payments/deferred-items.md
decisions:
  - "Phase 5 columns verified as shipped: StockMovement.itemId (not inventoryItemId), StockBatch.currentQty (not quantityRemaining), StockBatch.expiryDate + isExpired"
  - "FIFO ordering is expiry ASC NULLS LAST, received_at ASC — expiry-first per the plan, with Phase 5's received_at as the deterministic tiebreak"
  - "Transaction handles typed TenantTransactionClient, not Prisma.TransactionClient, following 06-06's precedent"
  - "Task order swapped: the stock validator ships before the repository that imports it"
  - "D-34 overrides the plan's narrower void rule — void restores every dispensed movement tied to the invoice, including consultation-sourced ones"
  - "error-handler.ts extended to forward 4xx `details`, without which the BIL-02 shortfall list never reaches the client"
metrics:
  duration: ~80 min
  tasks: 3
  commits: 8
  tests-added: 72
  completed: 2026-08-14
---

# Phase 6 Plan 07: Invoice Domain Summary

Invoice repository, stock validator and service: dispensed quantities and prices sourced from `StockMovement`, an all-or-nothing finalize that numbers, freezes GST, deducts stock under `FOR UPDATE` and stamps movements in one transaction, and a `stockMovementId` discriminator that keeps consultation-dispensed lines from being decremented a second time.

## What Was Built

**`stock-validator.service.ts` (BIL-02).** `reserveAndDeduct(tx, clinicId, lines, context)` never opens a transaction of its own — the lock, the check and the deduction share the caller's, which is the whole of the BIL-02 guarantee. It runs in two passes: pass one locks every candidate batch `FOR UPDATE` and plans the deduction without writing, pass two applies it. A shortfall on the last item therefore aborts with nothing to undo, and all shortfalls are reported in a single 409. Lines are aggregated per item and locked in ascending item order so two concurrent multi-item finalizes cannot deadlock. `restoreToStock` is the D-34 reverse.

**`invoice.repository.ts` (BIL-01, BIL-02, BIL-03, BIL-07).** `findUninvoicedDispensedMovements` is the BIL-01 join. `finalizeInvoice` is the single transaction. `voidInvoice` locks, cancels pending links, restores stock and audits. `recomputePaymentState` derives status from the rows. Draft mutations are scoped to `status: 'DRAFT'` in the WHERE clause.

**`invoice.service.ts`.** Draft assembly from both sources, the finalize orchestration, `buildProductLineStockPlan`, the state guards, and the manual payment controls.

## Verified Phase 5 Column Names

The plan warned that 06-PATTERNS.md recorded names from Phase 5's *plan*, not from what shipped. They differ, and the differences matter:

| Model | Plan/patterns said | Actually shipped | Notes |
|---|---|---|---|
| `StockMovement` | `inventoryItemId` | **`itemId`** (`item_id`) | The FK to `InventoryItem` |
| `StockMovement` | — | `consultationId`, `invoiceId`, `ownerId`, `quantity`, `unitPrice`, `type` | All present as assumed |
| `StockMovement` | — | `runningTotal` (required) | Why deduction goes through `StockMovementService.recordMovement` rather than a bare insert |
| `StockMovement` | — | `reversedMovementId` `@unique` | Gives double-restore protection at the database |
| `StockBatch` | `quantity_remaining` | **`current_qty`** | The remaining-quantity column |
| `StockBatch` | `expiry_date` | `expiry_date` ✓ plus `is_expired` | Both are filtered on |

Id type is `String @db.Uuid` with `gen_random_uuid()` throughout — the Phase 5 plan's `cuid()` did not ship. `unitPrice` is `Decimal(10,2)` in **rupees**; `InvoiceLineItem.unitPricePaise` is **paise**.

## Rate Fallback Chain As Implemented

Products (`resolveProductGstRate`): `InventoryItem.gstRate` → `Clinic.defaultGstRate` → `18`.

Services: `ServiceCatalog.gstRateOverride` → `0` (exempt). Veterinary healthcare is exempt by law, so the safe default for a service is "no tax", not the clinic's usual rate.

A resolved rate of `0` sets `taxTreatment: 'exempt'` rather than taxable-at-zero.

Note for downstream plans: the current slabs are **`[0, 5, 18, 40]`**. `computeInvoiceTax` throws on anything else, so 12 and 28 are no longer valid rates.

## Domain Error Codes

Plan 06-08's controller and the mobile error handling both depend on this list.

| Code | Status | Thrown by | Meaning |
|---|---|---|---|
| `INVOICE_NOT_FOUND` | 404 | repository, service | No invoice with that id in this clinic |
| `CONSULTATION_NOT_FOUND` | 404 | service | `createDraftFromConsultation` given an unknown consultation |
| `CLINIC_NOT_FOUND` | 404 | service | Billing settings lookup failed |
| `INVOICE_ALREADY_FINALIZED` | 409 | repository, service | No longer a draft — finalized, voided, or a concurrent finalize won |
| `INVOICE_NOT_DRAFT` | 409 | service | Edit or delete attempted on a non-draft (D-21) |
| `INVALID_STATE_TRANSITION` | 409 | repository, service | Move rejected by the shared transition table |
| `INSUFFICIENT_STOCK` | 409 | stock validator | Carries `details.shortfalls: StockShortfall[]` |
| `INVOICE_EXCEPTION_UNRESOLVED` | 409 | service | D-35/D-36 flag blocks every status-changing action |
| `STOCK_PLAN_CONTRACT_VIOLATION` | (no status → 500) | stock validator | Programmer error: an already-dispensed line reached `reserveAndDeduct` |

`STOCK_PLAN_CONTRACT_VIOLATION` deliberately carries no `statusCode`. It is not something a client can trigger; it means a caller skipped `buildProductLineStockPlan`, and it should surface as a 500 and a bug report rather than as a 4xx a client might retry.

## `buildProductLineStockPlan` Predicate, Verbatim

Plans 06-13 and 06-16 both add product lines and must match this contract exactly:

```ts
lineItems.filter((line) => line.inventoryItemId != null && line.stockMovementId == null)
```

| Line shape | Meaning | Finalize behaviour |
|---|---|---|
| `inventoryItemId == null` | service line (D-01/D-06 catalog pick) | no stock effect at all |
| `inventoryItemId != null`, `stockMovementId != null` | dispensed during the consultation; Phase 5 already decremented the batch | stamp `invoiceId` onto the existing movement only — never deduct |
| `inventoryItemId != null`, `stockMovementId == null` | added by hand in the builder's Add Product sheet | deduct FIFO under `FOR UPDATE` |

Any new code path that creates a product line **must** set `stockMovementId` when the stock has already moved. Leaving it null on an already-dispensed line silently double-decrements the batch at finalize, on the phase's primary invoice-creation path, with no error anywhere.

Defence in depth: `reserveAndDeduct` throws `STOCK_PLAN_CONTRACT_VIOLATION` if a line carrying a `stockMovementId` reaches it, and the repository calls the validator from exactly one guarded site and never builds the plan itself.

## Carry-Forward Decisions Applied

- **D-34 (amends D-26)** — void restores stock with **no age gate anywhere**. `restoreToStock` reverses every `dispensed` movement stamped with the invoice, however old. This is broader than the plan's text, which would have restored only the movements the invoice itself created; D-34 and the shipped `voidInvoiceSchema` comment both say "every stock movement tied to the invoice", and CONTEXT postdates the plan. Idempotency comes from `voidRestoredStock` plus the `@unique reversedMovementId`, not from a time window.
- **D-35** — `voidInvoice` marks pending Razorpay payments `cancelled` inside the void transaction and returns `cancelledPaymentLinkIds` for the gateway call, which belongs to 06-09/06-10. A late payment on a voided invoice sets `exceptionFlag = 'payment_after_void'` and does **not** reopen the invoice: `VOIDED` has no outgoing edges and `recomputePaymentState` short-circuits on it.
- **D-36** — overpayment lets `balancePaise` go negative and sets `exceptionFlag = 'overpayment'`. Nothing clamps it. `isInvoiceActionBlocked` is checked *before* the transition table on every status-changing method, so a flagged invoice is frozen until staff resolve it.
- **Grand total / rounding** — `grandTotalPaise` is taken from `computeInvoiceTax` as-is and `roundOffPaise` is persisted beside it as a disclosure field. It is never added into the total, the balance, or any payment amount. Two tests pin this: one asserts `grandTotal === taxable + cgst + sgst + igst`, the other asserts a `roundOffPaise: -40` case where the heads round down from 720 to 700 each.

## Deviations from Plan

### Auto-fixed and adjusted

**1. [Rule 3 — Blocking] Task order swapped: stock validator (Task 2) before repository (Task 1)**
- **Issue:** `invoice.repository.ts` imports `StockValidatorService`, so a repository-only commit would not typecheck.
- **Fix:** Committed in dependency order. Content and acceptance criteria are unchanged.

**2. [Rule 1 — Wrong assumption] Phase 5 column names differ from the plan's**
- **Found during:** Task 2.
- **Issue:** The plan named `quantity_remaining` and `inventoryItemId`; the shipped schema has `current_qty` and `item_id`. The plan explicitly told me to verify rather than assume.
- **Fix:** Used the shipped names; recorded the full mapping above.

**3. [Rule 2 — Missing critical functionality] `error-handler.ts` discarded `error.details`**
- **Found during:** Task 2. **Commit:** `aafc966`.
- **Issue:** The handler forwarded only `error.clinics`. BIL-02 requires the 409 to name each short item with its available and requested quantity, and the `StockValidationBanner` renders exactly that — but `details.shortfalls` was being dropped before the response was built, making the requirement unmeetable.
- **Fix:** Forward `details` on 4xx. The `>= 500` branch returns earlier, so no internal detail can leak.

**4. [Rule 3 — Type system] `Prisma.TransactionClient` is not the tenant transaction handle**
- **Issue:** The plan's acceptance criteria call for `Prisma.TransactionClient` in the validator's signatures. That type describes the *unextended* client and is not assignable from the RLS-scoped tenant client's handle; `lib/prisma-rls.ts` documents that casting between them discards the isolation typing D-30 exists to enforce.
- **Fix:** Signatures use `TenantTransactionClient` (06-06's precedent), with the reasoning documented in the module header where `Prisma.TransactionClient` is named twice. `StockMovementService.recordMovement` already requires that type, so this was also forced.

**5. [Rule 1 — Divergent conventions] FIFO ordering**
- **Issue:** The plan requires expiry-ascending ordering; Phase 5's shipped `FifoDispenseService` orders by `received_at`.
- **Fix:** `ORDER BY expiry_date ASC NULLS LAST, received_at ASC` — expiry-first as required, with Phase 5's ordering as the deterministic tiebreak. Logged as deferred item 9 for reconciliation on one ordering.

**6. [Rule 1 — Signature] `finalizeInvoice` does not take `invoiceNumber`**
- **Issue:** The plan's signature listed `invoiceNumber` as a parameter, but its own step 3 requires `nextDocumentNumber` to run *inside* the transaction so a rollback returns the number (D-15).
- **Fix:** Dropped the parameter; the repository allocates inside the transaction. Also added `actor: BillingActor` (the movement rows and audit rows need a user).

**7. [Rule 2 — Reuse] The validator delegates movement creation to Phase 5's service**
- **Issue:** `StockMovement.runningTotal` is required and must be derived from the previous movement for the item; a bare insert would corrupt the running total the history tab renders.
- **Fix:** `StockValidatorService` takes `StockMovementService` and calls `recordMovement`, so both deduction paths emit identical movement rows.

**8. [Rule 1 — Test fixtures] 12% is not a current GST slab, and `PAID` is terminal**
- **Found during:** Task 3 GREEN, from two failing tests I had written.
- **Issue:** I wrote fixtures at 12% (the slabs are `[0, 5, 18, 40]`) and a test that voided a `PAID` invoice (`PAID` has no outgoing edges — corrections are a refund or credit note, per 06-04). In both cases the implementation was right and the test was wrong.
- **Fix:** Fixtures moved to 18%; the D-34 no-age-gate test now voids an `OVERDUE` invoice with an old `finalizedAt`, which exercises the same point on a legal edge.

**9. [Rule 1 — Rounding expectation] Tax heads round per head at invoice level**
- **Issue:** A discount test expected `cgst + sgst = 1440` (18% of 8000). The engine rounds each head once to the nearest rupee (Section 170 / Rule 51), giving 700 + 700 = 1400 with `roundOffPaise: -40`.
- **Fix:** Corrected the expectation and made it assert the round-off explicitly, which turns the test into a guard on the "never re-add round-off" invariant.

### Environment

The worktree branched from `origin/main` (Phase 05 merge) and had no `node_modules`. Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (`4ca5cbc`), ran `pnpm install`, built `@breeyo/types` and `@breeyo/validators`, and regenerated the Prisma client before starting. Baseline `tsc --noEmit` was clean.

## Verification

- `pnpm --filter @breeyo/api exec vitest run src/modules/billing/__tests__/` — **173 passed** (72 new across four files).
- `pnpm --filter @breeyo/api exec vitest run src/` — **465 passed / 29 files**, no regressions.
- `pnpm --filter @breeyo/api exec tsc --noEmit` — exits 0.
- `-t "stock plan"` matches 2 and passes; `-t "no double deduction"` and `-t "ignores client total"` match 1 each and pass.
- `grep -rn '\$transaction' stock-validator.service.ts` — no output.
- `grep -n 'grandTotalPaise' invoice.service.ts` — the only assignment is from `tax.grandTotalPaise`.

Grep gates, all met: repository — `FOR UPDATE` 3, `status: 'DRAFT'` 7, `invoice_id IS NULL` 4, `prescription` 0, `toPaise` 0, non-comment `reserveAndDeduct` 1, `stockPlan.length` 1, `reply.`/`FastifyReply` 0. Validator — `FOR UPDATE` 2, `$transaction` 0, `Prisma.TransactionClient` 2, `sort(` 1, `statusCode = 409` 1, `statusCode = 500` 0. Service — `isValidInvoiceTransition` 5, `computeInvoiceTax` 2, `buildProductLineStockPlan` 3, `toPaise` 3, `P2002` 2, non-comment `reserveAndDeduct` 0, `permissions` 0, client-total assignment 0.

Database-backed behaviour — real concurrency, the partial unique index under retry, and `current_qty` actually unchanged for a dispensed line — is plan 06-08's integration suite. This plan's coverage is the static contract, the pure computation, and the collaborator interactions.

## Known Stubs

None. Every method is implemented; nothing returns hardcoded empty data.

## Threat Flags

None. No new network endpoint, auth path or trust boundary was introduced — HTTP wiring is 06-08. The threat register's dispositions for this plan are all mitigated: T-06-37 (client totals structurally absent and recomputed), T-06-38 (`FOR UPDATE` with deterministic lock order), T-06-39 (`status: 'DRAFT'` in the WHERE clause), T-06-40 (`invoice_id IS NULL` on assembly and stamping, `voidRestoredStock` plus unique `reversedMovementId`), T-06-131 (single-authority stock plan plus contract assertion), T-06-41 (`clinicId` first argument and in every WHERE clause), T-06-42 (audit inside the transaction), T-06-43 (payment status derived, never stored independently).

## Commits

| Hash | Message |
|---|---|
| `9ae43ed` | test(06-07): failing contract tests for the BIL-02 stock validator (RED) |
| `aafc966` | feat(06-07): stock validator with FOR UPDATE FIFO locking (GREEN) |
| `1f1aee4` | test(06-07): failing contract tests for the invoice repository (RED) |
| `a285f1e` | feat(06-07): invoice repository, BIL-01 sourcing and atomic finalize (GREEN) |
| `dd465c9` | test(06-07): failing unit tests for the invoice service and state guards (RED) |
| `0ca22ef` | feat(06-07): invoice service — draft assembly, finalize, state guards (GREEN) |
| `98c5503` | refactor(06-07): replace the loose `as never` widening in checkStock |
| `bd6b38e` | docs(06-07): log deferred items |

## TDD Gate Compliance

All three tasks followed RED → GREEN. Every `feat` commit is preceded by a `test` commit whose suite failed at the time it was made, and one `refactor` commit followed with the suite still green.

## Self-Check: PASSED

All seven created files and the one modified source file exist on disk; all eight commit hashes resolve in `git log`.

## For Plan 06-08

- Construct as `new InvoiceRepository(request.db, stockValidator)` and `new InvoiceService(repository, stockValidator, request.db)`. Both use the interactive `$transaction` overload, so the handle must be `TenantPrismaClient` (`request.db`), never `fastify.prisma`.
- `StockValidatorService` needs `StockMovementService`, which also takes `request.db`.
- `createDraftFromConsultation` must stay ungated (D-03 vs D-05). Every other route carries the D-05 Front Desk + Admin check.
- Map the error table above; `details.shortfalls` now survives to the client.
- Integration tests still owed: `-t "concurrent"` (two finalizes for the last unit), `-t "does not deduct"` (`current_qty` unchanged for a consultation-sourced line), draft idempotency under retry, and expired-batch exclusion.
