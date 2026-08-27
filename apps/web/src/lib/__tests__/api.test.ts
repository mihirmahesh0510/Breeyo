// Verify-fix 10.3 (part b): `apiClient` already forwards `error.details`
// onto `ApiClientError` but silently drops `error.conflict` --
// `apps/api/src/middleware/error-handler.ts`'s "Forward a structured
// `.conflict` payload on a 409 STALE_WRITE_CONFLICT" block puts a real
// domain/entityType/entityId/currentVersion/expectedVersion/severity object
// on the wire (Plan 10-05's browser optimistic-concurrency check), but
// nothing on the client reads it -- a caller that wants to drive D-05
// review-before-overwrite UI off a real 409 has no way to get at it. This
// proves the raw error response's `.conflict` field survives onto the
// thrown `ApiClientError`, the same way `.details` already does.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiClientError } from '../api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('apiClient forwards a structured .conflict payload onto ApiClientError (verify-fix 10.3)', () => {
  it('surfaces error.conflict from a raw 409 response on the thrown ApiClientError', async () => {
    const conflict = {
      domain: 'billing',
      entityType: 'INVOICE',
      entityId: 'invoice_123',
      currentVersion: 1_700_000_050_000,
      expectedVersion: 1_700_000_000_000,
      severity: 'OPERATIONAL',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: 'STALE_WRITE_CONFLICT',
            message: 'This record changed elsewhere while you were viewing it. Refresh and review before retrying.',
            conflict,
          },
        }),
      ),
    );

    await expect(apiClient('/api/v1/billing/web/invoices/invoice_123/collect-payment', { method: 'POST' })).rejects.toMatchObject({
      code: 'STALE_WRITE_CONFLICT',
      status: 409,
      conflict,
    });
  });

  it('leaves .conflict undefined when the error response has no conflict payload (existing .details behavior unaffected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: 'INTERNAL', message: 'Something went wrong', details: { foo: 'bar' } },
        }),
      ),
    );

    try {
      await apiClient('/api/v1/queue/web/board');
      expect.unreachable('apiClient should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiError = err as ApiClientError;
      expect(apiError.details).toEqual({ foo: 'bar' });
      expect(apiError.conflict).toBeUndefined();
    }
  });
});
