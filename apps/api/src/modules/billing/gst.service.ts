/**
 * The Phase 6 GST engine (BIL-07).
 *
 * All amounts are integer paise. There are no floats anywhere on this path: a
 * float cannot hold a rupee amount exactly, and a tax figure that drifts is a
 * figure that will not reconcile with the return filed against it.
 *
 * Rounding is applied **once per tax head, at invoice level**, to the nearest
 * whole rupee, per CGST Act Section 170 and Rule 51. Per-line rounding is
 * forbidden: it accumulates a rounding error per line and produces an invoice
 * whose heads do not reconcile with GSTR-1.
 *
 * Two figures come out of that rounding and they must not be confused:
 *
 *   * `grandTotalPaise` = `taxableValue + cgst + sgst + igst`, using the
 *     **rounded** heads. This is the sum of the numbers actually printed on the
 *     document, so an owner adding the lines up by hand gets the stated total.
 *   * `roundOffPaise` = `Σ (rounded − exact)` per head. This is a **disclosure
 *     field**, persisted for GSTR-1 reconciliation against the exact
 *     pre-rounding figures. It is NOT a component of the grand total: the heads
 *     are already rounded, so adding it back in would apply the same delta
 *     twice and produce a total nobody can reproduce from the printed lines.
 *
 * Every function here is pure — no database handle appears in any signature, no
 * I/O is performed, no input is mutated, and the same arguments always produce
 * the same result. That is deliberate: this is the one module in the codebase
 * whose output is a legal assertion about tax collected, so it has to be
 * exhaustively testable without a database and auditable by reading it.
 *
 * The rate slabs, the tax treatments and the document types all live in
 * `@breeyo/types` and are imported, never re-declared here. A GST Council
 * notification must remain a one-line change in one file.
 */

import { GST_RATE_SLABS, PAISE_PER_RUPEE } from '@breeyo/types';
import type {
  InvoiceDocumentType,
  TaxBreakdown,
  TaxTreatment,
} from '@breeyo/types';
import { allocateProRata } from './money.js';

/**
 * Percentages are per hundred. This is a different quantity from
 * {@link PAISE_PER_RUPEE} that happens to share its magnitude, so it gets its
 * own name rather than borrowing that constant.
 */
const PERCENT_BASIS = 100;

/** One invoice line, as it enters the tax computation. */
export interface TaxableLine {
  lineId: string;
  /** After the line discount AND the pro-rata invoice-level discount. */
  taxableValuePaise: number;
  /** The rate applied. Validated against the current slabs. */
  gstRatePercent: number;
  taxTreatment: TaxTreatment;
  hsnSacCode: string | null;
}

/** The per-line tax, echoed with its taxable value so a caller can persist it. */
export interface PerLineTax {
  lineId: string;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/** A line carrying its share of the invoice-level discount. */
export type DiscountedLine<T> = T & { allocatedInvoiceDiscountPaise: number };

export interface InvoiceTaxResult extends TaxBreakdown {
  lines: PerLineTax[];
}

/** Section 170 / Rule 51: nearest rupee. `Math.round` is half-up for positives. */
const roundToNearestRupeePaise = (paise: number): number =>
  Math.round(paise / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;

const sumTaxableValue = (lines: readonly { taxableValuePaise: number }[]): number =>
  lines.reduce((acc, line) => acc + line.taxableValuePaise, 0);

/**
 * Pro-rates an invoice-level discount (D-07) across **all** lines by taxable
 * value, returning each line with its `allocatedInvoiceDiscountPaise` and its
 * post-discount `taxableValuePaise`.
 *
 * This must run BEFORE {@link computeInvoiceTax}, never as a subtraction from
 * the grand total afterwards. Under Section 15(3)(a) a discount known at the
 * time of supply reduces the taxable value itself, so tax is charged on the
 * discounted amount. Subtracting it from the total instead overstates the tax
 * and leaves `Σ line.taxableValue ≠ invoice.taxableValue`.
 *
 * Exempt lines participate in the allocation — D-07 promised the owner a
 * discount on the whole invoice, and an exempt consultation is usually the
 * largest line on a vet invoice — but they still contribute nothing to the tax
 * base, because {@link computeInvoiceTax} keys off `taxTreatment`, not off the
 * discount.
 *
 * `allocateProRata` guarantees the shares sum to exactly the discount, so the
 * post-discount line values still sum to exactly the invoice taxable value.
 *
 * @throws if the discount is negative, fractional, or larger than the invoice
 *   taxable value. A 100% discount is permitted (D-40 sets no approval
 *   threshold); a discount larger than the invoice is a caller bug that would
 *   otherwise push a line taxable value negative.
 */
export function allocateInvoiceDiscount<T extends { taxableValuePaise: number }>(
  lines: readonly T[],
  invoiceDiscountPaise: number,
): DiscountedLine<T>[] {
  if (!Number.isInteger(invoiceDiscountPaise) || invoiceDiscountPaise < 0) {
    throw new Error(
      `Invalid invoice discount: ${invoiceDiscountPaise} — must be a non-negative whole number of paise`,
    );
  }

  const totalTaxablePaise = sumTaxableValue(lines);

  if (invoiceDiscountPaise > totalTaxablePaise) {
    throw new Error(
      `Invoice discount of ${invoiceDiscountPaise} paise exceeds the invoice taxable value of ${totalTaxablePaise} paise`,
    );
  }

  const allocations = allocateProRata(
    invoiceDiscountPaise,
    lines.map((line) => line.taxableValuePaise),
  );

  return lines.map((line, index) => ({
    ...line,
    allocatedInvoiceDiscountPaise: allocations[index],
    taxableValuePaise: line.taxableValuePaise - allocations[index],
  }));
}

/**
 * Computes the GST on an invoice: per line, exempt-aware, split CGST/SGST
 * intra-state or IGST inter-state, rounded once per head at invoice level, and
 * typed per CGST Rule 46A.
 *
 * Order of operations matters and is fixed:
 *
 *  1. An unregistered clinic (`gstEnabled: false`) — or an invoice with no lines
 *     — returns zero tax and a plain `invoice`, before any rate is even read.
 *     An unregistered clinic printing a GST line is a Section 122 offence, so
 *     that outcome must not depend on the catalog holding sane rate data.
 *  2. Every rate is validated against the current slabs.
 *  3. Tax is computed per line, in exact paise, with no intermediate rounding.
 *  4. The heads are summed across lines.
 *  5. Each head is rounded once, here, to the nearest rupee.
 *  6. `roundOffPaise` records the rounding deltas for disclosure only.
 *  7. The document type follows from the exempt/taxable mix.
 *  8. The grand total sums the taxable value and the rounded heads — the
 *     figures printed on the document — and does not re-apply the round-off.
 *
 * @throws if any line carries a rate that is not a current GST slab.
 */
export function computeInvoiceTax(
  lines: readonly TaxableLine[],
  opts: { gstEnabled: boolean; isInterState: boolean },
): InvoiceTaxResult {
  const taxableValuePaise = sumTaxableValue(lines);

  // (1) Unregistered clinic, or an invoice with nothing on it.
  if (!opts.gstEnabled || lines.length === 0) {
    return {
      lines: lines.map((line) => ({
        lineId: line.lineId,
        taxableValuePaise: line.taxableValuePaise,
        cgstPaise: 0,
        sgstPaise: 0,
        igstPaise: 0,
      })),
      taxableValuePaise,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      roundOffPaise: 0,
      grandTotalPaise: taxableValuePaise,
      documentType: 'invoice',
    };
  }

  // (2) A rate outside the slab table means stale catalog data. Refusing is the
  // only safe response: guessing would invent a tax liability.
  for (const line of lines) {
    if (!GST_RATE_SLABS.includes(line.gstRatePercent)) {
      throw new Error(
        `Invalid GST rate on line ${line.lineId}: ${line.gstRatePercent}% is not a current GST slab (permitted: ${GST_RATE_SLABS.join(', ')})`,
      );
    }
  }

  // (3) Exact paise per line, no intermediate rounding.
  const perLine: PerLineTax[] = lines.map((line) => {
    const base = {
      lineId: line.lineId,
      taxableValuePaise: line.taxableValuePaise,
    };

    // An exempt veterinary supply carries no tax regardless of the clinic's
    // configured rate (Notification 12/2017-CT(R) Entry 46).
    if (line.taxTreatment !== 'taxable' || line.gstRatePercent === 0) {
      return { ...base, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    }

    const totalTaxPaise = Math.round(
      (line.taxableValuePaise * line.gstRatePercent) / PERCENT_BASIS,
    );

    if (opts.isInterState) {
      return { ...base, cgstPaise: 0, sgstPaise: 0, igstPaise: totalTaxPaise };
    }

    // The two heads must sum to exactly the total; the odd paise goes to CGST
    // by convention, which keeps the split deterministic and reproducible.
    const half = Math.floor(totalTaxPaise / 2);
    return {
      ...base,
      cgstPaise: totalTaxPaise - half,
      sgstPaise: half,
      igstPaise: 0,
    };
  });

  // (4) Exact totals per head.
  const cgstExactPaise = perLine.reduce((acc, line) => acc + line.cgstPaise, 0);
  const sgstExactPaise = perLine.reduce((acc, line) => acc + line.sgstPaise, 0);
  const igstExactPaise = perLine.reduce((acc, line) => acc + line.igstPaise, 0);

  // (5) Rounded once, here, and nowhere else.
  const cgstPaise = roundToNearestRupeePaise(cgstExactPaise);
  const sgstPaise = roundToNearestRupeePaise(sgstExactPaise);
  const igstPaise = roundToNearestRupeePaise(igstExactPaise);

  // (6) The delta the rounding introduced, disclosed so the invoice can be
  // reconciled back to the exact pre-rounding figures during GSTR-1 filing.
  // It is not part of the grand total — see step (8).
  const roundOffPaise =
    cgstPaise -
    cgstExactPaise +
    (sgstPaise - sgstExactPaise) +
    (igstPaise - igstExactPaise);

  // (7) CGST Rule 46A. A typical vet invoice — exempt consultation plus taxable
  // dispensed medicine — is the mixed case the combined document exists for.
  const hasTaxable = lines.some((line) => line.taxTreatment === 'taxable');
  const hasExempt = lines.some((line) => line.taxTreatment !== 'taxable');

  const documentType: InvoiceDocumentType =
    hasTaxable && hasExempt
      ? 'invoice_cum_bill_of_supply'
      : hasTaxable
        ? 'tax_invoice'
        : 'bill_of_supply';

  // (8) The grand total is the sum of the figures actually PRINTED on the
  // document: the taxable value plus the rounded heads. `roundOffPaise` is
  // deliberately NOT added here — the heads have already been rounded, so
  // adding the delta again would apply it twice and produce a total that a vet
  // or an owner adding up the printed lines by hand could not reproduce.
  const grandTotalPaise =
    taxableValuePaise + cgstPaise + sgstPaise + igstPaise;

  return {
    lines: perLine,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    roundOffPaise,
    grandTotalPaise,
    documentType,
  };
}
