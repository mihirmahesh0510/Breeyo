const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Builds a full, directly-navigable URL for an API path. Finding 9.3's
 * `usePortalReceiptUrl` is the first caller: `InvoiceDetailSheet`'s "View
 * Receipt" link needs an `href` a browser can open in a new tab, not a
 * value `apiClient` fetches and returns JSON for.
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      // Only set this when a body is actually being sent. Fastify's default
      // JSON body parser rejects an empty body under `Content-Type:
      // application/json` (`FST_ERR_CTP_EMPTY_JSON_BODY`) -- a bodyless POST
      // like `owner-portal/:token/reissue` (Plan 09-06 review) needs no
      // Content-Type at all, and sending one anyway 400s the request.
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });

  const data = await response.json();

  if (!response.ok) {
    // `apps/api/src/middleware/error-handler.ts` forwards a `clinics` array
    // (CLINIC_SELECTION_REQUIRED) as a top-level field on `error`, separate
    // from `error.details` (e.g. BIL-02's `details.shortfalls`). Folding it
    // into `details.clinics` here gives every caller one place to look
    // instead of having to know which errors use which top-level field.
    const details =
      data.error?.details ?? (data.error?.clinics ? { clinics: data.error.clinics } : undefined);

    // Verify-fix 10.3: `apps/api/src/middleware/error-handler.ts` forwards a
    // structured `.conflict` payload (domain/entityType/entityId/
    // currentVersion/expectedVersion/severity) on a 409 STALE_WRITE_CONFLICT
    // (Plan 10-05's browser optimistic-concurrency check), but nothing on
    // this client read it back off the wire -- a caller could never drive
    // D-05 review-before-overwrite UI off a real rejection. Forwarded the
    // same way `.details` already is, just above.
    const conflict = data.error?.conflict as ApiConflictInfo | undefined;

    throw new ApiClientError(
      data.error?.message || 'Request failed',
      data.error?.code || 'UNKNOWN_ERROR',
      response.status,
      details,
      conflict,
    );
  }

  return data as T;
}

/** Mirrors `BrowserWriteConflictInfo` (`apps/api/src/realtime/browser-sync.service.ts`) plus its `severity` field -- the shape `error-handler.ts` puts on the wire for a 409 STALE_WRITE_CONFLICT. */
export interface ApiConflictInfo {
  domain: string;
  entityType: string;
  entityId: string;
  currentVersion: number;
  expectedVersion: number;
  severity: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>,
    public conflict?: ApiConflictInfo,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
