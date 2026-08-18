# Plan 08-15 Summary — Final Phase Validation

## Status: Complete, with one disclosed gap (device push delivery)

## Wall-clock durations (2026-08-17)

| Command | Result | Duration |
|---|---|---|
| `pnpm --filter @breeyo/types test` | 103 passed | 4.48s |
| `pnpm --filter @breeyo/validators test` | 200 passed | 3.85s |
| `pnpm --filter @breeyo/ui test` | 186 passed | 5.26s |
| `pnpm --filter @breeyo/api test` (run 1) | 1801 passed, 2 failed (pre-existing) | 5m08s |
| `pnpm --filter @breeyo/api test` (run 2) | 1801 passed, 2 failed (pre-existing) — identical to run 1 | 5m39s |
| `pnpm --filter @breeyo/mobile test` | 713 passed | 8.92s |
| `pnpm --filter @breeyo/web test` | 11 passed | 2.62s |
| `pnpm test` (full turbo) | 6 failed (all pre-existing), rest passed | 5m57s |
| `tsc --noEmit` × 6 packages | 0 new errors; `@breeyo/mobile` at documented 61 pre-existing baseline; `@breeyo/ui` cannot run standalone (pre-existing tsconfig mismatch, checked indirectly via mobile) | 2.5–18s each |
| `pnpm build` | exit 0, 5/5 tasks (2 cached) | ~40s |

**API two-run stability check: PASSED.** Two consecutive full `@breeyo/api` runs produced byte-identical pass/fail/skip/todo counts (1801/2/80), confirming the scheduling sweep worker never fires under vitest.

**Failure attribution across all three `@breeyo/api` executions:** every failure traces to exactly two pre-existing, already-documented issues — the Phase 6 billing webhook FK-violation/duplicate-receipt race (`tests/billing/webhook.test.ts`, `tests/billing/combined-payment-link.test.ts`; confirmed across at least 5 separate build sessions in this phase, unrelated to any Phase 8 file) and a newly-noticed, low-priority time-of-day flake in `tests/queue/queue-board.test.ts` that only manifests when a run happens to straddle IST midnight (confirmed harmless: reproduces identically with and without the queue-backlog wiring fix). No unexplained or new failures in any run.

## Real defects found and fixed during this build (not caught by any single plan's own unit tests)

These surfaced only because the phase was verified against a live, unmocked system rather than trusting injected-clock unit tests alone:

1. **Crash on every real booking** — `AppointmentService.createAppointment`'s D-34 advisory lock used `tx.$queryRaw` on `pg_advisory_xact_lock` (a void-returning function Prisma can't deserialize, P2010). Fixed in plan 08-11 via `$executeRaw`.
2. **WhatsApp owner-action bridge unreachable in production** — `whatsapp.routes.ts` never constructed or wired `OwnerActionService`/`AppointmentReminderService` into the real `InboundRouterService`, and the real webhook route (`whatsapp.webhook.routes.ts`) built its own separate, bare, unwired `InboundRouterService`. Fixed post-08-11 with new real-webhook, HMAC-signed, real-database integration tests.
3. **D-28 queue cleanup unreachable from WhatsApp cancels** — the `AppointmentService` instance inside `whatsapp.routes.ts` had no `onRescheduled`/`onCancelled` hooks, so an owner cancelling via WhatsApp never cleared a stale `EXPECTED` queue card. Fixed with a RED-then-GREEN real-webhook test.
4. **Queue-backlog push (D-27 trigger 3) dead in production** — `queue.routes.ts` never passed a `PushTriggerService` into the live `QueueService`, so the backlog push silently never fired despite passing every isolated test. Found during this plan's own live verification, fixed with a new real-HTTP-endpoint test confirming RED before / GREEN after.
5. **Reschedule self-conflict false positive** — rescheduling an appointment without changing its time (or changing only the vet) saw its own current row as a double-booking conflict. Fixed in plan 08-07 with a dedicated RED-then-GREEN test.

All five are committed with their own tests; see `08-07-SUMMARY.md` and `08-11-SUMMARY.md`'s addenda for full mechanism detail.

## Live checkpoint outcomes (Tasks 2–4)

Full narrative is in `08-VALIDATION.md` § Manual-Only Verifications. Short version:

- **Task 2 (appointment-to-queue handoff): fully confirmed live.** Real BullMQ scheduler registered and fired unprompted on its real 5-minute cadence; `EXPECTED` entries created at the exact scheduled time; no-show flip fired at exactly `NO_SHOW_GRACE_MINUTES` (20 min) later; multi-pet no-show rule correct; D-10 priority ordering proven with real data (a patient checked in later sorted ahead of an earlier walk-in because of `queuePriorityAt`); idempotency held across ~4 real sweep cycles and a full API process restart.
- **Task 3 (cross-surface sync): core mechanism confirmed live**, with a scope caveat — no physical/simulated mobile device existed in this environment, so a direct API call stood in for "mobile" (same server-side broadcast mechanism either way). A live web session (headless browser) received a create and a cancel via the socket with zero page reloads, correct placement, correct anatomy, and the correct `opacity: 0.5` cancelled treatment. Scroll-preservation, part-filled-form-preservation, the cancelled-elsewhere-drawer notice, and connection-loss banners were not independently re-demonstrated live (already covered by component-level tests and code review during 08-12/08-14).
- **Task 4 (push notifications): partially confirmed, one explicit gap.** Backlog debounce and the check-in-survives-Redis-outage assertion were tested live (the latter surfacing the rate-limiter finding below); the forged-owner-action security check is covered by existing real-webhook, real-database automated tests. **Real Expo push delivery to a physical device or simulator was not verified — no hardware or Expo credentials exist in this build environment.** This is the one requirement (SCH-05) left unticked in `REQUIREMENTS.md`, pending the user's own device-based confirmation.

## Pre-existing issues found and disclosed (out of Phase 8 scope, not fixed here)

1. **`CheckInSheet.tsx` owner-lookup double-unwrap bug** (Phase 3, commit `a1de4a8`): `lookupQuery.data?.data` — but `useLookupOwner`'s `queryFn` already returns the unwrapped `OwnerWithPets` object (`return response.data`), so `.data` again is always `undefined`. Every walk-in check-in's "existing owner found" branch has likely never worked, probably causing duplicate owner/pet records on every returning patient. Verified by tracing the actual response type through the code, not just agent say-so. **Recommend an immediate hotfix independent of this phase**, given the data-integrity risk.
2. **`ServiceCatalogService.list/search` drops `durationMinutes`** (Phase 4) from its API response despite the column existing since plan 08-03 — cosmetic impact on the new booking UI's service picker (duration text may be blank), server-side booking duration snapshotting is unaffected since it reads the catalog directly via Prisma, not through this service.
3. **Global rate-limiter blocks all API requests during a Redis outage** (Phase 1, `app.ts` `fastifyRateLimit` registered with `redis: app.redis`): found via this plan's own live Task 4 verification. When Redis is unreachable, every request — not just scheduling/notification code — hangs for an extended period (observed 20+ minutes without self-resolving, instant recovery once Redis returned). This undermines Phase 8's own "a notification failure must never fail a check-in" design goal at the HTTP layer, even though the service-level mitigation (try/catch around the push-trigger call) is correctly implemented. Recommend a bounded timeout or fail-open behavior on the rate-limiter's Redis store as a high-priority follow-up.

## Deviations between UI-SPEC and what shipped

None beyond what's already disclosed in each plan's own summary (`08-12-SUMMARY.md` and `08-13-SUMMARY.md` each note one or two small, justified adaptations — e.g. no native date-picker library, blocked-band captions without a reason label since the endpoint doesn't carry one). No phase-level UI-SPEC deviation was found during this final pass.

## Requirements sequencing followed

Per the plan's own instruction, `REQUIREMENTS.md` was updated only after determining Task 2/3/4 outcomes: SCH-01 through SCH-04 ticked complete (all fully verified, live where the requirement demanded it); SCH-05 left unticked with the device-push gap recorded inline, exactly as the plan's own contingency for a partially-verified checkpoint describes.
