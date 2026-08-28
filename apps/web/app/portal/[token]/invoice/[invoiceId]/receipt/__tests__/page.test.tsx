// WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): the internal receipt route
// that replaces a "View Receipt" link pointed straight at the raw JSON API
// endpoint. This confirms the page fetches the scoped owner-portal receipt
// endpoint and renders a formatted receipt (₹ amount, readable date)
// through `ReceiptView`, rather than dumping the fetched JSON to the page.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ReceiptPage from '../page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tok-1', invoiceId: 'inv-1' }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('OwnerPortalReceiptPage', () => {
  it('fetches the scoped receipt endpoint and renders a formatted receipt, not raw JSON', async () => {
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

    render(<ReceiptPage />);

    await waitFor(() => expect(screen.getByTestId('receipt-view')).toBeInTheDocument());

    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('₹500');
    expect(screen.getByTestId('receipt-issued-at')).toHaveTextContent(/10 Aug 2026/i);
    expect(screen.queryByText(/"data"/)).not.toBeInTheDocument();

    const [calledUrl] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain('/api/v1/owner-portal/tok-1/invoices/inv-1/receipt');
  });

  it('shows a clinic-help message instead of raw error JSON when the receipt cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(404, { error: { code: 'RECEIPT_NOT_FOUND', message: 'No receipt found for this invoice yet' } }),
      ),
    );

    render(<ReceiptPage />);

    await waitFor(() => expect(screen.getByTestId('receipt-page-error')).toBeInTheDocument());
    expect(screen.queryByText(/RECEIPT_NOT_FOUND/)).not.toBeInTheDocument();
  });
});
