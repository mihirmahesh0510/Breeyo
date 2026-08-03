# Breeyo Phase 1: Foundation & Authentication

---

## For Product — What This Phase Does

Phase 1 builds the **identity, access control, and multi-tenancy foundation** that every subsequent phase depends on. Nothing in Breeyo works without this — it's the login, the clinic boundary, and the permission system.

### Features Delivered

1. **Self-Service Signup** — Vet creates account + clinic in one flow. The signup user becomes Admin automatically. No external approval needed.

2. **Email Verification** — Required before first login. Token-based with 24h expiry. Resend available with rate limiting.

3. **Password Authentication** — Argon2id hashing (memory-hard, GPU-resistant). Login with email + password.

4. **OTP Login** — SMS-based via MSG91 provider. 6-digit code, 5-minute expiry, rate limited to 3 OTPs per 5 minutes. Indian phone format (`+91XXXXXXXXXX`).

5. **Multi-Device Sessions** — Unlimited concurrent devices. JWT access tokens (15 min TTL) + refresh tokens (30 day TTL).

6. **Token Replay Detection** — Family-based token rotation. If a previously-used refresh token is resubmitted, the entire token family is revoked (all devices in that session chain).

7. **Staff Invitation** — Admins invite staff by phone number. System auto-creates user account with assigned role. No signup form needed for staff.

8. **RBAC (Role-Based Access Control)** — 4 system roles: Admin, Clinician, FrontDesk, InventoryManager. A user can hold multiple roles at a single clinic.

9. **Permission Overrides** — Per-user grant/deny that overrides role defaults. Redis-cached with 5-minute TTL for performance.

10. **Multi-Clinic Support** — Users can own or be members of multiple clinics. Switching clinic issues a new JWT scoped to that clinic.

11. **Staff Deactivation/Reactivation** — Blocks login without deleting data. Preserves audit trail. Sole-admin guard prevents accidental lockout.

12. **Password Change** — Forces logout on all devices by revoking every token for that user.

13. **Immutable Audit Logging** — All auth events recorded: login, logout, token refresh, role changes, permission overrides, OTP attempts, etc. No update/delete on audit records.

14. **Row-Level Security (RLS)** — Database-enforced tenant isolation. Two PostgreSQL roles: `breeyo_admin` (runs migrations) and `breeyo_app` (runs queries with RLS policies). Clinic A's data is never visible to Clinic B.

15. **Clinic Setup Wizard** — Profile completion, working hours configuration, wizard completion tracking (idempotent).

16. **Push Notification Registration** — Device token storage for Expo push notifications (iOS + Android).

17. **DPDP Act Compliance** — Consent records for data processing per India's Digital Personal Data Protection Act.

### User Flows

**Signup Flow:**
```
Vet enters email + phone + password + clinic info
  → User created (unverified)
  → Clinic created (owner = user)
  → ClinicMember created (user ↔ clinic)
  → Admin role assigned automatically
  → Verification email sent (24h token)
  → Vet clicks email link → email verified → can login
```

**Login Flow (Password):**
```
POST /auth/login { email, password }
  → Verify email is verified (else 403 EMAIL_NOT_VERIFIED)
  → Verify user is active (else 403 DEACTIVATED)
  → Verify password with Argon2
  → Find clinic memberships
  → Issue JWT (15 min) + refresh token (30 days)
  → Audit log: LOGIN_SUCCESS
  → Return { accessToken, refreshToken, user, clinics }
```

**Login Flow (OTP):**
```
POST /auth/otp/request { phone }
  → Rate check (max 3 per 5 min per phone)
  → Generate 6-digit code
  → Store in Redis with 300s TTL
  → Send SMS via MSG91
  → Audit log: OTP_SENT

POST /auth/otp/verify { phone, code }
  → Lookup code in Redis
  → Verify match (else OTP_FAILED)
  → Delete from Redis (one-time use)
  → Issue tokens (same as password login)
  → Audit log: OTP_VERIFIED
```

**Token Refresh Flow:**
```
POST /auth/token/refresh { refreshToken }
  → Hash incoming token
  → Look up in DB by hash
  → Check: is it revoked? → TOKEN_REUSE_DETECTED → revoke entire family
  → Check: is it expired? → TOKEN_EXPIRED
  → Revoke old token
  → Issue new refresh token (same family_id)
  → Issue new access token
  → Audit log: TOKEN_REFRESH
```

**Staff Invitation Flow:**
```
Admin calls POST /auth/staff/invite { phone, roles }
  → Find or create User by phone
  → Create ClinicMember (user ↔ admin's clinic)
  → Assign requested roles
  → Audit log: USER_INVITED
  → Staff logs in via OTP (no password needed)
```

---

## For Business — Rules, Compliance & Impact

### Business Rules

| Rule | Implementation | Rationale |
|------|---------------|-----------|
| One admin must always exist | Sole-admin deactivation guard (409 error) | Prevents clinic lockout |
| Email verification before login | `isEmailVerified` check on every login | Confirms ownership of email |
| OTP rate limited 3/5min | Redis counter per phone number | Prevents SMS abuse (cost + spam) |
| Refresh token replay = full revoke | Family-based detection revokes all tokens in chain | Security: compromised token invalidates entire session |
| Staff cannot self-invite | `MANAGE_USERS` permission required | Admin controls clinic access |
| Deactivation = soft block | `isActive: false`, no data deletion | Preserves audit trail, regulatory compliance |
| All auth events logged | Immutable `auth_audit_log` table | Security forensics, compliance |
| Clinic data isolation | PostgreSQL RLS policies | Multi-tenancy: Clinic A never sees Clinic B |

### Compliance

| Regulation | Implementation |
|-----------|---------------|
| **DPDP Act** (India) | `ConsentRecord` table tracks consent grants, withdrawals, purpose text, timestamps, actor |
| **Audit Requirements** | 21 event types, immutable records, IP + user agent captured |
| **Data Isolation** | RLS at database level, not just application code |
| **Password Security** | Argon2id (OWASP recommended), no plaintext storage |

### Roles & Permission Matrix

| Role | Description | Key Permissions |
|------|-------------|----------------|
| **Admin** | Clinic owner/manager | `MANAGE_CLINIC_SETTINGS`, `MANAGE_USERS`, `MANAGE_ROLES`, all module access |
| **Clinician** | Veterinarian | Patient management, queue management, EMR access |
| **FrontDesk** | Receptionist | Patient registration, queue check-in, billing |
| **InventoryManager** | Stock manager | Inventory CRUD, purchase orders |

Overrides: Admin can grant `MANAGE_CLINIC_SETTINGS` to a specific FrontDesk user, or deny `MANAGE_USERS` from a specific Admin — per-user, per-clinic.

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Global (all endpoints) | 200 requests | 1 minute |
| Auth endpoints | 20 requests | 1 minute |
| OTP requests | 3 per phone | 5 minutes |

---

## For Design — Screens & Interactions

### Mobile Auth Screens (Expo Router)

| Screen | File | Purpose |
|--------|------|---------|
| Signup | `(auth)/signup.tsx` | User registration with clinic info |
| Login | `(auth)/login.tsx` | Email + password login |
| OTP Login | `(auth)/otp-login.tsx` | Phone + OTP login |
| Verify Email | `(auth)/verify-email.tsx` | Email verification from deep link |
| Forgot Password | `(auth)/forgot-password.tsx` | Password reset request |
| Staff Setup | `(auth)/staff-setup.tsx` | Staff setup after invitation |

### Mobile Infrastructure

| File | Purpose |
|------|---------|
| `lib/auth-storage.ts` | Secure token storage via `expo-secure-store` (iOS Keychain / Android Keystore) |
| `lib/auth.ts` | Auth utility functions |
| `providers/AuthProvider.tsx` | React context for auth state, token persistence, auto-refresh logic |
| `components/ClinicSwitcher.tsx` | Multi-clinic picker UI |
| `components/LogoutAction.tsx` | Logout button with token revocation |
| `lib/wizard-utils.ts` | Clinic setup wizard helpers |
| `lib/deep-linking.ts` | Email verification + password reset deep links |
| `lib/push-notifications.ts` | Expo push notification setup + device token registration |

### Key Interaction Patterns

- **Token auto-refresh**: `AuthProvider` intercepts 401 responses, refreshes token silently, retries original request
- **Clinic switching**: `ClinicSwitcher` shows all memberships; selecting one calls `/auth/active-clinic`, replaces JWT, reloads data
- **Deep links**: Email verification and password reset links open the app directly to the correct screen

---

## For Engineering — Architecture & Implementation

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      IDENTITY & ACCESS                                      │
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────┐  │
│  │   User   │───<│ ClinicMember │>───│ClinicMemberRole  │───>│   Role   │  │
│  └──────────┘    └──────────────┘    └──────────────────┘    └──────────┘  │
│       │                │                                          │         │
│       │                │              ┌───────────────────────────┘         │
│       │          ┌─────┴──────────┐   │    ┌─────────────────┐             │
│       │          │UserPermOverride│   └───>│ RolePermission  │             │
│       │          └────────────────┘        └─────────────────┘             │
│       │                │                         │                         │
│       │          ┌─────┴───────┐                 │                         │
│       │          │ Permission  │<────────────────┘                         │
│       │          └─────────────┘                                           │
│       │                                                                     │
│  ┌────┴──────┐   ┌─────────────┐   ┌─────────────┐                        │
│  │RefreshToken│   │AuthAuditLog │   │ DeviceToken  │                       │
│  └───────────┘   └─────────────┘   └─────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ User.id = Clinic.ownerId
         │ ClinicMember links User ↔ Clinic
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLINIC (Multi-Tenant Boundary)                      │
│                                                                             │
│                        ┌──────────┐                                         │
│                        │  Clinic  │                                         │
│                        └──────────┘                                         │
│                                                                             │
│         All downstream data (Patients, Queue, Inventory, etc.)              │
│         is scoped to Clinic via clinicId FK + RLS policies                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      NOTIFICATIONS & COMPLIANCE                             │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Notification  │    │ DeviceToken   │    │ConsentRecord │                 │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Relationship Detail:**

```
User (1) ────── owns ────> (N) Clinic          [ownerId FK]
User (1) ────── member ──> (N) ClinicMember    [userId FK]
User (1) ────── has ─────> (N) RefreshToken    [userId FK]
User (1) ────── has ─────> (N) DeviceToken     [userId FK]

Clinic (1) ─── has ─────> (N) ClinicMember     [clinicId FK]

ClinicMember (1) ── has ─> (N) ClinicMemberRole    [clinicMemberId FK]
ClinicMember (1) ── has ─> (N) UserPermOverride    [clinicMemberId FK]

Role (1) ────── has ─────> (N) RolePermission      [roleId FK]
Permission (1) ─ has ────> (N) RolePermission      [permissionId FK]

Unique constraints:
  ClinicMember: (userId, clinicId)
  ClinicMemberRole: (clinicMemberId, roleId)
  RolePermission: (roleId, permissionId)
  UserPermOverride: (clinicMemberId, permissionId)
  RefreshToken: tokenHash
  DeviceToken: (userId, token)
```

### Database Models

#### User

Primary identity entity. Can own clinics and be a member of multiple clinics.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `email` | String | Unique, NOT NULL | |
| `phone` | String | Unique, NOT NULL | Indian format `+91XXXXXXXXXX` |
| `full_name` | String | NOT NULL | |
| `password_hash` | String | NOT NULL | Argon2id |
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

Multi-tenant boundary. All downstream data is scoped to a clinic via RLS.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `name` | String | NOT NULL | |
| `address` | String | NOT NULL | |
| `contact_phone` | String | NOT NULL | |
| `city` | String? | | |
| `gstin` | String? | | GST identification number (India) |
| `logo_url` | String? | | |
| `working_hours` | Json? | | Structured schedule object |
| `wizard_completed_at` | DateTime? | | Null = wizard incomplete |
| `owner_id` | UUID (FK) | NOT NULL → `User` | |
| `created_at` | DateTime | DEFAULT now() | |
| `updated_at` | DateTime | Auto-updated | |

**Relations:** owner (User), ClinicMember[], PetOwner[], Pet[], QueueEntry[]

#### ClinicMember

Join table linking Users to Clinics. The multi-tenancy pivot.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `user_id` | UUID (FK) | NOT NULL → `User` | |
| `clinic_id` | UUID (FK) | NOT NULL → `Clinic` | |
| `is_active` | Boolean | DEFAULT true | false = deactivated |
| `created_at` | DateTime | DEFAULT now() | |

**Unique:** `(user_id, clinic_id)`
**Relations:** User, Clinic, ClinicMemberRole[], UserPermissionOverride[]

#### Role

System-defined roles (seeded, not user-created).

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

Many-to-many: which roles a clinic member holds.

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

**Resolution algorithm:** `deny override > grant override > role default`

#### RefreshToken

JWT refresh tokens with family-based rotation and replay detection.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `user_id` | UUID (FK) | → User | |
| `token_hash` | String | Unique | SHA-256 hashed token |
| `family_id` | UUID | | Groups rotation chain |
| `clinic_id` | UUID | | Scoped to clinic session |
| `expires_at` | DateTime | | 30 days from creation |
| `revoked_at` | DateTime? | | Null = active |
| `ip_address` | String? | | |
| `user_agent` | String? | | |
| `created_at` | DateTime | | |

**Indexes:** `family_id`, `user_id`
**Business rule:** If a token with non-null `revoked_at` is reused, ALL tokens in that `family_id` are revoked (replay detection).

#### AuthAuditLog

Immutable security audit trail. No update/delete operations allowed.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | | |
| `user_id` | UUID? | | Null for failed login attempts |
| `clinic_id` | UUID? | | |
| `event` | String | NOT NULL | See 21 event types below |
| `ip_address` | String? | | |
| `user_agent` | String? | | |
| `metadata` | Json? | | Additional context |
| `created_at` | DateTime | | |

**Indexes:** `user_id`, `clinic_id`, `event`

**21 AuditEvent types:** `SIGNUP`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `TOKEN_REFRESH`, `TOKEN_REUSE_DETECTED`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET_COMPLETE`, `PASSWORD_CHANGE`, `EMAIL_VERIFIED`, `OTP_SENT`, `OTP_VERIFIED`, `OTP_FAILED`, `ROLE_ASSIGNED`, `ROLE_REMOVED`, `PERMISSION_OVERRIDE`, `USER_INVITED`, `USER_DEACTIVATED`, `USER_REACTIVATED`, `SESSION_REVOKED`, `ACTIVE_CLINIC_SWITCH`

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
| `platform` | String | `ios` or `android` |
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
| `withdrawn_at` | DateTime? | | Null = still active |
| `ip_address` | String? | | |
| `actor_id` | UUID? | | Staff who recorded it |
| `created_at` | DateTime | | |

**Index:** `owner_id`

### API Modules

#### Auth Module (`apps/api/src/modules/auth/`)

| File | Purpose |
|------|---------|
| `auth.service.ts` | Core business logic — signup, login, OTP, staff management |
| `auth.controller.ts` | HTTP request handlers — validates, delegates to service, formats response |
| `auth.routes.ts` | Route definitions & plugin registration |
| `auth.schema.ts` | Zod validators & request schemas |
| `token.service.ts` | JWT management — generation, refresh, rotation, family-based replay detection |
| `otp.service.ts` | OTP generation, Redis storage (300s TTL), rate limiting, verification |
| `email.service.ts` | Email delivery (verification, password reset) |
| `permission.service.ts` | RBAC resolution — role defaults + per-user overrides, Redis cache (5 min TTL) |

**Public Endpoints (no auth required):**

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

**Protected Endpoints (JWT required):**

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| POST | `/api/v1/auth/logout` | -- | Revoke refresh token |
| POST | `/api/v1/auth/password/change` | -- | Change password, revoke all tokens |
| GET | `/api/v1/auth/clinics` | -- | List user's clinic memberships |
| POST | `/api/v1/auth/active-clinic` | -- | Switch active clinic (new JWT) |
| GET | `/api/v1/auth/permissions` | -- | Get effective permissions |
| POST | `/api/v1/auth/staff/invite` | `MANAGE_USERS` | Invite staff by phone |
| PUT | `/api/v1/auth/staff/:memberId/roles` | `MANAGE_ROLES` | Update member roles |
| PUT | `/api/v1/auth/staff/:memberId/permissions` | `MANAGE_ROLES` | Override permissions |
| PUT | `/api/v1/auth/staff/:memberId/deactivate` | `MANAGE_USERS` | Soft deactivate |
| PUT | `/api/v1/auth/staff/:memberId/reactivate` | `MANAGE_USERS` | Reactivate member |

**Key Business Logic (AuthService):**

- `signup()` — Validates input via Zod. Hashes password with Argon2. Creates User + Clinic + ClinicMember in transaction. Assigns Admin role. Generates email verification token (24h). Sends verification email. Audit log: SIGNUP.
- `login()` — Validates credentials. Checks `isEmailVerified` (403 EMAIL_NOT_VERIFIED). Checks `isActive` (403 DEACTIVATED). Verifies password. Finds clinic memberships. Issues access + refresh tokens. Audit log: LOGIN_SUCCESS or LOGIN_FAILED.
- `inviteStaff()` — Finds or creates User by phone. Creates ClinicMember. Assigns roles. Audit log: USER_INVITED.
- `deactivateStaff()` — Checks sole-admin guard (409 if last admin). Sets `isActive: false`. Revokes all tokens. Audit log: USER_DEACTIVATED.
- `reactivateStaff()` — Checks not already active (409 ALREADY_ACTIVE). Sets `isActive: true`. Audit log: USER_REACTIVATED.
- `changePassword()` — Verifies current password. Hashes new password. Revokes ALL refresh tokens for user. Audit log: PASSWORD_CHANGE.
- `switchActiveClinic()` — Verifies membership at target clinic. Issues new JWT scoped to new clinic. Audit log: ACTIVE_CLINIC_SWITCH.

**Key Business Logic (TokenService):**

- `generateAccessToken()` — Signs JWT with `{ sub: userId, clinicId, type: 'access' }`, 15 min expiry.
- `generateRefreshToken()` — Generates random token, hashes with SHA-256, stores in DB with `familyId`. New login = new family. Refresh = same family.
- `refreshTokens()` — Looks up by hash. If `revoked_at` is set: replay detected → revoke entire family, audit log TOKEN_REUSE_DETECTED. If expired: reject. Otherwise: revoke old, issue new (same family), audit log TOKEN_REFRESH.
- `revokeFamily()` — Sets `revoked_at` on ALL tokens sharing a `family_id`.

**Key Business Logic (PermissionService):**

- `getEffectivePermissions()` — Resolution: (1) Get all role permissions via ClinicMemberRole → RolePermission. (2) Apply UserPermissionOverride (deny wins over grant). (3) Cache result in Redis with key `perms:{clinicMemberId}`, 5 min TTL.
- `hasPermission()` — Checks if specific permission code exists in effective permissions. Used by `authorize` middleware.

#### Clinic Module (`apps/api/src/modules/clinic/`)

| File | Purpose |
|------|---------|
| `clinic.service.ts` | Clinic profile and setup operations |
| `clinic.controller.ts` | HTTP request handlers |
| `clinic.routes.ts` | Route definitions with auth + tenant middleware |
| `clinic.schema.ts` | Zod validators for profile updates |

| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/v1/clinics/current` | -- | Get current clinic profile |
| PUT | `/api/v1/clinics/current/profile` | `MANAGE_CLINIC_SETTINGS` | Update name, address, phone, city, GSTIN |
| PUT | `/api/v1/clinics/current/hours` | `MANAGE_CLINIC_SETTINGS` | Update working hours (JSON) |
| POST | `/api/v1/clinics/current/wizard-complete` | -- | Mark setup wizard complete (idempotent) |

**Key Business Logic (ClinicService):**

- `getClinic()` — `findUniqueOrThrow` by clinicId.
- `updateProfile()` — Partial update of name, address, contactPhone, city, GSTIN.
- `updateWorkingHours()` — Accepts structured JSON schedule, stores as JSONB.
- `completeWizard()` — Idempotent: if `wizardCompletedAt` already set, returns existing record unchanged.

### Middleware & Infrastructure

#### authenticate (`apps/api/src/middleware/authenticate.ts`)
- Decodes JWT from `Authorization: Bearer <token>` header via `@fastify/jwt`
- Verifies token type is `access` (not refresh)
- Sets `request.user = { id: sub, activeClinicId: clinicId }`
- Returns 401 on invalid/expired token

#### tenantContext (`apps/api/src/middleware/tenant-context.ts`)
- Reads `clinicId` from `request.user.activeClinicId`
- Creates tenant-scoped Prisma client via `createTenantClient(clinicId)`
- Executes `SET LOCAL app.clinic_id = '{clinicId}'` for RLS enforcement
- Returns 400 if no clinic selected

#### authorize (`apps/api/src/middleware/authorize.ts`)
- Factory function: `requirePermission(...permissions: string[])`
- Resolves user's effective permissions via PermissionService (role defaults + overrides)
- Returns 403 FORBIDDEN if user lacks any required permission
- Attaches `request.permissions` for downstream use

#### Error Handler (`apps/api/src/middleware/error-handler.ts`)
- Centralized error formatting
- Converts Fastify validation errors to `{ error: { code, message } }` format
- Handles Prisma errors (P2002 unique constraint, P2025 not found)
- Structured logging for all errors

#### Audit Log (`apps/api/src/lib/audit-log.ts`)
- `writeAuditLog(prisma, event, data)` — Immutable append to `auth_audit_log`
- Captures: userId, clinicId, event, ipAddress, userAgent, metadata
- 21 event types covering all auth actions
- No update/delete functions exist for this table

#### Prisma RLS (`apps/api/src/lib/prisma-rls.ts`)
- `createTenantClient(clinicId)` — Returns Prisma client that sets `SET LOCAL app.clinic_id` on every transaction
- Ensures all queries are scoped by RLS policies at the database level
- RLS setup scripts: `prisma/init-rls-roles.sql`, `prisma/post-migrate.sql`

#### App Bootstrap (`apps/api/src/app.ts`)
Plugin registration order:
1. Error handler
2. Prisma plugin (database)
3. Redis plugin (cache/queue)
4. `@fastify/jwt` (secret from env)
5. `@fastify/cookie`
6. `@fastify/cors` (web + mobile origins)
7. `@fastify/rate-limit` (200/min global, Redis-backed)
8. Health check endpoint (`/health`)
9. Auth routes (20/min rate limit override)
10. Notification routes
11. Clinic routes
12. Patient routes
13. Socket.IO plugin
14. Queue routes
15. Midnight archive cron (non-test only)

### Shared Packages

#### `@breeyo/types` — Type Definitions

| File | Exports |
|------|---------|
| `auth.ts` | `User`, `Clinic`, `ClinicMember`, `RoleName`, `Role`, `Permission`, `TokenPayload`, `RefreshTokenPayload` |
| `api.ts` | `ApiError`, `ApiSuccess<T>`, `AUTH_ERRORS` (error code constants) |

#### `@breeyo/validators` — Zod Schemas

| Schema | Field | Rule |
|--------|-------|------|
| `signupSchema` | email | Valid email, required |
| | phone | Indian format `+91XXXXXXXXXX` |
| | password | Min 8 chars |
| | fullName | 1-100 chars |
| | clinicName | Required |
| | clinicAddress | Required |
| | clinicPhone | Required |
| `loginSchema` | email | Valid email |
| | password | Required |
| `otpRequestSchema` | phone | Indian format `+91XXXXXXXXXX` |
| `otpVerifySchema` | phone | Indian format |
| | code | 6-digit string |
| `refreshTokenSchema` | refreshToken | Required string |
| `changePasswordSchema` | currentPassword | Required |
| | newPassword | Min 8 chars |
| `inviteStaffBodySchema` | phone | Indian format |
| | roles | Array of RoleName (min 1) |
| `updateRolesBodySchema` | roles | Array of RoleName |
| `updatePermissionsBodySchema` | overrides | Array of `{ permissionCode, granted }` |
| `switchClinicBodySchema` | clinicId | UUID |

### Phase 1 Error Codes

| Code | Status | Trigger |
|------|--------|---------|
| `EMAIL_NOT_VERIFIED` | 403 | Login before verifying email |
| `DEACTIVATED` | 403 | Login by deactivated user |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `TOKEN_EXPIRED` | 401 | Expired access or refresh token |
| `TOKEN_REUSE_DETECTED` | 401 | Replay attack — entire family revoked |
| `EMAIL_NOT_VERIFIED` | 403 | Attempt to use unverified email |
| `OTP_RATE_LIMIT` | 429 | More than 3 OTP requests in 5 min |
| `OTP_INVALID` | 401 | Wrong or expired OTP code |
| `FORBIDDEN` | 403 | Missing required permission |
| `ALREADY_ACTIVE` | 409 | Reactivating an already-active member |
| `SOLE_ADMIN` | 409 | Deactivating the last admin |
| `MEMBER_NOT_FOUND` | 404 | Staff member not in clinic |
| `VALIDATION_ERROR` | 400 | Zod schema validation failure |

### Tests

#### Auth Tests

| Test File | Tests | What It Covers |
|-----------|-------|---------------|
| `auth/signup.test.ts` | Signup flow | User + clinic creation, Admin role assignment, email verification token, duplicate email rejection |
| `auth/login.test.ts` | Login flow | Password verification, email verification required, deactivated user blocked, wrong password |
| `auth/otp-login.test.ts` | OTP flow | OTP generation, verification, rate limiting (3/5min), expiry, wrong code |
| `auth/token-refresh.test.ts` | Token rotation | Refresh rotation, replay detection, family revocation, expired token |
| `auth/logout.test.ts` | Logout | Token revocation, audit logging |
| `auth/password-reset.test.ts` | Password reset | Reset flow, token generation, email sending, token expiry |
| `auth/permissions.test.ts` | RBAC | Permission resolution, role defaults, user overrides, Redis cache, deny > grant |
| `auth/role-assignment.test.ts` | Staff management | Invite, role update, permission override, deactivation, sole-admin guard, reactivation, already-active check |
| `auth/clinic-switch.test.ts` | Clinic switching | Multi-clinic switching, new token generation, invalid clinic |
| `auth/email-resend.test.ts` | Email resend | Verification email resend, rate limiting |
| `auth/reactivation.test.ts` | Reactivation | Member reactivation after deactivation, already-active guard, permission check |
| `tenant-isolation.test.ts` | RLS | Cross-tenant data isolation (Clinic A cannot see Clinic B data) |

#### Test Helpers

| File | Purpose |
|------|---------|
| `tests/helpers/setup.ts` | Global setup: connect test DB, run migrations, seed roles + permissions |
| `tests/helpers/factories.ts` | `createTestUser()`, `createTestClinic()`, `createTestClinicMember()`, `createTestTokens()`, `cleanupTestData()` |
| `tests/helpers/app.ts` | `buildTestApp()` — Fastify instance with `{ logger: false }`, test rate limits |

---

## How It All Connects

### What Phase 1 Provides to Downstream Phases

```
Phase 1 EXPORTS:
├── User model (identity for all actors)
├── Clinic model (tenant boundary for ALL data)
├── ClinicMember (user ↔ clinic link)
├── authenticate middleware (JWT verification → request.user)
├── tenantContext middleware (clinic scoping → request.db)
├── authorize middleware (permission checking)
├── Audit logging (reusable for any module)
├── Token rotation (secure session management)
├── Error format convention ({ error: { code, message } })
├── Rate limiting (global + per-route)
└── API versioning convention (/api/v1/...)

Phase 2 CONSUMES:
├── Auth screens depend on AuthProvider
├── ClinicSwitcher uses /auth/clinics + /auth/active-clinic
└── WizardStepper uses /clinics/current/wizard-complete

Phase 3 CONSUMES:
├── Every patient/queue endpoint uses [authenticate, tenantContext]
├── PetOwner, Pet, QueueEntry all have clinicId FK
├── Queue check-in records checkedInBy (User.id)
└── Socket.IO rooms scoped to clinic:{clinicId}
```

### Multi-Tenancy Architecture

```
JWT Token: { sub: userId, clinicId: "abc-123" }
                    │
                    ▼
           ┌────────────────┐
           │  authenticate  │  Decodes JWT → request.user
           └────────┬───────┘
                    │
                    ▼
           ┌────────────────┐
           │ tenantContext   │  SET LOCAL app.clinic_id = 'abc-123'
           └────────┬───────┘
                    │
                    ▼
           PostgreSQL RLS policies enforce:
           WHERE clinic_id = current_setting('app.clinic_id')

           Result: Clinic A's users CANNOT see Clinic B's data,
           even if application code omits WHERE clause.
```
