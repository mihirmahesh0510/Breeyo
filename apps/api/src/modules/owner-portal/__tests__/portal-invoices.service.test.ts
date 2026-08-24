// Plan 09-05 Task 1: OWN-02, D-59 — pet-scoped invoice browsing. Not part of
// the plan's required Task 1 verify command, but the module follows the same
// mocked-collaborator convention as its siblings for consistency.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalInvoicesService } from '../portal-invoices.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_OUT_OF_SCOPE = '55555555-5555-4555-8555-555555555555';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';
const INVOICE_OUT_OF_SCOPE = '77777777-7777-4777-8777-777777777777';

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    allowedPetIds: [PET_1],
    allowedInvoiceIds: [INVOICE_1],
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDb(invoices: unknown[] = []) {
  return {
    invoice: {
      findMany: vi.fn().mockResolvedValue(invoices),
    },
  };
}

describe('PortalInvoicesService — pet-scope enforcement (OWN-06)', () => {
  it('returns null and never queries for a petId outside scope', async () => {
    const db = buildDb();
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    const result = await service.getInvoicesForPet(scope(), PET_OUT_OF_SCOPE);

    expect(result).toBeNull();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });

  it('filters by both petId and the allowed-invoice-id allow-list, never by petId alone', async () => {
    const db = buildDb([]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    await service.getInvoicesForPet(scope(), PET_1);

    const args = db.invoice.findMany.mock.calls[0][0];
    expect(args.where.petId).toBe(PET_1);
    expect(args.where.id).toEqual({ in: [INVOICE_1] });
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

  it('never returns an invoice not present in the allow-list even if it shares the pet', async () => {
    // Simulates the DB call already being filtered — this asserts the
    // service does not ALSO need a redundant client-side filter to be safe,
    // because the query itself is scoped by INVOICE_OUT_OF_SCOPE being
    // excluded up front.
    const db = buildDb([]);
    const service = new PortalInvoicesService(db as never, new AccessScopeService());

    await service.getInvoicesForPet(scope(), PET_1);

    const args = db.invoice.findMany.mock.calls[0][0];
    expect(args.where.id.in).not.toContain(INVOICE_OUT_OF_SCOPE);
  });
});
