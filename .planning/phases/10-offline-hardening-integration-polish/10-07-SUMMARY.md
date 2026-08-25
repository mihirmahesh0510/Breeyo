---
phase: 10-offline-hardening-integration-polish
plan: 07
subsystem: plt-07-performance-benchmarks-api-p95-queue-realtime-cold-start
tags: [vitest, socket.io-client, adb, maestro, performance, PLT-07]
dependency_graph:
  requires: [10-05]
  provides: [api-p95-benchmark, queue-realtime-latency-benchmark, cold-start-benchmark-script, cold-start-maestro-flow, perf-report-aggregator]
  affects: []
tech_stack:
  added:
    - "socket.io-client (apps/api devDependency, ^4.8.3, matches the server's socket.io version) -- benchmark-only, no production code depends on it"
    - "tsx (root devDependency, ^4.19.0) -- makes the plan's own `npx tsx ...` verify commands resolve from the repo root without a network fetch"
  patterns:
    - real-http-fetch-against-buildTestApp-listening-port (not app.inject -- measures real socket/HTTP overhead)
    - real-socket.io-client-connected-to-clinic-room (not a spy on app.io.to(), unlike the existing queue-realtime.test.ts)
    - json-line-benchmark-output-piped-into-aggregator-script
key_files:
  created:
    - apps/api/tests/performance/api-p95.bench.ts
    - apps/api/tests/performance/queue-realtime-latency.bench.ts
    - apps/mobile/tests/performance/cold-start.bench.ts
    - apps/mobile/.maestro/cold-start-measurement.yaml
    - scripts/perf-report.ts
  modified:
    - apps/api/vitest.config.ts (added `tests/performance/*.bench.ts` to `include`, which the pre-existing glob did not match)
    - vitest.config.ts (repo root; added the same glob so the plan's own root-relative verify commands work)
    - apps/api/package.json (added `socket.io-client` devDependency)
    - package.json (root; added `tsx` devDependency)
    - pnpm-lock.yaml (dependency resolution for the two additions above)
metrics:
  duration: ~1 session
  completed: 2026-08-25
  tasks_completed: 2
  tasks_total: 3
---

# Phase 10 Plan 07: PLT-07 Performance Benchmarks -- API p95, Queue Real-time Latency, Cold Start Summary

Built the three PLT-07 performance benchmarks the plan calls for (API p95 across 6 endpoint groups, queue real-time Socket.IO round-trip latency, mobile cold start) plus the Maestro cold-start double-check flow and the aggregating `perf-report.ts`, then ran the two API/server-side benchmarks for real against the local dev Postgres 16 + Redis 7 stack. **Every group passed on the first real run, by a wide margin -- no bottleneck was found, so no production code needed to change.** Task 3 (real mid-range Android hardware confirmation) is explicitly out of scope for an agent and was left untouched, per the plan.

## What Was Built

### Task 1: the three benchmark scripts and the aggregator

- **`apps/api/tests/performance/api-p95.bench.ts`** -- boots the real Fastify app via the existing `buildTestApp()` helper (bound to a real ephemeral TCP port on `127.0.0.1`, the same helper every other integration suite uses), then drives real `fetch()` calls over the wire against 6 endpoint groups using routes verified against each module's actual `routes.ts` (not guessed):
  - **auth**: `POST /api/v1/auth/login` (real argon2 password verify each call)
  - **queue**: `GET /api/v1/queue` (board read, seeded with 5 checked-in patients first)
  - **emr**: `GET /api/v1/consultations/:consultationId`
  - **inventory**: `POST /api/v1/inventory/items/:itemId/dispense` (real FIFO stock decrement each call; the seeded batch is stocked well above the request count so it never runs dry)
  - **billing**: `GET /api/v1/billing/invoices` (seeded with 5 invoices)
  - **sync**: `POST /api/v1/sync/replay` (empty `{ deviceId }` batch -- confirmed side-effect-free since `operations`/`conflicts` default to `[]`)

  Each group fires 100 sequential requests, sorts durations, computes p95 at `Math.ceil(0.95 * count) - 1`, asserts `<500ms`, and prints one `{ group, p95Ms, count, pass }` JSON line per group. Deliberately real HTTP (not `app.inject()`): PLT-07's 500ms budget is user-facing, and `inject()` skips exactly the network layer that separates "the handler is fast" from "the request is fast."

- **`apps/api/tests/performance/queue-realtime-latency.bench.ts`** -- connects a REAL `socket.io-client` (not a spy on `app.io.to()`, unlike the pre-existing `tests/queue/queue-realtime.test.ts`, which only proves the server emits the right room/event) with the same JWT used for `Authorization: Bearer` passed as `auth.token`, matching `realtime/socket.ts`'s handshake exactly -- the server auto-joins `clinic:<clinicId>` from the token, no explicit join call needed. Seeds 12 checked-in queue entries, then for each one: arms a `queue:updated` listener (matched by `entry.id`) before firing `PATCH /api/v1/queue/:entryId/status` (WAITING → IN_CONSULT, a valid state-machine transition), and measures the delta from request-send to event-received. Asserts p95 `<2000ms` and prints `{ metric: "queue_realtime_p95", p95Ms, count, pass }`.

  One real measurement wrinkle worth recording: the server calls `broadcast()` and returns the HTTP response from the same handler, so the socket push and the HTTP response race each other as two independent deliveries. An early trial anchored the delta to "HTTP response received" and got a small **negative** number (the socket event's own callback fired fractionally before `res.json()` resolved on our side) -- a real ordering artifact, not a bug, but useless as a reported figure. Fixed by anchoring to request-send time instead (`receivedAt - apiStart`), which is always ≥0 and matches what a real user experiences: the clock that matters is "I tapped the button" to "the other screen updated," not the raw HTTP round trip.

- **`apps/mobile/tests/performance/cold-start.bench.ts`** -- a Node/tsx script using `child_process.execSync` to run `adb shell am force-stop <package>` then `adb shell am start -W <package>/.MainActivity` (package `app.breeyo.mobile`, matching `apps/mobile/app.config.ts`'s `android.package`), parsing `TotalTime` out of ADB's own output, repeating 5x, discarding the first warm-up run, and asserting the average of the remaining 4 is under 3000ms. `--emulator` logs the required warning and forces `pass: false` regardless of the measured number (emulator timing is never sign-off evidence per D-31). Checks `adb devices` for a connected target before attempting anything and throws a clear, actionable error (not a stack-trace crash) when none is found -- confirmed in this environment, which has no `adb` binary at all: it prints `[cold-start] Could not run "adb devices" -- is Android Platform Tools installed and on PATH?` and exits 1, exactly the "fail gracefully, don't fabricate" behavior the plan asked for.

- **`apps/mobile/.maestro/cold-start-measurement.yaml`** -- `stopApp`, a 1s settle, `launchApp`, sign-in (placeholder staging credentials, same convention as the pre-existing `offline-recovery.yaml`), then `extendedWaitUntil`/`assertVisible` on `check-in-fab` (the one stable `testID` confirmed present on `QueueScreen.tsx` -- no other testID exists on that screen to target). The wait timeout is deliberately looser (10000ms) than the 3000ms PLT-07 target, not a hard Maestro-level pass/fail cutoff exactly at the budget: a human reviewing the run's `--format junit`/`--format html` report compares the step's actual recorded duration against 3000ms. Validated with a Python `yaml.safe_load_all` parse (two documents: `appId` header + a 10-step command list) since no `maestro` binary is available here either.

- **`scripts/perf-report.ts`** -- reads JSON lines from stdin (piped, tolerating vitest's own banners/warnings mixed in) or from file arguments, builds one `Metric | Target | Measured | Status` row per API group plus one row each for queue real-time and cold start, and prints either a table or (`--json`) machine-readable output. A metric category with **no data** in the input prints `NO DATA` and does **not** by itself cause a non-zero exit (Task 2's own verify command intentionally pipes only the two server-side benchmarks through it, with no cold-start data available); a metric that reported a measurement and **missed** its target does cause exit 1. Piping genuinely empty input (no recognizable JSON lines at all) also exits 1, so an accidentally-empty benchmark run cannot look like silent success.

### Task 2: ran for real, no bottleneck found

Ran both server-side benchmarks against the local dev Postgres 16 (`breeyo-postgres-1`, port 5433) and Redis 7 (`breeyo-redis-1`, port 6379) already running via Docker, piped through `perf-report.ts`. All groups passed on the very first run, comfortably:

| Metric | Target | Measured (2 runs) | Status |
|---|---|---|---|
| API p95 (auth, n=100) | <500ms | 85–127ms | PASS |
| API p95 (queue, n=100) | <500ms | 32–52ms | PASS |
| API p95 (emr, n=100) | <500ms | 29–39ms | PASS |
| API p95 (inventory, n=100) | <500ms | 38–50ms | PASS |
| API p95 (billing, n=100) | <500ms | 20–51ms | PASS |
| API p95 (sync, n=100) | <500ms | 5–22ms | PASS |
| Queue Realtime p95 (n=12) | <2000ms | 30–62ms | PASS |
| Cold Start (avg) | <3000ms | -- | NO DATA (Task 3 only) |

No fix was necessary -- every group cleared its budget by at least 8x margin (the tightest was `auth` at ~127ms against a 500ms target, still under 26% of budget), so this plan made **no production code change**. `auth` is consistently the slowest group, which is expected and correct: it's the only group doing real argon2 password hashing per request, not a missing index or an N+1 query.

## Real gaps found while building this (fixed, both benchmark-infrastructure, not production code)

1. **`apps/api/vitest.config.ts`'s `include` glob (`tests/**/*.test.ts`, `src/**/*.test.ts`) did not match `*.bench.ts` files.** Running `npx vitest run apps/api/tests/performance/api-p95.bench.ts` -- exactly the plan's own `<verify>` command -- reported "No test files found" even with an explicit path, because Vitest's `include` filters explicit CLI paths too, not just directory scans. Fixed by adding `tests/performance/*.bench.ts` to both `apps/api/vitest.config.ts` and the repo-root `vitest.config.ts` (the plan's verify commands run from the repo root, which resolves to the root config, not the package-local one).
2. **`socket.io-client` was not a dependency anywhere in `apps/api`** (only the server-side `socket.io` and `@socket.io/redis-adapter`). Added as a devDependency at `^4.8.3`, matching the server's version and the version already used by `apps/mobile`/`apps/web`.
3. **`tsx` was not resolvable from the repo root** (only present in `apps/api/node_modules/.bin`), so the plan's own `npx tsx apps/mobile/...` / `npx tsx scripts/perf-report.ts` verify commands run from root would silently attempt a network-dependent one-off install (`npx -y`-equivalent) rather than resolving locally. Added `tsx` as a root devDependency at the same version already used in `apps/api`, matching the pattern of `vitest`/`turbo`/`prisma` already being root-level tooling deps.

None of these three are production-code changes; all three are prerequisites for the plan's own verify commands to run at all, discovered by actually running them rather than assuming they would work.

## Verification

Task 1 verify, exactly as specified:
```
npx vitest run apps/api/tests/performance/api-p95.bench.ts apps/api/tests/performance/queue-realtime-latency.bench.ts && npx tsx apps/mobile/tests/performance/cold-start.bench.ts --emulator 2>&1 | head -5 && npx tsx scripts/perf-report.ts --help
```
Passes end-to-end, exit 0. The cold-start script's own internal exit is 1 (no `adb` in this environment, by design -- see above), which is expected and does not break the chain because it is piped through `head -5` before the next `&&`, matching the plan's own command exactly.

Task 2 verify, exactly as specified:
```
npx vitest run apps/api/tests/performance/api-p95.bench.ts apps/api/tests/performance/queue-realtime-latency.bench.ts 2>&1 | npx tsx scripts/perf-report.ts && echo "All API and queue targets PASS"
```
Passes, exit 0, prints `All API and queue targets PASS`.

Full regression check after all changes:
- `apps/api` full suite (real Postgres 16 + Redis 7): **168 test files passed, 9 skipped (pre-existing) -- 177 total; 2071 tests passed, 80 todo (pre-existing) -- 2151 total**, 0 failed. Grew by exactly this plan's 2 new bench files / 2 new test cases over the stated baseline (~2069 passing).
- Root aggregate `pnpm test` (turbo, all 8 workspace packages): **8/8 tasks successful**, 0 failed.
- `npx tsc --noEmit -p apps/api` shows one pre-existing error unrelated to any file this plan touched (`src/modules/sync/__tests__/replayIngest.service.test.ts`, confirmed present on a clean `git stash` of this plan's changes) -- zero new type errors introduced by any file this plan created or modified.

An earlier full-suite run reported 40 failed files / 341 failed tests; root-caused immediately to a self-inflicted mistake in the invocation (an incorrectly guessed `DATABASE_URL_APP` password exported in the shell, which overrides the correct value `apps/api/.env` already provides via `dotenv` since shell env takes precedence) -- not a real regression. Re-running without that manual override reproduced the clean 168/2071-passing baseline above. Recorded here so the number in this summary is not mistaken for a second, contradicting result.

## Task 3 -- NOT done, and cannot be done by an agent

**Task 3 (the blocking human-verify checkpoint on real mid-range Android hardware) has explicitly NOT been performed.** It requires a real Galaxy A14/Redmi Note 12-class device (Android 12+, 4GB RAM) connected over USB, a release build of the mobile app installed on it, a human running `cold-start.bench.ts` (no `--emulator` flag) and the Maestro flow against that device, and a human judgment call ("approved" with device model + measured values, or a description of which metric failed) per the plan's own `<resume-signal>`. No agent -- this one included -- has a physical device to connect, and D-31 is explicit that emulator-only measurement is insufficient for PLT-07 sign-off.

What Task 3 will need once a device is available:
```
npx tsx apps/mobile/tests/performance/cold-start.bench.ts        # no --emulator flag, device connected over USB
npx maestro test apps/mobile/.maestro/cold-start-measurement.yaml
npx tsx scripts/perf-report.ts                                   # after piping all three benchmarks' output together
```
This summary's Task 1 + Task 2 work (all scripts built and the two server-side metrics confirmed passing with wide margin) is a necessary precondition for that checkpoint, not a substitute for it. **PLT-07 is not signed off until a human runs the real-device cold-start measurement and either approves or reports a failing number to resume execution against.**
