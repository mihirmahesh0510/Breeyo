# Phase 1: Foundation & Authentication - Research

**Researched:** 2026-04-13
**Domain:** Monorepo setup, multi-tenant PostgreSQL (RLS), authentication (email/password + SMS OTP), RBAC with per-user overrides, REST API skeleton, deployment infrastructure
**Confidence:** HIGH

## Summary

Phase 1 establishes all foundational infrastructure for Breeyo: a Turborepo monorepo (apps/api, apps/mobile, apps/web, packages/*), PostgreSQL with Row-Level Security for multi-clinic tenancy, a dual-mode auth system (email/password + SMS OTP), role-based access control with per-user permission overrides, versioned REST API on Fastify, and three-environment deployment (local Docker Compose, staging, production on AWS Mumbai).

The most critical technical risk is the Prisma + RLS integration. Prisma does not natively support RLS -- it requires a Client Extension that wraps every query in a transaction to call `SET LOCAL app.clinic_id`. This works but has a known limitation: explicit `$transaction()` calls on the extended client do not work as expected. The workaround is to use interactive transactions only and detect existing transaction context. This is well-documented in Prisma's official extensions repo and used in production by multiple teams.

**Primary recommendation:** Use Prisma Client Extensions for RLS with interactive transactions only. Use Argon2id for password hashing. Use MSG91 for SMS OTP delivery (India-native, pre-paid wallet, no subscription). Store tokens in expo-secure-store on mobile, never in AsyncStorage. Use Pino (built into Fastify) for structured JSON logging shipped to CloudWatch.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Self-service signup -- vet signs up and creates their clinic in the same flow. No admin provisioning needed.
- **D-02:** Comprehensive signup info collected: email, password, phone number, clinic name, address, vet's full name, license number, specialization, operating hours.
- **D-03:** Email verification only before granting access. Phone number verified later via first OTP login.
- **D-04:** Guided setup wizard after signup: 3 steps -- complete clinic profile, invite staff members, configure clinic hours/working days.
- **D-05:** Wizard is skippable at any step with "Skip for now". Dashboard shows gentle reminder to complete setup.
- **D-06:** Home screen after setup is the walk-in queue -- the primary daily workflow.
- **D-07:** SMS-only OTP delivery (via provider like MSG91/Twilio). No WhatsApp OTP for now.
- **D-08:** Stay logged in with silent token refresh. OTP required only for new device login or after 30-day inactivity expiry.
- **D-09:** Clear inline error messages on login failure ("OTP expired -- tap to resend", "Incorrect password"). No account lockout for Beta -- rate-limit OTP resends instead.
- **D-10:** Both password reset (email link) and OTP login available. Two paths to access -- vet is never locked out.
- **D-11:** Login screen: email + password as primary form, "Login with OTP" as secondary link below.
- **D-12:** OTP auto-read from SMS (Android SMS Retriever API) with manual entry fallback.
- **D-13:** Signup user automatically becomes Admin of their clinic.
- **D-14:** Admin invites staff via phone number + role assignment. Staff receives SMS invite with setup link.
- **D-15:** Multiple roles per user supported. Solo vet can be Admin + Clinician. Staff can be Front Desk + Inventory Manager.
- **D-16:** Customizable per-user permissions. Each role has sensible default permissions. Admin can toggle individual permissions on/off per user.
- **D-17:** Deactivation only -- no hard delete of user accounts. Medical records must trace who created them. Admin can deactivate staff accounts (blocks login, preserves audit trail).
- **D-18:** Unlimited concurrent sessions. Vet can use phone + web + tablet simultaneously.
- **D-19:** No session management UI for Beta. If there's a problem, user changes password.
- **D-20:** 30-day session TTL with silent refresh. Vet never sees login during normal daily use.
- **D-21:** Password change forces logout on all other devices/sessions.
- **D-22:** Multi-clinic support from day one. A vet can own/manage multiple clinics and switch between them.
- **D-23:** Clinic switcher in header/nav (like Slack workspace switching). Tap to switch -- all data scopes to selected clinic.
- **D-24:** Clinic entity: name + address + contact phone (minimum). More fields (GSTIN, logo, etc.) added in settings later.
- **D-25:** Two-layer patient data sharing: automatic across same-owner clinics, consent-based across different Breeyo clinics.
- **D-26:** Staff at Clinic A cannot see Clinic B data -- sharing is scoped by clinic ownership, not staff access.
- **D-27:** REST API with consistent patterns. Endpoints follow `/api/v1/{resource}` convention.
- **D-28:** Structured JSON error responses: `{error: {code: "AUTH_EXPIRED", message: "Session expired", details: {...}}}`.
- **D-29:** API versioned from day one with `/api/v1/` prefix. Coexistence model when v2 is needed.
- **D-30:** Basic rate limiting on auth endpoints (e.g., 100 req/min per user) to prevent brute force.
- **D-31:** Three environments from Phase 1: local (Docker Compose), staging, production.
- **D-32:** GitHub Actions CI/CD: auto-run tests on PR, auto-deploy to staging on merge to main, manual promotion to production.
- **D-33:** Backend hosted on AWS Mumbai (EC2/ECS). PostgreSQL via RDS, Redis via ElastiCache. Full India data residency.
- **D-34:** Structured JSON logs (Pino) shipped to CloudWatch. Error tracking via Sentry for crash reports.
- **D-35:** Dedicated auth audit log table: login, logout, failed attempts, password changes, role changes, user invitations.
- **D-36:** Audit logs are immutable -- append-only, no delete or update operations. Tamper-proof record for compliance.

### Claude's Discretion
- Exact setup wizard UI/UX flow and transitions
- OTP resend rate-limit thresholds
- Loading skeleton design for auth screens
- Exact permission set per default role (what each role can/cannot do by default)
- Compression and retention policy for logs
- Error state handling for edge cases

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can sign up with email and password | Argon2id hashing, email verification via crypto.randomBytes token, Prisma user model, Fastify route with zod validation |
| AUTH-02 | User can log in via mobile OTP | MSG91 SMS provider, Android SMS Retriever API via react-native-otp-verify, 6-digit OTP with 5-min expiry stored in Redis |
| AUTH-03 | User session persists across app restarts (token refresh) | @fastify/jwt with 15-min access + 30-day refresh tokens, expo-secure-store for mobile storage, Redis for refresh token families |
| AUTH-04 | Admin can assign roles: Admin, Clinician, Front Desk, Inventory Manager | Application-level RBAC with roles + permissions tables, role_permissions for defaults, user_permission_overrides for per-user customization |
| AUTH-05 | Role-based permissions restrict access to authorized features only | Fastify preHandler hook checking permissions, RLS policies for data-level enforcement, permission middleware per route |
| AUTH-06 | User can log out from any screen | Delete refresh token from Redis, client clears expo-secure-store, invalidate token family |
| PLT-04 | Multi-tenant architecture with data isolation | PostgreSQL RLS with clinic_id on every table, Prisma Client Extension setting `app.clinic_id` per request, integration tests verifying cross-tenant isolation |
| PLT-05 | All data stored in India-region data center | AWS Mumbai (ap-south-1) for RDS, ElastiCache, ECS/EC2; Docker Compose for local dev |
</phase_requirements>

## Standard Stack

### Core (Phase 1 specific)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fastify | 5.8.4 | API server framework | Built-in Pino logging, schema validation, plugin architecture; 2-3x faster than Express |
| @fastify/jwt | 10.0.0 | JWT token signing/verification | Official Fastify plugin; supports multiple signing keys, decorators for route protection |
| @fastify/cookie | 11.0.2 | Cookie handling (web sessions) | Official Fastify plugin; signed cookies for web dashboard auth |
| @fastify/rate-limit | 10.3.0 | Rate limiting auth endpoints | Official plugin; Redis-backed for distributed rate limiting across instances |
| @fastify/cors | 11.2.0 | CORS configuration | Official plugin; required for web dashboard + mobile API access |
| Prisma | 7.7.0 | ORM / database client + migrations | Type-safe queries, migration management, Client Extensions for RLS |
| @prisma/client | 7.7.0 | Generated database client | Auto-generated types from schema; works with RLS extension pattern |
| argon2 | 0.44.0 | Password hashing | OWASP #1 recommended for 2026; Argon2id variant resists GPU + side-channel attacks |
| zod | 4.3.6 | Schema validation | Shared between client + server; API input validation; Fastify schema integration |
| ioredis | 5.10.1 | Redis client | Mature, well-maintained; supports Redis 7 features; used for sessions, rate limiting, OTP storage |
| Pino | 10.3.1 | Structured JSON logging | Built into Fastify; NDJSON format; async transports via worker threads |
| @sentry/node | 10.48.0 | Error tracking | Official Fastify integration via `setupFastifyErrorHandler`; auto-captures 5xx errors |
| nanoid | 5.1.7 | ID generation | URL-safe, compact IDs for tokens, invite codes; smaller than UUID |
| TypeScript | 6.0.2 | Type safety | Shared types across monorepo; catches errors at build time |
| Turborepo | latest | Monorepo build orchestration | Rust-based; caching; parallel builds; dependency graph awareness |

### Supporting (Phase 1)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-secure-store | 55.0.13 | Secure token storage (mobile) | Store refresh tokens on iOS Keychain / Android Keystore; never use AsyncStorage for tokens |
| react-native-otp-verify | 1.2.0 | Android SMS auto-read | SMS Retriever API; zero SMS permissions required; requires app hash in SMS body |
| nodemailer | latest | Email sending | Email verification links, password reset emails; use with SES in production |
| BullMQ | 5.73.5 | Job queues | Email delivery, SMS sending as background jobs; Redis-backed; retry logic built-in |
| supertest | 7.2.2 | HTTP testing | API integration tests; works with Fastify's inject() method |
| @faker-js/faker | 10.4.0 | Test data generation | Seed realistic test data for clinics, users, patients |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Argon2 | bcrypt | bcrypt is more battle-tested but Argon2id is OWASP recommended; both are acceptable |
| MSG91 | Twilio | Twilio has global reach but MSG91 is India-native, cheaper for Indian numbers, simpler DLT registration |
| Pino | Winston | Winston is more popular but Pino is 5-10x faster and already built into Fastify |
| expo-secure-store | react-native-keychain | Both use platform secure storage; expo-secure-store integrates better with Expo managed workflow |
| nanoid | uuid | UUID is more standard but nanoid produces shorter, URL-safe IDs; use UUID for database PKs if desired |

**Installation (Phase 1 API):**
```bash
# API dependencies
pnpm add fastify @fastify/jwt @fastify/cookie @fastify/rate-limit @fastify/cors @fastify/websocket prisma @prisma/client argon2 zod ioredis bullmq @sentry/node nanoid nodemailer pino-pretty

# API dev dependencies
pnpm add -D typescript vitest @vitest/coverage-v8 supertest @faker-js/faker @types/nodemailer prisma

# Mobile auth dependencies (in apps/mobile)
pnpm add expo-secure-store react-native-otp-verify
```

## Architecture Patterns

### Recommended Project Structure (Phase 1)

```
breeyo/
├── apps/
│   ├── api/                          # Fastify API server
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   └── auth/             # Auth bounded context
│   │   │   │       ├── auth.routes.ts       # Route definitions
│   │   │   │       ├── auth.service.ts      # Business logic
│   │   │   │       ├── auth.schema.ts       # Zod schemas + Fastify schemas
│   │   │   │       ├── auth.controller.ts   # Request handlers
│   │   │   │       ├── otp.service.ts       # OTP generation, verification, SMS dispatch
│   │   │   │       ├── token.service.ts     # JWT access/refresh token management
│   │   │   │       ├── email.service.ts     # Email verification, password reset
│   │   │   │       └── permission.service.ts # RBAC + per-user overrides
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts          # JWT verification preHandler
│   │   │   │   ├── authorize.ts             # Permission check preHandler
│   │   │   │   ├── tenant-context.ts        # Set clinic_id from JWT into RLS context
│   │   │   │   └── error-handler.ts         # Global structured error handler
│   │   │   ├── plugins/
│   │   │   │   ├── prisma.ts                # Prisma client + RLS extension plugin
│   │   │   │   ├── redis.ts                 # ioredis connection plugin
│   │   │   │   ├── sentry.ts                # Sentry error tracking plugin
│   │   │   │   └── rate-limit.ts            # Rate limiting config plugin
│   │   │   ├── lib/
│   │   │   │   ├── prisma-rls.ts            # Prisma Client Extension for RLS
│   │   │   │   └── audit-log.ts             # Immutable audit log writer
│   │   │   ├── app.ts                       # Fastify app factory
│   │   │   └── server.ts                    # Server entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma                # Database schema
│   │   │   ├── migrations/                  # Prisma migrations
│   │   │   └── seed.ts                      # Seed data for dev/test
│   │   ├── tests/
│   │   │   ├── auth/                        # Auth module tests
│   │   │   ├── helpers/                     # Test utilities
│   │   │   │   ├── setup.ts                 # Test DB setup/teardown
│   │   │   │   └── factories.ts             # Test data factories
│   │   │   └── tenant-isolation.test.ts     # Cross-tenant isolation tests
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── mobile/                       # Expo/React Native (stub in Phase 1)
│   │   ├── app/                      # Expo Router
│   │   │   ├── (auth)/               # Auth screens (login, register, OTP)
│   │   │   └── (app)/                # Protected screens (placeholder)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Next.js dashboard (stub in Phase 1)
│       ├── app/
│       │   └── (auth)/               # Auth pages (login, register)
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── auth.ts               # Auth-related types (User, Role, Permission, Token)
│   │   │   ├── clinic.ts             # Clinic/tenant types
│   │   │   ├── api.ts                # API response/error types
│   │   │   └── index.ts              # Barrel export
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── validators/                   # Shared zod schemas
│   │   ├── src/
│   │   │   ├── auth.ts               # Signup, login, OTP validation schemas
│   │   │   ├── clinic.ts             # Clinic validation schemas
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                       # Shared configs
│       ├── eslint/                    # Shared ESLint config
│       ├── tsconfig/                  # Shared TS configs (base, api, mobile, web)
│       └── package.json
│
├── docker-compose.yml                # PostgreSQL 16 + Redis 7 for local dev
├── docker-compose.test.yml           # Test environment (isolated DB)
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Test on PR
│       └── deploy-staging.yml        # Deploy on merge to main
├── turbo.json                        # Turborepo pipeline config
├── pnpm-workspace.yaml               # pnpm workspace declaration
├── package.json                      # Root package.json
└── .env.example                      # Environment variable template
```

### Pattern 1: Prisma Client Extension for RLS

**What:** Every database query is automatically scoped to the current clinic via PostgreSQL RLS, enforced by a Prisma Client Extension that sets `app.clinic_id` before each query.

**When to use:** Every request that touches tenant-scoped data (which is nearly all of them).

**Critical gotcha:** The extension wraps queries in batch transactions. Explicit `$transaction([])` (sequential) does NOT work on the extended client. Use interactive transactions (`$transaction(async (tx) => {...})`) only.

**Example:**
```typescript
// lib/prisma-rls.ts
import { PrismaClient, Prisma } from '@prisma/client';

export function createTenantClient(prisma: PrismaClient, clinicId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query, operation }) {
        // Skip RLS for operations that don't need it
        const bypassOps = ['$queryRaw', '$executeRaw'];
        if (bypassOps.includes(operation)) return query(args);

        return prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.clinic_id', '${clinicId}', TRUE)`
          );
          return query(args);
        });
      },
    },
  });
}

// middleware/tenant-context.ts
import { FastifyRequest, FastifyReply } from 'fastify';

export async function tenantContext(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const clinicId = request.user.activeClinicId;
  if (!clinicId) {
    return reply.code(400).send({
      error: {
        code: 'CLINIC_NOT_SELECTED',
        message: 'No active clinic selected',
      },
    });
  }
  // Attach tenant-scoped Prisma client to request
  request.db = createTenantClient(request.server.prisma, clinicId);
}
```

### Pattern 2: Token Refresh with Family Tracking

**What:** Short-lived access tokens (15 min) + long-lived refresh tokens (30 days) stored in Redis. Refresh tokens are tracked in families -- if a used refresh token is replayed, the entire family is invalidated (compromise detection).

**When to use:** Every authenticated request uses this pattern.

**Example:**
```typescript
// auth/token.service.ts
interface TokenFamily {
  userId: string;
  familyId: string;
  currentTokenId: string;
  createdAt: number;
}

export class TokenService {
  constructor(
    private jwt: FastifyJWT,
    private redis: Redis
  ) {}

  async generateTokenPair(userId: string, clinicId: string, deviceId: string) {
    const familyId = nanoid();
    const tokenId = nanoid();

    const accessToken = this.jwt.sign(
      { sub: userId, clinicId, type: 'access' },
      { expiresIn: '15m' }
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, familyId, tokenId, type: 'refresh' },
      { expiresIn: '30d' }
    );

    // Store refresh token family in Redis
    await this.redis.setex(
      `refresh:${familyId}`,
      30 * 24 * 60 * 60, // 30 days
      JSON.stringify({ userId, familyId, currentTokenId: tokenId, createdAt: Date.now() })
    );

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    const decoded = this.jwt.verify<{
      sub: string;
      familyId: string;
      tokenId: string;
    }>(refreshToken);

    const family = await this.redis.get(`refresh:${decoded.familyId}`);
    if (!family) throw new Error('TOKEN_FAMILY_REVOKED');

    const parsed: TokenFamily = JSON.parse(family);

    // Replay detection: if tokenId doesn't match current, someone reused an old token
    if (parsed.currentTokenId !== decoded.tokenId) {
      // Compromise detected -- invalidate entire family
      await this.redis.del(`refresh:${decoded.familyId}`);
      throw new Error('TOKEN_REUSE_DETECTED');
    }

    // Issue new token pair in same family
    return this.generateTokenPair(parsed.userId, decoded.clinicId, decoded.familyId);
  }

  async revokeAllUserTokens(userId: string) {
    // Used when password changes (D-21)
    const keys = await this.redis.keys(`refresh:*`);
    for (const key of keys) {
      const family = await this.redis.get(key);
      if (family && JSON.parse(family).userId === userId) {
        await this.redis.del(key);
      }
    }
  }
}
```

### Pattern 3: RLS Policies for Multi-Clinic with Cross-Owner Sharing

**What:** PostgreSQL RLS policies that enforce clinic isolation by default, but allow cross-clinic access for the same owner (D-25). Uses a two-layer approach: base isolation + owner-scope sharing.

**Example:**
```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Basic clinic isolation: user can only see their active clinic's data
CREATE POLICY clinic_isolation ON clinic_members
  USING (clinic_id = current_setting('app.clinic_id', TRUE)::uuid);

-- Owner can see all their clinics (for clinic switcher)
CREATE POLICY owner_clinics ON clinics
  USING (
    owner_id = current_setting('app.user_id', TRUE)::uuid
    OR id = current_setting('app.clinic_id', TRUE)::uuid
  );

-- Patient data: visible to active clinic + all clinics of same owner (D-25)
CREATE POLICY patient_access ON patients
  USING (
    clinic_id = current_setting('app.clinic_id', TRUE)::uuid
    OR clinic_id IN (
      SELECT c.id FROM clinics c
      WHERE c.owner_id = current_setting('app.user_id', TRUE)::uuid
    )
  );

-- Audit log: ALWAYS append-only, no SELECT restriction needed for admin
-- But non-admin users should only see their clinic's audit entries
CREATE POLICY audit_clinic_isolation ON auth_audit_log
  USING (clinic_id = current_setting('app.clinic_id', TRUE)::uuid);

-- Disable UPDATE and DELETE on audit log at policy level
CREATE POLICY audit_no_update ON auth_audit_log
  FOR UPDATE USING (FALSE);

CREATE POLICY audit_no_delete ON auth_audit_log
  FOR DELETE USING (FALSE);
```

### Pattern 4: Permission System with Role Defaults + Per-User Overrides

**What:** Four-table design: roles, permissions, role_permissions (defaults), user_permission_overrides (admin toggles).

**Example:**
```typescript
// Database schema (Prisma)
// roles: Admin, Clinician, FrontDesk, InventoryManager
// permissions: VIEW_PATIENTS, EDIT_PATIENTS, VIEW_EMR, EDIT_EMR, VIEW_INVENTORY, etc.
// role_permissions: maps default permissions to each role
// user_permission_overrides: admin can grant/revoke individual permissions per user

// permission.service.ts
export class PermissionService {
  async getUserPermissions(userId: string, clinicId: string): Promise<string[]> {
    // 1. Get user's roles for this clinic
    const memberships = await this.prisma.clinicMember.findMany({
      where: { userId, clinicId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    // 2. Collect default permissions from all roles
    const defaultPerms = new Set<string>();
    for (const m of memberships) {
      for (const rp of m.role.rolePermissions) {
        defaultPerms.add(rp.permission.code);
      }
    }

    // 3. Apply per-user overrides
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId, clinicId },
      include: { permission: true },
    });

    const finalPerms = new Set(defaultPerms);
    for (const override of overrides) {
      if (override.granted) {
        finalPerms.add(override.permission.code);
      } else {
        finalPerms.delete(override.permission.code);
      }
    }

    return Array.from(finalPerms);
  }
}

// middleware/authorize.ts
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userPerms = await request.server.permissionService
      .getUserPermissions(request.user.id, request.user.activeClinicId);

    const hasAll = permissions.every(p => userPerms.includes(p));
    if (!hasAll) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      });
    }
  };
}

// Usage in routes
fastify.get('/api/v1/patients',
  { preHandler: [authenticate, tenantContext, requirePermission('VIEW_PATIENTS')] },
  listPatientsHandler
);
```

### Pattern 5: Immutable Auth Audit Log

**What:** Append-only audit log table with RLS policies that prevent UPDATE and DELETE. Every auth-related event is recorded.

**Example:**
```typescript
// lib/audit-log.ts
export enum AuditEvent {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  SIGNUP = 'SIGNUP',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  OTP_SENT = 'OTP_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  OTP_FAILED = 'OTP_FAILED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  PERMISSION_OVERRIDE = 'PERMISSION_OVERRIDE',
  USER_INVITED = 'USER_INVITED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  SESSION_REVOKED = 'SESSION_REVOKED',
}

export async function writeAuditLog(
  prisma: PrismaClient, // Use BASE client, not RLS-extended
  event: AuditEvent,
  data: {
    userId?: string;
    clinicId?: string;
    targetUserId?: string;
    ipAddress: string;
    userAgent: string;
    details?: Record<string, unknown>;
  }
) {
  await prisma.authAuditLog.create({
    data: {
      event,
      userId: data.userId,
      clinicId: data.clinicId,
      targetUserId: data.targetUserId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details ?? {},
      createdAt: new Date(),
    },
  });
}
```

### Anti-Patterns to Avoid

- **RLS bypass via table ownership:** The database user Prisma connects with must NOT own the tenant-scoped tables, or must have `ALTER TABLE ... FORCE ROW LEVEL SECURITY` applied. PostgreSQL owners bypass RLS by default.
- **Tenant ID from request body:** Never accept `clinic_id` from the client request body. Always derive it from the authenticated JWT. The `activeClinicId` in the token is the single source of truth.
- **AsyncStorage for tokens:** React Native's AsyncStorage is unencrypted. Tokens stored there are trivially extractable on rooted devices. Use expo-secure-store (iOS Keychain / Android Keystore).
- **Single Prisma client for all requests:** Do not share one Prisma instance across requests without the RLS extension. Each request must set its own tenant context.
- **Sequential $transaction on RLS client:** Prisma's `$transaction([query1, query2])` does NOT work with the RLS Client Extension. Use interactive transactions: `$transaction(async (tx) => { ... })`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function or plain bcrypt wrapper | `argon2` npm package with Argon2id | Memory-hard, GPU-resistant; OWASP #1 for 2026; handles salt internally |
| JWT token management | Custom JWT parsing/signing | `@fastify/jwt` | Handles signing, verification, expiry, key rotation; integrated with Fastify decorators |
| Rate limiting | Custom counter middleware | `@fastify/rate-limit` with Redis store | Handles distributed counting, sliding windows, key extraction; battle-tested |
| SMS OTP delivery | Direct HTTP calls to SMS provider | MSG91 SDK or abstracted OTP service with BullMQ job queue | Handles DLT registration, delivery reports, retry logic, rate limiting |
| Email delivery | Direct SMTP connection | `nodemailer` + SES (production) / Ethereal (dev) via BullMQ | Connection pooling, retry, template support; SES handles deliverability |
| Schema validation | Manual if/else validation | `zod` schemas shared between client/server | Type inference, composable schemas, error formatting; single source of truth |
| Structured logging | Custom JSON formatter | Pino (built into Fastify) | Async worker transports, child loggers, redaction, NDJSON format |
| Error tracking | Custom error collection | `@sentry/node` with Fastify integration | Stack traces, breadcrumbs, release tracking, alerting; `setupFastifyErrorHandler(app)` |
| ID generation | Math.random or UUID v4 | `nanoid` for tokens/codes, UUID for database PKs | nanoid: 21 chars, URL-safe, cryptographically secure; UUID: standard for PKs |
| CORS handling | Custom headers middleware | `@fastify/cors` | Handles preflight, origin validation, credentials; standard spec compliance |

**Key insight:** The auth domain has more security-critical surface area than any other module. Every hand-rolled component is a potential vulnerability. Use established, audited libraries for every auth primitive.

## Common Pitfalls

### Pitfall 1: Prisma RLS Transaction Deadlock

**What goes wrong:** Using `$transaction([])` (sequential/batch) with the Prisma RLS Client Extension causes queries to hang or fail silently. The extension wraps each query in its own transaction to set `app.clinic_id`, creating nested transaction conflicts.
**Why it happens:** The RLS extension uses `$transaction` internally. Prisma sequential transactions cannot nest.
**How to avoid:** Use only interactive transactions: `$transaction(async (tx) => { ... })`. The extension detects `__internalParams.transaction` and reuses the existing transaction context.
**Warning signs:** Queries hang for 5+ seconds then timeout. "Transaction already started" errors in logs.

### Pitfall 2: RLS Bypassed by Table Owner

**What goes wrong:** PostgreSQL table owners bypass RLS by default. If the Prisma database user owns the tables (which is common in development), RLS policies have zero effect.
**Why it happens:** Prisma migrations typically run as the same user that Prisma queries use. That user owns the tables it created.
**How to avoid:** Use two database roles: one for migrations (owns tables, runs DDL) and one for the application (has usage/select/insert/update/delete but does NOT own tables). Apply `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on all tenant-scoped tables.
**Warning signs:** Cross-tenant isolation tests pass with `FORCE ROW LEVEL SECURITY` but fail without it. No data filtering in development.

### Pitfall 3: SMS OTP Without DLT Registration

**What goes wrong:** SMS messages are blocked by Indian telecom operators. OTPs never arrive. Users cannot log in.
**Why it happens:** India's TRAI mandates DLT (Distributed Ledger Technology) registration for all commercial SMS. Every SMS sender, template, and entity must be registered on a DLT portal. This is unique to India and often overlooked.
**How to avoid:** Use MSG91 which handles DLT registration as part of onboarding. Register your sender ID and OTP template with DLT. Test with real Indian phone numbers early.
**Warning signs:** OTPs work in development (local mock) but fail in staging with real numbers. SMS provider dashboard shows "DLT rejected" status.

### Pitfall 4: Refresh Token Stored in AsyncStorage

**What goes wrong:** Tokens are extractable from rooted Android devices. A compromised token gives 30-day access to the clinic's medical records.
**Why it happens:** AsyncStorage is the "easy" React Native storage. Documentation examples often use it for all persistent data.
**How to avoid:** Use `expo-secure-store` which uses iOS Keychain and Android Keystore (hardware-backed encryption). Access tokens can stay in memory (Zustand store). Only refresh tokens need secure persistent storage.
**Warning signs:** Token storage code imports from `@react-native-async-storage`. No encryption at rest for auth tokens.

### Pitfall 5: Missing Clinic Context in API Requests

**What goes wrong:** API endpoints work in single-clinic testing but return wrong data or 500 errors when users have multiple clinics. The `clinic_id` is not set or is set to a stale value.
**Why it happens:** With multi-clinic support (D-22), the "active clinic" must be explicitly tracked. If the client doesn't send it or the middleware doesn't verify the user has access to that clinic, data leaks or errors occur.
**How to avoid:** Include `activeClinicId` in the JWT claims. On clinic switch (D-23), issue a new token pair with the updated clinic ID. Middleware validates the user is a member of the claimed clinic before setting RLS context.
**Warning signs:** "Clinic not found" errors after switching clinics. Data from old clinic appearing after switch. 500 errors on first API call after clinic switch.

### Pitfall 6: Email Verification Token Leakage

**What goes wrong:** Verification tokens are logged, appear in URLs that get cached, or are stored without expiry. Attacker uses leaked token to verify arbitrary email addresses.
**Why it happens:** Tokens are just random strings -- easy to accidentally log or expose.
**How to avoid:** Hash the token before storing (store `sha256(token)`, send raw token in email). Set 24-hour expiry. Delete token after use. Never log the raw token. Use `crypto.randomBytes(32)` not `Math.random()`.
**Warning signs:** Verification tokens visible in server logs. Tokens in database without `expiresAt` column. Same token works after verification.

### Pitfall 7: Permission Cache Staleness

**What goes wrong:** Admin toggles a permission for a user, but the user's cached permissions don't update. User retains revoked access until cache expires or they re-login.
**Why it happens:** Permission lookups are expensive (multiple joins). Caching is the obvious optimization. But cache invalidation on permission change is often missed.
**How to avoid:** Cache permissions in Redis with a short TTL (5 minutes). On any permission/role change, immediately delete the affected user's permission cache key. Alternatively, include a `permissionVersion` in the JWT and increment it on changes, forcing re-fetch.
**Warning signs:** Permission changes don't take effect immediately. Users report they can still access features after role removal.

## Code Examples

### Docker Compose for Local Development
```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_USER: breeyo_admin
      POSTGRES_PASSWORD: dev_password_only
      POSTGRES_DB: breeyo
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./apps/api/prisma/init-rls-roles.sql:/docker-entrypoint-initdb.d/01-roles.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U breeyo_admin']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Database Role Separation for RLS
```sql
-- init-rls-roles.sql (runs on first docker compose up)
-- Migration user (owns tables, runs DDL)
-- Already created as POSTGRES_USER: breeyo_admin

-- Application user (queries only, RLS enforced)
CREATE ROLE breeyo_app WITH LOGIN PASSWORD 'app_dev_password';
GRANT CONNECT ON DATABASE breeyo TO breeyo_app;
GRANT USAGE ON SCHEMA public TO breeyo_app;

-- After migrations run, grant table access to app user:
-- (Run this after prisma migrate deploy)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO breeyo_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO breeyo_app;
```

### Fastify App Factory
```typescript
// apps/api/src/app.ts
import Fastify, { FastifyInstance } from 'fastify';
import * as Sentry from '@sentry/node';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // Pino redaction for sensitive fields
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  // Register plugins
  await app.register(import('@fastify/cors'), {
    origin: [process.env.WEB_URL!, process.env.MOBILE_URL!],
    credentials: true,
  });

  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET!,
    sign: { algorithm: 'HS256' },
  });

  await app.register(import('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET!,
  });

  await app.register(import('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
    redis: app.redis, // Distributed rate limiting
  });

  // Sentry error tracking
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  Sentry.setupFastifyErrorHandler(app);

  // Register modules
  await app.register(import('./modules/auth/auth.routes'), { prefix: '/api/v1' });

  // Global error handler for structured JSON errors (D-28)
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.code(statusCode).send({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      },
    });
  });

  return app;
}
```

### pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "env": ["DATABASE_URL", "REDIS_URL"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "db:migrate": {
      "cache": false
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

### Structured JSON Error Response (D-28)
```typescript
// packages/types/src/api.ts
export interface ApiError {
  error: {
    code: string;       // Machine-readable: 'AUTH_EXPIRED', 'VALIDATION_FAILED'
    message: string;    // Human-readable
    details?: Record<string, unknown>;
  };
}

// Common error codes for auth module
export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
  OTP_EXPIRED: { code: 'OTP_EXPIRED', message: 'OTP expired -- tap to resend' },
  OTP_INVALID: { code: 'OTP_INVALID', message: 'Incorrect OTP -- please try again' },
  OTP_RATE_LIMITED: { code: 'OTP_RATE_LIMITED', message: 'Too many OTP requests -- try again in 5 minutes' },
  SESSION_EXPIRED: { code: 'SESSION_EXPIRED', message: 'Session expired -- please log in again' },
  TOKEN_REUSE_DETECTED: { code: 'TOKEN_REUSE_DETECTED', message: 'Session compromised -- please log in again' },
  EMAIL_NOT_VERIFIED: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before logging in' },
  ACCOUNT_DEACTIVATED: { code: 'ACCOUNT_DEACTIVATED', message: 'Account deactivated -- contact your clinic admin' },
  CLINIC_NOT_SELECTED: { code: 'CLINIC_NOT_SELECTED', message: 'No active clinic selected' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
} as const;
```

### Default Permission Sets (Claude's Discretion)
```typescript
// Recommended default permissions per role
export const DEFAULT_ROLE_PERMISSIONS = {
  Admin: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS', 'DELETE_PATIENTS',
    'VIEW_EMR', 'EDIT_EMR',
    'VIEW_INVENTORY', 'EDIT_INVENTORY',
    'VIEW_BILLING', 'EDIT_BILLING',
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_SCHEDULING', 'EDIT_SCHEDULING',
    'MANAGE_USERS', 'MANAGE_ROLES',
    'VIEW_AUDIT_LOG', 'VIEW_REPORTS',
    'MANAGE_CLINIC_SETTINGS',
  ],
  Clinician: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_EMR', 'EDIT_EMR',
    'VIEW_INVENTORY',  // Read-only inventory (to check drug availability)
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_SCHEDULING', 'EDIT_SCHEDULING',
    'VIEW_BILLING',  // Read-only billing (to see invoice status)
  ],
  FrontDesk: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',  // Register patients
    'VIEW_QUEUE', 'MANAGE_QUEUE',      // Primary queue managers
    'VIEW_SCHEDULING', 'EDIT_SCHEDULING',
    'VIEW_BILLING', 'EDIT_BILLING',    // Handle payments
  ],
  InventoryManager: [
    'VIEW_INVENTORY', 'EDIT_INVENTORY',
    'VIEW_BILLING',                     // See invoice line items
    'VIEW_PATIENTS',                    // Look up dispensing records
  ],
} as const;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt for password hashing | Argon2id (OWASP recommended) | 2023-2024 | Argon2id is now the gold standard; bcrypt still acceptable but not recommended for new projects |
| Winston for logging | Pino (built into Fastify) | 2022+ | 5-10x faster; NDJSON native; async transports via worker threads |
| Express middleware stack | Fastify plugin architecture | 2023+ | Schema-first validation; typed plugins; 2-3x throughput improvement |
| ORM query-level tenant filtering | PostgreSQL RLS + Prisma Client Extensions | 2023+ | Database-enforced isolation; eliminates "forgotten WHERE clause" data leaks |
| Session cookies for mobile | JWT access + refresh tokens in secure storage | 2020+ | Cookie-based auth is unreliable in React Native; JWT + expo-secure-store is standard |
| Prisma 5 | Prisma 7 (latest) | 2025-2026 | Improved Client Extensions, better TypeScript inference, connection pooling improvements |
| Expo SDK 51 | Expo SDK 55 (latest) | 2025-2026 | Better monorepo support, auto-detection, improved New Architecture compatibility |

**Deprecated/outdated:**
- `jsonwebtoken` npm package: Use `@fastify/jwt` (which uses `fast-jwt` internally, 3x faster)
- `passport.js`: Unnecessary complexity for this auth flow; Fastify decorators + preHandlers are simpler and more explicit
- `express-rate-limit`: Not compatible with Fastify; use `@fastify/rate-limit`
- `connect-redis` session store: Cookie-based sessions are not recommended for React Native; use JWT tokens

## Open Questions

1. **MSG91 vs Twilio for OTP**
   - What we know: MSG91 is India-native, cheaper, handles DLT registration. Twilio has better global docs but requires manual DLT setup for India.
   - What's unclear: MSG91's API reliability at scale, developer experience quality
   - Recommendation: Start with MSG91 behind an abstraction layer. Switch to Twilio if MSG91 proves unreliable. The OTP service interface should accept any provider.

2. **Prisma RLS extension in production at scale**
   - What we know: The pattern works and is used by multiple teams. Each query opens a transaction to set `app.clinic_id`.
   - What's unclear: Performance impact at high concurrency (transaction overhead per query). Connection pool exhaustion risk.
   - Recommendation: Benchmark with realistic load during Phase 1. If overhead is unacceptable, fallback is raw SQL via `$queryRaw` with manual tenant filtering for hot paths.

3. **Clinic ID in JWT vs Header**
   - What we know: D-23 requires clinic switching. If clinic ID is in JWT, switching requires issuing a new token.
   - What's unclear: Whether token re-issue on switch creates UX friction or race conditions.
   - Recommendation: Include `activeClinicId` in JWT. On switch, call `/api/v1/auth/switch-clinic` which validates membership and returns new token pair. This is more secure than accepting clinic ID from a header.

4. **Database migration user separation**
   - What we know: RLS requires the query user to NOT own tables. Prisma migrations typically use the same user.
   - What's unclear: Prisma's support for separate migration vs runtime connection strings.
   - Recommendation: Use `DATABASE_URL` for migrations (admin user) and `DATABASE_URL_APP` for runtime (restricted user). Prisma supports `directUrl` in schema for this pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API server, build tools | Yes | v24.13.1 | -- |
| npm | Package installation | Yes | 11.8.0 | -- |
| pnpm | Monorepo workspace management | No | -- | Install with `npm install -g pnpm` |
| Docker | Local PostgreSQL + Redis | Yes | 28.3.2 | -- |
| Docker Compose | Local dev orchestration | Yes | v2.38.2 | -- |
| Git | Version control | Yes | 2.50.1 | -- |
| PostgreSQL (local client) | Direct DB access for debugging | No | -- | Use Docker exec or Prisma Studio |
| Redis (local client) | Direct Redis access for debugging | No | -- | Use Docker exec or ioredis CLI |

**Missing dependencies with no fallback:**
- pnpm: Required for Turborepo monorepo. Must install before starting: `npm install -g pnpm`

**Missing dependencies with fallback:**
- PostgreSQL client (psql): Not required; use `docker exec -it postgres psql` or Prisma Studio for debugging
- Redis client (redis-cli): Not required; use `docker exec -it redis redis-cli` for debugging

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `apps/api/vitest.config.ts` (Wave 0 -- needs creation) |
| Quick run command | `pnpm --filter api test -- --run` |
| Full suite command | `pnpm turbo test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Signup with email + password creates user and clinic | integration | `pnpm --filter api test -- --run tests/auth/signup.test.ts` | Wave 0 |
| AUTH-02 | OTP login sends SMS and verifies code | integration | `pnpm --filter api test -- --run tests/auth/otp-login.test.ts` | Wave 0 |
| AUTH-03 | Token refresh returns new access token with valid refresh token | integration | `pnpm --filter api test -- --run tests/auth/token-refresh.test.ts` | Wave 0 |
| AUTH-04 | Admin can assign roles to clinic members | integration | `pnpm --filter api test -- --run tests/auth/role-assignment.test.ts` | Wave 0 |
| AUTH-05 | Permission-restricted endpoint returns 403 for unauthorized role | integration | `pnpm --filter api test -- --run tests/auth/permissions.test.ts` | Wave 0 |
| AUTH-06 | Logout invalidates refresh token | integration | `pnpm --filter api test -- --run tests/auth/logout.test.ts` | Wave 0 |
| PLT-04 | Clinic A user cannot see Clinic B data via API | integration | `pnpm --filter api test -- --run tests/tenant-isolation.test.ts` | Wave 0 |
| PLT-05 | Database connection targets ap-south-1 (verified via config) | unit | `pnpm --filter api test -- --run tests/config/region.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- --run` (runs all API tests)
- **Per wave merge:** `pnpm turbo test` (runs all packages)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/vitest.config.ts` -- Vitest configuration with PostgreSQL test database
- [ ] `apps/api/tests/helpers/setup.ts` -- Test DB setup/teardown, Prisma test client with RLS
- [ ] `apps/api/tests/helpers/factories.ts` -- Test data factories (users, clinics, roles)
- [ ] `apps/api/tests/helpers/app.ts` -- Fastify app builder for testing (uses `app.inject()`)
- [ ] Framework install: `pnpm add -D vitest @vitest/coverage-v8 supertest @faker-js/faker` in apps/api

## Sources

### Primary (HIGH confidence)
- [Prisma Client Extensions -- RLS example](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) -- Official Prisma repo with working RLS extension pattern
- [Fastify official docs -- Logging](https://fastify.dev/docs/latest/Reference/Logging/) -- Pino integration, log levels, redaction
- [Sentry for Fastify](https://docs.sentry.io/platforms/javascript/guides/fastify/) -- Official Sentry Fastify integration guide
- [Turborepo -- Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) -- Official apps/ vs packages/ convention
- [AWS Prescriptive Guidance -- RLS recommendations](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html) -- AWS multi-tenant RLS patterns
- npm registry -- All package versions verified against `npm view [package] version` on 2026-04-13

### Secondary (MEDIUM confidence)
- [Prisma + RLS Multi-Tenancy](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) -- Practical walkthrough, verified against Prisma official example
- [The Nile -- Multi-tenant RLS](https://www.thenile.dev/blog/multi-tenant-rls) -- Detailed RLS patterns with cross-tenant sharing considerations
- [react-native-otp-verify](https://github.com/pushpender-singh-ap/react-native-otp-verify) -- Android SMS Retriever API library, Expo compatible
- [MSG91 OTP Pricing](https://msg91.com/in/pricing/otp) -- India SMS OTP pricing and features
- [Password Hashing Guide 2026](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) -- Argon2 vs bcrypt comparison, OWASP recommendation
- [JWT Token Lifecycle Management](https://skycloak.io/blog/jwt-token-lifecycle-management-expiration-refresh-revocation-strategies/) -- Refresh token rotation patterns
- [Permit.io -- Postgres RLS Guide](https://www.permit.io/blog/postgres-rls-implementation-guide) -- RLS implementation pitfalls and best practices

### Tertiary (LOW confidence)
- [Prisma $transaction issue #17948](https://github.com/prisma/prisma/issues/17948) -- Client extensions in interactive transactions bug (may be resolved in Prisma 7)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All versions verified against npm registry; official plugins used throughout
- Architecture: HIGH -- Prisma RLS pattern verified with official example repo; multi-tenant patterns documented by AWS
- Pitfalls: HIGH -- RLS bypass, DLT registration, AsyncStorage risks are well-documented across multiple sources
- Permission system: MEDIUM -- Schema design is standard RBAC pattern; per-user override layer is application-custom
- SMS/OTP integration: MEDIUM -- MSG91 is India-market standard but API reliability not independently verified

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (30 days -- stable technology domain)
