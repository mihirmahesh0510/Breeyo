/**
 * Deep linking configuration for Breeyo mobile app.
 *
 * Handles custom scheme (breeyo://) and universal links (https://breeyo.app)
 * for staff invite, password reset, and email verification flows.
 */

export const linking = {
  prefixes: ['breeyo://', 'https://breeyo.app'],
  config: {
    screens: {
      '(auth)': {
        screens: {
          'staff-setup': 'staff-setup',
          'forgot-password': 'reset-password',
          'verify-email': 'verify-email',
        },
      },
    },
  },
};

/**
 * Parses a staff invite deep link URL and extracts clinicId and phone.
 *
 * Expected format:
 *   breeyo://staff-setup?clinicId=xxx&phone=%2B919876543210
 *   https://breeyo.app/staff-setup?clinicId=xxx&phone=%2B919876543210
 *
 * @returns Parsed params or null if the URL is invalid or missing required params.
 */
export function parseStaffInviteLink(
  url: string,
): { clinicId: string; phone: string } | null {
  try {
    // Normalize breeyo:// to a parsable URL format
    const normalizedUrl = url.startsWith('breeyo://')
      ? url.replace('breeyo://', 'https://breeyo.app/')
      : url;

    const parsed = new URL(normalizedUrl);

    // Verify this is a staff-setup path
    if (!parsed.pathname.includes('staff-setup')) {
      return null;
    }

    const clinicId = parsed.searchParams.get('clinicId');
    const phone = parsed.searchParams.get('phone');

    if (!clinicId || !phone) {
      return null;
    }

    return { clinicId, phone };
  } catch {
    return null;
  }
}

/**
 * Parses a password reset deep link URL and extracts the reset token.
 *
 * Expected format:
 *   breeyo://reset-password?token=xxx
 *   https://breeyo.app/reset-password?token=xxx
 *
 * @returns Parsed token or null if the URL is invalid or missing the token.
 */
export function parseResetLink(url: string): { token: string } | null {
  try {
    const normalizedUrl = url.startsWith('breeyo://')
      ? url.replace('breeyo://', 'https://breeyo.app/')
      : url;

    const parsed = new URL(normalizedUrl);

    if (!parsed.pathname.includes('reset-password')) {
      return null;
    }

    const token = parsed.searchParams.get('token');

    if (!token) {
      return null;
    }

    return { token };
  } catch {
    return null;
  }
}
