---
phase: 06-invoicing-payments
plan: "11"
subsystem: billing
tags: [refunds, credit-notes, gst, razorpay, d-12, d-19, d-22, d-42]
requires:
  - "06-03 (Refund, CreditNote, CreditNoteLineItem, Invoice.creditedPaise)"
  - "06-04 (refundInputSchema, makeRefundInputSchema, creditNoteSchema, CREDIT_NOTE_REASONS, REFUND_METHODS)"
  - "06-05 (money.ts allocateProRata, gst.service.ts computeInvoiceTax)"
  - "06-06 (numbering.service.ts nextDocumentNumber, billing-audit-log.ts)"
  - "06-07 (InvoiceRepository.recomputePaymentState, InvoiceService domain-error idiom)"
  - "06-09 (razorpay.client.ts, payment.service.ts, billing.routes.ts, tests/helpers/razorpay-mock.ts)"
  - "06-00b hotfix (genuinely atomic interactive $transaction on the tenant client)"
provides:
  - "RefundService — bounded, split-aware, webhook-completed refunds (D-12, D-42)"
  - "CreditNoteService — CN numbering, frozen-rate GST recomputation, balance reduction (D-19, D-22)"
  - "Six HTTP endpoints for refunds and credit notes behind MANAGE_PAYMENTS / VIEW_INVOICES"
  - "GET /billing/invoices/:invoiceId/refundable — server-computed refund maximum and per-leg breakdown"
affects:
  - "06-10 (webhook.worker.ts must complete the pending Refund rows this plan writes)"
  - "06-12 (mobile RefundSheet and CreditNoteScreen consume these six routes)"
tech-stack:
  added: []
  patterns:
    - "FOR UPDATE row lock + derived-not-assigned money state (from 06-07/06-09)"
    - "Tax-inclusive credit amount split back into taxable/tax components via allocateProRata"
    - "Gateway 200 never completes a money movement — only a signed webhook does"
key-files:
  created:
    - apps/api/src/modules/billing/refund.service.ts
    - apps/api/src/modules/billing/credit-note.service.ts
    - apps/api/src/modules/billing/refund.controller.ts
    - apps/api/src/modules/billing/credit-note.controller.ts
    - apps/api/src/modules/billing/__tests__/refund.service.test.ts
    - apps/api/src/modules/billing/__tests__/credit-note.service.test.ts
    - apps/api/tests/billing/refund.test.ts
    - apps/api/tests/billing/credit-note.test.ts
  modified:
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/src/modules/billing/billing.schema.ts
decisions:
  - "creditAmountPaise is tax-INCLUSIVE and is split back into taxable and tax components against the original line's own split, so a full-line credit reproduces that line's tax exactly instead of taxing the tax"
  - "The per-line credit cap is cumulative across earlier credit notes, not just against the raw lineTotalPaise (Rule 2 hardening beyond the plan's literal guard)"
  - "The credit-note service issues zero writes against invoices or invoice_line_items; recomputePaymentState is the sole path by which the balance moves"
  - "A refund is never blocked by an exceptionFlag — refunding is how a D-36 overpayment gets resolved"
  - "Refund legs are keyed off Payment.channel, not Payment.method, so a manually attested UPI payment refunds as a cash adjustment"
metrics:
  duration: ~75 min
  tasks: 3
  commits: 6
  files_created: 8
  files_modified: 2
  tests_added: 63
  completed: 2026-08-14
---

# Phase 6 Plan 11: Refunds and Credit Notes Summary

D-12 refunds bounded by captured-minus-reserved and completed only by the gateway webhook, and D-22 credit notes that reduce an invoice's balance without ever touching the immutable original.

## What was built

Two services, two controllers, six routes and four test files — 63 new tests across two unit suites and two integration suites.

**`refund.service.ts`** issues one `Refund` row per affected payment leg. The bound is `Σ payments(captured) − Σ refunds(pending OR processed)`, recomputed inside a `FOR UPDATE` transaction on the invoice row. Cash legs are written `processed` with a `processedAt`; digital legs are written `pending`, sent to `razorpay.payments.refund` with our own refund id as `receipt`, and only their `razorpayRefundId` is written back. D-42 per-leg refunds are supported through `paymentId` (one named leg, bounded by that leg alone) and `method` (all cash legs, or all digital legs); with neither, `allocateProRata` spreads the amount remainder-exactly across every leg that still has something to give.

**`credit-note.service.ts`** allocates a `CN-YYYYMM-XXXX` number from the shared gap-free counter inside the issuing transaction, recomputes tax with `computeInvoiceTax` from the invoice's own `gst_enabled_snapshot` / `is_inter_state` and each line's frozen `gstRatePercent`, enforces per-line and per-invoice caps under the row lock, and writes the document plus its line items. The invoice's `creditedPaise` and `balancePaise` move only through `recomputePaymentState`.

## Requested records

### 1. Every `status: 'processed'` in `refund.service.ts`

| Line | Context | On a Razorpay success path? |
|------|---------|------------------------------|
| 28 | File-header prose explaining that the one literal is on the cash path | No — comment |
| 358 | Docstring on `refundCashLeg` | No — comment |
| **379** | `tx.refund.create({ data: { …, status: 'processed', processedAt: now } })` inside `refundCashLeg` | **No** — cash leg, no SDK call reachable from this method |
| **391** | The returned `RefundLegResult` for that same cash leg | **No** — echoes the row just written |

The two executable occurrences (379, 391) are both inside `refundCashLeg`, which imports nothing from `razorpay.client.ts` and makes no gateway call. The digital path is `refundDigitalLeg` at lines 407-476: it writes `status: 'pending'` (line 430), calls `rzp.payments.refund` (line 440), and its write-back at line 458 sets `razorpayRefundId` and nothing else — no `status`, no `processedAt`. The unit test `leaves the refund PENDING and leaves it pending even though the SDK resolved` asserts exactly that, including that the update payload has no `status` key, and the integration test asserts the row is still `pending` and `balancePaise` still `0` after a successful gateway call.

### 2. The exact `Invoice` fields the credit-note service writes

**Directly: none.** `grep -Ec 'invoice\.update\(' apps/api/src/modules/billing/credit-note.service.ts` returns `0`.

Every invoice-side change is delegated to `InvoiceRepository.recomputePaymentState(tx, clinicId, invoiceId)`, called inside the issuing transaction, which derives and writes exactly:

| Field | Derivation |
|-------|-----------|
| `status` | From the derived balance, gated by the D-20 transition table |
| `amountPaidPaise` | `Σ payments(captured) − Σ refunds(processed)` |
| `creditedPaise` | `Σ creditNotes.totalPaise` |
| `balancePaise` | `grandTotalPaise − amountPaidPaise − creditedPaise` |
| `exceptionFlag` (+ `exceptionDetectedAt`) | Set only when the derivation detects a D-35/D-36 condition |

`subtotalPaise`, `taxableValuePaise`, `cgstPaise`, `sgstPaise`, `igstPaise`, `roundOffPaise`, `grandTotalPaise`, `invoiceNumber`, the GST snapshot columns and every `InvoiceLineItem` row are untouched. The integration test `leaves the invoice's money fields and every line item byte-identical` deep-equals the full invoice row (minus `creditedPaise`, `balancePaise`, `status`, `updatedAt`) and the full ordered line-item array before and after issuance.

## Design notes worth carrying forward

**`creditAmountPaise` is tax-inclusive.** The plan bounds it by `lineItem.lineTotalPaise`, and on a finalized invoice `lineTotalPaise = taxableValue + per-line tax`. Feeding that figure straight into `computeInvoiceTax` as a taxable value would tax the tax and let a full-line credit exceed the line it credits. So `taxablePortion` splits the credited amount against the original line's own `[taxable, tax]` weights with `allocateProRata`. Because the weights sum to the total, a full-line credit returns the taxable value exactly with no remainder, and the engine then reproduces the original tax to the paise — which is what makes the frozen-rate test's `totalPaise === line.lineTotalPaise` assertion hold.

**The 06-05 rounding invariant is preserved.** `CreditNote.totalPaise = taxableValuePaise + rounded cgst + rounded sgst + rounded igst`, with `roundOffPaise` persisted as a disclosure field and never re-added. `CreditNoteLineItem.totalPaise` carries per-line exact tax, mirroring `InvoiceLineItem`.

**D-36 negative balances.** Neither service consults `balance_paise` for its bound. The refund bound is captured-minus-reserved, so an overpaid invoice is fully refundable; and refunds are deliberately not blocked by `exceptionFlag`, because issuing one is precisely how staff resolve an overpayment.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing critical functionality] Per-line credit cap made cumulative**

- **Found during:** Task 2
- **Issue:** The plan specifies `creditAmountPaise <= lineItem.lineTotalPaise` per line plus a cumulative cap at invoice level. On a multi-line invoice that lets the same line be credited twice over — credit line A in full, then credit it in full again — as long as the invoice as a whole still has headroom. The plan's own must-have truth is "the credited amount per line can never exceed that line's original total", which the literal guard does not deliver.
- **Fix:** `creditedByLine` sums `CreditNoteLineItem.totalPaise` for the requested line ids, scoped through the `creditNote` relation to this invoice and clinic, and the guard compares against `lineTotalPaise − alreadyCredited`. Strictly stronger than the specified guard; the specified behaviour is the zero-prior-credits case.
- **Files:** `apps/api/src/modules/billing/credit-note.service.ts`
- **Commit:** `9647219`
- **Covered by:** unit test `counts what an earlier credit note already took off the same line`

**2. [Rule 3 — blocking] Plan 06-10's `webhook.worker.ts` does not exist yet**

- **Found during:** Task 3
- **Issue:** The plan's Task 3 instructs the async-completion test to "call the exported webhook job handler directly". Plan 06-10 is not merged into this worktree — `apps/api/src/modules/billing/webhook.worker.ts` is absent — so that import is unresolvable.
- **Fix:** `tests/billing/refund.test.ts` drives the transition through a local `applyRefundProcessedWebhook` helper performing exactly the two writes that handler owes (set the matched `Refund` to `processed` with a `processedAt`, re-derive the invoice's money state). The assertion under test is unchanged and is about the *endpoint*: after a successful gateway call the row is still `pending`, `processedAt` is null and `balancePaise` has not moved; only the webhook completes it. A file-header note directs 06-10's author to swap the helper for the real handler.
- **Files:** `apps/api/tests/billing/refund.test.ts`
- **Commit:** `d74bf12`

**3. [Rule 3 — blocking] Test-suite GST registration**

- **Found during:** Task 3
- **Issue:** `createTestClinic` (owned by plan 06-09) accepts no GST fields, so every invoice line finalized at zero tax and the frozen-rate assertion passed vacuously — the one test T-06-72 depends on.
- **Fix:** The credit-note suite applies `gstEnabled`, `gstin`, `stateCode` and `defaultGstRate` with a direct `prisma.clinic.update` in `beforeEach`, rather than widening the shared factory (which a sibling wave may also be editing).
- **Files:** `apps/api/tests/billing/credit-note.test.ts`
- **Commit:** `d5ec720`

**4. [Rule 3 — blocking] Two doc comments reworded to stop tripping their own grep gates**

- **Found during:** Tasks 1 and 2
- **Issue:** The header comment in `credit-note.service.ts` originally spelled out the forbidden Prisma method name while promising not to use it, which made `grep -c 'invoiceLineItem.update…'` return `1` on documentation alone.
- **Fix:** Reworded to name the tables rather than the methods, with an explicit note that a gate tripping on its own documentation is worse than no gate (the precedent `scripts/check-tenant-client.sh` sets for itself).
- **Files:** `apps/api/src/modules/billing/credit-note.service.ts`
- **Commit:** `9647219`

### Acceptance criterion that could not be met as literally written

**`grep -cE "fastify\.(get|post)\(" billing.routes.ts` returns `22`** — it returns **`20`**.

The plan's arithmetic is "sixteen from plan 06-09 plus six here". Plan 06-09 left sixteen *route registrations*, but two of them are `fastify.patch` and `fastify.delete`, which the `(get|post)` alternation excludes: the pre-existing get/post count was 14, so 14 + 6 = 20. Counting all four verbs — `grep -cE "fastify\.(get|post|patch|delete)\("` — returns exactly **`22`**, which is the figure the plan's prose describes. The substantive requirement (six new routes, all present and correctly gated) is met and verified individually:

```
POST /billing/invoices/:invoiceId/refunds       payHandler  (MANAGE_PAYMENTS)
GET  /billing/invoices/:invoiceId/refunds       readHandler (VIEW_INVOICES)
GET  /billing/invoices/:invoiceId/refundable    readHandler (VIEW_INVOICES)
POST /billing/invoices/:invoiceId/credit-notes  payHandler  (MANAGE_PAYMENTS)
GET  /billing/invoices/:invoiceId/credit-notes  readHandler (VIEW_INVOICES)
GET  /billing/credit-notes/:creditNoteId        readHandler (VIEW_INVOICES)
```

### Environment setup (not a code deviation)

The shared local `breeyo` database was in a failed-migration state (`P3009` on `20260812000000_backfill_phase_3_to_6_models`) and predates the Phase 6 tables. Following the convention of earlier worktrees (`breeyo_wt0609` etc.), an isolated `breeyo_wt0611` database was created, migrated, granted, RLS-configured via `prisma/post-migrate.sql` and seeded, and the worktree's gitignored `apps/api/.env` points at it. Nothing in the repository changed and the shared dev database was left untouched.

## Verification

| Gate | Result |
|------|--------|
| `pnpm --filter @breeyo/api test` (full suite) | **889 passed, 0 failed**, 80 todo, 78 files |
| `tests/billing/refund.test.ts` | 15 passed (plan requires ≥ 6) |
| `tests/billing/credit-note.test.ts` | 12 passed (plan requires ≥ 5) |
| `src/…/__tests__/refund.service.test.ts` | 19 passed |
| `src/…/__tests__/credit-note.service.test.ts` | 17 passed |
| `pnpm --filter @breeyo/api exec tsc --noEmit` | exit 0 |
| `bash scripts/check-tenant-client.sh` | exit 0 — 27 files scanned, no unexempted admin-client use |
| `grep -rn "'REFUNDED'" apps/api/src/modules/billing/` | no output |
| `grep -rn 'invoiceLineItem.update' credit-note.service.ts` | no output |
| `grep -rln 'decryptSecret' apps/api/src/modules/billing/` | `razorpay.client.ts` only |
| `grep -c "'pending', 'processed'" refund.service.ts` | 3 (≥ 1 required) |
| `grep -c 'allocateProRata' refund.service.ts` | 3 (≥ 1 required) |
| `grep -c 'FOR UPDATE' refund.service.ts` / `credit-note.service.ts` | 3 / 2 |
| `grep -c "nextDocumentNumber(tx, clinicId, 'CN'" credit-note.service.ts` | 1 |
| `grep -Ec 'invoice\.update\(' credit-note.service.ts` | 0 |

## Threat model coverage

| Threat | Mitigation as built |
|--------|---------------------|
| T-06-66 refunding more than was paid | `Σ captured − Σ (pending+processed)` under `FOR UPDATE`; 400 `REFUND_EXCEEDS_PAID`; sequential-partial integration test |
| T-06-67 concurrent partials ignoring pending | `RESERVING_REFUND_STATUSES = ['pending','processed']` named once at module scope; unit + integration coverage |
| T-06-68 completing a refund on the API 200 | Digital legs inserted `pending`; write-back carries `razorpayRefundId` only; tests assert the update payload has no `status`/`processedAt` |
| T-06-69 credit note editing a finalized invoice | Zero writes against `invoices`/`invoice_line_items`; before/after deep-equal of the invoice row and all line items |
| T-06-70 credit exceeding line or invoice total | Cumulative per-line cap + per-invoice cap against the computed total, both under the lock |
| T-06-71 crediting another clinic's line | `findMany` filtered by `id IN … AND invoiceId AND clinicId`; any missing id → 404 `CREDIT_LINE_NOT_FOUND`; cross-tenant integration test |
| T-06-72 recomputing from current settings | `gst_enabled_snapshot` / `is_inter_state` off the invoice, rate off the frozen line; test changes `defaultGstRate` 18 → 5 between finalize and issuance and asserts 18000 not 5000 |
| T-06-73 a Clinician refunding or crediting | Both writes behind `requirePermission('MANAGE_PAYMENTS')`; 403 asserted in both integration suites |
| T-06-74 unaudited money movement | `REFUND_INITIATED` and `CREDIT_NOTE_ISSUED` written inside the issuing transaction |

No new security surface was introduced beyond the plan's threat register — the six routes sit on the existing authenticate → tenantContext → requirePermission chain, no new outbound host is contacted beyond the already-registered Razorpay client, and no schema change was needed.

## Known stubs

None. Every endpoint is wired end to end against real Postgres in the integration suites.

## Notes for the orchestrator

- `apps/api/tests/billing/refund.test.ts` contains one forward reference to plan 06-10 (`applyRefundProcessedWebhook`). When 06-10 merges, replacing that helper with its exported job handler is a mechanical swap and the surrounding assertions are unchanged.
- `billing.routes.ts` is the likely merge point with 06-10 (which will add a webhook route). This plan's six additions are appended at the end of the file, after the receipt route.
- STATE.md and ROADMAP.md were deliberately not touched, per the orchestrator's instruction.

## Self-Check: PASSED

All eight created files verified present on disk; all six commits verified in `git log`.
