import { describe, it, expect, vi, afterEach } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../crypto.js';

const KEY_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const KEY_B = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

const SECRET = 'rzp_test_abc123';

function withKey(key: string) {
  vi.stubEnv('BILLING_ENCRYPTION_KEY', key);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a Razorpay key secret', () => {
    withKey(KEY_A);
    expect(decryptSecret(encryptSecret(SECRET))).toBe(SECRET);
  });

  it('does not leave the plaintext anywhere in the envelope', () => {
    withKey(KEY_A);
    const stored = encryptSecret(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(stored).not.toContain('abc123');
  });

  it('produces a different envelope every call (fresh random IV)', () => {
    withKey(KEY_A);
    const first = encryptSecret(SECRET);
    const second = encryptSecret(SECRET);
    // Two clinics sharing a secret must not be detectable by comparing columns.
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe(SECRET);
    expect(decryptSecret(second)).toBe(SECRET);
  });

  it('uses the v1 four-segment envelope format', () => {
    withKey(KEY_A);
    const parts = encryptSecret(SECRET).split('.');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    withKey(KEY_A);
    const parts = encryptSecret(SECRET).split('.');
    const body = parts[3];
    // Flip exactly one character of the ciphertext segment.
    const flipped = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
    expect(flipped).not.toBe(body);
    parts[3] = flipped;
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    withKey(KEY_A);
    const parts = encryptSecret(SECRET).split('.');
    const tag = parts[2];
    parts[2] = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    withKey(KEY_A);
    const stored = encryptSecret(SECRET);
    withKey(KEY_B);
    expect(() => decryptSecret(stored)).toThrow();
  });

  it('rejects an envelope with an unknown version marker', () => {
    withKey(KEY_A);
    const stored = encryptSecret(SECRET);
    const bogus = `v2.${stored.split('.').slice(1).join('.')}`;
    expect(() => decryptSecret(bogus)).toThrow(/v1|version|format/i);
  });

  it('rejects a malformed envelope with the wrong segment count', () => {
    withKey(KEY_A);
    expect(() => decryptSecret('v1.onlytwo')).toThrow();
  });

  it('round-trips an empty string', () => {
    withKey(KEY_A);
    expect(decryptSecret(encryptSecret(''))).toBe('');
  });

  it('round-trips a 128-character secret', () => {
    withKey(KEY_A);
    const long = 'x9'.repeat(64);
    expect(long).toHaveLength(128);
    expect(decryptSecret(encryptSecret(long))).toBe(long);
  });
});

describe('encryption key handling', () => {
  it('throws a descriptive error at call time when the key is unset', () => {
    vi.stubEnv('BILLING_ENCRYPTION_KEY', undefined);
    // Importing the module must already have succeeded — an unconfigured
    // deployment boots fine and only fails when a credential is actually saved.
    expect(() => encryptSecret(SECRET)).toThrow(/BILLING_ENCRYPTION_KEY/);
  });

  it('throws when the key is present but empty', () => {
    withKey('');
    expect(() => encryptSecret(SECRET)).toThrow(/BILLING_ENCRYPTION_KEY/);
  });

  it('names the expected length when the key is not 64 hex characters', () => {
    withKey('deadbeef');
    expect(() => encryptSecret(SECRET)).toThrow(/64/);
  });

  it('rejects a 64-character key containing non-hex characters', () => {
    withKey('z'.repeat(64));
    expect(() => encryptSecret(SECRET)).toThrow(/hex|64/i);
  });

  it('never includes the key or the plaintext in the thrown error', () => {
    withKey('deadbeef');
    try {
      encryptSecret(SECRET);
      expect.unreachable('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain('deadbeef');
      expect(message).not.toContain(SECRET);
    }
  });
});

describe('isEncrypted', () => {
  it('recognises a value produced by encryptSecret', () => {
    withKey(KEY_A);
    expect(isEncrypted(encryptSecret(SECRET))).toBe(true);
  });

  it('rejects a raw plaintext secret', () => {
    expect(isEncrypted(SECRET)).toBe(false);
    expect(isEncrypted('')).toBe(false);
  });

  it('rejects a v1-prefixed value with the wrong segment count', () => {
    expect(isEncrypted('v1.abc.def')).toBe(false);
  });

  it('rejects an unknown version marker', () => {
    expect(isEncrypted('v2.a.b.c')).toBe(false);
  });
});
