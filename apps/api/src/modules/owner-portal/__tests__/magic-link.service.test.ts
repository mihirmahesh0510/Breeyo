// Wave 0 scaffold (09-01-PLAN.md Task 1): exercises the shared magic-link
// contracts from `@breeyo/types` that a later plan (09-05) wires into an
// actual Prisma-backed `magic-link.service.ts`. No DB access happens here —
// Task 3 (blocking schema push) has not run yet.
import { describe, it, expect } from 'vitest';
import {
  OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS,
  hashMagicLinkToken,
  computeMagicLinkExpiry,
  resolveOwnerPortalSessionState,
} from '@breeyo/types';

describe('magic-link token hashing (T-09-02: raw tokens are never persisted)', () => {
  it('hashes a raw token deterministically without ever returning it verbatim', () => {
    const rawToken = 'wa-issued-raw-token-123';
    const hash = hashMagicLinkToken(rawToken);

    expect(hash).not.toBe(rawToken);
    expect(hashMagicLinkToken(rawToken)).toBe(hash);
  });

  it('produces distinct hashes for distinct raw tokens (lookup by hash must not collide in tests)', () => {
    expect(hashMagicLinkToken('token-one')).not.toBe(hashMagicLinkToken('token-two'));
  });
});

describe('7-day expiry window (D-64, OWN-04)', () => {
  it('encodes exactly 7 * 24 * 60 * 60 seconds', () => {
    expect(OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS).toBe(604800);
  });

  it('computes expiresAt as issuedAt + 7 days, no more and no less', () => {
    const issuedAt = new Date('2026-08-01T00:00:00.000Z');
    const expiresAt = computeMagicLinkExpiry(issuedAt);
    expect(expiresAt.toISOString()).toBe('2026-08-08T00:00:00.000Z');
  });
});

describe('EXPIRED link state (D-64)', () => {
  it('resolves to EXPIRED once now() is past the 7-day expiry, even with a matching hash', () => {
    const issuedAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = computeMagicLinkExpiry(issuedAt);
    const now = new Date('2026-02-01T00:00:00.000Z'); // well past 7 days

    const state = resolveOwnerPortalSessionState({ matchesHash: true, revokedAt: null, expiresAt, now });

    expect(state).toBe('EXPIRED');
  });
});

describe('INVALID link state — scope mismatch and no-data behavior (OWN-06, T-09-02)', () => {
  it('resolves to INVALID when the presented token does not match the stored hash', () => {
    const issuedAt = new Date();
    const expiresAt = computeMagicLinkExpiry(issuedAt);

    const state = resolveOwnerPortalSessionState({ matchesHash: false, revokedAt: null, expiresAt });

    expect(state).toBe('INVALID');
  });

  it('resolves to INVALID for a revoked link, indistinguishable from a plain hash mismatch', () => {
    const issuedAt = new Date();
    const expiresAt = computeMagicLinkExpiry(issuedAt);

    const revoked = resolveOwnerPortalSessionState({
      matchesHash: true,
      revokedAt: new Date(),
      expiresAt,
    });
    const mismatched = resolveOwnerPortalSessionState({ matchesHash: false, revokedAt: null, expiresAt });

    expect(revoked).toBe('INVALID');
    expect(mismatched).toBe('INVALID');
  });
});
