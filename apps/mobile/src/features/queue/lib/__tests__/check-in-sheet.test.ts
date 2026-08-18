import { describe, it, expect } from 'vitest';
import type { OwnerWithPets } from '@breeyo/types';
import { deriveOwnerLookupState } from '../check-in-sheet';

const OWNER: OwnerWithPets = {
  id: 'owner-1',
  name: 'Priya Sharma',
  mobile: '9876543210',
  pets: [{ id: 'pet-1', name: 'Buddy' } as any],
} as any;

describe('deriveOwnerLookupState', () => {
  it('surfaces the owner directly from query.data (queryFn already unwrapped the envelope)', () => {
    const state = deriveOwnerLookupState({ data: OWNER, isFetching: false }, true);
    expect(state.ownerData).toBe(OWNER);
    expect(state.ownerNotFound).toBe(false);
  });

  it('reports not-found only once a valid mobile has finished looking up with no owner', () => {
    const state = deriveOwnerLookupState({ data: undefined, isFetching: false }, true);
    expect(state.ownerData).toBeUndefined();
    expect(state.ownerNotFound).toBe(true);
  });

  it('does not report not-found while still fetching', () => {
    const state = deriveOwnerLookupState({ data: undefined, isFetching: true }, true);
    expect(state.isLooking).toBe(true);
    expect(state.ownerNotFound).toBe(false);
  });

  it('does not report not-found for an invalid mobile', () => {
    const state = deriveOwnerLookupState({ data: undefined, isFetching: false }, false);
    expect(state.ownerNotFound).toBe(false);
  });
});
