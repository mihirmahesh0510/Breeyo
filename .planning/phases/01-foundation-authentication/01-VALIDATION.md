---
phase: 1
slug: foundation-authentication
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/api/vitest.config.ts (created in Plan 01, Task 3) |
| **Quick run command** | `pnpm --filter @breeyo/api test` |
| **Full suite command** | `pnpm --filter @breeyo/api test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @breeyo/api test`
- **After every plan wave:** Run `pnpm --filter @breeyo/api test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-T1 | 01 | 1 | PLT-04 | build | `pnpm install && pnpm turbo build --filter=@breeyo/types --filter=@breeyo/validators` | Wave 0 (creates vitest.config.ts) | ⬜ pending |
| 01-01-T2 | 01 | 1 | PLT-04, PLT-05 | integration | `docker compose up -d --wait && pnpm --filter @breeyo/api db:generate && pnpm --filter @breeyo/api exec prisma migrate dev --name init --skip-seed` | Wave 0 (creates schema) | ⬜ pending |
| 01-01-T3 | 01 | 1 | PLT-04 | integration | `pnpm --filter @breeyo/api exec tsx src/server.ts & sleep 3 && curl -s http://localhost:3000/health && kill %1` | Wave 0 (creates test helpers) | ⬜ pending |
| 01-02-T1 | 02 | 2 | AUTH-01 | integration | `pnpm --filter @breeyo/api test -- --run tests/auth/signup.test.ts` | apps/api/tests/auth/signup.test.ts | ⬜ pending |
| 01-02-T2 | 02 | 2 | AUTH-02, AUTH-03, AUTH-06 | integration | `pnpm --filter @breeyo/api test -- --run tests/auth/login.test.ts tests/auth/otp-login.test.ts tests/auth/token-refresh.test.ts tests/auth/logout.test.ts` | apps/api/tests/auth/login.test.ts, otp-login.test.ts, token-refresh.test.ts, logout.test.ts | ⬜ pending |
| 01-03-T1 | 03 | 3 | AUTH-04, AUTH-05 | integration | `pnpm --filter @breeyo/api test -- --run tests/auth/role-assignment.test.ts tests/auth/permissions.test.ts` | apps/api/tests/auth/role-assignment.test.ts, permissions.test.ts | ⬜ pending |
| 01-03-T2 | 03 | 3 | PLT-04, PLT-05 | integration | `pnpm --filter @breeyo/api test -- --run tests/tenant-isolation.test.ts tests/config/region.test.ts` | apps/api/tests/tenant-isolation.test.ts, config/region.test.ts | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Coverage

| Requirement | Description | Covered By | Plan:Task |
|-------------|-------------|------------|-----------|
| AUTH-01 | User can sign up with email and password | apps/api/tests/auth/signup.test.ts | 02:T1 |
| AUTH-02 | User can log in via mobile OTP | apps/api/tests/auth/otp-login.test.ts | 02:T2 |
| AUTH-03 | Sessions persist; user can log out | apps/api/tests/auth/token-refresh.test.ts, logout.test.ts | 02:T2 |
| AUTH-04 | Admin can create users and assign roles | apps/api/tests/auth/role-assignment.test.ts | 03:T1 |
| AUTH-05 | Permissions enforced across all endpoints | apps/api/tests/auth/permissions.test.ts | 03:T1 |
| AUTH-06 | All auth events audit-logged | apps/api/tests/auth/signup.test.ts, login.test.ts, logout.test.ts | 02:T1, 02:T2 |
| PLT-04 | Monorepo, API skeleton, CI pipeline | apps/api health check, .github/workflows/ci.yml | 01:T1-T3, 03:T2 |
| PLT-05 | Data stored in India region (ap-south-1) | apps/api/tests/config/region.test.ts | 01:T2, 03:T2 |

---

## Wave 0 Requirements

- [x] Test framework (vitest) installed and configured — Plan 01, Task 1 (apps/api/package.json) + Task 3 (vitest.config.ts)
- [x] Test database setup (PostgreSQL test instance) — Plan 01, Task 1 (docker-compose.test.yml, port 5433)
- [x] Test fixtures for multi-tenant RLS verification — Plan 01, Task 3 (tests/helpers/factories.ts)
- [x] Auth test helpers (token generation, user factories) — Plan 01, Task 3 (tests/helpers/factories.ts, tests/helpers/app.ts)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SMS OTP delivery | AUTH-02 | External SMS provider | Verify OTP received on test phone via MSG91 dashboard |
| India region deployment | PLT-05 | Infrastructure config | Verify AWS console shows Mumbai (ap-south-1) region |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
