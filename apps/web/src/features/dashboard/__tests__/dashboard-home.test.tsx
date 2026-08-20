// Plan 09-02 Task 2: proves the browser dashboard shell + cockpit home
// against 09-CONTEXT.md D-01 to D-24 and D-83, and 09-UI-SPEC.md's layout
// contract. `apps/web` had no component test harness before this plan --
// see `vitest.config.ts` (this file, plus the repo-root one, both switch to
// `happy-dom` + `@vitejs/plugin-react` as part of this task).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { DashboardPanelId } from '@breeyo/types';
import { AppSidebar } from '../../../components/app-shell/AppSidebar';
import { useDashboardCockpit } from '../hooks/useDashboardCockpit';
import { writeSession, clearSession } from '../../../lib/auth-store';
import { AuthProvider } from '../../../lib/AuthProvider';
import DashboardHomePage from '../../../../app/dashboard/page';

const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  usePathname: () => '/dashboard',
}));

afterEach(() => {
  cleanup();
  clearSession();
  mockRouterReplace.mockClear();
  vi.unstubAllGlobals();
});

const PANEL_TITLE: Record<DashboardPanelId, string> = {
  ALERTS: 'Alerts & Exceptions',
  QUEUE: 'Queue',
  SCHEDULING: 'Scheduling',
  BILLING: 'Billing',
  INVENTORY: 'Inventory',
  USERS: 'User Management',
  OWNER_EXCEPTIONS: 'Owner & WhatsApp Exceptions',
};

function cockpitBody(panelIds: DashboardPanelId[]) {
  return {
    data: {
      panelOrder: panelIds,
      panels: panelIds.map((panelId) => ({
        panelId,
        title: PANEL_TITLE[panelId],
        itemCount: panelId === 'ALERTS' ? 2 : 1,
        quickActions: [
          {
            actionId: `${panelId.toLowerCase()}-primary`,
            // "Review Alerts" is the real, fixed D-06 CTA copy; the others are
            // distinct from `PriorityPanel`'s own "Open <title>" link so the
            // two don't collide on accessible name in assertions below.
            label: panelId === 'ALERTS' ? 'Review Alerts' : `${PANEL_TITLE[panelId]} Quick Action`,
            href: '#',
          },
        ],
      })),
      generatedAt: new Date().toISOString(),
    },
  };
}

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    }),
  );
}

function seedSession() {
  writeSession({
    accessToken: 'test-token',
    userId: 'user-1',
    userName: 'Priya Admin',
    activeClinicId: 'clinic-1',
  });
}

describe('AppSidebar hidden-module semantics (D-20, D-83)', () => {
  it('renders Queue, Scheduling, Billing, and Inventory without lock placeholders when authorized', () => {
    render(<AppSidebar visiblePanelIds={['QUEUE', 'SCHEDULING', 'BILLING', 'INVENTORY']} />);

    expect(screen.getByRole('link', { name: 'Queue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Scheduling' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Billing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();
    expect(screen.queryByText(/lock/i)).not.toBeInTheDocument();
  });

  it('hides Users entirely for a Front Desk user without the USERS panel (D-21 Admin-only)', () => {
    render(<AppSidebar visiblePanelIds={['QUEUE', 'SCHEDULING', 'BILLING', 'INVENTORY']} />);

    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('shows Users for an Admin whose cockpit response includes the USERS panel', () => {
    render(<AppSidebar visiblePanelIds={['QUEUE', 'SCHEDULING', 'BILLING', 'INVENTORY', 'USERS']} />);

    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });
});

describe('Dashboard home cockpit rendering (D-01, D-05 to D-08)', () => {
  beforeEach(() => {
    seedSession();
  });

  it('lands on an action-first cockpit with the locked panel order, separate Queue/Scheduling panels, and quick actions', async () => {
    mockFetchSequence([
      jsonResponse(200, cockpitBody(['ALERTS', 'QUEUE', 'SCHEDULING', 'BILLING', 'INVENTORY', 'USERS', 'OWNER_EXCEPTIONS'])),
    ]);

    render(
      <AuthProvider>
        <DashboardHomePage />
      </AuthProvider>,
    );

    await screen.findByTestId('panel-QUEUE');

    const headings = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual([
      'Queue',
      'Scheduling',
      'Billing',
      'Inventory',
      'User Management',
      'Owner & WhatsApp Exceptions',
    ]);

    // Queue and Scheduling are separate panel elements, not one blended board (D-07).
    expect(screen.getByTestId('panel-QUEUE')).toBeInTheDocument();
    expect(screen.getByTestId('panel-SCHEDULING')).toBeInTheDocument();
    expect(screen.getByTestId('panel-QUEUE')).not.toBe(screen.getByTestId('panel-SCHEDULING'));

    // D-03: every panel offers a quick action; the home CTA is exactly "Review Alerts" (D-06 exception-first).
    expect(screen.getAllByRole('link', { name: 'Review Alerts' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open Billing' })).toBeInTheDocument();

    // D-09, D-10: no global command bar anywhere on the home surface.
    expect(screen.queryByTestId('global-command-bar')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
  });

  it('omits the USERS panel and the Users nav item for a Front Desk user without usersEnabled (D-20)', async () => {
    mockFetchSequence([jsonResponse(200, cockpitBody(['ALERTS', 'QUEUE', 'BILLING', 'SCHEDULING', 'INVENTORY', 'OWNER_EXCEPTIONS']))]);

    render(
      <AuthProvider>
        <DashboardHomePage />
      </AuthProvider>,
    );

    await screen.findByTestId('panel-QUEUE');

    expect(screen.queryByTestId('panel-USERS-mini')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });
});

describe('useDashboardCockpit mid-session revocation redirect (D-83)', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  beforeEach(() => {
    seedSession();
  });

  it('redirects to the first still-authorized module once USERS is dropped from a later cockpit response', async () => {
    mockFetchSequence([
      jsonResponse(200, cockpitBody(['ALERTS', 'QUEUE', 'USERS', 'OWNER_EXCEPTIONS'])),
      jsonResponse(200, cockpitBody(['ALERTS', 'QUEUE', 'OWNER_EXCEPTIONS'])),
    ]);

    const { result } = renderHook(() => useDashboardCockpit({ currentModulePanelId: 'USERS' }), { wrapper });

    await waitFor(() => expect(result.current.data?.panels.some((p) => p.panelId === 'USERS')).toBe(true));
    expect(mockRouterReplace).not.toHaveBeenCalled();

    // The very next request against the now-unauthorized module -- no new login happens here.
    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/queue'));
  });

  it('redirects to the locked-out screen when browser access itself is revoked mid-session', async () => {
    mockFetchSequence([
      jsonResponse(200, cockpitBody(['ALERTS', 'QUEUE', 'OWNER_EXCEPTIONS'])),
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Browser access is disabled for this role' } }),
    ]);

    const { result } = renderHook(() => useDashboardCockpit(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/locked-out'));
  });
});
