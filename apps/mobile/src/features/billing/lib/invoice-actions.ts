/**
 * Which actions an invoice in a given state may be offered.
 *
 * ## Everything here derives from the shared transition table
 *
 * `isValidInvoiceTransition` in `@breeyo/types` is the same D-20 table the
 * Fastify services enforce on every status change. Gating the action bar off it
 * means the UI cannot offer a button the server answers with a 409 — the front
 * desk never learns the state machine by tapping into errors in front of an
 * owner (T-06-110).
 *
 * The alternative — a per-status list of buttons — would be correct on the day
 * it was written and wrong the first time D-20 changed, and the drift would be
 * invisible in review because both halves would look reasonable in isolation.
 * There is deliberately no `switch (status)` and no `status === '...'` action
 * lookup below, and a phase-level grep gate enforces that.
 *
 * ## Why this is a module and not a component
 *
 * `apps/mobile` cannot render a React Native component under test (vitest `node`
 * environment, no Metro transform), so a decision expressed inside JSX is a
 * decision no test can reach. `InvoiceActionBar.tsx` is a renderer over
 * `visibleInvoiceActions`; the seven-status matrix is asserted here.
 */

import {
  isInvoiceActionBlocked,
  isValidInvoiceTransition,
  type InvoiceStatus,
} from '@breeyo/types';

export type InvoiceActionKey =
  | 'pay'
  | 'print'
  | 'share'
  | 'download'
  | 'void'
  | 'creditNote'
  | 'refund'
  | 'edit'
  | 'delete';

/** How the bar renders an action. The hexes live in the component. */
export type InvoiceActionTone =
  | 'filled-primary'
  | 'outlined'
  | 'text-error'
  | 'text-neutral'
  | 'text-primary';

export interface InvoiceActionDescriptor {
  /** 06-UI-SPEC "Invoice Detail Screen" copy, verbatim. */
  label: string;
  /** MaterialCommunityIcons name. */
  icon: string;
  tone: InvoiceActionTone;
}

/**
 * Label, icon and tone per action, taken from 06-UI-SPEC's Invoice Detail
 * copy table and its accent conventions.
 *
 * `Void Invoice` and `Refund` are error-toned text buttons because both move
 * money out of a settled position; `Issue Credit Note` is neutral because it
 * adjusts a balance rather than reversing a transaction; `Collect Payment` is
 * the one filled primary, because it is the action the screen exists for.
 */
export const INVOICE_ACTIONS: Readonly<Record<InvoiceActionKey, InvoiceActionDescriptor>> = {
  pay: { label: 'Collect Payment', icon: 'cash-plus', tone: 'filled-primary' },
  print: { label: 'Print', icon: 'printer', tone: 'outlined' },
  share: { label: 'Share', icon: 'share-variant', tone: 'outlined' },
  download: { label: 'Download', icon: 'download', tone: 'outlined' },
  void: { label: 'Void Invoice', icon: 'cancel', tone: 'text-error' },
  creditNote: { label: 'Issue Credit Note', icon: 'file-document-minus-outline', tone: 'text-neutral' },
  refund: { label: 'Refund', icon: 'cash-refund', tone: 'text-error' },
  edit: { label: 'Edit', icon: 'pencil-outline', tone: 'text-primary' },
  delete: { label: 'Delete', icon: 'trash-can-outline', tone: 'text-error' },
} as const;

/** Render order: the spec's row, then the two draft-only affordances. */
export const INVOICE_ACTION_ORDER: readonly InvoiceActionKey[] = [
  'pay',
  'print',
  'share',
  'download',
  'void',
  'creditNote',
  'refund',
  'edit',
  'delete',
] as const;

export interface InvoiceActionInput {
  status: InvoiceStatus;
  /**
   * Whether any payment row exists against this invoice.
   *
   * D-12 makes a refund a reversal of money actually received, so there is
   * nothing to refund on an invoice that has never been paid. Deriving this
   * from the status instead would be wrong twice over: a `FINALIZED` invoice
   * has no payments, and a `VOIDED` one may have several (D-35).
   */
  hasPayments: boolean;
  /** `invoices.exception_flag` (D-35, D-36). Non-null blocks money actions. */
  exceptionFlag?: string | null;
}

export interface InvoiceActionSet extends Record<InvoiceActionKey, boolean> {
  /**
   * True when an unresolved billing exception is suppressing actions the
   * status alone would allow. The bar renders a notice rather than silently
   * showing fewer buttons than the invoice's status implies.
   */
  blockedByException: boolean;
}

/**
 * A transition that actually moves the invoice.
 *
 * `isValidInvoiceTransition` answers `true` for `from === to` on the four
 * payment-derived states, because a duplicate Razorpay webhook re-applying
 * `PAID → PAID` must be an accepted no-op rather than a 409. That is right for
 * the server and wrong for a button: a `PAID` invoice would offer Collect
 * Payment on the strength of being allowed to stay paid.
 */
function advances(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return from !== to && isValidInvoiceTransition(from, to);
}

/**
 * The states a payment can move an invoice into.
 *
 * `UNPAID` is in this set for a reason worth stating: it is what makes
 * `FINALIZED` derive correctly. `FINALIZED` is the transient post-finalize
 * state whose only forward edges are `UNPAID` and `VOIDED`, so asking only
 * "can it reach PAID or PARTIALLY_PAID" would hide Collect Payment on exactly
 * the invoice that was just locked and is waiting to be paid. The server hits
 * the same problem and solves it with an explicit `if (status === 'FINALIZED')`
 * escape in `assertPayable`; widening the target set reaches the same answer
 * for all seven states without a special case.
 */
const PAYMENT_TARGET_STATUSES: readonly InvoiceStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

/**
 * Mirrors the server's `NON_REFUNDABLE_INVOICE_STATES` and
 * `NON_CREDITABLE_INVOICE_STATES`, which are the same two values.
 *
 * This is a named set copied from the server's own constant, not a per-status
 * action list: the transition table has no edge that expresses "a credit note
 * may be raised against this", because a credit note is a separate record that
 * does not move the invoice's status at all (D-22). A draft is edited rather
 * than credited, and a voided invoice has no balance to reduce.
 */
const NO_ADJUSTMENT_STATUSES: readonly InvoiceStatus[] = ['DRAFT', 'VOIDED'];

export function invoiceActionSet(input: InvoiceActionInput): InvoiceActionSet {
  const { status, hasPayments, exceptionFlag = null } = input;

  const blockedByException = isInvoiceActionBlocked(exceptionFlag);

  // An invoice that can still be finalized is a draft: unnumbered, editable,
  // no stock deducted, nothing to print. That single edge carries both the
  // edit/delete affordances and the absence of every document action.
  const isEditable = advances(status, 'FINALIZED');

  const canAdjust = !NO_ADJUSTMENT_STATUSES.includes(status);

  const pay = !blockedByException && PAYMENT_TARGET_STATUSES.some((to) => advances(status, to));
  const voidInvoice = !blockedByException && advances(status, 'VOIDED');

  return {
    pay,
    // Print, Share and Download are reads of a document that exists. They
    // change nothing, so an unresolved exception does not withhold them —
    // staff resolving one need to be able to look at the invoice.
    print: !isEditable,
    share: !isEditable,
    download: !isEditable,
    void: voidInvoice,
    creditNote: !blockedByException && canAdjust,
    refund: !blockedByException && canAdjust && hasPayments,
    edit: !blockedByException && isEditable,
    delete: !blockedByException && isEditable,
    blockedByException,
  };
}

/** The actions to render, in bar order. */
export function visibleInvoiceActions(input: InvoiceActionInput): InvoiceActionKey[] {
  const actions = invoiceActionSet(input);
  return INVOICE_ACTION_ORDER.filter((key) => actions[key]);
}
