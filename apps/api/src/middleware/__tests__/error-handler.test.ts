import { describe, it, expect, vi } from 'vitest';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { errorHandler } from '../error-handler.js';

/**
 * T-06-55: the gateway-failure reason must survive the error handler.
 *
 * `normalizeRazorpayError` raises a 502 so the front desk can act on D-11
 * ("shows the failure reason; retry or mark unpaid"). The handler's blanket
 * "replace the message on anything >= 500" rule would erase exactly that, so a
 * narrow allow-list entry exists — and these tests hold the line on how narrow
 * it is.
 */

function fakeReply() {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    send(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

const fakeRequest = { log: { error: vi.fn() } } as unknown as FastifyRequest;

function gatewayError() {
  const error = new Error('Razorpay: expire_by should be at least 15 minutes from now');
  Object.assign(error, {
    statusCode: 502,
    code: 'PAYMENT_GATEWAY_ERROR',
    details: { gatewayCode: 'BAD_REQUEST_ERROR', gatewayStatus: 400, field: 'expire_by' },
  });
  return error as FastifyError & { statusCode: number };
}

describe('errorHandler — payment gateway allow-list', () => {
  it('forwards a 502 PAYMENT_GATEWAY_ERROR with its reason intact', () => {
    const { reply, sent } = fakeReply();

    errorHandler(gatewayError(), fakeRequest, reply);

    expect(sent.status).toBe(502);
    const body = sent.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    expect(body.error.message).toContain('expire_by');
  });

  it('forwards the structured gateway details alongside the message', () => {
    const { reply, sent } = fakeReply();

    errorHandler(gatewayError(), fakeRequest, reply);

    const body = sent.body as { error: { details?: Record<string, unknown> } };
    expect(body.error.details).toMatchObject({ gatewayCode: 'BAD_REQUEST_ERROR' });
  });

  it('still replaces the message on an ordinary 500', () => {
    const { reply, sent } = fakeReply();
    const error = Object.assign(new Error('connection string: postgres://user:pw@host'), {
      statusCode: 500,
    }) as FastifyError & { statusCode: number };

    errorHandler(error, fakeRequest, reply);

    expect(sent.status).toBe(500);
    const body = sent.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('does not open the 5xx message channel to any other 502', () => {
    // The allow-list is keyed on BOTH the status and the code. An upstream
    // proxy error that happens to carry 502 must still be redacted, or the
    // exemption becomes "any 502 leaks", which is not what it is for.
    const { reply, sent } = fakeReply();
    const error = Object.assign(new Error('upstream said: internal host db-primary-3'), {
      statusCode: 502,
      code: 'BAD_GATEWAY',
    }) as FastifyError & { statusCode: number };

    errorHandler(error, fakeRequest, reply);

    expect(sent.status).toBe(500);
    const body = sent.body as { error: { message: string } };
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('does not let a forged 502 code on a 500 error leak the message', () => {
    const { reply, sent } = fakeReply();
    const error = Object.assign(new Error('secret internal detail'), {
      statusCode: 500,
      code: 'PAYMENT_GATEWAY_ERROR',
    }) as FastifyError & { statusCode: number };

    errorHandler(error, fakeRequest, reply);

    expect(sent.status).toBe(500);
    const body = sent.body as { error: { message: string } };
    expect(body.error.message).toBe('An unexpected error occurred');
  });
});
