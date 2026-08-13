---
phase: 06-invoicing-payments
plan: "05"
subsystem: payments
tags: [gst, tax, money, integer-paise, pure-functions, tdd, vitest, cgst, sgst, igst, rule-46a]

# Dependency graph
requires:
  - phase: 06-invoicing-payments (plan 06-04)
    provides: "GST_RATE_SLABS / TAX_TREATMENTS / INVOICE_DOCUMENT_TYPES / PAISE_PER_RUPEE constants and the TaxBreakdown return shape in @breeyo/types"
  - phase: 05-inventory-management
    provides: "InventoryItem.sellingPrice and StockMovement.unitPrice as Decimal(10,2) rupees — the two columns toPaise converts from (D-31)"
provides:
  - "apps/api/src/modules/billing/money.ts — toPaise / fromPaise / formatPaiseINR / allocateProRata, pure integer-paise arithmetic and the single Decimal-rupee boundary (D-31)"
  - "apps/api/src/modules/billing/gst.service.ts — computeInvoiceTax and allocateInvoiceDiscount, a pure I/O-free per-line exempt-aware GST engine (BIL-07)"
  - "Exact pro-rata allocator reusable for D-42 split-payment refund math (negative totals allocate exactly)"
  - "Corrected grand-total formula: grandTotal = taxable + rounded heads; roundOffPaise is a GSTR-1 disclosure field, not a term in the total"
  - "67 unit tests with no database dependency covering BIL-07, D-07, D-31 and threats T-06-19 / T-06-27 / T-06-28 / T-06-29 / T-06-30"
affects: [06-06-invoice-finalize, 06-07-payments, 06-08-refunds-credit-notes, 06-pdf-templates, 07-whatsapp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure domain module: no database handle in any signature, no I/O, deterministic — mirrors apps/api/src/modules/emr/dosage.service.ts"
    - "Integer paise end-to-end; the only float divide in the money path is display-only and documented as such"
    - "Grep-enforced purity gates on the money path (no PrismaClient / await / async / toFixed / parseFloat / Number( )"

key-files:
  created:
    - apps/api/src/modules/billing/money.ts
    - apps/api/src/modules/billing/gst.service.ts
    - apps/api/src/modules/billing/__tests__/money.test.ts
    - apps/api/src/modules/billing/__tests__/gst.service.test.ts
  modified:
    - packages/types/src/constants/gst.ts
    - packages/types/src/billing.ts

key-decisions:
  - "grandTotalPaise = taxableValue + the three ROUNDED heads. roundOffPaise is computed and persisted as a GSTR-1 disclosure field but is deliberately NOT a term in the total — the heads are already rounded, so re-adding the delta would double-count it (corrected pre-merge after coordinator review)"
  - "Odd-paise convention: when a line's total tax is an odd number of paise, the extra paise is assigned to CGST and SGST takes the floor, so the two heads always sum to the exact line tax"
  - "allocateProRata truncates toward zero rather than using Math.floor, so a negative total (D-42 split-payment refund) allocates exactly and sign-symmetrically instead of over-allocating every element"
  - "Rate validation runs after the gstEnabled early return, so an unregistered clinic with stale catalog rate data still produces a clean invoice (Section 122 / Pitfall 12)"
  - "toPaise rejects a third decimal place rather than rounding it — sub-paise rounding is how an uncollectable amount enters a financial record"
  - "allocateInvoiceDiscount throws when the discount exceeds the invoice taxable value rather than clamping; a 100% discount is permitted per D-40"
  - "PerLineTax echoes taxableValuePaise alongside the three heads so 06-06's finalize transaction can persist a line row without re-joining the input"

patterns-established:
  - "Money boundary (D-31): Decimal rupees are converted to integer paise at exactly one place, toPaise, with a dedicated 100x-error guard test"
  - "Discount-before-tax (Section 15(3)(a)): allocateInvoiceDiscount runs before computeInvoiceTax so per-line taxable values always sum to the invoice taxable value"
  - "Invoice-level rounding: tax heads are summed exactly across lines and rounded once; per-line rounding is proven absent by a three-rate test whose invoice head differs from the sum of per-line rounded values"
  - "Printed-figures invariant: the grand total is the sum of the amounts printed on the document, so adding up the invoice lines by hand always reproduces the stated total; the round-off is disclosed alongside, never folded in"

requirements-completed: [BIL-07]

# Metrics
duration: 60min
completed: 2026-08-14
---

# Phase 06 Plan 05: GST Engine & Money Boundary Summary

**Pure, I/O-free integer-paise money arithmetic plus a per-line exempt-aware Indian GST engine — CGST/SGST or IGST by place of supply, one rounding per tax head at invoice level, CGST Rule 46A document typing, and a remainder-exact pro-rata discount allocator — 67 tests, no database.**

## Performance

- **Duration:** ~60 min (including the pre-merge round-off correction)
- **Started:** 2026-08-13T20:27:00Z
- **Completed:** 2026-08-13T21:16:00Z
- **Tasks:** 2 (both TDD, 4 gate commits) + 1 review fix
- **Files created:** 4
- **Files modified:** 2 (shared-type docstrings)

## Accomplishments

- `toPaise` converts Phase 5's `Decimal(10,2)` rupee columns to integer paise by parsing the decimal string, so `0.07 → 7` exactly and the float multiply that produces `7.000000000000001` never happens (T-06-19).
- An exempt veterinary line computes zero CGST, SGST and IGST *even when the catalog carries a non-zero rate* — the single most consequential compliance behaviour in the phase (T-06-27, Notification 12/2017-CT(R) Entry 46).
- An unregistered clinic (`gstEnabled: false`) returns zero tax and `documentType: 'invoice'` before any rate is read, so stale catalog data cannot cause a Section 122 offence (T-06-28).
- Each tax head is rounded once at invoice level; a three-rate test proves the invoice head (400 paise) differs from the sum of per-line rounded values (300 paise), which is the only way to demonstrate that per-line rounding did not occur (T-06-29).
- `allocateInvoiceDiscount` pushes the invoice-level discount down onto every line — exempt lines included — before tax is computed, and `Σ line.taxableValuePaise === invoice.taxableValuePaise` holds exactly (T-06-30, D-07, Section 15(3)(a)).
- `allocateProRata` is exact for negative totals too, so D-42's per-leg split-payment refund allocation can reuse it unchanged.
- The grand total is the sum of the figures actually printed on the invoice, so a vet or owner adding the lines up by hand reproduces the stated total exactly — a double-count of the round-off delta was caught in coordinator review and fixed before merge (see below).

## Task Commits

Each task followed the RED → GREEN TDD gate sequence. Both RED commits were run and confirmed failing before the corresponding implementation was written.

1. **Task 1: Integer-paise money arithmetic and the Decimal-rupee boundary adapter (D-31)**
   - RED: `f9e2ede` — `test(06-05): add failing money arithmetic tests`
   - GREEN: `971758f` — `feat(06-05): implement integer-paise money module`
2. **Task 2: Per-line, exempt-aware GST computation with invoice-level rounding and Rule 46A document typing (BIL-07)**
   - RED: `9f24db7` — `test(06-05): add failing GST computation tests`
   - GREEN: `4a843b1` — `feat(06-05): implement per-line exempt-aware GST engine`

**Review fix:** `3cba47a` — `fix(06-05): stop double-counting roundOffPaise in the invoice grand total`

**Plan metadata:** `e51c6ac` — `docs(06-05): complete GST engine and money boundary plan` (superseded by this revision)

No REFACTOR commit was needed for either task — both implementations were written directly against the passing shape with no cleanup pass required. The review fix was committed as a follow-up rather than amended into `4a843b1`, so that the RED→GREEN pairing stays intact and the defect and its correction are both legible in the history of a financially load-bearing module.

## TDD Gate Compliance

| Gate | Task 1 | Task 2 |
|------|--------|--------|
| RED (`test(...)`, confirmed failing) | `f9e2ede` — failed with "Failed to load url ../money.js" | `9f24db7` — failed with "Failed to load url ../gst.service.js" |
| GREEN (`feat(...)` after RED) | `971758f` — 31 tests pass | `4a843b1` — 34 tests pass |
| REFACTOR | not needed | not needed |

Sequence verified in `git log`: `test → feat → test → feat`. No implementation commit precedes its test commit.

## Files Created/Modified

- `apps/api/src/modules/billing/money.ts` — `toPaise` (the D-31 Decimal-rupee → paise boundary), `fromPaise`, `formatPaiseINR` (cached `en-IN` `Intl.NumberFormat`), `allocateProRata` (remainder-exact integer allocator).
- `apps/api/src/modules/billing/gst.service.ts` — `computeInvoiceTax` (per-line, exempt-aware, invoice-level rounding, Rule 46A typing) and `allocateInvoiceDiscount` (pro-rata, pre-tax). Exports `TaxableLine`, `PerLineTax`, `DiscountedLine`, `InvoiceTaxResult`.
- `apps/api/src/modules/billing/__tests__/money.test.ts` — 31 tests.
- `apps/api/src/modules/billing/__tests__/gst.service.test.ts` — 36 tests.
- `packages/types/src/constants/gst.ts` — MODIFIED: corrected the `PAISE_PER_RUPEE` docstring, which stated the double-counting grand-total formula.
- `packages/types/src/billing.ts` — MODIFIED: corrected and expanded the `roundOffPaise` / `grandTotalPaise` docstrings on `Invoice`, `CreditNote` and `TaxBreakdown` to state the disclosure-field semantic explicitly.

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/modules/billing` | 3 files, **78 tests passed** (67 new + 11 pre-existing service-catalog-seed) |
| `tsc --noEmit` (@breeyo/api) | exit 0 |
| `tsc --noEmit` (@breeyo/types) | exit 0 |
| `pnpm --filter @breeyo/types test` | 52 passed |
| `pnpm --filter @breeyo/validators test` | 142 passed (4 files) |
| `grep -c 'PrismaClient\|await \|async ' money.ts` | `0` |
| `grep -c 'Math.round(.*\* 100)\|\* 100)' money.ts` | `0` |
| test named `guards the 100x conversion error` present | `1` |
| `grep -c 'PrismaClient\|prisma\|await \|async ' gst.service.ts` | `0` |
| `grep -c 'toFixed\|parseFloat\|Number(' gst.service.ts` | `0` |
| `grep -c "from '@breeyo/types'" gst.service.ts` | `2` |
| `grep -c 'const GST_RATE_SLABS\|\[0, *5, *18, *40\]' gst.service.ts` | `0` |
| `-t "inter-state"` | 3 tests matched |
| `-t "rounding"` | 5 tests matched |
| `-t "document type"` | 5 tests matched |
| `-t "unregistered"` | 2 tests matched |
| `-t "pro-rata"` | 10 tests matched |

The `node -e` dist assertion in the acceptance criteria was satisfied by its documented alternative — `allocateProRata(100, [1, 1, 1])` is asserted to equal `[34, 33, 33]` and to sum to exactly `100` inside the vitest file, alongside an exhaustive 8-totals × 9-weight-sets exactness sweep.

## Decisions Made

### Grand total sums the printed figures; round-off is disclosed, not added

`grandTotalPaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise` using the rounded heads. `roundOffPaise` is persisted as a GSTR-1 disclosure figure and excluded from the total. This supersedes the plan's action step 8, which double-applied the rounding delta — see the dedicated section below for the worked example and the coordinator's ruling.

### Odd-paise assignment convention: CGST

When a line's total tax is an odd number of paise, `sgst = Math.floor(total / 2)` and `cgst = total - sgst`, so **CGST receives the extra paise**. Verified by a dedicated test: 33,333 paise at 5% gives an exact 1,666.65 paise → 1,667 paise, split as CGST 834 / SGST 833. The two heads always sum to exactly the line total; the convention exists solely to make the split deterministic and reproducible during an audit, since either head could legitimately take the paise.

### Truncation toward zero in `allocateProRata` (rather than `Math.floor`)

The plan specified `Math.floor`. For positive totals the two are identical, and every behaviour the plan specified is met either way. `Math.trunc` was used instead so that a **negative** total allocates exactly and sign-symmetrically: `allocateProRata(-100, [1,1,1])` returns `[-34, -33, -33]` rather than `Math.floor`'s `[-32, -34, -34]`. This makes the allocator directly reusable for D-42's per-leg split-payment refund math without a second, near-duplicate allocator that would have to be re-verified independently. Documented in the function's JSDoc and covered by a dedicated test.

### `documentType` for an empty invoice is `invoice`, not `bill_of_supply`

The naive Rule 46A branch (`hasTaxable && hasExempt` → mixed, `hasTaxable` → tax invoice, else → bill of supply) types a zero-line invoice as a bill of supply, which is meaningless. The empty case is folded into the same early return as `gstEnabled: false`, per the plan's stated behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `allocateProRata` overflow guard**
- **Found during:** Task 1
- **Issue:** `allocateProRata` computes `total * weight` before dividing. Past `Number.MAX_SAFE_INTEGER` that product is no longer exact, so the allocation would silently return wrong money with no error.
- **Fix:** Added a `Number.isSafeInteger(product)` check that throws naming the two operands and stating that precision is lost. Also added a `Number.isSafeInteger` guard on `toPaise`'s result.
- **Files modified:** `apps/api/src/modules/billing/money.ts`
- **Verification:** Dedicated test `throws rather than silently losing precision above 2^53`.
- **Committed in:** `971758f`

**2. [Rule 2 - Missing Critical] Input validation on `allocateProRata` and `allocateInvoiceDiscount`**
- **Found during:** Tasks 1 and 2
- **Issue:** Neither function's specified behaviour covered a fractional total, a negative weight, a negative discount, or a discount larger than the invoice. A discount larger than the invoice would push a line's taxable value negative and produce negative tax.
- **Fix:** `allocateProRata` throws on a non-integer total and on any negative or fractional weight. `allocateInvoiceDiscount` throws on a negative/fractional discount and on a discount exceeding the invoice taxable value (a 100% discount is explicitly permitted per D-40).
- **Files modified:** `apps/api/src/modules/billing/money.ts`, `apps/api/src/modules/billing/gst.service.ts`
- **Verification:** Four dedicated tests, plus a `supports a 100% discount (D-40)` test confirming the boundary is inclusive.
- **Committed in:** `971758f`, `4a843b1`

**3. [Rule 2 - Missing Critical] `fromPaise` sign handling for sub-rupee negatives**
- **Found during:** Task 1
- **Issue:** The plan's suggested implementation (`Math.trunc(paise / 100)` for the integer part) loses the sign for values between −99 and −1 paise, because `Math.trunc(-0.5)` is `-0` and `String(-0)` is `'0'`. Round-off deltas (Section 170) and partial refunds are routinely negative and sub-rupee, so `-50` would have rendered as `0.50`.
- **Fix:** The sign is derived from the input and applied to the whole string; the magnitude is formatted from `Math.abs(paise)`.
- **Files modified:** `apps/api/src/modules/billing/money.ts`
- **Verification:** Test asserts `fromPaise(-50) === '-0.50'` and `fromPaise(-49999) === '-499.99'`.
- **Committed in:** `971758f`

**4. [Rule 3 - Blocking] Worktree had no installed dependencies or generated clients**
- **Found during:** Setup, before Task 1
- **Issue:** The Claude Code worktree branched from `origin/main` (5 phases behind) with no `node_modules`, no built `@breeyo/types` / `@breeyo/validators` `dist/`, and no generated Prisma client. `@breeyo/types` resolves via `dist/index.js`, so `gst.service.ts`'s runtime import of `GST_RATE_SLABS` could not resolve and `tsc --noEmit` reported 40+ pre-existing module-resolution errors.
- **Fix:** Fast-forwarded the worktree branch onto `breeyo/phase-06-invoicing-payments` (HEAD was a strict ancestor), then ran `pnpm install`, `pnpm --filter @breeyo/types build`, `pnpm --filter @breeyo/validators build`, `pnpm --filter @breeyo/api db:generate`. No package was added; only already-declared dependencies were installed.
- **Files modified:** None committed — all build output is gitignored.
- **Verification:** `tsc --noEmit` exits 0 with a clean baseline before any of this plan's code was written.
- **Committed in:** n/a (no source change)

---

**Total deviations:** 4 auto-fixed (3 missing critical, 1 blocking)
**Impact on plan:** All four are correctness or environment fixes on the money path. No scope creep — no function, export or behaviour outside the plan's two artifacts was added.

## Corrected Pre-Merge: the `roundOffPaise` double-count

**Status: found during execution, raised to the coordinator, confirmed as a real defect, and fixed before merge in `3cba47a`. Not deferred.**

### The defect

The plan's action step 6 specified `roundOffPaise = Σ(rounded − exact)` and step 8 specified `grandTotal = taxable + roundedHeads + roundOff`. Implemented literally, those substitute to:

```
grandTotal = taxable + exact + 2 × (rounded − exact)
```

— the rounding delta applied twice. Worked example from the three-rate test invoice:

| Line | Taxable | Exact CGST | Exact SGST |
|------|---------|-----------|-----------|
| 5% | ₹56.00 | ₹1.40 | ₹1.40 |
| 18% | ₹15.56 | ₹1.40 | ₹1.40 |
| 40% | ₹7.00 | ₹1.40 | ₹1.40 |
| **Invoice** | **₹78.56** | exact ₹4.20 → printed **₹4.00** | exact ₹4.20 → printed **₹4.00** |

The document prints ₹78.56 + ₹4.00 + ₹4.00. The old formula stated a grand total of **₹86.16**; adding up the printed figures gives **₹86.56**. A vet or an owner totalling the invoice by hand could not reproduce the stated amount, which is not acceptable on a tax document regardless of how small the discrepancy is.

### The fix

`grandTotalPaise = taxableValuePaise + cgstPaise + sgstPaise + igstPaise`, using the already-rounded heads — exactly the figures printed on the document.

`roundOffPaise` is still computed, returned and persisted, but its role is now stated explicitly everywhere it appears: it is a **GSTR-1 disclosure field** that lets a filed return be reconciled against the exact pre-rounding heads. It is never a term in the total.

Two tests were added rather than merely adjusting the old assertion:

- `excludes roundOffPaise from the grand total so the printed lines add up` — asserts `grandTotalPaise === 8_656` **and** `!== 8_616`, pinning the specific wrong value so a regression cannot pass silently.
- `keeps the exact pre-rounding tax recoverable from roundOffPaise for GSTR-1` — asserts `roundedTax − roundOff === exactTax` across three invoice shapes, proving the disclosure figure is sufficient to reconstruct what the rounding removed. Without this, dropping the term from the total could have been "fixed" by dropping the field entirely, losing the reconciliation capability.

The `closes the arithmetic exactly across three distinct invoice shapes` test now asserts the printed-figures identity (`taxable + heads === grandTotal`) instead of the old one.

### Docstrings corrected

The same double-counting formula was written into the shared types by plan 06-04 and would have propagated into 06-06/06-07's finalize logic. All four sites were corrected in the same commit:

- `packages/types/src/constants/gst.ts` — the `PAISE_PER_RUPEE` docstring ("The persisted round-off delta keeps `taxable + taxes + roundOff = grandTotal` exact")
- `packages/types/src/billing.ts` — `Invoice.roundOffPaise`, `CreditNote.roundOffPaise` / `totalPaise`, and `TaxBreakdown`

`CreditNote` was included because it carries the identical head/round-off/total field set and would otherwise have been the next place the defect reappeared.

### What did not change

None of the eleven plan behaviours, none of the five threat mitigations, and no per-head figure. The Section 170 per-head rounding, the GSTR-1 reconciliation property protected by T-06-29, and the exempt/unregistered/Rule 46A behaviours are all untouched — this was purely how the rounded heads were summed into the customer-facing total.

## GST Behaviour Deliberately Not Covered

- **Reverse charge mechanism (RCM).** Out of scope for Phase 6 — no line type in the billing schema carries an RCM flag, and a vet clinic's outward supplies to pet owners are never RCM.
- **Compensation cess.** The 40% GST 2.0 slab replaced the 28%+cess structure for the goods it covers; no pet-clinic SKU attracts cess, and there is no cess column on `invoice_line_items`.
- **Place-of-supply *derivation*.** `isInterState` is an input, not derived here. Deriving it from the clinic GSTIN state code versus the recipient's state is the caller's job (`stateCodeFromGstin` already lives in `@breeyo/types`), and keeping it out preserves this module's purity.
- **B2C ₹50,000 address threshold (Finding G5).** `B2C_ADDRESS_REQUIRED_ABOVE_PAISE` is a document-rendering and validation concern, not a tax computation; it belongs to the finalize/PDF plans.
- **Historical recomputation.** By design there is no code path that re-derives a finalized invoice from the current slab table — `invoice_line_items.gst_rate_percent` is the record, per the `gst.ts` header. This module is only ever called on a draft.
- **Rate-slab currency.** The test asserting that 12% and 28% are rejected pins the GST 2.0 slabs as of 22 Sept 2025. It will correctly fail if a future Council notification is applied to `GST_RATE_SLABS` without revisiting this plan's assumptions.

## Issues Encountered

- **Worktree isolation vs. build state.** Resolved as deviation 4 above. Worth noting for future parallel executors in this repo: `@breeyo/types` and `@breeyo/validators` resolve through `dist/`, so any API code with a *runtime* (non-`type`) import from a workspace package requires those packages to be built first. `dosage.service.ts` and the other prior pure modules use `import type` only, which is why this had not surfaced before.

## User Setup Required

None — no external service configuration required. Both modules are pure functions with no credentials, no network calls and no environment variables.

## Next Phase Readiness

Ready for 06-06 (invoice finalize):

- `allocateInvoiceDiscount(lines, discount)` then `computeInvoiceTax(discountedLines, { gstEnabled, isInterState })` is the exact call sequence the finalize transaction should use; calling them in the other order overstates tax.
- `InvoiceTaxResult` is `TaxBreakdown & { lines: PerLineTax[] }`, so the invoice header fields and the per-line `cgst/sgst/igst/taxableValue` columns are both populated from one call.
- `toPaise` is the only place an `InventoryItem.sellingPrice` or `StockMovement.unitPrice` should be converted; the line-item builder must call it exactly once per line and never re-multiply.
- `allocateProRata` is ready for D-42 per-leg refund allocation with no changes.
- **`roundOffPaise` is a disclosure field, not a total component.** Persist it to `invoices.round_off_paise` and show it on the PDF as its own line, but do not add it into `grand_total_paise`, and do not add it into `balance_paise` or any payment amount derived from the total. The corrected docstrings in `@breeyo/types` now say so at every field.
- No blockers.

## Self-Check: PASSED

All four created files verified present on disk (`money.ts`, `gst.service.ts`, `money.test.ts`, `gst.service.test.ts`), both modified shared-type files verified present, and all five commit hashes (`f9e2ede`, `971758f`, `9f24db7`, `4a843b1`, `3cba47a`) verified present in `git log`. No claimed artifact is missing.

---
*Phase: 06-invoicing-payments*
*Plan: 05*
*Completed: 2026-08-13 (round-off correction 2026-08-14, pre-merge)*
