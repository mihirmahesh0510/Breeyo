---
phase: 06
slug: invoicing-payments
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1 (`apps/api/vitest.config.ts`, `apps/mobile` + `packages/ui` each have their own) |
| **Config file** | `apps/api/vitest.config.ts` — `environment: 'node'`, `fileParallelism: false` (shared DB), 30s timeouts, `setupFiles: ['./tests/helpers/setup.ts']` |
| **Quick run command** | `pnpm --filter @breeyo/api test -- src/modules/billing` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30-60s quick, several minutes full suite |

Test locations: Integration in `apps/api/tests/<module>/*.test.ts`; unit in `apps/api/src/modules/<module>/__tests__/*.test.ts`.
Helpers: `apps/api/tests/helpers/app.ts` (`buildApp({ logger: false })` + supertest), `factories.ts` (Faker), `setup.ts` (env).

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @breeyo/api test -- src/modules/billing` (unit only, fast)
- **After every plan wave:** `pnpm --filter @breeyo/api test` (includes DB integration; note `fileParallelism: false`)
- **Before `/gsd-verify-work`:** `pnpm test` must be green across all workspaces
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| BIL-01 | Draft invoice assembles dispensed products + catalog services | integration | `pnpm --filter @breeyo/api test -- tests/billing/invoice-create.test.ts` | ❌ W0 | ⬜ pending |
| BIL-01 | End Consultation creates exactly one draft (idempotent on retry) | integration | `… tests/billing/invoice-create.test.ts -t "idempotent"` | ❌ W0 | ⬜ pending |
| BIL-02 | Finalize rejects when stock insufficient, returns per-item shortfall | integration | `… tests/billing/finalize-stock.test.ts` | ❌ W0 | ⬜ pending |
| BIL-02 | Concurrent finalizes cannot oversell (two txns, one batch) | integration | `… tests/billing/finalize-stock.test.ts -t "concurrent"` | ❌ W0 | ⬜ pending |
| BIL-03 | State machine allows valid transitions, throws on invalid | unit | `… src/modules/billing/__tests__/invoice-state.test.ts` | ❌ W0 | ⬜ pending |
| BIL-03 | Finalized invoice rejects edit (D-21) | integration | `… tests/billing/invoice-lock.test.ts` | ❌ W0 | ⬜ pending |
| BIL-04 | Invoice HTML template renders all Rule 46 fields | unit (mobile) | `pnpm --filter @breeyo/mobile test -- src/features/pdf/__tests__/invoice-template.test.ts` | ❌ W0 | ⬜ pending |
| BIL-05 | Payment link created with correct paise amount, `expire_by ≥ 15min`, `reference_id` ≤ 40 chars | unit (mocked SDK) | `… src/modules/billing/__tests__/payment.service.test.ts` | ❌ W0 | ⬜ pending |
| BIL-06 | Valid signature → 200 + invoice marked paid | integration | `… tests/billing/webhook.test.ts` | ❌ W0 | ⬜ pending |
| BIL-06 | Invalid signature → 400, invoice unchanged | integration | `… tests/billing/webhook.test.ts -t "invalid signature"` | ❌ W0 | ⬜ pending |
| BIL-06 | Duplicate `x-razorpay-event-id` processed exactly once | integration | `… tests/billing/webhook.test.ts -t "idempotent"` | ❌ W0 | ⬜ pending |
| BIL-06 | Webhook responds in < 5s under a 50-event burst | integration | `… tests/billing/webhook.test.ts -t "latency"` | ❌ W0 | ⬜ pending |
| BIL-07 | Exempt service line produces zero tax; taxable product line produces CGST+SGST | unit | `… src/modules/billing/__tests__/gst.service.test.ts` | ❌ W0 | ⬜ pending |
| BIL-07 | Inter-state invoice produces IGST only | unit | `… gst.service.test.ts -t "inter-state"` | ❌ W0 | ⬜ pending |
| BIL-07 | Each tax head rounds to whole rupees; `subtotal + taxes + roundOff = grandTotal` | unit | `… gst.service.test.ts -t "rounding"` | ❌ W0 | ⬜ pending |
| BIL-07 | Mixed exempt+taxable → `documentType === 'invoice_cum_bill_of_supply'` | unit | `… gst.service.test.ts -t "document type"` | ❌ W0 | ⬜ pending |
| BIL-07 | `gstEnabled: false` → no tax lines at all | unit | `… gst.service.test.ts -t "unregistered"` | ❌ W0 | ⬜ pending |
| RPT-01 | Dashboard returns patients-seen-today using IST day boundary | integration | `… tests/billing/dashboard.test.ts` | ❌ W0 | ⬜ pending |
| D-07 | Invoice-level discount pro-rates across lines; `Σ line.taxable === invoice.taxable` | unit | `… gst.service.test.ts -t "pro-rata"` | ❌ W0 | ⬜ pending |
| D-15 | Numbering is gap-free under concurrency and rolls back with the txn | integration | `… tests/billing/numbering.test.ts` | ❌ W0 | ⬜ pending |
| D-15 | Number ≤ 16 chars (Rule 46(b)) | unit | `… __tests__/numbering.test.ts` | ❌ W0 | ⬜ pending |
| PLT-04 | Clinic A cannot read Clinic B's invoices/payments | integration | `pnpm --filter @breeyo/api test -- tests/tenant-isolation.test.ts` | ⚠️ exists, must extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/billing/` directory — does not exist
- [ ] `apps/api/src/modules/billing/__tests__/gst.service.test.ts` — covers BIL-07, D-07, D-08/D-17
- [ ] `apps/api/src/modules/billing/__tests__/invoice-state.test.ts` — covers BIL-03, D-20, D-21
- [ ] `apps/api/src/modules/billing/__tests__/numbering.test.ts` — covers D-15, D-19
- [ ] `apps/api/src/modules/billing/__tests__/payment.service.test.ts` — covers BIL-05, D-10, D-11
- [ ] `apps/api/tests/billing/webhook.test.ts` — covers BIL-06 (signature, idempotency, latency)
- [ ] `apps/api/tests/billing/finalize-stock.test.ts` — covers BIL-02 including the concurrency case
- [ ] `apps/api/tests/billing/dashboard.test.ts` — covers D-24, RPT-01
- [ ] `apps/api/tests/helpers/factories.ts` — extend with invoice/payment/line-item factories
- [ ] `apps/api/tests/helpers/razorpay-mock.ts` — SDK mock + signed-webhook payload fixture builder
- [ ] Extend `apps/api/tests/tenant-isolation.test.ts` with billing tables (and verify it fails against the current `createTenantClient` before remediation — see 06-RESEARCH.md Pitfall 3)
- [ ] `apps/mobile/src/features/pdf/__tests__/invoice-template.test.ts` — covers BIL-04, Rule 46 field coverage

No framework install needed — Vitest 2.1 is configured in every workspace.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code scans correctly with a real UPI app and opens the Razorpay-hosted payment page | BIL-05 | Requires a physical device with a UPI app and live/test Razorpay credentials | Generate a payment link in the test flow, render the QR, scan with a UPI app, confirm the hosted page opens with the correct amount |
| Webhook actually fires end-to-end from Razorpay's test dashboard | BIL-06 | Requires a publicly reachable webhook URL (ngrok/tunnel) during dev; cannot be fully simulated by unit/integration tests alone | Configure a test webhook in the Razorpay dashboard pointing at a tunneled dev URL, trigger a test payment, confirm the invoice updates |
| PDF renders correctly across iOS and Android WebView engines, including the base64 logo | BIL-04 | `expo-print`'s underlying WebView differs by platform; visual rendering is not something Vitest can assert | Generate an invoice PDF on both an iOS simulator and an Android emulator, visually confirm logo, layout, and GST fields render correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
