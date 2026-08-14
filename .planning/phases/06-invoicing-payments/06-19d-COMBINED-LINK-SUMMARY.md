---
phase: 06
plan: 19d
subsystem: billing
tags: [payments, razorpay, payment-links, D-27, D-39, tdd]
type: follow-up
requires:
  - 06-03 (Payment.paymentGroupId, relaxed (razorpayPaymentLinkId, invoiceId) unique constraint)
  - 06-04 (createPaymentLinkSchema shaped as invoiceIds: string[])
  - 06-09 (PaymentService.createPaymentLink, razorpay.client.ts, paymentGroupId on every link)
  - 06-10 (webhook.worker.ts resolveLegs group fan-out)
provides:
  - POST /billing/payment-links (combined multi-invoice Razorpay link)
  - PaymentService.createCombinedPaymentLink
  - CombinedPaymentLinkResult (paymentGroupId + per-invoice breakdown)
affects:
  - apps/api/src/modules/billing/payment.service.ts
  - apps/api/src/modules/billing/payment.controller.ts
  - apps/api/src/modules/billing/billing.routes.ts
tech-stack:
  added: []
  patterns:
    - Collection-scoped route for a set-valued subject, not a nested per-invoice route
    - Relationship guards (one owner, each payable) before the gateway call, never after
    - FOR UPDATE re-read inside the write transaction to bound a pre-gateway balance read
key-files:
  created:
    - apps/api/tests/billing/combined-payment-link.test.ts
  modified:
    - apps/api/src/modules/billing/payment.service.ts
    - apps/api/src/modules/billing/payment.controller.ts
    - apps/api/src/modules/billing/billing.routes.ts
    - .planning/phases/06-invoicing-payments/deferred-items.md
    - .planning/phases/06-invoicing-payments/06-CONTEXT.md
    - .planning/phases/06-invoicing-payments/06-19-VERIFICATION.md
decisions:
  - Combined links reject a mixed-owner set (D-27) and treat two null owners as two strangers
  - An already-settled invoice is a 409 INVOICE_ALREADY_SETTLED, not a silent skip
  - An existing pending link on a member invoice does NOT block a combined link (parity with the single-invoice path)
  - reference_id carries the first invoice id; the paymentGroupId is what settles the group
metrics:
  duration: ~50 min
  tasks: 2 (RED, GREEN)
  tests-added: 18
  completed: 2026-08-14
---

# Phase 6 Plan 19d: D-39 Combined Multi-Invoice Payment Link Summary

Closes D-39 by adding the one missing half of the combined payment link — the creation path — so a multi-pet owner can settle several invoices from one Razorpay QR code, and 06-10's webhook fan-out finally has a group the product itself produced.

## What was missing

D-39 was confirmed in scope at plan review but shipped only as groundwork spread across four plans. Everything a combined link needs existed *except* the ability to make one:

| Piece | Plan | State before this work |
|-------|------|------------------------|
| `Payment.paymentGroupId` + `@@unique([razorpayPaymentLinkId, invoiceId])` | 06-03 | Built |
| `createPaymentLinkSchema` taking `invoiceIds: string[]` | 06-04 | Built, no caller |
| `paymentGroupId` populated on every single-invoice link | 06-09 | Built |
| Webhook fan-out across a `paymentGroupId` | 06-10 | Built, exercised only against hand-seeded rows |
| **Endpoint / service method that creates a combined link** | — | **Absent** |

Note the correction to the record: `06-19-VERIFICATION.md` B3 listed the webhook fan-out as unbuilt. It was in fact delivered by 06-10 (`resolveLegs`); only the creation path was genuinely missing. The verification row has been annotated rather than rewritten.

## What was built

**`PaymentService.createCombinedPaymentLink(clinicId, invoiceIds, actor, options)`**

Sums the outstanding balances, opens ONE Razorpay link for the total, and writes one pending `Payment` row per invoice sharing a freshly minted `paymentGroupId`. That row-per-invoice shape is the load-bearing detail: it is exactly what `resolveLegs` queries, so the two halves now agree without either being modified. A single aggregate row against a "primary" invoice would have settled one invoice and stranded the rest, and no correct webhook code could have recovered the association.

**`POST /billing/payment-links`** — collection-scoped, behind `MANAGE_PAYMENTS` (the same gate as single-invoice link creation). Not nested under `/billing/invoices/:invoiceId` because the request's subject is the set; nesting would make one arbitrary member look privileged in the URL while the body named the rest. It parses the `createPaymentLinkSchema` that 06-04 shaped for precisely this and has had no caller until now.

**Reuse rather than duplication.** The method calls the existing per-clinic `getRazorpayForClinic` factory, `toRazorpayExpiry`, `normalizeRazorpayError`, `buildCustomer`, `lockInvoice` and `writeBillingAuditLog`. State payability delegates to the existing private `assertPayable` and re-raises the failure with the invoice named, so D-20 keeps one definition of "payable" instead of acquiring a second that could drift. No money or GST logic was reimplemented — a combined link only sums balances that invoice finalization already computed.

### Rejected combinations

Every guard asks a question that has no single-invoice equivalent, and each runs *before* the SDK call so an invalid set is a named 4xx rather than a 502 that reads to the front desk as a gateway outage.

| Condition | Status | Code |
|-----------|--------|------|
| Invoices span two owners | 400 | `INVOICES_NOT_SAME_OWNER` |
| An unattributed walk-in combined with an owner invoice | 400 | `INVOICES_NOT_SAME_OWNER` |
| A member invoice is already settled | 409 | `INVOICE_ALREADY_SETTLED` |
| A member is voided or still a draft | 409 | `INVALID_STATE_TRANSITION` (invoice named) |
| A member belongs to another clinic | 404 | `INVOICE_NOT_FOUND` |
| Combined total below ₹1 | 400 | `AMOUNT_BELOW_GATEWAY_MINIMUM` |
| Balance moved during the gateway round trip | 409 | `INVOICE_BALANCE_CHANGED` (link cancelled) |

## Key decisions

**Two null owners are two strangers, not one customer.** A lone invoice is exempt from the owner check — that is the degenerate group of one, and D-44 explicitly allows a walk-in with no owner record to be handed a QR code. The moment there are two invoices, an owner is required on each and they must match. Treating `null === null` as "same owner" would silently combine two unrelated counter sales into one payment with one refund counterparty.

**`INVOICE_ALREADY_SETTLED` is a new error, because `assertPayable` cannot catch this.** `isValidInvoiceTransition` returns true for `PAID → PAID` so that a replayed webhook is a no-op rather than a 409 (06-RESEARCH webhook constraint 4). A request to open a *new* link for a settled invoice is not a replay — it is staff about to show an owner a QR code for zero rupees — so the balance is checked explicitly after the state check. Without this, the single-invoice path's behaviour would have carried over: a settled invoice produces the misleading "below the gateway minimum" error.

**A pending link on a member invoice does not block a combined link.** Considered and rejected. It is a genuine hazard (two live links for one balance), but the single-invoice path permits it too, and rejecting only here would break a real workflow: an expired-at-Razorpay link stays `pending` on our side until the expiry sweep runs, which would block the combined link entirely. The existing D-36 overpayment machinery already detects and flags the outcome. Fixing this properly means fixing it for both paths and is out of scope for a gap-closing follow-up.

**A `FOR UPDATE` re-read inside the write transaction.** The balances are read before the gateway round trip, so cash taken at the counter in that window would leave the link over-collecting. Each invoice is re-locked and its balance re-verified inside the transaction; a mismatch rolls the rows back and cancels the link at Razorpay. This is stricter than the single-invoice path, which reads without a lock — justified because a combined link multiplies the exposure across several invoices, and because the failure mode (an owner charged more than owed) is the one this module exists to prevent.

## Tests

`apps/api/tests/billing/combined-payment-link.test.ts` — 18 integration tests, real Postgres and real Redis, with Razorpay doubled at the module boundary exactly as `payment.test.ts` does it (no test credentials are provisioned for this repository). The AES-256-GCM credential envelope, the HMAC over raw request bytes, permission resolution and every written row are real.

The closing test is the one that matters: it drives `POST /billing/payment-links` for two invoices, takes the `reference_id` and `notes` the service actually sent to the gateway, builds a genuinely signed `payment_link.paid` for the created link, posts it to the real webhook route and runs the real `applyWebhookEvent`. Both invoices land `PAID` with zero balance, no exception flag, two captured payments summing to the link total, and one receipt each (D-13 — the owner paid two invoices and the clinic's books record two settlements). This is the first time 06-10's fan-out has been exercised against a group the product created rather than rows a test seeded by hand.

One test was tightened during RED: the credential-leak scan passed vacuously against a 404 body, so it now asserts a 200 and a present `shortUrl` first.

## TDD gate compliance

| Gate | Commit | Evidence |
|------|--------|----------|
| RED | `8d2a7eb` | 18 tests, all failing (route absent) |
| GREEN | `df565a0` | 18/18 passing |
| REFACTOR | — | Not needed; no duplication introduced |

RED was verified genuinely red — the initial run had one passing test, which was investigated and found to be vacuous rather than accidentally satisfied, then strengthened until all 18 failed.

## Verification

| Check | Result |
|-------|--------|
| New suite | 18/18 passing |
| Full API suite (`vitest run`) | 1039 passed, 0 failed, 80 pre-existing `it.todo` (known item C7), 78 files |
| `tsc --noEmit` (apps/api) | 0 errors |
| `scripts/check-tenant-client.sh` (D-30) | Pass — 33 files scanned, no unexempted admin-client use |
| `scripts/verify-phase-06.sh` | ALL CHECKS PASSED; BIL-05 now 42 tests |

## Deviations from plan

**[Rule 3 — Blocking] Worktree had no dependencies, no Prisma client and no database.**
Claude Code branched the worktree from `origin/main` (Phase 5), so it was fast-forwarded onto `breeyo/phase-06-invoicing-payments` first. It then had no `node_modules` (`pnpm install --frozen-lockfile`), no generated Prisma client (`prisma generate`), and no built workspace packages — `@breeyo/types` and `@breeyo/validators` needed building before Vite could resolve them.

**[Rule 3 — Blocking] The developer's dev database is at Phase 5 and has a divergent migration history.** It lacks every Phase 6 table, and it holds a migration (`20260812200629_add_phases_3_through_5`) that does not exist on this branch, so `migrate deploy` against it would have been both destructive and unreliable. Rather than mutate the developer's database, an isolated `breeyo_d39` database was provisioned in the existing `breeyo-postgres-1` container with the CI sequence: `migrate deploy`, `init-rls-roles.sql`, `post-migrate.sql`, `prisma/seed.ts`. Connection URLs were derived programmatically from the developer's own `.env` by swapping only the database name, so no credential was read, printed or copied. **The developer's `breeyo` database was not modified.**

One consequence worth noting: `apps/api/.env` was copied into the worktree so the suite could reach the container. It is gitignored and was not committed. The throwaway env-swapping runner used during this work has been deleted; the working tree is clean.

To re-run this suite later, provision a database with the CI sequence above and export `DATABASE_URL` and `DATABASE_URL_APP` pointing at it, then run `pnpm exec vitest run` from `apps/api`. The `breeyo_d39` database created for this work is still present in the `breeyo-postgres-1` container and can be dropped whenever convenient:

```
docker exec -i breeyo-postgres-1 psql -U breeyo_admin -d postgres -c "DROP DATABASE breeyo_d39;"
```

No Rule 1, Rule 2 or Rule 4 deviations. No architectural decisions required.

## Known stubs

None. The endpoint is fully wired and exercised end to end.

## Deferred (unchanged scope)

* **Invoice-picker UI.** No mobile screen selects several of an owner's invoices; the endpoint has no client caller yet. Tracked in `deferred-items.md` item 14.
* **Per-invoice allocation of a partial settlement.** The worker allocates in creation order and leaves short legs pending — correct, but currently unreachable, since combined links are created with `accept_partial: false`.

## Threat flags

None. The endpoint adds no new trust boundary: it sits behind the existing `MANAGE_PAYMENTS` gate on the tenant-scoped client, reads and writes only clinic-scoped rows, returns no credential, and cross-clinic ids read as absent rather than forbidden.

## Self-Check: PASSED

* `apps/api/tests/billing/combined-payment-link.test.ts` — FOUND
* `.planning/phases/06-invoicing-payments/06-19d-COMBINED-LINK-SUMMARY.md` — FOUND
* Commit `8d2a7eb` (RED) — FOUND
* Commit `df565a0` (GREEN) — FOUND
