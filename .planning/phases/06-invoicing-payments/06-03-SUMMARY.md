---
phase: 06-invoicing-payments
plan: "03"
subsystem: billing-persistence
tags: [prisma, postgres, rls, gst, schema, migration]
requires:
  - "06-00 tenant-scoped Prisma client (createTenantClient) and the post-migrate.sql RLS convention"
  - "Phase 5 inventory tables (inventory_items, stock_batches, stock_movements)"
  - "Phase 4 ServiceCatalog, Consultation, Prescription"
provides:
  - "Ten billing tables with integer-paise money and ENABLE + FORCE RLS"
  - "D-29 clinic billing settings including ciphertext-only Razorpay credential columns"
  - "invoices_one_draft_per_consultation partial unique index (D-03 idempotency)"
  - "webhook_events.event_id UNIQUE (BIL-06 idempotency)"
  - "Billing test factories and a database-shape test"
affects:
  - "06-05 toPaise() boundary adapter writes into these columns"
  - "06-06 crypto.ts populates razorpay_key_secret_enc / razorpay_webhook_secret_enc"
  - "06-07 finalize reads stock_movement_id as the deduct/skip discriminator"
  - "06-08 webhook handler resolves payments by (link id, invoice id)"
tech-stack:
  added: []
  patterns:
    - "Integer paise for all money (D-31); Decimal reserved for tax rates only"
    - "Frozen-at-finalize tax snapshot so historical invoices are re-derivable"
    - "Per-operation RLS policies keyed on app.clinic_id, ENABLE + FORCE"
    - "Append-only audit table enforced by omitted UPDATE/DELETE policies"
    - "Gap-free numbering via composite-PK counter + ON CONFLICT DO UPDATE, not a SEQUENCE"
key-files:
  created:
    - apps/api/prisma/migrations/20260814000000_add_billing_models/migration.sql
    - apps/api/tests/billing/schema-shape.test.ts
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/prisma/post-migrate.sql
    - apps/api/tests/helpers/factories.ts
decisions:
  - "Migration timestamp moved from the planned 20260812120000 to 20260814000000 so it sorts after Phase 5's 20260813* migrations, which its FKs depend on"
  - "InvoiceNumberCounter.period widened from Char(6) to VarChar(12) so D-38's April-1 financial-year reset key fits"
  - "Payment uniqueness is (razorpay_payment_link_id, invoice_id) rather than the link id alone, so D-39's combined multi-invoice link stays possible"
  - "balance_paise is deliberately left un-CHECKed so D-36 overpayment remains representable and detectable"
  - "Invoice -> pet/owner/consultation FKs are RESTRICT, not Prisma's default SET NULL, so a delete cannot silently sever a record of account"
metrics:
  duration: ~55 min
  completed: 2026-08-14
  tasks: 3
  commits: 4
---

# Phase 6 Plan 03: Billing Persistence Layer Summary

Ten RLS-forced billing tables with integer-paise money, a frozen-at-finalize GST snapshot, database-enforced draft and webhook idempotency, and ciphertext-only Razorpay credential columns.

## What Was Built

| Table | Purpose |
|-------|---------|
| `invoices` | Invoice header, GST snapshot, money totals, lifecycle + exception state |
| `invoice_line_items` | Per-line tax treatment, frozen rate, stock provenance |
| `payments` | Cash/UPI/card legs, Razorpay link state |
| `payment_receipts` | D-13 receipt documents |
| `refunds` | D-12/D-42 per-leg refunds |
| `credit_notes` / `credit_note_line_items` | D-19/D-22 credit notes |
| `invoice_number_counters` | Gap-free per-clinic numbering (composite PK, no `id`) |
| `webhook_events` | Razorpay inbox with `event_id` UNIQUE |
| `billing_audit_log` | Append-only financial audit trail (D-32) |

`clinics` gained the eleven D-29 billing-settings columns.

## Requested Recordings

**`StockMovement.id` type and FK match**

Shipped `StockMovement.id` is `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` — i.e. **UUID**, following `schema.prisma` convention, *not* the `@default(cuid())` that `05-01-PLAN.md` had specified (06-PATTERNS.md flagged this risk). `InvoiceLineItem.stockMovementId` is therefore declared `String? @map("stock_movement_id") @db.Uuid` and **matches**. All three Phase 5 models (`InventoryItem`, `StockBatch`, `StockMovement`) were verified present before any FK was written.

**Exact `npx prisma db push` output**

Run against a database built from `prisma migrate deploy` alone (before `post-migrate.sql`):

```
The database is already in sync with the Prisma schema.
```

> A second run of `db push` *after* `post-migrate.sql` prints "Your database is now in sync" instead, because it drops the pg_trgm GIN indexes that `post-migrate.sql` creates and `schema.prisma` deliberately does not model. This is the exact trap `.github/workflows/ci.yml` documents in its "Verify schema reproducibility" step, which is why CI runs that gate *before* `post-migrate.sql`. The order above is the meaningful one.

**Per-table policy counts**

```
        tablename        | policies
-------------------------+----------
 billing_audit_log       |        2
 credit_note_line_items  |        4
 credit_notes            |        4
 invoice_line_items      |        4
 invoice_number_counters |        4
 invoices                |        4
 payment_receipts        |        4
 payments                |        4
 refunds                 |        4
 webhook_events          |        3
(10 rows)
```

Matches the plan exactly: 8 tables × 4, `webhook_events` 3 (no DELETE), `billing_audit_log` 2 (append-only). `rowsecurity = false` count across the ten tables: **0**.

**Model count in `schema.prisma`**

Before: **34**. After: **44**. Delta exactly +10.

## Verification Evidence

| Gate | Result |
|------|--------|
| `prisma validate` | passes |
| `prisma format --check` | "All files are formatted correctly!" |
| 6 migrations applied from a genuinely empty database | all succeeded |
| `post-migrate.sql` applied with `ON_ERROR_STOP=1` | clean |
| `migrate diff --from-migrations --to-schema-datamodel --exit-code` | `No difference detected.` exit 0 |
| `%_paise` columns with a non-`integer` type | 0 rows (35 paise columns total) |
| `invoices_one_draft_per_consultation` | present, `WHERE ((status = 'DRAFT'::text) AND (consultation_id IS NOT NULL))` |
| CHECK constraints | `invoices_money_non_negative`, `payments_amount_positive`, `refunds_amount_positive` |
| All 10 Prisma client delegates | present |
| `tests/billing/schema-shape.test.ts` | 6 passed |
| Full API suite | 47 files passed, 9 skipped, **519 passed, 0 failed** |
| `tsc --noEmit` | clean |

## TDD Gate Compliance

Task 3 was marked `tdd="true"` and followed RED → GREEN:

- **RED** — `1a56160` `test(06-03): add failing database-shape tests…`. Run showed `4 failed | 2 passed`, failing with `TypeError: createTestInvoice is not a function`.
- **GREEN** — `10eaeeb` `feat(06-03): add billing test factories…`. Run showed `6 passed`.
- REFACTOR — not needed; no cleanup pass was warranted.

**Note on the two RED-phase passes.** The `information_schema` money-type test and the `pg_tables` RLS test passed during RED. This is not a fail-fast violation: those two assert DDL that Tasks 1 and 2 of this same plan had already created and committed. Task 3's deliverable was the factories and the test harness, never the tables, so the four factory-dependent cases are the ones whose RED state is meaningful — and all four failed as required.

## Deviations from Plan

### 1. [Rule 3 — Blocking] Migration timestamp moved to sort after Phase 5

- **Found during:** Task 2
- **Issue:** The plan mandated the directory `20260812120000_add_billing_models`. Prisma orders migrations lexicographically, and Phase 5 shipped `20260813000000_add_phase_5_inventory_management` and `20260813000001_add_stock_movement_reversal` *after* the plan was written. The billing migration adds FKs to `inventory_items` and `stock_movements`, so at `20260812120000` it ran first and died with `ERROR: relation "inventory_items" does not exist`, then poisoned the DB with a P3009 failed-migration record.
- **Fix:** Renamed to `20260814000000_add_billing_models`. Still a fixed, deterministic timestamp (the plan's stated goal), but correctly ordered.
- **Impact:** `must_haves.artifacts` names the old path. The artifact exists with identical content at the new path.
- **Commit:** `fef5883`

### 2. [Rule 2 — D-38] `InvoiceNumberCounter.period` widened to `VarChar(12)`

- **Issue:** The plan specified `@db.Char(6)` holding `YYYYMM`. D-38 (added to CONTEXT.md after this plan was written) amends D-15: the sequence must reset at the start of the Indian financial year (1 April), not every calendar month. A fixed `Char(6)` cannot hold an FY key like `2026-27` without blank-padding corrupting the `ON CONFLICT` conflict target.
- **Fix:** `period String @map("period") @db.VarChar(12)`, documented in a triple-slash doc comment as the *reset scope key* rather than a display field. The rendered document number keeps D-15's `INV-YYYYMM-XXXX` shape.
- **Commit:** `fe904e0`

### 3. [Rule 2 — D-35/D-36] Billing-exception columns added to `invoices`

- **Issue:** D-35 (payment lands on an already-voided invoice) and D-36 (overpayment) both require the invoice to be *flagged* and further status-changing actions *blocked* until staff resolve it. Nothing in the planned column set could record that.
- **Fix:** Added `exception_flag`, `exception_detected_at`, `exception_resolved_at`, `exception_resolved_by_id`, `exception_notes`, plus `@@index([clinicId, exceptionFlag])` for the exceptions-list query.
- **Related:** `balance_paise` was deliberately **excluded** from the CHECK constraint. Overpayment means the balance goes negative; a `balance_paise >= 0` constraint would have made D-36 unstorable, silently corrupting reconciliation instead of surfacing it. This is called out in a comment in the migration.
- **Commit:** `fe904e0` / `fef5883`

### 4. [Rule 2 — D-39] `Payment` uniqueness relaxed to a composite

- **Issue:** The plan specified `@@unique([razorpayPaymentLinkId])`. D-39 confirms D-27's combined multi-invoice payment link is **in scope for Phase 6** — one Razorpay link settling several of an owner's invoices. A bare unique on the link id makes that impossible to represent.
- **Fix:** `@@unique([razorpayPaymentLinkId, invoiceId])` — still guarantees at most one payment row per link-per-invoice (the property idempotency actually needs) while permitting one link to span invoices. Also added `payment_group_id` + index to group the legs of one combined link.
- **Not a weakening of T-06-09:** webhook idempotency is enforced by `webhook_events.event_id UNIQUE`, which is untouched.
- **Commit:** `fe904e0`

### 5. [Rule 1 — Bug] `lineType` was missing its `@map`

- **Found during:** Task 2, on reading the generated DDL
- **Issue:** `InvoiceLineItem.lineType` had no `@map("line_type")`, so Prisma generated a camelCase column `"lineType"` — the only such column in the entire schema, breaking the project's snake_case convention.
- **Fix:** Added `@map("line_type")` and regenerated the migration.
- **Commit:** `fef5883`

### 6. [Rule 2] Invoice → pet/owner/consultation FKs set to `RESTRICT`

- **Issue:** Prisma defaults optional relations to `ON DELETE SET NULL`. Deleting a pet would have silently severed its invoices from the patient, destroying audit context on records with a 6-year GST Section 36 retention obligation.
- **Fix:** Explicit `onDelete: Restrict`. This also supports D-47 ("blocked while outstanding, then delete or merge with history transferring") by forcing a merge to repoint the columns explicitly rather than losing the link.
- **Commit:** `fef5883`

### 7. [Rule 2] Referential integrity for catalog/stock links

- Added real FK relations for `serviceCatalogId`, `inventoryItemId`, `stockMovementId` (on `invoice_line_items`) and for `invoice_number_counters.clinic_id`. These place FK constraints only on the new Phase 6 tables — **no Phase 5 table DDL was modified**, per the plan's constraint. `stockMovementId` was left non-unique as planned, deliberately: a void creates reversal movements rather than freeing the original, so a unique constraint would lock out legitimate re-invoicing.
- **Commit:** `fe904e0` / `fef5883`

## Environment Notes (not code changes)

The shared local dev database `breeyo` had divergent migration history (a `20260812200629_add_phases_3_through_5` record present in the DB but absent from `prisma/migrations`, plus the two Phase 5 migrations unapplied). Rather than run `prisma migrate reset --force` against the user's dev data as the plan's verify block suggested, verification used a dedicated, disposable database `breeyo_p603` (plus `breeyo_p603_shadow` for `migrate diff`). This gave a *stronger* guarantee — every reproduction claim above was made against a genuinely empty database created moments earlier — and left the user's dev DB untouched. The worktree's `.env` points at `breeyo_p603`; `.env` is gitignored and was not committed (verified via `git check-ignore`).

## Known Stubs

None. This plan is pure persistence; every column, index, constraint and policy it declares exists in the database and is asserted by a test.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: idempotency-contract-change | `apps/api/prisma/schema.prisma` | `Payment` uniqueness is now `(razorpay_payment_link_id, invoice_id)` rather than the link id alone (deviation 4). A Razorpay link id no longer resolves to exactly one payment row. Plan 06-08's webhook handler must resolve by `(link id, invoice id)` or handle N rows — resolving by link id alone and expecting a single row will break on D-39 combined links. |

All seven threats in the plan's STRIDE register (T-06-06 … T-06-12) are mitigated and each has a corresponding passing assertion in `tests/billing/schema-shape.test.ts` or a verified `pg_policies` / `pg_constraint` query above.

## Self-Check: PASSED

Files verified present:
- `FOUND: apps/api/prisma/schema.prisma`
- `FOUND: apps/api/prisma/migrations/20260814000000_add_billing_models/migration.sql`
- `FOUND: apps/api/prisma/post-migrate.sql`
- `FOUND: apps/api/tests/billing/schema-shape.test.ts`
- `FOUND: apps/api/tests/helpers/factories.ts`

Commits verified present:
- `FOUND: fe904e0` feat(06-03): add ten Phase 6 billing models and D-29 clinic billing settings
- `FOUND: fef5883` feat(06-03): add billing migration, draft partial index and RLS policies
- `FOUND: 1a56160` test(06-03): add failing database-shape tests for the billing schema
- `FOUND: 10eaeeb` feat(06-03): add billing test factories and FK-safe cleanup

Note: the artifact declared at `apps/api/prisma/migrations/20260812120000_add_billing_models/migration.sql` exists at `.../20260814000000_add_billing_models/migration.sql` — see deviation 1.
