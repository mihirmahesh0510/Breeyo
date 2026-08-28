// Plan 09-05 Task 2: OWN-03, D-59, D-66, D-69, D-70 — combined checkout
// delegating payment-link creation to the billing PaymentService (never a
// second payment system). Mocked collaborators, no real DB / Razorpay.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalCheckoutService } from '../portal-checkout.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_2 = '55555555-5555-4555-8555-555555555555';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';
const INVOICE_2 = '77777777-7777-4777-8777-777777777777';
const INVOICE_OUT_OF_SCOPE = '88888888-8888-4888-8888-888888888888';
const STAFF_USER = '99999999-9999-4999-8999-999999999999';
const CHECKOUT_SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_1,
    petId: PET_1,
    createdById: STAFF_USER,
    balancePaise: 50000,
    pet: { name: 'Rocky' },
    ...overrides,
  };
}

// WR-9: `areInvoicesInScope` is now a live `invoice.count` query, never a
// frozen allow-list. `invoiceCount` defaults to `invoices.length` (a clean
// scope match); pass it explicitly to simulate a scope mismatch or a
// belt-and-suspenders count/findMany discrepancy.
function buildDb(invoices: unknown[] = [invoiceRow()], invoiceCount: number = invoices.length) {
  return {
    invoice: {
      count: vi.fn().mockResolvedValue(invoiceCount),
      findMany: vi.fn().mockResolvedValue(invoices),
    },
    ownerPortalCheckoutSession: {
      create: vi.fn().mockResolvedValue({ id: CHECKOUT_SESSION_ID }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildPaymentService() {
  return {
    createPaymentLink: vi.fn().mockResolvedValue({
      paymentLinkId: 'plink_1',
      shortUrl: 'https://rzp.io/l/plink_1',
      expiresAt: new Date('2026-08-02T00:00:00.000Z'),
      amountPaise: 50000,
    }),
    createCombinedPaymentLink: vi.fn().mockResolvedValue({
      paymentLinkId: 'plink_combined',
      shortUrl: 'https://rzp.io/l/plink_combined',
      expiresAt: new Date('2026-08-02T00:00:00.000Z'),
      amountPaise: 90000,
      paymentGroupId: 'group_1',
      invoices: [],
    }),
  };
}

describe('PortalCheckoutService — scope re-check (OWN-06, T-09-15)', () => {
  it('refuses and never queries invoices for a selection outside the allowed-invoice scope', async () => {
    const db = buildDb([], 0); // live count comes back short: nothing resolves for this owner
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), [INVOICE_OUT_OF_SCOPE]);

    expect(result).toBeNull();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
    expect(paymentService.createPaymentLink).not.toHaveBeenCalled();
  });

  it('allows checkout of an invoice created AFTER the link was issued, with no reissue required (WR-9)', async () => {
    const NEW_INVOICE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const db = buildDb([invoiceRow({ id: NEW_INVOICE })]);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), [NEW_INVOICE]);

    expect(result).not.toBeNull();
    expect(db.invoice.count).toHaveBeenCalledWith({
      where: { id: { in: [NEW_INVOICE] }, ownerId: OWNER, clinicId: CLINIC, status: { not: 'DRAFT' } },
    });
  });

  it('refuses an empty selection', async () => {
    const db = buildDb();
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), []);

    expect(result).toBeNull();
  });
});

describe('PortalCheckoutService — single-invoice checkout (OWN-03, D-66)', () => {
  it('delegates to PaymentService.createPaymentLink for exactly one invoice', async () => {
    const db = buildDb([invoiceRow()]);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), [INVOICE_1]);

    expect(paymentService.createPaymentLink).toHaveBeenCalledWith(
      CLINIC,
      INVOICE_1,
      expect.objectContaining({ userId: STAFF_USER }),
    );
    expect(paymentService.createCombinedPaymentLink).not.toHaveBeenCalled();
    expect(result?.paymentLink.paymentLinkId).toBe('plink_1');
    expect(result?.amountDuePaise).toBe(50000);
  });
});

describe('PortalCheckoutService — combined multi-invoice checkout (D-59, D-69, D-70)', () => {
  it('delegates to PaymentService.createCombinedPaymentLink for multiple invoices with a pet breakdown', async () => {
    const db = buildDb([
      invoiceRow({ id: INVOICE_1, petId: PET_1, balancePaise: 50000, pet: { name: 'Rocky' } }),
      invoiceRow({ id: INVOICE_2, petId: PET_2, balancePaise: 40000, pet: { name: 'Whiskers' } }),
    ]);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), [INVOICE_1, INVOICE_2]);

    expect(paymentService.createCombinedPaymentLink).toHaveBeenCalledWith(
      CLINIC,
      [INVOICE_1, INVOICE_2],
      expect.objectContaining({ userId: STAFF_USER }),
    );
    expect(paymentService.createPaymentLink).not.toHaveBeenCalled();
    expect(result?.amountDuePaise).toBe(90000);
    expect(result?.petBreakdown).toEqual([
      { petId: PET_1, petName: 'Rocky', invoiceIds: [INVOICE_1], amountPaise: 50000 },
      { petId: PET_2, petName: 'Whiskers', invoiceIds: [INVOICE_2], amountPaise: 40000 },
    ]);
  });

  it('deduplicates a repeated invoice id before delegating', async () => {
    const db = buildDb([invoiceRow()]);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    await service.createCheckout(scope(), [INVOICE_1, INVOICE_1]);

    expect(paymentService.createPaymentLink).toHaveBeenCalledTimes(1);
  });
});

describe('PortalCheckoutService — snapshot persistence (D-59, D-69, D-70)', () => {
  it('creates a pending OwnerPortalCheckoutSession snapshot, then records the payment link on it', async () => {
    const db = buildDb([invoiceRow()]);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    await service.createCheckout(scope(), [INVOICE_1]);

    expect(db.ownerPortalCheckoutSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        magicLinkId: LINK_ID,
        selectedInvoiceIdsJson: [INVOICE_1],
        amountDuePaise: 50000,
        returnState: 'pending',
      }),
    });
    expect(db.ownerPortalCheckoutSession.update).toHaveBeenCalledWith({
      where: { id: CHECKOUT_SESSION_ID },
      data: { razorpayPaymentLinkId: 'plink_1' },
    });
  });

  it('refuses when a selected invoice id does not resolve inside the clinic (belt-and-suspenders on top of scope check)', async () => {
    // The live scope check (count) passes, but the invoice vanished (voided/
    // deleted) between that check and this query — findMany comes back short.
    const db = buildDb([], 1);
    const paymentService = buildPaymentService();
    const service = new PortalCheckoutService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.createCheckout(scope(), [INVOICE_1]);

    expect(result).toBeNull();
    expect(paymentService.createPaymentLink).not.toHaveBeenCalled();
  });
});
