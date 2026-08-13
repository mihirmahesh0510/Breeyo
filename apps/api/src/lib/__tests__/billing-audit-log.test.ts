import { describe, it, expect, vi } from 'vitest';
import {
  BillingAuditEvent,
  writeBillingAuditLog,
  writeBillingAuditLogSafe,
  type BillingAuditClient,
} from '../billing-audit-log.js';

/**
 * The plan routes end-to-end coverage of this module through the integration
 * suites in 06-08/09/10, which assert the expected row exists after each
 * operation. These unit tests cover the three claims those suites cannot: the
 * exact shape written, that the "safe" variant really does not throw, and that
 * the module exposes no mutation surface (D-32).
 */
function mockClient(create = vi.fn().mockResolvedValue({})) {
  return { client: { billingAuditLog: { create } } as BillingAuditClient, create };
}

describe('writeBillingAuditLog', () => {
  it('writes exactly one row with the supplied fields', async () => {
    const { client, create } = mockClient();

    await writeBillingAuditLog(client, BillingAuditEvent.INVOICE_FINALIZED, {
      clinicId: 'clinic-1',
      userId: 'user-1',
      invoiceId: 'invoice-1',
      ipAddress: '203.0.113.7',
      userAgent: 'breeyo-mobile/1.0',
      metadata: { documentNumber: 'INV-202605-0001' },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        clinicId: 'clinic-1',
        userId: 'user-1',
        event: 'INVOICE_FINALIZED',
        invoiceId: 'invoice-1',
        ipAddress: '203.0.113.7',
        userAgent: 'breeyo-mobile/1.0',
        metadata: { documentNumber: 'INV-202605-0001' },
      },
    });
  });

  it('defaults metadata to an empty object for a clinic-level event', async () => {
    const { client, create } = mockClient();

    await writeBillingAuditLog(client, BillingAuditEvent.BILLING_SETTINGS_UPDATED, {
      clinicId: 'clinic-1',
    });

    expect(create.mock.calls[0][0].data.metadata).toEqual({});
    expect(create.mock.calls[0][0].data.invoiceId).toBeUndefined();
  });

  it('propagates a write failure so a transactional caller rolls back', async () => {
    const { client } = mockClient(vi.fn().mockRejectedValue(new Error('insert failed')));

    await expect(
      writeBillingAuditLog(client, BillingAuditEvent.INVOICE_FINALIZED, { clinicId: 'clinic-1' }),
    ).rejects.toThrow('insert failed');
  });
});

describe('writeBillingAuditLogSafe', () => {
  it('does not throw when the write fails, and surfaces it through the logger', async () => {
    const { client } = mockClient(vi.fn().mockRejectedValue(new Error('insert failed')));
    const logger = { error: vi.fn() };

    await expect(
      writeBillingAuditLogSafe(
        client,
        BillingAuditEvent.WEBHOOK_SIGNATURE_REJECTED,
        { clinicId: 'clinic-1' },
        logger,
      ),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [payload] = logger.error.mock.calls[0];
    expect(payload).toMatchObject({ event: 'WEBHOOK_SIGNATURE_REJECTED', clinicId: 'clinic-1' });
  });

  it('does not throw when no logger is supplied', async () => {
    const { client } = mockClient(vi.fn().mockRejectedValue(new Error('insert failed')));
    await expect(
      writeBillingAuditLogSafe(client, BillingAuditEvent.PAYMENT_LINK_EXPIRED, {
        clinicId: 'clinic-1',
      }),
    ).resolves.toBeUndefined();
  });

  it('never logs the caller-supplied metadata, which may hold an unreviewed payload', async () => {
    const { client } = mockClient(vi.fn().mockRejectedValue(new Error('insert failed')));
    const logger = { error: vi.fn() };

    await writeBillingAuditLogSafe(
      client,
      BillingAuditEvent.WEBHOOK_SIGNATURE_REJECTED,
      { clinicId: 'clinic-1', metadata: { rawBody: 'card-number-like-payload' } },
      logger,
    );

    expect(JSON.stringify(logger.error.mock.calls[0][0])).not.toContain('card-number-like-payload');
  });
});

describe('BillingAuditEvent (D-32)', () => {
  it('covers every financial event the phase emits', () => {
    expect(Object.values(BillingAuditEvent)).toEqual(
      expect.arrayContaining([
        'INVOICE_DRAFT_CREATED',
        'INVOICE_FINALIZED',
        'INVOICE_VOIDED',
        'PAYMENT_RECORDED',
        'PAYMENT_LINK_CREATED',
        'PAYMENT_LINK_EXPIRED',
        'REFUND_INITIATED',
        'REFUND_PROCESSED',
        'REFUND_FAILED',
        'CREDIT_NOTE_ISSUED',
        'RAZORPAY_CREDENTIALS_UPDATED',
        'BILLING_SETTINGS_UPDATED',
        'WEBHOOK_SIGNATURE_REJECTED',
      ]),
    );
  });

  it('exposes no update, delete or upsert path — the table is append-only', async () => {
    const module = await import('../billing-audit-log.js');
    const exported = Object.keys(module);
    expect(exported.filter((name) => /update|delete|upsert|remove/i.test(name))).toEqual([]);
  });
});
