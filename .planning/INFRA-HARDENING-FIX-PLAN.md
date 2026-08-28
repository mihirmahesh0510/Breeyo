# Infra Hardening Fix Plan

**Date:** 2026-08-28
**Source:** The 4 infra/security items deferred from the earlier whole-repo review, plus the negative-stock residual gap flagged (not fixed) during WR-2 in the whole-repo-audit-findings batch (PR #25).

**Branch:** `fix/infra-hardening`, worktree at `.claude/worktrees/fix-infra-hardening`.

---

## Findings

### 1. `chromaui/action@latest` unpinned — FIXED

- **File:** `.github/workflows/ui-visual-regression.yml`
- **Root cause:** Supply-chain risk — the `@latest` tag is mutable; a future compromise of the upstream `chromaui/action` repo (or its tag) would run in this repo's CI with no warning.
- **Fix:** Pinned to the exact commit SHA `@latest` resolved to as of 2026-08-28 (`69be7d88fc9479eedbe5b2861f847eb48f97cabc`, tagged `v18.6.1` in that repo's own history), with a comment explaining why.
- **Commit:** `5289b52`

### 2. Docker container runs as root — FIXED

- **File:** `apps/api/Dockerfile`
- **Root cause:** No `USER` directive anywhere in the `runner` stage — the container's entrypoint process runs as root by default, so a compromised process has full filesystem write access inside the container rather than being confined.
- **Fix:** Added `RUN chown -R node:node /app` + `USER node` before `CMD`, using the official `node:22-alpine` image's built-in non-root `node` user (uid 1000).
- **Verification:** Built the image locally (`docker build -f apps/api/Dockerfile .`) and confirmed: `docker run ... id` reports `uid=1000(node)`, not root; the server starts against real Postgres+Redis and `GET /health` returns `{"status":"ok"}`.
- **Commit:** `87c4652`

### 3. OTP verification has no per-phone attempt lockout — FIXED

- **File:** `apps/api/src/modules/auth/otp.service.ts`
- **Root cause:** `verifyOtp` never tracked failed attempts per phone number — the only protection against brute-forcing a 6-digit OTP (1,000,000 possible values) was the route's per-IP rate limit (20/min across all `/auth/*` endpoints), trivially bypassable by rotating source IPs. `sendOtp` already correctly rate-limits its own request side by phone (`otp_rate:${phone}`); `verifyOtp` had no equivalent.
- **Fix:** Added a per-phone failed-attempt counter (`otp_attempts:${phone}`, same 5-minute TTL as the OTP itself). After 5 wrong guesses, the OTP itself is invalidated and further attempts (even with the correct code) return a new `OTP_LOCKED` error until a fresh OTP is requested — which also resets the counter. The lockout check runs *before* comparing the submitted code, so a correct guess submitted after the limit is already hit still can't slip through.
- **Commit:** `645e8ee`

### 4. Bonus: stock-adjustment negative-stock race — FIXED

- **File:** `apps/api/src/modules/inventory/stock-adjustment.service.ts`
- **Root cause:** Flagged (not fixed) during the WR-2 investigation in PR #25. The negative-stock guard (`item.currentStock < parsed.quantity`) reads `currentStock` outside the transaction, before the atomic increment — two genuinely concurrent "remove" requests can both read the same pre-decrement value, both pass the check, and both apply, pushing `currentStock` negative.
- **Fix:** Kept the pre-check as a cheap fast-path rejection for the common case, but added the real enforcement as a post-increment check inside the transaction (`updatedItem.currentStock < 0` → throw, rolling back the whole transaction including the increment). Concurrent transactions on the same row serialize on Postgres's implicit row lock, so the second transaction's check always sees the first's actually-committed result.
- **Commit:** `407843d`

### 5. Backup-verification workflow failing — NOT A CODE FIX, flagged for the user

- **File:** `.github/workflows/backup-verify.yml`
- **Root cause:** This workflow was functioning exactly as designed — it was correctly detecting real AWS infrastructure gaps, not failing due to a bug. Follow-up investigation (2026-08-28) found the production root cause was actually more fundamental than a missing secret:
  - **Production job** wasn't just missing `AWS_GITHUB_ROLE_ARN` — production RDS doesn't exist yet at all (`aws rds describe-db-instances` returns only `breeyo-staging`). There was nothing for the job to verify.
  - **Staging RDS instance** (`breeyo-staging`) genuinely failed 4 checks: `BackupRetentionPeriod = 1 day` (needs ≥7), `StorageEncrypted = false`, `DeletionProtection = false`, and zero automated snapshots found.
- **Fix applied:**
  - `verify-production` job now checks `RDS_PRODUCTION_INSTANCE_ID` via a step output (secrets can't be used directly in `if:` conditions) and skips cleanly with a `::notice::` instead of failing red every week. Revisit once production RDS is actually provisioned.
  - Staging `DeletionProtection` flipped to `true` via `aws rds modify-db-instance` — verified in the returned instance description.
- **Accepted gaps (user decision 2026-08-28), not fixed:**
  - **Backup retention stuck at 1 day** — this AWS account is on the Free Tier plan, which hard-caps automated-backup retention at 1 day for a free-tier-eligible instance (`db.t4g.micro`); tried 1/2/3 days, all rejected with `FreeTierRestrictionError`. Reaching the required ≥7 days needs the account upgraded off Free Tier — a billing decision, deliberately deferred rather than fixed.
  - **StorageEncrypted still false** — fixing requires a snapshot → encrypted-copy → restore-new-instance → cutover migration (real downtime-adjacent effort, would also briefly run two instances against the Free Tier's 750 free-hours/month cap). Deferred as low-priority since staging carries no real clinical data yet.
- **Status:** Production job fixed (skips gracefully). Staging: deletion protection fixed; retention and encryption are documented, accepted gaps pending an account-plan upgrade and a deliberate migration window respectively.

---

## Verification

Full regression suite (root aggregate + `apps/api` + `apps/mobile` + `apps/web`) after all code fixes land, then push through the `no-mistakes` gate.

## Execution status

| Item | Status | Commit |
|---|---|---|
| chromaui SHA pin | Fixed | `5289b52` |
| Docker non-root user | Fixed, Docker build + runtime verified locally | `87c4652` |
| OTP verify lockout | Fixed, TDD, independently re-verified | `645e8ee` |
| Stock-adjustment negative-stock | Fixed, TDD, independently re-verified | `407843d` |
| Backup-verify workflow | Production job fixed (skips gracefully, no prod RDS yet); staging deletion-protection fixed; retention + encryption are accepted gaps | `<pending>` |
