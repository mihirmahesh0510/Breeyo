import { Prisma } from '@prisma/client';
import { creditNoteSchema } from '@breeyo/validators';
import type { CreditNoteInput } from '@breeyo/validators';
import type { InvoiceDocumentType, TaxTreatment } from '@breeyo/types';
import type { TenantPrismaClient, TenantTransactionClient } from '../../lib/prisma-rls.js';
import { BillingAuditEvent, writeBillingAuditLog } from '../../lib/billing-audit-log.js';
import type { BillingActor } from './invoice.repository.js';
import { InvoiceRepository } from './invoice.repository.js';
import { computeInvoiceTax } from './gst.service.js';
import type { TaxableLine } from './gst.service.js';
import { allocateProRata } from './money.js';
import { nextDocumentNumber } from './numbering.service.js';

/**
 * Credit notes (BIL-07, D-19, D-21, D-22) — correcting a locked invoice
 * without editing it.
 *
 * ## Why this is not an invoice edit
 *
 * D-21 makes a finalized invoice immutable. It carries a consecutive Rule 46(b)
 * number, a frozen tax computation and a six-year retention obligation, and it
 * may already have been printed, WhatsApped and filed in a GSTR-1 return. So a
 * correction is issued as a SEPARATE document that references it: a credit note
 * with its own gap-free `CN-YYYYMM-XXXX` number, carrying positive amounts that
 * reduce the original's outstanding balance by reference (D-22).
 *
 * This service therefore issues **no update or delete against the `invoices`
 * table or the `invoice_line_items` table** at all — a grep gate in plan 06-11
 * enforces that, which is why the prohibited method names are described here
 * rather than written out (a gate that trips on its own documentation is worse
 * than no gate). The only thing that moves on the invoice is what
 * `InvoiceRepository.recomputePaymentState` derives from the rows —
 * `creditedPaise`, `balancePaise`, `amountPaidPaise` and `status` — inside this
 * same transaction. `subtotalPaise`, `grandTotalPaise`, the tax heads and every
 * `InvoiceLineItem` are provably untouched (T-06-69).
 *
 * ## Tax comes from the invoice, never from the clinic
 *
 * `computeInvoiceTax` is called with `gstEnabled: invoice.gstEnabledSnapshot`
 * and `isInterState: invoice.isInterState` read off the INVOICE row, and each
 * credited line carries the `gstRatePercent` and `taxTreatment` frozen onto the
 * original `InvoiceLineItem` at finalize.
 *
 * Recomputing a historical document from current settings is the anti-pattern
 * this guards against (Finding G2, T-06-72). GST slabs change by notification
 * and a clinic can register or deregister; a credit note that picked up today's
 * 5% against an invoice taxed at 18% would not reconcile with the return the
 * original was filed in, and the difference would surface as a mismatch notice
 * rather than as a bug report.
 *
 * ## What `creditAmountPaise` means
 *
 * The tax-INCLUSIVE amount coming off that line — the figure the UI shows next
 * to the item and the figure the owner recognises. It is bounded by the line's
 * `lineTotalPaise`, which is likewise tax-inclusive.
 *
 * So the credited amount is split back into its taxable and tax components
 * before the engine sees it, pro-rata against the original line's own split.
 * Crediting a whole line reproduces that line's taxable value exactly (the
 * allocation is remainder-exact), and the engine then reproduces its tax
 * exactly, because the rate, the treatment and the intra/inter-state decision
 * are all the same. Feeding the tax-inclusive figure straight in as a taxable
 * value would instead tax the tax, and the credit note would exceed the line it
 * credits.
 *
 * ## Rounding
 *
 * A credit note is its own document under Section 170 / Rule 51, so its heads
 * are rounded once at document level and `totalPaise = taxableValue + rounded
 * heads`. `roundOffPaise` is the disclosure delta and is NEVER added back into
 * the total — the same invariant the invoice carries.
 */

// ─── Domain errors ──────────────────────────────────────────────────────────

type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, status: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = status;
  error.code = code;
  return error;
}

const invoiceNotFound = (id: string) =>
  domainError(`Invoice ${id} not found`, 404, 'INVOICE_NOT_FOUND');

const creditNoteNotFound = (id: string) =>
  domainError(`Credit note ${id} not found`, 404, 'CREDIT_NOTE_NOT_FOUND');

/**
 * 404, not 403. The lookup is scoped by clinic AND invoice, so a valid line-item
 * id belonging to another tenant reads as absent — confirming its existence
 * with a 403 would itself be the disclosure (T-06-71).
 */
const creditLineNotFound = (ids: string[]) =>
  domainError(
    `No line item on this invoice matches ${ids.join(', ')}`,
    404,
    'CREDIT_LINE_NOT_FOUND',
  );

const creditExceedsLineTotal = (lineItemId: string, requested: number, available: number) =>
  domainError(
    `A credit of ${requested} paise on line ${lineItemId} exceeds the ${available} paise still creditable on it`,
    400,
    'CREDIT_EXCEEDS_LINE_TOTAL',
  );

const creditExceedsInvoiceTotal = (requested: number, available: number) =>
  domainError(
    `A credit of ${requested} paise exceeds the ${available} paise still creditable on this invoice`,
    400,
    'CREDIT_EXCEEDS_INVOICE_TOTAL',
  );

const invalidStateTransition = (from: string) =>
  domainError(
    `An invoice in state ${from} cannot be credited — a draft is edited, and a voided invoice has no balance to reduce`,
    409,
    'INVALID_STATE_TRANSITION',
  );

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface CreditNoteLineResult {
  invoiceLineItemId: string;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  taxTreatment: TaxTreatment;
  gstRatePercent: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface CreditNoteResult {
  id: string;
  creditNoteNumber: string;
  invoiceId: string;
  invoiceNumber: string | null;
  reason: string;
  notes: string | null;
  subtotalPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  /**
   * CGST Rule 46A, derived rather than stored: `credit_notes` has no
   * `document_type` column, and a value recoverable from the credited lines
   * does not need one. Returned so the PDF can title itself correctly and so
   * the audit row records that a fully-exempt credit carried no tax.
   */
  documentType: InvoiceDocumentType;
  issuedAt: Date;
  lineItems: CreditNoteLineResult[];
}

/** The `invoices` columns a credit-note decision is made from. */
interface LockedInvoiceRow {
  id: string;
  status: string;
  grand_total_paise: number;
  balance_paise: number;
  exception_flag: string | null;
  invoice_number: string | null;
  /** The GST snapshot frozen at finalize — the authority for this computation. */
  gst_enabled_snapshot: boolean;
  is_inter_state: boolean;
}

interface InvoiceLineItemRow {
  id: string;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  taxTreatment: string;
  gstRatePercent: Prisma.Decimal | number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lineTotalPaise: number;
}

/** D-21: a draft is edited, not credited. A voided invoice has no balance. */
const NON_CREDITABLE_INVOICE_STATES = new Set(['DRAFT', 'VOIDED']);

// ─── Service ────────────────────────────────────────────────────────────────

export class CreditNoteService {
  constructor(
    // `TenantPrismaClient`, not `PrismaClient` (D-30). Since hotfix 06-00b its
    // interactive `$transaction` is genuinely atomic, which is what lets the
    // number allocation, the bounds and the inserts below be one unit.
    private readonly repository: InvoiceRepository,
    private readonly prisma: TenantPrismaClient,
  ) {}

  // ─── Write (D-22) ─────────────────────────────────────────────────────────

  async issueCreditNote(
    clinicId: string,
    invoiceId: string,
    actor: BillingActor,
    input: CreditNoteInput,
  ): Promise<CreditNoteResult> {
    const parsed = creditNoteSchema.safeParse(input);
    if (!parsed.success) {
      throw domainError(
        parsed.error.errors.map((issue) => issue.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }
    const request = parsed.data;

    return this.prisma.$transaction(async (tx) => {
      // (1) Lock the invoice. The per-line and per-invoice bounds below are
      // read-then-write decisions, so without the lock two concurrent credit
      // notes could each pass and together over-credit the invoice.
      const invoice = await this.lockInvoice(tx, clinicId, invoiceId);

      if (NON_CREDITABLE_INVOICE_STATES.has(invoice.status)) {
        throw invalidStateTransition(invoice.status);
      }

      // (2) Load the referenced lines, filtered by BOTH invoice and clinic.
      // This single `where` is the cross-invoice and cross-tenant guard.
      const requestedIds = request.items.map((item) => item.invoiceLineItemId);
      const lineItems = (await tx.invoiceLineItem.findMany({
        where: { id: { in: requestedIds }, invoiceId, clinicId },
        select: {
          id: true,
          description: true,
          hsnSacCode: true,
          quantity: true,
          taxTreatment: true,
          gstRatePercent: true,
          taxableValuePaise: true,
          cgstPaise: true,
          sgstPaise: true,
          igstPaise: true,
          lineTotalPaise: true,
        },
      })) as InvoiceLineItemRow[];

      const byId = new Map(lineItems.map((line) => [line.id, line]));
      const missing = requestedIds.filter((id) => !byId.has(id));
      if (missing.length > 0) throw creditLineNotFound(missing);

      // (3) Per-line bound, cumulative across every credit note already issued
      // against this invoice. Comparing against the raw `lineTotalPaise` alone
      // would let the same line be credited twice whenever the invoice as a
      // whole still had headroom.
      const alreadyCreditedByLine = await this.creditedByLine(tx, clinicId, invoiceId, requestedIds);

      for (const item of request.items) {
        const line = byId.get(item.invoiceLineItemId) as InvoiceLineItemRow;
        const available =
          line.lineTotalPaise - (alreadyCreditedByLine.get(item.invoiceLineItemId) ?? 0);

        if (item.creditAmountPaise > available) {
          throw creditExceedsLineTotal(item.invoiceLineItemId, item.creditAmountPaise, available);
        }
      }

      // (4) Split each tax-inclusive credit back into its taxable and tax
      // components, using the ORIGINAL line's own split as the weights.
      const credited = request.items.map((item) => {
        const line = byId.get(item.invoiceLineItemId) as InvoiceLineItemRow;
        return { item, line, taxableValuePaise: this.taxablePortion(line, item.creditAmountPaise) };
      });

      const taxableLines: TaxableLine[] = credited.map(({ item, line, taxableValuePaise }) => ({
        lineId: item.invoiceLineItemId,
        taxableValuePaise,
        // Frozen at finalize. `Number()` because Prisma hands a Decimal back.
        gstRatePercent: Number(line.gstRatePercent),
        taxTreatment: line.taxTreatment as TaxTreatment,
        hsnSacCode: line.hsnSacCode,
      }));

      // (5) The invoice's OWN snapshot drives the computation — never the
      // clinic row, which may have changed since (T-06-72).
      const tax = computeInvoiceTax(taxableLines, {
        gstEnabled: invoice.gst_enabled_snapshot,
        isInterState: invoice.is_inter_state,
      });

      // (6) Invoice-wide bound, against what this credit note actually comes to
      // rather than what was asked for — the reduced balance is driven by the
      // computed total, so that is the figure that has to fit.
      const existingCreditedPaise = await this.creditedTotal(tx, clinicId, invoiceId);
      const availablePaise = invoice.grand_total_paise - existingCreditedPaise;
      if (tax.grandTotalPaise > availablePaise) {
        throw creditExceedsInvoiceTotal(tax.grandTotalPaise, availablePaise);
      }

      // (7) The number, inside the transaction. A credit note that fails any of
      // the guards above must not burn a CN number — D-19 carries the same
      // gap-free requirement as invoices.
      const now = new Date();
      const creditNoteNumber = await nextDocumentNumber(tx, clinicId, 'CN', now);

      const taxByLine = new Map(tax.lines.map((line) => [line.lineId, line]));

      const lineRows: CreditNoteLineResult[] = credited.map(({ item, line }) => {
        const perLine = taxByLine.get(item.invoiceLineItemId);
        const taxableValuePaise = perLine?.taxableValuePaise ?? 0;
        const cgstPaise = perLine?.cgstPaise ?? 0;
        const sgstPaise = perLine?.sgstPaise ?? 0;
        const igstPaise = perLine?.igstPaise ?? 0;

        return {
          invoiceLineItemId: item.invoiceLineItemId,
          description: line.description,
          hsnSacCode: line.hsnSacCode,
          quantity: this.creditedQuantity(line, item.creditAmountPaise),
          taxTreatment: line.taxTreatment as TaxTreatment,
          gstRatePercent: Number(line.gstRatePercent),
          taxableValuePaise,
          cgstPaise,
          sgstPaise,
          igstPaise,
          // Per-line exact tax, matching the `InvoiceLineItem` convention. The
          // document-level rounding lives on the header, not here.
          totalPaise: taxableValuePaise + cgstPaise + sgstPaise + igstPaise,
        };
      });

      // (8) Insert the document and its lines.
      const creditNote = await tx.creditNote.create({
        data: {
          clinicId,
          invoiceId,
          creditNoteNumber,
          reason: request.reason,
          notes: request.notes ?? null,
          subtotalPaise: tax.taxableValuePaise,
          taxableValuePaise: tax.taxableValuePaise,
          cgstPaise: tax.cgstPaise,
          sgstPaise: tax.sgstPaise,
          igstPaise: tax.igstPaise,
          // Disclosure only. `totalPaise` already carries the rounded heads, so
          // adding this back would apply the same delta twice.
          roundOffPaise: tax.roundOffPaise,
          totalPaise: tax.grandTotalPaise,
          issuedById: actor.userId,
          issuedAt: now,
        },
      });

      await tx.creditNoteLineItem.createMany({
        data: lineRows.map((line) => ({
          clinicId,
          creditNoteId: creditNote.id,
          invoiceLineItemId: line.invoiceLineItemId,
          description: line.description,
          hsnSacCode: line.hsnSacCode,
          quantity: line.quantity,
          taxTreatment: line.taxTreatment,
          gstRatePercent: line.gstRatePercent,
          taxableValuePaise: line.taxableValuePaise,
          cgstPaise: line.cgstPaise,
          sgstPaise: line.sgstPaise,
          igstPaise: line.igstPaise,
          totalPaise: line.totalPaise,
        })),
      });

      // (9) The invoice's own money fields, DERIVED from the rows just written.
      // This is the only write that touches the invoice, it is not made here,
      // and it changes no line item and no total.
      await this.repository.recomputePaymentState(tx, clinicId, invoiceId);

      await writeBillingAuditLog(tx, BillingAuditEvent.CREDIT_NOTE_ISSUED, {
        clinicId,
        userId: actor.userId,
        invoiceId,
        metadata: {
          creditNoteNumber,
          totalPaise: tax.grandTotalPaise,
          invoiceNumber: invoice.invoice_number,
          reason: request.reason,
          documentType: tax.documentType,
          lineCount: lineRows.length,
        },
      });

      return {
        id: creditNote.id,
        creditNoteNumber,
        invoiceId,
        invoiceNumber: invoice.invoice_number,
        reason: request.reason,
        notes: request.notes ?? null,
        subtotalPaise: tax.taxableValuePaise,
        taxableValuePaise: tax.taxableValuePaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        igstPaise: tax.igstPaise,
        roundOffPaise: tax.roundOffPaise,
        totalPaise: tax.grandTotalPaise,
        documentType: tax.documentType,
        issuedAt: now,
        lineItems: lineRows,
      };
    });
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  /** The invoice detail screen's "Linked Credit Notes" section (D-22). */
  async listCreditNotesForInvoice(clinicId: string, invoiceId: string) {
    return this.prisma.creditNote.findMany({
      where: { clinicId, invoiceId },
      include: { lineItems: true },
      orderBy: { issuedAt: 'asc' },
    });
  }

  /** The credit-note detail view and PDF. Clinic-scoped, so another tenant 404s. */
  async getCreditNote(clinicId: string, creditNoteId: string) {
    const creditNote = await this.prisma.creditNote.findFirst({
      where: { id: creditNoteId, clinicId },
      include: {
        lineItems: true,
        invoice: { select: { id: true, invoiceNumber: true, grandTotalPaise: true } },
      },
    });

    if (!creditNote) throw creditNoteNotFound(creditNoteId);
    return creditNote;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * The taxable share of a tax-inclusive credited amount.
   *
   * `allocateProRata` against the original line's own `[taxable, tax]` split.
   * Crediting the whole line returns the taxable value exactly — the weights
   * sum to the total, so truncation leaves no remainder — which is what makes a
   * full-line credit reconcile to the paise with the line it credits.
   *
   * A line with no tax component (exempt, nil-rated, or an unregistered
   * clinic's invoice) short-circuits: the whole credited amount is taxable
   * value, and the engine will charge nothing on it.
   */
  private taxablePortion(line: InvoiceLineItemRow, creditAmountPaise: number): number {
    const taxPaise = line.cgstPaise + line.sgstPaise + line.igstPaise;
    if (taxPaise === 0 || line.lineTotalPaise === 0) return creditAmountPaise;

    const [taxableValuePaise] = allocateProRata(creditAmountPaise, [
      line.taxableValuePaise,
      taxPaise,
    ]);

    return taxableValuePaise;
  }

  /**
   * How many units the credit covers, proportional to the amount credited.
   *
   * A GST credit note for returned goods should state a quantity, and for the
   * common case — returning 2 of 5 dispensed strips — the proportion IS the
   * quantity. A pure price adjustment credits less than one unit's worth, and
   * the floor of 1 keeps the column honest rather than writing a zero-quantity
   * line that reads as "nothing was returned".
   */
  private creditedQuantity(line: InvoiceLineItemRow, creditAmountPaise: number): number {
    if (line.lineTotalPaise <= 0) return line.quantity;
    return Math.max(
      1,
      Math.trunc((line.quantity * creditAmountPaise) / line.lineTotalPaise),
    );
  }

  /** What earlier credit notes have already taken off each of these lines. */
  private async creditedByLine(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
    invoiceLineItemIds: string[],
  ): Promise<Map<string, number>> {
    const rows = await tx.creditNoteLineItem.findMany({
      where: {
        clinicId,
        invoiceLineItemId: { in: invoiceLineItemIds },
        creditNote: { invoiceId, clinicId },
      },
      select: { invoiceLineItemId: true, totalPaise: true },
    });

    const credited = new Map<string, number>();
    for (const row of rows) {
      if (!row.invoiceLineItemId) continue;
      credited.set(
        row.invoiceLineItemId,
        (credited.get(row.invoiceLineItemId) ?? 0) + row.totalPaise,
      );
    }
    return credited;
  }

  /** What earlier credit notes have already taken off the invoice as a whole. */
  private async creditedTotal(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<number> {
    const rows = await tx.creditNote.findMany({
      where: { clinicId, invoiceId },
      select: { totalPaise: true },
    });
    return rows.reduce((sum, row) => sum + row.totalPaise, 0);
  }

  /**
   * Takes the invoice row under a `FOR UPDATE` lock, including its frozen GST
   * snapshot — the columns that decide this credit note's tax.
   */
  private async lockInvoice(
    tx: TenantTransactionClient,
    clinicId: string,
    invoiceId: string,
  ): Promise<LockedInvoiceRow> {
    const rows = await tx.$queryRaw<LockedInvoiceRow[]>(Prisma.sql`
      SELECT id, status, grand_total_paise, balance_paise, exception_flag, invoice_number,
             gst_enabled_snapshot, is_inter_state
      FROM invoices
      WHERE id = ${invoiceId}::uuid
        AND clinic_id = ${clinicId}::uuid
      FOR UPDATE
    `);

    const row = rows[0];
    if (!row) throw invoiceNotFound(invoiceId);
    return row;
  }
}
