export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
  OTP_EXPIRED: { code: 'OTP_EXPIRED', message: 'OTP expired -- tap to resend' },
  OTP_INVALID: { code: 'OTP_INVALID', message: 'Incorrect OTP -- please try again' },
  OTP_RATE_LIMITED: { code: 'OTP_RATE_LIMITED', message: 'Too many OTP requests -- try again in 5 minutes' },
  SESSION_EXPIRED: { code: 'SESSION_EXPIRED', message: 'Session expired -- please log in again' },
  TOKEN_REUSE_DETECTED: { code: 'TOKEN_REUSE_DETECTED', message: 'Session compromised -- please log in again' },
  EMAIL_NOT_VERIFIED: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before logging in' },
  ACCOUNT_DEACTIVATED: { code: 'ACCOUNT_DEACTIVATED', message: 'Account deactivated -- contact your clinic admin' },
  CLINIC_SELECTION_REQUIRED: { code: 'CLINIC_SELECTION_REQUIRED', message: 'Select a clinic to continue' },
  CLINIC_NOT_SELECTED: { code: 'CLINIC_NOT_SELECTED', message: 'No active clinic selected' },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
} as const;
