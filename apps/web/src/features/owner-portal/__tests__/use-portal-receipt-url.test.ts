// Finding 9.3 (D-71): `PaymentResultBanner` and `InvoiceDetailSheet` were
// both built to render a `receiptUrl` no backend contract ever produced.
// `usePortalReceiptUrl` is the frontend wiring for the new scoped
// `GET /owner-portal/:token/invoices/:invoiceId/receipt` endpoint --
// confirms a receipt actually exists before ever handing back a URL, so
// "View Receipt" never renders a link that 404s when clicked.
//
// WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): that scoped endpoint
// returns bare JSON, no HTML -- an owner tapping "View Receipt" saw raw
// `{"data": {...}}` in their browser. The URL this hook resolves to must
// point at the internal, formatted Next.js route
// (`/portal/:token/invoice/:invoiceId/receipt`) instead of the raw API
// contract endpoint, even though it still calls that API endpoint once to
// confirm a receipt actually exists before handing back a link.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePortalReceiptUrl } from '../hooks/usePortalReceiptUrl';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('usePortalReceiptUrl', () => {
  it('returns null while invoiceId is null, without ever fetching', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePortalReceiptUrl('tok-1', null));

    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves to the internal formatted receipt route, not the raw API endpoint, once the receipt is confirmed to exist', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        data: {
          invoiceId: 'inv-1',
          receiptNumber: 'RCT-202608-0001',
          amountPaise: 50000,
          method: 'cash',
          transactionRef: null,
          issuedAt: '2026-08-10T00:00:00.000Z',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePortalReceiptUrl('tok-1', 'inv-1'));

    await waitFor(() => expect(result.current).not.toBeNull());

    // WR-8: the resolved link is the internal Next.js page route that
    // renders a formatted receipt -- never the bare JSON API endpoint.
    expect(result.current).toBe('/portal/tok-1/invoice/inv-1/receipt');
    expect(result.current).not.toMatch(/\/api\/v1\//);

    // The existence check still hits the real scoped API endpoint --
    // otherwise an invoice with no captured payment would show a link that
    // 404s on click.
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('/api/v1/owner-portal/tok-1/invoices/inv-1/receipt');
  });

  it('resolves to null when the invoice has no receipt yet (404), rather than a dead link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(404, { error: { code: 'RECEIPT_NOT_FOUND', message: 'No receipt found for this invoice yet' } }),
      ),
    );

    const { result, rerender } = renderHook(({ invoiceId }: { invoiceId: string | null }) => usePortalReceiptUrl('tok-1', invoiceId), {
      initialProps: { invoiceId: 'inv-2' },
    });

    // Give the effect a tick to settle before asserting the null outcome.
    await waitFor(() => expect(result.current).toBeNull());
    rerender({ invoiceId: 'inv-2' });
    expect(result.current).toBeNull();
  });
});
