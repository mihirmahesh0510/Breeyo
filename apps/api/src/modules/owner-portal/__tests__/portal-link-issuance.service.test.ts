// Plan 09-05 (D-84, PHASE-09-VERIFY-FIX-PLAN.md finding 9.1): the FIRST
// `OwnerPortalMagicLink` a clinic ever sends an owner. Piggybacks the
// existing Phase 6 invoice-finalization flow (`invoice.service.ts`) rather
// than adding a new staff-facing "send portal link" action or firing on
// every completed consultation (D-84 explicitly rejected both).
//
// Mocked collaborators, no real DB / WhatsApp send — same style as
// `portal-reissue.service.test.ts`, which this service's create-and-send
// shape mirrors.
import { describe, it, expect, vi } from 'vitest';
import { PortalLinkIssuanceService } from '../portal-link-issuance.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const NEW_LINK_ID = '44444444-4444-4444-8444-444444444444';
const PET_1 = '55555555-5555-4555-8555-555555555555';
const PET_2 = '66666666-6666-4666-8666-666666666666';
const INVOICE_1 = '77777777-7777-4777-8777-777777777777';

function buildDb(overrides: Record<string, unknown> = {}) {
  return {
    ownerPortalMagicLink: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: NEW_LINK_ID }),
    },
    petOwner: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Asha Rao', mobile: '+919812345678' }),
    },
    pet: {
      findMany: vi.fn().mockResolvedValue([{ id: PET_1 }, { id: PET_2 }]),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([{ id: INVOICE_1 }]),
    },
    ...overrides,
  };
}

function buildWhatsAppService() {
  return {
    sendTemplate: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  };
}

describe('PortalLinkIssuanceService.issueFirstLinkIfNeeded — no existing link (D-84)', () => {
  it('creates a new OwnerPortalMagicLink row scoped to the owner\'s full current pets/invoices', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    expect(result.status).toBe('ISSUED');
    expect(db.ownerPortalMagicLink.create).toHaveBeenCalledTimes(1);
    const createArgs = db.ownerPortalMagicLink.create.mock.calls[0][0].data;
    expect(createArgs.clinicId).toBe(CLINIC);
    expect(createArgs.ownerId).toBe(OWNER);
    expect(createArgs.defaultTab).toBe('OVERVIEW');
    expect(createArgs.allowedPetIdsJson).toEqual([PET_1, PET_2]);
    expect(createArgs.allowedInvoiceIdsJson).toEqual([INVOICE_1]);
  });

  it('queries the owner\'s pets/invoices fresh rather than trusting any caller-supplied list', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    expect(db.pet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerId: OWNER, clinicId: CLINIC }) }),
    );
    expect(db.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ownerId: OWNER, clinicId: CLINIC }) }),
    );
  });

  it('never persists the raw token, only its hash', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    const createArgs = db.ownerPortalMagicLink.create.mock.calls[0][0].data;
    expect(createArgs.tokenHash).toBeDefined();
    expect(typeof createArgs.tokenHash).toBe('string');
    expect(createArgs.tokenHash).toHaveLength(64); // sha256 hex digest
    expect(createArgs).not.toHaveProperty('rawToken');
  });

  it('sets a 7-day expiry from issuance', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    const createArgs = db.ownerPortalMagicLink.create.mock.calls[0][0].data;
    const issuedAt = createArgs.issuedAt as Date;
    const expiresAt = createArgs.expiresAt as Date;
    const diffMs = expiresAt.getTime() - issuedAt.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('sends the owner_portal_link WhatsApp template with a portal link built from the new raw token', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

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
    const [input] = wa.sendTemplate.mock.calls[0];
    expect(input.variables.portal_link).toMatch(/^https:\/\/portal\.breeyo\.app\//);
    expect(result).toEqual({ status: 'ISSUED', whatsappMessageId: 'msg-1' });
  });
});

describe('PortalLinkIssuanceService.issueFirstLinkIfNeeded — an active link already exists (D-84)', () => {
  it('does nothing: no new row, no WhatsApp send', async () => {
    const db = buildDb({
      ownerPortalMagicLink: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-link' }),
        create: vi.fn(),
      },
    });
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    expect(result).toEqual({ status: 'ALREADY_ACTIVE' });
    expect(db.ownerPortalMagicLink.create).not.toHaveBeenCalled();
    expect(wa.sendTemplate).not.toHaveBeenCalled();
  });

  it('checks for a non-revoked, non-expired link only', async () => {
    const db = buildDb();
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    const args = db.ownerPortalMagicLink.findFirst.mock.calls[0][0];
    expect(args.where.ownerId).toBe(OWNER);
    expect(args.where.clinicId).toBe(CLINIC);
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
  });
});

describe('PortalLinkIssuanceService.issueFirstLinkIfNeeded — no phone on file', () => {
  it('skips issuance without throwing when the owner has no WhatsApp number', async () => {
    const db = buildDb({
      petOwner: { findUnique: vi.fn().mockResolvedValue({ name: 'Asha Rao', mobile: '' }) },
    });
    const wa = buildWhatsAppService();
    const service = new PortalLinkIssuanceService(db as never, wa as never, 'https://portal.breeyo.app');

    const result = await service.issueFirstLinkIfNeeded(CLINIC, OWNER);

    expect(result).toEqual({ status: 'NO_PHONE' });
    expect(db.ownerPortalMagicLink.create).not.toHaveBeenCalled();
    expect(wa.sendTemplate).not.toHaveBeenCalled();
  });
});
