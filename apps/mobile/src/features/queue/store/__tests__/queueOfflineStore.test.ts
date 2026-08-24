import { describe, it, expect, beforeEach } from 'vitest';
import { QueueStatus, SyncVisibilityState } from '@breeyo/types';
import type { QueueEntryWithPet } from '@breeyo/types';
import { useQueueOfflineStore } from '../queueOfflineStore';

/**
 * zustand stores have no React Native dependency, so (unlike
 * `useOfflineQueueActions.ts`/`QueueBoard.tsx`) this store is exercised
 * directly, the same way `queueUIStore.ts` would be if it had tests.
 */

const ENTRY_ID = 'entry-1';

function makeEntry(overrides: Partial<QueueEntryWithPet> = {}): QueueEntryWithPet {
  return {
    id: ENTRY_ID,
    clinicId: 'clinic-1',
    petId: 'pet-1',
    checkedInBy: 'user-1',
    treatingVetId: null,
    status: QueueStatus.WAITING,
    position: 1,
    isEmergency: false,
    visitReason: null,
    checkedInAt: new Date('2026-08-24T09:30:00.000Z'),
    calledAt: null,
    completedAt: null,
    archivedAt: null,
    updatedAt: new Date('2026-08-24T09:30:00.000Z'),
    queuePriorityAt: new Date('2026-08-24T09:30:00.000Z'),
    appointmentId: null,
    pet: {
      id: 'pet-1',
      name: 'Buddy',
      species: 'DOG',
      owner: { id: 'owner-1', name: 'Rahul', mobile: '9876543210' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  useQueueOfflineStore.getState().reset();
});

describe('queueOfflineStore', () => {
  it('applyLocalQueueOperation(CHECK_IN) projects a new local entry as PENDING', () => {
    const entry = makeEntry({ isEmergency: true });

    const record = useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-1',
      entry,
    });

    expect(record.pendingReplayState).toBe(SyncVisibilityState.PENDING);
    expect(record.entryId).toBe(ENTRY_ID);
    expect(record.entry.isEmergency).toBe(true);

    const state = useQueueOfflineStore.getState();
    expect(state.localEntriesById[ENTRY_ID]).toEqual(record);
  });

  it('applyLocalQueueOperation(STATUS_TRANSITION) updates an existing local entry\'s status while preserving check-in time and emergency flag', () => {
    const originalCheckIn = new Date('2026-08-24T08:00:00.000Z');
    useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-1',
      entry: makeEntry({ isEmergency: true, checkedInAt: originalCheckIn, queuePriorityAt: originalCheckIn }),
    });

    const record = useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'STATUS_TRANSITION',
      operationId: 'op-2',
      entryId: ENTRY_ID,
      status: QueueStatus.IN_CONSULT,
    });

    expect(record.status).toBe(QueueStatus.IN_CONSULT);
    expect(record.entry.status).toBe(QueueStatus.IN_CONSULT);
    expect(record.entry.isEmergency).toBe(true);
    expect(record.entry.queuePriorityAt).toBe(originalCheckIn);
    expect(record.pendingReplayState).toBe(SyncVisibilityState.PENDING);
  });

  it('applyLocalQueueOperation(STATUS_TRANSITION) accepts a baseEntry for an entry that was never locally created (an already-synced entry mutated while offline)', () => {
    const baseEntry = makeEntry({ status: QueueStatus.WAITING });

    const record = useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'STATUS_TRANSITION',
      operationId: 'op-3',
      entryId: ENTRY_ID,
      status: QueueStatus.NO_SHOW,
      baseEntry,
    });

    expect(record.status).toBe(QueueStatus.NO_SHOW);
    expect(record.entry.petId).toBe(baseEntry.petId);
  });

  it('throws when a STATUS_TRANSITION targets an unknown entry with no baseEntry supplied', () => {
    expect(() =>
      useQueueOfflineStore.getState().applyLocalQueueOperation({
        type: 'STATUS_TRANSITION',
        operationId: 'op-4',
        entryId: 'unknown-entry',
        status: QueueStatus.IN_CONSULT,
      }),
    ).toThrow();
  });

  it('markReplaySucceeded clears the local override so the server copy takes over again', () => {
    useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-1',
      entry: makeEntry(),
    });
    expect(useQueueOfflineStore.getState().localEntriesById[ENTRY_ID]).toBeDefined();

    useQueueOfflineStore.getState().markReplaySucceeded(ENTRY_ID);

    expect(useQueueOfflineStore.getState().localEntriesById[ENTRY_ID]).toBeUndefined();
  });

  it('markReplayFailed flips pendingReplayState to FAILED without discarding the local entry', () => {
    useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-1',
      entry: makeEntry(),
    });

    useQueueOfflineStore.getState().markReplayFailed(ENTRY_ID);

    const record = useQueueOfflineStore.getState().localEntriesById[ENTRY_ID];
    expect(record.pendingReplayState).toBe(SyncVisibilityState.FAILED);
    expect(record.entry.id).toBe(ENTRY_ID);
  });

  it('clearLocalEntry removes a single local entry without affecting others', () => {
    useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-1',
      entry: makeEntry({ id: 'entry-a' }),
    });
    useQueueOfflineStore.getState().applyLocalQueueOperation({
      type: 'CHECK_IN',
      operationId: 'op-2',
      entry: makeEntry({ id: 'entry-b' }),
    });

    useQueueOfflineStore.getState().clearLocalEntry('entry-a');

    const state = useQueueOfflineStore.getState();
    expect(state.localEntriesById['entry-a']).toBeUndefined();
    expect(state.localEntriesById['entry-b']).toBeDefined();
  });
});
