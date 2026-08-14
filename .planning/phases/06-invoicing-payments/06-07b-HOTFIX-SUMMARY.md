---
phase: 06-invoicing-payments
plan: 07b-HOTFIX
type: hotfix
subsystem: billing / discounts
tags: [billing, discounts, money, gst, arithmetic, d-07, regression]
requires:
  - 06-07 (invoice draft assembly, discount persistence)
  - 06-05 (GST engine, invoice-level discount allocation)
provides:
  - "A `percent` discount of 10 takes 10% off, at both invoice and line level"
  - "The whole 0-100 range the Zod guard admits is now actually expressible"
affects:
  - createDraft / updateDraft / previewTotals / finalize (all read the same resolver)
  - "Any DRAFT already stored with a percent discount: it now computes correctly on finalize, with no backfill"
  - 06-16's invoice builder UI, whose percentages now produce the discount they preview
tech-stack:
  added: []
  patterns:
    - "One resolver for both discount levels, so line-level and invoice-level cannot drift apart"
    - "The unit a money field carries is documented at the field, and the doc is only true if the code agrees"
key-files:
  created:
    - .planning/phases/06-invoicing-payments/06-07b-HOTFIX-SUMMARY.md
  modified:
    - apps/api/src/modules/billing/invoice.service.ts
    - apps/api/src/modules/billing/__tests__/invoice.service.test.ts
    - packages/validators/src/billing.ts
    - apps/api/prisma/schema.prisma
decisions:
  - "Fixed the arithmetic (divide by 100), not the persistence (multiply on the way in): the validator's 0-100 bound is enforced against the stored units, so scaling on write would make its own guard meaningless and cap real discounts at 1%"
  - "No wire-contract or Zod-shape change: every client already sent the right thing"
  - "Corrected the stale `percent * 100` comments in the validator and Prisma schema; they documented a conversion no code performed and are what the buggy divisor was written against"
  - "Existing tests needed no correction: no test had ever exercised a percent discount, which is exactly why this shipped"
metrics:
  tasks: 2
  tests-added: 9
  billing-suite: 268 passed / 0 failed
  validators-suite: 142 passed / 0 failed
  mobile-billing-suite: 168 passed / 0 failed
  completed: 2026-08-14
---

# Phase 6 Hotfix 06-07b: Percentage Discounts Were Off By 100x Summary

A `percent` discount divided by 10,000 instead of 100, so every percentage discount
in the product was one-hundredth of the discount the user asked for. Found during
06-16 while wiring the invoice builder's discount input; the defect is in 06-07's
merged draft-assembly code.

## The bug

`InvoiceService.resolveInvoiceDiscount` computed a percentage discount as:

```ts
return Math.min(Math.round((basePaise * value) / 10_000), basePaise);
```

The `/10_000` is only correct if `value` arrives pre-scaled as percent x 100 (a
basis-points-like encoding). Nothing anywhere ever scaled it. `createDraft` and
`updateDraft` both persist the client's number verbatim:

```ts
invoiceDiscountValue: parsed.invoiceDiscountValue ?? null,
```

and the client sends a plain whole percentage. So a schema-legal `10`, meaning
"10% off", was applied as 0.1% off.

The comments were the trap. `packages/validators/src/billing.ts` asserted that the
columns "store a percentage multiplied by 100" and that "the service multiplies on
the way in", and `schema.prisma` repeated `percent*100`. Both described a conversion
that does not exist in the codebase. The divisor was written to match the comment
rather than the code.

### Both discount levels were affected

D-07 supports line-item and invoice-level percentage discounts. They are not two
implementations — `resolveLineDiscount` is a one-line delegation to
`resolveInvoiceDiscount` — so both were broken by the single divisor, and both were
fixed by correcting it once. Flat discounts were genuinely unaffected: that branch
returns `Math.min(value, basePaise)` and does no scaling.

### Why "plain percentage" is the correct reading

Not a judgement call. `discountGuard` rejects a `percent` value above 100, and
`packages/validators/src/__tests__/billing.test.ts` asserts that exactly 100 is
accepted as a full write-off (D-40). Under the percent-x-100 reading, 100 — the
largest value the schema will admit — would mean a **1% discount**, and a half-off
invoice would be unrepresentable. A contract whose maximum expressible discount is
1% is not one anyone wrote on purpose. The mobile store (06-16) documents the field
as "percentage of 0-100" and passes it through untouched.

## Worked numeric example

A ₹1,000 consultation line (100,000 paise), taxable at 18% GST, intra-state, with a
10% invoice-level discount:

| Step | Before (`/10_000`) | After (`/100`) |
|------|--------------------|----------------|
| Taxable base before discount | 100,000 paise (₹1,000.00) | 100,000 paise (₹1,000.00) |
| `resolveInvoiceDiscount(100000, 'percent', 10)` | `100000 * 10 / 10_000` = **100 paise (₹1.00)** | `100000 * 10 / 100` = **10,000 paise (₹100.00)** |
| Effective discount rate | 0.1% | 10% |
| Taxable value after discount | 99,900 paise | 90,000 paise |
| CGST + SGST @ 18% | ~17,982 paise | 16,200 paise |
| Customer-visible outcome | pays ₹99 more than quoted | pays what was quoted |

The 100x error is a straight factor: the discount was always `value/100` percent
instead of `value` percent.

## The fix

One divisor, in the resolver shared by both paths:

```ts
// percent of the base, rounded to whole paise (D-31) and never exceeding it
return Math.min(Math.round((basePaise * value) / 100), basePaise);
```

`Math.round` (integer paise, D-31) and the `Math.min` clamp against the base are
unchanged. The stale `percent * 100` comments in the validator and the Prisma schema
were corrected to state the real contract, so the next reader is not led back into
the same mistake.

**No wire-contract change.** The Zod schemas are untouched in shape: same fields,
same types, same 0-100 bound. Clients already sent plain percentages correctly; only
the server's interpretation moved. The `schema.prisma` edit is comment-only — the
diff touches nothing but two `//` trailing comments, so no migration is generated
(confirmed with `prisma validate`).

**No backfill needed.** Because the stored values were always plain percentages, any
DRAFT already carrying `invoiceDiscountType: 'percent'` simply begins computing
correctly. `invoiceDiscountFor` recomputes from `invoiceDiscountValue` whenever the
persisted `invoiceDiscountPaise` is absent or zero, so drafts pick the fix up at
finalize. Already-FINALIZED invoices keep their frozen snapshot, which is correct —
a finalized invoice is immutable (D-21), and retroactively changing an issued
document's total is not a thing that may happen.

## Tests

Wrote the RED test first; 6 of the 9 new assertions failed against the old divisor,
and the 3 that passed (flat discounts, the base clamp, verbatim persistence) are
regression guards that had to stay green through the change.

New `describe('InvoiceService — percentage discounts are whole percents (D-07)')`
covers:

- 10% invoice-level on ₹1,000 gives 10,000 paise (the headline case)
- 10% line-level gives 10,000 paise off and a 90,000-paise line total
- the value is stored verbatim, pinning the fix to the arithmetic rather than the write path
- 100 means a whole-invoice write-off (D-40)
- fractional results round to whole paise (15% of 3,333 = 500)
- flat discounts are untouched, and a flat over-discount still clamps to the base
- `updateDraft` and `finalize` (the persisted-read path) apply the same rule

No existing test expectation was wrong and none was changed. No test in the suite had
ever exercised a `percent` discount — the one discount test in `finalize` used `flat`,
which is why a 100x money error reached a merged wave.

## Verification

| Suite | Result |
|-------|--------|
| `invoice.service.test.ts` | 31 passed (was 25 + 6 failing at RED) |
| `apps/api` billing module (12 files) | 268 passed / 0 failed |
| `@breeyo/validators` | 142 passed / 0 failed |
| `apps/mobile` billing (7 files) | 168 passed / 0 failed |
| `apps/api` full suite | 635 passed / 365 skipped / 80 todo |
| `pnpm --filter @breeyo/api build` (tsc) | clean |
| `prisma validate` | schema valid, comment-only diff |

The full API run also reports 37 suites failing at setup with
`PrismaClientInitializationError: Environment variable not found: DATABASE_URL`.
These are the integration suites; this worktree has no PostgreSQL. They fail during
collection without executing a test body, so they are environmental and unrelated —
verified by confirming every non-passing suite's error is the DATABASE_URL one.

## Deviations from Plan

This is an unplanned hotfix, not a numbered plan. One deviation worth recording:

**[Rule 3 - Blocking] Prisma client not generated in the fresh worktree.** The first
test run failed with `Cannot find module '.prisma/client/default'`. Ran
`prisma generate` (a codegen step, not a package install). Also fast-forwarded the
worktree from `origin/main` onto `breeyo/phase-06-invoicing-payments` and built
`@breeyo/types` and `@breeyo/validators`, per the task's setup instructions.

Scope held to the discount-resolution path: the resolver, its tests, and the two
comments that documented the wrong units. No other part of `invoice.service.ts` was
touched. `STATE.md` and `ROADMAP.md` deliberately not updated.

## Commits

- `b223275` — test(06-07b): pin percentage discounts as whole percents (RED)
- `32a8e80` — fix(06-07b): divide percentage discounts by 100, not 10_000 (GREEN)

## Self-Check: PASSED
