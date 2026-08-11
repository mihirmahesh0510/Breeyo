# Phase 9: Web Dashboard & Owner Portal - Research

**Researched:** 2026-08-12
**Domain:** Next.js 15 App Router browser dashboard + no-login tokenised owner web portal on an existing Fastify 5 / Prisma 6 / PostgreSQL 16 / Socket.IO 4 monorepo
**Confidence:** MEDIUM-HIGH for stack and repo conventions (verified against live code, live DB, live registries). MEDIUM for portal security architecture (grounded in official docs + OWASP-aligned guidance, but the specific exchange design is a recommendation, not a copied pattern). LOW-blocking for upstream dependency readiness — see `## Blocking Findings` first.

> **Read `## Blocking Findings` before planning anything else.** Five hard prerequisites for Phase 9 do not exist in this repo today. Planning around them silently will produce plans that cannot execute.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/09-web-dashboard-owner-portal/09-CONTEXT.md`.

#### Dashboard Home
- **D-01:** The browser dashboard lands on an operations cockpit, not a static module switchboard or a schedule-only page.
- **D-02:** Above the fold, queue, scheduling, billing, inventory, and user-management awareness should feel balanced rather than dominated by one module.
- **D-03:** The home screen is action-heavy. Admins and approved staff should be able to take meaningful quick actions directly from the home surface.
- **D-04:** The default time horizon is today-first. Future planning lives behind deeper scheduling and inventory views.
- **D-05:** The browser home uses scrollable priority sections rather than a rigid fixed desktop grid.
- **D-06:** Alerts and exceptions appear first in the scroll order, ahead of the rest of the operational summaries.
- **D-07:** Queue and scheduling remain separate panels on the browser home. Do not collapse them into one blended operational board.
- **D-08:** The home screen should expose action-ready snippets instead of rich analytics-heavy dashboards. Show enough detail to decide the next click.
- **D-09:** Browser home does not include a persistent clinic-wide activity feed. Live activity should stay inside the relevant modules.
- **D-10:** Browser search stays module-local rather than introducing a persistent global command bar in Phase 9.
- **D-11:** User management should appear on home as an inline mini-panel for awareness and quick follow-through, not only as a deep settings page.
- **D-12:** Owner portal issues should surface on home only as exception cases needing staff attention.
- **D-13:** Phase 7 WhatsApp issues should also surface on the browser home as action exceptions, even though the main communications workflow remains mobile-first.
- **D-14:** Home configuration is partially personal: users can reorder the clinic-defined panel set, but should not fully redesign or remove the core operational panels.

#### Browser Access And Permissions
- **D-15:** Admin has browser access by default. Clinicians do not get browser access in Phase 9.
- **D-16:** Front Desk browser access is supported, but it is clinic-configurable and disabled by default until an admin enables it.
- **D-17:** When enabled, Front Desk can actively manage queue, billing, and scheduling in the browser.
- **D-18:** For Front Desk, inventory is visible in the browser but remains view-only.
- **D-19:** Browser permissions are configured through per-role module toggles rather than per-user custom rule sets.
- **D-20:** Modules or actions a browser user cannot access should be hidden rather than shown as locked placeholders.
- **D-21:** User management, role changes, and permission administration stay Admin-only.
- **D-22:** Refunds and invoice voids stay Admin-only even when Front Desk has broader browser access for routine billing work.
- **D-23:** High-risk browser actions use strong confirmation steps, while ordinary operational edits should stay fast.
- **D-24:** Sensitive operational changes should always show the acting user clearly in the UI and history, not only in backend logs.

#### Module Depth
- **D-25:** Phase 9 web modules should be full-depth operational surfaces overall, not just light monitoring pages.
- **D-26:** Inventory gets the richest browser workflow depth first.
- **D-27:** Queue and scheduling are still operational on the browser, but simpler than inventory in Phase 9.
- **D-28:** User management should be core-admin complete, but not expand into a much broader staffing platform in this phase.

#### Inventory Web Workflow
- **D-29:** Browser inventory should optimize for both operations and analysis, not only one of them.
- **D-30:** The inventory web module must cover all three of these well: batch/stock management, reordering workflow, and inventory analytics -- while still staying clean and intuitive.
- **D-31:** Inventory stays one module with sub-tabs, not three separate top-level browser areas.
- **D-32:** The default inventory browser sub-tab is Stock + Batches.
- **D-33:** The stock-and-batches browser view supports direct table actions for normal work.
- **D-34:** High-risk stock changes still require stronger workflow steps and confirmations instead of purely inline edits.
- **D-35:** Reordering and analytics should stay connected to the operational stock tabs rather than feeling like isolated report screens.
- **D-36:** Browser inventory analytics support both CSV and PDF export in Phase 9.
- **D-37:** Barcode scanning and on-the-floor inventory actions remain clearly mobile-first even after the browser inventory module becomes strong.

#### Cross-Device Coexistence
- **D-38:** Browser/mobile responsibility follows a role-shaped split rather than device parity for everyone.
- **D-39:** Default device choice is role-dependent rather than globally browser-first or globally mobile-first.
- **D-40:** When a user has browser and mobile open at once, changes should live-sync, but overtaken edits must surface conflict or stale-state prompts.
- **D-41:** Browser flows should preserve the same mental model as mobile -- statuses, action meanings, and workflow concepts stay aligned even when layouts differ.

#### Realtime Alerts
- **D-42:** Browser live updates are inline-first. Toasts and other interruptive alerts are reserved for a smaller set of important cases.
- **D-43:** Interruptive alerts should be used for failures and action-blocking exceptions, not for every normal workflow change.
- **D-44:** Alerts should fade after they are seen rather than staying pinned until explicit resolution in the global home surface.
- **D-45:** Phase 9 should not add a separate unified alert center. Use the home cockpit plus module-local alerts.

#### Portal Home
- **D-46:** The owner portal lands on an owner overview page, not a pay-first page and not directly on the pet record by default.
- **D-47:** When there is an unpaid invoice, payment and record access should receive equal emphasis on the home screen rather than payment dominating everything else.
- **D-48:** If a due payment and a recent clinical update both exist, the top of home should combine them into one summary area rather than privileging one over the other.
- **D-49:** Pet snapshot cards should appear above the fold, and the portal home should include a rich medical preview rather than a billing-only posture.
- **D-50:** If there is no unpaid balance, the portal home should emphasize pet records first.
- **D-51:** When multiple unpaid invoices exist, home shows one total due plus the individual invoice list.
- **D-52:** Clinic help/contact actions remain always visible on the portal home.
- **D-53:** Within the valid magic-link window, the portal should remember where the owner left off and restore that context.
- **D-54:** Payment status and receipt history primarily live inside invoice detail views rather than becoming a large home-screen widget.
- **D-55:** Owners should open PDFs and documents from invoice or pet detail views, not directly from home cards.
- **D-56:** The portal home should always show a visible trust banner explaining the secure clinic-linked context.

#### Portal Navigation
- **D-57:** The owner portal uses top-level tabs rather than a single long page.
- **D-58:** Multi-pet owners use a pet switcher inside the shared owner portal.
- **D-59:** Invoice navigation is nested under each pet, not one global owner invoice list, even though payment selection can still combine invoices across pets.
- **D-60:** Deep links from WhatsApp should open the specific target first.
- **D-61:** Within a selected pet, read-only medical history is organized as a visit timeline.
- **D-62:** Payments stay inside invoice flows rather than getting their own top-level portal tab.
- **D-63:** After a deep link opens a specific invoice or record, the rest of the portal remains fully reachable.
- **D-64:** Expired links go to an expired screen with a built-in reissue path.

#### Portal Trust And Payment Flow
- **D-65:** The no-login magic-link model is explained through a clear trust banner using plain language, not a separate intro gate.
- **D-66:** Payment transitions use an explicit handoff that prepares the owner for the external Razorpay step and return path.
- **D-67:** The easiest expired-link recovery is requesting a new WhatsApp link directly from the portal.
- **D-68:** Security messaging inside the portal should provide light reassurance, not a technical security console.
- **D-69:** Owners can choose to pay one invoice or multiple invoices.
- **D-70:** If they choose multiple invoices, Phase 9 should support one combined checkout with a clear invoice-and-pet breakdown.
- **D-71:** After successful payment, the owner should see a success summary with receipt access before navigating elsewhere.
- **D-72:** Failed or interrupted payments should return the owner to the portal with retry choices and clinic help available.

#### Owner-Facing Record Language
- **D-73:** Portal language for records uses a mixed clinical + plain approach. Keep the clinic's real terminology visible, but pair it with simpler owner-friendly wording where helpful.
- **D-74:** Prescriptions should appear as simple usage cards rather than raw rows or only narrative notes.
- **D-75:** Diagnosis and visit-history entries should add a short plain-language gloss where useful.
- **D-76:** Abbreviations and shorthand should be expanded or paired with understandable wording in the owner view.
- **D-77:** Record views should include light action guidance when useful, but should not become a heavy coaching product.

#### Portal Support Boundaries
- **D-78:** Phase 9 owner self-service is intentionally bounded. It should definitely support link recovery and payment recovery.
- **D-79:** Clinic contact actions should be available from anywhere in the portal as escalation paths.
- **D-80:** The portal should not add a direct structured correction-request workflow for records or invoices in Phase 9.
- **D-81:** The portal should try to be helpful first with clear wording and retry options, then fall back to human clinic support.

### Claude's Discretion

- Exact browser information density, visual layout, and component composition can follow the Phase 2 design system and the later UI design contract for this phase.
- Exact tab labels, card titles, and trust-copy wording can be finalized during UI work as long as they preserve the decisions above.
- Exact real-time transport details, route structure, caching behavior, and conflict-resolution mechanics are left to research and planning.
- Exact export formatting and analytics metric formulas are open to the planner unless they conflict with the browser-depth decisions above.

### Deferred Ideas (OUT OF SCOPE)

- Full clinician browser workflows -- deferred; clinicians do not receive browser access in Phase 9.
- Unified cross-module alert center -- deferred; use home plus module-local alerts in this phase.
- Structured owner correction requests or support-case workflows -- deferred; owners escalate to clinic contact instead.
- Browser-first barcode scanning or replacing on-the-floor mobile inventory work -- deferred; scanning remains mobile-first.
</user_constraints>

---

## Summary

Phase 9 is not a greenfield build. It is a second client surface (`apps/web`, currently a 5-file Next.js stub) layered onto an already-implemented Fastify/Prisma backend, plus one genuinely new security domain: a public, unauthenticated, tokenised owner portal. Everything the dashboard needs — Socket.IO with JWT handshake and `clinic:{id}` rooms, TanStack Query v5, Zustand v5, `@fastify/rate-limit`, `@fastify/cookie`, RBAC with permission overrides, `packages/ui` design tokens already exported as CSS custom properties at `packages/ui/src/theme/portal.css` — already exists in the repo. **No new runtime dependency is required for the dashboard at all.** The owner portal needs only a CSV library and (optionally) a Lighthouse CI budget runner.

The real difficulty is upstream. Phase 9's stated scope covers "queue, inventory, scheduling, billing, and user management" in the browser plus owner invoices, payments, and next-appointment dates. Verified against `apps/api/prisma/schema.prisma` and against the live dev database: **inventory (Phase 5), billing/invoices (Phase 6), WhatsApp (Phase 7), and appointments (Phase 8) have no models, no code, and no schema.** Phase 8 has no planning directory at all — `.planning/phases/08-scheduling-calendar/` has never existed in git history, yet `09-CONTEXT.md` lists `08-CONTEXT.md` as a mandatory canonical reference and `ROADMAP.md` lists seven Phase 8 plan files that do not exist. Worse, the live dev database contains **only the 14 Phase 1 tables** — Phase 3 and Phase 4 models (`pets`, `pet_owners`, `queue_entries`, `consultations`, …) exist in `schema.prisma` and in `.ts` code but have never been applied to any database and have no migration files.

The four convention mismatches raised in the review brief are all **CONFIRMED**, and there is a fifth. The correct targets are `packages/types` + `packages/validators` (not `packages/shared`), `prisma migrate dev` (not `db push`), flat `<name>.service.ts` module files (not `services/` subdirectories), formally-defined `OWN-01`..`OWN-07` entries in `REQUIREMENTS.md`, and a repaired RLS/tenant-context layer that Phase 9's own `OWN-06` isolation guarantee depends on.

**Primary recommendation:** Plan Phase 9 in two clearly separated tiers. Tier A (plannable and executable today): repair the schema/migration/RLS foundation, add the browser-access-policy and magic-link data model, build the Next.js dashboard shell + cockpit + user management + queue board against Phase 3/4 data that already exists, and build the owner portal records + care-dates surfaces against the already-implemented `vaccination` and `emr` modules. Tier B (must be explicitly gated behind Phase 5/6/8 landing): browser inventory workbench, browser billing workbench, browser scheduling, owner invoices, and owner combined checkout. Do not write Tier B plans that assume `Invoice`, `StockBatch`, or `Appointment` models exist — either descope them from Phase 9 or make each one a `checkpoint:human-verify` gated plan whose first task asserts the upstream model exists.

---

## Blocking Findings

These are ordered by how badly they break planning. Each verdict is empirical.

### BF-1: Live database contains only Phase 1 tables — Phase 3/4 schema was never applied [VERIFIED: psql against `breeyo-postgres-1`]

```
TABLES: _prisma_migrations auth_audit_log clinic_member_roles clinic_members clinics
        consent_records device_tokens notifications permissions refresh_tokens
        role_permissions roles user_permission_overrides users
```

`apps/api/prisma/migrations/` contains exactly two migrations (`20260802111747_init`, `20260802162311_add_consent_records`) covering only Phase 1 + consent. `prisma migrate status` reports "Database schema is up to date!" because both applied migrations are recorded — it does **not** detect that `schema.prisma` has ~15 additional models. `prisma migrate diff --from-migrations … --to-schema-datamodel …` emits `CREATE TYPE "Species"`, `CREATE TYPE "QueueEntryStatus"`, and the full Phase 3/4 table set, confirming the drift.

Consequence: **`prisma migrate dev` in Phase 9 will detect drift and offer to reset the database.** Running it naively wipes the dev DB. Also `@prisma/client` is not currently generated locally (`Cannot find module '.prisma/client/default'`), so API tests cannot run as-is.

**Recommended plan task (Wave 1, first):** baseline the missing history rather than reset.
1. `pnpm --filter @breeyo/api db:generate`
2. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_baseline_phase_03_04/migration.sql` (review by hand)
3. `npx prisma migrate resolve --applied <that migration>` **only if** a DB already has those tables; otherwise `npx prisma migrate deploy` applies it cleanly to the empty dev DB.
4. Then, and only then, `npx prisma migrate dev --name add_web_dashboard_and_owner_portal` for Phase 9's own models.
5. Re-run `apps/api/prisma/post-migrate.sql` and the `prisma/rls/*.sql` files.

Flag this as a `checkpoint:human-verify` task — destructive-adjacent DB work should not run unattended.

### BF-2: Phase 8 (Scheduling & Calendar) has never been planned; Phase 5/6/7 are planned but unimplemented [VERIFIED: `ls .planning/phases/`, `git log --all -- '.planning/phases/08*'` returns nothing]

| Phase | CONTEXT | Plans | Code | DB models |
|-------|---------|-------|------|-----------|
| 05 Inventory | yes | 8 plans | none | none |
| 06 Invoicing | yes | **none** | `billing/service-catalog-seed.ts` only | `ServiceCatalog` only |
| 07 WhatsApp | yes | **none** | none | none |
| 08 Scheduling | **none** | **none** | none | none |

`09-CONTEXT.md` line 149 instructs downstream agents to read `.planning/phases/08-scheduling-calendar/08-CONTEXT.md`. That file does not exist. `ROADMAP.md` lines 236-259 list `08-01-PLAN.md` … `08-07-PLAN.md` as if they exist.

Consequence: Phase 9's "next scheduled appointment" (OWN-07, ROADMAP SC-4), browser scheduling panel (SC-2), browser billing workbench, owner invoices (OWN-02), owner payment (OWN-03), and browser inventory (SC-2) all depend on models that do not exist and whose shape is not even decided (Phase 8 has no decisions at all). Phase 6's decisions *are* locked (D-01..D-29 in `06-CONTEXT.md`) so invoice semantics are known even though no schema exists; Phase 8's are entirely unknown.

**Recommendation:** Do not invent an `Appointment` model in Phase 9. Two acceptable planning shapes, planner picks one and states it explicitly:
- **(a) Descope + defer:** Phase 9 delivers dashboard shell, cockpit, user management, browser queue, browser access policy, owner portal records + care dates (vaccination/deworming only, appointment slot rendered as an empty state), and the magic-link/session/security foundation. Owner invoices, checkout, browser billing, browser inventory, and browser scheduling move to a Phase 9b after 5/6/8 land. This is the honest option and it still satisfies PLT-02, OWN-01, OWN-04, OWN-05, OWN-06, and OWN-07-partial.
- **(b) Contract-first with hard gates:** Phase 9 defines the read-model contracts it needs from Phase 5/6/8 in `packages/types`, and every plan that touches invoices/stock/appointments opens with a `checkpoint:human-verify` task asserting the upstream Prisma model exists. Higher risk; only viable if Phases 5/6/8 will be executed before Phase 9 execution.

Either way the ROADMAP dependency line ("Depends on: Phase 8") must be respected, not papered over.

### BF-3: `OWN-01`..`OWN-07` are referenced everywhere but defined nowhere [VERIFIED: grep across `.planning/`]

`ROADMAP.md` assigns nine requirement IDs to Phase 9. `REQUIREMENTS.md` defines only `PLT-01` and `PLT-02`. Counting empirically:

- v1 requirement bullets in the body: **60**
- Traceability data rows: **59**
- `ONB-02` is in the body but **missing from the traceability table**
- Header claims "59 total, 59 mapped, 0 unmapped" — wrong on both the body count and on the seven undefined `OWN-` IDs

Broader (out of Phase 9 scope but worth a note): `STATE.md` also references `NTF-01`, `NTF-02`, `RPT-01`, `INV-09`, `PAT-06`, `ONB-01`, and `PLT-06`, none of which exist in `REQUIREMENTS.md` either.

Proposed wording for the seven missing entries appears in `## Phase Requirements` below. These are **inferred strictly** from `ROADMAP.md` Phase 9 success criteria, `09-CONTEXT.md` D-01..D-81, and the `OWN-` cross-references already present in `02-UI-SPEC.md` (which maps OWN-01→portal layout/branding/trust, OWN-02→invoice list copy, OWN-03→Razorpay SDK, OWN-04→expired link + reissue, OWN-05→3s FCP on 4G / mobile-web perf, OWN-06→owner-scoped data + invalid link). No new scope was added. A human should approve the wording before it is committed to `REQUIREMENTS.md`.

### BF-4: RLS is configured but effectively not enforced, and the enforcement helper is broken [VERIFIED: code read + live `pg_policies`]

Three separate defects, all of which land directly on `OWN-06` ("strict data isolation, 403 on token mismatch"):

1. **`request.db` is never consumed.** `tenant-context.ts:22` sets `request.db = createTenantClient(clinicId)`, and grep shows exactly one reference to `request.db` in the entire codebase — that assignment. Every module builds its repository from `fastify.prisma` at plugin-registration time (`queue.routes.ts:9`, `vaccination.routes.ts:9`, `emr.routes.ts:11`, `patient.routes.ts:9`, …), i.e. the **admin** client with `DATABASE_URL` (`breeyo_admin`, table owner, RLS-exempt). Tenant isolation today rests entirely on hand-written `where: { clinicId }` clauses.
2. **`createTenantClient` cannot work as written.** `prisma-rls.ts` issues `SET LOCAL app.clinic_id = '…'` from a `$extends` `$allOperations` hook. `SET LOCAL` outside an explicit transaction block has no effect in PostgreSQL, and the hook runs the raw statement as a separate pooled query from the one it is trying to scope. It also string-interpolates `clinicId` into raw SQL, and it constructs a **new `PrismaClient` per request** (connection-pool exhaustion under any real load).
3. **Setting-name mismatch.** `post-migrate.sql` and `prisma-rls.ts` use `app.clinic_id`; `prisma/rls/phase-03-patient-queue-rls.sql` uses `app.current_clinic_id`. Live `pg_policies` confirms only the `app.clinic_id` policies exist (on `clinic_members`, `auth_audit_log`, `notifications`) because the Phase 3 RLS file was never run. When it *is* run, those policies will match a setting nothing ever sets → `breeyo_app` sees zero rows from `pets`/`pet_owners`/`queue_entries`.

**Recommendation (one Wave 1 plan):** normalise on `app.clinic_id`; replace `createTenantClient` with the documented interactive-transaction pattern using parameterised `set_config`; make module routes accept the per-request client. See `## Code Examples` → *Tenant-scoped Prisma client (corrected)*.

### BF-5: The owner portal cannot use `authenticate` or `tenantContext` — a third auth path is required

Portal requests carry no JWT, so `authenticate` (which calls `request.jwtVerify()`) 401s, and `tenantContext` (which reads `request.user.activeClinicId`) 400s. Socket.IO's handshake middleware also hard-requires a JWT (`socket.ts:37`), so **the owner portal must not use Socket.IO at all** — portal freshness comes from server rendering plus refetch-on-focus.

Phase 9 must add a `portalContext` preHandler that: resolves the hashed link token → `{ clinicId, petOwnerId, allowedPetIds, allowedInvoiceIds, linkState }`, builds the tenant-scoped client for that clinic, and attaches the scope to the request. Every portal repository query must filter on `clinicId` **and** `ownerId` **and** `petId IN allowedPetIds`. This is a genuinely new module-level concern, not a variation on existing middleware.

---

<phase_requirements>
## Phase Requirements

### Defined today

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|-----------------------------------|------------------|
| PLT-01 | Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo | Already satisfied by `apps/mobile` (Expo SDK 52, RN 0.76.9) from Phases 1-4. Phase 9 adds no mobile work; treat as a verification-only requirement (`expo doctor` + a device/emulator smoke check). Do **not** let this ID pull mobile scope into Phase 9. |
| PLT-02 | Web dashboard accessible via modern browsers (Chrome, Safari, Firefox) | `apps/web` exists as a Next.js 15.5.22 stub (`app/layout.tsx`, `app/page.tsx`, `src/lib/api.ts`). Next 15 default browser targets cover Chrome/Safari/Firefox current-2. Verification is a manual cross-browser pass plus a `next build` gate. |

### Missing — proposed wording for `REQUIREMENTS.md` (needs human approval before commit)

Derived only from `ROADMAP.md` Phase 9 success criteria 4 and 5, `09-CONTEXT.md` D-46..D-81, and the existing `OWN-` cross-references in `02-UI-SPEC.md`. Insert as a new `### Owner Portal` group in the v1 Requirements body **and** as seven rows in the Traceability table mapped to Phase 9.

| ID | Proposed wording | Grounding | Research Support |
|----|-----------------|-----------|------------------|
| OWN-01 | Pet owner can open a tokenised magic link from WhatsApp and view their pet's clinical record history — diagnosis and prescriptions only — in a mobile-responsive web portal, with no login and no app install | ROADMAP SC-4; 09-CONTEXT D-46, D-49, D-57, D-61, D-73..D-77; 02-UI-SPEC OWN-01 (portal layout, clinic branding for trust, spacious density) | `emr` module + `Consultation.assessment` and `Prescription` already exist. Read-model projection pattern in `## Code Examples`. |
| OWN-02 | Pet owner can view their pet's past invoices with status (paid / unpaid / overdue / processing) and open an invoice detail view with receipt and PDF access | ROADMAP SC-4; 09-CONTEXT D-51, D-54, D-55, D-59; 02-UI-SPEC OWN-02 invoice copy + `StatusBadge` variants | **Blocked on Phase 6** — no `Invoice` model exists. Semantics fully specified by `06-CONTEXT.md` D-14..D-27. |
| OWN-03 | Pet owner can pay an outstanding balance via UPI or card through Razorpay from the portal, including one combined checkout across multiple invoices, and sees an explicit success or failure return state with receipt access | ROADMAP SC-4; 09-CONTEXT D-66, D-69..D-72; 06-CONTEXT D-09, D-27; 02-UI-SPEC OWN-03 (Razorpay SDK async-loaded) | **Blocked on Phase 6.** Idempotency design in `## Don't Hand-Roll` and `## Code Examples`. |
| OWN-04 | Magic links are valid for 7 days; an expired link renders a dedicated expired state with a self-service "Request New Link" action that reissues the link over WhatsApp | 09-CONTEXT D-64, D-67; 09-UI-SPEC expired-link + trust-banner rows; 02-UI-SPEC OWN-04 "Links are valid for 7 days" | Reissue path depends on **Phase 7** WhatsApp pipeline; a provider-abstraction stub is an acceptable Phase 9 seam (07-CONTEXT already mandates a swappable abstraction). |
| OWN-05 | Owner portal is mobile-first responsive (320px min) and reaches first contentful paint under 3 seconds on a 4G connection | 02-UI-SPEC lines 40, 424 ("Total FCP target: < 3 seconds on 4G (OWN-05)"), 691 (no shadcn, purpose-built HTML/CSS, Razorpay SDK lazy) | Achievable via Next.js server components + `packages/ui/src/theme/portal.css` custom properties. Measure with `@lhci/cli`. |
| OWN-06 | Owner portal enforces strict data isolation — an owner sees only their own pets and invoices; a mismatched, tampered, revoked, or cross-clinic token returns 403 with no data in the response body | ROADMAP SC-5; 09-UI-SPEC "Invalid" state row; 02-UI-SPEC line 54 ("Owner's pets and invoices only (OWN-06)") | **Depends on BF-4 and BF-5 being fixed.** Needs a dedicated integration test suite modelled on `apps/api/tests/tenant-isolation.test.ts`. |
| OWN-07 | Owner portal shows upcoming care dates per pet — vaccination due dates, deworming due dates, and the next scheduled appointment | ROADMAP SC-4 ("upcoming vaccination/deworming due dates, next scheduled appointment"); STATE.md line 97 ("09-07 covers OWN-07 (upcoming care dates on owner portal)") | Vaccination/deworming half is **buildable today** — see `## Reusable Assets`. Next-appointment half is **blocked on Phase 8**. |

Coverage after the edit: 67 v1 requirements, 67 mapped (also adds the missing `ONB-02` traceability row), 0 unmapped.
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Actionable directives extracted from `./CLAUDE.md`. Treat with the same authority as locked CONTEXT decisions.

| # | Directive | Phase 9 implication |
|---|-----------|--------------------|
| C-01 | API module structure: `modules/<name>/` with controller, service, routes, schema | Old plans used `modules/<name>/services/*.ts` + `controllers/*.ts` subdirectories. **Actual code uses flat prefixed files** (`queue.service.ts`, `queue.controller.ts`, `queue.routes.ts`, `queue.schema.ts`, `queue.repository.ts`, `queue.types.ts`, `__tests__/`). Follow the code, not the loose CLAUDE.md phrasing. |
| C-02 | Routes registered via `app.register()` with `/api/v1` prefix | New routes go in `apps/api/src/app.ts` after the Phase 4 block. Portal routes must be registered with an explicit tighter `config.rateLimit`. |
| C-03 | Use `@fastify/jwt` with `authenticate` and `authorize` middleware | Applies to dashboard routes. **Cannot apply to portal routes** — see BF-5. |
| C-04 | RLS enforced at database level via `prisma-rls.ts` — always set tenant context | Currently aspirational, not real. See BF-4. Phase 9 should make it real for its own tables at minimum. |
| C-05 | Error handling via centralized `error-handler.ts` | Portal 403/410 responses must flow through it. Note it currently collapses all `>=500` to a generic message and has a special 429 branch — a 409 conflict branch is **not** present and does not need one (the generic `<500` path already forwards `code`/`message`). |
| C-06 | Rate limiting: 200/min global, 20/min on auth endpoints | Portal public endpoints need their own stricter per-route config; reissue needs a per-owner daily cap. |
| C-07 | All Prisma columns `snake_case` via `@map()`, TypeScript `camelCase` | Every new Phase 9 model must follow this exactly (see existing models for the pattern). |
| C-08 | UUIDs generated by PostgreSQL (`gen_random_uuid()`) | Use `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`. |
| C-09 | Audit logging via `audit-log.ts` for auth events | Extend the `AuditEvent` enum with Phase 9 events. Note the model is `AuthAuditLog` (`auth_audit_log`), not `AuditLog`. |
| C-10 | Mobile: Expo Router, `expo-secure-store`, `@breeyo/validators` for forms | Phase 9 adds no mobile work. |
| C-11 | UI: atomic design, tokens in `src/theme/`, primary `#2E7D32`, background `#FFFBF5`, i18n via i18next | Web must consume the generated `portal.css` custom properties, not re-declare hex values. |
| C-12 | TypeScript strict mode; ESM (`"type": "module"` in API); Zod for all request/response validation | New API files use `.js` extensions in relative imports (ESM), matching existing code. |
| C-13 | Commit format `feat\|fix\|chore\|docs(phase-NN): description`; branch `breeyo/phase-NN-description` | Phase 9 branch: `breeyo/phase-09-web-dashboard-owner-portal`. |
| C-14 | Never commit `.env` files | Portal/Razorpay secrets go to `.env.example` only. |
| C-15 | Testing: Vitest everywhere; API tests use `supertest` with `buildApp({ logger: false })`; Faker for data | `apps/web` currently has `"test": "echo 'no web tests yet'"` — Wave 0 must fix this. |
| C-16 | Two DB roles: `breeyo_admin` (migrations), `breeyo_app` (RLS queries) | Portal queries in particular should run as `breeyo_app`. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Magic-link token → session exchange | Frontend Server (Next.js Route Handler) | API (validates hash, returns opaque session token) | The exchange must set a first-party HttpOnly cookie on the portal origin and redirect to a token-free URL. Only the Next.js server can set a same-origin cookie for the portal domain; `cookies().set()` is only legal in a Route Handler or Server Function [CITED: nextjs.org/docs/app/api-reference/functions/cookies]. |
| Portal records / care-dates / invoices read | API | Frontend Server (server-component fetch for SSR) | Authoritative scoping must be server-side (OWN-06). SSR fetch keeps FCP under the OWN-05 budget by shipping HTML with data rather than a client waterfall. |
| Portal payment initiation | API | Browser (redirect to Razorpay-hosted page) | Razorpay keys and idempotency records are server-only. Browser only navigates. |
| Portal payment confirmation | API (Razorpay webhook) | Database | Never trust the browser return URL for payment truth; the webhook is authoritative (06-CONTEXT D-09/D-11). |
| Portal continuity (last tab / pet) | Frontend Server (cookie) | Database (`OwnerPortalSession` row) | D-53 requires continuity across refresh **and** across the Razorpay round-trip, which loses client state. Cookie for speed, DB row as the durable record. |
| Dashboard auth + session | Browser (in-memory access token) | API (refresh-token rotation) | Reuses the existing Phase 1 JWT + refresh flow; identical mental model to mobile. |
| Dashboard realtime sync | API (Socket.IO `clinic:{id}` rooms) | Browser (TanStack Query invalidation) | Server already emits to clinic rooms (`queue.service.ts:197`). Mirror `useQueueSocket.ts` on web verbatim. |
| Dashboard permission gating | API (authoritative allow-list per role/module) | Browser (renders only allowed modules) | D-20 requires hiding, not disabling — but the API must still 403 independently. Hiding is a UI affordance, never the control. |
| Conflict / stale-state detection | API + Database (concurrency token) | Browser (stale banner, Refresh / Review changes) | D-40. Detection must be atomic at the DB write; the UI only reports. |
| CSV / PDF analytics export | API (query + CSV bytes) | Browser (download, or print stylesheet → PDF) | D-36. Data shaping is server work; PDF can be a print stylesheet to avoid a headless-browser dependency. |
| Rate limiting + abuse control on portal | API | — | Public unauthenticated surface; the only enforcement point. |
| Portal security headers (`Referrer-Policy`, `X-Robots-Tag`, CSP) | Frontend Server (`next.config.js` headers) | — | These protect the HTML document, which Next.js serves. |
| Tenant isolation | Database (RLS) + API (repository filters) | — | Defence in depth; currently only the API half exists (BF-4). |

---

## Standard Stack

### Core — already in the repo, reuse, do not add

| Library | Version (installed) | Purpose | Why standard |
|---------|--------------------|---------|--------------|
| `next` | 15.5.22 (`^15.1.0` in `apps/web/package.json`) | Web dashboard + owner portal | Already the declared dependency. `next@15` line's latest is 15.5.23 [VERIFIED: npm registry]. |
| `react` / `react-dom` | 18.3.1 | — | Matches mobile's React 18.3.1; keep the whole workspace on one React major. |
| `@tanstack/react-query` | 5.101.4 | Server state, cache, refetch-on-focus | Already used across `apps/mobile` (`QueryProvider.tsx`, 6+ hooks). Same version keeps query-key conventions portable. |
| `zustand` | 5.0.14 | Local UI state (panel order, filters, toasts) | Already used (`queueUIStore`, `useConsultationDraft`). |
| `socket.io-client` | 4.8.3 | Dashboard realtime | Server is `socket.io@4.8.3`. Must use `transports: ['websocket']` — the server is websocket-only (`socket.ts:18`). |
| `@breeyo/types` / `@breeyo/validators` / `@breeyo/ui` | workspace | Shared contracts + tokens | `@breeyo/types` is already an `apps/web` dependency. `@breeyo/validators` and `@breeyo/ui` must be **added to `apps/web/package.json`** (currently absent). |
| `zod` | 3.24.x (via validators) | Boundary validation | Repo-wide standard. |
| `@fastify/rate-limit` | 10.2.x | Portal abuse control | Already registered globally; supports per-route override of `max`, `timeWindow`, `keyGenerator`, `ban`, `allowList` [CITED: github.com/fastify/fastify-rate-limit README]. |
| `@fastify/cookie` | 11.x | Session cookie if the API sets it directly | Already registered with `COOKIE_SECRET`. |
| `nanoid` | 5.x | Short ids | Already an API dependency. **Prefer `node:crypto` `randomBytes` for security tokens** (see pitfall P-6). |

**No new runtime dependency is required for the web dashboard.**

### Supporting — new, only if the corresponding scope survives descoping

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `papaparse` + `@types/papaparse` | 5.5.4 / 5.5.2 | CSV generation via `Papa.unparse` | Inventory analytics CSV export (D-36). Battle-tested quoting/escaping; ~50M weekly downloads. |
| `csv-stringify` | 6.8.3 | Streaming CSV alternative | Prefer over papaparse **only** if exports must stream large result sets. Do not add both. |
| `@lhci/cli` | 0.15.1 | Lighthouse CI perf budget | Enforcing the OWN-05 3s-FCP-on-4G gate in CI. Dev dependency only. |
| `vitest` | ^3.2.7 | `apps/web` test runner | Workspace already spans vitest 2.1 (api, ui, mobile) and 3.x (validators). Pick 3.x for `apps/web` — mixing 2/3 already happens and pnpm isolates them. |
| `@testing-library/react` | 16.3.2 | Component tests | Peers: `react ^18 \|\| ^19` — compatible with 18.3.1 [VERIFIED: npm registry `peerDependencies`]. |
| `@testing-library/dom` | 10.4.1 | **Required peer** of `@testing-library/react@16` | v16 declares it as a peer, so it must be installed explicitly. |
| `@testing-library/jest-dom` | 7.0.1 | DOM matchers | Optional but conventional. |
| `happy-dom` | 20.11.2 | Vitest DOM environment | Lighter and faster than jsdom for component tests. |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Plain CSS Modules + `portal.css` custom properties | Tailwind CSS | `02-UI-SPEC.md` line 48 says the portal styles with "Tailwind CSS using design tokens as CSS vars". `09-UI-SPEC.md` (later, phase-specific, approved 2026-05-07) says "use the shared Breeyo token system and manual web components", tool = `none`, shadcn explicitly declined. **The 09 spec wins.** CSS Modules add zero build config and no new dependency; Tailwind adds a PostCSS toolchain for no locked benefit. Recommend CSS Modules; if the planner chooses Tailwind, it must be justified against 09-UI-SPEC. |
| `happy-dom` | `jsdom` 30.0.1 | jsdom is more spec-complete but ~3-5x slower. Either is fine; pick one. |
| Print stylesheet → browser PDF | `pdfkit` 0.19.1 or headless Chrome | Existing repo pattern for PDFs is HTML template → platform print (`apps/mobile/src/features/pdf/*` uses `expo-print`). A web print stylesheet mirrors that with zero dependency. `pdfkit` only if pixel-exact server-side PDFs become a hard requirement. Do not add Puppeteer/Playwright for PDF — huge footprint. |
| Socket.IO for the owner portal | Nothing (SSR + refetch-on-focus) | Socket.IO handshake requires a JWT (`socket.ts:37-45`). Adding an unauthenticated namespace for the portal expands the attack surface for near-zero owner benefit. **Do not** give the portal a socket. |
| `@vitejs/plugin-react` 5.2.0 | vitest `esbuild.jsx: 'automatic'` | The plugin drags in a vite-major compatibility matrix. Vitest can transform TSX without it. Prefer no plugin; add it only if a test needs Fast Refresh semantics (they don't). |
| `@fastify/helmet` 13.1.0 | Next.js `headers()` config | Portal HTML is served by Next.js, so security headers belong there. Helmet on the API is defensible hardening but is not required by any Phase 9 requirement — out of scope. |

**Installation (only what survives scope):**

```bash
# apps/web — wire up existing workspace packages + test infra
pnpm --filter @breeyo/web add @breeyo/validators@workspace:* @breeyo/ui@workspace:* \
  @tanstack/react-query@^5.101.4 zustand@^5.0.14 socket.io-client@^4.8.3
pnpm --filter @breeyo/web add -D vitest@^3.2.7 @testing-library/react@^16.3.2 \
  @testing-library/dom@^10.4.1 @testing-library/jest-dom@^7.0.1 happy-dom@^20.11.2 \
  @types/react-dom@^18.3.0

# Only if inventory analytics export is in scope (D-36)
pnpm --filter @breeyo/api add papaparse@^5.5.4
pnpm --filter @breeyo/api add -D @types/papaparse@^5.5.2

# Only if the OWN-05 perf budget is enforced in CI
pnpm --filter @breeyo/web add -D @lhci/cli@^0.15.1
```

**Version verification performed:** `npm view <pkg> version` run for every package above on 2026-08-12. Installed versions read from `pnpm-lock.yaml`.

---

## Package Legitimacy Audit

`slopcheck 0.6.1` was available and run against every candidate new package.

| Package | Registry | Downloads | Source repo | slopcheck | Disposition |
|---------|----------|-----------|-------------|-----------|-------------|
| `papaparse` | npm 5.5.4 | very high | github.com/mholt/PapaParse | `[OK]` | Approved (conditional on D-36 scope) |
| `csv-stringify` | npm 6.8.3 | high | github.com/adaltas/node-csv | `[OK]` | Approved (alternative to papaparse, not both) |
| `@lhci/cli` | npm 0.15.1 | high | github.com/GoogleChrome/lighthouse-ci | `[OK]` | Approved (devDependency) |
| `@testing-library/react` | npm 16.3.2 | very high | github.com/testing-library/react-testing-library | `[OK]` | Approved |
| `@testing-library/dom` | npm 10.4.1 | very high | github.com/testing-library/dom-testing-library | `[OK]` | Approved (required peer) |
| `@testing-library/jest-dom` | npm 7.0.1 | very high | github.com/testing-library/jest-dom | `[OK]` | Approved |
| `happy-dom` | npm 20.11.2 | high | github.com/capricorn86/happy-dom | `[OK]` | Approved |
| `jsdom` | npm 30.0.1 | very high | github.com/jsdom/jsdom | `[OK]` | Approved (alternative to happy-dom) |
| `pdfkit` | npm 0.19.1 | high | github.com/foliojs/pdfkit | `[OK]` | Approved but **not recommended** — print stylesheet preferred |
| `@vitejs/plugin-react` | npm 5.2.0 | very high | github.com/vitejs/vite-plugin-react | `[OK]` | Approved but not recommended |
| `@fastify/helmet` | npm 13.1.0 | high | github.com/fastify/fastify-helmet | not scanned | Out of scope |

**Packages removed due to `[SLOP]`:** none.
**Packages flagged `[SUS]`:** none.

All reused packages (`next`, `react`, `@tanstack/react-query`, `zustand`, `socket.io-client`, `zod`, `nanoid`, `@fastify/*`, `@prisma/client`) are already resolved in `pnpm-lock.yaml` from prior phases and need no new legitimacy gate.

---

## Architecture Patterns

### System Architecture Diagram

Two distinct request paths. Confusing them is the single most likely architectural error in this phase.

```
 ── PATH A: CLINIC STAFF (authenticated dashboard) ─────────────────────────────

  Browser (Chrome/Safari/Firefox)
    │  1. login form → POST /api/v1/auth/login
    ▼
  Next.js client components ── access token held in memory ──┐
    │  2. TanStack Query fetch (CORS, credentials:'include') │
    ▼                                                        │
  Fastify  /api/v1/*                                         │
    │  authenticate (JWT) → tenantContext (clinic scope)      │
    │  → requirePermission(...) → browserAccessPolicy gate    │
    ▼                                                        │
  <name>.controller.ts → <name>.service.ts → <name>.repository.ts
    │                                        │
    │                                        ▼
    │                              PostgreSQL (breeyo_app + RLS)
    │  3. mutation succeeds
    ▼
  io.to(`clinic:{id}`).emit(event)  ──── websocket ──────────┘
                                          4. socket event → queryClient.invalidateQueries
                                             → inline re-render (D-42), toast only on failure (D-43)

  conflict path: repository UPDATE ... WHERE updatedAt = :expected → count 0
                 → 409 + fresh entity → StaleStateBanner (D-40)


 ── PATH B: PET OWNER (public tokenised portal, NO login, NO socket) ───────────

  WhatsApp message: https://portal.breeyo.app/v/<claimToken>
    │
    ▼
  Next.js Route Handler  GET /v/[claimToken]/route.ts        ◄── the ONLY place
    │  a. POST /api/v1/portal/session {claimToken}                the token appears
    │     ├─ hash → OwnerPortalMagicLink.tokenHash lookup
    │     ├─ EXPIRED?  → 410 → redirect /portal/expired
    │     ├─ INVALID?  → 403, empty body → redirect /portal/invalid
    │     └─ READY     → opaque portalSessionToken + scope
    │  b. cookies().set('bp_session', …, {httpOnly, secure, sameSite:'lax'})
    │  c. 303 redirect → /portal   (URL now token-free)
    ▼
  Next.js Server Components  /portal, /portal/records, /portal/invoices
    │  read bp_session cookie → forward as Authorization to Fastify
    ▼
  Fastify  /api/v1/portal/*   [portalContext preHandler, strict rate limit]
    │  resolve session → {clinicId, ownerId, allowedPetIds, allowedInvoiceIds}
    │  build tenant client for clinicId
    ▼
  portal.repository.ts  — every query filtered by clinicId AND ownerId AND petId∈allowed
    │
    ├─► Consultation + Prescription  → diagnosis/prescription-only projection (OWN-01)
    ├─► VaccinationRecord/DewormingRecord → due-date rollup (OWN-07, EXISTS TODAY)
    ├─► Appointment (Phase 8)         → next appointment (OWN-07, BLOCKED)
    └─► Invoice (Phase 6)             → invoice list/detail (OWN-02, BLOCKED)

  payment: POST /api/v1/portal/checkout {invoiceIds, Idempotency-Key}
    → re-verify scope → Razorpay Payment Link → browser navigates out
    → Razorpay webhook → Fastify → invoice status  (authoritative)
    → browser returns to /portal?payment=success|failed → PaymentResultBanner (D-71/D-72)
```

### Component Responsibilities

| File / module | Responsibility |
|---------------|----------------|
| `apps/web/next.config.js` (**new**) | `headers()` for `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow` on `/portal/:path*` and `/v/:path*`; `transpilePackages: ['@breeyo/ui']` if RN-free web entry points are imported |
| `apps/web/app/v/[token]/route.ts` (**new**) | Token → cookie exchange + redirect. The only code path that touches a raw claim token. |
| `apps/web/app/portal/**` | Portal server components; no token in any URL |
| `apps/web/app/(dashboard)/**` | Authenticated dashboard route group |
| `apps/web/src/components/app-shell/*` | `DashboardShell`, `AppSidebar`, `AppTopBar` (clinic switcher, role badge) |
| `apps/web/src/features/<domain>/{components,hooks,store}` | Mirrors `apps/mobile/src/features/<domain>/{components,hooks,screens,store}` |
| `apps/api/src/middleware/portal-context.ts` (**new**) | Portal session resolution + scope attachment (BF-5) |
| `apps/api/src/modules/owner-portal/*` | Flat files: `owner-portal.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.schema.ts`, `magic-link.service.ts`, `__tests__/` |
| `apps/api/src/modules/web-dashboard/*` | Same flat convention: `web-dashboard.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.schema.ts` |
| `apps/api/src/lib/idempotency.ts` (**new**) | Idempotency-key store/replay helper |
| `apps/api/src/lib/optimistic-lock.ts` (**new**) | `assertNotStale` helper returning a 409 with the fresh entity |
| `apps/api/src/lib/prisma-rls.ts` (**fix**) | Correct tenant-scoped client (BF-4) |
| `packages/types/src/web-dashboard.ts` (**new**) | Dashboard contracts |
| `packages/types/src/owner-portal.ts` (**new**) | Portal contracts |
| `packages/validators/src/web-dashboard.ts` (**new**) | Dashboard Zod schemas |
| `packages/validators/src/owner-portal.ts` (**new**) | Portal Zod schemas |

### Recommended file layout — corrected to actual repo convention

```
packages/types/src/
├── web-dashboard.ts          # NEW  → export * added to index.ts
├── owner-portal.ts           # NEW  → export * added to index.ts
└── constants/
    └── socket-events.ts      # EXTEND with dashboard/browser-sync events

packages/validators/src/
├── web-dashboard.ts          # NEW  → export * added to index.ts
├── owner-portal.ts           # NEW  → export * added to index.ts
└── __tests__/                # existing test dir convention

apps/api/src/
├── lib/{prisma-rls.ts(fix), audit-log.ts(extend), idempotency.ts, optimistic-lock.ts}
├── middleware/portal-context.ts
└── modules/
    ├── web-dashboard/{web-dashboard.routes|controller|service|repository|schema}.ts + __tests__/
    └── owner-portal/{owner-portal.routes|controller|service|repository|schema}.ts
                     + magic-link.service.ts + __tests__/

apps/web/
├── next.config.js                       # NEW
├── vitest.config.ts                     # NEW
├── app/
│   ├── (dashboard)/{page,queue,users,...}/page.tsx
│   ├── v/[token]/route.ts               # token exchange
│   └── portal/{page,records,invoices,expired,invalid}/...
└── src/{components/app-shell, features/<domain>/{components,hooks,store}, lib, providers}
```

**Do NOT create `packages/shared/`.** It exists only as an empty stub (a bare `node_modules/` directory, no `src`, no `package.json` in `packages/shared`), it is not in `pnpm-workspace.yaml`'s resolved set as a real package, and no phase has ever used it. `packages/types` + `packages/validators` is the convention every prior phase used, is documented in CLAUDE.md, and is already built to `dist/` and consumed by `apps/api`, `apps/mobile`, and `apps/web`.

### Pattern 1: Split-brain data access (dashboard client-fetched, portal server-rendered)

**What:** The dashboard is a client-rendered SPA-in-Next talking directly to Fastify with a bearer token. The portal is server-rendered with the session token never leaving the server.
**When to use:** Always, in this phase.
**Why:** The dashboard needs a live websocket and an in-memory access token — both client concerns. The portal needs sub-3s FCP on 4G (OWN-05) and must never expose a scope token to client JS (OWN-06). These requirements pull in opposite directions; one shared data layer would compromise both.

### Pattern 2: Claim-token exchange with token-free onward URLs

**What:** `/v/{claimToken}` is consumed once per browser session by a server Route Handler, which sets an HttpOnly cookie and 303-redirects to `/portal`. Every subsequent URL, browser-history entry, `Referer` header, and analytics beacon is token-free.
**When to use:** Any portal entry point, including deep links (`/v/{token}?to=invoice&id=…` → redirect to `/portal/invoices/{id}`), satisfying D-60 and D-63.
**Why:** Path and query strings routinely reach CDNs, WAFs, server logs, and third parties via `Referer` [CITED: ntanalyzer.com/blog/leaky-urls-referrers-scripts-and-unintended-disclosure]. The standard mitigation is to consume the token immediately on landing, before any redirect, then create a session and redirect [CITED: guptadeepak.com/mastering-magic-link-security-a-deep-dive-for-developers].

**Important honest caveat:** the canonical magic-link guidance also says *invalidate the token immediately to prevent reuse*. **OWN-04 / D-64 forbid that here** — a WhatsApp link must stay clickable for 7 days because owners re-open old messages. So the claim token is multi-use within its window by design. Compensating controls, which the planner must include:
- session cookie lifetime much shorter than the link (recommend 60-minute sliding window, hard-capped at `link.expiresAt`)
- `useCount` and `lastUsedAt` on the link row, with an absolute use cap (recommend 50) and an anomaly audit event
- `Referrer-Policy: no-referrer` + `X-Robots-Tag: noindex, nofollow` on `/v/*` and `/portal/*`
- 256-bit token, SHA-256 stored, never logged, never rendered in HTML
- per-IP rate limit on the exchange endpoint; per-owner daily cap on reissue

### Pattern 3: Optimistic concurrency via conditional update

**What:** Client sends the `updatedAt` it last read; the repository issues `updateMany({ where: { id, clinicId, updatedAt: expected } })` and treats `count === 0` as a conflict.
**When to use:** Every dashboard mutation on a record that mobile can also edit — queue status, invoice edits, stock adjustments.
**Why:** "When using `updateMany`, you can include a version field in the where clause… If the count returned equals zero, a conflict has occurred" [CITED: prisma.io/docs/orm/prisma-client/queries/transactions — Optimistic concurrency control]. This turns D-40's vague "staleVersion" metadata into a real atomic guarantee. See the pitfall about millisecond precision (P-4).

### Pattern 4: Server-authoritative module visibility

**What:** `GET /api/v1/dashboard/access` returns `{ modules: [{ id, canView, canManage }] }` derived from role + `ClinicBrowserAccessPolicy`. The sidebar renders only `canView` modules; every route independently enforces via `requirePermission` plus a browser-access gate.
**When to use:** All dashboard navigation and all dashboard mutations.
**Why:** D-20 says hide, not lock. Hiding is presentation; it is never authorisation. Front Desk browser access defaults **off** (D-16), inventory is view-only for Front Desk (D-18), and refunds/voids stay Admin-only (D-22) — all three must hold even if the client is tampered with.

### Anti-patterns to avoid

- **Creating `packages/shared/`** — breaks the established two-package contract layout and the barrel-file convention.
- **`prisma db push` as a plan task** — the repo has real migration history and every Phase 1/3/4/5 plan used `prisma migrate dev --name <snake_case>`. Only the (discarded) Phase 9 and Phase 10 plans used `db push`.
- **`modules/<name>/services/*.ts` + `controllers/*.ts` subdirectories** — no existing module does this. Ten modules use flat prefixed files.
- **Giving the owner portal a Socket.IO connection** — requires weakening the JWT-only handshake.
- **Treating the Razorpay browser return URL as payment truth** — only the webhook is authoritative (06-CONTEXT D-09/D-11).
- **Re-declaring design tokens in web CSS** — consume the generated `packages/ui/src/theme/portal.css` custom properties; regenerate with `pnpm --filter @breeyo/ui generate:css-tokens`.
- **Inventing an `Appointment` model in Phase 9** — Phase 8 owns it and has made zero decisions.
- **Adding a second component system for web** — 09-UI-SPEC bans it explicitly (shadcn declined, tool = `none`).
- **A single global rate limit for portal endpoints** — the 200/min global limit is far too permissive for an unauthenticated token-guessing surface.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| CSV escaping for analytics export | Manual `join(',')` + quote logic | `papaparse` `Papa.unparse` | Embedded commas, quotes, newlines, `\r\n` for Excel, BOM for Devanagari clinic names, leading `=`/`+`/`-` CSV-injection guarding. All classic silent-corruption bugs. |
| Cryptographic token generation | `Math.random`, timestamps, `nanoid` for security tokens | `node:crypto` `randomBytes(32).toString('base64url')` | 256 bits from a CSPRNG. `nanoid` is fine for ids, but security tokens should come from `crypto` explicitly and auditably. |
| Token comparison | `===` on raw tokens fetched by raw value | SHA-256 hash + indexed unique lookup on the hash | Removes timing-attack surface and means a DB dump never yields usable links. Mirrors the existing `RefreshToken.tokenHash` pattern. |
| Payment idempotency | "check then insert" | `IdempotencyKey` table with a UNIQUE constraint + replay of the stored response; `X-Refund-Idempotency` header for Razorpay refunds | Razorpay documents idempotency for Normal and Instant Refunds only. The Payment Links create API has **no documented idempotency support**, so application-level dedupe is mandatory. `409 Conflict` means "prior request still processing — retry" [CITED: razorpay.com/docs/api/refunds/, razorpay.com/docs/api/x/payout-idempotency/]. |
| Optimistic locking | Ad-hoc `staleVersion` field with no enforcement | Conditional `updateMany` on `updatedAt` (or an explicit `version Int`) and check `count` | The old plan's "staleVersion metadata field" detects nothing. Atomicity must live in the WHERE clause. |
| Rate limiting portal routes | Custom Redis counters | `@fastify/rate-limit` per-route `config.rateLimit` with `keyGenerator` | Already installed, already Redis-backed via `app.redis`, supports per-route override and `ban`. |
| Security headers | Custom middleware | Next.js `headers()` in `next.config.js` | First-class config, exact shape verified [CITED: nextjs.org/docs/app/api-reference/config/next-config-js/headers]. |
| PDF generation | Headless Chrome / Puppeteer | Print stylesheet (`@media print`) or `pdfkit` if truly needed | Repo precedent is HTML template → platform print (`apps/mobile/src/features/pdf/*` + `expo-print`). Puppeteer adds ~300MB and a browser lifecycle to the API. |
| Cross-tab / cross-device sync | Polling loops | Existing Socket.IO `clinic:{id}` rooms + `queryClient.invalidateQueries` | The server already emits; `useQueueSocket.ts` is a working reference implementation to port. |
| Date/currency formatting for INR | Manual string building | `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` | Native, zero dependency, correct lakh/crore grouping. |
| Tenant scoping | Hoping RLS covers it | Explicit repository filters **and** RLS policies | BF-4: RLS is currently not exercised at all. Defence in depth or nothing. |

**Key insight:** Every genuinely hard problem in this phase is a *security or correctness* problem — token handling, tenant scoping, concurrency, payment idempotency — and each one has a well-established solution that is cheap to adopt and expensive to get wrong by hand. The UI, by contrast, is deliberately plain: no new component system, no shadcn, no Tailwind requirement, just tokens and CSS Modules.

---

## Runtime State Inventory

Not applicable — Phase 9 is additive (new tables, new modules, new web routes), not a rename/refactor/migration. No stored data keys, live service configs, OS registrations, secret names, or build artifacts are being renamed.

The one adjacent concern is BF-1: the dev database is **behind** `schema.prisma` by ~15 models. That is a schema-application gap, handled as a Wave 1 migration-baseline task, not a rename inventory.

---

## Common Pitfalls

### P-1: `prisma migrate dev` offers to reset the database because of pre-existing drift
**What goes wrong:** An agent runs `npx prisma migrate dev --name add_owner_portal`, Prisma detects that the DB does not match migration history, prints the drift warning, and either prompts (blocking) or — with `--force`/piped input — **wipes the dev database.**
**Why it happens:** BF-1. Phase 3/4/5 plans said `migrate dev`, but the migrations were never created or committed; the live DB has only Phase 1 tables.
**How to avoid:** Baseline first (BF-1 steps), verify with `prisma migrate diff --exit-code`, only then create Phase 9's migration. Never pass `--force`, `--accept-data-loss`, or `--skip-generate` blindly.
**Warning signs:** Output containing "Drift detected", "We need to reset", or any prompt about data loss.

### P-2: RLS policies silently return zero rows after being applied
**What goes wrong:** Running `prisma/rls/phase-03-patient-queue-rls.sql` enables RLS on `pets`, `pet_owners`, `queue_entries` with policies keyed on `app.current_clinic_id` — a setting nothing ever sets. `breeyo_app` then reads zero rows from those tables and features appear "empty" rather than "broken".
**Why it happens:** BF-4 defect 3 — two different setting names in two different SQL files.
**How to avoid:** Normalise on `app.clinic_id` (the one the code actually sets and the one live policies use) before enabling any new RLS. Add an integration test that connects as `breeyo_app`, sets the context, and asserts non-empty reads plus cross-clinic empties.
**Warning signs:** Empty lists with 200 responses and no errors; tests passing because they use `fastify.prisma` (admin role) while production uses `breeyo_app`.

### P-3: `SET LOCAL` in a Prisma extension is a no-op and leaks connections
**What goes wrong:** `createTenantClient` looks like it scopes the tenant but does nothing, while creating a brand-new `PrismaClient` (and connection pool) on **every request**.
**Why it happens:** `SET LOCAL` requires an open transaction; the `$extends` hook runs its raw statement as a separate query on a possibly-different pooled connection.
**How to avoid:** Use one shared client and wrap scoped work in `$transaction` with parameterised `set_config(..., true)`. See `## Code Examples`.
**Warning signs:** `too many connections` under load; RLS tests that pass only because the admin role is in use.

### P-4: `updatedAt` as a concurrency token collides within the same millisecond
**What goes wrong:** Two writers read the same row, both compute the same expected `updatedAt`, and the second write is accepted because Prisma's default `DateTime` maps to `timestamp(3)` — millisecond precision. The conflict goes undetected.
**Why it happens:** Timestamp-based tokens are only as granular as the column.
**How to avoid:** Use `updatedAt` for low-contention records (queue status changes, panel preferences) where a same-millisecond collision is implausible. For money and stock — invoices, payments, stock batches — add an explicit `version Int @default(0)` and increment it in the same conditional update. Those models belong to Phases 5/6, so Phase 9 must record this as a required upstream field rather than retrofit it.
**Warning signs:** Two audit rows for the "same" change with identical timestamps; stock or balance drift under concurrent edits.

### P-5: The Razorpay return URL is treated as payment confirmation
**What goes wrong:** The portal marks an invoice paid on `?payment=success`, so a hand-crafted URL forges a payment, and a legitimately-paid-but-abandoned browser never reflects success.
**Why it happens:** The return URL is the most visible signal and the easiest to wire.
**How to avoid:** Return state drives **UI only** (D-71/D-72). Invoice status changes only on the verified Razorpay webhook (06-CONTEXT D-09, BIL-06). The success screen should read current server state, not the query param, and show a "confirming your payment" interstitial when the webhook has not landed yet.
**Warning signs:** Any `invoice.update({ status: 'PAID' })` reachable from a `GET` on a portal route.

### P-6: Security tokens generated with a non-cryptographic source
**What goes wrong:** A 21-character `nanoid` (already a dependency, so tempting) or a timestamp-derived id becomes the 7-day bearer of a pet's entire medical history.
**Why it happens:** `nanoid` is already imported in the API and reads as "random enough".
**How to avoid:** `crypto.randomBytes(32).toString('base64url')` for the claim token and the session token. Store SHA-256 only. Never log either.
**Warning signs:** A token in a log line, an error message, a Sentry breadcrumb, or server-rendered HTML.

### P-7: Portal endpoints inherit the 200/min global rate limit
**What goes wrong:** An unauthenticated attacker gets 200 token guesses per minute per IP against `/api/v1/portal/session`, and unlimited-ish WhatsApp reissues (which cost real money and annoy owners).
**Why it happens:** `app.ts:48` registers a global limit of 200/min; only auth routes override it (20/min).
**How to avoid:** Per-route `config.rateLimit` — exchange endpoint ~20/min per IP with `ban`; reissue endpoint tightly capped per owner per day (recommend 3/day) enforced in Redis, not just per IP.
**Warning signs:** `/portal/*` routes registered with no `config` object.

### P-8: 02-UI-SPEC and 09-UI-SPEC contradict each other on portal navigation and styling
**What goes wrong:** An implementer follows `02-UI-SPEC.md` ("NO tab bar, NO bottom navigation… single vertically-scrolling page", "Tailwind CSS") and produces a portal that violates D-57 (top-level tabs), D-58 (pet switcher), and 09-UI-SPEC's `Tool: none` design-system row.
**Why it happens:** 02-UI-SPEC (2026-04-17) predates the Phase 9 discussion (2026-05-07). Both documents are marked authoritative in their own scope.
**How to avoid:** **`09-UI-SPEC.md` wins for Phase 9 surfaces.** It is later, phase-specific, and status `approved`. Use 02-UI-SPEC only for token values, copy tone, Hindi translation notes, and the loading-state/skeleton catalogue. The planner should state this precedence explicitly in every UI plan.
**Warning signs:** A plan that references "single-page scroll" or introduces Tailwind config.

### P-9: `apps/web` cannot import `@breeyo/ui` React Native components
**What goes wrong:** `import { Button } from '@breeyo/ui'` pulls `react-native-paper` and `react-native` into a Next.js bundle and the build explodes.
**Why it happens:** `@breeyo/ui` `main` is `src/index.ts`, which barrels RN atoms/molecules/organisms.
**How to avoid:** Web imports **only** the token layer — `packages/ui/src/theme/portal.css` (or the generated CSS custom properties) — never the component barrel. If a JS token object is needed, deep-import `@breeyo/ui/src/theme/colors` style paths or add a web-safe `./theme` subpath export. Web components are purpose-built HTML/CSS per 09-UI-SPEC.
**Warning signs:** `react-native` appearing anywhere in an `apps/web` import graph or lockfile entry for web.

### P-10: Deep subpath imports of `@breeyo/types` may not resolve under webpack
**What goes wrong:** `apps/mobile` uses `import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events'` (`useQueueSocket.ts:4`). `packages/types/package.json` declares only `main: dist/index.js` and `types: dist/index.d.ts` — **no `exports` map** — so that subpath resolves against the package root (`packages/types/constants/…`), which does not exist. Metro tolerates this; webpack/Next.js may not.
**How to avoid:** In web code, import from the package root: `import { SOCKET_EVENTS } from '@breeyo/types'` (the barrel already re-exports `./constants/index.js`). Optionally add an `exports` map to `packages/types/package.json` as a small hardening task.
**Warning signs:** `Module not found: Can't resolve '@breeyo/types/constants/socket-events'` in `next build`.

### P-11: Socket.IO CORS defaults to `*` and the web origin is not in the allow-list
**What goes wrong:** `socket.ts:15` uses `process.env.CORS_ORIGIN || '*'` — permissive by default and inconsistent with the strict `fastifyCors` origin list (`WEB_URL`, `MOBILE_URL`). Meanwhile the HTTP CORS list must include the portal origin once the portal is on its own domain.
**How to avoid:** Set `CORS_ORIGIN` explicitly, add the portal origin to `fastifyCors.origin`, and document both in `.env.example`. Keep `credentials: true` (needed for the refresh cookie).
**Warning signs:** Websocket connects from any origin in a staging test; portal fetches fail CORS preflight after the domain split.

### P-12: `@prisma/client` is not generated, so nothing runs
**What goes wrong:** Tests and dev server fail with `Cannot find module '.prisma/client/default'` — verified on this machine right now.
**How to avoid:** Make `pnpm --filter @breeyo/api db:generate` the very first task of Wave 1 and a documented prerequisite in every plan that touches the API.

---

## Code Examples

### Tenant-scoped Prisma client (corrected) — replaces `createTenantClient`

```ts
// apps/api/src/lib/prisma-rls.ts  (corrected — fixes BF-4 defects 1-3)
import { PrismaClient, type Prisma } from '@prisma/client';

// ONE app-role client for the whole process, not one per request.
let appPrisma: PrismaClient | null = null;
export function getAppPrisma(): PrismaClient {
  if (!appPrisma) {
    appPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_APP });
  }
  return appPrisma;
}

/**
 * Runs `fn` inside a transaction with app.clinic_id set for that transaction only.
 * set_config(name, value, is_local = true) is the transaction-scoped, parameterisable
 * equivalent of SET LOCAL — SET LOCAL cannot take bind parameters and is a no-op
 * outside a transaction block.
 */
export async function withClinicScope<T>(
  clinicId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getAppPrisma().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
    return fn(tx);
  });
}
```
*Source: pattern derived from Prisma's documented RLS/transaction guidance; the `set_config(..., true)` form is standard PostgreSQL. Verified against the repo's own policy predicates (`current_setting('app.clinic_id', true)::uuid`) in `apps/api/prisma/post-migrate.sql`.* `[VERIFIED: repo + PostgreSQL semantics]`

### Optimistic concurrency — makes D-40 real

```ts
// apps/api/src/lib/optimistic-lock.ts
export class StaleStateError extends Error {
  statusCode = 409;
  code = 'STALE_STATE';
  constructor(public readonly current: unknown) {
    super('This record changed on another device. Refresh to see the latest version.');
  }
}

// apps/api/src/modules/queue/queue.repository.ts (excerpt)
async updateStatusIfFresh(
  clinicId: string,
  entryId: string,
  expectedUpdatedAt: Date,
  status: QueueEntryStatus,
) {
  const { count } = await this.prisma.queueEntry.updateMany({
    where: { id: entryId, clinicId, updatedAt: expectedUpdatedAt },
    data: { status },
  });

  if (count === 0) {
    const current = await this.prisma.queueEntry.findFirst({ where: { id: entryId, clinicId } });
    throw new StaleStateError(current); // → 409 → StaleStateBanner (Refresh / Review changes)
  }
  return this.prisma.queueEntry.findFirstOrThrow({ where: { id: entryId, clinicId } });
}
```
*Source: "include a version field in the where clause… If the count returned equals zero, a conflict has occurred."* `[CITED: prisma.io/docs/orm/prisma-client/queries/transactions]`

### Idempotency store for checkout / refund / void

```ts
// apps/api/src/lib/idempotency.ts
import { createHash } from 'node:crypto';

export async function runIdempotent<T>(
  prisma: PrismaClient,
  opts: { key: string; scope: string; clinicId: string | null; body: unknown },
  fn: () => Promise<T>,
): Promise<{ replayed: boolean; result: T }> {
  const requestHash = createHash('sha256').update(JSON.stringify(opts.body)).digest('hex');

  const existing = await prisma.idempotencyKey.findUnique({ where: { key: opts.key } });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      const e: any = new Error('Idempotency key reused with a different payload');
      e.statusCode = 422; e.code = 'IDEMPOTENCY_KEY_MISMATCH';
      throw e;
    }
    if (existing.status === 'IN_PROGRESS') {
      const e: any = new Error('A prior request with this key is still processing');
      e.statusCode = 409; e.code = 'IDEMPOTENCY_IN_PROGRESS'; // mirrors Razorpay 409 semantics
      throw e;
    }
    return { replayed: true, result: existing.responseJson as T };
  }

  // UNIQUE(key) makes this the atomic claim — never "check then insert".
  await prisma.idempotencyKey.create({
    data: { key: opts.key, scope: opts.scope, clinicId: opts.clinicId, requestHash, status: 'IN_PROGRESS' },
  });

  const result = await fn();
  await prisma.idempotencyKey.update({
    where: { key: opts.key },
    data: { status: 'COMPLETED', responseJson: result as any },
  });
  return { replayed: false, result };
}
```

For Razorpay **refunds**, additionally forward the provider's own key:
```
X-Refund-Idempotency: <uuid v4>   // 4-36 chars: letters, digits, hyphen, underscore, space
```
Retries must reuse the same key **and** the same request body; a 409 means the prior request is still processing and may be retried. `[CITED: razorpay.com/docs/api/refunds/, razorpay.com/docs/api/x/payout-idempotency/]`
Payment Links creation has **no documented idempotency header** — rely on the table above. `[ASSUMED — absence of documentation, not a documented absence]`

### Magic-link claim-token exchange (Next.js 15 Route Handler)

```ts
// apps/web/app/v/[token]/route.ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },   // params is a Promise in Next 15+
) {
  const { token } = await params;
  const to = new URL(req.url).searchParams.get('to'); // deep-link target (D-60)

  const res = await fetch(`${process.env.API_INTERNAL_URL}/api/v1/portal/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimToken: token }),
    cache: 'no-store',
  });

  if (res.status === 410) redirect('/portal/expired');   // OWN-04, D-64
  if (!res.ok) redirect('/portal/invalid');              // OWN-06 — no data, no retry CTA

  const { sessionToken, expiresAt } = await res.json();

  // cookies().set is only legal in a Route Handler or Server Function.
  (await cookies()).set('bp_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });

  redirect(to ? `/portal/${to}` : '/portal');            // URL is now token-free
}
```
*`cookies()` is async from `v15.0.0-RC` onward; `.set` may only be called in a Server Function or Route Handler.* `[CITED: nextjs.org/docs/app/api-reference/functions/cookies]`

### Portal security headers

```js
// apps/web/next.config.js
const portalHeaders = [
  { key: 'Referrer-Policy',       value: 'no-referrer' },
  { key: 'X-Robots-Tag',          value: 'noindex, nofollow, noarchive' },
  { key: 'X-Content-Type-Options',value: 'nosniff' },
  { key: 'X-Frame-Options',       value: 'DENY' },
  { key: 'Cache-Control',         value: 'no-store, max-age=0' },
];

module.exports = {
  async headers() {
    return [
      { source: '/v/:path*',      headers: portalHeaders },
      { source: '/portal/:path*', headers: portalHeaders },
    ];
  },
};
```
*Exact `headers()` shape (`source` + `headers[{key,value}]`, `:path*` wildcard matching) verified against current docs.* `[CITED: nextjs.org/docs/app/api-reference/config/next-config-js/headers]`

### Portal route registration with hardened rate limits

```ts
// apps/api/src/app.ts (addition, after the Phase 4 block)
const isTest = process.env.NODE_ENV === 'test';

await app.register(import('./modules/owner-portal/owner-portal.routes.js'), {
  prefix: '/api/v1',
  config: {
    rateLimit: {
      max: isTest ? 10000 : 20,
      timeWindow: '1 minute',
      ban: 3,                                     // hard-block repeat offenders
      keyGenerator: (req) => req.ip,              // no user id exists on this surface
    },
  },
});

await app.register(import('./modules/web-dashboard/web-dashboard.routes.js'), { prefix: '/api/v1' });
```
*Per-route override of `max`, `timeWindow`, `keyGenerator`, `ban`, `allowList` is supported.* `[CITED: github.com/fastify/fastify-rate-limit README]`

### Upcoming care dates — buildable today against real code

```ts
// apps/api/src/modules/owner-portal/owner-portal.service.ts (excerpt, OWN-07)
// VaccinationRepository already exposes exactly these methods (verified in
// apps/api/src/modules/vaccination/vaccination.repository.ts):
//   getOverdueVaccinations(clinicId, petId)
//   getDueSoonVaccinations(clinicId, petId, withinDays = 7)
//   getLatestDeworming(clinicId, petId)
//   getVaccinationRecords / getDewormingRecords(clinicId, petId)

async getUpcomingCare(clinicId: string, petId: string) {
  const [overdue, dueSoon, lastDeworming] = await Promise.all([
    this.vaccinations.getOverdueVaccinations(clinicId, petId),
    this.vaccinations.getDueSoonVaccinations(clinicId, petId, 60), // portal shows a wider window than clinic alerts
    this.vaccinations.getLatestDeworming(clinicId, petId),
  ]);

  return {
    vaccinationsOverdue: overdue,                            // {vaccineName, nextDueDate}[]
    vaccinationsDueSoon: dueSoon,
    dewormingNextDue: lastDeworming?.nextDueDate ?? null,
    nextAppointment: null, // BLOCKED on Phase 8 — render an explicit empty state, do not fabricate
  };
}
```
`[VERIFIED: apps/api/src/modules/vaccination/vaccination.repository.ts]`

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|--------------|------------------|--------------|---------------------|
| `cookies()` / `headers()` synchronous | Async, must be awaited | Next `15.0.0-RC` | Every Route Handler / Server Component reading cookies must `await cookies()`. Sync access still works in 15 but is deprecated. `[CITED: nextjs.org]` |
| Dynamic route `params` as a plain object | `params` is a `Promise` in App Router | Next 15 | `const { token } = await params`. |
| Next.js 15 as "current" | Next **16.3.0** is `latest`; the 15 line is at 15.5.23 | Next 16 released before Aug 2026 | `apps/web` declares `^15.1.0` and resolves 15.5.22. **Stay on 15.x for Phase 9.** A React 19 / Next 16 upgrade is a separate migration and would desync from mobile's React 18.3.1. `[VERIFIED: npm registry]` |
| Prisma `$queryRaw` string interpolation for tenant context | Parameterised `set_config(name, value, true)` inside `$transaction` | long-standing best practice | Fixes both the injection surface and the no-op `SET LOCAL` bug in `prisma-rls.ts`. |
| Magic link consumed once, invalidated immediately | Still the general best practice | — | **Deliberately not adopted here**: OWN-04/D-64 require 7-day reusable links. Compensate with short sessions, use caps, and referrer/robots headers. Document the deviation. |
| shadcn/ui as the default web component choice | Explicitly declined for this project | 09-UI-SPEC, 2026-05-07 | Purpose-built HTML/CSS on Breeyo tokens. Do not reintroduce. |
| Tailwind for the portal (02-UI-SPEC) | Token system + manual components (09-UI-SPEC) | 2026-05-07 supersedes 2026-04-17 | See pitfall P-8. |

**Deprecated / outdated in this repo's own docs:**
- `09-CONTEXT.md` "Existing Code Insights" says *"No application source code exists yet… the repo is still planning-only"* and cites `.planning/intel/codebase-map.md`. **This is stale.** Phases 1-4 are implemented: 10 API modules, 26 UI components, ~170 tests, `apps/mobile` with 7 feature areas. The planner must treat the actual code as the source of truth and ignore this section of CONTEXT.
- `09-CONTEXT.md` line 134 says Phase 9 requirements are "`PLT-01`, `PLT-02`, and `OWN-01` through `OWN-06`" — ROADMAP says OWN-01 through **OWN-07**. Use ROADMAP's nine IDs.
- `09-CONTEXT.md` line 149 points at `08-CONTEXT.md`, which does not exist (BF-2).

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | The seven proposed `OWN-01`..`OWN-07` wordings match user intent | Phase Requirements | Phase 9 builds to the wrong acceptance criteria. **Get human approval before committing to `REQUIREMENTS.md`.** |
| A2 | Descoping invoice/inventory/scheduling browser modules (option a in BF-2) is acceptable rather than executing Phases 5/6/8 first | Blocking Findings | Either Phase 9 stalls at execution, or a large chunk is re-planned. **This is the single most important decision to confirm with the user.** |
| A3 | Portal will be served from a distinct origin (`portal.breeyo.app`) per 02-UI-SPEC, while the dashboard uses `WEB_URL` (:3001 in dev) | Architecture | If both share one origin, the cookie/CORS design simplifies; if split, `.env` and CORS need both origins. Confirm the deployment topology. |
| A4 | A 60-minute sliding portal session inside the 7-day link window is the right tradeoff | Pattern 2 | Too short → owners re-click links constantly; too long → longer exposure window if a device is shared. |
| A5 | Razorpay Payment Links creation has no idempotency header | Don't Hand-Roll | If it does exist, we build app-level dedupe we could have delegated. App-level dedupe is still correct defensively, so the downside is small. Documentation searched but not found. |
| A6 | CSS Modules (not Tailwind) for web styling | Standard Stack | If the user expects Tailwind (02-UI-SPEC), styling gets rewritten. 09-UI-SPEC supports the CSS-Modules reading. |
| A7 | A print stylesheet is sufficient for the "PDF export" half of D-36 | Don't Hand-Roll | If a true server-side PDF byte stream is required, add `pdfkit` and one plan task. |
| A8 | PLT-01 is verification-only in Phase 9 (no new mobile work) | Phase Requirements | If PLT-01 implies a mobile hardening pass, Phase 9 grows a mobile plan. ROADMAP SC-1 reads as a verification statement. |
| A9 | Baselining the Phase 3/4 drift into a migration (rather than resetting the dev DB) is acceptable | BF-1 | A reset would be simpler but destroys any local dev data. |
| A10 | Front Desk browser access maps onto existing `Role`/`Permission` rows rather than needing new permission codes | Pattern 4 | May need new `Permission` rows seeded (`browser.queue.manage`, etc.), adding a seed task. |

---

## Open Questions

1. **Do Phases 5, 6, and 8 get executed before Phase 9?**
   - What we know: Phase 5 has 8 plans and no code; Phase 6 and 7 have CONTEXT but no plans; Phase 8 has nothing at all. Phase 9 success criteria explicitly require browser inventory, billing, and scheduling plus owner invoices and next-appointment.
   - What's unclear: sequencing intent. ROADMAP order says 5→6→7→8→9, but Phase 9 and 10 were already planned ahead of 6, 7, 8.
   - Recommendation: **Ask the user before planning.** Default to BF-2 option (a) — descope Tier B into a follow-on — because it produces plans that can actually execute.

2. **What is Phase 8's `Appointment` model shape?**
   - What we know: OWN-07 and the browser scheduling panel need it. `08-CONTEXT.md` does not exist, so no decisions have been made — not even a status enum.
   - Recommendation: Phase 9 must not define it. Render "next appointment" as an explicit "No upcoming appointment scheduled" empty state and add a `[BLOCKED: Phase 8]` marker in the plan.

3. **One origin or two for web dashboard and owner portal?**
   - What we know: 02-UI-SPEC specifies `portal.breeyo.app/v/{token}`; dev config has a single `WEB_URL=http://localhost:3001`.
   - Recommendation: a single Next.js app with two route groups is simplest and works either way. Decide the production hostname split before writing the CORS/cookie task.

4. **Should the RLS repair be Phase 9's job or a separate hardening phase?**
   - What we know: BF-4 is pre-existing debt from Phases 1-4, but `OWN-06` ("strict data isolation, 403 on token mismatch") is a Phase 9 acceptance criterion that cannot be honestly claimed while RLS is inert.
   - Recommendation: fix it inside Phase 9 Wave 1, scoped narrowly — normalise the setting name, correct `prisma-rls.ts`, and route **portal** queries through the corrected scoped client. Migrating all ten existing modules to `request.db` is a bigger refactor and should be its own plan or phase.

5. **Is a 3-per-day reissue cap acceptable for OWN-04 self-service?**
   - What we know: D-67 makes portal-initiated reissue the primary recovery path; D-78 bounds self-service; WhatsApp sends cost money and Phase 7 is a simulator today.
   - Recommendation: 3/day per owner, then fall back to clinic contact (D-79/D-81). Confirm the number with the user.

6. **Which Phase 6 invoice fields does the portal read, given Phase 6 has no plans?**
   - What we know: `06-CONTEXT.md` D-14..D-27 fully specify invoice presentation, numbering (`INV-YYYYMM-XXXX`), statuses (Draft/Finalized/Paid/Partially Paid/Unpaid/Overdue), credit notes, and one-invoice-per-pet with combined payment links. `packages/types/src/billing.ts` currently contains only `ServiceCatalog`.
   - Recommendation: if Tier B is planned at all, Phase 9 defines a **read-only projection type** in `packages/types/src/owner-portal.ts` from those decisions, and Phase 6 is responsible for satisfying it.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | yes | v24.13.1 (CI targets 22) | — |
| pnpm | workspace | yes | 9.15.0 (matches `packageManager`) | — |
| Docker | local PG + Redis | yes | running | — |
| PostgreSQL 16 | API + tests | yes | `breeyo-postgres-1`, `postgres:16-alpine`, host :5433 | — |
| Redis 7 | rate limit, sockets, BullMQ | yes | `breeyo-redis-1`, `redis:7-alpine`, host :6379 | — |
| `apps/api/.env` | API + tests | yes | present, not committed | — |
| **Generated Prisma client** | API dev + tests | **NO** | `Cannot find module '.prisma/client/default'` | Run `pnpm --filter @breeyo/api db:generate` — Wave 1 task 1 |
| **Phase 3/4 DB schema** | any query beyond auth | **NO** | live DB has 14 Phase-1 tables only | Baseline migration per BF-1 |
| **Phase 5/6/8 models** | Tier B browser + portal scope | **NO** | not in schema, not in code, not planned (8) | Descope or hard-gate (BF-2) |
| **Phase 7 WhatsApp pipeline** | OWN-04 reissue send | **NO** | no code, no plans | Provider-abstraction stub + audit log; 07-CONTEXT already mandates a swappable abstraction |
| Razorpay account / API keys | OWN-03 | unknown | `.env` has no Razorpay vars | Test-mode keys; `06-CONTEXT` D-29 lists them as clinic settings |
| `psql` / `redis-cli` on host | manual DB inspection | no | — | `docker exec breeyo-postgres-1 psql …` works |
| `slopcheck` | package legitimacy gate | yes | 0.6.1 | — |
| `ctx7` CLI / Context7 MCP | doc lookups | **no** | not installed | Used WebFetch against official docs instead; sources cited below |
| Chrome / Lighthouse | OWN-05 perf gate | assumed present via `@lhci/cli` bundled Chrome | — | Manual DevTools throttled measurement |

**Missing with no fallback (must be resolved before or during Phase 9 execution):**
- Generated Prisma client (trivial — one command)
- Phase 3/4 schema applied to a database (BF-1)
- Phase 5/6/8 models for Tier B scope (BF-2 — requires a user decision)

**Missing with fallback:**
- Phase 7 WhatsApp send → abstraction stub + audit trail
- Razorpay keys → test-mode keys, or descope OWN-03 with Tier B

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework (API) | Vitest 2.1.x + `supertest` 7.x, `environment: 'node'`, `fileParallelism: false` |
| Config (API) | `apps/api/vitest.config.ts` — `include: ['tests/**/*.test.ts', 'src/**/*.test.ts']`, `setupFiles: ['./tests/helpers/setup.ts']`, 30s timeouts |
| Framework (validators) | Vitest 3.x — `packages/validators/vitest.config.ts` |
| Framework (web) | **none — Wave 0 gap.** `apps/web/package.json` has `"test": "echo 'no web tests yet'"` |
| Quick run (API unit) | `pnpm --filter @breeyo/api exec vitest run src/modules/<mod>/__tests__/<file>.test.ts` |
| Quick run (contracts) | `pnpm --filter @breeyo/validators test` |
| Quick run (web) | `pnpm --filter @breeyo/web test` *(after Wave 0)* |
| Full suite | `pnpm test` (turbo, `dependsOn: ['^build']`, env: `DATABASE_URL`, `DATABASE_URL_APP`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `NODE_ENV`) |
| Prerequisite | `docker compose up -d --wait` + `pnpm --filter @breeyo/api db:generate` + schema applied |

### Phase Requirements → Test Map

| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|--------------|
| PLT-02 | Web dashboard builds and serves for modern browsers | build gate | `pnpm --filter @breeyo/web build` | n/a (script exists) |
| PLT-02 | Dashboard shell renders only authorized modules (D-20) | unit (component) | `pnpm --filter @breeyo/web exec vitest run src/components/app-shell/__tests__/DashboardShell.test.tsx` | ❌ Wave 0 |
| PLT-02 | Access-policy service returns Admin=all, FrontDesk=off-by-default, Clinician=none (D-15..D-18) | unit | `pnpm --filter @breeyo/api exec vitest run src/modules/web-dashboard/__tests__/access-policy.service.test.ts` | ❌ Wave 0 |
| PLT-02 | Refund/void endpoints 403 for Front Desk (D-22) | integration | `pnpm --filter @breeyo/api exec vitest run tests/web-dashboard/browser-permissions.test.ts` | ❌ Wave 0 |
| OWN-01 | Portal records projection exposes diagnosis + prescriptions only — never SOAP free-text, internal notes, or clinician attachments | unit | `pnpm --filter @breeyo/api exec vitest run src/modules/owner-portal/__tests__/portal-records.service.test.ts` | ❌ Wave 0 |
| OWN-01 | Visit timeline renders empty / populated states (D-61) | unit (component) | `pnpm --filter @breeyo/web exec vitest run src/features/owner-portal/__tests__/visit-timeline.test.tsx` | ❌ Wave 0 |
| OWN-02 | Invoice list is pet-scoped; cross-pet selection allowed only in checkout (D-59, D-69) | unit | `… src/modules/owner-portal/__tests__/portal-invoices.service.test.ts` | ❌ Wave 0 · **Tier B** |
| OWN-03 | Combined checkout produces one payment link with a per-pet breakdown; duplicate Idempotency-Key replays rather than double-charges | integration | `pnpm --filter @breeyo/api exec vitest run tests/owner-portal/checkout-idempotency.test.ts` | ❌ Wave 0 · **Tier B** |
| OWN-04 | Link expires at exactly `issuedAt + 7d`; expired → 410 + reissue eligible; reissue creates a new hash and links lineage | unit | `… src/modules/owner-portal/__tests__/magic-link.service.test.ts` | ❌ Wave 0 |
| OWN-04 | Reissue is capped per owner per day | integration | `… tests/owner-portal/reissue-rate-limit.test.ts` | ❌ Wave 0 |
| OWN-05 | Portal route meets FCP < 3000ms on a 4G profile | perf (CI) | `pnpm --filter @breeyo/web exec lhci autorun --config=lighthouserc.owner-portal.json` | ❌ Wave 0 |
| OWN-06 | Tampered / revoked / cross-clinic token → 403 with an empty body | integration | `pnpm --filter @breeyo/api exec vitest run tests/owner-portal/portal-isolation.test.ts` | ❌ Wave 0 — model on `tests/tenant-isolation.test.ts` |
| OWN-06 | Owner A's session cannot read Owner B's pet or invoice by direct id | integration | same file | ❌ Wave 0 |
| OWN-06 | `breeyo_app` + `app.clinic_id` RLS returns own-clinic rows and zero cross-clinic rows | integration | `… tests/rls/clinic-scope.test.ts` | ❌ Wave 0 (also validates the BF-4 fix) |
| OWN-07 | Vaccination overdue / due-soon / deworming rollup per pet | unit | `… src/modules/owner-portal/__tests__/portal-care-dates.service.test.ts` | ❌ Wave 0 |
| OWN-07 | Next-appointment renders an explicit empty state while Phase 8 is absent | unit (component) | `pnpm --filter @breeyo/web exec vitest run src/features/owner-portal/__tests__/upcoming-care.test.tsx` | ❌ Wave 0 |
| D-40 | Stale `updatedAt` → 409 + fresh entity; UI shows the stale banner | unit + integration | `… src/modules/queue/__tests__/queue.repository.optimistic.test.ts` | ❌ Wave 0 |
| D-42/43 | Socket event triggers inline invalidation, not a toast | unit (hook) | `pnpm --filter @breeyo/web exec vitest run src/features/queue/__tests__/useQueueRealtime.test.ts` | ❌ Wave 0 |

### Sampling rate

- **Per task commit:** the single closest `vitest run <file>` (target < 30s) + `pnpm --filter @breeyo/api exec tsc --noEmit` for API changes
- **Per wave merge:** `pnpm --filter @breeyo/api test && pnpm --filter @breeyo/web test && pnpm --filter @breeyo/validators test`
- **Phase gate:** `pnpm test` (full turbo suite) green + `pnpm --filter @breeyo/web build` + Lighthouse budget pass, before `/gsd-verify-work`

### Wave 0 gaps

- [ ] `pnpm --filter @breeyo/api db:generate` — **blocks all API tests today**
- [ ] Baseline migration for Phase 3/4 drift + `post-migrate.sql` + `prisma/rls/*.sql` re-run (BF-1)
- [ ] `apps/web/vitest.config.ts` — `environment: 'happy-dom'`, `globals: true`, `esbuild: { jsx: 'automatic' }`, `include: ['src/**/*.test.{ts,tsx}']`
- [ ] `apps/web/package.json` — replace the `test` echo with `vitest run`; add `@breeyo/validators`, `@breeyo/ui`, `@tanstack/react-query`, `zustand`, `socket.io-client` and the test devDependencies
- [ ] `apps/web/tests/setup.ts` — `@testing-library/jest-dom` import, `portal.css` stub
- [ ] `apps/web/next.config.js` — portal security headers (does not exist yet)
- [ ] `apps/api/tests/owner-portal/` and `apps/api/tests/web-dashboard/` directories with shared factories extending `tests/helpers/factories.ts` (needs owner/pet/link factories)
- [ ] `apps/api/tests/rls/clinic-scope.test.ts` — first test in the repo that actually exercises `breeyo_app` + RLS
- [ ] `apps/web/lighthouserc.owner-portal.json` — 4G mobile profile, FCP budget 3000ms
- [ ] Extend `AuditEvent` enum + a test asserting every Phase 9 sensitive action writes an audit row (D-24)

---

## Security Domain

`security_enforcement` is not set to `false`, so this section applies. The owner portal is the highest-risk surface this project has built: unauthenticated, internet-facing, and it returns medical and financial records.

### Applicable ASVS categories

| ASVS category | Applies | Standard control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Dashboard: existing `@fastify/jwt` + refresh-token rotation + argon2 (Phase 1). Portal: bearer-token (magic link) authentication — 256-bit CSPRNG token, SHA-256 at rest, exchanged for a short-lived opaque session. Never `Math.random`, never `nanoid` for this. |
| V3 Session Management | yes | Portal session: opaque token, HttpOnly + Secure + SameSite=Lax cookie, 60-min sliding expiry capped by `link.expiresAt`, server-side revocation via `OwnerPortalSession.revokedAt`. Token-free onward URLs. |
| V4 Access Control | yes | Portal: `portalContext` derives `{clinicId, ownerId, allowedPetIds, allowedInvoiceIds}`; every repository call filters on all of them. Dashboard: `requirePermission` + `ClinicBrowserAccessPolicy`; hidden ≠ authorised (D-20). Deny by default. |
| V5 Input Validation | yes | Zod schemas in `packages/validators/src/{web-dashboard,owner-portal}.ts` on every request. Path params (`petId`, `invoiceId`) validated as UUIDs **and** authorisation-checked against the scope — never trusted from the URL. |
| V6 Cryptography | yes | `node:crypto` only — `randomBytes(32)` for tokens, `createHash('sha256')` for storage, argon2 (existing) for passwords. No hand-rolled crypto, no custom HMAC scheme. |
| V7 Error Handling & Logging | yes | Centralised `error-handler.ts`. Portal `INVALID` returns 403 with **no body data and no retry CTA** (OWN-06, 09-UI-SPEC). Tokens must never reach logs, Sentry breadcrumbs, or the structured `onResponse` log hook. Sensitive actions audit-logged with actor + timestamp (D-24). |
| V8 Data Protection | yes | Portal responses omit SOAP free-text, internal notes, vet-only attachments, and other owners' data by projection, not by client-side filtering. `Cache-Control: no-store` on portal routes. |
| V9 Communications | yes | HTTPS/HSTS in production; `secure` cookies; explicit CORS origins (no `*`) — including fixing Socket.IO's `CORS_ORIGIN || '*'` default. |
| V11 Business Logic | yes | Idempotency on checkout / refund / void; optimistic locking on concurrent edits; reissue rate cap; Razorpay webhook signature verification as the sole payment truth. |
| V13 API | yes | `/api/v1` versioned REST, per-route rate limits, no verb tunnelling; state-changing operations are POST/PATCH only. |
| V14 Configuration | yes | No secrets committed; `.env.example` updated for portal/Razorpay vars; portal security headers in `next.config.js`. |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|--------------------|
| Magic-link token leaked via `Referer`, browser history, CDN/WAF logs, or analytics | Information Disclosure | Token-free URLs after exchange; `Referrer-Policy: no-referrer`; `X-Robots-Tag: noindex, nofollow`; `Cache-Control: no-store`; never render or log the token |
| Token brute force / enumeration against `/portal/session` | Spoofing | 256-bit token space; per-IP 20/min with `ban: 3`; identical 403 shape for "not found" and "wrong scope"; audit + alert on burst failures |
| IDOR — `/portal/invoices/{id}` for another owner's invoice | Elevation of Privilege | Scope check on every read: `clinicId` AND `ownerId` AND `id ∈ allowedInvoiceIds`; integration test proving 403 |
| Cross-tenant read via missing RLS | Information Disclosure | Fix BF-4; enable RLS + `app.clinic_id` policies on all new tables; `breeyo_app` role for portal queries; dedicated RLS test |
| Double-charge from a retried checkout | Tampering / financial | `IdempotencyKey` UNIQUE claim + response replay; `X-Refund-Idempotency` for Razorpay refunds |
| Forged payment success via the return URL | Spoofing | Webhook-only status transitions; success screen reads server state |
| Lost update — browser overwrites a mobile edit | Tampering | Conditional `updateMany` on `updatedAt`/`version`, 409 + stale banner (D-40) |
| Privilege escalation by calling a hidden module's API | Elevation of Privilege | Server-side `requirePermission` + browser-access gate on every route; the hidden sidebar is cosmetic |
| WhatsApp reissue abuse (cost + owner harassment) | Denial of Service | Per-owner daily cap, then human escalation (D-79/D-81) |
| Stored XSS via clinic-authored content rendered in the portal | Tampering | React auto-escaping; no `dangerouslySetInnerHTML` in portal components; CSP |
| Clickjacking a "Pay" button | Tampering | `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` on portal routes |
| SQL injection via tenant-context interpolation | Tampering | Replace `SET LOCAL app.clinic_id = '${clinicId}'` with parameterised `set_config` (BF-4) |
| Connection-pool exhaustion DoS from per-request `PrismaClient` | Denial of Service | Single shared app-role client + transaction-scoped context (BF-4) |

---

## Sources

### Primary (HIGH confidence)

**Live codebase and database — verified this session:**
- `apps/api/prisma/schema.prisma` (557 lines) — confirmed model inventory; no Invoice/Inventory/Appointment models
- `apps/api/prisma/migrations/` — only `20260802111747_init` (12 tables) and `20260802162311_add_consent_records`
- `docker exec breeyo-postgres-1 psql … information_schema.tables` — live DB has 14 Phase-1 tables only
- `docker exec … pg_policies` / `pg_class.relrowsecurity` — RLS live on `clinic_members`, `auth_audit_log`, `notifications` only, all keyed on `app.clinic_id`
- `npx prisma migrate status` + `migrate diff --from-migrations` — confirmed drift
- `apps/api/src/lib/prisma-rls.ts`, `middleware/{tenant-context,authenticate,authorize,error-handler}.ts`, `realtime/socket.ts`, `app.ts`, `plugins/prisma.ts`
- `apps/api/src/modules/vaccination/vaccination.repository.ts` — confirmed `getOverdueVaccinations` / `getDueSoonVaccinations` / `getLatestDeworming` / `getVaccinationRecords` / `getDewormingRecords`
- `apps/api/src/modules/{queue,vaccination,emr,patient,drug,clinic,attachment,notifications,auth}/*.routes.ts` — flat `<name>.*.ts` convention, all built from `fastify.prisma`
- `packages/types/src/{index,emr,billing}.ts`, `packages/validators/src/{index,emr,billing}.ts` — barrel + naming convention
- `packages/types/src/constants/socket-events.ts` — `SOCKET_EVENTS` map
- `packages/ui/{package.json,src/theme/portal.css}` — generated CSS custom properties
- `apps/web/{package.json,tsconfig.json,app/*,src/lib/api.ts}` — Next 15 stub, no `next.config`, no tests
- `apps/mobile/{package.json,src/features/queue/hooks/useQueueSocket.ts,src/providers/QueryProvider.tsx,src/features/pdf/hooks/useGeneratePdf.ts}` — reference client patterns
- `apps/api/{vitest.config.ts,tests/helpers/setup.ts,tests/tenant-isolation.test.ts}` — test conventions
- `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `docker-compose.test.yml`, `.gitignore`
- `ls .planning/phases/`, `git log --all -- '.planning/phases/08*'` — Phase 8 never existed

**Official documentation:**
- https://nextjs.org/docs/app/api-reference/functions/cookies — `cookies()` async since 15.0.0-RC; `.set` only in Route Handlers / Server Functions
- https://nextjs.org/docs/app/api-reference/config/next-config-js/headers — exact `headers()` shape, `:path*` matching, `Referrer-Policy` / `X-Content-Type-Options` / `X-Frame-Options` guidance
- https://razorpay.com/docs/api/refunds/ — idempotent Normal and Instant Refund endpoints
- https://razorpay.com/docs/api/x/payout-idempotency/ — idempotency-key semantics, stored-response replay, reuse rules
- https://github.com/fastify/fastify-rate-limit — per-route `config.rateLimit` override of `max`, `timeWindow`, `keyGenerator`, `ban`, `allowList`
- https://www.prisma.io/docs/orm/prisma-client/queries/transactions — optimistic concurrency control via version field in `where` + `count === 0`
- npm registry via `npm view` — versions for `next` (16.3.0 latest / 15.5.23 on the 15 line), `@tanstack/react-query` 5.101.4, `socket.io-client` 4.8.3, `zustand` 5.0.14, `papaparse` 5.5.4, `csv-stringify` 6.8.3, `@lhci/cli` 0.15.1, `@testing-library/react` 16.3.2 (+ peers), `@testing-library/dom` 10.4.1, `happy-dom` 20.11.2, `jsdom` 30.0.1, `pdfkit` 0.19.1, `@vitejs/plugin-react` 5.2.0, `vitest` 4.1.10 / 3.2.7 / 2.1.9
- `slopcheck 0.6.1` — all 10 candidate packages `[OK]`

**Project planning documents:**
- `.planning/ROADMAP.md` (Phase 8 and 9 sections), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`
- `09-CONTEXT.md`, `09-UI-SPEC.md` (approved 2026-05-07), `09-01..09-07-PLAN.md` (prior pass, to be discarded)
- `02-UI-SPEC.md` (owner portal design contract, 2026-04-17), `06-CONTEXT.md`, `07-CONTEXT.md`, `05-01-PLAN.md`
- `.planning/research/{STACK.md,PITFALLS.md}`
- `./CLAUDE.md`

### Secondary (MEDIUM confidence)

- https://www.ntanalyzer.com/blog/leaky-urls-referrers-scripts-and-unintended-disclosure/ — URL paths and query strings routinely reach third parties, CDNs, WAFs, and server logs, including auth material
- https://guptadeepak.com/mastering-magic-link-security-a-deep-dive-for-developers/ — hash-compare, immediate consumption, session creation then redirect, `Referrer-Policy: no-referrer` on the landing page
- https://securityboulevard.com/2026/05/are-magic-links-secure-a-technical-deep-dive-into-email-based-authentication/ — magic-link threat model overview
- https://github.com/prisma/prisma/discussions/10250, https://oneuptime.com/blog/post/2026-01-25-optimistic-locking-prisma-nodejs/view — optimistic-locking implementation notes cross-checked against the official Prisma docs above

### Tertiary (LOW confidence — flagged, not relied upon)

- Search-result summary asserting the Razorpay refund idempotency header is exactly `X-Refund-Idempotency` (4-36 chars: letters, digits, hyphen, underscore, space; UUIDv4 recommended; 409 while processing). The header name could not be confirmed against a live Razorpay doc page — the specific idempotent-refund URLs returned 404 to WebFetch. **The plan must verify this header name against Razorpay's live documentation before implementing refunds.** The `X-Payout-Idempotency` name for payouts *was* corroborated by the fetched payout-idempotency page.
- Absence of idempotency support on Razorpay Payment Links creation — inferred from documentation silence, not from a documented statement.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Repo conventions (types/validators, module layout, migrations, testing) | **HIGH** | Read directly from source; drift confirmed with `prisma migrate diff` and live `psql` |
| Dependency readiness (BF-1, BF-2) | **HIGH** | Verified empirically against the filesystem, git history, and the live database |
| Standard stack + versions | **HIGH** | Every version read from `pnpm-lock.yaml` or `npm view`; all new packages `slopcheck [OK]` |
| Next.js 15 App Router APIs (`cookies`, `headers`) | **HIGH** | Current official docs fetched this session |
| RLS / tenant-context defects | **HIGH** | Three independent defects each confirmed by code read plus live `pg_policies` |
| Optimistic locking design | **HIGH** | Official Prisma pattern; millisecond-precision caveat is a documented PostgreSQL/Prisma property |
| Magic-link security architecture | **MEDIUM** | Threat model and mitigations are well-sourced, but the exchange design is a synthesised recommendation and the 7-day-reusable-token deviation is a deliberate, documented tradeoff |
| Razorpay idempotency specifics | **MEDIUM-LOW** | Refund idempotency support confirmed; exact header name not confirmed against a live doc page — flagged as A5 and in Tertiary sources |
| `OWN-01`..`OWN-07` wording | **MEDIUM** | Rigorously inferred from ROADMAP + CONTEXT + 02-UI-SPEC cross-references, but never user-approved. Needs human sign-off (A1) |
| Phase 8 appointment contract | **LOW** | No decisions exist anywhere; deliberately not designed here |
| OWN-05 3s-FCP achievability | **MEDIUM** | Plausible with server components + a token-only CSS bundle, but unmeasured on this codebase |

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (30 days) for stack and conventions. The dependency-readiness findings (BF-1, BF-2) invalidate immediately once Phases 5/6/7/8 land — **re-verify `schema.prisma`, `apps/api/prisma/migrations/`, and the live table list before executing any Tier B plan.**
