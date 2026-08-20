// Plan 09-04 Task 2: browser billing workbench UI, against 09-CONTEXT.md
// D-22, D-24, D-40, D-42, D-43 and 09-UI-SPEC.md's module-depth contract.
//
// The load-bearing assertion in this file is D-22: refund/void controls
// must be entirely ABSENT from the render tree for a Front Desk caller
// (D-20's "hidden, not disabled"), never merely disabled buttons a curious
// Front Desk user could inspect and re-enable client-side.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { writeSession, clearSession } from '../../../lib/auth-store';
import { AuthProvider } from '../../../lib/AuthProvider';
import BillingPage from '../../../../app/billing/page';

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  usePathname: () => '/billing',
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

afterEach(() => {
  cleanup();
  clearSession();
  mockRouterReplace.mockClear();
  vi.unstubAllGlobals();
});

function seedSession(userName = 'Priya Admin') {
  writeSession({
    accessToken: 'test-token',
    userId: 'user-1',
    userName,
    activeClinicId: 'clinic-1',
  });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetchByUrl(map: Record<string, unknown | ((url: string) => unknown)>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = Object.keys(map).find((candidate) => url.includes(candidate));
      if (!key) {
        throw new Error(`Unhandled fetch in test: ${url} ${init?.method ?? 'GET'}`);
      }
      const entry = map[key];
      const body = typeof entry === 'function' ? (entry as (u: string) => unknown)(url) : entry;
      return jsonResponse(200, body);
    }),
  );
}

const cockpitBody = {
  data: {
    panelOrder: ['ALERTS', 'BILLING'],
    panels: [
      { panelId: 'ALERTS', title: 'Alerts & Exceptions', itemCount: 0, quickActions: [] },
      { panelId: 'BILLING', title: 'Billing', itemCount: 1, quickActions: [] },
    ],
    generatedAt: new Date().toISOString(),
  },
};

function changeMetadata() {
  return {
    staleVersion: new Date('2026-08-20T09:00:00.000Z').getTime(),
    changedByUser: 'Priya Sharma',
    changedAt: '2026-08-20T09:00:00.000Z',
    reviewPath: '/billing?invoiceId=inv_1',
  };
}

function workbenchBody(refundAllowed: boolean) {
  return {
    data: {
      unpaid: [
        {
          id: 'inv_1',
          invoiceNumber: 'INV-0001',
          status: 'UNPAID',
          grandTotalPaise: 50000,
          balancePaise: 50000,
          createdAt: '2026-08-10T00:00:00.000Z',
          dueDate: '2026-08-15T00:00:00.000Z',
          petName: 'Bruno',
          ownerName: 'Asha Rao',
          exceptionFlag: null,
          changeMetadata: changeMetadata(),
        },
      ],
      overdue: [],
      recentPayments: [
        {
          paymentId: 'pay_1',
          invoiceId: 'inv_2',
          invoiceNumber: 'INV-0002',
          petName: 'Simba',
          ownerName: 'Rahul Verma',
          amountPaise: 30000,
          method: 'cash',
          paidAt: '2026-08-19T10:00:00.000Z',
          recordedByName: 'Priya Sharma',
        },
      ],
      refundAllowed,
      voidAllowed: refundAllowed,
      staleState: 'fresh',
      serverUpdatedAt: '2026-08-20T09:00:00.000Z',
    },
  };
}

describe('Billing workbench payload rendering', () => {
  it('renders unpaid invoices and recent payment history with actor attribution (D-24)', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': workbenchBody(true),
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    expect(screen.getByText(/INV-0001/)).toBeInTheDocument();
    expect(screen.getByText(/Simba/)).toBeInTheDocument();
    expect(screen.getByText(/Priya Sharma/)).toBeInTheDocument();
  });
});

describe('Billing workbench D-22 Admin-only refund/void gating', () => {
  it('shows Refund and Void actions for an Admin caller (refundAllowed=true)', async () => {
    seedSession('Admin User');
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': workbenchBody(true),
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    expect(screen.getByRole('button', { name: /refund/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /void/i })).toBeInTheDocument();
  });

  it('hides Refund and Void actions entirely for Front Desk (refundAllowed=false) -- not merely disabled', async () => {
    seedSession('Priya Sharma');
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': workbenchBody(false),
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /void/i })).not.toBeInTheDocument();
    // Collect Payment stays available to Front Desk (D-05).
    expect(screen.getByRole('button', { name: /collect payment/i })).toBeInTheDocument();
  });

  it('still shows Collect Payment for an Admin caller alongside the risky actions (D-05)', async () => {
    seedSession('Admin User');
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': workbenchBody(true),
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    expect(screen.getByRole('button', { name: /collect payment/i })).toBeInTheDocument();
  });
});

describe('Billing workbench void confirmation flow (D-23, D-24)', () => {
  it('requires a reason and shows the acting Admin before voiding an invoice', async () => {
    seedSession('Admin User');
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': workbenchBody(true),
      'billing/web/invoices/inv_1/void': { data: { invoiceId: 'inv_1' } },
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    fireEvent.click(screen.getByRole('button', { name: /void/i }));

    const reasonInput = await screen.findByLabelText(/reason/i);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.change(reasonInput, { target: { value: 'Duplicate invoice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/void invoice/i);
    expect(screen.getByTestId('actor-timestamp')).toHaveTextContent('Admin User');
  });
});

describe('Billing workbench stale-state prompts (D-40)', () => {
  it('shows the shared StaleStateBanner when the server reports the workbench as stale', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'billing/web/workbench': {
        data: { ...workbenchBody(true).data, staleState: 'stale' },
      },
    });

    render(
      <AuthProvider>
        <BillingPage />
      </AuthProvider>,
    );

    const banner = await waitFor(() => screen.getByTestId('stale-state-banner'));
    expect(banner).toBeInTheDocument();
  });
});
