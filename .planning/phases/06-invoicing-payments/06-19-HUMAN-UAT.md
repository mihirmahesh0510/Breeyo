---
phase: 06-invoicing-payments
plan: "19"
artifact: human-uat
status: partial
verification: human_needed
total_flows: 8
completed_flows: 0
blocked_flows: 1
requirements_covered: [BIL-01, BIL-02, BIL-03, BIL-04, BIL-05, BIL-06, BIL-07, RPT-01]
decoupled_from_phase_completion: true
decision_date: 2026-08-14
decision: "Human will run these on their own device and report back. Decoupled from blocking phase completion; NOT deferred or dropped."
blocked_on:
  - "Flow 5 only: RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET are unprovisioned. Pre-Beta."
  - "All flows: no demo-data seeder exists (see carried-forward C10)."
---

# Phase 6 — Human UAT: the eight core billing flows

**Status: PARTIAL — 0 of 8 flows run.**

These eight flows are the part of Phase 6 that no test can judge: whether the
flows are usable at a clinic counter, and whether the documents look like
something a vet would hand to a client. The automated gate
(`scripts/verify-phase-06.sh`) proves the logic underneath each one is correct —
it does not prove any of this.

This file stays `status: partial` until every flow has a recorded outcome. It is
intended to surface in progress and UAT checks until then.

## Before starting

| Prerequisite | State |
|---|---|
| Migrated database + `post-migrate.sql` + `pnpm db:seed` | Reproducible — see `06-19-VERIFICATION.md` §5 |
| Demo data: 1 clinic, 2 pets with owners, 3 stock items, 1 deliberately low-stock item | **Missing.** `prisma/seed.ts` seeds RBAC reference data only. Needs a fixture script (carried-forward **C10**) or manual entry through the app. |
| `BILLING_ENCRYPTION_KEY` | Generate with `openssl rand -hex 32` |
| Razorpay test key pair | **Not available** (carried-forward **A2**). Flow 5 cannot run until it is. |
| Tunnel (ngrok/cloudflared) + webhook registered in the Razorpay dashboard | Depends on the key pair. Events: `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled`, `payment_link.expired`, `refund.processed`, `refund.failed` |

Start the API with `pnpm --filter @breeyo/api dev` and the app with
`pnpm --filter @breeyo/mobile dev`.

## Flows

Record the outcome in the right-hand column. A flow that did not behave as
described is a gap to log, not a failure to hide.

### Flow 1 — Consultation to draft (BIL-01, D-03) · ☐ NOT RUN

Start a consultation, dispense two different inventory items with quantities
**2** and **3**, tap End Consultation, open the Billing tab.

**Expected:** exactly one invoice with a `DRAFT` badge for that pet; opening it
shows two product lines with quantities **2 and 3** — not 1 and 1 — at the
items' selling prices.

**Observed:** _________

---

### Flow 2 — Service add and discounts (D-01, D-02, D-07) · ☐ NOT RUN

Add `General Consultation` from the presets, then a custom service with a name
and price. Add a 10% line discount to one line and a flat ₹50 invoice discount.

**Expected:** the catalog sheet stays open after each add; totals update within
about half a second; the Discount row shows in orange and the Grand Total
decreases.

> Worth watching: a percentage discount was applied **100× too small** until
> hotfix 06-07b. A 10% discount on ₹5,000 must reduce the total by ₹500, not ₹5.

**Observed:** _________

---

### Flow 3 — Finalize and stock validation (BIL-02) · ☐ NOT RUN

**The single most important flow here.** Note each item's remaining quantity in
the inventory screen *before* you start.

Set a product line's quantity above available stock and tap Finalize.

**Expected:** a red banner naming the item with available and requested
quantities, and a disabled Finalize button. Reduce and finalize → toast
`Invoice finalized`, navigation to detail, number of the form `INV-YYYYMM-0001`.

Then check stock, which differs **by line provenance**:

| Line type | Expected stock change at finalize |
|---|---|
| Came from the consultation's dispense (caption `Dispensed items from consultation`) | **Unchanged** — Phase 5 already deducted it |
| Added by hand with `Add Product` | **Drops by exactly the invoiced amount** |

A dispensed item whose stock dropped *again* at finalize is a **blocking
defect**, not a rounding question.

**Observed invoice number:** _________
**Dispensed line — before / after:** _________ / _________
**Manual line — before / after:** _________ / _________

---

### Flow 4 — Cash and split payment (BIL-03, D-10) · ☐ NOT RUN

Collect Payment → Cash → Mark as Paid. Then on a second invoice, toggle Split
Payment and enter a cash amount below the total.

**Expected:** first invoice → status Paid, balance zero, payment row in history.
Second → Partially Paid, remaining digital amount auto-calculated.

**Observed:** _________

---

### Flow 5 — Razorpay link and live confirmation (BIL-05, BIL-06) · ⛔ BLOCKED

**Blocked on Razorpay test credentials (carried-forward A2). Pre-Beta.**

Choose UPI → Generate Payment Link.

**Expected:** a 200×200 QR within about a second, `Scan to Pay -- Rs [amount]
via Razorpay`, a copyable link, a countdown starting near 15:00. Scan or open
the link and complete the test payment. **Without touching the app**, the sheet
should change to `Payment Received` and the invoice status to Paid. If it does
not, the webhook is not reaching your machine — check the tunnel and the webhook
URL in Billing Settings.

**Observed:** _________
**Elapsed time from completing payment to the UI updating:** _________

> No code in this phase has ever spoken to Razorpay. Everything below the SDK
> boundary is real and tested; the gateway call itself is mocked everywhere.

---

### Flow 6 — PDF documents (BIL-04, BIL-07) · ☐ NOT RUN

With the clinic's GSTIN blank, Print then Share a paid invoice. Then set a valid
GSTIN and state code, enable GST, and finalize a new invoice with one exempt
service and one taxable product.

**Expected:** unregistered → heading `INVOICE`, **no** GSTIN, **no** GST line,
**no** HSN column. Registered mixed → `INVOICE-CUM-BILL OF SUPPLY`, per-line
HSN/SAC, CGST and SGST rows, round-off line if applicable. One page, legible.

> All four Rule 46A headings are already confirmed statically against the
> shipped template — see `06-19-artifacts/`. What is open is **presentation on
> paper**: one-page layout, legibility, and `Print.printAsync` against a real
> printer (thermal and A4), which has never been exercised (carried-forward D2).

**Observed (unregistered heading):** _________
**Observed (registered mixed heading):** _________
**GST artefacts absent from the unregistered document?** _________

---

### Flow 7 — Void, refund and credit note (D-12, D-22, D-26/D-34) · ☐ NOT RUN

Void a finalized unpaid invoice. On a paid invoice issue a partial refund. On
another, issue a credit note for one line.

**Expected:** void → toast mentions items returned, `VOIDED` stamp, stock
increases. Refund → confirmation mentions 2–5 business days for a digital
refund, balance adjusts. Credit note → `CN-YYYYMM-0001`, listed in the invoice's
linked credit notes, balance decreases, and the invoice's own line items and
**grand total are unchanged**.

> Void restores stock only for movements the invoice itself created. A drug
> dispensed during a consultation is **not** restored — it was administered to
> the animal.

**Observed stock delta after void:** _________
**Credited invoice `grandTotalPaise` unchanged?** _________

---

### Flow 8 — Quick Sale and the pet tab (D-04, D-25) · ☐ NOT RUN

Billing FAB → Quick Sale → add two products → Generate Invoice. Then open a pet
and scroll to Invoices.

**Expected:** a finalized invoice with no consultation, straight to payment
collection, stock reduced. Pet's invoices listed newest first; tapping one opens
its detail.

**Observed:** _________

## Reporting back

Update the ☐ boxes and the Observed lines, set `completed_flows` in the
frontmatter, and change `status` to `complete` once all eight have an outcome
(flow 5 may remain blocked until credentials exist — in that case leave
`status: partial` and note it). Any flow that misbehaved should be logged as a
gap with enough detail to plan a fix.
