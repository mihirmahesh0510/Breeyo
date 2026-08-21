import { describe, it, expect } from 'vitest';
import { shouldRedirectAwayFromAuth, shouldRedirectToLogin } from '../../src/lib/auth-route-guard';

/**
 * E2E-BUG-FIX-PLAN.md §1.2: nothing in the routing tree ever reacted to
 * `isAuthenticated` becoming `false` — `(app)/_layout.tsx`'s only effect
 * redirected for an incomplete setup wizard, `app/_layout.tsx` is a bare
 * `<Slot />`, and `(auth)/_layout.tsx` had no redirect either. Tapping
 * "Log Out" cleared storage and reset state, but the user stayed on the
 * same screen — a direct regression against Phase 1's own success criterion
 * #2 ("User can log out from any screen in the app").
 *
 * Extracted as a pure predicate (matches this project's established pattern
 * for anything a `.tsx` file's `useEffect` needs to decide, since
 * `apps/mobile` cannot render a React Native component under test) so the
 * decision itself — not just "does the app compile" — has real coverage,
 * which is the actual gap AUTH-03 left unclosed.
 */
describe('shouldRedirectToLogin ((app)/_layout.tsx guard)', () => {
  it('redirects once loading has finished and the session is gone', () => {
    expect(shouldRedirectToLogin({ isLoading: false, isAuthenticated: false })).toBe(true);
  });

  it('does not redirect while auth state is still hydrating', () => {
    expect(shouldRedirectToLogin({ isLoading: true, isAuthenticated: false })).toBe(false);
  });

  it('does not redirect an authenticated session', () => {
    expect(shouldRedirectToLogin({ isLoading: false, isAuthenticated: true })).toBe(false);
  });
});

describe('shouldRedirectAwayFromAuth ((auth)/_layout.tsx guard)', () => {
  it('bounces an already-authenticated user away from login/signup', () => {
    expect(shouldRedirectAwayFromAuth({ isLoading: false, isAuthenticated: true })).toBe(true);
  });

  it('does not bounce while auth state is still hydrating', () => {
    expect(shouldRedirectAwayFromAuth({ isLoading: true, isAuthenticated: true })).toBe(false);
  });

  it('does not bounce an unauthenticated visitor', () => {
    expect(shouldRedirectAwayFromAuth({ isLoading: false, isAuthenticated: false })).toBe(false);
  });
});
