import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { encryptSecret } from '../../../lib/crypto.js';
import {
  RAZORPAY_EXPIRY_BUFFER_SECONDS,
  getRazorpayForClinic,
  invalidateRazorpayCache,
  normalizeRazorpayError,
  toRazorpayExpiry,
} from '../razorpay.client.js';
import {
  buildRazorpayMock,
  paymentLinkFixture,
  paymentLinkPaidWebhookFixture,
  refundProcessedWebhookFixture,
  signWebhookPayload,
} from './razorpay-mock.js';

/**
 * T-06-49, T-06-52, T-06-54, T-06-55.
 *
 * The factory is the ONLY place a Razorpay secret is decrypted, so these tests
 * carry the phase's credential-containment guarantees: the plaintext must not
 * survive serialisation of the returned client, a rotated `razorpayKeyId` must
 * evict the cached instance, and a gateway failure must arrive as a 502 whose
 * message still names the reason.
 */

const PLAINTEXT_SECRET = 'rzp_secret_do_not_leak_9f3a';

let secretEnc: string;

beforeAll(() => {
  // The suite runs with whatever key `.env` provides; if it is absent (a bare
  // CI shell), stub one so the decryption path is genuinely exercised rather
  // than skipped.
  if (!process.env.BILLING_ENCRYPTION_KEY) {
    vi.stubEnv('BILLING_ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  }
  secretEnc = encryptSecret(PLAINTEXT_SECRET);
});

function clinicConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    razorpayKeyId: 'rzp_test_abcdef123456',
    razorpayKeySecretEnc: secretEnc,
    razorpayTestMode: true,
    ...overrides,
  } as Parameters<typeof getRazorpayForClinic>[0];
}

beforeEach(() => {
  invalidateRazorpayCache('11111111-1111-1111-1111-111111111111');
  invalidateRazorpayCache('22222222-2222-2222-2222-222222222222');
});

describe('getRazorpayForClinic', () => {
  it('returns a configured SDK instance when both credentials are present', () => {
    const client = getRazorpayForClinic(clinicConfig());

    expect(client).toBeDefined();
    expect(client.paymentLink).toBeDefined();
    expect(typeof client.paymentLink.create).toBe('function');
  });

  it('throws a 409 RAZORPAY_NOT_CONFIGURED when the key id is absent', () => {
    try {
      getRazorpayForClinic(clinicConfig({ razorpayKeyId: null }));
      throw new Error('expected getRazorpayForClinic to throw');
    } catch (err) {
      const domain = err as Error & { statusCode?: number; code?: string };
      expect(domain.statusCode).toBe(409);
      expect(domain.code).toBe('RAZORPAY_NOT_CONFIGURED');
    }
  });

  it('throws a 409 RAZORPAY_NOT_CONFIGURED when the encrypted secret is absent', () => {
    try {
      getRazorpayForClinic(clinicConfig({ razorpayKeySecretEnc: null }));
      throw new Error('expected getRazorpayForClinic to throw');
    } catch (err) {
      const domain = err as Error & { statusCode?: number; code?: string };
      expect(domain.statusCode).toBe(409);
      expect(domain.code).toBe('RAZORPAY_NOT_CONFIGURED');
    }
  });

  it('never exposes the decrypted secret through serialisation (T-06-49)', () => {
    const client = getRazorpayForClinic(clinicConfig());

    // The SDK assigns `this.key_secret = key_secret` as a plain enumerable own
    // property, so an unhardened instance leaks the plaintext into any log line
    // or response that stringifies it.
    expect(JSON.stringify(client)).not.toContain(PLAINTEXT_SECRET);
    expect(Object.keys(client)).not.toContain('key_secret');
    expect(String(client)).not.toContain(PLAINTEXT_SECRET);
    expect(JSON.stringify({ client })).not.toContain(PLAINTEXT_SECRET);
  });

  it('reuses the cached instance for the same clinic and key id', () => {
    const first = getRazorpayForClinic(clinicConfig());
    const second = getRazorpayForClinic(clinicConfig());

    expect(second).toBe(first);
  });

  it('rebuilds the instance when the clinic rotates its key id (T-06-54)', () => {
    const first = getRazorpayForClinic(clinicConfig());
    const second = getRazorpayForClinic(clinicConfig({ razorpayKeyId: 'rzp_test_rotated999' }));

    expect(second).not.toBe(first);
  });

  it('drops the cached instance when invalidateRazorpayCache is called', () => {
    const first = getRazorpayForClinic(clinicConfig());
    invalidateRazorpayCache(clinicConfig().id);
    const second = getRazorpayForClinic(clinicConfig());

    expect(second).not.toBe(first);
  });

  it('keeps each clinic on its own instance', () => {
    const a = getRazorpayForClinic(clinicConfig());
    const b = getRazorpayForClinic(
      clinicConfig({ id: '22222222-2222-2222-2222-222222222222' }),
    );

    expect(b).not.toBe(a);
  });
});

describe('normalizeRazorpayError', () => {
  it('converts an SDK error into a 502 PAYMENT_GATEWAY_ERROR carrying the description', () => {
    const sdkError = {
      statusCode: 400,
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'The amount must be atleast INR 1.00',
        source: 'business',
        step: 'payment_initiation',
      },
    };

    try {
      normalizeRazorpayError(sdkError);
      throw new Error('expected normalizeRazorpayError to throw');
    } catch (err) {
      const domain = err as Error & { statusCode?: number; code?: string };
      expect(domain.statusCode).toBe(502);
      expect(domain.code).toBe('PAYMENT_GATEWAY_ERROR');
      expect(domain.message).toContain('The amount must be atleast INR 1.00');
    }
  });

  it('keeps the expire_by reason diagnosable from the message (D-11 boundary)', () => {
    const sdkError = {
      statusCode: 400,
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'expire_by should be at least 15 minutes from now',
        field: 'expire_by',
      },
    };

    try {
      normalizeRazorpayError(sdkError);
      throw new Error('expected normalizeRazorpayError to throw');
    } catch (err) {
      expect((err as Error).message).toContain('expire_by');
    }
  });

  it('still produces a 502 when the SDK error carries no description', () => {
    try {
      normalizeRazorpayError(new Error('socket hang up'));
      throw new Error('expected normalizeRazorpayError to throw');
    } catch (err) {
      const domain = err as Error & { statusCode?: number; code?: string };
      expect(domain.statusCode).toBe(502);
      expect(domain.code).toBe('PAYMENT_GATEWAY_ERROR');
      expect(domain.message).toContain('socket hang up');
    }
  });

  it('never re-throws a Razorpay error unchanged, which the 500 handler would swallow', () => {
    const raw = Object.assign(new Error('boom'), { statusCode: 500 });

    try {
      normalizeRazorpayError(raw);
      throw new Error('expected normalizeRazorpayError to throw');
    } catch (err) {
      expect(err).not.toBe(raw);
      expect((err as { statusCode?: number }).statusCode).toBe(502);
    }
  });
});

describe('toRazorpayExpiry', () => {
  it('sets expire_by 16 minutes out, never the 15-minute boundary (T-06-52)', () => {
    const now = new Date('2026-08-14T10:00:00.000Z');
    const nowSeconds = Math.floor(now.getTime() / 1000);

    expect(toRazorpayExpiry(now) - nowSeconds).toBe(960);
    expect(toRazorpayExpiry(now) - nowSeconds).toBeGreaterThanOrEqual(960);
    expect(RAZORPAY_EXPIRY_BUFFER_SECONDS).toBe(960);
  });

  it('returns whole seconds, as the Razorpay API requires', () => {
    const now = new Date('2026-08-14T10:00:00.750Z');
    expect(Number.isInteger(toRazorpayExpiry(now))).toBe(true);
  });
});

describe('razorpay-mock helper', () => {
  it('resolves a payment link fixture that echoes the requested amount', async () => {
    const rzp = buildRazorpayMock();

    const link = await rzp.paymentLink.create({
      amount: 50000,
      currency: 'INR',
      reference_id: 'ec8b7f5e-8c5d-4d4a-9a1f-2f1d6b6a1c3e',
      customer: {},
    });

    expect(link.id).toMatch(/^plink_test/);
    expect(link.short_url).toContain('https://rzp.io/');
    expect(link.status).toBe('created');
    expect(link.amount).toBe(50000);
  });

  it('records the exact params the caller sent', async () => {
    const rzp = buildRazorpayMock();

    await rzp.paymentLink.create({ amount: 12345, currency: 'INR', customer: {} });

    expect(rzp.paymentLink.create).toHaveBeenCalledTimes(1);
    expect(rzp.paymentLink.create.mock.calls[0][0]).toMatchObject({
      amount: 12345,
      currency: 'INR',
    });
  });

  it('resolves cancel and refund fixtures', async () => {
    const rzp = buildRazorpayMock();

    const cancelled = await rzp.paymentLink.cancel('plink_test_abc');
    expect(cancelled.status).toBe('cancelled');

    const refund = await rzp.payments.refund('pay_test_abc', { amount: 100 });
    expect(refund.id).toMatch(/^rfnd_/);
  });

  it('accepts overrides so a test can force a specific link shape', async () => {
    const rzp = buildRazorpayMock({
      paymentLink: { create: vi.fn(async () => paymentLinkFixture({ id: 'plink_test_fixed' })) },
    });

    const link = await rzp.paymentLink.create({ amount: 100, currency: 'INR', customer: {} });
    expect(link.id).toBe('plink_test_fixed');
  });

  it('builds payment_link.paid and refund.processed webhook payloads', () => {
    const paid = paymentLinkPaidWebhookFixture({ referenceId: 'inv-1', amountPaid: 50000 });
    expect(paid.event).toBe('payment_link.paid');
    expect(paid.payload.payment_link.entity.status).toBe('paid');
    expect(paid.payload.payment_link.entity.reference_id).toBe('inv-1');
    expect(paid.payload.payment_link.entity.amount_paid).toBe(50000);

    const refunded = refundProcessedWebhookFixture({ amount: 25000 });
    expect(refunded.event).toBe('refund.processed');
    expect(refunded.payload.refund.entity.amount).toBe(25000);
    expect(refunded.payload.refund.entity.status).toBe('processed');
  });

  it('signWebhookPayload produces the hex HMAC-SHA256 Razorpay would send', () => {
    const body = JSON.stringify(paymentLinkPaidWebhookFixture());
    const secret = 'webhook_secret_value';

    const expected = createHmac('sha256', secret).update(body).digest('hex');

    expect(signWebhookPayload(body, secret)).toBe(expected);
    expect(signWebhookPayload(body, secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(signWebhookPayload(body, 'wrong_secret')).not.toBe(expected);
  });
});
