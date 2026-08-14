/**
 * The D-06 Path B picker's copy and state derivation.
 *
 * ## What this list actually contains, and why it is not consultations
 *
 * 06-UI-SPEC describes Path B as "a picker of completed consultations without
 * invoices". Two facts about the shipped system make that literal reading the
 * wrong one:
 *
 *  1. **There is no endpoint for it.** `emr.routes.ts` exposes no consultation
 *     list at all — only get-by-id, the draft/finalize pair, and
 *     `/pets/:petId/history`. The plan's instruction on finding no such
 *     endpoint is to stop rather than filter a full list on the device, and
 *     that instruction is right: a client-side filter would not survive the
 *     first busy day.
 *  2. **The set it describes is empty by design.** D-03 has `EmrService`
 *     create a draft invoice the moment a consultation is finalized. A
 *     completed consultation *without* an invoice is therefore not a state the
 *     system produces on the happy path — so a picker built on that literal
 *     definition would correctly show nothing, forever, and the front desk
 *     would conclude the feature was broken.
 *
 * The population the spec is actually pointing at — consultations that have
 * been completed and still need billing — is exactly the DRAFT invoice list.
 * `GET /billing/invoices?status=draft` is server-side filtered, paginated and
 * already returns the three fields the row needs (pet name, owner name, date),
 * and tapping one opens the builder on a draft that already holds the dispensed
 * items, which is what the flow is for.
 *
 * The one case this does miss is a consultation whose D-03 hook failed —
 * `createDraftInvoiceForConsultation` catches and logs rather than failing the
 * consultation. Those are invisible here. Recorded as a deferred item; the fix
 * is a server-side reconciliation query, not a client-side scan.
 */

import type { InvoiceListItem } from '@breeyo/types';

export const PICKER_COPY = {
  screenTitle: 'From Consultation',

  /**
   * 06-UI-SPEC gives this picker no empty-state copy. These follow the shape of
   * the dashboard's ("No invoices yet" + where they come from), because an
   * empty state that only says "nothing here" leaves the user unsure whether
   * the feature is broken or the day has simply been quiet.
   */
  emptyTitle: 'No drafts to bill',
  emptyBody: 'Drafts appear here when a vet ends a consultation.',

  errorTitle: 'Could not load drafts',
  errorRetry: 'Try again',

  /** `[Pet Name] — Owner: [Owner Name]`, matching the builder's patient banner. */
  unknownPet: 'Unnamed patient',
  unknownOwner: 'No owner on file',
} as const;

export type PickerState = 'loading' | 'error' | 'empty' | 'populated';

/**
 * Which of the four states the picker renders.
 *
 * Loading is checked **before** empty, and that order is the whole point: an
 * in-flight query has an undefined item list, and rendering "No drafts to bill"
 * over it tells someone who is about to bill a client that there is nothing to
 * bill. They would walk away. Skeleton rows say "not yet" instead, which is the
 * only honest thing to say before the data arrives.
 *
 * Error is checked before empty for the same reason — a failed request is not
 * evidence of an empty list.
 */
export function pickerState(input: {
  isLoading: boolean;
  isError: boolean;
  items: readonly InvoiceListItem[] | undefined;
}): PickerState {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  if (!input.items || input.items.length === 0) return 'empty';
  return 'populated';
}

export interface PickerRow {
  id: string;
  title: string;
  subtitle: string;
}

/**
 * A draft as a picker row.
 *
 * `petName` and `ownerName` are both nullable on `InvoiceListItem` — a counter
 * sale has neither — so both fall back to named placeholders rather than
 * rendering `null` or collapsing into a blank line the user cannot tap with
 * confidence.
 */
export function toPickerRow(
  invoice: InvoiceListItem,
  formatDate: (value: Date | string) => string,
): PickerRow {
  return {
    id: invoice.id,
    title: `${invoice.petName ?? PICKER_COPY.unknownPet} — ${
      invoice.ownerName ?? PICKER_COPY.unknownOwner
    }`,
    subtitle: formatDate(invoice.createdAt),
  };
}
