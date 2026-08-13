# Deferred / escalated items — Phase 06

## BLOCKER-06-08-01 — `createTenantClient` interactive transactions are not atomic

**Found during:** plan 06-08, Task 3 (`finalize-stock.test.ts`, the `concurrent` case)
**Owning file:** `apps/api/src/lib/prisma-rls.ts` (introduced by plan 06-02) — outside plan 06-08's scope
**Disposition:** escalated under deviation Rule 4 (architectural). NOT fixed by plan 06-08.

### What was observed

Two concurrent `POST /billing/invoices/:id/finalize` requests, each claiming the
last unit of the same `StockBatch`, BOTH returned 200 and the batch's
`current_qty` ended at **-1**. Stock was oversold.

### Root cause

`createTenantClient` binds the RLS GUC by wrapping **every** operation:

```ts
return base.$extends({
  query: {
    async $allOperations({ args, query }) {
      const [, result] = await base.$transaction([
        base.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`,
        query(args),
      ]);
      return result;
    },
  },
});
```

The extension applies to operations issued on the `tx` handle of an interactive
`$transaction(async (tx) => ...)` too, and its body opens a **new** transaction on
`base`. So every statement inside what looks like one transaction actually runs
in its own short transaction:

* `SELECT ... FOR UPDATE` acquires its row lock and **releases it immediately**,
  so two finalizes both see the batch as available — hence the oversell.
* The whole transaction is non-atomic. Proven directly: a write performed inside
  `db.$transaction(async (tx) => { ...write...; throw })` **persists** after the
  throw. Expected 5, observed 2.

### Blast radius

Every module that takes `request.db` and calls `$transaction` believing it to be
atomic — billing (finalize, void, mark-paid), EMR, inventory. `invoice.repository.ts`
documents "Finalize atomicity" as invariant #3; that invariant does not currently
hold at runtime. Phase 5's own dispense path is affected identically.

This did not surface earlier because every prior test of transactional behaviour
(including `tests/billing/numbering-concurrency.test.ts`) drives the **plain admin
`PrismaClient`**, whose `$transaction` is genuine. Plan 06-08 is the first to run
a transactional write through the HTTP tenant handle.

### Why it was not auto-fixed

A correct fix changes the tenancy primitive that all five completed phases run
on, and must simultaneously preserve T-06-01 (the GUC provably transaction-local
and on the same connection as the guarded query) and the deliberate
`TenantPrismaClient` / `TenantTransactionClient` typing that plan 06-02 put in
place to prevent casting between extended and raw handles. Candidate approaches
(overriding `$transaction` via a client extension and yielding the raw `tx`;
tracking transaction depth in `AsyncLocalStorage` and short-circuiting
`$allOperations`) each have correctness and typing consequences well outside a
plan whose scope is "expose the invoice domain over HTTP".

### Current state

`tests/billing/finalize-stock.test.ts -t "concurrent"` is **left failing on
purpose**. It encodes a stated success criterion of plan 06-08 ("Two concurrent
finalizes for the last unit produce exactly one success") and threat T-06-132.
Silencing or skipping it would hide a live overselling defect. The rest of the
API suite is green: 751 passed, 1 failed.
