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
- **Verification:** Built the image locally (`docker build -f apps/api/Dockerfile .`) and confirmed the container starts and runs as `node`, not `root`, and the API responds correctly on `/health`.
- **Commit:** *(pending — see Execution status)*

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

- **File:** `.github/workflows/backup-verify.yml` (workflow itself is correct)
- **Root cause:** This workflow is functioning exactly as designed — it's correctly detecting real AWS infrastructure problems, not failing due to a bug:
  - **Staging RDS instance** genuinely fails 4 real checks: `BackupRetentionPeriod = 1 day` (needs ≥7), `StorageEncrypted = false` (must be `true` for medical data), `DeletionProtection = false` (must be `true` for production), and zero automated snapshots found.
  - **Production job** fails separately at the "Configure AWS credentials" step — `AWS_GITHUB_ROLE_ARN` (or the OIDC trust relationship) isn't configured for the `production` GitHub Environment.
- **Why this isn't in scope here:** Both root causes require actual AWS console/CLI changes and GitHub repo-settings changes, not a source-code fix. Enabling storage encryption on an already-unencrypted RDS instance specifically requires creating an encrypted snapshot copy and restoring a new instance from it — a real migration with a maintenance window, not a config toggle — and is exactly the kind of hard-to-reverse, shared-infrastructure change that needs your explicit sign-off before anyone (including an AI assistant) touches it.
- **Status:** Documented here, not fixed. Needs you (or whoever holds AWS console access) to: (a) configure the production environment's OIDC role secret, and (b) plan the RDS encryption migration + retention/deletion-protection changes as a deliberate maintenance action.

---

## Verification

Full regression suite (root aggregate + `apps/api` + `apps/mobile` + `apps/web`) after all code fixes land, then push through the `no-mistakes` gate.

## Execution status

| Item | Status | Commit |
|---|---|---|
| chromaui SHA pin | Fixed | `5289b52` |
| Docker non-root user | Fixed, Docker build verified locally | *(pending)* |
| OTP verify lockout | Fixed, TDD, independently re-verified | `645e8ee` |
| Stock-adjustment negative-stock | Fixed, TDD, independently re-verified | `407843d` |
| Backup-verify workflow | Not a code fix — documented above, needs AWS/GitHub-settings action from the user | — |
