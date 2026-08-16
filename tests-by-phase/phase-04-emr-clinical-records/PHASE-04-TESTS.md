# Phase 04 — EMR & Clinical Records: Test Summary

**9 test files** covering electronic medical records (consultations), the consultation edit
lock and hand-off flow, vaccination/deworming tracking, file attachments, the billing service
catalog, prescription dosage input, and the underlying data validation rules.

## Why this matters (business risk being covered)

This phase covers actual medical record-keeping — the highest-stakes data in the product, both
legally and clinically:

- **No record of who changed what.** Every EMR mutation (finalizing a consultation, adding an
  addendum, recording a vaccination/deworming, uploading or deleting a file, overriding a
  dosage warning) now writes an audit-log entry. Without this, a dispute over "who changed the
  diagnosis" or "who deleted this lab report" would be unanswerable — a compliance and
  medico-legal risk, not just a nice-to-have. These tests confirm every one of those mutation
  paths actually writes the entry, not just that the audit-log function exists.
- **A dosage warning being silently overridden with no trace.** If a vet enters a dose well
  outside the species-safe range and proceeds anyway, that override is now logged — so if the
  animal has an adverse reaction later, there's a record of the deliberate decision, not just
  silence.
- **One clinic reading or overwriting another clinic's medical records.** Multi-tenancy is the
  foundation of trust for a shared platform — a bug that let Clinic B's auto-save request touch
  Clinic A's in-progress consultation draft would be a serious data-isolation failure. This is
  tested explicitly, not assumed from "the API requires a token."
  - **Note for follow-up:** the current lock design uses a fixed staleness window rather than an
    explicit "force unlock" action. If a stale lock is taken over mid-edit by another vet, the
    original vet's unsaved changes could be lost — worth a product conversation on whether a
    warning/confirmation step is needed, since it's the same "silently loses clinical
    information" risk the phase is otherwise trying to prevent.
- **A vet not knowing someone took over their patient's record.** When a stale lock is taken
  over, the original vet gets notified — tested to confirm the notification fires on takeover
  and, just as importantly, that a notification failure (e.g. push service down) never blocks
  the requesting vet from actually gaining access to the record.
- **Two vets editing the same record at once.** The lock tests verify a second vet can't edit a
  record someone else has open, while also making sure a *legitimately* stuck lock (e.g. a
  crashed app) doesn't permanently block a record from ever being edited again.
- **A finalized medical record being altered.** Once a consultation is finalized, it should
  only be extended via an addendum (an appended, clearly-attributed note), never edited in
  place. Tests confirm addenda are rejected on records that aren't finalized yet.
- **An auto-saved draft looking empty after the app is closed and reopened.** If loading an
  in-progress consultation returned blank fields even though the vet's notes were auto-saved
  seconds earlier, it would look exactly like data loss to the vet — even though the data is
  safe on the server. This is tested to confirm resuming a draft actually returns what was
  auto-saved, and correctly falls back to the finalized record's own data once a consultation is
  complete (there's no draft left to overlay by then).
- **Weight tracked incorrectly.** A pet's weight feeds directly into drug dosage calculations
  elsewhere in the system — the test confirming a new weight entered mid-consultation
  immediately updates the pet's profile (even before the visit is finalized) exists because a
  stale weight could lead to an incorrect dosage recommendation.
- **A vaccine's next-due-date silently never getting calculated.** The reminder system that
  tells a clinic "this pet is overdue for its DHPPi shot" only works if the vaccine name a vet
  selects actually matches the name the due-date calculator recognizes. A quiet naming mismatch
  between the seeded drug catalog and the interval table would mean certain vaccines *never*
  get a next-due-date — not a crash, just permanently missing reminders. Every seeded vaccine
  name is now tested end-to-end against the calculator to guarantee this can't regress silently.
- **Missed or wrong vaccination/deworming schedules.** Puppies and adult dogs need different
  deworming intervals (14 vs. 90 days); getting this wrong either over-treats a puppy or
  under-protects an adult animal.
- **A lab report or X-ray attached to the wrong clinic's record, or deleted without a trace.**
  File attachments are tested to reject confirm/delete requests for a different clinic's
  attachment, and to log an audit entry on both upload confirmation and deletion.
- **A prescribed dose being misread because the unit was ambiguous.** Dosage input needs to
  support both weight-based drugs (`250mg`) and volume-based liquids/suspensions (`5ml`) — a
  parser that assumed everything was in mg would either reject valid liquid doses or silently
  misinterpret them. This is tested directly as a pure function, independent of any screen.
- **Incorrect tax/billing on medical services.** Clinical services are GST-exempt in India while
  grooming is taxed at 18% with a specific SAC code — getting this wrong is a compliance issue,
  not just a pricing bug.

## How these tests are run

- **Framework:** [Vitest](https://vitest.dev/), run via `pnpm --filter @breeyo/api test` (EMR,
  vaccination, attachment, and billing modules), `pnpm --filter @breeyo/validators test` (schema
  rules), and `pnpm --filter @breeyo/mobile test` (the dosage-parsing utility).
- **Nature of these tests:** all nine files are **unit tests**. The backend suites mock the
  database repository, lock service, dosage service, and notification bus (`vi.fn()`
  stand-ins), so what's being verified is the business logic itself (state rules, audit-trail
  side effects, date math, tenant-ownership checks) independent of real database behavior. The
  mobile file is a plain function test with no rendering or React Native runtime involved. This
  phase does not yet have `apps/api/tests/**`-style integration tests (real Fastify app + real
  Postgres) the way Phases 01 and 03 do — the validators package (`packages/validators/**`)
  tests are similarly pure, dependency-free unit tests of the Zod schemas.
- **Where it actually runs:** GitHub Actions (`.github/workflows/ci.yml`) runs these as part of
  the same repo-wide `pnpm test` step used for every other phase, alongside a live PostgreSQL 16
  / Redis 7 setup (even though these specific suites don't hit the database directly).

## Writing up a consultation
`apps/api/src/modules/emr/__tests__/emr.service.test.ts`
- Starting a consultation for a pet locks it for editing; a pet can't have two active consultations at once, and an invalid visit type is rejected.
- In-progress notes are saved as drafts in a separate table (not mixed into the final record) — and if the vet enters a new weight in the vitals, the pet's profile weight updates immediately, even before the consultation is finalized.
- **A draft auto-save request is rejected outright (404) if the consultation doesn't belong to the caller's clinic** — verified that neither the draft table nor the lock check is ever touched in that case, closing a cross-tenant write gap.
- Loading a consultation's draft data overlays the auto-saved fields (subjective, assessment, etc.) on top of the base record while it's still in progress, falls back to the record's own values if no draft row exists, and returns the finalized record as-is (no draft lookup at all) once it's complete.
- Finalizing a consultation calculates its duration, releases the edit lock, can record a follow-up date/reason, and writes a `CONSULTATION_FINALIZED` audit entry. A consultation can only be finalized once, and finalizing a non-existent consultation fails cleanly.
- **Finalizing also re-checks every prescribed drug's dose against the species-safe range**: if a dose is outside range, a `PRESCRIPTION_DOSAGE_OVERRIDDEN` audit entry is written; if it's in range, nothing is logged; and if the dosage lookup itself fails unexpectedly, finalizing still succeeds rather than blocking the vet's work over an audit-logging hiccup.
- If there's no linked queue entry, finalizing skips updating the queue (no crash).
- After a consultation is finalized, vets can append an addendum — which also writes an `ADDENDUM_ADDED` audit entry — but can't add one to a still-in-progress draft, and empty addenda are rejected.
- A pet's consultation history is returned sorted correctly.
- Drug dosage validation and owner-instruction generation are correctly delegated to the dedicated dosage-calculation logic (with a warning surfaced when a dose falls outside the safe range).

## Locking a record for editing, and handing it off between vets
`apps/api/src/modules/emr/__tests__/consultation-lock.test.ts`, `emr.controller.test.ts`
- Starting a consultation locks it to the vet who opened it; a second vet trying to open the same pet's record is blocked while the lock is fresh, and the same vet can safely re-open their own lock (it just refreshes).
- If a lock goes stale (the original vet's session expired without releasing it), another vet can take it over — and the system now remembers *who* held the previous lock so they can be notified.
- The "acquire lock" API endpoint returns whether the lock was freshly taken vs. taken over from someone else, and **fires a push notification to the vet who lost the lock** only when an actual takeover happened (not on a normal fresh acquire) — naming both the pet and the vet who took over in the message.
- A notification-send failure never breaks the takeover itself — the requesting vet still gets access to the record even if the push notification errors out; the failure is logged instead.
- The "release lock" endpoint removes the calling vet's own lock.
- A periodic heartbeat keeps an active lock alive; heartbeats from the wrong vet or a missing lock are rejected.
- Checking a record's lock status correctly reports unlocked / actively locked (with the vet's name) / stale.

## Vaccination & deworming schedules
`apps/api/src/modules/vaccination/__tests__/vaccination.service.test.ts`
- Recording a vaccination automatically calculates the next due date for known vaccines (or leaves it blank for unrecognized ones); a manually provided due date is respected if given.
- Recording a vaccination writes a `VACCINATION_RECORDED` audit entry with the pet, vaccine name, and record ID.
- **Every one of the 6 vaccines seeded in the drug database resolves a real next-due-date, tested by name** — this guards against the seeded drug catalog's vaccine names silently drifting out of sync with the due-date calculator's lookup table again.
- Deworming due dates are calculated differently for puppies (every 14 days) vs. adult animals (every 90 days).
- A pet's preventive-care status correctly reports "up to date," "due soon" (within 7 days), or "overdue" based on its vaccination/deworming records.
- Generating a vaccination certificate fails cleanly for a missing record or one belonging to a different clinic, and returns the correct data for a valid one.

## Keeping lab reports and photos safe
`apps/api/src/modules/attachment/__tests__/attachment.service.test.ts`
- Confirming a file upload writes an `ATTACHMENT_UPLOADED` audit entry (consultation, attachment ID, file type) — and is rejected outright, with no audit entry, if the attachment belongs to a different clinic.
- Deleting an attachment writes an `ATTACHMENT_DELETED` audit entry — and is rejected, with no audit entry and no deletion, if the attachment can't be found for that clinic.

## Billing service catalog (starter price list)
`apps/api/src/modules/billing/__tests__/service-catalog-seed.test.ts`
- Every new clinic is seeded with exactly 20 preset services (consultations, grooming, etc.), each with a valid category and a price in paise.
- Clinical services correctly have India's GST tax marked as exempt (0%), while grooming services are correctly taxed at 18% with the right SAC billing code.
- Seeding is idempotent — running it again on a clinic that already has presets doesn't create duplicates.

## Reading a prescribed dose correctly (mobile)
`apps/mobile/tests/consultation/dosage-parsing.test.ts`
- A bare number (e.g. `"250"`) is read as milligrams.
- An explicit mg value (`"250mg"`, `"12.5 mg"`, mixed case `"250MG"`) is parsed correctly.
- A non-mg unit (`"5ml"`, `"2 tablets"`) correctly returns "no mg value" rather than misreading the number — so a liquid dose is never mistaken for a solid-form mg dose in the species-range safety check.
- Empty or unparseable input (blank string, `"as needed"`) returns "no mg value" rather than crashing or guessing.

## Data validation (medical records)
`packages/validators/src/__tests__/emr.validators.test.ts`, `vitals.validators.test.ts`
- Consultation creation requires a valid pet ID and visit type (general/vaccination, etc.); drafts accept partial or full SOAP-note and vitals data, including referral info and prescriptions.
- Addenda require non-empty text.
- Vital sign inputs (weight, temperature, heart rate, respiratory rate) reject out-of-range or non-integer values, while allowing partially-filled or fully-omitted vitals.
- Temperature and heart-rate readings are classified as normal / slightly abnormal / critically abnormal using species-specific reference ranges (e.g. dog vs. cat), defaulting to "normal" for unknown species or vital types.

---
**How to run these for real:** `pnpm --filter @breeyo/api test src/modules/emr src/modules/vaccination src/modules/attachment src/modules/billing && pnpm --filter @breeyo/validators test && pnpm --filter @breeyo/mobile test tests/consultation` from the project root.
