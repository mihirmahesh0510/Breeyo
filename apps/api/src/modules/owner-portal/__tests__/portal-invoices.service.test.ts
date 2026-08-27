// Plan 09-05 Task 1: OWN-02, D-59 — pet-scoped invoice browsing. Not part of
// the plan's required Task 1 verify command, but the module follows the same
// mocked-collaborator convention as its siblings for consistency.
//
// WR-9: pet/invoice scope is a LIVE query by (ownerId, clinicId), never a
// frozen allow-list snapshotted at issuance — `buildDb` below mocks
// `pet.findFirst` (for the scope check) and `invoice.findMany` (for the
// listing itself) directly.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalInvoicesService } from '../portal-invoices.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_OUT_OF_SCOPE = '55555555-5555-4555-8555-555555555555';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDb(invoices: unknown[] = [], pet: unknown = { id: PET_1 }) {
  return {
    pet: {
      findFirst: vi.fn().mockResolvedValue(pet),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue(invoices),
    },
  };
}

describe('PortalInvoicesService — pet-scope enforcement (OWN-06)', () => {
  it('returns null and never queries for a petId outside scope', async () => {
    const db = buildDb([], null);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    const result = await service.getInvoicesForPet(scope(), PET_OUT_OF_SCOPE);

    expect(result).toBeNull();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it('filters live by petId, ownerId, clinicId, and excludes DRAFT — never by petId alone', async () => {
    const db = buildDb([]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    await service.getInvoicesForPet(scope(), PET_1);

    const args = db.invoice.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      petId: PET_1,
      ownerId: OWNER,
      clinicId: CLINIC,
      status: { not: 'DRAFT' },
    });
  });
});

describe('PortalInvoicesService — invoice summary projection (OWN-02, D-59)', () => {
  it('maps invoice rows to the owner-facing summary shape', async () => {
    const db = buildDb([
      {
        id: INVOICE_1,
        petId: PET_1,
        invoiceNumber: 'INV-202608-0001',
        status: 'UNPAID',
        grandTotalPaise: 50000,
        balancePaise: 50000,
        dueDate: new Date('2026-08-15T00:00:00.000Z'),
      },
    ]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    const result = await service.getInvoicesForPet(scope(), PET_1);

    expect(result?.invoices).toEqual([
      {
        invoiceId: INVOICE_1,
        petId: PET_1,
        invoiceNumber: 'INV-202608-0001',
        status: 'UNPAID',
        grandTotalPaise: 50000,
        balancePaise: 50000,
        dueDate: '2026-08-15T00:00:00.000Z',
      },
    ]);
  });

  it('surfaces an invoice created AFTER the link was issued, with no reissue required (WR-9)', async () => {
    // Pre-fix, this invoice would be absent from `scope.allowedInvoiceIds`
    // (frozen at issuance) and silently dropped by the `id: { in: ... } }`
    // filter. The live query has nothing frozen to exclude it.
    const NEW_INVOICE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const db = buildDb([
      {
        id: NEW_INVOICE,
        petId: PET_1,
        invoiceNumber: 'INV-202608-0099',
        status: 'UNPAID',
        grandTotalPaise: 10000,
        balancePaise: 10000,
        dueDate: null,
      },
    ]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    const result = await service.getInvoicesForPet(scope(), PET_1);

    expect(result?.invoices.map((invoice) => invoice.invoiceId)).toContain(NEW_INVOICE);
  });

  it('never asks the database for a DRAFT invoice', async () => {
    const db = buildDb([]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    await service.getInvoicesForPet(scope(), PET_1);

    const args = db.invoice.findMany.mock.calls[0][0];
    expect(args.where.status).toEqual({ not: 'DRAFT' });
  });
});
