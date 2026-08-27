---
phase: 07-whatsapp-communication
plan: 08
subsystem: whatsapp-outbound-send
tags: [prisma, zod, bullmq, fastify, TDD, whatsapp]
dependency_graph:
  requires: [whatsapp-schema-and-types, whatsapp-provider-port-and-simulator, whatsapp-test-scaffolding-and-factories]
  provides: [whatsapp-template-registry, whatsapp-repository, whatsapp-outbound-queues, whatsapp-send-authorization, whatsapp-send-service]
  affects: [07-09, 07-11, 07-12, 07-13]
tech_stack:
  added: []
  patterns: [persist-then-dispatch-outbox, single-in-code-template-registry, append-or-stamp-consent-never-upsert, retry-creates-new-row-never-mutates]
key_files:
  created:
    - apps/api/src/modules/whatsapp/template-registry.ts
    - apps/api/src/modules/whatsapp/whatsapp.repository.ts
    - apps/api/src/modules/whatsapp/whatsapp-queue.ts
    - apps/api/src/modules/whatsapp/send-authorization.service.ts
    - apps/api/src/modules/whatsapp/whatsapp.service.ts
    - apps/api/src/modules/whatsapp/__tests__/template-registry.test.ts
    - apps/api/src/modules/whatsapp/__tests__/whatsapp.repository.test.ts
    - apps/api/src/modules/whatsapp/__tests__/send-authorization.service.test.ts
    - apps/api/src/modules/whatsapp/__tests__/whatsapp.service.test.ts
  modified:
    - apps/api/tests/whatsapp/send.test.ts
    - apps/api/tests/whatsapp/opt-out.test.ts
    - apps/api/tests/whatsapp/consent.test.ts
metrics:
  duration: ~1.5 hours
  completed: 2026-08-15
  tasks_completed: 3
  tasks_total: 3
---

# Phase 07 Plan 08: Template Registry, Repository, Queues, Authorization Gate, Send Service Summary

Built the full outbound WhatsApp send path -- a frozen six-template registry, a clinicId-scoped repository with append-only status events and append/stamp consent handling, two BullMQ queue wrappers, a single-purpose send-authorization gate enforcing the D-10/D-11 STOP rule, and a persist-then-dispatch `WhatsAppService.sendTemplate` that writes a `QUEUED` message inside one transaction and enqueues by row id only after commit -- with zero provider calls anywhere in the request path. Also applied the D-23 amendment (paid invoices omit the payment CTA) end-to-end: registry render logic, and confirmation that the validator change from 07-02 needed no further edits.

## What Was Built

### Task 1: Six-template registry with D-23 paid-invoice CTA omission

- **`apps/api/src/modules/whatsapp/template-registry.ts`** -- `WA_TEMPLATES: Record<WaTemplateKey, WaTemplateDefinition>`, six frozen entries. `staffName`/`category` sourced from `@breeyo/types`' `WA_TEMPLATE_STAFF_NAMES`/`WA_TEMPLATE_CATEGORIES`; `variables` sourced from `@breeyo/validators`' `WA_TEMPLATE_VARIABLE_SCHEMAS` -- none re-typed. `getTemplate()` throws a `400 TEMPLATE_UNKNOWN` error for an unrecognized key. `renderTemplate()` parses variables against the Zod schema first (duck-typed `err.name === 'ZodError'` with `statusCode: 400` attached -- see Deviations) and only then renders. `invoice_delivery`'s `render` emits a `"Pay now: <link>"` line only when `variables.payment_link` is truthy (D-23) -- verified by two explicit test cases (with and without the link). `WA_REMINDER_KIND_TO_TEMPLATE` has exactly three entries (`FOLLOW_UP`/`VACCINE_DUE`/`DEWORMING_DUE`), structurally excluding `payment_reminder` (D-05). `booking_confirmation` declares one acknowledgement-only button (`Got it, thanks`), never a cancel/move payload (D-09). No template body or Prisma import appears anywhere in the file.
- **D-23 amendment on `packages/validators/src/whatsapp.ts`** -- found ALREADY applied (committed in 07-02, `3db43c9`): `invoiceDeliveryVariablesSchema.payment_link` is `.optional()` with a comment citing D-23. No further edit was needed to that file; `pnpm --filter @breeyo/validators test -- --run` (179 tests) confirmed green both before and after this plan's work.

### Task 2: Repository with explicit clinicId scoping, and the BullMQ queue wrappers

- **`apps/api/src/modules/whatsapp/whatsapp.repository.ts`** -- `WhatsAppRepository` class constructed with a raw `PrismaClient` (matching `VaccinationRepository`'s pattern -- `fastify.prisma`, never `request.db`). 19 methods; every clinic-scoped one takes `clinicId` first and filters on it directly (`findFirst`/`updateMany` with `{ id, clinicId }`, never a bare `where: { id }`). Cross-tenant reads (`findMessageById`, `findThreadById`) return `null` rather than throwing, so callers can surface a 404 without disclosing existence. `WhatsAppMessageStatusEvent` (no `clinicId` column) is append-only via `create` only. Consent methods (`getCurrentWhatsAppConsent`/`grantWhatsAppConsent`/`withdrawWhatsAppConsent`) take only `ownerId` (matching `ConsentRecord`'s actual schema) and never call `.upsert()` -- grant always `create`s, withdraw stamps the latest open row found via `findFirst({ withdrawnAt: null }, orderBy: grantedAt desc)`. `upsertOwnerPreference`/`markNumberInvalid` look up scoped by `(clinicId, ownerId)` BEFORE updating by the table's actual unique key (`ownerId`), closing the T-07-08-01 cross-tenant-write path a naive `upsert({ where: { ownerId } })` would open. Write methods accept an optional trailing `tx` parameter defaulting to the constructor's own handle.
- **`apps/api/src/modules/whatsapp/whatsapp-queue.ts`** -- `createWhatsAppQueues(redis)` returns `{ outbound, simulator, close }` wrapping two named BullMQ `Queue`s (`whatsapp-outbound`, `whatsapp-simulator`). `WA_JOB_OPTIONS = { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 }`. No `Worker` is constructed (Pitfall 7).

### Task 3: Send-authorization gate and persist-then-dispatch send service

- **`apps/api/src/modules/whatsapp/send-authorization.service.ts`** -- `SendAuthorizationService.authorize({ clinicId, ownerId, templateKey })`. Looks up the template (400 if unknown), fetches the owner's preference ONCE, and: (1) throws `403 OWNER_OPTED_OUT` when the template's category is `REMINDER` AND `remindersOptedOut` is true -- the one hard gate, keyed purely on `(clinicId, ownerId)` with no `petId` parameter anywhere in the file, so it cannot be bypassed per-pet (D-11); (2) returns `consentWarning: 'WHATSAPP_CONSENT_MISSING' | null` from the repository's current-consent query, never throwing (D-12/D-13); (3) returns `numberWarning` when the preference's `numberStatus` is `INVALID`. Reads no request object.
- **`apps/api/src/modules/whatsapp/whatsapp.service.ts`** -- `WhatsAppService.sendTemplate(input, actor)`: `getTemplate()` -> parse variables (400 on mismatch, before any write) -> `authorize()` -> `prisma.$transaction(tx => upsertThread + createOutboundMessage(status QUEUED) + touchThread)` -> commit (access-control audit finding AC-6 later inserted an owner-belongs-to-clinic check as the new first step, before `getTemplate()`; see `.planning/ACCESS-CONTROL-FIX-PLAN.md`) -> `outboundQueue.add('send', { messageId }, { jobId: 'send:<id>', ...WA_JOB_OPTIONS })` -> if `consentWarning`, `writeAuditLog(WHATSAPP_SENT_WITHOUT_CONSENT, { ownerId, templateKey })` -> broadcast `SOCKET_EVENTS.WHATSAPP_MESSAGE_CREATED` via a nullable `io` (matching `queue.service.ts`'s pattern) -> return `{ messageId }`. `retryMessage` looks up the failed row by `(clinicId, messageId)` (404, not 403, on a miss), creates a brand-NEW row with `retryOfMessageId` pointing at the failed one inside its own transaction, and enqueues it -- the failed row is never mutated (Anti-Pattern A7). `grantConsent`/`withdrawConsent`/`setOwnerPreference` delegate to the repository and write the corresponding `WHATSAPP_CONSENT_GRANTED`/`WHATSAPP_CONSENT_WITHDRAWN`/`WHATSAPP_OPT_OUT` audit entries. The constructor's `prisma` field is typed as the raw `PrismaClient` (not the `DbClient` union) -- see Deviations for why.
- Replaced the `it.todo` placeholders in `apps/api/tests/whatsapp/send.test.ts` (7 tests), `opt-out.test.ts` (3 tests), and `consent.test.ts` (4 tests) with real tests against the real database, constructing `WhatsAppRepository` + `SendAuthorizationService` + `WhatsAppService` directly with the `prisma` handle from `tests/helpers/factories.js` and a `{ add: vi.fn() }` fake queue -- no `buildTestApp()`/HTTP, per the plan (HTTP-level coverage is 07-13's job).

## Task Commits

1. **Task 1: Six-template registry with D-23 paid-invoice CTA omission** - `88cb74e` (feat)
2. **Task 2: Repository with explicit clinicId scoping, and BullMQ queue wrappers** - `cc932ad` (feat)
3. **Task 3: Send-authorization gate and persist-then-dispatch send service** - `93b2158` (feat)

## Files Created/Modified

- `apps/api/src/modules/whatsapp/template-registry.ts` - the six-template registry, `getTemplate`, `renderTemplate`, `WA_REMINDER_KIND_TO_TEMPLATE`
- `apps/api/src/modules/whatsapp/whatsapp.repository.ts` - all WhatsApp Prisma access, clinicId-scoped
- `apps/api/src/modules/whatsapp/whatsapp-queue.ts` - `createWhatsAppQueues`, `WA_JOB_OPTIONS`
- `apps/api/src/modules/whatsapp/send-authorization.service.ts` - the D-10/D-11 STOP gate + D-13 consent warning
- `apps/api/src/modules/whatsapp/whatsapp.service.ts` - `sendTemplate`, `retryMessage`, consent/preference writes
- `apps/api/src/modules/whatsapp/__tests__/template-registry.test.ts` - 17 tests
- `apps/api/src/modules/whatsapp/__tests__/whatsapp.repository.test.ts` - 27 tests (repository + queue)
- `apps/api/src/modules/whatsapp/__tests__/send-authorization.service.test.ts` - 11 tests
- `apps/api/src/modules/whatsapp/__tests__/whatsapp.service.test.ts` - 14 tests
- `apps/api/tests/whatsapp/send.test.ts` - 7 real-database integration tests (`it.todo` -> real)
- `apps/api/tests/whatsapp/opt-out.test.ts` - 3 real-database integration tests (`it.todo` -> real)
- `apps/api/tests/whatsapp/consent.test.ts` - 4 real-database integration tests (`it.todo` -> real)

## Decisions Made

- **`upsertOwnerPreference`/`markNumberInvalid` look up by `(clinicId, ownerId)` before writing by `ownerId`** -- `WhatsAppOwnerPreference.ownerId` is `@unique` on its own, so a naive `upsert({ where: { ownerId } })` would let clinic B silently write onto clinic A's owner row if a caller (bug or attacker) passed a mismatched `clinicId`. The explicit prior lookup closes that path while still using the table's real unique key for the actual write.
- **`WhatsAppService`'s `prisma` field is typed as the raw `PrismaClient`, not the `DbClient` union** -- `DbClient = TenantPrismaClient | PrismaClient`, and TypeScript cannot call through a property whose type is a union of two incompatible `$transaction` overloads (confirmed via `tsc`: "Each member of the union type ... has signatures, but none of those signatures are compatible with each other"). Since this service is constructed with the same admin-role client as `WhatsAppRepository` (per the plan's own instruction that repositories -- and, by extension, this whole module's wiring -- use `fastify.prisma`), narrowing to `PrismaClient` is correct, not a workaround.
- **Duck-typed `err.name === 'ZodError'` instead of `err instanceof z.ZodError`** in both `template-registry.ts` and `whatsapp.service.ts` -- verified empirically (a throwaway test) that a `ZodObject` constructed inside `@breeyo/validators` and a `z` imported directly in `@breeyo/api` fail a cross-package `instanceof` check in this monorepo's Vitest/Vite setup even at an identical `zod@3.25.76` version (a dual-module-graph effect). The duck-typed check (`name === 'ZodError'` plus an `issues` array) is stable across module instances and is what the implementation and its tests both use.
- **`SendAuthorizationService.authorize` fetches the owner preference exactly once** and reuses it for both the STOP gate and the number-invalid warning, rather than two separate repository calls -- simpler and cheaper, and both checks are naturally scoped to the same preference row.

## Deviations from Plan

### Auto-fixed Issues

**1. D-23 amendment already applied to `packages/validators/src/whatsapp.ts`**
- **Found during:** Task 1, before writing any code
- **Issue:** The prompt's "MANDATORY amendment" instructed making `payment_link` optional on `invoiceDeliveryVariablesSchema` with a D-23 comment. Reading the file first showed this was already done, committed in `3db43c9` ("add WhatsApp Zod validators with per-template variable caps (WHA-02, WHA-05, D-18)") from plan 07-02, evidently already carrying the amendment forward.
- **Fix:** No edit made to that file. Ran `pnpm --filter @breeyo/validators test -- --run` (179 tests, all passing) to confirm no regression, satisfying the amendment's own verification instruction.
- **Verification:** `git log -1 -- packages/validators/src/whatsapp.ts` shows `3db43c9`; `git diff HEAD` on that file is empty; full validators suite green.
- **Committed in:** N/A (no change needed)

**2. Cross-package `instanceof z.ZodError` unreliable — duck-typed instead**
- **Found during:** Task 1, first test run of `template-registry.test.ts`
- **Issue:** `expect(err).toBeInstanceOf(z.ZodError)` failed even though `err.name === 'ZodError'` and `err.constructor.name === 'ZodError'` — a dual-module-graph effect between `@breeyo/validators`' own `zod` import and `@breeyo/api`'s direct `zod` import, confirmed with a standalone throwaway test.
- **Fix:** Both `template-registry.ts`'s `renderTemplate` and `whatsapp.service.ts`'s variable-parsing helper check `err instanceof Error && err.name === 'ZodError'` and attach `statusCode`/`code` on that basis; the corresponding test assertions check `.name`/`.issues` rather than `instanceof`.
- **Verification:** All 17 `template-registry.test.ts` cases and all 14 `whatsapp.service.test.ts` cases pass, including the "missing variable -> 400" cases.
- **Committed in:** `88cb74e`, `93b2158`

**3. `WhatsAppService.prisma` typed as `PrismaClient`, not `DbClient`**
- **Found during:** Task 3, `tsc --noEmit` after first implementation of `sendTemplate`/`retryMessage`
- **Issue:** `this.prisma.$transaction(async (tx) => ...)` failed to type-check with `DbClient` (`TenantPrismaClient | PrismaClient`): "Each member of the union type ... has signatures, but none of those signatures are compatible with each other."
- **Fix:** Changed the constructor parameter's type to the raw `@prisma/client` `PrismaClient`, matching `WhatsAppRepository`'s own constructor typing and the plan's stated wiring (`fastify.prisma`, admin role, throughout this module).
- **Verification:** `pnpm --filter @breeyo/api exec tsc --noEmit` exits 0.
- **Committed in:** `93b2158`

---

**Total deviations:** 3 (1 no-op confirmation, 2 auto-fixed implementation details).
**Impact on plan:** None affect scope or behavior described in the plan's `<truths>`/`<behavior>` lists; all three are either a verification-only step or a TypeScript/test-infrastructure correction needed to make the plan's own described behavior compile and pass reliably.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The outbound send path (registry, repository, queues, authorization, service) is complete and covered by 69 unit tests + 14 real-database integration tests, all passing, with `tsc --noEmit` clean.
- 07-09 can now build the BullMQ `Worker` that consumes `whatsapp-outbound`/`whatsapp-simulator` jobs and calls the provider — this plan deliberately constructed no `Worker`.
- 07-11's reminder sweep can safely use `WA_REMINDER_KIND_TO_TEMPLATE` knowing it structurally cannot reach `payment_reminder`.
- 07-12/07-13 can wire `WhatsAppService`/`SendAuthorizationService` behind routes with `requirePermission('SEND_WHATSAPP')` and add the HTTP-level tests for send/opt-out/consent that this plan explicitly deferred.
- No blockers. One acknowledged Beta limitation carried over unchanged from context: WhatsApp consent capture has no UI in Phase 7 (D-24), so `consentWarning` will be non-null for every send until a future phase populates `ConsentRecord` rows — this plan's `WHATSAPP_SENT_WITHOUT_CONSENT` audit trail is exactly the mechanism designed to make that acceptable for Beta.

---
*Phase: 07-whatsapp-communication*
*Completed: 2026-08-15*
