# Phase 1: Foundation & Authentication - Test Results

**Date:** 2026-08-02
**Branch:** `breeyo/phase-01-foundation-authentication`
**Result:** 160 tests passed, 0 failed

---

## Overview

Phase 1 establishes the entire foundation of Breeyo: monorepo structure, database with multi-tenant isolation, authentication (email/password + OTP), role-based access control, notifications, and post-signup onboarding. Every feature is backed by automated tests.

| Scope | Test Files | Tests | Status |
|-------|-----------|-------|--------|
| API (backend) | 16 | 103 | All passed |
| Mobile (React Native) | 3 | 57 | All passed |
| **Total** | **19** | **160** | **All passed** |

---

## API Tests (103 tests across 16 files)

### Signup & Email Verification (8 tests)

These tests verify that a new vet can sign up, creating their user account and clinic in one step, and then verify their email address.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 201 with user and clinic on valid signup | A valid signup request creates both a user and a clinic, returns their IDs and names |
| 2 | Should return 409 when signing up with a duplicate email | Prevents two accounts with the same email address |
| 3 | Should return 400 with invalid email format | Rejects malformed email addresses before processing |
| 4 | Should create ClinicMember with Admin role | The signup user automatically becomes an Admin of their new clinic |
| 5 | Should write SIGNUP audit event | Every signup is logged in the tamper-proof audit trail |
| 6 | Should verify email with a valid token | Clicking the email verification link marks the account as verified |
| 7 | Should return 400 with expired token | Verification links expire after 24 hours |
| 8 | Should return 400 with invalid token | Random/guessed tokens are rejected |

### Login (9 tests)

These tests cover the primary email + password login flow, including error handling for wrong credentials, unverified email, deactivated accounts, and multi-clinic selection.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 200 with tokens on valid login | Correct credentials return access token, refresh token, user info, and clinic info |
| 2 | Should return 401 with INVALID_CREDENTIALS on wrong password | Wrong password gives a clear error without revealing whether the account exists |
| 3 | Should return 401 for non-existent user | Non-existent email gives the same error as wrong password (no account enumeration) |
| 4 | Should return 401 with EMAIL_NOT_VERIFIED | Users must verify their email before logging in |
| 5 | Should return 401 with ACCOUNT_DEACTIVATED | Deactivated staff cannot log in |
| 6 | Should return 400 with CLINIC_SELECTION_REQUIRED | Users belonging to multiple clinics must choose which clinic to log into |
| 7 | Should return 200 for multi-clinic user with valid clinicId | Providing a specific clinic ID logs the user into that clinic |
| 8 | Should write LOGIN_SUCCESS audit event | Successful logins are logged for security auditing |
| 9 | Should write LOGIN_FAILED audit event | Failed login attempts are logged to detect potential attacks |

### OTP Login (6 tests)

These tests verify the SMS OTP (one-time password) login flow used as an alternative to email/password.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 200 and store OTP in Redis | Requesting an OTP generates a 6-digit code stored temporarily (5 min) |
| 2 | Should return 429 after 3 OTP requests in 5 minutes | Rate limiting prevents OTP spam (max 3 per phone per 5 min) |
| 3 | Should return 200 with tokens on correct OTP | Entering the correct OTP logs the user in and returns tokens |
| 4 | Should return 401 with OTP_INVALID on wrong OTP | Incorrect OTP code is rejected |
| 5 | Should return 401 with OTP_EXPIRED when no OTP stored | Expired or non-existent OTP gives a clear error |
| 6 | Should set isPhoneVerified=true on first OTP login | First successful OTP login automatically verifies the phone number |

### Password Reset (5 tests)

These tests cover the "forgot password" flow where a user receives an email link to set a new password.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 200 with known email | Requesting a reset for a valid email sends the reset link |
| 2 | Should return 200 with unknown email (no leak) | Requesting a reset for a non-existent email returns the same response (prevents account enumeration) |
| 3 | Should reset password with valid token | Clicking the reset link and setting a new password works |
| 4 | Should return 400 with expired token | Reset links expire after 1 hour |
| 5 | Should return 400 with already-used token | Each reset link can only be used once |

### Token Refresh (5 tests)

These tests verify the silent token refresh mechanism that keeps users logged in without re-entering credentials.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return new token pair with valid refresh token | A valid refresh token generates new access + refresh tokens |
| 2 | Should return 401 for expired refresh token | Refresh tokens expire after 30 days |
| 3 | Should return 401 for revoked refresh token | Tokens revoked by logout cannot be reused |
| 4 | Should invalidate entire family on token replay | If a stolen refresh token is reused, ALL tokens in that session are revoked (security measure) |
| 5 | Should support a chain of 3 consecutive refreshes | Normal usage: refresh token can be rotated multiple times in sequence |

### Logout (4 tests)

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 200 on successful logout | Logout revokes the current session |
| 2 | Should prevent refresh token usage after logout | The refresh token used before logout can no longer generate new tokens |
| 3 | Should write LOGOUT audit event | Logouts are recorded in the audit trail |
| 4 | Should return 401 without authentication | Only authenticated users can log out |

### Email Verification Resend (4 tests)

These tests cover the ability to re-send the verification email if the user didn't receive it.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return 200 with unverified email and update verification token | Re-sends the verification email with a fresh token |
| 2 | Should return 200 with unknown email (no leak) | Non-existent emails get the same response (security) |
| 3 | Should return 200 with "already verified" for verified email | Users who already verified get a helpful message |
| 4 | Should return 429 after exceeding rate limit | Maximum 3 resends per email per hour to prevent abuse |

### Permissions (7 tests)

These tests verify the permission system that controls what each staff member can do within a clinic.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return effective permissions for an Admin user | Admin gets all 20 permissions |
| 2 | Should return 401 without auth token | Permission check requires authentication |
| 3 | Should allow Clinician access to VIEW_PATIENTS-protected endpoint | Users with the right permission can access protected features |
| 4 | Should block user without required permission | Users without the right permission get a 403 Forbidden error |
| 5 | Should grant VIEW_AUDIT_LOG to FrontDesk via override | Admins can grant extra permissions to specific users beyond their role defaults |
| 6 | Should revoke VIEW_PATIENTS from Clinician via override | Admins can revoke specific permissions from users even if their role normally includes them |
| 7 | Should reflect role changes after cache invalidation | Permission changes take effect promptly (cache is invalidated) |

### Staff Management & Role Assignment (9 tests)

These tests cover inviting new staff members, assigning roles, managing permissions, deactivating staff, and changing passwords.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should create a staff member and return 201 when called by Admin | Admin can invite new staff by phone number with a role |
| 2 | Should return 403 without MANAGE_USERS permission | Only users with MANAGE_USERS permission can invite staff |
| 3 | Should update roles and return 200 | Admin can change a staff member's roles |
| 4 | Should set permission overrides and return 200 | Admin can customize individual permissions for a staff member |
| 5 | Should deactivate member and return 200 | Admin can deactivate a staff member's access |
| 6 | Should prevent deactivated user from logging in | Deactivated staff get an ACCOUNT_DEACTIVATED error on login |
| 7 | Should change password and invalidate all sessions | Password change logs out all other devices (security measure) |
| 8 | Should reject invalid current password | Must know current password to change it |
| 9 | Should make existing refresh tokens invalid after password change | All existing sessions are terminated when password changes |

### Staff Reactivation & Sole-Admin Guard (7 tests)

These tests cover reactivating previously deactivated staff and preventing accidental clinic lockout.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should reactivate a deactivated member and return 200 | Admin can bring back a previously deactivated staff member |
| 2 | Should preserve member roles after reactivation | Reactivated staff keep their original roles (not wiped) |
| 3 | Should write USER_REACTIVATED audit event | Reactivations are logged for compliance |
| 4 | Should return 409 when reactivating an already active member | Cannot "reactivate" someone who is already active |
| 5 | Should return 403 without MANAGE_USERS permission | Only authorized admins can reactivate staff |
| 6 | Should return 409 when trying to deactivate the sole admin | The system prevents the last Admin from deactivating themselves (prevents clinic lockout) |
| 7 | Should allow deactivating one of two admins | If there are multiple admins, one can be deactivated safely |

### Clinic Switching (6 tests)

These tests cover vets who manage multiple clinics and need to switch between them.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should return all active clinics for authenticated user | Lists all clinics the user belongs to |
| 2 | Should not include inactive clinic memberships | Deactivated memberships don't appear in the list |
| 3 | Should return 401 without auth token | Clinic list requires authentication |
| 4 | Should return new token pair when switching to a valid clinic | Switching clinics issues new tokens scoped to the selected clinic |
| 5 | Should return 403 when switching to a non-member clinic | Users can only switch to clinics they belong to |
| 6 | Should return 401 without auth token | Clinic switching requires authentication |

### Clinic Profile & Setup Wizard (6 tests)

These tests cover the clinic settings API used by the post-signup setup wizard.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should update clinic name and return 200 | Clinic profile fields (name, address, city, GSTIN) can be updated |
| 2 | Should return 403 without MANAGE_CLINIC_SETTINGS permission | Only authorized users can edit clinic settings |
| 3 | Should save working hours JSON and return 200 | Clinic operating hours (per-day open/close times) are saved correctly |
| 4 | Should return clinic with workingHours and wizardCompletedAt | Clinic data includes setup wizard completion status |
| 5 | Should set wizardCompletedAt and return 200 | Completing the setup wizard marks it as done |
| 6 | Should be idempotent when wizard is already completed | Calling "complete wizard" again doesn't change anything |

### Tenant Isolation (6 tests)

These tests are critical security tests verifying that data from one clinic is completely invisible to another clinic.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should isolate permissions at the API level | User A with Clinic A token cannot see Clinic B's data |
| 2 | Should enforce RLS at the database level | Database-level Row Level Security policies work correctly |
| 3 | Should isolate audit logs across tenants | Clinic A's audit logs are invisible from Clinic B's database view |
| 4 | Should allow an owner to see all their clinics | A vet who owns multiple clinics can list and switch between them |
| 5 | Should isolate staff to only their assigned clinics | Staff at Clinic A cannot access Clinic B or Clinic C data |
| 6 | Should prevent access after membership deactivation | Deactivating a membership immediately removes data access |

### Notifications (13 tests)

These tests cover the in-app notification system and push notification device token management.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should register a device token and return 201 | Mobile devices can register for push notifications |
| 2 | Should return 200 for duplicate device token (idempotent) | Re-registering the same device doesn't create duplicates |
| 3 | Should return 401 without auth token | Device registration requires authentication |
| 4 | Should remove a device token and return 200 | Devices can unregister from push notifications |
| 5 | Should return empty list initially | New users start with no notifications |
| 6 | Should return notifications with pagination | Large notification lists are paginated (20 per page) |
| 7 | Should filter by unreadOnly=true | Users can view only their unread notifications |
| 8 | Should return correct unread count | Badge count shows the right number of unread notifications |
| 9 | Should mark a notification as read | Individual notifications can be marked as read |
| 10 | Should return 404 for non-existent notification | Cannot mark a non-existent notification |
| 11 | Should mark all notifications as read | "Mark all as read" clears the unread count |
| 12 | Should not allow User B to see Clinic X notifications | Notifications are isolated per clinic (tenant security) |
| 13 | Should enqueue a job via emit() | The notification bus correctly queues notifications for async processing |

### Push Service (4 tests)

These tests verify the Expo push notification delivery service.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should call Expo API with correct payload | Push notifications are formatted correctly for Expo's service |
| 2 | Should filter out invalid tokens before sending | Invalid push tokens are skipped without crashing |
| 3 | Should return invalidTokens for DeviceNotRegistered errors | Tokens for uninstalled apps are identified for cleanup |
| 4 | Should handle empty token array gracefully | No crash when there are no tokens to send to |

### Region Configuration (4 tests)

These tests verify that all infrastructure is configured for India (ap-south-1) data residency.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Should default AWS_REGION to ap-south-1 | The application defaults to the Mumbai AWS region |
| 2 | Should specify AWS_REGION=ap-south-1 in .env.example | Environment template has the correct region |
| 3 | Should reference ap-south-1 in deploy-staging.yml | Staging deployments target Mumbai |
| 4 | Should have deploy-production.yml that references ap-south-1 | Production deployments target Mumbai |

---

## Mobile Tests (57 tests across 3 files)

### Auth Flow (14 tests)

These tests verify the mobile app's authentication logic: storing tokens securely, making API calls, handling login/logout, token refresh, OTP, and clinic selection.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Stores and retrieves auth tokens | Tokens are saved to and loaded from secure device storage (iOS Keychain / Android Keystore) |
| 2 | Clears all auth data | Logout completely removes all stored credentials |
| 3 | Makes a successful request | API client correctly calls the backend and parses responses |
| 4 | Throws ApiClientError on error response | API errors are properly typed with error code and status |
| 5 | Sends authorization header when token provided | Authenticated requests include the Bearer token |
| 6 | Stores tokens on successful login | After login, tokens are persisted for future app launches |
| 7 | Clears state on logout | Logout calls the API and then clears local storage |
| 8 | Handles CLINIC_SELECTION_REQUIRED error | Multi-clinic users get a list of clinics to choose from |
| 9 | Refreshes tokens using stored refresh token | Silent token refresh works with the stored refresh token |
| 10 | Clears storage when refresh fails | If the session has truly expired, storage is cleaned up |
| 11 | Sends OTP request | OTP request is sent to the correct API endpoint |
| 12 | Verifies OTP and stores tokens | Correct OTP leads to token storage |
| 13 | Handles CLINIC_SELECTION_REQUIRED on OTP verify | OTP login also supports multi-clinic selection |
| 14 | Logs in with a selected clinic | Providing a clinic ID with credentials works correctly |

### Deep Links & Verify Email (18 tests)

These tests verify the deep link URL parsing (for staff invitations and password resets) and the email verification resend flow.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Extracts clinicId and phone from breeyo:// URL | Staff invite deep links (custom scheme) are parsed correctly |
| 2 | Extracts clinicId and phone from https://breeyo.app URL | Staff invite deep links (universal links) are parsed correctly |
| 3 | Returns null when clinicId is missing | Malformed invite links are rejected |
| 4 | Returns null when phone is missing | Incomplete invite links are rejected |
| 5 | Returns null for a non-staff-setup path | Only staff-setup paths are accepted |
| 6 | Returns null for an invalid URL | Garbage input doesn't crash the parser |
| 7 | Extracts token from breeyo:// URL | Password reset deep links (custom scheme) are parsed correctly |
| 8 | Extracts token from https://breeyo.app URL | Password reset deep links (universal links) are parsed correctly |
| 9 | Returns null when token is missing | Malformed reset links are rejected |
| 10 | Returns null for a non-reset-password path | Only reset-password paths are accepted |
| 11 | Returns null for an invalid URL | Garbage input doesn't crash the parser |
| 12 | Has the correct prefixes | Deep link config includes both breeyo:// and https://breeyo.app |
| 13 | Has screen mappings for auth routes | Routes are mapped correctly for staff-setup, reset-password, verify-email |
| 14 | Calls the correct endpoint with email | Resend button calls POST /auth/verify-email/resend |
| 15 | Handles 429 rate limit error | Shows "too many attempts" when rate limited |
| 16 | Handles already-verified email response | Shows appropriate message if email is already verified |
| 17 | Calls the correct endpoint with token and new password | Password reset confirm sends token + new password |
| 18 | Handles invalid/expired token | Shows error for bad reset tokens |

### Setup Wizard (25 tests)

These tests verify the 3-step post-signup setup wizard: clinic profile, invite staff, and configure clinic hours.

| # | Test | What it checks |
|---|------|---------------|
| 1 | Defines correct step order | Wizard flows: clinic-profile -> invite-staff -> clinic-hours |
| 2 | getStepIndex returns correct index for each step | Step indicator shows the right position (1/3, 2/3, 3/3) |
| 3 | getStepIndex returns 0 for unknown paths | Unknown routes default to step 1 |
| 4 | Step 1 navigates to invite-staff on next | "Next" on clinic profile goes to step 2 |
| 5 | Step 2 navigates to clinic-hours on next | "Next" on invite staff goes to step 3 |
| 6 | Fetches current clinic data on mount | Step 1 pre-fills existing clinic info from the API |
| 7 | Calls PUT /clinics/current/profile with form data | "Next" on step 1 saves the clinic profile |
| 8 | Calls POST /auth/staff/invite with staff data | Invite button sends the staff invitation |
| 9 | Supports all non-Admin roles | Role picker offers Clinician, FrontDesk, and InventoryManager |
| 10 | Prepends +91 prefix to phone numbers | Indian phone numbers are formatted correctly |
| 11 | Calls PUT /clinics/current/hours with formatted hours | "Finish Setup" saves the working hours |
| 12 | Calls POST /clinics/current/wizard-complete on finish | Finishing the wizard marks it as completed server-side |
| 13 | Skip on clinic profile does not call save API | Skipping step 1 doesn't save partial data |
| 14 | Skip on invite staff does not call invite API | Skipping step 2 doesn't send any invitations |
| 15 | Skip on clinic hours calls wizard-complete but not hours save | Skipping step 3 still marks the wizard as done |
| 16 | Detects wizard completed when wizardCompletedAt is set | Returning users who finished the wizard go straight to the app |
| 17 | Detects wizard not completed when wizardCompletedAt is null | First-time users see the wizard |
| 18 | Handles API error gracefully for wizard status check | Network errors during wizard check don't crash the app |
| 19 | Formats default hours correctly for API | Mon-Sat 09:00-18:00 default hours are properly structured |
| 20 | Sets null times for closed days | Closed days (Sunday) send null for open/close times |
| 21 | Preserves all 7 days of the week in order | All 7 days are included in the hours payload |
| 22 | getDefaultHours sets Mon-Sat open, Sunday closed | Default schedule matches Indian vet clinic norms |
| 23 | Returns true for a non-null timestamp | isWizardCompleted correctly identifies completed wizards |
| 24 | Returns false for null | isWizardCompleted correctly identifies incomplete wizards |
| 25 | Returns false for undefined | isWizardCompleted handles missing data |

---

## How to Run Tests

### Run all tests
```bash
pnpm turbo test -- --run
```

### Run API tests only
```bash
pnpm --filter @breeyo/api test -- --run
```

### Run mobile tests only
```bash
pnpm --filter @breeyo/mobile test -- --run
```

### Run a specific test file
```bash
pnpm --filter @breeyo/api test -- --run tests/auth/login.test.ts
```

### Prerequisites
- Docker running (PostgreSQL + Redis via `docker compose up -d`)
- Dependencies installed (`pnpm install`)
- Prisma client generated (`pnpm --filter @breeyo/api db:generate`)
- Database migrated (`pnpm --filter @breeyo/api exec prisma migrate dev`)
