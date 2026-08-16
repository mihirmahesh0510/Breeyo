# Phase 03 — Patient Registration & Walk-in Queue: Test Summary

**14 test files** covering registering pet owners and their pets, searching for patients, and running the walk-in queue from check-in to completion.

## Why this matters (business risk being covered)

This is the day-to-day operational core of a walk-in vet clinic — front-desk staff touch this
every time a pet arrives. Bugs here are immediately visible to staff and pet owners, not
buried in an admin screen:

- **Duplicate or lost patient records.** If registering the same owner twice at one clinic
  created two separate records, visit history would fragment and staff would lose track of a
  pet's medical past. These tests specifically pin down the "same mobile number, same clinic"
  dedup rule, while still allowing the same phone number to be used legitimately across two
  *different* clinics (a shared household number, a second clinic visit).
  Notably, this dedup logic is covered from three different angles (repository, service, and
  API-integration layers), because it's exactly the kind of rule that regresses quietly.
- **Queue fairness and correctness during a busy morning.** The state-machine tests
  (waiting → in-consult → done/no-show, no skipping or reversing) exist because a bug that lets
  a queue entry get stuck or skip a valid state directly translates to a pet owner waiting
  incorrectly, or a vet losing track of who's next — visible, in-person frustration.
- **Emergency cases being deprioritized by mistake.** Emergency patients must always jump the
  queue; this is tested explicitly rather than assumed, because it's a case where a scheduling
  bug has real welfare consequences for an animal in distress.
- **Real-time updates not reaching the right (or wrong) clinic.** The queue board is meant to be
  watched live by staff; the real-time broadcast tests confirm updates reach the right clinic's
  screen and never leak to another clinic's staff.
- **Overnight data loss.** The midnight-archive job is tested to *not* archive a patient who is
  still mid-consultation past midnight — losing an active case from the board because of a
  scheduled cleanup job would be a serious operational failure.

## How these tests are run

- **Framework:** [Vitest](https://vitest.dev/), run via `pnpm --filter @breeyo/api test`.
- **Two layers of testing, covering the same logic from different angles:**
  - `apps/api/tests/**` — **integration tests** against a real Fastify app instance and a real
    **PostgreSQL** database (via Prisma), using the trigram (`pg_trgm`) search extension for the
    fuzzy patient-search tests. Test data is created/cleaned per suite via shared factories.
  - `apps/api/src/modules/**/__tests__/**` — **unit tests** for the service/repository layer,
    with the database mocked out (`vi.fn()` stand-ins for the repository) so the business logic
    (validation rules, dedup behavior, position/wait-time math) can be verified in isolation,
    fast and independent of database state.
- **Sequential execution:** because the integration suite shares one database, API tests run
  sequentially rather than in parallel (`fileParallelism: false`), preventing one test's queue
  data from interfering with another's.
- **Where it actually runs:** GitHub Actions (`.github/workflows/ci.yml`) provisions a real
  PostgreSQL 16 (with Row-Level Security roles configured) and Redis 7, runs migrations and
  seed data, then executes the full suite — matching the production data layer, not a
  simplified stand-in.

## Registering owners & pets
`apps/api/tests/patient/patient-registration.test.ts`, `src/modules/patient/__tests__/patient.service.test.ts`, `patient.repository.test.ts`
- A new owner is created with a mobile number and name; registering the same mobile again at the *same* clinic returns the existing owner instead of duplicating them, but the same mobile can be reused across *different* clinics.
- Mobile numbers must be valid 10-digit Indian numbers (starting 6–9) and are stored as clean digits regardless of spacing in the input.
- A pet requires a name and species, accepts optional details (breed, age, weight, color, microchip, notes), and can only be added to an owner that already exists.
- Livestock species (cow, buffalo, goat) are rejected — the system is scoped to companion animals only.
- One owner can have multiple pets, and combined "register owner + pet in one step" flow works, including the "owner already exists" case.

## Looking up & searching patients
`apps/api/tests/patient/patient-search.test.ts`, `patient-profile.test.ts`
- Owners can be found by exact mobile number or by partial name match (including Hindi/Devanagari names), and pets can be found by name.
- Search results are grouped by owner (with their pets nested), ranked by relevance, capped at 20 by default, and scoped so one clinic never sees another clinic's patients.
- Search queries under 2 characters are rejected outright.
- A pet's profile page shows owner info plus visit history, sorted newest-first and scoped to the current clinic; a brand-new pet correctly shows an empty history.
- Editing a pet's details works, but a pet can't be reassigned to a different owner.

## Checking a pet into the queue
`apps/api/tests/queue/queue-checkin.test.ts`, `src/modules/queue/__tests__/queue.service.test.ts`
- Checking in creates a queue entry with the correct position, records who checked the pet in, and can flag an emergency case.
- A pet already waiting or in consultation can't be checked in twice.
- If a pet was already marked "done" earlier the same day, re-check-in requires an explicit confirmation flag.
- A check-in event is broadcast in real time to everyone viewing that clinic's queue.

## Managing queue status (waiting → in consult → done)
`apps/api/tests/queue/queue-state-machine.test.ts`, `queue-status.test.ts`
- Only specific status transitions are allowed: waiting → in-consult → done, or waiting/in-consult → no-show. You cannot skip straight from waiting to done, or move backwards out of a finished (done/no-show) state.
- Moving into "in consult" records which vet is treating the pet and a timestamp; moving to "done" or "no-show" records a completion timestamp.

## The queue board & calling the next patient
`apps/api/tests/queue/queue-board.test.ts`
- The board groups patients into waiting/in-consult/done columns, with waiting patients ordered by emergency status first, then check-in time.
- Each patient's queue position and estimated wait time are computed live (wait time = position × the clinic's rolling 7-day average consultation time, defaulting to 15 minutes until there's enough data).
- "Call next" always picks the longest-waiting patient, prioritizing emergencies, and assigns the calling vet automatically.
- Archived entries never show up on the live board.

## Real-time queue updates
`apps/api/tests/queue/queue-realtime.test.ts`
- Check-ins, status changes, and "call next" all broadcast a live event to everyone watching that clinic's queue, including who made the change.
- These events are scoped per clinic — one clinic's queue activity is never broadcast to another clinic's staff.

## End-of-day queue archiving
`apps/api/tests/queue/queue-archive.test.ts`
- A scheduled midnight job archives yesterday's waiting, done, and no-show entries (and timestamps when they were archived).
- Patients still "in consult" at midnight are deliberately left un-archived so an overnight case isn't lost from the active board.
- Today's entries are never touched.

## Input validation
`apps/api/tests/validators/patient-schema.test.ts`, `queue-schema.test.ts`
- Confirms the underlying validation rules directly: mobile number format, owner/pet registration fields, allowed species, allowed queue statuses, and search query rules — including edge cases like Hindi names, birth-year ranges, and rejecting invalid UUIDs.

---
**How to run these for real:** `pnpm --filter @breeyo/api test` from the project root (covers both the `tests/` integration suite and the `src/modules/**/__tests__` unit suite).
