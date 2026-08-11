# Phase 7: WhatsApp Communication - Research

**Researched:** 2026-08-12
**Domain:** Messaging provider abstraction (WhatsApp Business Cloud API), BullMQ scheduled reminders, conversational booking state machine, mobile staff inbox
**Confidence:** HIGH (codebase facts verified by direct inspection; Cloud API facts verified against Meta developer docs; BullMQ facts verified against installed `bullmq@5.81.3` type definitions and docs.bullmq.io)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Reminder Cadence & Escalation**
- **D-01:** Follow-up reminder fires twice — 1 day before the follow-up date set at consultation end (Phase 4 D-09), and again on the date itself.
- **D-02:** Vaccine/deworming due reminder fires twice — a fixed 3 days before the due date (Phase 4 D-42/D-43), and again on the due date. Not configurable for Beta (no admin picker, unlike Phase 5's expiry lead-time config).
- **D-03:** Bounded escalation on no-reply — if the owner doesn't respond to a follow-up/vaccine/deworming reminder, the system resends. Claude's discretion on exact count/spacing; recommended default is 2 total attempts, 3 days apart.
- **D-04:** After the escalation cap is reached with no reply, the thread is flagged "Needs action" in the inbox (using the filter chip already in UI-SPEC). No further automated sends happen after that — a human decides whether to call the owner.
- **D-05:** Payment reminders for overdue invoices (deferred from Phase 6) are manual-only in Phase 7 — no automated sending or escalation logic at all. Front desk sends the "Payment reminder" template by hand from invoice detail. This is a deliberate exception to D-03's escalation pattern — do not generalize escalation to payment reminders.

**Booking Approval Flow**
- **D-06:** Booking requests auto-confirm as soon as the requested clinic-hours slot is open — no staff review gate before the owner gets a confirmation. Staff still see the booking land in the thread via the ConversationActionCard.
- **D-07:** Slot conflicts resolve first-come-first-served — the first booking request to arrive takes the slot; a second request for the same slot is told it's unavailable and prompted to pick another.
- **D-08:** A confirmed Phase 7 booking blocks that clinic-hours slot from being offered to other WhatsApp booking requests for that day, even though there's no real calendar yet (Phase 8 owns that). This is enforcement inside Phase 7's own booking-request logic, not a calendar integration.
- **D-09:** Moving or cancelling a confirmed booking is staff-only, via the Move/Cancel action cards already speced in UI-SPEC. No owner self-service quick-replies for changing a booking in Beta — an owner who wants to change a booking contacts the clinic and staff acts on it.

**Consent & Opt-Out Scope**
- **D-10:** Template category split — "Payment reminder", "Follow-up reminder", "Vaccine due", and "Deworming due" are reminder-category templates an owner can silence via STOP. "Invoice delivery" and "Booking confirmation" are transactional — always attempted regardless of STOP status (per UI-SPEC's existing STOP-state copy: "Transactional messages still need staff review").
- **D-11:** Opt-out is a single global per-owner toggle — one STOP silences all reminder-category templates across all of that owner's pets. No per-category opt-out granularity in Beta (there's no WhatsApp-native mechanism for it without adding new quick-reply chips beyond what UI-SPEC defines).
- **D-12:** WhatsApp communication requires explicit opt-in consent, captured and logged via Phase 1's existing `ConsentRecord` model (new `consentType` value, e.g. `whatsapp_communication`) rather than treating patient registration as implied consent. Reuses the existing consent infrastructure instead of building a parallel one.
- **D-13:** Missing consent does not block sending — the TemplateSendSheet shows its already-speced consent/preference warning, but staff can proceed anyway. Consent tracking is for audit/compliance visibility, not an operational gate, for Beta.

**Simulator Demo Realism**
- **D-14:** Simulated owner replies are auto-generated after a short delay rather than manually triggered by staff — threads feel alive for pilot-clinic demos without anyone touching the Config screen mid-demo.
- **D-15:** For booking action cards (Confirm/Move/Cancel), the simulator's auto-reply always takes the positive/default path (Confirm). Cancel/Move scenarios are not auto-simulated in Beta — those still require someone to drive the thread manually if a demo needs to show them.
- **D-16:** The deterministic failure/delayed-delivery/invalid-number controls (already locked in UI-SPEC's SimulatorControlCard) apply as a global toggle affecting the next send(s), not a per-owner/thread override. Simpler single control surface; matches the SimulatorControlCard states as speced.

### Claude's Discretion
- Exact escalation attempt count and interval for bounded reminder escalation (D-03) — recommended default: 2 attempts, 3 days apart
- BullMQ job scheduling design for reminder cadence (delay jobs, repeatable jobs, or cron sweep matching Phase 5's daily-expiry-cron pattern)
- Provider abstraction layer interface shape (how the simulator and future real Meta API both implement it)
- Booking slot-blocking data model (how "confirmed booking blocks a slot" is represented without a real calendar)
- Exact auto-reply delay timing for simulator realism (D-14)
- `ConsentRecord.consentType` naming convention and where in the flow consent gets captured (registration vs. first WhatsApp send)
- Template variable rendering and validation approach
- Retry/backoff mechanics for provider-level delivery failures (distinct from the escalation-on-no-reply behavior in D-03/D-04)

### Deferred Ideas (OUT OF SCOPE)
- Configurable reminder lead times (admin-adjustable, like Phase 5's expiry lead-time picker) — Beta ships fixed values (1 day before follow-up, 3 days before vaccine/deworming due) per D-01/D-02; configurability deferred to post-Beta if clinics ask for it
- Per-category opt-out granularity (owner silences vaccine reminders but keeps payment reminders) — deferred; D-11 keeps opt-out as a single global toggle for Beta
- Owner self-service booking move/cancel via quick-reply — deferred; D-09 keeps this staff-only for Beta
- Escalating/automated payment reminders — deferred; D-05 keeps payment reminders manual-only for Beta, revisit post-Beta once real payment behavior data exists
- Admin-scriptable simulator outcomes (choosing which quick-reply the simulated owner "picks" per scenario) — deferred; D-15 keeps the auto-reply always taking the positive/default path for Beta
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **WHA-01** | System sends automated appointment reminders via WhatsApp (simulated) | § Pattern 4 (daily IST sweep + `WhatsAppReminderTask` rows), § Pattern 5 (escalation state machine), § Data Model (`WhatsAppReminderTask`), § Pitfall 1 (Redis LRU eviction rules out long-horizon delayed jobs), § Pitfall 3 (superseded next-due records) |
| **WHA-02** | System delivers invoices to pet owners via WhatsApp (simulated) | § Pattern 3 (template registry with `invoice_delivery` transactional template), § Pattern 6 (`WaMediaRef` indirection for the invoice PDF), § Pitfall 8 (Phase 6 `Invoice` model does not exist yet — reference by generic `contextType`/`contextId`), § Code Example 4 |
| **WHA-03** | Pet owners can book appointments via WhatsApp conversation (simulated) | § Pattern 7 (booking state machine), § Pattern 8 (`WhatsAppSlotHold` unique-constraint arbitration for D-07/D-08), § Cloud API Constraints (≤10 list rows / ≤3 buttons / 20-char titles), § Code Example 5 |
| **WHA-04** | WhatsApp integration uses abstraction layer (simulator swappable for real API) | § Pattern 1 (ports & adapters `WaProvider` port + capability flags), § Pattern 2 (persist-then-dispatch outbox), § WhatsApp Business Cloud API Reference (the real contract the port must model), § Anti-Pattern A1/A2/A3, § Code Examples 1–3 |
| **WHA-05** | All WhatsApp message flows are logged and viewable in dashboard | § Data Model (`WhatsAppThread`/`WhatsAppMessage`/`WhatsAppMessageStatusEvent` append-only status ledger), § Pattern 9 (single `DeliveryStatusService` funnel), § Mobile Architecture (inbox/thread screens + Socket.IO `clinic:{id}` room), § Pitfall 11 (mobile UI library gap) |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Verified directives the planner must honor. Each was checked against actual code.

| Directive | Verified reality in repo | Implication for Phase 7 |
|-----------|--------------------------|-------------------------|
| API module structure `modules/<name>/` with `controller.ts`, `service.ts`, `routes.ts`, `schema.ts` | Confirmed. Newer modules also add `<name>.repository.ts` (`apps/api/src/modules/vaccination/`, `emr/`) | Create `apps/api/src/modules/whatsapp/` with `whatsapp.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.schema.ts` plus provider/adapter subfolders |
| Routes registered via `app.register()` with `/api/v1` prefix | Confirmed in `apps/api/src/app.ts:72-88` | Add `await app.register(import('./modules/whatsapp/whatsapp.routes.js'), { prefix: '/api/v1' })` |
| `@fastify/jwt` auth, `authenticate` and `authorize` middleware | Confirmed. Actual export is `requirePermission(...codes)` in `apps/api/src/middleware/authorize.ts`, **not** `authorize` | Use `preHandler: [authenticate, tenantContext, requirePermission('SEND_WHATSAPP')]`. The `SEND_WHATSAPP` permission **already exists** in `apps/api/prisma/seed.ts:24` |
| RLS enforced at DB level via `prisma-rls.ts` — always set tenant context | **Partially true.** `tenantContext` sets `request.db`, but every Phase 3/4 module injects `fastify.prisma` (admin role) into its repository and filters by explicit `clinicId` params. Only 3 tables actually have RLS enabled (`clinic_members`, `auth_audit_log`, `notifications`) | See § Pitfall 5 — do **not** enable `FORCE ROW LEVEL SECURITY` on new WhatsApp tables while services use `fastify.prisma`; follow the established explicit-`clinicId` pattern and add RLS policies without FORCE, or route through `request.db` |
| Error handling via centralized `error-handler.ts` | Confirmed (`apps/api/src/middleware/error-handler.ts`). Convention: throw `Error & { statusCode, code }`; response shape `{ error: { code, message, details? } }` | Follow the same throw pattern (see `vaccination.service.ts:151-162`) |
| Rate limiting: 200/min global, 20/min on auth endpoints | Confirmed in `app.ts:48-52,74` | Webhook route needs its own tighter `config.rateLimit` — see § Security Domain |
| All Prisma columns `snake_case` with `@map()`, TS `camelCase` | Confirmed throughout `schema.prisma` | Apply to every new model/field |
| UUIDs generated by PostgreSQL (`gen_random_uuid()`) | Confirmed: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` | Use the identical annotation |
| Audit logging via `audit-log.ts` for auth events | Confirmed, but `writeAuditLog` writes to `AuthAuditLog` and `AuditEvent` is an auth-only enum | See § Pitfall 6 — extend the enum rather than creating a second audit table |
| Zod for all request/response validation, shared via `@breeyo/validators` | Confirmed. Add `packages/validators/src/whatsapp.ts` and export from `index.ts` | |
| Shared types via `@breeyo/types` | Confirmed. Add `packages/types/src/whatsapp.ts` + `constants/whatsapp.constants.ts`, export from `index.ts` | |
| TypeScript strict mode, ESM (`"type": "module"` in API) | Confirmed | All intra-API imports need the `.js` extension |
| Commit messages `feat\|fix\|chore\|docs(phase-NN): description`; branch `breeyo/phase-NN-description` | Confirmed by git log | Branch `breeyo/phase-07-whatsapp-communication` |
| Vitest everywhere; API tests use `supertest` with `buildApp({ logger: false })` | **Partially true.** `apps/api/tests/helpers/app.ts` uses `buildTestApp()` + `app.inject()`-style Fastify testing, not supertest, in Phase 3/4 tests | Follow `buildTestApp()` from `tests/helpers/app.ts` and the factories in `tests/helpers/factories.ts` |
| Never commit `.env` files | `.env.example` exists at repo root (not `apps/api/`) | Add WhatsApp env vars to the **root** `.env.example` |

### Project Skills (`.claude/skills/breeyo-build/SKILL.md`)

`breeyo-build --build` mode requires: TDD iron law (failing test first, delete code written before a test), each task references the `D-XX` decision and `REQ-ID` it implements, exact monorepo file paths, 2–5 minute tasks. **The planner must write plans in this shape** — tests-first tasks with `D-XX`/`WHA-0X` traceability annotations.

---

## Summary

Phase 7 is fundamentally an **anti-corruption-layer** phase, not a WhatsApp integration phase. Zero real Meta API calls are made in Beta, so the only durable output is the *shape* of the boundary: if the port models the simulator's freedoms rather than the Cloud API's constraints, the swap in WHA-04 becomes a rewrite. The single highest-leverage decision available to the planner is to make the **simulator adapter enforce the real Cloud API's constraints** — template-only sends outside a 24-hour service window, ≤3 quick-reply buttons at 20 characters, ≤10 interactive-list rows at 24 characters, pre-registered template keys with typed variables, opaque provider message IDs, and asynchronous status transitions arriving via webhook rather than as a return value. Every one of those constraints was verified against Meta's current developer documentation and is cheap to honor now and expensive to retrofit.

The scheduling side has a decisive, codebase-specific answer. `docker-compose.yml` runs Redis with `--maxmemory 128mb --maxmemory-policy allkeys-lru`, which will evict BullMQ's own keys under pressure. Long-horizon BullMQ delayed jobs (a vaccine due-date can be 12 months out) are therefore unsafe in this project, and the correct design is Postgres-owned reminder task rows swept by a short daily job — matching the existing `scheduleMidnightArchive` cron precedent (`apps/api/src/jobs/midnight-archive.ts`) but implemented with BullMQ's `upsertJobScheduler` (present in the installed `bullmq@5.81.3`) instead of in-process `node-cron`, because `node-cron` fires once *per ECS task* and the infra deploys to ECS. BullMQ delayed jobs remain the right tool for the *seconds-to-minutes* horizons: simulator auto-replies (D-14), delayed-delivery simulation (D-16), and provider retry/backoff.

Three pre-existing repository conditions will block Phase 7 execution if the planner does not schedule Wave 0 work for them. First, `apps/api/prisma/migrations/` contains only two migrations (`init`, `add_consent_records`) while `schema.prisma` declares 29 models — the dev and CI databases have no `pets`, `consultations`, `vaccination_records`, or `deworming_records` tables, so any Phase 7 integration test touching a pet or a follow-up date will fail on a fresh database. Second, `apps/mobile/package.json` declares neither `@breeyo/ui` nor `react-native-paper`, and neither is installed, while 07-UI-SPEC.md mandates React Native Paper v5 MD3 components — Phase 4 silently worked around this with plain RN components. Third, Phase 4 mobile code imports `expo-print`, `expo-file-system`, `expo-sharing`, and `expo-av` which are absent from both `package.json` and `node_modules`; Phase 7's invoice-PDF delivery path touches the same code.

**Primary recommendation:** Build `apps/api/src/modules/whatsapp/` as a hexagonal module — a `WaProvider` port with declared `capabilities`, a `SimulatorProvider` adapter that *enforces* Cloud API constraints, and a `CloudApiProvider` stub selected by `WHATSAPP_PROVIDER` env var; persist every outbound message to `WhatsAppMessage` *before* dispatch (outbox), funnel every status change — simulator and real webhook alike — through one `DeliveryStatusService`; drive D-01/D-02/D-03 from `WhatsAppReminderTask` rows swept daily at 08:30 IST via `upsertJobScheduler`; and arbitrate D-07/D-08 slot conflicts with a `@@unique([clinicId, slotDate, slotStart])` constraint on `WhatsAppSlotHold` rather than application-level locking. Add zero new npm dependencies.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provider abstraction / adapter selection | API (backend) | — | Provider credentials and webhook signature secrets must never reach the mobile client |
| Template registry + variable rendering | API (backend) | Shared package (`@breeyo/types` for template keys & variable names) | Real Cloud API renders templates server-side from a pre-approved catalog; rendering client-side would be unswappable. Template *keys* are shared so mobile can label the send sheet |
| Outbound send authorization (consent, STOP, permission) | API (backend) | Mobile (advisory warning UI only, per D-13) | Security gate must be server-side; mobile shows the UI-SPEC consent warning but cannot be the enforcement point |
| Reminder scheduling & escalation | API (backend worker) | Database (task state) | Automated, must run without any client present; state lives in Postgres so it survives Redis eviction and restarts |
| Delivery status ingestion | API (backend webhook + worker) | Database (append-only status ledger) | Meta pushes status webhooks to a public endpoint; mobile is a read-only observer |
| Booking slot availability + conflict resolution | Database (unique constraint) | API (slot generation from `Clinic.workingHours`) | First-come-first-served (D-07) is a concurrency problem; Postgres is the only correct arbiter |
| Booking conversation flow / state machine | API (backend) | Shared package (state enum + transition table) | Inbound webhook drives transitions; state must be authoritative server-side. Transition table shared so mobile can render valid action cards |
| Simulator auto-reply generation | API (backend worker) | — | Must fire without a client attached (D-14: "without anyone touching the Config screen") |
| Simulator failure/delay controls | API (backend, per-clinic config row) | Mobile (Admin config screen) | D-16 makes this a global per-clinic toggle, so it is server state edited by an Admin screen |
| Staff inbox / thread rendering | Mobile (Expo) | API (paginated read endpoints) | UI-SPEC: mobile-only phase, no web dashboard |
| Realtime inbox updates | API (Socket.IO `clinic:{id}` room) | Mobile (socket hook invalidating React Query keys) | Pattern already established by `useQueueSocket.ts` |
| Cross-module send entry points (invoice detail, pet profile, reminder card, document view) | Mobile (TemplateSendSheet) | API (single `POST /whatsapp/send` endpoint) | UI-SPEC lists five launch surfaces; one server endpoint keeps authorization in one place |
| Invoice PDF media handling | API (media reference indirection) | Mobile (`expo-print` generation — existing Phase 4 path) | PDFs are currently generated client-side (`apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts`); the port must accept an opaque `WaMediaRef` so the real adapter can later upload to `POST /{phone-number-id}/media` |

---

## Standard Stack

### Core — all already installed, zero new dependencies

| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `fastify` | ^5.1.0 (`apps/api/package.json`) | HTTP server, webhook endpoint, route plugins | Project standard since Phase 1 |
| `@prisma/client` / `prisma` | ^6.2.0 | Threads, messages, reminder tasks, slot holds | Project standard |
| `bullmq` | 5.81.3 installed (declared `^5.30.0`; latest is 6.0.11) | Reminder sweep scheduler, outbound dispatch worker, simulator auto-reply delays, retry/backoff | Already the notification transport (`notification-bus.ts`). `upsertJobScheduler` + `removeJobScheduler` + `deduplication` options confirmed present in the installed 5.81.3 type definitions [VERIFIED: `apps/api/node_modules/bullmq/dist/esm/classes/queue.d.ts:202,302`; `types/job-options.d.ts:16`] |
| `ioredis` | ^5.4.0 | BullMQ connection (via `app.redis` decorator) | Project standard |
| `zod` | ^3.24.0 | Request validation, template variable schemas, webhook payload validation | Project standard; `@breeyo/validators` pattern |
| `socket.io` / `socket.io-client` | ^4.8.3 | Realtime inbox/thread updates into the `clinic:{clinicId}` room | Established by Phase 3 queue realtime |
| `node:crypto` (built-in) | Node 22 (CI) / 24.13.1 (local) | `createHmac` + `timingSafeEqual` for `X-Hub-Signature-256` webhook verification | Stdlib — do not add a signature library |
| `fetch` (built-in, undici) | Node 18+ global | Cloud API adapter HTTP calls (stub in Beta) | Native since Node 18; adding an HTTP client is unnecessary |
| `@tanstack/react-query` | ^5.101.4 (mobile) | Inbox/thread data fetching, mutations, optimistic send | Established by `useQueue.ts` |
| `zustand` | ^5.0.14 (mobile) | Inbox filter chip state, offline banner state | Established by `queueUIStore.ts` |

### Supporting — already installed

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node-cron` | ^4.6.0 | Existing cron precedent (`midnight-archive.ts`) | **Do not use for the reminder sweep** — see § Pitfall 2. Kept only because the existing archive job uses it |
| `nanoid` | ^5.0.0 | Booking reference generation (`BK-YYYYMM-XXXX`) if a non-sequential reference is acceptable | Alternative to a Postgres sequence |
| `@sentry/node` | ^9.0.0 | Error capture on provider failures | Already wired in `server.ts` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written `CloudApiProvider` using native `fetch` | `whatsapp-api-js@6.2.2` [ASSUMED] | Adds a dependency for ~200 lines of typed `fetch` calls, and in Beta the adapter is a stub with no live traffic. Community-maintained, not Meta-official (Meta's own `whatsapp` npm SDK is stuck at `0.0.5-Alpha`, last published 2024-02-12 — effectively abandoned) [VERIFIED: npm registry via `npm view`]. **Recommendation: do not add.** |
| Hand-written Cloud API TypeScript types | `@whatsapp-cloudapi/types@5.0.1` [ASSUMED] | Only 437 weekly downloads (slopcheck: "Not exactly popular"). Types for a stubbed adapter are cheap to hand-write and keep the port free of third-party type coupling. **Recommendation: do not add.** |
| Postgres reminder-task rows + daily sweep | Per-record BullMQ delayed jobs | Delayed jobs are relative-time and Redis-resident; this project's Redis runs `allkeys-lru` eviction (`docker-compose.yml:24`), so a 12-month vaccine reminder can silently vanish. Also requires cancel/reschedule bookkeeping when a due date changes. **Rejected.** |
| BullMQ `upsertJobScheduler` for the daily sweep | `node-cron` in-process (existing precedent) | `node-cron` fires in every process; `infra/aws/` deploys ECS tasks, so N tasks = N duplicate sweeps. BullMQ schedulers are Redis-coordinated and fire once. **Recommend BullMQ.** |
| `WhatsAppSlotHold` unique constraint | Redis lock / application-level check-then-insert | Check-then-insert has a race; Redis locks add a failure mode and are lost on eviction. A Postgres unique index is the correct arbiter for D-07. **Recommend the constraint.** |
| New `WhatsAppConsent` table | Reuse `ConsentRecord` (D-12, locked) | Locked decision. `ConsentRecord` has `ownerId String?`, `consentType`, `purposeText`, `grantedAt`, `withdrawnAt?`, `actorId?`, `ipAddress?` and **no** `clinicId` and no unique constraint [VERIFIED: `schema.prisma:302-317`] — so "current consent" must be computed as the latest non-withdrawn row |

**Installation:** none required.

```bash
# No new packages. Verify existing toolchain only:
pnpm install
pnpm --filter @breeyo/api db:generate
```

**Version verification performed:**
```
npm view bullmq version              -> 6.0.11 (latest); installed 5.81.3 — stay on 5.x
npm view whatsapp version            -> 0.0.5-Alpha, time.modified 2024-02-12 (Meta's own SDK, abandoned)
npm view whatsapp-api-js version     -> 6.2.2, time.modified 2026-07-17
npm view @whatsapp-cloudapi/types    -> 5.0.1, time.modified 2026-05-28
npm view @whatsapp-cloudapi/client   -> 5.0.1, time.modified 2026-05-28
```

---

## Package Legitimacy Audit

Phase 7 requires **no new external packages**. The audit below covers the candidates evaluated and rejected, so the planner can confirm the "zero new dependencies" conclusion rather than re-deriving it.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `whatsapp-api-js` | npm | active, last publish 2026-07-17 | not flagged low | github.com/Secreto31126/whatsapp-api-js | `[OK]` | **NOT ADDED** — community SDK; native `fetch` suffices for a Beta stub |
| `@whatsapp-cloudapi/client` | npm | last publish 2026-05-28 | 437/wk ("Not exactly popular") | github.com/ericvera/whatsapp-cloudapi | `[OK]` (low-download note) | **NOT ADDED** — low adoption; avoid coupling the port to third-party types |
| `@whatsapp-cloudapi/types` | npm | last publish 2026-05-28 | low | github.com/ericvera/whatsapp-cloudapi | `[OK]` | **NOT ADDED** — hand-write the ~6 adapter interfaces |
| `whatsapp` (Meta official) | npm | last publish 2024-02-12, version `0.0.5-Alpha` | — | github.com/WhatsApp/WhatsApp-Nodejs-SDK | not run (abandoned on version grounds) | **REJECTED** — 2.5 years stale, still alpha |

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

slopcheck was available and run (`slopcheck install -e npm ...`). Note: slopcheck auto-detects ecosystem from project files and defaulted to **PyPI** on first invocation, reporting false `[SLOP]` for both npm packages; re-running with `-e npm` returned `[OK]` for all three. Any future package check in this repo must pass `-e npm` explicitly.

---

## WhatsApp Business Cloud API Reference

This is the contract the abstraction layer must be able to satisfy without redesign. Everything here is cited from Meta developer documentation fetched during this research.

### Send endpoint

`POST https://graph.facebook.com/<VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages` [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages]

Required envelope fields on every message type: `messaging_product` (always `"whatsapp"`), `recipient_type` (`"individual"`), `to`, `type`. [CITED: developers.facebook.com/docs/whatsapp/cloud-api/reference/messages]

**Response shape** — this is why provider message IDs must be opaque and status must be asynchronous:
```json
{
  "messages": [{ "id": "wamid.HBg...", "message_status": "accepted" }],
  "contacts": [{ "input": "+919876543210", "wa_id": "919876543210" }]
}
```
`message_status` on the send response is one of `accepted` | `held_for_quality_assessment` | `paused` — **never** `delivered`. Delivery is reported later by webhook. Note also that `contacts[].wa_id` is returned separately from `contacts[].input` and can differ from the number you submitted. [CITED: developers.facebook.com/docs/whatsapp/cloud-api/reference/messages]

### Customer service window (24 hours)

"When a WhatsApp user messages you or calls you, a 24-hour timer called a customer service window starts. If the user messages or calls you again before the timer expires, the timer resets to 24 hours." … "When the window closes, you can only send pre-approved template messages." Free-form "service messages" require an open window and need no pre-approval. [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages]

**Consequence for Phase 7:** every clinic-initiated reminder, invoice delivery, and booking confirmation is *by definition* outside any window and must be a template. Free-form text is only ever legal as a reply inside a window. The simulator must enforce this or the code that ships will be illegal against the real API.

### Templates

- Categories: `AUTHENTICATION`, `UTILITY`, `MARKETING`. [CITED: multiple, incl. AWS End User Messaging Social API reference]
- Body parameters support **named** parameters (`{ "type": "text", "text": "...", "parameter_name": "pet_name" }`) as well as positional `{{1}}`. Templates with variables must be created with example values.
- Templates carry a quality rating and Meta can move an approved template to `PAUSED` automatically on negative feedback — meaning template *status* is provider state that can change without your involvement. [CITED: Infobip template-compliance docs; Gorgias template quality rating docs]
- Marketing templates have a per-user daily cap (~2/day across all businesses) [ASSUMED — third-party sources only, not verified against Meta docs]. Not directly relevant to Beta since all six Phase 7 templates are UTILITY-shaped, but it is the reason D-10's reminder/transactional split is worth keeping.

### Interactive messages — hard limits the booking flow must respect now

Reply buttons [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages]:
- Max **3** buttons per message
- Button `id`: max **256** characters
- Button `title`: max **20** characters
- Body text: max **1024** characters

List messages [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages]:
- Max **10** sections; max **10 rows total across all sections**
- Row `id` max 200 chars; row `title` max **24** chars; row `description` max **72** chars
- Section title max 24 chars; button text max 20 chars; header 60; footer 60; body 4096

**Consequence for Phase 7:** the booking flow may never offer more than 10 slots in one message and never more than 3 quick-reply chips. Slot labels must fit 24 characters (`"Tue 14 Aug, 10:30 AM"` = 20 chars — fits).

### Inbound webhook shapes

Button tap on an interactive message:
```json
{ "type": "interactive",
  "context": { "from": "<business_phone>", "id": "<original_wamid>" },
  "interactive": { "type": "button_reply", "button_reply": { "id": "<BUTTON_ID>", "title": "<LABEL>" } } }
```
Row pick on a list message: `interactive.type = "list_reply"` with `list_reply: { id, title, description }`. [CITED: same two Meta pages]

Quick-reply buttons on *template* messages arrive differently from interactive buttons (as a `button` object with `payload`/`text` rather than `interactive.button_reply`) [ASSUMED — third-party sources agree, but not confirmed on an official Meta page during this session]. **Design implication:** the port's `parseInbound` must normalize *both* shapes to a single domain event, so the planner should not build a parser that only understands one.

### Delivery status webhooks

Each status object carries `id` (the same `wamid` returned at send), `status`, `recipient_id`, `timestamp`, and — on billable events — `conversation` and `pricing` objects. Statuses progress `sent → delivered → read`, or `failed` with an `errors` array. **Statuses are not guaranteed to arrive in order**; `read` can land before `delivered`. [CITED: hookdeck.com WhatsApp webhooks guide, corroborated across sources]

**Consequence:** the status model must be monotonic-by-rank, not last-write-wins. See § Pattern 9.

### Webhook security

- `GET` verification handshake: Meta sends `hub.mode`, `hub.verify_token`, `hub.challenge`; the endpoint must echo `hub.challenge` when the verify token matches.
- Every `POST` carries `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 of the **raw** body keyed with the app secret. Must be verified against the raw body *before* JSON parsing, using a timing-safe comparison. [CITED: hookdeck.com; webhookrelay.com]

### Media

`POST /<PHONE_NUMBER_ID>/media` (multipart: `file`, `type`, `messaging_product`) returns a media `id`. Media is stored 30 days after last use. Max 100 MB. Media uploads are limited to 25 requests/sec per phone number. Document messages accept an optional `filename`. [CITED: developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/media-upload-api; 360dialog media docs]

**Consequence:** media is a two-step (upload → reference by id) operation with an expiry. The port must express media as an opaque handle obtained from the provider, not as a URL the caller supplies.

### Throughput & tiers

Default throughput 80 messages/second per phone number, upgradeable to 1,000 MPS. Business-initiated conversations are separately capped by messaging tiers (1K/2K → 10K → 100K → unlimited unique recipients per rolling 24 h) based on quality rating and verification. [CITED: AWS Social Messaging "Increase message throughput"; corroborated by multiple provider docs]

**Consequence:** the outbound dispatch worker should be rate-limitable (BullMQ `limiter`) rather than unbounded concurrency, and the port should expose a `RATE_LIMITED` retryable failure code.

### Failure codes worth normalizing

| Meta code | Meaning | Normalize to |
|-----------|---------|--------------|
| 131026 | Message undeliverable — recipient may not be on WhatsApp, blocked you, restricted country, or hasn't accepted ToS. Meta deliberately does not disambiguate | `NOT_ON_WHATSAPP` (surface as UI-SPEC's "This mobile number may not be on WhatsApp") |
| 131047 | Re-engagement required — 24 h window expired | `OUTSIDE_SERVICE_WINDOW` |
| 131049 | Meta chose not to deliver (marketing/quality preference) | `SUPPRESSED_BY_META` |
| 132000 / 132001 | Template parameter count mismatch / template not found or unapproved | `TEMPLATE_PARAM_MISMATCH` / `TEMPLATE_NOT_AVAILABLE` |
| 4 / 80007 / 130429 | Rate/throughput limits | `RATE_LIMITED` (retryable) |

[CITED: developers.facebook.com/docs/whatsapp/on-premises/errors; corroborated by Heltar and Dualhook error-code references]

### Compliance context (India)

Meta's Business Messaging Policy requires a verifiable opt-in before business-initiated messaging, Meta-approved templates outside the 24 h window, and an obvious opt-out path. India's DPDP Act 2023 additionally requires documented, purpose-specific, freely-given consent and a clear withdrawal mechanism. [CITED: wa.expert India opt-in compliance; dpdpa.com WhatsApp Business compliance; scconline.com DPDP chatbot analysis]

This corroborates D-12 (explicit opt-in via `ConsentRecord`) and D-11 (global STOP). Note the tension with **D-13** (warn-but-allow send on missing consent): that is a deliberate Beta trade-off recorded in CONTEXT.md, and the planner must implement it as locked — but the audit trail is what makes it defensible, so the `ConsentRecord` write and the audit-log entry are not optional niceties.

---

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────── MOBILE (Expo) ───────────────────────┐
                        │                                                             │
  Invoice detail ─┐     │  WhatsAppInboxScreen ──tap──> WhatsAppThreadScreen           │
  Pet profile ────┤     │        ▲                            ▲                       │
  Reminder card ──┼──> TemplateSendSheet                       │                       │
  Booking record ─┤     │        │                    ConversationActionCard           │
  Document view ──┘     │        │                    (confirm/move/cancel/retry)      │
                        │        │                            │                       │
                        │  WhatsAppConfigScreen (Admin: provider, failure mode, hours) │
                        └────────┼────────────────────────────┼───────────────────────┘
                                 │ HTTPS /api/v1/whatsapp/*   │  Socket.IO clinic:{id}
                                 ▼                            ▲
   ┌──────────────────────────── API (Fastify) ───────────────┼───────────────────────┐
   │                                                          │                       │
   │  Controller ──> SendAuthorizationService                  │                      │
   │                 ├─ permission: SEND_WHATSAPP              │                      │
   │                 ├─ consent lookup  (ConsentRecord)  ──warn-only (D-13)            │
   │                 ├─ STOP check      (WhatsAppOwnerPreference) ──BLOCK if reminder  │
   │                 └─ template category (D-10)                                      │
   │                        │                                  │                      │
   │                        ▼  1. PERSIST FIRST (outbox)        │                      │
   │            WhatsAppThread + WhatsAppMessage(status=QUEUED) │                      │
   │                        │                                  │                      │
   │                        ▼  2. enqueue                       │                      │
   │            BullMQ "whatsapp-outbound" ──> OutboundWorker   │                      │
   │                                              │             │                      │
   │                        ┌─── WaProvider PORT ─┴────────┐    │                      │
   │                        │ sendTemplate / sendFreeform  │    │                      │
   │                        │ uploadMedia / parseInbound   │    │                      │
   │                        │ verifyWebhook / capabilities │    │                      │
   │                        └───┬──────────────────────┬───┘    │                      │
   │        WHATSAPP_PROVIDER=  │                      │        │                      │
   │           simulator ───────┘                      └──────── cloud-api (stub)      │
   │                    │                                             │                │
   │        SimulatorProvider                              CloudApiProvider            │
   │        (enforces SAME constraints)                     graph.facebook.com          │
   │            │        │                                        │                    │
   │   delayed status    │ delayed auto-reply (D-14)               │ webhook POST       │
   │   transitions       │                                        ▼                    │
   │            └────────┴──> BullMQ "whatsapp-simulator"   /api/v1/whatsapp/webhook   │
   │                                  │                     (X-Hub-Signature-256)      │
   │                                  ▼                            │                   │
   │                    ╔═════════════════════════════════════════════════╗            │
   │                    ║  DeliveryStatusService  +  InboundRouter        ║            │
   │                    ║  (SINGLE funnel — both providers)               ║            │
   │                    ╚══════╤═══════════════════════════╤══════════════╝            │
   │                           │                           │                           │
   │        WhatsAppMessage.status (monotonic)      InboundRouter dispatch              │
   │        + WhatsAppMessageStatusEvent (append)     ├─ "STOP" ──> OwnerPreference     │
   │                           │                      ├─ booking:* ──> BookingFlow      │
   │                           ▼                      └─ any reply ──> ReminderTask     │
   │                    io.to(clinic:{id}).emit ◄─────────────┘        state=REPLIED    │
   │                                                                                   │
   │  ── SCHEDULED PATH (WHA-01) ──────────────────────────────────────────────────     │
   │  BullMQ Job Scheduler "whatsapp-reminder-sweep"  0 30 8 * * *  tz=Asia/Kolkata     │
   │        │                                                                          │
   │        ├─ scan Consultation.followUpDate ∈ {today+1, today}          (D-01)        │
   │        ├─ scan latest VaccinationRecord.nextDueDate ∈ {today+3, today} (D-02)      │
   │        ├─ scan latest DewormingRecord.nextDueDate ∈ {today+3, today}  (D-02)       │
   │        ├─ upsert WhatsAppReminderTask (deterministic unique key)                   │
   │        ├─ enqueue send for PENDING tasks ──────────────> outbound queue            │
   │        └─ escalate SENT tasks past nextAttemptAt  (D-03)                           │
   │              attemptCount >= max ──> state=CAPPED, thread.needsAction=true (D-04)  │
   │                                                                                   │
   │  ── BOOKING PATH (WHA-03) ───────────────────────────────────────────────────      │
   │  inbound "book" ──> slots from Clinic.workingHours minus WhatsAppSlotHold          │
   │        ──> list message (≤10 rows) ──> inbound list_reply                          │
   │        ──> TX { INSERT WhatsAppSlotHold UNIQUE(clinic,date,start); confirm }        │
   │              P2002 ──> "slot taken, pick another" (D-07)                           │
   └───────────────────────────────────────────────────────────────────────────────────┘
                                       │
                              PostgreSQL 16 + Redis 7
```

### Recommended Project Structure

```
apps/api/src/modules/whatsapp/
├── whatsapp.routes.ts               # route registration (incl. unauthenticated webhook)
├── whatsapp.controller.ts           # inbox, thread, send, booking actions, owner prefs
├── whatsapp.schema.ts               # Fastify-level request schemas (re-export validators)
├── whatsapp.repository.ts           # all Prisma access, explicit clinicId params
├── whatsapp.service.ts              # thread/message read model, inbox filters, search
├── send-authorization.service.ts    # permission + consent + STOP + category (D-10/D-12/D-13)
├── template-registry.ts             # six Beta templates, variable schemas, category map
├── delivery-status.service.ts       # THE single status funnel (simulator + webhook)
├── inbound-router.service.ts        # normalized inbound -> STOP / booking / reminder reply
├── booking/
│   ├── booking.service.ts           # state machine, auto-confirm (D-06)
│   ├── slot.service.ts              # generate slots from Clinic.workingHours
│   └── booking.state.ts             # transition table (mirrored in @breeyo/types)
├── reminders/
│   ├── reminder-sweep.job.ts        # upsertJobScheduler registration + sweep handler
│   ├── reminder-task.service.ts     # upsert, escalate, cap, mark replied
│   └── reminder-source.repository.ts# due-date queries over Phase 4 tables
├── providers/
│   ├── wa-provider.port.ts          # WaProvider interface + capabilities + failure codes
│   ├── provider-registry.ts         # env-driven adapter selection
│   ├── simulator/
│   │   ├── simulator.provider.ts    # enforces Cloud API constraints
│   │   └── simulator-reply.ts       # deterministic positive-path replies (D-15)
│   └── cloud-api/
│       ├── cloud-api.provider.ts    # stub: real fetch calls, unused in Beta
│       ├── cloud-api.mapper.ts      # domain <-> Meta JSON, error-code normalization
│       └── cloud-api.webhook.ts     # signature verify + payload -> WaInboundEvent[]
└── workers/
    ├── outbound.worker.ts           # dispatch QUEUED messages via port, retry/backoff
    └── simulator.worker.ts          # delayed status transitions + auto-replies (D-14/D-16)

packages/types/src/whatsapp.ts                    # domain types shared with mobile
packages/types/src/constants/whatsapp.constants.ts# template keys, statuses, socket events
packages/validators/src/whatsapp.ts               # Zod schemas

apps/mobile/src/features/whatsapp/
├── components/  ThreadListItem, MessageBubble, MessageStatusBadge, FailureFilterBar,
│                ConversationActionCard, TemplateSendSheet, QuickReplyChip, SimulatorControlCard
├── hooks/       useWhatsAppThreads, useWhatsAppThread, useSendTemplate, useRetryMessage,
│                useBookingActions, useOwnerPreference, useWhatsAppSocket, useSimulatorConfig
├── screens/     WhatsAppInboxScreen, WhatsAppThreadScreen, WhatsAppConfigScreen
└── store/       whatsappUIStore.ts   # active filter chip, offline banner
apps/mobile/app/(app)/whatsapp/
├── index.tsx        # inbox
├── [threadId].tsx   # thread
└── config.tsx       # admin config
```

---

### Pattern 1: Ports & Adapters with declared capabilities (WHA-04)

**What:** A single `WaProvider` interface expressed in *domain* vocabulary, plus a `capabilities` object that declares the provider's constraints as data. Application code reads capabilities and adapts; it never branches on provider identity.

**When to use:** Every outbound send, every media attach, every inbound parse.

**Why capabilities rather than `if (provider === 'simulator')`:** Provider-identity branching is exactly what makes a swap a rewrite. Capability data lets the simulator declare the *same* constraints as Cloud API in Beta (so the code is exercised against real limits) while still leaving room to relax one for a demo.

```typescript
// packages/types/src/whatsapp.ts (shared) — domain vocabulary only, no Meta types
export type WaProviderId = 'simulator' | 'cloud-api';

export type WaTemplateKey =
  | 'invoice_delivery'      // transactional (D-10)
  | 'payment_reminder'      // reminder     (D-10) — manual send only (D-05)
  | 'follow_up_reminder'    // reminder     (D-01)
  | 'vaccine_due'           // reminder     (D-02)
  | 'deworming_due'         // reminder     (D-02)
  | 'booking_confirmation'; // transactional (D-10)

export type WaTemplateCategory = 'REMINDER' | 'TRANSACTIONAL';

export type WaFailureCode =
  | 'NOT_ON_WHATSAPP'
  | 'INVALID_NUMBER_FORMAT'
  | 'OUTSIDE_SERVICE_WINDOW'
  | 'TEMPLATE_NOT_AVAILABLE'
  | 'TEMPLATE_PARAM_MISMATCH'
  | 'RATE_LIMITED'
  | 'SUPPRESSED_BY_META'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

export interface WaCapabilities {
  /** Cloud API: true. Simulator MUST also be true in Beta (see rationale). */
  requiresTemplateOutsideServiceWindow: boolean;
  /** Cloud API: 24. */
  serviceWindowHours: number | null;
  /** Cloud API: templates must be pre-registered/approved. */
  requiresRegisteredTemplates: boolean;
  maxQuickReplyButtons: number;   // 3
  maxButtonTitleChars: number;    // 20
  maxListRows: number;            // 10
  maxListRowTitleChars: number;   // 24
  maxBodyChars: number;           // 1024 interactive / 4096 text
  supportsInteractiveList: boolean;
  mediaMaxBytes: number;          // 100 MB
  /** Media must be uploaded to the provider before it can be referenced. */
  mediaRequiresUpload: boolean;
}
```

```typescript
// apps/api/src/modules/whatsapp/providers/wa-provider.port.ts
export interface WaMediaRef {
  /** Opaque provider handle. Simulator returns a synthetic id; Cloud API returns media id. */
  providerMediaId: string;
  filename: string;
  mimeType: string;
  /** Cloud API media expires 30 days after last use. */
  expiresAt: Date | null;
}

export interface WaButtonSpec {
  /** Namespaced payload: "<domain>:<action>:<entityId>" — max 256 chars on Cloud API. */
  id: string;
  /** Max 20 chars on Cloud API. */
  title: string;
}

export interface WaListRow {
  id: string;          // max 200 chars
  title: string;       // max 24 chars
  description?: string;// max 72 chars
}

export interface WaSendTemplateCommand {
  to: string;                              // E.164 with leading '+'
  templateKey: WaTemplateKey;
  languageCode: string;                    // 'en' for Beta
  variables: Record<string, string>;       // named, validated against the registry
  media?: WaMediaRef;
  buttons?: WaButtonSpec[];
  /** Our WhatsAppMessage.id — enables provider-side + our-side idempotency. */
  idempotencyKey: string;
}

export interface WaSendFreeformCommand {
  to: string;
  text: string;
  buttons?: WaButtonSpec[];
  list?: { buttonText: string; rows: WaListRow[] };
  media?: WaMediaRef;
  replyToProviderMessageId?: string;
  idempotencyKey: string;
}

export interface WaSendResult {
  /** wamid on Cloud API; synthetic on simulator. Opaque to callers. */
  providerMessageId: string;
  /** Provider ACK only — NOT delivery. */
  acceptedStatus: 'ACCEPTED' | 'HELD_FOR_REVIEW' | 'PAUSED';
  /** wa_id can differ from the submitted number — store it. */
  resolvedWaId: string | null;
  acceptedAt: Date;
}

export class WaSendError extends Error {
  constructor(
    readonly code: WaFailureCode,
    readonly providerCode: string | null,
    readonly retryable: boolean,
    message: string,
  ) { super(message); this.name = 'WaSendError'; }
}

export type WaInboundEvent =
  | { kind: 'TEXT';        providerMessageId: string; from: string; text: string;
      replyToProviderMessageId: string | null; occurredAt: Date }
  | { kind: 'BUTTON_REPLY'; providerMessageId: string; from: string; payload: string;
      label: string; replyToProviderMessageId: string | null; occurredAt: Date }
  | { kind: 'LIST_REPLY';   providerMessageId: string; from: string; rowId: string;
      label: string; replyToProviderMessageId: string | null; occurredAt: Date }
  | { kind: 'STATUS';       providerMessageId: string; status: WaDeliveryStatus;
      failure: { code: WaFailureCode; providerCode: string | null } | null; occurredAt: Date }
  | { kind: 'UNSUPPORTED';  providerMessageId: string; from: string; rawType: string;
      occurredAt: Date };

export interface WaProvider {
  readonly id: WaProviderId;
  readonly capabilities: WaCapabilities;

  sendTemplate(cmd: WaSendTemplateCommand): Promise<WaSendResult>;
  /** MUST throw WaSendError('OUTSIDE_SERVICE_WINDOW') when the window is closed. */
  sendFreeform(cmd: WaSendFreeformCommand): Promise<WaSendResult>;
  uploadMedia(input: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<WaMediaRef>;

  /** Normalizes BOTH template-button and interactive-button inbound shapes. */
  parseInbound(rawBody: unknown): WaInboundEvent[];
  /** Cloud API: HMAC-SHA256 over raw body. Simulator: shared-secret compare. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean;
}
```

**Rationale for `requiresTemplateOutsideServiceWindow: true` on the simulator:** if the simulator permits free-form clinic-initiated messages, every reminder in the codebase will be written as free-form text and none of them will be legal against the real API. Making the simulator strict forces the template registry to be complete in Beta — which is the actual deliverable of WHA-04. Keep an escape hatch as an explicit, non-default config field (`allowFreeformOutsideWindow: boolean`, default `false`) so a demo can relax it without changing code.

---

### Pattern 2: Persist-then-dispatch (transactional outbox)

**What:** `POST /whatsapp/send` writes `WhatsAppThread` (upsert) + `WhatsAppMessage(status='QUEUED')` in one Prisma transaction, returns `202` with the message id, and *then* enqueues a BullMQ job carrying only that id. The worker loads the row, calls the port, and records the outcome.

**When to use:** Every outbound send — staff-initiated, reminder-driven, and booking replies alike.

**Why:** UI-SPEC's success toast is literally `Message queued`, and the thread must show a `Queued` bubble immediately. It also gives idempotency (the row id is the `idempotencyKey`), gives Retry a target row, survives Redis loss (a `QUEUED` row can be re-enqueued by the sweep), and makes the offline banner (`You are offline. New WhatsApp actions will send when you reconnect.`) implementable as a mobile mutation queue against a server that already accepts-then-sends.

**Anti-pattern it avoids:** calling the provider inside the HTTP request. That couples request latency to Meta's API, loses the message on a crash between send and persist, and makes the `Queued → Sent → Delivered` status ladder in UI-SPEC unimplementable.

---

### Pattern 3: Template registry as the single source of truth

**What:** One in-code registry keyed by `WaTemplateKey`, declaring for each template: staff-facing name (exact UI-SPEC strings), category (D-10), a Zod schema for its variables, the local body text used for rendering the simulator bubble and the mobile preview, the Cloud API template name + language for later, and the allowed button set.

```typescript
// apps/api/src/modules/whatsapp/template-registry.ts
export interface WaTemplateDefinition {
  key: WaTemplateKey;
  staffName: string;              // must match UI-SPEC exactly
  category: WaTemplateCategory;   // D-10
  variables: z.ZodObject<z.ZodRawShape>;
  /** Local render for simulator bubbles + mobile variables preview. */
  render: (v: Record<string, string>) => string;
  /** Cloud API mapping — unused in Beta, present so the swap is config not code. */
  cloud: { name: string; languageCode: string; metaCategory: 'UTILITY' | 'MARKETING' };
  buttons?: WaButtonSpec[];
  supportsMedia: boolean;
}

export const WA_TEMPLATES: Record<WaTemplateKey, WaTemplateDefinition> = { /* six entries */ };
```

Validate variables with the Zod schema **before** persisting the message, so a param mismatch is a `400` at the API boundary rather than a Cloud API `132000` failure later. The six `staffName` values are fixed by UI-SPEC: `Invoice delivery`, `Payment reminder`, `Follow-up reminder`, `Vaccine due`, `Deworming due`, `Booking confirmation`.

**Do not** store template bodies in the database in Beta. Meta owns approved template content in production; a DB-backed template editor would create a divergence that has to be unwound at swap time.

---

### Pattern 4: Reminder scheduling — Postgres task rows swept daily (D-01, D-02, WHA-01)

**What:** A BullMQ job scheduler fires one sweep job daily at 08:30 IST. The sweep (a) discovers due sources in Phase 4 tables, (b) idempotently upserts `WhatsAppReminderTask` rows, (c) enqueues sends for `PENDING` tasks, and (d) advances escalation for `SENT` tasks whose `nextAttemptAt` has passed.

```typescript
// registration — runs once, survives restarts, fires once across N ECS tasks
await queue.upsertJobScheduler(
  'whatsapp-reminder-sweep',
  { pattern: '0 30 8 * * *', tz: 'Asia/Kolkata' },
  { name: 'reminder-sweep', data: {} },
);
```

**Idempotency key** — the reason a task table exists at all:
```prisma
@@unique([clinicId, sourceType, sourceId, kind, touch])
```
Re-running the sweep (manual trigger, restart, duplicate scheduler) can never double-send.

**Two touches (D-01/D-02)** are two rows with `touch = 'ADVANCE' | 'ON_DATE'`, not one row with a counter. This keeps the `ADVANCE` touch's escalation independent from the `ON_DATE` touch's, and makes "did the advance reminder go out?" a simple query.

**Lead times** are constants for Beta (deferred idea explicitly excludes configurability):
```typescript
export const WA_REMINDER_LEAD_DAYS = { follow_up: 1, vaccine_due: 3, deworming_due: 3 } as const; // D-01, D-02
```

**Date arithmetic must be IST-anchored.** `QueueRepository.getTodayIST()` already exists but living on a Phase 3 repository class. Extract `apps/api/src/lib/ist-date.ts` with `getTodayIST()` / `addDaysIST()` and have both modules use it, rather than importing `QueueRepository` into the WhatsApp module.

**Why 08:30 IST:** clinic-appropriate morning send, and it is after midnight-archive (00:00 IST) so any same-day queue state is settled. Any time between 08:00 and 10:00 IST is defensible; pick one and put it in a constant.

---

### Pattern 5: Escalation as an explicit state machine (D-03, D-04)

**Recommended values for the discretion item:** `maxAttempts = 2`, `intervalDays = 3` (the CONTEXT.md recommended default). Encode as constants, not magic numbers.

```
PENDING ──send──> SENT ──inbound reply──> REPLIED   (terminal)
                    │
                    ├─ nextAttemptAt passed & attemptCount < 2 ──> SENT (attempt 2)
                    │
                    └─ attemptCount >= 2 & no reply ──> CAPPED_NEEDS_ACTION (terminal)
                                                        └─> thread.needsAction = true (D-04)
PENDING/SENT ──source date changed or record superseded──> CANCELLED (terminal)
```

**Critical distinction the planner must preserve:** escalation-on-no-reply (D-03) is *business* retry over days and lives in `WhatsAppReminderTask`. Provider delivery failure retry is *technical* retry over seconds and lives in BullMQ job `attempts`/`backoff`. They must never be the same mechanism. A `FAILED` send (invalid number) must **not** consume an escalation attempt — otherwise a bad phone number burns the owner's two chances silently. Recommend: a send that fails with a non-retryable code sets the task to `CAPPED_NEEDS_ACTION` immediately with a distinct reason, surfacing in the `Failed` filter chip.

**Reply attribution:** prefer `context.id` → `WhatsAppMessage.providerMessageId` → `WhatsAppMessage.reminderTaskId` when the inbound event carries a context. Fall back to "most recent `SENT` reminder task on this thread within the last N days" when it does not (bare text replies carry no context). Document the fallback — it is a real ambiguity, not an oversight.

**D-05 carve-out:** `payment_reminder` must be excluded from the sweep entirely. Enforce structurally, not by convention: give `WhatsAppReminderTask.kind` only the three automated values (`FOLLOW_UP`, `VACCINE_DUE`, `DEWORMING_DUE`) so a payment reminder is not even representable as a task.

---

### Pattern 6: Media as opaque provider handle (WHA-02)

**What:** `WhatsAppMessage` stores `mediaProviderId`, `mediaFilename`, `mediaMimeType`, `mediaExpiresAt` — never a raw URL that the caller supplied. The send path resolves an internal reference (invoice id, consultation attachment id) into bytes, then calls `provider.uploadMedia()` to obtain a `WaMediaRef`.

**Why:** Cloud API requires a two-step upload and expires media 30 days after last use. A URL-based model works in the simulator and breaks on swap. Simulator's `uploadMedia` returns a synthetic id with `expiresAt: null` and no bytes stored — cheap, and it exercises the same call sequence.

**Codebase reality to account for:** PDFs are generated **client-side** today (`apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts` uses `expo-print`), and `apps/api/src/modules/attachment/attachment.service.ts:49-50` returns a *mock* presigned URL in development with a `// In production, this would use AWS S3 SDK` comment. So there is no server-side PDF byte source today. **Recommended Beta approach:** the mobile client uploads the generated PDF to the existing attachment presign flow and passes the resulting attachment id as `contextId`; the send service resolves attachment → bytes (or, in dev, a placeholder) → `uploadMedia`. Flag this as an open question if the planner wants server-side PDF rendering instead — that would be new scope.

---

### Pattern 7: Booking conversation as an explicit state machine (WHA-03, D-06, D-09)

```
(inbound "book" quick-reply / keyword)
        │
        ▼
AWAITING_SLOT_CHOICE ──list_reply(slot) & hold acquired──> CONFIRMED  (auto, D-06)
        │                                                    │
        │  hold conflict (P2002)                             ├─ staff Move  ──> MOVED    (new CONFIRMED row)
        └──> re-offer slots (D-07)                           └─ staff Cancel ──> CANCELLED
        │
        └─ no reply within N hours ──> EXPIRED (release nothing; no hold taken yet)
```

- **Auto-confirm (D-06)** means the transition to `CONFIRMED` happens inside the inbound handler, and the `booking_confirmation` template send is queued in the same transaction's aftermath. Staff see the result via a `ConversationActionCard` in the thread — they are not a gate.
- **Staff-only Move/Cancel (D-09)** means those transitions are exposed only as authenticated API endpoints (`POST /whatsapp/bookings/:id/move|cancel`), never as inbound button payloads. Do not register `booking:cancel:*` in the inbound payload namespace at all in Beta — that is the structural enforcement of D-09.
- **Slot offering must respect Cloud API list limits:** at most 10 slots per message, labels ≤24 chars. `"Thu 14 Aug, 10:30 AM"` is 20 characters. If more slots exist, offer the first 10 with a "more times" row.
- **No walk-in queue entry:** UI-SPEC mandates helper text `Check in manually when the owner arrives.` A confirmed booking must **not** create a `QueueEntry`.
- **Phase 8 handoff:** add `supersededByAppointmentId String?` to `WhatsAppBookingRequest` now. Phase 8's roadmap already plans an "owner-action bridge" with `KEEP / MOVE / CANCEL` owner actions, so the inbound payload namespace should be designed as `"<domain>:<action>:<entityId>"` (e.g. `booking:confirm:<uuid>`, 8 + 1 + 7 + 1 + 36 = 53 chars, well within the 256-char button id limit) and extensible to `appointment:keep:<uuid>` in Phase 8.

---

### Pattern 8: Slot blocking via database unique constraint (D-07, D-08)

**What:**
```prisma
model WhatsAppSlotHold {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId         String   @map("clinic_id") @db.Uuid
  slotDate         DateTime @map("slot_date") @db.Date
  slotStartMinutes Int      @map("slot_start_minutes")  // minutes from midnight IST
  bookingRequestId String   @unique @map("booking_request_id") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at")

  @@unique([clinicId, slotDate, slotStartMinutes])
  @@index([clinicId, slotDate])
  @@map("whatsapp_slot_holds")
}
```

Confirmation runs inside `prisma.$transaction`: insert the hold, then flip the booking to `CONFIRMED`. On Prisma error `P2002` (unique violation), roll back and reply "that time was just taken — pick another" (D-07). Cancelling a booking deletes the hold; moving deletes and re-inserts.

**Why `slotStartMinutes: Int` rather than a `DateTime`:** it makes the unique key immune to timezone-conversion drift and to DST-style ambiguity, and it aligns with generating slots from `Clinic.workingHours` (a JSON blob of local clinic times). Store the date as `@db.Date`.

**Why not application-level availability checks:** two concurrent inbound `list_reply` events for the same slot both pass a `findFirst` check and both confirm. D-07 is a concurrency requirement, and only a unique index satisfies it.

---

### Pattern 9: One status funnel, monotonic status ranking (WHA-05)

**What:** `DeliveryStatusService.apply(providerMessageId, status, failure, occurredAt)` is the *only* code path that mutates `WhatsAppMessage.status`. The simulator worker calls it. The Cloud API webhook handler calls it. Nothing else does.

**Monotonic ranking is required** because Meta explicitly does not guarantee webhook status ordering — `read` can arrive before `delivered`:
```typescript
const WA_STATUS_RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, REPLIED: 4 } as const;
// FAILED is terminal-by-precedence: never downgrade FAILED, never upgrade out of FAILED
// except via an explicit staff Retry, which creates a NEW message row.
```
Apply a status only if its rank exceeds the current rank. Always append a `WhatsAppMessageStatusEvent` row regardless — that append-only ledger is what satisfies WHA-05's "all message flows are logged" and the Phase 1 immutable-audit-trail pattern.

**Retry semantics:** UI-SPEC's `Retry` action with toast `Retry queued` should create a **new** `WhatsAppMessage` row linked via `retryOfMessageId`, not mutate the failed one. The failed bubble and its reason stay visible in the thread (UI-SPEC: "Failed messages show failure reason inline"), and the audit trail stays honest.

---

### Pattern 10: Simulator realism through the same pipeline (D-14, D-15, D-16)

- **Auto-reply (D-14):** after a successful simulated send, the simulator worker enqueues a delayed job on `whatsapp-simulator`. **Recommended delay: 10 seconds** (configurable 3–60 s via `WhatsAppSimulatorConfig.autoReplyDelaySeconds`). Rationale: long enough that the `Sent → Delivered` ladder is visible in a demo, short enough that a walkthrough does not stall. The job writes an inbound message through `InboundRouter`, exactly as a webhook would — including resetting the thread's `serviceWindowExpiresAt` to `now + 24h`, which keeps the service-window model exercised.
- **Positive path only (D-15):** `simulator-reply.ts` maps the outbound message's offered buttons to the first/positive option (`booking:confirm:*`), and reminder templates to a short acknowledgement text. No randomness anywhere.
- **Global deterministic controls (D-16):** a single `WhatsAppSimulatorConfig` row per clinic with `deliveryMode: 'NORMAL' | 'DELAYED' | 'FAIL' | 'INVALID_NUMBER'`. The simulator reads it at send time:
  - `NORMAL` → `SENT` immediately, `DELIVERED` after ~2 s
  - `DELAYED` → `SENT` immediately, `DELIVERED` after ~60 s (exercises the orange "delayed delivery" indicator)
  - `FAIL` → `FAILED` with `PROVIDER_UNAVAILABLE`
  - `INVALID_NUMBER` → `FAILED` with `NOT_ON_WHATSAPP` **and** set `WhatsAppOwnerPreference.numberStatus = 'INVALID'` so UI-SPEC's `This mobile number may not be on WhatsApp. Correct the number before retrying.` warning renders
- **Labeling:** UI-SPEC requires the channel be labeled `Simulator` in config/log surfaces while normal thread views stay WhatsApp-like. Store `channel` on every message row so the label is data, not a global flag.

---

### Pattern 11: Webhook endpoint built now, even for simulator-only Beta

**What:** Register `GET /api/v1/whatsapp/webhook` (verify handshake) and `POST /api/v1/whatsapp/webhook` (events) in Phase 7. The simulator does not use them, but building them now is the concrete proof that WHA-04's swap is configuration rather than code.

**Fastify specifics (raw body for signature verification):**
```typescript
// Signature must be computed over the RAW body, before JSON parsing.
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (req, body: string, done) => {
    (req as any).rawBody = body;
    try { done(null, JSON.parse(body)); } catch (err) { done(err as Error, undefined); }
  },
);
```
Scope this parser to the webhook route via an encapsulated child plugin — registering it globally would change body handling for every other route in the app.

**Route requirements:** no `authenticate` preHandler (Meta is unauthenticated); its own tighter `config.rateLimit`; `X-Hub-Signature-256` HMAC verified with `crypto.timingSafeEqual`; respond `200` fast and process asynchronously (enqueue), because Meta retries on non-2xx; idempotent on `providerMessageId` (unique index) because Meta *will* redeliver.

---

### Anti-Patterns to Avoid

- **A1 — Leaking Meta JSON into the domain.** If `WhatsAppMessage` stores a Meta `components` array, or if the service layer builds `{ messaging_product: 'whatsapp', ... }`, the port is decorative. All Meta-shaped JSON lives in `providers/cloud-api/cloud-api.mapper.ts` and nowhere else.
- **A2 — A permissive simulator.** Allowing free-form clinic-initiated sends, unlimited buttons, or unregistered templates in the simulator guarantees the swap fails. The simulator's job is to be *stricter* than convenient.
- **A3 — Synchronous delivery status.** Returning `'DELIVERED'` from `send()` bakes in an impossible contract. `send()` returns an ACK; delivery arrives later, out of order.
- **A4 — Long-horizon BullMQ delayed jobs for reminders.** See § Pitfall 1. A 12-month delayed job in an LRU-evicting Redis is a silent data-loss bug.
- **A5 — Escalation implemented as BullMQ `attempts`.** Conflates technical retry with business follow-up, and makes "2 attempts, 3 days apart" a Redis-resident invisible state instead of a queryable row.
- **A6 — Application-level slot availability checks.** Loses D-07's race.
- **A7 — Mutating a failed message on Retry.** Destroys the audit trail WHA-05 requires and breaks UI-SPEC's inline failure-reason display.
- **A8 — Free-text NLP parsing of inbound messages.** UI-SPEC explicitly says "no free-text NLP input is exposed in Beta." Route on button/list payloads and a tiny keyword allowlist (`STOP`, `BOOK`) only.
- **A9 — Starting BullMQ workers inside a routes plugin without a test guard.** `notification.routes.ts:14-15` does exactly this, so notification workers run during `vitest`. Repeating it for WhatsApp means simulator auto-replies fire mid-test and make suites nondeterministic. Gate worker creation on `process.env.NODE_ENV !== 'test'` (or an explicit `buildApp` option) while still decorating the queue/bus so tests can enqueue and assert.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slot conflict resolution (D-07) | `findFirst` availability check then insert | `@@unique([clinicId, slotDate, slotStartMinutes])` + catch Prisma `P2002` | Check-then-insert loses the race that D-07 is specifically about |
| Recurring daily job across N ECS tasks | `setInterval` / in-process `node-cron` | BullMQ `upsertJobScheduler` with `tz: 'Asia/Kolkata'` | `node-cron` fires once per process; ECS runs multiple tasks → duplicate sends |
| Job idempotency / dedupe | Custom "already ran today?" flag table | BullMQ `jobId` or `deduplication: { id, ttl }` (present in 5.81.3) plus the `WhatsAppReminderTask` unique key | Two independent layers, both free |
| Retry with backoff on provider failure | Manual retry loop with `setTimeout` | BullMQ `attempts` + `backoff: { type: 'exponential', delay }` — pattern already in `notification-bus.ts:5-10` | Persistent, observable, survives restarts |
| Webhook signature verification | Custom string comparison | `crypto.createHmac('sha256', secret)` + `crypto.timingSafeEqual` | Timing-attack safety; stdlib |
| Cron expression parsing | Hand-rolled time comparison | BullMQ repeat `pattern` (cron-parser under the hood) | Timezone and DST handling |
| E.164 phone normalization | Regex-only cleanup | A single shared normalizer (`+91` default) reused from the existing `PetOwner.mobile` convention, and store Meta's `wa_id` separately | `wa_id` can differ from the submitted number; storing both avoids unmatchable inbound events |
| Realtime inbox push | Polling every N seconds | Existing Socket.IO `clinic:{clinicId}` room + React Query invalidation (`useQueueSocket.ts` pattern) | Already built, already authenticated, already Redis-adapter-scaled |
| Optimistic "Message queued" UX | Custom local message buffer | React Query `useMutation` `onMutate` optimistic insert + server-assigned `QUEUED` row | Server row is the source of truth; optimistic update just hides latency |
| Booking reference numbering | `Math.random()` string | Postgres sequence or `nanoid`, matching Phase 6's `INV-YYYYMM-XXXX` convention (`BK-YYYYMM-XXXX`) | Collision-free and consistent with the rest of the product |
| Status ordering | Last-write-wins on `status` | Monotonic rank comparison + append-only `WhatsAppMessageStatusEvent` | Meta does not guarantee webhook order |
| Consent storage | New `WhatsAppConsent` table | `ConsentRecord` with `consentType = 'whatsapp_communication'` (D-12, locked) | Locked decision; single compliance ledger |

**Key insight:** almost every "hard" problem in this phase is a concurrency or durability problem in disguise — first-come-first-served slots, no-double-sends, ordered status, surviving Redis eviction. Postgres constraints and BullMQ's built-in durability primitives solve all of them. The genuinely novel work is the *port shape*, and that is a design problem, not a code-volume problem.

---

## Recommended Data Model

Prisma sketch following repo conventions (`snake_case` `@map`, `gen_random_uuid()`, `@db.Uuid`, explicit `clinicId`). Field lists are prescriptive but the planner should reconcile names with `packages/types` as it writes plans.

```prisma
// ─── Phase 7: WhatsApp Communication ─────────────────────────────────

enum WaChannel        { SIMULATOR CLOUD_API }
enum WaDirection      { OUTBOUND INBOUND }
enum WaDeliveryStatus { QUEUED SENT DELIVERED READ FAILED REPLIED }
enum WaNumberStatus   { VALID INVALID }
enum WaContextType    { NONE INVOICE PET REMINDER BOOKING DOCUMENT }
enum WaReminderKind   { FOLLOW_UP VACCINE_DUE DEWORMING_DUE }   // NOT payment (D-05)
enum WaReminderTouch  { ADVANCE ON_DATE }                        // D-01/D-02 two-touch
enum WaReminderState  { PENDING SENT REPLIED CAPPED_NEEDS_ACTION CANCELLED }
enum WaBookingState   { AWAITING_SLOT_CHOICE CONFIRMED CANCELLED MOVED EXPIRED }
enum WaDeliveryMode   { NORMAL DELAYED FAIL INVALID_NUMBER }     // D-16

model WhatsAppThread {
  id                     String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId               String    @map("clinic_id") @db.Uuid
  ownerId                String    @map("owner_id") @db.Uuid          // PetOwner
  waPhone                String    @map("wa_phone")                    // E.164 with '+'
  resolvedWaId           String?   @map("resolved_wa_id")              // Meta contacts[].wa_id
  numberStatus           WaNumberStatus @default(VALID) @map("number_status")
  lastMessageAt          DateTime? @map("last_message_at")
  lastMessagePreview     String?   @map("last_message_preview")
  lastContextType        WaContextType @default(NONE) @map("last_context_type")
  unreadCount            Int       @default(0) @map("unread_count")
  needsAction            Boolean   @default(false) @map("needs_action")   // D-04
  needsActionReason      String?   @map("needs_action_reason")
  serviceWindowExpiresAt DateTime? @map("service_window_expires_at")      // 24h model
  createdAt              DateTime  @default(now()) @map("created_at")
  updatedAt              DateTime  @updatedAt @map("updated_at")

  @@unique([clinicId, waPhone])
  @@index([clinicId, lastMessageAt])
  @@index([clinicId, needsAction])
  @@map("whatsapp_threads")
}

model WhatsAppMessage {
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId          String    @map("clinic_id") @db.Uuid
  threadId          String    @map("thread_id") @db.Uuid
  direction         WaDirection
  channel           WaChannel
  providerMessageId String?   @unique @map("provider_message_id")   // wamid — webhook idempotency
  replyToProviderMessageId String? @map("reply_to_provider_message_id")
  templateKey       String?   @map("template_key")
  templateCategory  String?   @map("template_category")             // REMINDER | TRANSACTIONAL (D-10)
  body              String                                          // locally rendered text
  renderedVariables Json?     @map("rendered_variables")
  interactiveOptions Json?    @map("interactive_options")            // buttons/rows offered
  status            WaDeliveryStatus @default(QUEUED)
  failureCode       String?   @map("failure_code")
  failureReason     String?   @map("failure_reason")
  contextType       WaContextType @default(NONE) @map("context_type")
  contextId         String?   @map("context_id") @db.Uuid            // invoice/pet/booking/attachment
  mediaProviderId   String?   @map("media_provider_id")
  mediaFilename     String?   @map("media_filename")
  mediaMimeType     String?   @map("media_mime_type")
  mediaExpiresAt    DateTime? @map("media_expires_at")
  staffNote         String?   @map("staff_note")                     // UI-SPEC optional note
  sentByUserId      String?   @map("sent_by_user_id") @db.Uuid       // null = automated
  reminderTaskId    String?   @map("reminder_task_id") @db.Uuid
  bookingRequestId  String?   @map("booking_request_id") @db.Uuid
  retryOfMessageId  String?   @map("retry_of_message_id") @db.Uuid
  queuedAt          DateTime  @default(now()) @map("queued_at")
  sentAt            DateTime? @map("sent_at")
  deliveredAt       DateTime? @map("delivered_at")
  readAt            DateTime? @map("read_at")
  failedAt          DateTime? @map("failed_at")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  @@index([clinicId, threadId, createdAt])
  @@index([clinicId, status])
  @@index([clinicId, contextType, contextId])
  @@map("whatsapp_messages")
}

model WhatsAppMessageStatusEvent {                      // append-only (WHA-05, Phase 1 audit pattern)
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  messageId    String   @map("message_id") @db.Uuid
  status       WaDeliveryStatus
  providerCode String?  @map("provider_code")
  rawPayload   Json?    @map("raw_payload")
  occurredAt   DateTime @map("occurred_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([messageId, occurredAt])
  @@map("whatsapp_message_status_events")
}

model WhatsAppOwnerPreference {                          // D-10, D-11 operational gate
  id                String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId          String    @map("clinic_id") @db.Uuid
  ownerId           String    @unique @map("owner_id") @db.Uuid
  remindersOptedOut Boolean   @default(false) @map("reminders_opted_out")
  optedOutAt        DateTime? @map("opted_out_at")
  optedOutSource    String?   @map("opted_out_source")   // OWNER_STOP | STAFF
  numberStatus      WaNumberStatus @default(VALID) @map("number_status")
  markedInvalidAt   DateTime? @map("marked_invalid_at")
  markedInvalidBy   String?   @map("marked_invalid_by") @db.Uuid
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  @@index([clinicId])
  @@map("whatsapp_owner_preferences")
}

model WhatsAppReminderTask {                             // D-01, D-02, D-03, D-04
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId      String   @map("clinic_id") @db.Uuid
  ownerId       String   @map("owner_id") @db.Uuid
  petId         String   @map("pet_id") @db.Uuid
  kind          WaReminderKind
  touch         WaReminderTouch
  sourceType    String   @map("source_type")   // CONSULTATION | VACCINATION_RECORD | DEWORMING_RECORD
  sourceId      String   @map("source_id") @db.Uuid
  sourceLabel   String?  @map("source_label")  // e.g. vaccine name, for template variables
  dueDate       DateTime @map("due_date") @db.Date
  scheduledFor  DateTime @map("scheduled_for") @db.Date
  state         WaReminderState @default(PENDING)
  attemptCount  Int      @default(0) @map("attempt_count")
  lastAttemptAt DateTime? @map("last_attempt_at")
  nextAttemptAt DateTime? @map("next_attempt_at")
  repliedAt     DateTime? @map("replied_at")
  cappedAt      DateTime? @map("capped_at")
  cappedReason  String?  @map("capped_reason")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@unique([clinicId, sourceType, sourceId, kind, touch])   // idempotency
  @@index([clinicId, state, scheduledFor])
  @@index([clinicId, state, nextAttemptAt])
  @@map("whatsapp_reminder_tasks")
}

model WhatsAppBookingRequest {                           // D-06 to D-09
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId                 String   @map("clinic_id") @db.Uuid
  threadId                 String   @map("thread_id") @db.Uuid
  ownerId                  String   @map("owner_id") @db.Uuid
  petId                    String?  @map("pet_id") @db.Uuid
  reference                String   @unique                       // BK-YYYYMM-XXXX
  state                    WaBookingState @default(AWAITING_SLOT_CHOICE)
  slotDate                 DateTime? @map("slot_date") @db.Date
  slotStartMinutes         Int?      @map("slot_start_minutes")
  slotDurationMinutes      Int?      @map("slot_duration_minutes")
  confirmedAt              DateTime? @map("confirmed_at")
  cancelledAt              DateTime? @map("cancelled_at")
  cancelReason             String?   @map("cancel_reason")
  movedToBookingId         String?   @map("moved_to_booking_id") @db.Uuid
  supersededByAppointmentId String?  @map("superseded_by_appointment_id") @db.Uuid  // Phase 8 hook
  actedByUserId            String?   @map("acted_by_user_id") @db.Uuid
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")

  @@index([clinicId, state])
  @@index([clinicId, slotDate])
  @@map("whatsapp_booking_requests")
}

model WhatsAppSlotHold { /* see Pattern 8 */ }

model WhatsAppClinicConfig {                             // D-16 global controls + Beta defaults
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId                 String   @unique @map("clinic_id") @db.Uuid
  provider                 WaChannel @default(SIMULATOR)
  deliveryMode             WaDeliveryMode @default(NORMAL) @map("delivery_mode")
  autoReplyEnabled         Boolean  @default(true) @map("auto_reply_enabled")     // D-14
  autoReplyDelaySeconds    Int      @default(10) @map("auto_reply_delay_seconds") // D-14
  allowFreeformOutsideWindow Boolean @default(false) @map("allow_freeform_outside_window")
  slotDurationMinutes      Int      @default(30) @map("slot_duration_minutes")
  escalationMaxAttempts    Int      @default(2) @map("escalation_max_attempts")   // D-03
  escalationIntervalDays   Int      @default(3) @map("escalation_interval_days")  // D-03
  createdAt                DateTime @default(now()) @map("created_at")
  updatedAt                DateTime @updatedAt @map("updated_at")

  @@map("whatsapp_clinic_configs")
}
```

**Consent (D-12) uses the existing `ConsentRecord`.** No new model. `consentType = 'whatsapp_communication'`; effective consent = the most recent row for `ownerId` with that `consentType` and `withdrawnAt IS NULL`. Because `ConsentRecord` has no `clinicId` and no unique constraint, "grant" appends a row and "withdraw" stamps `withdrawnAt` on the latest open row — never `upsert`.

**Migration requirements:**
1. Generate a real Prisma migration for these models (`prisma migrate dev --name add_whatsapp_communication`).
2. Add the new tables to `apps/api/prisma/post-migrate.sql`'s `GRANT` block — the blanket `GRANT ... ON ALL TABLES IN SCHEMA public TO breeyo_app` at the top already covers them since it runs after migrate, so verify rather than duplicate.
3. **Do not** add `FORCE ROW LEVEL SECURITY` for these tables while services use `fastify.prisma`. See § Pitfall 5.

---

## Common Pitfalls

### Pitfall 1: Redis `allkeys-lru` eviction silently destroys long-horizon delayed jobs
**What goes wrong:** A vaccine reminder scheduled 12 months out via `queue.add(..., { delay })` disappears. No error, no log, no reminder.
**Why it happens:** `docker-compose.yml:24` runs `redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru`. LRU eviction does not exempt BullMQ's ZSETs and hashes. BullMQ delays are also *relative* to enqueue time [CITED: docs.bullmq.io/guide/jobs/delayed], so nothing in Redis records the intended absolute date in a recoverable form.
**How to avoid:** Own reminder schedule state in Postgres (`WhatsAppReminderTask.scheduledFor`); use BullMQ only for the daily sweep and for second-to-minute delays. Optionally recommend `--maxmemory-policy noeviction` for the queue Redis in a follow-up infra note, but do not depend on it.
**Warning signs:** any `delay` value larger than a few hours in the codebase.

### Pitfall 2: `node-cron` duplicates every scheduled send once you scale past one task
**What goes wrong:** Two ECS tasks each fire the 08:30 sweep; owners get duplicate reminders.
**Why it happens:** `apps/api/src/jobs/midnight-archive.ts` uses in-process `node-cron`, and `infra/aws/` deploys ECS task definitions. In-process cron has no cross-process coordination. The existing archive job is idempotent enough to tolerate this; reminder sends are not.
**How to avoid:** BullMQ `upsertJobScheduler` (Redis-coordinated, fires once). Belt-and-braces: the `@@unique([clinicId, sourceType, sourceId, kind, touch])` task key makes a duplicate sweep a no-op anyway. Use both.
**Warning signs:** `cron.schedule` appearing anywhere in the WhatsApp module.

### Pitfall 3: Superseded next-due records fire stale reminders
**What goes wrong:** A pet gets its rabies booster on 10 Aug, creating a new `VaccinationRecord` with `nextDueDate` a year out. The *previous* record's `nextDueDate` is still 13 Aug. On 13 Aug the sweep sends "Rabies vaccine due today" for an already-vaccinated pet.
**Why it happens:** `VaccinationRecord` and `DewormingRecord` are append-only history rows with no "superseded" flag [VERIFIED: `schema.prisma:473-513`]. `nextDueDate` on an old row is never cleared. `vaccination.service.ts:89-93` already handles this for the *status* read model via `getOverdueVaccinations`/`getDueSoonVaccinations`, so the repository has precedent to follow.
**How to avoid:** The sweep must select only the **latest** record per `(petId, vaccineName)` for vaccinations and per `petId` for deworming. Also transition existing `PENDING`/`SENT` tasks to `CANCELLED` when a newer record supersedes their source.
**Warning signs:** a sweep query that is a plain `findMany({ where: { nextDueDate: ... } })`.

### Pitfall 4: Prisma migrations are 27 models behind the schema — integration tests cannot pass on a fresh DB
**What goes wrong:** Any Phase 7 test that creates a `Pet`, a `Consultation`, or a `VaccinationRecord` fails with `relation "pets" does not exist`.
**Why it happens:** `apps/api/prisma/migrations/` contains only `20260802111747_init` and `20260802162311_add_consent_records`, while `schema.prisma` declares 29 models. Verified directly against the running dev database — it contains 14 tables, all Phase 1: no `pets`, `pet_owners`, `consultations`, `vaccination_records`, `deworming_records`, `queue_entries`, `drugs`, or `service_catalog`. CI runs `prisma migrate deploy` (`.github/workflows/ci.yml:71`), so CI's database has the same gap. Phase 3/4 unit tests pass only because they mock repositories entirely (`apps/api/src/modules/emr/__tests__/emr.service.test.ts` uses `vi.fn()` mocks) — the real integration suites under `apps/api/tests/patient/` and `apps/api/tests/queue/` hit the DB and would fail.
**How to avoid:** Wave 0 must include a task to generate the missing migration(s) for the Phase 3–6 models before any Phase 7 integration test is written. This is a prerequisite, not Phase 7 scope creep — but Phase 7 cannot be verified without it.
**Warning signs:** `pnpm --filter @breeyo/api test` passing locally on a stale DB but failing on a fresh `docker compose down -v`.

### Pitfall 5: Enabling `FORCE ROW LEVEL SECURITY` on the new tables returns zero rows
**What goes wrong:** Every WhatsApp query silently returns empty.
**Why it happens:** Services inject `fastify.prisma`, which connects with `DATABASE_URL` (`breeyo_admin` — the table owner). `FORCE ROW LEVEL SECURITY` applies policies to the owner too, and `app.clinic_id` is never set on that connection. Only 3 tables currently have RLS (`clinic_members`, `auth_audit_log`, `notifications`) and they are accessed the same way — which is itself latent. `tenantContext` builds `request.db` via `createTenantClient` but **no Phase 3/4 module actually uses it**.
**How to avoid:** Follow the dominant established pattern — explicit `clinicId` parameters on every repository method, with `clinicId` sourced from `request.user.activeClinicId`. If the planner wants genuine DB-level RLS for the WhatsApp tables, that requires routing the WhatsApp repository through `request.db` (the `breeyo_app` role) and is a separate, larger decision. Add `ENABLE ROW LEVEL SECURITY` + policies without `FORCE` if defence-in-depth is wanted for the `breeyo_app` role, and document the choice.
**Warning signs:** a `post-migrate.sql` diff adding `FORCE ROW LEVEL SECURITY` alongside repositories constructed with `fastify.prisma`.

### Pitfall 6: The audit-log utility only understands auth events
**What goes wrong:** `writeAuditLog(prisma, 'WHATSAPP_SENT', ...)` is a type error, or worse, a string cast that pollutes the auth audit table with an unmodelled event.
**Why it happens:** `apps/api/src/lib/audit-log.ts` exports an `AuditEvent` enum containing only auth events (`SIGNUP`, `LOGIN_SUCCESS`, …) and writes to `prisma.authAuditLog`.
**How to avoid:** Extend `AuditEvent` with the WhatsApp events needed (`WHATSAPP_TEMPLATE_SENT`, `WHATSAPP_OPT_OUT`, `WHATSAPP_CONSENT_GRANTED`, `WHATSAPP_NUMBER_MARKED_INVALID`, `WHATSAPP_BOOKING_CANCELLED`) and keep using `authAuditLog`, **or** rely on `WhatsAppMessageStatusEvent` as the domain-level ledger and use `writeAuditLog` only for the consent/opt-out compliance events. Recommend the latter split: message flow → `WhatsAppMessageStatusEvent`; consent/opt-out/invalid-number/booking-cancel → `writeAuditLog`. Note `AuthAuditLog` has `FORCE ROW LEVEL SECURITY` enabled, which interacts with Pitfall 5 — verify writes succeed in an integration test rather than assuming.

### Pitfall 7: BullMQ workers started inside a routes plugin run during tests
**What goes wrong:** Simulator auto-replies and reminder sends fire while `vitest` runs, mutating fixtures mid-assertion; suites become flaky.
**Why it happens:** `notification.routes.ts:14-15` constructs both bus and worker unconditionally at route-registration time, and `buildTestApp()` registers all routes.
**How to avoid:** Construct the queues always (tests need to enqueue and inspect), but construct the `Worker` only when `process.env.NODE_ENV !== 'test'`, or accept a `BuildAppOptions.startWorkers` flag. Expose a directly-callable handler function (`processOutboundJob(deps, jobData)`) so tests exercise worker logic without a live worker.
**Warning signs:** `new Worker(...)` at the top level of `whatsapp.routes.ts`.

### Pitfall 8: The Phase 6 `Invoice` model does not exist yet
**What goes wrong:** Plans reference `prisma.invoice`, `invoiceId` foreign keys, or an invoice PDF endpoint that isn't there. `schema.prisma` has no `Invoice` model, `apps/api/src/modules/billing/` contains only `service-catalog-seed.ts`, and `.planning/phases/06-invoicing-payments/` has a CONTEXT and UI-SPEC but **no plans**.
**Why it happens:** Roadmap order says Phase 7 depends on Phase 6, but Phase 6 is not implemented and its data model is not yet designed in detail.
**How to avoid:** Reference invoices through the generic `contextType: 'INVOICE'` + `contextId` pair with **no** foreign-key constraint. Keep the invoice-delivery template's variables as plain strings (`invoice_number`, `amount`, `due_date`, `payment_link`) supplied by the caller, so Phase 6 can wire them up without a Phase 7 migration. Note Phase 6 D-16 promises "WhatsApp (sends PDF to owner via Phase 7 abstraction layer)" — the contract Phase 7 must expose is `POST /api/v1/whatsapp/send` with a template key and variables, nothing invoice-specific.
**Warning signs:** any `@relation` to `Invoice` in the Phase 7 migration.

### Pitfall 9: Meta's `wa_id` is not always the number you sent to
**What goes wrong:** An inbound webhook arrives `from: "919876543210"` but the thread was keyed on `"+919876543210"`, so the router creates a duplicate thread or drops the event.
**Why it happens:** The send response returns `contacts[].input` and `contacts[].wa_id` as *separate* fields [CITED: developers.facebook.com/docs/whatsapp/cloud-api/reference/messages], and inbound `from` uses the `wa_id` form (no `+`).
**How to avoid:** Normalize both directions through one function. Store `waPhone` in canonical E.164-with-`+` form as the thread key, store `resolvedWaId` separately, and match inbound events on *either*. Include a test with a `+`-less inbound `from`.

### Pitfall 10: Global JSON content-type parser breaks unrelated routes
**What goes wrong:** Adding a raw-body parser for webhook signature verification at the app level changes body handling for auth, patient, and queue routes.
**Why it happens:** `fastify.addContentTypeParser` is encapsulation-scoped; calling it in the top-level `buildApp` applies it everywhere.
**How to avoid:** Register the parser inside an encapsulated child plugin that contains only the webhook routes (`fastify.register(async (scoped) => { scoped.addContentTypeParser(...); scoped.post('/whatsapp/webhook', ...) })`).

### Pitfall 11: Mobile has neither `@breeyo/ui` nor `react-native-paper` installed, but UI-SPEC mandates Paper v5
**What goes wrong:** Every mobile component task fails on import, or the implementer silently reverts to plain RN components and the UI-SPEC contract is quietly broken.
**Why it happens:** Verified: `apps/mobile/package.json` lists neither `@breeyo/ui` nor `react-native-paper`, and neither directory exists in `apps/mobile/node_modules/`. `react-native-paper@^5.15.1` is a dependency of `packages/ui` only. STATE.md records the Phase 4 workaround: "Used plain React Native components for consultation screen (react-native-paper not in mobile dependencies)". 07-UI-SPEC.md line 22 says "React Native Paper v5 (MD3)" and line 221 lists specific Paper components.
**How to avoid:** Wave 0 must contain an explicit decision task: either (a) add `"@breeyo/ui": "workspace:*"` and `"react-native-paper": "^5.15.1"` (+ `react-native-safe-area-context`) to `apps/mobile/package.json` and honor UI-SPEC literally, or (b) record a deviation and build with plain RN components matching Phase 4 precedent while still meeting UI-SPEC's *token* values (spacing, color, typography, 44pt targets, WCAG AA). This is a real fork in the road and should surface as a user-facing question, not an implementer's improvisation.
**Warning signs:** a plan task importing `Button` from `react-native-paper` without a preceding dependency task.

### Pitfall 12: Phase 4 mobile code imports packages that are not installed
**What goes wrong:** The invoice-PDF-over-WhatsApp path touches `useGeneratePdf.ts`, which imports `expo-print`, `expo-file-system`, and `expo-sharing` — none of which are in `apps/mobile/package.json` or `node_modules`. `expo-av` (voice) is likewise missing.
**Why it happens:** Phase 4 wrote the code without declaring the dependencies.
**How to avoid:** If Phase 7 touches the PDF share path, add the missing Expo modules in Wave 0 with Expo SDK 52-compatible versions (`expo install` picks these). Do not assume the existing code runs today.
**Warning signs:** a plan task that says "reuse the existing PDF share sheet" without a dependency check.

### Pitfall 13: `SEND_WHATSAPP` is granted to Clinician, but UI-SPEC restricts access to Front Desk + Admin
**What goes wrong:** Role gating is inconsistent between API and UI, or the implementer invents a new permission.
**Why it happens:** `apps/api/prisma/seed.ts` grants `SEND_WHATSAPP` to Admin, Clinician, **and** FrontDesk. 07-UI-SPEC.md line 28 says "Access is limited to Front Desk and Admin."
**How to avoid:** Decide explicitly. Recommended: keep `SEND_WHATSAPP` as-is for the *send* action (a vet sending a follow-up template from a consultation is reasonable and Phase 4-adjacent), and gate the **inbox/thread screens** and the **Admin config screen** separately — inbox on a role check for `FrontDesk`/`Admin`, config on `MANAGE_CLINIC_SETTINGS` (already Admin-only). Document whichever way the planner goes; do not leave it implicit.

### Pitfall 14: Statuses arrive out of order and webhooks are redelivered
**What goes wrong:** A `Delivered` bubble regresses to `Sent`; or a redelivered webhook creates a duplicate inbound message and a duplicate auto-reply.
**Why it happens:** Meta does not guarantee status ordering and retries non-2xx deliveries.
**How to avoid:** Monotonic rank comparison (§ Pattern 9) plus `@unique` on `WhatsAppMessage.providerMessageId` so a duplicate inbound insert fails with `P2002` and is treated as already-processed. Return `200` before doing work.

### Pitfall 15: Booking slot generation from `Clinic.workingHours` has no typed contract
**What goes wrong:** Slot generation guesses at the JSON shape and breaks for clinics that completed the setup wizard differently.
**Why it happens:** `Clinic.workingHours` is `Json?` [VERIFIED: `schema.prisma:45`], written by `clinic.service.ts:29` from `workingHoursBodySchema` in `apps/api/src/modules/clinic/clinic.schema.ts:17`. The Zod schema is the only contract, and clinics that skipped the wizard have `null`.
**How to avoid:** Read the actual `workingHoursBodySchema` shape before writing `slot.service.ts`; parse `Clinic.workingHours` through that Zod schema at read time; define explicit fallback behavior when it is `null` (recommend: no slots offered, booking flow replies "please call the clinic" — and surface it as `needsAction`).

---

## Code Examples

### Example 1: Provider registry — the whole of WHA-04's "swappable via configuration"

```typescript
// apps/api/src/modules/whatsapp/providers/provider-registry.ts
import type { WaProvider, WaProviderId } from './wa-provider.port.js';
import { SimulatorProvider } from './simulator/simulator.provider.js';
import { CloudApiProvider } from './cloud-api/cloud-api.provider.js';

export interface ProviderRegistryDeps {
  simulatorQueue: Queue;                       // for delayed status + auto-reply jobs
  loadClinicConfig: (clinicId: string) => Promise<WhatsAppClinicConfig>;
}

export function resolveProvider(
  clinicId: string,
  deps: ProviderRegistryDeps,
): Promise<WaProvider> {
  // Env is the deploy-wide default; the per-clinic config row can pin SIMULATOR
  // so a pilot clinic keeps demoing after the real API goes live elsewhere.
  const envDefault = (process.env.WHATSAPP_PROVIDER ?? 'simulator') as WaProviderId;
  return deps.loadClinicConfig(clinicId).then((cfg) => {
    const id = cfg.provider === 'CLOUD_API' ? 'cloud-api' : envDefault;
    return id === 'cloud-api'
      ? new CloudApiProvider({
          phoneNumberId: requireEnv('WHATSAPP_PHONE_NUMBER_ID'),
          accessToken: requireEnv('WHATSAPP_ACCESS_TOKEN'),
          appSecret: requireEnv('WHATSAPP_APP_SECRET'),
          graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? 'v23.0',
        })
      : new SimulatorProvider(cfg, deps.simulatorQueue);
  });
}
```

### Example 2: Simulator enforcing Cloud API constraints

```typescript
// apps/api/src/modules/whatsapp/providers/simulator/simulator.provider.ts
const SIMULATOR_CAPABILITIES: WaCapabilities = {
  // Deliberately identical to Cloud API so business code is portable.
  requiresTemplateOutsideServiceWindow: true,   // Meta: 24h window, templates only outside
  serviceWindowHours: 24,
  requiresRegisteredTemplates: true,
  maxQuickReplyButtons: 3,                      // Meta hard limit
  maxButtonTitleChars: 20,                      // Meta hard limit
  maxListRows: 10,                              // Meta hard limit (all sections combined)
  maxListRowTitleChars: 24,                     // Meta hard limit
  maxBodyChars: 1024,                           // interactive body limit (stricter than text 4096)
  supportsInteractiveList: true,
  mediaMaxBytes: 100 * 1024 * 1024,
  mediaRequiresUpload: true,
};

export class SimulatorProvider implements WaProvider {
  readonly id = 'simulator' as const;
  readonly capabilities = SIMULATOR_CAPABILITIES;

  constructor(
    private readonly config: WhatsAppClinicConfig,
    private readonly simulatorQueue: Queue,
  ) {}

  async sendTemplate(cmd: WaSendTemplateCommand): Promise<WaSendResult> {
    assertButtonLimits(cmd.buttons, this.capabilities);

    // D-16: deterministic, global (per-clinic) failure controls.
    if (this.config.deliveryMode === 'INVALID_NUMBER') {
      throw new WaSendError('NOT_ON_WHATSAPP', 'SIM_131026', false,
        'Simulated: recipient is not on WhatsApp');
    }
    if (this.config.deliveryMode === 'FAIL') {
      throw new WaSendError('PROVIDER_UNAVAILABLE', 'SIM_500', true,
        'Simulated: provider unavailable');
    }

    const providerMessageId = `sim.${cmd.idempotencyKey}`;
    const deliverAfterMs = this.config.deliveryMode === 'DELAYED' ? 60_000 : 2_000;

    // Status transitions arrive asynchronously, exactly like real webhooks.
    await this.simulatorQueue.add(
      'status-transition',
      { providerMessageId, status: 'DELIVERED' },
      { delay: deliverAfterMs, jobId: `status:${providerMessageId}:DELIVERED` },
    );

    // D-14: auto-reply so demo threads feel alive. Default 10s.
    if (this.config.autoReplyEnabled) {
      await this.simulatorQueue.add(
        'auto-reply',
        { providerMessageId, templateKey: cmd.templateKey, buttons: cmd.buttons ?? [] },
        {
          delay: this.config.autoReplyDelaySeconds * 1000,
          jobId: `auto-reply:${providerMessageId}`,   // dedupe
        },
      );
    }

    return {
      providerMessageId,
      acceptedStatus: 'ACCEPTED',
      resolvedWaId: cmd.to.replace(/^\+/, ''),   // mirrors Meta's wa_id form
      acceptedAt: new Date(),
    };
  }

  async sendFreeform(cmd: WaSendFreeformCommand): Promise<WaSendResult> {
    // Enforced even in the simulator — otherwise the code that ships is illegal
    // against the real API. Escape hatch is explicit, non-default config.
    if (this.capabilities.requiresTemplateOutsideServiceWindow
        && !this.config.allowFreeformOutsideWindow
        && !isServiceWindowOpen(cmd.to)) {
      throw new WaSendError('OUTSIDE_SERVICE_WINDOW', 'SIM_131047', false,
        'Free-form message requires an open 24h customer service window');
    }
    /* ... */
  }
}
```

### Example 3: Cloud API webhook signature verification (stdlib only)

```typescript
// apps/api/src/modules/whatsapp/providers/cloud-api/cloud-api.webhook.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256 of the RAW body
 * keyed with the app secret. Must be computed before JSON parsing.
 * Source: developers.facebook.com webhook security docs.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const provided = Buffer.from(signatureHeader.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** GET handshake: echo hub.challenge when the verify token matches. */
export function handleVerification(
  query: Record<string, string | undefined>,
  verifyToken: string,
): { status: 200; body: string } | { status: 403; body: string } {
  const mode = query['hub.mode'] ?? query['hub_mode'];
  const token = query['hub.verify_token'] ?? query['hub_verify_token'];
  const challenge = query['hub.challenge'] ?? query['hub_challenge'];
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return { status: 200, body: challenge };
  }
  return { status: 403, body: 'Forbidden' };
}
```

### Example 4: Persist-then-dispatch send service (Pattern 2, WHA-02)

```typescript
// apps/api/src/modules/whatsapp/whatsapp.service.ts (excerpt)
async sendTemplate(input: SendTemplateInput, actor: Actor): Promise<{ messageId: string }> {
  const def = WA_TEMPLATES[input.templateKey];
  if (!def) throw badRequest('TEMPLATE_UNKNOWN', 'Unknown template');

  // Fail fast on variable mismatch rather than eating a Cloud API 132000 later.
  const variables = def.variables.parse(input.variables);

  const pref = await this.repo.getOwnerPreference(actor.clinicId, input.ownerId);
  const consent = await this.repo.getWhatsAppConsent(input.ownerId);

  // D-10 + D-11: a global STOP silences REMINDER templates only.
  if (def.category === 'REMINDER' && pref?.remindersOptedOut) {
    throw forbidden('OWNER_OPTED_OUT', 'Owner has opted out of reminders');
  }
  // D-13: missing consent WARNS but never blocks. The warning is surfaced by the
  // mobile TemplateSendSheet; the server records the fact and proceeds.
  const consentWarning = consent ? null : 'WHATSAPP_CONSENT_MISSING';

  const { messageId } = await this.prisma.$transaction(async (tx) => {
    const thread = await this.repo.upsertThread(tx, {
      clinicId: actor.clinicId, ownerId: input.ownerId, waPhone: input.waPhone,
    });
    const message = await this.repo.createOutboundMessage(tx, {
      clinicId: actor.clinicId,
      threadId: thread.id,
      channel: input.channel,
      templateKey: def.key,
      templateCategory: def.category,
      body: def.render(variables),
      renderedVariables: variables,
      contextType: input.contextType,
      contextId: input.contextId ?? null,
      staffNote: input.staffNote ?? null,
      sentByUserId: actor.userId,
      status: 'QUEUED',
    });
    return { messageId: message.id };
  });

  // Enqueue AFTER commit — the row is the source of truth, the job is a nudge.
  await this.outboundQueue.add('send', { messageId }, {
    jobId: `send:${messageId}`,                                  // idempotent
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });

  if (consentWarning) {
    await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_SENT_WITHOUT_CONSENT, {
      userId: actor.userId, clinicId: actor.clinicId,
      metadata: { ownerId: input.ownerId, templateKey: def.key },   // D-13 audit trail
    });
  }
  return { messageId };   // controller returns 202 + UI-SPEC toast "Message queued"
}
```

### Example 5: First-come-first-served slot confirmation (D-06, D-07, D-08)

```typescript
// apps/api/src/modules/whatsapp/booking/booking.service.ts (excerpt)
async confirmSlot(
  clinicId: string,
  bookingId: string,
  slot: { date: Date; startMinutes: number; durationMinutes: number },
): Promise<{ outcome: 'CONFIRMED'; booking: WhatsAppBookingRequest }
         | { outcome: 'SLOT_TAKEN' }> {
  try {
    const booking = await this.prisma.$transaction(async (tx) => {
      // The unique index — not application logic — arbitrates D-07.
      await tx.whatsAppSlotHold.create({
        data: {
          clinicId,
          slotDate: slot.date,
          slotStartMinutes: slot.startMinutes,
          bookingRequestId: bookingId,
        },
      });
      // D-06: auto-confirm, no staff gate.
      return tx.whatsAppBookingRequest.update({
        where: { id: bookingId },
        data: {
          state: 'CONFIRMED',
          slotDate: slot.date,
          slotStartMinutes: slot.startMinutes,
          slotDurationMinutes: slot.durationMinutes,
          confirmedAt: new Date(),
        },
      });
    });
    return { outcome: 'CONFIRMED', booking };
  } catch (err) {
    // P2002 = unique violation => another request took this slot first (D-07).
    if (isPrismaError(err, 'P2002')) return { outcome: 'SLOT_TAKEN' };
    throw err;
  }
}
```

### Example 6: Reminder sweep registration and escalation advance (D-01–D-04)

```typescript
// apps/api/src/modules/whatsapp/reminders/reminder-sweep.job.ts
export const WA_REMINDER_LEAD_DAYS = { FOLLOW_UP: 1, VACCINE_DUE: 3, DEWORMING_DUE: 3 } as const;
export const WA_ESCALATION = { maxAttempts: 2, intervalDays: 3 } as const;   // D-03 default

export async function registerReminderSweep(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'whatsapp-reminder-sweep',
    { pattern: '0 30 8 * * *', tz: 'Asia/Kolkata' },   // 08:30 IST daily
    { name: 'reminder-sweep', data: {} },
  );
}

export async function runReminderSweep(deps: SweepDeps): Promise<SweepReport> {
  const today = getTodayIST();

  // (1) DISCOVER — must select only the LATEST record per pet/vaccine (Pitfall 3)
  const followUps = await deps.source.findFollowUpsDue([
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.FOLLOW_UP),  // ADVANCE touch  (D-01)
    today,                                               // ON_DATE touch  (D-01)
  ]);
  const vaccines  = await deps.source.findLatestVaccinationsDue([
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.VACCINE_DUE), today,           // D-02
  ]);
  const dewormers = await deps.source.findLatestDewormingDue([
    addDaysIST(today, WA_REMINDER_LEAD_DAYS.DEWORMING_DUE), today,         // D-02
  ]);

  // (2) UPSERT tasks — unique(clinicId, sourceType, sourceId, kind, touch) => no double-send
  await deps.tasks.upsertMany([...followUps, ...vaccines, ...dewormers]);

  // (3) DISPATCH pending
  for (const task of await deps.tasks.findDispatchable(today)) {
    await deps.enqueueReminderSend(task);   // respects D-10/D-11 STOP inside the send service
  }

  // (4) ESCALATE / CAP (D-03, D-04)
  for (const task of await deps.tasks.findEscalatable(new Date())) {
    if (task.attemptCount >= WA_ESCALATION.maxAttempts) {
      await deps.tasks.cap(task.id, 'NO_REPLY_AFTER_MAX_ATTEMPTS');
      await deps.threads.flagNeedsAction(task.clinicId, task.ownerId, 'REMINDER_NO_REPLY');
      continue;                              // D-04: no further automated sends, ever
    }
    await deps.enqueueReminderSend(task);
  }
  return deps.report();
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Conversation-based WhatsApp pricing (24 h conversation windows billed by category) | **Per-message pricing** for template messages | 1 July 2025 [CITED: corroborated across provider docs] | Cost model for the real API differs from most pre-2025 tutorials. Not billed in Beta, but the `pricing` object in status webhooks should be stored raw for later analysis |
| Template categories `transactional` / `otp` / `marketing` | `AUTHENTICATION` / `UTILITY` / `MARKETING` | 2023 | Phase 7's D-10 REMINDER/TRANSACTIONAL split is a *domain* concept; map it to `UTILITY` for all six Beta templates in `cloud.metaCategory` |
| WhatsApp On-Premises API (self-hosted Docker containers) | Cloud API (Meta-hosted, Graph API) | On-Prem sunset announced 2024, fully deprecated Oct 2025 [ASSUMED — widely reported, not re-verified against Meta's deprecation page this session] | Build only against Cloud API shapes. Ignore On-Prem tutorials except for their error-code reference, which is still the most complete public list |
| BullMQ `repeat` / repeatable jobs (`queue.add(..., { repeat })`) | **Job Schedulers** (`upsertJobScheduler`, `getJobSchedulers`, `removeJobScheduler`) | BullMQ 5.x; `removeRepeatable` marked `@deprecated ... will be removed in v6` in the installed 5.81.3 [VERIFIED: `queue.d.ts:284,327`] | Use `upsertJobScheduler`. Repeatable-job examples in older docs are historical |
| BullMQ `debounce` option | `deduplication: { id, ttl }` | BullMQ 5.x (`job-options.d.ts:10` marks `debounce` `@deprecated use deduplication option`) [VERIFIED] | Use `deduplication` if job-level dedupe beyond `jobId` is needed |
| Positional template variables `{{1}}`, `{{2}}` | Named parameters (`parameter_name`) supported alongside positional | 2024 | Prefer named parameters in the `cloud` mapping — self-documenting and resilient to template edits |

**Deprecated/outdated for this phase:**
- Meta's official `whatsapp` npm SDK: last published 2024-02-12 at `0.0.5-Alpha` [VERIFIED: npm registry]. Do not use.
- `node-cron` for anything new in this module (see Pitfall 2). The existing `midnight-archive.ts` usage is grandfathered.
- Any tutorial showing `send()` returning a delivered status.

---

## Runtime State Inventory

Not applicable — Phase 7 is a greenfield feature phase, not a rename, refactor, or migration. No existing runtime state carries a string or identifier that this phase changes.

The nearest thing to runtime state is the **missing Prisma migrations** (Pitfall 4) and the **missing mobile dependencies** (Pitfalls 11, 12), both captured under § Environment Availability.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | All persistence | ✓ | 16-alpine, `breeyo-postgres-1` healthy on :5433 | — |
| Redis 7 | BullMQ queues, Socket.IO adapter | ✓ | 7-alpine, `breeyo-redis-1` healthy on :6379 | — |
| Docker + Compose | Local dev services | ✓ | Client & Server 28.3.2, daemon running | — |
| Node.js | API + tooling | ✓ | v24.13.1 local; CI pins Node 22 | — |
| pnpm | Workspace install | ✓ | 9.15.0 | — |
| `bullmq` with `upsertJobScheduler` | Reminder sweep | ✓ | 5.81.3 installed — API confirmed in type defs | — |
| `node:crypto` HMAC + `timingSafeEqual` | Webhook signature verification | ✓ | stdlib | — |
| Global `fetch` | Cloud API adapter stub | ✓ | Node 18+ | — |
| **Prisma migrations for Phase 3–6 models** | Any Phase 7 integration test touching a pet, consultation, or due date | ✗ | Only `init` + `add_consent_records` exist; running DB has 14 Phase-1 tables | **No fallback** — Wave 0 must generate them |
| **`@breeyo/ui` in `apps/mobile`** | UI-SPEC component inventory (Paper v5 MD3) | ✗ | not in `package.json`, not in `node_modules` | Build with plain RN components matching Phase 4 precedent while honoring UI-SPEC tokens (requires a recorded deviation) |
| **`react-native-paper`** | UI-SPEC line 221 component list | ✗ | present only under `packages/ui` | Same fallback as above |
| `expo-print` / `expo-file-system` / `expo-sharing` | Invoice PDF share path (Phase 4 code already imports them) | ✗ | not declared, not installed | Skip the PDF-attachment leg of `invoice_delivery` in Beta and send the template with a payment link only; flag for the user |
| `psql` / `redis-cli` on host | Manual DB/queue inspection during dev | ✗ | not installed on host | Use `docker exec breeyo-postgres-1 psql ...` / `docker exec breeyo-redis-1 redis-cli ...` |
| Meta WhatsApp Business account / phone number ID / app secret | Real Cloud API sends | ✗ | Meta Business verification not started (STATE.md blocker) | **Not needed in Beta** — the entire phase is simulator-only by design (WHA-04). Cloud API adapter ships as an unexercised stub |

**Missing dependencies with no fallback:**
- Prisma migrations for the Phase 3–6 models. This blocks *verification*, not implementation, but Nyquist validation cannot pass without it.

**Missing dependencies with fallback:**
- `@breeyo/ui` / `react-native-paper` — fallback exists but changes the UI-SPEC contract; needs an explicit decision, not a silent workaround.
- `expo-print` / `expo-file-system` / `expo-sharing` — fallback (link-only invoice template) exists.

**New environment variables to add to the root `.env.example`:**
```bash
# WhatsApp (Phase 7) — simulator by default; swap to cloud-api via config (WHA-04)
WHATSAPP_PROVIDER=simulator            # simulator | cloud-api
WHATSAPP_GRAPH_VERSION=v23.0
WHATSAPP_PHONE_NUMBER_ID=              # required only when provider=cloud-api
WHATSAPP_ACCESS_TOKEN=                 # required only when provider=cloud-api
WHATSAPP_APP_SECRET=                   # X-Hub-Signature-256 verification
WHATSAPP_WEBHOOK_VERIFY_TOKEN=         # GET handshake token
WHATSAPP_SIMULATOR_WEBHOOK_SECRET=     # shared secret for simulator-driven webhook calls
```

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`, so this section applies.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x (`apps/api`, `apps/mobile`, `packages/ui`, `packages/validators`) |
| API config file | `apps/api/vitest.config.ts` — `environment: node`, `setupFiles: ['./tests/helpers/setup.ts']`, `include: ['tests/**/*.test.ts', 'src/**/*.test.ts']`, `fileParallelism: false`, 30 s timeouts |
| Mobile config file | `apps/mobile/vitest.config.ts` — `environment: node`, no setup file, 15 s timeout. **No jsdom / no React Native preset** → component rendering is not supported; mobile tests are logic-level with `vi.mock` |
| API test harness | `apps/api/tests/helpers/app.ts` (`buildTestApp()` / `closeTestApp()`) + `apps/api/tests/helpers/factories.ts` (`createTestUser`, `createTestClinic`, `createTestClinicMember`, `createTestTokens`, `cleanupTestData`, exported `prisma`) |
| Quick run command | `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp` |
| Full suite command | `pnpm test` (turbo, all packages) |

Note: CLAUDE.md says API tests use `supertest`; `supertest@^7` is a devDependency but Phase 3/4 tests actually use the `buildTestApp()` + Fastify pattern. Follow the code, not the doc.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WHA-04 | `SimulatorProvider.capabilities` matches Cloud API limits (3 buttons/20 chars/10 rows/24 chars) | unit | `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp/providers/__tests__/simulator.provider.test.ts` | ❌ Wave 0 |
| WHA-04 | `sendFreeform` throws `OUTSIDE_SERVICE_WINDOW` when window closed | unit | same file | ❌ Wave 0 |
| WHA-04 | `provider-registry` returns `CloudApiProvider` when `WHATSAPP_PROVIDER=cloud-api` and nothing else changes | unit | `... provider-registry.test.ts` | ❌ Wave 0 |
| WHA-04 | Cloud API mapper produces a valid Meta template payload and normalizes 131026→`NOT_ON_WHATSAPP`, 131047→`OUTSIDE_SERVICE_WINDOW`, 132000→`TEMPLATE_PARAM_MISMATCH` | unit | `... cloud-api.mapper.test.ts` | ❌ Wave 0 |
| WHA-04 | `verifyMetaSignature` accepts a correct HMAC and rejects a tampered body | unit | `... cloud-api.webhook.test.ts` | ❌ Wave 0 |
| WHA-05 | Send persists `WhatsAppMessage(status=QUEUED)` before any dispatch | integration | `pnpm --filter @breeyo/api test -- --run tests/whatsapp/send.test.ts` | ❌ Wave 0 |
| WHA-05 | Status ladder is monotonic: applying `DELIVERED` then `SENT` leaves `DELIVERED` | unit | `... delivery-status.service.test.ts` | ❌ Wave 0 |
| WHA-05 | Every status change appends a `WhatsAppMessageStatusEvent` row | integration | `tests/whatsapp/status-ledger.test.ts` | ❌ Wave 0 |
| WHA-05 | Duplicate webhook for the same `providerMessageId` is a no-op | integration | `tests/whatsapp/webhook-idempotency.test.ts` | ❌ Wave 0 |
| WHA-05 | Inbox list returns threads filtered by `All/Invoices/Reminders/Bookings/Failed/Needs action` | integration | `tests/whatsapp/inbox.test.ts` | ❌ Wave 0 |
| WHA-01 (D-01) | Sweep creates ADVANCE task at follow-up −1 day and ON_DATE task on the day | unit | `... reminder-sweep.test.ts` | ❌ Wave 0 |
| WHA-01 (D-02) | Sweep creates vaccine/deworming tasks at due −3 days and on due date | unit | same file | ❌ Wave 0 |
| WHA-01 (D-02) | Superseded vaccination record does **not** produce a task (Pitfall 3) | unit | same file | ❌ Wave 0 |
| WHA-01 (D-03) | Running the sweep twice on the same day creates exactly one task per source/kind/touch | integration | `tests/whatsapp/reminder-idempotency.test.ts` | ❌ Wave 0 |
| WHA-01 (D-03) | No reply after attempt 1 → second attempt exactly 3 days later | unit | `... reminder-task.service.test.ts` | ❌ Wave 0 |
| WHA-01 (D-04) | After 2 attempts with no reply → `CAPPED_NEEDS_ACTION` and `thread.needsAction = true`; no third send | unit | same file | ❌ Wave 0 |
| WHA-01 (D-05) | `WaReminderKind` has no payment value; sweep never creates a payment-reminder task | unit | same file | ❌ Wave 0 |
| WHA-01 | Inbound reply transitions the matching task to `REPLIED` and cancels escalation | unit | `... inbound-router.test.ts` | ❌ Wave 0 |
| WHA-02 | `invoice_delivery` send succeeds with `contextType=INVOICE` + `contextId` and no FK to a nonexistent `Invoice` | integration | `tests/whatsapp/invoice-delivery.test.ts` | ❌ Wave 0 |
| WHA-02 (D-10) | `invoice_delivery` and `booking_confirmation` send even when `remindersOptedOut = true` | integration | `tests/whatsapp/opt-out.test.ts` | ❌ Wave 0 |
| WHA-02/03 (D-10/11) | Reminder-category templates are blocked when `remindersOptedOut = true`, for all of the owner's pets | integration | same file | ❌ Wave 0 |
| WHA-02 (D-13) | Send proceeds with missing consent and writes an audit entry | integration | `tests/whatsapp/consent.test.ts` | ❌ Wave 0 |
| WHA-02 (D-12) | Consent grant appends a `ConsentRecord` with `consentType='whatsapp_communication'`; withdrawal stamps `withdrawnAt` | integration | same file | ❌ Wave 0 |
| WHA-03 (D-06) | Inbound slot pick auto-confirms without staff action and queues `booking_confirmation` | integration | `tests/whatsapp/booking.test.ts` | ❌ Wave 0 |
| WHA-03 (D-07) | Two concurrent confirmations for the same slot → one `CONFIRMED`, one `SLOT_TAKEN` | integration | `tests/whatsapp/booking-concurrency.test.ts` | ❌ Wave 0 |
| WHA-03 (D-08) | A confirmed slot is absent from the next slot-offer list for that clinic/day | integration | `tests/whatsapp/booking.test.ts` | ❌ Wave 0 |
| WHA-03 (D-09) | No inbound payload can cancel or move a booking; only the authenticated staff endpoints can | integration | `tests/whatsapp/booking-authz.test.ts` | ❌ Wave 0 |
| WHA-03 | Slot offer never exceeds 10 rows and every label is ≤24 chars | unit | `... slot.service.test.ts` | ❌ Wave 0 |
| WHA-03 | `Clinic.workingHours = null` → no slots, replies with call-the-clinic guidance | unit | same file | ❌ Wave 0 |
| WHA-04 (D-14) | Auto-reply job is enqueued with the configured delay and a dedupe `jobId` | unit | `... simulator.provider.test.ts` | ❌ Wave 0 |
| WHA-04 (D-15) | Auto-reply for a booking action card always picks the positive/confirm path | unit | `... simulator-reply.test.ts` | ❌ Wave 0 |
| WHA-04 (D-16) | `deliveryMode` FAIL / INVALID_NUMBER / DELAYED produce the expected normalized outcomes; setting is global per clinic, not per thread | unit | `... simulator.provider.test.ts` | ❌ Wave 0 |
| WHA-05 | Template variable Zod validation rejects a missing variable with a 400 before persistence | unit | `packages/validators` — `... whatsapp.test.ts` | ❌ Wave 0 |
| WHA-05 | `requirePermission('SEND_WHATSAPP')` returns 403 for a role lacking it | integration | `tests/whatsapp/authz.test.ts` | ❌ Wave 0 |
| WHA-05 | Threads from clinic A are never visible to clinic B | integration | extend `apps/api/tests/tenant-isolation.test.ts` | ⚠️ file exists, needs WhatsApp cases |

Manual-only (human verification, justified): mobile inbox/thread/config visual states, 44 pt touch targets, WCAG AA contrast, font scaling to 1.5×, Android hardware-back behavior, screen-reader labels. Mobile vitest has no rendering environment (`environment: node`, no RN preset), so these cannot be automated in this repo without new infrastructure — out of scope for Phase 7.

### Sampling Rate

- **Per task commit:** `pnpm --filter @breeyo/api test -- --run src/modules/whatsapp` (unit-only, sub-30 s)
- **Per wave merge:** `pnpm --filter @breeyo/api test` (includes `tests/whatsapp/**` integration suites; requires the Wave 0 migration)
- **Phase gate:** `pnpm test` fully green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] **`apps/api/prisma/migrations/<ts>_add_phase_3_to_6_models/`** — generate the missing migrations so `pets`, `consultations`, `vaccination_records`, `deworming_records`, `queue_entries` etc. exist. Blocks every WhatsApp integration test (Pitfall 4)
- [ ] **`apps/api/prisma/migrations/<ts>_add_whatsapp_communication/`** — the Phase 7 tables
- [ ] `apps/api/tests/helpers/factories.ts` — add `createTestPetOwner`, `createTestPet`, `createTestConsultation`, `createTestVaccinationRecord`, `createTestWhatsAppThread`, and extend `cleanupTestData` to truncate the new tables
- [ ] `apps/api/tests/whatsapp/` — new directory with the integration suites listed above
- [ ] `apps/api/src/modules/whatsapp/**/__tests__/` — unit suites colocated per existing Phase 4 convention
- [ ] `packages/validators/src/__tests__/whatsapp.test.ts` — template variable schema tests
- [ ] `apps/api/src/lib/ist-date.ts` + test — extract `getTodayIST`/`addDaysIST` from `QueueRepository`
- [ ] Worker test guard — refactor so `Worker` construction is skippable in tests (Pitfall 7); export directly-callable job handlers
- [ ] **Decision task:** `@breeyo/ui` + `react-native-paper` in `apps/mobile/package.json`, or a recorded UI-SPEC deviation (Pitfall 11)
- [ ] Root `.env.example` — add the seven `WHATSAPP_*` variables
- [ ] `packages/types/src/constants/socket-events.ts` — add `WHATSAPP_MESSAGE_CREATED`, `WHATSAPP_MESSAGE_STATUS_CHANGED`, `WHATSAPP_THREAD_UPDATED`
- [ ] `apps/api/src/lib/audit-log.ts` — extend `AuditEvent` with the WhatsApp consent/opt-out/invalid-number events (Pitfall 6)

Framework install: none needed — Vitest 2.1.x is already present in every affected package.

---

## Security Domain

`security_enforcement` is not present in `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Ports & adapters keeps provider credentials in one adapter; the webhook is the only unauthenticated surface and is explicitly isolated in a child plugin |
| V2 Authentication | yes (existing) | `@fastify/jwt` + `authenticate` middleware on every route except the webhook. Webhook authenticates via `X-Hub-Signature-256` HMAC, not JWT |
| V3 Session Management | no (reused) | Phase 1 refresh-token rotation unchanged. Note: WhatsApp's "24 h customer service window" is a *messaging* concept, not an auth session |
| V4 Access Control | yes | `requirePermission('SEND_WHATSAPP')` on send/retry; `MANAGE_CLINIC_SETTINGS` on the Admin config screen; every repository method takes an explicit `clinicId` from `request.user.activeClinicId` (never from the request body). Booking Move/Cancel must be staff-only endpoints (D-09) — an inbound payload must never be able to reach them |
| V5 Input Validation | yes | Zod at the boundary for all request bodies (`@breeyo/validators`); per-template Zod variable schemas; webhook payload parsed through a Zod schema before routing; button/list payloads matched against an allowlisted `"<domain>:<action>:<uuid>"` grammar rather than interpreted |
| V6 Cryptography | yes | `node:crypto` `createHmac('sha256')` + `timingSafeEqual` for webhook signatures. No hand-rolled comparison, no crypto library added |
| V7 Error Handling & Logging | yes | Centralized `error-handler.ts`. **Never log access tokens, app secrets, or full owner phone numbers** — mask to last 4 digits in logs. `WhatsAppMessageStatusEvent.rawPayload` stores provider payloads; scrub any token-bearing fields before persisting |
| V8 Data Protection | yes | Owner phone numbers and message bodies are personal data under DPDP. `ConsentRecord` provides the lawful-basis trail (D-12). Message bodies are clinic-scoped and only reachable through `clinicId`-filtered queries. India data residency (`ap-south-1`) already established |
| V9 Communications | yes | All Cloud API calls over HTTPS to `graph.facebook.com`. Webhook must be HTTPS in any deployed environment |
| V11 Business Logic | yes | Slot double-booking is prevented by a DB unique constraint, not by client trust (D-07). Escalation is hard-capped so the system cannot be induced into unbounded sending (D-03/D-04). STOP is enforced server-side for reminder-category templates (D-10/D-11) |
| V12 Files & Resources | yes | Media size cap (100 MB) and MIME allowlist enforced before `uploadMedia`. Never send a client-supplied URL to a provider — resolve internal references only |
| V13 API & Web Service | yes | Webhook gets its own tighter `config.rateLimit`; returns `200` fast; idempotent on `providerMessageId` unique index so replay is harmless |
| V14 Configuration | yes | Secrets from env only, never committed. `WHATSAPP_PROVIDER` must default to `simulator` so a misconfigured deploy cannot accidentally send real messages to real pet owners |

### Known Threat Patterns for Fastify + Prisma + external messaging webhook

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook injects fake inbound messages / STOP opt-outs / booking confirmations | Spoofing | `X-Hub-Signature-256` HMAC over raw body with `timingSafeEqual`; reject before any parsing or routing. **This is the highest-severity item in the phase** — an unverified webhook lets anyone opt an owner out or confirm bookings |
| Webhook replay creates duplicate bookings or duplicate auto-replies | Tampering / Repudiation | `@unique` on `providerMessageId`; treat `P2002` as already-processed |
| Cross-tenant read of another clinic's threads via a guessed `threadId` | Information Disclosure | Every query filtered by `clinicId` from the JWT; 404 (not 403) on cross-tenant ids to avoid existence disclosure. Extend `tests/tenant-isolation.test.ts` |
| Owner-supplied text interpreted as a command (`"cancel my booking"`) | Elevation of Privilege | No NLP (UI-SPEC). Route only on allowlisted button/list payload ids and a two-keyword allowlist. `booking:cancel:*` is not a registered inbound payload at all (D-09) |
| Unbounded automated sending (nag loop / cost blowout / Meta quality-rating damage) | Denial of Service | Hard escalation cap (D-03/D-04); one task row per `(source, kind, touch)`; BullMQ `limiter` on the outbound worker to stay under 80 MPS |
| Template variable injection (owner name containing a payload that alters template meaning) | Tampering | Zod-validated variables with length caps; templates are pre-registered so structure cannot be altered by variable content |
| Secret leakage into logs, Sentry, or `rawPayload` | Information Disclosure | Scrub `Authorization` headers and access tokens before logging or persisting; mask phone numbers in log output |
| SQL injection via search (inbox search covers owner name, mobile, pet name, invoice number, booking reference) | Tampering | Prisma parameterized queries only. **Do not use `$queryRawUnsafe`.** Note `prisma-rls.ts:19-21` already interpolates `clinicId` into `$executeRawUnsafe` — do not copy that pattern into the WhatsApp module |
| Webhook endpoint used as an unauthenticated DoS vector | Denial of Service | Route-level `config.rateLimit`, small body size limit, signature check before any DB access |
| Sending to a mis-normalized phone number (message to the wrong person) | Information Disclosure | Single normalization function with tests; `NOT_ON_WHATSAPP` failures set `numberStatus=INVALID` and require staff correction before retry (UI-SPEC copy already specifies this) |

---

## Plan Breakdown Assessment

The ROADMAP proposes 10 plans (07-01 … 07-10). The structure is sound; the notes below are refinements based on what the codebase actually contains.

| Roadmap plan | Assessment |
|--------------|------------|
| 07-01 Shared contracts, schemas, booking state machine, shared tests | **Keep.** Should own `packages/types/src/whatsapp.ts`, `constants/whatsapp.constants.ts`, `packages/validators/src/whatsapp.ts`, the `WaProvider` port file, and the template registry's type surface. Everything else depends on it |
| 07-06 Prisma schema registration + Wave 0 API test scaffolds | **Promote to Wave 0 and expand.** Must also generate the **missing Phase 3–6 migrations** (Pitfall 4) and extend `tests/helpers/factories.ts`. Without this, no integration test in the phase can run. Consider splitting: 07-06a migrations & factories, 07-06b WhatsApp schema |
| 07-02 Provider registry, simulator pipeline, persistence, dispatch, consent, template rendering | **Split.** This is the largest and most architecturally important plan. Suggest: (a) provider port + registry + simulator provider with capability enforcement; (b) persistence + send authorization (consent/STOP/category) + template rendering. Bundling them risks the port being shaped by the persistence code rather than by the Cloud API contract |
| 07-10 Delivery-status service, webhook pipeline, outbound/simulator workers | **Keep, but sequence earlier** — 07-02's simulator depends on the simulator queue and the status funnel existing. Also must include the worker test guard (Pitfall 7) and the encapsulated raw-body content-type parser (Pitfall 10) |
| 07-09 Reminder scheduling, bounded retries, failure tasks, route wiring | **Keep.** Must include the latest-record-only source queries (Pitfall 3), the IST date helper extraction, and `upsertJobScheduler` rather than `node-cron` (Pitfall 2) |
| 07-03 Booking flow, booking records, provisional capture, action endpoints | **Keep.** Must include the `WhatsAppSlotHold` unique constraint, the P2002 path, the ≤10-row / ≤24-char slot label limits, and the `workingHours = null` fallback |
| 07-07 Inbox/config/simulator/owner-preference controllers + route registration | **Keep.** Resolve the `SEND_WHATSAPP` vs. Front-Desk-and-Admin gating question here (Pitfall 13) |
| 07-04 Mobile hooks, store, reusable components | **Keep, but must be preceded by the UI library decision** (Pitfall 11). Add a Wave 0 dependency/decision task before this plan |
| 07-08 Mobile inbox/thread/config/booking-detail screens + navigation gating | **Keep.** UI-SPEC's four screens × four states (loading/empty/populated/error) is 16 state implementations — this plan is large; consider splitting inbox+thread from config+booking-detail |
| 07-05 Cross-module send integrations, owner preference UX, invalid-number correction, human verification | **Keep, sequence last.** The invoice-detail launch surface depends on Phase 6, which is unimplemented (Pitfall 8) — scope this plan to the *generic* `TemplateSendSheet` entry points that exist today (pet profile, reminder card, document view) and leave a documented hook for invoice detail |

**Recommended additional plan:** a dedicated Cloud API adapter stub plan (mapper + webhook + error-code normalization + its unit tests). This is the deliverable that *proves* WHA-04. Folding it into 07-10 risks it being deferred as "we don't need it in Beta," which would defeat the requirement.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Template quick-reply buttons arrive in a `button` object with `payload`/`text`, distinct from interactive `button_reply` | § Cloud API — Inbound webhook shapes | Low. Mitigated by requiring `parseInbound` to normalize both shapes. Only relevant post-swap |
| A2 | Marketing templates have a ~2/day per-user cap across all businesses | § Cloud API — Templates | Very low. All six Beta templates are UTILITY-shaped; cited only as background for D-10 |
| A3 | WhatsApp On-Premises API is fully deprecated as of Oct 2025 | § State of the Art | Very low. Phase 7 targets Cloud API regardless |
| A4 | `whatsapp-api-js`, `@whatsapp-cloudapi/client`, `@whatsapp-cloudapi/types` are the leading community npm options | § Alternatives Considered | None — all are recommended *against*; recommendation is zero new dependencies |
| A5 | 08:30 IST is an appropriate daily reminder send time for Indian vet clinics | § Pattern 4 | Low. Cosmetic; worth confirming with the pilot clinic. Any 08:00–10:00 IST value is defensible |
| A6 | 10 seconds is a good simulator auto-reply delay | § Pattern 10 | Low. Explicitly Claude's discretion (D-14); made configurable 3–60 s |
| A7 | `escalationMaxAttempts = 2`, `escalationIntervalDays = 3` | § Pattern 5 | Low. This is CONTEXT.md's own recommended default for the D-03 discretion item |
| A8 | Mobile clients should upload the generated invoice PDF to the existing attachment presign flow, and the API resolves attachment → bytes → `uploadMedia` | § Pattern 6 | **Medium.** `attachment.service.ts` returns a *mock* presigned URL in development, so this path is untested end-to-end. See Open Question 2 |
| A9 | Cloud API Graph version `v23.0` is a reasonable default | § Example 1 | Very low. Configurable via `WHATSAPP_GRAPH_VERSION`; unexercised in Beta |
| A10 | Phase 6 will land before Phase 7 is executed, so an `Invoice` model will exist at implementation time | § Pitfall 8 | **Medium.** Mitigated structurally by using generic `contextType`/`contextId` with no FK, so Phase 7 works either way |
| A11 | Extending the existing `AuditEvent` enum (rather than adding a second audit table) is the intended direction | § Pitfall 6 | Low. Either choice is workable; the recommendation splits message-flow logging from compliance logging |

---

## Open Questions

1. **UI library for mobile: honor UI-SPEC's React Native Paper mandate, or continue Phase 4's plain-RN precedent?**
   - What we know: `apps/mobile/package.json` declares neither `@breeyo/ui` nor `react-native-paper`; neither is installed. `packages/ui` has `react-native-paper@^5.15.1` and 26 components plus a `whatsapp/MessageLogScreen.stories.ts` wireframe stub. 07-UI-SPEC.md mandates Paper v5 MD3 and names specific Paper components. STATE.md records the Phase 4 workaround.
   - What's unclear: whether adding `@breeyo/ui` to the Expo app works cleanly — `packages/ui` peer-depends on `react-native-reanimated >=3` and `react-native-gesture-handler >=2`, neither of which is in the mobile app either. That is a non-trivial Expo SDK 52 integration, not a one-line dependency add.
   - Recommendation: make this an explicit Wave 0 decision task with a spike. If the integration proves fiddly, record a UI-SPEC deviation and build with plain RN while honoring UI-SPEC's *token* values (spacing multiples of 4, the exact color hexes, the four type roles, 44 pt targets, WCAG AA). Do not let an implementer decide this silently mid-phase.

2. **Where do invoice PDF bytes come from for `invoice_delivery`?**
   - What we know: PDFs are generated client-side via `expo-print` (`useGeneratePdf.ts`); `attachment.service.ts` returns a mock presigned URL in dev with a TODO for the real S3 SDK; `expo-print`/`expo-file-system`/`expo-sharing` are not installed.
   - What's unclear: whether Beta should attach a real PDF at all, or send the `invoice_delivery` template with a payment link and no attachment.
   - Recommendation: **send link-only in Beta.** UI-SPEC says "Unpaid invoice template automatically includes invoice PDF and Razorpay payment link" — so this is a genuine UI-SPEC-vs-infrastructure conflict that should be raised with the user rather than resolved by an implementer. Keep `WaMediaRef` in the port so attaching later is additive.

3. **Should the missing Phase 3–6 Prisma migrations be Phase 7 scope?**
   - What we know: only 2 migrations exist for 29 models; the dev and CI databases lack every Phase 3+ table; Phase 3/4 unit tests pass only because they mock repositories; the real integration suites under `tests/patient/` and `tests/queue/` cannot pass on a fresh database.
   - What's unclear: whether the user considers this Phase 7 work or a separate remediation.
   - Recommendation: include it as Wave 0 of Phase 7, framed as a prerequisite. Phase 7 cannot be *verified* without it, and deferring it pushes the problem into Phase 8.

4. **`SEND_WHATSAPP` is granted to Clinician, but UI-SPEC limits access to Front Desk + Admin.**
   - What we know: `seed.ts` grants `SEND_WHATSAPP` to Admin, Clinician, and FrontDesk. UI-SPEC line 28 restricts access to Front Desk and Admin.
   - What's unclear: whether "access" means the inbox surface only, or the send capability too.
   - Recommendation: keep `SEND_WHATSAPP` for the send action (a vet sending a follow-up from a consultation is sensible), gate the inbox/thread *screens* on FrontDesk/Admin, and gate the config screen on `MANAGE_CLINIC_SETTINGS`. Confirm with the user; do not change seeded permissions without a decision.

5. **Should the reminder sweep also re-drive stranded `QUEUED` messages?**
   - What we know: persist-then-dispatch means a `QUEUED` row can outlive its BullMQ job if Redis evicts it (Pitfall 1 applies to short-lived jobs too, under memory pressure).
   - What's unclear: whether the added complexity is worth it for Beta.
   - Recommendation: yes, and it is nearly free — add a step to the daily sweep that re-enqueues `QUEUED` messages older than 30 minutes. It converts a silent-loss failure mode into a bounded delay.

6. **Does the "Needs action" flag need a manual clear path beyond UI-SPEC's `Mark Resolved`?**
   - What we know: UI-SPEC has a `Mark resolved` action card and toast `Action marked resolved`; D-04 sets the flag on escalation cap.
   - What's unclear: whether resolving a thread clears `needsAction` globally or per-task.
   - Recommendation: `Mark Resolved` clears `thread.needsAction` and marks the underlying capped task(s) as acknowledged. Model it as an explicit `acknowledgedAt` on the task so the audit trail shows who cleared it.

---

## Sources

### Primary (HIGH confidence — direct code inspection)
- `apps/api/prisma/schema.prisma` — all 29 models; `ConsentRecord` (302-317), `Clinic.workingHours` (45), `Consultation.followUpDate` (349), `VaccinationRecord`/`DewormingRecord` `nextDueDate` (473-513), `PetOwner` unique `[clinicId, mobile]` (227-245)
- `apps/api/prisma/migrations/` — only `20260802111747_init`, `20260802162311_add_consent_records`
- `apps/api/prisma/post-migrate.sql` — RLS enabled on exactly 3 tables
- `apps/api/prisma/seed.ts` — `SEND_WHATSAPP` permission (line 24), role grants (46-69)
- `apps/api/src/app.ts` — plugin/route registration order, rate-limit config, `isTest` guard
- `apps/api/src/modules/notifications/notification-bus.ts`, `notification.worker.ts`, `notification.routes.ts` — BullMQ patterns and the worker-in-routes pitfall
- `apps/api/src/modules/notifications/push.service.ts` — existing provider-service precedent
- `apps/api/src/modules/vaccination/{routes,service}.ts` — current module/route/service conventions, error-throw pattern
- `apps/api/src/modules/attachment/attachment.service.ts` — mock presigned URLs in dev
- `apps/api/src/middleware/{authenticate,authorize,tenant-context,error-handler}.ts` — `requirePermission`, `request.db`, error shape
- `apps/api/src/lib/{audit-log,prisma-rls}.ts` — auth-only `AuditEvent`; `createTenantClient` and its `$executeRawUnsafe` interpolation
- `apps/api/src/jobs/midnight-archive.ts` — `node-cron` with `timezone: 'Asia/Kolkata'`
- `apps/api/src/realtime/socket.ts` — `clinic:{clinicId}` room, JWT handshake, Redis adapter
- `apps/api/{package.json,vitest.config.ts}`, `apps/api/tests/helpers/{app,factories,setup}.ts`
- `apps/mobile/package.json` — missing `@breeyo/ui`, `react-native-paper`, `expo-print`, `expo-file-system`, `expo-sharing`, `expo-av`
- `apps/mobile/src/features/queue/hooks/{useQueue,useQueueSocket}.ts` — React Query + socket patterns
- `apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts` — client-side PDF generation
- `packages/ui/src/wireframes/whatsapp/MessageLogScreen.stories.ts` — stub only, no reusable layout
- `packages/types/src/index.ts`, `packages/validators/src/index.ts`, `packages/types/src/constants/socket-events.ts`
- `docker-compose.yml` — Redis `--maxmemory 128mb --maxmemory-policy allkeys-lru`
- `.github/workflows/ci.yml` — `prisma migrate deploy` + `post-migrate.sql`, Node 22
- `apps/api/node_modules/bullmq/dist/esm/classes/queue.d.ts` (202, 284, 302, 311), `types/job-options.d.ts` (10, 16), `types/deduplication-options.d.ts` — `upsertJobScheduler`, `removeJobScheduler`, `deduplication`, deprecations, all present in 5.81.3
- Live database inspection: `docker exec breeyo-postgres-1 psql -U breeyo_admin -d breeyo -c "select relname, relrowsecurity, relforcerowsecurity from pg_class ..."` — 14 tables, all Phase 1
- `npm view` for `bullmq`, `whatsapp`, `whatsapp-api-js`, `@whatsapp-cloudapi/{client,types}`
- `slopcheck install -e npm ...` — all three candidates `[OK]`

### Primary (HIGH confidence — official documentation)
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages — endpoint path, free-form text example, 24 h customer service window, template-only-outside-window rule
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages — required envelope fields, `MessageResponsePayload` (`messages[].id`, `message_status`, `contacts[].wa_id`/`input`), interactive object types
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages — 3-button max, 256-char id, 20-char title, 1024-char body, inbound `button_reply` + `context` shape
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages — 10 sections / 10 rows total, 200/24/72-char limits, inbound `list_reply` shape
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/media-upload-api — media upload endpoint, 30-day retention, 100 MB, 25 RPS
- https://developers.facebook.com/docs/whatsapp/on-premises/errors/ — canonical error-code list (still the most complete public reference)
- https://docs.bullmq.io/guide/jobs/delayed — `delay` is relative, `changeDelay`, no exact-time guarantee
- https://docs.bullmq.io/guide/job-schedulers/ — `upsertJobScheduler(id, repeatOpts, template)`, cron `pattern`, `tz`
- https://docs.bullmq.io/patterns/deduplication — `deduplication: { id, ttl }`

### Secondary (MEDIUM confidence — corroborated across multiple independent sources)
- https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices — status objects carry `id`/`status`/`recipient_id`/`timestamp` + `conversation`/`pricing`; statuses are not order-guaranteed; `X-Hub-Signature-256` over raw body
- https://webhookrelay.com/blog/whatsapp-cloud-api-webhooks/ — GET handshake, `hub.challenge` echo, verify token
- https://docs.aws.amazon.com/social-messaging/latest/userguide/increase-message-throughput.html — 80 MPS default, upgrade path
- https://www.infobip.com/docs/whatsapp/compliance/template-compliance and https://docs.gorgias.com/en-US/whatsapp-template-quality-rating-462325 — template quality rating and automatic pause
- https://wa.expert/pages/whatsapp-opt-in-compliance-india, https://www.dpdpa.com/blogs/whatsapp_business_dpdpa_compliance_messaging_apps.html, https://www.scconline.com/blog/post/2026/07/29/whatsapp-chatbot-opt-in-consent-dpdp-act-compliance/ — India opt-in and DPDP consent requirements
- https://www.heltar.com/blogs/all-meta-error-codes-explained-along-with-complete-troubleshooting-guide-2025-cm69x5e0k000710xtwup66500 and https://dualhook.com/docs/api-errors — error-code meanings for 131026 / 131047 / 131049 / 132000
- https://en.wikipedia.org/wiki/Hexagonal_architecture_(software) and https://softwarepatternslexicon.com/ts/architectural-patterns/hexagonal-architecture-ports-and-adapters/implementing-hexagonal-architecture-in-typescript/ — ports & adapters vocabulary

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Template quick-reply inbound `button.payload` shape differing from `interactive.button_reply` (A1) — third-party sources only
- ~2/day per-user marketing template cap (A2) — third-party only
- On-Premises API full deprecation date (A3) — widely reported, not re-verified against Meta this session

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Standard stack | HIGH | Every recommended library verified installed; versions read from `package.json`, `pnpm-lock.yaml`, and `node_modules`. Zero new dependencies means zero version risk |
| Cloud API contract (drives the WHA-04 port shape) | HIGH | Endpoint, envelope, response shape, 24 h window, button/list limits, media upload, and webhook security all read from Meta developer documentation this session. One inbound shape detail (A1) is MEDIUM |
| BullMQ scheduling design | HIGH | API surface confirmed against installed 5.81.3 type definitions, not just docs. The Redis `allkeys-lru` argument is read directly from `docker-compose.yml` |
| Codebase integration points | HIGH | Every claim about existing code was verified by reading the file. The RLS, migration, and mobile-dependency gaps were confirmed against the running database and `node_modules` |
| Architecture patterns | HIGH | Grounded in verified codebase precedent plus verified API constraints. The data model is a recommendation, not a verified fact — the planner should reconcile field names as it writes plans |
| Pitfalls | HIGH | 13 of 15 verified by direct inspection (migrations, RLS state, mobile deps, worker-in-routes, audit enum, Redis policy, permission mismatch). The remaining 2 derive from cited API behavior |
| Reminder cadence / escalation specifics | HIGH for mechanism, MEDIUM for the exact numbers | The 2-attempts/3-days values are CONTEXT.md's own recommended default for a discretion item, not an external finding |
| Invoice/media path | MEDIUM | Blocked by Phase 6 being unimplemented and by the mock presigned-URL attachment service. Surfaced as Open Question 2 rather than resolved |
| Mobile UI approach | MEDIUM | The dependency gap is verified HIGH; the *resolution* requires a user decision (Open Question 1) |

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 for the codebase findings (stable — but re-verify the migration and mobile-dependency gaps immediately before planning, since Phase 5/6 work may close them). 2026-08-26 for the WhatsApp Cloud API findings (Meta ships policy and limit changes frequently; re-check button/list limits and pricing before the real-API swap, not before Beta).
