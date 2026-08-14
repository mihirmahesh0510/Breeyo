import { Prisma } from '@prisma/client';
import { quickSaleSchema } from '@breeyo/validators';
import type { QuickSaleInput } from '@breeyo/validators';
import type { TaxBreakdown, TaxTreatment } from '@breeyo/types';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import { allocateInvoiceDiscount, computeInvoiceTax } from './gst.service.js';
import type { TaxableLine } from './gst.service.js';
import { toPaise } from './money.js';
import { nextDocumentNumber } from './numbering.service.js';
import type { BillingActor, InvoiceRepository } from './invoice.repository.js';
import type { StockPlanLine, StockValidatorService } from './stock-validator.service.js';

/**
 * D-04 Quick Sale — the POS path.
 *
 * Scan or search, cart, one tap. No consultation, no draft the front desk edits
 * first: the invoice is created and finalized in a single request, because the
 * D-04 interaction contract is one tap and a draft left behind by a failed
 * finalize would surface in the Billing tab as a phantom nobody can explain.
 *
 * ## Why this is not `InvoiceService.createDraft` followed by `finalize`
 *
 * `InvoiceRepository.finalizeInvoice` opens its own transaction and begins by
 * locking an already-committed `DRAFT` row, so composing the two would mean two
 * transactions and a window in which a numbered-but-unpaid-for draft exists on
 * its own. Everything below therefore runs in ONE `$transaction`. What is
 * emphatically not duplicated is the arithmetic: discount allocation and tax
 * both come from plan 06-05's engine and numbering from plan 06-06, exactly as
 * `InvoiceService.finalize` uses them.
 *
 * ## The mirror image of the consultation path
 *
 * | | Consultation invoice | Quick Sale |
 * |---|---|---|
 * | When stock moves | at dispense, before the invoice exists | inside this request |
 * | Line `stockMovementId` | the pre-existing movement's id | **null** |
 * | Finalize behaviour | stamps the movement | deducts FIFO under `FOR UPDATE` |
 * | Void (D-34) | never restored — the drug was administered | restored — the goods are still sellable |
 *
 * Because no line carries a `stockMovementId`, the whole product-line set can
 * be handed to `reserveAndDeduct` without filtering: plan 06-07's
 * `STOCK_PLAN_CONTRACT_VIOLATION` guard cannot trip, since the condition it
 * detects — a line whose batch was already decremented — cannot arise here.
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

/** One resolved cart line, priced and rated, before it becomes a database row. */
interface QuickSaleLine {
  sortOrder: number;
  inventoryItemId: string;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPricePaise: number;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
  lineTotalPaise: number;
}

/**
 * What the counter screen renders above the checkout button.
 *
 * `subtotalPaise` is carried alongside the breakdown rather than left for the
 * client to add up, for the same reason the heads are: the moment the device
 * sums anything, there are two figures that can disagree.
 */
export interface QuickSalePreview {
  subtotalPaise: number;
  /** D-17: false for a clinic below the registration threshold. */
  gstEnabled: boolean;
  breakdown: TaxBreakdown;
}

interface ClinicBillingContext {
  gstEnabled: boolean;
  stateCode: string | null;
  defaultGstRate: Prisma.Decimal | number | null;
  defaultDueDays: number;
  gstin: string | null;
}

const asNumber = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value == null ? null : Number(value);

export class QuickSaleService {
  constructor(
    private readonly repository: InvoiceRepository,
    private readonly stockValidator: StockValidatorService,
    private readonly prisma: TenantPrismaClient,
  ) {}

  /**
   * Creates and finalizes a counter-sale invoice.
   *
   * Throws `INVENTORY_ITEM_NOT_FOUND` (404) for an unknown or cross-tenant
   * item, and `INSUFFICIENT_STOCK` (409) with the shortfall list when the cart
   * outruns availability — in the latter case having written nothing at all,
   * because the deduction and the invoice share one transaction.
   */
  async createAndFinalize(
    clinicId: string,
    actor: BillingActor,
    input: QuickSaleInput,
    now: Date = new Date(),
  ) {
    const parsed = quickSaleSchema.parse(input);
    const clinic = await this.loadClinicBilling(clinicId);
    const lines = await this.resolveLines(clinicId, parsed, clinic);

    const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
    // A counter sale carries no place-of-supply override: the customer is
    // standing at the counter, so the supply happens in the clinic's own state.
    const isInterState = false;
    const dueDate = clinic.defaultDueDays
      ? new Date(now.getTime() + clinic.defaultDueDays * MILLISECONDS_PER_DAY)
      : null;

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          clinicId,
          status: 'DRAFT',
          source: 'quick_sale',
          // D-04: a counter sale has no clinical encounter and no patient.
          consultationId: null,
          petId: null,
          ownerId: parsed.ownerId ?? null,
          createdById: actor.userId,
          subtotalPaise,
          lineDiscountPaise: 0,
          invoiceDiscountPaise: 0,
          dueDate,
        },
      });

      await tx.invoiceLineItem.createMany({
        data: lines.map((line) => ({
          clinicId,
          invoiceId: invoice.id,
          lineType: 'product' as const,
          sortOrder: line.sortOrder,
          serviceCatalogId: null,
          inventoryItemId: line.inventoryItemId,
          // NULL, and it must stay null. Two things depend on it:
          //
          //  * Deduction. `reserveAndDeduct` rejects any line carrying one, on
          //    the grounds that its batch was already decremented elsewhere.
          //  * Restoration. `restoreToStock` treats a line's `stockMovementId`
          //    as proof the movement pre-dated the invoice — a drug administered
          //    during a consultation — and skips it on void. Stamping the
          //    movement this sale creates back onto its own line would therefore
          //    stop D-34 restoring counter-sale stock, which is the exact case
          //    D-34 exists to cover. The movement is reachable from the void
          //    path through `StockMovement.invoiceId` instead, which is what
          //    makes deduct and restore exact mirrors here.
          stockMovementId: null,
          description: line.description,
          hsnSacCode: line.hsnSacCode,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          lineDiscountPaise: 0,
          taxTreatment: line.taxTreatment,
          gstRatePercent: new Prisma.Decimal(line.gstRatePercent),
          lineTotalPaise: line.lineTotalPaise,
        })),
      });

      const persisted = await tx.invoiceLineItem.findMany({
        where: { clinicId, invoiceId: invoice.id },
        orderBy: { sortOrder: 'asc' },
      });

      // Every line, unfiltered — legitimate precisely because none of them
      // carries a `stockMovementId`. On the consultation path this same call
      // takes a filtered subset; here there is nothing to filter out, because
      // no stock has moved before this request.
      const stockPlan: StockPlanLine[] = persisted.map((line) => ({
        lineId: line.id,
        inventoryItemId: line.inventoryItemId,
        stockMovementId: null,
        description: line.description,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
      }));

      const deductions = await this.stockValidator.reserveAndDeduct(tx, clinicId, stockPlan, {
        invoiceId: invoice.id,
        userId: actor.userId,
        userName: actor.userName,
      });

      // D-52 / D-60: `reserveAndDeduct` attributes the movement to the invoice
      // and the operator but knows nothing about a customer. Owner attribution
      // is what lets a later counter-sale return be reconciled against the sale
      // it came from, so it is stamped on here, inside the same transaction.
      if (parsed.ownerId) {
        await tx.stockMovement.updateMany({
          where: { clinicId, invoiceId: invoice.id },
          data: { ownerId: parsed.ownerId },
        });
      }

      // Allocated inside the transaction so a rollback returns the number and
      // Rule 46(b) consecutiveness holds (D-15, D-38).
      const invoiceNumber = await nextDocumentNumber(tx, clinicId, 'INV', now);

      const base: TaxableLine[] = persisted.map((line) => ({
        lineId: line.id,
        taxableValuePaise: line.unitPricePaise * line.quantity - line.lineDiscountPaise,
        gstRatePercent: Number(line.gstRatePercent),
        taxTreatment: line.taxTreatment as TaxTreatment,
        hsnSacCode: line.hsnSacCode,
      }));

      // Section 15(3)(a) ordering is preserved even though a Quick Sale carries
      // no invoice-level discount today: running the allocation with zero keeps
      // this path identical to `InvoiceService.finalize` rather than quietly
      // forking it the day D-07 discounts reach the counter screen.
      const discounted = allocateInvoiceDiscount(base, 0);
      const tax = computeInvoiceTax(discounted, {
        gstEnabled: clinic.gstEnabled,
        isInterState,
      });

      const taxByLine = new Map(tax.lines.map((line) => [line.lineId, line]));

      // Every figure below is READ from the engine's result, never recomputed.
      // The locals are named `frozen*` to keep that obvious: no tax arithmetic
      // exists in this file, and the only sum is the line total, which is the
      // definitional sum of the heads the engine already produced.
      for (const line of persisted) {
        const perLine = taxByLine.get(line.id);
        const frozenTaxable = perLine?.taxableValuePaise ?? 0;
        const frozenCgst = perLine?.cgstPaise ?? 0;
        const frozenSgst = perLine?.sgstPaise ?? 0;
        const frozenIgst = perLine?.igstPaise ?? 0;

        await tx.invoiceLineItem.update({
          where: { id: line.id },
          data: {
            allocatedInvoiceDiscountPaise: 0,
            taxableValuePaise: frozenTaxable,
            cgstPaise: frozenCgst,
            sgstPaise: frozenSgst,
            igstPaise: frozenIgst,
            lineTotalPaise: frozenTaxable + frozenCgst + frozenSgst + frozenIgst,
          },
        });
      }

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'FINALIZED',
          invoiceNumber,
          finalizedAt: now,
          documentType: tax.documentType,
          placeOfSupplyStateCode: clinic.stateCode,
          isInterState,
          gstEnabledSnapshot: clinic.gstEnabled,
          clinicGstinSnapshot: clinic.gstEnabled ? clinic.gstin : null,
          subtotalPaise,
          lineDiscountPaise: 0,
          invoiceDiscountPaise: 0,
          taxableValuePaise: tax.taxableValuePaise,
          cgstPaise: tax.cgstPaise,
          sgstPaise: tax.sgstPaise,
          igstPaise: tax.igstPaise,
          // Disclosure only — the heads are already rounded, so this is never
          // added into the total or the balance.
          roundOffPaise: tax.roundOffPaise,
          grandTotalPaise: tax.grandTotalPaise,
          balancePaise: tax.grandTotalPaise,
        },
      });

      await writeBillingAuditLog(tx, BillingAuditEvent.INVOICE_FINALIZED, {
        clinicId,
        userId: actor.userId,
        invoiceId: invoice.id,
        metadata: {
          source: 'quick_sale',
          invoiceNumber,
          grandTotalPaise: tax.grandTotalPaise,
          documentType: tax.documentType,
          deductedBatches: deductions.length,
          // Zero by construction: a Quick Sale creates its movements rather than
          // stamping pre-existing ones.
          stampedMovements: 0,
        },
      });

      // Resolves the transient FINALIZED state from the payment rows in this
      // same transaction; a fresh counter sale lands on UNPAID.
      await this.repository.recomputePaymentState(tx, clinicId, invoice.id);

      return invoice.id;
    });

    // Returned in full so the client can go straight to payment collection.
    return this.repository.getInvoiceDetail(clinicId, invoiceId);
  }

  /**
   * Prices a cart without committing anything — the counter screen's live total.
   *
   * ## Why this is not `InvoiceService.previewTotals`
   *
   * That method computes from an invoice's PERSISTED line items and its
   * endpoint accepts only an `invoiceId`. It is the right contract for the
   * builder, where the draft is saved before it is previewed, and the wrong one
   * here: a Quick Sale has no invoice until checkout, because creation and
   * finalize are deliberately one request (see {@link createAndFinalize}).
   * Saving a throwaway draft on every keystroke to get a number back would
   * reintroduce exactly the numbered-but-unpaid-for phantom that design avoids.
   *
   * ## Why it is not computed on the device instead
   *
   * The grand total is the taxable value plus three heads already rounded once
   * at invoice level under Section 170 / Rule 51. A client re-derivation would
   * be a second implementation of a statutory rounding rule, and the two would
   * disagree on the first sale with a fractional head — on the screen where the
   * figure is read aloud to the person paying (T-06-122).
   *
   * ## Agreement with checkout is structural, not tested-in
   *
   * The cart is resolved and priced by the same `resolveLines`, and taxed by
   * the same `allocateInvoiceDiscount` / `computeInvoiceTax` calls with the
   * same `isInterState: false`, as {@link createAndFinalize}. The only
   * difference is that nothing here opens a transaction, writes a row or
   * allocates an invoice number. Two figures derived from one code path cannot
   * drift; two derived from two would.
   *
   * The one thing this deliberately does NOT do is check stock. Availability is
   * decided under a row lock inside the committing transaction, and a preview's
   * answer would be stale by the time the tap arrived. The client learns about
   * a shortfall from the checkout 409, per row.
   */
  async previewTotals(
    clinicId: string,
    input: QuickSaleInput,
  ): Promise<QuickSalePreview> {
    const parsed = quickSaleSchema.parse(input);
    const clinic = await this.loadClinicBilling(clinicId);
    const lines = await this.resolveLines(clinicId, parsed, clinic);

    const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);

    const base: TaxableLine[] = lines.map((line) => ({
      // No database row exists yet, so the sort order is the line identity.
      // It is used only to key the engine's per-line result, which this preview
      // discards — the cart shows invoice-level figures.
      lineId: String(line.sortOrder),
      taxableValuePaise: line.lineTotalPaise,
      gstRatePercent: line.gstRatePercent,
      taxTreatment: line.taxTreatment,
      hsnSacCode: line.hsnSacCode,
    }));

    // Run with zero for the same reason the committing path does: it keeps
    // Section 15(3)(a) ordering intact rather than forking the day D-07
    // discounts reach the counter screen.
    const discounted = allocateInvoiceDiscount(base, 0);
    const tax = computeInvoiceTax(discounted, {
      gstEnabled: clinic.gstEnabled,
      isInterState: false,
    });

    return {
      subtotalPaise,
      // D-17: the client needs this to decide whether a GST row may be drawn at
      // all. Inferring it from a zero tax head would be wrong — a registered
      // clinic selling only exempt goods also has zero heads.
      gstEnabled: clinic.gstEnabled,
      breakdown: {
        taxableValuePaise: tax.taxableValuePaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        igstPaise: tax.igstPaise,
        roundOffPaise: tax.roundOffPaise,
        grandTotalPaise: tax.grandTotalPaise,
        documentType: tax.documentType,
      },
    };
  }

  /**
   * Resolves the cart against the clinic's own inventory and prices it.
   *
   * Loading filtered by `clinicId` and failing on any miss is the cross-tenant
   * guard as well as the not-found path (T-06-89): an item from another clinic
   * reads as absent rather than forbidden, so the response cannot be used to
   * confirm that some other clinic stocks it.
   */
  private async resolveLines(
    clinicId: string,
    parsed: QuickSaleInput,
    clinic: ClinicBillingContext,
  ): Promise<QuickSaleLine[]> {
    const requestedIds = [...new Set(parsed.items.map((item) => item.inventoryItemId))];

    const items = await this.prisma.inventoryItem.findMany({
      where: { clinicId, id: { in: requestedIds } },
      select: { id: true, name: true, sellingPrice: true, hsnSacCode: true, gstRate: true },
    });

    const byId = new Map(items.map((item) => [item.id, item]));
    const missing = requestedIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw domainError(
        `Inventory item${missing.length > 1 ? 's' : ''} not found: ${missing.join(', ')}`,
        404,
        'INVENTORY_ITEM_NOT_FOUND',
      );
    }

    return parsed.items.map((requested, index) => {
      const item = byId.get(requested.inventoryItemId)!;

      // D-31, the single money boundary. Phase 5 stores rupees as Decimal(10,2)
      // and Phase 6 stores paise; `toPaise` is the only crossing.
      //
      // Note what is NOT happening here: on the consultation path the price is
      // the snapshot taken at dispense time, because the drug was handed over
      // before the invoice existed and must be billed at the price it cost then.
      // A Quick Sale has no prior dispense to snapshot — the dispense IS this
      // request — so the item's current selling price is the only price there is.
      const unitPricePaise = toPaise(item.sellingPrice);
      const gstRatePercent = this.resolveProductGstRate(item.gstRate, clinic.defaultGstRate);

      return {
        sortOrder: index,
        inventoryItemId: item.id,
        description: item.name,
        hsnSacCode: item.hsnSacCode,
        quantity: requested.quantity,
        unitPricePaise,
        // Finding G1: the veterinary healthcare exemption (Notification
        // 12/2017-CT(R) Entry 46) covers the *service* a vet performs. Counter
        // sales of pet food, supplements and accessories are ordinary supplies
        // of goods and are outside it, so `taxable` is the correct default on
        // this path — the exact inverse of the service-line default, where "no
        // tax" is the safe assumption.
        taxTreatment: (gstRatePercent === 0 ? 'exempt' : 'taxable') as TaxTreatment,
        gstRatePercent,
        lineTotalPaise: unitPricePaise * requested.quantity,
      };
    });
  }

  /** The item's own rate, else the clinic default, else 18 — as products do. */
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
