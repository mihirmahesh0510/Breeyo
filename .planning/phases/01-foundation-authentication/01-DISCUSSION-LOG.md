# Phase 1: Foundation & Authentication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 01-foundation-authentication
**Areas discussed:** Signup & onboarding, OTP & login flow, Role management, Multi-device policy, Tenant & clinic model, API conventions, Environment & CI/CD, Logging & audit trail

---

## Signup & Onboarding

### How should a vet's clinic get created?

| Option | Description | Selected |
|--------|-------------|----------|
| Self-service signup | Vet signs up, creates clinic in same flow. Fastest path to value. | ✓ |
| Admin-provisioned | Breeyo team creates clinic, sends invite. More controlled but adds friction. | |
| Hybrid | Self-service creates trial clinic, team activates after verification. | |

**User's choice:** Self-service signup
**Notes:** None

### What info collected during signup?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Email, password, phone, clinic name. Everything else later. | |
| Standard | Email, password, phone, clinic name + city + vet name. | |
| Comprehensive | Full clinic profile: name, address, license, specialization, hours. | ✓ |

**User's choice:** Comprehensive
**Notes:** User wants full clinic profile from signup despite longer form.

### Signup verification?

| Option | Description | Selected |
|--------|-------------|----------|
| Email verification only | Verify email, full access. Phone verified via OTP login later. | ✓ |
| Email + phone verification | Verify both before granting access. | |
| Manual approval | Pending account, Breeyo team reviews. | |

**User's choice:** Email verification only
**Notes:** Trust-first approach for Beta with 20 pilot clinics.

### Setup wizard after signup?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — guided setup | 3-4 step wizard: clinic hours, add staff, initial config. | ✓ |
| No — straight to dashboard | Land on main screen, figure it out. | |
| You decide | Claude discretion. | |

**User's choice:** Yes — guided setup
**Notes:** None

### Wizard steps?

| Option | Description | Selected |
|--------|-------------|----------|
| Clinic profile + add staff + set hours | 3-step wizard. Short and productive. | ✓ |
| Add inventory too | 4-step wizard including starter inventory. | |
| You decide | Claude discretion. | |

**User's choice:** Clinic profile + add staff + set hours
**Notes:** None

### Wizard skippable?

| Option | Description | Selected |
|--------|-------------|----------|
| Skippable with reminder | Skip any step, dashboard shows reminder. | ✓ |
| Required | Must complete before accessing app. | |
| Skippable, no reminder | Skip freely, no nagging. | |

**User's choice:** Skippable with reminder
**Notes:** None

### Home screen after setup?

| Option | Description | Selected |
|--------|-------------|----------|
| Walk-in queue | Primary daily workflow front and center. | ✓ |
| Dashboard overview | Today's summary: queue count, appointments, stats. | |
| You decide | Claude discretion. | |

**User's choice:** Walk-in queue
**Notes:** None

---

## OTP & Login Flow

### OTP delivery method?

| Option | Description | Selected |
|--------|-------------|----------|
| SMS only | Standard SMS OTP. Works on every phone. | ✓ |
| WhatsApp preferred, SMS fallback | Try WhatsApp first (cheaper), SMS fallback. | |
| SMS + email choice | User picks delivery method. | |

**User's choice:** SMS only
**Notes:** None

### Daily login flow?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay logged in + OTP for new devices | Session persists, OTP only for new device or 30-day expiry. | ✓ |
| OTP every login | Always require OTP. | |
| PIN/biometric after first OTP | OTP first login, then quick unlock. | |

**User's choice:** Stay logged in + OTP for new devices
**Notes:** None

### Login failure handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Clear inline errors + retry | Specific error messages, no lockout, rate-limit OTP resends. | ✓ |
| Lockout after attempts | Lock account after 5 failures. | |
| You decide | Claude discretion. | |

**User's choice:** Clear inline errors + retry
**Notes:** None

### Password reset vs OTP-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Both: password reset + OTP login | Email reset link + OTP bypass. Two paths, never locked out. | ✓ |
| OTP-only, no password | All logins via OTP. Simpler but needs phone signal. | |
| Password reset only | Standard email reset, no OTP bypass. | |

**User's choice:** Both
**Notes:** None

### Login screen layout?

| Option | Description | Selected |
|--------|-------------|----------|
| Email+password primary, OTP secondary | Default form is email+password, OTP link below. | ✓ |
| Phone+OTP primary, password secondary | Default is phone+OTP, password as secondary. | |
| Tabbed: both equally visible | Two tabs, neither default. | |

**User's choice:** Email+password primary, OTP secondary
**Notes:** None

### OTP auto-read?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-read SMS + manual fallback | Use Android SMS Retriever API, manual fallback. | ✓ |
| Manual entry only | User reads and types OTP. | |
| You decide | Claude discretion. | |

**User's choice:** Auto-read SMS + manual fallback
**Notes:** None

---

## Role Management

### First admin establishment?

| Option | Description | Selected |
|--------|-------------|----------|
| Signup user = Admin automatically | Person who signs up is Admin. | ✓ |
| Signup user chooses role | User selects role during signup. | |
| First user is Clinician + Admin | Dual role recognizing solo vet reality. | |

**User's choice:** Signup user = Admin automatically
**Notes:** None

### How admin adds team members?

| Option | Description | Selected |
|--------|-------------|----------|
| Invite via phone number | Enter phone + role, staff gets SMS invite. | ✓ |
| Invite via email | Enter email + role, staff gets email invite. | |
| Create account directly | Admin creates username + temp password. | |

**User's choice:** Invite via phone number
**Notes:** Phone-centric matches Indian workflow.

### Multiple roles per user?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — multiple roles | Admin + Clinician, Front Desk + Inventory Manager. | ✓ |
| One role per user | Exactly one role per user. | |
| You decide | Claude discretion. | |

**User's choice:** Yes — multiple roles
**Notes:** Reflects reality of small clinics.

### Permission granularity?

| Option | Description | Selected |
|--------|-------------|----------|
| Role-level permissions | Fixed permissions per role, no per-user customization. | |
| Customizable per user | Admin toggles individual permissions per user. | ✓ |
| You decide | Claude discretion. | |

**User's choice:** Customizable per user
**Notes:** None

### Role defaults + customize?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — defaults + customize | Each role starts with standard set, admin toggles on/off. | ✓ |
| Blank slate | Admin builds permissions from scratch. | |
| You decide | Claude discretion. | |

**User's choice:** Yes — defaults + customize
**Notes:** None

### Deactivate vs delete staff?

| Option | Description | Selected |
|--------|-------------|----------|
| Deactivate only | Blocks login, preserves audit trail. No hard delete. | ✓ |
| Deactivate + delete | Both options available. | |
| You decide | Claude discretion. | |

**User's choice:** Deactivate only
**Notes:** Medical records need to trace who created them.

---

## Multi-device Policy

### Concurrent sessions?

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited concurrent sessions | Phone + web + tablet simultaneously. | ✓ |
| Limited to 3 devices | 4th login forces oldest out. | |
| Single device only | New login logs out previous. | |

**User's choice:** Unlimited concurrent sessions
**Notes:** None

### Session management UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — session visibility | Admin sees all active sessions, can force-logout. | |
| No — keep it simple | No session management for Beta. Change password if needed. | ✓ |
| You decide | Claude discretion. | |

**User's choice:** No — keep it simple
**Notes:** None

### Session duration?

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days with silent refresh | Access token refreshes silently. Expires after 30 days inactivity. | ✓ |
| 7 days | Re-authenticate weekly. | |
| You decide | Claude discretion. | |

**User's choice:** 30 days with silent refresh
**Notes:** None

### Password change behavior?

| Option | Description | Selected |
|--------|-------------|----------|
| Force logout everywhere | All other sessions invalidated. | ✓ |
| Only current session stays | Existing sessions remain active. | |
| You decide | Claude discretion. | |

**User's choice:** Force logout everywhere
**Notes:** Standard security practice.

---

## Tenant & Clinic Model

### Multi-clinic support?

| Option | Description | Selected |
|--------|-------------|----------|
| One clinic per account for Beta | Separate accounts for separate clinics. | |
| Multi-clinic from day one | Own/manage multiple clinics, switch between them. | ✓ |
| You decide | Claude discretion. | |

**User's choice:** Multi-clinic from day one
**Notes:** User wants this despite added complexity.

### Clinic switching UX?

| Option | Description | Selected |
|--------|-------------|----------|
| Clinic switcher in header/nav | Dropdown in nav, like Slack workspace switching. | ✓ |
| Separate login per clinic | Log out and into different clinic. | |
| You decide | Claude discretion. | |

**User's choice:** Clinic switcher in header/nav
**Notes:** Like Slack workspace switching.

### Clinic entity fields?

| Option | Description | Selected |
|--------|-------------|----------|
| Name + address + phone | Minimum viable clinic entity. | ✓ |
| Full profile from start | Name, address, phone, GSTIN, license, logo, hours. | |
| You decide | Claude discretion. | |

**User's choice:** Name + address + phone
**Notes:** More fields added in settings later.

### Patient data sharing?

| Option | Description | Selected |
|--------|-------------|----------|
| No — isolated per clinic | Each clinic completely separate. | |
| Yes — shared patient records | Records visible across vet's clinics. | |
| Custom | Both automatic + consent-based sharing. | ✓ |

**User's choice:** Both automatic sharing (across same-owner clinics) AND consent-based sharing (across different clinics on Breeyo)
**Notes:** User wants Breeyo clients to be able to access pet records across the platform with appropriate consent.

### Cross-clinic sharing scope?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared by owner account | Vet's clinics share automatically. Staff can't cross-see. | ✓ (part of model) |
| Shared by pet owner consent | Different clinic links pet with owner consent. | ✓ (part of model) |
| You decide | Claude discretion. | |

**User's choice:** Both layers combined
**Notes:** Staff at Clinic A still can't see Clinic B data. Sharing is scoped by ownership.

---

## API Conventions

### API style?

| Option | Description | Selected |
|--------|-------------|----------|
| REST with consistent patterns | RESTful /api/v1/{resource}. Standard HTTP codes. | ✓ |
| tRPC | End-to-end type-safe RPC. | |
| You decide | Claude discretion. | |

**User's choice:** REST with consistent patterns
**Notes:** Decided in research as right choice for Beta.

### Error format?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON errors | {error: {code, message, details}}. Consistent format. | ✓ |
| HTTP status codes only | Status codes + simple message string. | |
| You decide | Claude discretion. | |

**User's choice:** Structured JSON errors
**Notes:** None

### API versioning?

| Option | Description | Selected |
|--------|-------------|----------|
| /api/v1/ prefix | Versioned from day one. Coexistence when v2 needed. | ✓ |
| No versioning for Beta | Just /api/. Version when needed. | |
| You decide | Claude discretion. | |

**User's choice:** /api/v1/ prefix
**Notes:** Can't force-update all mobile app versions simultaneously.

### Rate limiting?

| Option | Description | Selected |
|--------|-------------|----------|
| Basic rate limiting | Per-user on auth endpoints (100 req/min). Anti-brute-force. | ✓ |
| Comprehensive | Per-endpoint, per-user, per-IP. | |
| No rate limiting | Skip for Beta. | |
| You decide | Claude discretion. | |

**User's choice:** Basic rate limiting
**Notes:** None

---

## Environment & CI/CD

### Environments?

| Option | Description | Selected |
|--------|-------------|----------|
| Local + staging + production | Three environments from day one. | ✓ |
| Local + production only | No staging. | |
| You decide | Claude discretion. | |

**User's choice:** Local + staging + production
**Notes:** None

### CI/CD setup?

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions from day one | Auto-test on PR, auto-deploy staging, manual production. | ✓ |
| Manual deployment | Deploy via scripts. | |
| You decide | Claude discretion. | |

**User's choice:** GitHub Actions from day one
**Notes:** None

### Backend hosting?

| Option | Description | Selected |
|--------|-------------|----------|
| AWS Mumbai (EC2/ECS) | Full control. RDS, ElastiCache. India data residency. | ✓ |
| Railway/Render + AWS RDS | Easier deploys, split infrastructure. | |
| You decide | Claude discretion. | |

**User's choice:** AWS Mumbai (EC2/ECS)
**Notes:** None

---

## Logging & Audit Trail

### Logging level?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured logs + error tracking | JSON logs (Winston/Pino), CloudWatch, Sentry. | ✓ |
| Basic console logs | Minimal. Add later. | |
| Full observability stack | Logs + tracing + metrics. Enterprise-grade. | |
| You decide | Claude discretion. | |

**User's choice:** Structured logs + error tracking
**Notes:** None

### Auth audit log?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — dedicated auth audit log | All auth events in dedicated table. | ✓ |
| General app logs only | Auth events mixed with everything else. | |
| You decide | Claude discretion. | |

**User's choice:** Yes — dedicated auth audit log
**Notes:** Critical for security and compliance.

### Immutable audit logs?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — immutable (append-only) | No delete or update. Tamper-proof. | ✓ |
| Soft-delete allowed | Can hide entries. | |
| You decide | Claude discretion. | |

**User's choice:** Yes — immutable
**Notes:** Standard for medical/healthcare systems.

---

## Claude's Discretion

- Setup wizard UI/UX flow and transitions
- OTP resend rate-limit thresholds
- Loading skeleton design for auth screens
- Exact default permission set per role
- Log compression and retention policy
- Error state handling for edge cases

## Deferred Ideas

None — discussion stayed within phase scope
