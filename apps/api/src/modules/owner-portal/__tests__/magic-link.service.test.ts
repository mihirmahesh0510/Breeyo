// Plan 09-05 Task 1: replaces the Wave 0 scaffold (09-01-PLAN.md Task 1),
// which only exercised the pure `@breeyo/types` helpers. These tests drive
// the real `MagicLinkService` against a mocked admin Prisma client (the
// `invoice.service.test.ts` "mocked collaborators" style — no real DB).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashMagicLinkToken } from '../../../lib/magic-link-hash.js';
import { AccessScopeService } from '../access-scope.service.js';
import { MagicLinkService } from '../magic-link.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_2 = '55555555-5555-4555-8555-555555555555';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';

function linkRow(overrides: Record<string, unknown> = {}) {
  const issuedAt = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    tokenHash: hashMagicLinkToken('raw-token-abc'),
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    allowedPetIdsJson: [PET_1, PET_2],
    allowedInvoiceIdsJson: [INVOICE_1],
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    reissuedFromLinkId: null,
    latestReissueLinkId: null,
    lastViewedAt: null,
    ...overrides,
  };
}

function buildPrisma(row: ReturnType<typeof linkRow> | null, clinicPhone: string | null = '+919876543210') {
  return {
    ownerPortalMagicLink: {
      findUnique: vi.fn().mockResolvedValue(row),
    },
    clinic: {
      findUnique: vi.fn().mockResolvedValue(clinicPhone === null ? null : { contactPhone: clinicPhone }),
    },
  };
}

describe('MagicLinkService.validate — hashed lookup (T-09-02)', () => {
  it('hashes the raw token and looks up by hash, never by the raw value', async () => {
    const row = linkRow();
    const prisma = buildPrisma(row);
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    await service.validate('raw-token-abc');

    expect(prisma.ownerPortalMagicLink.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashMagicLinkToken('raw-token-abc') },
    });
    const callArgs = prisma.ownerPortalMagicLink.findUnique.mock.calls[0][0];
    expect(callArgs.where.tokenHash).not.toBe('raw-token-abc');
  });
});

describe('MagicLinkService.validate — READY (D-64, OWN-04)', () => {
  it('resolves READY and derives explicit pet/invoice scope from the link row', async () => {
    const now = new Date('2026-08-02T00:00:00.000Z');
    const row = linkRow();
    const prisma = buildPrisma(row);
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const result = await service.validate('raw-token-abc', now);

    expect(result.state).toBe('READY');
    if (result.state !== 'READY') throw new Error('expected READY');
    expect(result.data.magicLinkId).toBe(LINK_ID);
    expect(result.data.clinicId).toBe(CLINIC);
    expect(result.data.ownerId).toBe(OWNER);
    expect(result.data.allowedPetIds).toEqual([PET_1, PET_2]);
    expect(result.data.allowedInvoiceIds).toEqual([INVOICE_1]);
    expect(result.data.defaultTab).toBe('OVERVIEW');
  });
});

describe('MagicLinkService.validate — EXPIRED (D-64)', () => {
  it('resolves EXPIRED once now() is past the 7-day expiry, without leaking scope data', async () => {
    const row = linkRow();
    const prisma = buildPrisma(row);
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const farFuture = new Date(row.expiresAt.getTime() + 1000);
    const result = await service.validate('raw-token-abc', farFuture);

    expect(result.state).toBe('EXPIRED');
    if (result.state !== 'EXPIRED') throw new Error('expected EXPIRED');
    // Internal-only fields for the reissue path — not part of any public envelope.
    expect(result.magicLinkId).toBe(LINK_ID);
    expect(result.clinicId).toBe(CLINIC);
    expect(result.ownerId).toBe(OWNER);
    expect((result as unknown as { data?: unknown }).data).toBeUndefined();
  });

  it('carries the clinic\'s real contact number (finding 9.9) — safe here since the caller already received this exact link from this exact clinic', async () => {
    const row = linkRow();
    const prisma = buildPrisma(row, '+919876543210');
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const farFuture = new Date(row.expiresAt.getTime() + 1000);
    const result = await service.validate('raw-token-abc', farFuture);

    if (result.state !== 'EXPIRED') throw new Error('expected EXPIRED');
    expect(result.clinicPhone).toBe('+919876543210');
    expect(prisma.clinic.findUnique).toHaveBeenCalledWith({
      where: { id: CLINIC },
      select: { contactPhone: true },
    });
  });

  it('falls back to an empty string, never throwing, if the clinic row is somehow missing', async () => {
    const row = linkRow();
    const prisma = buildPrisma(row, null);
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const farFuture = new Date(row.expiresAt.getTime() + 1000);
    const result = await service.validate('raw-token-abc', farFuture);

    if (result.state !== 'EXPIRED') throw new Error('expected EXPIRED');
    expect(result.clinicPhone).toBe('');
  });
});

describe('MagicLinkService.validate — INVALID no-data behavior (OWN-06, T-09-02)', () => {
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma(null);
  });

  it('resolves INVALID with no data when no row matches the hashed token', async () => {
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const result = await service.validate('tampered-token');

    expect(result).toEqual({ state: 'INVALID' });
  });

  it('resolves INVALID for a revoked link, indistinguishable from a hash mismatch', async () => {
    const row = linkRow({ revokedAt: new Date('2026-08-01T12:00:00.000Z') });
    const revokedPrisma = buildPrisma(row);
    const service = new MagicLinkService(revokedPrisma as never, new AccessScopeService());

    const result = await service.validate('raw-token-abc');

    expect(result).toEqual({ state: 'INVALID' });
  });

  it('resolves INVALID for an empty token without ever querying the database', async () => {
    const service = new MagicLinkService(prisma as never, new AccessScopeService());

    const result = await service.validate('');

    expect(result).toEqual({ state: 'INVALID' });
    expect(prisma.ownerPortalMagicLink.findUnique).not.toHaveBeenCalled();
  });
});
