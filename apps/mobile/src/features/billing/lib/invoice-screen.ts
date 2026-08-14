/**
 * The invoice detail screen's copy contract and its composition decisions
 * (BIL-03, BIL-04 — D-18, D-21, D-26, D-34, D-36).
 *
 * `lib/invoice-detail.ts` (plan 06-17) owns the clinic header, the payment
 * history rows and the void sheet's own copy. This module owns what the
 * *screen* adds on top: the title, the patient and owner lines, the balance
 * gate, the void request body and its outcome toast, the exception banner and
 * the PDF failure copy.
 *
 * Copy lives here rather than in the `.tsx` for the reason 06-14 established
 * and every plan since has followed: `apps/mobile` cannot render a React Native
 * component under test, so a string inside JSX is a string nothing can check.
 * The one systematic transliteration is the feature-wide `Rs` → `₹`, because
 * `formatPaiseINR` emits the rupee sign from `Intl` for `en-IN`, and `--` → `—`
 * because the double hyphen is how the source markdown writes an em dash.
 *
 * Nothing here performs a paise-to-rupee conversion or any money arithmetic.
 */

import {
  BILLING_EXCEPTION_FLAGS,
  type BillingExceptionFlag,
  type InvoiceStatus,
} from '@breeyo/types';
import type { VoidInvoiceInput } from '@breeyo/validators';
import { formatPaiseINR } from './format';
import { INVOICE_DETAIL_COPY } from './invoice-detail';
import { parseVoidInput } from './payment-mutations';

// ─── Copy ───────────────────────────────────────────────────────────────────

export const INVOICE_SCREEN_COPY = {
  itemsHeader: 'Items',
  balanceDue: (paise: number) => `Balance Due: ${formatPaiseINR(paise)}`,

  // 06-UI-SPEC "Invoice Detail Screen States" → Error.
  errorTitle: 'Could not load invoice. Go back and try again.',
  /** Addition: the spec names the state but not its button. */
  goBack: 'Go Back',

  // 06-UI-SPEC "Invoice Void Flow", both outcome toasts.
  voidedWithStockToast: 'Invoice voided. Items returned to stock.',
  voidedToast: 'Invoice voided',

  /**
   * Addition. 06-UI-SPEC has no copy for a document action that fails, and a
   * Print that silently does nothing is indistinguishable from a Print that
   * worked on a printer in another room.
   */
  pdfErrorToast: (reason: string) => `Could not produce the document: ${reason}`,

  /** Addition: 06-UI-SPEC gives the receipt no entry point wording of its own. */
  receiptUnavailableToast: 'No receipt exists for this payment yet',

  /**
   * D-35 / D-36 exception banner. Additions — both decisions postdate the spec.
   *
   * `InvoiceActionBar` already withholds the money actions and says so in one
   * line. The screen states *which* exception, because the two need different
   * things done about them and a staff member who cannot tell them apart cannot
   * resolve either.
   */
  exceptionBanner: (flag: string | null | undefined): string | null => {
    if (flag === BILLING_EXCEPTION_FLAGS.OVERPAYMENT) {
      return 'More money was collected than this invoice is for. A staff member needs to resolve it before this invoice can change.';
    }
    if (flag === BILLING_EXCEPTION_FLAGS.PAYMENT_AFTER_VOID) {
      return 'A payment landed on this invoice after it was voided. A staff member needs to resolve it before this invoice can change.';
    }
    return null;
  },
} as const;

/** `Invoice #[number]`, or the draft fallback. Delegated to 06-17's contract. */
export function screenTitleFor(invoiceNumber: string | null): string {
  return INVOICE_DETAIL_COPY.screenTitle(invoiceNumber);
}

// ─── Patient and owner (06-UI-SPEC "Invoice Detail Screen") ─────────────────

export interface PetLike {
  name: string;
  species: string;
}

export interface OwnerLike {
  name: string;
  mobile: string;
}

export function patientLine(pet: PetLike): string {
  return `Patient: ${pet.name} (${pet.species})`;
}

/**
 * `Owner: [name] — [phone]`.
 *
 * D-44 permits a counter sale with no owner on file at all; the screen omits
 * the row entirely in that case rather than rendering a line with a blank half,
 * so this is only called with an owner present.
 */
export function ownerLine(owner: OwnerLike): string {
  return `Owner: ${owner.name} — ${owner.mobile}`;
}

// ─── Balance (06-UI-SPEC: "when partially paid") ────────────────────────────

/**
 * Whether the outstanding-balance line belongs on screen.
 *
 * A draft has no balance to owe — it is not a demand for money until it is
 * finalized — and a settled or voided invoice has nothing outstanding. The
 * negative case matters: D-36 lets `balancePaise` go below zero on an
 * overpayment and 06-03 deliberately does not clamp it, so the test here is a
 * strict `> 0` rather than a truthiness check that would show `Balance Due:
 * -₹200.00` as though the clinic were owed it.
 */
export function showBalanceDue(status: InvoiceStatus, balancePaise: number): boolean {
  if (status === 'DRAFT' || status === 'VOIDED') return false;
  return balancePaise > 0;
}

// ─── Void (D-26, D-34) ──────────────────────────────────────────────────────

/**
 * The void request body.
 *
 * ## There is no stock-restoration choice to make
 *
 * D-26 originally asked the vet "Return dispensed items to stock?". D-34
 * settled that question on the server instead: a void reverses the stock
 * movements the *invoice itself* created — Quick Sale counter items, manually
 * added product lines — and leaves a drug already administered to the patient
 * deducted, because the animal was given it whatever the billing correction
 * says. Which movements reverse therefore follows from each line's provenance,
 * not from a decision a staff member is in a position to make at the moment of
 * voiding.
 *
 * `voidInvoiceSchema` encodes exactly that: `restoreStock` is `z.literal(true)`,
 * so an opt-out is unrepresentable on the wire. Offering a checkbox that the
 * server would reject — or worse, silently ignore — would leave a vet believing
 * stock stayed deducted when it had not. The field is still sent explicitly
 * rather than defaulted, so the intent is on the request and in the audit log
 * (T-06-115).
 */
export function buildVoidPayload(reason: string): VoidInvoiceInput {
  return parseVoidInput({ reason: reason.trim(), restoreStock: true });
}

/**
 * Which of the spec's two void toasts to show, decided by what the server
 * actually did rather than by what a control on this device claimed.
 *
 * `VoidInvoiceResult.restoredMovementCount` is the count of stock movements the
 * void reversed. Zero is the ordinary outcome for a services-only invoice and
 * for one whose products were all dispensed during a consultation; promising
 * "Items returned to stock" in either case would be a claim the stock ledger
 * does not support.
 */
export function voidSuccessToast(restoredMovementCount: number): string {
  return restoredMovementCount > 0
    ? INVOICE_SCREEN_COPY.voidedWithStockToast
    : INVOICE_SCREEN_COPY.voidedToast;
}

export type { BillingExceptionFlag };
