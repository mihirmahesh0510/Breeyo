# Phase 7 (WhatsApp Communication) — Open Items

**Branch:** `breeyo/phase-07-whatsapp-communication` (merged to `main` via PR #12)
**Status:** All 16 plans built, 6 gap-fixes applied and verified (5 found during `--verify`, 1 more found during device verification), full automated test suite green. Device verification partially run on a real Android emulator — one real bug found and fixed (§1a). 15 of the original 37 human-verify steps remain unrun.
**Last updated:** 2026-08-16 (post-merge reconciliation)

This file tracks everything left hanging after the build + `--verify` pass, so nothing gets silently forgotten. It supplements (does not replace) the phase's own `07-CONTEXT.md`, `07-VALIDATION.md`, and per-plan `07-CONTEXT.md` decisions.

---

## 1. Human device verification — partially done (see §1a), 22 steps still open

I have no physical device or simulator access myself. A separate session ran a time-boxed subset against a real Android emulator (§1a below) and found one real bug. The original 37-step combined checklist (from plans `07-15` + `07-16`) is not fully worked through yet.

**Setup:** `pnpm --filter @breeyo/api dev`, `pnpm db:seed`, `pnpm --filter @breeyo/mobile dev`, log in as Admin.

**Still not run** (the parts of the original 37 steps §1a didn't cover): thread bubble alignment / auto-reply timing, `FAIL`/`INVALID_NUMBER` delivery modes, 1.5x font scaling, Android hardware back-button chains, Clinician role-gating (nav entry hidden + route itself refuses, D-20), airplane-mode offline banner, Admin config screen (auto-reply delay bounds, fixed reminder defaults, Front Desk denial), triggering the reminder sweep manually (see §3 — no UI/CLI for this yet), the full booking flow end-to-end (slot list → auto-confirm → booking detail → cancel with reason), stop-reminders / mark-invalid-number flows, and confirming `/ui-spike` no longer resolves.

**Resume signal for whoever runs the rest:** note which steps pass/fail. Anything that fails should come back here as a numbered follow-up, not get silently patched.

### 1a. Device verification session (2026-08-15) — partial pass, real bug found+fixed

Ran against a real Android emulator (Breeyo_Pixel_7, API 34), with a freshly signed-up Admin account and test patient. Not the full 37-step checklist — time-boxed to the highest-risk paths.

**Verified passing:**
- WhatsApp nav entry visible for Admin (green FAB, bottom-left of every tab screen)
- Inbox empty state matches exact UI-SPEC copy: "No WhatsApp messages yet" / "Send an invoice, reminder, booking update, or clinical document to start the first owner thread."
- All 6 filter chips present and reachable: All, Invoices, Reminders, Bookings, Failed, Needs action
- D-13 consent warning on the send sheet: "No WhatsApp consent on record for this owner yet. You can still send — this is for audit visibility only." — exact copy, correctly non-blocking
- **Send Template end-to-end**: sent a "Deworming due" template from a pet profile, confirmed via the threads API that a real thread was created with the correctly rendered message ("Hi Test Owner, Bruno is due for deworming on 15 Aug 2026. Reply to book a visit.")

**Real bug found and fixed** (see §2, item 6): `TemplateSendSheet.tsx` sent `waPhone: owner.mobile` — the raw 10-digit number — instead of E.164 with a leading `+`, so every template send from a pet profile was failing with a 400. Fixed using `formatPhoneWithPrefix` from `wizard-utils.ts` (no new helper added).

**Two pre-existing bugs found blocking this session** (not Phase 7 scope):
1. `usePetProfile`'s `select` assumed `{pet, owner, visits}` as siblings; the real API returns a flat pet object with `owner` nested and `visitHistory`. Crashed `PatientDetailScreen` for every pet. Fixed separately, own PR (`fix/patient-profile-visit-history-shape`), already merged to `main`.
2. `PatientListScreen`/`OwnerDetailScreen` navigate to `/(app)/register-patient`, but the actual route is `/(app)/patient/register` — "Add Patient" hits an Unmatched Route screen. **Not yet fixed** — worked around by creating test patients via direct API calls during this session. Phase 3 scope, not touched here — needs its own small fix.

Both crashes reinforce the same pattern already noted in §4: these screens had never been opened on a real device before.

---

## 2. Gaps found during `--verify`/device verification and fixed (for the record — not open, but worth knowing they existed)

These were real, would-have-shipped-broken bugs caught by asking "does this actually reach through the real composition path" or "does this actually run on a real device," not just "does the unit test pass in isolation." Each has its own commit:

1. **Booking's interactive messages (pet/slot pickers) were persisted but never dispatched** through the provider — the outbound worker only handled template-keyed sends. Fixed: outbound worker now branches to `sendFreeform` for non-template messages; the booking handler now enqueues what it creates.
2. **The simulator never auto-replied to interactive lists**, only to templates — even after fix #1, a demo booking would stall at every picker waiting for a human to pick a row. Fixed: `sendFreeform` now schedules an auto-reply job for list/button-offering sends; `buildSimulatedReply` picks the first row deterministically (D-15).
3. **The reminder-sweep scheduler was attached to the wrong BullMQ queue** — its worker had no code path that ever called `runReminderSweep`. This meant WHA-01 (automated follow-up/vaccine/deworming reminders — the phase's first core requirement) would never fire in production, despite `runReminderSweep` itself being fully correct and unit-tested in isolation. Fixed: the sweep now has its own dedicated queue + worker.
4. **`capForNonRetryableFailure` was written and tested but never called** — a reminder that failed permanently (e.g. bad number) would waste a full 3-day escalation cycle instead of capping immediately, contradicting a locked must-have ("a bad phone number must not consume one of the owner's two chances"). Fixed: wired into the outbound worker's terminal-failure branch.
5. **`SendTemplateLauncher` couldn't show live opt-out/consent/invalid-number state** from the pet-profile surface — no API existed to read a single owner's preference outside thread context. Fixed: added `GET /api/v1/whatsapp/owners/:ownerId/preference` (commit `53db646`) and wired it into `SendTemplateLauncher` (commit `fd37e05`) — `PatientDetailScreen.tsx` needed no changes and now gets accurate warnings for free.
6. **`TemplateSendSheet.tsx` sent the owner's raw 10-digit mobile number instead of E.164 format** — `POST /whatsapp/send` requires a leading `+`, so every template send from a pet profile was failing with a 400 on a real device (never caught by unit tests, which mock the API call). Fixed using the existing `formatPhoneWithPrefix` helper from `wizard-utils.ts`. Found during §1a's device verification session — this is exactly the class of bug that only running on a real device (or device emulator) surfaces, since every automated test in this repo mocks the network boundary.

Six for six were caught by deliberately tracing "is this thing actually reachable end-to-end" rather than trusting that a passing unit test means the feature works — the whole point of both the `--verify` pass and the human device-verification checkpoint.

---

## 3. Known, accepted limitations (intentionally not fixed — scope calls, not bugs)

- **WhatsApp consent grant/withdraw has no UI anywhere in Phase 7** (D-24, your explicit call during the plan review). The read side (`D-13`'s warn-but-never-block) works; the write side is deferred to a future phase or an external/manual process. Every Phase 7 send will show the missing-consent warning indefinitely until that lands — expected, not a defect.
- **Correcting an invalid WhatsApp number clears the flag but can't persist a new phone number.** There is no `PATCH`/edit endpoint for an existing `PetOwner` **anywhere in the entire app** — this predates Phase 7 (it's a Phase 1/3 patient-management gap, not a WhatsApp one) and is out of this phase's proper scope to fix. Flagged for whichever phase owns Patient/Owner management.
- **No CLI or debug route exists to manually trigger the reminder sweep** for demos/testing. `runReminderSweep(deps)` in `apps/api/src/modules/whatsapp/reminders/reminder-sweep.job.ts` is a plain, directly-callable async function — for now, triggering it requires a one-off script assembling the same deps `whatsapp.routes.ts` already wires up (prisma, the reminder repositories/service, `WhatsAppService.sendTemplate`, the outbound queue). Worth a small `pnpm --filter @breeyo/api exec tsx scripts/trigger-reminder-sweep.ts`-style script if this becomes a recurring need — not built here to avoid scope creep into ops tooling.
- **"Add Patient" navigates to a route that doesn't exist** (`/(app)/register-patient` vs. the real `/(app)/patient/register`) — found during §1a's device session, blocked test-data creation there. Phase 3 scope, not fixed in this session; needs its own small fix (likely a one-line route-path correction).

---

## 4. Cross-phase infrastructure notes (found while building Phase 7, relevant beyond it)

- **The shared dev Postgres container (used by every worktree — phase-05, phase-06, phase-07 — via the same `docker-compose.yml`) had drifted from git history**: a phantom failed migration record plus an untracked ad-hoc migration from an earlier interactive session. Reconciled safely (verified every affected table already existed before marking ledger entries resolved — zero data loss, no resets). If the standing `INV-DB` kanban ticket about dropped rows during Phase 05 testing recurs, this class of drift is a plausible contributing cause — worth giving each worktree its own isolated Postgres instance/port if it keeps happening.
- **Stale seed data**: a Phase 6 fix that removes `CREATE_INVOICES` from the Clinician role's grants was correct in `seed.ts` but had never been re-applied to this shared dev database (the seed script's own upsert-then-reconcile logic only fixes this on the next `db:seed` run, which hadn't happened since that fix landed). Re-ran it; 4 previously-failing billing tests now pass. Any other environment that hasn't re-seeded since that fix may show the same symptom.
- **Transient Postgres deadlocks (`40P01`)** surfaced a few times during heavy concurrent full-suite test runs against the shared dev DB — confirmed transient (clean rerun every time), not a real bug, but a sign the shared-DB-across-worktrees setup is fragile under concurrent load.
- **Screens that had never been opened on a real device carried real bugs unit tests never caught** (§1a's two pre-existing crashes, plus §2 item 6) — worth treating "has this screen ever actually been run on a device/emulator" as its own checklist item per phase, not an afterthought.

---

## 5. Not yet done

- **15 of the original 37 human-verification steps** (see §1) — still need a full device pass.
- **The Phase 3 "Add Patient" route-mismatch bug** (§3) — small, one-line-ish fix, not yet done.
- **Phase 6 integration hook is ready and documented, but NOT yet wired in — and it can be now.** Phase 6's invoice-detail screen already exists on `main` (`apps/mobile/src/features/billing/screens/InvoiceDetailScreen.tsx` + `InvoiceActionBar.tsx`, with an existing `onShare` action). `SendTemplateLauncher.tsx`'s header comment records the exact props to pass for `invoice_delivery` (template key, `contextType: 'INVOICE'`, opaque `contextId`, `payment_link` omitted for paid invoices per D-23). Deliberately not wired in during this phase: `InvoiceActionBar.tsx` is governed by its own strict, already-reviewed conventions from Phase 6 (a documented "phase-level grep gate rejects status equality tests and status switches," and action visibility derived entirely from `invoiceActionSet`/`isValidInvoiceTransition` in `lib/invoice-actions.ts`, not hardcoded). This is a small, well-scoped, low-risk follow-up: add a `whatsapp` action key alongside the existing `share`/`print`/`download` actions, gated the same way those are, calling `SendTemplateLauncher` with the documented props. Recommend its own small reviewed change.
