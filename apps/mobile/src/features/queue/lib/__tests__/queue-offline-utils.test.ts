import { describe, it, expect } from 'vitest';
import { QueueStatus, ReplayPriority, SyncVisibilityState } from '@breeyo/types';
import type { QueueBoard, QueueEntryWithPet } from '@breeyo/types';
import { ApiClientError } from '../../../../lib/api';
import {
  QUEUE_SYNC_DOMAIN,
  QUEUE_CHECK_IN_ENTITY_TYPE,
  QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
  buildQueueCheckInEnvelope,
  buildQueueStatusTransitionEnvelope,
  isNetworkFailure,
  mergeLocalQueueEntriesIntoBoard,
  findEntryInBoard,
  type LocalQueueEntry,
} from '../queue-offline-utils';

/**
 * `apps/mobile` runs vitest in a plain `node` environment with no
 * Metro/Babel transform (see `QueueBoard.test.tsx`'s own header comment) --
 * this file, like `queue-board-utils.ts`/`queue-optimistic.ts`, is the
 * RN-free module `useOfflineQueueActions.ts` and `QueueScreen.tsx` import
 * from, exercised directly with plain objects.
 */

const CLINIC_ID = 'clinic-1';
const USER_ID = 'user-1';
const DEVICE_ID = 'device-1';
const PET_ID = 'pet-1';
const ENTRY_ID = 'entry-1';

function makeEntry(overrides: Partial<QueueEntryWithPet> = {}): QueueEntryWithPet {
  return {
    id: ENTRY_ID,
    clinicId: CLINIC_ID,
    petId: PET_ID,
    checkedInBy: USER_ID,
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
      id: PET_ID,
      name: 'Buddy',
      species: 'DOG',
      owner: { id: 'owner-1', name: 'Rahul', mobile: '9876543210' },
    },
    ...overrides,
  };
}

function emptyBoard(): QueueBoard {
  return { expected: [], inConsult: [], waiting: [], done: [] };
}

describe('buildQueueCheckInEnvelope', () => {
  it('builds a QUEUE_HIGH envelope preserving the offline check-in instant', () => {
    const envelope = buildQueueCheckInEnvelope({
      operationId: 'op-1',
      entryId: ENTRY_ID,
      deviceId: DEVICE_ID,
      clinicId: CLINIC_ID,
      userId: USER_ID,
      petId: PET_ID,
      isEmergency: true,
      visitReason: 'Vaccination',
      checkedInAt: '2026-08-24T09:30:00.000Z',
    });

    expect(envelope.priority).toBe(ReplayPriority.QUEUE_HIGH);
    expect(envelope.domain).toBe(QUEUE_SYNC_DOMAIN);
    expect(envelope.entityType).toBe(QUEUE_CHECK_IN_ENTITY_TYPE);
    expect(envelope.entityId).toBe(ENTRY_ID);
    expect(envelope.deviceId).toBe(DEVICE_ID);
    expect(envelope.payload).toEqual({
      petId: PET_ID,
      isEmergency: true,
      visitReason: 'Vaccination',
      checkedInAt: '2026-08-24T09:30:00.000Z',
    });
  });
});

describe('buildQueueStatusTransitionEnvelope', () => {
  it('builds a QUEUE_HIGH envelope for a status transition (covers status-change, no-show, and call-next)', () => {
    const envelope = buildQueueStatusTransitionEnvelope({
      operationId: 'op-2',
      entryId: ENTRY_ID,
      deviceId: DEVICE_ID,
      clinicId: CLINIC_ID,
      userId: USER_ID,
      status: QueueStatus.IN_CONSULT,
      createdAt: '2026-08-24T09:35:00.000Z',
    });

    expect(envelope.priority).toBe(ReplayPriority.QUEUE_HIGH);
    expect(envelope.entityType).toBe(QUEUE_STATUS_TRANSITION_ENTITY_TYPE);
    expect(envelope.payload).toEqual({ entryId: ENTRY_ID, status: QueueStatus.IN_CONSULT });
  });
});

describe('isNetworkFailure', () => {
  it('treats a reached-server ApiClientError as NOT a network failure', () => {
    const error = new ApiClientError('Pet was already seen today.', 'SAME_DAY_RECHECK', 409);
    expect(isNetworkFailure(error)).toBe(false);
  });

  it('treats an unreached-server error (e.g. fetch TypeError) as a network failure', () => {
    const error = new TypeError('Network request failed');
    expect(isNetworkFailure(error)).toBe(true);
  });

  it('treats an unknown thrown value as a network failure (fail open to offline capture, not data loss)', () => {
    expect(isNetworkFailure('some string')).toBe(true);
  });
});

describe('mergeLocalQueueEntriesIntoBoard', () => {
  it('returns the board unchanged when there are no local pending entries', () => {
    const board = emptyBoard();
    board.waiting.push(makeEntry());
    expect(mergeLocalQueueEntriesIntoBoard(board, [])).toEqual(board);
  });

  it('renders a fully offline-created check-in in the WAITING section immediately, not a placeholder/separate section', () => {
    const board = emptyBoard();
    const localEntry: LocalQueueEntry = {
      entryId: 'local-entry-1',
      operationId: 'op-1',
      status: QueueStatus.WAITING,
      pendingReplayState: SyncVisibilityState.PENDING,
      entry: makeEntry({ id: 'local-entry-1' }),
    };

    const merged = mergeLocalQueueEntriesIntoBoard(board, [localEntry]);

    expect(merged.waiting).toHaveLength(1);
    expect(merged.waiting[0].id).toBe('local-entry-1');
    expect((merged.waiting[0] as any).pendingReplayState).toBe(SyncVisibilityState.PENDING);
    // Not demoted into some other section or dropped from the real board.
    expect(merged.expected).toHaveLength(0);
    expect(merged.inConsult).toHaveLength(0);
    expect(merged.done).toHaveLength(0);
  });

  it('preserves check-in time, emergency flag, and scheduled metadata on the merged entry', () => {
    const board = emptyBoard();
    const originalCheckIn = new Date('2026-08-24T08:00:00.000Z');
    const localEntry: LocalQueueEntry = {
      entryId: 'local-entry-2',
      operationId: 'op-2',
      status: QueueStatus.WAITING,
      pendingReplayState: SyncVisibilityState.PENDING,
      entry: makeEntry({
        id: 'local-entry-2',
        isEmergency: true,
        checkedInAt: originalCheckIn,
        queuePriorityAt: originalCheckIn,
        appointmentId: 'appt-1',
      }),
    };

    const merged = mergeLocalQueueEntriesIntoBoard(board, [localEntry]);
    const rendered = merged.waiting[0];

    expect(rendered.isEmergency).toBe(true);
    expect(rendered.checkedInAt).toBe(originalCheckIn);
    expect(rendered.queuePriorityAt).toBe(originalCheckIn);
    expect(rendered.appointmentId).toBe('appt-1');
  });

  it('overrides a fetched entry with its own pending local status change, in the section matching the new status', () => {
    const board = emptyBoard();
    board.waiting.push(makeEntry({ id: ENTRY_ID, status: QueueStatus.WAITING }));

    const localEntry: LocalQueueEntry = {
      entryId: ENTRY_ID,
      operationId: 'op-3',
      status: QueueStatus.IN_CONSULT,
      pendingReplayState: SyncVisibilityState.PENDING,
      entry: makeEntry({ id: ENTRY_ID, status: QueueStatus.IN_CONSULT }),
    };

    const merged = mergeLocalQueueEntriesIntoBoard(board, [localEntry]);

    // The stale WAITING copy from the server fetch is gone...
    expect(merged.waiting.find((e) => e.id === ENTRY_ID)).toBeUndefined();
    // ...replaced by exactly one IN_CONSULT copy carrying the pending marker.
    expect(merged.inConsult).toHaveLength(1);
    expect(merged.inConsult[0].id).toBe(ENTRY_ID);
    expect((merged.inConsult[0] as any).pendingReplayState).toBe(SyncVisibilityState.PENDING);
  });

  it('places a locally-created EXPECTED-preserving entry into the correct section', () => {
    const board = emptyBoard();
    const localEntry: LocalQueueEntry = {
      entryId: 'local-entry-3',
      operationId: 'op-4',
      status: QueueStatus.DONE,
      pendingReplayState: SyncVisibilityState.PENDING,
      entry: makeEntry({ id: 'local-entry-3', status: QueueStatus.DONE }),
    };

    const merged = mergeLocalQueueEntriesIntoBoard(board, [localEntry]);
    expect(merged.done).toHaveLength(1);
    expect(merged.done[0].id).toBe('local-entry-3');
  });
});

describe('findEntryInBoard', () => {
  it('finds an entry in whichever section it currently lives in', () => {
    const board = emptyBoard();
    const entry = makeEntry({ id: 'entry-in-consult', status: QueueStatus.IN_CONSULT });
    board.inConsult.push(entry);

    expect(findEntryInBoard(board, 'entry-in-consult')).toBe(entry);
  });

  it('returns undefined when no section contains the entry', () => {
    const board = emptyBoard();
    expect(findEntryInBoard(board, 'missing-entry')).toBeUndefined();
  });
});
