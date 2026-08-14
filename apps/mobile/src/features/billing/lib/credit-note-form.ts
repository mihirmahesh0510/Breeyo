/**
 * The credit note screen's copy contract and its per-line bounds
 * (BIL-03 — D-19, D-22, T-06-112).
 *
 * ## A credit above the original line total reduces revenue with no record
 *
 * The server enforces `CREDIT_EXCEEDS_LINE_TOTAL`. This module enforces the
 * same bound on the device so the error arrives while the amount is still being
 * typed, next to the field that caused it, rather than as a rejected submit
 * after the front desk has told the owner what they are getting back.
 *
 * ## The reason vocabulary cannot drift
 *
 * The five options come from `CREDIT_NOTE_REASONS` in `@breeyo/types` — the
 * same array `creditNoteSchema`'s `z.enum` is built from — mapped through the
 * shipped label table. A list typed into the picker would be one release away
 * from offering a reason the validator rejects.
 *
 * Copy lives here rather than in the `.tsx` because `apps/mobile` cannot render
 * a React Native component under test.
 */

import {
  CREDIT_NOTE_REASONS,
  CREDIT_NOTE_REASON_LABELS,
  type CreditNoteReason,
} from '@breeyo/types';
import { creditNoteSchema, type CreditNoteInput } from '@breeyo/validators';
import { formatPaiseINR } from './format';
import { parseRupeesToPaise } from './builder-state';

// ─── Copy ───────────────────────────────────────────────────────────────────

export const CREDIT_NOTE_COPY = {
  screenTitle: 'Credit Note',
  referencedInvoice: (invoiceNumber: string) => `For Invoice #${invoiceNumber}`,
  reasonLabel: 'Reason',
  itemsHeader: 'Items to Credit',
  selectInstruction: 'Select items and amounts to credit',
  itemLine: (description: string, paise: number) =>
    `${description} — ${formatPaiseINR(paise)}`,
  creditTotal: (paise: number) => `Credit Amount: ${formatPaiseINR(paise)}`,
  notesLabel: 'Notes (optional)',
  notesPlaceholder: 'Additional details...',
  issueButton: 'Issue Credit Note',
  cancelButton: 'Cancel',
  successToast: 'Credit note issued',

  /**
   * Additions. 06-UI-SPEC gives the screen no error wording, and every one of
   * these names a rejection the user can act on from the field they are in.
   */
  overLineError: (lineTotalPaise: number) =>
    `Cannot credit more than ${formatPaiseINR(lineTotalPaise)} on this line`,
  nothingSelected: 'Select at least one item to credit',
} as const;

export interface CreditNoteReasonOption {
  value: CreditNoteReason;
  label: string;
}

export const CREDIT_NOTE_REASON_OPTIONS: readonly CreditNoteReasonOption[] =
  CREDIT_NOTE_REASONS.map((value) => ({
    value,
    label: CREDIT_NOTE_REASON_LABELS[value],
  }));

// ─── Per-line drafts ────────────────────────────────────────────────────────

/** The `invoice_line_items` columns the selector needs. */
export interface CreditableLineItem {
  id: string;
  description: string;
  /** `lineTotalPaise` — the figure the server froze at finalize. */
  lineTotalPaise: number;
}

export interface CreditLineDraft {
  invoiceLineItemId: string;
  description: string;
  lineTotalPaise: number;
  selected: boolean;
  /** What the user has typed, in rupees. Seeded from the original line total. */
  amountInput: string;
}

/**
 * Seeds a row from its original line, unselected and at the full amount.
 *
 * Defaulting the amount to the whole line and the checkbox to off is the pairing
 * the flow actually wants: crediting a line in full is the common case, so the
 * user's only necessary action is a tick, while nothing is credited by merely
 * opening the screen.
 *
 * The seed string is the rupee rendering of an integer paise value, produced
 * here rather than by `formatPaiseINR` because an input field must not contain
 * a currency symbol or a grouping separator — `parseRupeesToPaise` would reject
 * `₹1,250.00`, and the field would be unusable until the user cleared it.
 */
export function creditLineFrom(item: CreditableLineItem): CreditLineDraft {
  return {
    invoiceLineItemId: item.id,
    description: item.description,
    lineTotalPaise: item.lineTotalPaise,
    selected: false,
    amountInput: (item.lineTotalPaise / 100).toFixed(2),
  };
}

export type CreditLineResult =
  | { ok: true; paise: number }
  | { ok: false; error: string };

/**
 * What one row will credit, or why it cannot.
 *
 * The rupee-to-paise conversion is 06-16's `parseRupeesToPaise`: integer
 * arithmetic on the two digit groups rather than a parsed float, and three or
 * more decimal places rejected rather than rounded, because choosing a rounding
 * direction on the user's behalf is choosing which way the clinic loses money.
 * The clamp above it is T-06-112's — a credit above the original line total
 * reduces revenue with nothing on the other side of the entry.
 */
export function creditLinePaise(draft: CreditLineDraft): CreditLineResult {
  const parsed = parseRupeesToPaise(draft.amountInput);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (parsed.paise <= 0) {
    return { ok: false, error: CREDIT_NOTE_COPY.overLineError(draft.lineTotalPaise) };
  }
  if (parsed.paise > draft.lineTotalPaise) {
    return { ok: false, error: CREDIT_NOTE_COPY.overLineError(draft.lineTotalPaise) };
  }

  return { ok: true, paise: parsed.paise };
}

/**
 * The `Credit Amount: ₹[N]` preview, over the selected rows only.
 *
 * This is the one place the credit surface adds money values, and what it adds
 * are amounts the user typed — not a subtotal, a tax head or a grand total.
 * Those remain server-only: the credit note's own taxable value and GST heads
 * are computed inside plan 06-10's transaction from these line amounts, and are
 * rendered from the response rather than predicted here (T-06-103). An
 * unparseable row contributes nothing, so the preview never counts a figure the
 * submit would reject.
 */
export function creditTotalPaise(drafts: readonly CreditLineDraft[]): number {
  return drafts.reduce((total, draft) => {
    if (!draft.selected) return total;
    const result = creditLinePaise(draft);
    return result.ok ? total + result.paise : total;
  }, 0);
}

// ─── The request body ───────────────────────────────────────────────────────

export interface CreditNoteInputArgs {
  reason: CreditNoteReason;
  notes: string | undefined;
  drafts: readonly CreditLineDraft[];
}

/**
 * Builds and validates the credit-note body from the selected rows.
 *
 * Parsed with `creditNoteSchema` — the same object the Fastify handler parses —
 * so the "Notes are required when the reason is Other" rule is stated once. A
 * credit note carries a six-year retention obligation, and `other` with no
 * explanation leaves an auditor nothing to go on.
 */
export function buildCreditNoteInput(args: CreditNoteInputArgs): CreditNoteInput {
  const items = args.drafts
    .filter((draft) => draft.selected)
    .map((draft) => {
      const result = creditLinePaise(draft);
      if (!result.ok) throw new Error(result.error);
      return { invoiceLineItemId: draft.invoiceLineItemId, creditAmountPaise: result.paise };
    });

  if (items.length === 0) throw new Error(CREDIT_NOTE_COPY.nothingSelected);

  const notes = args.notes?.trim();

  const result = creditNoteSchema.safeParse({
    reason: args.reason,
    items,
    ...(notes ? { notes } : {}),
  });

  if (!result.success) {
    throw new Error(
      result.error.errors.map((issue) => issue.message).join(', ') || 'Invalid credit note',
    );
  }

  return result.data;
}

export type { CreditNoteReason };
