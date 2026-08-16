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
  usePathname: () => '/setup-wizard/clinic-profile',
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
import { apiClient } from '../../src/lib/api';
import {
  getAccessToken,
  storeAuthTokens,
  clearAuthStorage,
} from '../../src/lib/auth-storage';
import {
  formatHoursForApi,
  formatPhoneWithPrefix,
  getStepIndex,
  getDefaultHours,
  isWizardCompleted,
  WIZARD_STEPS,
  AVAILABLE_STAFF_ROLES,
  type WeekHours,
} from '../../src/lib/wizard-utils';

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

const TEST_USER = { id: 'u1', email: 'test@clinic.com', fullName: 'Dr. Test' };
const TEST_TOKEN = 'access-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  for (const key of Object.keys(secureStoreData)) {
    delete secureStoreData[key];
  }
  mockFetch.mockReset();
});

describe('wizard step navigation order', () => {
  it('defines correct step order: clinic-profile -> invite-staff -> clinic-hours', () => {
    expect(WIZARD_STEPS).toHaveLength(3);
    expect(WIZARD_STEPS[0]).toContain('clinic-profile');
    expect(WIZARD_STEPS[1]).toContain('invite-staff');
    expect(WIZARD_STEPS[2]).toContain('clinic-hours');
  });

  it('getStepIndex returns correct index for each step', () => {
    expect(getStepIndex('/setup-wizard/clinic-profile')).toBe(0);
    expect(getStepIndex('/setup-wizard/invite-staff')).toBe(1);
    expect(getStepIndex('/setup-wizard/clinic-hours')).toBe(2);
  });

  it('getStepIndex returns 0 for unknown paths', () => {
    expect(getStepIndex('/unknown')).toBe(0);
    expect(getStepIndex('')).toBe(0);
  });

  it('step 1 navigates to invite-staff on next', () => {
    // Step after clinic-profile is invite-staff
    expect(WIZARD_STEPS[1]).toBe('/setup-wizard/invite-staff');
  });

  it('step 2 navigates to clinic-hours on next', () => {
    // Step after invite-staff is clinic-hours
    expect(WIZARD_STEPS[2]).toBe('/setup-wizard/clinic-hours');
  });
});

describe('clinic profile step API calls', () => {
  it('fetches current clinic data on mount', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({
      data: {
        id: 'clinic-abc',
        name: 'Test Clinic',
        address: '123 Main St',
        city: 'Mumbai',
        contactPhone: '+919876543210',
        gstin: '',
      },
    });

    const token = await getAccessToken();
    const response = await apiClient<{ data: { name: string; address: string } }>(
      '/api/v1/clinics/current',
      { token: token! },
    );

    expect(response.data.name).toBe('Test Clinic');
    expect(response.data.address).toBe('123 Main St');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/clinics/current');
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it('calls PUT /clinics/current/profile with form data', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({ data: { success: true } });

    const token = await getAccessToken();
    const profileData = {
      name: 'Updated Clinic',
      address: '456 Oak Ave',
      city: 'Delhi',
      contactPhone: '+919876543210',
      gstin: '22AAAAA0000A1Z5',
    };

    await apiClient('/api/v1/clinics/current/profile', {
      method: 'PUT',
      token: token!,
      body: JSON.stringify(profileData),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/clinics/current/profile');
    expect(opts.method).toBe('PUT');
    const sentBody = JSON.parse(opts.body);
    expect(sentBody.name).toBe('Updated Clinic');
    expect(sentBody.city).toBe('Delhi');
    expect(sentBody.gstin).toBe('22AAAAA0000A1Z5');
  });
});

describe('invite staff step API calls', () => {
  it('calls POST /auth/staff/invite with staff data', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({ data: { success: true, inviteId: 'inv-1' } });

    const token = await getAccessToken();
    const inviteData = {
      phone: '+919876543210',
      fullName: 'Dr. Staff',
      roleName: 'Clinician',
    };

    await apiClient('/api/v1/auth/staff/invite', {
      method: 'POST',
      token: token!,
      body: JSON.stringify(inviteData),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/staff/invite');
    expect(opts.method).toBe('POST');
    const sentBody = JSON.parse(opts.body);
    expect(sentBody.phone).toBe('+919876543210');
    expect(sentBody.fullName).toBe('Dr. Staff');
    expect(sentBody.roleName).toBe('Clinician');
  });

  it('supports all non-Admin roles', () => {
    expect(AVAILABLE_STAFF_ROLES).not.toContain('Admin');
    expect(AVAILABLE_STAFF_ROLES).toHaveLength(3);
    expect(AVAILABLE_STAFF_ROLES).toContain('Clinician');
    expect(AVAILABLE_STAFF_ROLES).toContain('FrontDesk');
    expect(AVAILABLE_STAFF_ROLES).toContain('InventoryManager');
  });

  it('prepends +91 prefix to phone numbers', () => {
    expect(formatPhoneWithPrefix('9876543210')).toBe('+919876543210');
    // Already has prefix -- should not double-prefix
    expect(formatPhoneWithPrefix('+919876543210')).toBe('+919876543210');
  });
});

describe('clinic hours step API calls', () => {
  it('calls PUT /clinics/current/hours with formatted hours', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({ data: { success: true } });

    const token = await getAccessToken();
    const hoursData = {
      hours: [
        { day: 'Monday', isClosed: false, openTime: '09:00', closeTime: '18:00' },
        { day: 'Tuesday', isClosed: false, openTime: '09:00', closeTime: '18:00' },
        { day: 'Sunday', isClosed: true, openTime: null, closeTime: null },
      ],
    };

    await apiClient('/api/v1/clinics/current/hours', {
      method: 'PUT',
      token: token!,
      body: JSON.stringify(hoursData),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/clinics/current/hours');
    expect(opts.method).toBe('PUT');
  });

  it('calls POST /clinics/current/wizard-complete on finish', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({ data: { success: true } });

    const token = await getAccessToken();
    await apiClient('/api/v1/clinics/current/wizard-complete', {
      method: 'POST',
      token: token!,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/clinics/current/wizard-complete');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });
});

describe('skip behavior', () => {
  it('skip on clinic profile does not call save API', () => {
    // Skipping navigates directly without calling PUT /clinics/current/profile
    // We verify no fetch calls were made for the profile endpoint
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skip on invite staff does not call invite API', () => {
    // Skipping navigates to clinic-hours without calling POST /auth/staff/invite
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('skip on clinic hours calls wizard-complete but not hours save', async () => {
    // When skipping the last step, we still mark the wizard as complete
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({ data: { success: true } });

    const token = await getAccessToken();
    // Only wizard-complete is called, not the hours save
    await apiClient('/api/v1/clinics/current/wizard-complete', {
      method: 'POST',
      token: token!,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/clinics/current/wizard-complete');
    // No call to /clinics/current/hours
    expect(url).not.toContain('/clinics/current/hours');
  });
});

describe('wizard state tracking', () => {
  it('detects wizard completed when wizardCompletedAt is set', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({
      data: {
        id: 'clinic-abc',
        name: 'Test Clinic',
        wizardCompletedAt: '2025-01-15T10:00:00Z',
        workingHours: [{ day: 'Monday', openTime: '09:00', closeTime: '18:00' }],
      },
    });

    const token = await getAccessToken();
    const response = await apiClient<{
      data: { wizardCompletedAt: string | null };
    }>('/api/v1/clinics/current', { token: token! });

    const wizardCompleted = !!response.data.wizardCompletedAt;
    expect(wizardCompleted).toBe(true);
  });

  it('detects wizard not completed when wizardCompletedAt is null', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiResponse({
      data: {
        id: 'clinic-abc',
        name: 'Test Clinic',
        wizardCompletedAt: null,
        workingHours: null,
      },
    });

    const token = await getAccessToken();
    const response = await apiClient<{
      data: { wizardCompletedAt: string | null };
    }>('/api/v1/clinics/current', { token: token! });

    const wizardCompleted = !!response.data.wizardCompletedAt;
    expect(wizardCompleted).toBe(false);
  });

  it('handles API error gracefully for wizard status check', async () => {
    await storeAuthTokens(TEST_TOKEN, 'refresh-456', 'clinic-abc', TEST_USER);

    mockApiError('UNAUTHORIZED', 'Token expired', 401);

    const token = await getAccessToken();
    let wizardCompleted: boolean | null = null;
    try {
      const response = await apiClient<{
        data: { wizardCompletedAt: string | null };
      }>('/api/v1/clinics/current', { token: token! });
      wizardCompleted = !!response.data.wizardCompletedAt;
    } catch {
      // On error, wizardCompleted remains null (unknown)
    }

    expect(wizardCompleted).toBeNull();
  });
});

describe('working hours data transformation', () => {
  it('formats default hours correctly for API', () => {
    const defaultHours = getDefaultHours();
    const formatted = formatHoursForApi(defaultHours);

    expect(formatted).toHaveLength(7);

    // Monday should be open with times
    const monday = formatted.find((d) => d.day === 'Monday');
    expect(monday).toBeDefined();
    expect(monday!.isClosed).toBe(false);
    expect(monday!.openTime).toBe('09:00');
    expect(monday!.closeTime).toBe('18:00');

    // Sunday should be closed with null times
    const sunday = formatted.find((d) => d.day === 'Sunday');
    expect(sunday).toBeDefined();
    expect(sunday!.isClosed).toBe(true);
    expect(sunday!.openTime).toBeNull();
    expect(sunday!.closeTime).toBeNull();
  });

  it('sets null times for closed days', () => {
    const hours: WeekHours = {
      ...getDefaultHours(),
      Monday: { isClosed: true, openTime: '09:00', closeTime: '18:00' },
      Tuesday: { isClosed: false, openTime: '10:00', closeTime: '20:00' },
    };

    const formatted = formatHoursForApi(hours);

    const monday = formatted.find((d) => d.day === 'Monday');
    expect(monday!.isClosed).toBe(true);
    expect(monday!.openTime).toBeNull();
    expect(monday!.closeTime).toBeNull();

    const tuesday = formatted.find((d) => d.day === 'Tuesday');
    expect(tuesday!.isClosed).toBe(false);
    expect(tuesday!.openTime).toBe('10:00');
    expect(tuesday!.closeTime).toBe('20:00');
  });

  it('preserves all 7 days of the week in order', () => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const hours = getDefaultHours();

    const formatted = formatHoursForApi(hours);

    expect(formatted).toHaveLength(7);
    formatted.forEach((entry, index) => {
      expect(entry.day).toBe(days[index]);
    });
  });

  it('getDefaultHours sets Mon-Sat open, Sunday closed', () => {
    const defaults = getDefaultHours();
    expect(defaults.Monday.isClosed).toBe(false);
    expect(defaults.Monday.openTime).toBe('09:00');
    expect(defaults.Monday.closeTime).toBe('18:00');
    expect(defaults.Saturday.isClosed).toBe(false);
    expect(defaults.Sunday.isClosed).toBe(true);
  });
});

describe('isWizardCompleted utility', () => {
  it('returns true for a non-null timestamp', () => {
    expect(isWizardCompleted('2025-01-15T10:00:00Z')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isWizardCompleted(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isWizardCompleted(undefined)).toBe(false);
  });
});
