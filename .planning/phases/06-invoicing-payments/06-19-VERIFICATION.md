# Phase 6 — Invoicing & Payments: Verification Record

Evidence for every Phase 6 requirement, every ROADMAP success criterion, every
phase-wide invariant, and the two human checkpoints.

**Gate:** `bash scripts/verify-phase-06.sh`
**Gate result:** exit **0**, all 23 checks PASS (1 SKIP when `--skip-suite`).
**Human checkpoints:** answered 2026-08-14 — Razorpay questions closed with
tracked follow-ups, GST questions still open, eight device flows moved to
`06-19-HUMAN-UAT.md` (`status: partial`). See §5, §6, §6b and §8.
**Environment:** worktree `agent-a25f50932b947ef8f`, PostgreSQL 16 (`breeyo_p0619`,
created fresh for this run: `prisma migrate deploy` → `init-rls-roles.sql` →
`post-migrate.sql` → `db:seed`), Redis 7, Node 22, pnpm 9.

---

## 1. Requirements

Every row is a real invocation of `scripts/verify-phase-06.sh`, not a claim.
The gate refuses to count a `-t` filter that matches nothing, so a renamed test
cannot silently empty a sub-check.

| ID | Requirement (REQUIREMENTS.md) | Test command | Result | Tests |
|----|-------------------------------|--------------|--------|-------|
| **BIL-01** | User can generate an invoice from consultation services and dispensed items | `vitest run tests/billing/invoice-create.test.ts` + `-t "idempotent"` + `tests/billing/consultation-draft-hook.test.ts` | **PASS** | 19 |
| **BIL-02** | Invoice validates stock availability in real time before finalizing | `vitest run tests/billing/finalize-stock.test.ts` + `-t "concurrent"` + `-t "does not deduct"` + `-t "mixed provenance"` + `tests/billing/quick-sale.test.ts` + `src/modules/billing/__tests__/invoice.service.test.ts -t "stock plan"` | **PASS** | 18 |
| **BIL-03** | User can mark invoices as paid or unpaid | `vitest run src/modules/billing/__tests__/invoice-state.test.ts` + `tests/billing/invoice-lock.test.ts` | **PASS** | 23 |
| **BIL-04** | User can print or export invoice as PDF | `vitest run src/features/pdf/__tests__/invoice-template.test.ts` + `receipt-credit-note-template.test.ts` (mobile) | **PASS** | 29 |
| **BIL-05** | User can accept payment via Razorpay (UPI and card) | `vitest run src/modules/billing/__tests__/payment.service.test.ts` + `tests/billing/payment.test.ts` | **PASS** (SDK mocked — see §5, flow 5) | 42 |
| **BIL-06** | Payment confirmation updates invoice status automatically (via webhook) | `vitest run tests/billing/webhook.test.ts` + `-t "invalid signature"` + `-t "idempotent"` + `-t "latency"` | **PASS** (mocked delivery — see §5, flow 5) | 24 |
| **BIL-07** | Full GST-compliant invoicing with CGST/SGST/IGST breakdown and HSN/SAC codes | `vitest run src/modules/billing/__tests__/gst.service.test.ts` + `-t "inter-state"` + `-t "rounding"` + `-t "document type"` + `-t "unregistered"` + `-t "pro-rata"` | **PASS** | 36 |
| **RPT-01** | Billing dashboard shows a daily summary | `vitest run tests/billing/dashboard.test.ts` | **PASS** | 12 |
| **PLT-04** | *(inherited)* Clinic A cannot read Clinic B's data | `vitest run tests/tenant-isolation.test.ts` | **PASS** | 20 |

**Whole workspace:** `pnpm test` — API **1009 passed / 0 failed** (9 files
skipped, 80 `todo`, all Phase 5 `tests/inventory/` scaffolds); mobile **626
passed / 0 failed**; `packages/*` green. Total across the workspace: **0
failures**.

### Why the BIL-02 sub-filters are treated as requirements, not extras

`-t "concurrent"` is the oversell guard. `-t "does not deduct"` and
`-t "mixed provenance"` are the no-double-deduction guarantee (T-06-143): a
consultation-sourced line must **not** decrement a batch Phase 5 already
decremented, and a mixed-provenance invoice must decrement only the manually
added lines. A BIL-02 that passes `concurrent` but fails `does not deduct`
means inventory is silently corrupted every time a consultation is billed, on
the phase's primary invoice path. The gate treats their absence as FAIL.

---

## 2. ROADMAP success criteria

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1 | Invoice pulls consultation services and dispensed inventory items, with real-time stock validation before finalizing | BIL-01 (19) + BIL-02 (18). `consultation-draft-hook.test.ts` covers the D-03 End-Consultation hook; `finalize-stock.test.ts` covers the per-item shortfall response and the concurrent-finalize oversell case. | **Automated: PASS.** Device confirmation pending (§5, flows 1–3) |
| 2 | Payment via Razorpay (UPI and card), confirmation updates invoice status via webhook | BIL-05 (42) + BIL-06 (24), including invalid-signature rejection, `x-razorpay-event-id` idempotency and the 50-event latency budget. | **Automated: PASS. Live gateway: NOT VERIFIED** — no Razorpay test credentials in any environment (§5, flow 5; §6, Q5) |
| 3 | Mark invoices paid/unpaid manually; print or export as PDF | BIL-03 (23) + BIL-04 (29). Four Rule 46A document-type samples rendered from the shipped template (§6, Q4). | **Automated: PASS.** Print/share on a device pending (§5, flow 6) |
| 4 | Full GST breakdown: CGST/SGST intra-state, IGST inter-state, HSN/SAC per line from inventory/service catalog | BIL-07 (36), covering per-line exempt-aware tax, inter-state IGST, per-head Section 170 / Rule 51 rounding, Rule 46A document typing, the `gstEnabled:false` path and D-07 pro-rata allocation. | **Automated: PASS.** Treatment vs. real clinic practice pending (§6, Q1–Q3) |
| 5 | Billing dashboard daily summary: patients seen today, revenue collected today, total outstanding | RPT-01 (12), including the IST day-boundary case and the `consultations (clinic_id, status, finalized_at)` index added in 06-12. | **Automated: PASS.** Device confirmation pending (§5, flow 8) |

---

## 3. Phase-wide invariants

| Gate | Assertion | Comment-stripped? | Result |
|------|-----------|-------------------|--------|
| `INV-MONEY` | No `toFixed` in `apps/api/src/modules/billing/` or `packages/types/src/billing.ts`; no `parseFloat` / `Number(...Paise)` in `gst.service.ts` or `money.ts` | **Yes** — both files discuss floats at length in their headers | **PASS** |
| `INV-SCHEMA-MONEY` | 0 `Decimal…paise` / `Float` columns in the Phase 6 models | **Yes** (`//`) | **PASS** |
| `INV-NO-CLIENT-TOTAL` | No `subtotalPaise` / `grandTotalPaise` / `cgstPaise` / `sgstPaise` / `igstPaise` / `taxableValuePaise` in any request schema | **Yes** | **PASS** |
| `INV-TENANT` | `scripts/check-tenant-client.sh` — no admin Prisma client in a clinic-scoped route | n/a — the script does its own comment stripping in `awk` | **PASS** (33 files scanned) |
| `INV-SOCKET` | No `io.emit(` in the billing module or the payment-link expiry job | **Yes** | **PASS** |
| `INV-SECRET` | No `rzp_test` / `rzp_live` / `razorpayKeySecretEnc` / `key_secret` in `apps/mobile/src/` or `packages/types/src/` | **Yes**, plus test-file exclusion (below) | **PASS** |
| `INV-GST-SLABS` | `GST_RATE_SLABS` exists and the tuple is exactly `[0, 5, 18, 40]` | n/a — matches a code literal, not a token that appears in prose | **PASS** |
| `INV-SYNC` | The migration set alone reproduces `schema.prisma` (`migrate diff --from-migrations --exit-code`) | n/a | **PASS** |
| `INV-TRGM` | The live database differs from `schema.prisma` by *precisely* the four pg_trgm GIN indexes and nothing else, and all four exist | n/a | **PASS** (4/4) |
| `INV-RLS` | All 10 billing tables exist **and** none has `rowsecurity=false` | n/a | **PASS** (10/10) |
| `SUITE` | `pnpm test` across the workspace | n/a | **PASS** |
| `TSC-API` | `tsc --noEmit` in `apps/api` | n/a | **PASS** (0 errors) |
| `TSC-MOBILE` | Phase-6-scoped error count equals the recorded baseline | n/a | **PASS** (1 = baseline; 61 pre-existing app-wide) |
| `EXPO-DEPS` | `expo install --check` | n/a | **PASS** |

### Gates that do not need comment stripping, and why

- `INV-GST-SLABS` matches the literal `[0,5,18,40] as const`, not a token that
  could appear in prose. A comment cannot produce that shape.
- `INV-TENANT` delegates to `check-tenant-client.sh`, which already strips
  comment-only lines inside its own `awk` program and additionally implements
  a documented `D-30 exemption` window.
- `INV-SYNC`, `INV-TRGM`, `INV-RLS`, `SUITE`, `TSC-*`, `EXPO-DEPS` are not
  grep-based.

### One deliberate exclusion, recorded rather than hidden

`INV-SECRET` excludes `__tests__/` and `*.test.*`. The only two matches in the
tree are in `apps/mobile/src/features/billing/__tests__/PaymentCollectionSheet.test.tsx`:

```
166:    expect(serialised).not.toMatch(/keySecret|key_secret|razorpayKeyId/);
383:    expect(source).not.toMatch(/keySecret|key_secret/);
```

Both are assertions that the credential is **absent**. Including them would
make the gate trip on the very tests that enforce it, and the usual response to
that is to weaken the pattern. Everything a device actually ships is scanned.

---

## 4. Proving the gate can fail (T-06-125)

A gate that cannot fail provides no assurance. Demonstrated in both directions.

### Positive control — a real violation fails the gate

Appended to `apps/api/src/modules/billing/money.ts`:

```ts
const x = (1.5).toFixed(2);
```

Observed output:

```
── INV-MONEY  no float money in the billing surface ───────
apps/api/src/modules/billing/money.ts:197:const x = (1.5).toFixed(2);

!!! FAILED: INV-MONEY -- toFixed / parseFloat / Number(...Paise) in money-carrying code

════════════════════════════════════════════════════════════════════════
 Phase 06 -- Invoicing & Payments : gate summary
════════════════════════════════════════════════════════════════════════
 CHECK                RESULT EVIDENCE
 -------------------- ------ --------------------------------------
 ...
 INV-MONEY            FAIL   toFixed / parseFloat / Number(...Paise) in money-carrying code
════════════════════════════════════════════════════════════════════════
 1 CHECK(S) FAILED
```

**Observed exit code: 1.** Fail-fast stopped the run before the remaining
checks, and the summary named the invariant.

### Negative control — the comment stripping is real, not decorative

Appended instead:

```ts
// Never write const x = (1.5).toFixed(2); here.
```

**Observed exit code: 0**, `INV-MONEY` PASS. So the gate distinguishes a
violation from a discussion of one, which is exactly what lets the invariant be
documented in the code it governs.

`money.ts` was restored after each run; `git status` confirmed clean.

---

## 5. Human verification — the eight core device flows

> **STATUS: PENDING — tracked in `06-19-HUMAN-UAT.md` (`status: partial`).**
>
> **Human decision, 2026-08-14:** the eight flows will be run by the human on
> their own device and reported back. This is **decoupled from blocking phase
> completion — it is not deferred and not dropped.** The flows are persisted as
> a standing UAT artifact (`06-19-HUMAN-UAT.md`, `verification: human_needed`,
> `status: partial`) so they keep surfacing in progress and UAT checks until
> every flow has a recorded outcome.
>
> This execution environment has **no physical device, no simulator, and no
> Razorpay test credentials**. None of the eight flows could be driven here, and
> flow 5 cannot be driven anywhere in this project today (see §6, Q5). Nothing
> below is marked verified. The table records what automated evidence exists
> for each flow so the human is confirming behaviour rather than discovering it.

### What was prepared, and what could not be

| Preparation step the plan asked for | Status |
|---|---|
| Migrated database (`prisma migrate deploy`) | **Done** — `breeyo_p0619`, 7 migrations applied |
| `post-migrate.sql` applied | **Done** — RLS policies + 4 pg_trgm indexes verified present |
| `pnpm db:seed` | **Done** — permissions and roles seeded |
| Demo data: 1 clinic, 2 pets with owners, 3 stock items, 1 low-stock item | **NOT DONE** — the repo has no demo-data seeder; `prisma/seed.ts` seeds RBAC reference data only. Creating pets, owners and stock batches is a fixture script that does not exist and is out of this plan's file scope. Recorded as a carried-forward item. |
| `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` | **BLOCKED** — not provisioned in any environment. Flagged since 06-01 and again in 06-09 (deferred item 13). |
| `BILLING_ENCRYPTION_KEY` | Available — the test harness generates a per-run key when unset (`tests/helpers/setup.ts`) |
| Tunnel exposing the API to Razorpay, webhook registered in the Razorpay dashboard | **BLOCKED** — requires the credentials above and a Razorpay account |
| Expo app running on a device | **BLOCKED** — no device or simulator in this environment |

### Flow outcomes

| # | Flow | Requirements | Automated evidence that the underlying logic is correct | Device outcome |
|---|------|--------------|---------------------------------------------------------|----------------|
| 1 | Consultation → draft, quantities 2 and 3 | BIL-01, D-03 | `consultation-draft-hook.test.ts` — the hook creates exactly one draft and carries dispensed quantities verbatim; `invoice-create.test.ts -t "idempotent"` — a retry does not create a second draft | **NOT RUN** |
| 2 | Service add + line and invoice discounts | D-01, D-02, D-07 | `gst.service.test.ts -t "pro-rata"` — invoice discount allocates across lines with `Σ line.taxable === invoice.taxable`; hotfix 06-07b fixed a 100× percentage-discount error and added 9 tests | **NOT RUN** |
| 3 | Finalize + stock validation, and the two stock deltas | BIL-02 | `finalize-stock.test.ts` (shortfall, `concurrent`, `does not deduct`, `mixed provenance`) + `invoice.service.test.ts -t "stock plan"`. **This is the flow most likely to be wrong in a way tests can miss and the one to drive most carefully.** | **NOT RUN** — invoice number, and the before/after remaining quantity for a *dispensed* line vs. a *manually added* line, all unrecorded |
| 4 | Cash and split payment | BIL-03, D-10 | `payment.test.ts`, `invoice-state.test.ts` — status derived by `recomputePaymentState`, never assigned literally | **NOT RUN** |
| 5 | Razorpay link, QR, live webhook confirmation | BIL-05, BIL-06 | `payment.service.test.ts` (link params, `expire_by`, ≤40-char `reference_id`), `webhook.test.ts` (signature, idempotency, 50-event latency). **All against a mocked SDK — no code in this phase has ever spoken to Razorpay.** | **BLOCKED — cannot be run in this project today.** No test credentials exist. Webhook-to-UI latency: **unmeasured** |
| 6 | PDF documents, unregistered then registered-mixed | BIL-04, BIL-07 | `invoice-template.test.ts` + the four rendered samples in `06-19-artifacts/` (§6, Q4). Headings and the Section 122 negative check confirmed statically. | **NOT RUN** — one-page layout, legibility on paper, and `Print.printAsync` against a real printer all unverified (06-15 deferred item 2) |
| 7 | Void with stock return, refund, credit note | D-12, D-22, D-26/D-34 | `refund.test.ts`, `credit-note.test.ts`, `invoice-lock.test.ts`. Void restores only movements the invoice itself created; `restoreToStock` is the exact mirror of `reserveAndDeduct` | **NOT RUN** — observed stock delta after void, and the credited invoice's unchanged `grandTotalPaise`, unrecorded |
| 8 | Quick Sale and the pet Invoices tab | D-04, D-25 | `quick-sale.test.ts` — create-and-finalize in one transaction with stock deduction | **NOT RUN** |

**Task status: PENDING, not blocking.** Flows 3, 5, 6 and 7 each require an
observation no test can substitute for, and none has been made. Per the
2026-08-14 decision these are tracked in `06-19-HUMAN-UAT.md` rather than
holding the phase open. Flow 5 additionally cannot run until Razorpay test
credentials exist (**A2**, pre-Beta).

---

## 6. Human review — GST compliance and Razorpay onboarding readiness

> **STATUS: ANSWERED for the Razorpay half (2026-08-14); the GST half remains
> open as tracked follow-ups.**
>
> The human answered Q5, Q6 and Q8 on 2026-08-14. Q4 and Q7 are answered from
> evidence generated here, with the on-device presentation half rolled into
> `06-19-HUMAN-UAT.md`. **Q1, Q2 and Q3 — the three GST-treatment questions —
> were not covered by that answer and remain genuinely open.** They are recorded
> below and in §7 as open follow-ups, not as phase blockers. The evidence the
> plan asked to be produced before pausing has been produced and is inline.

### Evidence produced for the reviewer

#### `SERVICE_CATALOG_SEED_DATA` as shipped

`apps/api/src/modules/billing/service-catalog-seed.ts` — 20 presets. Every one
is `gstRateOverride: 0` (exempt) except the two grooming rows at 18%.

| # | Service | `sacCode` | `gstRateOverride` |
|---|---------|-----------|-------------------|
| 1 | General Consultation | `999311` | 0 |
| 2 | Follow-Up Consultation | `999311` | 0 |
| 3 | Home Visit Consultation | `999311` | 0 |
| 4 | Emergency Consultation | `999399` | 0 |
| 5 | Vaccination – Core | `999311` | 0 |
| 6 | Vaccination – Non-Core | `999311` | 0 |
| 7 | Deworming | `999311` | 0 |
| 8 | Tick & Flea Treatment | `999311` | 0 |
| 9 | Spay/Neuter (Small) | `999313` | 0 |
| 10 | Spay/Neuter (Large) | `999313` | 0 |
| 11 | Minor Surgery | `999313` | 0 |
| 12 | Major Surgery | `999313` | 0 |
| 13 | Dental Cleaning | `999311` | 0 |
| 14 | Dental Extraction | `999313` | 0 |
| 15 | X-Ray | `999312` | 0 |
| 16 | Ultrasound | `999312` | 0 |
| 17 | Lab Test – Basic (CBC) | `999312` | 0 |
| 18 | Lab Test – Comprehensive | `999312` | 0 |
| 19 | Grooming – Basic | `998612` | **18** |
| 20 | Grooming – Full | `998612` | **18** |

Note the mismatch this makes concrete: `packages/types/src/constants/gst.ts`
defines `VETERINARY_SAC = '998351'` (the Notification 12/2017 Entry 46 code),
while the shipped seed uses the `9993xx` family, preserved as
`VETERINARY_SAC_LEGACY`. **No invoice is mis-taxed by this** — the tax engine
reads `gstRateOverride` and `taxTreatment`, never the SAC string. The code
changes only what is *printed*.

> **Superseded 2026-08-14 (A1 resolved).** The table above is the seed as this
> audit found it and is kept as the record of that state. Rows 1–18 now carry
> `998351`; rows 19–20 are unchanged. Clinics seeded before this date keep their
> `9993xx` codes until an Admin invokes the opt-in correction. See §7.1.

#### Razorpay onboarding state, from the database

```sql
SELECT count(*) AS total_clinics,
       count(razorpay_key_id) AS with_key_id,
       count(razorpay_webhook_secret_enc) AS with_webhook_secret,
       count(razorpay_webhook_token) AS with_webhook_token
FROM clinics;
```

| total_clinics | with_key_id | with_webhook_secret | with_webhook_token |
|---|---|---|---|
| **0** | **0** | **0** | **0** |

The shared dev database (`breeyo`) cannot be queried for this at all — it
predates the Phase 6 migration and has no `razorpay_key_id` column
(`ERROR: column "razorpay_key_id" does not exist`). **So the answerable part of
Q5/Q6 is: no environment reachable from this repo holds any pilot-clinic
Razorpay configuration. Onboarding has not started anywhere the build can see.**
How many of the 20 pilot clinics have completed KYC in the real world is not a
fact the codebase contains.

#### The not-configured indicator, verbatim

`apps/mobile/src/features/billing/lib/settings-form.ts`, selected by
`webhookIndicator(webhookConfigured, webhookUrl)` with `tone: 'warning'`:

- **Key saved, webhook secret absent** (`webhookNotConfiguredText`):
  > "Webhook not configured. Paste this URL into your Razorpay dashboard, or payments will complete without ever marking the invoice paid."
- **No key saved yet, so no URL to show** (`webhookMissingText`):
  > "Save a Razorpay key to generate this clinic's webhook URL."
- **Configured** (`tone: 'positive'`):
  > "Webhook configured. This clinic can receive payment confirmations."

### The eight questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Are all six preset services genuinely GST-exempt for your clinics? | **UNANSWERED — needs the human.** The shipped state is above: all clinical presets exempt, grooming at 18%. 06-RESEARCH.md flags standalone **Lab Test** as disputed, with an Advance Ruling treating some lab services as taxable — rows 17 and 18 are the concrete decision. |
| 2 | Is `998351` the SAC your accountants expect, or the `9993xx` codes in the seed? | **ANSWERED 2026-08-14: `998351`, and the migration is opt-in.** 06-04's recommendation adopted verbatim — the seed now writes `998351` for new clinics, and already-seeded clinics get an explicit Admin-only "Update SAC codes" action on Billing Settings rather than a silent data migration, because an accountant may already have corrected those rows by hand. Grooming keeps `998612`. Shipped in `06-19c-SAC-FIX-SUMMARY.md`; details in §7.1. |
| 3 | Are any of the 20 pilot clinics GST-registered, and does their invoice need anything not on the template? | **UNANSWERED — needs the human.** Not derivable from the codebase: 0 clinic rows exist in any reachable database. |
| 4 | Generate one PDF per document-type case and confirm each is presentable | **EVIDENCE PRODUCED — human review of presentation still required.** Rendered from the shipped `buildInvoiceHtml`, in `.planning/phases/06-invoicing-payments/06-19-artifacts/`: <br>• `1-unregistered-clinic.html` → heading **INVOICE**, GSTIN absent, CGST absent, HSN absent <br>• `2-registered-exempt-only.html` → **BILL OF SUPPLY** <br>• `3-registered-taxable-only.html` → **TAX INVOICE** <br>• `4-registered-mixed.html` → **INVOICE-CUM-BILL OF SUPPLY** <br>All four Rule 46A branches correct, and the Section 122 negative check holds on the unregistered document. Whether it *looks like something a vet would hand a client* is the part still open. |
| 5 | How many of the 20 pilot clinics have a Razorpay account with completed KYC? | **ANSWERED 2026-08-14: zero.** None of the 20 pilot clinics has started Razorpay onboarding. This matches the database exactly — **0 of 0** clinic rows carry a `razorpay_key_id`. Recorded as pre-launch checklist item **PL-1**. |
| 6 | Is there an onboarding runbook? | **ANSWERED 2026-08-14: no, and it is required before launch.** The human's explicit call — not "can wait". A clinic that skips the webhook-configuration step silently breaks automatic payment confirmation, so the runbook is not optional. Recorded as pre-launch checklist item **PL-2**. |
| 7 | Is the not-configured indicator visible and clearly worded? | **WORDING RECORDED (above); on-device legibility rolled into `06-19-HUMAN-UAT.md`.** The warning states the consequence in plain language ("payments will complete without ever marking the invoice paid") rather than naming a missing field, which is the right shape for a non-technical reader. |
| 8 | Do test-mode and live-mode key pairs both work through the same form, and is the Test Mode toggle clear? | **ANSWERED 2026-08-14: deferred, cannot be tested.** Razorpay test credentials are not available yet. Recorded as follow-up **A2** (pre-Beta; blocks BIL-05/BIL-06 live verification). |

### Task status

**Razorpay half: closed.** Q5, Q6 and Q8 have recorded answers and named
follow-ups (**PL-1**, **PL-2**, **A2**).

**GST half: Q2 closed 2026-08-14, Q1 and Q3 open.** The legacy SAC decision
carried from 06-04 has been taken and implemented — see §7.1 and **A1**. Q1 (are
the six presets genuinely exempt, and specifically the disputed Lab Test rows
17–18) and Q3 (are any pilot clinics GST-registered, and does their invoice need
anything not on the template) still have no answer. They are compliance
decisions about how real clinics bill, and nothing in the codebase can settle
them. Tracked as **A4** and **A5** in §7 — open follow-ups, not phase blockers.

**No GST treatment change is pending in code**: the shipped behaviour is
internally consistent and correct against the research findings. What is open is
whether that behaviour matches the pilot cohort's actual billing practice.

---

## 6b. Pre-launch checklist (new, from the 2026-08-14 answers)

No item here blocks phase completion. All block **launch**. PL-1 and PL-2 are
external, third-party-paced work the build cannot complete; PL-3 is an internal
ops action that must happen in the AWS account, not in the repository.

| ID | Item | Detail | Status |
|----|------|--------|--------|
| **PL-1** | Every pilot clinic needs a Razorpay account with completed KYC | Confirmed 2026-08-14 that **0 of 20** have started. D-29 locks per-clinic API keys, so this cannot be centralised — each clinic does its own signup and KYC. Until a clinic completes it, that clinic cannot accept digital payments at all. | **Required before launch. Not started.** |
| **PL-2** | Write the clinic onboarding runbook | Must cover: create the Razorpay account, complete KYC, generate API keys, paste them into Billing Settings, **and copy the per-clinic webhook URL into their own Razorpay dashboard** with the six required events. The last step is the one that silently breaks BIL-06 when skipped — the payment succeeds and the invoice is never marked paid. Confirmed 2026-08-14 as required before launch, explicitly not deferrable. | **Required before launch. Does not exist.** |
| **PL-3** | Provision the `BILLING_ENCRYPTION_KEY` SSM parameter in AWS | The staging and production task definitions now reference `/breeyo/staging/BILLING_ENCRYPTION_KEY` and `/breeyo/production/BILLING_ENCRYPTION_KEY` (CR-05 fix). **The referenced parameters do not exist yet** — the repository has no IaC, so every SSM parameter is created by hand, and this one has never been created. An ECS task whose `secrets` block points at a missing parameter **fails to start** with `ResourceNotFoundException`, so this must be done *before* the next deploy, not after. Create as `SecureString` in `ap-south-1` with a fresh 32-byte hex value (`openssl rand -hex 32`), independently per environment. Rotating it later invalidates every stored clinic Razorpay secret. | **Required before next deploy. Not provisioned.** |

The wording a clinic will see if PL-2 is skipped is already in place and states
the consequence plainly (§6, Q7) — but a warning is a backstop, not a substitute
for the runbook.

**PL-3 also has an IAM half.** Creating the parameter is not sufficient on its
own: the ECS **execution** role (`breeyo-staging-ecs-execution-role` and its
production counterpart) is what fetches `secrets` at task start, and if its
policy enumerates parameter ARNs individually rather than using a
`/breeyo/<env>/*` wildcard, it must be extended to cover the new key. The repo
has no IaC, so the current policy shape cannot be confirmed from here — check it
in the console. The failure mode is identical either way (`ResourceNotFoundException`
/ `AccessDeniedException` at task start), so verify both halves together.

**PL-3 ordering caveat.** PL-3 is the one item that makes the deploy *worse*
before it makes it better: prior to the CR-05 fix the API booted fine and only
failed when a clinic saved a credential, whereas now a missing parameter stops
the task from starting at all. That is the correct trade — a container that
refuses to start is visible in seconds, while the previous behaviour was a 500
discovered by a clinic mid-onboarding — but it does mean PL-3 must be completed
before the next `main` push, since staging deploys automatically on push.

---

## 7. Carried-Forward Items

Collected from all 24 plan summaries, the two hotfix summaries, and
`deferred-items.md`, updated with the 2026-08-14 answers.

**Status vocabulary.** *Tracked* = has a recorded decision and a destination
(a pre-launch checklist item or a standing UAT artifact). *Open* = genuinely
unresolved, needs a decision. Nothing here blocks phase completion.

### A. Compliance and go-live items

| # | Item | Source | Status |
|---|------|--------|--------|
| A1 | **Legacy SAC codes.** Seed shipped `9993xx`; `VETERINARY_SAC` is `998351`. Affects already-seeded clinics; changes what is printed on a legal document. 06-04's recommendation: switch the seed to `998351` for new clinics and offer an opt-in "update SAC codes" action, not a silent migration. | 06-04 | **RESOLVED 2026-08-14** — 06-04's recommendation adopted verbatim. See §7.1 below for what shipped. |
| A2 | **Razorpay test credentials absent.** No code in this phase has ever spoken to Razorpay. A live test key must confirm the real `paymentLink.create` param set, that `expire_by = now + 960s` survives real latency, the real SDK rejection shape, and that `short_url` yields a scannable UPI QR. | 06-01, 06-09 (item 13) | **TRACKED — deferred 2026-08-14.** Flagged **pre-Beta; blocks BIL-05/BIL-06 live verification.** Gates UAT flow 5 and §6 Q8. Five-minute signup when someone picks it up. |
| A3 | **Per-clinic KYC + webhook onboarding for 20 pilot clinics.** | 06-RESEARCH, 06-12 | **TRACKED** — split into pre-launch **PL-1** (KYC, 0/20 started) and **PL-2** (runbook, does not exist). Both confirmed required before launch on 2026-08-14. T-06-128. |
| A4 | **Lab Test GST treatment is disputed.** Rows 17–18 ship exempt; an Advance Ruling treats some lab services as taxable. | 06-RESEARCH G-findings | **OPEN** — §6 Q1 unanswered. The single most likely GST treatment to need changing. |
| A5 | **Whether any pilot clinic is GST-registered**, and whether a registered clinic's invoice needs anything not on the current template. | 06-RESEARCH, this plan | **OPEN** — §6 Q3 unanswered. GST defaults off per clinic, so the unregistered path is the one in use until this is answered. |

#### 7.1 A1 resolution, 2026-08-14

The business decision was taken as 06-04 recommended: **new clinics get the
correct code; already-seeded clinics are offered an explicit action and are
never migrated silently.** Implemented in `06-19c-SAC-FIX-SUMMARY.md`.

**New clinics.** `apps/api/src/modules/billing/service-catalog-seed.ts` now
writes `VETERINARY_SAC` (`998351`, Notification 12/2017-CT Entry 46) on all
eighteen clinical presets. The two grooming rows keep `998612` and their 18%
override — grooming is not veterinary healthcare, Entry 46 does not reach it,
and stamping the nil-rated veterinary SAC on a taxable line would be a worse
document than the one being corrected.

**Existing clinics.** `POST /api/v1/billing/settings/sac-codes/update`, gated on
`MANAGE_CLINIC_SETTINGS` (Admin only), rewrites this clinic's
`VETERINARY_SAC_LEGACY_CORRECTABLE` rows — the `9993xx` family, `998612`
deliberately excluded — to `998351` and audits the count as
`SERVICE_SAC_CODES_UPDATED`. It is the only code path in the repository that
writes `service_catalog.sac_code` in bulk, and nothing invokes it implicitly:
no deploy hook, no login hook, no side effect of reading the settings. A clinic
that never presses the button keeps its rows byte-for-byte, which is the point —
an accountant may already have corrected them by hand.

**Where the action lives.** Billing Settings (`BillingSettingsScreen.tsx`), in a
`SAC Codes` section that renders **only** when `legacySacCodeCount > 0`. The
copy names the count and the target code, states that no tax amount changes, and
ends "If your accountant chose the codes you have, leave this as it is." A
clinic seeded after 2026-08-14 never sees the section at all.

**§6 Q2 is therefore answered:** `998351` is the code, `9993xx` was wrong, and
the migration is opt-in per clinic.

### B. Functional gaps inside Phase 6

| # | Item | Source |
|---|------|--------|
| B1 | **Billing exceptions list + resolve action.** `GET /billing/exceptions` unbuilt; `exception_resolved_at` / `_by_id` / `_notes` columns exist and nothing writes them, so a flagged invoice **cannot be un-flagged through the product at all**. Only the dashboard count shipped. | 06-12 (item 15) |
| B2 | **A consultation whose D-03 draft hook failed is unbillable.** The hook catches and logs its own failure; such a consultation appears in no picker and cannot be billed by either path. Needs `GET /billing/consultations/unbilled` or a retry. Failure rate is unmeasured — the catch increments no counter. | 06-21 (item 18) |
| B3 | **D-39 combined multi-invoice payment link.** Groundwork only: `paymentGroupId` populated, `invoiceIds: string[]` accepted, unique constraint relaxed. The endpoint, per-invoice allocation and webhook fan-out are unbuilt. **RESOLVED after this gate ran (06-19d):** the fan-out was in fact already built by 06-10, and 06-19d added the missing creation path — `POST /billing/payment-links`, covered by `combined-payment-link.test.ts`. Only the invoice-picker UI remains; see `deferred-items.md` item 14. | 06-09 (item 14) |
| B4 | **`voidInvoice` does not cancel the link at Razorpay.** Local `payments` rows are marked cancelled and `cancelledPaymentLinkIds` is returned, but nothing calls the gateway — a voided invoice's link is dead locally and still live at Razorpay. | 06-07 (item 10) |
| B5 | **Quick Sale discounts.** `allocateInvoiceDiscount` is called with a hard zero; wiring a discount field into `quickSaleSchema` is a one-line change. | 06-13 |

### C. Platform and correctness

| # | Item | Source |
|---|------|--------|
| C1 | **Two different FIFO orderings for the same batch table.** Phase 5's `FifoDispenseService` uses `received_at ASC`; Phase 6's `StockValidatorService` uses `expiry_date ASC NULLS LAST, received_at ASC`. They diverge when an older receipt has a later expiry. Recommend FEFO everywhere. | 06-07 (item 9) |
| C2 | **`prisma db push` silently drops the four pg_trgm GIN indexes** created by `post-migrate.sql`, and the *next* `db push` then reports "already in sync". Observed while building this gate: index count went 4 → 0. Either model the indexes in `schema.prisma` or document that `db push` must never touch a provisioned database. `INV-TRGM` now catches the aftermath. | **This plan (new)** |
| C3 | **`prisma/seed.ts` does not load `.env`.** `pnpm db:seed` fails on a fresh checkout with `Environment variable not found: DATABASE_URL`. One-line fix. Until then a new worktree shows 25 red permission tests unrelated to any change. | 06-02 (item 2), 06-06 (item 8) |
| C4 | **`apps/mobile` typecheck: 61 pre-existing errors**, none in Phase 6 billing code. ~40 in `packages/ui` (a single Typography `children` prop fix likely clears the group), 2 absent modules (`expo-image-manipulator`, `expo-speech-recognition` — *installs*, so out of scope for an executor by rule), plus Phase 3/4 screens and two `.js`-extension imports. | 06-04, 06-18, 06-23 |
| C5 | **1 Phase 6 mobile typecheck error**, now the enforced baseline: `pdf-deps.test.ts(74,39) TS1470` — `import.meta` in a file NodeNext treats as CJS because `apps/mobile/package.json` has no `"type": "module"`. Test-file only; passes at runtime under Vitest. | **This plan (new)** |
| C6 | **Intermittent `invoice-lock.test.ts` failure** — the "rejects a void that asks not to restore stock" case failed once in four full-suite runs during 06-12, passes in isolation. Suspected shared-database teardown overlap. Not observed in this plan's runs. | 06-12 (item 16) |
| C7 | **`tests/inventory/` is entirely `it.todo`** — 80 placeholder tests across nine files. Phase 5 shipped the module with unit tests over mocked Prisma and no HTTP coverage. FIFO ordering, expiry blocking, batch override and offline replay are unexercised against a real database. | 06-20 (item 4) |
| C8 | **`markPaidBodySchema` is not in `@breeyo/validators`**, so the client cannot parse before sending — the one exception among seven money-state writes. | 06-17 |
| C9 | **No RN test harness.** Mobile tests assert extracted logic, never rendered output. Flagged Rule 4 repeatedly. | 06-14, 06-15, 06-23 |
| C10 | **No demo-data seeder.** `prisma/seed.ts` seeds RBAC reference data only; there is no way to produce the clinic/pets/stock fixture the device checkpoint needs. **Now gates the UAT run** — the human needs this fixture (or manual entry through the app) before any of the eight flows. | **This plan (new)** — **TRACKED** as a prerequisite in `06-19-HUMAN-UAT.md` |
| C11 | **Policy-count assertion missing from CI.** Any new clinic-scoped table must add four policies to `post-migrate.sql` §7; only schema reproducibility is gated. `INV-RLS` now covers the ten billing tables specifically, but not the general case. | 06-00 |
| C12 | **Best-effort logging via `console.error`** in two `EmrService` side effects (the D-28 dosage-override audit and the D-03 draft hook); should move to the Fastify logger. | 06-13 |

### D. Product and configuration

| # | Item | Source |
|---|------|--------|
| D1 | **`savePdf` "Download" is not user-visible.** Writes to `FileSystem.documentDirectory` — the app container. Not in the iOS Files app (needs `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in `app.json`, with an App Store review implication) and not in the Android file browser. Routing through the share sheet was deliberately rejected: it would make Download identical to Share, the exact conflation D-16 exists to end. Shared/external storage was rejected outright — these PDFs carry owner PII and clinic financials (T-06-97). | 06-15 |
| D2 | **`Print.printAsync` never exercised against a printer.** No device, real or simulated, at any point in the phase. Thermal-roll and A4 rendering unverified. | 06-15, §5 flow 6 |
| D3 | **Billing dashboard gear affordance is an in-screen top-right row**, not a native header action, because `(app)/(tabs)/_layout.tsx` sets `headerShown: false`. Placement wants a human eye. | 06-23 |
| D4 | **`expo-clipboard`** would replace the share-sheet copy on the webhook URL with a true one-tap clipboard write. | 06-23 |
| D5 | **06-UI-SPEC.md is stale in three places**: the `rzp_live_...` placeholder (unsatisfiable), the `18` GST rate placeholder (forbidden by 06-23), and the GST rate field being a slab picker rather than a text input. | 06-23 |
| D6 | **Service-catalog search is `ILIKE`, not pg_trgm** — deliberate for a few-dozen-row table. Revisit past a few hundred rows. | 06-12 |
| D7 | **Rotate-then-refetch and Expo Router resolving `/billing/settings` alongside `/billing`** need a running app to verify. | 06-23 |

### E. Closed during the phase (recorded so they are not re-litigated)

| # | Item | Resolution |
|---|------|-----------|
| E1 | `createTenantClient` interactive transactions were not atomic — two concurrent finalizes both returned 200 and `current_qty` reached **-1** | **RESOLVED** by hotfix 06-00b. `$transaction` is now overridden so one real transaction is opened and `FOR UPDATE` holds to commit. |
| E2 | Percentage discounts were applied **100× too small** (`/10_000` instead of `/100`) — 10% off ₹5,000 gave ₹5 | **RESOLVED** by hotfix 06-07b. No test had ever exercised a percent discount, which is why it shipped. |
| E3 | `inventory` module still on the admin client | **RESOLVED** in 06-20 — folded into scope, so no allowlist entry was needed. |
| E4 | `seed.ts` could not revoke a permission | **FIXED** in 06-08. Existing environments still need a `perms:*` Redis flush plus a reseed. |
| E5 | `BILLING_ROUTES` pointed into `(tabs)/billing/`, a directory that cannot exist | **CORRECTED** in 06-21; invoice detail landed at `app/(app)/billing/[invoiceId].tsx` in 06-22. |
| E6 | D-26's "Return dispensed items to stock?" checkbox vs. D-34's automatic restoration | **CLOSED** in 06-22 — checkbox removed, single confirm, `restoreStock` narrowed to literal `true`. |
| E7 | `apps/api` `test` script was watch mode; `buildTestApp` never listened, causing ECONNRESET under concurrency | **FIXED in this plan** (`460c6cc`). Closes deferred item 7. |
| E8 | supertest vs. `app.inject` | **SETTLED** in 06-08 — supertest works cleanly against `buildTestApp()`; all integration tests use `request(app.server)`. |
| E9 | Was a Phase 4 index added in 06-12? | **YES** — `20260814100000_add_consultation_finalized_at_index` on `consultations (clinic_id, status, finalized_at)`, hand-written because `migrate dev` reads the pg_trgm indexes as drift. |
| E10 | Receipt numbering mechanism | **REUSED** the existing counter-row allocator; `docType` widened to `'INV' \| 'CN' \| 'RCT'` with no migration. Format `RCT-YYYYMM-XXXX`. |
| E11 | `buildProductLineStockPlan` predicate | **RECORDED** verbatim: `lineItems.filter(l => l.inventoryItemId != null && l.stockMovementId == null)`. Any new path creating a product line **must** set `stockMovementId` when stock has already moved, or finalize double-decrements silently. `reserveAndDeduct` throws `STOCK_PLAN_CONTRACT_VIOLATION` as defence in depth. |

---

## 8. Phase close-out status

| Success criterion (plan 06-19) | Status |
|---|---|
| Every Phase 6 requirement maps to a named passing test in one gate script | **MET** — 9/9 PASS |
| Every phase-wide invariant is gated, and the gate is proven capable of failing | **MET** — 14 invariant gates; positive and negative controls in §4 |
| Schema, migrations and the live database are in sync | **MET** — `INV-SYNC` + `INV-TRGM` |
| A human has driven all eight core flows and recorded each outcome | **TRACKED, NOT MET** — decoupled 2026-08-14; the human will run them and report back. Persisted as `06-19-HUMAN-UAT.md`, `status: partial`, 0/8 recorded. |
| A real test-mode Razorpay payment updated an invoice from the webhook with no app interaction | **TRACKED, NOT MET** — deferred 2026-08-14. No credentials in any environment; **A2**, pre-Beta. |
| The GST treatment is confirmed against real clinic practice and the Razorpay onboarding gap has an owner | **PARTIALLY MET** — the Razorpay gap is now quantified (0/20 KYC) and has two named pre-launch items, **PL-1** and **PL-2**. The GST treatment is **partly** confirmed: **A1** (legacy SAC) was resolved and implemented 2026-08-14; **A4** and **A5** remain open. |

### Verification verdict

**Automated verification: COMPLETE.** The gate is green end to end, proven able
to fail, and wired into CI. Every requirement has a named passing test; every
phase-wide invariant is asserted; schema, migrations and database agree.

**Human-dependent verification: TRACKED, NOT COMPLETE.** Per the 2026-08-14
decision these no longer hold the phase open. Three things are outstanding and
each has a destination rather than an owner:

1. **Eight device flows** — `06-19-HUMAN-UAT.md`, `status: partial`, 0/8. Will
   surface in UAT checks until run.
2. **Live Razorpay payment → webhook → status update** — **A2**, pre-Beta,
   blocked on credentials that do not exist yet.
3. **GST treatment against real clinic practice** — **A4** (disputed Lab Test)
   and **A5** (is any pilot clinic registered). Open decisions, not code
   defects: the shipped behaviour is internally consistent and matches the
   research findings. **A1** (legacy SAC) was the third of these and is now
   **resolved** — decided and implemented 2026-08-14, §7.1.

Plus two pre-launch items: **PL-1** (0/20 clinics KYC-complete) and **PL-2**
(onboarding runbook does not exist, explicitly required before launch).

**On this basis the plan is complete and the phase's build is verified.** What
remains is real, recorded and will resurface — it is not silently dropped, and
none of it is a defect in shipped code.
