import { Prisma } from '@prisma/client';
import type { StockShortfall } from '@breeyo/types';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import type { StockMovementService } from '../inventory/stock-movement.service.js';
import { fromPaise } from './money.js';

/**
 * BIL-02: real-time stock validation and deduction for invoice finalize.
 *
 * ## The guarantee, and what is not the guarantee
 *
 * "Real time" here means the availability check and the deduction hold row
 * locks inside ONE transaction — the caller's. {@link
 * StockValidatorService.checkAvailability} is a read-only convenience for the
 * mobile builder's banner and is explicitly NOT the BIL-02 guarantee: between
 * that read and a finalize, another device can take the last box. Only
 * {@link StockValidatorService.reserveAndDeduct}, running under `FOR UPDATE`
 * inside the finalize transaction, is authoritative.
 *
 * ## Why this never opens its own transaction
 *
 * If it did, the lock would be released the moment it returned and the finalize
 * that follows would be operating on stale availability — a textbook TOCTOU
 * race that oversells the last unit of a drug to two front-desk devices at
 * once. `reserveAndDeduct` and `restoreToStock` therefore take the caller's
 * transaction handle as their first argument, and no transaction is ever opened
 * in this file — a grep gate in plan 06-07 asserts it.
 *
 * ## Transaction handle typing
 *
 * The handle is typed {@link TenantTransactionClient}, not
 * `Prisma.TransactionClient`. The billing path runs on the RLS-scoped tenant
 * client (D-30), whose interactive transaction handle is a different, mutually
 * unassignable type — `lib/prisma-rls.ts` documents why casting between them
 * would compile while discarding exactly the isolation typing D-30 exists to
 * enforce. `Prisma.TransactionClient` is the *unextended* client's handle and
 * is deliberately not used in any signature below.
 */

/**
 * One invoice line that still needs a fresh FIFO deduction.
 *
 * `stockMovementId` is present on the type — rather than being structurally
 * excluded — precisely so the defence-in-depth assertion in
 * {@link StockValidatorService.reserveAndDeduct} has something to inspect. A
 * caller that skipped `InvoiceService.buildProductLineStockPlan` will hand over
 * a line with it set, and that must fail loudly rather than double-decrement a
 * batch Phase 5 already decremented.
 */
export interface StockPlanLine {
  lineId: string;
  /** Null on a service line, which has no stock provenance and is skipped. */
  inventoryItemId: string | null;
  /** MUST be null/absent here. Non-null is a caller contract violation. */
  stockMovementId?: string | null;
  description: string;
  quantity: number;
  /** The dispense-time price snapshot, integer paise (D-31). */
  unitPricePaise: number;
}

/** One batch-level deduction actually applied, with the movement it produced. */
export interface BatchDeduction {
  inventoryItemId: string;
  batchId: string;
  quantity: number;
  unitPricePaise: number;
  movementId: string;
}

/** Who and what the emitted `dispensed` movements are attributed to. */
export interface StockDeductionContext {
  invoiceId: string;
  userId: string;
  userName: string;
}

/**
 * The read-only slice of a Prisma handle {@link
 * StockValidatorService.checkAvailability} needs.
 *
 * Structural rather than nominal so the UI pre-check can run on the request's
 * tenant client, on a transaction handle, or on a plain test double.
 */
export interface StockAvailabilityClient {
  stockBatch: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { itemId: true; currentQty: true };
    }): Promise<Array<{ itemId: string; currentQty: number }>>;
  };
}

/** Raw-SQL row shape for a locked batch. Mirrors `fifo-dispense.service.ts`. */
interface LockedBatchRow {
  id: string;
  itemId: string;
  currentQty: number;
  expiryDate: Date | null;
  receivedAt: Date;
}

function insufficientStockError(
  shortfalls: StockShortfall[],
): Error & { statusCode: number; code: string; details: { shortfalls: StockShortfall[] } } {
  const summary = shortfalls
    .map((s) => `${s.description} (requested ${s.requested}, available ${s.available})`)
    .join('; ');
  const error = new Error(`Insufficient stock: ${summary}`) as Error & {
    statusCode: number;
    code: string;
    details: { shortfalls: StockShortfall[] };
  };
  // 409, never 500: `error-handler.ts` replaces the message on any status at or
  // above 500, which would discard the per-item detail the mobile
  // StockValidationBanner renders.
  error.statusCode = 409;
  error.code = 'INSUFFICIENT_STOCK';
  error.details = { shortfalls };
  return error;
}

function contractViolationError(line: StockPlanLine): Error & { code: string } {
  const error = new Error(
    `Line ${line.lineId} ("${line.description}") reached reserveAndDeduct carrying ` +
      `stockMovementId ${line.stockMovementId}. Phase 5's dispense flow already ` +
      `decremented that batch; deducting it again would corrupt inventory. The ` +
      `caller must filter through InvoiceService.buildProductLineStockPlan first.`,
  ) as Error & { code: string };
  error.code = 'STOCK_PLAN_CONTRACT_VIOLATION';
  return error;
}

export class StockValidatorService {
  constructor(
    // Held only for callers that want the read-only pre-check without a handle
    // of their own. Every write path takes the caller's transaction instead.
    private readonly prisma: TenantPrismaClient,
    private readonly stockMovementService: StockMovementService,
  ) {}

  /**
   * UX affordance, not a guarantee (see the module header).
   *
   * No locks, no writes. Returns one {@link StockShortfall} per item whose
   * requested quantity exceeds the sum of its non-expired remaining batch
   * quantities. The authoritative check is
   * {@link StockValidatorService.reserveAndDeduct}, and a clean result here is
   * no promise that a finalize a moment later will succeed.
   */
  async checkAvailability(
    db: StockAvailabilityClient,
    clinicId: string,
    lines: readonly StockPlanLine[],
    now: Date = new Date(),
  ): Promise<StockShortfall[]> {
    const requests = this.aggregateByItem(lines);
    if (requests.length === 0) return [];

    const batches = await db.stockBatch.findMany({
      where: {
        clinicId,
        itemId: { in: requests.map((r) => r.inventoryItemId) },
        currentQty: { gt: 0 },
        isExpired: false,
        OR: [{ expiryDate: null }, { expiryDate: { gt: now } }],
      },
      select: { itemId: true, currentQty: true },
    });

    const availableByItem = new Map<string, number>();
    for (const batch of batches) {
      availableByItem.set(batch.itemId, (availableByItem.get(batch.itemId) ?? 0) + batch.currentQty);
    }

    return requests
      .map((request) => ({
        inventoryItemId: request.inventoryItemId,
        description: request.description,
        requested: request.quantity,
        available: availableByItem.get(request.inventoryItemId) ?? 0,
      }))
      .filter((row) => row.available < row.requested);
  }

  /**
   * The BIL-02 guarantee: lock, verify, deduct — all inside the caller's
   * transaction, so a rollback anywhere in the finalize returns every unit.
   *
   * Returns the per-batch deduction plan so the caller can reconcile it and the
   * void path can reverse it precisely. Throws `INSUFFICIENT_STOCK` (409) with
   * every shortfall in one payload, having written nothing.
   */
  async reserveAndDeduct(
    tx: TenantTransactionClient,
    clinicId: string,
    lines: readonly StockPlanLine[],
    context: StockDeductionContext,
  ): Promise<BatchDeduction[]> {
    // Defence in depth behind InvoiceService.buildProductLineStockPlan. A line
    // with a stockMovementId was dispensed during the consultation and its
    // batch is already decremented; there is no correct way to handle it here,
    // so this is a programmer error rather than a domain error and carries no
    // statusCode — it must surface as a 500 and a bug report, not as something
    // a client can trigger and shrug at.
    for (const line of lines) {
      if (line.stockMovementId != null) {
        throw contractViolationError(line);
      }
    }

    // A wholly consultation-sourced invoice legitimately has nothing to deduct
    // (D-03/BIL-01, the phase's primary path). That is a no-op, not an error.
    const requests = this.aggregateByItem(lines);
    if (requests.length === 0) return [];

    // ── Pass 1: lock and plan. No writes, so a shortfall on the last item
    // aborts with nothing to undo. The locks stay held for the caller's whole
    // transaction, so the availability proven here cannot change underneath the
    // writes in pass 2.
    const shortfalls: StockShortfall[] = [];
    const planned: BatchDeduction[] = [];

    for (const request of requests) {
      const batches = await tx.$queryRaw<LockedBatchRow[]>(Prisma.sql`
        SELECT
          id,
          item_id AS "itemId",
          current_qty AS "currentQty",
          expiry_date AS "expiryDate",
          received_at AS "receivedAt"
        FROM stock_batches
        WHERE clinic_id = ${clinicId}::uuid
          AND item_id = ${request.inventoryItemId}::uuid
          AND current_qty > 0
          AND is_expired = false
          AND (expiry_date IS NULL OR expiry_date > NOW())
        ORDER BY expiry_date ASC NULLS LAST, received_at ASC
        FOR UPDATE
      `);

      const available = batches.reduce((sum, batch) => sum + batch.currentQty, 0);

      if (available < request.quantity) {
        // Keep going rather than throwing here, so the 409 names every short
        // item at once instead of forcing one round trip per problem.
        shortfalls.push({
          inventoryItemId: request.inventoryItemId,
          description: request.description,
          requested: request.quantity,
          available,
        });
        continue;
      }

      let remaining = request.quantity;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.currentQty);
        planned.push({
          inventoryItemId: request.inventoryItemId,
          batchId: batch.id,
          quantity: take,
          unitPricePaise: request.unitPricePaise,
          movementId: '',
        });
        remaining -= take;
      }
    }

    if (shortfalls.length > 0) {
      throw insufficientStockError(shortfalls);
    }

    // ── Pass 2: apply. Every batch below is locked by this transaction.
    const applied: BatchDeduction[] = [];
    for (const deduction of planned) {
      await tx.stockBatch.update({
        where: { id: deduction.batchId },
        data: { currentQty: { decrement: deduction.quantity } },
      });

      // Same movement shape Phase 5's dispense service writes, so the stock
      // history reconciles across both deduction paths.
      const movement = await this.stockMovementService.recordMovement(tx, {
        clinicId,
        itemId: deduction.inventoryItemId,
        batchId: deduction.batchId,
        type: 'dispensed',
        quantity: -deduction.quantity,
        userId: context.userId,
        userName: context.userName,
        invoiceId: context.invoiceId,
        // `StockMovement.unitPrice` is Decimal(10,2) RUPEES (Phase 5, D-31) while
        // the invoice line carries paise. `fromPaise` is the tested inverse of
        // the single money boundary, so the crossing back is exact rather than a
        // float divide that could drift a paise.
        unitPrice: Number(fromPaise(deduction.unitPricePaise)),
      });

      applied.push({ ...deduction, movementId: movement.id });
    }

    for (const request of requests) {
      await tx.inventoryItem.update({
        where: { id: request.inventoryItemId },
        data: { currentStock: { decrement: request.quantity } },
      });
    }

    return applied;
  }

  /**
   * The D-26/D-34 reverse, run inside the void transaction.
   *
   * ## What is restored, and what deliberately is not
   *
   * D-34 (refined 2026-08-14): a void restores stock ONLY for the movements the
   * invoice itself created — a Quick Sale counter item, or a product line added
   * by hand in the builder, both deducted by {@link
   * StockValidatorService.reserveAndDeduct} at finalize. A drug dispensed during
   * a consultation is NOT restored: it was physically administered to the animal
   * and consumed, and a billing correction does not put it back in the cupboard.
   * Restoring it would inflate stock by an item that no longer exists.
   *
   * The discriminator is the same one that governs deduction: an
   * `InvoiceLineItem` created from an already-dispensed movement carries that
   * movement's id in `stockMovementId`, whereas a line the invoice deducted for
   * itself has `stockMovementId` null and its movement is only reachable through
   * the movement's own `invoiceId`. So the movements referenced by this
   * invoice's line items are exactly the pre-existing ones, and they are
   * excluded here — the mirror image of them being excluded from the stock plan
   * at finalize. Deduct and restore stay symmetric: this method reverses exactly
   * what `reserveAndDeduct` did for this invoice, and nothing else.
   *
   * ## No age gate
   *
   * D-34's other half stands: for the movements that ARE in scope, restoration
   * is unconditional however old the invoice. The 24-hour window in
   * D-26/D-51/D-57 governs the separate manual per-dispense "Return to stock"
   * action in Phase 5's UI, not an invoice void.
   *
   * ## Idempotency
   *
   * Two independent guards. The caller only invokes this when
   * `voidRestoredStock` is false and sets it true in the same transaction; and
   * `StockMovement.reversedMovementId` is `@unique`, so a concurrent duplicate
   * that races past that check still fails atomically at the database rather
   * than double-crediting stock.
   *
   * @returns the number of movements actually reversed.
   */
  async restoreToStock(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    context: { userId: string; userName: string },
  ): Promise<number> {
    // The movements this invoice merely STAMPED rather than created. Phase 5
    // dispensed these during the consultation (or at the counter) before the
    // invoice existed; the goods are gone and must not be credited back.
    const stampedLines = await tx.invoiceLineItem.findMany({
      where: { clinicId, invoiceId, stockMovementId: { not: null } },
      select: { stockMovementId: true },
    });
    const preExistingMovementIds = new Set(
      stampedLines
        .map((line) => line.stockMovementId)
        .filter((id): id is string => id != null),
    );

    const dispensed = await tx.stockMovement.findMany({
      where: { clinicId, invoiceId, type: 'dispensed' },
      include: { reversal: true },
    });

    let restored = 0;

    for (const movement of dispensed) {
      // Physically administered during the consultation — out of scope for a
      // billing void (D-34 refined). Skip, do not reverse.
      if (preExistingMovementIds.has(movement.id)) continue;

      // Already reversed — a return was recorded through Phase 5's own flow, or
      // a previous void attempt got this far. Skip rather than double-credit.
      if (movement.reversal) continue;

      const quantity = Math.abs(movement.quantity);
      if (quantity === 0) continue;

      if (movement.batchId) {
        await tx.stockBatch.update({
          where: { id: movement.batchId },
          data: { currentQty: { increment: quantity } },
        });
      }

      await this.stockMovementService.recordMovement(tx, {
        clinicId,
        itemId: movement.itemId,
        batchId: movement.batchId,
        type: 'returned',
        quantity,
        userId: context.userId,
        userName: context.userName,
        invoiceId,
        notes: `Restored by void of invoice ${invoiceId}`,
        reversedMovementId: movement.id,
      });

      await tx.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: { increment: quantity } },
      });

      restored += 1;
    }

    return restored;
  }

  /**
   * Collapses the plan lines to one request per inventory item, dropping
   * service lines (no `inventoryItemId`, no stock provenance) entirely.
   *
   * Two things depend on this. Aggregation: an invoice may carry the same drug
   * on two lines, and checking them independently would let a request pass that
   * the combined quantity cannot satisfy. Ordering: the result is sorted by
   * item id so that two concurrent finalizes for overlapping multi-item
   * invoices acquire their row locks in the same order and cannot deadlock.
   */
  private aggregateByItem(lines: readonly StockPlanLine[]): Array<{
    inventoryItemId: string;
    description: string;
    quantity: number;
    unitPricePaise: number;
  }> {
    const byItem = new Map<
      string,
      { inventoryItemId: string; description: string; quantity: number; unitPricePaise: number }
    >();

    for (const line of lines) {
      if (line.inventoryItemId == null) continue;
      const existing = byItem.get(line.inventoryItemId);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        byItem.set(line.inventoryItemId, {
          inventoryItemId: line.inventoryItemId,
          description: line.description,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
        });
      }
    }

    return [...byItem.values()].sort((a, b) =>
      a.inventoryItemId < b.inventoryItemId ? -1 : a.inventoryItemId > b.inventoryItemId ? 1 : 0,
    );
  }
}
