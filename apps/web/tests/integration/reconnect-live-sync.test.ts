// Plan 10-06 Task 1 (PLT-03, D-25, D-26, Phase 9 D-40): the browser-side
// integration proof that a mobile replay (or a rejected stale browser
// write) surfaces as a review-before-overwrite prompt on an already-open
// dashboard tab, never a silent overwrite.
//
// This file is deliberately `.test.ts`, not `.test.tsx` (per 10-06-PLAN.md's
// own file list): it renders the REAL `StaleStateBanner` component via
// `React.createElement` rather than JSX syntax, so no `.tsx` parser is
// required for this file specifically. This is the same real component
// `apps/web/src/features/dashboard/__tests__/replayStaleState.test.tsx`
// (Plan 10-05) already proves in isolation for the queue domain alone; this
// suite composes it across THREE domains in one reconnect narrative (queue,
// inventory, and billing) and adds the domain that Plan 10-05 did not wire a
// dedicated realtime hook for.
//
// Import note: `../../src/...` because this file lives in
// `apps/web/tests/integration/`, two levels below `apps/web/`, not inside
// `apps/web/src/features/dashboard/__tests__/`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useReplayStaleState } from '../../src/features/dashboard/hooks/useReplayStaleState';
import { StaleStateBanner } from '../../src/features/dashboard/components/StaleStateBanner';
import { useQueueReplayRealtime } from '../../src/features/queue/hooks/useQueueReplayRealtime';
import { useInventoryReplayRealtime } from '../../src/features/inventory/hooks/useInventoryReplayRealtime';

// Same handler-map mock `replayStaleState.test.tsx` uses for
// `useQueueRealtime.ts`/the two Plan 10-05 replay hooks -- there is no
// production code path that emits `replay:applied`/`replay:conflict-opened`
// over a real socket yet (`ReplayBroadcastService` is built and unit-tested
// but not wired into any replay-ingest service -- see 10-06-SUMMARY.md), so
// simulating the server push at the socket-handler level is the only
// available way to prove what an already-open tab does when one arrives.
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
  cleanup();
  mockDisconnect.mockClear();
  mockIo.mockClear();
  for (const key of Object.keys(socketHandlers)) delete socketHandlers[key];
});

/** One dashboard widget: wires a domain-scoped realtime hook into
 *  `useReplayStaleState` and renders the real `StaleStateBanner` whenever
 *  overtaken -- exactly the composition a real queue-board or
 *  inventory-alerts page would use. */
function renderDomainWidget(
  domainHook: typeof useQueueReplayRealtime,
  watchedEntityIds: string[],
  reviewChanges: () => void,
) {
  function Widget() {
    const { status, onReplayApplied, onReplayConflictOpened, acknowledge } = useReplayStaleState(watchedEntityIds);
    domainHook('token-1', 'clinic-1', onReplayApplied, onReplayConflictOpened);
    return createElement(
      'div',
      null,
      status !== 'fresh'
        ? createElement(StaleStateBanner, { status, onRefresh: acknowledge, onReviewChanges: reviewChanges })
        : null,
    );
  }
  return render(createElement(Widget));
}

describe('Reconnect live sync -- replayed changes surface as review prompts on an open browser tab, never a silent overwrite (D-25, D-26, Phase 9 D-40)', () => {
  it('a queue-board tab open during a mobile reconnect shows the stale prompt for the replayed entry, and Refresh clears it without ever silently swapping in new data behind the user', () => {
    renderDomainWidget(useQueueReplayRealtime, ['entry_42'], () => {});

    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    // A mobile device reconnects and its queue-first replay lands.
    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'queue', entityIds: ['entry_42'] });
    });

    const banner = screen.getByTestId('stale-state-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/out of date/i)).toBeInTheDocument();

    // The tab must not have silently re-rendered fresh data on its own --
    // the prompt stays up until the user explicitly acts.
    expect(screen.getByTestId('stale-state-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Refresh'));
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();
  });

  it('an inventory tab watching a different entity ignores a queue-domain replay (defense in depth beyond server room scoping), then correctly escalates to the conflict prompt for its own domain', () => {
    renderDomainWidget(useInventoryReplayRealtime, ['item_7'], () => {});

    // Cross-talk from a queue reconnect on the same clinic must not leak
    // into the inventory widget.
    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'queue', entityIds: ['item_7'] });
    });
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    // A genuine inventory-domain conflict (e.g. an offline FIFO mismatch
    // that opened an operational review task, Plan 10-04) opens for the
    // watched item.
    act(() => {
      socketHandlers['replay:conflict-opened']?.({ clinicId: 'clinic-1', domain: 'inventory', entityIds: ['item_7'] });
    });

    const banner = screen.getByTestId('stale-state-banner');
    expect(banner).toBeInTheDocument();
    expect(screen.getByText(/changed elsewhere/i)).toBeInTheDocument();

    // A later replay-applied for the SAME item (e.g. a second, unrelated
    // reconnect) must never quietly downgrade an open conflict back to a
    // mere "stale" prompt -- D-05 review-before-overwrite would be violated
    // if a real conflict could be paved over by a later routine sync.
    act(() => {
      socketHandlers['replay:applied']?.({ clinicId: 'clinic-1', domain: 'inventory', entityIds: ['item_7'] });
    });
    expect(screen.getByText(/changed elsewhere/i)).toBeInTheDocument();
  });

  it('"Review changes" (not just Refresh) is the conflict-resolution path, and is wired to a real caller action rather than a no-op', () => {
    const onReviewChanges = vi.fn();
    renderDomainWidget(useInventoryReplayRealtime, ['item_9'], onReviewChanges);

    act(() => {
      socketHandlers['replay:conflict-opened']?.({ clinicId: 'clinic-1', domain: 'inventory', entityIds: ['item_9'] });
    });

    fireEvent.click(screen.getByText('Review changes'));
    expect(onReviewChanges).toHaveBeenCalledTimes(1);
    // Unlike Refresh, reviewing changes does not itself dismiss the banner
    // -- the conflict remains open until the underlying record is actually
    // resolved server-side, matching D-11 (unresolved conflicts stay
    // visible until actually cleared).
    expect(screen.getByTestId('stale-state-banner')).toBeInTheDocument();
  });

  it('billing: a stale web write rejected with a 409 STALE_WRITE_CONFLICT (Plan 10-05\'s expectedVersion mechanism) surfaces through the SAME reusable stale-state machine and banner, rather than the caller silently retrying or applying its optimistic update', async () => {
    // There is no dedicated `useBillingReplayRealtime` socket hook (Plan
    // 10-05 built one for queue and inventory only -- see 10-06-SUMMARY.md).
    // Billing's own offline-recovery race is not a mobile-replay broadcast
    // in the first place (Phase 6 D-41: billing is never captured offline),
    // it is a stale BROWSER write racing another session/replay, caught by
    // the write-side `expectedVersion` check `billing-workbench.service.ts`
    // added in Plan 10-05 and surfaced over HTTP as a 409 whose `.conflict`
    // payload the error-handler now forwards (a real gap found and fixed
    // while building this suite -- see 10-06-SUMMARY.md). This proves the
    // domain-agnostic `useReplayStaleState` mechanism generalizes correctly
    // to that write-rejection path using the REAL response shape, without
    // needing a new production hook to do it.
    const staleWriteConflictResponse = {
      error: {
        code: 'STALE_WRITE_CONFLICT',
        message: 'This record changed elsewhere while you were viewing it. Refresh and review before retrying.',
        conflict: {
          domain: 'billing',
          entityType: 'INVOICE',
          entityId: 'invoice_123',
          currentVersion: 1_700_000_050_000,
          expectedVersion: 1_700_000_000_000,
          severity: 'OPERATIONAL',
        },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => staleWriteConflictResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    let latestStatus = 'unset';
    let acknowledgeFn: (() => void) | null = null;
    let onReplayConflictOpenedRef: ((ids: string[]) => void) | null = null;

    function BillingWidget() {
      const { status, onReplayConflictOpened, acknowledge } = useReplayStaleState(['invoice_123']);
      latestStatus = status;
      acknowledgeFn = acknowledge;
      onReplayConflictOpenedRef = onReplayConflictOpened;
      return createElement(
        'div',
        null,
        status !== 'fresh'
          ? createElement(StaleStateBanner, { status, onRefresh: acknowledge, onReviewChanges: () => {} })
          : null,
      );
    }

    render(createElement(BillingWidget));
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    // Simulate the web collect-payment mutation's own error handler: on a
    // 409 STALE_WRITE_CONFLICT it must open the conflict prompt for the
    // affected invoice instead of silently re-applying the payment against
    // stale state.
    const response = await fetch('/api/v1/billing/web/invoices/invoice_123/collect-payment', { method: 'POST' });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('STALE_WRITE_CONFLICT');
    expect(body.error.conflict.entityId).toBe('invoice_123');

    act(() => {
      onReplayConflictOpenedRef?.([body.error.conflict.entityId]);
    });

    expect(latestStatus).toBe('conflict');
    expect(screen.getByTestId('stale-state-banner')).toBeInTheDocument();
    expect(screen.getByText(/changed elsewhere/i)).toBeInTheDocument();

    act(() => {
      acknowledgeFn?.();
    });
    expect(screen.queryByTestId('stale-state-banner')).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});
