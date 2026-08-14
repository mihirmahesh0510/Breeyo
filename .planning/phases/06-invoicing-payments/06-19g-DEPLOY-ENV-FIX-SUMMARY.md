---
phase: 06-invoicing-payments
plan: 19g
subsystem: infrastructure
tags: [ecs, task-definition, deployment, environment, ssm, razorpay, ci-gate, cr-05]

# Dependency graph
requires:
  - phase: 06-invoicing-payments
    provides: "06-06's `crypto.ts` (`getEncryptionKey` reads `BILLING_ENCRYPTION_KEY`); 06-12's `settings.service.ts` (`publicApiBase` reads `PUBLIC_API_URL`); 06-01's `.env.example` entries"
  - phase: 01-foundation-auth
    provides: "the staging and production ECS task definitions and their SSM-backed `secrets` blocks"
provides:
  - "`BILLING_ENCRYPTION_KEY` wired into both task definitions as an SSM `secrets` reference"
  - "`PUBLIC_API_URL` wired into both task definitions, rendered at deploy time from the existing `STAGING_URL` / `PRODUCTION_URL` environment secrets"
  - "A deploy-time guard that fails the deploy if any `PLACEHOLDER` survives task-definition rendering"
  - "`scripts/check-task-def-env.sh` — CI gate asserting every no-fallback env var is declared in every task definition"
  - "Pre-launch item PL-3 — provision the `BILLING_ENCRYPTION_KEY` SSM parameter, plus its IAM half"
affects: [deployment, billing, razorpay, ci]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deployment config is verified by a CI gate, not assumed — the test suite runs against a local .env and can never observe a task definition"
    - "A required-vars list is scoped to variables with no code-level fallback, so every failure is actionable and the gate does not get switched off"
    - "Environment-specific values are rendered from secrets that already exist rather than duplicated into new parameters"
    - "A rendered placeholder is failed loudly, because a plausible-but-wrong URL fails more silently than a missing one"

key-files:
  created:
    - scripts/check-task-def-env.sh
    - .planning/phases/06-invoicing-payments/06-19g-DEPLOY-ENV-FIX-SUMMARY.md
  modified:
    - infra/aws/staging/api-task-definition.json
    - infra/aws/production/api-task-definition.json
    - .github/workflows/deploy-staging.yml
    - .github/workflows/deploy-production.yml
    - .github/workflows/ci.yml
    - .planning/phases/06-invoicing-payments/06-19-VERIFICATION.md
    - .planning/phases/06-invoicing-payments/deferred-items.md

decisions:
  - "`BILLING_ENCRYPTION_KEY` goes in `secrets` via SSM, not `environment` — it decrypts every clinic's Razorpay secret"
  - "`PUBLIC_API_URL` is rendered from the existing `STAGING_URL` / `PRODUCTION_URL` secrets rather than hardcoded or given its own SSM parameter"
  - "The CI gate's required list covers only no-fallback variables; the other absent vars are deferred, not silently included"
  - "No secret value was generated or committed — provisioning stays an out-of-band ops step (PL-3)"

metrics:
  tasks: 5
  duration: ~35m
  completed: 2026-08-14
---

# Phase 6 Hotfix 19g: Deployment Environment Fix (CR-05) Summary

`BILLING_ENCRYPTION_KEY` and `PUBLIC_API_URL` are now declared in both ECS task
definitions, closing a gap that left BIL-05 and BIL-06 non-functional in every
deployed environment, and a CI gate now fails the build whenever a no-fallback
environment variable is missing from a task definition.

## The finding

`.planning/phases/06-invoicing-payments/06-REVIEW.md` does not exist in this
repository, and the string `CR-05` appears nowhere under `.planning/`. Rather
than treat the fix as unverifiable, the finding was confirmed directly against
the code, which reproduced it exactly:

| Variable | Read at | Declared in task defs? |
|---|---|---|
| `BILLING_ENCRYPTION_KEY` | `apps/api/src/lib/crypto.ts:68`, inside `getEncryptionKey()` | No |
| `PUBLIC_API_URL` | `apps/api/src/modules/billing/settings.service.ts:156`, inside `publicApiBase()` | No |

Consequences, as described:

- `getEncryptionKey()` throws `'BILLING_ENCRYPTION_KEY is not set — per-clinic
  Razorpay credentials cannot be encrypted'` when the variable is absent. It is
  read lazily inside the function (06-06 deliberately kept it off module scope),
  so the API boots normally and fails only when a clinic actually saves Razorpay
  credentials — a 500 on every save attempt in staging and production.
- `publicApiBase()` returns `null`, so the per-clinic `webhookUrl` an Admin needs
  to paste into their Razorpay dashboard renders null. BIL-06 has no path to
  working.

The reason this survived a green suite is concrete: `apps/api/tests/helpers/setup.ts:21-23`
generates a random `BILLING_ENCRYPTION_KEY` when none is set, and
`apps/api/tests/billing/settings.test.ts:54` sets `PUBLIC_API_URL` directly. The
tests therefore assert the code path works given the variables, and can say
nothing about whether the deployment supplies them. Nothing in the repository
connected the two.

## What changed

### 1. Task definitions

Both files gained one entry each, following the existing pattern exactly.

`BILLING_ENCRYPTION_KEY` went into `secrets` alongside `JWT_SECRET` and
`COOKIE_SECRET`, since it is credential-grade — it is the key that decrypts
every clinic's stored Razorpay secret:

```json
{ "name": "BILLING_ENCRYPTION_KEY", "valueFrom": "/breeyo/staging/BILLING_ENCRYPTION_KEY" }
```

Note the store is **SSM Parameter Store**, not Secrets Manager: every existing
`valueFrom` in these files is a bare `/breeyo/<env>/NAME` path rather than a
Secrets Manager ARN. The brief suggested a Secrets Manager ARN; the repository's
actual convention won, per the instruction to check the existing pattern.

`PUBLIC_API_URL` went into `environment` — it is a public origin, not a secret.

### 2. Deploy-time rendering of `PUBLIC_API_URL`

The value is not knowable at commit time: no public API URL is committed
anywhere in the repository. Three options existed, and fabricating a plausible
hostname was rejected outright.

The chosen approach renders it from the **`STAGING_URL` / `PRODUCTION_URL`
GitHub environment secrets that already exist** — the same values the deploy
workflows' health-check steps already probe at `$STAGING_URL/health`. Since the
API serves `/health` at its root, those secrets *are* the public API origin, so
this is not an approximation. It also means the webhook URL shown to Admins and
the host CI health-checks can never drift apart, and it adds no new provisioning
step. The alternative, a dedicated `/breeyo/<env>/PUBLIC_API_URL` parameter,
would have duplicated an existing value and added a second manual ops action.

This extends the jq step already present in both workflows (which existed to
substitute `image`, so "render a placeholder at deploy time" is a convention
these files already establish), matching by name rather than index:

```
| .containerDefinitions[0].environment |= map(
    if .name == "PUBLIC_API_URL" then .value = $PUBLIC_API_URL else . end
  )
```

### 3. A guard against a half-rendered task definition

Rendering introduces a failure mode worth naming: if the name match ever breaks,
`PUBLIC_API_URL` deploys as the literal string `PLACEHOLDER`. That is **worse
than the original bug**. 06-12 chose `null` over `"undefined/api/v1/..."` for
exactly this reason, and the comment at `settings.service.ts:150-153` spells it
out — a plausible-looking wrong URL pasted into a Razorpay dashboard fails
silently at delivery time, whereas a missing one is visible on the settings
screen immediately. So both workflows now assert the render completed:

```bash
if grep -q 'PLACEHOLDER' task-definition.json; then ... exit 1; fi
```

Each render step also `set -euo pipefail`s and fails fast if the URL secret is
empty, so an unset secret cannot render `PUBLIC_API_URL` to `""`.

### 4. The CI gate (`scripts/check-task-def-env.sh`)

No mechanism existed to catch this class of bug — no test, script, or CI step
anywhere related task definitions to the variables the code reads. The new gate
asserts that every variable in a curated `REQUIRED_VARS` list appears as a name
in either `environment` or `secrets`, in both task definitions.

It follows the conventions of the existing `scripts/check-tenant-client.sh`
gate: documented rationale at the top, `set -euo pipefail`, `REPO_ROOT`
resolution, actionable failure output, and a self-check that refuses to pass
vacuously if a task definition is missing or unparseable.

`REQUIRED_VARS` is deliberately narrow — **only variables with no working
fallback in code**, where absence is a hard failure rather than degraded
behaviour. This boundary is what keeps the gate useful; see Deviations below.

It is wired as the first step of the CI `test` job, before `pnpm install`, since
it is a static JSON check needing no database or dependencies.

### 5. `.env.example`

**No change needed.** `PUBLIC_API_URL` is already documented at line 11 with a
comment explaining it must be the address Razorpay can reach, and
`BILLING_ENCRYPTION_KEY` at line 52. 06-01 and 06-12 both landed these. The
brief anticipated this might already be done; it was.

## Verification

This is a JSON/YAML config change, so there is no meaningful application-level
failing test. The equivalent was done at the gate level, which is the honest
RED/GREEN for an infra fix — **the gate was proven to reproduce the bug before
being proven to pass.**

Pre-fix task definitions were extracted with `git show HEAD:<path>` into a
scratch directory and the gate run against them, with only its paths repointed
and its logic untouched:

```
task-def env gate FAILED -- required variables missing from a task definition:

  staging.json
    - BILLING_ENCRYPTION_KEY
    - PUBLIC_API_URL
  production.json
    - BILLING_ENCRYPTION_KEY
    - PUBLIC_API_URL
```

It names all four omissions and nothing else — it reproduces CR-05 precisely.
Against the fixed files:

```
task-def env gate passed -- 7 required vars present in 2 task definitions.
```

Also verified:

| Check | Result |
|---|---|
| Both task definitions parse (`jq empty`) | Pass |
| All three workflows parse (`yaml.safe_load`) | Pass |
| `bash -n scripts/check-task-def-env.sh` | Pass |
| Staging render simulated end to end | `PUBLIC_API_URL` set to the URL, `image` substituted, `BILLING_ENCRYPTION_KEY` present in `secrets` |
| PLACEHOLDER guard, positive control | No match after a correct render |
| PLACEHOLDER guard, negative control | Render deliberately broken by a name typo → guard matches line 53 and would exit 1 |
| Gate self-check | Confirmed live: an early path error produced "a gate that scans nothing always passes" rather than a false pass |
| Diff vs. existing pattern | `BILLING_ENCRYPTION_KEY` is structurally identical to the `COOKIE_SECRET` entry above it in both files |
| Trailing-slash safety | `publicApiBase()` applies `.replace(/\/+$/, '')`, so a `STAGING_URL` with a trailing slash cannot produce a double slash |

## OUT-OF-BAND STEP REQUIRED BEFORE NEXT DEPLOY

**The `BILLING_ENCRYPTION_KEY` SSM parameters do not exist and this change does
not create them.** The repository contains no Terraform, CDK, or any other IaC —
every SSM parameter (`DATABASE_URL`, `JWT_SECRET`, and the rest) is provisioned
by hand in the AWS console. No secret value was generated, fabricated, or
committed here, and none should be.

Ops must, in `ap-south-1`, before the next deploy:

1. Create `/breeyo/staging/BILLING_ENCRYPTION_KEY` and
   `/breeyo/production/BILLING_ENCRYPTION_KEY` as `SecureString`, each with an
   independently generated `openssl rand -hex 32` value. The code requires
   exactly 64 hex characters and rejects anything else with a descriptive error.
   Use different values per environment.
2. Confirm the ECS **execution** roles can read the new path. If their policies
   enumerate parameter ARNs individually rather than using a `/breeyo/<env>/*`
   wildcard, they must be extended. The current policy shape cannot be
   determined from the repository.

**This is now deploy-blocking in a way it was not before.** Previously a missing
key let the task start and failed only at credential-save time; now an ECS task
whose `secrets` block references a nonexistent parameter **fails to start** with
`ResourceNotFoundException`. That is the correct trade — a container that
refuses to start is visible in seconds, while the old behaviour was a 500
discovered by a clinic mid-onboarding — but it means the ordering matters, and
**staging deploys automatically on push to `main`.** Provision before merging.

Recorded as **PL-3** in `06-19-VERIFICATION.md` §6b, alongside the existing PL-1
and PL-2, with both the parameter and IAM halves and the ordering caveat.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Added a deploy-time PLACEHOLDER guard**

- **Found during:** Task 2, wiring the render step.
- **Issue:** Rendering `PUBLIC_API_URL` from a secret introduces a silent-failure
  mode strictly worse than the bug being fixed — a literal `PLACEHOLDER` reaching
  production produces a plausible wrong webhook URL, which 06-12 explicitly
  designed against.
- **Fix:** Both deploy workflows now `set -euo pipefail`, fail on an empty URL
  secret, and grep the rendered file for `PLACEHOLDER`, exiting 1 with the
  offending line if found. Verified with a deliberately broken render.
- **Files:** `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`
- **Commit:** f9e4673

**2. [Rule 2 - Missing critical functionality] Added the CI gate**

- **Found during:** Task 3, the survey the brief asked for.
- **Issue:** No validation of task-definition completeness existed anywhere, which
  is precisely why CR-05 shipped. Fixing the two variables without it leaves the
  next variable free to repeat the failure.
- **Fix:** `scripts/check-task-def-env.sh`, wired into CI. Scope kept tight per the
  brief — one script, one curated list, no broader infra audit.
- **Commit:** e602077

**3. Store is SSM Parameter Store, not Secrets Manager**

The brief specified a Secrets Manager ARN for the encryption key. Every existing
`valueFrom` in these task definitions is a bare SSM path, so the repository's
convention was followed instead, per the brief's own instruction to check the
existing pattern.

**4. The named review file does not exist**

`06-REVIEW.md` is absent and `CR-05` appears nowhere under `.planning/`. The
finding was verified against the code instead, and reproduced exactly.

## Out of Scope — Recorded, Not Fixed

Auditing `process.env` across `apps/api/src` surfaced **more** variables absent
from the task definitions. All were left alone under the executor scope boundary
and written to `deferred-items.md` with their exact call sites:

| Variable | Behaviour when absent |
|---|---|
| `MSG91_AUTH_KEY` | Guarded by `if (NODE_ENV === 'production' && MSG91_AUTH_KEY)` — in production the guard is false, so **real OTP SMS is never sent, silently**. The most consequential of the group. |
| `WEB_URL` | Falls back to `http://localhost:3001`, so the CORS allow-list and every emailed password-reset link point at localhost. |
| `SMTP_*`, `EMAIL_FROM` | Transactional email unconfigured in all deployed environments. |
| `SENTRY_DSN` | `if`-guarded; error reporting simply off, though D-34 expected it on. |
| `MOBILE_URL`, `CORS_ORIGIN` | Same class as `WEB_URL`. |

Each has a `||`/`??` default or an `if` guard, so none breaks a flow outright the
way CR-05's two did, and each needs a real value decision (which SMTP provider,
which public web origin) this targeted fix has no basis to make. They are also
why `REQUIRED_VARS` is scoped to no-fallback variables: adding these rows would
make the new gate fail on `main` immediately for pre-existing reasons, which is
how gates get disabled. They should join the list as they are provisioned.

`WEB_URL` and `MSG91_AUTH_KEY` are flagged in `deferred-items.md` as deserving
owners before launch.

One related inaccuracy, noted but not touched because
`apps/api/src/modules/billing/*.ts` is owned by sibling agents this wave: the
comment at `settings.service.ts:148-153` states that `API_URL` is "already
present in every environment". It is not — `API_URL` is absent from both task
definitions too, so the documented fallback would not have saved `webhookUrl`.
That comment is plausibly why CR-05 looked safe. The fix makes it moot by
supplying `PUBLIC_API_URL` directly; correcting the wording is left to whoever
next owns that file.

## Constraints Honoured

- `apps/api/src/modules/billing/*.ts` — read only, never modified (CR-01..04 are sibling agents' work).
- `STATE.md` and `ROADMAP.md` — untouched, as instructed.
- No secret value generated, guessed, or committed.
- Worktree safety: fast-forwarded onto `breeyo/phase-06-invoicing-payments` from a
  strict-ancestor HEAD before starting; all commits on `worktree-agent-ac272125977ae02c3`;
  no `git clean`, `git stash`, or blanket reset used; both commits verified to
  contain zero file deletions.

## Self-Check: PASSED

## Threat Flags

None. This change declares two existing variables to the deployment and adds no
new endpoint, auth path, or trust boundary. `BILLING_ENCRYPTION_KEY` is wired as
an SSM `secrets` reference rather than a plain `environment` value specifically
so the key is not visible in `describe-task-definition` output.
