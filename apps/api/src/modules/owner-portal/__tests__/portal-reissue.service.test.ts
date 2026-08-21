// Plan 09-05 Task 2: OWN-04, D-67, D-82 — expired-link WhatsApp reissue with
// a 3-per-owner-per-rolling-24h cap. Mocked collaborators, no real DB /
// WhatsApp send.
import { describe, it, expect, vi } from 'vitest';
import { OWNER_PORTAL_REISSUE_DAILY_LIMIT } from '@breeyo/types';
import type { MagicLinkResolution } from '../magic-link.service.js';
import { PortalReissueService } from '../portal-reissue.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const OLD_LINK_ID = '33333333-3333-4333-8333-333333333333';
const NEW_LINK_ID = '44444444-4444-4444-8444-444444444444';
const PET_1 = '55555555-5555-4555-8555-555555555555';

function expiredResolution(): MagicLinkResolution {
  return { state: 'EXPIRED', magicLinkId: OLD_LINK_ID, clinicId: CLINIC, ownerId: OWNER };
}

function oldLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OLD_LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    defaultTab: 'OVERVIEW',
    allowedPetIdsJson: [PET_1],
    allowedInvoiceIdsJson: [],
    ...overrides,
  };
}

/**
 * `$transaction` resolves its callback with the SAME mock object handed back
 * out, so every existing assertion against `db.ownerPortalMagicLink.*` below
 * keeps working unchanged whether the service reads/writes through `this.db`
 * directly or through the `tx` a `$transaction(async (tx) => ...)` callback
 * receives (finding 9.4/D-82's fix). What's new is `$transaction` and
 * `$executeRaw` themselves — the pre-fix service never calls either, which is
 * exactly what the race-condition test below asserts against.
 */
function buildDb(overrides: Record<string, unknown> = {}) {
  const db = {
    ownerPortalMagicLink: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(oldLinkRow()),
      create: vi.fn().mockResolvedValue({ id: NEW_LINK_ID }),
      update: vi.fn().mockResolvedValue({}),
    },
    petOwner: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Asha Rao', mobile: '+919812345678' }),
    },
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    ...db,
    $transaction: vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
  };
}

function buildWhatsAppService() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  };
}

describe('PortalReissueService — only EXPIRED links may reissue (OWN-06)', () => {
  it('refuses a READY resolution (link is still valid, nothing to reissue)', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue({
      state: 'READY',
      data: {
        magicLinkId: OLD_LINK_ID,
        clinicId: CLINIC,
        ownerId: OWNER,
        allowedPetIds: [],
        allowedInvoiceIds: [],
        defaultTab: 'OVERVIEW',
        deepLinkType: null,
        deepLinkEntityId: null,
        expiresAt: new Date(),
      },
    });

    expect(result).toEqual({ status: 'NOT_EXPIRED' });
    expect(wa.sendTemplate).not.toHaveBeenCalled();
  });

  it('refuses an INVALID resolution', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue({ state: 'INVALID' });

    expect(result).toEqual({ status: 'INVALID' });
    expect(wa.sendTemplate).not.toHaveBeenCalled();
  });
});

describe('PortalReissueService — 3-per-24h cap (D-82)', () => {
  it('rejects the 4th reissue in a rolling 24 hours with LIMIT_REACHED, never creating a new link', async () => {
    const db = buildDb({
      ownerPortalMagicLink: {
        count: vi.fn().mockResolvedValue(3),
        findUnique: vi.fn().mockResolvedValue(oldLinkRow()),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue(expiredResolution());

    expect(result).toEqual({ status: 'LIMIT_REACHED' });
    expect(db.ownerPortalMagicLink.create).not.toHaveBeenCalled();
    expect(wa.sendTemplate).not.toHaveBeenCalled();
  });

  it('counts only reissued rows for this owner within the last 24 hours', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    const args = db.ownerPortalMagicLink.count.mock.calls[0][0];
    expect(args.where.ownerId).toBe(OWNER);
    expect(args.where.reissuedFromLinkId).toEqual({ not: null });
    expect(args.where.issuedAt.gte).toBeInstanceOf(Date);
  });

  it('permits the 3rd reissue in the window (cap is "once 3 exist", not "on the 3rd attempt")', async () => {
    const db = buildDb({
      ownerPortalMagicLink: {
        count: vi.fn().mockResolvedValue(2),
        findUnique: vi.fn().mockResolvedValue(oldLinkRow()),
        create: vi.fn().mockResolvedValue({ id: NEW_LINK_ID }),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue(expiredResolution());

    expect(result.status).toBe('REISSUED');
  });
});

describe('PortalReissueService — atomic count-check-then-create (D-82, finding 9.4)', () => {
  it('runs the daily-cap count check and the new-link create inside one $transaction, not as two independent unwrapped queries', async () => {
    // Pre-fix, `count` and `create` each ran directly on `this.db` with no
    // transaction at all: two concurrent reissue calls for the same owner
    // could each observe "count < 3" before either one's `create` commits,
    // letting more than OWNER_PORTAL_REISSUE_DAILY_LIMIT links through in
    // the rolling window. Wrapping both in a single `$transaction` callback
    // (mirroring `queue.repository.ts`'s `createEntryIfNoneActive` and
    // `appointment.service.ts`'s D-34 slot lock for this exact
    // check-then-create shape) is what makes the two operations atomic
    // against each other. This test never proves true DB-level concurrency
    // (the mock has no real connection to race) — it proves the fix's
    // structural shape: both operations happen on the transaction's own
    // handle, inside exactly one `$transaction` call.
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue(expiredResolution());

    expect(result.status).toBe('REISSUED');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.ownerPortalMagicLink.count).toHaveBeenCalledTimes(1);
    expect(db.ownerPortalMagicLink.create).toHaveBeenCalledTimes(1);

    // Both calls must have happened by the time the single `$transaction`
    // promise settles -- i.e. neither runs outside the callback it was
    // given.
    const transactionCall = db.$transaction.mock.invocationCallOrder[0];
    expect(db.ownerPortalMagicLink.count.mock.invocationCallOrder[0]).toBeGreaterThan(transactionCall);
    expect(db.ownerPortalMagicLink.create.mock.invocationCallOrder[0]).toBeGreaterThan(transactionCall);
  });

  it('takes a per-owner pg_advisory_xact_lock inside the transaction before checking the count, so concurrent reissues for the SAME owner serialize', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    const lockCallOrder = db.$executeRaw.mock.invocationCallOrder[0];
    const countCallOrder = db.ownerPortalMagicLink.count.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(countCallOrder);

    // The lock key must carry the owner id so two DIFFERENT owners' reissue
    // calls are never serialized against each other, only same-owner ones.
    const [sqlParts, ...values] = db.$executeRaw.mock.calls[0];
    expect(sqlParts.join('')).toContain('pg_advisory_xact_lock');
    expect(values.join('')).toContain(OWNER);
  });

  it('never lets a 4th same-window reissue create a link even when the count check races the create within the same transaction', async () => {
    const db = buildDb({
      ownerPortalMagicLink: {
        count: vi.fn().mockResolvedValue(OWNER_PORTAL_REISSUE_DAILY_LIMIT),
        findUnique: vi.fn().mockResolvedValue(oldLinkRow()),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue(expiredResolution());

    expect(result).toEqual({ status: 'LIMIT_REACHED' });
    expect(db.ownerPortalMagicLink.create).not.toHaveBeenCalled();
    // The whole check-then-refuse decision happened inside the one
    // transaction call -- there is no second, later opportunity for a
    // create to slip through outside it.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('PortalReissueService — link rotation and lineage (D-67, OWN-04)', () => {
  it('creates a new link carrying over scope from the old link, linked via reissuedFromLinkId', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    expect(db.ownerPortalMagicLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clinicId: CLINIC,
        ownerId: OWNER,
        defaultTab: 'OVERVIEW',
        allowedPetIdsJson: [PET_1],
        allowedInvoiceIdsJson: [],
        reissuedFromLinkId: OLD_LINK_ID,
      }),
    });
  });

  it('never persists the raw token, only its hash', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    const createArgs = db.ownerPortalMagicLink.create.mock.calls[0][0].data;
    expect(createArgs.tokenHash).toBeDefined();
    expect(typeof createArgs.tokenHash).toBe('string');
    expect(createArgs.tokenHash).toHaveLength(64); // sha256 hex digest
    expect(createArgs).not.toHaveProperty('rawToken');
  });

  it('points the old link forward at the new link via latestReissueLinkId (best-effort)', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    expect(db.ownerPortalMagicLink.update).toHaveBeenCalledWith({
      where: { id: OLD_LINK_ID },
      data: { latestReissueLinkId: NEW_LINK_ID },
    });
  });

  it('never fails the reissue if the best-effort lineage update fails', async () => {
    const db = buildDb();
    db.ownerPortalMagicLink.update = vi.fn().mockRejectedValue(new Error('boom'));
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await expect(service.reissue(expiredResolution())).resolves.toMatchObject({ status: 'REISSUED' });
  });
});

describe('PortalReissueService — WhatsApp delegation (OWN-04, D-67)', () => {
  it('sends through WhatsAppService.sendTemplate with the owner_portal_link template and a null (automated) userId', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.reissue(expiredResolution());

    expect(wa.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER,
        waPhone: '+919812345678',
        templateKey: 'owner_portal_link',
        contextType: 'GENERAL',
        variables: expect.objectContaining({ owner_name: 'Asha Rao' }),
      }),
      { clinicId: CLINIC, userId: null },
    );
    expect(result).toEqual({ status: 'REISSUED', whatsappMessageId: 'msg-1' });
  });

  it('includes a portal link built from the new raw token, never the old token', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalReissueService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.reissue(expiredResolution());

    const [input] = wa.sendTemplate.mock.calls[0];
    expect(input.variables.portal_link).toMatch(/^https:\/\/portal\.breeyo\.app\//);
  });
});
