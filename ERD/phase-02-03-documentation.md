# Breeyo ERD Documentation: Phase 1, Phase 2 & Phase 3

## Table of Contents

1. [Phase 1: Foundation & Authentication](#phase-1-foundation--authentication)
   - [What This Phase Does (Product Features)](#phase-1-product-features)
   - [Entity Relationship Diagram](#phase-1-entity-relationship-diagram)
   - [Database Models](#phase-1-database-models)
   - [API Modules](#phase-1-api-modules)
   - [Middleware & Auth Infrastructure](#middleware--auth-infrastructure)
   - [Mobile Auth Code](#mobile-auth-code)
   - [Tests](#phase-1-tests)
2. [Phase 2: UI/UX Design & Design System](#phase-2-uiux-design--design-system)
   - [What This Phase Does (Product Features)](#phase-2-product-features)
   - [Code Architecture](#phase-2-code-architecture)
   - [Design Tokens & Theme System](#design-tokens--theme-system)
   - [Component Library](#component-library)
   - [Wireframes & Storybook](#wireframes--storybook)
   - [Tests](#phase-2-tests)
2. [Phase 3: Patient Registration & Walk-in Queue](#phase-3-patient-registration--walk-in-queue)
   - [What This Phase Does (Product Features)](#phase-3-product-features)
   - [Entity Relationship Diagram](#phase-3-entity-relationship-diagram)
   - [Database Models](#phase-3-database-models)
   - [API Modules](#phase-3-api-modules)
   - [Mobile App Code](#phase-3-mobile-app-code)
   - [Shared Packages](#phase-3-shared-packages)
   - [Tests](#phase-3-tests)
3. [How It All Connects](#how-it-all-connects)

---

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

---

## Phase 2: UI/UX Design & Design System

### Phase 2 Product Features

Phase 2 establishes the **visual and interaction foundation** for the entire Breeyo app. It does **not add any database models** — it builds the component library, design tokens, and wireframes that all subsequent feature phases consume.

**What it delivers:**

- **Design token system** — Colors, typography (7-level scale), spacing (8px base), elevation, border radius, animation timing
- **26-component library** organized in atomic design (atoms > molecules > organisms)
- **Wireframe stories** for every major module (queue, EMR, inventory, billing, scheduling, notifications, portal) showing all 4 states: empty, loading, populated, error
- **i18n support** — English and Hindi translations via i18next
- **Accessibility** — WCAG 2.1 AA compliance, 4.5:1 contrast ratios, 44x44pt tap targets

### Phase 2 Code Architecture

```
packages/ui/
├── src/
│   ├── theme/                     # Design tokens
│   │   ├── colors.ts              # Primary (#2E7D32), Secondary (#5D4037), Tertiary (#E65100)
│   │   ├── typography.ts          # 7-level scale: Display → Overline
│   │   ├── spacing.ts             # 8px base: 8, 16, 24, 32, 40, 48, 56, 64
│   │   ├── elevation.ts           # Shadow/elevation levels
│   │   ├── borderRadius.ts        # Rounded corners
│   │   ├── animation.ts           # Motion timing
│   │   ├── theme.ts               # Composed theme object
│   │   ├── types.ts               # Theme TypeScript types
│   │   └── __tests__/             # Theme + token tests
│   │
│   ├── atoms/                     # Smallest UI primitives
│   │   ├── Avatar/
│   │   ├── Button/                # 3 variants: filled, outlined, text
│   │   ├── Chip/
│   │   ├── Divider/
│   │   ├── IconButton/
│   │   ├── NotificationBadge/
│   │   ├── ProgressIndicator/
│   │   ├── StatusBadge/           # Queue status indicators (Waiting, In Consult, Done, No Show)
│   │   ├── TextInput/
│   │   └── Typography/            # 7-level type scale
│   │
│   ├── molecules/                 # Composed from atoms
│   │   ├── AccordionItem/
│   │   ├── EmptyState/            # Illustrative empty states with action buttons
│   │   ├── FormField/
│   │   ├── ListItem/
│   │   ├── NotificationItem/
│   │   ├── SearchBar/             # Debounced search with clear action
│   │   ├── SkeletonLoader/        # Shimmer loading placeholders
│   │   └── Toast/                 # Success/error feedback popups
│   │
│   ├── organisms/                 # Complex composed components
│   │   ├── BottomSheet/           # Slide-up panels (check-in flow)
│   │   ├── BottomTabBar/          # Primary navigation: Queue, Patients, Inventory, More
│   │   ├── Card/                  # Compound component: Card.Header, Card.Body
│   │   ├── Modal/
│   │   ├── NavigationBar/
│   │   ├── NotificationList/
│   │   ├── QueueCard/             # Queue entry card with status badge
│   │   └── WizardStepper/        # Multi-step form wizard
│   │
│   ├── wireframes/               # Hi-fidelity wireframe stories
│   │   ├── auth/                  # LoginScreen, SignupScreen
│   │   ├── queue/                 # QueueStatusBoard, CheckInFlow
│   │   ├── emr/                   # ConsultationScreen, PatientHistoryScreen
│   │   ├── inventory/             # InventoryListScreen, AddItemScreen
│   │   ├── billing/               # InvoiceScreen
│   │   ├── scheduling/            # CalendarScreen
│   │   ├── notifications/         # NotificationScreen
│   │   ├── portal/                # OwnerPortalScreen
│   │   ├── dashboard/             # DashboardScreen
│   │   └── whatsapp/              # MessageLogScreen
│   │
│   └── i18n/
│       ├── config.ts
│       └── locales/
│           ├── en/common.json     # English translations
│           └── hi/common.json     # Hindi translations
```

### Design Tokens & Theme System

**Color Palette (Warm & Friendly — differentiates from clinical human healthcare):**

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#2E7D32` | Green — primary actions, navigation |
| Secondary | `#5D4037` | Brown — secondary elements |
| Tertiary | `#E65100` | Orange — alerts, emergency indicators |
| Background | `#FFFBF5` | Warm white — screen backgrounds |

**Typography Scale (7 levels):**

| Level | Usage |
|-------|-------|
| Display | Hero text, splash screens |
| Heading 1 | Screen titles |
| Heading 2 | Section headers |
| Subheading | Card titles, list headers |
| Body | Primary content text |
| Caption | Timestamps, secondary info |
| Overline | Labels, categories |

**Spacing (8px base grid):** 8, 16, 24, 32, 40, 48, 56, 64px

**Key Design Decisions:**
- Material Design 3 foundation via React Native Paper v5
- Light mode only for Beta
- Mobile-first breakpoints (320-480px)
- Controlled components with explicit state management
- Compound component pattern (e.g., `<Card><Card.Header/><Card.Body/></Card>`)
- Context-based theming for hot-swappable theme support

### Component Library

**26 components across 3 tiers:**

| Tier | Components | Count |
|------|-----------|-------|
| Atoms | Avatar, Button, Chip, Divider, IconButton, NotificationBadge, ProgressIndicator, StatusBadge, TextInput, Typography | 10 |
| Molecules | AccordionItem, EmptyState, FormField, ListItem, NotificationItem, SearchBar, SkeletonLoader, Toast | 8 |
| Organisms | BottomSheet, BottomTabBar, Card, Modal, NavigationBar, NotificationList, QueueCard, WizardStepper | 8 |

### Wireframes & Storybook

Each wireframe module has `.stories.ts` files showing all 4 states:

| Module | Stories | States |
|--------|---------|--------|
| Auth | LoginScreen, SignupScreen | empty, loading, populated, error |
| Queue | QueueStatusBoard, CheckInFlow | empty, loading, populated, error |
| EMR | ConsultationScreen, PatientHistoryScreen | empty, loading, populated, error |
| Inventory | InventoryListScreen, AddItemScreen | empty, loading, populated, error |
| Billing | InvoiceScreen | empty, loading, populated, error |
| Scheduling | CalendarScreen | empty, loading, populated, error |
| Notifications | NotificationScreen | empty, loading, populated, error |
| Portal | OwnerPortalScreen | empty, loading, populated, error |
| Dashboard | DashboardScreen | empty, loading, populated, error |
| WhatsApp | MessageLogScreen | empty, loading, populated, error |

### Phase 2 Tests

| Test File | What It Tests |
|-----------|--------------|
| `packages/ui/src/atoms/Button/Button.test.ts` | Button variants (filled, outlined, text), press handlers, disabled state |
| `packages/ui/src/atoms/TextInput/TextInput.test.ts` | Input rendering, value changes, error display |
| `packages/ui/src/atoms/Typography/Typography.test.ts` | Typography scale rendering, style application |
| `packages/ui/src/atoms/StatusBadge/StatusBadge.test.ts` | Status badge colors, labels for each queue status |
| `packages/ui/src/atoms/NotificationBadge/NotificationBadge.test.ts` | Badge count display, visibility |
| `packages/ui/src/molecules/EmptyState/EmptyState.test.ts` | Empty state rendering with illustration and CTA |
| `packages/ui/src/molecules/ListItem/ListItem.test.ts` | List item rendering, press handlers |
| `packages/ui/src/molecules/AccordionItem/AccordionItem.test.ts` | Expand/collapse behavior |
| `packages/ui/src/molecules/NotificationItem/NotificationItem.test.ts` | Notification display, read/unread states |
| `packages/ui/src/organisms/Card/Card.test.ts` | Card compound component rendering |
| `packages/ui/src/organisms/QueueCard/QueueCard.test.ts` | Queue card with status badge, pet info, owner info |
| `packages/ui/src/organisms/NotificationList/NotificationList.test.ts` | Notification list rendering, empty state |
| `packages/ui/src/theme/__tests__/theme.test.ts` | Theme object structure, color accessibility |
| `packages/ui/src/theme/__tests__/tokens.test.ts` | Token values, spacing scale, typography scale |
| `packages/ui/src/__tests__/accessibility.test.ts` | WCAG 2.1 AA contrast ratios, tap target sizes |

---

## Phase 3: Patient Registration & Walk-in Queue

### Phase 3 Product Features

Phase 3 is the **first feature phase** — it builds the core daily workflow for veterinary clinics:

1. **Pet Owner Registration** — Register pet owners by mobile number (unique key per clinic). Auto-detect returning owners by mobile. Minimal required fields: mobile + name.

2. **Pet Registration** — Register pets linked to owners. Required: pet name + species. Optional: breed, age, weight, color, microchip ID, photo, notes. Two-step wizard: Step 1 (owner) → Step 2 (pet).

3. **Walk-in Queue (Home Screen)** — Real-time queue board showing three sections: In Consult (top), Waiting (middle), Done (bottom). This is the screen vets see immediately after login.

4. **2-Tap Check-in** — FAB opens check-in bottom sheet → enter mobile → auto-shows owner + pets → tap pet to check in. Optional visit reason and emergency toggle.

5. **Queue Status Management** — State machine: WAITING → IN_CONSULT → DONE. Alternative: WAITING → NO_SHOW, IN_CONSULT → NO_SHOW. "Call Next" button auto-selects the next waiting patient (emergencies first).

6. **Patient Search** — Live fuzzy search across owner name, mobile number, and pet name using PostgreSQL `pg_trgm` trigram matching.

7. **Pet Profiles** — Pet detail page with owner info, visit history timeline, and edit mode for updating optional fields.

8. **Real-time Sync** — WebSocket (Socket.IO) broadcasts check-ins and status changes to all connected devices within a clinic. Offline banner when disconnected.

9. **Wait Time Estimation** — Average consultation time calculated from last 7 days of data. Defaults to 15 minutes when insufficient data (<5 data points).

10. **Same-day Re-check-in** — If a pet was already seen today, system prompts confirmation before allowing a second check-in (D-40).

### Phase 3 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 1: IDENTITY & ACCESS (Foundation)                │
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
│                     CLINIC (Multi-Tenant Boundary)                          │
│                                                                             │
│                        ┌──────────┐                                         │
│                        │  Clinic  │                                         │
│                        └──────────┘                                         │
│                       /     |      \                                        │
│                      /      |       \                                       │
│                     ▼       ▼        ▼                                      │
│           ┌──────────┐ ┌────────┐ ┌────────────┐                           │
│           │ PetOwner │ │  Pet   │ │ QueueEntry │                           │
│           └──────────┘ └────────┘ └────────────┘                           │
│                  ↑          ↑            ↑                                  │
│                  └──────────┘            │                                  │
│                  owner ──> pets          │                                  │
│                       ↑                  │                                  │
│                       └──────────────────┘                                  │
│                       pet ──> queueEntries                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLIANCE                                           │
│                                                                             │
│                   ┌──────────────┐                                          │
│                   │ConsentRecord │   (DPDP Act — tracks owner consent)      │
│                   └──────────────┘                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Relationship Detail:**

```
Clinic (1) ──── owns ────> (N) PetOwner     [clinicId FK, unique(clinicId, mobile)]
Clinic (1) ──── owns ────> (N) Pet          [clinicId FK]
Clinic (1) ──── owns ────> (N) QueueEntry   [clinicId FK]

PetOwner (1) ── has ─────> (N) Pet          [ownerId FK]
Pet (1) ────── checked ──> (N) QueueEntry   [petId FK]

User (1) ────── owns ────> (N) Clinic       [ownerId FK]
User (1) ────── member ──> (N) ClinicMember [userId FK]
```

### Phase 3 Database Models

#### PetOwner

Pet owner registered at a clinic. Mobile number is the unique identifier per clinic (Indian mobile: 10 digits starting with 6-9).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `clinic_id` | UUID (FK) | NOT NULL → `Clinic` | Tenant scoping |
| `mobile` | String | NOT NULL | 10-digit Indian mobile |
| `name` | String | NOT NULL | Owner's full name |
| `email` | String? | | Optional |
| `address` | String? | | Collected later for invoicing |
| `alt_phone` | String? | | Alternate contact |
| `created_at` | DateTime | DEFAULT now() | |
| `updated_at` | DateTime | Auto-updated | |

**Unique constraint:** `(clinic_id, mobile)` — one owner per mobile per clinic
**Indexes:** `(clinic_id)`, `(clinic_id, name)`
**Business rule:** Upsert behavior — if mobile exists at clinic, returns existing owner without updating (D-06)

#### Pet

A patient animal linked to an owner and scoped to a clinic.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `clinic_id` | UUID (FK) | NOT NULL → `Clinic` | Tenant scoping |
| `owner_id` | UUID (FK) | NOT NULL → `PetOwner` | |
| `name` | String | NOT NULL | Pet name (Unicode/Hindi supported) |
| `species` | Enum | NOT NULL | DOG, CAT, BIRD, RABBIT, FISH, REPTILE, OTHER |
| `breed` | String? | | From curated breed list per species |
| `birth_year` | Int? | 1990-2030 | Approximate age |
| `birth_month` | Int? | 1-12 | |
| `weight` | Float? | max 500 | In kg |
| `color` | String? | max 50 | |
| `microchip_id` | String? | max 50 | |
| `photo_url` | String? | URL | Camera/gallery upload |
| `notes` | String? | max 1000 | Behavioral warnings, allergies |
| `created_at` | DateTime | DEFAULT now() | |
| `updated_at` | DateTime | Auto-updated | |

**Indexes:** `(clinic_id)`, `(clinic_id, owner_id)`, `(clinic_id, name)`
**Business rule:** Only name + species required at registration. Everything else filled during consultation (D-04).

**Species Enum:**

| Value | Label | Icon | Breeds Count |
|-------|-------|------|-------------|
| DOG | Dog | `dog` | 38 breeds (incl. Indian: Indie, Rajapalayam, Mudhol Hound, Chippiparai, etc.) |
| CAT | Cat | `cat` | 16 breeds |
| BIRD | Bird | `bird` | 11 breeds |
| RABBIT | Rabbit | `rabbit` | 8 breeds |
| FISH | Fish | `fish` | 8 breeds |
| REPTILE | Reptile | `turtle` | 7 breeds |
| OTHER | Other | `paw` | — |

#### QueueEntry

A single check-in event for a pet on a given day. The core of the walk-in queue workflow.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | UUID (PK) | `gen_random_uuid()` | |
| `clinic_id` | UUID (FK) | NOT NULL → `Clinic` | Tenant scoping |
| `pet_id` | UUID (FK) | NOT NULL → `Pet` | |
| `checked_in_by` | UUID | NOT NULL | User who performed check-in |
| `treating_vet_id` | UUID? | | Set when status → IN_CONSULT (D-37) |
| `status` | Enum | NOT NULL, DEFAULT `WAITING` | State machine controlled |
| `position` | Int | NOT NULL | Queue position at time of check-in |
| `is_emergency` | Boolean | DEFAULT false | Emergency → red badge, jumps queue |
| `visit_reason` | String? | | Vaccination, Sick visit, Follow-up, etc. |
| `checked_in_at` | DateTime | DEFAULT now() | |
| `called_at` | DateTime? | | Set when WAITING → IN_CONSULT |
| `completed_at` | DateTime? | | Set when → DONE or NO_SHOW |
| `archived_at` | DateTime? | | Set by midnight auto-archive |
| `updated_at` | DateTime | Auto-updated | |

**Indexes:** `(clinic_id, status)`, `(clinic_id, checked_in_at)`, `(clinic_id, pet_id, checked_in_at)`

**Queue Status State Machine:**

```
                    ┌──────────────┐
                    │   WAITING    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            │            ▼
     ┌────────────────┐    │    ┌──────────────┐
     │  IN_CONSULT    │    │    │   NO_SHOW    │ (terminal)
     └────────┬───────┘    │    └──────────────┘
              │            │
         ┌────┼────┐       │
         │         │       │
         ▼         ▼       │
  ┌──────────┐ ┌──────────────┐
  │   DONE   │ │   NO_SHOW    │
  │(terminal)│ │  (terminal)  │
  └──────────┘ └──────────────┘
```

**Valid transitions:**

| From | To | Trigger |
|------|----|---------|
| WAITING | IN_CONSULT | "Call Next" button or tap specific patient |
| WAITING | NO_SHOW | Long-press status badge → "Mark No-show" |
| IN_CONSULT | DONE | Tap status badge to cycle, or consultation ends |
| IN_CONSULT | NO_SHOW | Long-press status badge |

**Terminal states:** DONE, NO_SHOW — no further transitions allowed.

**Midnight auto-archive (D-23):**
- WAITING and DONE entries → `archivedAt` set at midnight IST
- IN_CONSULT entries persist past midnight (D-39) — carry over to next day

#### Visit Reasons

Pre-defined visit reason quick-select options:

| Value | Label |
|-------|-------|
| `vaccination` | Vaccination |
| `sick_visit` | Sick Visit |
| `follow_up` | Follow-up |
| `deworming` | Deworming |
| `grooming` | Grooming |
| `other` | Other |

### Phase 3 API Modules

#### Patient Module (`apps/api/src/modules/patient/`)

| File | Purpose |
|------|---------|
| `patient.types.ts` | Interface definitions (RegisterOwnerParams, RegisterPetParams, etc.) |
| `patient.schema.ts` | Zod validation schemas for request bodies/params |
| `patient.repository.ts` | Data access layer — Prisma queries, raw SQL for search |
| `patient.service.ts` | Business logic — validation, owner-pet linking |
| `patient.controller.ts` | HTTP request/response handling |
| `patient.routes.ts` | Route registration with middleware |

**API Endpoints:**

| Method | Route | Auth | Description | Decision Ref |
|--------|-------|------|-------------|-------------|
| POST | `/api/v1/owners` | JWT + Tenant | Register pet owner | D-06, D-08 |
| GET | `/api/v1/owners/lookup?mobile=` | JWT + Tenant | Find owner by mobile (auto-fill) | QUE-06, D-05 |
| GET | `/api/v1/owners/:ownerId` | JWT + Tenant | Get owner with all pets | D-28 |
| POST | `/api/v1/owners/:ownerId/pets` | JWT + Tenant | Register pet under owner | D-04, D-09 |
| POST | `/api/v1/patients/register` | JWT + Tenant | Combined owner + pet registration | D-01, D-12 |
| GET | `/api/v1/patients/search?q=&limit=` | JWT + Tenant | Fuzzy search patients | PAT-04, D-25 |
| GET | `/api/v1/patients/recent?limit=` | JWT + Tenant | Recent patients by last visit | D-26 |
| GET | `/api/v1/pets/:petId` | JWT + Tenant | Pet profile with visit history | PAT-05, D-27 |
| PATCH | `/api/v1/pets/:petId` | JWT + Tenant | Update pet optional fields | D-30 |

**Key Business Logic (PatientService):**

- `registerOwner()` — Validates Indian mobile format (strips spaces, enforces `^[6-9]\d{9}$`), upserts via `clinicId_mobile` composite key. Existing owner returned unchanged.
- `registerPet()` — Validates owner exists at clinic before creating pet. Species must be one of the 7 enum values.
- `registerPatient()` — Combined flow: calls `registerOwner()` then `registerPet()` in sequence. Supports both full wizard (D-01) and quick inline registration (D-12).
- `lookupByMobile()` — Returns owner with all their pets for the 2-tap check-in auto-fill flow.
- `searchPatients()` — Raw SQL with `pg_trgm` `similarity()` function. Searches across `pet_owners.name`, `pet_owners.mobile`, and `pets.name`. Results sorted by relevance descending.
- `getPetProfile()` — Returns pet + owner + visit history (completed QueueEntries: DONE or NO_SHOW, newest first, max 50).
- `updatePet()` — Validates pet exists at clinic. Partial update of optional fields only.
- `getRecentPatients()` — Raw SQL joining pets → owners → queue_entries, grouped by pet, ordered by most recent `checked_in_at`.

#### Queue Module (`apps/api/src/modules/queue/`)

| File | Purpose |
|------|---------|
| `queue.types.ts` | Interface definitions (CheckInParams, UpdateStatusParams, etc.) |
| `queue.schema.ts` | Zod validation schemas for request bodies/params |
| `queue.repository.ts` | Data access layer — Prisma queries, raw SQL for avg duration |
| `queue.service.ts` | Business logic — state machine, broadcasting, wait estimation |
| `queue.controller.ts` | HTTP request/response handling |
| `queue.routes.ts` | Route registration with middleware |

**API Endpoints:**

| Method | Route | Auth | Description | Decision Ref |
|--------|-------|------|-------------|-------------|
| GET | `/api/v1/queue?date=` | JWT + Tenant | Get queue board grouped by status | QUE-03, D-20 |
| POST | `/api/v1/queue/check-in` | JWT + Tenant | Check in a pet | QUE-01, D-13 |
| PATCH | `/api/v1/queue/:entryId/status` | JWT + Tenant | Update entry status | QUE-04, D-18 |
| POST | `/api/v1/queue/call-next` | JWT + Tenant | Call next waiting patient | QUE-05, D-17 |

**Key Business Logic (QueueService):**

- `checkIn()` — Validates petId (UUID). Checks for existing active entry (WAITING/IN_CONSULT) today — rejects with `ALREADY_IN_QUEUE`. Checks for DONE entry today without `reCheckIn` flag — rejects with `SAME_DAY_RECHECK` (D-40). Assigns position = `waitingCount + 1`. Broadcasts `patient:checked-in` via Socket.IO.
- `updateStatus()` — Validates transition against state machine (`isValidTransition()`). On transition to IN_CONSULT: sets `treatingVetId` and `calledAt`. On transition to DONE/NO_SHOW: sets `completedAt`. Broadcasts `queue:updated` via Socket.IO.
- `callNext()` — Finds next WAITING entry ordered by `isEmergency DESC, checkedInAt ASC` (emergencies first, then FIFO). Delegates to `updateStatus()` to transition to IN_CONSULT.
- `getQueueBoard()` — Returns three sections: `inConsult` (no date filter, only non-archived), `waiting` (today, emergency first then FIFO), `done` (today, newest first). Computes `estimatedWaitSeconds` = `position * avgConsultDuration`. Average calculated from last 7 days of completed consults; defaults to 900 seconds (15 min) when <5 data points.

**Date Handling (`QueueRepository.getTodayIST()`):**
- Converts current time to IST (Asia/Kolkata, UTC+5:30)
- Returns midnight IST as UTC Date
- All "today" queries use `checkedInAt >= todayIST`

**Socket.IO Events:**

| Event | Payload | Trigger |
|-------|---------|---------|
| `patient:checked-in` | `{ entry, timestamp }` | New check-in |
| `queue:updated` | `{ entry, updatedBy, timestamp }` | Status change |
| `queue:archived` | — | Midnight archive |
| `patient:registered` | — | New patient registered |
| `patient:updated` | — | Pet profile updated |

**Room scoping:** Events broadcast to `clinic:{clinicId}` room — only devices connected to the same clinic receive updates.

### Phase 3 Mobile App Code

```
apps/mobile/src/
├── features/
│   ├── patient/
│   │   ├── hooks/
│   │   │   ├── usePatientRegister.ts    # Registration form state + API calls
│   │   │   ├── usePatientSearch.ts      # Debounced search with React Query
│   │   │   └── usePatientProfile.ts     # Pet profile data fetching
│   │   ├── components/
│   │   │   ├── SpeciesBreedPicker.tsx    # Species dropdown → breed dropdown (filtered)
│   │   │   ├── PetPhotoPicker.tsx        # Camera/gallery photo selection
│   │   │   ├── PatientListItem.tsx       # Patient row in search results
│   │   │   ├── ExistingOwnerCard.tsx     # Shows existing owner when mobile matches
│   │   │   ├── PatientSearchResults.tsx  # Search results list
│   │   │   ├── RecentPatientsList.tsx    # Default Patients tab view
│   │   │   ├── PetProfileCard.tsx        # Pet detail card with owner info
│   │   │   └── VisitTimeline.tsx         # Chronological visit history
│   │   ├── screens/
│   │   │   ├── PatientListScreen.tsx     # Patients tab with search + recent list
│   │   │   ├── PatientDetailScreen.tsx   # Pet profile page
│   │   │   ├── RegisterPatientScreen.tsx # Two-step registration wizard
│   │   │   ├── OwnerDetailScreen.tsx     # Owner detail + pet list
│   │   │   └── EditPetForm.tsx           # Edit mode for pet optional fields
│   │   └── index.ts
│   │
│   └── queue/
│       ├── store/
│       │   └── queueUIStore.ts           # Zustand store for queue UI state
│       ├── hooks/
│       │   ├── useQueue.ts               # Queue board data fetching (React Query)
│       │   ├── useQueueSocket.ts         # Socket.IO connection + event handlers
│       │   ├── useCheckIn.ts             # Check-in mutation + validation
│       │   └── useQueueActions.ts        # Status update + call next mutations
│       ├── components/
│       │   ├── QueueBoard.tsx            # Three-section queue layout
│       │   ├── QueueCardItem.tsx         # Individual queue entry card
│       │   ├── QueueSectionHeader.tsx    # "In Consult", "Waiting", "Done" headers
│       │   ├── CheckInSheet.tsx          # Bottom sheet for check-in flow
│       │   ├── CallNextButton.tsx        # "Call Next" action button
│       │   ├── VisitReasonPicker.tsx     # Quick-select visit reason chips
│       │   └── OfflineBanner.tsx         # "Offline — data may be outdated" banner
│       └── screens/
│           └── QueueScreen.tsx           # Home screen — the queue status board
```

**Key Mobile Patterns:**
- **React Query** for server state (caching, refetching, optimistic updates)
- **Zustand** for local UI state (queue UI store)
- **Socket.IO** for real-time updates (invalidates React Query cache on events)
- **Expo Router** for file-based navigation
- **@breeyo/validators** shared with API — same Zod schemas validate on both sides

### Phase 3 Shared Packages

#### `@breeyo/types` — Type Definitions

| File | Exports |
|------|---------|
| `patient.ts` | `Owner`, `Pet`, `PetWithOwner`, `OwnerWithPets`, `RegisterOwnerInput`, `RegisterPetInput`, `PatientSearchResult` |
| `queue.ts` | `QueueEntry`, `QueueEntryWithPet`, `QueueBoard`, `CheckInInput`, `QueueStatusUpdate`, `CallNextResult` |
| `constants/species.ts` | `Species` type, `SPECIES_LIST`, `SPECIES_VALUES`, `BREEDS` (per-species breed lists), `SPECIES_ICONS` |
| `constants/queue-status.ts` | `QueueStatus` enum, `QUEUE_TRANSITIONS` map, `isValidTransition()`, `QUEUE_STATUS_LABELS` |
| `constants/socket-events.ts` | `SOCKET_EVENTS` — event name constants |
| `constants/visit-reasons.ts` | `VISIT_REASONS` array, `VisitReason` type |

#### `@breeyo/validators` — Zod Schemas

| File | Exports |
|------|---------|
| `patient.ts` | `indianMobileSchema` (strips spaces, validates `^[6-9]\d{9}$`), `ownerRegistrationSchema`, `petRegistrationSchema`, `patientSearchSchema` |
| `queue.ts` | `checkInSchema`, `queueStatusUpdateSchema` |

**Validation Rules:**

| Schema | Field | Rule |
|--------|-------|------|
| `indianMobileSchema` | mobile | Strip spaces → must match `^[6-9]\d{9}$` |
| `ownerRegistrationSchema` | mobile | Indian mobile (above) |
| | name | 1-100 chars, required |
| | email | Valid email or empty string, optional |
| | address | Max 500 chars, optional |
| | altPhone | Indian mobile or empty string, optional |
| `petRegistrationSchema` | name | 1-100 chars, required |
| | species | One of: DOG, CAT, BIRD, RABBIT, FISH, REPTILE, OTHER |
| | breed | Max 100 chars, optional |
| | birthYear | Integer 1990-2030, optional |
| | birthMonth | Integer 1-12, optional |
| | weight | Positive float, max 500, optional |
| | color | Max 50 chars, optional |
| | microchipId | Max 50 chars, optional |
| | photoUrl | Valid URL, optional |
| | notes | Max 1000 chars, optional |
| `patientSearchSchema` | q | 2-100 chars |
| | limit | Integer 1-50, default 20 |
| `checkInSchema` | petId | UUID |
| | visitReason | Max 100 chars, optional |
| | isEmergency | Boolean, default false |
| `queueStatusUpdateSchema` | status | One of: WAITING, IN_CONSULT, DONE, NO_SHOW |

### Phase 3 Tests

#### Patient Repository Tests (`patient.repository.test.ts`)

| Test | What It Verifies |
|------|-----------------|
| `createOwner` — uses upsert with clinicId_mobile composite key | Prisma upsert called with correct composite unique key |
| `createOwner` — returns existing owner when mobile exists (D-06) | Idempotent: duplicate mobile returns original owner, not error |
| `createOwner` — includes optional fields when provided | Email, address, altPhone included in create data |
| `findOwnerByMobile` — queries with composite key and includes pets | Correct query shape, pets relation included |
| `findOwnerByMobile` — returns null when not found | Null handling |
| `findOwnerById` — queries by id and clinicId with pets | Tenant-scoped query |
| `createPet` — creates with required and optional fields | Breed included when provided |
| `createPet` — omits optional fields when not provided | No undefined fields in Prisma data |
| `getPetProfile` — returns pet with owner and visit history | Visit history from QueueEntry where DONE/NO_SHOW |
| `getPetProfile` — filters visit history to DONE and NO_SHOW only | Correct status filter in query |
| `getPetProfile` — returns null when pet not found | Null handling, no visit history query |
| `updatePet` — updates and returns with owner | Correct update + include shape |
| `updatePet` — returns null when pet not found at clinic | Tenant-scoped verification |
| `searchPatients` — executes raw SQL with pg_trgm similarity | Raw query called with correct params |
| `searchPatients` — sorts results by relevance descending | Post-query sort validation |
| `searchPatients` — respects limit parameter | Limit passed to raw query |
| `getRecentPatients` — executes raw SQL for recent patients | Raw query with pet-owner-queue join |

**Total: 17 tests**

#### Patient Service Tests (`patient.service.test.ts`)

| Test | What It Verifies |
|------|-----------------|
| `registerOwner` — creates owner with mobile and name | Correct params passed to repository |
| `registerOwner` — strips spaces from mobile before saving | `"98765 43210"` → `"9876543210"` |
| `registerOwner` — rejects invalid mobile format | Zod validation throws on `"12345"` |
| `registerOwner` — rejects mobile not starting with 6-9 | Zod validation throws on `"5876543210"` |
| `registerOwner` — accepts optional email, address, altPhone | Optional fields forwarded |
| `registerPet` — creates pet linked to owner with required fields | Owner existence verified, pet created |
| `registerPet` — accepts all optional fields | Breed, age, weight, color, etc. |
| `registerPet` — rejects pet for non-existent owner | 404 OWNER_NOT_FOUND error |
| `registerPatient` — registers owner and pet in single call | Combined flow executes both |
| `registerPatient` — returns existing owner and new pet if mobile exists | Upsert idempotency |
| `lookupByMobile` — finds owner and all pets | Correct query delegation |
| `lookupByMobile` — returns null for unregistered mobile | Null propagation |
| `lookupByMobile` — strips spaces from mobile | Same space-stripping behavior |
| `lookupByMobile` — rejects invalid mobile format | Validation on lookup too |
| `getPetProfile` — returns pet with owner and visit history | Full profile assembly |
| `getPetProfile` — returns null for non-existent pet | Null propagation |
| `updatePet` — updates optional fields | Weight, color update |
| `updatePet` — throws when pet not found | 404 PET_NOT_FOUND error |
| `searchPatients` — calls repository with validated params | Zod parsing + delegation |
| `searchPatients` — respects limit parameter | Limit forwarded |
| `searchPatients` — rejects query shorter than 2 chars | Minimum length validation |
| `getRecentPatients` — calls with clinicId and limit | Correct delegation |
| `getRecentPatients` — defaults limit to 20 | Default value |

**Total: 23 tests**

#### Queue Service Tests (`queue.service.test.ts`)

| Test | What It Verifies |
|------|-----------------|
| `checkIn` — creates entry with correct position | Position = waitingCount + 1 |
| `checkIn` — sets emergency flag (D-15) | `isEmergency: true` passed through |
| `checkIn` — records checkedInBy user ID | Audit trail for who checked in |
| `checkIn` — rejects if pet already in queue (WAITING/IN_CONSULT) | 409 ALREADY_IN_QUEUE |
| `checkIn` — returns SAME_DAY_RECHECK without flag (D-40) | 409 SAME_DAY_RECHECK code |
| `checkIn` — allows re-check-in with reCheckIn flag (D-40) | Skips done-entry check |
| `checkIn` — broadcasts PATIENT_CHECKED_IN event | Socket.IO emit verified |
| `updateStatus` — validates transition using state machine | Valid: WAITING → IN_CONSULT |
| `updateStatus` — rejects invalid transition WAITING → DONE | Cannot skip IN_CONSULT |
| `updateStatus` — rejects transition from terminal state DONE | No transitions from DONE |
| `updateStatus` — sets treatingVetId on IN_CONSULT (D-37) | Vet assignment on call |
| `updateStatus` — sets calledAt on IN_CONSULT | Timestamp for wait calculation |
| `updateStatus` — sets completedAt on DONE | Timestamp for duration calc |
| `updateStatus` — sets completedAt on NO_SHOW | Same for no-shows |
| `updateStatus` — broadcasts QUEUE_UPDATED event | Socket.IO emit verified |
| `updateStatus` — throws 404 when entry not found | Entry existence check |
| `callNext` — selects oldest WAITING entry | FIFO ordering |
| `callNext` — selects emergency patients first | `isEmergency DESC` ordering |
| `callNext` — assigns treating vet (D-37) | Vet ID set on entry |
| `callNext` — throws 404 when no patients waiting | Empty queue handling |
| `getQueueBoard` — returns entries grouped by status | Three-section structure |
| `getQueueBoard` — computes dynamic positions | Position 1, 2, 3... |
| `getQueueBoard` — computes estimated wait from avg consult time | position * avgDuration |
| `getQueueBoard` — defaults to 15 min when insufficient data | 900 seconds fallback |

**Total: 24 tests**

**Grand Total Phase 3 Tests: 64 tests** (17 repository + 23 service + 24 queue service)

---

## How It All Connects

### Data Flow: From Login to Queue Board

```
1. VET LOGS IN (Phase 1)
   ┌─────────────┐    ┌──────────────┐    ┌────────────────┐
   │  POST       │───>│ AuthService  │───>│ TokenService   │
   │  /auth/login│    │ verify pwd   │    │ JWT + refresh  │
   └─────────────┘    └──────────────┘    └────────────────┘
                              │                    │
                              ▼                    ▼
                      ┌──────────────┐    ┌────────────────┐
                      │ AuditLog     │    │ JWT payload:   │
                      │ LOGIN_SUCCESS│    │ {sub, clinicId}│
                      └──────────────┘    └────────────────┘
                                                   │
2. EVERY REQUEST (Phase 1 middleware)              │
                                                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
   │  Request     │───>│ authenticate │───>│ tenantContext  │
   │  with JWT    │    │ verify token │    │ set clinicId   │
   └──────────────┘    └──────────────┘    └────────────────┘
                                                   │
3. QUEUE SCREEN LOADS (Phase 3)                    │
                                                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌────────────────┐
   │  GET /queue  │───>│ QueueService │───>│ QueueRepository│
   │              │    │ getQueueBoard│    │ 3 parallel     │
   └──────────────┘    └──────────────┘    │ queries (IST)  │
                              │            └────────────────┘
                              ▼
                      ┌──────────────────┐
                      │ Return:          │
                      │ - inConsult: []  │
                      │ - waiting: []    │
                      │ - done: []       │
                      │ + estimatedWait  │
                      └──────────────────┘

4. SOCKET.IO CONNECTS (Phase 3)
   ┌──────────────┐    ┌──────────────┐
   │  Mobile app  │───>│ Join room    │
   │  useQueueSkt │    │clinic:{id}   │
   └──────────────┘    └──────────────┘
```

### Data Flow: 2-Tap Check-in

```
1. TAP FAB → Check-in bottom sheet opens

2. ENTER MOBILE → Auto-lookup
   ┌──────────────────┐    ┌───────────────┐    ┌────────────────┐
   │ GET /owners/     │───>│ PatientService│───>│ PatientRepo    │
   │ lookup?mobile=   │    │ lookupByMobile│    │ findOwnerBy    │
   │ 9876543210       │    │ validate+strip│    │ Mobile(clinicId│
   └──────────────────┘    └───────────────┘    │ , mobile)      │
                                                └────────────────┘
                                                       │
                                    Returns: Owner + [Pet1, Pet2, Pet3]

3. TAP PET → Check in
   ┌──────────────────┐    ┌───────────────┐    ┌────────────────┐
   │ POST /queue/     │───>│ QueueService  │───>│ QueueRepository│
   │ check-in         │    │ checkIn()     │    │                │
   │ {petId, reason,  │    │ - dup check   │    │ createEntry()  │
   │  isEmergency}    │    │ - recheck D40 │    │                │
   └──────────────────┘    │ - assign pos  │    └────────────────┘
                           └───────────────┘
                                  │
                                  ▼
                           ┌───────────────┐
                           │ Socket.IO     │
                           │ broadcast to  │
                           │ clinic:{id}   │
                           │ "patient:     │
                           │  checked-in"  │
                           └───────────────┘
                                  │
                    ┌─────────────┼──────────────┐
                    ▼             ▼               ▼
              ┌──────────┐ ┌──────────┐    ┌──────────┐
              │ Device A │ │ Device B │    │ Device C │
              │ (vet)    │ │ (front   │    │ (tablet) │
              │          │ │  desk)   │    │          │
              │ React    │ │ React    │    │ React    │
              │ Query    │ │ Query    │    │ Query    │
              │ cache    │ │ cache    │    │ cache    │
              │ invalidat│ │ invalidat│    │ invalidat│
              └──────────┘ └──────────┘    └──────────┘
```

### Data Flow: New Patient Registration + Check-in

```
1. NEW WALK-IN (mobile not found)
   ┌──────────────────┐
   │ GET /owners/     │──> Returns null
   │ lookup?mobile=   │
   └──────────────────┘
           │
           ▼ Quick inline registration
   ┌──────────────────┐    ┌───────────────┐
   │ POST /patients/  │───>│ PatientService│
   │ register         │    │ registerPatient│
   │ {owner: {mobile, │    │               │
   │  name},          │    │ 1. registerOwner (upsert)
   │  pet: {name,     │    │ 2. registerPet (create)
   │  species}}       │    │               │
   └──────────────────┘    └───────────────┘
           │
           ▼ Then check in
   ┌──────────────────┐
   │ POST /queue/     │
   │ check-in         │
   │ {petId: <new>}   │
   └──────────────────┘
```

### Cross-Phase Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation & Authentication                            │
│                                                                 │
│ PROVIDES:                                                       │
│ ├── User, Clinic, ClinicMember models (tenant boundary)        │
│ ├── JWT authentication middleware (authenticate)                │
│ ├── Tenant context middleware (tenantContext → clinicId)        │
│ ├── RBAC middleware (requirePermission)                         │
│ ├── Audit logging (AuthAuditLog + writeAuditLog)               │
│ ├── Token rotation (RefreshToken + family-based detection)     │
│ └── API conventions (error format, rate limiting, versioning)  │
│                                                                 │
│ CONSUMED BY: Phase 2, Phase 3, and all subsequent phases       │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: UI/UX Design & Design System                           │
│                                                                 │
│ PROVIDES:                                                       │
│ ├── Design tokens (colors, typography, spacing, elevation)     │
│ ├── 26-component library (atoms/molecules/organisms)           │
│ ├── StatusBadge (WAITING/IN_CONSULT/DONE/NO_SHOW colors)      │
│ ├── QueueCard organism (queue entry display)                   │
│ ├── BottomSheet (check-in flow container)                      │
│ ├── SearchBar (debounced patient search)                       │
│ ├── WizardStepper (multi-step registration)                    │
│ ├── EmptyState (first-time guidance)                           │
│ ├── Toast (success/error feedback)                             │
│ ├── BottomTabBar (Queue, Patients, Inventory, More)            │
│ └── Wireframes with all 4 states (empty/loading/populated/err) │
│                                                                 │
│ CONSUMED BY: Phase 3 and all subsequent phases                 │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: Patient Registration & Walk-in Queue                   │
│                                                                 │
│ PROVIDES:                                                       │
│ ├── PetOwner, Pet, QueueEntry models (patient data)            │
│ ├── Patient registration API (owner + pet)                     │
│ ├── Walk-in queue API (check-in, status, call-next, board)     │
│ ├── Real-time sync (Socket.IO events)                          │
│ ├── Patient search (pg_trgm fuzzy matching)                    │
│ ├── Pet profiles with visit history                            │
│ ├── Queue state machine (validated transitions)                │
│ ├── Wait time estimation (7-day rolling average)               │
│ └── Mobile screens (QueueScreen, PatientListScreen, etc.)      │
│                                                                 │
│ CONSUMED BY:                                                    │
│ ├── Phase 4 (EMR) — extends Pet with clinical data, links     │
│ │   consultations to QueueEntry                                │
│ ├── Phase 5 (Inventory) — links dispensed items to consults    │
│ ├── Phase 6 (Billing) — generates invoices from consults       │
│ └── Phase 8 (Scheduling) — merges appointments into queue      │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Validation Layer

Both API and mobile app consume the same Zod schemas from `@breeyo/validators`:

```
                    ┌───────────────────────┐
                    │  @breeyo/validators   │
                    │                       │
                    │  indianMobileSchema   │
                    │  ownerRegistration    │
                    │  petRegistration      │
                    │  patientSearch        │
                    │  checkIn              │
                    │  queueStatusUpdate    │
                    └───────────┬───────────┘
                                │
                   ┌────────────┼────────────┐
                   │                         │
                   ▼                         ▼
          ┌────────────────┐        ┌────────────────┐
          │  @breeyo/api   │        │ @breeyo/mobile │
          │                │        │                │
          │ PatientService │        │ usePatient     │
          │ .registerOwner │        │ Register.ts    │
          │   → parse()    │        │   → parse()    │
          │                │        │                │
          │ QueueService   │        │ useCheckIn.ts  │
          │ .checkIn()     │        │   → parse()    │
          │   → parse()    │        │                │
          └────────────────┘        └────────────────┘

Same validation rules on both sides:
- Mobile format enforced identically
- Species enum validated identically
- Search query min length = 2 on both sides
```

### Multi-Tenancy Flow (RLS)

```
JWT Token contains: { sub: userId, clinicId: "clinic-uuid" }
                            │
                            ▼
                   ┌────────────────┐
                   │  authenticate  │  Decodes JWT, sets request.user
                   └────────┬───────┘
                            │
                            ▼
                   ┌────────────────┐
                   │ tenantContext  │  Sets request.db = createTenantClient(clinicId)
                   └────────┬───────┘
                            │
                            ▼
              All Prisma queries scoped to clinicId:
              ├── PetOwner WHERE clinic_id = ?
              ├── Pet WHERE clinic_id = ?
              ├── QueueEntry WHERE clinic_id = ?
              └── (Raw SQL also includes explicit clinic_id filter)

Clinic A's data is NEVER visible to Clinic B's users.
```

### Error Handling Pattern

All Phase 3 services follow the same error pattern established in Phase 1:

```typescript
// Thrown as:
const error = new Error('message') as Error & { statusCode: number; code: string };
error.statusCode = 409;   // HTTP status
error.code = 'ERROR_CODE'; // Machine-readable code
throw error;

// Caught by centralized error-handler.ts and formatted as:
{
  "error": {
    "code": "ALREADY_IN_QUEUE",
    "message": "Pet is already in today's queue"
  }
}
```

**Phase 3 Error Codes:**

| Code | Status | Trigger |
|------|--------|---------|
| `OWNER_NOT_FOUND` | 404 | Registering pet for non-existent owner |
| `PET_NOT_FOUND` | 404 | Updating non-existent pet |
| `ALREADY_IN_QUEUE` | 409 | Pet already WAITING or IN_CONSULT today |
| `SAME_DAY_RECHECK` | 409 | Pet already DONE today, reCheckIn flag not set |
| `ENTRY_NOT_FOUND` | 404 | Updating status of non-existent queue entry |
| `INVALID_TRANSITION` | 400 | Invalid state machine transition (e.g., WAITING → DONE) |
| `NO_PATIENTS_WAITING` | 404 | "Call Next" with empty queue |
