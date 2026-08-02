# Breeyo - Entity Relationship Diagram

## Current Schema (Phase 01)

13 models across 3 domains: Identity & Access, Clinic, and Notifications.

---

## Entity Overview

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
│  ┌──────────────┐                                                   │
│  │ Notification  │   (recipientUserId, clinicId)                    │
│  └──────────────┘                                                   │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │ DeviceToken   │───── User                                        │
│  └──────────────┘                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      COMPLIANCE                                     │
│                                                                     │
│  ┌──────────────┐                                                   │
│  │ConsentRecord  │   (DPDP Act compliance)                          │
│  └──────────────┘                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Models

### User
Primary identity entity. Can own clinics and be a member of multiple clinics.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | `gen_random_uuid()` |
| email | String | Unique |
| phone | String | Unique |
| full_name | String | |
| password_hash | String | Argon2 |
| license_number | String? | Vet registration number |
| specialization | String? | |
| is_email_verified | Boolean | Default false |
| is_phone_verified | Boolean | Default false |
| is_active | Boolean | Default true |
| email_verification_token | String? | |
| email_verification_expiry | DateTime? | |
| password_reset_token | String? | |
| password_reset_expiry | DateTime? | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Relations:** ClinicMember[], Clinic[] (owned), RefreshToken[], DeviceToken[]

---

### Clinic
A veterinary clinic. Multi-tenant boundary — all data is scoped to a clinic via RLS.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| name | String | |
| address | String | |
| contact_phone | String | |
| city | String? | |
| gstin | String? | GST identification number |
| logo_url | String? | |
| working_hours | Json? | Structured schedule |
| wizard_completed_at | DateTime? | Onboarding completion |
| owner_id | UUID (FK) | -> User |
| created_at | DateTime | |
| updated_at | DateTime | |

**Relations:** owner (User), ClinicMember[]

---

### ClinicMember
Join table linking Users to Clinics. Multi-tenancy pivot.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | -> User |
| clinic_id | UUID (FK) | -> Clinic |
| is_active | Boolean | Default true |
| created_at | DateTime | |

**Unique:** (user_id, clinic_id)
**Relations:** User, Clinic, ClinicMemberRole[], UserPermissionOverride[]

---

### Role
System-defined roles: owner, vet, technician, receptionist.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| name | String | Unique |
| description | String | |
| created_at | DateTime | |

**Relations:** RolePermission[], ClinicMemberRole[]

---

### Permission
Granular permissions scoped by module (auth, clinic, patient, billing, etc).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| code | String | Unique, e.g. `patient:read` |
| description | String | |
| module | String | Grouping key |

**Relations:** RolePermission[], UserPermissionOverride[]

---

### RolePermission
Many-to-many: which permissions each role has by default.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| role_id | UUID (FK) | -> Role |
| permission_id | UUID (FK) | -> Permission |

**Unique:** (role_id, permission_id)

---

### ClinicMemberRole
Many-to-many: which roles a clinic member has.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| clinic_member_id | UUID (FK) | -> ClinicMember |
| role_id | UUID (FK) | -> Role |
| created_at | DateTime | |

**Unique:** (clinic_member_id, role_id)

---

### UserPermissionOverride
Per-user permission grants/denials that override role defaults.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| clinic_member_id | UUID (FK) | -> ClinicMember |
| permission_id | UUID (FK) | -> Permission |
| granted | Boolean | true = grant, false = deny |

**Unique:** (clinic_member_id, permission_id)

---

### RefreshToken
JWT refresh tokens with family-based rotation and replay detection.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | -> User |
| token_hash | String | Unique, hashed token |
| family_id | UUID | Groups rotation chain |
| clinic_id | UUID | Scoped to clinic session |
| expires_at | DateTime | |
| revoked_at | DateTime? | Null if active |
| ip_address | String? | |
| user_agent | String? | |
| created_at | DateTime | |

**Indexes:** family_id, user_id

---

### AuthAuditLog
Security audit trail for auth events (login, logout, token refresh, failed attempts).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID? | Null for failed login attempts |
| clinic_id | UUID? | |
| event | String | Event type |
| ip_address | String? | |
| user_agent | String? | |
| metadata | Json? | Additional context |
| created_at | DateTime | |

**Indexes:** user_id, clinic_id, event

---

### Notification
In-app notifications delivered to users within a clinic context.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| recipient_user_id | UUID | |
| clinic_id | UUID | |
| type | String | Notification category |
| module | String | Source module |
| title | String | |
| body | String | |
| data | Json | Default `{}` |
| is_read | Boolean | Default false |
| created_at | DateTime | |

**Indexes:** (recipient_user_id, clinic_id, is_read), (recipient_user_id, clinic_id, created_at)

---

### DeviceToken
Push notification device registration (Expo push tokens).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK) | -> User |
| token | String | Expo push token |
| platform | String | ios, android |
| created_at | DateTime | |
| updated_at | DateTime | |

**Unique:** (user_id, token)

---

### ConsentRecord
DPDP Act compliance — tracks user consent for data processing.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| owner_id | UUID? | Pet owner giving consent |
| consent_type | String | Category of consent |
| purpose_text | String | What they consented to |
| granted_at | DateTime | |
| withdrawn_at | DateTime? | Null if still active |
| ip_address | String? | |
| actor_id | UUID? | Staff who recorded it |
| created_at | DateTime | |

**Index:** owner_id

---

## Phase 03 Models (Planned)

These models will be added for Patient Registration & Walk-in Queue:

```
Pet              -- name, species, breed, dob, weight, photo, microchip_id, clinic_id
PetOwner         -- name, phone, email, address, clinic_id
PetOwnerLink     -- pet_id, owner_id, is_primary, transferred_at
QueueEntry       -- pet_id, clinic_id, status, priority, reason, arrived_at, called_at, completed_at
```
