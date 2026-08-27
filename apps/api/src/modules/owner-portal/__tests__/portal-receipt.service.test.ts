// Finding 9.3 (PHASE-09-VERIFY-FIX-PLAN.md): D-71 promised "receipt access
// before navigating elsewhere" but no scoped, token-authenticated endpoint
// ever backed it -- the real PaymentReceipt system is staff-only. This
// service is that endpoint's backing: it re-checks the invoice belongs to
// the owner (WR-9: a LIVE `ownerId`/`clinicId` query, same `AccessScopeService`
// pattern as every other owner-portal service) before delegating to
// `PaymentService.getLatestReceiptForInvoice`, the real billing lookup,
// rather than reinventing receipt generation. Mocked collaborators, no real
// DB, following the same convention as `portal-invoices.service.test.ts` and
// siblings.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalReceiptService } from '../portal-receipt.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const INVOICE_1 = '66666666-6666-4666-8666-666666666666';
const INVOICE_OUT_OF_SCOPE = '77777777-7777-4777-8777-777777777777';

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

function buildPaymentService(receipt: unknown = null) {
  return {
    getLatestReceiptForInvoice: vi.fn().mockResolvedValue(receipt),
  };
}

// WR-9: `isInvoiceInScope` is now a live `invoice.findFirst` query.
function buildDb(invoice: unknown = { id: INVOICE_1 }) {
  return {
    invoice: {
      findFirst: vi.fn().mockResolvedValue(invoice),
    },
  };
}

describe('PortalReceiptService — scope enforcement (OWN-06, finding 9.3)', () => {
  it('refuses an invoiceId that does not currently belong to this owner without ever calling PaymentService', async () => {
    const paymentService = buildPaymentService();
    const service = new PortalReceiptService(
      buildDb(null) as never,
      new AccessScopeService(),
      paymentService as never,
    );

    const result = await service.getReceipt(scope(), INVOICE_OUT_OF_SCOPE);

    expect(result).toEqual({ status: 'OUT_OF_SCOPE' });
    expect(paymentService.getLatestReceiptForInvoice).not.toHaveBeenCalled();
  });

  it('allows an invoice created AFTER the link was issued, with no reissue required (WR-9)', async () => {
    const NEW_INVOICE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const receiptRow = {
      receiptNumber: 'RCT-202608-0002',
      amountPaise: 20000,
      method: 'upi',
      transactionRef: 'txn_1',
      issuedAt: new Date('2026-08-11T00:00:00.000Z'),
    };
    const paymentService = buildPaymentService(receiptRow);
    const db = buildDb({ id: NEW_INVOICE });
    const service = new PortalReceiptService(db as never, new AccessScopeService(), paymentService as never);

    const result = await service.getReceipt(scope(), NEW_INVOICE);

    expect(result.status).toBe('FOUND');
    expect(db.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: NEW_INVOICE, ownerId: OWNER, clinicId: CLINIC, status: { not: 'DRAFT' } },
      select: { id: true },
    });
  });
});

describe('PortalReceiptService — happy path (D-71, finding 9.3)', () => {
  it('delegates to PaymentService.getLatestReceiptForInvoice for an in-scope invoice and returns the receipt', async () => {
    const receiptRow = {
      receiptNumber: 'RCT-202608-0001',
      amountPaise: 50000,
      method: 'cash',
      transactionRef: null,
      issuedAt: new Date('2026-08-10T00:00:00.000Z'),
    };
    const paymentService = buildPaymentService(receiptRow);
    const service = new PortalReceiptService(
      buildDb() as never,
      new AccessScopeService(),
      paymentService as never,
    );

    const result = await service.getReceipt(scope(), INVOICE_1);

    expect(paymentService.getLatestReceiptForInvoice).toHaveBeenCalledWith(CLINIC, INVOICE_1);
    expect(result).toEqual({
      status: 'FOUND',
      receipt: {
        invoiceId: INVOICE_1,
        receiptNumber: 'RCT-202608-0001',
        amountPaise: 50000,
        method: 'cash',
        transactionRef: null,
        issuedAt: '2026-08-10T00:00:00.000Z',
      },
    });
  });

  it('returns NOT_FOUND for an in-scope invoice that has no receipt yet (still unpaid)', async () => {
    const paymentService = buildPaymentService(null);
    const service = new PortalReceiptService(
      buildDb() as never,
      new AccessScopeService(),
      paymentService as never,
    );

    const result = await service.getReceipt(scope(), INVOICE_1);

    expect(result).toEqual({ status: 'NOT_FOUND' });
  });
});
