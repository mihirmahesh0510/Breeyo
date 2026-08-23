---
phase: 09-web-dashboard-owner-portal
plan: 05
subsystem: owner-portal-backend
tags: [fastify, prisma, whatsapp, razorpay, vitest, TDD, magic-link, security]
dependency_graph:
  requires: [09-01]
  provides: [magic-link-validation, access-scope-service, owner-portal-session-api, owner-portal-records-api, owner-portal-invoices-api, owner-portal-checkout-api, owner-portal-reissue-api, owner-portal-link-wa-template]
  affects: [09-06, 09-07]
tech_stack:
  added: []
  patterns:
    - "unauthenticated route surface: no authenticate/tenantContext preHandler; every route resolves clinicId from the validated magic-link row (webhook.routes.ts's D-30-exemption pattern, applied to a public token instead of a signed webhook)"
    - "shared requirePortalScope preHandler decorates request.portalScope/request.portalDb for every READY-only route; short-circuits INVALID/EXPIRED before the handler runs"
    - "reissue is the one route excluded from requirePortalScope, since it must accept an EXPIRED resolution that preHandler would otherwise reject"
    - "server-derived scope only: AccessScopeService.deriveScope parses allowedPetIdsJson/allowedInvoiceIdsJson once from the validated row; every subsequent petId/invoiceId from a client is re-checked against that scope, never trusted"
    - "owner-initiated billing actions use the invoice's own createdById as the BillingActor stand-in (mirrors scheduling/owner-action.service.ts's precedent for the same no-User-row problem)"
key_files:
  created:
    - apps/api/src/modules/owner-portal/access-scope.service.ts
    - apps/api/src/modules/owner-portal/magic-link.service.ts
    - apps/api/src/modules/owner-portal/portal-session.service.ts
    - apps/api/src/modules/owner-portal/portal-records.service.ts
    - apps/api/src/modules/owner-portal/portal-invoices.service.ts
    - apps/api/src/modules/owner-portal/portal-checkout.service.ts
    - apps/api/src/modules/owner-portal/portal-reissue.service.ts
    - apps/api/src/modules/owner-portal/session.controller.ts
    - apps/api/src/modules/owner-portal/records.controller.ts
    - apps/api/src/modules/owner-portal/invoices.controller.ts
    - apps/api/src/modules/owner-portal/checkout.controller.ts
    - apps/api/src/modules/owner-portal/reissue.controller.ts
    - apps/api/src/modules/owner-portal/owner-portal.routes.ts
    - apps/api/src/modules/owner-portal/__tests__/portal-records.service.test.ts
    - apps/api/src/modules/owner-portal/__tests__/portal-invoices.service.test.ts (bonus, not required by either task's verify command)
    - apps/api/src/modules/owner-portal/__tests__/portal-checkout.service.test.ts
    - apps/api/src/modules/owner-portal/__tests__/portal-reissue.service.test.ts
  modified:
    - apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts (replaced 09-01 Wave 0 scaffold)
    - apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts (replaced 09-01 Wave 0 scaffold)
    - apps/api/src/app.ts (registers owner-portal.routes.js, unauthenticated, no config override)
    - packages/types/src/whatsapp.ts (adds owner_portal_link to WaTemplateKey)
    - packages/types/src/constants/whatsapp.constants.ts (adds owner_portal_link to WA_TEMPLATE_KEYS/STAFF_NAMES/CATEGORIES)
    - packages/types/src/__tests__/whatsapp.constants.test.ts (7 -> 8 template-key assertions)
    - packages/validators/src/whatsapp.ts (adds ownerPortalLinkVariablesSchema + registry entry)
    - packages/validators/src/__tests__/whatsapp.validators.test.ts (7 -> 8 schema-count assertion)
    - apps/api/src/modules/whatsapp/template-registry.ts (adds renderOwnerPortalLink + WA_TEMPLATES.owner_portal_link)
    - apps/api/src/modules/whatsapp/__tests__/template-registry.test.ts (7 -> 8 entries, added sample variables + staffName assertion)
    - apps/api/src/modules/whatsapp/providers/simulator/simulator-reply.ts (adds owner_portal_link to TEMPLATE_ACK_TEXT)
metrics:
  duration: ~3 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 05: Owner-Portal Token Validation, Read-Only Records, Combined Checkout & WhatsApp Reissue Summary

Built the owner-portal's entire backend surface: hashed magic-link validation with explicit server-derived scope, session/records/invoices read APIs, combined one-or-many-invoice checkout delegated to billing's existing `PaymentService`, and a rate-limited WhatsApp reissue flow for expired links. Both tasks' exact `<verify>` commands pass. This is the first genuinely public, unauthenticated route surface in the codebase (no JWT, a raw token in the URL), so every design decision below is oriented around OWN-06's "no data unless the token resolves to READY, and a mismatch is indistinguishable from tampering" requirement.

## What Was Built

### Task 1: Token validation, access scope, session, and read-only records/invoices (TDD)

- **`magic-link.service.ts`** — `MagicLinkService.validate(rawToken, now?)` hashes the inbound token via the existing `hashMagicLinkToken` (never reinvented), looks it up by `tokenHash` against the **admin** `PrismaClient` (`getBasePrisma()`, mirroring `webhook.routes.ts`'s `resolveClinicByWebhookToken` D-30 exemption — the clinic isn't known until the lookup resolves, so it structurally cannot run under a tenant-bound RLS handle). Delegates state resolution to `@breeyo/types`'s existing `resolveOwnerPortalSessionState` (no re-derivation of the 7-day/revoked/hash-mismatch rules). Returns a 3-state `MagicLinkResolution`: `INVALID` (no data at all — missing row, revoked, or hash mismatch, indistinguishable per OWN-06), `EXPIRED` (carries only `magicLinkId`/`clinicId`/`ownerId` — internal-only fields for the reissue path, never serialized as a public envelope), `READY` (carries the full derived scope).
- **`access-scope.service.ts`** — `AccessScopeService.deriveScope(row)` is the ONLY place `allowedPetIdsJson`/`allowedInvoiceIdsJson` are parsed off a magic-link row into `OwnerPortalTokenScope`. `isPetInScope`/`isInvoiceInScope`/`areInvoicesInScope` are the re-check every downstream service calls before touching a client-supplied id — never trusting `petId`/`invoiceId` from a query param or body directly.
- **`portal-session.service.ts`** — `PortalSessionService.getSession(scope)` assembles the owner/pet overview (owner name, per-pet `hasUnpaidInvoice` derived from `scope.allowedInvoiceIds`' balances, total due, deep-link target) and the D-53 restore state (`OwnerPortalSessionState`, keyed by a `@unique` `magicLinkId` and persisted via a real Prisma `upsert` — added during the no-mistakes review-fix pass, replacing this task's original `findFirst` + `update`/`create`, which raced under concurrent requests since `magicLinkId` wasn't unique in the 09-01 schema). Best-effort `lastViewedAt` touch on the magic-link row never fails the session read.
- **`portal-records.service.ts`** — `PortalRecordsService.getRecords(scope, petId)` re-checks `petId` against scope (returns `null` — no query at all — on mismatch) then queries `Consultation` with a `select` that structurally excludes `subjective`/`objective`/`plan`/`careInstructions`/`referral`/`rxNotes`/`addenda` — the enforcement point for OWN-01/D-73–77 is the Prisma select clause itself, not a filter applied after the fact. `assessment` maps to `diagnosisText`; a small, deliberately non-exhaustive glossary (`URI`, `UTI`, `GI`, `OA`, `CKD`, `Otitis`, `Dermatitis`) produces `diagnosisGloss` only when a term is recognized (D-75/D-76 without becoming the "heavy coaching product" D-77 bans). Prescriptions map to usage cards from `dosage`/`route`/`frequency`/`duration`, with `plainLanguageGloss` sourced from `Prescription.ownerInstructions` — `clinicalInstructions` (vet-facing) is never selected.
- **`portal-invoices.service.ts`** — `PortalInvoicesService.getInvoicesForPet(scope, petId)` filters by BOTH `petId` and `id: { in: scope.allowedInvoiceIds }` — a pet being in scope does not by itself imply every invoice on that pet is in scope.
- **`session.controller.ts` / `records.controller.ts` / `invoices.controller.ts`** — thin handlers reading `request.portalScope`/`request.portalDb` (set by the shared preHandler below); a `null` service result (scope mismatch) answers the same `{ state: 'INVALID' }` 403 envelope as a tampered token.
- **`owner-portal.routes.ts`** — the composition root. `requirePortalScope` is the shared preHandler every `READY`-only route (`session`, `records`, `invoices`, and Task 2's `checkout`) hangs off: it resolves the token via `MagicLinkService`, answers `INVALID` (403) or `EXPIRED` (200, no data) directly, and only for `READY` decorates `request.portalScope`/`request.portalDb` (a fresh `createTenantClient(scope.clinicId)` per request) before letting the handler run. No `config: { rateLimit: false }` override — unlike the Razorpay webhook plugin, a public token-in-URL route is exactly the shape a brute-force guesser targets, so it deliberately keeps the app-wide 200/min limit.
- **`apps/api/src/app.ts`**: registers `owner-portal.routes.js` at `/api/v1` (not in this task's `files_modified` list, but necessary for the routes to be reachable at all — the same deviation 09-02's `web-dashboard.routes.ts` registration made, confirmed via `git show 433a107`).
- **Tests**: `magic-link.service.test.ts` (6 tests, replaces the 09-01 Wave 0 scaffold that only exercised the pure `@breeyo/types` helpers) drives the real service against a mocked admin `PrismaClient` — hashed lookup, READY scope derivation, EXPIRED with no leaked scope data, INVALID for missing/revoked/empty-token. `portal-session.service.test.ts` (9 tests, replaces its Wave 0 scaffold) covers overview assembly, the best-effort `lastViewedAt` touch (including its failure being swallowed), deep-link surfacing, and restore-state create-vs-update branching. `portal-records.service.test.ts` (6 tests, new) covers pet-scope refusal, the forbidden-field `select` assertion, diagnosis gloss/no-gloss, and prescription-card mapping with a clinician-only-field leak check. `portal-invoices.service.test.ts` (4 tests, new — not required by Task 1's verify command, added for parity with its siblings) covers scope refusal and the dual `petId`+allow-list filter.

### Task 2: Combined checkout, payment-link delegation, and WhatsApp reissue (TDD)

- **`portal-checkout.service.ts`** — `PortalCheckoutService.createCheckout(scope, selectedInvoiceIds)` dedupes the selection, re-checks it against `scope.allowedInvoiceIds` (refuses with `null` on any mismatch or empty selection), loads the invoices, and refuses again if the resolved count doesn't match the requested count (belt-and-suspenders against a since-voided/deleted invoice). Builds the pet breakdown and total, persists an `OwnerPortalCheckoutSession` snapshot (`selectedInvoiceIdsJson`, `petBreakdownJson`, `amountDuePaise`, `returnState: 'pending'`), then delegates to `PaymentService.createPaymentLink` (one invoice) or `PaymentService.createCombinedPaymentLink` (multiple) — the exact billing methods staff checkout already uses, not a second payment path — and records the returned `razorpayPaymentLinkId` back onto the snapshot. Because `Payment.recordedById` is a FK to `User` and an owner has no `User` row, the invoice's own `createdById` stands in as the `BillingActor.userId`, mirroring `scheduling/owner-action.service.ts`'s established precedent for the identical problem on the appointment-cancel path.
- **`portal-reissue.service.ts`** — `PortalReissueService.reissue(resolution)` only proceeds for an `EXPIRED` resolution (`READY` → `NOT_EXPIRED`, `INVALID` → `INVALID`, neither touches the database). Counts `OwnerPortalMagicLink` rows for the owner where `reissuedFromLinkId` is not null and `issuedAt >= now - 24h`; at `OWNER_PORTAL_REISSUE_DAILY_LIMIT` (3, from `@breeyo/types`) or above, returns `LIMIT_REACHED` without creating a new link or sending anything. Otherwise generates a fresh raw token (`crypto.randomBytes(32).toString('hex')`, local to this file — `node:crypto` is fine here since this is `apps/api`, never `packages/types`/`validators`), creates a new `OwnerPortalMagicLink` carrying over the old row's scope and `reissuedFromLinkId`, best-effort points the old row's `latestReissueLinkId` forward, and sends the new link through `WhatsAppService.sendTemplate` — the existing Phase 7 persist-then-enqueue pipeline — with `userId: null` (an automated, non-staff send `WaActor` already supports natively).
- **`checkout.controller.ts` / `reissue.controller.ts`** — checkout sits behind `requirePortalScope` (READY-only) and additionally cross-checks `body.magicLinkId` against `request.portalScope.magicLinkId` before calling the service — a client cannot submit a checkout naming a different link than the one its own token resolved to. Reissue is deliberately **not** behind `requirePortalScope` (which only lets `READY` through) — it resolves the token itself, answers `INVALID`/`READY` (`NOT_EXPIRED`) directly with no tenant handle built for either, cross-checks `body.expiredMagicLinkId` against the resolved `magicLinkId`, and only then builds a tenant-scoped handle and calls the service.
- **`owner-portal.routes.ts`** — wires `POST .../checkout` (behind `requirePortalScope`) and `POST .../reissue` (its own resolution). Builds `PaymentService` exactly like `billing.routes.ts`'s own `buildPaymentService` (`StockValidatorService` → `InvoiceRepository` → `PaymentService`, all off the request's tenant `db`), and builds an admin-scoped `WhatsAppService` exactly like `whatsapp.routes.ts`'s own composition (`WhatsAppRepository(fastify.prisma)`, `SendAuthorizationService`, a `Queue('whatsapp-outbound', ...)`, `fastify.prisma`, `fastify.io ?? null`) — a second `Queue` handle to the same named BullMQ queue is intentional and safe (BullMQ queues are lightweight named handles, not a singleton-per-process resource; the existing `outbound.worker.ts` consumer processes jobs from either producer identically), closed on its own `onClose` hook.
- **Tests**: `portal-checkout.service.test.ts` (7 tests) covers scope refusal, empty-selection refusal, single- vs. combined-link delegation with the correct actor, pet-breakdown grouping, deduplication, snapshot create-then-update, and the invoice-count-mismatch refusal. `portal-reissue.service.test.ts` (11 tests) covers `NOT_EXPIRED`/`INVALID` short-circuits, the 3-per-24h cap (rejects at 3, permits at 2), the count query's exact `where` shape, link lineage (`reissuedFromLinkId` on the new row, best-effort `latestReissueLinkId` on the old row, surviving a failed lineage update), never persisting the raw token, and the WhatsApp delegation call shape including the built portal link.

## Deviations From The Plan (flagged, not silently made)

1. **Added an 8th WhatsApp template, `owner_portal_link`, touching four files outside this plan's `files_modified` list**: `packages/types/src/whatsapp.ts`, `packages/types/src/constants/whatsapp.constants.ts`, `packages/validators/src/whatsapp.ts`, and `apps/api/src/modules/whatsapp/template-registry.ts` (plus three existing exhaustive-count/sample-data tests in those areas that needed updating: `whatsapp.constants.test.ts`, `whatsapp.validators.test.ts`, `template-registry.test.ts`, and `simulator-reply.ts`'s `TEMPLATE_ACK_TEXT` map). **Why this was necessary rather than optional**: the plan explicitly requires reissue to "enqueue a WhatsApp outbound message through the existing Phase 7 message pipeline" and forbids inventing a second send path — but no existing template (`invoice_delivery`, `payment_reminder`, `follow_up_reminder`, `vaccine_due`, `deworming_due`, `booking_confirmation`, `appointment_reminder`) covers a magic-link message. The registry is documented as a frozen, one-in-code-source-of-truth set (`template-registry.ts`'s file header) that is nonetheless meant to be extended in place — Phase 8 did exactly this to add `appointment_reminder` as its 7th entry. Adding `owner_portal_link` as an 8th entry, `TRANSACTIONAL` category (like `invoice_delivery`/`booking_confirmation` — access recovery should never be STOP-silenceable), follows that exact precedent rather than establishing a new one. All touched packages were rebuilt (`tsc`) and their full test suites re-run green: `packages/types` (103 tests), `packages/validators` (238 tests), `apps/api/src/modules/whatsapp` (377 tests).
2. **`PortalReissueService` generates its own raw token locally** (`crypto.randomBytes` in `portal-reissue.service.ts`) rather than adding a `generateMagicLinkRawToken()` helper to `apps/api/src/lib/magic-link-hash.ts`. That file isn't in Task 2's `files_modified` list, and the generation logic is simple enough (and single-caller enough) not to warrant reaching outside the module boundary for it — `hashMagicLinkToken` itself is reused as-is, never reinvented.
3. **`apps/api/src/app.ts` modified** to register `owner-portal.routes.js`, matching the same not-listed-but-necessary registration 09-02 made for `web-dashboard.routes.ts` (confirmed via `git show 433a107`).
4. **No file-path or naming convention violations found.** Checked `apps/api/src/modules/billing/` (flat sibling `.service.ts`/`.controller.ts` files, exactly this plan's declared shape) before creating anything; every file in this plan already appears verbatim in the plan's own `files_modified` list, so there was nothing to reconcile against an undeclared convention.

## Security posture notes (T-09-13/T-09-14/T-09-15, OWN-06)

- Every route resolves `clinicId`/`ownerId`/`allowedPetIds`/`allowedInvoiceIds` from the validated magic-link row via `AccessScopeService.deriveScope` — never from `request.params`/`request.query`/`request.body`. A client-supplied `petId`/`invoiceId`/`magicLinkId`/`expiredMagicLinkId` is always cross-checked against server-derived scope before being used in a query, and a mismatch answers the identical no-data envelope as a tampered token (never a distinguishing 404).
- `INVALID` and `EXPIRED` never carry pet/invoice/owner data in any response body, matching `@breeyo/validators`' `ownerPortalSessionSchema`'s `.strict()` variants.
- The reissue route is the one place a raw token is generated and (briefly, before hashing) held in memory; it is embedded directly into the WhatsApp message body and never logged or persisted — only its SHA-256 hash lands in `OwnerPortalMagicLink.tokenHash`.
- No route in this module received a `rateLimit: false` override; the app-wide 200/min limit applies to every owner-portal endpoint, deliberately, since this is the one public token-guessing attack surface in the codebase.

## Verification

- Task 1 verify: `npx vitest run apps/api/src/modules/owner-portal/__tests__/magic-link.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-session.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-records.service.test.ts` → **21/21 passed**.
- Task 2 verify: `npx vitest run apps/api/src/modules/owner-portal/__tests__/portal-checkout.service.test.ts apps/api/src/modules/owner-portal/__tests__/portal-reissue.service.test.ts` → **18/18 passed**.
- Full owner-portal + whatsapp + billing regression sweep (`apps/api`): **724/724 passed** across 43 test files.
- `packages/types` full suite: **103/103 passed**. `packages/validators` full suite: **238/238 passed**.
- `apps/api` TypeScript project build (`tsc --noEmit`): clean, no errors.
