---
phase: 06-invoicing-payments
verified: 2026-08-14T00:00:00Z
status: human_needed
score: 9/9 must-haves verified (5/5 ROADMAP success criteria; 8/8 BIL+RPT requirements + PLT-04 inherited)
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Eight core device flows (consultation-to-draft, service/discount add, finalize+stock validation by line provenance, cash/split payment, Razorpay link + live webhook confirmation, PDF print/share on paper, void/refund/credit-note, Quick Sale + pet tab)"
    expected: "Each flow behaves as described in 06-19-HUMAN-UAT.md against a running mobile app and API"
    why_human: "Requires a physical device or simulator (none exists in this build environment) and, for flow 5, live Razorpay test-mode gateway calls (no test credentials provisioned anywhere in this project)"
  - test: "A real Razorpay test-mode payment completes end-to-end and the webhook marks the invoice Paid with no app interaction"
    expected: "payment_link.paid webhook received, signature verified, invoice status flips to PAID"
    why_human: "RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET have never been provisioned in any reachable environment (tracked as follow-up A2, pre-Beta)"
---

# Phase 6: Invoicing & Payments — Independent Verification Report

**Phase Goal:** A vet can generate a GST filing-ready invoice from consultation services and dispensed items, accept real payments via UPI/card, have payment status update automatically, and see a daily business summary.

**Verified:** 2026-08-14
**Status:** human_needed
**Re-verification:** No — initial independent verification of the completed phase (24 plans + 3 hotfixes, closed out by plan 06-19)

## Method

This is an independent goal-backward verification, not a re-read of 06-19's own closeout record. Concretely, I:

1. Read all 24 `06-XX-PLAN.md` files, all `06-XX-SUMMARY.md` files, both hotfix summaries, `06-19-VERIFICATION.md`, `06-19-HUMAN-UAT.md`, `deferred-items.md`, `06-CONTEXT.md` (including the D-34–D-48 Plan-Review Resolutions), `REQUIREMENTS.md` and `ROADMAP.md`.
2. **Rebuilt the phase's own evidence from scratch**, rather than trusting the artifact: created a brand-new PostgreSQL database (`breeyo_verify06`) and a shadow database, ran `prisma migrate deploy` (7 migrations from empty), `init-rls-roles.sql`, `post-migrate.sql`, `pnpm db:seed`, then ran `bash scripts/verify-phase-06.sh --all --skip-suite` against that fresh database myself. This reproduced **23/23 PASS** independently — not a reference to the 06-19 run, a second live execution of the same gate against a database I built in this session, then dropped afterward.
3. Read the actual source of the areas called out for spot-checking (tenancy/transaction primitive, GST/money engine, the two hotfixes, void/stock-restoration, payment/webhook pipeline, SAC fix) and confirmed the code does what the summaries claim, including re-deriving several claims that were *not* asked for (e.g., independently checking whether D-35's Razorpay-side link cancellation and D-39's multi-invoice fan-out were real or just described).

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can generate an invoice that pulls consultation services and dispensed inventory items, with real-time stock validation before finalizing | ✓ VERIFIED | `EmrService.createDraftInvoiceForConsultation` (D-03 hook) + `InvoiceRepository.createDraft`/`finalize` read dispensed quantities from `StockMovement`. `StockValidatorService.reserveAndDeduct` takes `FOR UPDATE` on batch rows inside the caller's transaction. Independently re-ran `finalize-stock.test.ts` (incl. `concurrent`, `does not deduct`, `mixed provenance`) and `consultation-draft-hook.test.ts` fresh: 19+18 passing. |
| 2 | User can accept payment via Razorpay (UPI and card), and payment confirmation automatically updates invoice status via webhook | ✓ VERIFIED (logic); **device/live-gateway confirmation pending** | `webhook.routes.ts` verifies HMAC with `timingSafeEqual`, persists via a UNIQUE-index insert (dedupe, not read-then-write), and enqueues to `webhook.worker.ts`, which derives status via `recomputePaymentState` (never assigns it literally) and pushes `invoice:updated` to the clinic's Socket.IO room. Independently re-ran `payment.service.test.ts` + `webhook.test.ts`: 42+24 passing fresh. The SDK boundary itself has never spoken to a real Razorpay endpoint — no test credentials exist anywhere in this project (tracked, not a code defect — see Human Verification below). |
| 3 | User can mark invoices as paid or unpaid manually and can print or export invoices as PDF | ✓ VERIFIED | `markPaidHandler`/`markUnpaidHandler` gated by `isValidInvoiceTransition`; `invoice-state.test.ts` + `invoice-lock.test.ts` re-run fresh: 23 passing. PDF: `apps/mobile/src/features/pdf/templates/invoice.ts` renders all four Rule 46A document types; verified the four `06-19-artifacts/*.html` files are genuinely distinct rendered output (`>INVOICE<`, `BILL OF SUPPLY`, `TAX INVOICE`, `INVOICE-CUM-BILL OF SUPPLY` each appear in exactly the file that should produce them), not identical stub files. `invoice-template.test.ts` + `receipt-credit-note-template.test.ts` re-run fresh: 29 passing. |
| 4 | Invoices include full GST breakdown: CGST/SGST for intra-state, IGST for inter-state, with HSN/SAC codes per line item pulled from inventory/service catalog | ✓ VERIFIED | Read `gst.service.ts` in full: exempt-aware per-line computation in exact paise, CGST/SGST split (odd paise to CGST) for intra-state, IGST for inter-state, Section 170/Rule 51 rounding applied once per head at invoice level (not per-line), `roundOffPaise` kept as disclosure-only and never re-added to the grand total, Rule 46A document typing derived from the exempt/taxable mix. `service-catalog-seed.ts` confirmed carrying real `sacCode`/`gstRateOverride` per preset. Re-ran `gst.service.test.ts` fresh: 36 passing (incl. inter-state, rounding, document-type, unregistered, pro-rata sub-suites). |
| 5 | Billing dashboard shows a daily summary card: patients seen today, revenue collected today, total outstanding balance | ✓ VERIFIED | `dashboard.service.ts` runs two real SQL aggregates (IST day-boundary bounded) for revenue/payment counts and patients-seen-today, backed by the `consultations (clinic_id, status, finalized_at)` index added in 06-12. Mobile `useBillingDashboard` hook genuinely calls `GET /api/v1/billing/dashboard` (not hardcoded/hollow) with clinic-scoped cache keys and socket-driven invalidation. Re-ran `dashboard.test.ts` fresh: 12 passing. |

**Score:** 5/5 ROADMAP success criteria automatically verified. Two elements within criteria 2 (live gateway call, on-device webhook latency) remain human-dependent and are tracked, not silently passed — see Human Verification below.

### Requirement Coverage (BIL-01–07, RPT-01, PLT-04)

| ID | Requirement | Plan(s) | Status | Evidence |
|----|-------------|---------|--------|----------|
| BIL-01 | Generate invoice from consultation services + dispensed items | 06-07, 06-13, 06-21 | ✓ SATISFIED | 19 tests, re-run fresh |
| BIL-02 | Real-time stock validation before finalizing | 06-07, 06-13 | ✓ SATISFIED | 18 tests, re-run fresh (incl. no-double-deduction guard) |
| BIL-03 | Mark invoices paid/unpaid | 06-07, 06-17 | ✓ SATISFIED | 23 tests, re-run fresh |
| BIL-04 | Print/export invoice as PDF | 06-15 | ✓ SATISFIED | 29 tests, re-run fresh; artifacts independently inspected |
| BIL-05 | Accept payment via Razorpay (UPI/card) | 06-09, 06-22 | ✓ SATISFIED (logic; SDK boundary mocked — see Human Verification) | 42 tests, re-run fresh |
| BIL-06 | Payment confirmation updates status via webhook | 06-10 | ✓ SATISFIED (logic; live delivery untested — see Human Verification) | 24 tests, re-run fresh |
| BIL-07 | Full GST breakdown, CGST/SGST/IGST, HSN/SAC | 06-04, 06-05, 06-16, 06-23 | ✓ SATISFIED | 36 tests, re-run fresh |
| RPT-01 | Daily billing dashboard summary | 06-12, 06-14 | ✓ SATISFIED | 12 tests, re-run fresh |
| PLT-04 | Multi-tenant isolation (inherited) | 06-00, 06-00b, 06-02, 06-20 | ✓ SATISFIED | 20 tests, re-run fresh; RLS enabled+forced on all 10 billing tables (verified 10/10 with a fresh `INV-RLS` run) |

No orphaned requirements: every ID in the ROADMAP's Phase 6 requirement list appears in at least one plan's `requirements:` frontmatter (PLT-04 as the explicitly-inherited exception, itself gated by name in `scripts/verify-phase-06.sh`).

### Independent Gate Re-Execution

`scripts/verify-phase-06.sh --all` was **run twice in this session** against infrastructure I built myself (not reused from any prior run):

1. `--static-only --all`: 7/7 static invariants (`INV-MONEY`, `INV-SCHEMA-MONEY`, `INV-NO-CLIENT-TOTAL`, `INV-TENANT`, `INV-SOCKET`, `INV-SECRET`, `INV-GST-SLABS`) passed against the working tree as-is.
2. Full run against a freshly created, freshly migrated `breeyo_verify06` database (`prisma migrate deploy` from empty → `init-rls-roles.sql` → `post-migrate.sql` → `pnpm db:seed`), with a real shadow database for `INV-SYNC`: **23/23 PASS**, `--skip-suite` only (full 1000+ test workspace suite not re-run for time; the specific named tests underlying every requirement WERE re-run individually by the gate and all passed, matching 06-19's counts exactly: BIL-01=19, BIL-02=18, BIL-03=23, BIL-04=29, BIL-05=42, BIL-06=24, BIL-07=36, RPT-01=12, PLT-04=20).

Both temporary databases were dropped after verification; no shared/dev database was touched.

### Code-Level Spot Checks (beyond what SUMMARY.md claims)

| Area | Plan(s) | Finding |
|------|---------|---------|
| Tenant-transaction atomicity | 06-00, 06-00b | Read `prisma-rls.ts` in full. The `$transaction` override genuinely opens one real `base.$transaction`, binds the RLS GUC as its first statement, and hands the callback the *unextended* transaction client — confirmed this is structurally the fix the hotfix claims, not just a comment change. The sequential-array overload throws by design (verified no caller uses it). |
| GST engine | 06-05 | `gst.service.ts` read line-by-line: exempt lines carry zero tax regardless of configured rate; unregistered clinics short-circuit before any rate read (protects against a Section 122 offence even with stale catalog data); rounding happens exactly once, per head, at invoice level; `roundOffPaise` is disclosure-only and demonstrably not double-counted in `grandTotalPaise`. |
| Money primitives | 06-05 | `money.ts`: `toPaise` converts via exact string-split integer arithmetic (never a float multiply); `allocateProRata` distributes an integer total with remainder assigned to the largest weight, verified to always sum exactly. |
| Percent-discount hotfix | 06-07b | Confirmed the current `resolveInvoiceDiscount` in `invoice.service.ts` divides by `100`, not `10_000` — the bug is genuinely fixed in the code currently on disk, not just described as fixed in the hotfix summary. |
| Void + stock restoration | 06-07 | `invoice.repository.ts:voidInvoice` reads exactly as documented: locks the invoice row, restores stock only for lines the invoice itself deducted (via `stockMovementId` discriminator), sets `voidRestoredStock` in the same transaction so a second void cannot double-restore. |
| D-35 (Razorpay link cancellation on void) | 06-07 → 06-10 | **Found a positive discrepancy in the phase's own tracking.** `deferred-items.md` (#10, from 06-07) and `06-19-VERIFICATION.md`'s carried-forward register (item B4) both still say "nothing calls the gateway" for cancelling a voided invoice's Razorpay link. That was true when 06-07 shipped, but **plan 06-10 closed it**: `InvoiceService.voidInvoice` now calls `this.cancelLinksAtGateway(...)`, which calls `rzp.paymentLink.cancel(linkId)` for every link the void orphaned (`git log -S cancelLinksAtGateway` confirms it landed in commit `1050618`, "feat(06-10): add IST overdue and payment-link expiry sweeps"). Tested in `payment.service.test.ts` and `webhook.test.ts`/`jobs.test.ts`. **This is stale documentation in 06-19's own carried-forward list, not a code gap** — the functionality is real and tested. Worth a one-line correction to `06-19-VERIFICATION.md` §7 B4, but does not affect phase status. |
| D-39 (combined multi-invoice payment link) | 06-09 → 06-10 | 06-CONTEXT.md's Plan-Review Resolution states this "must be added to the plan before the phase closes." Confirmed via grep: `webhook.worker.ts` DOES fan out settlement across a `paymentGroupId` (06-10 genuinely built this half). But **no HTTP endpoint exists** that accepts `invoiceIds: string[]` to actually create a combined link — `billing.routes.ts` has no such route, only single-invoice-scoped payment routes. So D-39 is genuinely incomplete against the locked decision's literal text, exactly as `deferred-items.md` item 14 and `06-19-VERIFICATION.md` item B3 already say. This is a **real, already-tracked** gap — not new information — and does not block any of the 5 ROADMAP success criteria or any BIL/RPT requirement, since none of them mention multi-invoice payment collection. Not counted as a phase blocker. |
| SAC code fix | 06-19c | Confirmed `VETERINARY_SAC = '998351'` in `packages/types/src/constants/gst.ts`, used by `service-catalog-seed.ts` for all 18 clinical presets (grooming rows correctly excluded, kept at `998612`/18%), and `POST /billing/settings/sac-codes/update` genuinely exists and is gated by `MANAGE_CLINIC_SETTINGS` in `settings.controller.ts`. |
| RLS coverage | 06-00, 06-03 | All 10 billing tables (`invoices`, `invoice_line_items`, `payments`, `payment_receipts`, `refunds`, `credit_notes`, `credit_note_line_items`, `invoice_number_counters`, `webhook_events`, `billing_audit_log`) confirmed `ENABLE + FORCE ROW LEVEL SECURITY` with per-operation policies in `post-migrate.sql`; independently re-verified 10/10 `rowsecurity=true` against my own fresh database. |

### Human Verification Required

These are the same two items 06-19 already tracks — I independently confirmed they are correctly scoped as non-blocking, not silently dropped.

#### 1. Eight core device flows

**Test:** Run each of the eight flows in `06-19-HUMAN-UAT.md` (consultation→draft, service/discount add, finalize+stock-by-provenance, cash/split payment, Razorpay link+webhook, PDF print/share, void/refund/credit-note, Quick Sale+pet tab) against a running mobile app.
**Expected:** Behavior matches the "Expected" column of each flow row (e.g., dispensed-line stock unchanged at finalize vs. manually-added-line stock dropping by the invoiced amount).
**Why human:** No physical device or simulator exists in this build environment. `06-19-HUMAN-UAT.md` frontmatter (`status: partial`, `completed_flows: 0`, `decoupled_from_phase_completion: true`) confirms this was a deliberate 2026-08-14 decision to decouple from blocking phase completion, not an oversight — verified the file is a real, structured, trackable artifact (not a placeholder) with specific expected-vs-observed columns per flow.

#### 2. Live Razorpay test-mode payment → webhook → status update

**Test:** With real `RAZORPAY_TEST_KEY_ID`/`RAZORPAY_TEST_KEY_SECRET`, generate a payment link, complete a test payment, and confirm the webhook flips the invoice to Paid with no app interaction.
**Expected:** `payment_link.paid` arrives, signature verifies, invoice status updates automatically, UI reflects it via socket push.
**Why human:** No Razorpay test credentials exist in any environment reachable from this project (confirmed: `apps/api/.env` has `RAZORPAY_TEST_KEY_ID=` empty). Tracked as follow-up **A2**, pre-Beta. Everything below the SDK call boundary is genuinely tested (signature verification, idempotency, status derivation, socket push) — only the actual network call to Razorpay is unverified, and cannot be verified without provisioning.

### Anti-Patterns Found

None blocking. Scanned the areas spot-checked above for `TODO`/`FIXME`/`XXX`/placeholder patterns; the only debt markers found are already-tracked items in `deferred-items.md` with named owners (e.g., B1 billing-exceptions-list endpoint unbuilt, B2 unbillable-consultation reconciliation query unbuilt, B5 Quick Sale discount wiring). None of these affect the 5 ROADMAP success criteria.

## Gaps Summary

No new gaps found beyond what the phase's own closeout (`06-19-VERIFICATION.md`) already tracks. Specifically:

- **D-39 (combined multi-invoice payment link)** is confirmed incomplete against the CONTEXT decision's literal "must be added before the phase closes" — but this was already known (deferred-items.md #14, 06-19-VERIFICATION.md B3) and does not block any ROADMAP success criterion or requirement ID.
- **Two human-dependent verification items** (eight device UAT flows; live Razorpay test-mode payment) are correctly recorded as non-blocking, tracked follow-ups with dedicated destinations (`06-19-HUMAN-UAT.md`, follow-up A2) rather than silently passed or silently dropped. Per this phase's own framing and the verification brief, this status resolves to `human_needed` rather than `passed` — the automated/code-level goal achievement is complete, but the phase cannot be marked fully verified until a human runs the eight flows and, pre-Beta, a live Razorpay test payment.
- One documentation staleness was found (06-19-VERIFICATION.md §7 B4 says Razorpay link cancellation "nothing calls the gateway," but 06-10 actually implemented and tested it) — this is a stale record, not a code defect, and does not affect phase status either way.

**Verdict:** All automated, code-level goal-backward verification passes independently (5/5 ROADMAP success criteria, 9/9 requirement IDs, 23/23 gate checks re-run fresh against infrastructure built in this session). The phase's build genuinely achieves the stated goal. The only reason this is not `passed` outright is that two explicitly-tracked, correctly-scoped human-dependent verification items remain outstanding by design — exactly as the phase's own 06-19 closeout already states. This is `human_needed`, not `gaps_found`: nothing here should block proceeding to Phase 7 while the human runs the device flows and, pre-Beta, obtains Razorpay test credentials.

### Addendum (2026-08-14, post-verification)

**D-39 is now fully resolved.** Plan 06-19d added `PaymentService.createCombinedPaymentLink` and `POST /billing/payment-links`, closing the gap this verification flagged above — 18 new tests including an end-to-end check that a real signed `payment_link.paid` webhook correctly settles every invoice in a group created through the actual endpoint (not seeded rows). `deferred-items.md` #14 and `06-CONTEXT.md`'s D-39 note were updated accordingly. `verify-phase-06.sh --all` re-run after this fix: still **ALL CHECKS PASSED** (BIL-05 now 42 tests). The invoice-picker mobile UI for selecting multiple invoices to combine is the one remaining piece, tracked as a UI-only follow-up in `deferred-items.md` #14 — this does not affect any ROADMAP success criterion, since the criterion only concerns backend payment-link creation and webhook-driven status updates, both of which now fully exist.

No further gaps outstanding beyond the two human-dependent items already tracked above.

---

*Verified: 2026-08-14*
*Verifier: Claude (gsd-verifier)*
