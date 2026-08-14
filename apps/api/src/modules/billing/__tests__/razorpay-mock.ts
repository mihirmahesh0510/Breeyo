import { createHmac } from 'node:crypto';
import { vi } from 'vitest';

/**
 * Razorpay SDK test double and webhook fixture builders (BIL-05, BIL-06).
 *
 * ## Why a hand-written double rather than a live test account
 *
 * Razorpay test credentials are not provisioned for this repository (see
 * 06-RESEARCH.md's `## Environment Availability`), and even once they are, a
 * suite that reaches the real gateway is neither hermetic nor fast. Every
 * assertion this phase actually needs is about the params WE send and the state
 * WE derive, so the double records calls and the tests assert on
 * `mock.calls[0][0]` rather than on a network round trip.
 *
 * Follows the `factories.ts` convention: named exports, plain functions, a
 * trailing `overrides` object, no shared mutable module state.
 *
 * ## The signing helper is not decoration
 *
 * `signWebhookPayload` reproduces Razorpay's `x-razorpay-signature` exactly —
 * hex HMAC-SHA256 over the RAW request body. Plan 06-10's webhook tests use it
 * to build both a valid signature and, by signing with the wrong secret, an
 * invalid one. A webhook test that cannot produce a genuinely valid signature
 * can only ever assert the rejection path, which is the half that does not move
 * money.
 */

// ─── Fixtures ───────────────────────────────────────────────────────────────

export interface PaymentLinkFixtureOverrides {
  id?: string;
  amount?: number;
  amount_paid?: number;
  reference_id?: string;
  short_url?: string;
  status?: 'created' | 'partially_paid' | 'expired' | 'cancelled' | 'paid';
  expire_by?: number;
  notes?: Record<string, string | number>;
}

/** A `payment_link` entity shaped like the real create/fetch response. */
export function paymentLinkFixture(overrides: PaymentLinkFixtureOverrides = {}) {
  const id = overrides.id ?? `plink_test_${Math.random().toString(36).slice(2, 12)}`;

  return {
    id,
    entity: 'payment_link',
    accept_partial: false,
    amount: overrides.amount ?? 50000,
    amount_paid: overrides.amount_paid ?? 0,
    currency: 'INR',
    // Razorpay's short domain. Tests assert the client only ever receives this
    // and never a key id, so the shape matters.
    short_url: overrides.short_url ?? `https://rzp.io/i/${id.slice(-8)}`,
    reference_id: overrides.reference_id ?? 'ref_test',
    status: overrides.status ?? ('created' as const),
    expire_by: overrides.expire_by ?? Math.floor(Date.now() / 1000) + 16 * 60,
    expired_at: 0,
    cancelled_at: 0,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
    notes: overrides.notes ?? {},
    payments: null,
    user_id: '',
  };
}

export function refundFixture(overrides: { id?: string; amount?: number; status?: string } = {}) {
  return {
    id: overrides.id ?? `rfnd_test_${Math.random().toString(36).slice(2, 12)}`,
    entity: 'refund',
    amount: overrides.amount ?? 50000,
    currency: 'INR',
    payment_id: 'pay_test_abc123',
    status: overrides.status ?? 'processed',
    speed_processed: 'normal',
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * A `payment_link.paid` event body.
 *
 * `reference_id` is our invoice UUID and `amount_paid` is what actually
 * settled — the two fields plan 06-10's worker keys off. Both are overridable
 * because the interesting webhook tests are the mismatched ones.
 */
export function paymentLinkPaidWebhookFixture(
  overrides: {
    referenceId?: string;
    amountPaid?: number;
    paymentLinkId?: string;
    paymentId?: string;
    notes?: Record<string, string | number>;
  } = {},
) {
  const paymentLinkId = overrides.paymentLinkId ?? 'plink_test_paid0001';

  return {
    entity: 'event',
    account_id: 'acc_test_0000000000',
    event: 'payment_link.paid',
    contains: ['payment_link', 'payment'],
    payload: {
      payment_link: {
        entity: paymentLinkFixture({
          id: paymentLinkId,
          status: 'paid',
          reference_id: overrides.referenceId ?? 'ref_test',
          amount_paid: overrides.amountPaid ?? 50000,
          amount: overrides.amountPaid ?? 50000,
          notes: overrides.notes ?? {},
        }),
      },
      payment: {
        entity: {
          id: overrides.paymentId ?? 'pay_test_paid0001',
          entity: 'payment',
          amount: overrides.amountPaid ?? 50000,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** A `refund.processed` event body (D-12). */
export function refundProcessedWebhookFixture(
  overrides: { amount?: number; refundId?: string; paymentId?: string } = {},
) {
  return {
    entity: 'event',
    account_id: 'acc_test_0000000000',
    event: 'refund.processed',
    contains: ['refund'],
    payload: {
      refund: {
        entity: refundFixture({
          id: overrides.refundId ?? 'rfnd_test_proc0001',
          amount: overrides.amount ?? 50000,
          status: 'processed',
        }),
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

// ─── SDK double ─────────────────────────────────────────────────────────────

type AnyParams = Record<string, unknown>;

export interface RazorpayMockOverrides {
  paymentLink?: Partial<{
    create: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }>;
  payments?: Partial<{ refund: ReturnType<typeof vi.fn> }>;
  refunds?: Partial<{ fetch: ReturnType<typeof vi.fn> }>;
}

/**
 * A stand-in for a configured `Razorpay` instance.
 *
 * `paymentLink.create` echoes the caller's `amount` and `reference_id` back on
 * the fixture, so a test that asserts on the returned link is still asserting
 * against what it actually asked for.
 */
export function buildRazorpayMock(overrides: RazorpayMockOverrides = {}) {
  return {
    paymentLink: {
      create: vi.fn(async (params: AnyParams) =>
        paymentLinkFixture({
          amount: typeof params?.amount === 'number' ? params.amount : undefined,
          reference_id:
            typeof params?.reference_id === 'string' ? params.reference_id : undefined,
          expire_by: typeof params?.expire_by === 'number' ? params.expire_by : undefined,
          notes: (params?.notes as Record<string, string | number>) ?? undefined,
        }),
      ),
      fetch: vi.fn(async (id: string) => paymentLinkFixture({ id })),
      cancel: vi.fn(async (id: string) => paymentLinkFixture({ id, status: 'cancelled' })),
      ...overrides.paymentLink,
    },
    payments: {
      refund: vi.fn(async (_paymentId: string, params: AnyParams) =>
        refundFixture({ amount: typeof params?.amount === 'number' ? params.amount : undefined }),
      ),
      ...overrides.payments,
    },
    refunds: {
      fetch: vi.fn(async (id: string) => refundFixture({ id })),
      ...overrides.refunds,
    },
  };
}

export type RazorpayMock = ReturnType<typeof buildRazorpayMock>;

// ─── Signature ──────────────────────────────────────────────────────────────

/**
 * Reproduces Razorpay's `x-razorpay-signature` header.
 *
 * Hex HMAC-SHA256 over the RAW body. It must be the raw bytes Razorpay sent,
 * not a re-serialised parsed object: `JSON.stringify(JSON.parse(body))` can
 * reorder keys or change number formatting, and the HMAC then fails to verify
 * for a payload that was in fact genuine.
 */
export function signWebhookPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
