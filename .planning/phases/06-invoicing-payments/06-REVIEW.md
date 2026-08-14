---
phase: 06-invoicing-payments
reviewed: 2026-08-14T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - apps/api/src/modules/billing/money.ts
  - apps/api/src/modules/billing/gst.service.ts
  - apps/api/src/modules/billing/numbering.service.ts
  - apps/api/src/modules/billing/invoice.service.ts
  - apps/api/src/modules/billing/invoice.repository.ts
  - apps/api/src/modules/billing/invoice.controller.ts
  - apps/api/src/modules/billing/payment.service.ts
  - apps/api/src/modules/billing/payment.controller.ts
  - apps/api/src/modules/billing/refund.service.ts
  - apps/api/src/modules/billing/credit-note.service.ts
  - apps/api/src/modules/billing/quick-sale.service.ts
  - apps/api/src/modules/billing/stock-validator.service.ts
  - apps/api/src/modules/billing/settings.service.ts
  - apps/api/src/modules/billing/dashboard.service.ts
  - apps/api/src/modules/billing/razorpay.client.ts
  - apps/api/src/modules/billing/webhook.routes.ts
  - apps/api/src/modules/billing/webhook.service.ts
  - apps/api/src/modules/billing/webhook.worker.ts
  - apps/api/src/modules/billing/billing.routes.ts
  - apps/api/src/modules/billing/billing.schema.ts
  - apps/api/src/lib/prisma-rls.ts
  - apps/api/src/lib/crypto.ts
  - apps/api/src/lib/billing-audit-log.ts
  - apps/api/src/middleware/tenant-context.ts
  - apps/api/src/middleware/error-handler.ts
  - apps/api/src/jobs/overdue-invoices.ts
  - apps/api/src/jobs/expire-payment-links.ts
  - apps/api/prisma/post-migrate.sql
  - apps/api/prisma/migrations/20260814000000_add_billing_models/migration.sql
  - packages/validators/src/billing.ts
  - packages/types/src/constants/invoice-status.ts
  - apps/mobile/src/features/billing/lib/format.ts
  - apps/mobile/src/features/billing/lib/payment-collection.ts
  - apps/mobile/src/features/pdf/templates/invoice.ts
findings:
  critical: 5
  warning: 9
  info: 6
  total: 20
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-08-14
**Depth:** standard
**Files Reviewed:** 34 (of 258 changed; scoped to the financially load-bearing API surface, the tenancy primitive, the credential/webhook path, and a lighter pass over mobile money/PDF code)
**Status:** issues_found

## Summary

The money core is genuinely good. `money.ts`, `gst.service.ts` and `numbering.service.ts` are pure, exhaustively reasoned, and I could not break them: `toPaise` does exact string arithmetic, `allocateProRata` is remainder-exact and correct for negative totals, per-head rounding happens exactly once, and the counter-row allocator is both gap-free and rollback-safe. The credential boundary (`crypto.ts`, `razorpay.client.ts`) is tight — AES-256-GCM with a fresh IV, a non-enumerable secret property on the SDK instance, timing-safe HMAC verification over the raw body, and a per-clinic path token rather than body-derived tenant resolution. RLS coverage on the ten billing tables is complete and append-only where it should be.

The defects cluster in three places the pure code does not reach:

1. **`InvoiceRepository.updateDraft`** — the only draft-mutation path — has two independent correctness failures: it cannot clear or recompute an invoice-level discount (`?? undefined` swallows every `null` the service deliberately sends), and it replaces line items outside any transaction or `status = 'DRAFT'` guard, so a PATCH racing a finalize can destroy the frozen tax snapshot of a numbered invoice. Both are money-visible; neither is covered by the existing tests, which only assert the *set-a-discount* path.
2. **External calls inside database transactions.** `RefundService.refundDigitalLeg` issues the Razorpay refund API call inside a Prisma interactive transaction with the default 5 s timeout while holding a `FOR UPDATE` lock. Every other gateway call in the phase is deliberately placed outside its transaction with a compensating cancel; this one is the outlier, and its failure mode is real money leaving the account with no local record.
3. **`markPaid` is a second, weaker payment path.** `PaymentService` documents at length that a staff-typed overage must be rejected rather than flagged; `InvoiceService.markPaid` takes no row lock and applies no upper bound, so it can drive an invoice into the `overpayment` exception state — which, per `deferred-items.md` item 15, has no resolve endpoint and therefore permanently blocks every further action on that invoice.

I also found a deployment gap not recorded anywhere in the phase's own docs: `BILLING_ENCRYPTION_KEY` and `PUBLIC_API_URL` are absent from both ECS task definitions, so BIL-05/BIL-06 cannot function in staging or production.

I cross-checked every candidate finding against `06-CONTEXT.md` D-01..D-48 and `deferred-items.md`. Items already documented there (percent-discount 100x scaling — fixed; combined-link picker UI; billing exceptions list; `PARTIALLY_PAID → UNPAID` absence; FIFO ordering divergence; mobile typecheck baseline) are **not** re-reported except where a new, undocumented consequence follows from them.

## Narrative Findings (AI reviewer)

_(No `<structural_findings>` block was supplied for this review.)_

## Critical Issues

### CR-01: A draft's invoice-level discount can never be cleared, and goes stale when line items change

**File:** `apps/api/src/modules/billing/invoice.repository.ts:360-372` (with `apps/api/src/modules/billing/invoice.service.ts:319-335`)

**Issue:** `updateDraft` maps every field through `?? undefined`:

```ts
invoiceDiscountType:  data.invoiceDiscountType  ?? undefined,
invoiceDiscountValue: data.invoiceDiscountValue ?? undefined,
invoiceDiscountPaise: data.invoiceDiscountPaise ?? undefined,
```

In Prisma, `undefined` means *do not touch this column*. The service, however, deliberately sends `null` to mean *clear it* (`invoiceDiscountType: parsed.invoiceDiscountType ?? null`). The two disagree, and the repository wins. Two concrete money defects follow:

* **The discount cannot be removed.** `updateDraftInvoiceSchema` has no nullable discount fields, so a client clears a discount by omitting it. Omitted → `null` → `undefined` → column unchanged. The discount survives every subsequent edit.
* **The discount goes stale when lines change.** `invoiceDiscountPaise` is only recomputed when `parsed.invoiceDiscountType` is truthy (service line 323). A PATCH that only replaces `lineItems` therefore leaves the previously computed paise figure in place. Apply 10% to a ₹1,000 draft (₹100 stored), then delete a line so the draft is ₹200: `InvoiceService.invoiceDiscountFor` (line 893) returns the persisted `10000` because it is `> 0`, and finalize applies a 50% discount to an invoice nobody discounted by 50%. The frozen `invoiceDiscountPaise` on the finalized, GSTR-1-relevant document is wrong.

`notes` and `dueDate` are unclearable for the same reason.

Existing coverage misses this: `invoice.service.test.ts:598-620` asserts only what the *service* passes to a mocked repository, so the repository's coercion is never exercised.

**Fix:** distinguish "absent" from "explicitly null" end to end. Make the discount fields nullable in `updateDraftInvoiceSchema`, have the service pass `undefined` for absent and `null` for cleared, and drop the coercion in the repository:

```ts
// invoice.repository.ts
data: {
  ...(data.invoiceDiscountType  !== undefined ? { invoiceDiscountType:  data.invoiceDiscountType }  : {}),
  ...(data.invoiceDiscountValue !== undefined ? { invoiceDiscountValue: data.invoiceDiscountValue } : {}),
  ...(data.invoiceDiscountPaise !== undefined ? { invoiceDiscountPaise: data.invoiceDiscountPaise } : {}),
  ...
}
```

and in `InvoiceService.updateDraft`, always recompute `invoiceDiscountPaise` whenever `lineItems` is present, using the *persisted* discount type/value when the request does not restate them.

---

### CR-02: The Razorpay refund API is called inside the database transaction — a rollback loses the record of money already sent

**File:** `apps/api/src/modules/billing/refund.service.ts:409-458` (transaction opened at `:267`)

**Issue:** `createRefund` opens `this.prisma.$transaction(async (tx) => ...)` with no options — Prisma's default interactive-transaction timeout is **5000 ms** and `maxWait` is 2000 ms — takes a `FOR UPDATE` lock on the invoice row, and then, inside that transaction and once *per refund leg*, performs a live HTTPS call to `rzp.payments.refund(...)`.

The file's own header only reasons about the gateway *rejecting*: "A rejection propagates out of the enclosing transaction, so the pending row rolls back with it." The dangerous case is the opposite one, and it is unhandled: the gateway **accepts**, and the transaction then fails — the 5 s timeout expires (entirely plausible with two legs and one slow gateway round trip), `recomputePaymentState` throws, or the connection drops. Postgres rolls back the `refunds` rows, so:

* real money has been sent to the owner,
* no `Refund` row exists, so `getRefundableAmount` still counts the full captured amount as refundable, and
* the front desk sees an error and retries, issuing a **second** refund for the same money. The Razorpay refund is not idempotent on our side — `receipt: refund.id` is a fresh UUID each attempt.

Every other gateway call in the phase is deliberately outside its transaction with a compensating cancel (`payment.service.ts:370-433`, `:552-604`). This is the one that is not.

**Fix:** move the gateway call out of the transaction, mirroring `createPaymentLink`. Commit the `pending` refund rows first (they already reserve the amount, so the bound stays correct), then call the gateway outside the transaction, then write back `razorpayRefundId` in a second short transaction; on gateway rejection, mark the pending row `failed` and recompute. At minimum, until that restructure lands, pass an explicit generous `timeout` and treat a post-call transaction failure as a hard alert:

```ts
// createRefund
const refunds = await this.prisma.$transaction(async (tx) => { ... }, { timeout: 20_000 });
```

but note the timeout alone does not close the hole — only moving the call out does.

---

### CR-03: A draft PATCH racing a finalize rewrites a finalized invoice's line items

**File:** `apps/api/src/modules/billing/invoice.repository.ts:360-391`

**Issue:** `updateDraft` does two writes that are neither atomic with each other nor guarded consistently:

```ts
const { count } = await this.prisma.invoice.updateMany({
  where: { id: invoiceId, clinicId, status: 'DRAFT' },   // guarded
  data: { ...header fields... },
});
if (count === 0) return false;

if (data.lineItems) {
  await this.prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { clinicId, invoiceId } });   // NOT guarded
    await tx.invoiceLineItem.createMany({ ... });                              // NOT guarded
  });
}
```

The header update takes no lock, and the line-item replacement has no `status = 'DRAFT'` predicate and no reference to the invoice row at all. `finalizeInvoice` serialises only against itself, via `SELECT ... FOR UPDATE` on `invoices` (`:444-451`) — a `deleteMany` on `invoice_line_items` does not contend with that lock.

Interleaving: request A passes the `count === 1` check; request B finalizes (allocates the Rule 46(b) number, freezes the tax snapshot onto each line, deducts FIFO stock, writes the header totals); request A then deletes those frozen lines and inserts new, untaxed ones. The result is a numbered, immutable, GST-filed invoice whose header totals no longer correspond to any line item it holds, whose per-line `taxableValuePaise`/`cgstPaise`/`sgstPaise` are all zero, and whose deducted stock now points at lines that do not exist. This directly defeats the file's stated invariant #2 ("Draft immutability at the query layer") — the guard is missing on precisely the write that matters most.

A milder but certain version of the same bug: if the `createMany` fails after the header update commits, the invoice keeps new totals with old (or no) lines.

**Fix:** do the whole update in one transaction, take the same row lock finalize takes, and re-assert `DRAFT` inside it:

```ts
return this.prisma.$transaction(async (tx) => {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM invoices
    WHERE id = ${invoiceId}::uuid AND clinic_id = ${clinicId}::uuid AND status = 'DRAFT'
    FOR UPDATE
  `);
  if (locked.length === 0) return false;

  await tx.invoice.update({ where: { id: invoiceId }, data: { ...header } });

  if (data.lineItems) {
    await tx.invoiceLineItem.deleteMany({ where: { clinicId, invoiceId } });
    if (data.lineItems.length > 0) {
      await tx.invoiceLineItem.createMany({ data: data.lineItems.map(...) });
    }
  }
  return true;
});
```

---

### CR-04: `markPaid` bypasses every overpayment control and can permanently brick an invoice

**File:** `apps/api/src/modules/billing/invoice.service.ts:660-716`

**Issue:** `POST /billing/invoices/:id/mark-paid` accepts `amountPaise: z.number().int().positive().optional()` (`billing.schema.ts:55-59`) and the service does:

```ts
const outstanding = grandTotalPaise - amountPaidPaise;    // unlocked read
const amountPaise = input.amountPaise ?? outstanding;
await this.prisma.$transaction(async (tx) => {
  await tx.payment.create({ data: { ..., amountPaise, status: 'captured' } });
  await this.repository.recomputePaymentState(tx, clinicId, invoiceId);
  ...
});
```

There is no `FOR UPDATE` lock and **no upper bound on `amountPaise`**. This directly contradicts the invariant `PaymentService` documents at `payment.service.ts:118-131`:

> "D-36 is about the overpayment we cannot prevent … This error is about the overpayment we CAN prevent: staff typing a figure larger than what is outstanding. Rejecting it here keeps the exception list meaningful."

`PaymentService.recordCashPayment` enforces exactly that via `lockInvoice` + `assertCollectable`. `markPaid` — reachable from the same `MANAGE_PAYMENTS` gate and the primary UI control for cash — enforces neither. Two consequences:

* **Typo or malicious client** sends `amountPaise: 100000000` on a ₹500 invoice. `recomputePaymentState` drives `balancePaise` negative and sets `exceptionFlag = 'overpayment'`.
* **Two concurrent taps** both read the same unlocked `outstanding`, both insert a captured row, same result.

Because there is no resolve endpoint for `exception_flag` (`deferred-items.md` item 15 — the columns exist and nothing writes them), `isInvoiceActionBlocked` then rejects *every* subsequent action on that invoice: void, mark-unpaid, refund, credit note, further payment. The invoice is permanently unusable through the product, and the only recovery is a manual SQL update against a table whose audit log is deliberately append-only.

**Fix:** route `markPaid` through the same guard, or delete the duplicate path entirely and have the controller call `PaymentService.recordCashPayment`. Minimum change:

```ts
await this.prisma.$transaction(async (tx) => {
  const [row] = await tx.$queryRaw<Array<{ balance_paise: number; exception_flag: string | null; status: string }>>(
    Prisma.sql`SELECT status, balance_paise, exception_flag FROM invoices
               WHERE id = ${invoiceId}::uuid AND clinic_id = ${clinicId}::uuid FOR UPDATE`);
  const amountPaise = input.amountPaise ?? row.balance_paise;
  if (amountPaise <= 0 || amountPaise > row.balance_paise) {
    throw domainError(`Payment of ${amountPaise} paise exceeds the outstanding balance of ${row.balance_paise} paise`,
      400, 'PAYMENT_EXCEEDS_BALANCE');
  }
  ...
});
```

Independently, ship the `exception_flag` resolve action before Beta — with it missing, *any* path into the exception state is unrecoverable.

---

### CR-05: `BILLING_ENCRYPTION_KEY` and `PUBLIC_API_URL` are not wired into any deployed environment

**File:** `infra/aws/production/api-task-definition.json` and `infra/aws/staging/api-task-definition.json` (secrets/environment blocks); required by `apps/api/src/lib/crypto.ts:67-86` and `apps/api/src/modules/billing/settings.service.ts:155-158`

**Issue:** Both task definitions supply `DATABASE_URL`, `DATABASE_URL_APP`, `REDIS_URL`, `JWT_SECRET` and `COOKIE_SECRET` from SSM, and nothing else. `BILLING_ENCRYPTION_KEY` appears in `.env.example` and in `tests/helpers/setup.ts` (which generates one when absent) but nowhere in the deployment path. `PUBLIC_API_URL` / `API_URL` likewise.

Consequences in staging and production, on the first day an Admin touches Billing Settings:

* `encryptSecret` throws `BILLING_ENCRYPTION_KEY is not set…`. The error carries no `statusCode`, so `error-handler.ts:66` maps it to a bare 500 `"An unexpected error occurred"`. `PUT /billing/settings` fails with no actionable message, and **no clinic can ever store Razorpay credentials** — BIL-05 and BIL-06 are entirely non-functional.
* `publicApiBase()` returns `null`, so `webhookUrl` is `null` on the settings screen and the Admin has nothing to paste into their Razorpay dashboard.

The lazy key read is correct and deliberate (06-06-PLAN) — it lets the API boot without the key. What is missing is the operational half: nothing supplies the key, and nothing fails loudly at deploy time to say so. This is not recorded in `deferred-items.md`.

**Fix:** add both to the two task definitions and create the SSM parameters:

```json
{ "name": "BILLING_ENCRYPTION_KEY", "valueFrom": "/breeyo/production/BILLING_ENCRYPTION_KEY" }
```
```json
{ "name": "PUBLIC_API_URL", "value": "https://api.breeyo.com" }
```

Generate the key once per environment with `openssl rand -hex 32` and never rotate it without a re-entry plan (rotating invalidates every stored clinic secret — `crypto.ts:43`). Consider adding a startup assertion that logs a warning when `BILLING_ENCRYPTION_KEY` is unset in `NODE_ENV=production`, so the gap is visible at deploy rather than at first use.

## Warnings

### WR-01: The overdue sweep flips invoices paid inside its own read-then-write window

**File:** `apps/api/src/jobs/overdue-invoices.ts:56-70`

**Issue:** The predicate is evaluated in `findMany`, then `updateMany` writes by id only:

```ts
const due = await prisma.invoice.findMany({
  where: { status: { in: ['UNPAID','PARTIALLY_PAID'] }, balancePaise: { gt: 0 }, dueDate: { lt: today } },
  select: { id: true, clinicId: true },
});
const { count } = await prisma.invoice.updateMany({
  where: { id: { in: due.map(i => i.id) } },       // predicate not re-asserted
  data: { status: 'OVERDUE' },
});
```

An invoice paid, voided or credited between the two statements is written to `OVERDUE` regardless. This is a cross-clinic admin-client write that also bypasses `isValidInvoiceTransition` (`PAID → OVERDUE` and `VOIDED → OVERDUE` are both illegal per `INVOICE_TRANSITIONS`) and bypasses `recomputePaymentState`, so a settled invoice ends up in the Overdue card with `balancePaise = 0`.

**Fix:** re-assert the full predicate in the write and drop the read entirely for the update:

```ts
const { count } = await prisma.invoice.updateMany({
  where: {
    id: { in: due.map((i) => i.id) },
    status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
    balancePaise: { gt: 0 },
    dueDate: { lt: today },
  },
  data: { status: 'OVERDUE' },
});
```

---

### WR-02: `createPaymentLink` does not detect or cancel an existing live link, so two payable QRs can exist for one balance

**File:** `apps/api/src/modules/billing/payment.service.ts:340-441`

**Issue:** `retryPaymentLink` goes to considerable trouble to cancel the previous link first, and documents why: "Leaving it live would mean two payable links for one balance, and an owner who scanned the first QR before staff hit retry could pay it — producing the D-36 overpayment the clinic then has to refund by hand." `createPaymentLink` performs no such check. Two taps of "Generate Payment Link" (a double-tap, a screen re-entry, a retried request after a network blip) produce two live Razorpay links, each for the full balance, each with its own `pending` `Payment` row and its own fresh `paymentGroupId`. If the owner scans both — or scans the stale QR still on screen after a second was generated — the webhook captures both and the invoice lands in the unresolvable `overpayment` state (see CR-04).

**Fix:** before creating, check for an outstanding link for the invoice and either return it or route through the retry path:

```ts
const existing = await this.prisma.payment.findFirst({
  where: { clinicId, invoiceId, channel: 'razorpay', status: 'pending' },
});
if (existing) {
  throw domainError(
    `Invoice ${invoiceId} already has an outstanding payment link. Use retry to replace it.`,
    409, 'PAYMENT_LINK_ALREADY_OPEN',
  );
}
```

---

### WR-03: The single-invoice link path skips the locked balance re-check the combined path treats as essential

**File:** `apps/api/src/modules/billing/payment.service.ts:346-425` (contrast `:552-604`)

**Issue:** `createPaymentLink` reads `invoice.balancePaise` via `loadInvoiceForPayment` — an unlocked read — validates against it, makes the gateway round trip, and then writes the `pending` row without re-reading anything. `createCombinedPaymentLink` does the opposite and explains why:

> "Re-read under FOR UPDATE. The balances above were read before the gateway round trip, and cash taken at the counter in that window would leave this link collecting more than is owed."

Exactly that window exists on the single-invoice path, and it is the far more commonly exercised one. Cash collected while the link is being minted leaves a live QR for the pre-cash balance.

**Fix:** apply the same guard:

```ts
await this.prisma.$transaction(async (tx) => {
  const locked = await this.lockInvoice(tx, clinicId, invoiceId);
  if (locked.balance_paise !== invoice.balancePaise) {
    throw invoiceBalanceChanged(invoice.invoiceNumber ?? invoiceId);
  }
  await tx.payment.create({ ... });
  await writeBillingAuditLog(tx, ...);
});
```

The `catch` that cancels the link at the gateway (`:426-433`) already covers the rollback.

---

### WR-04: `normalizeRazorpayError` forwards arbitrary internal error messages through the allow-listed 502 channel

**File:** `apps/api/src/modules/billing/razorpay.client.ts:219-245` (with `apps/api/src/middleware/error-handler.ts:52-64`)

**Issue:** `error-handler.ts` carves out a single, explicitly reviewed exemption to the "replace every ≥ 500 message" rule, on the stated grounds that "Only the gateway's `description` is forwarded. It is merchant-facing copy Razorpay writes for exactly this purpose … carries no credential material."

The producer does not honour that contract:

```ts
const description =
  sdkError.error?.description ??
  sdkError.error?.reason ??
  (err instanceof Error ? err.message : undefined) ??   // <- any Error at all
  sdkError.message;
```

Any non-SDK rejection reaching this function — a socket error (`connect ETIMEDOUT 10.0.3.41:443`), a DNS failure, a TLS error naming an internal proxy, a `TypeError` from a future refactor — is wrapped as `Razorpay: <internal message>` and forwarded verbatim to an unauthenticated-to-the-detail mobile client with HTTP 502. That is the information-disclosure channel the `>= 500` redaction exists to close, opened by the one branch that bypasses it.

**Fix:** only forward gateway-authored text; degrade everything else to a generic reason:

```ts
const description = sdkError.error?.description ?? sdkError.error?.reason ?? null;
const reason = description ?? 'the payment gateway could not be reached';
```

Log the original `err` server-side (the error handler already does) rather than shipping it.

---

### WR-05: A capture event with no matching pending row is permanently discarded

**File:** `apps/api/src/modules/billing/webhook.worker.ts:254-261` and `refuse()` at `:570-581`

**Issue:** When `resolveLegs` returns nothing, the worker calls `refuse(...)`, which **stamps `processedAt`** — deliberately, so BullMQ stops retrying. The comment justifies it as "Everything for this link is already captured, or the link never existed on our side. Either way there is nothing to settle and nothing is wrong." Two reachable cases contradict that:

* **`payment_link.partially_paid` followed by `payment_link.paid`.** The first event captures the leg (`status: 'captured'`, amount rewritten to the partial figure). The second event then finds no `pending` rows for the link, and the `closed` fallback only matches `cancelled`/`expired` — so the remainder is refused and never recorded. The invoice stays `PARTIALLY_PAID` for money the gateway says arrived in full. (`accept_partial: false` makes this rare, not impossible — Razorpay still emits `partially_paid` for gateway-side anomalies, and the worker explicitly subscribes to it at `:193`.)
* **A capture arriving before our `Payment` row commits.** `createPaymentLink` creates the link at Razorpay *then* writes the row (`:370` then `:399`). A slow write and a fast scan invert the order; the event is refused and permanently marked processed, so the money is never recorded and never retried.

Because `processedAt` is set, there is no retry, no BullMQ failure, no alert — only a `processing_error` string in a table nobody reads.

**Fix:** distinguish "we will never apply this" from "we cannot apply this yet". Throw (so BullMQ's remaining attempts and its dead-letter behaviour apply) when the link id is one we recognise but have no settleable row for, and only `refuse` when the link is entirely unknown to us:

```ts
if (legs.length === 0) {
  const known = await db.payment.count({ where: { clinicId, razorpayPaymentLinkId: paymentLinkId } });
  if (known === 0) throw new Error(`no payment row yet for link ${paymentLinkId}`); // retryable
  await refuse(db, webhookEventId, 'link already fully settled on our side');
  return null;
}
```

---

### WR-06: A skipped leg's share of a combined capture is silently reallocated to the next invoice

**File:** `apps/api/src/modules/billing/webhook.worker.ts:270-290`

**Issue:** Inside the fan-out loop:

```ts
if (!canReceiveCapture(invoice.status as InvoiceStatus)) {
  continue;                     // `remaining` is NOT decremented
}
const capturedPaise = Math.min(remaining, leg.amountPaise);
remaining -= capturedPaise;
```

When a leg is skipped (its invoice is `DRAFT`, or the row was not found at `:277`), the amount that leg was created for stays in `remaining` and is handed to the next invoice in the group. On a D-39 combined link covering three invoices where one has been reverted to draft, invoice #2 receives up to its own amount *plus* the skipped share, which can exceed its balance and flip it into the `overpayment` exception state described in CR-04.

**Fix:** account for the skipped leg before continuing:

```ts
if (!invoice || !canReceiveCapture(invoice.status as InvoiceStatus)) {
  remaining -= Math.min(remaining, leg.amountPaise);
  continue;
}
```

and record the unallocated remainder on the `webhook_events` row so it is visible rather than lost.

---

### WR-07: A fully refunded invoice stays `PAID` with a positive balance and disappears from every outstanding report

**File:** `apps/api/src/modules/billing/invoice.repository.ts:730-745` (with `packages/types/src/constants/invoice-status.ts:86`)

**Issue:** `PAID` is terminal (`PAID: []`), and `recomputePaymentState` silently declines any transition the table forbids:

```ts
if (next === current || isValidInvoiceTransition(current, next)) { status = next; }
```

After a full refund on a `PAID` invoice, `amountPaidPaise` drops to 0 and `balancePaise` returns to the full grand total, but the status remains `PAID`. The money fields and the status now disagree, and every consumer keys off status:

* `DashboardService`'s Unpaid Total filters `status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')` — the re-owed amount is invisible.
* `runOverdueSweep` filters the same two statuses — the invoice can never go overdue.
* `LIST_FILTER_STATUSES.unpaid` excludes it — it never appears in the front desk's unpaid list.

The terminality of `PAID` is a documented decision (D-20 / the transition-table header), but the *reporting* consequence is not, and it is the one that matters operationally: money the clinic gave back and is still owed does not appear anywhere.

**Fix:** either allow `PAID → PARTIALLY_PAID`/`UNPAID` when a processed refund reopens a balance (a narrow, well-defined exception to terminality), or — if terminality must hold — make the divergence visible: log a warning when `recomputePaymentState` declines a transition, and add `balancePaise > 0` (rather than status) as the outstanding predicate in `DashboardService` and `LIST_FILTER_STATUSES.unpaid`.

---

### WR-08: `markPaid` records no `PaymentReceipt`, so D-13 "View Receipt" has nothing to show for the primary cash control

**File:** `apps/api/src/modules/billing/invoice.service.ts:691-713`

**Issue:** `PaymentService.applyCashLeg` (`payment.service.ts:815-858`) allocates an `RCT` number and writes a `PaymentReceipt` for every cash collection, and the webhook worker does the same for digital captures (`webhook.worker.ts:306`). `InvoiceService.markPaid` — the `POST /mark-paid` handler wired to the mobile action bar — writes a `Payment` row and nothing else. A cash payment recorded through this path produces no receipt row, so `GET /billing/invoices/:id/receipts/:receiptId` 404s and the D-13 receipt PDF cannot be produced for it. Two paths that both record cash produce different records of the same event.

**Fix:** call the shared allocator inside the same transaction:

```ts
import { issuePaymentReceipt } from './payment.service.js';
// inside the $transaction, after recomputePaymentState:
const receipt = await issuePaymentReceipt(tx, clinicId, invoiceId, payment, new Date());
```

and include `receiptNumber` in the audit metadata, as `applyCashLeg` does. Better still, delete this duplicate path (see CR-04) and delegate to `PaymentService.recordCashPayment`.

---

### WR-09: Four financial audit events are logged under the wrong event name

**File:** `apps/api/src/modules/billing/invoice.service.ts:345-350`, `:365-370`, `:749-754`

**Issue:** `billing_audit_log` exists specifically to satisfy a six-year GST retention obligation (D-32) and is queried by `event`. Three distinct operations are recorded under an event name that describes a different operation:

* `updateDraft` → `INVOICE_DRAFT_CREATED` with `{ edited: true }`
* `deleteDraft` → `INVOICE_DRAFT_CREATED` with `{ deleted: true }`
* `markUnpaid` → `PAYMENT_RECORDED` with `{ reversal: true }` (as does `markPaymentUnpaid` in `payment.service.ts:780-785`)

A query for "who deleted this draft" or "what payments were reversed" against `event` returns nothing; the answer is only recoverable by string-matching inside the JSON `metadata` of an event that claims the opposite happened. The table is append-only by design, so this cannot be corrected retroactively for rows already written.

**Fix:** add the missing members to `BillingAuditEvent` and use them:

```ts
INVOICE_DRAFT_UPDATED = 'INVOICE_DRAFT_UPDATED',
INVOICE_DRAFT_DELETED = 'INVOICE_DRAFT_DELETED',
PAYMENT_REVERSED      = 'PAYMENT_REVERSED',
```

`event` is a plain string column, so this needs no migration.

## Info

### IN-01: `escapeHtml` is duplicated verbatim in four PDF templates

**File:** `apps/mobile/src/features/pdf/templates/invoice.ts:352`, `credit-note.ts:282`, `payment-receipt.ts:169`, `vaccination-certificate.ts:210`

**Issue:** Four byte-identical five-replacement implementations. A future hardening (e.g. escaping backticks or `/`) has to be applied four times, and a template added without remembering to copy it renders unescaped user data into HTML that is fed to `Print.printToFileAsync`. All four are currently correct.

**Fix:** hoist to `apps/mobile/src/features/pdf/lib/escape-html.ts` and import.

---

### IN-02: `OUTSTANDING_STATUSES` is exported but the query hardcodes the same list

**File:** `apps/api/src/modules/billing/dashboard.service.ts:105` and `:137`

**Issue:** The constant is declared with a paragraph of justification and exported, then the SQL writes `status IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')` inline. Two sources of truth for the definition of "outstanding".

**Fix:** interpolate the constant with `Prisma.join`, or drop the constant if nothing else consumes it.

---

### IN-03: The expiry sweep reports the wrong count

**File:** `apps/api/src/jobs/expire-payment-links.ts:179`

**Issue:** `return touched.length > 0 ? payments.length : 0;` returns the number of rows *considered*, not the `count` the `updateMany` actually changed (`:122`). A sweep that finds five candidates and expires one logs "5 pending link(s) expired".

**Fix:** return `count` from inside the transaction and propagate it.

---

### IN-04: `summarise`'s comment does not describe the loop

**File:** `apps/api/src/modules/billing/refund.service.ts:566-576`

**Issue:** The comment says an unattributed refund is taken off the per-leg budget "cheapest leg first", but the loop iterates `legs` in the order `loadLegs` returned them (`createdAt asc`). The behaviour is deterministic and correct; only the comment is wrong, which is the sort of thing that later gets "fixed" in the wrong direction.

**Fix:** correct the comment to "oldest leg first", or sort by `refundablePaise` if the stated behaviour was the intent.

---

### IN-05: Money formatting depends on `Intl` on a runtime the same file distrusts for dates

**File:** `apps/mobile/src/features/billing/lib/format.ts:50-62` and `:200-206`

**Issue:** `formatInvoiceDate` explicitly avoids `toLocaleDateString` because "Hermes ships a cut-down ICU and returns a different string on device than it does in this test environment", yet every money string on every billing screen goes through `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. The parity test (`__tests__/format.test.ts`) runs under Node, not Hermes, so the on-device output of the phase's single money formatter is unverified against the same concern the date helper was written to dodge.

**Fix:** add a device/Detox smoke assertion on one formatted amount, or state explicitly (with the RN/Hermes `Intl` build flag as evidence) why currency formatting is safe where date formatting is not.

---

### IN-06: Generated billing PDFs accumulate in the cache directory with no cleanup

**File:** `apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts:52-68`

**Issue:** Every print/share writes `${FileSystem.cacheDirectory}${filename}.pdf` and nothing ever deletes it. The directory is app-private (correctly — the security note forbids shared storage), but each file carries owner PII, the pet record and the clinic's financial detail, and they persist for the life of the install on a shared front-desk device.

**Fix:** delete the file after `Sharing.shareAsync` resolves, or sweep `cacheDirectory` for `*.pdf` older than a day on app start.

---

_Reviewed: 2026-08-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
