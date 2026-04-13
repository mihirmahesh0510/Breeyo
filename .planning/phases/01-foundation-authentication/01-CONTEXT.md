# Phase 1: Foundation & Authentication - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Monorepo setup (Turborepo), PostgreSQL database with RLS multi-tenancy, authentication system (email/password + mobile OTP) with role-based access and customizable permissions, API skeleton with versioned REST endpoints, and deployment infrastructure (local + staging + production).

</domain>

<decisions>
## Implementation Decisions

### Signup & Onboarding
- **D-01:** Self-service signup — vet signs up and creates their clinic in the same flow. No admin provisioning needed.
- **D-02:** Comprehensive signup info collected: email, password, phone number, clinic name, address, vet's full name, license number, specialization, operating hours.
- **D-03:** Email verification only before granting access. Phone number verified later via first OTP login.
- **D-04:** Guided setup wizard after signup: 3 steps — complete clinic profile, invite staff members, configure clinic hours/working days.
- **D-05:** Wizard is skippable at any step with "Skip for now". Dashboard shows gentle reminder to complete setup.
- **D-06:** Home screen after setup is the walk-in queue — the primary daily workflow.

### OTP & Login Flow
- **D-07:** SMS-only OTP delivery (via provider like MSG91/Twilio). No WhatsApp OTP for now.
- **D-08:** Stay logged in with silent token refresh. OTP required only for new device login or after 30-day inactivity expiry.
- **D-09:** Clear inline error messages on login failure ("OTP expired — tap to resend", "Incorrect password"). No account lockout for Beta — rate-limit OTP resends instead.
- **D-10:** Both password reset (email link) and OTP login available. Two paths to access — vet is never locked out.
- **D-11:** Login screen: email + password as primary form, "Login with OTP" as secondary link below.
- **D-12:** OTP auto-read from SMS (Android SMS Retriever API) with manual entry fallback.

### Role Management
- **D-13:** Signup user automatically becomes Admin of their clinic.
- **D-14:** Admin invites staff via phone number + role assignment. Staff receives SMS invite with setup link.
- **D-15:** Multiple roles per user supported. Solo vet can be Admin + Clinician. Staff can be Front Desk + Inventory Manager.
- **D-16:** Customizable per-user permissions. Each role has sensible default permissions. Admin can toggle individual permissions on/off per user.
- **D-17:** Deactivation only — no hard delete of user accounts. Medical records must trace who created them. Admin can deactivate staff accounts (blocks login, preserves audit trail).

### Multi-device Policy
- **D-18:** Unlimited concurrent sessions. Vet can use phone + web + tablet simultaneously.
- **D-19:** No session management UI for Beta. If there's a problem, user changes password.
- **D-20:** 30-day session TTL with silent refresh. Vet never sees login during normal daily use.
- **D-21:** Password change forces logout on all other devices/sessions.

### Tenant & Clinic Model
- **D-22:** Multi-clinic support from day one. A vet can own/manage multiple clinics and switch between them.
- **D-23:** Clinic switcher in header/nav (like Slack workspace switching). Tap to switch — all data scopes to selected clinic.
- **D-24:** Clinic entity: name + address + contact phone (minimum). More fields (GSTIN, logo, etc.) added in settings later.
- **D-25:** Two-layer patient data sharing:
  - **Automatic:** Patient records shared across clinics owned by the same vet
  - **Consent-based:** When a pet visits a different clinic on Breeyo (different owner), that clinic can link the pet with owner consent
- **D-26:** Staff at Clinic A cannot see Clinic B data — sharing is scoped by clinic ownership, not staff access.

### API Conventions
- **D-27:** REST API with consistent patterns. Endpoints follow `/api/v1/{resource}` convention.
- **D-28:** Structured JSON error responses: `{error: {code: "AUTH_EXPIRED", message: "Session expired", details: {...}}}`.
- **D-29:** API versioned from day one with `/api/v1/` prefix. Coexistence model when v2 is needed.
- **D-30:** Basic rate limiting on auth endpoints (e.g., 100 req/min per user) to prevent brute force.

### Environment & CI/CD
- **D-31:** Three environments from Phase 1: local (Docker Compose), staging, production.
- **D-32:** GitHub Actions CI/CD: auto-run tests on PR, auto-deploy to staging on merge to main, manual promotion to production.
- **D-33:** Backend hosted on AWS Mumbai (EC2/ECS). PostgreSQL via RDS, Redis via ElastiCache. Full India data residency.

### Logging & Audit Trail
- **D-34:** Structured JSON logs (Winston or Pino) shipped to CloudWatch. Error tracking via Sentry for crash reports.
- **D-35:** Dedicated auth audit log table: login, logout, failed attempts, password changes, role changes, user invitations.
- **D-36:** Audit logs are immutable — append-only, no delete or update operations. Tamper-proof record for compliance.

### Claude's Discretion
- Exact setup wizard UI/UX flow and transitions
- OTP resend rate-limit thresholds
- Loading skeleton design for auth screens
- Exact permission set per default role (what each role can/cannot do by default)
- Compression and retention policy for logs
- Error state handling for edge cases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value, constraints, key decisions, and evolution rules
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-06, PLT-04, PLT-05 are the requirements for this phase
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and dependency chain

### Technology Stack
- `.planning/research/STACK.md` — Recommended stack (React Native/Expo, Node.js, PostgreSQL, Redis, Prisma, TypeScript, Turborepo), alternatives considered, version compatibility
- `.planning/research/ARCHITECTURE.md` — Multi-tenant patterns, modular monolith approach, offline-first architecture
- `.planning/research/PITFALLS.md` — Common pitfalls for Indian vet SaaS (WhatsApp dependency, offline handling, RLS performance)

No external specs or ADRs — requirements are fully captured in decisions above and in REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project with no existing codebase

### Established Patterns
- None — Phase 1 establishes all foundational patterns (monorepo structure, API conventions, auth flow, multi-tenancy)

### Integration Points
- Monorepo packages created here will be consumed by all subsequent phases
- Auth middleware and RLS policies established here gate all future API endpoints
- Clinic/tenant model created here scopes all future data models

</code_context>

<specifics>
## Specific Ideas

- Walk-in queue as the home screen — vet lands on their primary workflow immediately after login
- Clinic switching should feel like Slack workspace switching — quick, in the nav, instant data scope change
- Two-layer patient data sharing: automatic across same-owner clinics, consent-based across different clinics on Breeyo
- Auth audit trail needs to be immutable from day one — tamper-proof for healthcare compliance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-authentication*
*Context gathered: 2026-04-13*
