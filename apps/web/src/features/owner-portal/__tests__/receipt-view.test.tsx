// WR-8 (.planning/WHOLE-REPO-AUDIT-FIX-PLAN.md): "View Receipt" used to
// point straight at the JSON API contract endpoint -- an owner tapping the
// link saw raw `{"data": {...}}` in their browser instead of a formatted
// receipt. `ReceiptView` is the formatted document rendered by the new
// internal receipt route; this test locks in that it actually formats the
// data (₹ amount, not raw paise; a readable date, not an ISO string dump)
// rather than echoing the API payload verbatim.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReceiptView, type OwnerPortalReceiptData } from '../components/ReceiptView';

afterEach(() => {
  cleanup();
});

const RECEIPT: OwnerPortalReceiptData = {
  invoiceId: 'inv-1',
  receiptNumber: 'RCT-202608-0001',
  amountPaise: 50000,
  method: 'cash',
  transactionRef: 'pay_abc123',
  issuedAt: '2026-08-10T00:00:00.000Z',
};

describe('ReceiptView', () => {
  it('renders the amount as formatted rupees, not raw paise', () => {
    render(<ReceiptView receipt={RECEIPT} />);

    const amount = screen.getByTestId('receipt-amount');
    expect(amount).toHaveTextContent('₹500');
    expect(amount).not.toHaveTextContent('50000');
  });

  it('renders the issued date in a human-readable form, not the raw ISO string', () => {
    render(<ReceiptView receipt={RECEIPT} />);

    const issuedAt = screen.getByTestId('receipt-issued-at');
    expect(issuedAt).toHaveTextContent(/10 Aug 2026/i);
    expect(issuedAt).not.toHaveTextContent('2026-08-10T00:00:00.000Z');
  });

  it('renders the receipt number, payment method, and transaction reference', () => {
    render(<ReceiptView receipt={RECEIPT} />);

    expect(screen.getByTestId('receipt-number')).toHaveTextContent('RCT-202608-0001');
    expect(screen.getByTestId('receipt-method')).toHaveTextContent('Cash');
    expect(screen.getByTestId('receipt-transaction-ref')).toHaveTextContent('pay_abc123');
  });

  it('omits the transaction reference row entirely when there is none (e.g. a cash payment)', () => {
    render(<ReceiptView receipt={{ ...RECEIPT, transactionRef: null }} />);

    expect(screen.queryByTestId('receipt-transaction-ref')).not.toBeInTheDocument();
  });

  it('never renders the raw JSON envelope shape', () => {
    render(<ReceiptView receipt={RECEIPT} />);

    expect(screen.queryByText(/"data"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/{.*invoiceId.*}/)).not.toBeInTheDocument();
  });
});
