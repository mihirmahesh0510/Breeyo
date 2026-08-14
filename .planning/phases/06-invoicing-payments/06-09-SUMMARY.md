---
phase: 06-invoicing-payments
plan: "09"
subsystem: billing
tags: [payments, razorpay, credentials, receipts, bil-03, bil-05]
status: complete
requires: ["06-00b", "06-03", "06-04", "06-06", "06-07", "06-08"]
provides:
  - "Per-clinic Razorpay SDK factory with credential containment and 502 error normalisation"
  - "PaymentService: cash, split, Payment Links, receipts, D-11 retry/mark-unpaid"
  - "Four /billing payment endpoints (3 behind MANAGE_PAYMENTS, 1 behind VIEW_INVOICES)"
  - "razorpay-mock.ts: SDK double, webhook fixtures, HMAC signer for plan 06-10"
  - "RCT document type on the shared invoice_number_counters allocator"
  - "error-handler.ts allow-list preserving the gateway reason at 502"
affects: ["06-10", "06-11", "06-12", "06-13", "06-16"]
tech-stack:
  added: []
  patterns:
    - "Credential containment enforced by grep: one decryption site, no credential name outside it"
    - "SDK instance hardened post-construction (non-enumerable secret) rather than trusting callers not to serialise it"
    - "Shared test double lives under src/**/__tests__ and is re-exported from tests/helpers (tsc rootDir)"
key-files:
  created:
    - apps/api/src/modules/billing/razorpay.client.ts
    - apps/api/src/modules/billing/payment.service.ts
    - apps/api/src/modules/billing/payment.controller.ts
    - apps/api/src/modules/billing/__tests__/razorpay-mock.ts
    - apps/api/src/modules/billing/__tests__/razorpay.client.test.ts
    - apps/api/src/modules/billing/__tests__/payment.service.test.ts
    - apps/api/src/middleware/__tests__/error-handler.test.ts
    - apps/api/tests/helpers/razorpay-mock.ts
    - apps/api/tests/billing/payment.test.ts
  modified:
    - apps/api/src/middleware/error-handler.ts
    - apps/api/src/modules/billing/billing.routes.ts
    - apps/api/src/modules/billing/billing.schema.ts
    - apps/api/src/modules/billing/numbering.service.ts
    - apps/api/prisma/schema.prisma
    - packages/types/src/constants/invoice-status.ts
    - apps/api/tests/helpers/factories.ts
    - apps/api/tests/helpers/setup.ts
decisions:
  - "Receipts reuse invoice_number_counters via a third docType RCT; doc_type is free-text with a composite PK, so no migration"
  - "error-handler.ts needed a narrow 502+PAYMENT_GATEWAY_ERROR allow-list — the plan's premise that 502 preserves messages was wrong"
  - "Collection path routes on `method`, never on `channel`, so the schema's 'manual' default cannot reach a captured digital payment"
  - "SDK secret redefined non-enumerable: the constructor assigns it enumerably and JSON.stringify would emit it"
  - "D-39 groundwork only: paymentGroupId populated per link, fan-out deferred to 06-10"
metrics:
  duration: ~110m
  tasks: 3
  commits: 3
  tests_added: 67
  completed: 2026-08-14
---

# Phase 6 Plan 09: Payment Collection (Cash, Split, Razorpay Links) Summary

Cash, split and Razorpay Payment Link collection, with per-clinic credentials that
never leave the server and an invoice that is never marked paid on the strength of
a gateway API response.

## Status: COMPLETE

67 new tests, all passing. Full API suite: **826 passed, 0 failed**, 80 todo
(759 before this plan). `tsc --noEmit` clean, `check-tenant-client.sh` passes at
25 files.

## The three questions the plan asked

**1. Receipt numbering — was `InvoiceNumberCounter.docType` widened?**

Yes, to `'INV' | 'CN' | 'RCT'`, and **no migration was needed**. `doc_type` is a
plain `String` column whose primary key is `(clinic_id, doc_type, period)`, so a
third value is a data addition. Widened in three places: `DOCUMENT_NUMBER_TYPES`
in `@breeyo/types`, `DocumentType` in `numbering.service.ts`, and the column
comment in `schema.prisma`.

Reusing the existing allocator was the plan's explicit instruction ("do not
introduce a second numbering mechanism") and is also the right call on its own
merits: `payment_receipts` carries `@@unique([clinicId, receiptNumber])`, and the
counter row is the only allocator in the project that is both collision-free under
concurrency and rollback-safe. A sequence would burn numbers on a rolled-back
payment; a timestamp or random suffix would eventually collide.

Worth recording that the *reason* differs from `INV`/`CN`. CGST Rule 46(b)
consecutiveness governs records of account; a receipt is an acknowledgement of
money received, so gap-freeness here is an operational nicety that comes for free
rather than a statutory duty. Format is `RCT-YYYYMM-XXXX` (15 characters, inside
the 16-character ceiling), resetting on the D-38 financial-year boundary along with
everything else.

**2. Where does `'PAID'` appear in `payment.service.ts`?**

Two occurrences, **neither in a Razorpay success handler**:

| Line | Context | Verdict |
|---|---|---|
| 37 | File-header comment: "And neither writes `'PAID'` as a literal" | Prose |
| 695 | `isValidInvoiceTransition(status, 'PAID')` inside `assertPayable` | A read-only guard asking whether this invoice may receive money at all. It sets nothing. |

There is no assignment of `invoice.status` anywhere in the file. Both collection
paths insert a `Payment` row and call `InvoiceRepository.recomputePaymentState`,
which derives the status from the rows inside the same transaction. The Razorpay
success path writes `status: 'pending'` and does not call the reducer at all —
asserted directly by the unit test *"never marks the invoice PAID on a gateway
200"* and by the integration test that reads the invoice back as `UNPAID` with its
full balance after a successful link creation.

**3. Were Razorpay test credentials available?**

**No — coverage is mock-only**, as the plan anticipated. `RAZORPAY_TEST_KEY_ID`
and `RAZORPAY_TEST_KEY_SECRET` are still unprovisioned, so nothing in this phase
has yet spoken to Razorpay.

What is mocked is narrow and deliberate: only the `razorpay` module itself, at the
module boundary. Everything below runs for real — the test clinic row holds a
genuine AES-256-GCM envelope produced by `encryptSecret`, `getRazorpayForClinic`
genuinely decrypts it, the routes genuinely resolve permissions from Redis, and
every payment row and derived status is genuinely written to Postgres. Seeding a
plaintext secret, or stubbing `getRazorpayForClinic` itself, would have skipped the
decryption path, which is exactly the path T-06-49 is about.

Four things a live test key must still confirm before staging sign-off — the real
param set, the `expire_by` buffer under real latency, the concrete rejection shape,
and a scannable QR on a device. Logged as **deferred item 13**, flagged as blocking
for staging (not for merge) and as a prerequisite for plan 06-10's webhook work,
which cannot be exercised end to end without one.

## What was built

**`razorpay.client.ts`** — the credential boundary. `getRazorpayForClinic` is the
only `decryptSecret` call site in the billing module; `payment.service.ts` names no
credential at all. Instances are cached per clinic and fingerprinted on
`razorpayKeyId`, with `invalidateRazorpayCache` exported for plan 06-12 to call on
a settings write. `normalizeRazorpayError` always throws a 502
`PAYMENT_GATEWAY_ERROR` carrying the gateway's own description.
`RAZORPAY_EXPIRY_BUFFER_SECONDS = 16 * 60`.

**`payment.service.ts`** — `recordCashPayment`, `createPaymentLink`,
`recordSplitPayment`, `retryPaymentLink`, `markPaymentUnpaid`, `getReceipt`, plus
private `applyCashLeg` and `generateReceipt`. Balance guards run under a
`FOR UPDATE` lock inside the transaction that writes the rows.

**`payment.controller.ts` / four routes** — `POST payments`, `POST payments/retry`,
`POST payments/mark-unpaid` behind `MANAGE_PAYMENTS`; `GET receipts/:receiptId`
behind `VIEW_INVOICES`.

**`razorpay-mock.ts`** — call-recording SDK double, `payment_link.paid` and
`refund.processed` fixtures, and `signWebhookPayload` producing the exact hex
HMAC-SHA256 Razorpay sends. Built for plan 06-10 as much as for this one.

## Carried-forward context decisions, as implemented

**D-44 (walk-in with no phone).** `buildCustomer` assembles the Razorpay `customer`
object from whatever the owner actually has — an owner with no mobile yields
`{ name }`, and a walk-in with no owner row at all yields `{}`. Razorpay's
`customer` field is required but all of its own fields are optional, so an empty
object is a valid request. Two unit tests cover both shapes. `notify` is
`{ sms: false, email: false }` regardless, so nothing is ever sent to a contact
that does not exist; the QR is rendered on screen from `shortUrl`.

**D-37 (split leg expiry).** The guarantee lives in a `where` clause. Both
`retryPaymentLink` and `markPaymentUnpaid` scope their `updateMany` to
`{ channel: 'razorpay', status: 'pending' }`, so a captured cash leg is
structurally unreachable from either. `recomputePaymentState` then derives
`PARTIALLY_PAID` from the surviving cash row. Covered at both levels: unit tests
assert the `where` clause itself, and an integration test collects a split, marks
it unpaid and reads the invoice back as `PARTIALLY_PAID` with the cash payment
still `captured`.

Ordering matters here too and is deliberate: in `recordSplitPayment` the cash leg
commits in its own transaction *before* the link is created, so a gateway failure
on the digital leg cannot roll back money already in the drawer.

**D-36 (overpayment).** Two distinct cases, kept apart. The overpayment we *can*
prevent — staff typing a figure larger than the balance — is a 400
`PAYMENT_EXCEEDS_BALANCE` under the row lock, writing nothing. The overpayment we
*cannot* prevent — two legs racing to settle — remains detectable exactly as 06-03
and 06-07 designed: the balance goes negative and `recomputePaymentState` raises
the `overpayment` exception flag. Rejecting the typo keeps the exception list
meaningful, since every entry on it is then a genuine race. `assertPayable` also
refuses any payment on an already-flagged invoice.

**D-39 (combined multi-invoice link).** Groundwork only; full implementation
deferred and logged as **deferred item 14**. `paymentGroupId` is now populated on
every link created — a single-invoice link is the degenerate group of one — and
`retryPaymentLink` carries the existing group forward rather than minting a new
one. That makes D-39 a loop over invoice ids sharing a group id rather than a data
backfill. The substantive remaining work is the webhook fan-out that settles every
invoice in a group from one `payment_link.paid`, which belongs with plan 06-10
because it owns that worker. `createPaymentLinkSchema` (06-04) already takes
`invoiceIds: string[]`; it is not yet wired to a route.

**Grand-total invariant (06-05).** Untouched and relied upon: nothing in this plan
reads or writes `roundOffPaise`, and every payment amount is bounded by
`balancePaise`, which `recomputePaymentState` computes without it.

## Deviations from Plan

### 1. [Rule 3 - Blocking] `error-handler.ts` swallows 502s, contrary to the plan's premise

- **Found during:** Task 1, reading `error-handler.ts` as the task's `read_first`
  instructed.
- **Issue:** The plan states twice — in Task 1's `read_first` and in the
  `normalizeRazorpayError` rationale — that "`error-handler.ts` replaces the
  message on any status >= 500, which is why gateway errors must be raised as 502
  with the reason preserved". The first half is right and the conclusion does not
  follow: the handler's branch is `if (statusCode >= 500)`, which **includes 502**.
  A 502 was therefore rewritten to a 500 `INTERNAL_SERVER_ERROR` with the message
  replaced. Task 3's required behaviour ("502 with `error.code ===
  'PAYMENT_GATEWAY_ERROR'` and a message containing the gateway description") was
  unreachable, and with it D-11's "show the failure reason so staff can choose
  retry or mark unpaid".
- **Fix:** a narrow allow-list branch before the 5xx redaction, matching on **both**
  `statusCode === 502` **and** `code === 'PAYMENT_GATEWAY_ERROR'`. Matching on the
  status alone would forward any upstream proxy 502, which can carry internal
  hostnames; matching on the code alone would let an unrelated 500 opt itself out
  of redaction. Both negative cases are tested.
- **Why this is safe:** the forwarded message is not arbitrary. `normalizeRazorpayError`
  has already narrowed it to `Razorpay: <description>`, where `description` is
  merchant-facing copy Razorpay writes for this purpose. No stack, no request body,
  no header.
- **Commit:** `df0e136`

### 2. [Rule 3 - Blocking] A `src/**` test cannot import from `tests/helpers/`

- **Found during:** Task 1, first `tsc --noEmit`.
- **Issue:** `apps/api/tsconfig.json` sets `rootDir: "src"` and excludes `tests`,
  so `razorpay.client.test.ts` importing `../../../../tests/helpers/razorpay-mock.js`
  fails with TS6059. This would have hit Task 2 harder — the plan places
  `payment.service.test.ts` under `src/modules/billing/__tests__/` and instructs it
  to use the same double.
- **Fix:** the implementation lives at `src/modules/billing/__tests__/razorpay-mock.ts`
  and `tests/helpers/razorpay-mock.ts` re-exports it, so the plan's mandated path
  exists and resolves. `emr.fixtures.ts` is the in-repo precedent for a non-test
  helper inside a `src/**/__tests__` directory, and vitest collects only
  `*.test.ts`, so neither file is mistaken for a suite. One double serves both
  suites — a divergent second copy is how a mock stops resembling the thing it
  stands for — and it now gets typechecked, which nothing under `tests/` currently
  is.
- **Commit:** `df0e136`

### 3. [Rule 2 - Missing critical functionality] The SDK leaks its secret through `JSON.stringify`

- **Found during:** Task 1, writing the serialisation test the plan's behaviour
  list calls for.
- **Issue:** `Razorpay`'s constructor does `this.key_secret = key_secret` as a plain
  **enumerable** own property. `JSON.stringify(client)` on an untouched instance
  emits the live plaintext secret. Any future code that logs a client, embeds one
  in an error payload, or serialises a context object holding one leaks a
  money-moving credential (T-06-49). Returning the raw instance, as the plan's
  action text describes, would have satisfied the letter of the signature while
  leaving the behaviour ("`JSON.stringify` does not include the secret substring")
  false.
- **Fix:** the property is redefined non-enumerable, non-writable and
  non-configurable immediately after construction. The SDK reads it only in its own
  constructor — `client.api`'s axios copy sits behind a function value, which
  `JSON.stringify` skips — so behaviour is unchanged. Four assertions cover it.
- **Commit:** `df0e136`

### 4. [Rule 3] Two acceptance greps assumed an idiom the file did not use

- `grep -c "statusCode = 502"` and `grep -c "statusCode = 409"` both wanted `>= 1`,
  but a shared `domainError(msg, status, code)` helper produces neither string.
  Replaced with two explicit named constructors, `razorpayNotConfigured()` and
  `paymentGatewayError()`, which set the fields directly — this is in fact the
  project's actual idiom (`invoiceNotFound` in `invoice.repository.ts`) and what
  the plan's own action text described, so the greps were right and the first draft
  was not.
- `grep -c 'key_secret'` wanted exactly `1` while the hardening in deviation 3
  needs the property name twice. Resolved with a named `SDK_SECRET_PROPERTY`
  constant used for both the constructor argument and the `defineProperty` call.
  Both the letter (one line) and the intent (not in a template string, a returned
  object, or a log call) hold, and the constant documents what is being hardened.

### 5. [Rule 3] The route-count gate expected 16 get/post routes; the real figure is 14

The gate reads `grep -cE "fastify\.(get|post)\(" billing.routes.ts` and expects
`16` ("twelve from plan 06-08 plus four here"). Two of 06-08's twelve are `patch`
and `delete`, so its get/post count was 10, not 12. The honest equivalent —
`grep -cE "fastify\.(get|post|patch|delete)\("` — returns exactly **16**, and the
route total is exactly the twelve-plus-four the gate was checking for. The
underlying claim is met; the pattern was too narrow. `grep -c 'payHandler'` returns
**7**, above the required 6.

### 6. [Rule 3] The 403 test uses Clinician, not a VIEW_INVOICES+CREATE_INVOICES token

The plan asks for "a token holding only `VIEW_INVOICES` and `CREATE_INVOICES`". No
seeded role has that combination — `FrontDesk` holds all three billing permissions
and `Clinician` holds `VIEW_INVOICES` alone (D-05). The test uses `Clinician`,
which exercises the same gate: a user with billing read access and no
`MANAGE_PAYMENTS` gets 403, and the assertion additionally confirms no `Payment`
row was written. A 401-without-token case is included alongside it.

### 7. [Rule 2] The collection endpoint routes on `method`, not `channel`

`recordPaymentSchema` carries `channel` with a `.default('manual')`. Routing on it
would mean the default value — sent by any client that omits the field — asks the
server to record a **digital payment as already captured on the client's say-so**,
which is precisely the T-06-50 tampering this plan exists to prevent. The
controller routes on `method` instead: `cash` collects and settles, `upi`/`card`
opens a gateway link. Manual attestation of a digital payment keeps its own
narrower, separately audited surface in 06-08's `POST /mark-paid`. Documented at
the top of `payment.controller.ts`.

### 8. [Rule 2] Test-environment hardening

`setup.ts` now falls back to a random `BILLING_ENCRYPTION_KEY` when none is set, so
the suite is hermetic on a bare CI shell (a real `.env` value still wins).
`createTestClinic` accepts Razorpay credential overrides — added here, needed again
by plan 06-10's webhook tests.

## Threat register outcomes

| Threat | Disposition | Where it is enforced |
|---|---|---|
| T-06-49 secret reaching a client, log or error | mitigated | One decryption site; `payment.service.ts` names no credential (`grep 'key_secret\|decryptSecret'` → 0); no logging in `razorpay.client.ts` (→ 0); secret non-enumerable; integration test stringifies the whole body and asserts neither the plaintext nor any `rzp_test_` appears |
| T-06-50 invoice paid on a gateway 200 | mitigated | No status assignment in the service; link path writes `pending` and skips the reducer; unit + integration tests both assert the invoice stays `UNPAID` at full balance |
| T-06-51 amount exceeding balance, or paying a DRAFT | mitigated | `PAYMENT_EXCEEDS_BALANCE` and `assertPayable` inside the `FOR UPDATE` transaction; DRAFT rejected via the shared transition table |
| T-06-52 `expire_by` boundary 400s | mitigated | `16 * 60`; `grep '15 \* 60'` across `modules/billing/` → no output; unit and integration tests both assert the delta ≥ 960 |
| T-06-53 orphan link after a local failure | mitigated | Pending insert and audit row in one transaction; on failure the link is cancelled at the gateway. Unit test forces the transaction to throw and asserts `paymentLink.cancel` was called with the new link id |
| T-06-54 stale client after credential rotation | mitigated | Cache fingerprinted on `razorpayKeyId` plus exported `invalidateRazorpayCache`. **Note:** the fingerprint catches a rotated key id, but a merchant who regenerates only the *secret* keeps the same key id — plan 06-12's settings write **must** call `invalidateRazorpayCache`. Documented on the export |
| T-06-55 gateway reason swallowed by 5xx redaction | mitigated | Deviation 1's allow-list; integration test asserts 502 with the description intact |

**Threat surface scan:** three new authenticated endpoints and one read, all on the
existing `/billing` prefix behind existing permission gates and `tenantContext`. No
new trust boundary beyond the API→Razorpay one already in the register. No threat
flags.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | passes |
| `bash scripts/check-tenant-client.sh` | passes, 25 files |
| `src/modules/billing/__tests__/razorpay.client.test.ts` | 20/20 |
| `src/middleware/__tests__/error-handler.test.ts` | 5/5 |
| `src/modules/billing/__tests__/payment.service.test.ts` | 26/26 |
| `tests/billing/payment.test.ts` | 16/16 |
| Full API suite | **826 passed, 0 failed**, 80 todo |
| `@breeyo/types` / `@breeyo/validators` suites | 52/52 and 142/142 |
| `grep -rn 'decryptSecret' apps/api/src/modules/billing/` | only `razorpay.client.ts` |
| `grep -rn '15 \* 60' apps/api/src/modules/billing/` | no output |

Plan-specified counts: `payment.service.test.ts` has 26 tests (required ≥ 13)
including names containing `expire_by`, `split` and `below gateway minimum`;
`payment.test.ts` has 16 (required ≥ 9).

## Success criteria

| Criterion | Met |
|---|---|
| Cash and split record transactionally with a derived status | yes |
| Links created server-side with a 16-minute buffer and a compliant `reference_id` | yes |
| Only `shortUrl`, `expiresAt`, link id and amount reach the client | yes |
| Gateway failures reach the front desk as 502 with the reason | yes (required deviation 1) |
| D-11 retry and mark-unpaid both work and cancel the outstanding link | yes |

## Notes for later plans

- **06-10 (webhooks):** `tests/helpers/razorpay-mock.ts` already exports
  `signWebhookPayload`, `paymentLinkPaidWebhookFixture` and
  `refundProcessedWebhookFixture`. The idempotency key to settle a pending row is
  `(razorpayPaymentLinkId, invoiceId)`; the expiry sweep should select on
  `(clinicId, status, expiresAt)`. **The sweep must scope its update to
  `channel: 'razorpay', status: 'pending'`** — the same D-37 constraint that
  governs `markPaymentUnpaid` here. `webhook.service.ts` is the second legitimate
  `decryptSecret` site.
- **06-10 also owns D-39's fan-out** (deferred item 14). `paymentGroupId` is
  already populated on every link.
- **06-12 (billing settings):** **must** call `invalidateRazorpayCache(clinicId)`
  in the same request that writes new credentials. A secret-only rotation keeps the
  same key id and is invisible to the cache fingerprint.
- **06-13/06-16 (PDFs, receipts UI):** receipts are numbered `RCT-YYYYMM-XXXX` and
  read via `GET /billing/invoices/:invoiceId/receipts/:receiptId`, gated on
  `VIEW_INVOICES`. `transactionRef` is the gateway payment id for digital payments
  and null for cash.
- **Local test database** follows the per-worktree convention (`breeyo_wt0609`).
  `apps/api` has no run-mode `test` script — use `pnpm --filter @breeyo/api exec
  vitest run`.
- **Live-credential gap** is deferred item 13, blocking for staging sign-off and a
  prerequisite for exercising 06-10 end to end.

## Self-Check: PASSED

All nine created files and all eight modified files exist on disk. All three
commits (`df0e136`, `268824d`, `3861b56`) are present in `git log`.
