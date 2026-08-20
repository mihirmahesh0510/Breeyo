// Plan 09-06 Task 2: pet-scoped invoice browsing, multi-invoice checkout
// handoff, payment return states, and expired-link reissue (D-59, D-64,
// D-66, D-67, D-69 to D-72, D-78 to D-82, OWN-02, OWN-03, OWN-04).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InvoiceList } from '../components/InvoiceList';
import { InvoiceDetailSheet } from '../components/InvoiceDetailSheet';
import { CheckoutHandoffSheet } from '../components/CheckoutHandoffSheet';
import { PaymentResultBanner } from '../components/PaymentResultBanner';
import { ExpiredLinkState } from '../components/ExpiredLinkState';
import { cachePortalMagicLinkId } from '../hooks/usePortalSession';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const INVOICE_UNPAID = {
  invoiceId: 'inv-1',
  petId: 'pet-1',
  invoiceNumber: 'INV-0001',
  status: 'UNPAID',
  grandTotalPaise: 50000,
  balancePaise: 50000,
  dueDate: '2026-08-25T00:00:00.000Z',
};

const INVOICE_OVERDUE = {
  invoiceId: 'inv-2',
  petId: 'pet-1',
  invoiceNumber: 'INV-0002',
  status: 'OVERDUE',
  grandTotalPaise: 20000,
  balancePaise: 20000,
  dueDate: '2026-08-01T00:00:00.000Z',
};

const INVOICE_PAID = {
  invoiceId: 'inv-3',
  petId: 'pet-1',
  invoiceNumber: 'INV-0003',
  status: 'PAID',
  grandTotalPaise: 15000,
  balancePaise: 0,
  dueDate: null,
};

describe('InvoiceList pet-scoped browsing (OWN-02, D-59)', () => {
  it('shows the "No invoices yet" empty state without hiding pet context', () => {
    render(
      <InvoiceList
        invoices={[]}
        selectedInvoiceIds={[]}
        onToggleSelect={vi.fn()}
        onOpenInvoice={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />,
    );
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it('renders invoice rows with status chips and lets the owner select more than one', () => {
    const onToggleSelect = vi.fn();
    render(
      <InvoiceList
        invoices={[INVOICE_UNPAID, INVOICE_OVERDUE, INVOICE_PAID]}
        selectedInvoiceIds={[]}
        onToggleSelect={onToggleSelect}
        onOpenInvoice={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />,
    );

    expect(screen.getByText('INV-0001')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /inv-0001/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /inv-0002/i }));

    expect(onToggleSelect).toHaveBeenCalledWith('inv-1');
    expect(onToggleSelect).toHaveBeenCalledWith('inv-2');
  });

  it('shows "Pay Invoice" for a single selection and "Pay Selected Invoices" once more than one is selected', () => {
    const { rerender } = render(
      <InvoiceList
        invoices={[INVOICE_UNPAID, INVOICE_OVERDUE]}
        selectedInvoiceIds={['inv-1']}
        onToggleSelect={vi.fn()}
        onOpenInvoice={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pay Invoice' })).toBeInTheDocument();

    rerender(
      <InvoiceList
        invoices={[INVOICE_UNPAID, INVOICE_OVERDUE]}
        selectedInvoiceIds={['inv-1', 'inv-2']}
        onToggleSelect={vi.fn()}
        onOpenInvoice={vi.fn()}
        onProceedToCheckout={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Pay Selected Invoices' })).toBeInTheDocument();
  });
});

describe('InvoiceDetailSheet states (D-54, D-55)', () => {
  it('shows a Pay Invoice action and balance for an unpaid invoice', () => {
    render(<InvoiceDetailSheet invoice={INVOICE_UNPAID} onClose={vi.fn()} onPay={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pay Invoice' })).toBeInTheDocument();
    expect(screen.getByTestId('invoice-detail-balance')).toHaveTextContent('500');
  });

  it('shows receipt access instead of a pay action for a paid invoice', () => {
    render(<InvoiceDetailSheet invoice={INVOICE_PAID} onClose={vi.fn()} onPay={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Pay Invoice' })).not.toBeInTheDocument();
    expect(screen.getByText(/paid/i)).toBeInTheDocument();
  });
});

describe('CheckoutHandoffSheet explicit pre-Razorpay summary (D-66, D-69, D-70)', () => {
  it('shows amount due, invoice count, pet breakdown, and a secure-external-payment note', () => {
    render(
      <CheckoutHandoffSheet
        amountDuePaise={70000}
        petBreakdown={[
          { petId: 'pet-1', petName: 'Rocky', invoiceIds: ['inv-1', 'inv-2'], amountPaise: 70000 },
        ]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.getByTestId('checkout-total-amount')).toHaveTextContent('700');
    expect(screen.getByText(/rocky/i)).toBeInTheDocument();
    expect(screen.getByText(/2 invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/secure external payment/i)).toBeInTheDocument();
  });

  it('labels the primary action "Pay Selected Invoices" for a multi-invoice checkout', () => {
    render(
      <CheckoutHandoffSheet
        amountDuePaise={70000}
        petBreakdown={[
          { petId: 'pet-1', petName: 'Rocky', invoiceIds: ['inv-1'], amountPaise: 50000 },
          { petId: 'pet-2', petName: 'Whiskers', invoiceIds: ['inv-2'], amountPaise: 20000 },
        ]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pay Selected Invoices' })).toBeInTheDocument();
    expect(screen.getByText(/whiskers/i)).toBeInTheDocument();
  });

  it('labels the primary action "Pay Invoice" for a single-invoice checkout', () => {
    render(
      <CheckoutHandoffSheet
        amountDuePaise={50000}
        petBreakdown={[{ petId: 'pet-1', petName: 'Rocky', invoiceIds: ['inv-1'], amountPaise: 50000 }]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Pay Invoice' })).toBeInTheDocument();
  });
});

describe('PaymentResultBanner return states (D-71, D-72)', () => {
  it('shows a success summary with receipt access before any further navigation', () => {
    render(<PaymentResultBanner state="success" receiptUrl="https://example.com/r/1" onRetry={vi.fn()} />);
    expect(screen.getByText(/payment received/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /receipt/i })).toBeInTheDocument();
  });

  it('shows retry and clinic-help guidance on failure', () => {
    const onRetry = vi.fn();
    render(<PaymentResultBanner state="failure" onRetry={onRetry} />);
    expect(screen.getByText(/didn.t go through|failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByText(/contact.*clinic/i)).toBeInTheDocument();
  });

  it('shows retry and clinic-help guidance when the return was interrupted', () => {
    render(<PaymentResultBanner state="interrupted" onRetry={vi.fn()} />);
    const banner = screen.getByTestId('payment-result-interrupted');
    expect(banner).toHaveTextContent(/interrupted/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(banner).toHaveTextContent(/contact.*clinic/i);
  });
});

describe('ExpiredLinkState reissue path (D-64, D-67, D-78, D-81, D-82)', () => {
  it('requests a new link when a magicLinkId is cached for this token, and shows clinic help throughout', async () => {
    cachePortalMagicLinkId('tok-1', 'link-1');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { status: 'REISSUED', whatsappMessageId: 'wa-1' })),
    );

    render(<ExpiredLinkState token="tok-1" />);

    expect(screen.getByRole('link', { name: /call clinic/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /whatsapp clinic/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /request new link/i }));

    await waitFor(() => expect(screen.getByText(/on its way/i)).toBeInTheDocument());
  });

  it('falls back to clinic-contact messaging when the daily reissue cap is reached (D-82)', async () => {
    cachePortalMagicLinkId('tok-2', 'link-2');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(429, { status: 'LIMIT_REACHED' })),
    );

    render(<ExpiredLinkState token="tok-2" />);
    fireEvent.click(screen.getByRole('button', { name: /request new link/i }));

    await waitFor(() => expect(screen.getByText(/contact.*clinic/i)).toBeInTheDocument());
  });

  it('falls back to clinic contact when no magicLinkId was ever cached for this token', () => {
    render(<ExpiredLinkState token="tok-never-seen" />);

    fireEvent.click(screen.getByRole('button', { name: /request new link/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/contact.*clinic/i);
    expect(screen.getByRole('link', { name: /call clinic/i })).toBeInTheDocument();
  });
});
