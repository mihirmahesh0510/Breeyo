---
phase: 06-invoicing-payments
plan: "12"
subsystem: billing
tags: [dashboard, service-catalog, settings, gst, razorpay, rpt-01, d-02, d-24, d-29, d-33]
requires:
  - "06-03 (Invoice, Payment, ServiceCatalog, Clinic D-29 columns and their indexes)"
  - "06-04 (BillingDashboardSummary, ClinicBillingSettings, billingSettingsSchema, gst.ts constants)"
  - "06-06 (lib/crypto.ts encryptSecret, lib/billing-audit-log.ts)"
  - "06-09 (razorpay.client.ts invalidateRazorpayCache, getRazorpayForClinic)"
  - "06-11 (billing.routes.ts factory and preHandler conventions)"
  - "Phase 3 (QueueRepository.getTodayIST)"
  - "Phase 4 (Consultation.status/finalizedAt, service-catalog-seed.ts)"
provides:
  - "DashboardService — D-24's four cards plus RPT-01 patients-seen-today in two aggregates"
  - "ServiceCatalogService — D-02 preset and custom CRUD with search, soft deactivation and a preset-rename guard"
  - "BillingSettingsService — D-29 read/write with AES-256-GCM credentials and presence-only reads"
  - "Ten HTTP routes; a fourth permission gate (MANAGE_CLINIC_SETTINGS) on the three settings routes"
  - "billingExceptionCount on the dashboard, making D-35/D-36 flags discoverable"
affects:
  - "06-21/06-23 (mobile Billing dashboard and Billing Settings screens consume these routes)"
  - "future exceptions list plan (dashboard count is the entry point; list endpoint deferred)"
tech-stack:
  added: []
  patterns:
    - "Cross join of two single-row sub-selects instead of a row-level LEFT JOIN, to aggregate two tables in one round trip without fan-out"
    - "Parameterised IST midnight passed into raw SQL, never a server-timezone date truncation"
    - "Presence-only credential reads: the decrypt path is structurally unreachable from the settings service"
    - "Update objects built from the keys the client actually sent, so a partial save cannot write schema defaults over untouched columns"
key-files:
  created:
    - apps/api/src/modules/billing/dashboard.service.ts
    - apps/api/src/modules/billing/dashboard.controller.ts
    - apps/api/src/modules/billing/service-catalog.service.ts
    - apps/api/src/modules/billing/service-catalog.controller.ts
    - apps/api/src/modules/billing/settings.service.ts
    - apps/api/src/modules/billing/settings.controller.ts
    - apps/api/tests/billing/dashboard.test.ts
    - apps/api/tests/billing/service-catalog.test.ts
    - apps/api/tests/billing/settings.test.ts
    - apps/api/prisma/migrations/20260814100000_add_consultation_finalized_at_index/migration.sql
  modified:
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/src/modules/billing/billing.schema.ts
    - apps/api/prisma/schema.prisma
    - apps/api/tests/helpers/factories.ts
    - packages/types/src/billing.ts
    - packages/validators/src/billing.ts
    - packages/validators/src/__tests__/billing.test.ts
    - .env.example
decisions:
  - "06-RESEARCH Pattern 6's invoices LEFT JOIN payments was rejected: it double-counts balance_paise once per payment, so a D-10 split payment would triple the Unpaid Total card. Replaced with a cross join of two single-row sub-selects — still one round trip, cannot fan out"
  - "Catalog search is ILIKE, not pg_trgm: a catalog is a few dozen rows, where a trigram index is pure write overhead"
  - "serviceCatalogSchema now validates gstRateOverride against the live GST 2.0 slabs; its previous min(0).max(100) accepted the retired 12 and 28"
  - "Decimal columns are mapped to number at the service boundary — Prisma serialises Decimal as a JSON string, which silently defeats the Finding G1 exempt check (rate === 0)"
  - "PUT /billing/settings merges only the keys the client sent, extending the plan's absent-means-unchanged rule from the two secrets to every field"
  - "Webhook token rotation is its own endpoint, not a flag on save: it stops payment confirmations until the Admin re-pastes the URL"
  - "Legacy SAC codes left untouched, applying 06-04's recorded decision exactly"
  - "billingExceptionCount added to the dashboard so D-35/D-36 flags are discoverable; the exceptions list itself is deferred"
metrics:
  duration: ~95 min
  tasks: 3
  commits: 6
  files_created: 10
  files_modified: 8
  tests_added: 44
  completed: 2026-08-14
---

# Phase 6 Plan 12: Dashboard, Service Catalog and Billing Settings Summary

Completes the billing API with the D-24/RPT-01 dashboard aggregate, D-02 service catalog CRUD, and D-29 billing settings holding AES-256-GCM-encrypted per-clinic Razorpay credentials behind an Admin-only gate.

## What was built

| Area | Surface |
|------|---------|
| Dashboard | `GET /billing/dashboard` — five metrics plus an exception count, two aggregates |
| Service catalog | `GET/POST /billing/services`, `GET /billing/services/search`, `GET/PATCH /billing/services/:serviceId`, `POST /billing/services/:serviceId/deactivate` |
| Settings | `GET/PUT /billing/settings`, `POST /billing/settings/webhook-token/rotate` |

Ten routes, three services, three controllers, 44 integration tests.

## Answers to the questions the plan's `<output>` block asked

### 1. Did the `consultations (clinic_id, status, finalized_at)` index have to be added?

**Yes.** `schema.prisma` had `@@index([clinicId, status])` on the Phase 4 `Consultation` model, which stops one column short of RPT-01's predicate and would leave `finalized_at >= <IST midnight>` to a filter over every consultation the clinic has ever finalized — a set that only grows.

Migration name: **`20260814100000_add_consultation_finalized_at_index`**.

This touched a **Phase 4 model**. The other five indexes the dashboard relies on were all already present from plan 06-03 and needed no change:

| Index | Status |
|---|---|
| `invoices (clinic_id, status)` | present |
| `invoices (clinic_id, created_at)` | present |
| `invoices (clinic_id, due_date)` | present |
| `invoices (clinic_id, exception_flag)` | present |
| `payments (invoice_id, paid_at)` | present |
| `payments (clinic_id, status, expires_at)` | present — serves the `(clinic_id, status)` prefix the revenue query needs |
| `consultations (clinic_id, status, finalized_at)` | **added by this plan** |

Prisma's `migrate dev` could not generate this migration: `post-migrate.sql` adds pg_trgm GIN indexes that are deliberately not modelled in `schema.prisma`, so `migrate dev` reads them as drift and demands a reset. This is the same reason CI runs the reproducibility gate *before* `post-migrate.sql`. The migration was therefore hand-written and then verified the way CI verifies it: a clean database, `prisma migrate deploy`, then `prisma migrate diff --from-schema-datasource --to-schema-datamodel --exit-code`, which reported **"No difference detected"** and exit 0.

### 2. Which search implementation, and why?

**`ILIKE '%term%'` via Prisma's `contains` with `mode: 'insensitive'` — not pg_trgm.**

The plan offered pg_trgm as the default and asked for the choice to be recorded. `patient.repository.ts` uses trigram similarity because a clinic has thousands of patients and staff mistype owner names. A service catalog is 20 seeded presets plus a handful of custom entries — a few dozen rows, where a sequential scan beats an index probe and a trigram index is pure write overhead on a table that is written more often than searched. No trigram index was added and no migration was needed. Revisit only if a real clinic's catalog passes a few hundred rows; the note is in the `service-catalog.service.ts` header so the next reader does not have to re-derive it.

### 3. What was applied to the legacy SAC codes?

**Nothing. `service-catalog-seed.ts` is byte-identical** (`git diff --stat` on that path is empty across all six commits).

06-04's summary recorded a decision *not* to migrate: the seed's rates are already correct (`gstRateOverride: 0` for clinical, `18` for grooming), the tax computation reads the rate and `taxTreatment` rather than the SAC string, so no invoice is mis-taxed today; a blanket `UPDATE` could not distinguish a seeded default from a code an accountant deliberately set; and HSN/SAC reporting is legally optional for the pilot cohort. The codes are recorded as `VETERINARY_SAC_LEGACY` alongside `VETERINARY_SAC = '998351'`.

06-04's open recommendation stands and is restated here: change the seed constant to `998351` for *new* clinics and offer existing clinics an opt-in "update SAC codes" action in billing settings, rather than a silent migration. This plan built the billing-settings surface such an action would live on, but did not add it — it is not in this plan's scope.

### 4. Every `*Enc` occurrence in `settings.service.ts`, with line numbers

`grep -c 'decryptSecret'` on this file returns **0**, and the phase-level `grep -rn 'decryptSecret' apps/api/src/modules/billing/` returns only `razorpay.client.ts` and `webhook.service.ts`, as the plan's verification block requires.

The nine `*Enc` occurrences:

| Line | Occurrence | Role |
|------|-----------|------|
| 96 | `razorpayKeySecretEnc: true` | `SETTINGS_SELECT` — selected **only** to feed the presence test at line 175 |
| 97 | `razorpayWebhookSecretEnc: true` | `SETTINGS_SELECT` — same, feeds lines 176 and 191 |
| 112 | `razorpayKeySecretEnc: string \| null` | `SettingsRow` type declaration |
| 113 | `razorpayWebhookSecretEnc: string \| null` | `SettingsRow` type declaration |
| 175 | `hasRazorpayKeySecret: row.razorpayKeySecretEnc !== null` | **presence check** |
| 176 | `hasRazorpayWebhookSecret: row.razorpayWebhookSecretEnc !== null` | **presence check** |
| 191 | `webhookConfigured: token !== null && row.razorpayWebhookSecretEnc !== null` | **presence check** |
| 261 | `data.razorpayKeySecretEnc = encryptSecret(input.razorpayKeySecret!)` | **encrypt assignment** |
| 267 | `data.razorpayWebhookSecretEnc = encryptSecret(input.razorpayWebhookSecret!)` | **encrypt assignment** |

Five presence-or-encrypt uses exactly as the plan specified. The four extra occurrences are the narrow `select` and the row type that the select requires — the plan's criterion did not anticipate them. They are strictly narrowing: a `findUnique` with no `select` would pull both ciphertexts into a variable anyway, and naming them explicitly is what makes the "these two columns and nothing derived from them" contract auditable. No occurrence carries a ciphertext value anywhere beyond a `!== null` test.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] 06-RESEARCH Pattern 6's dashboard SQL double-counts the Unpaid Total**

- **Found during:** Task 1
- **Issue:** The plan directs the implementation to use Pattern 6's `FROM invoices i LEFT JOIN payments p` with `FILTER` clauses. That join emits one row per payment, so `SUM(i.balance_paise)` adds an invoice's balance once for **every** payment against it. D-10 split payments are the normal case in this product, so a two-leg invoice reports double its outstanding balance on the Unpaid Total card, and the error scales with how many payments a clinic collects.
- **Fix:** Replaced with a cross join of two guaranteed-single-row sub-selects, one over `invoices` and one over `payments`. Still one round trip, and structurally incapable of fanning out. A regression test (`does not multiply the unpaid total by the number of payments on an invoice`) seeds three captured payments against one invoice and pins the balance.
- **Files:** `apps/api/src/modules/billing/dashboard.service.ts`
- **Commit:** `0d74bf8`

**2. [Rule 1 — Bug] `serviceCatalogSchema` accepted GST slabs retired by GST 2.0**

- **Found during:** Task 2
- **Issue:** `gstRateOverride: z.number().min(0).max(100)` accepts 12 and 28, the two slabs retired on 22 September 2025. `invoice_line_items.gst_rate_percent` freezes the applied rate onto the finalized document permanently (Finding G2), so a catalog row saved at a non-existent rate produces a wrong tax charge on every invoice that uses it, forever.
- **Fix:** `serviceCatalogSchema.gstRateOverride` now uses the existing `gstRateSlabSchema`, which validates against `GST_RATE_SLABS`. The slab schema was moved to the top of the file so it is declared before its first use. `serviceCatalogSchema` had no consumers before this plan, so nothing else was affected.
- **Files:** `packages/validators/src/billing.ts`
- **Commit:** `38ad86c`

**3. [Rule 1 — Bug] `Decimal` columns reach the wire as JSON strings, defeating the Finding G1 exempt check**

- **Found during:** Task 2 (caught by a test asserting a stored rate of `0` round-trips)
- **Issue:** `ServiceCatalog.gstRateOverride` and `Clinic.defaultGstRate` are `Decimal(5,2)`. Prisma's `Decimal.toJSON` emits a **string**, so an unmapped row puts `"0"` on the wire where `@breeyo/types` promises `number | null`. Nothing type-checks the Prisma row against the shared interface, so the mismatch is invisible to the compiler — and `rate === 0` is false for `"0"`, meaning the exempt branch that Finding G1 depends on (veterinary healthcare is exempt by law) would never be taken for any catalog service.
- **Fix:** A `toServiceCatalog` mapper in `service-catalog.service.ts` and the equivalent conversion in `settings.service.ts`, both converting via `Number(...)` so a malformed value becomes `NaN` loudly rather than being silently truncated by `parseFloat`. Every service method returns the mapped shape; the raw row is reachable only through a private method.
- **Files:** `apps/api/src/modules/billing/service-catalog.service.ts`, `apps/api/src/modules/billing/settings.service.ts`
- **Commits:** `38ad86c`, `b89a425`

**4. [Rule 2 — Missing critical functionality] A partial settings save would write schema defaults over untouched columns**

- **Found during:** Task 3
- **Issue:** The plan mandates absent-means-unchanged for the two secrets only. But `billingSettingsSchema` carries `.default()` on `gstEnabled`, `defaultDueDays` and `razorpayTestMode`, so the *parsed* object cannot distinguish "the Admin turned GST off" from "the field was absent, so Zod supplied `false`". A save touching only `invoiceFooterText` would therefore switch GST off for a registered clinic and reset its due-date default — a compliance-relevant silent change, and the same class of bug as T-06-79 which the plan already guards for secrets.
- **Fix:** The update object is built from the keys present on the **raw** request body, extending absent-means-unchanged to every field. Validation still runs over the full parsed object, so the cross-field rules (GST needs a GSTIN; state code must match the GSTIN) are untouched.
- **Files:** `apps/api/src/modules/billing/settings.service.ts`, `apps/api/src/modules/billing/settings.controller.ts`
- **Commit:** `b89a425`

**5. [Rule 2 — Missing critical functionality] D-35/D-36 exception flags had no reader anywhere in the product**

- **Found during:** Task 1
- **Issue:** 06-10's webhook worker sets `Invoice.exceptionFlag`, and a flagged invoice blocks every further status-changing action on itself. Nothing read the column. The symptom for staff is that an invoice stops responding to actions with no visible reason, and no screen or endpoint could tell them why.
- **Fix:** `billingExceptionCount` added to `BillingDashboardSummary` and computed in the existing invoices sub-select (no extra round trip), filtered on `exception_flag IS NOT NULL AND exception_resolved_at IS NULL`. Documented on the type as a banner-when-non-zero rather than a sixth card, so D-24's four and D-33's fifth remain the cards.
- **Files:** `packages/types/src/billing.ts`, `apps/api/src/modules/billing/dashboard.service.ts`
- **Commit:** `0d74bf8`
- **Scope note:** the exceptions *list* endpoint and resolve action are **deferred** — logged as item 15 in `deferred-items.md`. This plan closed discoverability only.

**6. [Rule 3 — Blocking] Grep gates tripping on their own documentation**

- **Found during:** Tasks 1 and 3
- **Issue:** The plan's gates require `CURRENT_DATE`, `::date` and `findMany` to appear zero times in `dashboard.service.ts`, and `decryptSecret` zero times in `settings.service.ts`. The comments explaining *why* those constructs are forbidden named them, so the gates failed on the prose. `scripts/check-tenant-client.sh` documents this exact hazard: "a gate that trips on its own documentation is worse than no gate."
- **Fix:** Reworded the comments to describe the anti-patterns without writing the literal tokens, with an explicit note in each file saying that is why. All gates now pass, and the explanations survive.
- **Files:** `apps/api/src/modules/billing/dashboard.service.ts`, `apps/api/src/modules/billing/settings.service.ts`
- **Commits:** `0d74bf8`, `b89a425`

**7. [Rule 3 — Blocking] Test factory could not place a consultation's `finalizedAt`**

- **Found during:** Task 1
- **Issue:** `createTestConsultation` had no `finalizedAt` override, so the IST-boundary assertions for RPT-01 could not be written at all.
- **Fix:** Added the override, defaulting to `null` to match the factory's existing `draft` status default — a draft consultation must not carry a timestamp claiming it was finalized.
- **Files:** `apps/api/tests/helpers/factories.ts`
- **Commit:** `99f8dcd`

**8. [Rule 3 — Blocking] `billingSettingsResponseSchema` fixture predated the two new response fields**

- **Found during:** Task 3 verification
- **Issue:** Extending the response schema with `webhookUrl` and `webhookConfigured` made an existing validators test fixture incomplete, so its parse failed.
- **Fix:** Added the two fields to the fixture. The test's intent — that the schema strips leaked secret keys — is unchanged and still asserted.
- **Files:** `packages/validators/src/__tests__/billing.test.ts`
- **Commit:** `b89a425`

### Deliberate departures from the plan text

**A. Routes were registered in the task that needed them, not all in Task 3.**
The plan puts the full ten-route table in Task 3, but Tasks 1 and 2 are HTTP integration tests that cannot pass without their routes. The dashboard route landed in Task 1 and the six catalog routes in Task 2, so each task's commit is independently green. The final route table is exactly as specified.

**B. Route count is 31, not the 32 the acceptance criterion states.**
The criterion says "twenty-two from plan 06-11 plus ten here". `billing.routes.ts` at the start of this plan had **21** matches for `fastify.(get|post|put|patch)(`, not 22 — verified on the pre-plan tree. 21 + 10 = 31. All ten new routes are present, and `preHandler: settingsHandler` appears on exactly three of them as required. The off-by-one is in the plan's stated baseline, not in the delivered work.

**C. `PUBLIC_API_URL` was added to the root `.env.example`, not `apps/api/.env.example`.**
The plan names `apps/api/.env.example`. No such file exists in this repository — the single env template is at the repo root, and `BILLING_ENCRYPTION_KEY` from plan 06-06 lives there. The variable was added there, next to `API_URL`, documenting that it must be the address **Razorpay** can reach (a tunnel in local development, not `localhost`).

`publicApiBase()` falls back to `API_URL` and then to `null`. A null base yields `webhookUrl: null` rather than the string `"undefined/api/v1/webhooks/..."` — a plausible-looking wrong URL pasted into a Razorpay dashboard fails silently at delivery time, whereas a missing one is visible on the settings screen immediately.

## Carry-forward context that was acted on

- **T-06-54 (secret-only rotation):** `updateSettings` and `rotateWebhookToken` both call `invalidateRazorpayCache(clinicId)` on **any** credential change, not only a key-id change. The test `invalidates the cached Razorpay SDK instance when only the secret rotates` populates the module-level cache through `getRazorpayForClinic`, rotates only the secret through the API, and asserts the next lookup returns a different instance. Without the eviction the key-id fingerprint matches and the stale instance is returned — the test fails, which is what makes it worth having.
- **Webhook token exposure:** `razorpayWebhookToken` is returned only from the three routes behind `MANAGE_CLINIC_SETTINGS` (Admin-only in `prisma/seed.ts`), and is never logged. Two tests pin it: Front Desk and Clinician get 403 on read and write, and a second clinic's Admin reading their own settings sees `null` and a body that does not contain clinic A's token anywhere.
- **D-33:** `patientsSeenToday` ships alongside D-24's four, as `COUNT(DISTINCT pet_id)` over `status = 'finalized'` consultations with `finalized_at >= <IST midnight>`. The finalized literal was read from `emr.repository.ts` rather than assumed — it is lower-case `'finalized'` on a bare `String` column, so `'FINALIZED'` would have compiled and returned zero every day.
- **D-36:** acted on as deviation 5 above; list endpoint deferred as item 15.

## Verification

| Gate | Result |
|---|---|
| `vitest run` (full `@breeyo/api`) | **971 passed**, 80 todo, 9 files skipped, 0 failed |
| `tests/billing/dashboard.test.ts` | 12 passed (plan required ≥8) |
| `tests/billing/service-catalog.test.ts` | 15 passed (plan required ≥9) |
| `tests/billing/settings.test.ts` | 17 passed (plan required ≥10) |
| `@breeyo/validators` tests | 142 passed |
| `@breeyo/types` tests | 52 passed |
| `pnpm --filter @breeyo/api exec tsc --noEmit` | exit 0 |
| `pnpm build` (whole monorepo) | 5/5 successful |
| `bash scripts/check-tenant-client.sh` | passed, 31 files scanned |
| `grep -rn 'CURRENT_DATE' apps/api/src/modules/billing/` | no output |
| `grep -rln 'decryptSecret' apps/api/src/modules/billing/` | only `razorpay.client.ts`, `webhook.service.ts` |
| `prisma migrate diff --from-schema-datasource --to-schema-datamodel --exit-code` | "No difference detected", exit 0 |
| `git diff --stat` on `service-catalog-seed.ts` | empty (unchanged, per 06-04) |

### Grep gates

| Gate | Required | Actual |
|---|---|---|
| `getTodayIST` in `dashboard.service.ts` | ≥1 | 2 |
| `CURRENT_DATE\|::date` in `dashboard.service.ts` | 0 | 0 |
| `COUNT(DISTINCT` in `dashboard.service.ts` | ≥1 | 4 |
| `patientsSeenToday` in `dashboard.service.ts` | ≥1 | 1 |
| `$queryRaw` in `dashboard.service.ts` | exactly 2 | 2 |
| `findMany` in `dashboard.service.ts` | 0 | 0 |
| `COALESCE` in `dashboard.service.ts` | ≥3 | 6 |
| `clinic_id = ${` in `dashboard.service.ts` | ≥2 | 4 |
| `serviceCatalog.delete\|deleteMany` | 0 | 0 |
| `CANNOT_MODIFY_PRESET` | ≥1 | 1 |
| `isActive: false` in catalog service | ≥1 | 2 |
| `decryptSecret` in `settings.service.ts` | 0 | 0 |
| `invalidateRazorpayCache` in `settings.service.ts` | ≥1 | 4 |
| `webhookConfigured` in `settings.service.ts` | ≥1 | 1 |
| `requirePermission('MANAGE_CLINIC_SETTINGS')` in routes | 1 | 1 |
| `preHandler: settingsHandler` | 3 | 3 |
| total routes in `billing.routes.ts` | 32 (see departure B) | 31 |

## Environment note for the next agent in this worktree

The worktree had no `node_modules` and no `apps/api/.env`. Both were provisioned locally and neither is committed (`.env` is gitignored). The local dev database `breeyo` was in a divergent migration state carrying a migration from another branch, so it was **left untouched**; two throwaway databases were created on the same container instead:

- `breeyo_p6w10` — the suite database this plan's `apps/api/.env` points at (migrated, RLS applied, seeded).
- `breeyo_repro_p6w10` — a clean database used once for the schema-reproducibility gate; safe to drop.

Note also that `apps/api`'s `test` script is bare `vitest`, which is watch mode on a TTY. Use `pnpm --filter @breeyo/api exec vitest run` locally; the plan's `pnpm --filter @breeyo/api test -- <file>` form hangs.

## Known Stubs

None. Every field returned by the three services is computed from persisted data; no placeholder, hardcoded empty value, or unwired data source was introduced.

## Threat Flags

None. The surfaces added here are all covered by the plan's existing register (T-06-75 through T-06-83). The one new capability — `POST /billing/settings/webhook-token/rotate` — sits behind the same `MANAGE_CLINIC_SETTINGS` gate as the other two settings routes and is covered by T-06-77 and T-06-80.

## Deferred Items

Logged to `deferred-items.md`:

- **Item 15** — billing exceptions list endpoint, resolve action, and mobile banner. `BillingExceptionListItem` is defined in `@breeyo/types` and unused; `exception_resolved_at` / `_by_id` / `_notes` exist and nothing writes them, so a flagged invoice cannot currently be un-flagged through the product.
- **Item 16** — an intermittent failure in the pre-existing `tests/billing/invoice-lock.test.ts` (one failure in four full-suite runs; passes in isolation). Not caused by this plan, which touches no void path; recorded so it is not rediscovered as a new regression.

## Self-Check: PASSED

- All 10 claimed created files exist on disk.
- All 6 claimed commit hashes exist in `git log`.
- The nine `*Enc` line numbers in the table above were re-read from the final committed file and match exactly.
- `service-catalog-seed.ts` confirmed unchanged across all six commits.
