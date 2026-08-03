# Breeyo ERD: Phase 1 — Foundation & Authentication

## Phase 1: Foundation & Authentication

### Phase 1 Product Features

Phase 1 builds the **identity, access control, and multi-tenancy foundation** that every subsequent phase depends on. It delivers:

1. **Self-Service Signup** — Vet creates account + clinic in one flow. Signup user becomes Admin automatically.
2. **Email Verification** — Required before login. Token-based with 24h expiry. Resend with rate limiting.
3. **Password Authentication** — Argon2 hashing. Login with email + password.
4. **OTP Login** — SMS-based (MSG91 provider). 6-digit code, 5min expiry, rate limited to 3 per 5 min. Indian phone format (`+91XXXXXXXXXX`).
5. **Multi-Device Sessions** — Unlimited concurrent devices. JWT access tokens (15min) + refresh tokens (30 days).
6. **Token Replay Detection** — Family-based token rotation. Detects compromised refresh tokens and revokes entire family.
7. **Staff Invitation** — Admins invite by phone number. Automatic user creation with assigned role.
8. **RBAC (Role-Based Access Control)** — 4 roles: Admin, Clinician, FrontDesk, InventoryManager. Multiple roles per user.
9. **Permission Overrides** — Per-user grant/deny that overrides role defaults. Redis-cached with 5min TTL.
10. **Multi-Clinic Support** — Users can own/manage multiple clinics. Clinic switching issues new JWT.
11. **Staff Deactivation/Reactivation** — Blocks login, preserves audit trail. No hard deletes.
12. **Password Change** — Forces logout on all devices (revokes all tokens).
13. **Immutable Audit Logging** — All auth events recorded (login, logout, token refresh, role changes, etc.).
14. **Row-Level Security (RLS)** — Database-enforced tenant isolation. Two DB roles: `breeyo_admin` (migrations) and `breeyo_app` (queries with RLS).
15. **Clinic Setup Wizard** — Profile, working hours, wizard completion tracking.
16. **Push Notification Registration** — Device token storage for Expo push notifications.
17. **DPDP Act Compliance** — Consent records for data processing (Indian data protection law).

### Phase 1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      IDENTITY & ACCESS                              │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐          │
│  │   User   │───<│ ClinicMember │>───│ClinicMemberRole  │          │
│  └──────────┘    └──────────────┘    └──────────────────┘          │
│       │                │                      │                     │
│       │                │                      │                     │
│       │          ┌─────┴──────────────┐  ┌────┴───┐                │
│       │          │UserPermOverride    │  │  Role  │                │
│       │          └────────────────────┘  └────────┘                │
│       │                │                      │                     │
│       │          ┌─────┴───┐           ┌──────┴──────────┐         │
│       │          │Permission│──────────│RolePermission   │         │
│       │          └─────────┘           └─────────────────┘         │
│       │                                                             │
│  ┌────┴──────┐   ┌─────────────┐                                   │
│  │RefreshToken│   │AuthAuditLog │                                   │
│  └───────────┘   └─────────────┘                                   │
│       │                                                             │
│  ┌────┴──────┐                                                      │
│  │DeviceToken│                                                      │
│  └───────────┘                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         CLINIC                                      │
│                                                                     │
│  ┌──────────┐                                                       │
│  │  Clinic  │───── owner (User)                                     │
│  └──────────┘                                                       │
│       │                                                             │
│       └──────<  ClinicMember  (see above)                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      NOTIFICATIONS                                  │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐                               │
│  │ Notification  │    │ DeviceToken   │───── User                    │
│  └──────────────┘    └──────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      COMPLIANCE                                     │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │ConsentRecord  │   (DPDP Act compliance)                          │
│  └──────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 1 Database Models

#### User

Primary identity entity. Can own clinics and be a member of multiple clinics.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `email` | String | Unique, NOT NULL | |
| `phone` | String | Unique, NOT NULL | Indian format `+91XXXXXXXXXX` |
| `full_name` | String | NOT NULL | |
| `password_hash` | String | NOT NULL | Argon2 |
| `license_number` | String? | | Vet registration number |
| `specialization` | String? | | |
| `is_email_verified` | Boolean | DEFAULT false | Must verify before login |
| `is_phone_verified` | Boolean | DEFAULT false | |
| `is_active` | Boolean | DEFAULT true | Soft deactivation |
| `email_verification_token` | String? | | 24h expiry |
| `email_verification_expiry` | DateTime? | | |
| `password_reset_token` | String? | | |
| `password_reset_expiry` | DateTime? | | |
| `created_at` | DateTime | DEFAULT now() | |
| `updated_at` | DateTime | Auto-updated | |

**Relations:** ClinicMember[], Clinic[] (owned), RefreshToken[], DeviceToken[]

#### Clinic

Multi-tenant boundary — all data is scoped to a clinic via RLS.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `name` | String | NOT NULL | |
| `address` | String | NOT NULL | |
| `contact_phone` | String | NOT NULL | |
| `city` | String? | | |
| `gstin` | String? | | GST identification number |
| `logo_url` | String? | | |
| `working_hours` | Json? | | Structured schedule |
| `wizard_completed_at` | DateTime? | | Onboarding completion |
| `owner_id` | UUID (FK) | NOT NULL → `User` | |
| `created_at` | DateTime | DEFAULT now() | |
| `updated_at` | DateTime | Auto-updated | |

**Relations:** owner (User), ClinicMember[], PetOwner[], Pet[], QueueEntry[]

#### ClinicMember

Join table linking Users to Clinics. Multi-tenancy pivot.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `user_id` | UUID (FK) | NOT NULL → `User` | |
| `clinic_id` | UUID (FK) | NOT NULL → `Clinic` | |
| `is_active` | Boolean | DEFAULT true | |
| `created_at` | DateTime | DEFAULT now() | |

**Unique:** `(user_id, clinic_id)`
**Relations:** User, Clinic, ClinicMemberRole[], UserPermissionOverride[]

#### Role

System-defined roles.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `name` | String | Unique | Admin, Clinician, FrontDesk, InventoryManager |
| `description` | String | NOT NULL | |
| `created_at` | DateTime | DEFAULT now() | |

#### Permission

Granular permissions scoped by module.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `code` | String | Unique | e.g. `MANAGE_CLINIC_SETTINGS`, `MANAGE_USERS` |
| `description` | String | NOT NULL | |
| `module` | String | NOT NULL | Grouping key (auth, clinic, patient, etc.) |

#### RolePermission

Many-to-many: default permissions for each role.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `role_id` | UUID (FK) | → Role |
| `permission_id` | UUID (FK) | → Permission |

**Unique:** `(role_id, permission_id)`

#### ClinicMemberRole

Many-to-many: which roles a clinic member has.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `clinic_member_id` | UUID (FK) | → ClinicMember |
| `role_id` | UUID (FK) | → Role |
| `created_at` | DateTime | |

**Unique:** `(clinic_member_id, role_id)`

#### UserPermissionOverride

Per-user permission grants/denials that override role defaults.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `clinic_member_id` | UUID (FK) | → ClinicMember | |
| `permission_id` | UUID (FK) | → Permission | |
| `granted` | Boolean | NOT NULL | true = grant, false = deny |

**Unique:** `(clinic_member_id, permission_id)`

#### RefreshToken

JWT refresh tokens with family-based rotation and replay detection.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `user_id` | UUID (FK) | → User | |
| `token_hash` | String | Unique | Hashed token |
| `family_id` | UUID | | Groups rotation chain |
| `clinic_id` | UUID | | Scoped to clinic session |
| `expires_at` | DateTime | | 30 days |
| `revoked_at` | DateTime? | | Null if active |
| `ip_address` | String? | | |
| `user_agent` | String? | | |
| `created_at` | DateTime | | |

**Indexes:** `family_id`, `user_id`

#### AuthAuditLog

Immutable security audit trail. No update/delete operations.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `user_id` | UUID? | | Null for failed login attempts |
| `clinic_id` | UUID? | | |
| `event` | String | NOT NULL | See AuditEvent enum below |
| `ip_address` | String? | | |
| `user_agent` | String? | | |
| `metadata` | Json? | | Additional context |
| `created_at` | DateTime | | |

**Indexes:** `user_id`, `clinic_id`, `event`

**AuditEvent enum values:** SIGNUP, LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, TOKEN_REUSE_DETECTED, PASSWORD_RESET_REQUEST, PASSWORD_RESET_COMPLETE, PASSWORD_CHANGE, EMAIL_VERIFIED, OTP_SENT, OTP_VERIFIED, OTP_FAILED, ROLE_ASSIGNED, ROLE_REMOVED, PERMISSION_OVERRIDE, USER_INVITED, USER_DEACTIVATED, USER_REACTIVATED, SESSION_REVOKED, ACTIVE_CLINIC_SWITCH

#### Notification

In-app notifications delivered to users within a clinic context.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `recipient_user_id` | UUID | NOT NULL | |
| `clinic_id` | UUID | NOT NULL | |
| `type` | String | NOT NULL | Notification category |
| `module` | String | NOT NULL | Source module |
| `title` | String | NOT NULL | |
| `body` | String | NOT NULL | |
| `data` | Json | DEFAULT `{}` | |
| `is_read` | Boolean | DEFAULT false | |
| `created_at` | DateTime | | |

**Indexes:** `(recipient_user_id, clinic_id, is_read)`, `(recipient_user_id, clinic_id, created_at)`

#### DeviceToken

Push notification device registration (Expo push tokens).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `user_id` | UUID (FK) | → User |
| `token` | String | Expo push token |
| `platform` | String | ios, android |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

**Unique:** `(user_id, token)`

#### ConsentRecord

DPDP Act compliance — tracks user consent for data processing.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `owner_id` | UUID? | | Pet owner giving consent |
| `consent_type` | String | NOT NULL | Category of consent |
| `purpose_text` | String | NOT NULL | What they consented to |
| `granted_at` | DateTime | NOT NULL | |
| `withdrawn_at` | DateTime? | | Null if still active |
| `ip_address` | String? | | |
| `actor_id` | UUID? | | Staff who recorded it |
| `created_at` | DateTime | | |

**Index:** `owner_id`

### Phase 1 API Modules

#### Auth Module (`apps/api/src/modules/auth/`)

| File | Purpose |
|------|---------|
| `auth.service.ts` | Core business logic — signup, login, OTP, staff management |
| `auth.controller.ts` | HTTP request handlers |
| `auth.routes.ts` | Route definitions & plugin registration |
| `auth.schema.ts` | Zod validators & request schemas |
| `token.service.ts` | JWT token management — generation, refresh, rotation, revocation |
| `otp.service.ts` | OTP generation, Redis storage (300s TTL), verification |
| `email.service.ts` | Email delivery (verification, password reset) |
| `permission.service.ts` | RBAC resolution — role defaults + per-user overrides, Redis cache |

**API Endpoints (Public — no auth required):**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/auth/signup` | Create user + clinic + Admin role |
| GET | `/api/v1/auth/verify-email?token=` | Email verification |
| POST | `/api/v1/auth/password-reset/request` | Password reset email |
| POST | `/api/v1/auth/password-reset/confirm` | Password reset with token |
| POST | `/api/v1/auth/login` | Email + password login |
| POST | `/api/v1/auth/otp/request` | Send OTP to phone |
| POST | `/api/v1/auth/otp/verify` | Verify OTP + login |
| POST | `/api/v1/auth/token/refresh` | Refresh token rotation |
| POST | `/api/v1/auth/verify-email/resend` | Resend verification email |

**API Endpoints (Protected — JWT required):**

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| POST | `/api/v1/auth/logout` | — | Revoke refresh token |
| POST | `/api/v1/auth/password/change` | — | Change password, revoke all tokens |
| GET | `/api/v1/auth/clinics` | — | List user's clinic memberships |
| POST | `/api/v1/auth/active-clinic` | — | Switch active clinic |
| GET | `/api/v1/auth/permissions` | — | Get effective permissions |
| POST | `/api/v1/auth/staff/invite` | MANAGE_USERS | Invite staff by phone |
| PUT | `/api/v1/auth/staff/:memberId/roles` | MANAGE_ROLES | Update member roles |
| PUT | `/api/v1/auth/staff/:memberId/permissions` | MANAGE_ROLES | Override permissions |
| PUT | `/api/v1/auth/staff/:memberId/deactivate` | MANAGE_USERS | Soft deactivate |
| PUT | `/api/v1/auth/staff/:memberId/reactivate` | MANAGE_USERS | Reactivate member |

#### Clinic Module (`apps/api/src/modules/clinic/`)

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/v1/clinics/current` | — | Get current clinic profile |
| PUT | `/api/v1/clinics/current/profile` | MANAGE_CLINIC_SETTINGS | Update name, address, phone, city, GSTIN |
| PUT | `/api/v1/clinics/current/hours` | MANAGE_CLINIC_SETTINGS | Update working hours (JSON) |
| POST | `/api/v1/clinics/current/wizard-complete` | — | Mark setup wizard complete (idempotent) |

### Middleware & Auth Infrastructure

#### authenticate (`apps/api/src/middleware/authenticate.ts`)
- Decodes JWT from Authorization header via `@fastify/jwt`
- Verifies token type is `access` (not refresh)
- Sets `request.user = { id: sub, activeClinicId: clinicId }`
- Returns 401 on invalid/expired token

#### tenantContext (`apps/api/src/middleware/tenant-context.ts`)
- Reads `clinicId` from `request.user.activeClinicId`
- Creates tenant-scoped Prisma client via `createTenantClient(clinicId)`
- Sets `SET LOCAL app.clinic_id` for RLS enforcement
- Returns 400 if no clinic selected

#### authorize (`apps/api/src/middleware/authorize.ts`)
- Factory: `requirePermission(...permissions: string[])`
- Resolves user's effective permissions via PermissionService (role defaults + overrides)
- Returns 403 FORBIDDEN if user lacks any required permission
- Attaches `request.permissions` for downstream use

#### Audit Logging (`apps/api/src/lib/audit-log.ts`)
- `writeAuditLog(prisma, event, data)` — Immutable append to `auth_audit_log`
- Captures userId, clinicId, event, ipAddress, userAgent, metadata
- 21 event types covering all auth actions

### Mobile Auth Code

| File | Purpose |
|------|---------|
| `apps/mobile/src/lib/auth-storage.ts` | Secure token storage via `expo-secure-store` (iOS Keychain / Android Keystore) |
| `apps/mobile/src/lib/auth.ts` | Auth utility functions |
| `apps/mobile/src/providers/AuthProvider.tsx` | React context for auth state, token persistence, refresh logic |
| `apps/mobile/src/components/ClinicSwitcher.tsx` | Multi-clinic picker UI |
| `apps/mobile/src/components/LogoutAction.tsx` | Logout button with token revocation |
| `apps/mobile/src/lib/wizard-utils.ts` | Clinic setup wizard helpers |
| `apps/mobile/src/lib/deep-linking.ts` | Email verification + password reset deep links |
| `apps/mobile/src/lib/push-notifications.ts` | Expo push notification setup + device token registration |

**Auth Screens (Expo Router):**
- `(auth)/signup.tsx` — User registration with clinic info
- `(auth)/login.tsx` — Email + password login
- `(auth)/otp-login.tsx` — Phone + OTP login
- `(auth)/verify-email.tsx` — Email verification from deep link
- `(auth)/forgot-password.tsx` — Password reset request
- `(auth)/staff-setup.tsx` — Staff setup after invitation

### Phase 1 Tests

| Test File | What It Tests |
|-----------|--------------|
| `apps/api/tests/auth/signup.test.ts` | User + clinic creation, Admin role assignment, email verification token |
| `apps/api/tests/auth/login.test.ts` | Password login, email verification required, deactivated user blocked |
| `apps/api/tests/auth/otp-login.test.ts` | OTP generation, verification, rate limiting (3 per 5 min), expiry |
| `apps/api/tests/auth/token-refresh.test.ts` | Token rotation, replay detection, family revocation |
| `apps/api/tests/auth/logout.test.ts` | Token revocation, audit logging |
| `apps/api/tests/auth/password-reset.test.ts` | Reset flow, token generation, email sending |
| `apps/api/tests/auth/permissions.test.ts` | Permission resolution, role defaults, user overrides, Redis cache |
| `apps/api/tests/auth/role-assignment.test.ts` | Staff invite, role update, permission override, deactivation |
| `apps/api/tests/auth/clinic-switch.test.ts` | Multi-clinic switching, new token generation |
| `apps/api/tests/auth/email-resend.test.ts` | Verification email resend, rate limiting |
| `apps/api/tests/auth/reactivation.test.ts` | Member reactivation after deactivation |
| `apps/api/tests/tenant-isolation.test.ts` | Cross-tenant data isolation (Clinic A cannot see Clinic B data) |

**Test Helpers:**

| File | Purpose |
|------|---------|
| `apps/api/tests/helpers/setup.ts` | Global setup: connect test DB, run migrations, seed data |
| `apps/api/tests/helpers/factories.ts` | `createTestUser()`, `createTestClinic()`, `createTestClinicMember()`, `createTestTokens()`, `cleanupTestData()` |
| `apps/api/tests/helpers/app.ts` | `buildTestApp()` — Fastify instance with test config |

**Shared Package Schemas (auth):**

| Package | File | Exports |
|---------|------|---------|
| `@breeyo/validators` | `auth.ts` | `signupSchema`, `loginSchema`, `otpRequestSchema`, `otpVerifySchema`, `refreshTokenSchema`, `passwordResetRequestSchema`, `passwordResetConfirmSchema`, `inviteStaffBodySchema`, `updateRolesBodySchema`, `updatePermissionsBodySchema`, `changePasswordBodySchema`, `switchClinicBodySchema` |
| `@breeyo/types` | `auth.ts` | `User`, `Clinic`, `ClinicMember`, `RoleName`, `Role`, `Permission`, `TokenPayload`, `RefreshTokenPayload` |
| `@breeyo/types` | `api.ts` | `ApiError`, `ApiSuccess<T>`, `AUTH_ERRORS` (error code constants) |

