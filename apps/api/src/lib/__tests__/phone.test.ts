import { describe, it, expect } from 'vitest';
import { toE164, toWaId, phoneMatches } from '../phone.js';
import { WaSendError } from '../../modules/whatsapp/providers/wa-provider.port.js';

describe('toE164', () => {
  it('prefixes a bare 10-digit Indian number with +91', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
  });

  it('adds a leading + to a 12-digit 91-prefixed number', () => {
    expect(toE164('919876543210')).toBe('+919876543210');
  });

  it('strips whitespace from an already +91-prefixed number', () => {
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
  });

  it('throws WaSendError with code INVALID_NUMBER_FORMAT for non-numeric input', () => {
    let error: unknown;
    try {
      toE164('abc');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('INVALID_NUMBER_FORMAT');
    expect((error as WaSendError).retryable).toBe(false);
  });
});

describe('toWaId', () => {
  it('drops the leading + to mirror Meta wa_id form', () => {
    expect(toWaId('+919876543210')).toBe('919876543210');
  });
});

describe('phoneMatches', () => {
  it('matches an E.164 number against the plus-less wa_id form Meta sends inbound (Pitfall 9)', () => {
    expect(phoneMatches('+919876543210', '919876543210')).toBe(true);
  });

  it('does not match two different numbers', () => {
    expect(phoneMatches('+919876543210', '+918765432109')).toBe(false);
  });
});
