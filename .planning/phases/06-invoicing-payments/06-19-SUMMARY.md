---
phase: 06-invoicing-payments
plan: "19"
subsystem: verification / phase close-out
tags: [verification, gate, ci, gst, compliance, razorpay, checkpoint]
requires:
  - 06-18 (Quick Sale, the last content plan)
  - 06-20 (check-tenant-client.sh, the D-30 gate this one invokes)
  - 06-21, 06-22, 06-23 (mobile billing surface)
  - all 24 plan summaries + the 06-00b and 06-07b hotfixes
provides:
  - "scripts/verify-phase-06.sh -- one command mapping every Phase 6 requirement to a named passing test, plus 14 phase-wide invariant gates"
  - "A `Phase 06 gate` CI step, with a real shadow database for the schema-reproducibility check"
  - "06-19-VERIFICATION.md -- recorded evidence per requirement, per ROADMAP criterion, per invariant, plus the carried-forward register from all 24 plans"
  - "Four rendered Rule 46A document-type samples for the compliance checkpoint"
  - "A one-shot API test script and a race-free test server (closes deferred item 7)"
affects:
  - "Every future plan running `pnpm --filter @breeyo/api test` -- it now terminates"
  - "CI: two new steps in the `test` job"
tech-stack:
  added: []
  patterns:
    - "A gate is only evidence if it is proven to fail: positive and negative controls recorded, not asserted"
    - "Every grep pipeline strips comment lines, so an invariant can be documented in the code it governs"
    - "A filter that matches nothing is a failure, not a pass -- named `-t` sub-checks assert a non-zero test count"
    - "A typecheck baseline that fails in both directions, so an allowance cannot rot into a permanent exemption"
    - "No safe default beats a destructive one: an unset shadow-database URL skips a check rather than resetting the database under test"
key-files:
  created:
    - scripts/verify-phase-06.sh
    - .planning/phases/06-invoicing-payments/06-19-VERIFICATION.md
    - .planning/phases/06-invoicing-payments/06-19-artifacts/1-unregistered-clinic.html
    - .planning/phases/06-invoicing-payments/06-19-artifacts/2-registered-exempt-only.html
    - .planning/phases/06-invoicing-payments/06-19-artifacts/3-registered-taxable-only.html
    - .planning/phases/06-invoicing-payments/06-19-artifacts/4-registered-mixed.html
  modified:
    - apps/api/package.json
    - apps/api/tests/helpers/app.ts
    - .github/workflows/ci.yml
decisions:
  - "Replaced the plan's `prisma db push` sync check with read-only `migrate diff`: db push DROPS the four pg_trgm indexes post-migrate.sql creates, and the run after it reports 'already in sync'"
  - "Added INV-TRGM -- the live database must differ from schema.prisma by exactly those four indexes and nothing else, so both a real change and a db-push wipe are caught"
  - "Re-anchored the schema money gate on the Phase 6 models banner; the plan's anchor swept in Phase 3's `Pet.weight Float?`"
  - "Mobile typecheck asserted against a Phase-6-scoped baseline rather than the whole app, which has never exited 0 and carries 61 errors owned by Phases 1-5"
  - "INV-SECRET excludes test files, because the only two matches are assertions that the credential is absent"
  - "An unset SHADOW_DATABASE_URL skips INV-SYNC; the obvious fallback to DATABASE_URL would have made Prisma reset the database being verified"
metrics:
  tasks-completed: 1
  tasks-blocked: 2
  requirements-passing: 9
  invariant-gates: 14
  workspace-tests: 1635
  completed: 2026-08-14
---

# Phase 6 Plan 19: Phase Close-Out Gate and Compliance Review Summary

A one-command gate that maps all nine requirements to named passing tests and
asserts fourteen phase-wide invariants, proven to fail on a real violation and
proven not to fail on a comment describing one — plus two blocking human
checkpoints that this environment cannot answer and must not fabricate.

## Status: TASK 1 COMPLETE, TASKS 2 AND 3 BLOCKED AT CHECKPOINT

`bash scripts/verify-phase-06.sh` exits **0** with PASS on all 23 checks.
The phase itself **cannot be closed** — three of the plan's six success criteria
require a human with a device and a Razorpay account.

## Requirement results

| ID | Result | Tests | Named sub-filters |
|----|--------|-------|-------------------|
| BIL-01 | **PASS** | 19 | `idempotent` |
| BIL-02 | **PASS** | 18 | `concurrent`, `does not deduct`, `mixed provenance`, `stock plan` |
| BIL-03 | **PASS** | 23 | — |
| BIL-04 | **PASS** | 29 | — |
| BIL-05 | **PASS** | 42 | — (SDK mocked) |
| BIL-06 | **PASS** | 24 | `invalid signature`, `idempotent`, `latency` |
| BIL-07 | **PASS** | 36 | `inter-state`, `rounding`, `document type`, `unregistered`, `pro-rata` |
| RPT-01 | **PASS** | 12 | — |
| PLT-04 | **PASS** | 20 | — |

Workspace: API **1009 passed / 0 failed**, mobile **626 passed / 0 failed**,
`tsc --noEmit` clean in `apps/api`, `expo install --check` clean.

## Proving the gate can fail

Both controls run, both recorded verbatim in `06-19-VERIFICATION.md` §4.

**Positive.** `const x = (1.5).toFixed(2);` appended to `money.ts`:

```
apps/api/src/modules/billing/money.ts:197:const x = (1.5).toFixed(2);
!!! FAILED: INV-MONEY -- toFixed / parseFloat / Number(...Paise) in money-carrying code
 INV-MONEY            FAIL   toFixed / parseFloat / Number(...Paise) in money-carrying code
 1 CHECK(S) FAILED
```

Exit **1**, fail-fast stopped before the remaining checks.

**Negative.** The same text inside a `//` comment: exit **0**, `INV-MONEY` PASS.
So the comment stripping is real rather than decorative — which is what lets the
invariant be documented in the file it governs. `money.ts` restored, `git status`
clean.

## Deviations from Plan

### 1. [Rule 1 — Bug] The plan's `prisma db push` check is destructive

**Found during:** Task 1, first run against a freshly provisioned database.

The plan asked the gate to run `npx prisma db push` and expect
`The database is already in sync with the Prisma schema`. It printed
`🚀 Your database is now in sync` instead — because it had just **dropped all
four pg_trgm GIN indexes** that `post-migrate.sql` creates and `schema.prisma`
deliberately does not model. Measured directly:
`SELECT count(*) FROM pg_indexes WHERE indexname LIKE '%trgm%'` went **4 → 0**.
The *second* `db push` then printed the expected "already in sync" string — so
the plan's literal check would have passed on a database it had just damaged.

**Fix:** `INV-SYNC` uses read-only `migrate diff --exit-code`, and a new
`INV-TRGM` requires the live database to differ from `schema.prisma` by
precisely those four indexes and nothing else — failing both when a real schema
change appears and when a `db push` has wiped them. Indexes restored by
re-running `post-migrate.sql`.

**Commit:** `bfde55e`

### 2. [Rule 1 — Bug] The plan's schema money gate matched a body weight

`awk '/─── Phase 6/,0'` anchors on the Clinic model's *"Phase 6 billing
settings"* sub-heading at line 57, not the models banner at line 751, so the
range swept the whole rest of the file and matched Phase 3's `Pet.weight Float?`
— returning 1 where the plan asserts 0. Re-anchored on
`─── Phase 6: Invoicing & Payments`, with a guard that fails if that banner ever
disappears, so the range cannot silently collapse to nothing.

**Commit:** `bfde55e`

### 3. [Rule 1 — Bug] `apps/api`'s test script was watch mode

`"test": "vitest"` — the only workspace outlier; every sibling already ran
`vitest run`. Root `pnpm test` therefore never terminated: turbo waited on an
interactive watcher indefinitely. This is deferred item 7, recorded in 06-06 and
worked around by every plan since. Fixed to `vitest run`, with `test:watch`
keeping the old behaviour under an honest name. The gate additionally sets
`CI=true` on the suite step so a future regression degrades to "runs once"
rather than "the phase gate hangs".

**Commit:** `460c6cc`

### 4. [Rule 1 — Bug] `buildTestApp()` never listened, causing ECONNRESET under concurrency

BIL-06's `-t "latency"` failed with `read ECONNRESET` on its first gate run and
passed on re-run. Root cause: the helper never called `listen()`, so supertest
bound an ephemeral port itself per `request(app.server)`. Fifty concurrent
requests all observed a null address in the same tick, all called `listen` on
the same server object, and the losers had their sockets reset. It hit exactly
the two tests that must not be flaky — the BIL-06 webhook burst and the BIL-02
two-finalize oversell race. Binding once in the helper fixed it: `-t "latency"`
in isolation went from intermittently red to **5/5 green**.

**Commit:** `460c6cc`

### 5. [Rule 2 — Missing safety] An unset shadow-database URL would have reset the database under test

`migrate diff --from-migrations` replays the migration set into a shadow
database and **resets whatever it is given**. The first draft defaulted to
`${SHADOW_DATABASE_URL:-$DATABASE_URL}` — the obvious-looking fallback, which
would have dropped every table in the database being verified, mid-run, on any
machine that had not set the variable, including CI. There is no safe default:
an unset URL is now a SKIP with instructions, an identical one is a hard FAIL,
and CI gets a real `breeyo_shadow` database.

**Commit:** `f0fafa4`

### 6. [Deviation from plan text] Mobile typecheck asserted against a scoped baseline

The plan asks for `pnpm --filter @breeyo/mobile exec tsc --noEmit` as a gate.
That check has never exited 0 and carries **61 errors** owned by Phases 1-5 and
`packages/ui`, none of which this phase introduced or may fix under the scope
boundary. A gate that can only be red is the same as no gate. The gate instead
asserts that the error count *inside the Phase 6 mobile surface* equals a
recorded baseline of **1**, named in the script: `pdf-deps.test.ts(74,39)
TS1470`, `import.meta` in a file NodeNext treats as CJS. It fails if a new
Phase 6 error appears **and** if the known one is fixed without lowering the
baseline, so the allowance cannot rot.

### 7. [Deviation from plan text] `INV-SECRET` excludes test files

The only two matches in the tree are
`expect(serialised).not.toMatch(/keySecret|key_secret|razorpayKeyId/)` — tests
asserting the credential is **absent**. Tripping on those would invite weakening
the pattern. Everything a device ships is still scanned. Recorded in
`06-19-VERIFICATION.md` §3.

### 8. [Deviation from plan text] `--skip-suite` narrowed after CI wiring

It originally also skipped the typechecks and the Expo check, which meant the
CI invocation would have dropped the one check that catches a new Phase 6 mobile
typecheck error. It now scopes to `pnpm test` alone.

## CI integration

Added to the existing `test` job — the only one with both workspaces and a live
database — as `Phase 06 gate`, invoked with `--skip-suite` because that job
already ran `pnpm test`. A preceding step creates the `breeyo_shadow` database
that `INV-SYNC` requires.

## The four PDF document types

Rendered from the shipped `buildInvoiceHtml` into
`.planning/phases/06-invoicing-payments/06-19-artifacts/`:

| Case | Observed heading | GSTIN | CGST | HSN |
|------|------------------|-------|------|-----|
| Unregistered clinic | `INVOICE` | absent | absent | absent |
| Registered, exempt lines only | `BILL OF SUPPLY` | present | absent | present |
| Registered, taxable lines only | `TAX INVOICE` | present | present | present |
| Registered, mixed | `INVOICE-CUM-BILL OF SUPPLY` | present | present | present |

All four Rule 46A branches correct, and the Section 122 negative check holds on
the unregistered document.

## Blocked: the two human checkpoints

Nothing here is fabricated. Full detail in `06-19-VERIFICATION.md` §5 and §6.

**Task 2 — eight device flows: BLOCKED.** No physical device or simulator in
this environment. Additionally, no demo-data seeder exists (`prisma/seed.ts`
seeds RBAC reference data only), so the clinic/pets/stock fixture the flows need
cannot be produced. Zero of eight flows have a recorded outcome. The four
observations that matter most and remain unmade: flow 3's before/after stock
delta for a *dispensed* line versus a *manually added* line; flow 5's
webhook-to-UI latency; flow 6's one-page legibility on paper; flow 7's stock
delta after void.

**Task 3 — GST and Razorpay review: PARTIALLY BLOCKED.** Two of eight questions
are answered from evidence generated here (Q4 document types, Q7 indicator
wording, both inline in the verification doc). Six need the human. The
answerable database question was run: **0 of 0** clinic rows carry a
`razorpay_key_id` or a `razorpay_webhook_secret_enc`, and the shared dev database
cannot even be queried — it predates the Phase 6 migration and has no such
column. So onboarding has not begun anywhere the build can see; how many of the
20 pilot clinics have completed KYC in the real world is not a fact the codebase
contains.

**Webhook-to-UI latency (flow 5): unmeasured.** `RAZORPAY_TEST_KEY_ID` and
`RAZORPAY_TEST_KEY_SECRET` are unprovisioned — flagged since 06-01 and again in
06-09. No code in this phase has ever spoken to Razorpay.

## Carried-forward items

`06-19-VERIFICATION.md` §7 collects **34 items** from all 24 plan summaries, both
hotfix summaries and `deferred-items.md`, in five groups: 4 compliance/go-live
blockers, 5 functional gaps inside Phase 6, 12 platform/correctness items, 7
product/configuration items, and 11 recorded as closed. Three are new from this
plan: the `db push` index-drop hazard (C2), the Phase 6 mobile typecheck baseline
(C5), and the absence of a demo-data seeder (C10).

**No item has a named owner.** Assigning owners is part of the blocked checkpoint
in §6 and cannot be done without the human.

The seven items the plan named specifically are all resolved or recorded:
legacy SAC (A1, open — §6 Q2), receipt numbering (E10, closed: counter-row
allocator reused, `RCT-YYYYMM-XXXX`), `savePdf` platform behaviour (D1, open),
supertest vs. `app.inject` (E8, closed: supertest), the Phase 4 index (E9,
closed: yes, `20260814100000`), `buildProductLineStockPlan` (E11, recorded
verbatim), and the gear affordance (D3, open).

## Commits

| Hash | Message |
|------|---------|
| `460c6cc` | `fix(06-19): make the API test script one-shot and bind the test server once` |
| `bfde55e` | `test(06-19): add the phase 06 requirement and invariant gate` |
| `f0fafa4` | `ci(06-19): run the phase 06 gate in CI and add the Rule 46A sample documents` |

## Known Stubs

None. The gate runs real tests against a real database; no check is stubbed,
and every SKIP is explicitly labelled with the flag that caused it.

## Self-Check: PASSED

- All 7 created files verified present on disk (gate script executable,
  verification doc, this summary, four HTML samples).
- All 3 commit hashes resolve in `git log`.
- `test -x scripts/verify-phase-06.sh` succeeds.
- `grep -c 'BIL-01\|...\|RPT-01' scripts/verify-phase-06.sh` → **18** (plan
  requires ≥ 8).
- `bash scripts/verify-phase-06.sh --skip-suite --all` → exit **0**, 22 PASS /
  1 SKIP.
- `bash scripts/verify-phase-06.sh --all` (full, including `pnpm test`) → exit
  **0**, 23 PASS.
- `bash -n scripts/verify-phase-06.sh` clean; `ci.yml` parses as valid YAML.
- `git status` clean after the deliberate-violation controls — `money.ts`
  restored, temp artifact generator removed.

STATE.md and ROADMAP.md deliberately untouched — the orchestrator owns those
writes centrally.
