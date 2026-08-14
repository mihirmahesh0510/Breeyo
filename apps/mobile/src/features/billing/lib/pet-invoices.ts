import type { InvoiceListItem } from '@breeyo/types';

/**
 * Every decision the D-25 pet-profile Invoices section makes.
 *
 * Split out from the component for the reason `lib/settings-form.ts` and
 * `lib/dashboard-state.ts` are: this package cannot render a React Native
 * component under test, so logic left inside a `.tsx` is logic that ships
 * unasserted. Nothing here imports from `react-native`.
 */

/** The permission the pet-scoped invoice list is gated on, server and client. */
export const VIEW_INVOICES_PERMISSION = 'VIEW_INVOICES';

/**
 * T-06-142.
 *
 * `false` for an unresolved permission list, not `true`. The section appears on
 * a screen a Clinician opens dozens of times a day, and the failure directions
 * are not symmetric: briefly hiding a list from someone entitled to it costs a
 * moment, whereas briefly showing one to someone who is not is a disclosure.
 *
 * Under the D-05 seed change a Clinician retains `VIEW_INVOICES`, so the common
 * case is that a vet does see this section — the gate is not a way of hiding
 * billing from clinical staff, it is a way of not rendering a 403 to whoever
 * lacks it.
 */
export function canViewInvoices(permissions: readonly string[] | undefined): boolean {
  return permissions?.includes(VIEW_INVOICES_PERMISSION) ?? false;
}

/**
 * Newest first, as D-25 specifies and as `getInvoicesForPet` already returns.
 *
 * Applied again on the client because the ordering is a stated property of this
 * section rather than an incidental one of the endpoint, and because a merged
 * or optimistically-updated cache entry is not guaranteed to preserve it.
 *
 * Copies before sorting: the array handed in is React Query's cached one, and
 * sorting it in place would reorder the cache under every other consumer of the
 * same key.
 */
export function sortInvoicesNewestFirst(
  invoices: readonly InvoiceListItem[],
): InvoiceListItem[] {
  return [...invoices].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
}

/** Dates cross the wire as ISO strings; `InvoiceListItem` types them as `Date`. */
function toTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * What the section renders. One value rather than a chain of booleans at the
 * call site, so the precedence below is stated once and cannot be reordered by
 * an edit to the JSX.
 */
export type PetInvoicesSectionState =
  | 'hidden'
  | 'loading'
  | 'error'
  | 'empty'
  | 'populated';

export interface PetInvoicesSectionInput {
  canView: boolean;
  /** True while `/auth/permissions` is in flight. */
  isPermissionLoading: boolean;
  isLoading: boolean;
  isError: boolean;
  count: number;
}

/**
 * The precedence, and why it is this order:
 *
 *  1. **Permission.** Nothing about the pet's billing is rendered — not a
 *     heading, not a spinner, not an error — to a user without the permission.
 *  2. **Loading.** Skeletons, never the empty state. "No invoices for Bruno
 *     yet." shown before the query resolves is a false statement about a pet's
 *     billing history, made on the screen where staff go to check exactly that,
 *     and it is indistinguishable from the true version.
 *  3. **Error.** Also ahead of empty, for the same reason: a failed request is
 *     not evidence of an absence.
 *  4. Then empty or populated on the count.
 */
export function petInvoicesSectionState(
  input: PetInvoicesSectionInput,
): PetInvoicesSectionState {
  if (!input.canView || input.isPermissionLoading) return 'hidden';
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.count > 0 ? 'populated' : 'empty';
}

/** Skeleton rows drawn while loading — enough to suggest a list, not a page. */
export const PET_INVOICES_SKELETON_ROWS = 2;
