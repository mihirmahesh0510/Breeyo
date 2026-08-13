import { Prisma } from '@prisma/client';
import {
  createInvoiceSchema,
  finalizeInvoiceSchema,
  updateDraftInvoiceSchema,
  voidInvoiceSchema,
} from '@breeyo/validators';
import type {
  CreateInvoiceInput,
  UpdateDraftInvoiceInput,
  VoidInvoiceInput,
} from '@breeyo/validators';
import {
  isInvoiceActionBlocked,
  isValidInvoiceTransition,
} from '@breeyo/types';
import type {
  InvoiceStatus,
  PaymentMethod,
  TaxBreakdown,
  TaxTreatment,
} from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { allocateInvoiceDiscount, computeInvoiceTax } from './gst.service.js';
import type { TaxableLine } from './gst.service.js';
import { toPaise } from './money.js';
import type {
  BillingActor,
  DispensedMovementRow,
  DraftLineItemData,
  FinalizeComputation,
  InvoiceListQuery,
  InvoiceRepository,
} from './invoice.repository.js';
import type { StockPlanLine, StockValidatorService } from './stock-validator.service.js';

/**
 * The invoice domain (BIL-01, BIL-02, BIL-03, and the invoice half of BIL-07).
 *
 * Orchestration shape follows `emr.service.ts` — parse, load, guard, compute,
 * transact — with one deliberate divergence: emr performs its cross-module side
 * effects and its audit write *after* the transaction, which for finalize would
 * permit a numbered invoice whose stock never moved. Every mutation here is
 * inside the repository's single finalize transaction.
 *
 * `GstService` and `numbering` are pure function modules and are imported
 * directly rather than injected, mirroring how `DosageService` is constructed
 * dependency-free in `emr.routes.ts`.
 *
 * Authorization is a route concern and appears nowhere in this file — see the
 * note on {@link InvoiceService.createDraftFromConsultation}, which must stay
 * ungated.
 */

const DEFAULT_GST_RATE_PERCENT = 18;
const MILLISECONDS_PER_DAY = 86_400_000;

type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, status: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = status;
  error.code = code;
  return error;
}

/** A persisted line item, as `getLineItems` projects it. */
interface PersistedLineItem {
  id: string;
  lineType: string;
  sortOrder: number;
  serviceCatalogId: string | null;
  inventoryItemId: string | null;
  stockMovementId: string | null;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPricePaise: number;
  lineDiscountPaise: number;
  taxTreatment: string;
  gstRatePercent: Prisma.Decimal | number;
}

interface ClinicBillingContext {
  gstEnabled: boolean;
  stateCode: string | null;
  defaultGstRate: Prisma.Decimal | number | null;
  defaultDueDays: number;
  gstin: string | null;
}

export interface MarkPaidInput {
  method: PaymentMethod;
  amountPaise?: number;
  reference?: string;
}

const asNumber = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value == null ? null : Number(value);

export class InvoiceService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly stockValidator: StockValidatorService,
    private readonly prisma: TenantPrismaClient,
  ) {}

  // ─── Draft assembly ───────────────────────────────────────────────────────

  /**
   * The D-03 server-initiated path: a Clinician ends a consultation and the
   * draft appears for the front desk.
   *
   * **This path is deliberately ungated and must stay that way.** The trigger is
   * a Clinician's action, and D-05 does not give the Clinician role billing
   * authority; adding a role check here would break the phase's primary
   * invoice-creation flow (D-03 vs D-05). The route that exposes it is
   * authenticated and tenant-scoped, which is the correct boundary.
   */
  async createDraftFromConsultation(clinicId: string, consultationId: string, actor: BillingActor) {
    // Idempotent by design: the partial unique index
    // `invoices_one_draft_per_consultation` is the backstop, this read is the
    // fast path, and the P2002 catch below closes the race between them.
    const existing = await this.repository.findDraftByConsultation(clinicId, consultationId);
    if (existing) return existing;

    const consultation = await this.prisma.consultation.findFirst({
      where: { id: consultationId, clinicId },
      select: { id: true, petId: true, pet: { select: { ownerId: true } } },
    });
    if (!consultation) {
      throw domainError(`Consultation ${consultationId} not found`, 404, 'CONSULTATION_NOT_FOUND');
    }

    const clinic = await this.loadClinicBilling(clinicId);
    const movements = await this.repository.findUninvoicedDispensedMovements(clinicId, {
      consultationId,
    });

    const lineItems = movements.map((movement, index) =>
      this.dispensedMovementToLine(movement, index, clinic),
    );

    const subtotalPaise = lineItems.reduce((sum, line) => sum + line.lineTotalPaise, 0);

    try {
      const invoice = await this.repository.createDraft(clinicId, {
        source: 'consultation',
        consultationId,
        petId: consultation.petId,
        // D-27: one invoice per pet, attributed to that pet's owner.
        ownerId: consultation.pet?.ownerId ?? null,
        createdById: actor.userId,
        subtotalPaise,
        lineDiscountPaise: 0,
        dueDate: this.computeDueDate(clinic, null),
        lineItems,
      });

      await writeBillingAuditLog(this.prisma, BillingAuditEvent.INVOICE_DRAFT_CREATED, {
        clinicId,
        userId: actor.userId,
        invoiceId: invoice.id,
        metadata: { source: 'consultation', consultationId, lineCount: lineItems.length },
      });

      return invoice;
    } catch (error) {
      // A concurrent End Consultation got there first. The unique index did its
      // job; return what it created rather than surfacing a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.repository.findDraftByConsultation(clinicId, consultationId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  /**
   * The interactive path (D-01, D-06): service lines picked from the catalog,
   * optional manual product lines, and optionally the dispensed movements of a
   * completed consultation the front desk is billing for.
   */
  async createDraft(clinicId: string, actor: BillingActor, input: CreateInvoiceInput) {
    const parsed = createInvoiceSchema.parse(input);
    const clinic = await this.loadClinicBilling(clinicId);

    const lineItems: DraftLineItemData[] = parsed.lineItems.map((line, index) => {
      const unitPricePaise = line.unitPricePaise;
      const gross = unitPricePaise * line.quantity;
      const lineDiscountPaise = this.resolveLineDiscount(
        gross,
        line.discountType ?? null,
        line.discountValue ?? null,
      );

      return {
        lineType: line.lineType,
        sortOrder: index,
        serviceCatalogId: line.serviceCatalogId ?? null,
        inventoryItemId: line.inventoryItemId ?? null,
        // Present only when the client is billing an already-dispensed item.
        stockMovementId: line.stockMovementId ?? null,
        description: line.description,
        hsnSacCode: line.hsnSacCode ?? null,
        quantity: line.quantity,
        unitPricePaise,
        discountType: line.discountType ?? null,
        discountValue: line.discountValue ?? null,
        lineDiscountPaise,
        taxTreatment: line.taxTreatment,
        gstRatePercent: line.gstRatePercent,
        lineTotalPaise: gross - lineDiscountPaise,
      };
    });

    if (parsed.consultationId) {
      const movements = await this.repository.findUninvoicedDispensedMovements(clinicId, {
        consultationId: parsed.consultationId,
      });
      const claimed = new Set(lineItems.map((line) => line.stockMovementId).filter(Boolean));
      movements
        .filter((movement) => !claimed.has(movement.movementId))
        .forEach((movement) => {
          lineItems.push(this.dispensedMovementToLine(movement, lineItems.length, clinic));
        });
    }

    const subtotalPaise = lineItems.reduce(
      (sum, line) => sum + line.unitPricePaise * line.quantity,
      0,
    );
    const lineDiscountPaise = lineItems.reduce((sum, line) => sum + line.lineDiscountPaise, 0);
    const invoiceDiscountPaise = this.resolveInvoiceDiscount(
      subtotalPaise - lineDiscountPaise,
      parsed.invoiceDiscountType ?? null,
      parsed.invoiceDiscountValue ?? null,
    );

    const invoice = await this.repository.createDraft(clinicId, {
      source: parsed.source,
      consultationId: parsed.consultationId ?? null,
      petId: parsed.petId ?? null,
      ownerId: parsed.ownerId ?? null,
      createdById: actor.userId,
      invoiceDiscountType: parsed.invoiceDiscountType ?? null,
      invoiceDiscountValue: parsed.invoiceDiscountValue ?? null,
      invoiceDiscountPaise,
      subtotalPaise,
      lineDiscountPaise,
      dueDate: this.computeDueDate(clinic, parsed.dueDate ? new Date(parsed.dueDate) : null),
      notes: parsed.notes ?? null,
      lineItems,
    });

    await writeBillingAuditLog(this.prisma, BillingAuditEvent.INVOICE_DRAFT_CREATED, {
      clinicId,
      userId: actor.userId,
      invoiceId: invoice.id,
      metadata: { source: parsed.source, lineCount: lineItems.length },
    });

    return invoice;
  }

  /**
   * Replaces a draft wholesale. The repository's update is scoped to
   * `status: 'DRAFT'`, so a zero-row result means the invoice finalized in the
   * meantime — D-21's only corrections are void-and-reissue or a credit note.
   */
  async updateDraft(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: UpdateDraftInvoiceInput,
  ) {
    const parsed = updateDraftInvoiceSchema.parse(input);

    let lineItems: DraftLineItemData[] | undefined;
    let subtotalPaise: number | undefined;
    let lineDiscountPaise: number | undefined;

    if (parsed.lineItems) {
      lineItems = parsed.lineItems.map((line, index) => {
        const gross = line.unitPricePaise * line.quantity;
        const discount = this.resolveLineDiscount(
          gross,
          line.discountType ?? null,
          line.discountValue ?? null,
        );
        return {
          lineType: line.lineType,
          sortOrder: index,
          serviceCatalogId: line.serviceCatalogId ?? null,
          inventoryItemId: line.inventoryItemId ?? null,
          stockMovementId: line.stockMovementId ?? null,
          description: line.description,
          hsnSacCode: line.hsnSacCode ?? null,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          discountType: line.discountType ?? null,
          discountValue: line.discountValue ?? null,
          lineDiscountPaise: discount,
          taxTreatment: line.taxTreatment,
          gstRatePercent: line.gstRatePercent,
          lineTotalPaise: gross - discount,
        };
      });
      subtotalPaise = lineItems.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
      lineDiscountPaise = lineItems.reduce((sum, l) => sum + l.lineDiscountPaise, 0);
    }

    const updated = await this.repository.updateDraft(clinicId, invoiceId, {
      invoiceDiscountType: parsed.invoiceDiscountType ?? null,
      invoiceDiscountValue: parsed.invoiceDiscountValue ?? null,
      invoiceDiscountPaise:
        subtotalPaise != null && parsed.invoiceDiscountType
          ? this.resolveInvoiceDiscount(
              subtotalPaise - (lineDiscountPaise ?? 0),
              parsed.invoiceDiscountType,
              parsed.invoiceDiscountValue ?? null,
            )
          : undefined,
      subtotalPaise,
      lineDiscountPaise,
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      notes: parsed.notes ?? undefined,
      lineItems,
    });

    if (!updated) {
      throw domainError(
        `Invoice ${invoiceId} is not a draft and cannot be edited — void it and reissue, or raise a credit note (D-21)`,
        409,
        'INVOICE_NOT_DRAFT',
      );
    }

    await writeBillingAuditLog(this.prisma, BillingAuditEvent.INVOICE_DRAFT_CREATED, {
      clinicId,
      userId: actor.userId,
      invoiceId,
      metadata: { edited: true, lineCount: lineItems?.length ?? null },
    });

    return this.repository.getDraft(clinicId, invoiceId);
  }

  async deleteDraft(clinicId: string, invoiceId: string, actor: BillingActor) {
    const deleted = await this.repository.deleteDraft(clinicId, invoiceId);
    if (!deleted) {
      throw domainError(
        `Invoice ${invoiceId} is not a draft and cannot be deleted (D-21)`,
        409,
        'INVOICE_NOT_DRAFT',
      );
    }

    await writeBillingAuditLog(this.prisma, BillingAuditEvent.INVOICE_DRAFT_CREATED, {
      clinicId,
      userId: actor.userId,
      invoiceId,
      metadata: { deleted: true },
    });

    return { deleted: true };
  }

  // ─── Totals ───────────────────────────────────────────────────────────────

  /**
   * The live totals the mobile builder displays. Display only: the client's
   * figure is never persisted and never trusted — `finalize` recomputes from
   * the persisted line items and ignores anything in the request body.
   */
  async previewTotals(clinicId: string, invoiceId: string): Promise<TaxBreakdown> {
    const invoice = await this.repository.getInvoice(clinicId, invoiceId);
    if (!invoice) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');

    const clinic = await this.loadClinicBilling(clinicId);
    const lineItems = (await this.repository.getLineItems(
      clinicId,
      invoiceId,
    )) as unknown as PersistedLineItem[];

    const placeOfSupplyStateCode =
      (invoice as { placeOfSupplyStateCode?: string | null }).placeOfSupplyStateCode ??
      clinic.stateCode;

    const { tax } = this.computeTotals(lineItems, {
      gstEnabled: clinic.gstEnabled,
      isInterState: this.resolveInterState(clinic.stateCode, placeOfSupplyStateCode),
      invoiceDiscountPaise: this.invoiceDiscountFor(invoice, lineItems),
    });

    return tax;
  }

  // ─── Finalize (BIL-02, BIL-07) ────────────────────────────────────────────

  async finalize(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: unknown,
    now: Date = new Date(),
  ) {
    const parsed = finalizeInvoiceSchema.parse(input ?? {});

    const invoice = await this.repository.getInvoice(clinicId, invoiceId);
    if (!invoice) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');

    this.assertNoUnresolvedException(invoice);

    const status = (invoice as { status: string }).status as InvoiceStatus;
    if (!isValidInvoiceTransition(status, 'FINALIZED')) {
      throw domainError(
        `Invoice ${invoiceId} is ${status} and can no longer be finalized`,
        409,
        'INVOICE_ALREADY_FINALIZED',
      );
    }

    const clinic = await this.loadClinicBilling(clinicId);
    const lineItems = (await this.repository.getLineItems(
      clinicId,
      invoiceId,
    )) as unknown as PersistedLineItem[];

    // The place of supply decides CGST+SGST versus IGST. Defaulting it to the
    // clinic's own state makes a walk-in intra-state, which is the normal case.
    const placeOfSupplyStateCode = parsed.placeOfSupplyStateCode ?? clinic.stateCode;
    const isInterState = this.resolveInterState(clinic.stateCode, placeOfSupplyStateCode);
    const invoiceDiscountPaise = this.invoiceDiscountFor(invoice, lineItems);

    const { tax, discounted, subtotalPaise, lineDiscountPaise } = this.computeTotals(lineItems, {
      gstEnabled: clinic.gstEnabled,
      isInterState,
      invoiceDiscountPaise,
    });

    const taxByLine = new Map(tax.lines.map((line) => [line.lineId, line]));

    const computed: FinalizeComputation = {
      lines: lineItems.map((line) => {
        const perLine = taxByLine.get(line.id);
        const allocated =
          discounted.find((d) => d.lineId === line.id)?.allocatedInvoiceDiscountPaise ?? 0;
        const taxableValuePaise = perLine?.taxableValuePaise ?? 0;
        const cgstPaise = perLine?.cgstPaise ?? 0;
        const sgstPaise = perLine?.sgstPaise ?? 0;
        const igstPaise = perLine?.igstPaise ?? 0;
        return {
          lineId: line.id,
          taxTreatment: line.taxTreatment as TaxTreatment,
          gstRatePercent: Number(line.gstRatePercent),
          allocatedInvoiceDiscountPaise: allocated,
          taxableValuePaise,
          cgstPaise,
          sgstPaise,
          igstPaise,
          lineTotalPaise: taxableValuePaise + cgstPaise + sgstPaise + igstPaise,
        };
      }),
      subtotalPaise,
      lineDiscountPaise,
      invoiceDiscountPaise,
      taxableValuePaise: tax.taxableValuePaise,
      cgstPaise: tax.cgstPaise,
      sgstPaise: tax.sgstPaise,
      igstPaise: tax.igstPaise,
      // Disclosure only. The engine's grand total already carries the rounded
      // heads, so this is persisted beside it and never added into it.
      roundOffPaise: tax.roundOffPaise,
      grandTotalPaise: tax.grandTotalPaise,
      documentType: tax.documentType,
      placeOfSupplyStateCode,
      isInterState,
      gstEnabledSnapshot: clinic.gstEnabled,
      clinicGstinSnapshot: clinic.gstEnabled ? clinic.gstin : null,
      dueDate: this.computeDueDate(clinic, parsed.dueDate ? new Date(parsed.dueDate) : null, now),
      sourceStockMovementIds: lineItems
        .map((line) => line.stockMovementId)
        .filter((id): id is string => id != null),
    };

    const stockPlan = this.buildProductLineStockPlan(lineItems);

    await this.repository.finalizeInvoice(clinicId, invoiceId, computed, stockPlan, actor, now);

    return this.repository.getInvoiceDetail(clinicId, invoiceId);
  }

  /**
   * The SINGLE authority on which lines get a fresh stock deduction at finalize.
   *
   * BIL-01 / BIL-02 / D-03. Without the `stockMovementId == null` clause, every
   * consultation-sourced invoice would decrement inventory a second time at
   * finalize — silently, on the phase's primary invoice-creation path.
   *
   * Three provenances exist and each is handled differently:
   *
   * | Line shape                                        | Meaning                                          | Finalize behaviour              |
   * |---------------------------------------------------|--------------------------------------------------|---------------------------------|
   * | `inventoryItemId == null`                         | service line (D-01/D-06 catalog pick)            | no stock effect at all          |
   * | `inventoryItemId != null`, `stockMovementId != null` | dispensed during the consultation; Phase 5 already decremented the batch | stamp the invoice id onto the existing movement only — never deduct |
   * | `inventoryItemId != null`, `stockMovementId == null` | added by hand in the builder's Add Product sheet  | deduct FIFO under row locks     |
   *
   * `InvoiceLineItem.stockMovementId` (plan 06-03) exists for exactly this
   * discrimination: a line carrying one is already-settled stock. Plans 06-13
   * and 06-16 both add product lines and must match this contract.
   */
  buildProductLineStockPlan(lineItems: readonly PersistedLineItem[]): StockPlanLine[] {
    return lineItems
      .filter((line) => line.inventoryItemId != null && line.stockMovementId == null)
      .map((line) => ({
        lineId: line.id,
        inventoryItemId: line.inventoryItemId,
        stockMovementId: null,
        description: line.description,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
      }));
  }

  /**
   * The read-only availability banner for the builder. Explicitly not the
   * BIL-02 guarantee — see `stock-validator.service.ts`.
   */
  async checkStock(clinicId: string, invoiceId: string) {
    const lineItems = (await this.repository.getLineItems(
      clinicId,
      invoiceId,
    )) as unknown as PersistedLineItem[];
    return this.stockValidator.checkAvailability(
      this.prisma as never,
      clinicId,
      this.buildProductLineStockPlan(lineItems),
    );
  }

  // ─── Void (D-21, D-26, D-34, D-35) ────────────────────────────────────────

  /**
   * Voids an invoice and restores its stock.
   *
   * D-34: restoration is unconditional and has no age gate — the 24-hour window
   * belongs to Phase 5's manual per-dispense return, not to an invoice void.
   * The shipped `voidInvoiceSchema` accordingly only validates `restoreStock:
   * true`, so a client asking for `false` is rejected rather than silently
   * overridden.
   */
  async voidInvoice(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: VoidInvoiceInput,
  ) {
    const parsed = voidInvoiceSchema.parse(input);

    const invoice = await this.repository.getInvoice(clinicId, invoiceId);
    if (!invoice) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');

    this.assertNoUnresolvedException(invoice);

    const status = (invoice as { status: string }).status as InvoiceStatus;
    if (!isValidInvoiceTransition(status, 'VOIDED')) {
      throw domainError(
        `Cannot void an invoice in state ${status}`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    const result = await this.repository.voidInvoice(
      clinicId,
      invoiceId,
      parsed.reason,
      parsed.restoreStock,
      actor,
    );

    const detail = await this.repository.getInvoiceDetail(clinicId, invoiceId);
    // D-35: the link ids travel back to the caller so the payment module can
    // cancel them at Razorpay. Losing them here would leave a live payment link
    // pointing at a voided invoice.
    return { ...result, invoice: detail };
  }

  // ─── Manual payment status (BIL-03) ───────────────────────────────────────

  /**
   * The manual "mark paid" control — a cash payment recorded by staff (D-10).
   *
   * The payment row and the derived status are written in one transaction, so
   * the invoice's status can never disagree with the rows it is derived from.
   */
  async markPaid(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: MarkPaidInput,
  ) {
    const invoice = await this.repository.getInvoice(clinicId, invoiceId);
    if (!invoice) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');

    this.assertNoUnresolvedException(invoice);

    const current = (invoice as { status: string }).status as InvoiceStatus;
    if (!isValidInvoiceTransition(current, 'PAID')) {
      throw domainError(
        `Cannot mark an invoice in state ${current} as paid`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    // PAID -> PAID is an accepted no-op (duplicate webhook, double tap); there
    // is nothing left to collect, so no second payment row is written.
    if (current === 'PAID') {
      return this.repository.getInvoiceDetail(clinicId, invoiceId);
    }

    const outstanding =
      ((invoice as { grandTotalPaise?: number }).grandTotalPaise ?? 0) -
      ((invoice as { amountPaidPaise?: number }).amountPaidPaise ?? 0);
    const amountPaise = input.amountPaise ?? outstanding;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          clinicId,
          invoiceId,
          method: input.method,
          channel: 'manual',
          amountPaise,
          status: 'captured',
          paidAt: new Date(),
          recordedById: actor.userId,
        },
      });

      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_RECORDED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: { method: input.method, channel: 'manual', amountPaise },
      });
    });

    return this.repository.getInvoiceDetail(clinicId, invoiceId);
  }

  /**
   * Reverses a manual mark-paid.
   *
   * D-37 is why this consults the transition table rather than simply writing
   * `UNPAID`: an invoice that is `PARTIALLY_PAID` because a real cash leg was
   * collected must never fall back to fully unpaid, and the table has no
   * `PARTIALLY_PAID -> UNPAID` edge for exactly that reason.
   */
  async markUnpaid(clinicId: string, invoiceId: string, actor: BillingActor) {
    const invoice = await this.repository.getInvoice(clinicId, invoiceId);
    if (!invoice) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');

    this.assertNoUnresolvedException(invoice);

    const current = (invoice as { status: string }).status as InvoiceStatus;
    if (!isValidInvoiceTransition(current, 'UNPAID')) {
      throw domainError(
        `Cannot mark an invoice in state ${current} as unpaid`,
        409,
        'INVALID_STATE_TRANSITION',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { clinicId, invoiceId, channel: 'manual', status: 'captured' },
        data: { status: 'cancelled', failureReason: 'Reversed by staff' },
      });

      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.PAYMENT_RECORDED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: { reversal: true },
      });
    });

    return this.repository.getInvoiceDetail(clinicId, invoiceId);
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  async getDetail(clinicId: string, invoiceId: string) {
    const detail = await this.repository.getInvoiceDetail(clinicId, invoiceId);
    if (!detail) throw domainError(`Invoice ${invoiceId} not found`, 404, 'INVOICE_NOT_FOUND');
    return detail;
  }

  async list(clinicId: string, query: InvoiceListQuery) {
    return this.repository.listInvoices(clinicId, query);
  }

  /** D-25: the pet profile's Invoices tab. */
  async listForPet(clinicId: string, petId: string) {
    return this.repository.getInvoicesForPet(clinicId, petId);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * D-35 / D-36: a flagged invoice has every status-changing action blocked
   * until staff resolve the money question. This is checked BEFORE the
   * transition table, because the flag blocks regardless of what the table
   * would otherwise permit.
   */
  private assertNoUnresolvedException(invoice: unknown): void {
    const flag = (invoice as { exceptionFlag?: string | null }).exceptionFlag ?? null;
    if (isInvoiceActionBlocked(flag)) {
      throw domainError(
        `This invoice is flagged as "${flag}" and is blocked until a staff member resolves it`,
        409,
        'INVOICE_EXCEPTION_UNRESOLVED',
      );
    }
  }

  /**
   * Builds one product line from a dispensed movement.
   *
   * The quantity is the movement's own — the clinical record carries none, so
   * anything else here would silently become 1 — and the price is the snapshot
   * taken at dispense time, not the item's current selling price, because the
   * invoice must reflect what the drug cost when it was handed over.
   */
  private dispensedMovementToLine(
    movement: DispensedMovementRow,
    sortOrder: number,
    clinic: ClinicBillingContext,
  ): DraftLineItemData {
    // D-31: the single money boundary. Phase 5 stores rupees as Decimal(10,2);
    // Phase 6 stores paise. `toPaise` is the only crossing.
    const unitPricePaise = movement.unitPrice == null ? 0 : toPaise(movement.unitPrice);
    const gstRatePercent = this.resolveProductGstRate(movement.gstRate, clinic.defaultGstRate);

    return {
      lineType: 'product',
      sortOrder,
      serviceCatalogId: null,
      inventoryItemId: movement.inventoryItemId,
      // The deduct/skip discriminator: stock for this line has ALREADY moved.
      stockMovementId: movement.movementId,
      description: movement.description,
      hsnSacCode: movement.hsnSacCode,
      quantity: movement.quantity,
      unitPricePaise,
      lineDiscountPaise: 0,
      taxTreatment: gstRatePercent === 0 ? 'exempt' : 'taxable',
      gstRatePercent,
      lineTotalPaise: unitPricePaise * movement.quantity,
    };
  }

  /**
   * Products: the item's own rate, else the clinic default, else 18.
   *
   * Services take a different chain — `ServiceCatalog.gstRateOverride` falling
   * back to 0 — because veterinary healthcare is exempt by law (Finding G1,
   * Notification 12/2017-CT(R) Entry 46), so the safe default for a service is
   * "no tax", not "the clinic's usual rate".
   */
  private resolveProductGstRate(
    itemRate: Prisma.Decimal | string | number | null,
    clinicDefault: Prisma.Decimal | number | null,
  ): number {
    const fromItem = itemRate == null ? null : Number(itemRate);
    if (fromItem != null && !Number.isNaN(fromItem)) return fromItem;
    const fromClinic = asNumber(clinicDefault);
    if (fromClinic != null && !Number.isNaN(fromClinic)) return fromClinic;
    return DEFAULT_GST_RATE_PERCENT;
  }

  /**
   * Runs the plan-06-05 engine over the PERSISTED line items. Nothing on this
   * path reads a money figure from a request body: the input schemas do not
   * carry a total, and any extra key a client sends is stripped by Zod.
   */
  private computeTotals(
    lineItems: readonly PersistedLineItem[],
    opts: { gstEnabled: boolean; isInterState: boolean; invoiceDiscountPaise: number },
  ) {
    const subtotalPaise = lineItems.reduce(
      (sum, line) => sum + line.unitPricePaise * line.quantity,
      0,
    );
    const lineDiscountPaise = lineItems.reduce((sum, line) => sum + line.lineDiscountPaise, 0);

    const base: TaxableLine[] = lineItems.map((line) => ({
      lineId: line.id,
      taxableValuePaise: line.unitPricePaise * line.quantity - line.lineDiscountPaise,
      gstRatePercent: Number(line.gstRatePercent),
      taxTreatment: line.taxTreatment as TaxTreatment,
      hsnSacCode: line.hsnSacCode,
    }));

    // Section 15(3)(a): an invoice-level discount reduces the taxable value and
    // must be pushed down onto the lines BEFORE tax, never subtracted from the
    // grand total afterwards.
    const discounted = allocateInvoiceDiscount(base, opts.invoiceDiscountPaise);
    const tax = computeInvoiceTax(discounted, {
      gstEnabled: opts.gstEnabled,
      isInterState: opts.isInterState,
    });

    return { tax, discounted, subtotalPaise, lineDiscountPaise };
  }

  private invoiceDiscountFor(invoice: unknown, lineItems: readonly PersistedLineItem[]): number {
    const record = invoice as {
      invoiceDiscountType?: string | null;
      invoiceDiscountValue?: number | null;
      invoiceDiscountPaise?: number | null;
    };

    if (record.invoiceDiscountPaise != null && record.invoiceDiscountPaise > 0) {
      return record.invoiceDiscountPaise;
    }

    const netPaise = lineItems.reduce(
      (sum, line) => sum + line.unitPricePaise * line.quantity - line.lineDiscountPaise,
      0,
    );

    return this.resolveInvoiceDiscount(
      netPaise,
      record.invoiceDiscountType ?? null,
      record.invoiceDiscountValue ?? null,
    );
  }

  /**
   * `percent` values are persisted as percent x 100 so a fractional percentage
   * stays expressible; `flat` values are already paise (D-07).
   */
  private resolveLineDiscount(
    grossPaise: number,
    type: string | null,
    value: number | null,
  ): number {
    return this.resolveInvoiceDiscount(grossPaise, type, value);
  }

  private resolveInvoiceDiscount(
    basePaise: number,
    type: string | null,
    value: number | null,
  ): number {
    if (type == null || value == null) return 0;
    if (type === 'flat') return Math.min(value, basePaise);
    // percent, stored as percent x 100
    return Math.min(Math.round((basePaise * value) / 10_000), basePaise);
  }

  private resolveInterState(
    clinicStateCode: string | null,
    placeOfSupplyStateCode: string | null,
  ): boolean {
    if (clinicStateCode == null || placeOfSupplyStateCode == null) return false;
    return clinicStateCode !== placeOfSupplyStateCode;
  }

  /** D-23: `now + clinic.defaultDueDays` unless the request supplies a date. */
  private computeDueDate(
    clinic: ClinicBillingContext,
    supplied: Date | null,
    now: Date = new Date(),
  ): Date | null {
    if (supplied) return supplied;
    if (!clinic.defaultDueDays) return null;
    return new Date(now.getTime() + clinic.defaultDueDays * MILLISECONDS_PER_DAY);
  }

  private async loadClinicBilling(clinicId: string): Promise<ClinicBillingContext> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        gstEnabled: true,
        stateCode: true,
        defaultGstRate: true,
        defaultDueDays: true,
        gstin: true,
      },
    });
    if (!clinic) throw domainError(`Clinic ${clinicId} not found`, 404, 'CLINIC_NOT_FOUND');
    return clinic as ClinicBillingContext;
  }
}
