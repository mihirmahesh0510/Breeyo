---
phase: 06-invoicing-payments
plan: 19f-REFUND-TX-FIX
type: hotfix
subsystem: billing
tags: [refunds, razorpay, transactions, durability, CR-02]
addresses: 06-REVIEW.md CR-02
requires:
  - 06-09 (payment links, the pattern this now follows)
  - 06-10 (webhook worker, which completes a pending refund)
provides:
  - refund gateway call outside every database transaction
  - durable reservation before the gateway call
  - REFUND_UNRECONCILED audit event
affects:
  - apps/api/src/modules/billing/refund.service.ts
  - apps/api/src/lib/billing-audit-log.ts
  - apps/api/src/modules/billing/billing.routes.ts
tech-stack:
  added: []
  patterns:
    - reserve / send / record three-phase external call (from payment.service.ts)
    - durability as compensation where the external action cannot be undone
key-files:
  created: []
  modified:
    - apps/api/src/modules/billing/refund.service.ts
    - apps/api/src/lib/billing-audit-log.ts
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/src/modules/billing/__tests__/refund.service.test.ts
    - apps/api/tests/billing/refund.test.ts
decisions:
  - A gateway refusal is now recorded as a `failed` refund rather than erased by a rollback
  - A cash leg refunded alongside a refused digital leg stands (D-37 applied to refunds)
  - A lost write-back returns 201, not an error — the gateway accepted, so the refund is genuinely pending
metrics:
  tests_added: 15
  tests_total_api: 1051
  duration: ~2h
  completed: 2026-08-14
---

# Phase 6 Hotfix 19f: Refund Gateway Call Outside the Transaction — Summary

Moved `rzp.payments.refund` out of the Prisma interactive transaction that held
a `FOR UPDATE` lock on the invoice row, restructuring `createRefund` into the
reserve / send / record shape the rest of Phase 6 already uses — so a gateway
acceptance followed by a database failure can no longer erase the record of
money that has left the account.

## The defect (CR-02)

`RefundService.createRefund` opened `this.prisma.$transaction(...)` with no
options — Prisma's default interactive-transaction timeout is 5 000 ms — took a
`FOR UPDATE` lock on the invoice row, and then, inside that transaction and
once per refund leg, made a live HTTPS call to Razorpay.

The file's own header reasoned only about the gateway **rejecting**. The
unhandled case was the opposite one and the expensive one:

1. The gateway **accepts**. Real money is on its way to the owner.
2. The transaction then fails — the 5 s timeout expires (plausible with two legs
   and one slow round trip), `recomputePaymentState` throws, the connection
   drops.
3. Postgres rolls the `refunds` rows back. No row records the refund.
4. `getRefundableAmount` still counts the full captured amount as refundable.
5. The front desk sees an error and retries, issuing a **second** live refund.
   `receipt` is a fresh UUID on every attempt, so Razorpay does not deduplicate
   it for us.

Every other gateway call in the phase is deliberately outside its transaction
with a compensating cancel (`payment.service.ts:370-433`, `:552-604`). This was
the outlier.

## What changed

`createRefund` is now three phases with the boundaries as the point:

| Phase | Method | What it does | Transaction? |
|-------|--------|--------------|--------------|
| 1 | `reserveLegs` | Lock the invoice `FOR UPDATE`, evaluate the bound, select legs, `allocateProRata`, write every refund row (cash `processed`, digital `pending`), recompute, audit `REFUND_INITIATED`, **commit** | One short transaction, no network |
| 2 | `sendToGateway` | The Razorpay calls | **None.** No transaction, no lock |
| 3 | `recordOutcomes` | Gateway id onto an accepted leg; `failed` + recompute onto a refused one | Single statements / one short transaction |

Phase 1 is the old transaction body verbatim, minus the two gateway statements.
The bound, per-leg selection and pro-rata allocation are unchanged.

### Why this closes the hole rather than narrowing it

Two properties, both asserted by tests:

* **The reservation commits before the call.** `pending` is in the subtrahend of
  `Σ captured − Σ (pending + processed)`, so from the instant of commit the
  amount is spoken for. If everything after the gateway call fails, the row is
  still there, the bound is still correct, and the retry is refused. A refused
  retry is a support call; a duplicate refund is unrecoverable.
* **Our primary key travels with the money.** It goes out as both `receipt` and
  `notes.refundId`, on a row that is already durable when the call is made. A
  movement at Razorpay is traceable back to a row here even when the
  `razorpayRefundId` write-back never lands.

The reviewer's stopgap (`{ timeout: 20_000 }`) was deliberately **not** taken —
as the review itself notes, a longer timeout does not close the hole.

### Compensation, where cancellation is impossible

`createPaymentLink` compensates a failed local write by cancelling the link at
the gateway. An accepted refund cannot be cancelled, so the compensation here is
durability instead — the same "never silently lose a money-relevant event"
philosophy as D-35 (void-then-late-payment) and D-36 (overpayment):

* `linkGatewayRefundId` writes the gateway id as **one statement per leg**, not
  a transaction, so one failure cannot roll back a sibling's successful
  write-back.
* If that write fails, the gap is recorded as a new `REFUND_UNRECONCILED` audit
  event carrying `razorpayRefundId`, our `refundId` and the amount — the three
  fields a human needs to close it by hand.
* If even the audit row cannot be written (same database), the failure goes to
  the logger. `RefundService` now takes an optional logger, wired from
  `fastify.log` in `billing.routes.ts`. It is the only billing service that
  takes one, and only for this branch.

## Deviations from the review's prescription

Both are intentional and both are covered by tests.

**1. A gateway refusal is recorded as `failed`, not erased.**

Previously the rejection propagated out of the transaction and the pending row
rolled back — "we do not keep a record of a refund the gateway refused". With
the reservation committed first that is no longer possible, and it is a better
outcome: `failed` is not a reserving status, so `recomputePaymentState` hands
the amount straight back to the bound, and the clinic keeps an auditable record
that a refund was attempted and refused. This is what the review asked for
("mark the pending row `failed` and recompute").

If that write-off itself fails, the rows stay `pending` and keep reserving money
that will never move — refusing later refunds until someone reconciles. That is
the conservative direction: over-reserving costs a support call, under-reserving
costs a duplicate refund.

**2. A cash leg refunded alongside a refused digital leg now stands.**

Previously a mixed cash+digital refund was atomic: a gateway refusal on the
digital leg rolled the cash leg back too. The notes are already back across the
counter by then, and erasing that fact because a gateway refused an unrelated
leg is the refund-side twin of erasing collected cash when a payment link
expires — which D-37 exists to prevent. The cash leg is now durable and the
request still returns 502 so the front desk knows the digital portion did not go
through.

**3. A lost write-back returns 201, not an error.**

The gateway accepted, so the refund genuinely *is* pending and the row says so.
Returning an error would be inaccurate and would invite exactly the retry this
change exists to stop. The response still carries the `razorpayRefundId` the
gateway returned, even though it could not be persisted — the response may be
the only place a human ever sees it.

## Tests

TDD: 11 unit assertions written failing first (commit `2887e74`), then the fix
(`ddc61aa`).

The `$transaction` test double was rewritten to model **COMMIT and ROLLBACK**
rather than just call counts — it stages every write a callback performs and
applies them only when the callback resolves. Without that, a double where
`$transaction(fn) => fn(tx)` is the whole implementation cannot express this
bug at all. The gateway double records the transaction depth it was called at
and a snapshot of what was durable at that moment.

New unit coverage (`refund.service.test.ts`):

* gateway called at transaction depth **0**
* the reserving row is durable before the call
* both legs are durable before the *first* of two gateway calls
* a durable record survives when every post-gateway write fails
* the surviving row carries the id sent as `receipt` / `notes.refundId`
* a retry after a lost write-back is refused, without reaching the gateway
* a lost write-back reaches the logger
* the gateway id is still reported to the caller
* a cash-only refund opens one transaction, calls no gateway, decrypts no
  credential
* a refusal leaves a `failed` row and recomputes twice
* a cash leg stands when its digital sibling is refused

New integration coverage (`tests/billing/refund.test.ts`), against real
Postgres:

* **`has already committed the pending row by the time Razorpay is called`** —
  the mocked gateway queries the database from inside the call on an
  *independent connection*. A row inside an uncommitted transaction is invisible
  there, so seeing it is database-level proof of durability, not a mock
  artefact.
* **`keeps a recoverable record when the write-back after the gateway fails`** —
  forces a genuine unique-constraint violation on `razorpayRefundId`, then
  asserts 201, the surviving `pending` row, the `REFUND_UNRECONCILED` audit row
  with both ids, and that the retry is refused with `REFUND_EXCEEDS_PAID`
  without a second gateway call.

Both were verified to **fail against the pre-fix service** (restored from
`HEAD`, run, restored back): `expected [] to have a length of 1` and
`expected 500 to be 201` respectively.

No D-12/D-42 regression: the bound, per-leg selection, `allocateProRata`
allocation and the pending-counts-too rule all moved into phase 1 unchanged, and
their existing tests pass untouched.

## Verification

Run against an isolated database (`breeyo_cr02` / `breeyo_cr02_shadow`,
provisioned for this worktree; the shared dev DB was not touched).

| Check | Result |
|-------|--------|
| `pnpm exec vitest run` (apps/api) | 1051 passed, 78 files, 0 failures |
| `pnpm exec tsc --noEmit` (apps/api) | 0 errors |
| `bash scripts/verify-phase-06.sh --all` | **ALL CHECKS PASSED** (23/23) |

Gate detail: BIL-01..07, RPT-01, PLT-04 all PASS; INV-MONEY, INV-SCHEMA-MONEY,
INV-NO-CLIENT-TOTAL, INV-TENANT, INV-SOCKET, INV-SECRET, INV-GST-SLABS,
INV-SYNC, INV-TRGM, INV-RLS all PASS; SUITE, TSC-API, TSC-MOBILE (1 Phase 6
error = baseline), EXPO-DEPS all PASS.

## Follow-up (not done here, deliberately)

`webhook.worker.ts:507` matches `refund.processed` / `refund.failed` on
`razorpayRefundId` only. In the rare unreconciled case that column is null, so
the event is refused with "no refund row for this gateway refund id" and the
row is completed by hand from the `REFUND_UNRECONCILED` audit entry.

A `receipt` fallback in `applyRefundOutcome` would automate that last step. It
was not added because it would require guessing at the real `refund` entity
payload shape — the local fixture does not carry `receipt`, and speculating
about a webhook body is how the original claim ("gives the webhook a second way
home", which was never implemented) got into the file. That stale claim has been
removed. Worth a small plan once the payload can be confirmed against a live
test account.

## Scope

Touched only `refund.service.ts`, `billing-audit-log.ts` (one additive enum
member), `billing.routes.ts` (logger wiring) and the two refund test files.
`invoice.repository.ts` / `invoice.service.ts` (CR-01/03/04) and `infra/aws`
(CR-05) were left to their sibling agents. `STATE.md` and `ROADMAP.md` were not
updated.

## Commits

| Hash | Message |
|------|---------|
| `2887e74` | `test(06-19f): failing tests for CR-02 — gateway refund inside the transaction` |
| `ddc61aa` | `fix(06-19f): move the Razorpay refund call out of the database transaction (CR-02)` |
| `9be50dd` | `refactor(06-19f): raise the gateway error before building the accepted-id map` |

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema change. The one new audit
event carries ids and an amount only — no credential, no gateway payload.
