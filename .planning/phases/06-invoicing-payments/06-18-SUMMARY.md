---
phase: 06-invoicing-payments
plan: "18"
subsystem: ui
tags: [quick-sale, pos, counter-sale, zustand, react-query, gst, pet-profile, react-native, fastify]

requires:
  - phase: 06-13
    provides: "POST /billing/quick-sale — create-and-finalize in one transaction, INSUFFICIENT_STOCK 409 with per-item shortfalls"
  - phase: 06-12
    provides: "GET /billing/pets/:petId/invoices — the D-25 pet-scoped list, newest first"
  - phase: 06-14
    provides: "InvoiceListCard, formatPaiseINR, invoiceStatusLabel/Colors, NewInvoiceSheet, BILLING_ROUTES"
  - phase: 06-16
    provides: "invoiceBuilderStore and InvoiceTotalsSection — the sibling store and the no-arithmetic totals contract"
  - phase: 05
    provides: "BarcodeScannerScreen and useInventoryItems (currentStock, sellingPrice) for product search"
provides:
  - "D-04 Quick Sale counter-sale screen: scan or search, cart, one tap to a finalized invoice"
  - "Ephemeral cart store that merges duplicate items and holds no money total"
  - "POST /billing/quick-sale/preview — server-computed cart totals before checkout"
  - "D-25 pet-profile Invoices section, added additively to PatientDetailScreen"
affects: [06-19-credit-note-refund, 06-21-invoice-builder-screen, 07-notifications]

tech-stack:
  added: []
  patterns:
    - "Cart-shaped totals preview: a POST that prices an uncommitted cart through the committing path's own code, so preview and charge cannot drift"
    - "Section-state machine in an RN-free lib module, so loading/error/empty precedence is executable under test"
    - "Purely additive cross-feature screen composition, gated by a zero-removed-lines diff assertion"

key-files:
  created:
    - apps/mobile/app/(app)/billing/quick-sale.tsx
    - apps/mobile/src/features/billing/screens/QuickSaleScreen.tsx
    - apps/mobile/src/features/billing/stores/quickSaleCartStore.ts
    - apps/mobile/src/features/billing/components/QuickSaleCart.tsx
    - apps/mobile/src/features/billing/components/QuickSaleTotals.tsx
    - apps/mobile/src/features/billing/components/PetInvoicesTab.tsx
    - apps/mobile/src/features/billing/hooks/useQuickSale.ts
    - apps/mobile/src/features/billing/lib/pet-invoices.ts
    - apps/mobile/src/features/billing/__tests__/quickSaleCartStore.test.ts
    - apps/mobile/src/features/billing/__tests__/PetInvoicesTab.test.tsx
    - apps/api/src/modules/billing/__tests__/quick-sale-preview.service.test.ts
  modified:
    - apps/mobile/src/features/patient/screens/PatientDetailScreen.tsx
    - apps/mobile/src/features/billing/hooks/useInvoices.ts
    - apps/mobile/src/features/billing/screens/BillingDashboardScreen.tsx
    - apps/api/src/modules/billing/quick-sale.service.ts
    - apps/api/src/modules/billing/quick-sale.controller.ts
    - apps/api/src/modules/billing/quick-sale.routes.ts

key-decisions:
  - "Added POST /billing/quick-sale/preview rather than computing cart totals on the device: the existing preview-totals endpoint takes only an invoiceId, and a Quick Sale has no invoice until checkout"
  - "Quick Sale route placed at /(app)/billing/quick-sale, a (tabs) sibling, correcting the path 06-14 recorded — the recorded child path required converting (tabs)/billing.tsx into a directory, which no plan owns"
  - "QuickSaleTotals renders per-head CGST/SGST/IGST rows via the shared gstRowsFor rather than the UI-SPEC's single 'GST @ [N]%' line, which predates the supersession of D-08/D-17"
  - "decrementQuantity at quantity one removes the cart row, deliberately unlike invoiceBuilderStore, because stepping the last unit off is how a mis-scan is undone mid-sale"
  - "Cart shortfalls live in the store and are cleared by any quantity mutation, so correcting a short row re-enables checkout without a second rejected round trip"

patterns-established:
  - "Preview-by-cart: an uncommitted collection is priced by the same service method chain that will commit it, making agreement structural rather than tested-in"
  - "Copy gates satisfied by a single COPY object per screen file, with doc comments deliberately not quoting the gated literals"

requirements-completed: [BIL-01, BIL-02, BIL-07]

duration: 95min
completed: 2026-08-14
---

# Phase 6 Plan 18: Quick Sale & Pet Invoices Summary

**A counter sale now completes from an empty cart to a finalized, server-priced invoice in one tap, and a pet profile lists that pet's invoices without a single line removed from the Phase 3 screen it hangs off.**

## Performance

- **Duration:** ~95 min
- **Tasks:** 2 of 2
- **Files created:** 11
- **Files modified:** 6
- **Commits:** 7 (3 RED, 4 GREEN)

## Accomplishments

### Task 1 — Quick Sale counter-sale screen (D-04)

The cart store (`quickSaleCartStore.ts`) merges a repeat of the same product into one row of quantity two — the deliberate inverse of `invoiceBuilderStore.addLine`, which keeps duplicate service lines apart. Both behaviours are correct for their surface: two identical tins are one line, two consultations are two billable events. The store holds no total, subtotal or tax head, asserted by a key enumeration.

`QuickSaleScreen.tsx` composes the scan button, product search, cart, totals and checkout. On a 409 it maps `details.shortfalls` onto cart rows by `inventoryItemId` and renders the UI-SPEC's `[Item Name]: only [N] available` beneath each affected row, disabling checkout until a quantity changes. Any quantity mutation clears that row's shortfall locally, so a correction does not cost a second rejected request while a customer waits.

D-45 is applied to the product search: an out-of-stock item stays in the results, greyed, disabled and labelled `Out of stock` — matching the treatment 06-16 gave the service catalog sheet.

### Task 2 — Pet profile Invoices section (D-25)

`PetInvoicesTab.tsx` renders four states off `petInvoicesSectionState`, whose precedence puts permission first, then loading, then error, and only then empty. That ordering is the point: "no invoices for this pet" shown before the query resolves is a false statement about a pet's billing history, displayed on the exact screen staff consult to establish it and indistinguishable from the true version.

The section reuses `InvoiceListCard`, which already substitutes `Draft` for an unnumbered invoice rather than rendering the literal string `null`.

## Recorded Findings (requested by the plan's output spec)

| Question | Answer |
|----------|--------|
| **Was Phase 5's barcode scanner available?** | **Yes — the reuse path was taken, not the degraded one.** `BarcodeScannerScreen` ships at `apps/mobile/src/features/inventory/screens/BarcodeScannerScreen.tsx` behind the route `(app)/(tabs)/inventory/scan`. The `Scan Barcode` button pushes that route with `?mode=single`. No second scanner was built and no disabled-with-caption fallback was needed. |
| **Patient-profile test count, before and after** | **0 before, 0 after.** There is no test suite under `apps/mobile/src/features/patient` — `vitest run src/features/patient` reports "No test files found" and exits 1, both before and after this plan. The count therefore could not be reduced. The additive guarantee is instead enforced two ways: a zero-removed-lines diff assertion (below) and source-level assertions in `PetInvoicesTab.test.tsx` naming each pre-existing section (`PetProfileCard`, `PreventiveCareCard`, `WeightTrendChart`, `MedicalTimeline`, `Visit History`, `EditPetForm`) and style key. |
| **Did `NewInvoiceSheet`'s Quick Sale route path match?** | **No — it needed correcting.** See Deviation 2. |

## Deviations from Plan

### 1. [Rule 3 — Blocking] The cart totals preview needed a server endpoint that did not exist

- **Found during:** Task 1
- **Issue:** The plan directs `useQuickSalePreview(items)` to post the cart "to the existing `preview-totals` endpoint". That endpoint does not accept a cart. `previewTotalsBodySchema` is `{ invoiceId: uuid }` and `InvoiceService.previewTotals` computes from an invoice's **persisted** line items. A Quick Sale has no invoice until checkout — creation and finalize are deliberately one request (06-13) — so there was no id to send and no persisted rows to compute from.
- **Why not computed on the device:** That is precisely what T-06-122 forbids, and it is not a stylistic rule. The grand total is the taxable value plus three heads rounded to whole rupees **once at invoice level** under Section 170 / Rule 51, with the residue disclosed separately as `roundOffPaise`. A client re-derivation would be a second implementation of a statutory rounding rule. The added test pins the exact case: a ₹1,250.00 taxable line at 18% gives ₹112.50 per head, which the engine rounds to ₹113.00 — a device summing 9% per head would show ₹2,475.00 while the invoice said ₹2,476.00, at the counter, out loud.
- **Why not saving a throwaway draft:** That would reintroduce the numbered-but-unpaid-for phantom invoice that 06-13's single-transaction design exists to avoid.
- **Fix:** Added `POST /billing/quick-sale/preview`. It resolves and prices the cart through the **same** `resolveLines`, and taxes it through the **same** `allocateInvoiceDiscount` / `computeInvoiceTax` calls with the same `isInterState: false`, as `createAndFinalize`. Agreement between the previewed figure and the charged figure is therefore structural, not coincidental. It opens no transaction, writes no row and allocates no invoice number.
- **Scope containment:** Confined entirely to the three `quick-sale.*` files owned by the completed plan 06-13. **No shared file was touched** — no change to `packages/validators`, `packages/types`, or `billing.routes.ts`. It reuses the existing `quickSaleSchema` unchanged as its request body, so a preview cannot accept a cart the checkout would reject.
- **Deliberately omitted:** the preview does **not** check stock. Availability is settled under a row lock inside the checkout transaction; a preview's answer would be stale by the time the tap arrived. The client learns about a shortfall from the 409, per row.
- **Files:** `apps/api/src/modules/billing/quick-sale.{service,controller,routes}.ts`, `apps/api/src/modules/billing/__tests__/quick-sale-preview.service.test.ts`
- **Commits:** `e295584` (RED), `7596972` (GREEN)

### 2. [Plan-authorised] The Quick Sale route path needed correcting

- **Found during:** Task 1. The plan anticipated this: *"If the paths differ, correct the sheet here and note it."*
- **Issue:** `06-14-SUMMARY.md` and `BILLING_ROUTES.quickSale` recorded `/(app)/(tabs)/billing/quick-sale`. That path requires `app/(app)/(tabs)/billing.tsx` — still a file — to become a directory. That restructure of the Billing tab screen is owned by no plan in this phase, and this plan's own `files_modified` declares the route at `app/(app)/billing/quick-sale.tsx`.
- **Fix:** Created the route at the declared path and corrected `BILLING_ROUTES.quickSale` to `/(app)/billing/quick-sale`. This is also the more correct shape: Quick Sale is a full-screen counter flow that pushes over the tab bar, exactly like the `settings` route beside it. `NewInvoiceSheet` itself needed no change — 06-14 deliberately took both destinations as callbacks, so only the constant moved.
- **Left alone:** `BILLING_ROUTES.consultationPicker` and the `(tabs)/billing/:id` detail path remain as recorded. They belong to other plans, and speculatively rewriting them would create conflicts.
- **Files:** `apps/mobile/src/features/billing/screens/BillingDashboardScreen.tsx` (one constant, plus its explanatory comment)
- **Commit:** `5f8c36f`

### 3. [Rule 2 — Consistency] Per-head GST rows instead of the UI-SPEC's single `GST @ [N]%`

- **Found during:** Task 1
- **Issue:** The UI-SPEC's Quick Sale copy table specifies one `GST @ [N]%: Rs [N]` row. That line predates the supersession of D-08 and D-17, which put the full per-line CGST/SGST/IGST breakdown in scope for Phase 6 (BIL-07). 06-16's `InvoiceTotalsSection` already renders per head via the shared `gstRowsFor`.
- **Fix:** `QuickSaleTotals` reuses `gstRowsFor`, which already carries the three rules that matter — no row at all for an unregistered clinic (D-17, Section 122), IGST or the CGST/SGST pair but never both, and a zero head omitted. Two billing screens in one app presenting tax differently would itself be a defect.
- **No gate conflict:** no acceptance criterion greps for `GST @` in this file.

### 4. [Recorded, not fixed] `tsc --noEmit` does not exit 0 in `apps/mobile`

- **Found during:** both tasks
- **Issue:** Two acceptance criteria require `pnpm --filter @breeyo/mobile exec tsc --noEmit` to exit 0. It exits 1 with **61 pre-existing errors**, spread across `packages/ui` atoms/molecules/organisms (a missing `children` prop on the Typography wrapper), `expo-image-manipulator` and `expo-speech-recognition` (absent modules), `app/setup-wizard/_layout.tsx` (ESM extension rules), `AuthProvider.tsx`, and several Phase 3/4 screens.
- **Action taken:** none — this is out of scope per the executor's scope boundary, and fixing 61 errors across four packages inside a billing plan is exactly the kind of change that breaks other features.
- **What was verified instead:** **zero** typecheck errors in any of the 11 files this plan created. The two errors reported in `PatientDetailScreen.tsx` are the pre-existing `WeightTrendChart` `Visit`/`Record<string, unknown>` mismatch; their line numbers moved from 169–170 to 172–173 purely because this plan inserted three lines above them.
- **Logged to:** `.planning/phases/06-invoicing-payments/deferred-items.md`

### 5. [Environment precedent] Component tests assert logic and source text, not rendered output

- **Found during:** Task 2
- **Issue:** `apps/mobile` cannot render a React Native component under test — vitest runs in `node` with no Metro transform and `react-test-renderer` is absent. Pre-existing Phase 5 limitation, recorded in `06-14-SUMMARY.md`.
- **Fix:** Followed the 06-14/06-15/06-16/06-23 precedent. Every decision the section makes lives in the RN-free `lib/pet-invoices.ts` and is executed directly (12 tests); the composition facts that can only be stated about the component — the interpolated empty state, the `InvoiceListCard` reuse, the skeletons, the `VIEW_INVOICES` gate, and the additive profile change — are asserted against source text with `readFileSync`, the same mechanism `BillingSettingsScreen.test.tsx` uses (8 tests).

## Threat Model Coverage

| Threat ID | Disposition | How it was discharged |
|-----------|-------------|----------------------|
| T-06-122 | mitigate | `QuickSaleTotals` performs no arithmetic (`grep -cE '\+ *[a-zA-Z]+Paise\|reduce\('` = 0); the cart store holds no total (`grep -cE '(grandTotal\|subtotal\|cgst\|sgst\|igst)'` = 0, plus a key-enumeration test); figures come from the new server preview |
| T-06-141 | mitigate | `git diff PatientDetailScreen.tsx \| grep -c '^-[^-]'` = **0**. The change is one import (with comment) and one `<View style={styles.section}>` block. Source-level tests name every pre-existing section and style key |
| T-06-142 | mitigate | Section gated on `VIEW_INVOICES`; `petInvoicesSectionState` returns `hidden` both when the permission is absent **and** while the check is still resolving, so the list never flashes before being withdrawn |
| T-06-123 | accept | Client renders the server's per-row shortfall and disables checkout until the quantity changes; the row-locked transaction remains the control |
| T-06-124 | mitigate | `reset()` on unmount and again after a successful checkout; no persistence middleware anywhere in the store (D-48 confirms an in-progress cart lost to a crash is an accepted loss) |

**D-34 verification (carry-forward from 06-13):** `toQuickSaleItems` emits `{ inventoryItemId, quantity }` and nothing else. A test asserts the key set exactly and parses the result with the real `quickSaleSchema`. No `stockMovementId` is ever sent, so finalize performs its own FIFO deduction and a later void correctly restores counter-sale stock. The checkout calls the `quickSaleSchema`-shaped endpoint 06-13 built — `findUninvoicedDispensedMovements` is not referenced anywhere in this plan's code.

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @breeyo/mobile test` | **28 files, 459 tests passed** (was 26 files / 420 before this plan) |
| `quickSaleCartStore.test.ts` | 19 tests passed (criterion: ≥ 6) |
| `PetInvoicesTab.test.tsx` | 20 tests passed (criterion: ≥ 8) |
| API billing suite | **13 files, 277 tests passed** |
| `quick-sale-preview.service.test.ts` | 9 tests passed |
| `apps/api` `tsc --noEmit` | exit 0 |
| `apps/mobile` `tsc --noEmit` | exit 1 — 61 pre-existing errors, **0 in this plan's files** (Deviation 4) |
| `grep -cE '(grandTotal\|subtotal\|cgst\|sgst\|igst)' quickSaleCartStore.ts` | 0 |
| `grep -cE '\+ *[a-zA-Z]+Paise\|reduce\(' QuickSaleTotals.tsx` | 0 |
| `Scan or search to add items` / `Generate Invoice` / `Add items to continue` / `Invoice created` in screen | 1 each |
| `only .* available` in `QuickSaleCart.tsx` | 2 (≥ 1) |
| `height: 56` in `QuickSaleCart.tsx` | 1 (≥ 1) |
| `reset()` in `QuickSaleScreen.tsx` | 2 (≥ 1) |
| `wc -l QuickSaleScreen.tsx` | 382 (≥ 130) |
| `No invoices for` in `PetInvoicesTab.tsx` | 1, interpolating `${petName}` |
| `InvoiceListCard` / `SkeletonLoader` / `VIEW_INVOICES` in `PetInvoicesTab.tsx` | 3 / 2 / 2 |
| `PetInvoicesTab` in `PatientDetailScreen.tsx` | 2 (≥ 2) |
| `git diff PatientDetailScreen.tsx \| grep -c '^-[^-]'` | **0** |

## Known Stubs

None. Every component is wired to a live query or mutation. The one forward reference is the invoice detail route `(app)/(tabs)/billing/${id}`, pushed after checkout and from a pet-invoice row — the same path `BillingDashboardScreen` already pushes for its list rows (plan 06-15's route). Matching the existing convention rather than inventing a third path.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-endpoint | `apps/api/src/modules/billing/quick-sale.routes.ts` | `POST /billing/quick-sale/preview` is new network surface not in this plan's threat register. It is gated on `CREATE_INVOICES` behind `authenticate` + `tenantContext` like its sibling, reads only the calling clinic's own inventory (`where: { clinicId }`), writes nothing, and returns no data the caller could not obtain by completing the sale. The read is deliberately not on a weaker read-permission: it exposes the clinic's selling prices, so anyone who may see the figure may also commit it. |

## Notes for Future Phases

- **`(tabs)/billing.tsx` still needs converting to a directory** before 06-15's invoice detail route and the `from-consultation` picker can exist. This plan sidestepped it by placing Quick Sale as a `(tabs)` sibling; the two remaining forward references still assume the directory.
- **`useViewInvoicesPermission`** in `useInvoices.ts` duplicates the query shape of `useBillingSettingsPermission` but shares its `['auth','permissions',clinicId]` cache key, so no extra request is made. If a third billing surface needs a permission gate, promote both into one `usePermissions(permission)` hook.
- **`QuickSalePreview`** (exported from `quick-sale.service.ts`) is the natural place to add a per-line breakdown if the counter screen ever needs to show tax per row.

## Self-Check: PASSED
