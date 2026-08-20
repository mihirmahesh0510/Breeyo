// Plan 09-04 Task 2: browser queue workbench UI, against 09-CONTEXT.md
// D-07, D-40, D-41, D-43 and 09-UI-SPEC.md's module-depth contract.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { writeSession, clearSession } from '../../../lib/auth-store';
import { AuthProvider } from '../../../lib/AuthProvider';
import QueuePage from '../../../../app/queue/page';

const mockRouterReplace = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: mockRouterPush }),
  usePathname: () => '/queue',
}));

// The socket handler map lets a test simulate a server-pushed browser-sync
// event (`BROWSER_SYNC_EVENTS.QUEUE_BOARD_SYNC`) without a real Socket.IO
// connection -- `useQueueRealtime.ts` registers its listener through this
// mock exactly as it would through the real client.
const socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockDisconnect = vi.fn();

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: (event: string, handler: (payload: unknown) => void) => {
      socketHandlers[event] = handler;
    },
    disconnect: mockDisconnect,
  })),
}));

afterEach(() => {
  cleanup();
  clearSession();
  mockRouterReplace.mockClear();
  mockRouterPush.mockClear();
  mockDisconnect.mockClear();
  for (const key of Object.keys(socketHandlers)) delete socketHandlers[key];
  vi.unstubAllGlobals();
});

function seedSession() {
  writeSession({
    accessToken: 'test-token',
    userId: 'user-1',
    userName: 'Priya Admin',
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

function mockFetchByUrl(map: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = Object.keys(map).find((candidate) => url.includes(candidate));
      if (!key) {
        throw new Error(`Unhandled fetch in test: ${url}`);
      }
      return jsonResponse(200, map[key]);
    }),
  );
}

const cockpitBody = {
  data: {
    panelOrder: ['ALERTS', 'QUEUE'],
    panels: [
      { panelId: 'ALERTS', title: 'Alerts & Exceptions', itemCount: 0, quickActions: [] },
      { panelId: 'QUEUE', title: 'Queue', itemCount: 1, quickActions: [] },
    ],
    generatedAt: new Date().toISOString(),
  },
};

function changeMetadata(overrides: Record<string, unknown> = {}) {
  return {
    staleVersion: new Date('2026-08-20T09:00:00.000Z').getTime(),
    changedByUser: 'Priya Sharma',
    changedAt: '2026-08-20T09:00:00.000Z',
    reviewPath: '/queue?entryId=entry_1',
    ...overrides,
  };
}

function boardBody(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      expectedArrivals: [
        {
          id: 'entry_expected_1',
          petId: 'pet_2',
          petName: 'Simba',
          ownerName: 'Rahul Verma',
          status: 'EXPECTED',
          isEmergency: false,
          visitReason: 'Vaccination',
          checkedInAt: null,
          queuePriorityAt: '2026-08-20T10:00:00.000Z',
          isExpectedArrival: true,
          changeMetadata: changeMetadata({ reviewPath: '/queue?entryId=entry_expected_1' }),
        },
      ],
      waiting: [
        {
          id: 'entry_1',
          petId: 'pet_1',
          petName: 'Bruno',
          ownerName: 'Asha Rao',
          status: 'WAITING',
          isEmergency: false,
          visitReason: 'Annual checkup',
          checkedInAt: '2026-08-20T09:00:00.000Z',
          queuePriorityAt: '2026-08-20T09:00:00.000Z',
          computedPosition: 1,
          estimatedWaitSeconds: 900,
          isExpectedArrival: false,
          changeMetadata: changeMetadata(),
        },
      ],
      inConsult: [],
      done: [],
      staleState: 'fresh',
      serverUpdatedAt: '2026-08-20T09:00:00.000Z',
      ...overrides,
    },
  };
}

describe('Queue workbench keeps expected arrivals distinct from waiting (D-07, D-41)', () => {
  it('renders expected arrivals in their own section, separate from the ordinary waiting list, with no week-calendar rendering', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'queue/web/board': boardBody(),
    });

    render(
      <AuthProvider>
        <QueuePage />
      </AuthProvider>,
    );

    const expectedSection = await screen.findByRole('region', { name: /expected arrivals/i });
    expect(expectedSection).toHaveTextContent('Simba');

    const waitingSection = screen.getByRole('region', { name: /waiting/i });
    expect(waitingSection).toHaveTextContent('Bruno');
    expect(waitingSection).not.toHaveTextContent('Simba');

    // D-41: never a week-calendar grid on the browser queue page.
    expect(screen.queryByText(/mon|tue|wed|thu|fri|sat|sun/i)).not.toBeInTheDocument();
  });
});

describe('Queue workbench stale-state prompts (D-40, D-43)', () => {
  it('shows the shared StaleStateBanner when the server reports the board as stale', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'queue/web/board': boardBody({ staleState: 'stale' }),
    });

    render(
      <AuthProvider>
        <QueuePage />
      </AuthProvider>,
    );

    const banner = await screen.findByTestId('stale-state-banner');
    expect(banner).toBeInTheDocument();
  });

  it('surfaces a stale prompt from a realtime browser-sync push instead of silently applying it (D-40, D-42)', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'queue/web/board': boardBody(),
    });

    render(
      <AuthProvider>
        <QueuePage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    act(() => {
      socketHandlers['browser:queue-board-sync']?.({
        entryId: 'entry_1',
        staleVersion: new Date('2026-08-20T09:30:00.000Z').getTime(),
        changedByUser: 'Priya Sharma',
        changedAt: '2026-08-20T09:30:00.000Z',
        reviewPath: '/queue?entryId=entry_1',
      });
    });

    const banner = await screen.findByTestId('stale-state-banner');
    expect(banner).toBeInTheDocument();
  });

  it('clears the realtime stale prompt and refetches when Refresh is clicked', async () => {
    seedSession();
    mockFetchByUrl({
      'web-dashboard/cockpit': cockpitBody,
      'queue/web/board': boardBody(),
    });

    render(
      <AuthProvider>
        <QueuePage />
      </AuthProvider>,
    );

    await screen.findByText('Bruno');

    act(() => {
      socketHandlers['browser:queue-board-sync']?.({
        entryId: 'entry_1',
        staleVersion: new Date('2026-08-20T09:30:00.000Z').getTime(),
        changedByUser: 'Priya Sharma',
        changedAt: '2026-08-20T09:30:00.000Z',
        reviewPath: '/queue?entryId=entry_1',
      });
    });

    const banner = await screen.findByTestId('stale-state-banner');
    const refreshButton = banner.querySelector('button');
    expect(refreshButton).not.toBeNull();

    await act(async () => {
      refreshButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();
  });
});
