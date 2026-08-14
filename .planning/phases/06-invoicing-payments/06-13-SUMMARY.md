---
phase: 06-invoicing-payments
plan: "13"
subsystem: billing
tags: [invoicing, quick-sale, emr-hook, stock, gst]
wave: 10
requires:
  - "06-07 invoice.service.ts / invoice.repository.ts / stock-validator.service.ts"
  - "06-08 billing HTTP layer and integration test skeleton"
  - "06-05 gst.service.ts + money.ts"
  - "06-06 numbering.service.ts"
  - "06-04 quickSaleSchema"
  - "06-03 invoices_one_draft_per_consultation partial unique index"
provides:
  - "D-03 server-initiated End-Consultation draft invoice hook (ungated, best-effort)"
  - "D-04 Quick Sale create-and-finalize service, controller and route plugin"
  - "POST /billing/quick-sale"
affects:
  - "apps/api/src/modules/emr (now depends one-directionally on billing)"
  - "apps/api/src/app.ts route registration"
tech-stack:
  added: []
  patterns:
    - "Best-effort cross-module side effect outside the clinical transaction"
    - "Single-transaction create-and-finalize (no intermediate committed draft)"
key-files:
  created:
    - apps/api/src/modules/billing/quick-sale.service.ts
    - apps/api/src/modules/billing/quick-sale.controller.ts
    - apps/api/src/modules/billing/quick-sale.routes.ts
    - apps/api/tests/billing/consultation-draft-hook.test.ts
    - apps/api/tests/billing/quick-sale.test.ts
  modified:
    - apps/api/src/modules/emr/emr.service.ts
    - apps/api/src/modules/emr/emr.routes.ts
    - apps/api/src/app.ts
decisions:
  - "Quick Sale line items keep stockMovementId null — stamping the created movement ids back would make restoreToStock skip them and silently break D-34 counter-sale restoration"
  - "The D-03 hook is extracted into a private seedDraftInvoice method, matching the existing auditDosageOverrides side-effect shape"
  - "invoiceService is an optional fifth constructor parameter so the four-argument EMR unit suites keep compiling"
  - "Quick Sale needs its own single transaction rather than repository.finalizeInvoice, which requires a committed DRAFT row"
metrics:
  duration: ~75 min
  tasks: 3
  files: 8
  tests_added: 20
  completed: 2026-08-14
---

# Phase 06 Plan 13: Remaining Invoice-Creation Paths Summary

Wires D-03's ungated, non-blocking End-Consultation draft hook into `EmrService.finalize` and adds D-04's Quick Sale, which creates and finalizes a counter-sale invoice with row-locked stock deduction in a single transaction.

## What was built

**D-03 — the End-Consultation hook.** `EmrService` gained an optional fifth `InvoiceService` collaborator and a private `seedDraftInvoice` method. Ending a consultation now seeds exactly one `DRAFT` invoice carrying every item the clinician dispensed, addressed to the pet's owner. The call is a direct service call with no HTTP surface and no permission check, because the trigger is a Clinician and D-05 withholds `CREATE_INVOICES` from that role. It sits outside the clinical transaction in a best-effort `try/catch`, so a billing failure cannot block a vet closing a medical record.

**D-04 — Quick Sale.** `QuickSaleService.createAndFinalize` resolves the cart against the clinic's own inventory, prices it from the current selling price, computes GST with plan 06-05's engine, and then — inside one `$transaction` — creates the invoice, deducts stock under `FOR UPDATE`, assigns the number, freezes the tax snapshot, stamps owner attribution onto the movements and writes the audit row. Exposed as `POST /billing/quick-sale` behind `CREATE_INVOICES`.

## Answers to the questions the plan asked

**Hook insertion line numbers** (`apps/api/src/modules/emr/emr.service.ts`):

| What | Line |
|------|------|
| `this.repository.updateQueueEntryStatus(...)` | 193 |
| `this.lockService.releaseLock(...)` | 201 |
| `this.seedDraftInvoice(clinicId, consultationId, vetId)` | **204** |
| `writeAuditLog(..., CONSULTATION_FINALIZED, ...)` | 207 |

The hook sits after the queue-entry update (so a draft can never exist for a consultation that failed to finalize) and before the audit write (so finalize stays one logical operation). It was placed *after* `releaseLock` rather than immediately after the queue update, so that a slow or hanging billing call never holds the consultation lock open.

**Was `invoiceService` made optional?** Yes — `private readonly invoiceService?: InvoiceService`. `src/modules/emr/__tests__/emr.service.test.ts` constructs `EmrService` with exactly four arguments, and those 28 unit tests are not exercising billing at all. The call site is null-guarded with a comment recording that a null service disables the hook, which is the correct behaviour there — and, because the hook is best-effort regardless, an unwired service degrades exactly as a failing one does.

**`console.error` or a logger?** `console.error`, **matching** the existing precedent at what is now lines 316-320 (`[EmrService] dosage override audit failed`). `EmrService` holds no logger reference, and introducing one for this single call would have left the two best-effort side effects in the same class reporting failures two different ways. Recorded below as a follow-up.

**Was `repository.finalizeInvoice` reused for Quick Sale?** No — a parallel path was needed, exactly as the plan's fallback anticipated. `finalizeInvoice` opens its own `$transaction` and begins by locking an already-committed `DRAFT` row `FOR UPDATE`; composing `createDraft` with it would mean two transactions and a window in which a phantom draft exists. `QuickSaleService` therefore runs its own single transaction. Critically, only the *persistence sequence* is parallel — the tax arithmetic is not: `allocateInvoiceDiscount` and `computeInvoiceTax` come from 06-05 and `nextDocumentNumber` from 06-06, and the grep gate confirming no reimplemented tax arithmetic passes at 0 matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Quick Sale line items keep `stockMovementId` null instead of having the created movement ids written back**

- **Found during:** Task 2
- **Issue:** The plan's action step 4 said to "write each movement's id back onto its line's `stockMovementId` so the void path can reverse exactly what this sale moved." Doing that would achieve the opposite. Plan 06-07's `StockValidatorService.restoreToStock` treats a line's non-null `stockMovementId` as proof that the movement pre-dated the invoice — i.e. a drug administered during a consultation — and **excludes it from restoration**. Stamping a Quick Sale's own movement ids onto its own lines would therefore make every counter-sale void restore nothing, silently contradicting D-34, which names Quick Sale counter items as the primary case restoration exists for.
- **Fix:** Lines are created with `stockMovementId: null` and stay that way. The movements remain reachable from the void path through `StockMovement.invoiceId`, which is precisely what makes deduct and restore exact mirrors on this path. A long comment at the creation site records both directions of the dependency (null is required for `reserveAndDeduct` to accept the line at all, and required again for `restoreToStock` to reverse it).
- **Verification:** `restores counter-sale stock when the invoice is voided (D-34)` asserts the line's `stockMovementId` is null, that `restoredMovementCount` is 1, and that the batch quantity returns to its pre-sale value.
- **Files modified:** `apps/api/src/modules/billing/quick-sale.service.ts`, `apps/api/tests/billing/quick-sale.test.ts`
- **Commits:** `4b18e41`, `1fbf1f7`

**2. [Rule 3 - Blocking] Test database provisioned for this worktree**

- **Found during:** Task 1 setup
- **Issue:** The worktree had no `node_modules` and no `apps/api/.env`, and the shared `breeyo` dev database had drifted — it contained a migration absent from this branch and none of the three Phase 5/6 migrations, so no billing table existed. Integration tests could not run.
- **Fix:** `pnpm install`, copied the gitignored `.env`, then created a dedicated `breeyo_wt0613` database rather than migrating the shared one, since sibling agents in this wave are using it. Applied `prisma migrate deploy`, `post-migrate.sql` and `db:seed`, and pointed only this worktree's `.env` at it.
- **Files modified:** none tracked (`.env` is gitignored)
- **Note for the orchestrator:** the shared `breeyo` database is still un-migrated for Phase 5/6. Any later wave that expects to run integration tests against it will need the same treatment.

### Adjusted Verification Commands

- The plan's `pnpm --filter @breeyo/api test -- tests/emr` matches nothing: the EMR suites live at `src/modules/emr/__tests__/`. Ran `--run src/modules/emr` instead — **44 tests, unchanged before and after this plan.**

### Acceptance Criteria Notes

- `grep -c 'createDraftFromConsultation' apps/api/src/modules/emr/emr.service.ts` returns **6**, not the `1` the plan specified. The criterion's intent — one call site — holds: `grep -c 'this.invoiceService.createDraftFromConsultation'` returns exactly `1`, and the test suite asserts it with a regex match count. The other five occurrences are in the doc comment the same plan required, explaining the D-03/D-05 split and naming the gated Front Desk endpoint. The two instructions are mutually exclusive as literally written; the comment was kept.
- The plan asked for the `createDraftFromConsultation` call itself to sit between the queue update and the audit write. It is one level of indirection away, in `seedDraftInvoice`, matching how the existing `auditDosageOverrides` side effect is already structured. The ordering property is asserted both transitively (the `this.seedDraftInvoice(` call site's position within `finalize`) and directly (that the helper is in fact the billing call).

## Threat Model Coverage

| Threat | Disposition | Where it is proven |
|--------|-------------|--------------------|
| T-06-84 (billing failure blocks a finalize) | mitigated | `finalizes the consultation anyway when draft creation throws` — injects a rejecting `InvoiceService`, asserts 200, `finalized`, queue `DONE`, audit row present |
| T-06-85 (draft creation exposed as a Clinician-callable endpoint) | mitigated | `creates the draft for a Clinician who does not hold CREATE_INVOICES` — first proves the role is genuinely denied at `POST /billing/invoices` (403), then that the hook still seeds a draft |
| T-06-86 (retried End Consultation creates two drafts) | mitigated | `leaves exactly one draft when End Consultation is pressed twice` plus `is idempotent at the service level` |
| T-06-87 (Quick Sale oversells under concurrency) | mitigated | `resolves two concurrent sales of the last unit to exactly one success` — one 2xx, one 409, batch lands on exactly 0 |
| T-06-88 (phantom draft from a failed one-tap sale) | mitigated | `rejects a sale that outruns stock and leaves no phantom invoice behind` — `quick_sale` invoice count unchanged |
| T-06-89 (cross-clinic inventory item) | mitigated | `rejects an inventory item belonging to another clinic as not found` — 404, never 403 |
| T-06-90 (counter goods treated as exempt) | mitigated | `taxes counter goods rather than exempting them` — CGST+SGST present, `documentType` is `tax_invoice` |

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @breeyo/api test --run` (full suite) | **947 passed, 0 failed, 80 todo, 9 skipped** |
| `tests/billing/consultation-draft-hook.test.ts` | 9 passed (plan required ≥7) |
| `tests/billing/quick-sale.test.ts` | 11 passed (plan required ≥9) |
| `src/modules/emr` (regression) | 44 passed — no reduction |
| `pnpm --filter @breeyo/api exec tsc --noEmit` | exit 0 |
| `bash scripts/check-tenant-client.sh` | exit 0 — 30 files scanned |
| `grep -rn 'requirePermission' apps/api/src/modules/emr/` | no output — the finalize path is ungated |
| `grep -rn "from '../emr" apps/api/src/modules/billing/` | no output — the EMR→billing dependency is not circular |

One full-suite run before the final one showed a single `read ECONNRESET` failure inside `cleanupTestData` in `tests/billing/webhook.test.ts`. It did not reproduce: that file passes in isolation (24 tests), all 12 billing suites pass together (139 tests), and the full suite passes clean. Recorded as pre-existing flakiness in the shared-database cleanup path, not a regression from this plan.

## Known Stubs

None. Both creation paths are fully wired end to end.

## Follow-ups

1. **Best-effort logging idiom.** `EmrService` now has two side effects reporting failures via `console.error` (the D-28 dosage-override audit and the D-03 draft hook). Both should move to the Fastify logger; doing it for only the new one would have introduced the inconsistency rather than removing it.
2. **Shared dev database drift.** `breeyo` is missing the Phase 5 and Phase 6 migrations and carries one migration not in this branch. Worth resolving centrally before the next wave.
3. **Quick Sale discounts.** `allocateInvoiceDiscount` is called with a hard zero, deliberately keeping the Section 15(3)(a) ordering intact for the day D-07 discounts reach the counter screen. Wiring a discount field into `quickSaleSchema` is a one-line change at that point.

## Commits

| Hash | Message |
|------|---------|
| `5b74447` | test(06-13): add failing coverage for the D-03 End-Consultation draft hook |
| `9b89ddc` | feat(06-13): seed the D-03 draft invoice when a consultation is finalized |
| `4b18e41` | test(06-13): add failing coverage for the D-04 Quick Sale counter-sale path |
| `1fbf1f7` | feat(06-13): add D-04 Quick Sale create-and-finalize in one transaction |

## Self-Check: PASSED

All five created source/test files exist on disk, and all four commit hashes resolve in `git log`. STATE.md and ROADMAP.md were deliberately not touched — the orchestrator owns those writes centrally after this wave merges.

## TDD Gate Compliance

Both tasks followed RED → GREEN with separate commits. Task 1's RED run failed 8 of 9 (the ninth was a fixture bug in the test itself, fixed before implementation); Task 2/3's RED run failed all 11. No test passed unexpectedly before implementation.
