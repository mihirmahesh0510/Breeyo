// Wave 0 scaffold (09-01-PLAN.md Task 1): exercises the shared session-state
// and session-restore contracts from `@breeyo/shared/owner-portal` that a
// later plan (09-05) wires into an actual Prisma-backed
// `portal-session.service.ts`. No DB access happens here — Task 3 (blocking
// schema push) has not run yet.
import { describe, it, expect } from 'vitest';
import {
  ownerPortalSessionSchema,
  ownerPortalCheckoutSchema,
  sessionRestoreStateSchema,
} from '@breeyo/shared/owner-portal';

const MAGIC_LINK_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const INVOICE_ID_1 = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';
const INVOICE_ID_2 = 'b6b6f1c2-9e2a-4b3d-8f2a-1a2b3c4d5e6f';
const PET_ID = 'c1d2e3f4-5a6b-7c8d-9e0f-1a2b3c4d5e6f';

describe('session-restore state (D-53)', () => {
  it('accepts a full last-viewed restore payload within a valid link window', () => {
    const result = sessionRestoreStateSchema.safeParse({
      lastTab: 'RECORDS',
      lastPetId: PET_ID,
      lastInvoiceId: null,
      lastVisitId: null,
      lastCheckoutSessionId: null,
      lastReturnState: null,
    });

    expect(result.success).toBe(true);
  });
});

describe('session state envelope — no data outside READY (OWN-04, OWN-06)', () => {
  it('accepts a READY envelope carrying session data', () => {
    const result = ownerPortalSessionSchema.safeParse({
      state: 'READY',
      data: { magicLinkId: MAGIC_LINK_ID, defaultTab: 'OVERVIEW' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an EXPIRED envelope that carries a data payload', () => {
    const result = ownerPortalSessionSchema.safeParse({
      state: 'EXPIRED',
      data: { magicLinkId: MAGIC_LINK_ID, defaultTab: 'OVERVIEW' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an INVALID envelope that carries a data payload', () => {
    const result = ownerPortalSessionSchema.safeParse({
      state: 'INVALID',
      data: { magicLinkId: MAGIC_LINK_ID, defaultTab: 'OVERVIEW' },
    });

    expect(result.success).toBe(false);
  });
});

describe('multi-invoice checkout selection constraints (D-59, D-69, D-70)', () => {
  it('accepts a combined checkout across two pet-scoped invoices', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [INVOICE_ID_1, INVOICE_ID_2],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a checkout with zero selected invoices', () => {
    const result = ownerPortalCheckoutSchema.safeParse({
      magicLinkId: MAGIC_LINK_ID,
      selectedInvoiceIds: [],
    });

    expect(result.success).toBe(false);
  });
});
