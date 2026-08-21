// Pure auth-routing decisions for the (app) and (auth) layout guards.
// Extracted for testability without React Native/Expo Router dependencies.

export interface AuthRouteGuardInput {
  isLoading: boolean;
  isAuthenticated: boolean;
}

/** (app)/_layout.tsx: bounce to login once the session is confirmed gone. */
export function shouldRedirectToLogin({ isLoading, isAuthenticated }: AuthRouteGuardInput): boolean {
  return !isLoading && !isAuthenticated;
}

/** (auth)/_layout.tsx: bounce an already-authenticated user off login/signup. */
export function shouldRedirectAwayFromAuth({ isLoading, isAuthenticated }: AuthRouteGuardInput): boolean {
  return !isLoading && isAuthenticated;
}
