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
  - "65 unit tests with no database dependency covering BIL-07, D-07, D-31 and threats T-06-19 / T-06-27 / T-06-28 / T-06-29 / T-06-30"
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
  modified: []

key-decisions:
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

requirements-completed: [BIL-07]

# Metrics
duration: 42min
completed: 2026-08-13
---

# Phase 06 Plan 05: GST Engine & Money Boundary Summary

**Pure, I/O-free integer-paise money arithmetic plus a per-line exempt-aware Indian GST engine — CGST/SGST or IGST by place of supply, one rounding per tax head at invoice level, CGST Rule 46A document typing, and a remainder-exact pro-rata discount allocator — 65 tests, no database.**

## Performance

- **Duration:** ~42 min
- **Started:** 2026-08-13T20:27:00Z
- **Completed:** 2026-08-13T21:09:17Z
- **Tasks:** 2 (both TDD, 4 gate commits)
- **Files created:** 4

## Accomplishments

- `toPaise` converts Phase 5's `Decimal(10,2)` rupee columns to integer paise by parsing the decimal string, so `0.07 → 7` exactly and the float multiply that produces `7.000000000000001` never happens (T-06-19).
- An exempt veterinary line computes zero CGST, SGST and IGST *even when the catalog carries a non-zero rate* — the single most consequential compliance behaviour in the phase (T-06-27, Notification 12/2017-CT(R) Entry 46).
- An unregistered clinic (`gstEnabled: false`) returns zero tax and `documentType: 'invoice'` before any rate is read, so stale catalog data cannot cause a Section 122 offence (T-06-28).
- Each tax head is rounded once at invoice level; a three-rate test proves the invoice head (400 paise) differs from the sum of per-line rounded values (300 paise), which is the only way to demonstrate that per-line rounding did not occur (T-06-29).
- `allocateInvoiceDiscount` pushes the invoice-level discount down onto every line — exempt lines included — before tax is computed, and `Σ line.taxableValuePaise === invoice.taxableValuePaise` holds exactly (T-06-30, D-07, Section 15(3)(a)).
- `allocateProRata` is exact for negative totals too, so D-42's per-leg split-payment refund allocation can reuse it unchanged.

## Task Commits

Each task followed the RED → GREEN TDD gate sequence. Both RED commits were run and confirmed failing before the corresponding implementation was written.

1. **Task 1: Integer-paise money arithmetic and the Decimal-rupee boundary adapter (D-31)**
   - RED: `f9e2ede` — `test(06-05): add failing money arithmetic tests`
   - GREEN: `971758f` — `feat(06-05): implement integer-paise money module`
2. **Task 2: Per-line, exempt-aware GST computation with invoice-level rounding and Rule 46A document typing (BIL-07)**
   - RED: `9f24db7` — `test(06-05): add failing GST computation tests`
   - GREEN: `4a843b1` — `feat(06-05): implement per-line exempt-aware GST engine`

No REFACTOR commit was needed for either task — both implementations were written directly against the passing shape with no cleanup pass required.

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
- `apps/api/src/modules/billing/__tests__/gst.service.test.ts` — 34 tests.

## Verification

| Check | Result |
|-------|--------|
| `vitest run src/modules/billing` | 3 files, **76 tests passed** (65 new + 11 pre-existing service-catalog-seed) |
| `tsc --noEmit` (@breeyo/api) | exit 0 |
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

## Flagged for Review Before 06-06 Persists It

**`roundOffPaise` sign convention.** The plan's action step 6 specifies `roundOffPaise = Σ(rounded − exact)` and step 8 specifies `grandTotal = taxable + roundedHeads + roundOff`. Both were implemented literally and the identity asserted in the plan's acceptance criteria holds exactly, across three invoice shapes.

Substituting step 6 into step 8 gives `grandTotal = taxable + exact + 2 × (rounded − exact)`, i.e. the rounding delta is applied twice. Worked example from the three-rate test: taxable ₹78.56, exact CGST ₹4.20 and SGST ₹4.20, rounded heads ₹4.00 and ₹4.00, `roundOff` −₹0.40, grand total ₹86.16 — where taxable plus the printed heads is ₹86.56.

This is **not a compliance defect**: the reported per-head figures (₹4.00 / ₹4.00) are the Section 170-rounded amounts and reconcile with GSTR-1 exactly, which is what T-06-29 protects. It is at worst a sub-₹1.50-per-head under-collection the clinic absorbs, and the printed invoice still adds up on the page. The plan's formula was implemented as written rather than silently sign-flipped, because `roundOffPaise` is a persisted financial field whose semantics are stated identically in three already-shipped places (`packages/types/src/constants/gst.ts`, the `Invoice` and `TaxBreakdown` docstrings in `packages/types/src/billing.ts`, and this plan), and 06-06's finalize transaction was planned against it.

If the intended semantic is instead "the round-off line reconciles the printed heads to the collectable total", the single change is `roundOffPaise = Σ(exact − rounded)`, which yields `grandTotal = taxable + exact tax`. If the intended semantic is the more common "round the grand total to a whole rupee", the change is `grandTotal = roundToNearestRupeePaise(taxable + heads)` with `roundOff` as that delta. Either is a two-line change in `gst.service.ts` plus three test expectations; **none of the eleven plan behaviours or the compliance threat mitigations change**. Raising this before 06-06 writes the value to `invoices.round_off_paise`.

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
- **Blocker for 06-06:** the `roundOffPaise` semantic flagged above should be confirmed before the value is persisted.

## Self-Check: PASSED

All four created files verified present on disk (`money.ts`, `gst.service.ts`, `money.test.ts`, `gst.service.test.ts`) and all four commit hashes (`f9e2ede`, `971758f`, `9f24db7`, `4a843b1`) verified present in `git log`. No claimed artifact is missing.

---
*Phase: 06-invoicing-payments*
*Plan: 05*
*Completed: 2026-08-13*
