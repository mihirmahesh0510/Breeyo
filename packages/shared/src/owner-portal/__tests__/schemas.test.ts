import { describe, it, expect } from 'vitest';
import {
  ownerPortalSessionSchema,
  ownerPortalCheckoutSchema,
  magicLinkValidationResultSchema,
  deepLinkRequestSchema,
  sessionRestoreStateSchema,
  reissueRequestSchema,
} from '../schemas.js';
import {
  OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS,
  hashMagicLinkToken,
  computeMagicLinkExpiry,
  resolveOwnerPortalSessionState,
} from '../types.js';

const MAGIC_LINK_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const INVOICE_ID_1 = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';
const INVOICE_ID_2 = 'b6b6f1c2-9e2a-4b3d-8f2a-1a2b3c4d5e6f';
const PET_ID = 'c1d2e3f4-5a6b-7c8d-9e0f-1a2b3c4d5e6f';

describe('OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS (D-64, OWN-04)', () => {
  it('encodes the exact 7-day expiry window', () => {
    expect(OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});

describe('hashMagicLinkToken', () => {
  it('produces a deterministic hash for the same raw token', () => {
    const hash1 = hashMagicLinkToken('raw-token-abc');
    const hash2 = hashMagicLinkToken('raw-token-abc');
    expect(hash1).toBe(hash2);
  });

  it('never returns the raw token itself (no raw-token persistence)', () => {
    const hash = hashMagicLinkToken('raw-token-abc');
    expect(hash).not.toBe('raw-token-abc');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different raw tokens', () => {
    expect(hashMagicLinkToken('token-a')).not.toBe(hashMagicLinkToken('token-b'));
  });
});

describe('computeMagicLinkExpiry', () => {
  it('sets expiry exactly 7 days after issuedAt', () => {
    const issuedAt = new Date('2026-08-20T00:00:00.000Z');
    const expiresAt = computeMagicLinkExpiry(issuedAt);
    expect(expiresAt.getTime() - issuedAt.getTime()).toBe(OWNER_PORTAL_MAGIC_LINK_TTL_SECONDS * 1000);
  });
});

describe('resolveOwnerPortalSessionState (D-64, D-67, OWN-04, OWN-06)', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const issuedAt = new Date('2026-08-15T12:00:00.000Z');
  const expiresAt = computeMagicLinkExpiry(issuedAt);

  it('resolves to READY for a matching, unexpired, unrevoked token', () => {
    expect(resolveOwnerPortalSessionState({ matchesHash: true, revokedAt: null, expiresAt, now })).toBe(
      'READY',
    );
  });

  it('resolves to EXPIRED once past the 7-day window even if the hash matches', () => {
    const longAgoExpiry = computeMagicLinkExpiry(new Date('2026-01-01T00:00:00.000Z'));
    expect(
      resolveOwnerPortalSessionState({ matchesHash: true, revokedAt: null, expiresAt: longAgoExpiry, now }),
    ).toBe('EXPIRED');
  });

  it('resolves to INVALID when the token hash does not match (scope mismatch / tampered token)', () => {
    expect(resolveOwnerPortalSessionState({ matchesHash: false, revokedAt: null, expiresAt, now })).toBe(
      'INVALID',
    );
  });

  it('resolves to INVALID when the link has been revoked, even if unexpired', () => {
    expect(
      resolveOwnerPortalSessionState({ matchesHash: true, revokedAt: new Date('2026-08-16'), expiresAt, now }),
    ).toBe('INVALID');
  });
});

describe('ownerPortalSessionSchema (OWN-04, OWN-06: INVALID carries no data)', () => {
  it('accepts a READY session envelope with data', () => {
    const result = ownerPortalSessionSchema.safeParse({
      state: 'READY',
      data: { magicLinkId: MAGIC_LINK_ID, defaultTab: 'OVERVIEW' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an INVALID envelope with no data field at all', () => {
    const result = ownerPortalSessionSchema.safeParse({ state: 'INVALID' });
    expect(result.success).toBe(true);
  });

  it('rejects an INVALID envelope that carries a data payload', () => {
    const result = ownerPortalSessionSchema.safeParse({
      state: 'INVALID',
      data: { magicLinkId: MAGIC_LINK_ID, defaultTab: 'OVERVIEW' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts an EXPIRED envelope with no data field', () => {
    const result = ownerPortalSessionSchema.safeParse({ state: 'EXPIRED' });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown state', () => {
    const result = ownerPortalSessionSchema.safeParse({ state: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });
});

describe('ownerPortalCheckoutSchema (D-59, D-69, D-70: one or many pet-scoped invoices)', () => {
  it('accepts a single-invoice checkout selection', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [INVOICE_ID_1],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a combined multi-invoice checkout selection across pets', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [INVOICE_ID_1, INVOICE_ID_2],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty invoice selection', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate invoice ids in one checkout', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [INVOICE_ID_1, INVOICE_ID_1],
    });
    expect(result.success).toBe(false);
  });
});

describe('magicLinkValidationResultSchema', () => {
  it('accepts a READY result carrying allowed scope', () => {
    const result = magicLinkValidationResultSchema.safeParse({
      state: 'READY',
      data: {
        magicLinkId: MAGIC_LINK_ID,
        allowedPetIds: [PET_ID],
        allowedInvoiceIds: [INVOICE_ID_1],
        defaultTab: 'OVERVIEW',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a VALIDATING result that carries scope data', () => {
    const result = magicLinkValidationResultSchema.safeParse({
      state: 'VALIDATING',
      data: { magicLinkId: MAGIC_LINK_ID, allowedPetIds: [], allowedInvoiceIds: [], defaultTab: 'OVERVIEW' },
    });
    expect(result.success).toBe(false);
  });
});

describe('deepLinkRequestSchema (D-60)', () => {
  it('accepts an invoice deep link with an entity id', () => {
    const result = deepLinkRequestSchema.safeParse({ type: 'INVOICE', entityId: INVOICE_ID_1 });
    expect(result.success).toBe(true);
  });

  it('accepts an overview deep link with no entity id', () => {
    const result = deepLinkRequestSchema.safeParse({ type: 'OVERVIEW' });
    expect(result.success).toBe(true);
  });

  it('rejects an invoice deep link missing its entity id', () => {
    const result = deepLinkRequestSchema.safeParse({ type: 'INVOICE' });
    expect(result.success).toBe(false);
  });
});

describe('sessionRestoreStateSchema (D-53)', () => {
  it('accepts a full restore payload', () => {
    const result = sessionRestoreStateSchema.safeParse({
      lastTab: 'INVOICES',
      lastPetId: PET_ID,
      lastInvoiceId: INVOICE_ID_1,
      lastVisitId: null,
      lastCheckoutSessionId: null,
      lastReturnState: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('reissueRequestSchema (D-67, D-82)', () => {
  it('accepts a reissue request identified by the expired magic link id', () => {
    const result = reissueRequestSchema.safeParse({ expiredMagicLinkId: MAGIC_LINK_ID });
    expect(result.success).toBe(true);
  });
});
