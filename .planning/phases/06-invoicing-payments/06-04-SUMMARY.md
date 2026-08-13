---
phase: 06-invoicing-payments
plan: "04"
subsystem: billing-contracts
tags: [types, validators, zod, gst, state-machine, shared-contracts]
requires:
  - "06-03 billing Prisma models (the authoritative field list these interfaces mirror)"
  - "Phase 5 hsn-codes.ts / GstRatePicker (the stale slab list this plan corrects)"
provides:
  - "D-20 seven-state invoice transition table, shared by server enforcement and mobile button gating"
  - "GST 2.0 slab list, Rule 46A document types, SAC 998351, GSTIN validator"
  - "11 billing entity interfaces + 8 composed response shapes"
  - "13 Zod schemas covering every billing write endpoint, none accepting a computed total"
  - "billingSettingsResponseSchema: runtime stripping of Razorpay secrets"
affects:
  - "06-05 computeInvoiceTax returns TaxBreakdown and reads GST_RATE_SLABS"
  - "06-07 invoice.service.ts guards every status change with isValidInvoiceTransition"
  - "06-09 refund service layers its authoritative check over makeRefundInputSchema"
  - "06-11 settings endpoint must return ClinicBillingSettings, never the *Enc columns"
  - "06-13 useInvoiceSocket subscribes to SOCKET_EVENTS.INVOICE_UPDATED"
tech-stack:
  added:
    - "vitest ^3.0.0 as a devDependency of @breeyo/types (the package had no test runner)"
  patterns:
    - "State machine in @breeyo/types, not the API module, so UI gating and server enforcement share one table"
    - "Idempotent same-state transitions for payment-derived states (out-of-order webhooks)"
    - "Billing exceptions as an orthogonal flag, not an eighth state"
    - "Constants that a Council notification can change isolated in one file"
    - "Response schemas as runtime Zod objects so secret-stripping survives type erasure"
key-files:
  created:
    - packages/types/src/constants/invoice-status.ts
    - packages/types/src/constants/gst.ts
    - packages/types/src/__tests__/invoice-status.test.ts
    - packages/types/vitest.config.ts
    - packages/validators/src/__tests__/billing.test.ts
  modified:
    - packages/types/src/billing.ts
    - packages/types/src/constants/billing.constants.ts
    - packages/types/src/constants/socket-events.ts
    - packages/types/src/constants/hsn-codes.ts
    - packages/types/src/constants/index.ts
    - packages/types/package.json
    - packages/validators/src/billing.ts
    - packages/validators/src/inventory.ts
    - packages/validators/src/__tests__/inventory.validators.test.ts
    - apps/api/src/modules/inventory/__tests__/inventory-item.service.test.ts
    - apps/mobile/src/features/inventory/components/GstRatePicker.tsx
decisions:
  - "Phase 5's rival GST_RATE_SLABS ([0,5,12,18,28]) deleted rather than renamed; gst.ts is the single source"
  - "Legacy SAC codes in service-catalog-seed.ts left unchanged and recorded as VETERINARY_SAC_LEGACY; no data migration"
  - "voidInvoiceSchema.restoreStock typed z.literal(true) because D-34 removes the D-26 opt-out"
  - "ClinicBillingSettings exposes razorpayWebhookToken (an admin capability) but never a secret"
  - "Percent discounts are whole percent 0-100 on the wire; the service multiplies to the persisted basis"
metrics:
  duration: ~40 min
  completed: 2026-08-14
  tasks: 3
  commits: 5
---

# Phase 6 Plan 04: Shared Billing Contracts Summary

The D-20 invoice state machine, the post-GST-2.0 constant set, every billing entity type and thirteen Zod write schemas — none of which will accept a total computed on a phone.

## What Was Built

| Artifact | Contents |
|----------|----------|
| `packages/types/src/constants/invoice-status.ts` | `INVOICE_STATUS`, `INVOICE_TRANSITIONS`, `isValidInvoiceTransition`, `BILLING_EXCEPTION_FLAGS`, `isInvoiceActionBlocked`, and the payment/refund/source/line-type literal unions |
| `packages/types/src/constants/gst.ts` | `GST_RATE_SLABS`, `GstRateSlab`, `TAX_TREATMENTS`, `INVOICE_DOCUMENT_TYPES`, `VETERINARY_SAC`, `VETERINARY_SAC_LEGACY`, `GSTIN_REGEX`, `stateCodeFromGstin`, Rule 46(b) and Finding G5 bounds |
| `packages/types/src/billing.ts` | 11 entity interfaces + 8 composed response shapes (21 `export interface` total) |
| `packages/validators/src/billing.ts` | 13 schemas, 14 `…Input = z.infer` aliases, plus `billingSettingsResponseSchema` |

`SOCKET_EVENTS` gained `INVOICE_UPDATED` / `PAYMENT_RECEIVED`; `billing.constants.ts` gained `CREDIT_NOTE_REASONS`, `INVOICE_LIST_FILTERS` and `INVOICE_LIST_SORTS`.

### The state machine, and what it deliberately forbids

`PAID` and `VOIDED` are terminal. Same-state re-application returns `true` for the four payment-derived states and `false` for `DRAFT` and `FINALIZED`. Three of the post-plan decisions are encoded as *absent* edges rather than new code:

- **D-35** — `VOIDED → PAID` is false, so a late `payment_link.paid` cannot reopen a voided invoice. The payment row is still recorded; the invoice is flagged instead.
- **D-36 / D-37** — `PARTIALLY_PAID → UNPAID` is false, so a timed-out digital leg leaves a collected cash leg intact.
- **D-21** — refunds and credit notes never move an invoice out of `PAID`; they are separate records.

Billing exceptions are modelled as an **orthogonal flag**, not an eighth state, matching the separate `exception_flag` column 06-03 created. `isInvoiceActionBlocked()` is the second gate every caller must check alongside `isValidInvoiceTransition()`.

## Requested Recordings

### Prisma fields deliberately omitted from a shared interface

A mechanical parity check (every non-relation scalar in each of the ten Phase 6 models against its interface) reports **zero missing fields** across `Invoice` (41), `InvoiceLineItem` (24), `Payment` (17), `PaymentReceipt` (10), `Refund` (14), `CreditNote` (16), `CreditNoteLineItem` (15), `InvoiceNumberCounter` (4), `WebhookEvent` (9) and `BillingAuditLog` (9).

**Two columns are deliberately omitted**, both from `ClinicBillingSettings`:

| Column | Reason |
|--------|--------|
| `clinics.razorpay_key_secret_enc` | AES-256-GCM ciphertext. Never surfaced in any form — not decrypted, not as ciphertext. The interface carries `hasRazorpayKeySecret: boolean` instead (D-29, ASVS V8, T-06-16). |
| `clinics.razorpay_webhook_secret_enc` | Same, replaced by `hasRazorpayWebhookSecret: boolean`. |

The omission is **structural**: there is no field on the interface a serializer bug could populate. A grep gate asserts `razorpayKeySecret|razorpayWebhookSecret|KeySecretEnc|WebhookSecretEnc` returns 0 occurrences in `packages/types/src/billing.ts`, and `billingSettingsResponseSchema` re-enforces it at runtime — Zod strips unknown keys, so even a query that accidentally selected a ciphertext column has it removed before serialization.

`razorpayWebhookToken` **is** exposed, deliberately. It is a capability, not a credential: plan 06-11's settings screen cannot render the webhook URL for the admin to paste into the Razorpay dashboard without it. It is documented in the interface as admin-only, never-log. This is flagged below.

### Decision on migrating the legacy SAC codes (06-PATTERNS.md Warning 7)

**Leave the seed unchanged. No data migration.**

`service-catalog-seed.ts` seeds `999311` / `999312` / `999313` / `999399` / `998612`; Finding G1 recommends `998351` for veterinary services. The reasoning:

1. **No invoice is mis-taxed today.** The seed's *rates* are already correct — `gstRateOverride: 0` for clinical services, `18` for grooming. The tax computation reads the rate and the `taxTreatment`, never the SAC string. Correcting the SAC changes what is *printed* on an invoice, not what is *charged*.
2. **The seed is per-clinic and customisable.** `seedServiceCatalog` copies rows into each clinic so prices can be edited independently. Changing the constant only affects clinics onboarded after the change; every already-seeded clinic keeps the old codes unless a migration rewrites their rows.
3. **A migration would overwrite clinic edits.** Those rows are user-editable. A blanket `UPDATE service_catalog SET sac_code = '998351'` cannot distinguish a seeded default from a code an accountant deliberately set.
4. **HSN/SAC reporting is legally optional for the pilot cohort** (Finding G5: ≤ ₹5 crore AATO, all B2C).

The codes are recorded as `VETERINARY_SAC_LEGACY` in `gst.ts` alongside `VETERINARY_SAC = '998351'`, with the reasoning in a doc comment, so whoever takes the decision later has both lists and does not have to re-derive it. **Recommendation for a future plan:** change the seed constant to `998351` for new clinics and offer existing clinics an opt-in "update SAC codes" action in billing settings, rather than a silent migration.

## Verification Evidence

| Gate | Result |
|------|--------|
| `pnpm --filter @breeyo/types test` | 52 passed (plan asked for ≥ 18 assertions across six behaviours) |
| `pnpm --filter @breeyo/validators test` | 142 passed, of which 58 are the new billing file (plan asked for ≥ 14) |
| `pnpm build` (workspace) | 5/5 tasks successful |
| `pnpm --filter @breeyo/types exec tsc --noEmit` | exit 0 |
| `pnpm --filter @breeyo/validators exec tsc --noEmit` | exit 0 |
| `pnpm --filter @breeyo/api exec tsc --noEmit` | exit 0 |
| `pnpm --filter @breeyo/api exec vitest run src/` | 275 passed, 20 files |
| `pnpm --filter @breeyo/ui test` | 177 passed |
| `node -e` against `dist/constants/gst.js` | `GST_RATE_SLABS` deep-equals `[0,5,18,40]` |
| `grep '\b12\b\|\b28\b' gst.ts` | 3 hits, all inside comments (the retirement note and two citations of Notification 12/2017) |
| `grep -c '998351' gst.ts` | 1 |
| `grep -c "INVOICE_UPDATED: 'invoice:updated'"` / `"QUEUE_UPDATED: 'queue:updated'"` | 1 / 1 — the new key added, the existing key untouched |
| `grep -c '^export interface ' billing.ts` | 21 (plan asked for ≥ 16) |
| `grep -c '?:' billing.ts` | 0 — every nullable column is `\| null` |
| `grep -c 'hasRazorpayKeySecret'` / `'patientsSeenToday'` | 1 / 1 |
| `grep -Ec 'subtotalPaise\|grandTotalPaise\|cgstPaise\|sgstPaise\|igstPaise\|taxableValuePaise'` in validators | **0** |
| `grep -c 'GST cannot be enabled without a valid GSTIN'` | 1 |
| `grep -c 'export type .*Input = z.infer'` | 14 (plan asked for ≥ 11) |
| `grep -c 'Paise: z.number().int()'` | 7 (plan asked for ≥ 6) |
| Every literal in `INVOICE_STATUS`, `PAYMENT_METHODS`, `PAYMENT_CHANNELS`, `PAYMENT_STATUSES`, `REFUND_STATUSES`, `REFUND_METHODS`, `INVOICE_SOURCES`, `DISCOUNT_TYPES`, `TAX_TREATMENTS`, `INVOICE_DOCUMENT_TYPES` | present verbatim in `schema.prisma` |

**One verification item does not pass, for reasons predating this plan:** `pnpm --filter @breeyo/mobile exec tsc --noEmit` reports 61 errors. All 61 are in `packages/ui/src/**/*.ts` (Phase 2 components calling `react-native-paper` from `.ts` rather than `.tsx` files) or in nine unrelated mobile feature screens. Filtering the output for `gst|billing|invoice|slab|hsn` matches **0** lines, and neither of the two mobile consumers of the constants this plan changed appears in the error set. Logged as deferred item 6.

## TDD Gate Compliance

Tasks 1 and 3 were `tdd="true"` and both ran RED → GREEN.

- **Task 1 RED** — `d6c9ed3`. Run failed at module load: `Failed to load url ../constants/invoice-status.js`. **GREEN** — `153f9eb`, 52 passed.
- **Task 3 RED** — `8c9feab`. Run showed `58 failed | 84 passed`. **GREEN** — `d069b15`, 142 passed.
- REFACTOR — not warranted in either case.

No test passed unexpectedly during either RED phase.

Task 2 was not marked `tdd` (it declares types, which have no runtime behaviour to test) and is instead gated by the mechanical schema-parity check and the six grep assertions above.

## Deviations from Plan

### 1. [Rule 3 — Blocking] `@breeyo/types` had no test runner

- **Found during:** Task 1, before RED could be run.
- **Issue:** The plan's verify command is `pnpm --filter @breeyo/types test`, but `packages/types/package.json` had no `test` script, no vitest dependency and no vitest config. The package had never had a test.
- **Fix:** Added `vitest ^3.0.0` (already resolved in the workspace), a `test` script and a `vitest.config.ts` copied from `packages/validators`.
- **Commit:** `d6c9ed3`

### 2. [Rule 1 + Rule 3 — Bug, blocking] A rival `GST_RATE_SLABS` holding the retired slabs

- **Found during:** Task 1, at `tsc --noEmit`, as `TS2308: Module './gst.js' has already exported a member named 'GST_RATE_SLABS'`.
- **Issue:** This is 06-PATTERNS.md Warning 6, and it is worse than the warning describes. Phase 5 shipped `export const GST_RATE_SLABS = [0, 5, 12, 18, 28]` in `packages/types/src/constants/hsn-codes.ts` — not merely in `05-08-PLAN.md` prose but in the shipped barrel. `apps/mobile/.../GstRatePicker.tsx` derives its chips from it, so **the shipped app has been offering clinics the two slabs the 56th Council meeting retired.** Two constants of the same name in one barrel is also a hard build failure, so this blocked the plan outright.
- **Fix:** Deleted the stale declaration. `gst.ts` is now the single source, and `hsn-codes.ts` imports `GstRateSlab` from it. Renaming the new constant was rejected: the plan's `must_haves` and four acceptance greps name `GST_RATE_SLABS`, and leaving the stale list live would have left the compliance bug in place.
- **Follow-on corrections, all forced by that one change:**
  - `COMMON_VET_HSN_CODES`: eight entries defaulting to the retired 12% moved to 5% (Finding G2 — medicines, medical devices and diagnostic reagents moved down a slab under GST 2.0). These are autocomplete suggestions (D-62); no persisted `InventoryItem` row is affected. Without this, `ItemFormScreen` would have auto-selected a chip the picker no longer renders.
  - `packages/validators/src/inventory.ts`: `gstRate` ceiling `28 → 40`. It would otherwise have rejected the very rate the picker now offers.
  - Four test assertions encoding the old list updated: two in `inventory.validators.test.ts`, two in `apps/api/.../inventory-item.service.test.ts` (the service parses through `createItemSchema`, so the ceiling change reached it).
- **Commits:** `153f9eb`, `d069b15`

### 3. [Rule 2 — D-34] `voidInvoiceSchema.restoreStock` is `z.literal(true)`

- **Issue:** The plan specifies `restoreStock: z.boolean()` per D-26's "system asks: return dispensed items to stock?". D-34 — added to CONTEXT.md after this plan was written — amends D-26: voiding an invoice "always reverses every stock movement tied to that invoice, however old". 06-03 read it the same way, shipping `void_restored_stock` as a record that the reversal *ran* rather than a record of a user's choice. A plain boolean would have let a client send `false` and had it silently ignored.
- **Fix:** `z.literal(true).default(true)`. The field stays on the wire so intent is explicit in the request and the audit log, but `false` is rejected with a clear error rather than discarded.
- **Commit:** `d069b15`

### 4. [Rule 2 — D-35/D-36/D-39/D-42] Contracts added for the post-plan decisions

The plan was written before D-34…D-48. Four additions keep those decisions representable:

| Addition | Decision |
|----------|----------|
| `BILLING_EXCEPTION_FLAGS`, `isInvoiceActionBlocked`, `BillingExceptionListItem`, `resolveBillingExceptionSchema` | D-35/D-36 — an exception must be flagged, must block further status changes, and must be resolvable with a mandatory note |
| `createPaymentLinkSchema` taking `invoiceIds: string[]` (max 20); `Payment.paymentGroupId` in the entity type | D-39 — one link settling several invoices. Taking a single id would have foreclosed exactly what 06-03 relaxed the unique constraint to permit |
| `REFUND_METHODS` + `method` on `refundInputSchema`, `Refund.paymentId` | D-42 — refunding the cash leg and the digital leg independently |
| `PARTIALLY_PAID → UNPAID` absent from the table, with a dedicated regression test | D-37 — a timed-out digital leg must not discard collected cash |

- **Commit:** `153f9eb`, `113b0e8`, `d069b15`

### 5. [Rule 1 — Bug] `owner.fullName` does not exist

- **Issue:** The plan specifies `owner: { id, fullName, mobile }` on `InvoiceDetail`. The `PetOwner` model's column is `name`, and the shipped `Owner` interface in `patient.ts` uses `name`.
- **Fix:** `InvoiceOwnerSummary` uses `name`. Following the plan literally would have produced a type that never matched a query result.
- **Commit:** `113b0e8`

### 6. [Rule 2] Guards the plan did not specify

Four additions, each preventing a class of silent financial error: a **state-code / GSTIN agreement check** (a disagreeing state code misclassifies every invoice as inter-state or intra-state, i.e. IGST vs CGST+SGST on every line); **notes required when a credit-note reason is `other`** (a record of account with a six-year retention obligation); **both split legs must be positive** (a "split" with a zero leg is a single payment wearing a disguise); and **`discountValue` without `discountType` rejected**, not just the reverse.

## Interface Notes for Downstream Plans

- **Percent discounts change unit at the persistence boundary.** `discountValue` is a whole percentage 0–100 on the wire; `invoices.invoice_discount_value` and `invoice_line_items.discount_value` store percent × 100. Plan 06-07's service must multiply on the way in. This is documented in `packages/validators/src/billing.ts`.
- **`GstRateSlab` is now a narrow union** (`0 | 5 | 18 | 40`) while `GST_RATE_SLABS` stays `readonly number[]` so `.includes(someNumber)` typechecks. Both derive from one tuple.
- **`FINALIZED` is transient.** Plan 06-07's finalize transaction must resolve it to `UNPAID`/`PARTIALLY_PAID`/`PAID` in the same transaction; an invoice observed sitting in `FINALIZED` means the payment reducer did not run.
- **Two gates, not one.** Every status change must pass `isValidInvoiceTransition(from, to)` **and** `!isInvoiceActionBlocked(invoice.exceptionFlag)`.

## Known Stubs

None. Every constant, interface and schema this plan declares is exported, typechecked, built into `dist`, and covered by an assertion. No placeholder values, no empty defaults flowing to UI, no TODOs.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure | `packages/types/src/billing.ts` | `ClinicBillingSettings.razorpayWebhookToken` is a new field on a shared response type carrying a capability value. Razorpay sends no tenant identifier, so this token **is** the tenant routing key for `POST /webhooks/razorpay/:token` — anyone holding it can post forged events at that clinic's endpoint (they would still fail HMAC verification, but it is an unauthenticated DoS and enumeration surface). It is exposed because plan 06-11's settings screen cannot render the webhook URL without it. **Plan 06-11 must:** return it only to an authenticated Admin of that clinic, never include it in an error body or a log line, and consider a rotate action. It is not covered by the T-06-16 grep gate, which matches only credential field names. |
| threat_flag: contract-change | `packages/validators/src/inventory.ts` | The `gstRate` ceiling moved from 28 to 40. Any Phase 5 consumer that assumed 28 was the maximum — a display formatter, a report bucket — now sees a value it has never been given. Only the two test assertions were found; no production code depends on the old bound. |

All six threats in the plan's STRIDE register are mitigated with a corresponding passing assertion:

| Threat | Mitigation evidence |
|--------|---------------------|
| T-06-13 client-computed total | grep returns 0; `strips a client-supplied grand total rather than trusting it` asserts the parsed output has no such key |
| T-06-14 discount over 100 / negative quantity | `rejects a percent discount above 100`, `rejects a quantity of zero`, `rejects a negative quantity` |
| T-06-15 refund above amount paid | `rejects an amount above the supplied maxRefundablePaise` |
| T-06-16 secret in a shared response type | grep returns 0 in `billing.ts`; `never echoes a secret through the response schema` |
| T-06-17 GST without GSTIN | `rejects gstEnabled with no GSTIN at all` asserts the exact message |
| T-06-18 unbalanced split | `rejects a split whose legs do not sum to the total` |

## Self-Check: PASSED

Files verified present:
- `FOUND: packages/types/src/constants/invoice-status.ts`
- `FOUND: packages/types/src/constants/gst.ts`
- `FOUND: packages/types/src/constants/billing.constants.ts`
- `FOUND: packages/types/src/constants/socket-events.ts`
- `FOUND: packages/types/src/constants/index.ts`
- `FOUND: packages/types/src/billing.ts`
- `FOUND: packages/types/src/__tests__/invoice-status.test.ts`
- `FOUND: packages/types/vitest.config.ts`
- `FOUND: packages/validators/src/billing.ts`
- `FOUND: packages/validators/src/index.ts`
- `FOUND: packages/validators/src/__tests__/billing.test.ts`

Commits verified present:
- `FOUND: d6c9ed3` test(06-04): add failing invoice state machine and GST constant tests
- `FOUND: 153f9eb` feat(06-04): add invoice state machine and GST 2.0 constants
- `FOUND: 113b0e8` feat(06-04): add billing entity and composed response types
- `FOUND: 8c9feab` test(06-04): add failing billing validator tests
- `FOUND: d069b15` feat(06-04): add Zod schemas for every billing write endpoint

Note: the plan's `files_modified` lists `packages/types/src/constants/billing.constants.ts` and `packages/types/src/index.ts`. The former was extended as planned; the latter needed no edit — it already carries `export * from './billing.js'` and `export * from './constants/index.js'`, so the new modules are exported through the existing barrel lines.
