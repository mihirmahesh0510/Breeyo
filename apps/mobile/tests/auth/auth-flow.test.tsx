import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock expo-secure-store before importing any modules that use auth-storage
// ---------------------------------------------------------------------------
const secureStoreData: Record<string, string> = {};

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(secureStoreData[key] ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    secureStoreData[key] = value;
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    delete secureStoreData[key];
    return Promise.resolve();
  }),
}));

// ---------------------------------------------------------------------------
// Mock expo-router
// ---------------------------------------------------------------------------
vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: ({ children }: { children: React.ReactNode }) => children,
  Slot: ({ children }: { children: React.ReactNode }) => children,
}));

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn() as Mock;
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import modules under test (after mocks are set up)
// ---------------------------------------------------------------------------
import {
  getAccessToken,
  getRefreshToken,
  getActiveClinicId,
  getUserSummary,
  storeAuthTokens,
  clearAuthStorage,
} from '../../src/lib/auth-storage';
import { apiClient, ApiClientError, isSessionExpiredError, setSessionExpiredHandler } from '../../src/lib/api';

// We cannot render React components easily without a renderer in node/vitest,
// so we test the AuthProvider logic by testing the underlying functions and
// the apiClient + auth-storage integration directly.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockApiResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockApiError(code: string, message: string, status = 400, details?: Record<string, unknown>) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () =>
      Promise.resolve({
        error: { code, message, details },
      }),
  });
}

const TEST_USER = { id: 'u1', email: 'test@clinic.com', fullName: 'Dr. Test' };
const TEST_TOKENS = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  user: TEST_USER,
  clinicId: 'clinic-abc',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  // Clear secure store between tests
  for (const key of Object.keys(secureStoreData)) {
    delete secureStoreData[key];
  }
  mockFetch.mockReset();
});

describe('auth-storage', () => {
  it('stores and retrieves auth tokens', async () => {
    await storeAuthTokens(
      TEST_TOKENS.accessToken,
      TEST_TOKENS.refreshToken,
      TEST_TOKENS.clinicId,
      TEST_TOKENS.user,
    );

    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    const clinicId = await getActiveClinicId();
    const user = await getUserSummary();

    expect(accessToken).toBe('access-123');
    expect(refreshToken).toBe('refresh-456');
    expect(clinicId).toBe('clinic-abc');
    expect(user).toEqual(TEST_USER);
  });

  it('clears all auth data', async () => {
    await storeAuthTokens(
      TEST_TOKENS.accessToken,
      TEST_TOKENS.refreshToken,
      TEST_TOKENS.clinicId,
      TEST_TOKENS.user,
    );

    await clearAuthStorage();

    const accessToken = await getAccessToken();
    const refreshToken = await getRefreshToken();
    const clinicId = await getActiveClinicId();
    const user = await getUserSummary();

    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
    expect(clinicId).toBeNull();
    expect(user).toBeNull();
  });
});

describe('apiClient', () => {
  it('makes a successful request', async () => {
    mockApiResponse({ data: { message: 'ok' } });

    const result = await apiClient<{ data: { message: string } }>('/api/v1/test');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.data.message).toBe('ok');
  });

  it('throws ApiClientError on error response', async () => {
    mockApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

    await expect(apiClient('/api/v1/auth/login', { method: 'POST' })).rejects.toThrow(
      ApiClientError,
    );

    try {
      mockApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
      await apiClient('/api/v1/auth/login', { method: 'POST' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('INVALID_CREDENTIALS');
      expect(apiErr.status).toBe(401);
    }
  });

  it('sends authorization header when token provided', async () => {
    mockApiResponse({ data: {} });

    await apiClient('/api/v1/me', { token: 'my-token' });

    const calledHeaders = mockFetch.mock.calls[0][1].headers;
    expect(calledHeaders.Authorization).toBe('Bearer my-token');
  });
});

// ---------------------------------------------------------------------------
// E2E-BUG-FIX-PLAN.md §1.1 (mobile side): AuthProvider registers itself here
// to force a stale session back to login the moment ANY request surfaces
// SESSION_EXPIRED — e.g. tenantContext's new existence check rejecting a
// session whose account/clinic membership no longer exists.
// ---------------------------------------------------------------------------
describe('apiClient session-expired handler', () => {
  afterEach(() => {
    setSessionExpiredHandler(null);
  });

  it('calls the registered handler when the server answers SESSION_EXPIRED', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockApiError('SESSION_EXPIRED', 'Session expired -- please log in again', 401);

    await expect(apiClient('/api/v1/patients/recent')).rejects.toThrow(ApiClientError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call the handler for an unrelated 401', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    mockApiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);

    await expect(apiClient('/api/v1/auth/login', { method: 'POST' })).rejects.toThrow(
      ApiClientError,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when no handler is registered', async () => {
    setSessionExpiredHandler(null);
    mockApiError('SESSION_EXPIRED', 'Session expired -- please log in again', 401);

    await expect(apiClient('/api/v1/patients/recent')).rejects.toThrow(ApiClientError);
  });

  it('stops calling a handler after it is unregistered', async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    setSessionExpiredHandler(null);
    mockApiError('SESSION_EXPIRED', 'Session expired -- please log in again', 401);

    await expect(apiClient('/api/v1/patients/recent')).rejects.toThrow(ApiClientError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('isSessionExpiredError', () => {
  it('identifies a SESSION_EXPIRED ApiClientError', () => {
    expect(isSessionExpiredError(new ApiClientError('x', 'SESSION_EXPIRED', 401))).toBe(true);
  });

  it('rejects any other ApiClientError code', () => {
    expect(isSessionExpiredError(new ApiClientError('x', 'INVALID_CREDENTIALS', 401))).toBe(false);
  });

  it('rejects non-ApiClientError values', () => {
    expect(isSessionExpiredError(new Error('boom'))).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
  });
});

describe('login flow', () => {
  it('stores tokens on successful login', async () => {
    mockApiResponse({
      data: TEST_TOKENS,
    });

    const response = await apiClient<{ data: typeof TEST_TOKENS }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@clinic.com', password: 'password123' }),
    });

    // Simulate what AuthProvider.login does
    await storeAuthTokens(
      response.data.accessToken,
      response.data.refreshToken,
      response.data.clinicId,
      response.data.user,
    );

    const stored = await getAccessToken();
    expect(stored).toBe('access-123');
  });

  it('clears state on logout', async () => {
    // Store tokens first
    await storeAuthTokens(
      TEST_TOKENS.accessToken,
      TEST_TOKENS.refreshToken,
      TEST_TOKENS.clinicId,
      TEST_TOKENS.user,
    );

    // Mock logout API call
    mockApiResponse({ data: { success: true } });
    await apiClient('/api/v1/auth/logout', {
      method: 'POST',
      token: TEST_TOKENS.accessToken,
    });

    // Clear storage (what AuthProvider.logout does)
    await clearAuthStorage();

    const accessToken = await getAccessToken();
    const user = await getUserSummary();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
  });

  it('handles CLINIC_SELECTION_REQUIRED error', async () => {
    const clinics = [
      { id: 'c1', name: 'Clinic A', address: '123 Main St' },
      { id: 'c2', name: 'Clinic B', address: '456 Oak Ave' },
    ];

    mockApiError('CLINIC_SELECTION_REQUIRED', 'Select a clinic to continue', 400, { clinics });

    try {
      await apiClient('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@clinic.com', password: 'password123' }),
      });
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('CLINIC_SELECTION_REQUIRED');
      expect(apiErr.details).toBeDefined();
      const details = apiErr.details as { clinics: typeof clinics };
      expect(details.clinics).toHaveLength(2);
      expect(details.clinics[0].name).toBe('Clinic A');
    }
  });
});

describe('token refresh flow', () => {
  it('refreshes tokens using stored refresh token', async () => {
    // Store initial tokens
    await storeAuthTokens(
      TEST_TOKENS.accessToken,
      TEST_TOKENS.refreshToken,
      TEST_TOKENS.clinicId,
      TEST_TOKENS.user,
    );

    // Mock refresh response
    const newTokens = {
      accessToken: 'new-access-789',
      refreshToken: 'new-refresh-012',
    };
    mockApiResponse({ data: newTokens });

    const refreshToken = await getRefreshToken();
    expect(refreshToken).toBe('refresh-456');

    const response = await apiClient<{ data: typeof newTokens }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    // Re-store with new tokens (simulating AuthProvider.refreshSession)
    const [user, clinicId] = await Promise.all([getUserSummary(), getActiveClinicId()]);
    expect(user).toEqual(TEST_USER);
    expect(clinicId).toBe('clinic-abc');

    await storeAuthTokens(
      response.data.accessToken,
      response.data.refreshToken,
      clinicId!,
      user!,
    );

    const updatedAccess = await getAccessToken();
    const updatedRefresh = await getRefreshToken();
    expect(updatedAccess).toBe('new-access-789');
    expect(updatedRefresh).toBe('new-refresh-012');
  });

  it('clears storage when refresh fails', async () => {
    await storeAuthTokens(
      TEST_TOKENS.accessToken,
      TEST_TOKENS.refreshToken,
      TEST_TOKENS.clinicId,
      TEST_TOKENS.user,
    );

    mockApiError('SESSION_EXPIRED', 'Session expired', 401);

    try {
      await apiClient('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: TEST_TOKENS.refreshToken }),
      });
    } catch {
      // Simulate what AuthProvider does on refresh failure
      await clearAuthStorage();
    }

    const accessToken = await getAccessToken();
    expect(accessToken).toBeNull();
  });
});

describe('OTP login flow', () => {
  it('sends OTP request', async () => {
    mockApiResponse({ data: { sent: true } });

    const response = await apiClient<{ data: { sent: boolean } }>('/api/v1/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: '+919876543210' }),
    });

    expect(response.data.sent).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/otp/request');
    expect(JSON.parse(opts.body)).toEqual({ phone: '+919876543210' });
  });

  it('verifies OTP and stores tokens', async () => {
    mockApiResponse({
      data: TEST_TOKENS,
    });

    const response = await apiClient<{ data: typeof TEST_TOKENS }>('/api/v1/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: '+919876543210', otp: '123456' }),
    });

    await storeAuthTokens(
      response.data.accessToken,
      response.data.refreshToken,
      response.data.clinicId,
      response.data.user,
    );

    const stored = await getAccessToken();
    expect(stored).toBe('access-123');
  });

  it('handles CLINIC_SELECTION_REQUIRED on OTP verify', async () => {
    const clinics = [{ id: 'c1', name: 'Clinic A', address: 'Addr A' }];
    mockApiError('CLINIC_SELECTION_REQUIRED', 'Select a clinic', 400, { clinics });

    try {
      await apiClient('/api/v1/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: '+919876543210', otp: '123456' }),
      });
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('CLINIC_SELECTION_REQUIRED');
      const details = apiErr.details as { clinics: typeof clinics };
      expect(details.clinics).toHaveLength(1);
    }
  });
});

describe('clinic selection flow', () => {
  it('logs in with a selected clinic', async () => {
    mockApiResponse({
      data: {
        ...TEST_TOKENS,
        clinicId: 'selected-clinic',
      },
    });

    const response = await apiClient<{ data: typeof TEST_TOKENS & { clinicId: string } }>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@clinic.com',
          password: 'password123',
          clinicId: 'selected-clinic',
        }),
      },
    );

    await storeAuthTokens(
      response.data.accessToken,
      response.data.refreshToken,
      response.data.clinicId,
      response.data.user,
    );

    const clinicId = await getActiveClinicId();
    expect(clinicId).toBe('selected-clinic');
  });
});
