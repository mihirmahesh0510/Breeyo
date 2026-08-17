const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
      'Content-Type': 'application/json',
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

    throw new ApiClientError(
      data.error?.message || 'Request failed',
      data.error?.code || 'UNKNOWN_ERROR',
      response.status,
      details,
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
