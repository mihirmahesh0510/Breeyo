# Whole-Repo Audit Fix Plan

**Date:** 2026-08-28
**Source:** Findings from the whole-repo review conducted earlier this session (Workflow-based codex+Claude review per phase, 3 parallel CSO-style security agents, direct GitHub-state sweep). That review's output was never written to a persisted doc — only summarized in conversation — so every finding below was independently re-verified against current `main` (post Phase 10, post access-control fix batch PR #24, post UI rebrand) before being included here.
**Scope:** The remaining Medium/Low findings deferred when the access-control batch (PR #24) was prioritized first, plus one mistake from this session's own earlier work (WR-10).

**Branch:** `fix/whole-repo-audit-findings`, worktree at `.claude/worktrees/fix-whole-repo-findings`.

---

## Findings

### WR-1. Sync-idempotency race in 3 of 4 offline-replay services — duplicate side effects on concurrent replay

- **Files:** `apps/api/src/modules/inventory/services/inventoryOfflineReplay.service.ts` (check ~241-255, `recordReceipt` ~275-292), `apps/api/src/modules/queue/services/queueOfflineReplay.service.ts` (~172-185, ~236-250), `apps/api/src/modules/emr/services/consultationOfflineReplay.service.ts` (~235, ~391)
- **Root cause:** Each does `findUnique` on `SyncReplayReceipt` → if absent, runs the real mutation → only afterward `create`s the receipt, with no try/catch around that `create`. Two concurrent replays of the same `operationId` can both pass the `findUnique` check before either commits, so both execute the mutation (e.g. both dispense stock, both check in the same queue entry). The unique constraint on `SyncReplayReceipt(clinicId, deviceId, operationId)` (schema.prisma) rejects the second `create` with P2002, but uncaught — it surfaces as an unhandled 500 *after* the duplicate side effect already ran.
- **Already fixed once, not propagated:** `apps/api/src/modules/sync/services/replayIngest.service.ts` (~290-317, "Verify-fix 10.9") already has the correct pattern: wrap the `create` in try/catch, treat P2002 as "lost the race," return the winner's ack. That fix never propagated to the three domain-specific services above.
- **Fix:** Apply the same try/catch-P2002-and-return-ack pattern to `recordReceipt` in all three services. TDD: failing test simulating two concurrent replays of the same operationId, asserting exactly one mutation applied and both requests return the same successful ack (not one 500).
- **Revised during no-mistakes review:** the initial try/catch-P2002-*after*-mutation port (`a3c4e43`) still let two concurrent replays both pass the `findUnique` check and both run the mutation before either `create`d its receipt. Reworked to reserve the receipt (`create`) *before* the mutation in all three services — only the request that wins the receipt-create race proceeds; the loser acks as a duplicate without touching the mutation at all. If the mutation then throws, `releaseReceipt` deletes the reservation so a legitimate retry isn't permanently told "already handled" — but only while the write is not yet durable; once a conflict/entry/movement record has actually committed, a later broadcast-only failure must not release the receipt (that would let a retry create a duplicate durable record). See `recordReceipt`/`releaseReceipt` in `consultationOfflineReplay.service.ts`, `inventoryOfflineReplay.service.ts`, and `queueOfflineReplay.service.ts`.

### WR-2. Stock-movement ledger race — derived running-total corrupted under concurrent writes

- **File:** `apps/api/src/modules/inventory/stock-movement.service.ts` (`recordMovement`, ~49-54)
- **Root cause:** Reads `lastMovement` via plain `findFirst` (no lock), computes `runningTotal = lastMovement.runningTotal + quantity` in application code, then `create`s — under Postgres's default Read Committed isolation (confirmed: no caller sets `isolationLevel`), two concurrent movements on the same item both read the same `lastMovement` before either commits, both compute the same `runningTotal`, both insert. The ledger's running-balance column is wrong for one of the two rows. Called from `stock-adjustment.service.ts`, `stock-receipt.service.ts`, `stock-take.service.ts`, none of which lock any row first. `fifo-dispense.service.ts` is safe *for dispense-vs-dispense* only (it locks `stock_batches` via `SELECT ... FOR UPDATE`), but that lock doesn't block adjust/receipt/stock-take, which touch no batch row — cross-path races (e.g. dispense vs. adjust) remain exposed.
- **Fix:** Hold `SELECT ... FOR UPDATE` on the `InventoryItem` row (or the last `StockMovement` row) for the item at the top of every mutating transaction before computing `runningTotal`. TDD: two genuinely concurrent `recordMovement` calls for the same item (matching the pattern already used in `queue-web-optimistic-concurrency.test.ts`/`billing-web-optimistic-concurrency.test.ts` for real-concurrency tests), asserting both movements get correct, non-colliding running totals.

### WR-3. Refund stuck in `pending` forever if the Razorpay webhook is ever lost

- **File:** `apps/api/src/modules/billing/refund.service.ts` (`reserveDigitalLeg`, ~782-820)
- **Root cause:** Writes a refund row with `status: 'pending'`, by design never touched again by this service — only `apps/api/src/modules/billing/webhook.worker.ts`'s `EVENT_REFUND_PROCESSED`/`EVENT_REFUND_FAILED` handlers move it forward. No cron/job exists anywhere in `apps/api/src/jobs/` that polls Razorpay's refund-status API or re-drives stuck `pending` rows. If the webhook is ever lost (endpoint downtime, rotated secret, dropped delivery), the row stays `pending` forever with no reconciliation path.
- **Fix:** Add a scheduled job (same BullMQ pattern as `scheduling.sweep.worker.ts`) that finds `Refund` rows with `status='pending'` older than N minutes and a `razorpayRefundId` set, calls Razorpay's `refunds.fetch`, and writes back `processed`/`failed`. TDD: failing test creating a stale-pending refund row, running the job, asserting it calls the Razorpay client and updates status based on the mocked response.

### WR-4. Scheduling sweep: one bad appointment blocks the entire batch, every run, indefinitely

- **File:** `apps/api/src/modules/scheduling/queue-handoff.service.ts` (`createExpectedEntriesForDueAppointments` loop ~59, `autoFlipExpiredExpected` loop ~162)
- **Root cause:** Neither loop has a per-appointment try/catch. `scheduling.sweep.worker.ts` only wraps each *pass* as a whole. Both driving queries are ordered `scheduledFor: 'asc'`, `take: 200`, unscoped by clinic. If any single appointment throws (bad data, constraint violation), the exception unwinds the whole loop — every appointment after it in that batch is skipped. Because the same offending appointment is always first (its marker column never gets set), it re-fails on every subsequent 5-minute sweep, permanently blocking queue-handoff/no-show processing for every later appointment, across every clinic, until manually fixed.
- **Fix:** Move the try/catch inside each `for` loop; log+collect per-appointment errors; `continue` past the failing appointment so later ones still process. TDD: failing test seeding one appointment that throws (e.g. malformed data) followed by others that shouldn't, asserting the later ones still get processed and the error is logged/collected, not swallowed silently or batch-fatal.

### WR-5. `onDutyRoster` ignores real vet availability

- **File:** `apps/api/src/modules/sync/services/onDutyRoster.service.ts` (`ClinicVetRosterProvider.listOtherOnDutyClinicianIds`, ~25-39)
- **Root cause:** Calls only `AvailabilityRepository.listClinicVets` (active clinic membership + `EDIT_EMR` permission) minus `listAdminUserIds`. Never queries `VetAvailabilityTemplate`, `AvailabilityOverride`, or `BlockedPeriod`. "On duty" really means "any active, non-admin clinician on the roster," regardless of whether they're scheduled to work right now, on a day off, or blocked. Used by conflict-resolution/escalation to pick a hand-off clinician — a `SAFETY_CRITICAL` conflict could be escalated to a clinician who is off/on leave/blocked, while a genuinely available vet is ignored.
- **Fix:** After excluding admins, additionally filter candidate ids against the availability-resolution logic `availability.service.ts` already uses for booking-slot computation (template day/hours minus overrides minus blocked periods at current time). TDD: failing test with one clinician on an active `BlockedPeriod` right now and another genuinely on-shift, asserting only the on-shift one is returned.

### WR-6. `retryEscalation` routes have no owner/permission check

- **Files:** `apps/api/src/modules/sync/routes.ts` (`POST /sync/failures/:failureTaskId/retry` ~53, `/escalate` ~109-116), `apps/api/src/modules/sync/controllers/retryEscalation.controller.ts` (~60-94), `apps/api/src/modules/sync/services/retryEscalation.service.ts` (`assignOriginatingUserRetry`/`escalate`, ~166-175, ~256-265)
- **Root cause:** Both routes use `preHandler = [authenticate, tenantContext]` only — no `requirePermission(...)`, unlike the established pattern in `queue.routes.ts`/`billing.routes.ts`/`scheduling.routes.ts`. The controller never reads `request.user.id`; the service methods take only `(kind, id)` — no caller identity, no comparison against the row's `currentOwnerUserId`. Any authenticated staff member in the clinic (front-desk included — RLS only scopes by `clinicId`) can retry/escalate a `SyncFailureTask`/`SyncConflictRecord` they don't own, including a `SAFETY_CRITICAL` conflict currently owned by a specific clinician. `tests/sync/retry-escalation-routes.test.ts` only proves tenant isolation, never non-owner rejection within the same clinic.
- **Decision (confirmed with user):** only the current owner (`currentOwnerUserId`) may retry or escalate — no new permission code, mirrors the existing assignment model.
- **Fix:** Add a check comparing `request.user.id` to the row's `currentOwnerUserId` in the controller/service, returning 403 otherwise. TDD: failing test where a non-owner staff member in the same clinic gets 403 on both retry and escalate; the actual owner still succeeds.

### WR-7. CSV-injection in both inventory export paths

- **Files:** `apps/mobile/src/features/inventory/services/csv-export.service.ts` (`toBOMPrefixedCSV` ~103-105 via `Papa.unparse`, callers `mapMovementsToRows` ~70-80, `mapWantListToRows` ~91-100), `apps/api/src/modules/inventory/inventory-web.service.ts` (`exportAnalyticsCsv` ~335-348, `csvEscape` ~369-374, served at `GET /inventory/web/exports/analytics.csv`)
- **Root cause:** Neither path neutralizes a leading `=`, `+`, `-`, or `@` in user-controlled cell values (item names, stock-adjustment reasons, categories). Papaparse's `unparse` and the hand-rolled `csvEscape` both only handle RFC-4180 quoting (commas/quotes/newlines) — not formula-injection. A clinic staff member naming an item `=HYPERLINK(...)` or a reason starting with `=cmd|...` gets that written verbatim; opening the export in Excel/Sheets executes it as a formula.
- **Fix:** Before writing any user-controlled cell, if the value starts with `=`, `+`, `-`, or `@` (after existing quote/comma escaping), prefix it with a `'` to force literal-text treatment. Apply to `csvEscape` in `inventory-web.service.ts`, and add an equivalent sanitizer wrapping the row-building in the mobile `csv-export.service.ts` before handing rows to `Papa.unparse`. TDD: failing test exporting an item/reason whose name starts with each of `=`/`+`/`-`/`@`, asserting the output cell is prefixed and doesn't start with the raw trigger character.

### WR-8. Owner-portal "View Receipt" opens raw JSON instead of a formatted receipt

- **Files:** `apps/web/src/features/owner-portal/hooks/usePortalReceiptUrl.ts` (~44,48), `apps/web/src/features/owner-portal/components/InvoiceDetailSheet.tsx` (~59), `apps/api/src/modules/owner-portal/receipt.controller.ts` (~49)
- **Root cause:** The anchor `href` for "View Receipt" points straight at the API endpoint, which returns a bare `200 application/json` body (`{ data: { invoiceId, receiptNumber, amountPaise, ... } }`) — no HTML template, no PDF, no content negotiation. A pet owner tapping the link sees raw JSON in their browser.
- **Fix:** Add an internal Next.js page/route (e.g. `/owner-portal/[token]/invoices/[invoiceId]/receipt`) that fetches the JSON server-side and renders it as a formatted HTML receipt; point the anchor there instead of directly at the API contract endpoint. TDD: a component/integration test asserting the receipt link resolves to the new internal route and renders formatted fields (amount as ₹, not paise; formatted date), not raw JSON.

### WR-9. Owner-portal magic-link scope frozen at issuance (stale under-scope, not over-access)

- **Files:** `apps/api/src/modules/owner-portal/portal-link-issuance.service.ts` (~89-110), `apps/api/src/modules/owner-portal/access-scope.service.ts` (`deriveScope` ~57-69, `isPetInScope`/`isInvoiceInScope` ~71-82), `apps/api/src/modules/owner-portal/portal-reissue.service.ts` (~101-102)
- **Root cause:** The link stores a fixed JSON snapshot of pet/invoice ids at issuance time (`allowedPetIdsJson`/`allowedInvoiceIdsJson`); every request re-parses that frozen list rather than querying current state. Reissue (e.g. after 7-day expiry) copies the old snapshot forward verbatim, so staleness compounds across reissues. Re-verified: no pet-transfer-between-owners feature exists today (confirmed in `patient.repository.ts`), so the over-access scenario originally hypothesized isn't currently triggerable — but a new invoice or pet added after issuance simply never appears in the portal for the life of the link (and any reissues), which is a real functional gap and a latent risk if a future feature needs to *revoke* access.
- **Fix:** Replace the frozen snapshot with a live scope check — store only `ownerId`/`clinicId` on the link, and have `AccessScopeService` query current `pet`/`invoice` rows by `ownerId` at request time (mirroring what `portal-records.service.ts` already does for consultation finalization). TDD: failing test issuing a link, then creating a new invoice for that owner, asserting the new invoice IS visible through the existing link without reissue.

### WR-10. Queue-preemption enforcement wired into an endpoint no real client calls — this session's own mistake

- **Files:** `apps/api/src/modules/sync/services/replayIngest.service.ts` (~225-234, calls `pauseLowerTierReplayForQueue`), `apps/api/src/modules/sync/routes.ts` (~74-103, `POST /sync/replay` — the only caller of `ReplayIngestService.ingest()`), `apps/api/src/modules/queue/controllers/queueSync.controller.ts` (~152, calls only the trivially-true `canRunQueueReplayNow()`), EMR/inventory replay controllers (reference `QueuePreemptionService` nowhere)
- **Root cause:** The mobile app's real reconnect/replay flow (`apps/mobile/src/features/offline-sync/services/buildReplayCycleDeps.ts`, `REPLAY_PATH_BY_DOMAIN`) only ever calls the three domain-specific endpoints (`/queue/sync/replay`, `/inventory/sync/replay`, `/consultations/sync/replay`) — never the generic `/sync/replay` that carries the preemption enforcement. Confirmed via repo-wide grep: zero references to the generic path in `apps/mobile/src/`. The enforcement code is unreachable in practice.
- **Fix:** Have each domain-specific controller (queue, EMR, inventory) call `QueuePreemptionService.pauseLowerTierReplayForQueue()` before applying its own mutation, using a server-computed `queueHighPendingCount` for that clinic/device (same computation `replayIngest.service.ts` already does). TDD: failing test simulating a pending QUEUE_HIGH replay item, then attempting an INVENTORY_MEDIUM replay through `/inventory/sync/replay`, asserting it's deferred/paused rather than applied immediately.

### Reclassified, not a new fix item

- **"Stock-adjustment race"** (original audit label) — **not live**: `stock-adjustment.service.ts`'s `currentStock` mutation already uses an atomic `increment` inside `prisma.$transaction`, immune to lost updates. Re-verification found a smaller residual gap instead: the pre-check (`currentStock < quantity`) reads outside the transaction, so two concurrent "remove" requests can both pass a stale check and both apply, permitting stock to go negative. Worth a follow-up (move the check inside the transaction, or add a DB `CHECK (current_stock >= 0)` constraint) but not included as a numbered fix here — flag to the user as a bonus, lower-priority item if wanted.

---

## Execution order

WR-2, WR-4, WR-5, WR-10 are single-file, independent — do first. WR-1 and WR-7 each touch 2-3 files but are still mechanical (propagate an existing pattern) — do next. WR-6 needs the confirmed owner-only policy wired through controller+service. WR-3, WR-8, WR-9 are the largest (new job, new web route, live-query architecture change) — do last.

## Verification

Full regression suite (root aggregate + `apps/api` + `apps/mobile` + `apps/web`) after all fixes land, then push through the `no-mistakes` gate per this project's standard workflow.

## Execution status

| Finding | Status | Commit |
|---|---|---|
| WR-1 | Fixed, TDD, independently re-verified; reworked twice more under no-mistakes review after landing (reserve-before-mutate instead of try/catch-after, then narrowed `releaseReceipt` to fire only before the durable write commits) | `a3c4e43`, `f7b5be3`, `4ef55aa`, `77776ca`, `18ab187` |
| WR-2 | Fixed, TDD, independently re-verified (bonus: same race found and fixed in `stock-receipt.service.ts`) | `756b4fd` |
| WR-3 | Fixed, TDD, independently re-verified | `487a758` |
| WR-4 | Fixed, TDD, independently re-verified | `bb38d13` |
| WR-5 | Fixed, TDD, independently re-verified | `99bd934` |
| WR-6 | Fixed, TDD, independently re-verified (also fixed a pre-existing test bug exposed by correct enforcement) | `87e3d3a` |
| WR-7 | Fixed, TDD, independently re-verified (both mobile + web export paths) | `fabfac3` |
| WR-8 | Fixed, TDD, independently re-verified | `2ad4bbe` |
| WR-9 | Fixed, TDD, independently re-verified (cascaded to every consumer of the frozen scope arrays) | `e766645` |
| WR-10 | Fixed, TDD, independently re-verified (required a small mobile-side change too — client-reported-but-server-verified pending count, since the domain-specific endpoints never see a mixed-priority batch the way the generic endpoint does) | `bf1f010` |

Full regression (root `pnpm test` via turbo, all 8 packages) run against a clean DB: **8/8 tasks passed, zero failures.**
- `@breeyo/api`: 182 files passed | 9 skipped, 2256 tests passed | 80 todo (2336 total). The 9 skipped files are the same pre-existing `tests/inventory/*.test.ts` skips seen throughout this project, unrelated to this batch.
- `@breeyo/mobile` and `@breeyo/web`: both clean (confirmed via each finding's own targeted full-suite run; WR-7 confirmed mobile 58/58, WR-8 confirmed web 16/117 test files/tests).

**Process note:** the first 4 fixes (WR-2, WR-4, WR-5, WR-7) were dispatched in parallel against the same shared local dev Postgres, which caused transient cross-agent test contention (FK-violation/deadlock noise, and one flagged instance of a truncate command colliding with sibling agents' in-flight fixtures). No data of consequence was at risk — this is an ephemeral local test-only database — but it produced confusing noise and one legitimate security-classifier flag. From WR-1 onward, every fix was dispatched strictly sequentially to avoid repeating this.
