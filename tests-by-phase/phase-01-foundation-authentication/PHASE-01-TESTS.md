# Phase 01 — Foundation & Authentication: Test Summary

**19 test files** covering login, signup, sessions, staff/permissions management, clinic setup, notifications, and multi-tenant data isolation.

## Why this matters (business risk being covered)

This phase is the front door to the entire product — every clinic's data sits behind it. The
things these tests protect against are the failure modes that would actually hurt the business:

- **A clinic seeing another clinic's data.** Breeyo is multi-tenant (many independent vet
  clinics share one system). If tenant isolation breaks, one clinic could see another's
  patients, staff, or audit history — a serious data-privacy breach and a contract-ending event.
- **A locked-out or over-privileged staff member.** Vets and front-desk staff need reliable
  login (including OTP for low-literacy/low-connectivity settings common in Indian clinics),
  and permission mistakes could let a receptionist edit medical records or a former employee
  keep access after being deactivated.
- **Session/token bugs that lock everyone out or leave stolen sessions valid.** Password
  resets, refresh tokens, and logout all need to fail safely — a bug here is either a support
  fire (nobody can log in) or a security hole (an attacker's session outlives a password change).
- **Silent account enumeration.** Password-reset and email-resend flows are tested to never
  reveal whether an email exists in the system, which is a common way clinic staff lists get
  leaked/phished.

## How these tests are run

- **Framework:** [Vitest](https://vitest.dev/) — the same test runner used across every package
  in this repo (API, mobile, UI, validators).
- **API tests (`apps/api/tests/**`)** are **integration tests**: they spin up the real Fastify
  app (`buildTestApp()`) and hit real HTTP routes with `supertest`-style requests against a
  **real PostgreSQL database** — not mocks. Test data is created and torn down per-suite via
  factory helpers (`createTestUser`, `createTestClinic`, etc.) in `tests/helpers/`. Because
  these suites share one database, they're configured to run **sequentially, not in parallel**
  (`fileParallelism: false` in `apps/api/vitest.config.ts`), so one test's data can't collide
  with another's mid-run.
- **Mobile tests (`apps/mobile/tests/**`)** are **component/unit tests**: native device APIs
  (`expo-secure-store`, `expo-router`) and the backend API client are mocked, so these verify
  the app's own logic (token storage, deep-link parsing, state transitions) without needing a
  real device or a real server.
- **Where it actually runs:** every push and pull request triggers GitHub Actions (`.github/workflows/ci.yml`),
  which boots a real **PostgreSQL 16** and **Redis 7** container, runs Prisma migrations plus
  the Row-Level Security setup scripts, seeds the database, then runs `pnpm test` across all
  packages. Nothing here is tested against fakes at the infrastructure level — it's the same
  Postgres/Redis stack production uses, just disposable per CI run.

## Signing up & verifying an account
`apps/api/tests/auth/signup.test.ts`
- A new user can sign up and gets a clinic created for them as Admin.
- Can't sign up twice with the same email, and malformed emails are rejected.
- Signing up records an audit trail entry.
- Email verification links work, but expired or invalid links are rejected.

## Logging in
`apps/api/tests/auth/login.test.ts`, `otp-login.test.ts`, `logout.test.ts`
- Correct email/password logs a user in and returns access tokens.
- Wrong password, unknown email, unverified email, and deactivated accounts are all correctly rejected.
- Users who belong to more than one clinic must pick which clinic they're logging into.
- Phone/OTP login: a one-time code is sent, expires appropriately, is rate-limited (max 3 requests per 5 minutes), and verifies a phone number on first successful use.
- Logging out invalidates the session so old tokens can't be reused.
- Every login attempt (success or failure) and every logout is written to the audit log.

## Staying logged in (sessions & tokens)
`apps/api/tests/auth/token-refresh.test.ts`
- A valid refresh token issues a fresh pair of tokens; expired or revoked ones are rejected.
- If an old, already-used refresh token is replayed (a sign of token theft), the entire session family is invalidated as a security measure.
- A normal chain of several consecutive refreshes works as expected.

## Password & email recovery
`apps/api/tests/auth/password-reset.test.ts`, `email-resend.test.ts`
- Requesting a password reset never reveals whether an email exists in the system (prevents account enumeration).
- Reset links work once, expire, and can't be reused.
- Resending a verification email is capped at 3 requests per hour; already-verified accounts get a friendly message instead of a duplicate email.

## Staff management & permissions
`apps/api/tests/auth/role-assignment.test.ts`, `permissions.test.ts`, `reactivation.test.ts`
- Admins can invite staff, assign/change roles, and set custom permission overrides for individual users.
- Non-admins without the right permission are blocked from these actions.
- Deactivated staff can no longer log in; reactivating them restores their previous roles and is logged.
- The system always keeps at least one active Admin — you can't deactivate the sole remaining admin of a clinic.
- Changing a password invalidates every other active session for that user.
- Permission changes take effect immediately (cache is refreshed) rather than requiring a re-login.

## Switching between clinics
`apps/api/tests/auth/clinic-switch.test.ts`
- Users who work at multiple clinics can list and switch between them.
- Switching to a clinic they don't belong to is blocked (403).

## Clinic profile & setup wizard
`apps/api/tests/clinic/clinic-profile.test.ts`
- Clinic name and working hours can be updated (with the right permission).
- The first-time setup wizard's completion state is tracked and won't re-trigger once finished.

## Notifications
`apps/api/tests/notifications/notification.test.ts`, `push.test.ts`
- Devices can register/unregister for push notifications (duplicates are handled gracefully).
- The notification inbox supports pagination, filtering unread items, marking one or all as read, and an unread counter.
- Notifications from one clinic never leak into another clinic's inbox.
- Push notifications are sent via Expo with the correct payload; invalid/unregistered device tokens are filtered out rather than causing failures.

## Multi-tenant data isolation
`apps/api/tests/tenant-isolation.test.ts`
- A user from Clinic A cannot see Clinic B's staff, patients, or audit logs — enforced both in the API logic and at the database level (Postgres Row-Level Security).
- Clinic owners with multiple clinics can still see all of *their own* clinics.
- Losing clinic membership immediately revokes access to that clinic's data.

## Regional configuration
`apps/api/tests/config/region.test.ts`
- Confirms the app and deployment configs are pinned to the `ap-south-1` (Mumbai) AWS region everywhere it matters (env defaults, `.env.example`, staging/production deploy configs).

## Mobile app: auth flows
`apps/mobile/tests/auth/auth-flow.test.tsx`, `verify-email.test.tsx`
- Tokens are stored securely on-device and cleared fully on logout.
- The API client attaches auth headers correctly and surfaces errors (including "please pick a clinic" errors).
- Login, OTP login, and token refresh flows all update app state correctly, including recovering gracefully when a refresh fails.
- Deep links for staff invites and password resets are parsed correctly (and rejected gracefully when malformed).

## Mobile app: first-time setup wizard
`apps/mobile/tests/setup-wizard/wizard-flow.test.tsx`
- The wizard steps (clinic profile → invite staff → clinic hours) happen in the right order.
- Each step calls the correct API and can be skipped without side effects (except the final step, which still marks the wizard complete).
- Working-hours data is transformed correctly for the API (closed days get null times, all 7 days stay in order).
- The app correctly detects whether a clinic has already finished the wizard.

---
**How to run these for real:** `pnpm --filter @breeyo/api test` and `pnpm --filter @breeyo/mobile test` from the project root.
