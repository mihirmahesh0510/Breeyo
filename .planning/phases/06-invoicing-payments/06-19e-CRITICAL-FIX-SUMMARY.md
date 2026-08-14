---
phase: 06
plan: 19e
type: unplanned-hotfix
subsystem: billing
tags: [invoicing, discounts, concurrency, row-locks, payments, gst]
requires:
  - 06-03 (billing schema)
  - 06-05 (GST engine)
  - 06-07 (finalize transaction)
  - 06-09 (payment service)
  - 06-00b (tenant-client transaction hotfix — the FOR UPDATE locks depend on it)
provides:
  - clearable invoice-level discount with a wire form for removal
  - single-transaction, row-locked draft edit
  - locked and bounded manual mark-paid
affects:
  - apps/api/src/modules/billing/invoice.repository.ts
  - apps/api/src/modules/billing/invoice.service.ts
  - apps/api/src/modules/billing/payment.service.ts
  - apps/api/src/modules/billing/money.ts
  - packages/validators/src/billing.ts
  - apps/mobile/src/features/billing/lib/builder-screen.ts
tech-stack:
  added: []
  patterns:
    - "explicit-null-as-clear: key presence distinguishes 'omitted' from 'cleared' on a PATCH"
    - "derive-under-lock: money the repository persists is recomputed from the rows it just wrote"
    - "shared collection guards: lockInvoiceForPayment / assertInvoiceCollectable at module scope"
key-files:
  created:
    - apps/api/tests/billing/invoice-critical-fixes.test.ts
  modified:
    - apps/api/src/modules/billing/invoice.repository.ts
    - apps/api/src/modules/billing/invoice.service.ts
    - apps/api/src/modules/billing/payment.service.ts
    - apps/api/src/modules/billing/money.ts
    - apps/api/src/modules/billing/__tests__/invoice.repository.test.ts
    - apps/api/src/modules/billing/__tests__/invoice-state.test.ts
    - apps/api/src/modules/billing/__tests__/invoice.service.test.ts
    - apps/api/src/modules/billing/__tests__/money.test.ts
    - packages/validators/src/billing.ts
    - packages/validators/src/__tests__/billing.test.ts
    - apps/mobile/src/features/billing/lib/builder-screen.ts
    - apps/mobile/src/features/billing/__tests__/InvoiceBuilderScreen.test.tsx
decisions:
  - "An absent PATCH key and an explicit null are different requests; the discount fields are nullable on the wire so removal is expressible at all"
  - "The repository derives subtotal, line-discount and invoice-discount totals from the rows it persists, under the lock, rather than accepting them from the caller"
  - "finalize prefers the discount DECLARATION (type + value) over the stored absolute figure, so a stale cache can never be frozen onto a numbered document"
  - "payment.service.ts's lock and balance guards are lifted to module scope and reused by InvoiceService.markPaid rather than reimplemented"
metrics:
  duration: ~50 min
  completed: 2026-08-14
  tests_added: 25
  api_tests: 1064 passed / 0 failed (baseline 1039 / 0)
---

# Phase 6 Plan 19e: Critical Review Fixes (CR-01, CR-03, CR-04) Summary

Closes the three data-corrupting findings of the Phase 6 close-out review: an
invoice-level discount that could never be cleared and went stale onto permanent
documents, a draft edit that could delete a finalized invoice's frozen tax
snapshot, and a mark-paid with neither a row lock nor an upper bound.

## Note on the review document

`.planning/phases/06-invoicing-payments/06-REVIEW.md` **does not exist on disk**
— not in this worktree, not in the main checkout, and no file anywhere in
`.planning/` contains the string `CR-01`. The findings were therefore worked
from the detailed descriptions in the task brief, which specify each defect's
location, mechanism, required fix and required test. Nothing was inferred beyond
those descriptions. If the review file is recovered later, its CR-01/CR-03/CR-04
sections should be checked against this summary.

## What was wrong, and why each one mattered

### CR-01 — the discount could not be cleared, and went stale

Two defects on one field, compounding.

**Unclearable.** `InvoiceService.updateDraft` mapped an omitted request key to
`null` (`parsed.invoiceDiscountType ?? null`), and `InvoiceRepository.updateDraft`
then mapped that `null` back to `undefined` (`data.invoiceDiscountType ?? undefined`),
which Prisma reads as "field not provided, leave unchanged". The two layers
cancelled out exactly. Worse, the wire had no representation for a removal in
the first place: `updateDraftInvoiceSchema` was `createInvoiceBaseSchema.partial()`,
whose `.optional()` accepts an absent key and *rejects* a null one. There was no
request a client could send that removed an invoice-level discount.

**Stale.** `invoice_discount_paise` is the absolute figure finalize freezes onto
the permanent document, and it was only recomputed when the request happened to
restate the discount *type*. Editing a draft's line items left the previous
amount behind. A 10% discount agreed against a ₹1,000 invoice survived as a flat
₹100 after the draft was corrected down to ₹200 — a 50% discount, frozen onto a
numbered tax invoice, with the stored `invoice_discount_value` still reading
`10`. `invoiceDiscountFor` compounded it by preferring the stored absolute over
the declaration whenever it was non-zero.

### CR-03 — a draft edit could gut a finalized invoice

`updateDraft` was two independent units of work. First an `invoice.updateMany`
scoped to `status: 'DRAFT'`, which committed on its own. Then — outside that
transaction, under no row lock, in a `WHERE` clause naming only
`(clinic_id, invoice_id)` with no status predicate — a `deleteMany` + `createMany`
that replaced the line items.

Each half looked safe alone. The pair was not. A PATCH whose header update landed
while the invoice was still a draft, followed by a finalize that completed
entirely before the second transaction opened, deleted the frozen tax snapshot
the finalize had just written and replaced it with unfrozen rows. The invoice
keeps its number, its `grand_total_paise` and its GST heads; its line items add
up to none of them. That is an unreconcilable document under Rule 46 and a
GSTR-1 mismatch.

### CR-04 — mark-paid had no lock and no bound

`InvoiceService.markPaid` wrote `input.amountPaise` verbatim. It contradicted the
invariant `payment.service.ts` documents at `paymentExceedsBalance` and enforces
on `recordCashPayment`, the split cash leg and payment-link creation:

- **No bound.** An amount larger than the balance drove `balance_paise` negative.
  `recomputePaymentState` then correctly flagged the invoice `overpayment`
  (D-36) — and D-36 has no resolve endpoint (`deferred-items.md` #15), so
  `assertNoUnresolvedException` blocks void, refund, credit note and every
  further payment on that invoice from then on. A typo at the counter
  permanently bricked an invoice.
- **No lock.** Two staff tapping "mark paid" at once both read the same
  outstanding balance, both passed, and both wrote a full payment row. Same
  terminal state, no typo needed. Reproduced in the new suite.

D-36 exists for the overpayment that *cannot* be prevented — two legs genuinely
racing to settle. Keeping the preventable kind off that list is what keeps the
exception queue meaningful.

## How each was fixed

### CR-01

- `UpdateDraftData.invoiceDiscount` is now an **edit**, not a value:
  `{ type, value } | undefined`. Absent means "leave it alone"; present-with-null
  means "clear it". The service draws the distinction on **key presence**
  (`'invoiceDiscountType' in parsed`), never on truthiness — Zod does not
  synthesise absent optional keys, so `in` is exact.
- `createInvoiceBaseSchema`'s two discount fields are `.nullable().optional()`.
  On a POST both spellings mean the same thing; on a PATCH they diverge, and that
  divergence is the fix. `discountGuard` now normalises with `!= null`, so a
  half-cleared pair (`{type: null, value: 5000}`) is still rejected.
- The repository derives `subtotal_paise`, `line_discount_paise` **and**
  `invoice_discount_paise` from the line rows it has just persisted, inside the
  lock. The header can no longer disagree with the lines.
- `invoiceDiscountFor` now prefers the **declaration** over the stored absolute,
  so finalize freezes a figure correct for the lines it is actually taxing
  whatever any earlier writer left in the column. A stored absolute with no
  declaration behind it is still honoured, but bounded by the base.
- The D-07 rule moved to `money.resolveDiscountPaise` — one implementation shared
  by the line level, the invoice level and the repository.

### CR-03

The whole edit is one transaction behind the same
`SELECT ... WHERE status = 'DRAFT' ... FOR UPDATE` lock `finalizeInvoice` takes.
This closes the window in both directions:

- a concurrent finalize **blocks** on the invoice row instead of interleaving;
- a finalize that got there first leaves this lock matching **zero rows** —
  under READ COMMITTED the `status = 'DRAFT'` predicate is re-evaluated against
  the committed row version once the lock releases — so the caller gets a clean
  `INVOICE_NOT_DRAFT` 409 and not one line item is touched.

### CR-04

`lockInvoiceForPayment`, `assertInvoicePayable` and `assertInvoiceCollectable`
are lifted to module scope in `payment.service.ts`, alongside
`issuePaymentReceipt` and for exactly the reason that one already is: a second
consumer exists that holds no `PaymentService` instance, and a re-implementation
is how the two paths would come to enforce different rules about the same money.
`PaymentService`'s private methods now delegate to them, so there is still one
call site per rule.

`markPaid` re-reads the row under `FOR UPDATE` and re-runs those guards inside
the transaction. The `PAID -> PAID` no-op is re-checked under the lock, where it
is authoritative. The settle-the-balance default now reads the locked
`balance_paise`, which also nets off credit notes that the old
`grandTotal - amountPaid` arithmetic ignored.

## Deviations from the brief

### Auto-fixed

**1. [Rule 2 — missing critical functionality] The mobile builder could not express a cleared discount**

- **Found during:** CR-01 verification, checking who actually calls the PATCH.
- **Issue:** `buildDraftPayload` assigns the discount keys conditionally
  (`if (input.invoiceDiscountType) ...`), so clearing the discount in the builder
  produced a request that simply omitted the pair. Under the corrected server
  semantics that means "leave the stored discount alone" — so the server fix
  alone would have left the user-visible bug completely intact, and the new wire
  form would have had no caller.
- **Why this is Rule 2 and not scope creep:** CR-01's stated defect is "an
  invoice-level discount can never be removed once set". A server that *can*
  remove one, reachable only by a client that never asks, does not close that.
- **Fix:** the builder now always sends the pair, null when unset. This is sound
  because the builder submits the **whole draft** — the store is hydrated from
  the invoice and every save replaces the line items wholesale — so "no discount
  in the store" is a positive statement about what the invoice should be, not an
  absence of information. Both halves travel together because `discountGuard`
  rejects half a discount. `dueDate` and `notes` keep their conditional
  assignment, where "untouched" genuinely is the right reading.
- **Files:** `apps/mobile/src/features/billing/lib/builder-screen.ts`,
  `apps/mobile/src/features/billing/__tests__/InvoiceBuilderScreen.test.tsx`
- **Commit:** 397012b

**2. [Rule 3 — blocking] Fresh worktree had no dependencies, database or Prisma client**

Worktree branched from `origin/main` (Phase 05), far behind. Fast-forwarded onto
`breeyo/phase-06-invoicing-payments` (4cfc3eb), ran `pnpm install`, built
`@breeyo/types` and `@breeyo/validators` (the API suite cannot resolve them
unbuilt), generated the Prisma client, and provisioned an **isolated** database.
The shared dev database (`breeyo`) was never touched.

### Tests updated to the new contract

Two existing assertions encoded the defective contract and were rewritten rather
than deleted:

- `invoice.repository.test.ts` — "scopes updateDraft to DRAFT at the query layer"
  asserted `prisma.invoice.updateMany` was called. Replaced by five tests
  asserting the stronger property: the `FOR UPDATE ... status = 'DRAFT'` lock
  comes first, no line item is touched when it finds nothing, and the
  replacement runs on the **same transaction handle** as the header update.
- `invoice.service.test.ts` — "applies the same percentage on updateDraft"
  asserted the service computed `invoiceDiscountPaise`. That arithmetic moved
  under the lock; the test now asserts the service forwards the *declaration*
  and explicitly that no stale absolute reappears. The percentage arithmetic
  itself is asserted in `money.test.ts` (7 new tests, including the
  basis-points trap) and against persisted rows in the repository suite.

## Tests

**25 added**, TDD throughout — RED committed separately (46973f5) and verified
failing before any implementation.

| Level | File | Added |
|---|---|---|
| Integration (real DB) | `apps/api/tests/billing/invoice-critical-fixes.test.ts` | 10 |
| Repository unit | `invoice.repository.test.ts` | 5 |
| Service unit | `invoice-state.test.ts`, `invoice.service.test.ts` | 6 |
| Pure function | `money.test.ts` | 7 |
| Validators | `packages/validators/src/__tests__/billing.test.ts` | 3 |
| Mobile | `InvoiceBuilderScreen.test.tsx` | 2 |

RED gate observed: 15 of these failed against the pre-fix tree (7 integration,
7 unit, 1 validator); the rest were written as correct-behaviour guards and
passed from the start — notably "leaves an untouched discount alone when the
PATCH does not mention it", which guards against over-correcting CR-01 into
clearing on every edit.

### The CR-03 race is deterministic, not sampled

Worth calling out because the obvious approach does not work. Firing the PATCH
and the finalize with `Promise.all` cannot reproduce this bug: the gap in the
defective code is a single round trip (~1 ms) and a finalize is a hundred times
longer, so the corrupting interleaving is unreachable by chance however many
times you retry. Locking the invoice row from the test does not distinguish
either — `updateMany` re-evaluates its `status = 'DRAFT'` predicate after
blocking, so the defective code passes.

The test instead installs a barrier on the first in-transaction
`invoiceLineItem.deleteMany` (a Proxy over the tenant handle) and starts a real
finalize on a second tenant client at exactly that instant. That call site *is*
the defect's window. The answer is then unambiguous in both directions: without
the lock the finalize completes inside the barrier and the subsequent delete
removes the snapshot it just wrote; with the lock it blocks, and afterwards the
invoice is either a clean draft with the new lines or a finalized document whose
line totals still sum to its `grand_total_paise`.

## Verification

| Check | Result |
|---|---|
| `pnpm exec vitest run` (apps/api) | **1064 passed, 0 failed**, 80 todo (baseline 1039 / 0) |
| `pnpm exec vitest run` (packages/validators) | 145 passed, 0 failed |
| `pnpm exec vitest run src/features/billing` (apps/mobile) | 386 passed, 0 failed |
| `tsc --noEmit` (apps/api) | 0 errors |
| `tsc --noEmit` (packages/validators) | 0 errors |
| `tsc --noEmit` (apps/mobile) | 61 errors, **all pre-existing**; 0 in billing or validators |
| `bash scripts/verify-phase-06.sh --all` | **ALL CHECKS PASSED** (23/23) |

The phase gate independently confirms the mobile TS position:
`TSC-MOBILE PASS — 1 Phase 6 error = baseline; 61 pre-existing app-wide`.

A clean pre-change baseline was captured on the same isolated database before
any edit (1039 passed / 0 failed) so the comparison is like-for-like. The `+25`
is exactly the tests added here.

### Environment

Provisioned isolated, per the brief:

- `breeyo_cr19e` and `breeyo_cr19e_shadow` on the existing Postgres container,
  created fresh, migrated, RLS-configured via `post-migrate.sql`, seeded
- Redis logical DB 9
- `apps/api/.env` written with these values; it is gitignored (`.gitignore:5`)
  and is **not** part of any commit

The shared dev database `breeyo` was never connected to.

## Out of scope, as instructed

- `refund.service.ts` (CR-02) — untouched, sibling agent
- `infra/aws/**` (CR-05) — untouched, sibling agent
- `STATE.md`, `ROADMAP.md` — not updated, as instructed

## Deferred / observed

- **D-36 still has no resolve endpoint** (`deferred-items.md` #15). CR-04 removes
  the *preventable* route into that state; a genuine two-leg race can still land
  there and remains unresolvable without staff DB access. That endpoint is the
  natural follow-up and is now the only way in.
- **61 pre-existing `tsc` errors in apps/mobile**, owned by Phases 1-5 and
  `packages/ui` (missing `expo-image-manipulator` and `expo-speech-recognition`
  types, `IntrinsicAttributes` mismatches in route files, an `import.meta` under
  CommonJS). Out of scope per the scope-boundary rule; the phase gate already
  tracks them against a baseline.

## Known Stubs

None. Every code path changed here is wired end to end — server, shared schema
and mobile client — and each is covered by a test that fails without it.

## Threat Flags

None. No new endpoint, auth path, file access pattern or trust-boundary schema
change. All three fixes *narrow* existing surface: an added row lock, an added
upper bound on a money field, and a validator that accepts one additional value
(`null`) on a field it already accepted.

## Commits

| Hash | Message |
|---|---|
| 46973f5 | `test(06-19e): add failing tests for CR-01, CR-03 and CR-04` |
| 397012b | `fix(06-19e): lock and bound the draft edit and mark-paid paths` |

## Self-Check: PASSED

- All 8 claimed files present on disk.
- Both claimed commits present in `git log` (46973f5, 397012b), on
  `worktree-agent-ac648912918c04296`, parented on 4cfc3eb.
- Neither commit deletes a tracked file (`git diff --diff-filter=D` empty).
- `apps/api/.env` confirmed gitignored (`.gitignore:5`) and absent from both
  commits.
- Working tree clean apart from this summary.
