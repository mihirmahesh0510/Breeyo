---
phase: 06-invoicing-payments
plan: "21"
subsystem: ui
tags: [react-native, expo-router, react-query, billing, invoice-builder, gst, money]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-16's invoiceBuilderStore, seven mutation hooks and eight components; 06-14's formatPaiseINR, useInvoices and BILLING_ROUTES; 06-04's shared schemas; 06-06's invoice endpoints"
  - phase: 05-inventory-management
    provides: "useInventoryItems for the Add Product path; dispensed-item provenance via stockMovementId (D-50)"
provides:
  - "InvoiceBuilderScreen — the D-01/D-02/D-07 builder composing 06-16's components with a debounced server preview"
  - "lib/builder-screen.ts — the screen's decision layer: request bodies, 409 classification, the self-clearing stock block, totals dimming"
  - "lib/consultation-picker.ts — the D-06 picker's state derivation and copy"
  - "useInvoiceDetail — the query that lets a D-03 draft be opened at all"
  - "app/(app)/billing/new.tsx and app/(app)/billing/from-consultation.tsx — both builder entry points"
  - "A corrected BILLING_ROUTES table; the previous one pushed into a directory that cannot exist"
affects: [06-15-invoice-detail, 06-18-quick-sale, 06-19-credit-note-refund]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "The screen decides nothing: every branch lives in an RN-free lib module and is unit-tested"
    - "Save-then-preview, because preview-totals reads persisted rows — the displayed figure and the charged figure come from the same rows by construction"
    - "A finalize block pinned to a content signature, so it clears itself on any billable edit and can never strand the user"
    - "Route paths declared once in BILLING_ROUTES rather than inlined at call sites"

key-files:
  created:
    - apps/mobile/src/features/billing/screens/InvoiceBuilderScreen.tsx
    - apps/mobile/src/features/billing/lib/builder-screen.ts
    - apps/mobile/src/features/billing/lib/consultation-picker.ts
    - apps/mobile/src/features/billing/hooks/useInvoiceDetail.ts
    - apps/mobile/src/features/billing/__tests__/InvoiceBuilderScreen.test.tsx
    - apps/mobile/src/features/billing/__tests__/consultation-picker.test.ts
    - apps/mobile/app/(app)/billing/new.tsx
    - apps/mobile/app/(app)/billing/from-consultation.tsx
  modified:
    - apps/mobile/src/features/billing/screens/BillingDashboardScreen.tsx
    - .planning/phases/06-invoicing-payments/deferred-items.md

key-decisions:
  - "The D-06 picker lists DRAFT invoices, not consultations: no consultation-list endpoint exists, and D-03 makes 'a completed consultation without an invoice' an off-happy-path state, so the literal reading would render a permanently empty screen."
  - "BILLING_ROUTES corrected from /(app)/(tabs)/billing/... to /(app)/billing/... — (tabs)/billing.tsx is a file, so the old paths could never resolve and the FAB's primary flow dead-ended on the first tap."
  - "InvoiceDetail does not satisfy InvoiceBuilderDraft as 06-16 expected: dueDate is declared Date but arrives as a JSON string. draftFromInvoiceDetail normalises it and orders lines by sortOrder."
  - "The finalize block is keyed on a content signature rather than on the shortfall being 'resolved', so any billable edit re-enables the button — a server 409 is cheaper than a dead end."
  - "Picker rows carry invoiceId, not consultationId: the draft already exists and already holds the dispensed items, so the builder hydrates rather than asking the server for a second draft."

patterns-established:
  - "A monotonic sequence guard on the debounced preview, so a slow earlier response cannot overwrite the figure someone is about to read out"
  - "Loading checked before empty in every list state derivation, asserted by test"

requirements-completed: [BIL-01, BIL-02, BIL-07]

# Metrics
duration: 55min
completed: 2026-08-14
---

# Phase 06 Plan 21: Invoice Builder Screen Summary

**The builder that assembles an invoice without ever computing one: totals arrive from `preview-totals`, finalize sends no money, and the two 409s the flow can hit are handled as the different failures they are — one recoverable in place, one not recoverable at all.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 2
- **Files created:** 8; modified: 2
- **Tests:** 39 new (32 builder, 7 picker); mobile suite 459 passing, up from 420

## Accomplishments

- `InvoiceBuilderScreen` composes all eight of 06-16's components and performs **no money arithmetic**: `grep -cE '\+ *[a-zA-Z]+Paise|reduce\('` returns `0`, and the file contains no read of a tax field either — every figure is handed to `InvoiceTotalsSection` as a server-computed object.
- The finalize body is built by `buildFinalizeInput`, parsed by the real `finalizeInvoiceSchema`. A test passes it `grandTotalPaise: 1` and asserts the result is `{}` — the tamper defence is a property of the code, not a promise.
- The two 409s are separated, which is the plan's central ask. `INSUFFICIENT_STOCK` keeps the draft editable and blocks finalize until any billable field changes; `INVOICE_NOT_DRAFT` says what happened and routes to the detail view rather than leaving the user tapping a button that can never succeed under D-21.
- The debounced preview carries a monotonic sequence guard, so a slow earlier response cannot overwrite a newer total on the one screen where somebody is about to say a number out loud.
- Found and corrected a **dead route namespace** that made the FAB's New Invoice sheet a no-op — see Deviations.
- Found that **`InvoiceDetail` does not satisfy `InvoiceBuilderDraft`** as 06-16's summary claimed, and fixed the mismatch rather than casting past it.

## Task Commits

1. **Task 1: Builder screen and screen-state tests** — `a46d025` (test, RED) → `2351051` (feat, GREEN)
2. **Task 2: The two entry routes and the D-06 picker** — `89c62fd` (feat)

## What the plan asked to be recorded

### How `usePreviewTotals` was debounced

**At this screen's call site**, as 06-16 specified when it exported `PREVIEW_TOTALS_DEBOUNCE_MS = 400` without wiring a timer. A `setTimeout` in a `useEffect` keyed on `linesSignature(...)` — a stable string over exactly the fields the server prices, built from the same `toInvoiceLineItemInputs` projection the request body uses.

Keying on the signature rather than on the store's `lines` array matters: Zustand hands out a new array on every mutation including ones that change nothing billable, and `localId` — regenerated by `hydrate`, never sent — would otherwise cost a round trip on every rehydrate.

The effect **saves the draft first, then previews**, because `preview-totals` computes from persisted rows (06-16's finding). That ordering is a feature rather than a cost: the preview and the finalize read the same rows, so the figure on screen cannot disagree with the figure charged.

### Where tax field names appear in the screen, and whether each is a display read

**They do not appear at all.** `grep -nE 'grandTotal|cgstPaise|sgstPaise|igstPaise' InvoiceBuilderScreen.tsx` returns exactly one line:

| Line | Occurrence | Nature |
|---|---|---|
| 85 | `` * arithmetic either. `grandTotalPaise` and the three tax heads appear in this `` | Prose, inside the file's doc comment |

There is no code occurrence to classify. The screen never touches a tax field: it passes the server's `TaxBreakdown` object through to `InvoiceTotalsSection` unopened, and that component (06-16) does the rendering without arithmetic. The two figures the screen does read from a server response — `saved.subtotalPaise` and `saved.invoiceDiscountPaise` — are read straight off the save response into the `amounts` prop and are neither tax fields nor combined with anything.

### Whether `NewInvoiceSheet`'s route paths matched

**They did not, and the mismatch was worse than a rename — the paths could not resolve at all.**

First, a correction to the plan's premise: `NewInvoiceSheet.tsx` contains no paths. 06-14 deliberately made both destinations callbacks (`onFromConsultation`, `onQuickSale`) so the component would compile before 06-18's screen existed. The paths live in `BILLING_ROUTES` in `BillingDashboardScreen.tsx`. So the plan's gate — `grep -rn "billing/new\|billing/from-consultation" NewInvoiceSheet.tsx` — returns `0` and always would have; the equivalent grep against `BillingDashboardScreen.tsx` returns both paths.

Second, the substance. 06-14 declared:

```
consultationPicker: '/(app)/(tabs)/billing/from-consultation'
quickSale:          '/(app)/(tabs)/billing/quick-sale'
```

`app/(app)/(tabs)/billing.tsx` is a **file** — the Billing tab itself. There is no `(tabs)/billing/` directory for a child route to live in, so both pushes silently did nothing. The FAB is the primary entry point to the entire billing flow, so this was a dead end on the first tap, and it would have stayed invisible until someone tried it on a device.

Corrected to the `/(app)/billing/...` namespace, which is where `settings` already correctly lived and which matches the `patient/register` precedent for a full-screen form pushing over the tab bar. `newInvoice` and `invoiceDetail(id)` were added to the same table, and the dashboard's one inlined detail path was routed through it so the namespace is declared once.

**Plan 06-18 must create Quick Sale at `app/(app)/billing/quick-sale.tsx`.** The constant already points there. Logged as deferred item 20.

## Decisions Made

### The D-06 picker lists draft invoices, not consultations

The plan says to stop and report a gap if no consultation endpoint exists rather than filter a full list client-side. There is no consultation-list endpoint — `emr.routes.ts` exposes get-by-id, the draft/finalize pair and `/pets/:petId/history`, nothing else. But stopping would have been the wrong call, because the literal population the spec names is empty by design:

D-03 has `EmrService` create a draft invoice the moment a consultation is finalized. "A completed consultation without an invoice" is therefore not a state the happy path produces, and a picker built on that definition would correctly render its empty state forever while the front desk concluded the feature was broken.

The population the spec is pointing at — visits completed and still needing billing — **is** the DRAFT invoice list. `GET /billing/invoices?status=draft` is server-side filtered and paginated (so the plan's scaling objection does not apply), returns the pet name, owner name and date the row format needs, and the row's target is a draft that already holds the dispensed items.

The one case this misses is a consultation whose D-03 hook failed — it catches and logs rather than failing the consultation, so no draft exists. Those visits are unbillable from either path today. Logged as **deferred item 18** with the server-side fix; it is not something the client can paper over.

### The finalize block clears on any billable edit, not on the shortfall being resolved

`isFinalizeBlocked` compares the current content signature against the one that was rejected. Any change — a quantity, a removal, a discount — re-enables the button.

The alternative is to decide client-side whether an edit actually fixes the shortfall, which requires the client to model stock it cannot see. Getting that wrong in the safe direction leaves the front desk with a permanently disabled Finalize button and no way out but backing out of the invoice and losing it. The server is the authority on stock; a second 409 is cheap and honest, and a dead end is not.

### `draftFromInvoiceDetail` exists because the hydrate contract did not typecheck

06-16's summary states that `InvoiceDetail` satisfies `InvoiceBuilderDraft` structurally. It does not: `InvoiceDetail.dueDate` is declared `Date | null`, `InvoiceBuilderDraft.dueDate` is `string | null`, and `tsc` rejects the call.

The interesting part is that the *declared* type is also not what arrives. The value crosses a JSON boundary and nothing revives it, so the runtime value is an ISO string while the type says `Date`. Casting past the error would have typechecked and then produced `"[object Object]"` on the wire the day the field really did become a `Date`.

`draftFromInvoiceDetail` accepts either, normalises to the string the store and `updateDraftInvoiceSchema` both want, turns an unparseable date into `null` rather than `"Invalid Date"` (which the server's `z.string().datetime()` would 400 on the next save), and sorts lines by `sortOrder` so rows cannot reshuffle under the user between a refetch and a render.

### D-45 is inherited on the Add Product path rather than reimplemented

The plan asks for "a product search sheet". `ServiceCatalogSheet` is composed a second time over inventory items, with `outOfStock: item.currentStock <= 0` set on each entry — which is precisely why 06-16 put `outOfStock` on `ServiceCatalogEntry` and expressed D-45 once in `catalogEntryAvailability`. Out-of-stock items render disabled with a reason on both paths, from one rule. Verified as carried through, per the orchestrator's D-45 note.

### The screen holds no logic

Every branch is in `lib/builder-screen.ts`. `apps/mobile` cannot render a React Native component under test (vitest `node` environment, no Metro transform, no `react-test-renderer`) — the pre-existing constraint 06-14, 06-15, 06-16 and 06-23 each recorded. Logic left in the `.tsx` would be logic nothing can check, so the `.tsx` is layout and the module is behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `BILLING_ROUTES` pointed into a directory that cannot exist**

- **Found during:** Task 2
- **Issue:** `consultationPicker` and `quickSale` were declared under `/(app)/(tabs)/billing/...`, but `(tabs)/billing.tsx` is a file, so those routes could never resolve and the FAB's New Invoice sheet did nothing on either option.
- **Fix:** Corrected the table to `/(app)/billing/...`, added `newInvoice` and `invoiceDetail(id)`, and routed the dashboard's inlined detail push through the constant.
- **Files:** `screens/BillingDashboardScreen.tsx`
- **Commit:** `2351051`

**2. [Rule 3 - Blocking] No way to open an existing draft**

- **Found during:** Task 1
- **Issue:** The builder's primary path is opening a D-03 draft, and no invoice-detail query hook existed — only a `InvoiceDetailResponse` type exported from `useInvoiceMutations`. A draft could be listed but never opened.
- **Fix:** Added `hooks/useInvoiceDetail.ts`, keyed to extend `INVOICES_QUERY_KEY` with the id so the existing save invalidations already refetch it. `staleTime: 0`, unlike the list's 30s — a cached copy of the draft about to be finalized is the one place in the app where staleness is a real hazard, because D-21 makes the outcome irreversible.
- **Commit:** `2351051`

**3. [Rule 1 - Bug] `InvoiceDetail` does not satisfy `InvoiceBuilderDraft`**

- **Found during:** Task 1, at `tsc`
- **Issue:** `dueDate` is `Date | null` on one and `string | null` on the other; and the value that actually arrives is a string regardless of the declaration.
- **Fix:** `draftFromInvoiceDetail`, with three tests covering the string case, the `Date` case and the null case, plus `sortOrder` ordering.
- **Commit:** `2351051`

**4. [Rule 2 - Missing Critical] A stale preview could overwrite a newer one**

- **Found during:** Task 1
- **Issue:** The debounced effect fires a save-then-preview chain. Two chains can overlap, and without ordering the slower earlier one lands last — leaving a figure on screen that does not correspond to the lines shown, on the surface where cash is collected.
- **Fix:** A monotonic `previewSeqRef`; a response whose sequence is no longer current is discarded.
- **Commit:** `2351051`

**5. [Rule 1 - Bug] Test fixtures used a retired GST slab**

- **Found during:** Task 1, GREEN
- **Issue:** Fixtures used `gstRatePercent: 12`. GST 2.0 retired the 12% and 28% slabs on 22 September 2025 and `gstRateSlabSchema` rejects them (`[0, 5, 18, 40]`). My fixture was wrong, not the schema — which is the schema doing exactly its job.
- **Fix:** Fixtures moved to 5%.
- **Commit:** `2351051`

### Unmet acceptance criteria (with reasons)

| Criterion | Actual | Why |
|---|---|---|
| `grep -c 'Finalize Invoice'` etc. on the screen ≥ 1 (7 strings) | 0 | Every string is `BUILDER_SCREEN_COPY.*` or `BUILDER_COPY.*` and imported. Copy has to live in an RN-free module to be assertable at all — the same trade 06-16 recorded for `Add Custom Service`. Asserted verbatim by test instead, which is strictly stronger: a grep cannot distinguish a rendered string from a commented-out one. All seven appear in `lib/builder-screen.ts` or `lib/builder-copy.ts` and are covered by the copy tests. |
| `grep -c 'INSUFFICIENT_STOCK'` and `'INVOICE_NOT_DRAFT'` on the screen ≥ 1 | 0 | Both codes are matched in `classifyFinalizeError`, where they are unit-tested against real `ApiClientError` instances. The screen switches on the returned `kind`. Both literals are present in the required test file (`INSUFFICIENT_STOCK` × 3), which is what the artifact contract specifies. |
| `grep -cE 'grandTotal\|cgstPaise\|...'` — each occurrence a display read | 1 occurrence, in prose | Stronger than the criterion anticipated: the screen has no code occurrence at all. Tabulated above. |
| Test file uses React Native Testing Library | Tests the decision layer | RNTL cannot run here (no Metro transform, no `react-test-renderer`) — the app-wide constraint from 06-14's deferred item 1. A rendering test could not have reached the finalize request body, which is the assertion the file exists for. |
| `pnpm --filter @breeyo/mobile exec tsc --noEmit` exits 0 | exits 2 | **Pre-existing baseline, unchanged: 61 errors before this plan and 61 after**, all in `packages/ui` and unrelated `consultation`/`patient` files. Zero under `features/billing` or `app/(app)/billing` — that grep is empty. Identical to the position 06-14 and 06-16 recorded. |

Everything else passed: ≥11 behaviours (32 tests), the tamper assertion, the shortfall banner and disabled finalize, the re-enable on quantity change, the empty store on remount, `reset()` ≥ 1, 600 lines ≥ 160, the money-arithmetic gate at `0`, both route files present, `InvoiceBuilderScreen` in `new.tsx` ×2, `Skeleton` in the picker ×2, and `new.tsx` at 35 lines ≤ 40.

**Total deviations:** 5 auto-fixed (3× Rule 1, 1× Rule 2, 1× Rule 3)

## Issues Encountered

### The percentage-discount defect is still open and still blocks D-07

06-16's deferred item 17. `InvoiceService.resolveInvoiceDiscount` divides by 10,000 while `createDraft` stores the client's value verbatim, so a schema-legal `10` for "10% off" yields 0.1%. This plan's builder collects and sends a whole percentage, which is correct against the documented contract — the defect is entirely server-side and unchanged by anything here. Per the orchestrator's note, no client-side compensation was attempted. **It still wants an owner before Phase 6 closes.**

### Worktree started from `origin/main`

Far behind the phase branch, as in 06-14 and 06-16. Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (`4fba002`), then `pnpm install` and built `@breeyo/types` and `@breeyo/validators` before touching anything.

## Deferred Items

Logged as items 18–20 in `deferred-items.md`:

18. **A consultation whose D-03 hook failed cannot be billed from either path.** Needs a server-side reconciliation query; bounded by a failure rate that is currently unmeasured because the catch logs but increments no counter.
19. **`/(app)/billing/:invoiceId` does not exist yet** (plan 06-15). Three call sites now navigate to it and are inert until it does. Must be created at `app/(app)/billing/[invoiceId].tsx`.
20. **The corrected route namespace** — plan 06-18 must place Quick Sale at `app/(app)/billing/quick-sale.tsx`.

Carried forward from 06-16 and still open: the percentage-discount defect (17), `store/` vs `stores/`, a real date picker, and the React Native test harness.

## Threat Model Coverage

| Threat | Mitigation as built |
|---|---|
| T-06-102 (a modified client sending `grandTotalPaise: 1`) | No total exists in the store (06-16), none in any body this screen builds, and `buildFinalizeInput` parses through `finalizeInvoiceSchema` — a test feeds it `grandTotalPaise` and `cgstPaise` and asserts the result is `{}`. A second test enumerates the draft body's keys, and the line items', against `/total\|cgst\|sgst\|igst\|taxable/i`. |
| T-06-106 (finalizing against stale stock) | Accepted, as the plan specifies — the server's row-locked transaction is the control. The client renders `details.shortfalls` structurally (never the message text), highlights the offending rows by description, and blocks finalize until any billable edit. |
| T-06-107 (a previous patient's lines leaking) | `reset()` in the unmount cleanup, written as an explicit call so what runs is legible. A test asserts every field is empty after reset and that the body built from that store is `[]`. |
| T-06-108 (silently losing edits when the invoice was finalized elsewhere) | `INVOICE_NOT_DRAFT` produces an explicit message and a `router.replace` to the detail view. Never a retry, never a silent discard — D-21 means no retry could succeed. |
| T-06-139 (a stale total left on screen after a failed refresh) | `totalsToRender` keeps the last successful figures dimmed rather than blanking, and returns `undefined` before the first successful preview so the section shows its loading state instead of a client-computed `₹0.00`. Reinforced by the sequence guard, which is the deviation-4 fix. |

## Known Stubs

None. Every component is wired to real data, every hook targets an endpoint verified against `billing.routes.ts`, and both routes resolve to real files.

Two **forward references**, both declared rather than stubbed: `BILLING_ROUTES.invoiceDetail` and `BILLING_ROUTES.quickSale` point at files plans 06-15 and 06-18 own (deferred items 19 and 20). The builder is fully functional up to the moment of navigation in both cases.

## User Setup Required

None.

## Next Phase Readiness

- The builder is complete and reachable from the FAB's New Invoice sheet, which works for the first time.
- **06-15 must create `app/(app)/billing/[invoiceId].tsx`** — the builder replaces itself with that route on finalize success and on the D-21 collision.
- **06-18 must create `app/(app)/billing/quick-sale.tsx`**, not under `(tabs)`.
- **Phase-level blocker unchanged:** the server's percentage-discount defect makes D-07 percent discounts near-noops. A builder that collects them correctly is still not enough.

## Self-Check: PASSED

- All 8 created files verified present on disk; both modified files verified changed.
- All 3 commits verified in `git log`: `a46d025`, `2351051`, `89c62fd`.
- `pnpm --filter @breeyo/mobile test` → 28 files, **459 tests passing** (420 before this plan).
- `pnpm --filter @breeyo/mobile test -- src/features/billing` → 9 files, 207 tests passing.
- `pnpm --filter @breeyo/mobile exec tsc --noEmit` → 61 errors, identical to the pre-existing baseline; **zero** under `features/billing` or `app/(app)/billing`.
- `grep -cE '\+ *[a-zA-Z]+Paise|reduce\(' InvoiceBuilderScreen.tsx` → `0`.
- `wc -l InvoiceBuilderScreen.tsx` → 600 (≥160); `new.tsx` → 35 (≤40).

---
*Phase: 06-invoicing-payments*
*Completed: 2026-08-14*
