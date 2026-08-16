# Phase 7 (WhatsApp Communication) — Open Items

**Branch:** `breeyo/phase-07-whatsapp-communication` (not yet merged to `main`)
**Status:** All 16 plans built, 5 gap-fixes applied and verified, full automated test suite green. Not yet merged — human verification and a merge decision are still open.
**Last updated:** 2026-08-15

This file tracks everything left hanging after the build + `--verify` pass, so nothing gets silently forgotten. It supplements (does not replace) the phase's own `07-CONTEXT.md`, `07-VALIDATION.md`, and per-plan `07-CONTEXT.md` decisions.

---

## 1. Blocking: human device verification (not yet done)

I have no physical device or simulator access. Two plans (`07-15`, `07-16`) each end in a blocking human-verify checkpoint; both are still open. Combined into one 37-step pass:

**Setup:** `pnpm --filter @breeyo/api dev`, `pnpm db:seed`, `pnpm --filter @breeyo/mobile dev`, log in as Admin.

**From 07-15 (screens/nav, 15 steps):** WhatsApp nav entry visible/hidden by role → four states (empty/loading/populated/error) with exact UI-SPEC copy on the inbox → six filter chips (single-select, Failed/Needs-action reachable without leaving the screen) → search by owner name / bare mobile number / pet name → open a thread, confirm bubble alignment + that the simulator's auto-reply arrives ~10s later without a manual refresh (exercises D-14 + the socket) → force `FAIL` delivery mode, confirm the failed bubble + inline reason + Retry (creates a new bubble, old one stays) → force `INVALID_NUMBER`, confirm the exact warning copy → 1.5x font scaling wraps rather than truncates, 44pt targets everywhere → Android hardware back returns thread→inbox → log in as Clinician, confirm the nav entry is gone and the route itself refuses (D-20) → toggle airplane mode, confirm the offline banner appears/clears.

**From 07-16 (config/admin surfaces, 22 steps):** Config screen labels the channel "Simulator", four delivery modes with no random-failure option → auto-reply delay: 45s saves, 600 is rejected with the 3–60 bound visible → reminder defaults (2 attempts / 3 days) show as fixed, non-editable → Front Desk cannot reach the config screen → trigger the reminder sweep manually (see §3 below — there's no UI/CLI for this yet) and confirm a follow-up reminder lands in the owner's thread and auto-replies → send a template from a pet profile, confirm the `Message queued` toast and an immediate Queued bubble → drive a full booking end-to-end (BOOK → ≤10-row slot list → auto-confirms, no staff step → booking confirmation queued) → open booking detail, confirm reference/slot/state/"Check in manually when the owner arrives." and that no walk-in queue entry was created → cancel with a reason, confirm the exact destructive-confirmation copy and that the reason appears in the thread → stop reminders for an owner (exact copy), confirm reminder templates are refused but `invoice_delivery` still sends (D-10) → mark a number invalid (exact copy), confirm the thread warning, correct the number and confirm retry now works → confirm `/ui-spike` no longer resolves (deleted in this phase) → 1.5x font scaling and Android back on the config/preference surfaces.

**Resume signal for whoever runs this:** note which of the 37 steps pass/fail. Anything that fails should come back here as a numbered follow-up, not get silently patched.

---

## 2. Gaps found during `--verify` and fixed (for the record — not open, but worth knowing they existed)

These were real, would-have-shipped-broken bugs caught by asking "does this actually reach through the real composition path," not just "does the unit test pass in isolation." Each has its own commit on the branch:

1. **Booking's interactive messages (pet/slot pickers) were persisted but never dispatched** through the provider — the outbound worker only handled template-keyed sends. Fixed: outbound worker now branches to `sendFreeform` for non-template messages; the booking handler now enqueues what it creates.
2. **The simulator never auto-replied to interactive lists**, only to templates — even after fix #1, a demo booking would stall at every picker waiting for a human to pick a row. Fixed: `sendFreeform` now schedules an auto-reply job for list/button-offering sends; `buildSimulatedReply` picks the first row deterministically (D-15).
3. **The reminder-sweep scheduler was attached to the wrong BullMQ queue** — its worker had no code path that ever called `runReminderSweep`. This meant WHA-01 (automated follow-up/vaccine/deworming reminders — the phase's first core requirement) would never fire in production, despite `runReminderSweep` itself being fully correct and unit-tested in isolation. Fixed: the sweep now has its own dedicated queue + worker.
4. **`capForNonRetryableFailure` was written and tested but never called** — a reminder that failed permanently (e.g. bad number) would waste a full 3-day escalation cycle instead of capping immediately, contradicting a locked must-have ("a bad phone number must not consume one of the owner's two chances"). Fixed: wired into the outbound worker's terminal-failure branch.
5. **`SendTemplateLauncher` couldn't show live opt-out/consent/invalid-number state** from the pet-profile surface — no API existed to read a single owner's preference outside thread context. Fixed: added `GET /api/v1/whatsapp/owners/:ownerId/preference` (commit `53db646`) and wired it into `SendTemplateLauncher` (commit `fd37e05`) — `PatientDetailScreen.tsx` needed no changes and now gets accurate warnings for free.

All five were caught because I deliberately traced "is this thing actually reachable from the real composition root," which is exactly the class of bug TDD-per-file misses (every unit test mocked the collaborator that was actually missing in production).

---

## 3. Known, accepted limitations (intentionally not fixed — scope calls, not bugs)

- **WhatsApp consent grant/withdraw has no UI anywhere in Phase 7** (D-24, your explicit call during the plan review). The read side (`D-13`'s warn-but-never-block) works; the write side is deferred to a future phase or an external/manual process. Every Phase 7 send will show the missing-consent warning indefinitely until that lands — expected, not a defect.
- **Correcting an invalid WhatsApp number clears the flag but can't persist a new phone number.** There is no `PATCH`/edit endpoint for an existing `PetOwner` **anywhere in the entire app** — this predates Phase 7 (it's a Phase 1/3 patient-management gap, not a WhatsApp one) and is out of this phase's proper scope to fix. Flagged for whichever phase owns Patient/Owner management.
- **No CLI or debug route exists to manually trigger the reminder sweep** for demos/testing. `runReminderSweep(deps)` in `apps/api/src/modules/whatsapp/reminders/reminder-sweep.job.ts` is a plain, directly-callable async function — for now, triggering it requires a one-off script assembling the same deps `whatsapp.routes.ts` already wires up (prisma, the reminder repositories/service, `WhatsAppService.sendTemplate`, the outbound queue). Worth a small `pnpm --filter @breeyo/api exec tsx scripts/trigger-reminder-sweep.ts`-style script if this becomes a recurring need — not built here to avoid scope creep into ops tooling.

---

## 4. Cross-phase infrastructure notes (found while building Phase 7, relevant beyond it)

- **The shared dev Postgres container (used by every worktree — phase-05, phase-06, phase-07 — via the same `docker-compose.yml`) had drifted from git history**: a phantom failed migration record plus an untracked ad-hoc migration from an earlier interactive session. Reconciled safely (verified every affected table already existed before marking ledger entries resolved — zero data loss, no resets). If the standing `INV-DB` kanban ticket about dropped rows during Phase 05 testing recurs, this class of drift is a plausible contributing cause — worth giving each worktree its own isolated Postgres instance/port if it keeps happening.
- **Stale seed data**: a Phase 6 fix that removes `CREATE_INVOICES` from the Clinician role's grants was correct in `seed.ts` but had never been re-applied to this shared dev database (the seed script's own upsert-then-reconcile logic only fixes this on the next `db:seed` run, which hadn't happened since that fix landed). Re-ran it; 4 previously-failing billing tests now pass. Any other environment that hasn't re-seeded since that fix may show the same symptom.
- **Transient Postgres deadlocks (`40P01`)** surfaced a few times during heavy concurrent full-suite test runs against the shared dev DB — confirmed transient (clean rerun every time), not a real bug, but a sign the shared-DB-across-worktrees setup is fragile under concurrent load.

---

## 5. Not yet done

- **Branch not merged to `main`.** Awaiting: (a) the human verification pass in §1, and (b) your call on PR-vs-direct-merge (matching how Phases 5/6 landed via PR, or merging directly).
- **Phase 6 integration hook is ready and documented, but NOT yet wired in — and it can be now.** Correction to an earlier assumption: Phase 6's invoice-detail screen already exists on `main` (`apps/mobile/src/features/billing/screens/InvoiceDetailScreen.tsx` + `InvoiceActionBar.tsx`, with an existing `onShare` action). `SendTemplateLauncher.tsx`'s header comment records the exact props to pass for `invoice_delivery` (template key, `contextType: 'INVOICE'`, opaque `contextId`, `payment_link` omitted for paid invoices per D-23). I deliberately did **not** wire it in myself: `InvoiceActionBar.tsx` is governed by its own strict, already-reviewed conventions from Phase 6 (a documented "phase-level grep gate rejects status equality tests and status switches" in that file, and action visibility is derived entirely from `invoiceActionSet`/`isValidInvoiceTransition` in `lib/invoice-actions.ts`, not hardcoded here) — modifying it without full Phase 6 context risked violating conventions I can't fully verify from the Phase 7 branch. This is a small, well-scoped, low-risk follow-up: add a `whatsapp` action key alongside the existing `share`/`print`/`download` actions, gated the same way those are, calling `SendTemplateLauncher` with the documented props. Recommend doing it as its own small reviewed change (on `main` or a short-lived branch off it) rather than folding it into this Phase 7 branch.
