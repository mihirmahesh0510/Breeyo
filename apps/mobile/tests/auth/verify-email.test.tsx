import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
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
  parseStaffInviteLink,
  parseResetLink,
  linking,
} from '../../src/lib/deep-linking';
import { apiClient, ApiClientError } from '../../src/lib/api';

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

function mockApiError(code: string, message: string, status = 400) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () =>
      Promise.resolve({
        error: { code, message },
      }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const key of Object.keys(secureStoreData)) {
    delete secureStoreData[key];
  }
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Deep link parsing tests
// ---------------------------------------------------------------------------
describe('parseStaffInviteLink', () => {
  it('extracts clinicId and phone from breeyo:// URL', () => {
    const result = parseStaffInviteLink(
      'breeyo://staff-setup?clinicId=clinic-123&phone=%2B919876543210',
    );
    expect(result).toEqual({
      clinicId: 'clinic-123',
      phone: '+919876543210',
    });
  });

  it('extracts clinicId and phone from https://breeyo.app URL', () => {
    const result = parseStaffInviteLink(
      'https://breeyo.app/staff-setup?clinicId=clinic-456&phone=%2B919876543210',
    );
    expect(result).toEqual({
      clinicId: 'clinic-456',
      phone: '+919876543210',
    });
  });

  it('returns null when clinicId is missing', () => {
    const result = parseStaffInviteLink(
      'breeyo://staff-setup?phone=%2B919876543210',
    );
    expect(result).toBeNull();
  });

  it('returns null when phone is missing', () => {
    const result = parseStaffInviteLink(
      'breeyo://staff-setup?clinicId=clinic-123',
    );
    expect(result).toBeNull();
  });

  it('returns null for a non-staff-setup path', () => {
    const result = parseStaffInviteLink(
      'breeyo://reset-password?clinicId=clinic-123&phone=%2B919876543210',
    );
    expect(result).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    const result = parseStaffInviteLink('not a url at all');
    expect(result).toBeNull();
  });
});

describe('parseResetLink', () => {
  it('extracts token from breeyo:// URL', () => {
    const result = parseResetLink('breeyo://reset-password?token=abc-def-123');
    expect(result).toEqual({ token: 'abc-def-123' });
  });

  it('extracts token from https://breeyo.app URL', () => {
    const result = parseResetLink(
      'https://breeyo.app/reset-password?token=xyz-789',
    );
    expect(result).toEqual({ token: 'xyz-789' });
  });

  it('returns null when token is missing', () => {
    const result = parseResetLink('breeyo://reset-password');
    expect(result).toBeNull();
  });

  it('returns null for a non-reset-password path', () => {
    const result = parseResetLink('breeyo://staff-setup?token=abc');
    expect(result).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    const result = parseResetLink('');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Linking config tests
// ---------------------------------------------------------------------------
describe('linking config', () => {
  it('has the correct prefixes', () => {
    expect(linking.prefixes).toContain('breeyo://');
    expect(linking.prefixes).toContain('https://breeyo.app');
  });

  it('has screen mappings for auth routes', () => {
    const authScreens = linking.config.screens['(auth)'].screens;
    expect(authScreens['staff-setup']).toBe('staff-setup');
    expect(authScreens['forgot-password']).toBe('reset-password');
    expect(authScreens['verify-email']).toBe('verify-email');
  });
});

// ---------------------------------------------------------------------------
// Verify email API logic tests
// ---------------------------------------------------------------------------
describe('verify email resend API', () => {
  it('calls the correct endpoint with email', async () => {
    mockApiResponse({ data: { sent: true } });

    await apiClient('/api/v1/auth/verify-email/resend', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@clinic.com' }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/verify-email/resend');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ email: 'test@clinic.com' });
  });

  it('handles 429 rate limit error', async () => {
    mockApiError('RATE_LIMITED', 'Too many requests', 429);

    try {
      await apiClient('/api/v1/auth/verify-email/resend', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@clinic.com' }),
      });
      // Should not reach here
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.code).toBe('RATE_LIMITED');
    }
  });

  it('handles already-verified email response', async () => {
    mockApiError('ALREADY_VERIFIED', 'Email is already verified', 400);

    try {
      await apiClient('/api/v1/auth/verify-email/resend', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@clinic.com' }),
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('ALREADY_VERIFIED');
      expect(apiErr.message).toBe('Email is already verified');
    }
  });
});

// ---------------------------------------------------------------------------
// Password reset confirm API logic tests
// ---------------------------------------------------------------------------
describe('password reset confirm API', () => {
  it('calls the correct endpoint with token and new password', async () => {
    mockApiResponse({ data: { success: true } });

    await apiClient('/api/v1/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token: 'reset-token-123', newPassword: 'newPass123' }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/password-reset/confirm');
    expect(JSON.parse(opts.body)).toEqual({
      token: 'reset-token-123',
      newPassword: 'newPass123',
    });
  });

  it('handles invalid/expired token', async () => {
    mockApiError('INVALID_TOKEN', 'Reset token is invalid or expired', 400);

    try {
      await apiClient('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: 'expired-token', newPassword: 'newPass123' }),
      });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('INVALID_TOKEN');
    }
  });
});
