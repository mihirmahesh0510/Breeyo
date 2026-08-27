/**
 * `CheckInSheet`'s React-Native-free decision layer.
 *
 * `apps/mobile` cannot render a React Native component under test (see
 * `queue-board-utils.ts` for why), so the owner-lookup derivation lives here
 * where it can be exercised directly.
 */

import type { OwnerWithPets } from '@breeyo/types';

export interface OwnerLookupQuery {
  data: OwnerWithPets | undefined;
  isFetching: boolean;
}

export interface OwnerLookupState {
  ownerData: OwnerWithPets | undefined;
  isLooking: boolean;
  ownerNotFound: boolean;
}

/**
 * `useLookupOwner`'s `queryFn` already unwraps the API envelope (it returns
 * `response.data`), so `query.data` IS the owner — not `{ data: owner }`.
 */
export function deriveOwnerLookupState(
  query: OwnerLookupQuery,
  isValidMobile: boolean,
): OwnerLookupState {
  const ownerData = query.data;
  const isLooking = query.isFetching;
  const ownerNotFound = isValidMobile && !isLooking && !ownerData;
  return { ownerData, isLooking, ownerNotFound };
}
