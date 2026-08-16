# PRD-01: Foundation & Authentication

**Type:** Lightweight PRD
**Phase:** 01 - Foundation & Authentication
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 1 establishes the foundational infrastructure and authentication system for Breeyo, a mobile-first veterinary clinic management platform targeting solo and small-team veterinarians in India. This phase delivers user registration, SMS OTP-based login, role-based access control (RBAC), multi-tenant data isolation, and production infrastructure (India-region hosting, automated backups, notification foundation). Everything built in subsequent phases depends on the identity, authorization, and tenancy primitives delivered here.

---

## 2. Problem Statement

Indian veterinary clinics -- over 40,000 of them -- largely operate without purpose-built practice management software. Most solo vets rely on paper records or generic tools that lack multi-clinic data isolation, mobile-first workflows, and India-specific considerations (regional SMS OTP delivery, data residency).

Before any clinical features can be built, Breeyo needs:

- A secure, mobile-optimized authentication flow suited to the Indian market (SMS OTP over email-based passwords).
- Multi-tenant isolation so each clinic's data is invisible to every other clinic, enforced at the database level.
- Role-based access control flexible enough for a solo vet who does everything and a growing team with specialized roles.
- Production-grade infrastructure in the correct AWS region with automated disaster recovery.

Without this foundation, no subsequent feature (patient records, billing, inventory) can be built securely or deployed reliably.

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Solo Vet / Admin

- **Role:** Owner-operator of a single or multi-location veterinary clinic.
- **Context:** Manages all aspects of the practice herself initially. Signs up, configures the clinic, and uses every feature.
- **Needs:** Fast mobile signup, persistent sessions (she cannot re-authenticate between every patient), ability to later invite staff and assign granular roles.
- **Frustrations:** Complex onboarding flows, tools that assume a desktop-first workflow, data locked outside India.

### Secondary: Receptionist Rekha -- Front Desk Staff

- **Role:** Invited by Dr. Priya after the clinic is set up. Assigned the Front Desk role.
- **Context:** Handles patient check-in, appointment scheduling, and basic record lookup. Should not access billing configuration or clinical notes beyond what her role permits.
- **Needs:** Simple OTP login on a shared clinic phone or her own device, clear boundaries on what she can and cannot do.

---

## 4. Strategic Context

- **Market:** India's veterinary services market is valued at approximately $2.8B TAM with 40,000+ clinics and no dominant digital solution.
- **Platform positioning:** Breeyo is mobile-first, built for the Indian solo vet. Authentication via SMS OTP aligns with Indian mobile usage patterns where phone numbers are the primary digital identity.
- **Foundation dependency:** Every subsequent phase (Patient Registration, Appointments, Billing, Inventory, Analytics) depends on the identity, tenancy, and authorization primitives built here. Investing in solid infrastructure now prevents rework later.
- **Multi-clinic from day one:** Decision D-22 establishes multi-clinic support in the data model from the start, avoiding a costly migration when clinics expand to multiple locations.
- **Data residency:** AWS Mumbai (ap-south-1) satisfies practitioner expectations and potential regulatory requirements for India-region data storage.

---

## 5. Solution Overview

### 5.1 Authentication

| Capability | Details |
|---|---|
| **Sign up** (AUTH-01) | Self-service registration with email and password. Comprehensive information collected during onboarding (D-02). Email verification required before access (D-03). Guided setup wizard walks user through clinic creation (D-04, D-05). |
| **Login** (AUTH-02) | Mobile OTP via SMS (MSG91 or Twilio, D-07). Phone number is the primary login credential on mobile. |
| **Session persistence** (AUTH-03) | JWT access token + refresh token rotation. 30-day session TTL (D-08, D-20). Tokens stored in Expo SecureStore. Unlimited concurrent sessions (D-18). |
| **Logout** (AUTH-06) | Available from any screen. Clears local tokens and invalidates the refresh token server-side. |

### 5.2 Role-Based Access Control

| Capability | Details |
|---|---|
| **Role assignment** (AUTH-04) | Admin assigns roles: Admin, Clinician, Front Desk, Inventory Manager. A user can hold multiple roles (D-15). |
| **Permission enforcement** (AUTH-05) | Role-based permissions enforced at the API layer via `authenticate` and `authorize` middleware. Per-user permission overrides supported (D-16). |
| **User lifecycle** (D-17) | Deactivation only -- no hard deletes of user accounts. |

### 5.3 Multi-Tenancy & Data Isolation

| Capability | Details |
|---|---|
| **Tenant isolation** (PLT-04) | PostgreSQL Row-Level Security (RLS). Every query scoped to the current tenant via `prisma-rls.ts`. Two DB roles: `breeyo_admin` (migrations) and `breeyo_app` (app queries, RLS enforced). |
| **Multi-clinic** (D-22, D-23) | Data model supports multiple clinics per organization from day one. Clinic switcher in the UI. |

### 5.4 Infrastructure & Operations

| Capability | Details |
|---|---|
| **India-region storage** (PLT-05) | AWS Mumbai (ap-south-1). ECS task definitions, staging and production environments (D-31). |
| **Backups & recovery** (PLT-06) | Automated daily backups. Recovery procedure documented and tested. Backup verification via scheduled workflow. |
| **Audit logging** (D-35, D-36) | Immutable audit logs for all authentication events (login, logout, role changes, permission modifications). |
| **Notification foundation** | Service scaffolding for push notifications (expo-notifications) and SMS delivery, used by OTP in this phase and by clinical alerts in later phases. |

### 5.5 API Design

- REST API with `/api/v1/{resource}` convention (D-27).
- Structured error responses with consistent error codes (D-28).
- Rate limiting: 200 req/min global, 20 req/min on auth endpoints.
- Zod validation on all request/response payloads via `@breeyo/validators`.

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Signup-to-login completion** | User can sign up and log in via OTP; session persists across app restarts | Manual QA + integration tests |
| 2 | **Logout accessibility** | Logout available and functional from any screen | UI test coverage |
| 3 | **RBAC enforcement** | Admin can create users and assign roles; permissions enforced at API layer | Integration tests (positive and negative cases) |
| 4 | **Tenant isolation** | Clinic A data is invisible to Clinic B | Automated cross-tenant access tests |
| 5 | **Data residency** | All production data stored in AWS ap-south-1 | Infrastructure audit |
| 6 | **Backup & recovery** | Automated daily backups enabled; recovery procedure documented and tested | Scheduled backup verification workflow passes |
| 7 | **Notification foundation** | Notification service scaffolding exists and can deliver SMS OTP | OTP delivery success rate in staging |

---

## 7. User Stories & Requirements

### Authentication

| ID | Story | Acceptance Criteria |
|---|---|---|
| AUTH-01 | As a vet, I want to sign up with my email and password so I can create my clinic account. | Registration form collects required info. Email verification sent. Access blocked until verified. Guided setup wizard launches on first login. |
| AUTH-02 | As a user, I want to log in with a mobile OTP so I can access the app quickly without remembering a password. | Phone number input, OTP sent via SMS, OTP validated server-side, JWT issued on success. |
| AUTH-03 | As a user, I want my session to persist when I close and reopen the app so I don't have to log in every time. | Refresh token stored in SecureStore. Token rotation on refresh. 30-day TTL. Seamless re-authentication on app launch. |
| AUTH-04 | As an admin, I want to assign roles to my staff so they have appropriate access levels. | Admin can invite users, assign one or more roles (Admin, Clinician, Front Desk, Inventory Manager). Role changes take effect immediately. |
| AUTH-05 | As an admin, I want role-based permissions enforced so staff can only access features relevant to their role. | API middleware checks role permissions. Per-user overrides supported. Unauthorized requests return 403. |
| AUTH-06 | As a user, I want to log out from any screen so I can secure my account when I'm done. | Logout button accessible globally. Clears local tokens. Invalidates refresh token server-side. |

### Platform

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-04 | As a clinic owner, I want my data completely isolated from other clinics so my patient and business information is private. | RLS policies on all tenant-scoped tables. Cross-tenant queries return zero rows. Verified by automated tests. |
| PLT-05 | As a clinic owner in India, I want my data stored in India so it complies with local expectations. | All AWS resources provisioned in ap-south-1. No data replication outside the region. |
| PLT-06 | As a clinic owner, I want automated backups so I can recover from data loss. | Daily automated backups. Recovery runbook documented. Recovery tested at least once before launch. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 1:

- **Patient registration and clinical records** -- Phase 3.
- **Appointment scheduling** -- Phase 4.
- **Billing and invoicing** -- Phase 5.
- **Inventory management** -- Phase 6.
- **Analytics and reporting dashboards** -- Phase 8.
- **Web dashboard** -- Phase 9.
- **Social/OAuth login** (Google, Apple) -- may be added in a future phase.
- **Biometric authentication** (fingerprint, Face ID) -- future enhancement.
- **Two-factor authentication** beyond OTP login -- not required for MVP.
- **User self-service password reset** -- can be added post-launch; admin can reset in the interim.
- **Internationalization beyond English** -- i18n infrastructure exists in `@breeyo/ui` but translations are not in scope.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **SMS provider (MSG91 / Twilio)** | External service | OTP delivery depends on provider uptime and India SMS route reliability. |
| **AWS ap-south-1 availability** | Infrastructure | All production services hosted in Mumbai region. |
| **PostgreSQL 16 RLS** | Technical | Multi-tenancy model depends on RLS working correctly with Prisma ORM. |
| **Expo SecureStore** | Technical | Token persistence depends on platform-specific secure storage APIs. |
| **Redis 7** | Infrastructure | Session/token blacklisting and rate limiting depend on Redis availability. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SMS OTP delivery delays in India | Medium | High -- users cannot log in | Support dual providers (MSG91 + Twilio fallback). Implement retry logic. Monitor delivery rates. |
| RLS misconfiguration leaks tenant data | Low | Critical | Automated cross-tenant isolation tests in CI. Dedicated `breeyo_app` DB role with no bypass. Code review checklist for RLS. |
| Refresh token theft from device | Low | High | SecureStore encryption. Token rotation on every refresh. Server-side revocation on logout. |
| Guided setup wizard abandonment | Medium | Medium -- incomplete clinic profiles | Allow resuming setup. Track completion funnel. Keep required fields minimal. |
| Backup recovery not tested | Medium | High -- false confidence in DR | Schedule recovery drill before production launch. Automated backup verification workflow. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | Which SMS provider do we start with -- MSG91 or Twilio? | MSG91 has better India pricing; Twilio has broader docs/SDKs. Decision D-07 leaves both as options. | Engineering |
| 2 | What is the OTP expiry window? | Industry standard is 5-10 minutes. Needs confirmation. | Product |
| 3 | Should the setup wizard be skippable? | D-04 says guided, but solo vets may want to explore first and configure later. | Product |
| 4 | What are the exact permissions per role? | D-15/D-16 define the mechanism (multiple roles, per-user overrides) but not the default permission matrix. | Product + Engineering |
| 5 | How do we handle the transition from email/password signup (AUTH-01) to OTP login (AUTH-02)? | User signs up with email but logs in with phone OTP. Need to ensure phone number is collected and verified during signup. | Engineering |
| 6 | What is the backup retention policy? | Daily backups are specified but retention duration (7 days, 30 days, etc.) is not. | Engineering + Ops |
| 7 | Should deactivated users' sessions be immediately revoked? | D-17 says deactivation only, but unclear if active sessions should be killed on deactivation. | Product |

---

*This is a Lightweight PRD for foundational infrastructure. Detailed technical design lives in the codebase and architecture documentation.*
