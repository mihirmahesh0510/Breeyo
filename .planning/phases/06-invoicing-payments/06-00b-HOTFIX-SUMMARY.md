---
phase: 06-invoicing-payments
plan: 00b-HOTFIX
type: hotfix
subsystem: infrastructure / tenant-isolation
tags: [rls, multi-tenancy, prisma, postgres, transactions, atomicity, concurrency, security]
requires:
  - 06-00 (pooled app-role client, transaction-scoped tenant handle)
provides:
  - "`TenantPrismaClient.$transaction(async (tx) => ...)` is a genuine single Postgres transaction"
  - Atomic rollback through the tenant-scoped handle
  - "`SELECT ... FOR UPDATE` row locks held for the life of the logical transaction"
affects:
  - Every module already converted to `request.db` (emr, inventory, patient, queue, attachment, vaccination, drug, notifications, clinic, billing)
  - Plan 06-08's concurrent invoice-finalize behaviour (fixed without touching 06-08's code)
  - "Retroactively: all Phase 1-5 code already merged to main"
tech-stack:
  added: []
  patterns:
    - "Client-level `$transaction` override: open ONE `base.$transaction` on the *unextended* app-role client, bind the GUC as its first statement, hand the callback that transaction's own handle"
    - "The per-operation scoping extension applies only to direct calls on the handle, never to statements inside an interactive transaction"
key-files:
  created:
    - .planning/phases/06-invoicing-payments/06-00b-HOTFIX-SUMMARY.md
  modified:
    - apps/api/src/lib/prisma-rls.ts
    - apps/api/src/lib/__tests__/prisma-rls.test.ts
decisions:
  - "The callback's `tx` is the *unextended* Prisma transaction client -- re-applying the per-operation wrapper is the bug itself; the GUC is already bound transaction-locally on the pinned connection"
  - "AsyncLocalStorage was evaluated and rejected: with the unextended `tx` there is nothing left to suppress, and an ALS pass-through keyed on clinicId would let an operation issued on the *outer* handle execute with no GUC bound at all"
  - "The sequential-array `$transaction` overload now throws on a tenant handle rather than silently promising atomicity it cannot deliver; no caller uses it"
  - "TenantTransactionClient re-derived from the pre-`$transaction` client type rather than from TenantPrismaClient, to avoid a circular type alias while keeping the exact same key set"
metrics:
  tasks: 2
  tests-added: 6
  api-suite: 734 passed / 0 failed / 80 todo
  completed: 2026-08-14
---

# Phase 6 Hotfix 06-00b: Tenant Handle Interactive Transactions Summary

`request.db.$transaction(async (tx) => ...)` was not a transaction — every statement inside it was silently re-wrapped in a separate transaction on a separate connection, so rollbacks did not roll back and `FOR UPDATE` locks were released between statements. Fixed by overriding `$transaction` on the tenant handle to open one real transaction and bind `app.clinic_id` as its first statement.

This is an unplanned hotfix discovered mid-build during plan 06-08. It is not one of the numbered `06-XX-PLAN.md` files.

## The Bug

`createTenantClient` (shipped in 06-00) bound the RLS GUC with a Prisma Client Extension at the root of `query`:

```ts
async $allOperations({ args, query }) {
  const [, result] = await base.$transaction([
    base.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`,
    query(args),
  ]);
  return result;
}
```

For a single top-level call — `request.db.pet.findMany()` — this is correct: one implicit transaction, GUC bound as its first statement, on the same pooled connection as the query.

The extension fires **per operation**, however, and `$transaction` was never overridden. So when application code called:

```ts
await request.db.$transaction(async (tx) => {
  await tx.a.create(...);
  await tx.b.update(...);
});
```

the outer `$transaction` was the base client's, and *each statement inside it* still entered `$allOperations` and was re-wrapped in its own `base.$transaction([...])` on its own pooled connection. The enclosing transaction held nothing.

Two consequences, both demonstrated empirically by plan 06-08's executor against a real PostgreSQL:

1. **Rollback did not roll back.** A write inside a callback that throws was already committed by its own inner transaction. The enclosing transaction then rolled back an empty transaction.
2. **`SELECT ... FOR UPDATE` released its lock immediately.** The lock lived only as long as the one-statement transaction that took it, not the logical unit of work. Two concurrent invoice finalizes for the last unit of stock each saw it as available, both deducted, and `current_qty` went to **-1** (oversell).

The second is the more serious: `stock-validator.service.ts` documents its BIL-02 guarantee as *"the availability check and the deduction hold row locks inside ONE transaction — the caller's"*. That statement was factually false for every caller on the tenant handle.

### Why it went undetected

Present since Phase 1, and Phases 1-5 are **already merged to main**. No test before this hotfix exercised a genuine multi-statement write-then-possibly-rollback through the tenant-scoped client. The existing coverage either:

- used the raw admin client (`tests/tenant-isolation.test.ts` lines 140-240, `tests/billing/numbering-concurrency.test.ts` — both drive `prisma.$transaction`, the breeyo_admin client, which has no extension and therefore behaved correctly all along), or
- performed only single-statement operations through `request.db`, where the old shape is correct.

`tests/tenant-isolation.test.ts` did have a "tenant handle keeps scoping inside an interactive `$transaction`" test, but it asserted only *scoping* (which survived the bug), never *atomicity*.

## The Fix

`apps/api/src/lib/prisma-rls.ts`. The per-operation extension is unchanged and now lives in `buildScopedClient`; `createTenantClient` wraps it in a `Proxy` that replaces `$transaction`:

```ts
return base.$transaction(async (rawTx) => {
  await rawTx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`;
  return fn(rawTx as unknown as TenantTransactionClient);
}, options);
```

One real transaction on the **unextended** app-role client. The GUC is its first statement, on the connection every subsequent statement in the callback is pinned to. The callback receives that transaction's own handle.

### Why the callback's handle is deliberately unextended

This is the crux. The handle passed to the callback needs no per-operation scoping wrapper, because the GUC is *already* bound — transaction-locally, on the exact connection the handle is pinned to. Re-applying the wrapper is precisely the bug. Because `rawTx` carries no extension, no statement inside the callback can re-enter `$allOperations`, so the "already inside a transaction, do not wrap again" state is enforced **by construction** rather than by bookkeeping.

The cast at that boundary is sound in the one place it appears: the value being cast was constructed three lines earlier by this function, from the app-role client, with `app.clinic_id` set on it.

### AsyncLocalStorage: evaluated and rejected

The obvious alternative is to keep handing the callback an *extended* `tx` and use `AsyncLocalStorage` to suppress re-wrapping. It was rejected for two reasons:

1. **Nothing left to suppress.** With an unextended `tx` the re-entry cannot happen at all. ALS would add a mechanism to defeat a code path that no longer exists.
2. **An ALS pass-through is an RLS-bypass risk.** The natural implementation is: if the store is active and its `clinicId` matches, `return query(args)` without wrapping. But `$allOperations` cannot see *which* client the operation was invoked on. An operation issued on the **outer** handle from inside the callback (`db.pet.findMany()` instead of `tx.pet.findMany()`) would match on `clinicId`, skip the wrapper, and then execute on the outer client — **with no GUC bound at all**. That trades an atomicity bug for a tenancy bug, which is strictly worse. Re-dispatching generically onto the stored `tx` would avoid it but is fragile for raw operations, whose extension-level `args` shape differs from the call-site shape.

**Documented consequence of not using ALS:** a statement issued on the outer handle from inside a callback still takes the wrapping path — its own transaction on its own connection. It remains correctly scoped (unchanged from 06-00), but it is not part of the enclosing unit of work and can block on a row the enclosing transaction has locked. Every repository in the codebase already uses `tx` inside its callbacks; this was verified across `billing/invoice.{repository,service}.ts`, `emr/emr.repository.ts`, all five `inventory/*` services, `inventory/inventory-item.repository.ts` and `auth/auth.service.ts` before choosing this design. The behaviour is called out in the function's doc comment.

### Sequential-array overload

`$transaction([...])` on a tenant handle now throws a `TypeError` directing the caller to the interactive form. It cannot be made atomic through this handle — the promises in the array are already bound to the extended client, so each would re-enter the wrapper on a connection of its own. Failing loudly beats silently promising atomicity that cannot be delivered, which is the same class of defect this hotfix removes. No caller in the repo uses it (verified by grep across `apps/api/src` and `apps/api/tests`).

## The Five Invariants

| # | Invariant | How it is preserved |
|---|-----------|---------------------|
| 1 | GUC set inside the same transaction/connection as every guarded query | `SET LOCAL` (`set_config(..., TRUE)`) is the **first statement** of the one real transaction, executed on `rawTx` itself — the same pinned connection every later statement uses. Still parameter-bound via tagged-template `$executeRaw`, never interpolated (T-06-05). Pinned by the `still binds app.clinic_id for every statement inside the callback` test, which reads the GUC *before and after* an intervening write. |
| 2 | A single top-level call still behaves exactly as today | `buildScopedClient` holds the 06-00 extension byte-for-byte. The `Proxy` intercepts **only** the `$transaction` key; everything else is `Reflect.get` straight through. Pinned by the five pre-existing 06-00 tests (all still pass unchanged) plus `leaves a single top-level operation scoped exactly as before`. |
| 3 | An interactive block is a REAL single transaction | One `base.$transaction`, one connection, no nesting. Pinned by three tests: identical `txid_current()`/`pg_backend_pid()` across statements (and *different* across separate calls, so a constant cannot satisfy it); a throw rolling back a committed-looking write; and two concurrent `FOR UPDATE` sellers of the last unit resolving to exactly one success with stock landing on 0, never negative. |
| 4 | `TenantPrismaClient` / `TenantTransactionClient` structural typing that 06-02 relies on | `TenantTransactionClient` removes the **same five members** as before (`$connect`, `$disconnect`, `$on`, `$transaction`, `$extends`) from the same underlying extended-client type; it is re-derived from `ScopedClientWithoutTransaction` only to avoid a circular type alias, and the resulting key set is identical. `TenantPrismaClient` keeps every member and narrows `$transaction` to the interactive overload it already had. Verified by `tsc` passing clean across all ten converted modules with zero call-site changes. |
| 5 | No RLS bypass, ever | Two paths, both scoped. Direct calls take the 06-00 wrapper. Callback statements run on a connection whose GUC was bound as the transaction's first statement. There is no third path: the mechanism that avoids re-wrapping is the *absence* of the extension on `rawTx`, not a conditional that could mis-fire. Pinned by `does not let the callback write outside its own clinic`, which asserts a foreign-clinic INSERT inside a callback is rejected by RLS — proving the transaction path did not quietly drop the GUC — plus the 20 pre-existing `tenant-isolation.test.ts` cases. |

## Verification

TDD, RED then GREEN, against a real PostgreSQL 16.

**RED** (commit `3f0ed02`) — six new tests in `apps/api/src/lib/__tests__/prisma-rls.test.ts`. Three failed exactly as reported by 06-08:

- `runs every statement of one callback in a single database transaction` — a different `txid_current()` per statement.
- `rolls the whole callback back when it throws` — `expected { …(9) } to be null`; the pet_owner row survived the throw.
- `holds SELECT ... FOR UPDATE for the whole callback` — `expected [ 'sold', 'sold' ] to have a length of 1 but got 2`; both concurrent sellers took the last unit.

The other three (GUC bound throughout, no cross-clinic write, top-level call unchanged) passed before **and** after — they are the non-regression half.

**GREEN** (commit `bba46f7`) — all 11 tests in the file pass.

**Regression runs, all zero-failure:**

| Suite | Result |
|-------|--------|
| `src/lib/__tests__/prisma-rls.test.ts` | 11 passed |
| `tests/tenant-isolation.test.ts` | 20 passed |
| `tests/billing/numbering-concurrency.test.ts` | 7 passed |
| `src/modules/billing/__tests__/*` (8 files) | 177 passed |
| **Full `apps/api` suite** | **58 files passed, 9 skipped; 734 tests passed, 0 failed, 80 todo** |
| `tsc` (`pnpm --filter @breeyo/api build`) | clean |
| `scripts/check-tenant-client.sh` (D-30 gate) | passed, 22 files scanned |

The 9 skipped files / 80 todo are pre-existing `it.todo` placeholders under `tests/inventory/`, unrelated to this change.

### Effect on plan 06-08

06-08's `apps/api/tests/billing/finalize-stock.test.ts` was inspected read-only on the sibling branch; **no 06-08 file was touched**. Its `resolves two concurrent finalizes for the last unit of a batch to exactly one success` asserts exactly the contract this hotfix restores — one 2xx, one 409, remaining quantity 0 and `>= 0`, exactly one numbered invoice. It reaches the primitive through `request.db` → `InvoiceRepository.finalize`, which takes `FOR UPDATE` on the invoice row (`invoice.repository.ts:450`) and calls `StockValidatorService.reserveAndDeduct`, which takes `FOR UPDATE` on the batch rows (`stock-validator.service.ts:239`) — both inside the caller's `$transaction`. Both locks are now genuinely held for the duration of the finalize. The equivalent behaviour is pinned directly at the primitive level by this hotfix's `holds SELECT ... FOR UPDATE for the whole callback` test, which is the same lock-decide-decrement shape reduced to its essentials.

## Deviations from Plan

Not applicable — this is an unplanned hotfix, not the execution of a numbered plan. Two deviations from the *task brief* are worth recording:

**1. [Rule 3 - Blocking] Local database could not be migrated.** `pnpm db:migrate` failed with `P3009`: the shared local `breeyo` database has a failed migration, `20260812000000_backfill_phase_3_to_6_models` (Postgres error `42710`, duplicate object). Its cause is an orphaned `_prisma_migrations` row for `20260812200629_add_phases_3_through_5`, a migration that no longer exists in `prisma/migrations` — it was replaced by the backfill migration, whose objects therefore collide with what is already in that database.

Resolved **without** touching the shared database (a sibling agent is working against it, and `prisma migrate reset` would have disrupted them): provisioned an isolated `breeyo_rlshotfix` database on the same container, applied all 6 migrations cleanly from empty, then `init-rls-roles.sql`, `post-migrate.sql` and `db:seed`, and pointed this worktree's gitignored `apps/api/.env` at it. CI is unaffected — it always builds from an empty database, which is exactly what was reproduced here.

**2. [Design] AsyncLocalStorage not used**, though the task brief suggested it. Rationale in the section above; the brief explicitly permitted engineering judgement on mechanism, and all five non-negotiable invariants are preserved and individually tested.

## Deferred Items

- **Shared local `breeyo` dev database is unmigratable.** Any developer running `pnpm --filter @breeyo/api db:migrate` against it will hit `P3009`. Recovery is local-only (no code change): either `prisma migrate reset`, or `prisma migrate resolve --applied 20260812000000_backfill_phase_3_to_6_models` if that database's schema already matches. Not fixed here — it is developer-machine state, out of scope for a tenancy-primitive hotfix, and destructive to a concurrently-running sibling agent.
- **`breeyo_rlshotfix` database is disposable.** Drop with `docker exec breeyo-postgres-1 psql -U breeyo_admin -d postgres -c 'DROP DATABASE breeyo_rlshotfix;'` once this branch merges. This worktree's `apps/api/.env` (gitignored, never committed) points at it.
- **Interactive transactions now have a real 5s Prisma timeout.** Previously every statement was its own sub-second transaction, so a slow callback could never time out. A genuine multi-statement transaction can. No suite exceeds it today; callers needing longer should pass `{ timeout }`, which the override forwards.

## Known Stubs

None.

## Threat Flags

None. This change removes attack surface rather than adding it: it converts a non-atomic write path into an atomic one and makes an advertised row-lock guarantee real. No new endpoint, auth path, file access or schema change.

## Commits

| Gate | Commit | Description |
|------|--------|-------------|
| RED | `3f0ed02` | `test(06-00b): pin the tenant handle's interactive transaction contract` |
| GREEN | `bba46f7` | `fix(06-00b): make the tenant handle's interactive transaction a real transaction` |

No REFACTOR commit — the tidy-up (threading the pooled client into `buildScopedClient` so both paths provably share one instance) was small enough to fold into GREEN, and the full suite was re-run after it.

## State Files

`STATE.md` and `ROADMAP.md` deliberately **not** updated, per the task brief: this is a discovered hotfix, not a numbered plan, and phase progress accounting belongs to the numbered plans.
