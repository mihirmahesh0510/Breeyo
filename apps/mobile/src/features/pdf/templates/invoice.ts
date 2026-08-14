import type {
  ClinicInvoiceHeader,
  InvoiceDetail,
  InvoiceDocumentType,
  InvoiceLineItem,
} from '@breeyo/types';
import { B2C_ADDRESS_REQUIRED_ABOVE_PAISE } from '@breeyo/types';
import { formatPaiseINR, invoiceStatusLabel } from '../../billing/lib/format';

/**
 * BIL-04: the CGST Rule 46 compliant invoice document (D-14).
 *
 * ## This template renders the record; it does not re-derive it
 *
 * The heading, the tax heads, the taxable value and the grand total are all
 * read straight off `invoice`. The finalize transaction froze every one of them
 * (06-05), and a filed GSTR-1 was reconciled against those exact figures. A
 * template that recomputed anything would produce a document that can silently
 * disagree with the record it purports to represent (T-06-101) — including
 * after a Council notification changes the slabs under a historical invoice.
 *
 * ## Rule 46A: the heading is not decoration
 *
 * | Clinic GST-registered? | Lines             | Heading                      |
 * |------------------------|-------------------|------------------------------|
 * | No                     | anything          | `INVOICE`                    |
 * | Yes                    | only exempt       | `BILL OF SUPPLY`             |
 * | Yes                    | only taxable      | `TAX INVOICE`                |
 * | Yes                    | mixed             | `INVOICE-CUM-BILL OF SUPPLY` |
 *
 * The typical vet invoice — exempt consultation plus taxable dispensed
 * medicine — is exactly the Rule 46A mixed case.
 *
 * ## Section 122: the tax presentation is gated, wholesale
 *
 * Most solo vets are below the ₹20 lakh registration threshold (Finding G3).
 * Printing `GSTIN` or a `CGST` row for one of them is collecting tax without
 * registration — an offence carrying a penalty up to ₹25,000 or 100% of the
 * tax. Everything tax-shaped in this file therefore hangs off one flag,
 * `invoice.gstEnabledSnapshot`, and there is no second path to a tax row.
 *
 * ## Money
 *
 * Every money cell goes through {@link formatPaiseINR}, which throws on a
 * non-integer. No division and no fixed-point rounding happens in this file:
 * a 100x error on a printed financial document is invisible to review and
 * entirely plausible to the person collecting the cash (T-06-100).
 *
 * `roundOffPaise` is a Section 170 / Rule 51 **disclosure** figure — the tax
 * heads are already rounded, so it is not a component of `grandTotalPaise`. It
 * is rendered *below* the grand total, under its own caption, precisely so
 * that an owner adding the column up by hand cannot double-count it.
 */
export function buildInvoiceHtml(
  clinic: ClinicInvoiceHeader,
  invoice: InvoiceDetail,
  options?: { logoBase64?: string; ownerAddress?: string },
): string {
  const gstEnabled = invoice.gstEnabledSnapshot;

  const issueDate = formatLongDateIST(invoice.finalizedAt ?? invoice.createdAt);
  const dueDate = invoice.dueDate ? formatLongDateIST(invoice.dueDate) : null;

  // Rule 46 names the supplier's GSTIN as at issue, so the frozen snapshot wins
  // over the clinic's current registration; the fallback only matters for an
  // unfinalized draft preview, which has no snapshot yet.
  const gstin = invoice.clinicGstinSnapshot ?? clinic.gstin;

  const totalDiscountPaise = invoice.lineDiscountPaise + invoice.invoiceDiscountPaise;

  // A registered all-exempt invoice charged nothing; rendering `CGST ₹0.00`
  // would assert a tax that was not collected.
  const showCgstSgst = gstEnabled && !invoice.isInterState && invoice.cgstPaise + invoice.sgstPaise > 0;
  const showIgst = gstEnabled && invoice.isInterState && invoice.igstPaise > 0;

  // Finding G5: above ₹50,000 to an unregistered recipient, name and address
  // become mandatory. Missing it is rendered as a visible gap rather than
  // silently omitted — a compliance defect nobody can see is one nobody fixes.
  const addressMandatory = invoice.grandTotalPaise > B2C_ADDRESS_REQUIRED_ABOVE_PAISE;
  const ownerAddress = options?.ownerAddress?.trim() || null;

  const lineRows = invoice.lineItems.map((line) => renderLineRow(line, gstEnabled)).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.5; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #2E7D32; padding-bottom: 16px; margin-bottom: 16px; }
    .header img { max-width: 60px; max-height: 60px; margin-bottom: 8px; }
    .clinic-name { font-size: 20px; font-weight: 700; color: #2E7D32; }
    .clinic-info { font-size: 12px; color: #666; margin-top: 4px; }
    .doc-heading { text-align: center; font-size: 16px; font-weight: 700; color: #2E7D32; letter-spacing: 0.5px; margin-bottom: 12px; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 14px; font-weight: 600; color: #2E7D32; border-bottom: 1px solid #E8F5E9; padding-bottom: 4px; margin-bottom: 8px; }
    .info-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .info-item { flex: 1; min-width: 45%; }
    .info-label { font-size: 11px; color: #999; text-transform: uppercase; }
    .info-value { font-size: 13px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background-color: #E8F5E9; padding: 8px; text-align: left; font-size: 12px; font-weight: 600; color: #2E7D32; }
    td { font-size: 12px; padding: 8px; border-bottom: 1px solid #eee; }
    .num { text-align: right; }
    .totals { width: 60%; margin-left: auto; margin-top: 12px; }
    .totals td { font-size: 12px; padding: 4px 8px; border-bottom: none; }
    .totals .grand td { font-size: 14px; font-weight: 700; color: #2E7D32; border-top: 2px solid #2E7D32; padding-top: 8px; }
    .totals .disclosure td { font-size: 10px; color: #999; }
    .status { display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 4px; background: #E8F5E9; color: #1B5E20; }
    .notice { font-size: 11px; color: #E65100; margin-top: 4px; }
    .signature { margin-top: 32px; text-align: right; }
    .signature-line { display: inline-block; width: 200px; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; color: #666; text-align: center; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${escapeHtml(options.logoBase64)}" alt="" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
    ${gstEnabled && gstin ? `<div class="clinic-info">GSTIN: ${escapeHtml(gstin)}</div>` : ''}
  </div>

  <div class="doc-heading">${DOCUMENT_HEADINGS[invoice.documentType ?? 'invoice']}</div>

  <div class="section">
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Number</div>
        <div class="info-value">${escapeHtml(invoice.invoiceNumber ?? 'DRAFT')}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Date of Issue</div>
        <div class="info-value">${issueDate}</div>
      </div>
      ${dueDate ? `
      <div class="info-item">
        <div class="info-label">Due Date</div>
        <div class="info-value">${dueDate}</div>
      </div>
      ` : ''}
      ${gstEnabled && invoice.placeOfSupplyStateCode ? `
      <div class="info-item">
        <div class="info-label">Place of Supply</div>
        <div class="info-value">State code ${escapeHtml(invoice.placeOfSupplyStateCode)}</div>
      </div>
      ` : ''}
      <div class="info-item">
        <div class="info-label">Status</div>
        <div class="info-value"><span class="status">${escapeHtml(invoiceStatusLabel(invoice.status))}</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Billed To</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Owner</div>
        <div class="info-value">${escapeHtml(invoice.owner?.name ?? 'Counter Sale')}</div>
      </div>
      ${invoice.owner?.mobile ? `
      <div class="info-item">
        <div class="info-label">Phone</div>
        <div class="info-value">${escapeHtml(invoice.owner.mobile)}</div>
      </div>
      ` : ''}
      ${invoice.pet ? `
      <div class="info-item">
        <div class="info-label">Patient</div>
        <div class="info-value">${escapeHtml(invoice.pet.name)} (${escapeHtml(invoice.pet.species)})</div>
      </div>
      ` : ''}
      ${ownerAddress ? `
      <div class="info-item">
        <div class="info-label">Address</div>
        <div class="info-value">${escapeHtml(ownerAddress)}</div>
      </div>
      ` : ''}
    </div>
    ${addressMandatory && !ownerAddress ? `
    <div class="notice">Recipient address required for supplies above ${formatPaiseINR(B2C_ADDRESS_REQUIRED_ABOVE_PAISE)} — not on file.</div>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">Items</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          ${gstEnabled ? '<th style="width: 80px;">HSN/SAC</th>' : ''}
          <th class="num" style="width: 50px;">Qty</th>
          <th class="num" style="width: 90px;">Rate</th>
          <th class="num" style="width: 100px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr>
          <td>Subtotal</td>
          <td class="num">${formatPaiseINR(invoice.subtotalPaise)}</td>
        </tr>
        ${totalDiscountPaise > 0 ? `
        <tr>
          <td>Discount</td>
          <td class="num">-${formatPaiseINR(totalDiscountPaise)}</td>
        </tr>
        ` : ''}
        ${gstEnabled ? `
        <tr>
          <td>Taxable Value</td>
          <td class="num">${formatPaiseINR(invoice.taxableValuePaise)}</td>
        </tr>
        ` : ''}
        ${showCgstSgst ? `
        <tr>
          <td>CGST</td>
          <td class="num">${formatPaiseINR(invoice.cgstPaise)}</td>
        </tr>
        <tr>
          <td>SGST</td>
          <td class="num">${formatPaiseINR(invoice.sgstPaise)}</td>
        </tr>
        ` : ''}
        ${showIgst ? `
        <tr>
          <td>IGST</td>
          <td class="num">${formatPaiseINR(invoice.igstPaise)}</td>
        </tr>
        ` : ''}
        <tr class="grand">
          <td>Grand Total</td>
          <td class="num">${formatPaiseINR(invoice.grandTotalPaise)}</td>
        </tr>
        ${invoice.roundOffPaise !== 0 ? `
        <tr class="disclosure">
          <td>Round Off (statutory disclosure, not part of the total above)</td>
          <td class="num">${formatPaiseINR(invoice.roundOffPaise)}</td>
        </tr>
        ` : ''}
      </tbody>
    </table>
  </div>

  ${invoice.notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <p style="font-size: 12px; white-space: pre-wrap;">${escapeHtml(invoice.notes)}</p>
  </div>
  ` : ''}

  ${clinic.bankDetails ? `
  <div class="section">
    <div class="section-title">Bank Details</div>
    <p style="font-size: 12px; white-space: pre-wrap;">${escapeHtml(clinic.bankDetails)}</p>
  </div>
  ` : ''}

  <div class="signature">
    <div class="signature-line">
      For ${escapeHtml(clinic.name)}<br/>Authorised Signatory
    </div>
  </div>

  <div class="footer">
    ${clinic.invoiceFooterText ? `<p>${escapeHtml(clinic.invoiceFooterText)}</p>` : ''}
    <p>This is a computer-generated document.</p>
  </div>
</body>
</html>`;
}

/**
 * CGST Rule 46A headings. Keyed by the value the finalize transaction froze
 * onto the invoice, so the heading and the record cannot diverge (T-06-099).
 */
const DOCUMENT_HEADINGS: Readonly<Record<InvoiceDocumentType, string>> = {
  invoice: 'INVOICE',
  tax_invoice: 'TAX INVOICE',
  bill_of_supply: 'BILL OF SUPPLY',
  invoice_cum_bill_of_supply: 'INVOICE-CUM-BILL OF SUPPLY',
};

function renderLineRow(line: InvoiceLineItem, gstEnabled: boolean): string {
  return `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        ${gstEnabled ? `<td>${escapeHtml(line.hsnSacCode ?? '—')}</td>` : ''}
        <td class="num">${line.quantity}</td>
        <td class="num">${formatPaiseINR(line.unitPricePaise)}</td>
        <td class="num">${formatPaiseINR(line.lineTotalPaise)}</td>
      </tr>
    `;
}

/**
 * `13 August 2026` — en-IN long form, rendered in IST without `Intl`.
 *
 * Two reasons this is hand-rolled rather than `toLocaleDateString('en-IN', …)`,
 * which is what the Phase 4 templates use:
 *
 *  1. **Hermes.** `apps/mobile/src/features/billing/lib/format.ts` documents
 *     that Hermes ships a cut-down ICU and returns a different string on device
 *     than Node does under test, so an assertion on a locale-formatted date is
 *     a test that passes in CI and is wrong in the user's hand.
 *  2. **IST.** The date on a GST document is the Indian calendar date of issue.
 *     A device-local render would print the previous day for any invoice
 *     finalized after 18:30 UTC when the reader's clock is west of Greenwich.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatLongDateIST(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTH_NAMES[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/**
 * Copied verbatim into each template file, matching the shipped Phase 4
 * pattern. Every interpolated string in this document passes through it: a pet
 * name is free text a stranger typed at the front desk, and an unescaped one
 * can close the table it sits in and rewrite the rest of the invoice (T-06-96).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
