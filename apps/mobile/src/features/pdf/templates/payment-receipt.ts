import type {
  ClinicInvoiceHeader,
  InvoiceDetail,
  PaymentMethod,
  PaymentReceipt,
} from '@breeyo/types';
import { formatPaiseINR } from '../../billing/lib/format';

/**
 * D-13: the payment receipt, a document distinct from the invoice.
 *
 * ## Why the client renders this and the webhook does not
 *
 * D-13 reads "after payment confirmation (webhook), system generates payment
 * receipt". The server generates the *record* — number, amount, method,
 * transaction reference, timestamp — inside the payment transaction; this
 * template renders it on demand when someone taps View Receipt. That keeps one
 * PDF engine in the product (06-RESEARCH.md `## PDF Generation: Engine
 * Decision`) and avoids rendering documents nobody opens.
 *
 * ## 80mm
 *
 * A front desk hands this to the owner off a thermal printer, so the page is
 * declared at 80mm. The `body { width: 80mm }` fallback means an A4 printer
 * produces a narrow but perfectly readable slip rather than a stretched one —
 * a receipt is a compact document either way (UI-SPEC `## PDF Templates`).
 *
 * A receipt carries no GST assertion: it acknowledges money received, not a
 * supply. There is deliberately no tax block and no GSTIN here — the tax
 * document is the invoice this receipt references.
 */
export function buildPaymentReceiptHtml(
  clinic: ClinicInvoiceHeader,
  receipt: PaymentReceipt,
  invoice: InvoiceDetail,
  options?: { logoBase64?: string },
): string {
  const issued = formatDateTimeIST(receipt.issuedAt);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.4; width: 80mm; margin: 0 auto; padding: 8px; }
    .header { text-align: center; border-bottom: 2px solid #2E7D32; padding-bottom: 8px; margin-bottom: 8px; }
    .header img { max-width: 40px; max-height: 40px; margin-bottom: 4px; }
    .clinic-name { font-size: 14px; font-weight: 700; color: #2E7D32; }
    .clinic-info { font-size: 9px; color: #666; }
    .doc-heading { text-align: center; font-size: 12px; font-weight: 700; color: #2E7D32; letter-spacing: 0.5px; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; border-bottom: 1px dashed #eee; }
    .row .label { color: #666; }
    .row .value { color: #333; text-align: right; font-weight: 500; }
    .amount { text-align: center; margin: 10px 0; padding: 8px 0; border-top: 1px solid #2E7D32; border-bottom: 1px solid #2E7D32; }
    .amount-label { font-size: 9px; color: #666; text-transform: uppercase; }
    .amount-value { font-size: 18px; font-weight: 700; color: #2E7D32; }
    .footer { margin-top: 10px; text-align: center; font-size: 9px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${escapeHtml(options.logoBase64)}" alt="" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
  </div>

  <div class="doc-heading">PAYMENT RECEIPT</div>

  <div class="row">
    <span class="label">Receipt No.</span>
    <span class="value">${escapeHtml(receipt.receiptNumber)}</span>
  </div>
  <div class="row">
    <span class="label">Date</span>
    <span class="value">${issued}</span>
  </div>
  <div class="row">
    <span class="label">Invoice</span>
    <span class="value">${escapeHtml(invoice.invoiceNumber ?? '—')}</span>
  </div>
  ${invoice.owner ? `
  <div class="row">
    <span class="label">Received From</span>
    <span class="value">${escapeHtml(invoice.owner.name)}</span>
  </div>
  ` : ''}
  ${invoice.pet ? `
  <div class="row">
    <span class="label">Patient</span>
    <span class="value">${escapeHtml(invoice.pet.name)}</span>
  </div>
  ` : ''}
  <div class="row">
    <span class="label">Method</span>
    <span class="value">${PAYMENT_METHOD_LABELS[receipt.method] ?? escapeHtml(String(receipt.method).toUpperCase())}</span>
  </div>
  ${receipt.transactionRef ? `
  <div class="row">
    <span class="label">Transaction Ref</span>
    <span class="value">${escapeHtml(receipt.transactionRef)}</span>
  </div>
  ` : ''}

  <div class="amount">
    <div class="amount-label">Amount Received</div>
    <div class="amount-value">${formatPaiseINR(receipt.amountPaise)}</div>
  </div>

  ${invoice.balancePaise > 0 ? `
  <div class="row">
    <span class="label">Balance Due</span>
    <span class="value">${formatPaiseINR(invoice.balancePaise)}</span>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for choosing ${escapeHtml(clinic.name)}.</p>
    <p>This is a computer-generated receipt.</p>
  </div>
</body>
</html>`;
}

/**
 * The same uppercase vocabulary the app shows on a payment row
 * (06-UI-SPEC.md's Overline row: `CASH`, `UPI`, `CARD`).
 */
const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: 'CASH',
  upi: 'UPI',
  card: 'CARD',
};

/** `13 August 2026, 15:45` in IST — see the note in `invoice.ts`. */
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

function formatDateTimeIST(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const hours = String(ist.getUTCHours()).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');

  return `${day} ${MONTH_NAMES[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${hours}:${minutes}`;
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
