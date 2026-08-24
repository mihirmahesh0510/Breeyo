// Verify-pass fixes 9.2 and 9.7 (.planning/PHASE-09-VERIFY-FIX-PLAN.md):
//
// 9.2: the admin Users page's "Browser Access" section only rendered a
// single `browserEnabled` checkbox -- there was no control anywhere for the
// per-module sub-toggles (queue/scheduling/billing/inventory/inventoryWrite)
// even though the PATCH endpoint already accepts them and D-17/D-18 require
// Front Desk to be able to reach them.
//
// 9.7: the deactivate/reactivate confirmation flow fetched
// `updatedByUserId`/`updatedAt` from the PATCH response and then discarded
// it, so D-24's "show the acting user clearly in the UI" never actually
// rendered anywhere after the change went through.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { ClinicBrowserAccessPolicy } from '@breeyo/types';
import { AuthProvider } from '../../../src/lib/AuthProvider';
import { writeSession, clearSession } from '../../../src/lib/auth-store';
import UsersPage from '../page';

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  usePathname: () => '/users',
}));

afterEach(() => {
  cleanup();
  clearSession();
  mockRouterReplace.mockClear();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Queues one fetch response per call, in order; the last one repeats once exhausted. */
function mockFetchSequence(responses: Response[]) {
  let call = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    }),
  );
  return calls;
}

function seedSession() {
  writeSession({
    accessToken: 'test-token',
    userId: 'admin-1',
    userName: 'Priya Admin',
    activeClinicId: 'clinic-1',
  });
}

function cockpitBody() {
  return {
    data: {
      panelOrder: ['ALERTS', 'QUEUE', 'USERS'],
      panels: [
        { panelId: 'ALERTS', title: 'Alerts & Exceptions', itemCount: 0, quickActions: [] },
        { panelId: 'QUEUE', title: 'Queue', itemCount: 0, quickActions: [] },
        { panelId: 'USERS', title: 'User Management', itemCount: 1, quickActions: [] },
      ],
      generatedAt: new Date().toISOString(),
    },
  };
}

function membersBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: [
      { userId: 'admin-1', fullName: 'Priya Admin', email: 'priya@clinic.test', roleNames: ['Admin'], isActive: true },
      {
        userId: 'user-2',
        fullName: 'Fatima Front Desk',
        email: 'fatima@clinic.test',
        roleNames: ['FrontDesk'],
        isActive: true,
        ...overrides,
      },
    ],
  };
}

function policy(overrides: Partial<ClinicBrowserAccessPolicy>): ClinicBrowserAccessPolicy {
  return {
    clinicId: 'clinic-1',
    roleCode: 'FRONT_DESK',
    browserEnabled: false,
    queueEnabled: false,
    schedulingEnabled: false,
    billingEnabled: false,
    inventoryEnabled: false,
    inventoryWriteEnabled: false,
    usersEnabled: false,
    updatedByUserId: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function policiesBody() {
  return {
    data: [
      policy({ roleCode: 'ADMIN', browserEnabled: true, queueEnabled: true, schedulingEnabled: true, billingEnabled: true, inventoryEnabled: true, inventoryWriteEnabled: true, usersEnabled: true }),
      policy({ roleCode: 'FRONT_DESK', browserEnabled: true, queueEnabled: false }),
      policy({ roleCode: 'CLINICIAN' }),
    ],
  };
}

describe('Users page browser-access per-module toggles (D-17, D-18, D-21)', () => {
  it('renders a checkbox for each sub-module (queue/scheduling/billing/inventory/inventoryWrite) per role', async () => {
    seedSession();
    mockFetchSequence([
      jsonResponse(200, cockpitBody()),
      jsonResponse(200, membersBody()),
      jsonResponse(200, policiesBody()),
    ]);

    render(
      <AuthProvider>
        <UsersPage />
      </AuthProvider>,
    );

    await screen.findByText('Fatima Front Desk');

    const frontDeskRow = screen.getByTestId('policy-row-FRONT_DESK');
    expect(within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-queueEnabled')).toBeInTheDocument();
    expect(within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-schedulingEnabled')).toBeInTheDocument();
    expect(within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-billingEnabled')).toBeInTheDocument();
    expect(within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-inventoryEnabled')).toBeInTheDocument();
    expect(within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-inventoryWriteEnabled')).toBeInTheDocument();
  });

  it('calls the toggle function with the queueEnabled field and PATCHes the access-policy endpoint when the Front Desk Queue checkbox is clicked', async () => {
    seedSession();
    const calls = mockFetchSequence([
      jsonResponse(200, cockpitBody()),
      jsonResponse(200, membersBody()),
      jsonResponse(200, policiesBody()),
      jsonResponse(200, { data: policy({ roleCode: 'FRONT_DESK', browserEnabled: true, queueEnabled: true }) }),
      jsonResponse(200, membersBody()),
      jsonResponse(200, policiesBody()),
    ]);

    render(
      <AuthProvider>
        <UsersPage />
      </AuthProvider>,
    );

    await screen.findByText('Fatima Front Desk');

    const frontDeskRow = screen.getByTestId('policy-row-FRONT_DESK');
    const queueToggle = within(frontDeskRow).getByTestId('module-toggle-FRONT_DESK-queueEnabled');

    await userEvent.click(queueToggle);

    await waitFor(() => {
      const patchCall = calls.find((call) => call.init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(patchCall?.url).toContain('/api/v1/web-dashboard/access-policy/FRONT_DESK');
      expect(JSON.parse(String(patchCall?.init?.body))).toEqual({ queueEnabled: true });
    });
  });
});

describe('Users page status-change actor/timestamp display (D-24)', () => {
  it('shows the acting admin name and a timestamp after confirming a deactivate change, using the PATCH response instead of discarding it', async () => {
    seedSession();
    const updatedAt = '2026-08-21T09:30:00.000Z';

    mockFetchSequence([
      jsonResponse(200, cockpitBody()),
      jsonResponse(200, membersBody()),
      jsonResponse(200, policiesBody()),
      jsonResponse(200, { data: { userId: 'user-2', isActive: false, updatedByUserId: 'admin-1', updatedAt } }),
      jsonResponse(200, membersBody({ isActive: false })),
      jsonResponse(200, policiesBody()),
    ]);

    render(
      <AuthProvider>
        <UsersPage />
      </AuthProvider>,
    );

    await screen.findByText('Fatima Front Desk');

    const row = screen.getByText('Fatima Front Desk').closest('tr');
    expect(row).not.toBeNull();
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Deactivate' }));

    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      const meta = screen.getByTestId('status-change-meta-user-2');
      expect(meta).toHaveTextContent('Priya Admin');
      expect(meta).toHaveTextContent(new Date(updatedAt).toLocaleString());
    });
  });
});
