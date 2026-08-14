/**
 * The billing display layer's only money formatter.
 *
 * ## Every money value crossing the API boundary is an integer number of paise
 *
 * D-31: Phase 6's own tables, its tax engine and its wire format all carry
 * integer paise. A rupee float never appears on a billing path — `0.07 * 100`
 * is `7.000000000000001`, and a chain of those is the difference between an
 * invoice that reconciles and one that does not.
 *
 * This module is the single place a paise integer becomes a display string. No
 * other file under `features/billing` may do the paise-to-rupee conversion
 * itself; a phase-level grep gate enforces that on the card components, and the
 * reason is that an ad-hoc conversion at a call site is invisible in review and
 * misstates money to the person collecting it. (The gate matches on literal
 * tokens, so this note deliberately names none of them — a gate that trips on
 * the comment explaining it is worse than no gate.)
 *
 * ## Why a non-integer input throws instead of being coerced
 *
 * A rupee float reaching {@link formatPaiseINR} means a boundary was crossed
 * without conversion. Coercing it would render `₹12.34` for `₹1,234.35` — a
 * 100x understatement that looks entirely plausible on screen and is caught by
 * nobody. Failing loudly turns a silent financial misstatement into a crash on
 * a screen that is trivially reproducible.
 *
 * ## Parity with the server
 *
 * `apps/api/src/modules/billing/money.ts` exports a `formatPaiseINR` with the
 * same name and the same `Intl` options. The two cannot share code (the API
 * module imports `@prisma/client`), so `__tests__/format.test.ts` pins seven
 * inputs to the server's exact output strings. Change the options here and that
 * table fails.
 */

import type { InvoiceStatus } from '@breeyo/types';

/** Paise per rupee. Local copy so this module has no runtime dependency. */
const PAISE_PER_RUPEE = 100;

/**
 * Cached at module scope: constructing an `Intl.NumberFormat` is the expensive
 * part of formatting, and the invoice list formats one amount per row. The
 * instance is immutable and therefore safe to share.
 *
 * `en-IN` is what produces lakh/crore grouping (`₹10,00,000.00`) rather than
 * thousands grouping (`₹1,000,000.00`).
 */
const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The same formatter with the fraction suppressed, for the 64px summary cards. */
const INR_WHOLE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * `paise` is always an integer number of paise, never a rupee amount. The name
 * is the contract; the guard below is what makes it enforceable at runtime.
 */
function assertPaise(paise: number, fn: string): void {
  if (!Number.isInteger(paise)) {
    throw new Error(
      `${fn} received ${paise}, which is not an integer number of paise. ` +
        'Money crossing the billing API boundary is integer paise (D-31); a ' +
        'rupee float here would render a 100x understatement.',
    );
  }
}

/**
 * Formats integer paise for display: `123435` becomes `₹1,234.35`.
 *
 * A negative amount — credit notes (D-22), refunds (D-12), and the round-off
 * delta — renders as `-₹500.00`, with the sign ahead of the symbol, because
 * that is what `Intl` produces for `en-IN` and what the server's formatter
 * produces too.
 *
 * @param paise integer paise. A non-integer throws.
 */
export function formatPaiseINR(paise: number): string {
  assertPaise(paise, 'formatPaiseINR');
  return INR_FORMATTER.format(paise / PAISE_PER_RUPEE);
}

/**
 * Below this magnitude the full two-decimal string always fits a 64px summary
 * card, so nothing is dropped. `99900` paise is ₹999.00.
 */
const COMPACT_THRESHOLD_PAISE = 99900;

/**
 * Formats integer paise for the 64px summary cards, where `₹1,23,456` fits and
 * `₹1,23,456.00` does not.
 *
 * The paise component is dropped **only** when it is already zero and the
 * amount is above ₹999. Rounding a real fractional amount is deliberately not
 * done: `₹1,234.35` shown as `₹1,234` on a card the front desk reads while
 * taking cash is a misstatement, and 35 paise of it is still 35 paise the
 * clinic either collected or did not.
 *
 * @param paise integer paise. A non-integer throws.
 */
export function formatPaiseCompact(paise: number): string {
  assertPaise(paise, 'formatPaiseCompact');

  const isWholeRupees = paise % PAISE_PER_RUPEE === 0;
  const isLarge = Math.abs(paise) > COMPACT_THRESHOLD_PAISE;

  if (isWholeRupees && isLarge) {
    return INR_WHOLE_FORMATTER.format(paise / PAISE_PER_RUPEE);
  }

  return INR_FORMATTER.format(paise / PAISE_PER_RUPEE);
}

/**
 * Badge labels, uppercase per 06-UI-SPEC.md's `labelSmall` / Overline row.
 *
 * ## D-46: `FINALIZED` is labelled `AWAITING PAYMENT`
 *
 * `FINALIZED` (locked, invoice number assigned, no payment yet) and `UNPAID`
 * (payment reducer has run and found nothing captured) are adjacent states
 * whose difference is invisible to the front desk. 06-UI-SPEC.md gives both the
 * literal word plus an identical `secondaryContainer` swatch, which is exactly
 * the ambiguity D-46 rules out. The label here states what the staff member
 * actually needs to know — this invoice is locked and money is expected —
 * instead of naming an internal lifecycle state. The colour map below carries
 * the other half of the differentiation.
 */
const STATUS_LABELS: Readonly<Record<InvoiceStatus, string>> = {
  DRAFT: 'DRAFT',
  FINALIZED: 'AWAITING PAYMENT',
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOIDED: 'VOIDED',
};

export function invoiceStatusLabel(status: InvoiceStatus): string {
  return STATUS_LABELS[status] ?? String(status);
}

export interface InvoiceStatusColors {
  background: string;
  text: string;
  /** Present only where an outline carries meaning — see the D-46 note. */
  border?: string;
}

/**
 * 06-UI-SPEC.md's Invoice Status Color Map, verbatim, with one addition.
 *
 * ## The D-46 addition
 *
 * The spec assigns `secondaryContainer` (#D7CCC8 / #3E2723) to both `Finalized`
 * and `Unpaid`, making them the same swatch. Rather than introduce a token
 * Phase 2 does not have — Phase 6 adds no new tokens — `UNPAID` keeps the
 * spec's body colours and gains a `tertiary` (#E65100) outline. That places the
 * three "money is owed" states on a legible escalation ladder built entirely
 * from existing tokens:
 *
 *   AWAITING PAYMENT  brown fill, no outline      (locked, nothing due yet)
 *   UNPAID            brown fill, orange outline  (nothing collected)
 *   OVERDUE           orange fill                 (past the due date)
 *
 * `tertiary` is already the spec's accent for "Unpaid Total > 0" on the summary
 * card, so the outline reuses a meaning the screen already establishes rather
 * than inventing one.
 */
const STATUS_COLORS: Readonly<Record<InvoiceStatus, InvoiceStatusColors>> = {
  // surfaceVariant / onSurfaceVariant
  DRAFT: { background: '#F5F0EB', text: '#49454F' },
  // secondaryContainer / onSecondaryContainer
  FINALIZED: { background: '#D7CCC8', text: '#3E2723' },
  // secondaryContainer / onSecondaryContainer + tertiary outline (D-46)
  UNPAID: { background: '#D7CCC8', text: '#3E2723', border: '#E65100' },
  // primaryContainer / onPrimaryContainer
  PARTIALLY_PAID: { background: '#C8E6C9', text: '#1B5E20' },
  PAID: { background: '#C8E6C9', text: '#1B5E20' },
  // tertiaryContainer / onTertiaryContainer
  OVERDUE: { background: '#FFE0B2', text: '#BF360C' },
  // errorContainer / onErrorContainer
  VOIDED: { background: '#FFDAD6', text: '#410002' },
};

export function invoiceStatusColors(status: InvoiceStatus): InvoiceStatusColors {
  return STATUS_COLORS[status] ?? STATUS_COLORS.DRAFT;
}

/**
 * Short date for an invoice card, e.g. `14 Aug 26`. `toLocaleDateString` is
 * avoided: Hermes ships a cut-down ICU and returns a different string on
 * device than it does in this test environment.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatInvoiceDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
}
