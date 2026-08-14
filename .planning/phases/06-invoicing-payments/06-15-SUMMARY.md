---
phase: 06-invoicing-payments
plan: "15"
subsystem: ui
tags: [expo-print, pdf, gst, rule-46, rule-46a, money, billing, react-native]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-04 InvoiceDetail / PaymentReceipt / CreditNote types + GST and credit-note constants; 06-05 the frozen tax snapshot and the corrected grand-total invariant; 06-08 GET /billing/invoices/:id; 06-09 GET /billing/invoices/:id/receipts/:id; 06-11 GET /billing/credit-notes/:id; 06-12 the clinic GST-registration settings that gstEnabledSnapshot is frozen from; 06-14 formatPaiseINR and invoiceStatusLabel"
  - phase: 04-emr-clinical-records
    provides: "the shipped expo-print template pattern (buildXHtml + escapeHtml per file) and the useGeneratePdf hook this plan extends"
provides:
  - "buildInvoiceHtml — CGST Rule 46 invoice with Rule 46A document typing"
  - "buildPaymentReceiptHtml — 80mm thermal receipt (D-13)"
  - "buildCreditNoteHtml — CREDIT NOTE referencing its original invoice (D-19, D-22)"
  - "printPdf / savePdf — the two D-16 actions that had no analog anywhere in the codebase"
  - "generateInvoice/Receipt/CreditNote, printInvoice/Receipt/CreditNote, saveInvoice/Receipt/CreditNote"
  - "BillingShareOptionsSheet — the Print / Share / Download sheet"
affects: [06-16-invoice-detail-screen, 06-17-payment-collection, 06-19-credit-note-refund]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A PDF template renders the frozen record and recomputes nothing — the heading, the tax heads and the totals are read, never derived"
    - "Dates on Indian tax documents are rendered in IST arithmetically, not via toLocaleDateString, because Hermes ships a cut-down ICU"
    - "Document assembly lives at module scope so it is testable in a repo that cannot render a hook"

key-files:
  created:
    - apps/mobile/src/features/pdf/templates/invoice.ts
    - apps/mobile/src/features/pdf/templates/payment-receipt.ts
    - apps/mobile/src/features/pdf/templates/credit-note.ts
    - apps/mobile/src/features/pdf/__tests__/invoice-template.test.ts
    - apps/mobile/src/features/pdf/__tests__/receipt-credit-note-template.test.ts
    - apps/mobile/src/features/pdf/__tests__/billing-pdf-actions.test.ts
  modified:
    - apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts
    - apps/mobile/src/features/pdf/components/ShareOptionsSheet.tsx

key-decisions:
  - "savePdf writes to FileSystem.documentDirectory, not through Sharing.shareAsync's save-to-files intent — routing Download through the share sheet would make it indistinguishable from Share, which is the exact conflation D-16 exists to end."
  - "Dates are formatted arithmetically in IST rather than with toLocaleDateString('en-IN'), reversing the Phase 4 template convention, because 06-14's format.ts documents that Hermes returns a different string on device than Node does under test, and because the date on a GST document is the Indian calendar date of issue."
  - "roundOffPaise is printed BELOW the grand total under its own 'statutory disclosure, not part of the total above' caption, so an owner adding the column by hand cannot double-count it."
  - "The invoice status is rendered through 06-14's invoiceStatusLabel, so FINALIZED prints as AWAITING PAYMENT on the PDF exactly as it reads in the app (D-46)."
  - "GSTIN is rendered from invoice.clinicGstinSnapshot with clinic.gstin as a draft-only fallback: Rule 46 names the supplier's GSTIN as at issue, and re-reading current settings would let a historical invoice change after a registration change."
  - "BillingShareOptionsSheet is a new sibling component rather than new props on ShareOptionsSheet — zero lines removed from the Phase 4 contract."

patterns-established:
  - "One test per Rule 46A heading branch, plus a negative test asserting the template does NOT recompute the heading from the line mix"
  - "A grep gate must never be tripped by the comment explaining it — forbidden identifiers are described, not named"

requirements-completed: [BIL-04]

# Metrics
duration: 40min
completed: 2026-08-14
---

# Phase 06 Plan 15: Invoice, Receipt and Credit Note PDFs Summary

**Three client-side `expo-print` templates that render the frozen invoice record rather than re-deriving it — CGST Rule 46A document typing across all four branches, a Section 122 gate that strips every tax artefact for an unregistered clinic, and the two D-16 actions (Print, Download) that previously existed nowhere in the codebase.**

## Performance

- **Duration:** ~40 min (including a cold `pnpm install` in a fresh worktree)
- **Tasks:** 3, all TDD (RED → GREEN)
- **Files created:** 6 · **modified:** 2
- **Tests:** 275 → 316 (+41). PDF suite 3 → 44.

## Accomplishments

- **Rule 46A typing works across the full matrix.** `INVOICE` / `BILL OF SUPPLY` / `TAX INVOICE` / `INVOICE-CUM-BILL OF SUPPLY`, one test each, plus a sixth test that feeds the template mixed lines with a frozen `tax_invoice` and asserts it prints `TAX INVOICE` anyway — the template is a rendering of the record, not a second opinion about it (T-06-101).
- **Section 122 gate.** An unregistered clinic's invoice contains none of `GSTIN`, `CGST`, `SGST`, `IGST`, `HSN` — asserted as five negative substring checks, not as a comment.
- **The printed numbers reconcile.** The Amount column sums to the grand total; `Taxable Value + CGST + SGST` (or `+ IGST`) equals `Grand Total` exactly; `roundOffPaise` sits below the total as a labelled disclosure line. A test asserts the invariant on the fixture data and the three figures in the rendered HTML.
- **Print, Share and Download are three different code paths**, and the tests prove it negatively: `printPdf` asserts `printToFileAsync`, `shareAsync` and `moveAsync` were *not* called; `savePdf` asserts `shareAsync` and `printAsync` were *not* called.
- **A missing logo cannot block a financial document.** `resolveLogoBase64` returns `undefined` on any failure, and a dedicated test builds a full invoice with the download rejected.
- **Zero lines removed** from `ShareOptionsSheet.tsx` (`git diff | grep -c '^-[^-]'` → `0`), and the four Phase 4 generators are untouched and still passing.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1 — Invoice template, Rule 46 + Rule 46A | `c3bfd23` | `61683a2` |
| 2 — Receipt + credit note templates | `7dd6ef1` | `2dd4229` |
| 3 — Print / Share / Download | `9e5f1de` | `996218b` |

## Files Created/Modified

| File | What it does |
|---|---|
| `.../pdf/templates/invoice.ts` | `buildInvoiceHtml` — A4 portrait, Rule 46A heading from the frozen `documentType`, tax presentation gated wholesale on `gstEnabledSnapshot`, place of supply, B2C address rule, signature block |
| `.../pdf/templates/payment-receipt.ts` | `buildPaymentReceiptHtml` — `@page { size: 80mm auto }` + `body { width: 80mm }`; no tax block at all (a receipt acknowledges money, not a supply) |
| `.../pdf/templates/credit-note.ts` | `buildCreditNoteHtml` + `CreditNoteDocument` type; positive figures, balance effect in words, tax gating read off the *original* invoice |
| `.../pdf/hooks/useGeneratePdf.ts` | **Modified, additive.** 3 fetchers, `resolveLogoBase64`, 3 document builders, `printPdf`, `savePdf`, 9 hook callbacks |
| `.../pdf/components/ShareOptionsSheet.tsx` | **Modified, additive.** New `BillingShareOptionsSheet` with `Print` / `Share` / `Download` |
| `.../pdf/__tests__/invoice-template.test.ts` | 19 tests |
| `.../pdf/__tests__/receipt-credit-note-template.test.ts` | 10 tests |
| `.../pdf/__tests__/billing-pdf-actions.test.ts` | 12 tests |

## Decisions Made

### The `savePdf` location, and what "Download" actually means today

**Chosen API:** `Print.printToFileAsync` → `FileSystem.deleteAsync(dest, { idempotent: true })` → `FileSystem.moveAsync` into `FileSystem.documentDirectory`, returning the URI. Verified against the installed `expo-file-system@18.0.12` `.d.ts`: `documentDirectory`, `moveAsync`, `deleteAsync`, `downloadAsync` and `readAsStringAsync` all exist with these signatures. The `deleteAsync` step is not decoration — `moveAsync` fails when the destination exists, and re-downloading the same invoice is the normal case.

**Per-platform behaviour, stated honestly:**

| Platform | Where the file lands | User-visible? |
|---|---|---|
| iOS | app container `Documents/` | **Not** in the Files app. It would be, with `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in `app.json` — neither is set today. |
| Android | app-internal storage | Not in the system file browser. |

So Download today means *saved durably and retrievable by this app*, not *visible in the OS file browser*. The two rejected alternatives, and why:

- **Route the save through `Sharing.shareAsync` so the user taps "Save to Files".** Rejected: it makes Download open the same sheet as Share, which is precisely the conflation D-16 exists to end. Two buttons that do the same thing is worse than one.
- **Write to shared external storage / the media library.** Rejected outright — these documents carry owner PII and clinic financial data (T-06-97), and shared storage is world-readable to every app on the device. A grep gate forbids those APIs.

**Making the iOS file user-visible is a two-key `app.json` change and is recorded as a deferred item**, not silently assumed.

### `Print.printAsync` was not exercised against a printer

**Explicitly: no.** No real or simulated printer was used, and no device or simulator was involved at any point. `expo-print` is mocked in the test environment (as it already was for the Phase 4 suite). What is verified is that `printAsync` is called exactly once with `{ html }`, and that the print path writes no file and opens no share sheet. Whether the platform dialog then renders correctly on a thermal roll is a device-verification step this repo cannot perform — it belongs in the phase's human-verify checkpoint.

### Dates: IST arithmetic, not `toLocaleDateString`

The plan asked for `toLocaleDateString('en-IN', { day, month, year })`, copying the Phase 4 templates. Not done, for two reasons that only surfaced on reading 06-14's shipped code:

1. `apps/mobile/src/features/billing/lib/format.ts` documents, from Phase 6's own experience, that *"`toLocaleDateString` is avoided: Hermes ships a cut-down ICU and returns a different string on device than it does in this test environment."* A test asserting `13 August 2026` would have passed in CI and been wrong in the vet's hand.
2. The date on a GST document is the **Indian** calendar date of issue. A device-local render prints the previous day for anything finalized after 18:30 UTC when the reader's clock is west of Greenwich.

Both templates therefore shift by +05:30 and use UTC getters. The output string is identical in form to what the plan specified (`13 August 2026`), and it is now deterministic and correct.

### `roundOffPaise` placement

Per the corrected 06-05 invariant, `grandTotalPaise = taxableValue + cgst + sgst + igst` with the heads already rounded; `roundOffPaise` is a Section 170 / Rule 51 disclosure figure and is **not** a component. Putting it in the running totals column — even correctly signed — invites a reader to add it in. It is therefore rendered *below* the Grand Total row, in the small grey disclosure style, captioned `Round Off (statutory disclosure, not part of the total above)`, and only when non-zero. A test asserts it is absent at zero, present with its sign at `-43` paise, and that the grand total is unchanged either way.

### `withGenerationState` instead of nine copies of the envelope

Three documents × three actions = nine callbacks. The plan said to copy the Phase 4 generator shape "exactly" into each. Nine literal copies of `setIsGenerating` / `setError` / try / catch-rethrow / `finally` is nine places for the `finally` to be dropped, leaving a spinner stuck forever on an error path. The envelope is written once as an internal `withGenerationState` helper; the observable contract (`isGenerating` spans the operation, `error` carries the API message, the original error rethrows) is unchanged. The four Phase 4 generators were left byte-identical.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `toLocaleDateString` would have produced a different date on device than under test**

- **Found during:** Task 1, before writing the template.
- **Issue:** See "Dates" above. The plan's date convention is falsified by Phase 6's own shipped `format.ts`, and additionally renders the wrong calendar day for late-evening IST invoices read west of Greenwich.
- **Fix:** `formatLongDateIST` / `formatDateTimeIST` — arithmetic +05:30 shift with UTC getters and a local month table.
- **Files:** `invoice.ts`, `payment-receipt.ts`, `credit-note.ts`
- **Committed in:** `61683a2`, `2dd4229`

**2. [Rule 2 - Missing Critical] A missing B2C recipient address was silently omitted**

- **Found during:** Task 1.
- **Issue:** Finding G5: above ₹50,000 to an unregistered recipient, the recipient's name and address become mandatory on the document. The plan's behaviour spec covers rendering the address when supplied but says nothing about the case that actually matters — above the threshold with no address on file, where the plain reading is to print nothing. A compliance defect nobody can see is a compliance defect nobody fixes.
- **Fix:** Above `B2C_ADDRESS_REQUIRED_ABOVE_PAISE` with no address, the template prints a tertiary-coloured `Recipient address required for supplies above ₹50,000.00 — not on file.` Below the threshold, nothing.
- **Verification:** 1 test, both directions.
- **Committed in:** `61683a2`

**3. [Rule 2 - Missing Critical] An unknown `reason` literal would have printed `undefined` on a credit note**

- **Found during:** Task 2.
- **Issue:** `creditNote.reason` arrives over the wire. A bare `CREDIT_NOTE_REASON_LABELS[reason]` lookup renders the string `undefined` onto a financial document if the API grows a sixth reason before the app ships an update.
- **Fix:** `creditNoteReasonLabel` checks membership in `CREDIT_NOTE_REASONS` — which is also what makes the set provably non-divergent from the validator's, as the plan required — and falls back to the `other` label.
- **Verification:** 1 test asserting no `undefined` in the output for `goodwill_gesture`.
- **Committed in:** `2dd4229`

**4. [Rule 2 - Missing Critical] `moveAsync` fails when the destination file already exists**

- **Found during:** Task 3.
- **Issue:** `savePdf` writes a deterministic filename. Downloading the same invoice twice — the normal case, not the exception — would have thrown on the second attempt.
- **Fix:** `FileSystem.deleteAsync(destinationUri, { idempotent: true })` before the move.
- **Committed in:** `996218b`

**5. [Rule 3 - Blocking] The plan's own storage grep gate tripped on the comment explaining it**

- **Found during:** Task 3 verification.
- **Issue:** `grep -cE 'ExternalDirectory|getExternalStorage|MediaLibrary' useGeneratePdf.ts` must return `0`. It returned `1` — the security note that says *not* to use those APIs.
- **Fix:** Rewrote the note to describe the prohibition without naming the identifiers. Same resolution 06-14 reached for the money gates.
- **Verification:** gate now returns `0`.
- **Committed in:** `996218b`

**6. [Rule 3 - Blocking] The hook cannot be exercised in this test environment**

- **Found during:** Task 3, writing the RED test.
- **Issue:** `apps/mobile/vitest.config.ts` is the `node` environment with no Metro transform and no `react-test-renderer`. Calling `useGeneratePdf()` needs a renderer; importing it also pulls `AuthProvider → expo-secure-store → react-native`, which fails at parse time. Written as the plan describes — everything inside `useCallback` — Task 3 would have had **no test at all**, only greps.
- **Fix:** Fetching, logo inlining, HTML building and filename derivation were extracted to exported module-level functions taking an explicit `token`; the hook's callbacks are thin wrappers supplying `tokenRef.current`. `AuthProvider` is `vi.mock`ed in the test. This is the identical resolution 06-14 and Phase 5 reached. Standing up a real RN harness remains Rule 4 territory and was not attempted.
- **Verification:** 12 tests over the extracted functions.
- **Committed in:** `9e5f1de`, `996218b`

**7. [Rule 2 - Missing Critical] Task 3 had no test file in the plan's file list**

- **Found during:** Task 3.
- **Issue:** The plan lists test files for Tasks 1 and 2 but not for Task 3, whose acceptance criteria are otherwise greps plus "the Phase 4 tests still pass" — neither of which can fail if Print and Download quietly do the same thing as Share.
- **Fix:** Added `__tests__/billing-pdf-actions.test.ts` (12 tests), including the negative assertions that separate the three actions.
- **Committed in:** `9e5f1de`

### Unmet acceptance criteria (with reasons)

| Criterion | Actual | Why |
|---|---|---|
| `pnpm --filter @breeyo/mobile exec tsc --noEmit` exits 0 (all three tasks) | exits 2, **61 errors** | **Pre-existing baseline**, unchanged. 61 before this plan (measured on the fast-forwarded phase branch before any edit) and 61 after; identical to the count 06-14-SUMMARY.md recorded. All in `packages/ui` and unrelated app files, plus one pre-existing `import.meta` error in Wave 11's `pdf-deps.test.ts`. This plan adds zero type errors. |
| `grep -rnE 'toFixed\|/ *100' apps/mobile/src/features/pdf/templates/` produces no output | 2 lines | Both in Phase 4's `clinical-record.ts`, on `weightKg.toFixed(1)` and `temperatureC.toFixed(1)` — **kilograms and degrees, not money**. Out of scope per the scope boundary rule; not touched. All three new templates return `0`. |
| `grep -c 'IGST'` etc. as heading counts | met | — |

---

**Total deviations:** 7 auto-fixed (1× Rule 1, 4× Rule 2, 2× Rule 3). No Rule 4 escalations.
**Impact on plan:** Every one was required for correctness, compliance, or to make Task 3 testable at all. No scope creep — no invoice detail screen, no route wiring, no RN test harness.

## Issues Encountered

- **Worktree started from `origin/main`**, 1 commit behind the phase tip in graph terms but far behind in content. Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (`f1dfad2`) before anything else, then `pnpm install` (no `node_modules` in a fresh worktree) and built `@breeyo/types` + `@breeyo/validators`.
- `vi.mock` factories are hoisted above all other statements, so the native-module spies had to move into `vi.hoisted` — the first RED run failed with `Cannot access 'printAsync' before initialization` rather than the intended "function does not exist".

## Deferred Items

1. **iOS Files-app visibility for Download.** Set `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` in `app.json` if "Download" should mean "appears in the Files app". Two keys; deliberately not added here because it changes app-level configuration outside this plan's file scope and has an App Store review implication.
2. **Device verification of `Print.printAsync`** against a real 80mm thermal printer and an A4 printer. Cannot be done in this repo; belongs in the phase's human-verify checkpoint.
3. **Wiring the three actions to a screen.** `BillingShareOptionsSheet` and the nine hook callbacks exist and are tested, but nothing renders them yet — the Invoice Detail screen is a later plan, and `app/(app)/(tabs)/billing.tsx` still needs the `_layout.tsx` + `index.tsx` conversion 06-14 flagged before any nested billing route can exist.
4. **React Native test harness** (inherited from 06-14). Still absent; still Rule 4.
5. **`clinical-record.ts` `toFixed` on vitals.** Phase 4 code, non-money, left alone. If the phase-level template grep gate is meant to be absolute, that file needs a separate decision.

## Threat Model Coverage

| Threat | Mitigation as built |
|---|---|
| T-06-96 (HTML/script injection via free text) | `escapeHtml` defined in each of the three template files and applied to every interpolated string. 4 tests: clinic name `<script>alert(1)</script>` → `&lt;script&gt;` with no literal `<script>`; `&` in an owner name; markup in a pet name, a line description, credit-note notes and a credited line description. |
| T-06-97 (PII-bearing PDFs in shared storage) | All writes target `cacheDirectory` (share) or `documentDirectory` (save). `grep -cE 'ExternalDirectory\|getExternalStorage\|MediaLibrary' useGeneratePdf.ts` → `0`. |
| T-06-98 (GST line for an unregistered clinic — Section 122) | Entire tax presentation gated on `invoice.gstEnabledSnapshot`; one test asserts the output contains none of `GSTIN`, `CGST`, `SGST`, `IGST`, `HSN`. The credit note gates on the **original invoice's** snapshot, since `CreditNote` carries none — same test. |
| T-06-99 (wrong Rule 46A heading) | Heading rendered from the frozen `documentType` via a `Record<InvoiceDocumentType, string>`; one test per branch plus a test that mixed lines with a frozen `tax_invoice` still print `TAX INVOICE`. |
| T-06-100 (100x money error) | Every money cell via `formatPaiseINR`, which throws on a non-integer. `grep -cE 'toFixed\|/ *100'` → `0` on all three new templates. |
| T-06-101 (PDF silently differs from the record) | No tax, total or document-type computation anywhere in a template. The only derived booleans are visibility gates (`cgst + sgst > 0`), never values. |

## Known Stubs

None. All three templates render live fields from the API's actual response shapes, verified against `invoice.repository.ts`'s `getInvoiceDetail` select, `payment.service.ts`'s `getReceipt` and `credit-note.service.ts`'s `getCreditNote`.

## User Setup Required

None for this plan. See Deferred Item 1 if Download should surface in the iOS Files app.

## Next Phase Readiness

- `buildInvoiceHtml`, `buildPaymentReceiptHtml` and `buildCreditNoteHtml` are importable and fully covered.
- `useGeneratePdf` now returns nine billing callbacks plus the four Phase 4 ones; the Invoice Detail screen can wire `Print` / `Share` / `Download` straight to `printInvoice` / `generateInvoice` / `saveInvoice`.
- `BillingShareOptionsSheet` takes `title`, `isGenerating`, `error` and three callbacks — drop-in for the detail screen's action bar.

## Self-Check: PASSED

- All 6 created files and 2 modified files verified present on disk.
- All 6 task commits verified in `git log` (`c3bfd23`, `61683a2`, `7dd6ef1`, `2dd4229`, `9e5f1de`, `996218b`).
- `pnpm --filter @breeyo/mobile test` → **22 files, 316 tests passing** (baseline 19 / 275; +41).
- `pnpm --filter @breeyo/mobile test -- src/features/pdf` → 4 files, 44 tests, including all 3 pre-existing Phase 4 PDF tests.
- `pnpm --filter @breeyo/mobile exec tsc --noEmit` → 61 errors, identical to the pre-change baseline; zero new.
- `grep -rn 'clinic.logoUrl' apps/mobile/src/features/pdf/templates/` → no output.
- `git diff ShareOptionsSheet.tsx | grep -c '^-[^-]'` → `0`.
- Each of the three new template files contains exactly one `escapeHtml` definition.

---
*Phase: 06-invoicing-payments*
*Completed: 2026-08-14*
