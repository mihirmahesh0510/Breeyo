---
phase: 06-invoicing-payments
plan: 19c
subsystem: billing
tags: [gst, sac, service-catalog, billing-settings, compliance, prisma, fastify, expo]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-04's service catalog seed and `VETERINARY_SAC` / `VETERINARY_SAC_LEGACY` constants; 06-23's Billing Settings screen, settings service and `MANAGE_CLINIC_SETTINGS` gate; 06-19's A1 finding"
provides:
  - "New clinics seed with SAC 998351 (Notification 12/2017-CT Entry 46) on all eighteen clinical presets"
  - "`VETERINARY_SAC_LEGACY_CORRECTABLE` — the 9993xx subset that may be rewritten, with 998612 deliberately excluded"
  - "`POST /api/v1/billing/settings/sac-codes/update` — Admin-only, explicit, idempotent SAC correction for already-seeded clinics"
  - "`ClinicBillingSettings.legacySacCodeCount` — a read-only count that drives the opt-in notice"
  - "`SERVICE_SAC_CODES_UPDATED` billing audit event"
  - "A `SAC Codes` section on Billing Settings that appears only for clinics that have legacy codes"
affects: [invoicing, gst-compliance, service-catalog, billing-settings, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Data corrections to clinic-owned records are opt-in actions behind their own endpoint, never migrations that run on deploy or login"
    - "A correction endpoint takes no body, so it cannot be repurposed to write arbitrary values"
    - "A notice that offers a correction says explicitly that declining it is legitimate"

key-files:
  created:
    - .planning/phases/06-invoicing-payments/06-19c-SAC-FIX-SUMMARY.md
  modified:
    - packages/types/src/constants/gst.ts
    - packages/types/src/billing.ts
    - packages/types/src/__tests__/invoice-status.test.ts
    - apps/api/src/modules/billing/service-catalog-seed.ts
    - apps/api/src/modules/billing/__tests__/service-catalog-seed.test.ts
    - apps/api/src/modules/billing/settings.service.ts
    - apps/api/src/modules/billing/settings.controller.ts
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/src/lib/billing-audit-log.ts
    - apps/api/tests/billing/settings.test.ts
    - apps/api/tests/billing/service-catalog.test.ts
    - apps/mobile/src/features/billing/lib/settings-form.ts
    - apps/mobile/src/features/billing/hooks/useBillingSettings.ts
    - apps/mobile/src/features/billing/screens/BillingSettingsScreen.tsx
    - apps/mobile/src/features/billing/__tests__/BillingSettingsScreen.test.tsx
    - .planning/phases/06-invoicing-payments/06-19-VERIFICATION.md

key-decisions:
  - "New clinics get 998351; already-seeded clinics are never migrated automatically, only by an explicit Admin action"
  - "The correctable set is the 9993xx family only — grooming's 998612 is excluded because grooming is taxable at 18% and Entry 46 does not reach it"
  - "The correction endpoint accepts no body, so there is no parameter through which an arbitrary SAC could be written onto a clinic's catalog"
  - "No 'you are up to date' UI variant: a clinic with nothing to correct never learns the concept exists"
  - "Deactivated catalog rows are included in the count and the rewrite, because a retired preset is still resolvable from a finalized invoice line"

patterns-established:
  - "Opt-in data correction: constant-scoped `updateMany`, its own endpoint, its own permission check, an audit row only when something moved, and no implicit caller anywhere in the codebase"
  - "Correction copy contract: name the count and the target, state what does *not* change, and say that leaving it alone is a valid choice"

requirements-completed: []

# Metrics
duration: 75min
completed: 2026-08-14
---

# Phase 6 Follow-up 19c: Legacy SAC Codes (A1) Summary

**New clinics now seed with the correct veterinary SAC 998351, and already-seeded clinics get an Admin-only "Update SAC codes" button that rewrites only the 9993xx family — never a silent migration, because an accountant may already have corrected those rows by hand.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-08-14T16:56Z
- **Completed:** 2026-08-14T18:11Z
- **Tasks:** 3 (seed fix, opt-in action, verification doc)
- **Files modified:** 16 (1 created)

## What this resolves

`06-19-VERIFICATION.md` §7 item **A1** and §6 question **Q2**, both left OPEN at
Phase 6 closeout pending a business decision. The decision is now taken and is
exactly what 06-04 recommended:

> Switch the seed to `998351` for new clinics and offer existing clinics an
> opt-in "update SAC codes" action, rather than a silent migration.

Nothing here was a tax defect. The GST engine reads `gstRateOverride` and
`taxTreatment` and has never read the SAC string, so no invoice any clinic has
issued is mis-taxed. What the code changes is what is *printed on a legal
document*, which is why the migration half needed a human's call rather than an
engineer's.

## Accomplishments

### 1. New clinics seed with the Entry 46 code

`apps/api/src/modules/billing/service-catalog-seed.ts` now writes
`VETERINARY_SAC` — `998351`, the code Notification No. 12/2017-Central Tax
(Rate) Entry 46 exempts — on all eighteen clinical presets, replacing the
`999311` / `999312` / `999313` / `999399` family it shipped before.

The two grooming rows are unchanged: `998612`, `gstRateOverride: 18`. Grooming
is not veterinary healthcare, Entry 46 does not reach it, and stamping the
nil-rated veterinary SAC onto a taxable line would be a worse document than the
one being corrected. This distinction is now encoded rather than implied — see
below.

### 2. `VETERINARY_SAC_LEGACY_CORRECTABLE`

`packages/types/src/constants/gst.ts` gains a second legacy list. The existing
`VETERINARY_SAC_LEGACY` (five codes, including `998612`) stays as the historical
record of everything the old seed wrote. The new
`VETERINARY_SAC_LEGACY_CORRECTABLE` is the four-element `9993xx` subset that the
correction is allowed to touch.

Splitting the two is what makes the correction safe to run. A rewrite scoped to
"everything in `VETERINARY_SAC_LEGACY`" would have moved grooming rows to an
exempt SAC while leaving their 18% rate in place.

### 3. The opt-in correction

`POST /api/v1/billing/settings/sac-codes/update`, behind the same
`MANAGE_CLINIC_SETTINGS` gate as the rest of the settings group (Admin only —
the seed grants that permission to Admin alone).

`BillingSettingsService.updateLegacySacCodes` is the **only** bulk writer of
`service_catalog.sac_code` in the repository, and nothing invokes it implicitly:
no startup hook, no login hook, no side effect of reading the settings. A clinic
that never presses the button keeps its rows byte-for-byte. That is the whole
substance of the decision — the clinic's catalog is the clinic's data, and their
accountant may already have set those codes to match what they file.

Properties worth naming:

| Property | How |
|---|---|
| Scoped to one tenant | `clinicId` in the `where` clause **and** RLS bound on the handle |
| Scoped to one code set | `sacCode: { in: VETERINARY_SAC_LEGACY_CORRECTABLE }`, not "anything ≠ 998351" — a clinic that deliberately set `999319` keeps it |
| Idempotent | `updateMany` returns `count: 0` on a second call |
| Un-parameterisable | The endpoint takes no body. One legacy set, one target, both constants — there is no input through which a client could write an arbitrary SAC |
| Attributable | `SERVICE_SAC_CODES_UPDATED` audit row carrying `{ updated, sacCode }` and no row contents, written only when a row actually moved |

`ClinicBillingSettings` gains `legacySacCodeCount`, a count computed on the
settings read. Reading it rewrites nothing — a test asserts exactly that, since
"opening the settings screen migrates your data" is the specific failure mode
the decision exists to prevent.

### 4. Where the action lives

A `SAC Codes` section on `BillingSettingsScreen.tsx`, rendered only when
`legacySacCodeCount > 0`. `legacySacNotice(count)` returns `null` at zero — there
is deliberately no "you are up to date" variant, because a clinic seeded after
today has no reason to ever learn this concept exists, and a section that only
says "nothing to do" is noise on a screen that also holds live payment
credentials.

The copy has three obligations, each pinned by a test:

1. Names the count and `998351`, so an Admin sees what changes.
2. Says the tax does not move — true, and without it the reader reasonably fears
   they are about to re-rate their whole catalog.
3. Ends *"If your accountant chose the codes you have, leave this as it is."*
   This is the load-bearing sentence. A notice phrased as a defect to clear would
   push an Admin into overwriting their accountant's work, undoing the opt-in
   decision at the last inch.

`useUpdateSacCodes` invalidates the settings key (the count drives the notice)
and the service-catalog key (those rows just changed). A separate test asserts
the rewrite is unreachable from `handleSubmit`, so an Admin editing their invoice
footer cannot trigger it.

### 5. Verification doc updated

`06-19-VERIFICATION.md`: A1 moved from **OPEN** to **RESOLVED 2026-08-14**, Q2
from **UNANSWERED** to answered, a new §7.1 records what shipped and where, and
the closing verdict, the acceptance-criteria table and the §5 seed table are all
reconciled. The §5 table is annotated rather than rewritten — it is the record of
what that audit found, and overwriting it would erase the evidence the finding
rested on.

**A4** (disputed Lab Test GST treatment) and **A5** (pilot registration status)
were untouched, per instruction. Both were resolved as "no code change needed".

## TDD gates

Failing test first in both cycles, verified by running the suite before writing
any implementation.

| Cycle | RED | GREEN | Commit |
|---|---|---|---|
| Seed default | `packages/types` 4 failed / 52 passed — `VETERINARY_SAC_LEGACY_CORRECTABLE` undefined | 56/56, then `service-catalog-seed.test.ts` 13/13 | `4e18062` |
| Opt-in action | `tests/billing/settings.test.ts` 9 failed / 18 passed; `BillingSettingsScreen.test.tsx` 8 failed / 36 passed | 27/27 and 44/44 | `5855e55` |

The two cycles are committed as `fix(...)` and `feat(...)` with test and
implementation together, rather than as separate `test(...)` / `feat(...)`
commits. This is an unplanned follow-up resolving one decision, not a numbered
plan with `tdd="true"` tasks; the RED evidence is the run output recorded above.

## Test results

| Suite | Result |
|---|---|
| `apps/api` (`pnpm exec vitest run`) | **77 files passed, 9 skipped; 1021 tests passed, 80 todo, 0 failed** |
| `apps/mobile` (`pnpm exec vitest run`) | **35 files passed; 636 tests passed, 0 failed** |
| `packages/types` | **56 passed** |
| `packages/validators` | **142 passed** |
| `apps/api` `tsc --noEmit` | **clean** |

Zero regressions. The 9 skipped API files are the pre-existing
`tests/inventory/*` suites, skipped before this work and unrelated to it.

`apps/api/package.json`'s `test` script was confirmed to already be
`vitest run`, not bare `vitest` — 06-19's watch-mode fix is in place. Suites were
run with `pnpm exec vitest run` directly regardless, per the established
convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no `node_modules` and no `.env`**

- **Found during:** setup, before any task
- **Issue:** Claude Code's worktree isolation branches from `origin/main`, which
  was 15 commits behind `breeyo/phase-06-invoicing-payments`, and carries no
  untracked files. Nothing could run: no dependencies, no generated Prisma
  client, and no `DATABASE_URL` for the integration suites.
- **Fix:** Fast-forwarded onto `breeyo/phase-06-invoicing-payments` (HEAD was a
  strict ancestor, so a clean `--ff-only`), `pnpm install --frozen-lockfile`,
  `pnpm exec prisma generate`, and copied the gitignored `apps/api/.env` from the
  main checkout, repointed at `breeyo_p0619` — the fully-migrated database the
  06-19 verification run left behind. No new package was installed.
- **Files modified:** none tracked (`.env` is gitignored)
- **Commit:** n/a

**2. [Rule 3 - Blocking] Workspace packages were unbuilt**

- **Found during:** the baseline API run, which failed 62 of 86 files with
  "Failed to resolve entry for package `@breeyo/validators`"
- **Issue:** `@breeyo/types` and `@breeyo/validators` resolve through their
  `dist/`, which does not exist in a fresh checkout.
- **Fix:** `pnpm --filter @breeyo/types --filter @breeyo/validators build`, and
  rebuilt `@breeyo/types` after each constant/interface change.
- **Commit:** n/a

**3. [Rule 1 - Bug] A test fixture asserted the code being removed**

- **Found during:** Task 1
- **Issue:** `apps/api/tests/billing/service-catalog.test.ts`'s `seedPreset`
  helper hardcoded `sacCode: '999311'` under a comment reading "as
  `seedServiceCatalog` would have written it". True before this change, false
  after — a stale fixture that would mislead the next reader into thinking the
  legacy code was still canonical.
- **Fix:** Uses `VETERINARY_SAC`. No assertion in that file reads `sacCode`, so
  behaviour is unaffected.
- **Files modified:** `apps/api/tests/billing/service-catalog.test.ts`
- **Commit:** `4e18062`

**4. [Rule 2 - Missing critical functionality] The correction was unaudited**

- **Found during:** Task 2
- **Issue:** The plan asked for an endpoint that updates rows. An unaudited bulk
  write to a field printed on a GST document is not acceptable in this codebase:
  D-32 keeps financial events for six years precisely so that "who changed this,
  and when" is answerable years later, and every other write in
  `settings.service.ts` already audits.
- **Fix:** Added `BillingAuditEvent.SERVICE_SAC_CODES_UPDATED`, written with
  `{ updated, sacCode }` and only when `count > 0`. `event` is a plain `String`
  column, so no migration was required.
- **Files modified:** `apps/api/src/lib/billing-audit-log.ts`,
  `apps/api/src/modules/billing/settings.service.ts`
- **Commit:** `5855e55`

### Scope decisions

- **`998612` excluded from the correctable set.** The task described the fix as
  `9993xx` → `998351`, and `VETERINARY_SAC_LEGACY` contains a fifth code,
  `998612`, on the grooming rows. Including it would have put a nil-rated
  veterinary SAC on lines carrying an 18% override. Excluded, and the exclusion
  is encoded in a named constant with tests, not left as a comment.
- **Deactivated rows are included** in both the count and the rewrite. A retired
  preset is still resolvable from a finalized invoice line, so its SAC is still
  what would be printed if that document were re-rendered.
- **The §5 seed table in the verification doc was annotated, not rewritten.** It
  records what the audit observed; replacing the values would destroy the
  evidence the finding rested on.

## Known Stubs

None. Every surface added here is wired end to end: the count is computed from
the database, the endpoint writes real rows, and the mobile section is driven by
the real count rather than a placeholder.

## Deferred Issues

- **`apps/mobile` `tsc --noEmit` has pre-existing errors** in
  `features/consultation`, `features/patient`, `features/attachment` and three
  `app/` route files (missing `expo-image-manipulator` /
  `expo-speech-recognition` types, `IntrinsicAttributes` mismatches on route
  props, `node16` extension-less relative imports). All predate this work and
  none are in `features/billing` — a grep of the full output for
  `billing|settings-form` returns nothing. Out of scope per the scope boundary;
  not fixed, not investigated further.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-write-endpoint | `apps/api/src/modules/billing/billing.routes.ts` | New authenticated bulk-write route `POST /billing/settings/sac-codes/update`. Mitigated: `MANAGE_CLINIC_SETTINGS` (Admin-only), tenant-scoped in the `where` clause and by RLS, value set fixed by a compile-time constant, no request body, audited. Covered by tests for 401, 403 (Front Desk and Clinician), cross-tenant isolation and no-partial-write-behind-403. |

## Self-Check: PASSED

- `.planning/phases/06-invoicing-payments/06-19c-SAC-FIX-SUMMARY.md` — FOUND
- Commit `4e18062` — FOUND
- Commit `5855e55` — FOUND
- `apps/api/src/modules/billing/settings.service.ts` contains
  `updateLegacySacCodes` — FOUND
- `packages/types/src/constants/gst.ts` contains
  `VETERINARY_SAC_LEGACY_CORRECTABLE` — FOUND
