---
phase: 09-web-dashboard-owner-portal
plan: 06
subsystem: owner-portal-web-ui
tags: [nextjs, react, vitest, TDD, owner-portal, mobile-first, lighthouse]
dependency_graph:
  requires: [09-01, 09-05]
  provides: [owner-portal-shell, owner-portal-records-ui, owner-portal-invoice-checkout-ui, owner-portal-lighthouse-budget]
  affects: [09-07]
tech_stack:
  added: ["@lhci/cli (dev-only, invoked via npx, not added to package.json)"]
  patterns:
    - "unauthenticated web surface: no useAuth/AuthProvider dependency, no Socket.IO -- usePortalSession resolves state from a raw URL token via plain fetch (apiClient with no `token` option, so no Authorization header is ever sent)"
    - "render-prop shell: PortalShell owns usePortalSession and the validating/ready/expired/invalid state matrix, and hands the ready body to a `children(context)` render prop so page routes stay thin"
    - "one persistent PortalBody per shell instance, not per-tab mounted components -- usePortalCheckout's selection state must survive both a pet switch and a tab switch, so it (and the pet records/invoices fetch hooks) live above the activeTab branch, not inside it"
key_files:
  created:
    - apps/web/src/features/owner-portal/hooks/usePortalSession.ts
    - apps/web/src/features/owner-portal/hooks/usePortalCheckout.ts
    - apps/web/src/features/owner-portal/components/PortalShell.tsx
    - apps/web/src/features/owner-portal/components/TrustBanner.tsx
    - apps/web/src/features/owner-portal/components/PortalTabBar.tsx
    - apps/web/src/features/owner-portal/components/PetSwitcher.tsx
    - apps/web/src/features/owner-portal/components/OwnerSummaryCard.tsx
    - apps/web/src/features/owner-portal/components/VisitTimeline.tsx
    - apps/web/src/features/owner-portal/components/VisitCard.tsx
    - apps/web/src/features/owner-portal/components/PrescriptionUsageCard.tsx
    - apps/web/src/features/owner-portal/components/InvoiceList.tsx
    - apps/web/src/features/owner-portal/components/InvoiceDetailSheet.tsx
    - apps/web/src/features/owner-portal/components/CheckoutHandoffSheet.tsx
    - apps/web/src/features/owner-portal/components/PaymentResultBanner.tsx
    - apps/web/src/features/owner-portal/components/ExpiredLinkState.tsx
    - apps/web/src/features/owner-portal/__tests__/portal-shell.test.tsx (13 tests)
    - apps/web/src/features/owner-portal/__tests__/visit-timeline.test.tsx (7 tests)
    - apps/web/src/features/owner-portal/__tests__/invoice-flow.test.tsx (14 tests)
    - apps/web/app/portal/[token]/page.tsx
    - apps/web/app/portal/[token]/PortalBody.tsx (not in the plan's files_modified list -- see Deviations)
    - apps/web/app/portal/[token]/portal-page.module.css
    - apps/web/app/portal/[token]/visit/[visitId]/page.tsx
    - apps/web/app/portal/[token]/invoice/[invoiceId]/page.tsx
    - apps/web/lighthouserc.owner-portal.json
    - all *.module.css siblings of the components above
  modified:
    - vitest.config.ts (root: added apps/web/src/features/owner-portal test glob, matching 09-04's precedent for extending this shared file)
    - apps/web/package.json (added a `start` script -- `next start -p 3001` -- required by lighthouserc.owner-portal.json's `startServerCommand`; none existed before this plan)
    - .gitignore (added `.lighthouseci`, LHCI's generated report output)
metrics:
  duration: ~4 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 3 (Task 3 is the checkpoint:human-verify gate -- intentionally not attempted, see below)
---

# Phase 09 Plan 06: Owner Portal Web UI (Shell, Records, Invoice Checkout, Perf Budget) Summary

Built the owner-facing web UI against the already-committed 09-05 backend: a public, unauthenticated `PortalShell` with a full validating/ready/expired/invalid state matrix, trust banner, tab bar, pet switcher, read-only visit-timeline records, pet-scoped invoice browsing with cross-pet combined checkout, an explicit pre-Razorpay handoff, payment-return banners, expired-link reissue, and a Lighthouse mobile-4G performance budget. Both Task 1 and Task 2's exact `<verify>` test commands pass (20 tests, then 14 more — 34/34 total). Task 3 (`checkpoint:human-verify`) was intentionally left for a human, per the assignment, and is not represented as done anywhere below.

## What Was Built

### Task 1: Shell, trust banner, deep-link routing, and records UI (TDD)

- **`usePortalSession.ts`** — resolves `GET /owner-portal/:token/session` into a `validating → ready | expired | invalid` state matrix. Deliberately built on plain `apiClient` (no `token` option, so no `Authorization` header) rather than `useAuth`/`AuthProvider` — this route takes a raw token in the URL path, never a JWT. Resolves the D-60 deep-link starting tab (`INVOICE` → `INVOICES`, `VISIT` → `RECORDS`, else the D-53 restored tab or the server's `defaultTab`) and the D-53 restored/first pet before flipping to `ready`. Also exports `cachePortalMagicLinkId`/`readCachedPortalMagicLinkId`, a `localStorage`-backed cache that exists specifically to make expired-link reissue possible at all — see Deviations.
- **`PortalShell.tsx`** — owns `usePortalSession` and renders the full state matrix: a centered "Verifying your secure link…" validating screen, an `InvalidScreen` with no owner/pet data ever rendered (T-09-16), `ExpiredLinkState` (Task 2's component) for expired links, and the `ready` shell (`TrustBanner` → `PetSwitcher` → `PortalTabBar` → the `children(context)` render-prop body → a persistent help bar). The help bar (`Call Clinic` / `WhatsApp Clinic`) renders on every ready/expired/invalid screen per D-52/D-79.
- **`TrustBanner.tsx`**, **`PortalTabBar.tsx`** (`Overview`/`Records`/`Invoices`, no separate Payments tab per D-57/D-62), **`PetSwitcher.tsx`** (renders `null` for a single-pet owner; shows an unpaid-invoice dot per pet per D-49).
- **`OwnerSummaryCard.tsx`** — combines total-due and most-recent-visit sections with equal weight when both exist (D-47/D-48), renders only the section that applies otherwise, and renders nothing at all when neither exists.
- **`VisitTimeline.tsx` / `VisitCard.tsx` / `PrescriptionUsageCard.tsx`** — a read-only timeline preserving the server's most-recent-first order; each visit shows the clinic's diagnosis term plus an optional plain-language gloss (never fabricated when the server sends `null`), and prescriptions render as cards (drug name, usage instruction, optional owner-facing gloss), never a raw table row.
- **`app/portal/[token]/page.tsx`** and **`app/portal/[token]/visit/[visitId]/page.tsx`** — the overview and visit deep-link routes.
- **Tests**: `portal-shell.test.tsx` (13 tests) covers trust-banner copy, Overview-by-default landing, both deep-link tab resolutions, single- vs. multi-pet switcher behavior, help-bar presence on ready/expired/invalid, and that invalid/expired states never render owner/pet data. `visit-timeline.test.tsx` (7 tests) covers the empty-records copy, diagnosis-gloss presence/absence, and prescription-card rendering including long-text wrapping.

### Task 2: Invoice selection, explicit Razorpay handoff, return states, and performance budget (TDD)

- **`usePortalCheckout.ts`** — owns cross-pet invoice selection (survives pet switches), `POST /owner-portal/:token/checkout`, and the post-handoff return-state inference. See Deviations for why "return state" here is an honest approximation rather than a server-confirmed signal.
- **`InvoiceList.tsx`** — pet-scoped browsing with per-row checkboxes, status chips (`Unpaid`/`Overdue`/`Paid`), and a sticky selection bar whose CTA reads `Pay Invoice` for one invoice or `Pay Selected Invoices` for more than one, matching the 09-UI-SPEC copy contract exactly.
- **`InvoiceDetailSheet.tsx`** — total/balance, a `Pay Invoice` action for unpaid invoices, and receipt access for paid ones (D-54/D-55: detail-view access, not a home-card widget).
- **`CheckoutHandoffSheet.tsx`** — amount due, a per-pet invoice-count/amount breakdown, and a "secure external payment page (Razorpay)... you'll return to this portal afterward" note, shown before anything opens Razorpay (D-66).
- **`PaymentResultBanner.tsx`** — `success` (receipt access, no other action competing for attention), `failure`, and `interrupted` (both offer retry plus clinic contact, per D-71/D-72/D-78/D-81).
- **`ExpiredLinkState.tsx`** — `Request New Link` plus the D-82 daily-cap (`LIMIT_REACHED` → clinic-contact fallback) and a no-cached-id fallback (see Deviations). Extracted out of `PortalShell.tsx`'s Task 1 inline version; `PortalShell` now delegates to it.
- **`app/portal/[token]/invoice/[invoiceId]/page.tsx`** — the invoice deep-link route, reusing `PortalBody` with the target invoice pre-opened.
- **`apps/web/lighthouserc.owner-portal.json`** — mobile/slow-4G-throttled Lighthouse budget asserting `first-contentful-paint` under 3000ms against `/portal/lighthouse-smoke-token`.
- **Tests**: `invoice-flow.test.tsx` (14 tests) covers pet-scoped browsing, empty-invoices copy, multi-invoice selection and the single-vs-plural CTA label, `InvoiceDetailSheet`'s unpaid/paid states, `CheckoutHandoffSheet`'s amount/breakdown/secure-note copy and single-vs-multi CTA label, all three `PaymentResultBanner` states, and `ExpiredLinkState`'s three reissue outcomes (success, daily-cap fallback, no-cached-id fallback) plus help-bar visibility throughout.

## Deviations From The Plan (flagged, not silently made)

1. **`apps/web/app/portal/[token]/PortalBody.tsx` is a new file not in the plan's `files_modified` list.** `PortalBody` (the tab-body component holding `usePortalCheckout`'s state and the records/invoices fetch hooks) was originally written directly inside `page.tsx` as a second named export, so the invoice deep-link route could import and reuse it. Running `pnpm --filter @breeyo/web build` (hard rule 5) **partway through Task 2, not just at the end**, caught this immediately: `next build` rejects it — `"PortalBody" is not a valid Page export field` — because the App Router restricts `app/**/page.tsx` to a fixed export surface. Extracting the exact same component into a colocated non-route file was the fix; no behavior changed, and the extraction is what let the production build stay green for the rest of Task 2.
2. **Root `vitest.config.ts` and `apps/web/package.json` modified**, neither in the plan's `files_modified` list. The `vitest.config.ts` glob addition matches 09-04's own precedent for extending that same shared file for a new feature area; the `apps/web/package.json` `start` script was required for `lighthouserc.owner-portal.json`'s `startServerCommand` (`next start`) to exist at all — `apps/web` had no `start` script before this plan.
3. **`.gitignore` modified** to add `.lighthouseci` (LHCI's generated HTML/JSON report output), which is not something a repo should track.
4. **Verify-command hazard, flagged clearly**: the plan's literal Task 2 verify command is `npx lhci autorun --config=...`. Run exactly as written in a shell where `@lhci/cli` is not already installed locally, `npx lhci` does **not** resolve to the Lighthouse CI tool — it resolves to an unrelated third-party npm package literally named `lhci` (a namesquat: `lhci@4.1.2`, unrelated author). It executed and printed a harmless one-line greeting before exiting, but the point stands regardless of what that particular package happened to do: **the correct invocation is `npx @lhci/cli autorun --config=...`** (the real tool's package is scoped `@lhci/cli`; its own bin is *named* `lhci`, but that only shadows the registry lookup once it's already an installed dependency somewhere on the resolution path — a fresh `npx lhci` invocation goes straight to the registry name instead). This should be corrected in the phase plan template/tooling docs so a future run doesn't silently execute an arbitrary unrelated package under a trusted-sounding name.
5. **Real backend/frontend contract gaps found while building against 09-05.** Two of the four originally listed here have since been fixed at the root rather than left as workarounds (commit `5b827ea` and the `clinicPhone` follow-up); the other two remain open and are restated as found:
   - **Fixed — expired-link reissue's `expiredMagicLinkId` requirement.** `POST /owner-portal/:token/reissue` used to require a client-supplied `expiredMagicLinkId` in its body, cross-checked against the token's own resolved link — but the `EXPIRED` session response never carried that id (by design, no data leak), so this component originally worked around it with a `localStorage` cache from an earlier `READY` visit, which silently failed for a link opened for the first time after it had already expired. Fixed in 09-05's `reissue.controller.ts`/`reissueRequestSchema`: the route now takes no body at all — the raw `:token`, already hash-validated server-side, is the sole identifier, exactly like every other portal route. The `localStorage` cache was removed entirely from `usePortalSession.ts`/`ExpiredLinkState.tsx`.
   - **Fixed — clinic phone/WhatsApp number now in the owner-portal contract.** `PortalSessionService.getSession` now selects `Clinic.contactPhone` and returns it as `clinicPhone` on the `READY` session payload (safe to show back to an owner who already received this exact link from this exact clinic). `PortalHelpBar` in `PortalShell.tsx` renders real `tel:`/`wa.me` links when it's present. The `INVALID` screen still has no session (T-09-16: no data at all for a tampered token, including which clinic it might belong to) and keeps the non-navigating placeholder link it always had — that's an intentional consequence of OWN-06, not a bug.
   - **Still open — D-53 session-restore has no write path.** `PortalSessionService.updateRestoreState` exists in 09-05's backend but is never called by any route in `owner-portal.routes.ts` — there is no `PATCH`/`POST` endpoint for the browser to persist "last tab / last pet / last invoice / last visit / last checkout / last return state" back to the server. `usePortalSession` can only **read** the `restore` object once, from the `READY` session response, to seed the initial tab/pet on load; it cannot write updates back as the owner navigates. D-53's "remember where the owner left off" therefore only works across a page refresh to the extent the server-side value was already set some other way. Left open (not a data-leak or broken-self-service issue like the two above — the feature degrades to "no restore" rather than failing) — a real fix is a small follow-up: wire a `PATCH /owner-portal/:token/session/restore` route to the already-existing service method.
   - **Still open — no Razorpay `callback_url` and no live checkout-session status endpoint.** `PaymentService.createPaymentLink`/`createCombinedPaymentLink` (`apps/api/src/modules/billing/payment.service.ts`, outside this plan's scope) never set Razorpay's `callback_url`, so Razorpay's hosted page cannot redirect back into the portal; and `OwnerPortalCheckoutSession.returnState` is written once as `'pending'` at checkout creation and never updated by any route. There is therefore no server-driven "the owner just returned and here's what happened" signal at all. `usePortalCheckout` opens the payment link in a new tab, uses the Page Visibility API to detect the owner's return, and then re-fetches the selected invoices' balances to infer `success` (balance cleared) vs. `interrupted` (still owed) — `failure` is reserved for a synchronous error from the checkout-creation call itself. This is an honest, clearly-commented approximation (see `usePortalCheckout.ts`'s header comment), not a fabricated confirmation; a real `callback_url` plus a status-reporting endpoint would be a materially better fix in a follow-up plan.
6. **Task 3 (`checkpoint:human-verify`) was intentionally not attempted** — this was called out explicitly in the assignment as a human/separate step, not something to skip by oversight. No claim of completion is made for it anywhere in this summary or in commit messages.
7. **Found and fixed a real Postgres permission gap affecting every Phase 9 route, not just this plan's.** Building a real (non-mocked) integration test for the reissue fix above (`apps/api/tests/owner-portal/reissue-route.test.ts`) surfaced that `breeyo_app` had never been granted access to the five Phase 9 tables `09-01`'s `db push` created — every route using `request.db`/`createTenantClient` against them was failing at runtime with a genuine Postgres `permission denied` error, invisible to every mocked unit test across `09-01`–`09-06`. Fixed by re-running `apps/api/prisma/post-migrate.sql` (idempotent) and folded into `09-01-PLAN.md`'s Task 3 acceptance criteria for any future rebuild. Also found that `tests/helpers/factories.ts`'s `cleanupTestData()` never learned about these five new tables, so orphaned rows accumulate across repeated test runs until a hardcoded test token collides with an old one — fixed by extending that helper.

## Verification

- Task 1 verify: `npx vitest run apps/web/src/features/owner-portal/__tests__/portal-shell.test.tsx apps/web/src/features/owner-portal/__tests__/visit-timeline.test.tsx` → **20/20 passed**.
- Task 2 verify (vitest portion): `npx vitest run apps/web/src/features/owner-portal/__tests__/invoice-flow.test.tsx` → **14/14 passed**.
- Task 2 verify (Lighthouse portion): `npx @lhci/cli@0.15.1 autorun --config=apps/web/lighthouserc.owner-portal.json` (the corrected invocation — see Deviation 4) ran successfully end-to-end against the production build in this environment (a Chrome installation was found; this was not assumed to be unavailable without checking). **First Contentful Paint measured ~920–980ms across 3 runs against `/portal/lighthouse-smoke-token`** (an invalid-token render, since no real magic-link row exists in this environment — still representative of the shell's initial paint cost), well under the 3000ms OWN-05 budget. `assertion-results.json` was empty (no failures); exit code `0`.
- Full owner-portal suite (all three test files together): **34/34 passed**.
- `apps/web` TypeScript project (`tsc --noEmit`): clean, no errors.
- `pnpm --filter @breeyo/web build` (hard rule 5): **succeeds**, registering `/portal/[token]`, `/portal/[token]/invoice/[invoiceId]`, and `/portal/[token]/visit/[visitId]` as dynamic routes alongside the existing dashboard/billing/inventory/queue/schedule/users routes.

## Conventions checked

- `@breeyo/types`/`@breeyo/validators` only — no `@breeyo/shared` reference introduced.
- No import from `@breeyo/ui`'s main barrel anywhere in `apps/web`; every owner-portal component is a plain HTML/CSS-module component using the shared `--color-*`/`--spacing-*`/`--font-*` custom properties already generated at `packages/ui/src/theme/portal.css` (imported once, in `app/layout.tsx`, unchanged by this plan).
- No Node builtins imported into `packages/types`/`packages/validators` by anything in this plan (nothing in this plan touched those packages).
- No Socket.IO, no `useAuth`/`AuthProvider`, no `DashboardShell` anywhere under `apps/web/src/features/owner-portal` or `apps/web/app/portal` — confirmed by grep before finishing.
