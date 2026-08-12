---
phase: 8
slug: scheduling-calendar
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-12
updated: 2026-08-13
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
| **Estimated runtime** | To be recorded by plan 08-15 Task 1 |

---

## Sampling Rate

- **After every task commit:** the task's own `<verify><automated>` command
- **After every wave:** `pnpm --filter @breeyo/api test` plus the touched client package's suite
- **Before `/gsd-verify-work`:** `pnpm test` and `pnpm build` must both exit 0
- **API suite stability check:** `pnpm --filter @breeyo/api test` run twice with identical results, proving the scheduling sweep `Worker` is not firing under vitest (RESEARCH Pitfall 4)
- **Max feedback latency:** to be recorded by plan 08-15 Task 1

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SCH-01..05 | — | N/A | unit | `pnpm --filter @breeyo/types test -- --run src/constants/__tests__/scheduling.constants.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | SCH-02 | T-08-03 | No inbound transition into EXPECTED exists | unit | `pnpm --filter @breeyo/types test -- --run src/constants/__tests__` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | SCH-01, SCH-02 | T-08-01 / T-08-02 / T-08-04 | Bounded minute ints; no clinicId field; 62-day range cap | unit | `pnpm --filter @breeyo/validators test -- --run src/__tests__/scheduling.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | SCH-03 | T-08-06 | Generated stylesheet is regenerated, never hand-edited | CLI | `pnpm --filter @breeyo/ui generate:css-tokens && grep -c -- '--vet-hue-' packages/ui/src/theme/portal.css` | ✅ | ⬜ pending |
| 08-02-02 | 02 | 1 | SCH-02 | T-08-05 | Vet identity never colour-alone | unit | `pnpm --filter @breeyo/ui test -- --run src/atoms/StatusBadge/StatusBadge.test.ts` | ✅ | ⬜ pending |
| 08-02-03 | 02 | 1 | SCH-03 | T-08-SC | Blocking human gate on registry installs; lockfile diff inspected | CLI + human | `pnpm --filter @breeyo/web build` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 1 | SCH-01, SCH-02 | T-08-10 | Duration snapshot column is NOT NULL | CLI | `cd apps/api && pnpm exec prisma validate` | ✅ | ⬜ pending |
| 08-03-02 | 03 | 1 | SCH-01, SCH-02 | T-08-07 / T-08-09 | Migration/schema parity; no RLS on scheduling tables by design | CLI | `cd apps/api && pnpm exec prisma migrate reset --force --skip-seed && psql "$DATABASE_URL" -f prisma/post-migrate.sql && pnpm exec prisma migrate diff --from-schema-datasource "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | ✅ | ⬜ pending |
| 08-03-03 | 03 | 1 | SCH-01, SCH-02 | T-08-07 / T-08-11 / T-08-12 | Cross-tenant appointment read returns nothing | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/schema-shape.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 2 | SCH-02 | — | N/A | unit | `pnpm --filter @breeyo/api test -- --run src/lib/__tests__/ist-date.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 2 | SCH-02 | T-08-14 | queuePriorityAt never accepted from a request or mutated | integration | `pnpm --filter @breeyo/api test -- --run tests/queue/queue-priority-ordering.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-03 | 04 | 2 | SCH-02 | T-08-13 / T-08-15 / T-08-16 | EXPECTED unreachable by client transition; board query clinic-scoped | unit | `pnpm --filter @breeyo/api test -- --run src/modules/queue/__tests__/queue.service.test.ts` | ✅ | ⬜ pending |
| 08-05-01 | 05 | 2 | SCH-01 | T-08-19 / T-08-20 | Zero-duration and inverted ranges return no slots | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/slot.service.test.ts` | ❌ W0 | ⬜ pending |
| 08-05-02 | 05 | 2 | SCH-01 | T-08-17 / T-08-18 | clinicId first parameter on every method | type-check | `pnpm --filter @breeyo/api exec tsc --noEmit` | ✅ | ⬜ pending |
| 08-05-03 | 05 | 2 | SCH-01 | T-08-17 / T-08-18 / T-08-21 | Cross-tenant vet and blocked-period ids return 404, never 403 | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/availability.service.test.ts` | ❌ W0 | ⬜ pending |
| 08-06-01 | 06 | 2 | SCH-03, SCH-04 | T-08-22 / T-08-26 / T-08-27 | Token scoped to tab session; 401 clears session; header only to API origin | type-check + build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build` | ✅ | ⬜ pending |
| 08-06-02 | 06 | 2 | SCH-03 | T-08-23 / T-08-25 | `?next=` accepted only as a relative path; no user-existence disclosure | build | `pnpm --filter @breeyo/web build` | ✅ | ⬜ pending |
| 08-06-03 | 06 | 2 | SCH-03, SCH-04 | T-08-22 / T-08-23 / T-08-24 | Guarded route bounces to login; sessionStorage only; no open redirect | human | manual — no test runner in `apps/web` at this point (added in 08-14) | n/a | ⬜ pending |
| 08-07-01 | 07 | 3 | SCH-01, SCH-02 | T-08-30 | Worker-only queries carry no clinicId and are unreachable from routes | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/appointment.state.test.ts` | ❌ W0 | ⬜ pending |
| 08-07-02 | 07 | 3 | SCH-01 | T-08-28 / T-08-29 / T-08-31 / T-08-34 | Cross-tenant pet, owner, service and vet ids return 404; recurrence bounded | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/appointment.service.test.ts` | ❌ W0 | ⬜ pending |
| 08-07-03 | 07 | 3 | SCH-01, SCH-02 | T-08-32 / T-08-33 | Reschedule clears all three sweep markers; every transition audit-logged | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__` | ❌ W0 | ⬜ pending |
| 08-08-01 | 08 | 3 | SCH-02 | T-08-37 | Board rendered only from the clinic-scoped queue response | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ⬜ pending |
| 08-08-02 | 08 | 3 | SCH-02 | T-08-35 / T-08-36 | Optimistic rebuild carries all four groups; no EXPECTED to IN_CONSULT tap | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/queue` | ❌ W0 | ⬜ pending |
| 08-08-03 | 08 | 3 | SCH-02 | T-08-38 | Destructive actions confirmed with a named safe option | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/queue` | ❌ W0 | ⬜ pending |
| 08-09-01 | 09 | 4 | SCH-02 | T-08-39 / T-08-43 | Idempotent re-run creates nothing; every sweep query bounded by a limit | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/queue-handoff.test.ts tests/scheduling/no-show-sweep.test.ts` | ❌ W0 | ⬜ pending |
| 08-09-02 | 09 | 4 | SCH-05 | T-08-42 / T-08-45 | Durable per-clinic-per-day Redis debounce; check-in survives a push failure | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling/push-triggers.test.ts` | ❌ W0 | ⬜ pending |
| 08-09-03 | 09 | 4 | SCH-02, SCH-05 | T-08-40 / T-08-41 / T-08-44 | No delayed jobs; no worker under NODE_ENV=test; per-pass error isolation | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling` | ❌ W0 | ⬜ pending |
| 08-10-01 | 10 | 4 | SCH-05 | T-08-53 | Phase 7 gate verified before any producer is written; enum key checked | CLI + human | `cd apps/api && pnpm exec prisma migrate diff --from-schema-datasource "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code` | n/a | ⬜ pending |
| 08-10-02 | 10 | 4 | SCH-05 | T-08-50 | Stale reminder tasks cancelled on reschedule; no parallel table | unit | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/reminder.service.test.ts` | ❌ W0 | ⬜ pending |
| 08-10-03 | 10 | 4 | SCH-05 | T-08-46 / T-08-47 / T-08-48 / T-08-49 / T-08-51 | Thread-owner ownership enforced; single indistinguishable refusal; MOVE never mutates | integration | `pnpm --filter @breeyo/api test -- --run src/modules/scheduling/__tests__/owner-action.service.test.ts tests/scheduling/owner-action-bridge.test.ts` | ❌ W0 | ⬜ pending |
| 08-11-01 | 11 | 5 | SCH-01..05 | T-08-54 / T-08-57 | clinicId only from the JWT; worker-only queries never exposed | type-check | `pnpm --filter @breeyo/api exec tsc --noEmit` | ✅ | ⬜ pending |
| 08-11-02 | 11 | 5 | SCH-01..05 | T-08-56 / T-08-59 | Permission preHandler on every route; no Worker in the routes plugin | integration | `pnpm --filter @breeyo/api test -- --run tests/queue` | ✅ | ⬜ pending |
| 08-11-03 | 11 | 5 | SCH-01..05 | T-08-55 / T-08-58 / T-08-60 | Cross-tenant returns 404 with the row untouched; range capped; room-scoped emits | integration | `pnpm --filter @breeyo/api test -- --run tests/scheduling` | ❌ W0 | ⬜ pending |
| 08-12-01 | 12 | 6 | SCH-01, SCH-03, SCH-04 | T-08-62 / T-08-63 / T-08-65 | Query keys namespaced by clinic; token-only socket handshake | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling/lib/__tests__/agenda-utils.test.ts` | ❌ W0 | ⬜ pending |
| 08-12-02 | 12 | 6 | SCH-03, SCH-04 | T-08-66 | Remote updates never move the viewport or close a sheet | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling` | ❌ W0 | ⬜ pending |
| 08-12-03 | 12 | 6 | SCH-01 | T-08-61 / T-08-64 | Client rules are affordances only; destructive actions confirmed and named | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ⬜ pending |
| 08-13-01 | 13 | 6 | SCH-01 | T-08-68 | All HH:MM conversion via the single shared converter | unit | `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling/lib/__tests__/availability-form.test.ts` | ❌ W0 | ⬜ pending |
| 08-13-02 | 13 | 6 | SCH-01 | T-08-67 / T-08-69 / T-08-70 / T-08-71 | Vet picker clinic-scoped; day-off with bookings requires explicit confirmation | type-check | `pnpm --filter @breeyo/mobile exec tsc --noEmit` | ✅ | ⬜ pending |
| 08-13-03 | 13 | 6 | SCH-01 | T-08-68 | Overlap and inverted-range refusals surfaced inline without losing input | unit | `pnpm --filter @breeyo/ui test` | ✅ | ⬜ pending |
| 08-14-01 | 14 | 6 | SCH-03, SCH-04 | T-08-73 / T-08-74 / T-08-76 | Token-only handshake; 401 clears session; week range always 7 days | unit | `pnpm --filter @breeyo/web test` | ❌ W0 | ⬜ pending |
| 08-14-02 | 14 | 6 | SCH-03 | T-08-72 / T-08-75 | Auth guard resolves before any data hook; no dangerouslySetInnerHTML | build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build` | ✅ | ⬜ pending |
| 08-14-03 | 14 | 6 | SCH-01, SCH-05 | T-08-77 / T-08-78 | Foreground Notification API only; no service worker, no VAPID | build | `pnpm --filter @breeyo/web exec tsc --noEmit && pnpm --filter @breeyo/web build && pnpm --filter @breeyo/web test` | ✅ | ⬜ pending |
| 08-15-01 | 15 | 7 | SCH-01..05 | T-08-83 | Requirements ticked only after every manual checkpoint is approved | full suite | `pnpm test && pnpm build` | ✅ | ⬜ pending |
| 08-15-02 | 15 | 7 | SCH-01, SCH-02 | T-08-79 | Sweep observed firing unprompted; no duplicates after a restart | human | manual — see § Manual-Only Verifications | n/a | ⬜ pending |
| 08-15-03 | 15 | 7 | SCH-03, SCH-04 | — | Non-disruptive remote updates confirmed on two live clients | human | manual — see § Manual-Only Verifications | n/a | ⬜ pending |
| 08-15-04 | 15 | 7 | SCH-05 | T-08-80 / T-08-81 / T-08-82 | Forged owner action refused; check-in survives a Redis outage; no background web push | human | manual — see § Manual-Only Verifications | n/a | ⬜ pending |

`❌ W0` means the test file does not exist yet and is created by that same task (the task is TDD-shaped: the failing test comes first). No three consecutive tasks lack an automated verify.

---

## Wave 0 Requirements

Everything below must land before any task that depends on it. All of it is inside Wave 1 and Wave 2 of this phase.

- [ ] **Shared contracts** — `packages/types/src/scheduling.ts`, `packages/types/src/constants/scheduling.constants.ts`, the `EXPECTED` queue-status extension, the four new socket events, the `MOVE_REQUEST` notification type, and `packages/validators/src/scheduling.ts`, each with unit tests (plan 08-01)
- [ ] **Design-system additions** — `packages/ui/src/theme/vetColors.ts` regenerated into `portal.css`, the four new `StatusBadge` variants, and the `scheduling` i18n namespace in both locales (plan 08-02 Tasks 1 and 2)
- [ ] **[BLOCKING] Dependency manifests** — `@breeyo/ui` and `react-native-paper` and `react-native-safe-area-context` added to `apps/mobile`, `@breeyo/ui` and `socket.io-client` added to `apps/web`, `portal.css` imported in the web root layout. The already-shipped Phase 3/4 mobile queue screens cannot bundle without this (plan 08-02 Task 3, blocking human gate)
- [ ] **Prisma persistence** — the five scheduling models, three enums, `ServiceCatalog.durationMinutes`, `QueueEntry.queuePriorityAt` and `appointmentId`, and `QueueEntryStatus.EXPECTED` (plan 08-03 Task 1)
- [ ] **[BLOCKING] Migration applied** — `20260813100000_add_scheduling_models` with its hand-written `queue_priority_at` backfill, applied, client regenerated, and `prisma migrate diff --exit-code` proving the migration set alone reproduces `schema.prisma` (plan 08-03 Task 2)
- [ ] **Test factories** — `createTestAppointment` (multi-pet by default), `createTestVetAvailabilityTemplate`, `createTestVetAvailabilityWeek`, `createTestAvailabilityOverride`, `createTestBlockedPeriod`, `createTestServiceForBooking`, plus the five new tables added to `cleanupTestData` in FK-safe order before `queueEntry` (plan 08-03 Task 3)
- [ ] **New test directories** — `apps/api/src/modules/scheduling/__tests__/` and `apps/api/tests/scheduling/`, neither of which exists today
- [ ] **Existing suites updated for the new column** — any pre-existing `queueEntry.create` call site that must now supply `queuePriorityAt`, and `tests/queue/queue-board.test.ts` if it asserts the board's exact shape (plan 08-03 Task 3, plan 08-04 Task 3)
- [ ] **IST date module** — `apps/api/src/lib/ist-date.ts` extracted from `QueueRepository.getTodayIST` with unit tests, since every sweep window, slot computation and range query depends on it (plan 08-04 Task 1)
- [ ] **`AuditEvent` extension** — the nine scheduling events, so no task needs a string cast (plan 08-05 Task 1)
- [ ] **Web test runner** — `apps/web` currently declares `"test": "echo 'no web tests yet'"`; replaced with `vitest run` plus the dev dependency, so the week-grid geometry is actually covered (plan 08-14 Task 1)
- [ ] **Phase 7 dependency gate** — `apps/api/src/modules/whatsapp/`, its `InboundRouterService`, and the `WhatsAppReminderTask` model with a `kind`-and-touch unique key must all exist before plan 08-10 runs. Verified absent at planning time; ROADMAP states Phase 8 depends on Phase 7 (plan 08-10 Task 1, blocking human gate)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| The BullMQ five-minute sweep firing on its own cadence, creating `EXPECTED` entries and flipping no-shows | SCH-02 | Every automated test calls `runSchedulingSweep` with an injected `now`, so none of them exercises the Redis-coordinated scheduler in a running process | Plan 08-15 Task 2: book an appointment two minutes out, confirm `bull:scheduling-sweep*` exists in Redis, wait for the boundary without restarting the API, confirm the `Expected` section appears, check in and confirm the scheduled patient sorts above a later walk-in, then leave a second pet unattended and confirm the no-show flip |
| Real-time calendar sync across two live clients, mobile and web | SCH-04 | Requires two live clients observing one socket event, with assertions about scroll position and in-progress form state that no server-side test can make | Plan 08-15 Task 3: mobile agenda and web grid side by side, same clinic; book on one and confirm the other updates without a refresh; confirm scroll position and a part-filled sheet survive; confirm an open web drawer for a remotely cancelled appointment shows an inline notice rather than auto-closing |
| Push notification delivery to a real staff device, and its debounce | SCH-05 | Device-level Expo push delivery is not mockable in CI, and the backlog debounce needs a real Redis TTL observed over wall-clock time | Plan 08-15 Task 4: confirm a `DeviceToken` row exists, trigger a starting-soon push and confirm the copy and deep link, confirm no duplicate on later sweeps, cross the backlog threshold and confirm one push then none inside the debounce window, confirm the Redis key TTL, confirm a check-in still succeeds with Redis stopped, and confirm the web foreground notification fires only while the tab is open |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency recorded above
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags in any verify command
- [ ] Feedback latency recorded (plan 08-15 Task 1)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned — statuses and runtimes finalized by plan 08-15 Task 1
