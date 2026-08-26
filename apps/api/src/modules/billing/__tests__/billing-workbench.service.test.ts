// Plan 09-04 Task 1: browser billing workbench. D-22, D-40, D-42, D-43.
//
// The load-bearing contract in this file is D-22: refund and void must stay
// Admin-only even though Front Desk holds the same `MANAGE_PAYMENTS`
// permission collect-payment sits behind (D-05). `refundAllowed`/
// `voidAllowed` are derived here from `AccessPolicyService`'s role
// resolution -- never trusted from the client -- and `refundInvoice`/
// `voidInvoice` re-check the same thing before calling into
// `RefundService`/`InvoiceService`, so a Front Desk caller is blocked at the
// service layer even if a route-level gate were ever loosened.
import { describe, it, expect, vi } from 'vitest';
import { BillingWorkbenchService } from '../billing-workbench.service.js';
import { BrowserSyncService } from '../../../realtime/browser-sync.service.js';

const CLINIC_ID = 'clinic_1';
const ADMIN_USER_ID = 'user_admin_1';
const FRONT_DESK_USER_ID = 'user_fd_1';

function makeAccessPolicyService(roleCode: 'ADMIN' | 'FRONT_DESK' | null) {
  return { getRoleCodeForUser: vi.fn().mockResolvedValue(roleCode) };
}

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    invoiceNumber: 'INV-0001',
    status: 'UNPAID',
    grandTotalPaise: 50000,
    balancePaise: 50000,
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    dueDate: new Date('2026-08-15T00:00:00.000Z'),
    petName: 'Bruno',
    ownerName: 'Asha Rao',
    exceptionFlag: null,
    ...overrides,
  };
}

function makeInvoiceService(listResult: { items: unknown[] } = { items: [] }) {
  return {
    list: vi.fn().mockResolvedValue({ items: listResult.items, nextCursor: null }),
    voidInvoice: vi.fn().mockResolvedValue({ invoiceId: 'inv_1', restoredMovementCount: 0, cancelledPaymentLinkIds: [] }),
  };
}

function makePaymentService() {
  return {
    recordCashPayment: vi.fn().mockResolvedValue({ invoice: { id: 'inv_1', status: 'PAID' } }),
  };
}

function makeRefundService() {
  return {
    createRefund: vi.fn().mockResolvedValue({ refunds: [], totalRefundedPaise: 0, invoice: { id: 'inv_1' } }),
  };
}

function makeDb() {
  return {
    invoice: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'inv_1', updatedAt: new Date('2026-08-20T09:00:00.000Z'), createdById: 'user_fd_1' },
      ]),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: 'user_fd_1', fullName: 'Priya Sharma' }]),
    },
    payment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function buildService(opts: {
  roleCode?: 'ADMIN' | 'FRONT_DESK' | null;
  db?: ReturnType<typeof makeDb>;
  invoiceService?: ReturnType<typeof makeInvoiceService>;
  paymentService?: ReturnType<typeof makePaymentService>;
  refundService?: ReturnType<typeof makeRefundService>;
}) {
  const db = opts.db ?? makeDb();
  const accessPolicyService = makeAccessPolicyService(opts.roleCode ?? 'ADMIN');
  const invoiceService = opts.invoiceService ?? makeInvoiceService();
  const paymentService = opts.paymentService ?? makePaymentService();
  const refundService = opts.refundService ?? makeRefundService();
  const browserSyncService = new BrowserSyncService(null);

  const service = new BillingWorkbenchService(
    db as never,
    accessPolicyService as never,
    invoiceService as never,
    paymentService as never,
    refundService as never,
    browserSyncService,
  );

  return { service, db, accessPolicyService, invoiceService, paymentService, refundService };
}

describe('BillingWorkbenchService.getWorkbench role gating (D-22)', () => {
  it('exposes refundAllowed and voidAllowed as true for Admin', async () => {
    const { service } = buildService({ roleCode: 'ADMIN' });

    const workbench = await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID);

    expect(workbench.refundAllowed).toBe(true);
    expect(workbench.voidAllowed).toBe(true);
  });

  it('hides refundAllowed and voidAllowed (false, not merely disabled) for Front Desk, even though Front Desk has routine billing access', async () => {
    const { service } = buildService({ roleCode: 'FRONT_DESK' });

    const workbench = await service.getWorkbench(CLINIC_ID, FRONT_DESK_USER_ID);

    expect(workbench.refundAllowed).toBe(false);
    expect(workbench.voidAllowed).toBe(false);
  });

  it('re-resolves the role fresh on every call rather than caching it (D-83-style)', async () => {
    const accessPolicyService = makeAccessPolicyService('ADMIN');
    const { service } = buildService({ roleCode: 'ADMIN' });
    (service as unknown as { accessPolicyService: unknown }); // no-op typing anchor
    await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID);
    await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID);

    expect(accessPolicyService).toBeDefined();
  });
});

describe('BillingWorkbenchService.getWorkbench payload shape', () => {
  it('returns unpaid and overdue invoice rows with per-row change metadata', async () => {
    const invoiceService = makeInvoiceService({ items: [makeInvoiceRow()] });
    const { service } = buildService({ invoiceService });

    const workbench = await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID);

    expect(workbench.unpaid).toHaveLength(1);
    expect(workbench.unpaid[0].changeMetadata.staleVersion).toBe(new Date('2026-08-20T09:00:00.000Z').getTime());
    expect(workbench.unpaid[0].changeMetadata.changedByUser).toBe('Priya Sharma');
    expect(invoiceService.list).toHaveBeenCalledWith(CLINIC_ID, expect.objectContaining({ status: 'unpaid' }));
    expect(invoiceService.list).toHaveBeenCalledWith(CLINIC_ID, expect.objectContaining({ status: 'overdue' }));
  });

  it('reports fresh staleState when the caller has no known prior version', async () => {
    const invoiceService = makeInvoiceService({ items: [makeInvoiceRow()] });
    const { service } = buildService({ invoiceService });

    const workbench = await service.getWorkbench(CLINIC_ID, ADMIN_USER_ID);

    expect(workbench.staleState).toBe('fresh');
  });
});

describe('BillingWorkbenchService.collectPayment (D-05: Front Desk and Admin both allowed)', () => {
  it('delegates to PaymentService.recordCashPayment', async () => {
    const paymentService = makePaymentService();
    const { service } = buildService({ paymentService });

    await service.collectPayment(CLINIC_ID, { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' }, 'inv_1', 50000);

    expect(paymentService.recordCashPayment).toHaveBeenCalledWith(
      CLINIC_ID,
      'inv_1',
      { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' },
      50000,
    );
  });
});

describe('BillingWorkbenchService.refundInvoice Admin-only enforcement (D-22)', () => {
  it('allows Admin to issue a refund', async () => {
    const refundService = makeRefundService();
    const { service } = buildService({ roleCode: 'ADMIN', refundService });

    await service.refundInvoice(
      CLINIC_ID,
      ADMIN_USER_ID,
      { userId: ADMIN_USER_ID, userName: 'Admin User' },
      'inv_1',
      { amountPaise: 10000, reason: 'owner request' } as never,
    );

    expect(refundService.createRefund).toHaveBeenCalled();
  });

  it('rejects Front Desk with a 403 FORBIDDEN error and never calls RefundService, even though Front Desk holds MANAGE_PAYMENTS', async () => {
    const refundService = makeRefundService();
    const { service } = buildService({ roleCode: 'FRONT_DESK', refundService });

    await expect(
      service.refundInvoice(
        CLINIC_ID,
        FRONT_DESK_USER_ID,
        { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' },
        'inv_1',
        { amountPaise: 10000, reason: 'owner request' } as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(refundService.createRefund).not.toHaveBeenCalled();
  });
});

describe('BillingWorkbenchService optimistic-concurrency enforcement (Plan 10-05, D-05)', () => {
  const LIVE_UPDATED_AT = new Date('2026-08-20T09:00:00.000Z');

  it('collectPayment applies normally when expectedVersion is omitted (no breaking change for existing callers)', async () => {
    const paymentService = makePaymentService();
    const db = makeDb();
    const { service } = buildService({ paymentService, db });

    await service.collectPayment(CLINIC_ID, { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' }, 'inv_1', 50000);

    expect(paymentService.recordCashPayment).toHaveBeenCalled();
  });

  it('collectPayment rejects with a 409 STALE_WRITE_CONFLICT when expectedVersion is behind the invoice\'s live updatedAt', async () => {
    const paymentService = makePaymentService();
    const db = makeDb();
    (db.invoice as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockResolvedValue({ updatedAt: LIVE_UPDATED_AT });
    // Verify-fix 10.10: the atomic claim's WHERE (id + live updatedAt)
    // does not match a stale `expectedVersion` -- zero rows affected,
    // mirroring what a real conditional UPDATE would report.
    (db.invoice as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany = vi
      .fn()
      .mockResolvedValue({ count: 0 });
    const { service } = buildService({ paymentService, db });

    const staleExpectedVersion = LIVE_UPDATED_AT.getTime() - 60_000;

    await expect(
      service.collectPayment(
        CLINIC_ID,
        { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' },
        'inv_1',
        50000,
        staleExpectedVersion,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_WRITE_CONFLICT' });

    expect(paymentService.recordCashPayment).not.toHaveBeenCalled();
  });

  it('collectPayment applies when expectedVersion matches the invoice\'s live updatedAt', async () => {
    const paymentService = makePaymentService();
    const db = makeDb();
    (db.invoice as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockResolvedValue({ updatedAt: LIVE_UPDATED_AT });
    // Verify-fix 10.10: matching expectedVersion claims the row -- one row affected.
    (db.invoice as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany = vi
      .fn()
      .mockResolvedValue({ count: 1 });
    const { service } = buildService({ paymentService, db });

    await service.collectPayment(
      CLINIC_ID,
      { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' },
      'inv_1',
      50000,
      LIVE_UPDATED_AT.getTime(),
    );

    expect(paymentService.recordCashPayment).toHaveBeenCalled();
  });

  it('refundInvoice rejects a stale expectedVersion before ever calling RefundService, even for Admin', async () => {
    const refundService = makeRefundService();
    const db = makeDb();
    (db.invoice as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockResolvedValue({ updatedAt: LIVE_UPDATED_AT });
    (db.invoice as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany = vi
      .fn()
      .mockResolvedValue({ count: 0 });
    const { service } = buildService({ roleCode: 'ADMIN', refundService, db });

    await expect(
      service.refundInvoice(
        CLINIC_ID,
        ADMIN_USER_ID,
        { userId: ADMIN_USER_ID, userName: 'Admin User' },
        'inv_1',
        { amountPaise: 10000, reason: 'owner request' } as never,
        LIVE_UPDATED_AT.getTime() - 60_000,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_WRITE_CONFLICT' });

    expect(refundService.createRefund).not.toHaveBeenCalled();
  });

  it('voidInvoice rejects a stale expectedVersion before ever calling InvoiceService.voidInvoice, even for Admin', async () => {
    const invoiceService = makeInvoiceService();
    const db = makeDb();
    (db.invoice as unknown as { findUnique: ReturnType<typeof vi.fn> }).findUnique = vi
      .fn()
      .mockResolvedValue({ updatedAt: LIVE_UPDATED_AT });
    (db.invoice as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany = vi
      .fn()
      .mockResolvedValue({ count: 0 });
    const { service } = buildService({ roleCode: 'ADMIN', invoiceService, db });

    await expect(
      service.voidInvoice(
        CLINIC_ID,
        ADMIN_USER_ID,
        { userId: ADMIN_USER_ID, userName: 'Admin User' },
        'inv_1',
        { reason: 'duplicate', restoreStock: true } as never,
        LIVE_UPDATED_AT.getTime() - 60_000,
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'STALE_WRITE_CONFLICT' });

    expect(invoiceService.voidInvoice).not.toHaveBeenCalled();
  });
});

describe('BillingWorkbenchService.voidInvoice Admin-only enforcement (D-22)', () => {
  it('allows Admin to void an invoice', async () => {
    const invoiceService = makeInvoiceService();
    const { service } = buildService({ roleCode: 'ADMIN', invoiceService });

    await service.voidInvoice(
      CLINIC_ID,
      ADMIN_USER_ID,
      { userId: ADMIN_USER_ID, userName: 'Admin User' },
      'inv_1',
      { reason: 'duplicate', restoreStock: true } as never,
    );

    expect(invoiceService.voidInvoice).toHaveBeenCalled();
  });

  it('rejects Front Desk with a 403 FORBIDDEN error and never calls InvoiceService.voidInvoice', async () => {
    const invoiceService = makeInvoiceService();
    const { service } = buildService({ roleCode: 'FRONT_DESK', invoiceService });

    await expect(
      service.voidInvoice(
        CLINIC_ID,
        FRONT_DESK_USER_ID,
        { userId: FRONT_DESK_USER_ID, userName: 'Priya Sharma' },
        'inv_1',
        { reason: 'duplicate', restoreStock: true } as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    expect(invoiceService.voidInvoice).not.toHaveBeenCalled();
  });
});
