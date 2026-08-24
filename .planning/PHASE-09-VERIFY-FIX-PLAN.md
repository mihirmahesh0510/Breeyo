# Phase 9 Verify Fix Plan

**Date:** 2026-08-21
**Source:** `/breeyo-build --verify phase 9` — 8 parallel independent audits (one per plan + one phase-level goal-backward check) against `.planning/phases/09-web-dashboard-owner-portal/09-CONTEXT.md` and `09-VALIDATION.md`, plus two spot-checks I ran myself.
**Purpose:** For every confirmed finding from that verify pass, identify the fix shape and which docs need updating alongside the code.

**Scope boundary:** Phase 9 only. The phase is unmerged (still on `breeyo/phase-09-web-dashboard-owner-portal`), not yet pushed through the no-mistakes gate — these fixes land in that same worktree before the gate push happens.

---

## Execution status (2026-08-21)

All 9 findings executed, TDD throughout (failing test first, confirmed failing for the right reason, then minimal implementation), each committed separately on `breeyo/phase-09-web-dashboard-owner-portal`:

| # | Finding | Commit | Status |
|---|---|---|---|
| 9.1 | First-link issuance on invoice finalization (D-84) | `499043e` | ✅ Fixed |
| 9.2 | Front Desk browser-access defaults + per-module admin UI | `7bca66b`, `2d1996b` | ✅ Fixed |
| 9.3 | Payment-success receipt access | `365ed1d` | ✅ Fixed |
| 9.4 | Reissue daily-cap race condition | `1632d4c` | ✅ Fixed |
| 9.5 | Per-route rate limiting on public owner-portal endpoints | `28ab148` | ✅ Fixed |
| 9.6 | Mutation-failure error feedback (billing/queue/inventory) | `08da99c`, `72b90f0`, `fbd4f08` | ✅ Fixed |
| 9.7 | D-24 actor/timestamp at the real usage site | `2d1996b` | ✅ Fixed |
| 9.8 | `09-VALIDATION.md` false-passing rows | `75b5a80` | ✅ Fixed (doc-only) |
| 9.9 | ExpiredLinkState clinic-phone wiring | `67d1b32` | ✅ Fixed |

**Full regression after all fixes** (`npx vitest run` from `apps/api/`, clean DB, no interfering processes): 151 files passed, 9 skipped, 3 failed; 1945 tests passed, 80 todo, 8 failed. The 8 failures are the same two pre-existing, out-of-scope categories already documented in `09-VALIDATION.md` before any of today's fixes (`tests/scheduling/appointment-reads.test.ts` — untouched by any Phase 9 commit; `tests/billing/webhook.test.ts` / `combined-payment-link.test.ts` — BullMQ worker timing flake, nondeterministic subset each run). All ~40 new tests added by today's fixes pass. `pnpm --filter @breeyo/web build` succeeds.

**One mid-run false alarm, self-diagnosed and resolved:** a first full-suite pass showed `tests/tenant-isolation.test.ts` (Phase 1's core security suite) failing with foreign-key violations. Traced to a stray API dev-server process I'd left running from an earlier browser-verification step in this same session — its background workers (BullMQ scheduling sweep, notifications, etc.) were hitting the same shared dev Postgres concurrently with the test run. Killed the process, confirmed the database was already back to zero rows, and re-ran — clean, 22/22 passing. Not a code regression; a test-environment hygiene miss on my part, caught before being reported as a finding.

**Not fixed, by acknowledged residual risk (not deferred, not forgotten):**
- 9.1's fix has no concurrency guard against two invoices finalizing for the same owner in the same instant (unlike 9.4's fix, which got exactly this treatment). Worst case is a duplicate WhatsApp send/link row, not a security issue — accepted as-is given severity, flagged here for visibility rather than silently omitted.
- 9.3's combined multi-invoice checkout issues one `PaymentReceipt` per invoice leg; the success banner links only the first selected invoice's receipt. Documented as a deliberate simplification in that fix's commit, not a bug.

---

## How to read this

Each item has: **files**, **root cause**, **fix shape**, **needs-a-decision or not**, and **doc updates required**. All 9 items are owned by Phase 9's existing plans (09-01, 09-02, 09-05, 09-06) — none require a new plan number except where noted.

---

### 9.1 No production path ever issues an owner's first magic link — **needs-a-decision**

- **Files:** `apps/api/src/modules/owner-portal/portal-reissue.service.ts` (the only existing `ownerPortalMagicLink.create` call site, and it requires an already-expired row to rotate from). No file anywhere creates a *first* link.
- **Root cause:** Plan 09-05 built the full read/pay/reissue backend and Plan 09-06 built the full portal UI, but no plan in Phase 9 ever specified *what triggers the first link a clinic sends an owner*. `09-CONTEXT.md` and `09-RESEARCH.md` both assume this link "arrives via WhatsApp" but never lock down the triggering event.
- **Why it wasn't already decided:** checked `09-CONTEXT.md`'s D-46 through D-82 — all of them describe what the portal does *once opened*, none describe when/how a clinic first issues access. This was never asked, not decided-and-missed.
- **Decision needed:** what event should create the first `OwnerPortalMagicLink` row? Candidates: (a) automatically on invoice finalization (piggybacking Phase 6's existing invoice-delivery WhatsApp message), (b) automatically on first visit/consultation completion, (c) an explicit staff-triggered "Send Portal Link" action from the browser dashboard or mobile app, or (d) some combination (auto-send on invoice, plus a manual staff override for owners without an invoice yet, e.g. a preventive-care-only visit).
- **Fix shape once decided:** a new `PortalLinkIssuanceService` (or similar) that creates the first `OwnerPortalMagicLink` row and enqueues the `owner_portal_link` WhatsApp template (already built in 09-05) — wired to whichever trigger is chosen. TDD: failing test asserting the trigger event results in a queryable link row + a WhatsApp send, then minimal implementation.
- **Doc updates:** new D-XX decision in `09-CONTEXT.md` recording the chosen trigger; new plan (09-08) or an amendment to 09-05's task list; new acceptance criterion in `09-VALIDATION.md` covering "first-link issuance," since none of the current rows test this at all.

---

### 9.2 Front Desk browser access can't actually be enabled — **small, no decision needed**

- **Files:** `packages/types/src/web-dashboard.ts:108-117` (`DEFAULT_BROWSER_ACCESS_BY_ROLE.FRONT_DESK`), `apps/web/app/users/page.tsx:163-184` (admin UI).
- **Root cause:** the Front Desk default sets every sub-module flag (`queueEnabled`/`schedulingEnabled`/`billingEnabled`/`inventoryEnabled`) to `false`, not just `browserEnabled`. `access-policy.service.ts`'s upsert create-branch fills unspecified fields from this default, so enabling `browserEnabled` alone leaves Front Desk with zero visible modules. The admin Users page only renders one checkbox (`browserEnabled`) — there's no control for the sub-module flags at all, even though the PATCH endpoint already accepts them.
- **This is a direct regression against the already-locked D-15/D-17**, not an undecided question: D-17 says "When enabled, Front Desk can actively manage queue, billing, and scheduling."
- **Fix:** (a) change `DEFAULT_BROWSER_ACCESS_BY_ROLE.FRONT_DESK` so `queueEnabled`/`schedulingEnabled`/`billingEnabled`/`inventoryEnabled` default to `true` and `inventoryWriteEnabled`/`usersEnabled` stay `false`, matching D-17/D-18 exactly; (b) add per-module toggle controls to the admin Users page's browser-access section, wired to the same PATCH endpoint that already accepts these fields.
- **Doc updates:** `09-VALIDATION.md` row 09-02-01 needs an added test asserting the *actual* default values per field (not just `browserEnabled`/`inventoryWriteEnabled`/`usersEnabled` as today), since that's exactly the gap that let this ship unnoticed.

---

### 9.3 Payment-success receipt access is non-functional — **small, no decision needed**

- **Files:** `apps/web/app/portal/[token]/PortalBody.tsx:179-184` (renders `PaymentResultBanner` with no `receiptUrl`), `packages/types/src/owner-portal.ts` (no `receiptUrl` field anywhere), `apps/api/src/modules/owner-portal/portal-checkout.service.ts` (no receipt lookup).
- **Root cause:** the real `PaymentReceipt` model/route (`GET /billing/invoices/:invoiceId/receipts/:receiptId`) is staff-only/authenticated and was never exposed through the owner-portal's public contract. D-71 ("success must expose receipt access before navigating elsewhere") was built as UI scaffolding with no backing data.
- **Fix shape:** add a scoped, token-authenticated receipt-access endpoint (e.g. `GET /owner-portal/:token/invoices/:invoiceId/receipt`) that re-checks the invoice is in the token's `allowedInvoiceIds` (same pattern as every other 09-05 route) before returning a receipt URL/PDF; wire `PortalCheckoutService`'s success path and `InvoiceDetailSheet.tsx`'s "View Receipt" link to it.
- **Doc updates:** `09-VALIDATION.md` needs a new row for this endpoint; `09-06-SUMMARY.md`'s Deviations section should have named this as still-open (it didn't) — correct that when the fix lands.

---

### 9.4 Reissue daily-cap race condition — **small, no decision needed**

- **Files:** `apps/api/src/modules/owner-portal/portal-reissue.service.ts:53-92`.
- **Root cause:** the D-82 3-per-24h count check and the new-link `create()` are two independent, unwrapped queries with no transaction or lock, so concurrent requests can both pass the count check before either creates its row.
- **Fix:** wrap the count-check-then-create in a single `$transaction` (or use a DB-level guard — e.g. a partial unique index / advisory lock keyed on `ownerId`) so the check-and-act is atomic.
- **Doc updates:** `09-VALIDATION.md`'s cross-cutting reissue-cap row needs a concurrency test added (two near-simultaneous reissue calls, assert only the allowed number succeed).

---

### 9.5 No per-route rate limiting on public owner-portal endpoints — **small, no decision needed**

- **Files:** `apps/api/src/modules/owner-portal/owner-portal.routes.ts`.
- **Root cause:** every owner-portal route inherits only the generic global 200/min limit. `09-RESEARCH.md`'s own pitfall P-7 recommends a tighter per-route limit (~20/min) for this public, unauthenticated surface, specifically calling out the session/exchange and reissue endpoints.
- **Fix:** add `config.rateLimit` overrides on the owner-portal route registrations (tighter for `session`/`records`/`invoices`/`care-dates`/`checkout`, tightest with `ban` on `reissue`, on top of the D-82 DB-backed cap from 9.4).
- **Doc updates:** `09-VALIDATION.md` gets a new row for this; `09-RESEARCH.md`'s P-7 entry can be marked addressed.

---

### 9.6 Mutation failures produce no user-visible feedback — **medium, no decision needed**

- **Files:** `apps/web/src/features/billing/hooks/useBillingWorkbench.ts`, `apps/web/src/features/queue/hooks/useQueueBoard.ts`, `apps/web/app/inventory/page.tsx`.
- **Root cause:** none of these mutation handlers (refund, void, collect-payment, queue-status-update, stock-adjust) catch a rejected promise — errors propagate as unhandled rejections from unawaited `onClick` handlers, so a failed action shows nothing to the user. Both 09-04 and 09-03's own task text explicitly commit to "use toasts... for failures" (D-42/D-43), so this is a direct shortfall against an already-locked decision, not an open question.
- **Fix:** add a shared lightweight toast/error-banner primitive (there is currently none in `apps/web` at all) and wire `try/catch` around each of the mutation calls above to surface it on failure.
- **Doc updates:** `09-VALIDATION.md` needs a test per workbench asserting a rejected mutation surfaces a visible error, not just that a *successful* mutation updates the UI (today's tests only cover the happy path for these calls).

---

### 9.7 D-24 actor/timestamp missing at the one real usage site — **trivial**

- **Files:** `apps/web/app/users/page.tsx:186-194`.
- **Root cause:** the deactivate/reactivate confirmation calls `HighRiskConfirmDialog` without `actorName`/`timestamp`, even though `users.controller.ts`'s response already returns `updatedByUserId`/`updatedAt` for exactly this purpose; the fetched response is discarded and the member list is just reloaded.
- **Fix:** thread `updatedByUserId` (resolved to a display name — the member list already has names) and `updatedAt` from the mutation response into the dialog's props.
- **Doc updates:** none beyond the code fix; D-24 itself is already correctly documented, only the implementation was incomplete.

---

### 9.8 My own `09-VALIDATION.md` edit falsely marked 4 nonexistent tests as passing — **trivial, doc-only**

- **Files:** `.planning/phases/09-web-dashboard-owner-portal/09-VALIDATION.md`.
- **Root cause:** during the build phase I bulk-replaced every `| pending |` cross-cutting-checks row with `| ✅ passing |` via a blanket find/replace without checking each row's backing test file actually exists. Four don't: `portal-isolation.test.ts`, `clinic-scope.test.ts`, `reissue-rate-limit.test.ts`, `browser-permissions.test.ts`. The doc's own Wave-0-gaps section still (correctly) lists these as missing, so the doc now contradicts itself.
- **Fix:** revert those 4 rows to reflect reality — either `❌ W0` (not yet written) or write the missing tests (recommended, since 9.4/9.5 above create natural homes for the rate-limit/reissue-cap ones, and OWN-06 cross-clinic isolation deserves real integration coverage regardless).
- **Doc updates:** this *is* the doc update.

---

### 9.9 ExpiredLinkState's own help bar never wired to a real clinic number — **trivial, no decision needed**

- **Files:** `apps/web/src/features/owner-portal/components/ExpiredLinkState.tsx:85-98`.
- **Root cause:** the `clinicPhone` fix (commit `6bb1fa7`) only reached `PortalShell.tsx`'s shared `PortalHelpBar`. `ExpiredLinkState` renders its own separate inline help bar (needed because the `EXPIRED` session envelope carries no data per T-09-16) that was never updated and still hardcodes `href="#"`.
- **Why this isn't actually a new product decision:** the same "safe to show because the owner already received this link from this real clinic" reasoning already applied and approved for the `READY` state's `clinicPhone` fix applies identically here — an expired token's holder also already received it from a real clinic. The only gap is that the `EXPIRED` envelope's schema doesn't carry the field yet.
- **Fix:** widen the `EXPIRED` session response (and/or the reissue response) to include `clinicPhone`, sourced the same way `portal-session.service.ts` already does for `READY`, and wire it into `ExpiredLinkState`'s help bar the same way `PortalHelpBar` already does.
- **Doc updates:** `09-06-SUMMARY.md` should note this alongside the other clinic-phone fix; add an `href` assertion to `portal-shell.test.tsx`'s expired-screen test (today it only asserts the links exist, not their target).

---

## Execution order

Non-decision items (9.2 through 9.9) proceed immediately as normal TDD bug fixes in the existing `breeyo/phase-09-web-dashboard-owner-portal` worktree. 9.1 is the one blocking item requiring your call before any code gets written for it — see the question that follows this doc.
