# Access Control Fix Plan

**Date:** 2026-08-27
**Source:** `/breeyo-build`-style whole-repo review (codex + Claude-native pass per phase, plus a dedicated CSO access-control/OWASP audit), all findings independently re-verified against current `main` before inclusion here.
**Scope:** Every confirmed-live access-control / cross-tenant-ownership gap. PR #17 (patient/queue permission fix) is already merged (`af96865`) — this plan covers what's left.

**Branch:** `fix/access-control-audit-findings`, worktree at `.claude/worktrees/fix-access-control`.

---

## Already fixed, not in this plan

- Patient & Queue RBAC gaps — merged via PR #17.
- Phase 1-3 cross-tenant patient/queue repository (raw admin client) — fixed by commit `5d8d408`, confirmed on current `main`.
- Phase 3 RLS policy GUC-name mismatch — the broken file no longer exists; `post-migrate.sql` has correct, enabled RLS for `pet_owners`/`queue_entries`/`consultations`/`vaccination_records` etc.
- Phase 7 WhatsApp Cloud API webhook handler-wiring gap — fixed in Phase 8 (`08-11-SUMMARY.md`), confirmed on current `main`.

## Findings in this plan

### AC-1. `/queue/sync/replay` has no RBAC permission check — **found during this fix pass, not by the original audit**

- **File:** `apps/api/src/modules/queue/queue.routes.ts` (the `fastify.post('/queue/sync/replay', ...)` registration)
- **Root cause:** every other queue-mutating route uses `manageHandler` (`[authenticate, tenantContext, requirePermission('MANAGE_QUEUE')]`); this one uses bare `preHandler` (`[authenticate, tenantContext]`) — no permission check at all.
- **Fix:** change `preHandler` to `manageHandler` on this route registration. TDD: failing test hitting this route as a non-MANAGE_QUEUE role, asserting 403.

### AC-2. `/queue/web/entries/:queueEntryId/status` checks browser-module-access but not the RBAC permission underneath it — **found during this fix pass**

- **File:** `apps/api/src/modules/queue/queue.routes.ts` (`webQueuePreHandler`)
- **Root cause:** `requireBrowserModuleAccess('QUEUE')` gates whether the *browser surface* is enabled for that role — it's a different dimension from `MANAGE_QUEUE` (whether the role can mutate queue state at all). The GET board route being view-only is fine with just browser-access; the POST status-update route needs both.
- **Fix:** for the POST route specifically, use `[...preHandler, requireBrowserModuleAccess('QUEUE'), requirePermission('MANAGE_QUEUE')]` instead of the shared `webQueuePreHandler`. TDD: failing test proving a role with browser access enabled but no `MANAGE_QUEUE` gets 403 on the POST route (GET stays allowed).

### AC-3. EMR, attachment, and vaccination modules have zero permission checks

- **Files:** `apps/api/src/modules/emr/emr.routes.ts` (all 15 routes), `apps/api/src/modules/attachment/attachment.routes.ts`, `apps/api/src/modules/vaccination/vaccination.routes.ts`
- **Root cause:** these modules were never given the `requirePermission` pass every sibling module (billing, scheduling, inventory, patient, queue) has.
- **Fix:** mirror the `viewHandler`/`editHandler` pattern from `patient.routes.ts`/`queue.routes.ts`: `viewHandler = [authenticate, tenantContext, requirePermission('VIEW_EMR')]` on GET routes, `editHandler = [authenticate, tenantContext, requirePermission('EDIT_EMR')]` on mutating routes, across all three files. `drug.routes.ts` stays unchanged (reference data, available to all clinical roles by design — already checked, not a gap). TDD: failing test per module proving a role without `VIEW_EMR`/`EDIT_EMR` (e.g. Front Desk, Inventory Manager) gets 403.
- Also close the same gap in the offline-replay path: `apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts` has no permission check at all, unlike `inventoryOfflineReplay.service.ts`'s equivalent per-entity `INVENTORY_PERMISSIONS` check (documented in `dispense.routes.ts`, added because the route-level preHandler can't see into a domain-specific replay payload). Add the equivalent `EDIT_EMR` check inside the EMR replay service.

### AC-4. `EmrService.createConsultation` doesn't verify `petId` belongs to the caller's clinic

- **File:** `apps/api/src/modules/emr/emr.service.ts` (`createConsultation`)
- **Root cause:** the method takes `clinicId` and `petId` as independent parameters and never checks the referenced pet actually belongs to that clinic before creating the `Consultation` row. RLS can't catch this — it protects the row being written (`Consultation.clinicId`), not a foreign-key target in another table (`Pet.clinicId`). `saveDraft` in the same file already has the right pattern (a comment explicitly explains why it verifies clinic ownership before touching anything) — `createConsultation` needs the same treatment for `petId`.
- **Fix:** before creating the consultation, look up the pet by `petId` scoped to `clinicId` (e.g. `this.repository.findPetInClinic(clinicId, petId)` or equivalent) and 404/reject if it doesn't resolve. TDD: failing test creating a consultation with a `petId` belonging to a different clinic, asserting rejection, then confirm no `Consultation` row was created.

### AC-5. `AttachmentService.generateUploadUrl` doesn't verify `consultationId` belongs to the caller's clinic

- **File:** `apps/api/src/modules/attachment/attachment.service.ts` (`generateUploadUrl`)
- **Root cause:** `confirmUpload`/`getAttachments`/`deleteAttachment` all check consultation ownership before proceeding — `generateUploadUrl`, the entry point that actually creates the `ConsultationAttachment` row and returns an S3 upload URL, does not.
- **Fix:** add the same clinic-ownership check the other three handlers already do, before the file-count check and row creation. TDD: failing test calling `generateUploadUrl` with a `consultationId` owned by a different clinic, asserting rejection and no row created.

### AC-6. `WhatsAppService.sendTemplate` doesn't verify `ownerId` belongs to the caller's clinic

- **File:** `apps/api/src/modules/whatsapp/whatsapp.service.ts` (`sendTemplate`) and/or `apps/api/src/modules/whatsapp/send-authorization.service.ts` (`authorize`)
- **Root cause:** `authorize()` checks opt-out preferences and consent, both keyed purely by `ownerId` with no clinic scoping; `sendTemplate` never separately verifies the owner belongs to `actor.clinicId` before creating/updating a `WhatsAppThread`. Every other owner-scoped handler in this module (`updateOwnerPreferenceHandler`, `getOwnerPreferenceHandler`) does this check — `sendTemplate` is the one gap.
- **Fix:** add a clinic-ownership check on `input.ownerId` at the top of `sendTemplate` (or inside `authorize`, if that's the more natural chokepoint — both call sites should end up protected either way), before any thread/consent lookup. TDD: failing test sending a template with an `ownerId` belonging to a different clinic, asserting rejection.

### AC-7. `FrontDesk` role has no `VIEW_EMR`, contradicting PRD-04's Front Desk persona — **found during doc-accuracy review of this fix pass, not by the original audit**

- **File:** `apps/api/prisma/seed.ts` (`DEFAULT_ROLE_PERMISSIONS.FrontDesk`)
- **Root cause:** `Product/prds/PRD-04-emr-clinical-records.md`'s Front Desk persona (Rekha) requires "read-only access to finalized consultation records and medical history" and PDF generation, but `FrontDesk` in `seed.ts` has never included `VIEW_EMR`/`EDIT_EMR`. Before AC-3, EMR routes had zero permission checks, so Front Desk could reach them anyway and the mismatch was harmless in practice. AC-3 now gates all EMR reads behind `VIEW_EMR`, so Front Desk is fully blocked from the EMR access PRD-04 says it needs.
- **Decision (confirmed):** grant `FrontDesk` `VIEW_EMR` (read-only) in `DEFAULT_ROLE_PERMISSIONS.FrontDesk`, matching PRD-04. Do **not** grant `EDIT_EMR` — Front Desk must stay unable to create/edit clinical records, only read finalized ones.
- **Fix (not yet implemented):** add `'VIEW_EMR'` to the `FrontDesk` array in `apps/api/prisma/seed.ts`. TDD: failing test asserting Front Desk can read EMR routes (e.g. `GET /pets/:petId/history`) but still gets 403 on `EDIT_EMR` routes (e.g. `POST /consultations`).
- **Status:** decision confirmed, implementation outstanding — this is a source code + test change and is out of scope for a docs-only pass; needs a code-fix phase to execute.

---

## Execution order

AC-1/AC-2 (queue routes) are small and independent — do first. AC-3/AC-4 (EMR module) touch the same files, do together. AC-5 (attachment) is its own module, independent. AC-6 (WhatsApp) is its own module, independent. AC-4/AC-5/AC-6 can proceed in any order relative to each other.

## Verification

Full regression suite (root aggregate + `apps/api` + `apps/mobile` + `apps/web`) after all fixes land, then push through the `no-mistakes` gate per this project's standard workflow.

## Execution status

| Finding | Status | Commit |
|---|---|---|
| AC-1 | Fixed, TDD, independently re-verified | `ac1b915` |
| AC-2 | Fixed, TDD, independently re-verified | `ac1b915` |
| AC-3 | Fixed, TDD, independently re-verified (140/140 targeted tests) | `aca3154` |
| AC-4 | Fixed, TDD, independently re-verified | `aca3154` |
| AC-5 | Fixed, TDD (RED confirmed before implementation) | `5ef6397` |
| AC-6 | Fixed, TDD (RED confirmed before implementation) | `5ef6397` |
| AC-7 | Decision confirmed (grant FrontDesk `VIEW_EMR`); implementation (seed.ts + TDD) not yet done | — |

Full regression (root `pnpm test` via turbo, all 8 packages) run against a clean DB: **8/8 tasks passed, zero failures.**
- `@breeyo/api`: 177 files passed | 9 skipped, 2211 tests passed | 80 todo (2291 total). The 9 skipped files are pre-existing (`tests/inventory/*.test.ts`), unrelated to this batch.
- `@breeyo/mobile`: 58 files passed, 905 tests passed.
- `@breeyo/web`: 14 files passed, 110 tests passed.

**Correction to an earlier finding from this fix pass:** `tests/sync/retry-escalation-routes.test.ts` was earlier flagged as having 2 pre-existing failing tests (cross-tenant retry/escalate requests expecting 404, getting 200/409), confirmed via `git stash`/`git stash pop` isolation at the time. Re-running the full suite against a properly truncated test database now shows all 12 tests in that file passing cleanly. The earlier failure was traced to accumulated stale fixture rows left behind by interrupted test runs during this session (`cleanupTestData()`'s transaction rolls back entirely on any FK-violation mid-transaction, so a single interrupted run compounds garbage across every subsequent run until the DB is manually truncated) — not a genuine tenant-isolation code bug. No code change was made or needed for this file; the stash/pop isolation check that "confirmed" it as pre-existing was a valid test of "not caused by my diff," but the underlying premise that it was a *real, deterministic* bug was wrong. Recorded here so this false alarm isn't carried into a future audit.
