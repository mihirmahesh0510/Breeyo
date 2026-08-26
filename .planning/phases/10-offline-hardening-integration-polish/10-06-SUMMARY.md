---
phase: 10-offline-hardening-integration-polish
plan: 06
subsystem: integration-proof-harnesses-offline-recovery-golden-path-whatsapp-flow
tags: [vitest, supertest, react-testing-library, maestro, TDD, integration-proof, D-25-to-D-33]
dependency_graph:
  requires: [10-01, 10-02, 10-03, 10-04, 10-05]
  provides: [offline-recovery-integration-proof, golden-path-integration-proof, whatsapp-triggered-flow-proof, browser-reconnect-stale-state-proof, maestro-device-drill-scripts]
  affects: []
tech_stack:
  added: []
  patterns:
    - real-postgres-http-integration-tests-via-buildTestApp-and-supertest
    - repeated-disconnect-reconnect-cycles-in-one-suite (D-27, D-33)
    - mocked-socket-handler-map-for-browser-replay-proof (matches Plan 10-05's own convention)
    - maestro-toggleAirplaneMode-android-only-network-drill
key_files:
  created:
    - apps/api/tests/integration/offline-recovery.e2e.test.ts
    - apps/api/tests/integration/walkin-to-payment.e2e.test.ts
    - apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts
    - apps/web/tests/integration/reconnect-live-sync.test.ts
    - apps/mobile/.maestro/offline-recovery.yaml
    - apps/mobile/.maestro/multi-drop-recovery.yaml
    - apps/mobile/.maestro/whatsapp-triggered-flow.yaml
  modified:
    - apps/api/src/middleware/error-handler.ts (forwards a 409's `.conflict` payload onto the wire -- real gap found and fixed, see below)
    - apps/api/tests/helpers/factories.ts (`cleanupTestData()` now deletes the four Phase 10 sync tables before `clinicMember`/`clinic` -- real gap found and fixed, see below)
    - vitest.config.ts (repo root; added the four Plan 10-06 integration test globs, a `setupFiles` bootstrap for the first root-included real-Postgres tests, and `fileParallelism: false`)
metrics:
  duration: ~1 session
  completed: 2026-08-25
  tasks_completed: 1
  tasks_total: 2
---

# Phase 10 Plan 06: Integration Proof Harnesses -- Offline Recovery, Golden Path, and WhatsApp-Triggered Flow Summary

Built the final Phase 10 proof suite Task 1 calls for: two new real-Postgres API integration test files proving repeated offline disconnect/reconnect cycles hold their integrity across all three offline domains (queue, EMR, inventory) and that the full walk-in-to-payment golden path survives reconnect with mobile/web visibility agreeing; a third API integration test proving the mandatory WhatsApp-triggered clinic flow (D-29) survives a real connectivity drop and return; a browser-side integration test proving replayed changes surface as review-before-overwrite prompts rather than silent overwrites; and three syntactically valid Maestro YAML drill scripts for the real-device human checkpoint that is explicitly **not** part of this plan's scope.

No new production behavior needed to be built to satisfy any of these flows -- every acceptance criterion in 10-06-PLAN.md was met by the code Plans 10-01 through 10-05 already shipped. Two small, genuine integration gaps were found and fixed while building the HTTP-level proof (see "Integration Gaps Found and Fixed" below), consistent with D-28's "fix integrity first."

## What Was Built

### Task 1: Automated integration and Maestro proof harnesses

- **`apps/api/tests/integration/offline-recovery.e2e.test.ts`** (5 tests) -- the primary "broader than one happy path" proof (D-25, D-26). Every test drives the REAL `/api/v1/queue/sync/replay`, `/api/v1/consultations/sync/replay`, and `/api/v1/inventory/sync/replay` endpoints over HTTP against a real Postgres database (no mocked Prisma delegate anywhere in this file) across independent, separately-submitted drop/recover cycles, not one clean reconnect at the end (D-33):
  - Cycle 1: two devices independently check in two different pets; a flapping resend of the same operation is a pure no-op.
  - Cycle 2: an offline clinical draft collides with a genuine online server-side edit -> a `SAFETY_CRITICAL` `SyncConflictRecord` is created (never a silent overwrite, D-05/D-06), survives a repeat reconnect without duplicating.
  - Cycle 3: a live FIFO mismatch (stock moved on while offline) routes to a lighter `OPERATIONAL` review task (D-10), never a raw failure or corrupted stock figure, and is itself idempotent on resend.
  - Cycle 4: two independently offline devices check in the SAME patient -- D-34's auto-merge produces exactly one queue entry with a review trace, from two genuinely separate drop/recover moments.
  - Final reconnect: after four separate cycles, resending every prior operationId across every domain together is a pure no-op and leaves zero unresolved conflicts -- the "subtle caught-up state" (D-21).
- **`apps/api/tests/integration/walkin-to-payment.e2e.test.ts`** (1 test) -- the mandatory golden path. Three of its five steps are genuinely captured offline and reconciled through their real replay endpoints (check-in via Plan 10-02, the SOAP note via Plan 10-03, the dispense via Plan 10-04, the dispense linked to the consultation so invoice generation picks it up); invoice finalize and payment collection are deliberately performed online, matching Phase 6 D-41 (billing/payment stay blocked offline; Phase 10's offline boundaries D-01 to D-04 do not extend to billing). Consistency is checked by reading the final state back through BOTH the mobile (`GET /queue`, `GET /billing/invoices/:id`) and the Plan 09-04 web (`GET /queue/web/board`, `GET /billing/web/workbench`) endpoints and asserting they agree. A real, useful discovery along the way: `EmrService.finalize`'s existing D-04 hook auto-completes the linked queue entry to `DONE` the moment the consultation finalizes -- the test asserts this directly rather than redundantly (and incorrectly) re-driving a manual `IN_CONSULT -> DONE` transition against an entry already in a terminal state.
- **`apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts`** (1 test) -- see "WhatsApp Flow Chosen" below for the concrete flow and why. Proves a CONFIRMED WhatsApp booking's swept `EXPECTED` queue entry survives the front-desk arrival check-in and a second, independent mid-visit drop, both captured offline and reconciled through the real `/api/v1/queue/sync/replay` endpoint, with the originating `WhatsAppBookingRequest`/`WhatsAppThread`/`Appointment` rows asserted untouched by any of the queue replays.
- **`apps/web/tests/integration/reconnect-live-sync.test.ts`** (4 tests) -- the browser-side proof. Composes the REAL `useReplayStaleState` + `StaleStateBanner` (Phase 9) + the Plan 10-05 domain-scoped `useQueueReplayRealtime`/`useInventoryReplayRealtime` hooks into small dashboard-widget harnesses (via `React.createElement`, since the plan names this file `.test.ts`, not `.test.tsx`) and proves: a queue-board tab shows the stale prompt when a mobile replay lands and "Refresh" clears it; an inventory tab ignores cross-domain noise but escalates to the conflict prompt for its own domain, which a later routine replay never silently downgrades back to "stale"; "Review changes" is a distinct, real callback rather than a no-op alias for "Refresh"; and -- since Plan 10-05 built no dedicated `useBillingReplayRealtime` hook (billing's own offline-recovery race is a stale-write rejection, not a mobile-replay broadcast, per D-41) -- a mocked 409 `STALE_WRITE_CONFLICT` response using the REAL wire shape (now correctly including `.conflict`, see below) is wired into the same domain-agnostic `useReplayStaleState.onReplayConflictOpened`, proving the reusable mechanism generalizes to billing's write-rejection path without needing new production code.
- **Maestro scripts** -- `offline-recovery.yaml` (one drop/recover cycle: offline check-in, offline SOAP note edit, offline barcode scan, reconnect, verify replay + no stuck items), `multi-drop-recovery.yaml` (three independent drop/recover cycles -- 8 `toggleAirplaneMode` calls total, one cycle including a rapid flap -- satisfying the named "more than one drop/recover cycle" acceptance criterion), `whatsapp-triggered-flow.yaml` (documents the un-scriptable WhatsApp-booking precondition explicitly, then drives the on-device arrival check-in and a second mid-visit drop against the swept `EXPECTED` entry). All three use Maestro's real, confirmed built-in `toggleAirplaneMode` command (Android-only -- see "Maestro network-toggle command" below) and reference real `testID`s/visible text confirmed against the actual shipped screens (`check-in-fab`, `check-in-mobile-input`, `queue-card-pending-sync`, `expected-check-in-now`, `inventory-scan-button`, `barcode-scanner-screen`, `manual-entry-trigger`, `manual-barcode-input`, the exact `OfflineBanner.tsx` copy) rather than invented ones. The inventory step deliberately stops at scan-and-cache (not a submitted stock action) because `DispenseScreen.tsx`/`StockAdjustmentSheet.tsx` are not yet wired to Plan 10-04's offline-capable hook (a scope boundary that plan's own summary already flagged) -- scripting a submit there would assert something the shipped app cannot actually do offline.

## Maestro network-toggle command (as the plan asked to research and report)

Confirmed via Maestro's own documentation (`docs.maestro.dev`, Android platform page): Maestro ships a built-in `toggleAirplaneMode` command (Android-only -- iOS simulators cannot flip airplane mode, which is itself part of why D-31 names mid-range **Android** hardware as the proof bar). No `setAirplaneMode: true/false` boolean-parameter variant is documented; only the toggle form exists. All three flow files use `toggleAirplaneMode` and rely on the device starting with airplane mode OFF -- every call is commented with the state it produces (`# now OFF -> ON` / `# now ON -> OFF`) so a human adapting the script never has to guess. No shell/ADB workaround was needed.

## WhatsApp Flow Chosen, and Why

Per `07-CONTEXT.md` D-06/D-08 and `booking.service.ts`'s own header comment ("Deliberately no walk-in queue row is ever created here ... a Phase 7 booking is provisional, not a walk-in check-in"), a confirmed WhatsApp booking does **not** itself put a patient on the walk-in queue. The concrete, real mechanism that DOES connect a WhatsApp booking to the queue -- and therefore the only mechanism a "WhatsApp-triggered clinic flow" proof can honestly be built around -- is:

**CONFIRMED `WhatsAppBookingRequest` → a WHATSAPP-sourced `Appointment` → Phase 8's `QueueHandoffService.createExpectedEntriesForDueAppointments` sweep produces an `EXPECTED` queue entry → front desk checks the patient in (referencing that booking-derived entry) when they physically arrive, per 07-CONTEXT.md's own "Check in manually when the owner arrives."**

This was chosen over inventing a flow (e.g. a WhatsApp reminder or a direct booking-to-queue shortcut) because it is the one already-shipped, already-tested cross-phase mechanism (`apps/api/tests/scheduling/queue-handoff.test.ts` is the existing precedent this new test's fixture-construction technique mirrors) that a WhatsApp origin genuinely flows through into the offline-hardened queue domain -- exactly the kind of "maps to real code, not an invented flow" the task asked for. The offline-recovery angle is added on top: the arrival check-in and a second, independent mid-visit drop are both captured offline and reconciled through the real Plan 10-02 queue replay endpoint, and the booking/thread/appointment rows are asserted untouched throughout, proving the WhatsApp origin of a queue entry gets no special-cased (and no broken) treatment from ordinary offline queue recovery.

## Integration Gaps Found and Fixed (D-28: fix integrity first)

Both were found only once real HTTP requests against a real Postgres database were driven through the replay endpoints for the first time -- neither was visible from any of Plans 10-01 to 10-05's own service-level tests, which all used mocked Prisma delegates or in-memory fakes.

1. **`apps/api/tests/helpers/factories.ts`'s `cleanupTestData()` did not delete the four Phase 10 sync tables before `clinic`/`clinicMember`.** `SyncReplayReceipt`/`SyncConflictRecord`/`SyncFailureTask`/`DeviceSyncCursor` each carry a `clinic Clinic @relation(...)` (correctly added back in Plan 10-01, learning from a Phase 9 `no-mistakes` finding about missing back-relations) -- but that FK alone is enough to block `tx.clinic.deleteMany()` with a violation the moment any test writes a real row into one of those four tables via an HTTP replay call, which none of Plans 10-01 to 10-05's own tests ever did. Fixed by adding the four `deleteMany()` calls in FK-safe order immediately before the existing Phase 3/4 cleanup block.
2. **`apps/api/src/middleware/error-handler.ts` never forwarded a thrown error's `.conflict` field onto the HTTP response.** Plan 10-05's `staleWriteConflictError(...)` (`browser-sync.service.ts`) attaches a rich `{ domain, entityType, entityId, currentVersion, expectedVersion, severity }` object to every 409 `STALE_WRITE_CONFLICT` -- mirroring `SyncConflictEnvelope`'s shape so a client can render an actual before/after comparison -- but the error handler only ever forwarded `.details`/`.clients`, never `.conflict`. A real HTTP 409 therefore reached the wire as a bare `{ code, message }`, indistinguishable from any other unstructured 409, and `StaleStateBanner`'s "conflict" state had no structured data to review even after Plan 10-05's own version-check services were unit-tested as correctly *throwing* the right shape. This directly undermines D-05 ("review before overwrite") on the exact write path Plan 10-05 built to enforce it. Fixed with a three-line additive forward (mirroring the existing `.details` block immediately above it), verified safe against every existing `STALE_WRITE_CONFLICT`-asserting test (none of them assert the *absence* of `.conflict`) and exercised directly in `reconnect-live-sync.test.ts`'s billing scenario, which constructs the exact post-fix response shape.

Both fixes are additive/backward-compatible; neither changes any existing passing test's expected behavior.

## Deviations From the Plan (flagged, not silently made)

1. **`apps/web/tests/integration/reconnect-live-sync.test.ts` renders via `React.createElement`, not JSX.** The plan's own file list names this file `.test.ts` (not `.test.tsx`), and `apps/web`'s Vite/esbuild pipeline only parses JSX syntax inside `.tsx`/`.jsx` files. Rather than silently renaming the file to `.tsx` (diverging from the plan) or writing a non-rendering test, the file stays exactly `reconnect-live-sync.test.ts` and builds every element via `createElement(...)`, which is valid in a plain `.ts` file and still exercises the real `StaleStateBanner`/`useReplayStaleState` components, not a mock.
2. **The billing scenario in `reconnect-live-sync.test.ts` does not use a dedicated `useBillingReplayRealtime` hook**, because Plan 10-05 did not build one (only `useQueueReplayRealtime`/`useInventoryReplayRealtime` exist) -- billing's own offline-recovery race is the write-side `expectedVersion`/409 mechanism (Phase 6 D-41: billing is never captured offline in the first place), not a mobile-replay broadcast. The test instead feeds a mocked 409 response's `.conflict` payload directly into the domain-agnostic `useReplayStaleState.onReplayConflictOpened`, proving the SAME reusable mechanism generalizes correctly rather than inventing a parallel one.
3. **`vitest.config.ts` (repo root) gained `setupFiles: ['apps/api/tests/helpers/setup.ts']` and `fileParallelism: false`**, neither named in the plan's `files_modified` list (only the four test globs were expected). Necessary reachability: this plan's three API integration files are the FIRST files in the root config's `include` list to need a real Postgres/Redis connection via `buildTestApp()` (every other root-included `apps/api` test uses a mocked Prisma delegate) -- without the env bootstrap, `PrismaClientInitializationError: DATABASE_URL not found` fails immediately; without disabling file parallelism, the three files' shared blanket `cleanupTestData()` truncates could race each other exactly as `apps/api/vitest.config.ts` already documents needing to prevent for its own equivalent real-DB suite.

## Task Commits

Task 1 -- the two integrity fixes (error-handler `.conflict` forwarding, factories.ts cleanup ordering), all four integration test files, the three Maestro scripts, and the root `vitest.config.ts` update -- is committed as a single commit per this plan's completion.

_TDD per the plan's own framing for integration proof: every test was written to describe the expected end-to-end behavior first, run against the already-shipped Plans 10-01 to 10-05 implementation, and (with the two exceptions above, found and fixed per D-28) passed without any new production code. The two fixes were made only after confirming via `git stash`/re-run that the specific assertions failed for the right integrity reason, not a test-authoring mistake, before being fixed._

## Verification

```
npx vitest run apps/api/tests/integration/offline-recovery.e2e.test.ts apps/api/tests/integration/walkin-to-payment.e2e.test.ts apps/api/tests/integration/whatsapp-triggered-flow.e2e.test.ts apps/web/tests/integration/reconnect-live-sync.test.ts
```
11/11 passing (5 + 1 + 1 + 4), run from the repo root exactly as the plan's `<verify>` block specifies.

Full-suite re-run after these changes, confirming zero regressions:
- `apps/api` full suite (real Postgres 16 + Redis 7): **175 test files (166 passed, 9 skipped -- pre-existing), 2149 tests (2069 passed, 80 todo -- pre-existing)**, 0 failed. Grew from 10-05's 172 files/2142 tests by exactly this plan's 3 new files / 7 new test cases.
- `apps/mobile` full suite: **52 test files, 847 tests passed**, 0 failed -- unchanged from 10-05 (this plan added no mobile test files).
- `apps/web` full suite: **13 test files, 102 tests passed**, 0 failed. Grew by exactly this plan's 1 new file / 4 new test cases.
- `packages/validators` full suite: **9 test files, 261 tests passed**, 0 failed -- unaffected.
- Root aggregate `npx vitest run` (the cross-package sweep `vitest.config.ts` defines): **73 test files, 1015 tests passed**, 0 failed. Grew from 10-05's 69 files/1004 tests by exactly this plan's 4 new files / 11 new test cases.
- `npx tsc --noEmit` in `apps/api` and `apps/web`: zero new type errors in any file this plan touched or created.

Maestro tests were **not** executed (`npx maestro test` was not run) -- no device/emulator is available in this environment, exactly as the plan anticipates. The three flow files were verified with a Python `yaml.safe_load_all` parse (each parses as two valid YAML documents: an `appId` header and a command list) and by cross-checking every referenced `testID`/visible-text string against the actual shipped screen source, not invented placeholders.

## Task 2 -- NOT done, and cannot be done by an agent

**Task 2 (the blocking human-verify checkpoint) has explicitly NOT been performed.** It requires a real mid-range Android device running the real mobile app against a real staging clinic account, a human physically toggling airplane mode and observing the app, and a human judgment call ("approved" or a described issue) per the plan's own `<resume-signal>`. No agent -- this one included -- can hold a phone, and no amount of additional automation substitutes for D-27's explicit requirement that Phase 10 proof include **real** disconnect/reconnect drills, not only mocked automation. This summary's automated proof (Task 1) is a necessary precondition for that checkpoint, not a replacement for it. **Phase 10 is not signed off until a human runs the three Maestro scripts above (or an equivalent manual drill) on real hardware and either approves or reports an issue to resume execution against.**

## Verify-Fix Follow-Up

Per `.planning/PHASE-10-VERIFY-FIX-PLAN.md` finding **10.3**: `reconnect-live-sync.test.ts` (this plan's own Task 1 harness) proves the reusable `useReplayStaleState`/`StaleStateBanner` MECHANISM correctly composed with the real production hooks -- but it does so in small purpose-built widget components (`renderDomainWidget`/`BillingWidget`), not the real `QueuePage`/`BillingPage`. A `no-mistakes --verify phase 10` pass found the real pages never actually mounted `useQueueReplayRealtime`/`useReplayStaleState`, and `QueueBoard.tsx`/`BillingWorkbench.tsx` hardcoded `<StaleStateBanner status="stale" .../>` regardless of what happened server-side -- so this file's own passing assertions did not prove what a real user would see. See `10-05-SUMMARY.md`'s Verify-Fix Follow-Up for the full fix description (broadcast wiring in the four domain replay services, `apiClient`'s `.conflict` forwarding, and the real-page wiring in `QueueBoard.tsx`/`useBillingWorkbench.ts`).

New real-page-level proof added alongside the existing hook-level harness (not replacing it -- both are valuable: this file proves the mechanism in isolation, the new tests prove the real page wires it up): `apps/web/src/features/queue/__tests__/queue-board.test.tsx` (3 new cases rendering the real `QueuePage`, simulating a scoped `replay:conflict-opened`/`replay:applied` socket event, asserting the real `StaleStateBanner` shows `"conflict"` vs `"stale"` copy) and `apps/web/src/features/billing/__tests__/billing-workbench.test.tsx` (1 new case rendering the real `BillingPage`, mocking a real 409 `STALE_WRITE_CONFLICT` response from `collect-payment`, asserting the same real banner shows the conflict copy).

Verify, run from the repo root:
```
npx vitest run apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx apps/web/tests/integration/reconnect-live-sync.test.ts apps/api/src/modules/sync/__tests__/replayIngest.service.test.ts apps/api/src/modules/queue/__tests__/queueOfflineReplay.service.test.ts apps/api/src/modules/emr/__tests__/consultationOfflineReplay.service.test.ts apps/api/src/modules/inventory/__tests__/inventoryOfflineReplay.service.test.ts
```
85/85 passing (17 + 19 + 18 + 15 + 12 + 4).

Full-suite re-run after this fix, confirming zero regressions:
- Root aggregate `npx vitest run` (the cross-package sweep `vitest.config.ts` defines): **76 test files, 1045 tests passed**, 0 failed. Grew from 10-06's original 73 files/1015 tests by exactly this fix's 3 new files (`api.test.ts`, plus the new cases added to `queue-board.test.tsx`/`billing-workbench.test.tsx`) / 30 new test cases.
- `apps/api` full suite (real Postgres 16 + Redis 7): **177 test files (168 passed, 9 skipped -- pre-existing), 2173 tests (2093 passed, 80 todo -- pre-existing)**, 0 failed.
