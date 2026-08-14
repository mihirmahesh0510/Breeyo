---
phase: 06-invoicing-payments
plan: "16"
subsystem: ui
tags: [react-native, zustand, react-query, gst, money, billing, invoice-builder]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-04 shared billing types/validators; 06-05 the tax engine whose TaxBreakdown this renders; 06-06 the invoice service and its endpoints; 06-12 the billing route table; 06-14 formatPaiseINR, useInvoices and useBillingDashboard query keys"
  - phase: 03-patient-registration-walk-in-queue
    provides: "usePatientSearch debounce shape, usePatientProfile mutation-with-explicit-invalidation pattern"
provides:
  - "invoiceBuilderStore — the builder's client-owned line-item draft, structurally incapable of holding a total"
  - "useServiceCatalog / useServiceCatalogSearch — the D-02 catalog behind the Add Service sheet"
  - "useCreateInvoice, useUpdateDraft, useFinalizeInvoice, useVoidInvoice, useDeleteDraft, useCreateCustomService, usePreviewTotals"
  - "Eight builder components: patient header, catalog sheet, line row, two discount inputs, totals section, stock banner, due-date picker"
  - "lib/builder-state.ts — rupee/discount parsing, due-date offsets, the 409 shortfall extractor"
  - "lib/builder-copy.ts — the builder's copy contract and its GST/catalog presentation decisions"
affects: [06-21-invoice-builder-screen, 06-18-quick-sale, 06-19-credit-note-refund]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The client holds line items and never a total; a key-enumeration test makes that falsifiable rather than aspirational"
    - "Rupee-to-paise conversion is confined to one tested function; no component converts"
    - "A 409's structured details are the banner's data source; the error message is never parsed"
    - "GST row visibility is a pure function gated on the clinic's registration flag before any value is read"

key-files:
  created:
    - apps/mobile/src/features/billing/stores/invoiceBuilderStore.ts
    - apps/mobile/src/features/billing/hooks/useServiceCatalog.ts
    - apps/mobile/src/features/billing/hooks/useInvoiceMutations.ts
    - apps/mobile/src/features/billing/lib/builder-state.ts
    - apps/mobile/src/features/billing/lib/builder-copy.ts
    - apps/mobile/src/features/billing/components/PatientInvoiceHeader.tsx
    - apps/mobile/src/features/billing/components/ServiceCatalogSheet.tsx
    - apps/mobile/src/features/billing/components/InvoiceLineItemRow.tsx
    - apps/mobile/src/features/billing/components/LineItemDiscountInput.tsx
    - apps/mobile/src/features/billing/components/InvoiceDiscountRow.tsx
    - apps/mobile/src/features/billing/components/InvoiceTotalsSection.tsx
    - apps/mobile/src/features/billing/components/StockValidationBanner.tsx
    - apps/mobile/src/features/billing/components/InvoiceDueDatePicker.tsx
    - apps/mobile/src/features/billing/__tests__/invoiceBuilderStore.test.ts
    - apps/mobile/src/features/billing/__tests__/builder-state.test.ts
    - apps/mobile/src/features/billing/__tests__/builder-copy.test.ts
  modified:
    - .planning/phases/06-invoicing-payments/deferred-items.md

key-decisions:
  - "usePreviewTotals posts `{ invoiceId }`, not line items — the shipped endpoint computes from PERSISTED lines, which is a stronger guarantee than the plan assumed but means the builder must save a draft before it can preview."
  - "The 400ms preview debounce lives at the call site (plan 06-21), exported as PREVIEW_TOTALS_DEBOUNCE_MS. React Query's mutation API gives a hook no clean place to hold a pending timer."
  - "InvoiceTotalsSection takes the server's `subtotalPaise` and `invoiceDiscountPaise` as an object alongside the TaxBreakdown, because TaxBreakdown carries neither and the spec requires both rows."
  - "Round Off renders BELOW Grand Total, not above it — it is a GSTR-1 disclosure and not a component of the total, and a column position above would invite re-addition."
  - "GST rows are labelled CGST/SGST/IGST rather than the stale spec's single `GST @ [N]%`, which D-08/D-17 superseded and which per-line rates cannot express."
  - "InvoiceDueDatePicker is a day stepper, not a calendar: apps/mobile declares no date-picker dependency and installing one is not a unilateral decision this plan may make."
  - "Discount inputs reject only what the shared schema cannot carry. D-40 sets no approval threshold, so there is no business-rule cap below 100%."

patterns-established:
  - "Copy-as-data extended to the builder: BUILDER_COPY is asserted verbatim by test, and components import rather than inline"
  - "One multiplication, named and bounded: lineGrossPaise is the only money arithmetic in the feature, with a comment stating why it cannot drift"
  - "D-45 expressed once as catalogEntryAvailability, so the Add Product path in 06-21 inherits it without a second implementation"

requirements-completed: [BIL-01, BIL-02, BIL-07]

# Metrics
duration: 40min
completed: 2026-08-14
---

# Phase 06 Plan 16: Invoice Builder Components Summary

**The invoice builder's non-visual layer: a Zustand line-item draft in which no total, tax or subtotal field is representable, seven cache-correct mutations, and eight components that render the server's money without performing a single addition on it.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-14T08:05:00Z
- **Completed:** 2026-08-14T08:45:00Z
- **Tasks:** 2
- **Files created:** 16 (plus one planning doc modified)

## Accomplishments

- `invoiceBuilderStore` holds `lines`, `invoiceDiscountType`, `invoiceDiscountValue`, `dueDate` and `notes` — and a test enumerates its keys to assert that nothing matching `/total|subtotal|cgst|sgst|igst|tax/i` exists, plus a second that asserts no numeric top-level field exists at all.
- The store's lines serialise into the request body by dropping one field, and every emitted line is parsed by the real `invoiceLineItemInputSchema` in test — so a rename on either side breaks a test rather than producing a 400 at the counter.
- `addLine` deliberately does **not** merge a repeat of the same service, which is the documented opposite of the Quick Sale cart's merge (06-13); the reason is written into the code so a later reader does not "fix" the inconsistency.
- Seven mutations, each validating with the shared `@breeyo/validators` schema before sending and each listing every cache key it can affect — including `['inventory']` on finalize and void, which the plan did not ask for but which D-45's grey-out depends on.
- `InvoiceTotalsSection` performs no arithmetic: grep gates for paise addition and array folding both return zero, and every one of its seven figures comes from a server-computed object.
- 61 new tests (18 store, 18 builder-state, 34 copy/presentation, less the 9 that already existed); the mobile suite is 345 passing, up from 275.
- Found and logged a **100x defect in the server's percentage-discount handling** that makes D-07 percent discounts near-noops today. See Issues Encountered.

## Task Commits

1. **Task 1: Builder state store, mutation hooks and catalog search** — `1458910` (test, RED) → `54feed0` (feat, GREEN)
2. **Task 2: Builder components, copy contract and presentation logic** — `03f29c5` (feat; RED/GREEN cycles for `builder-copy.test.ts` and the `builder-state.test.ts` additions ran within the task and are squashed into it, since the components and the logic they render are one unit)
3. **Deferred-item log** — `d1d6403` (docs)

## What plan 06-21 needs

### The store's final state-key list

```ts
lines: InvoiceBuilderLine[]
invoiceDiscountType: DiscountType | null      // 'percent' | 'flat'
invoiceDiscountValue: number | null           // whole percent, or integer paise
dueDate: string | null                        // ISO 8601
notes: string
```

Actions: `addLine(line)`, `updateLineQuantity(localId, qty)`, `setLineDiscount(localId, type, value)`, `removeLine(localId)`, `setInvoiceDiscount(type, value)`, `setDueDate(iso)`, `setNotes(text)`, `hydrate(draft)`, `reset()`.

`hydrate` takes `InvoiceBuilderDraft` — `{ invoiceDiscountType, invoiceDiscountValue, dueDate, notes, lineItems }` — which an `InvoiceDetail` satisfies structurally. `reset()` must be called on unmount (T-06-107); this plan exposes it, 06-21 owns the wiring.

Serialise with `toInvoiceLineItemInputs(lines)` — it drops `localId` and nothing else.

**Note the directory:** `stores/` (plural), because the plan's file list specified it. 06-14's `billingUIStore` lives in `store/` (singular). Both directories now exist under `features/billing/`. Worth unifying, but renaming 06-14's file was outside this plan's scope.

### The eight component prop signatures

| Component | Props |
|---|---|
| `PatientInvoiceHeader` | `{ pet: InvoicePetSummary \| null; owner: InvoiceOwnerSummary \| null; testID? }` — renders `null` when `pet` is null |
| `ServiceCatalogSheet` | `{ visible; onDismiss; services: readonly ServiceCatalogEntry[]; onSelect(service); onAddCustom(name, pricePaise); searchTerm; onSearchTermChange(term); isSearching?; isCreatingCustom?; testID? }` |
| `InvoiceLineItemRow` | `{ line: InvoiceBuilderLine; onQuantityChange(localId, quantity); onRemove(localId); onToggleDiscount?(localId); hasShortfall?; disabled?; testID? }` |
| `LineItemDiscountInput` | `{ type: DiscountType; onTypeChange(type); onChange(type, value \| null); text; onTextChange(text); disabled?; testID? }` |
| `InvoiceDiscountRow` | same as `LineItemDiscountInput` — it owns its own hidden/visible state and renders the `Add Invoice Discount` CTA when collapsed |
| `InvoiceTotalsSection` | `{ breakdown: TaxBreakdown \| undefined; amounts: InvoiceTotalsAmounts \| undefined; gstEnabled: boolean; isLoading?; testID? }` where `InvoiceTotalsAmounts = { subtotalPaise, invoiceDiscountPaise }` |
| `StockValidationBanner` | `{ shortfalls: readonly StockShortfall[]; testID? }` — renders `null` when empty |
| `InvoiceDueDatePicker` | `{ dueDate: string \| null; onChange(iso \| null); defaultDays: number; disabled?; testID? }` |

Both discount components report the value **upward in the unit the shared schema expects** — a whole percentage for `percent`, integer paise for `flat` — and `null` when the field is empty or invalid. The raw text is caller-owned so it survives a blur.

### How `usePreviewTotals` was debounced

**Not inside the hook.** It is a plain mutation taking an `invoiceId` string. `PREVIEW_TOTALS_DEBOUNCE_MS = 400` is exported from `lib/builder-state.ts` and the screen owns the timer. `shouldPreviewTotals(invoiceId, lineCount)` is the gate — it returns false with no saved draft and false for an empty line list.

**06-21 must know:** the preview requires a persisted draft. The sequence is `useCreateInvoice` (or `useUpdateDraft`) → then preview. There is no preview of unsaved lines, by the endpoint's design.

## Decisions Made

### `preview-totals` takes an invoice id, not line items

The plan specifies "`usePreviewTotals` posts the current line items". The shipped endpoint does not accept them: `previewTotalsBodySchema` is `z.object({ invoiceId: z.string().uuid() })` and `InvoiceService.previewTotals` reads the invoice's persisted line items.

This is a better contract than the plan assumed, and the hook follows it. The preview and the finalize read the **same rows**, so the figure on screen cannot disagree with the figure charged — whereas a preview computed from a posted body could differ from the persisted draft the finalize would use. The cost is the ordering constraint recorded above.

### `InvoiceTotalsSection` needs two server objects, not one

`TaxBreakdown` carries `taxableValuePaise`, the three heads, `roundOffPaise`, `grandTotalPaise` and `documentType`. It carries **no subtotal and no discount**, and 06-UI-SPEC requires both rows.

Rather than have the component add anything up, it takes a second server-computed object — `{ subtotalPaise, invoiceDiscountPaise }`, both read back from the draft's create/update response, both persisted by `InvoiceRepository.createDraft`. The three figures reconcile as printed:

```
Subtotal (net of per-line discounts, which show on the lines)
− Discount (invoice-level)
= breakdown.taxableValuePaise
+ GST heads
= breakdown.grandTotalPaise
```

The prop is an object, so the plan's `grep -cE '(subtotal|gstAmount|grandTotal): *number'` gate still returns `0` — it is structurally impossible to hand this component a number a client worked out.

### `Round Off` renders below `Grand Total`

The plan asks for the row "with its sign". It is placed **after** the grand total, with an accessibility hint stating it is a GST rounding disclosure not added to the total.

`roundOffPaise` is `Σ (rounded − exact)` across the three heads, retained for GSTR-1 reconciliation and explicitly excluded from `grandTotalPaise` because the heads are already rounded. Placed in the column above the total — the conventional position for a round-off line on a paper invoice — it would read as a component of it, and the first person to check the arithmetic would conclude the invoice is wrong. Below the line, it reads as what it is.

### GST rows are labelled `CGST` / `SGST` / `IGST`

06-UI-SPEC's copy table still says `GST @ [N]%` and its "GST Display" section still says "No CGST/SGST split — Deferred to v2". Both are stale: D-08/D-17 moved the full per-line breakdown into scope on 2026-08-12, and with per-line rates there is no single `N` to interpolate. The three head labels appear in the same document's typography table.

**06-UI-SPEC.md's "GST Display" section should be updated** — it currently contradicts the decision the phase is built on.

### Two transliterations from the spec

- `Rs` → `₹`, because `formatPaiseINR` emits the rupee sign. Same substitution 06-14 made.
- `--` → `—` in the patient banner (`[Pet Name] ([Species]) -- Owner: [Owner Name]`). The double hyphen is the source markdown's em dash; a literal `--` on screen reads as a typo.

### D-45 lives in one function

`catalogEntryAvailability(entry)` returns `{ selectable, note }`. An out-of-stock entry is `{ false, 'Out of stock' }`, a deactivated one `{ false, 'Unavailable' }`. `ServiceCatalogEntry` extends `ServiceCatalog` with an optional `outOfStock` flag that services never carry — it is there because 06-21 composes the same sheet over inventory items for the `Add Product` path, and D-45's rule should not be written twice.

Hiding the entry was the alternative and it is worse: the front desk knows the clinic stocks the item, cannot find it, and bills it as a custom line at an invented price.

### The due-date picker is a stepper

No date-picker package is declared in `apps/mobile`, and installing one is excluded from auto-fix. A stepper also matches the task: D-23 makes the clinic default the expected answer, and the caption states it. `dueDate: null` is left on the wire so the server applies `defaultDueDays` itself, which keeps a settings change effective for later invoices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `usePreviewTotals` could not post line items**

- **Found during:** Task 1
- **Issue:** The plan's behaviour spec has the hook posting the current line items. `previewTotalsBodySchema` accepts `{ invoiceId }` only; a body of line items would 400 on the missing `invoiceId` and the line items would be stripped.
- **Fix:** The hook posts `{ invoiceId }`, matching the shipped contract. Documented above and in the hook's own doc comment, including the ordering constraint it imposes on 06-21.
- **Files:** `hooks/useInvoiceMutations.ts`
- **Committed in:** `54feed0`

**2. [Rule 2 - Missing Critical] Finalize and void left inventory caches stale**

- **Found during:** Task 1
- **Issue:** Finalize deducts stock and void restores it (D-34), but the plan's invalidation list covers only `['invoices']`, `['billing','dashboard']` and `['billing','services']`. Without invalidating `['inventory']`, an item billed out still reads as in stock — and D-45's grey-out is driven by exactly that figure, so the next invoice would offer a sold-out item as selectable.
- **Fix:** Both mutations also invalidate `['inventory']`.
- **Files:** `hooks/useInvoiceMutations.ts`
- **Committed in:** `54feed0`

**3. [Rule 3 - Blocking] React Native components cannot be rendered under test**

- **Found during:** Task 1, before writing anything
- **Issue:** The same pre-existing constraint 06-14 documented: vitest runs the `node` environment with no Metro transform, `import 'react-native'` fails at parse time, and `react-test-renderer` is not installed.
- **Fix:** Every decision the components make was extracted into two React-Native-free modules — `lib/builder-state.ts` (rupee and discount parsing, due-date offsets, the shortfall extractor, the preview gate) and `lib/builder-copy.ts` (the copy contract, GST row visibility, catalog sorting, D-45 availability) — and tested there. The components are thin renderers over them. Standing up a real RN harness remains the app-wide deferred item 06-14 recorded.
- **Files:** the two `lib/` modules and their two test files (four files beyond the plan's list)
- **Verification:** 52 tests across the two modules.
- **Committed in:** `54feed0`, `03f29c5`

**4. [Rule 3 - Blocking] Grep gates tripped on the comments explaining them**

- **Found during:** Task 1 and Task 2 verification
- **Issue:** Three gates matched prose. `grep -c 'persist\|devtools\|immer'` on the store returned 5 for sentences like "No middleware, no persistence, no devtools"; `grep -c 'preview-totals'` returned 2 because the doc comment named the route; `grep -cE 'reduce\('` on the totals section returned 1 for the comment saying folding is forbidden there.
- **Fix:** Rewrote those comments to describe each prohibition without writing the literal token, and said so — the same approach 06-14 and `dashboard.service.ts` take.
- **Verification:** all three gates now return their required values.
- **Committed in:** `54feed0`, `03f29c5`

**5. [Rule 1 - Bug] The catalog sheet's empty state rendered the search placeholder**

- **Found during:** Task 2 self-review
- **Issue:** An empty catalog list rendered `Search services` as its empty-state body, which says nothing and looks like a failed load.
- **Fix:** `BUILDER_COPY.catalogEmpty` — "No services match. Add a custom service below." — pointing at the `Add Custom Service` action that is always present below the list. 06-UI-SPEC gives the sheet no empty-state copy, so this is new; it follows the dashboard's shape.
- **Committed in:** `03f29c5`

### Unmet acceptance criteria (with reasons)

| Criterion | Actual | Why |
|---|---|---|
| `grep -c 'Add Custom Service' ServiceCatalogSheet.tsx` = 1 | 0 | The string is `BUILDER_COPY.addCustomService` and is imported. It had to live in a React-Native-free module to be assertable at all (deviation 3). Asserted verbatim by `builder-copy.test.ts` instead, which is the stronger check — a grep cannot tell a rendered string from a commented-out one. |
| `grep -c 'days from today (clinic default)' InvoiceDueDatePicker.tsx` = 1 | 0 | Same reason: `BUILDER_COPY.dueDateDefaultNote(days)`, asserted verbatim by test for two values of `days`. |
| `pnpm --filter @breeyo/mobile exec tsc --noEmit` exits 0 | exits 2 | **Pre-existing baseline**, unchanged. 61 errors before this plan and 61 after, all in `packages/ui` and unrelated app files (`react-native-paper` `Text` + `React.createElement` children typing). `grep 'features/billing'` over the output is empty. Identical to the position 06-14 recorded. |

Everything else passed, including the ten Task 2 gates and all nine Task 1 gates.

**Total deviations:** 5 auto-fixed (2× Rule 1, 1× Rule 2, 2× Rule 3)
**Impact on plan:** No scope creep. No `InvoiceBuilderScreen.tsx` was created, as the plan's scope note requires; no Expo Router entry point was touched.

## Issues Encountered

### A 100x defect in the server's percentage discount — logged, not fixed

`InvoiceService.resolveInvoiceDiscount` (`apps/api/src/modules/billing/invoice.service.ts:921-930`) computes `(basePaise * value) / 10_000`, treating `discountValue` as a percentage multiplied by 100. But `createDraft` and `updateDraft` store `parsed.invoiceDiscountValue` and `line.discountValue` **verbatim** — the multiplication the validator's comment promises ("The service multiplies on the way in") happens nowhere.

A client sending the schema-legal `10` for "10% off" gets **0.1%** off. Ten percent of ₹5,000 comes out as ₹5.

The client cannot compensate: `discountGuard` in the shared schema rejects a `percent` value above 100, so `1000` for 10% is unrepresentable. This plan therefore sends a whole percentage, which is correct against the documented contract, and the fix belongs in `apps/api` — out of scope here under the executor's scope boundary. **Logged as deferred item 17.** It blocks D-07 end to end and wants an owner before Phase 6 closes. Flat discounts are unaffected.

### Worktree started from `origin/main`

Far behind the phase branch, as in 06-14. Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (`f1dfad2`), then `pnpm install` and built `@breeyo/types` and `@breeyo/validators` before touching anything.

## Deferred Items

1. **The percentage-discount defect above** — deferred item 17, `apps/api`, blocks D-07.
2. **`store/` vs `stores/`** — two directories under `features/billing/` now hold Zustand stores, because this plan's file list specified the plural and 06-14's specified the singular. A rename is a one-line change but touches 06-14's file.
3. **A real date picker.** `InvoiceDueDatePicker` is a day stepper because no date-picker package is declared. If the pilot wants an arbitrary date, that is a dependency decision, not a code change.
4. **React Native test harness** — unchanged from 06-14's deferred item 1, and the reason two lib modules exist in this plan that the plan text did not list.
5. **06-UI-SPEC.md's "GST Display" section** contradicts D-08/D-17 and should be rewritten to describe the CGST/SGST/IGST rows this plan renders.

## Threat Model Coverage

| Threat | Mitigation as built |
|---|---|
| T-06-102 (a modified client sending `grandTotalPaise: 1`) | No total field exists in the store — asserted by a key-enumeration test and a second test that no numeric top-level field exists at all. `toInvoiceLineItemInputs`' output is parsed by the real `invoiceLineItemInputSchema` in test, and its key set is asserted against an explicit allow-list. `finalizeInvoiceSchema` accepts no money. |
| T-06-103 (a client total diverging from the server's) | `InvoiceTotalsSection` renders a server-computed `TaxBreakdown` and a server-computed amounts object. `grep -cE '\+ *[a-zA-Z]+Paise\|reduce\('` → `0`. `grep -cE 'toFixed\|/ *100'` across all builder components → no output. |
| T-06-104 (a discount above 100% or a negative quantity reaching the server) | `parseDiscountInput` rejects a percentage above 100 with the shared schema's exact wording, and rejects a fractional percentage the schema cannot carry. `updateLineQuantity` rejects zero, negative and fractional quantities. Both are unit-tested. |
| T-06-105 (a 100x error from a rupee entry) | One function, `parseRupeesToPaise`, used by both the discount inputs and the custom-service price. It parses the digit groups as integers rather than multiplying a float — tested against `0.29` and `1.15`, the two classic IEEE-754 traps — and rejects a third decimal place rather than choosing a rounding direction on the clinic's behalf. |
| T-06-106 (finalizing against stale stock) | Accepted, per the plan. This plan's contribution is the structural surface: `stockShortfallsFrom` reads `details.shortfalls` from the 409 and drops any entry missing the numbers, and `StockValidationBanner` renders one row per entry. The blocking behaviour is 06-21's. |
| T-06-107 (a previous patient's lines leaking) | `reset()` clears every field, asserted by test. The unmount wiring is 06-21's. |

## Known Stubs

None. Every component is a working renderer over real props, and every hook targets a shipped endpoint verified against `billing.routes.ts`. The two forward dependencies — the screen that composes these and the `billing/` directory conversion 06-14 flagged — are plan 06-21's scope, explicitly excluded here by the plan's own scope note.

## User Setup Required

None.

## Next Phase Readiness

- All eight components, both hook modules and the store are ready for 06-21 to compose without modification; prop signatures are tabulated above.
- 06-21 must sequence **save draft → preview totals**, since the preview reads persisted rows.
- 06-21 must call `reset()` on unmount (T-06-107) and pass `gstEnabled` from `GET /billing/settings` into `InvoiceTotalsSection`.
- **Phase-level blocker:** the percentage-discount defect makes D-07 percent discounts near-noops. A builder that collects them correctly is not enough.

## Self-Check: PASSED

- All 16 created files verified present on disk.
- All 4 commits verified present in `git log`: `1458910`, `54feed0`, `03f29c5`, `d1d6403`.
- `pnpm --filter @breeyo/mobile test` → 22 files, 345 tests passing (275 before this plan).
- `pnpm --filter @breeyo/mobile test -- src/features/billing` → 6 files, 134 tests passing.
- `pnpm --filter @breeyo/mobile exec tsc --noEmit` → 61 errors, identical to the pre-existing baseline; zero under `features/billing`.
- `grep -rn 'reduce(' components/InvoiceTotalsSection.tsx` → no output.
- All nine Task 1 gates and eight of the ten Task 2 gates pass; the two that do not are tabulated above with reasons.

---
*Phase: 06-invoicing-payments*
*Completed: 2026-08-14*
