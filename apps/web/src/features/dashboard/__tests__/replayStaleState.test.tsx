// Plan 10-05 Task 2: browser stale-state review on replay overtakes
// (Phase 9 D-40, this plan's D-05-for-the-browser-side extension).
// `useReplayStaleState` is the shared state machine; `useQueueReplayRealtime`
// / `useInventoryReplayRealtime` are the domain-scoped socket subscribers
// that feed it. All three are proven here against the EXISTING
// `StaleStateBanner` component (Phase 9) rather than a new parallel one.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, renderHook, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useReplayStaleState } from '../hooks/useReplayStaleState';
import { StaleStateBanner } from '../components/StaleStateBanner';
import { useQueueReplayRealtime } from '../../queue/hooks/useQueueReplayRealtime';
import { useInventoryReplayRealtime } from '../../inventory/hooks/useInventoryReplayRealtime';

afterEach(() => {
  cleanup();
});

describe('useReplayStaleState (D-40: overtaken views prompt instead of silently applying stale data)', () => {
  it('starts fresh when nothing has been replayed yet', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1', 'entry_2']));
    expect(result.current.status).toBe('fresh');
  });

  it('flips to stale when a REPLAY_APPLIED event names one of this view watched entity ids', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1', 'entry_2']));

    act(() => result.current.onReplayApplied(['entry_1']));

    expect(result.current.status).toBe('stale');
  });

  it('ignores a REPLAY_APPLIED event for an entity this view is not currently watching', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1', 'entry_2']));

    act(() => result.current.onReplayApplied(['some_other_entry']));

    expect(result.current.status).toBe('fresh');
  });

  it('flips to conflict (not merely stale) when a REPLAY_CONFLICT_OPENED event names a watched entity', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1']));

    act(() => result.current.onReplayConflictOpened(['entry_1']));

    expect(result.current.status).toBe('conflict');
  });

  it('never downgrades an open conflict back to plain stale on a later REPLAY_APPLIED for the same entity', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1']));

    act(() => result.current.onReplayConflictOpened(['entry_1']));
    act(() => result.current.onReplayApplied(['entry_1']));

    expect(result.current.status).toBe('conflict');
  });

  it('acknowledge() resets the prompt to fresh (the "Refresh" action)', () => {
    const { result } = renderHook(() => useReplayStaleState(['entry_1']));

    act(() => result.current.onReplayApplied(['entry_1']));
    expect(result.current.status).toBe('stale');

    act(() => result.current.acknowledge());
    expect(result.current.status).toBe('fresh');
  });
});

describe('useReplayStaleState driving the existing StaleStateBanner (D-40)', () => {
  function Harness({ watchedEntityIds }: { watchedEntityIds: string[] }) {
    const { status, onReplayApplied, acknowledge } = useReplayStaleState(watchedEntityIds);
    return (
      <div>
        <button type="button" onClick={() => onReplayApplied(watchedEntityIds)}>
          simulate-replay
        </button>
        {status !== 'fresh' ? (
          <StaleStateBanner status={status} onRefresh={acknowledge} onReviewChanges={() => {}} />
        ) : null}
      </div>
    );
  }

  it('renders no banner while fresh, then renders the real StaleStateBanner once overtaken, and Refresh clears it', () => {
    render(<Harness watchedEntityIds={['entry_1']} />);

    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('simulate-replay'));
    expect(screen.getByTestId('stale-state-banner')).toBeInTheDocument();
    expect(screen.getByText(/out of date/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Refresh'));
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();
  });
});

// The socket handler map lets a test simulate a server-pushed scoped replay
// event without a real Socket.IO connection, matching
// `apps/web/src/features/queue/__tests__/queue-board.test.tsx`'s existing
// mocking convention for `useQueueRealtime.ts`.
const socketHandlers: Record<string, (payload: unknown) => void> = {};
const mockDisconnect = vi.fn();
const mockIo = vi.fn(() => ({
  on: (event: string, handler: (payload: unknown) => void) => {
    socketHandlers[event] = handler;
  },
  disconnect: mockDisconnect,
}));

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => mockIo(...(args as [])),
}));

afterEach(() => {
  mockDisconnect.mockClear();
  mockIo.mockClear();
  for (const key of Object.keys(socketHandlers)) delete socketHandlers[key];
});

describe('useQueueReplayRealtime (domain-scoped replay-broadcast consumer)', () => {
  it('calls onReplayApplied with the affected entity ids when a queue-domain REPLAY_APPLIED event arrives', async () => {
    const onReplayApplied = vi.fn();
    const onReplayConflictOpened = vi.fn();

    renderHook(() => useQueueReplayRealtime('token-1', 'clinic-1', onReplayApplied, onReplayConflictOpened));

    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'queue', entityIds: ['entry_1'] });
    });

    expect(onReplayApplied).toHaveBeenCalledWith(['entry_1']);
  });

  it('ignores a REPLAY_APPLIED event for a different domain (defense in depth beyond server-side room scoping)', async () => {
    const onReplayApplied = vi.fn();
    const onReplayConflictOpened = vi.fn();

    renderHook(() => useQueueReplayRealtime('token-1', 'clinic-1', onReplayApplied, onReplayConflictOpened));

    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'inventory', entityIds: ['item_1'] });
    });

    expect(onReplayApplied).not.toHaveBeenCalled();
  });

  it('calls onReplayConflictOpened for a queue-domain REPLAY_CONFLICT_OPENED event', async () => {
    const onReplayApplied = vi.fn();
    const onReplayConflictOpened = vi.fn();

    renderHook(() => useQueueReplayRealtime('token-1', 'clinic-1', onReplayApplied, onReplayConflictOpened));

    act(() => {
      socketHandlers['replay:conflict-opened']?.({ clinicId: 'clinic-1', domain: 'queue', entityIds: ['entry_2'] });
    });

    expect(onReplayConflictOpened).toHaveBeenCalledWith(['entry_2']);
  });

  it('disconnects the socket on unmount', async () => {
    const { unmount } = renderHook(() => useQueueReplayRealtime('token-1', 'clinic-1', vi.fn(), vi.fn()));

    unmount();

    expect(mockDisconnect).toHaveBeenCalled();
  });
});

describe('useInventoryReplayRealtime (domain-scoped replay-broadcast consumer)', () => {
  it('calls onReplayApplied only for inventory-domain events', async () => {
    const onReplayApplied = vi.fn();
    const onReplayConflictOpened = vi.fn();

    renderHook(() => useInventoryReplayRealtime('token-1', 'clinic-1', onReplayApplied, onReplayConflictOpened));

    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'queue', entityIds: ['entry_1'] });
    });
    expect(onReplayApplied).not.toHaveBeenCalled();

    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'inventory', entityIds: ['item_1'] });
    });
    expect(onReplayApplied).toHaveBeenCalledWith(['item_1']);
  });
});
