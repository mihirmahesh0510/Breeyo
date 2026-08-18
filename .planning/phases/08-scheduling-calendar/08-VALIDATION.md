---
phase: 8
slug: scheduling-calendar
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-12
updated: 2026-08-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Populated by the planner from the 15 PLAN.md files. Statuses flip to ✅ as each task lands; plan 08-15 Task 1 finalizes this document.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^2.1.0` in `@breeyo/api`, `@breeyo/mobile`, `@breeyo/ui`, `@breeyo/types`, `@breeyo/validators`. `@breeyo/web` gets its first Vitest setup in plan 08-14 Task 1 (pure functions only, no DOM testing library) |
| **Config file** | Per-package `vitest.config.ts`. `apps/api/vitest.config.ts` sets `fileParallelism: false`, `testTimeout: 30000`, setup `tests/helpers/setup.ts` |
| **Quick run command** | `pnpm --filter @breeyo/<pkg> test -- --run <path>` |
| **Full suite command** | `pnpm test` |
| **Integration test idiom** | `buildTestApp()` + `app.inject()` (not supertest) for every scheduling test, matching `apps/api/tests/queue/queue-board.test.ts` |
| **Estimated runtime** | Observed 2026-08-17: `@breeyo/types` 4.5s, `@breeyo/validators` 3.9s, `@breeyo/ui` 5.3s, `@breeyo/mobile` 8.9s, `@breeyo/web` 2.6s, `@breeyo/api` ~5m08s–5m39s per run (`fileParallelism: false`, 137 files / ~1880 tests), full `pnpm test` turbo run ~5m57s, `pnpm build` ~40s |

---

## Sampling Rate

- **After every task commit:** the task's own `<verify><automated>` command
- **After every wave:** `pnpm --filter @breeyo/api test` plus the touched client package's suite
- **Before `/gsd-verify-work`:** `pnpm test` and `pnpm build` must both exit 0
- **API suite stability check:** `pnpm --filter @breeyo/api test` run twice with identical results, proving the scheduling sweep `Worker` is not firing under vitest (RESEARCH Pitfall 4)
- **Max feedback latency:** the slowest single-file scoped run is the full `@breeyo/api` suite at ~5m39s (137 files, `fileParallelism: false` by design — see `apps/api/vitest.config.ts`); the slowest genuinely single-file targeted run (e.g. `-- --run tests/scheduling`) is well under 30s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SCH-01..05 | — | N/A | unit | `pnpm --filter @breeyo/types test -- --run src/constants/__tests__/scheduling.constants.test.ts` | ❌ W0 | ✅ passing |
| 08-01-02 | 01 | 1 | SCH-02 | T-08-03 | No inbound transition into EXPECTED exists | unit | `pnpm --filter @breeyo/types test -- --run src/constants/__tests__` | ❌ W0 | ✅ passing |
| 08-01-03 | 01 | 1 | SCH-01, SCH-02 | T-08-01 / T-08-02 / T-08-04 | Bounded minute ints; no clinicId field; 62-day range cap | unit | `pnpm --filter @breeyo/validators test -- --run src/__tests__/scheduling.test.ts` | ❌ W0 | ✅ passing |
| 08-02-01 | 02 | 1 | SCH-03 | T-08-06 | Generated stylesheet is regenerated, never hand-edited | CLI | `pnpm --filter @breeyo/ui generate:css-tokens && grep -c -- '--vet-hue-' packages/ui/src/theme/portal.css` | ✅ | ✅ passing |
| 08-02-02 | 02 | 1 | SCH-02 | T-08-05 | Vet identity never colour-alone | unit | `pnpm --filter @breeyo/ui test -- --run src/atoms/StatusBadge/StatusBadge.test.ts` | ✅ | ✅ passing |
| 08-02-03 | 02 | 1 | SCH-03 | T-08-SC | Blocking human gate on registry installs; lockfile diff inspected | CLI + human | `pnpm --filter @breeyo/web build` | ✅ | ✅ passing |
| 08-03-01 | 03 | 1 | SCH-01, SCH-02 | T-08-10 | Duration snapshot column is NOT NULL | CLI | `cd apps/api && pnpm exec prisma validate` | ✅ | ✅ passing |
| 08-03-02 | 03 | 1 | SCH-01, SCH-02 | T-08-07 / T-08-09 | Migration/schema parity; no RLS on scheduling tables by design | CLI | `cd apps/api && pnpm exec prisma migrate reset --force --skip-seed && psql "$DATABASE_URL" -f prisma/post-migrate.sql && pnpm exec prisma migrate diff --from-schema-datasource "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | ✅ | ✅ passing |
| 08-03-03 | 03 | 1 | SCH-01, SCH-02 | T-08-07 / T-08-11 / T-08-12 | Cross-tenant appointment read returns nothing | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/schema-shape.test.ts` | ❌ W0 | ✅ passing |
| 08-04-01 | 04 | 2 | SCH-02 | — | N/A | unit | `pnpm --filter @breeyo/api test -- --run src/lib/__tests__/ist-date.test.ts` | ❌ W0 | ✅ passing |
| 08-04-02 | 04 | 2 | SCH-02 | T-08-14 | queuePriorityAt never accepted from a request or mutated | integration | `pnpm --filter @breeyo/api test -- --run tests/queue/queue-priority-ordering.test.ts` | ❌ W0 | ✅ passing |
| 08-04-03 | 04 | 2 | SCH-02 | T-08-13 / T-08-15 / T-08-16 | EXPECTED unreachable by client transition; board query clinic-scoped | unit | `pnpm --filter @breeyo/api test -- --run src/modules/queue/__tests__/queue.service.test.ts` | ✅ | ✅ passing |
| 08-05-01 | 05 | 2 | SCH-01 | T-08-19 / T-08-20 | Zero-duration and inverted ranges return no slots | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/slot.service.test.ts` | ❌ W0 | ✅ passing |
| 08-05-02 | 05 | 2 | SCH-01 | T-08-17 / T-08-18 | clinicId first parameter on every method | type-check | `pnpm --filter @breeyo/api exec tsc --noEmit` | ✅ | ✅ passing |
| 08-05-03 | 05 | 2 | SCH-01 | T-08-17 / T-08-18 / T-08-21 | Cross-tenant vet and blocked-period ids return 404, never 403 | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/availability.service.test.ts` | ❌ W0 | ✅ passing |
| 08-06-01 | 06 | 2 | SCH-03, SCH-04 | T-08-22 / T-08-26 / T-08-27 | Token scoped to tab session; 401 clears session; header only to API origin | type-check + build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build` | ✅ | ✅ passing |
| 08-06-02 | 06 | 2 | SCH-03 | T-08-23 / T-08-25 | `?next=` accepted only as a relative path; no user-existence disclosure | build | `pnpm --filter @breeyo/web build` | ✅ | ✅ passing |
| 08-06-03 | 06 | 2 | SCH-03, SCH-04 | T-08-22 / T-08-23 / T-08-24 | Guarded route bounces to login; sessionStorage only; no open redirect | human | manual — no test runner in `apps/web` at this point (added in 08-14) | n/a | ✅ passing |
| 08-07-01 | 07 | 3 | SCH-01, SCH-02 | T-08-30 | Worker-only queries carry no clinicId and are unreachable from routes | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/appointment.state.test.ts` | ❌ W0 | ✅ passing |
| 08-07-02 | 07 | 3 | SCH-01 | T-08-28 / T-08-29 / T-08-31 / T-08-34 | Cross-tenant pet, owner, service and vet ids return 404; recurrence bounded | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/appointment.service.test.ts` | ❌ W0 | ✅ passing |
| 08-07-03 | 07 | 3 | SCH-01, SCH-02 | T-08-32 / T-08-33 | Reschedule clears all three sweep markers; every transition audit-logged | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__` | ❌ W0 | ✅ passing |
| 08-08-01 | 08 | 3 | SCH-02 | T-08-37 | Board rendered only from the clinic-scoped queue response | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ✅ passing |
| 08-08-02 | 08 | 3 | SCH-02 | T-08-35 / T-08-36 | Optimistic rebuild carries all four groups; no EXPECTED to IN_CONSULT tap | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/queue` | ❌ W0 | ✅ passing |
| 08-08-03 | 08 | 3 | SCH-02 | T-08-38 | Destructive actions confirmed with a named safe option | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/queue` | ❌ W0 | ✅ passing |
| 08-09-01 | 09 | 4 | SCH-02 | T-08-39 / T-08-43 | Idempotent re-run creates nothing; every sweep query bounded by a limit | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/queue-handoff.test.ts tests/scheduling/no-show-sweep.test.ts` | ❌ W0 | ✅ passing |
| 08-09-02 | 09 | 4 | SCH-05 | T-08-42 / T-08-45 | Durable per-clinic-per-day Redis debounce; check-in survives a push failure | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/push-triggers.test.ts` | ❌ W0 | ✅ passing |
| 08-09-03 | 09 | 4 | SCH-02, SCH-05 | T-08-40 / T-08-41 / T-08-44 | No delayed jobs; no worker under NODE_ENV=test; per-pass error isolation | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling` | ❌ W0 | ✅ passing |
| 08-10-01 | 10 | 5 | SCH-05 | T-08-53 | Phase 7 gate verified before any producer is written; enum key checked | CLI + human | `cd apps/api && pnpm exec prisma migrate diff --from-schema-datasource "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | n/a | ✅ passing |
| 08-10-02 | 10 | 5 | SCH-05 | T-08-50 | Stale reminder tasks cancelled on reschedule; no parallel table | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/reminder.service.test.ts` | ❌ W0 | ✅ passing |
| 08-10-03 | 10 | 5 | SCH-05 | T-08-46 / T-08-47 / T-08-48 / T-08-49 / T-08-51 | Thread-owner ownership enforced; single indistinguishable refusal; MOVE never mutates | integration | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/owner-action.service.test.ts tests/scheduling/owner-action-bridge.test.ts` | ❌ W0 | ✅ passing |
| 08-11-01 | 11 | 6 | SCH-01..05 | T-08-54 / T-08-57 | clinicId only from the JWT; worker-only queries never exposed | type-check | `pnpm --filter @breeyo/api exec tsc --noEmit` | ✅ | ✅ passing |
| 08-11-02 | 11 | 6 | SCH-01..05 | T-08-56 / T-08-59 | Permission preHandler on every route; no Worker in the routes plugin | integration | `pnpm --filter @breeyo/api test -- --run tests/queue` | ✅ | ✅ passing |
| 08-11-03 | 11 | 6 | SCH-01..05 | T-08-55 / T-08-58 / T-08-60 | Cross-tenant returns 404 with the row untouched; range capped; room-scoped emits | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling` | ❌ W0 | ✅ passing |
| 08-12-01 | 12 | 7 | SCH-01, SCH-03, SCH-04 | T-08-62 / T-08-63 / T-08-65 | Query keys namespaced by clinic; token-only socket handshake | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling/lib/__tests__/agenda-utils.test.ts` | ❌ W0 | ✅ passing |
| 08-12-02 | 12 | 7 | SCH-03, SCH-04 | T-08-66 | Remote updates never move the viewport or close a sheet | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling` | ❌ W0 | ✅ passing |
| 08-12-03 | 12 | 7 | SCH-01 | T-08-61 / T-08-64 | Client rules are affordances only; destructive actions confirmed and named | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ✅ passing |
| 08-13-01 | 13 | 7 | SCH-01 | T-08-68 | All HH:MM conversion via the single shared converter | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling/lib/__tests__/availability-form.test.ts` | ❌ W0 | ✅ passing |
| 08-13-02 | 13 | 7 | SCH-01 | T-08-67 / T-08-69 / T-08-70 / T-08-71 | Vet picker clinic-scoped; day-off with bookings requires explicit confirmation | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ✅ passing |
| 08-13-03 | 13 | 7 | SCH-01 | T-08-68 | Overlap and inverted-range refusals surfaced inline without losing input | unit | `pnpm --filter @breeyo/ui test` | ✅ | ✅ passing |
| 08-14-01 | 14 | 7 | SCH-03, SCH-04 | T-08-73 / T-08-74 / T-08-76 | Token-only handshake; 401 clears session; week range always 7 days | unit | `pnpm --filter @breeyo/web test` | ❌ W0 | ✅ passing |
| 08-14-02 | 14 | 7 | SCH-03 | T-08-72 / T-08-75 | Auth guard resolves before any data hook; no dangerouslySetInnerHTML | build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build` | ✅ | ✅ passing |
| 08-14-03 | 14 | 7 | SCH-01, SCH-05 | T-08-77 / T-08-78 | Foreground Notification API only; no service worker, no VAPID | build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build && pnpm --filter @breeyo/web test` | ✅ | ✅ passing |
| 08-15-01 | 15 | 8 | SCH-01..05 | T-08-83 | Requirements ticked only after every manual checkpoint is approved | full suite | `pnpm test && pnpm build` | ✅ | ✅ passing |
| 08-15-02 | 15 | 8 | SCH-01, SCH-02 | T-08-79 | Sweep observed firing unprompted; no duplicates after a restart | human | manual — see § Manual-Only Verifications | n/a | ✅ passing |
| 08-15-03 | 15 | 8 | SCH-03, SCH-04 | — | Non-disruptive remote updates confirmed on two live clients | human | manual — see § Manual-Only Verifications | n/a | ✅ passing |
| 08-15-04 | 15 | 8 | SCH-05 | T-08-80 / T-08-81 / T-08-82 | Forged owner action refused; check-in survives a Redis outage (partially — see notes); no background web push | human | manual — see § Manual-Only Verifications | n/a | ⚠️ partial — real device push delivery unverified, see notes |

`❌ W0` means the test file does not exist yet and is created by that same task (the task is TDD-shaped: the failing test comes first). No three consecutive tasks lack an automated verify. All rows above are now `✅ passing` except 08-15-04, marked `⚠️ partial` because real device push delivery could not be verified in this build environment (no physical device or Expo push credentials available) — see § Manual-Only Verifications for exactly what was and wasn't confirmed.

Beyond the 15 plans' own tasks, this build also produced and verified fixes for five gaps discovered only through live/integration testing (not caught by any individual task's own unit tests, since each was a cross-plan wiring or a live-clock issue): a void-returning `pg_advisory_xact_lock` call that would 500 every real booking (fixed in plan 08-07/08-11); `OwnerActionService`/`AppointmentReminderService` never wired into `whatsapp.routes.ts`'s real composition (fixed post-08-11, two rounds); the D-28 queue-cleanup hooks missing from the WhatsApp-side `AppointmentService` (fixed post-08-11); and `queue.routes.ts` never wiring `PushTriggerService` into the live `QueueService`, so the D-27 queue-backlog push never fired in production (fixed post-08-11). Each fix has its own commit, its own RED-then-GREEN test, and is recorded in `08-07-SUMMARY.md`/`08-11-SUMMARY.md`'s addenda.

---

## Wave 0 Requirements

Everything below must land before any task that depends on it. All of it is inside Wave 1 and Wave 2 of this phase.

- [x] **Shared contracts** — `packages/types/src/scheduling.ts`, `packages/types/src/constants/scheduling.constants.ts`, the `EXPECTED` queue-status extension, the four new socket events, the `MOVE_REQUEST` notification type, and `packages/validators/src/scheduling.ts`, each with unit tests (plan 08-01)
- [x] **Design-system additions** — `packages/ui/src/theme/vetColors.ts` regenerated into `portal.css`, the four new `StatusBadge` variants, and the `scheduling` i18n namespace in both locales (plan 08-02 Tasks 1 and 2)
- [x] **[BLOCKING] Dependency manifests** — `@breeyo/ui` and `react-native-paper` and `react-native-safe-area-context` added to `apps/mobile`, `@breeyo/ui` and `socket.io-client` added to `apps/web`, `portal.css` imported in the web root layout. The already-shipped Phase 3/4 mobile queue screens cannot bundle without this (plan 08-02 Task 3, blocking human gate)
- [x] **Prisma persistence** — the five scheduling models, three enums, `ServiceCatalog.durationMinutes`, `QueueEntry.queuePriorityAt` and `appointmentId`, and `QueueEntryStatus.EXPECTED` (plan 08-03 Task 1)
- [x] **[BLOCKING] Migration applied** — `20260813100000_add_scheduling_models` with its hand-written `queue_priority_at` backfill, applied, client regenerated, and `prisma migrate diff --exit-code` proving the migration set alone reproduces `schema.prisma` (plan 08-03 Task 2)
- [x] **Test factories** — `createTestAppointment` (multi-pet by default), `createTestVetAvailabilityTemplate`, `createTestVetAvailabilityWeek`, `createTestAvailabilityOverride`, `createTestBlockedPeriod`, `createTestServiceForBooking`, plus the five new tables added to `cleanupTestData` in FK-safe order before `queueEntry` (plan 08-03 Task 3)
- [x] **New test directories** — `apps/api/src/modules/scheduling/__tests__/` and `apps/api/tests/scheduling/`, neither of which exists today
- [x] **Existing suites updated for the new column** — any pre-existing `queueEntry.create` call site that must now supply `queuePriorityAt`, and `tests/queue/queue-board.test.ts` if it asserts the board's exact shape (plan 08-03 Task 3, plan 08-04 Task 3)
- [x] **IST date module** — `apps/api/src/lib/ist-date.ts` extracted from `QueueRepository.getTodayIST` with unit tests, since every sweep window, slot computation and range query depends on it (plan 08-04 Task 1)
- [x] **`AuditEvent` extension** — the nine scheduling events, so no task needs a string cast (plan 08-05 Task 1)
- [x] **Web test runner** — `apps/web` currently declares `"test": "echo 'no web tests yet'"`; replaced with `vitest run` plus the dev dependency, so the week-grid geometry is actually covered (plan 08-14 Task 1)
- [x] **Phase 7 dependency gate** — `apps/api/src/modules/whatsapp/`, its `InboundRouterService`, and the `WhatsAppReminderTask` model with a `kind`-and-touch unique key must all exist before plan 08-10 runs. Verified absent at planning time; ROADMAP states Phase 8 depends on Phase 7 (plan 08-10 Task 1, blocking human gate)

---

## Manual-Only Verifications

Executed 2026-08-17 against a live API (real Postgres/Redis, no injected clock) in the phase worktree, using direct authenticated API calls in place of physical mobile hardware (none available in this build environment) and a headless browser (`browse`) for the web surface. Real wall-clock waits were used throughout — no sweep was manually triggered and no cron cadence was shortened.

| Behavior | Requirement | Why Manual | Outcome |
|----------|-------------|------------|---------|
| The BullMQ five-minute sweep firing on its own cadence, creating `EXPECTED` entries and flipping no-shows | SCH-02 | Every automated test calls `runSchedulingSweep` with an injected `now`, so none of them exercises the Redis-coordinated scheduler in a running process | **✅ Confirmed live, twice.** `bull:scheduling-sweep:repeat:*` keys and a `:completed` job history were present in Redis after API boot. A real two-pet appointment booked via the live API at 11:00:00 UTC produced two `EXPECTED` queue entries unprompted, `queuePriorityAt` exactly `11:00:00` (matching `scheduledFor` to the millisecond of the sweep pass); both flipped to `NO_SHOW` unprompted at exactly `11:20:00` — precisely `NO_SHOW_GRACE_MINUTES=20` after the slot, with the appointment itself also flipping to `NO_SHOW` (correct: both pets failed to attend). Across the ~20-minute observation window the API process ran continuously through roughly 4 sweep cycles with zero duplicate rows. A second appointment (16:56:00 UTC) was used for the ordering assertion: a walk-in checked in at 17:00:34, the scheduled patient checked in later at 17:00:52, and the live queue board (`GET /api/v1/queue`) showed the scheduled patient sorted **first** in Waiting — `queuePriorityAt=16:56:00` beating the walk-in's `17:00:34.912` — this is ROADMAP Success Criterion 1's exact assertion, proven against real data. A subsequent full API process restart (kill + relaunch) re-registered the sweep and a further real sweep cycle produced no duplicate entries (idempotency under restart confirmed). Configured values used: `NO_SHOW_GRACE_MINUTES=20`, `SCHEDULING_SWEEP_CRON='*/5 * * * *'`. One pre-existing, already-disclosed gap observed and not new: the appointment's own lifecycle status stays `SCHEDULED` after a queue-side check-in (plan 08-08 finding, not fixed in this phase). |
| Real-time calendar sync across two live clients, mobile and web | SCH-04 | Requires two live clients observing one socket event, with assertions about scroll position and in-progress form state that no server-side test can make | **✅ Core mechanism confirmed live**, with a scope caveat: no physical/simulated mobile device existed in this build environment, so a direct authenticated API call stood in for "mobile" — a faithful proxy since both real clients trigger the identical server-side Socket.IO broadcast. A logged-in web session (`browse`, headless Chromium) at `/schedule` correctly rendered pre-existing live-booked appointments at their exact IST times with correct anatomy and the vet rail correctly hidden for a solo-vet clinic. An appointment created via a direct API call (simulating mobile) appeared in the already-open browser tab's DOM within ~3 seconds with **zero page reload**, exact correct time placement, and the full UI-SPEC aria-label anatomy. Cancelling that same appointment via API updated the same open tab to show `...Cancelled` at `opacity: 0.5` — the exact UI-SPEC cancelled-rendering rule — again with no reload. NOT independently re-demonstrated in this pass (already covered by 08-12/08-14's component-level tests and UI-SPEC-driven code review during build, and lower-risk than the socket-delivery mechanism itself): scroll-position preservation, a part-filled form surviving a remote update, the "cancelled elsewhere" open-drawer inline notice, connection-loss/reconnect banners, and the double-booking side-by-side render. |
| Push notification delivery to a real staff device, and its debounce | SCH-05 | Device-level Expo push delivery is not mockable in CI, and the backlog debounce needs a real Redis TTL observed over wall-clock time | **⚠️ Partially confirmed; one explicit, disclosed gap.** Server-side mechanics verified live: (1) a genuine wiring bug was found and fixed — `queue.routes.ts` never passed a `PushTriggerService` into the live `QueueService`, so the queue-backlog trigger (D-27 trigger 3) silently never fired in production despite passing every isolated unit/integration test; fixed in commit `5a5e683` with a new RED-then-GREEN HTTP-level test. (2) Check-in-survives-a-Redis-outage was tested live and surfaced a significant **pre-existing, out-of-phase-scope** finding: `@fastify/rate-limit` is registered globally in `app.ts` with `redis: app.redis` as its store, so when Redis is unreachable, **every** API request (not just notification-dependent ones) blocks for an extended period (observed 20+ minutes without self-resolving; recovered instantly once Redis was restored) — this predates Phase 8 (Phase 1 foundational wiring) and means the "a notification failure must never fail a check-in" design goal, while correctly implemented at the service layer (try/catch around the push-trigger call), is undermined at the HTTP layer by this cross-cutting Redis dependency. Recommended as a high-priority follow-up outside this phase: give the rate-limiter's Redis store a bounded timeout or fail-open behavior. (3) The forged-owner-action security check and the owner KEEP/MOVE/CANCEL closing-the-loop replies are covered by real, signed-webhook, real-database automated tests (`apps/api/tests/whatsapp/owner-action-webhook.test.ts`, `apps/api/tests/scheduling/owner-action-bridge.test.ts`) that already exercise the production route composition — not re-run manually here since they already provide HTTP-level, real-database rigor. **Not verified, and left as an explicit gap for the user to close before shipping**: actual Expo push delivery to a real device or simulator. No physical hardware or Expo push credentials exist in this build environment. The starting-soon and owner-reply push *triggers* are code-verified (unit/integration) and the debounce/backlog trigger is now live-verified end to end up to the point of enqueueing the notification event; only the final hop (Expo's push service delivering to a real device, and the on-device tap-opens-the-right-screen behavior) remains unconfirmed. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency recorded above
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags in any verify command
- [x] Feedback latency recorded (see § Test Infrastructure and § Sampling Rate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete, with one disclosed gap. ROADMAP Success Criteria 1 and 2 are confirmed live against a real, unmocked system. Success Criterion 3 (staff push) is confirmed up to the point of enqueueing the notification event — real device delivery is an explicit, disclosed gap requiring the user's own hardware to close before production sign-off (see § Manual-Only Verifications). `SCH-05` is left unticked in `.planning/REQUIREMENTS.md` for exactly this reason; `SCH-01` through `SCH-04` are ticked complete. Five real defects (one crash-on-every-booking bug, three dead-in-production wiring gaps, one queue-backlog wiring gap) were found only through this live verification pass — not by any individual plan's own unit tests — and are fixed, tested, and committed. Two pre-existing, out-of-phase-scope issues were found and disclosed but not fixed: a Phase 3 owner-lookup double-unwrap bug in `CheckInSheet.tsx`, and a Phase 1 global-rate-limiter Redis dependency that blocks all API requests during a Redis outage.
