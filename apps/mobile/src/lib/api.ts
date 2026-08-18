const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  token?: string;
}

// E2E-BUG-FIX-PLAN.md §1.1 (mobile side): a stale session (account/clinic
// membership removed after the token was issued) now gets rejected with
// SESSION_EXPIRED by the API on the very first request that reaches
// tenantContext -- not just on refresh. AuthProvider registers itself here
// on mount so ANY request surfacing that code forces the app back to login,
// the same way it already reacts to logout.
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  const data = await response.json();

  if (!response.ok) {
    const code = data.error?.code || 'UNKNOWN_ERROR';

    if (code === 'SESSION_EXPIRED') {
      sessionExpiredHandler?.();
    }

    throw new ApiClientError(
      data.error?.message || 'Request failed',
      code,
      response.status,
      data.error?.details,
    );
  }

  return data as T;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Distinguishes "the session is invalid" from every other request failure.
 * `AuthProvider`'s `hydrateSession`/`refreshSession` need this: a SESSION_EXPIRED
 * error from the wizard-status check must not fall through to "wizard status
 * unknown, authenticate anyway" — that would race the `sessionExpiredHandler`
 * (`logout()`) apiClient already fired, and could leave `isAuthenticated: true`
 * if hydration's own `setState` happened to run after logout's.
 */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'SESSION_EXPIRED';
}
