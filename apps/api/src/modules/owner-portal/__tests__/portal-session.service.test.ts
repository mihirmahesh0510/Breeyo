// Plan 09-05 Task 1: replaces the Wave 0 scaffold (09-01-PLAN.md Task 1),
// which only exercised `@breeyo/validators` schemas directly. These tests
// drive the real `PortalSessionService` against a mocked
// `TenantPrismaClient` (the `invoice.service.test.ts` "mocked collaborators"
// style — no real DB).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalSessionService } from '../portal-session.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_2 = '55555555-5555-4555-8555-555555555555';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';
const INVOICE_2 = '77777777-7777-4777-8777-777777777777';

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    allowedPetIds: [PET_1, PET_2],
    allowedInvoiceIds: [INVOICE_1, INVOICE_2],
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDb(overrides: Record<string, unknown> = {}) {
  return {
    petOwner: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Asha Rao' }),
    },
    clinic: {
      findUnique: vi.fn().mockResolvedValue({ contactPhone: '+919876543210' }),
    },
    pet: {
      findMany: vi.fn().mockResolvedValue([
        { id: PET_1, name: 'Rocky', species: 'DOG', photoUrl: null },
        { id: PET_2, name: 'Whiskers', species: 'CAT', photoUrl: 'https://example.com/w.jpg' },
      ]),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([
        { id: INVOICE_1, petId: PET_1, balancePaise: 50000 },
        { id: INVOICE_2, petId: PET_2, balancePaise: 0 },
      ]),
    },
    ownerPortalSessionState: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    ownerPortalMagicLink: {
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('PortalSessionService.getSession — overview assembly (D-46 to D-56)', () => {
  it('assembles owner name, pet snapshots with per-pet unpaid flags, and total due', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.magicLinkId).toBe(LINK_ID);
    expect(session.defaultTab).toBe('OVERVIEW');
    expect(session.ownerName).toBe('Asha Rao');
    expect(session.pets).toEqual([
      { petId: PET_1, name: 'Rocky', species: 'DOG', photoUrl: null, hasUnpaidInvoice: true },
      {
        petId: PET_2,
        name: 'Whiskers',
        species: 'CAT',
        photoUrl: 'https://example.com/w.jpg',
        hasUnpaidInvoice: false,
      },
    ]);
    expect(session.totalDuePaise).toBe(50000);
  });

  it('includes the clinic contact number for D-52/D-79 help-bar actions', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.clinicPhone).toBe('+919876543210');
    expect(db.clinic.findUnique).toHaveBeenCalledWith({
      where: { id: CLINIC },
      select: { contactPhone: true },
    });
  });

  it('falls back to an empty clinicPhone rather than throwing if the clinic row is somehow missing', async () => {
    const db = buildDb({ clinic: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.clinicPhone).toBe('');
  });

  it('touches lastViewedAt on the magic-link row (best-effort)', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    await service.getSession(scope());

    expect(db.ownerPortalMagicLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: { lastViewedAt: expect.any(Date) },
    });
  });

  it('never fails the session read if the lastViewedAt touch fails', async () => {
    const db = buildDb({
      ownerPortalMagicLink: { update: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const service = new PortalSessionService(db as never);

    await expect(service.getSession(scope())).resolves.toBeDefined();
  });

  it('surfaces a deep-link target from scope when one is set', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(
      scope({ deepLinkType: 'INVOICE', deepLinkEntityId: INVOICE_1 }),
    );

    expect(session.deepLink).toEqual({ type: 'INVOICE', entityId: INVOICE_1 });
  });

  it('has no deep-link target when the scope carries none', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.deepLink).toBeNull();
  });
});

describe('PortalSessionService restore state (D-53)', () => {
  it('returns all-null restore fields when no session-state row exists yet', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.restore).toEqual({
      lastTab: null,
      lastPetId: null,
      lastInvoiceId: null,
      lastVisitId: null,
      lastCheckoutSessionId: null,
      lastReturnState: null,
    });
  });

  it('restores the last-viewed tab and pet from a persisted session-state row', async () => {
    const db = buildDb({
      ownerPortalSessionState: {
        findFirst: vi.fn().mockResolvedValue({
          lastTab: 'RECORDS',
          lastPetId: PET_2,
          lastInvoiceId: null,
          lastVisitId: null,
          lastCheckoutSessionId: null,
          lastReturnState: null,
        }),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    const service = new PortalSessionService(db as never);

    const session = await service.getSession(scope());

    expect(session.restore.lastTab).toBe('RECORDS');
    expect(session.restore.lastPetId).toBe(PET_2);
  });

  it('creates a new session-state row on first restore-state update', async () => {
    const db = buildDb();
    const service = new PortalSessionService(db as never);

    await service.updateRestoreState(LINK_ID, { lastTab: 'INVOICES', lastPetId: PET_1 });

    expect(db.ownerPortalSessionState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ magicLinkId: LINK_ID, lastTab: 'INVOICES', lastPetId: PET_1 }),
    });
  });

  it('updates the existing session-state row rather than creating a duplicate', async () => {
    const existing = { id: 'state-1', magicLinkId: LINK_ID };
    const db = buildDb({
      ownerPortalSessionState: {
        findFirst: vi.fn().mockResolvedValue(existing),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    });
    const service = new PortalSessionService(db as never);

    await service.updateRestoreState(LINK_ID, { lastTab: 'INVOICES' });

    expect(db.ownerPortalSessionState.update).toHaveBeenCalledWith({
      where: { id: 'state-1' },
      data: expect.objectContaining({ lastTab: 'INVOICES' }),
    });
    expect(db.ownerPortalSessionState.create).not.toHaveBeenCalled();
  });
});
