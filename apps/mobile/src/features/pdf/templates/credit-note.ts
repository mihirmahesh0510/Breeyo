import type {
  ClinicInvoiceHeader,
  CreditNote,
  CreditNoteLineItem,
  CreditNoteReason,
  InvoiceDetail,
} from '@breeyo/types';
import { CREDIT_NOTE_REASONS, CREDIT_NOTE_REASON_LABELS } from '@breeyo/types';
import { formatPaiseINR } from '../../billing/lib/format';

/** The credit note as `GET /billing/credit-notes/:id` returns it. */
export interface CreditNoteDocument extends CreditNote {
  lineItems: CreditNoteLineItem[];
}

/**
 * D-19 / D-22: the credit note document.
 *
 * ## Positive figures under a CREDIT NOTE heading
 *
 * `CreditNote`'s amounts are positive by design — it reduces the referenced
 * invoice's balance *by reference*, and it is not a negative-amount invoice.
 * The document follows suit: `-₹500.00` printed under a heading that already
 * says CREDIT NOTE is a double negative, and the one thing a printed financial
 * document must not be is ambiguous about direction. The balance effect is
 * therefore stated in words instead of encoded in a minus sign.
 *
 * ## Tax gating comes from the original invoice, not from this record
 *
 * `CreditNote` carries tax heads but no `gstEnabledSnapshot` and no
 * `isInterState` — those live on the invoice whose supply is being reversed. A
 * credit note against an unregistered clinic's invoice must show no tax
 * artefact for exactly the Section 122 reason the invoice must not (Finding G3),
 * so the gate is read off `originalInvoice`.
 */
export function buildCreditNoteHtml(
  clinic: ClinicInvoiceHeader,
  creditNote: CreditNoteDocument,
  originalInvoice: InvoiceDetail,
  options?: { logoBase64?: string },
): string {
  const gstEnabled = originalInvoice.gstEnabledSnapshot;
  const gstin = originalInvoice.clinicGstinSnapshot ?? clinic.gstin;

  const issueDate = formatLongDateIST(creditNote.issuedAt);

  const showCgstSgst =
    gstEnabled &&
    !originalInvoice.isInterState &&
    creditNote.cgstPaise + creditNote.sgstPaise > 0;
  const showIgst = gstEnabled && originalInvoice.isInterState && creditNote.igstPaise > 0;

  const lineRows = creditNote.lineItems
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        ${gstEnabled ? `<td>${escapeHtml(line.hsnSacCode ?? '—')}</td>` : ''}
        <td class="num">${line.quantity}</td>
        <td class="num">${formatPaiseINR(line.totalPaise)}</td>
      </tr>
    `,
    )
    .join('');

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
    .doc-heading { text-align: center; font-size: 16px; font-weight: 700; color: #2E7D32; letter-spacing: 0.5px; }
    .doc-reference { text-align: center; font-size: 12px; color: #666; margin-bottom: 12px; }
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
    .effect { margin-top: 12px; padding: 10px; background: #E8F5E9; border-radius: 8px; font-size: 12px; color: #1B5E20; }
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

  <div class="doc-heading">CREDIT NOTE</div>
  <div class="doc-reference">For Invoice #${escapeHtml(originalInvoice.invoiceNumber ?? '—')}</div>

  <div class="section">
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Credit Note No.</div>
        <div class="info-value">${escapeHtml(creditNote.creditNoteNumber)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Date of Issue</div>
        <div class="info-value">${issueDate}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Reason</div>
        <div class="info-value">${escapeHtml(creditNoteReasonLabel(creditNote.reason))}</div>
      </div>
      ${gstEnabled && originalInvoice.placeOfSupplyStateCode ? `
      <div class="info-item">
        <div class="info-label">Place of Supply</div>
        <div class="info-value">State code ${escapeHtml(originalInvoice.placeOfSupplyStateCode)}</div>
      </div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Issued To</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Owner</div>
        <div class="info-value">${escapeHtml(originalInvoice.owner?.name ?? 'Counter Sale')}</div>
      </div>
      ${originalInvoice.owner?.mobile ? `
      <div class="info-item">
        <div class="info-label">Phone</div>
        <div class="info-value">${escapeHtml(originalInvoice.owner.mobile)}</div>
      </div>
      ` : ''}
      ${originalInvoice.pet ? `
      <div class="info-item">
        <div class="info-label">Patient</div>
        <div class="info-value">${escapeHtml(originalInvoice.pet.name)} (${escapeHtml(originalInvoice.pet.species)})</div>
      </div>
      ` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Items Credited</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          ${gstEnabled ? '<th style="width: 80px;">HSN/SAC</th>' : ''}
          <th class="num" style="width: 50px;">Qty</th>
          <th class="num" style="width: 110px;">Credited</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        ${gstEnabled ? `
        <tr>
          <td>Taxable Value</td>
          <td class="num">${formatPaiseINR(creditNote.taxableValuePaise)}</td>
        </tr>
        ` : ''}
        ${showCgstSgst ? `
        <tr>
          <td>CGST</td>
          <td class="num">${formatPaiseINR(creditNote.cgstPaise)}</td>
        </tr>
        <tr>
          <td>SGST</td>
          <td class="num">${formatPaiseINR(creditNote.sgstPaise)}</td>
        </tr>
        ` : ''}
        ${showIgst ? `
        <tr>
          <td>IGST</td>
          <td class="num">${formatPaiseINR(creditNote.igstPaise)}</td>
        </tr>
        ` : ''}
        <tr class="grand">
          <td>Credit Total</td>
          <td class="num">${formatPaiseINR(creditNote.totalPaise)}</td>
        </tr>
        ${creditNote.roundOffPaise !== 0 ? `
        <tr class="disclosure">
          <td>Round Off (statutory disclosure, not part of the total above)</td>
          <td class="num">${formatPaiseINR(creditNote.roundOffPaise)}</td>
        </tr>
        ` : ''}
      </tbody>
    </table>

    <div class="effect">
      This credit of ${formatPaiseINR(creditNote.totalPaise)} reduces the outstanding balance on
      Invoice #${escapeHtml(originalInvoice.invoiceNumber ?? '—')}. Amounts shown are
      the sums credited; no payment is made against this document.
    </div>
  </div>

  ${creditNote.notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <p style="font-size: 12px; white-space: pre-wrap;">${escapeHtml(creditNote.notes)}</p>
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
 * The human label for a stored reason literal.
 *
 * Derived from `CREDIT_NOTE_REASONS` rather than a local list so the five
 * options cannot drift from the validator's. The membership check is not
 * ceremony: `reason` arrives over the wire, and if the API grows a sixth
 * literal before the app ships an update, a bare lookup renders the string
 * `undefined` onto a financial document.
 */
function creditNoteReasonLabel(reason: CreditNoteReason): string {
  return CREDIT_NOTE_REASONS.includes(reason)
    ? CREDIT_NOTE_REASON_LABELS[reason]
    : CREDIT_NOTE_REASON_LABELS.other;
}

/** `14 August 2026` in IST — see the note in `invoice.ts`. */
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

function formatLongDateIST(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTH_NAMES[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** Copied verbatim into each template file, per the shipped Phase 4 pattern. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
