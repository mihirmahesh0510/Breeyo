// WR-9 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): pre-fix, `AccessScopeService`
// parsed a JSON snapshot of pet/invoice ids frozen on the `OwnerPortalMagicLink`
// row at issuance time (`allowedPetIdsJson`/`allowedInvoiceIdsJson`) and
// checked scope via plain array membership against that snapshot — a pet or
// invoice created for the SAME owner after the link was issued (or after any
// reissue, since reissue copied the snapshot forward verbatim) never appeared,
// for the link's entire life. These tests drive the fixed behavior: every
// scope check is now a LIVE database query keyed on (`ownerId`, `clinicId`) at
// request time. Mocked `TenantPrismaClient` collaborator, no real DB —
// same convention as this module's sibling service tests.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalMagicLinkRow, type OwnerPortalTokenScope } from '../access-scope.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const NEW_PET = '44444444-4444-4444-8444-444444444444';
const NEW_INVOICE = '55555555-5555-4555-8555-555555555555';
const OTHER_OWNERS_PET = '66666666-6666-4666-8666-666666666666';
const OTHER_OWNERS_INVOICE = '77777777-7777-4777-8777-777777777777';
const DRAFT_INVOICE = '88888888-8888-4888-8888-888888888888';

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AccessScopeService.deriveScope — no frozen id lists (WR-9)', () => {
  it('derives scope from just the link row, with no pet/invoice id list at all', () => {
    // This row is exactly what a validated `OwnerPortalMagicLink` looks like
    // now — notice there is nothing here to "refresh" or "go stale": no
    // allow-list field is read by `deriveScope` at all.
    const row: OwnerPortalMagicLinkRow = {
      id: LINK_ID,
      clinicId: CLINIC,
      ownerId: OWNER,
      defaultTab: 'OVERVIEW',
      deepLinkType: null,
      deepLinkEntityId: null,
      expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    };
    const service = new AccessScopeService();

    const result = service.deriveScope(row);

    expect(result).toEqual({
      magicLinkId: LINK_ID,
      clinicId: CLINIC,
      ownerId: OWNER,
      defaultTab: 'OVERVIEW',
      deepLinkType: null,
      deepLinkEntityId: null,
      expiresAt: row.expiresAt,
    });
    expect(result).not.toHaveProperty('allowedPetIds');
    expect(result).not.toHaveProperty('allowedInvoiceIds');
  });
});

describe('AccessScopeService.isPetInScope — live query, not a frozen snapshot (WR-9)', () => {
  it('treats a pet created AFTER the link was issued as in scope, with no reissue required', async () => {
    // Simulates a pet row that did not exist when the link was issued. A
    // live `pet.findFirst` by (ownerId, clinicId) finds it regardless of
    // when it was created — there is no snapshot to be stale.
    const db = { pet: { findFirst: vi.fn().mockResolvedValue({ id: NEW_PET }) } };
    const service = new AccessScopeService();

    const result = await service.isPetInScope(db as never, scope(), NEW_PET);

    expect(result).toBe(true);
    expect(db.pet.findFirst).toHaveBeenCalledWith({
      where: { id: NEW_PET, ownerId: OWNER, clinicId: CLINIC },
      select: { id: true },
    });
  });

  it('excludes a pet belonging to a DIFFERENT owner even in the same clinic (cross-owner isolation must not regress)', async () => {
    // A real `where: { ownerId: OWNER, ... }` filter simply never matches a
    // pet whose actual owner is someone else — simulated here by the mock
    // resolving null, exactly as Prisma would for a non-matching filter.
    const db = { pet: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AccessScopeService();

    const result = await service.isPetInScope(db as never, scope(), OTHER_OWNERS_PET);

    expect(result).toBe(false);
  });
});

describe('AccessScopeService.isInvoiceInScope — live query, not a frozen snapshot (WR-9)', () => {
  it('treats an invoice created AFTER the link was issued as in scope, with no reissue required', async () => {
    const db = { invoice: { findFirst: vi.fn().mockResolvedValue({ id: NEW_INVOICE }) } };
    const service = new AccessScopeService();

    const result = await service.isInvoiceInScope(db as never, scope(), NEW_INVOICE);

    expect(result).toBe(true);
    expect(db.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: NEW_INVOICE, ownerId: OWNER, clinicId: CLINIC, status: { not: 'DRAFT' } },
      select: { id: true },
    });
  });

  it('excludes an invoice belonging to a DIFFERENT owner (cross-owner isolation must not regress)', async () => {
    const db = { invoice: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AccessScopeService();

    const result = await service.isInvoiceInScope(db as never, scope(), OTHER_OWNERS_INVOICE);

    expect(result).toBe(false);
  });

  it('excludes a DRAFT invoice even if it belongs to the right owner/clinic', async () => {
    // A DRAFT is internal front-desk state the owner was never billed for.
    // Simulated by the (status-filtered) query resolving null.
    const db = { invoice: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new AccessScopeService();

    const result = await service.isInvoiceInScope(db as never, scope(), DRAFT_INVOICE);

    expect(result).toBe(false);
    expect(db.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'DRAFT' } }) }),
    );
  });
});

describe('AccessScopeService.areInvoicesInScope — live query over a set (WR-9)', () => {
  it('is in scope only when every requested id currently resolves for this owner/clinic', async () => {
    const db = { invoice: { count: vi.fn().mockResolvedValue(2) } };
    const service = new AccessScopeService();

    const result = await service.areInvoicesInScope(db as never, scope(), [NEW_INVOICE, 'another-invoice']);

    expect(result).toBe(true);
    expect(db.invoice.count).toHaveBeenCalledWith({
      where: {
        id: { in: [NEW_INVOICE, 'another-invoice'] },
        ownerId: OWNER,
        clinicId: CLINIC,
        status: { not: 'DRAFT' },
      },
    });
  });

  it('is never in scope for an empty list, without querying the database', async () => {
    const db = { invoice: { count: vi.fn() } };
    const service = new AccessScopeService();

    const result = await service.areInvoicesInScope(db as never, scope(), []);

    expect(result).toBe(false);
    expect(db.invoice.count).not.toHaveBeenCalled();
  });

  it('is out of scope when even one requested id fails to resolve (count mismatch)', async () => {
    // Simulates one of the two ids belonging to a different owner (or being
    // a DRAFT / not existing at all) — the count comes back short.
    const db = { invoice: { count: vi.fn().mockResolvedValue(1) } };
    const service = new AccessScopeService();

    const result = await service.areInvoicesInScope(db as never, scope(), [NEW_INVOICE, OTHER_OWNERS_INVOICE]);

    expect(result).toBe(false);
  });
});
