import { Prisma } from '@prisma/client';
import {
  BILLING_EXCEPTION_FLAGS,
  isValidInvoiceTransition,
} from '@breeyo/types';
import type {
  BillingExceptionFlag,
  DiscountType,
  InvoiceDocumentType,
  InvoiceLineType,
  InvoiceListFilter,
  InvoiceListSort,
  InvoiceSource,
  InvoiceStatus,
  TaxTreatment,
} from '@breeyo/types';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { nextDocumentNumber } from './numbering.service.js';
import type { StockPlanLine, StockValidatorService } from './stock-validator.service.js';

/**
 * Persistence for invoices (BIL-01, BIL-02, BIL-03, BIL-07).
 *
 * Three invariants live in this file and nowhere else:
 *
 *  1. **Quantity provenance.** A dispensed product line's quantity comes from
 *     Phase 5's `StockMovement`, which is the only model that carries one. The
 *     clinical record of what was prescribed has no quantity column at all, so
 *     sourcing from it would silently default every dispensed line to 1.
 *  2. **Draft immutability at the query layer.** `status: 'DRAFT'` is part of
 *     the WHERE clause of every mutating draft method, so a finalized invoice
 *     is untouchable even if a future caller forgets a service-level check
 *     (D-21).
 *  3. **Finalize atomicity.** Number allocation, GST freezing, stock deduction,
 *     movement stamping and the audit write happen in one transaction. This is
 *     a deliberate divergence from `emr.service.ts`, which performs its side
 *     effects and its audit write after its transaction: for BIL-02 that would
 *     leave a numbered invoice whose stock never moved, or moved stock with no
 *     invoice to show for it.
 */

// ─── Domain errors ──────────────────────────────────────────────────────────
//
// The project idiom (emr.service.ts): an ordinary Error carrying `statusCode`
// and `code`, mapped by `middleware/error-handler.ts`. No reply object is ever
// constructed here — HTTP is plan 06-08's concern.

type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, status: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = status;
  error.code = code;
  return error;
}

export const invoiceNotFound = (id: string): DomainError => {
  const error = new Error(`Invoice ${id} not found`) as DomainError;
  error.statusCode = 404;
  error.code = 'INVOICE_NOT_FOUND';
  return error;
};

export const invoiceAlreadyFinalized = (id: string): DomainError => {
  const error = new Error(
    `Invoice ${id} is no longer a draft — it was finalized, voided, or is being finalized concurrently`,
  ) as DomainError;
  error.statusCode = 409;
  error.code = 'INVOICE_ALREADY_FINALIZED';
  return error;
};

export const invoiceNotDraft = (id: string): DomainError =>
  domainError(
    `Invoice ${id} is not a draft and cannot be edited — void it and reissue, or raise a credit note (D-21)`,
    409,
    'INVOICE_NOT_DRAFT',
  );

export const invalidStateTransition = (from: string, to: string): DomainError =>
  domainError(`Cannot move an invoice from ${from} to ${to}`, 409, 'INVALID_STATE_TRANSITION');

// ─── Shapes ─────────────────────────────────────────────────────────────────

/**
 * One uninvoiced dispensed movement, as the line-item builder consumes it.
 *
 * `unitPrice` is handed back as the raw `Decimal` in RUPEES. The conversion to
 * paise happens at exactly one boundary (D-31) and that boundary is the
 * service's line-item builder, not this file.
 */
export interface DispensedMovementRow {
  movementId: string;
  inventoryItemId: string;
  description: string;
  /** Positive: Phase 5 stores a dispensal as a negative movement. */
  quantity: number;
  unitPrice: Prisma.Decimal | string | null;
  hsnSacCode: string | null;
  gstRate: Prisma.Decimal | string | null;
}

export interface DraftLineItemData {
  lineType: InvoiceLineType;
  sortOrder: number;
  serviceCatalogId?: string | null;
  inventoryItemId?: string | null;
  /** The deduct/skip discriminator — see `buildProductLineStockPlan`. */
  stockMovementId?: string | null;
  description: string;
  hsnSacCode?: string | null;
  quantity: number;
  unitPricePaise: number;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  lineDiscountPaise: number;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
  lineTotalPaise: number;
}

export interface DraftInvoiceData {
  source: InvoiceSource;
  consultationId?: string | null;
  petId?: string | null;
  ownerId?: string | null;
  createdById: string;
  invoiceDiscountType?: DiscountType | null;
  invoiceDiscountValue?: number | null;
  invoiceDiscountPaise?: number;
  subtotalPaise: number;
  lineDiscountPaise: number;
  dueDate?: Date | null;
  notes?: string | null;
  lineItems: DraftLineItemData[];
}

export interface UpdateDraftData {
  invoiceDiscountType?: DiscountType | null;
  invoiceDiscountValue?: number | null;
  invoiceDiscountPaise?: number;
  subtotalPaise?: number;
  lineDiscountPaise?: number;
  dueDate?: Date | null;
  notes?: string | null;
  /** When present, line items are replaced wholesale rather than diffed. */
  lineItems?: DraftLineItemData[];
}

/** The frozen per-line tax, as produced by `computeInvoiceTax` (plan 06-05). */
export interface FinalizeLineTax {
  lineId: string;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
  allocatedInvoiceDiscountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lineTotalPaise: number;
}

/**
 * Everything the finalize transaction persists, computed by the service before
 * the transaction opens. No figure here may originate in a request body.
 */
export interface FinalizeComputation {
  lines: FinalizeLineTax[];
  subtotalPaise: number;
  lineDiscountPaise: number;
  invoiceDiscountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /**
   * Section 170 / Rule 51 DISCLOSURE field. It is persisted on its own and is
   * deliberately never added into `grandTotalPaise`, `balancePaise` or any
   * payment amount: the tax heads above are already rounded, so re-applying the
   * delta would double-count it (plan 06-05).
   */
  roundOffPaise: number;
  /** `taxableValuePaise + cgst + sgst + igst`, taken from the engine as-is. */
  grandTotalPaise: number;
  documentType: InvoiceDocumentType;
  placeOfSupplyStateCode: string | null;
  isInterState: boolean;
  gstEnabledSnapshot: boolean;
  clinicGstinSnapshot: string | null;
  dueDate: Date | null;
  /**
   * The `StockMovement` ids behind the consultation-sourced product lines. They
   * get the invoice id stamped onto them; they are NOT deducted again.
   */
  sourceStockMovementIds: string[];
}

export interface BillingActor {
  userId: string;
  userName: string;
}

export interface VoidResult {
  invoiceId: string;
  restoredMovementCount: number;
  /**
   * D-35: links that were marked cancelled locally and still need cancelling at
   * the gateway. The Razorpay API call itself belongs to the payment module
   * (plan 06-09/06-10); surfacing the ids here is what makes it possible for it
   * to happen at all rather than being silently dropped.
   */
  cancelledPaymentLinkIds: string[];
}

export interface InvoiceListQuery {
  status: InvoiceListFilter;
  search?: string;
  from?: Date;
  to?: Date;
  petId?: string;
  sort: InvoiceListSort;
  limit: number;
  cursor?: string;
}

const LINE_ITEM_SELECT = {
  id: true,
  clinicId: true,
  invoiceId: true,
  lineType: true,
  sortOrder: true,
  serviceCatalogId: true,
  inventoryItemId: true,
  stockMovementId: true,
  description: true,
  hsnSacCode: true,
  quantity: true,
  unitPricePaise: true,
  discountType: true,
  discountValue: true,
  lineDiscountPaise: true,
  allocatedInvoiceDiscountPaise: true,
  taxTreatment: true,
  gstRatePercent: true,
  taxableValuePaise: true,
  cgstPaise: true,
  sgstPaise: true,
  igstPaise: true,
  lineTotalPaise: true,
  createdAt: true,
} as const;

/** Maps the six D-24 filter values onto concrete statuses. */
const LIST_FILTER_STATUSES: Record<InvoiceListFilter, InvoiceStatus[] | null> = {
  all: null,
  draft: ['DRAFT'],
  unpaid: ['FINALIZED', 'UNPAID', 'PARTIALLY_PAID'],
  overdue: ['OVERDUE'],
  paid: ['PAID'],
  voided: ['VOIDED'],
};

export class InvoiceRepository {
  // TenantPrismaClient rather than the `DbClient` union: this repository uses
  // the interactive `$transaction(async (tx) => ...)` overload, which does not
  // resolve through a union (see lib/prisma-rls.ts). It is constructed per
  // request from `request.db` by plan 06-08's route factory, so there is no
  // module-level client anywhere in this file.
  constructor(
    private readonly prisma: TenantPrismaClient,
    private readonly stockValidator: StockValidatorService,
  ) {}

  // ─── BIL-01 sourcing ──────────────────────────────────────────────────────

  /**
   * The BIL-01 join: one row per still-unclaimed dispensed stock movement.
   *
   * Two shapes, per 06-PATTERNS.md: by consultation (D-03, the primary path) or
   * by owner with no consultation (D-04 Quick Sale / D-52 counter sale).
   *
   * `invoice_id IS NULL` is what prevents double-invoicing: once a finalize
   * stamps the movement, it can never be pulled into a second draft.
   */
  async findUninvoicedDispensedMovements(
    clinicId: string,
    opts: { consultationId?: string; ownerId?: string },
  ): Promise<DispensedMovementRow[]> {
    const scope =
      opts.consultationId != null
        ? Prisma.sql`AND m.consultation_id = ${opts.consultationId}::uuid`
        : Prisma.sql`AND m.consultation_id IS NULL AND m.owner_id = ${opts.ownerId ?? null}::uuid`;

    return this.prisma.$queryRaw<DispensedMovementRow[]>(Prisma.sql`
      SELECT
        m.id                AS "movementId",
        m.item_id           AS "inventoryItemId",
        i.name              AS "description",
        ABS(m.quantity)     AS "quantity",
        m.unit_price        AS "unitPrice",
        i.hsn_sac_code      AS "hsnSacCode",
        i.gst_rate          AS "gstRate"
      FROM stock_movements m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.clinic_id = ${clinicId}::uuid
        AND m.type = 'dispensed'
        AND m.invoice_id IS NULL
        ${scope}
      ORDER BY m.created_at ASC
    `);
  }

  // ─── Draft CRUD ───────────────────────────────────────────────────────────

  async createDraft(clinicId: string, data: DraftInvoiceData) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          clinicId,
          status: 'DRAFT',
          source: data.source,
          consultationId: data.consultationId ?? null,
          petId: data.petId ?? null,
          ownerId: data.ownerId ?? null,
          createdById: data.createdById,
          invoiceDiscountType: data.invoiceDiscountType ?? null,
          invoiceDiscountValue: data.invoiceDiscountValue ?? null,
          invoiceDiscountPaise: data.invoiceDiscountPaise ?? 0,
          subtotalPaise: data.subtotalPaise,
          lineDiscountPaise: data.lineDiscountPaise,
          dueDate: data.dueDate ?? null,
          notes: data.notes ?? null,
        },
      });

      if (data.lineItems.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: data.lineItems.map((line) => this.toLineItemRow(clinicId, invoice.id, line)),
        });
      }

      return invoice;
    });
  }

  async getDraft(clinicId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId, status: 'DRAFT' },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Returns false when the row was not a draft. The guard is `status: 'DRAFT'`
   * inside the WHERE clause rather than a service-level check, so an invoice
   * that finalized between the caller's read and this write is still rejected
   * (D-21, T-06-39).
   */
  async updateDraft(clinicId: string, invoiceId: string, data: UpdateDraftData): Promise<boolean> {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, clinicId, status: 'DRAFT' },
      data: {
        invoiceDiscountType: data.invoiceDiscountType ?? undefined,
        invoiceDiscountValue: data.invoiceDiscountValue ?? undefined,
        invoiceDiscountPaise: data.invoiceDiscountPaise ?? undefined,
        subtotalPaise: data.subtotalPaise ?? undefined,
        lineDiscountPaise: data.lineDiscountPaise ?? undefined,
        dueDate: data.dueDate ?? undefined,
        notes: data.notes ?? undefined,
      },
    });

    if (count === 0) return false;

    // Line items are replaced wholesale rather than diffed (deleteMany then
    // createMany), matching how emr.repository.ts replaces a consultation's
    // child rows on finalize.
    if (data.lineItems) {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoiceLineItem.deleteMany({ where: { clinicId, invoiceId } });
        if (data.lineItems!.length > 0) {
          await tx.invoiceLineItem.createMany({
            data: data.lineItems!.map((line) => this.toLineItemRow(clinicId, invoiceId, line)),
          });
        }
      });
    }

    return true;
  }

  async deleteDraft(clinicId: string, invoiceId: string): Promise<boolean> {
    const { count } = await this.prisma.invoice.deleteMany({
      where: { id: invoiceId, clinicId, status: 'DRAFT' },
    });
    return count > 0;
  }

  private toLineItemRow(clinicId: string, invoiceId: string, line: DraftLineItemData) {
    return {
      clinicId,
      invoiceId,
      lineType: line.lineType,
      sortOrder: line.sortOrder,
      serviceCatalogId: line.serviceCatalogId ?? null,
      inventoryItemId: line.inventoryItemId ?? null,
      stockMovementId: line.stockMovementId ?? null,
      description: line.description,
      hsnSacCode: line.hsnSacCode ?? null,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      discountType: line.discountType ?? null,
      discountValue: line.discountValue ?? null,
      lineDiscountPaise: line.lineDiscountPaise,
      taxTreatment: line.taxTreatment,
      gstRatePercent: new Prisma.Decimal(line.gstRatePercent),
      lineTotalPaise: line.lineTotalPaise,
    };
  }

  // ─── Finalize (BIL-02, BIL-07) ────────────────────────────────────────────

  /**
   * The single-transaction finalize: lock, deduct, number, freeze, stamp, audit.
   *
   * `stockPlan` arrives pre-filtered from `InvoiceService.buildProductLineStockPlan`
   * and is passed to the validator verbatim. It is deliberately NOT rebuilt
   * here from the invoice's line items, so exactly one place in the codebase
   * decides which lines get deducted.
   */
  async finalizeInvoice(
    clinicId: string,
    invoiceId: string,
    computed: FinalizeComputation,
    stockPlan: readonly StockPlanLine[],
    actor: BillingActor,
    now: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // (1) Serialise concurrent finalizes on the invoice row itself. Zero rows
      // means it is no longer a draft — already finalized, voided, or another
      // request got here first.
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM invoices
        WHERE id = ${invoiceId}::uuid
          AND clinic_id = ${clinicId}::uuid
          AND status = 'DRAFT'
        FOR UPDATE
      `);

      if (locked.length === 0) {
        throw invoiceAlreadyFinalized(invoiceId);
      }

      // (2) Deduct stock ONLY for the lines that still need it.
      //
      // BIL-01 / BIL-02 / D-03. A consultation-sourced product line already had
      // its batch decremented by Phase 5's dispense flow at the moment the
      // clinician dispensed the drug, long before this invoice existed; that
      // line carries a `stockMovementId` and is excluded from `stockPlan` by
      // the service. Deducting it here would corrupt inventory on every
      // dispensed-item invoice — the phase's PRIMARY invoice-creation path.
      // Lines added by hand in the builder carry no `stockMovementId` and do
      // need deduction. Both provenances can appear on one invoice, so the
      // filter is per-line and lives in the service, never here.
      const deductions =
        stockPlan.length > 0
          ? await this.stockValidator.reserveAndDeduct(tx, clinicId, stockPlan, {
              invoiceId,
              userId: actor.userId,
              userName: actor.userName,
            })
          : [];

      // (3) Allocate the number inside this transaction so a rollback returns
      // it and Rule 46(b) consecutiveness holds (D-15, D-38, plan 06-06).
      const invoiceNumber = await nextDocumentNumber(tx, clinicId, 'INV', now);

      // (4) Freeze the tax snapshot onto every line.
      for (const line of computed.lines) {
        await tx.invoiceLineItem.update({
          where: { id: line.lineId },
          data: {
            taxTreatment: line.taxTreatment,
            gstRatePercent: new Prisma.Decimal(line.gstRatePercent),
            allocatedInvoiceDiscountPaise: line.allocatedInvoiceDiscountPaise,
            taxableValuePaise: line.taxableValuePaise,
            cgstPaise: line.cgstPaise,
            sgstPaise: line.sgstPaise,
            igstPaise: line.igstPaise,
            lineTotalPaise: line.lineTotalPaise,
          },
        });
      }

      // (5) Stamp the invoice onto the source movements. `invoice_id IS NULL`
      // means a movement already claimed by another invoice is never stolen.
      if (computed.sourceStockMovementIds.length > 0) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE stock_movements
          SET invoice_id = ${invoiceId}::uuid
          WHERE clinic_id = ${clinicId}::uuid
            AND invoice_id IS NULL
            AND id IN (${Prisma.join(
              computed.sourceStockMovementIds.map((id) => Prisma.sql`${id}::uuid`),
            )})
        `);
      }

      // (6) Freeze the invoice header. `grandTotalPaise` is the engine's figure
      // used as-is; `roundOffPaise` is persisted beside it as a disclosure
      // field and is never added into the total or the balance.
      const invoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'FINALIZED',
          invoiceNumber,
          finalizedAt: now,
          dueDate: computed.dueDate,
          documentType: computed.documentType,
          placeOfSupplyStateCode: computed.placeOfSupplyStateCode,
          isInterState: computed.isInterState,
          gstEnabledSnapshot: computed.gstEnabledSnapshot,
          clinicGstinSnapshot: computed.clinicGstinSnapshot,
          subtotalPaise: computed.subtotalPaise,
          lineDiscountPaise: computed.lineDiscountPaise,
          invoiceDiscountPaise: computed.invoiceDiscountPaise,
          taxableValuePaise: computed.taxableValuePaise,
          cgstPaise: computed.cgstPaise,
          sgstPaise: computed.sgstPaise,
          igstPaise: computed.igstPaise,
          roundOffPaise: computed.roundOffPaise,
          grandTotalPaise: computed.grandTotalPaise,
          balancePaise: computed.grandTotalPaise,
        },
      });

      // (7) Audit inside the transaction: an audit row must never describe a
      // finalize that rolled back, and a committed finalize must never be
      // unlogged (D-32, T-06-42).
      await writeBillingAuditLog(tx, BillingAuditEvent.INVOICE_FINALIZED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: {
          invoiceNumber,
          grandTotalPaise: computed.grandTotalPaise,
          documentType: computed.documentType,
          deductedBatches: deductions.length,
          stampedMovements: computed.sourceStockMovementIds.length,
        },
      });

      // (8) Resolve the transient FINALIZED state from the payment rows, in
      // this same transaction. A fresh invoice normally lands on UNPAID.
      await this.recomputePaymentState(tx, clinicId, invoiceId);

      return { invoice, invoiceNumber, deductions };
    });
  }

  // ─── Void (D-21, D-26, D-34, D-35) ────────────────────────────────────────

  /**
   * Voids an invoice and restores the stock the invoice itself moved.
   *
   * D-34 (refined 2026-08-14) scopes the restoration: Quick Sale and manually
   * added lines — the ones this invoice deducted at finalize — are credited
   * back; a drug dispensed during the consultation is not, because it was
   * administered to the animal and consumed. `StockValidatorService.restoreToStock`
   * owns that distinction, using the same `stockMovementId` discriminator that
   * governs deduction.
   *
   * Within that scope there is no age gate: the 24-hour window applies to the
   * separate manual per-dispense "Return to stock" action in Phase 5's UI, not
   * to a void. `voidRestoredStock` is set in the same transaction as the
   * restoration, so a second void attempt cannot restore twice.
   */
  async voidInvoice(
    clinicId: string,
    invoiceId: string,
    reason: string,
    restoreStock: boolean,
    actor: BillingActor,
  ): Promise<VoidResult> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; status: string; void_restored_stock: boolean }>
      >(Prisma.sql`
        SELECT id, status, void_restored_stock
        FROM invoices
        WHERE id = ${invoiceId}::uuid
          AND clinic_id = ${clinicId}::uuid
        FOR UPDATE
      `);

      const row = locked[0];
      if (!row) throw invoiceNotFound(invoiceId);

      if (!isValidInvoiceTransition(row.status as InvoiceStatus, 'VOIDED')) {
        throw invalidStateTransition(row.status, 'VOIDED');
      }

      // D-35: an outstanding payment link must not stay live against a voided
      // invoice. Mark the local rows cancelled here and hand the link ids back
      // so the payment module can cancel them at Razorpay.
      const pendingLinks = await tx.payment.findMany({
        where: { clinicId, invoiceId, status: 'pending', razorpayPaymentLinkId: { not: null } },
        select: { id: true, razorpayPaymentLinkId: true },
      });

      if (pendingLinks.length > 0) {
        await tx.payment.updateMany({
          where: { clinicId, invoiceId, status: 'pending' },
          data: { status: 'cancelled', failureReason: 'Invoice voided' },
        });
      }

      const restoredMovementCount =
        restoreStock && !row.void_restored_stock
          ? await this.stockValidator.restoreToStock(tx, clinicId, invoiceId, actor)
          : 0;

      const now = new Date();
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'VOIDED',
          voidedAt: now,
          voidReason: reason,
          voidRestoredStock: row.void_restored_stock || restoreStock,
        },
      });

      await writeBillingAuditLog(tx, BillingAuditEvent.INVOICE_VOIDED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: {
          reason,
          restoredMovementCount,
          cancelledPaymentLinks: pendingLinks.length,
          previousStatus: row.status,
        },
      });

      return {
        invoiceId,
        restoredMovementCount,
        cancelledPaymentLinkIds: pendingLinks
          .map((p) => p.razorpayPaymentLinkId)
          .filter((id): id is string => id != null),
      };
    });
  }

  // ─── Derived payment state (BIL-03, D-35, D-36) ───────────────────────────

  /**
   * Recomputes `amountPaidPaise`, `creditedPaise`, `balancePaise` and `status`
   * from the payment, refund and credit-note rows.
   *
   * Takes the caller's `tx` and must be called inside the transaction that
   * mutated those rows. Payment status derived from an independently stored
   * column that the payment insert does not update transactionally is the
   * classic billing bug: the rows and the status drift, and the invoice claims
   * to be paid for money nobody received.
   *
   * Two states are deliberately representable rather than clamped:
   *
   *  * **D-36 overpayment** — `balancePaise` goes negative and the invoice is
   *    flagged. Plan 06-03 left `balance_paise` free of any `CHECK >= 0`
   *    precisely so this can be detected instead of silently absorbed.
   *  * **D-35 payment after void** — a late or duplicate payment on a VOIDED
   *    invoice records the money and flags the invoice; it never reopens it.
   */
  async recomputePaymentState(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, clinicId },
      select: { id: true, status: true, grandTotalPaise: true, exceptionFlag: true },
    });
    if (!invoice) throw invoiceNotFound(invoiceId);

    const [payments, refunds, creditNotes] = await Promise.all([
      tx.payment.findMany({
        where: { clinicId, invoiceId, status: 'captured' },
        select: { amountPaise: true },
      }),
      tx.refund.findMany({
        where: { clinicId, invoiceId, status: 'processed' },
        select: { amountPaise: true },
      }),
      tx.creditNote.findMany({ where: { clinicId, invoiceId }, select: { totalPaise: true } }),
    ]);

    const capturedPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
    const refundedPaise = refunds.reduce((sum, r) => sum + r.amountPaise, 0);
    const creditedPaise = creditNotes.reduce((sum, c) => sum + c.totalPaise, 0);
    const amountPaidPaise = capturedPaise - refundedPaise;
    // Never involves roundOffPaise: the grand total already carries the rounded
    // tax heads, so adding the disclosure delta here would misstate the balance.
    const balancePaise = invoice.grandTotalPaise - amountPaidPaise - creditedPaise;

    const current = invoice.status as InvoiceStatus;
    let status: InvoiceStatus = current;
    let exceptionFlag: BillingExceptionFlag | null =
      (invoice.exceptionFlag as BillingExceptionFlag | null) ?? null;
    let exceptionDetectedAt: Date | undefined;

    if (current === 'VOIDED') {
      // D-35: money landed on a voided invoice. Record it, flag it, do not
      // reopen it — the invoice stays terminal and staff refund manually.
      if (amountPaidPaise > 0 && exceptionFlag == null) {
        exceptionFlag = BILLING_EXCEPTION_FLAGS.PAYMENT_AFTER_VOID;
        exceptionDetectedAt = new Date();
      }
    } else {
      if (balancePaise < 0 && exceptionFlag == null) {
        // D-36: two legs both settled. Flag rather than clamp or auto-refund.
        exceptionFlag = BILLING_EXCEPTION_FLAGS.OVERPAYMENT;
        exceptionDetectedAt = new Date();
      }

      const next: InvoiceStatus =
        balancePaise <= 0
          ? 'PAID'
          : amountPaidPaise > 0 || creditedPaise > 0
            ? 'PARTIALLY_PAID'
            : current === 'OVERDUE'
              ? 'OVERDUE'
              : 'UNPAID';

      // The shared transition table is authoritative. A derivation that would
      // make an illegal move leaves the status alone rather than forcing it —
      // the money fields below are still written, so nothing is lost.
      if (next === current || isValidInvoiceTransition(current, next)) {
        status = next;
      }
    }

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status,
        amountPaidPaise,
        creditedPaise,
        balancePaise,
        exceptionFlag,
        ...(exceptionDetectedAt ? { exceptionDetectedAt } : {}),
      },
    });
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  /**
   * The full D-14/D-18 payload in one round trip: line items by `sortOrder`,
   * payments by `paidAt`, refunds, credit notes, and the pet/owner/clinic
   * header block.
   */
  async getInvoiceDetail(clinicId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId },
      include: {
        lineItems: { select: LINE_ITEM_SELECT, orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
        creditNotes: { orderBy: { issuedAt: 'asc' } },
        pet: { select: { id: true, name: true, species: true } },
        owner: { select: { id: true, name: true, mobile: true } },
        clinic: {
          select: {
            name: true,
            address: true,
            contactPhone: true,
            gstin: true,
            logoUrl: true,
            stateCode: true,
            gstEnabled: true,
            bankDetails: true,
            invoiceFooterText: true,
          },
        },
      },
    });
  }

  /**
   * The D-24 dashboard list: six status filters, five sorts, a date range, a
   * pet filter, a cursor and a text search across invoice number, pet name and
   * owner name.
   *
   * Built with the Prisma query builder rather than raw SQL so both the RLS
   * policies and the explicit `clinicId` predicate apply; raw SQL is reserved
   * for the two places that genuinely need `FOR UPDATE`.
   */
  async listInvoices(clinicId: string, query: InvoiceListQuery) {
    const statuses = LIST_FILTER_STATUSES[query.status];

    const where: Prisma.InvoiceWhereInput = {
      clinicId,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(query.petId ? { petId: query.petId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { pet: { name: { contains: query.search, mode: 'insensitive' } } },
              { owner: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.InvoiceOrderByWithRelationInput =
      query.sort === 'oldest'
        ? { createdAt: 'asc' }
        : query.sort === 'amount_high'
          ? { grandTotalPaise: 'desc' }
          : query.sort === 'amount_low'
            ? { grandTotalPaise: 'asc' }
            : query.sort === 'due_date'
              ? { dueDate: 'asc' }
              : { createdAt: 'desc' };

    const rows = await this.prisma.invoice.findMany({
      where,
      orderBy,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        grandTotalPaise: true,
        balancePaise: true,
        createdAt: true,
        dueDate: true,
        exceptionFlag: true,
        pet: { select: { name: true } },
        owner: { select: { name: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: page.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        status: row.status as InvoiceStatus,
        grandTotalPaise: row.grandTotalPaise,
        balancePaise: row.balancePaise,
        createdAt: row.createdAt,
        dueDate: row.dueDate,
        petName: row.pet?.name ?? null,
        ownerName: row.owner?.name ?? null,
        exceptionFlag: (row.exceptionFlag as BillingExceptionFlag | null) ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** D-25: the pet profile's Invoices tab, newest first. */
  async getInvoicesForPet(clinicId: string, petId: string) {
    return this.listInvoices(clinicId, {
      status: 'all',
      sort: 'newest',
      petId,
      limit: 50,
    });
  }

  /** Loads a draft's persisted line items — the only input finalize computes from. */
  async getLineItems(clinicId: string, invoiceId: string) {
    return this.prisma.invoiceLineItem.findMany({
      where: { clinicId, invoiceId },
      select: LINE_ITEM_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** The existing draft for a consultation, if any — the D-03 idempotency read. */
  async findDraftByConsultation(clinicId: string, consultationId: string) {
    return this.prisma.invoice.findFirst({
      where: { clinicId, consultationId, status: 'DRAFT' },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getInvoice(clinicId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({ where: { id: invoiceId, clinicId } });
  }
}
