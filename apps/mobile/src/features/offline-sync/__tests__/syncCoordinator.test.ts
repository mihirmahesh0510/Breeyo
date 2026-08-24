import { describe, it, expect, vi } from 'vitest';
import { ReplayPriority } from '@breeyo/types';
import {
  runReplayCycle,
  preemptLowerPriorityReplay,
  type ReplayableOperation,
  type ReplayCycleDeps,
} from '../services/syncCoordinator';

function op(operationId: string, priority: ReplayPriority): ReplayableOperation {
  return {
    operationId,
    priority,
    envelope: {
      deviceId: 'device-1',
      operationId,
      clinicId: 'clinic-1',
      userId: 'user-1',
      domain: 'test-domain',
      entityType: 'TestEntity',
      entityId: `entity-${operationId}`,
      priority,
      createdAt: new Date().toISOString(),
      payload: {},
    },
  };
}

/**
 * A mutable in-memory backlog keyed by priority tier, mimicking the local
 * SQLite-backed operations ledger. Mutating `store[priority]` mid-cycle
 * (e.g. from inside a `sendOperation` callback) simulates a new
 * higher-priority operation arriving from the UI while a replay cycle is
 * already in flight -- exactly the scenario D-12 to D-14 preemption must
 * handle.
 */
function createStore(initial: Partial<Record<ReplayPriority, ReplayableOperation[]>>) {
  const store: Record<ReplayPriority, ReplayableOperation[]> = {
    [ReplayPriority.QUEUE_HIGH]: [],
    [ReplayPriority.CLINICAL_MEDIUM]: [],
    [ReplayPriority.INVENTORY_MEDIUM]: [],
    [ReplayPriority.ANCILLARY_LOW]: [],
    ...initial,
  };
  return store;
}

describe('preemptLowerPriorityReplay', () => {
  it('returns the highest-priority tier with pending work above the current tier', () => {
    const result = preemptLowerPriorityReplay(ReplayPriority.ANCILLARY_LOW, {
      [ReplayPriority.QUEUE_HIGH]: 1,
      [ReplayPriority.CLINICAL_MEDIUM]: 0,
      [ReplayPriority.INVENTORY_MEDIUM]: 2,
    });
    expect(result).toBe(ReplayPriority.QUEUE_HIGH);
  });

  it('returns null when no higher tier has pending work', () => {
    const result = preemptLowerPriorityReplay(ReplayPriority.CLINICAL_MEDIUM, {
      [ReplayPriority.QUEUE_HIGH]: 0,
    });
    expect(result).toBeNull();
  });

  it('never treats a lower or equal tier as a preemption candidate', () => {
    const result = preemptLowerPriorityReplay(ReplayPriority.QUEUE_HIGH, {
      [ReplayPriority.QUEUE_HIGH]: 5,
      [ReplayPriority.CLINICAL_MEDIUM]: 5,
      [ReplayPriority.INVENTORY_MEDIUM]: 5,
      [ReplayPriority.ANCILLARY_LOW]: 5,
    });
    expect(result).toBeNull();
  });
});

describe('runReplayCycle', () => {
  it('replays QUEUE_HIGH before every other tier (D-12)', async () => {
    const store = createStore({
      [ReplayPriority.ANCILLARY_LOW]: [op('a1', ReplayPriority.ANCILLARY_LOW)],
      [ReplayPriority.INVENTORY_MEDIUM]: [op('i1', ReplayPriority.INVENTORY_MEDIUM)],
      [ReplayPriority.CLINICAL_MEDIUM]: [op('c1', ReplayPriority.CLINICAL_MEDIUM)],
      [ReplayPriority.QUEUE_HIGH]: [op('q1', ReplayPriority.QUEUE_HIGH)],
    });

    const sendOperation = vi.fn(async (pending: ReplayableOperation) => {
      store[pending.priority] = store[pending.priority].filter((o) => o.operationId !== pending.operationId);
      return { operationId: pending.operationId, succeeded: true };
    });

    const deps: ReplayCycleDeps = {
      getPendingOperations: (priority) => store[priority],
      sendOperation,
    };

    const result = await runReplayCycle(deps);

    expect(result.processedOperationIds).toEqual(['q1', 'c1', 'i1', 'a1']);
  });

  it('replays remaining backlog by operational priority tier rather than raw arrival order (D-13)', async () => {
    // Arrival order (if this were naive FIFO) would be a1, i1, c1 -- but tier
    // order must win.
    const store = createStore({
      [ReplayPriority.ANCILLARY_LOW]: [op('a1', ReplayPriority.ANCILLARY_LOW)],
      [ReplayPriority.INVENTORY_MEDIUM]: [op('i1', ReplayPriority.INVENTORY_MEDIUM)],
      [ReplayPriority.CLINICAL_MEDIUM]: [op('c1', ReplayPriority.CLINICAL_MEDIUM)],
    });

    const sendOperation = vi.fn(async (pending: ReplayableOperation) => {
      store[pending.priority] = store[pending.priority].filter((o) => o.operationId !== pending.operationId);
      return { operationId: pending.operationId, succeeded: true };
    });

    const result = await runReplayCycle({ getPendingOperations: (priority) => store[priority], sendOperation });

    expect(result.processedOperationIds).toEqual(['c1', 'i1', 'a1']);
  });

  it('preempts unsent lower-tier work when a new higher-priority operation arrives mid-cycle (D-14)', async () => {
    const store = createStore({
      [ReplayPriority.ANCILLARY_LOW]: [op('a1', ReplayPriority.ANCILLARY_LOW), op('a2', ReplayPriority.ANCILLARY_LOW)],
    });

    let injected = false;

    const sendOperation = vi.fn(async (pending: ReplayableOperation) => {
      store[pending.priority] = store[pending.priority].filter((o) => o.operationId !== pending.operationId);

      // Simulate a brand-new QUEUE_HIGH check-in arriving from the UI right
      // after the first ANCILLARY_LOW item is sent, before the second one
      // goes out.
      if (pending.operationId === 'a1' && !injected) {
        injected = true;
        store[ReplayPriority.QUEUE_HIGH].push(op('q-late', ReplayPriority.QUEUE_HIGH));
      }

      return { operationId: pending.operationId, succeeded: true };
    });

    const result = await runReplayCycle({ getPendingOperations: (priority) => store[priority], sendOperation });

    // a1 goes first (nothing else pending yet), then the newly-arrived
    // q-late preempts and runs before a2 gets its turn.
    expect(result.processedOperationIds).toEqual(['a1', 'q-late', 'a2']);
    expect(result.preemptions).toEqual([
      { pausedPriority: ReplayPriority.ANCILLARY_LOW, resumedForPriority: ReplayPriority.QUEUE_HIGH },
    ]);
  });

  it('does not let a SAFETY_CRITICAL conflict in CLINICAL_MEDIUM preempt QUEUE_HIGH replay (D-37)', async () => {
    // A CLINICAL_MEDIUM operation carrying a safety-critical conflict flag in
    // its payload must still wait behind QUEUE_HIGH -- there is no
    // severity-based exception to the tier ladder.
    const store = createStore({
      [ReplayPriority.QUEUE_HIGH]: [op('q1', ReplayPriority.QUEUE_HIGH), op('q2', ReplayPriority.QUEUE_HIGH)],
      [ReplayPriority.CLINICAL_MEDIUM]: [
        {
          ...op('c-safety', ReplayPriority.CLINICAL_MEDIUM),
          envelope: {
            ...op('c-safety', ReplayPriority.CLINICAL_MEDIUM).envelope,
            payload: { severity: 'SAFETY_CRITICAL' },
          },
        },
      ],
    });

    const sendOperation = vi.fn(async (pending: ReplayableOperation) => {
      store[pending.priority] = store[pending.priority].filter((o) => o.operationId !== pending.operationId);
      return { operationId: pending.operationId, succeeded: true };
    });

    const result = await runReplayCycle({ getPendingOperations: (priority) => store[priority], sendOperation });

    expect(result.processedOperationIds).toEqual(['q1', 'q2', 'c-safety']);
    expect(result.preemptions).toEqual([]);
  });

  it('moves on to the next tier when the head-of-line item in a tier fails, instead of blocking every lower tier forever', async () => {
    const store = createStore({
      [ReplayPriority.QUEUE_HIGH]: [op('q-fail', ReplayPriority.QUEUE_HIGH)],
      [ReplayPriority.CLINICAL_MEDIUM]: [op('c1', ReplayPriority.CLINICAL_MEDIUM)],
    });

    const sendOperation = vi.fn(async (pending: ReplayableOperation) => {
      if (pending.operationId === 'q-fail') {
        return { operationId: pending.operationId, succeeded: false, errorCode: 'SERVER_ERROR' };
      }
      store[pending.priority] = store[pending.priority].filter((o) => o.operationId !== pending.operationId);
      return { operationId: pending.operationId, succeeded: true };
    });

    const result = await runReplayCycle({ getPendingOperations: (priority) => store[priority], sendOperation });

    expect(result.processedOperationIds).toEqual(['c1']);
    // The failed operation is left in place for the failure-center/guided
    // retry flow -- runReplayCycle never silently drops it.
    expect(store[ReplayPriority.QUEUE_HIGH]).toHaveLength(1);
  });
});
