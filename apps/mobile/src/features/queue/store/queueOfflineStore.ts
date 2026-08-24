import { create } from 'zustand';
import { QueueStatus, SyncVisibilityState } from '@breeyo/types';
import type { QueueEntryWithPet } from '@breeyo/types';

/**
 * Local queue projection (Plan 10-02 Task 1, D-01 to D-03). Keyed by queue
 * entry id so a locally-created entry (id assigned on-device before the
 * server ever sees it) and a locally-modified already-synced entry share
 * one lookup path. `pendingReplayState` is the "local replay status" the
 * plan calls for -- the shared `SyncVisibilityState` (D-18 to D-21) rather
 * than a bespoke enum, so a queue card's pending marker and the app's
 * broader sync-visibility badge stay in the same vocabulary.
 */
export interface LocalQueueEntry {
  entryId: string;
  operationId: string;
  status: QueueStatus;
  pendingReplayState: SyncVisibilityState;
  entry: QueueEntryWithPet;
}

export type LocalQueueOperationInput =
  | {
      type: 'CHECK_IN';
      operationId: string;
      /** The full projected entry to render immediately -- built by the
       *  caller (`useOfflineQueueActions.ts`) from the check-in form input
       *  plus a locally-generated id, so this store stays free of any
       *  ID-generation or "what does a WAITING entry look like" policy. */
      entry: QueueEntryWithPet;
    }
  | {
      type: 'STATUS_TRANSITION';
      operationId: string;
      entryId: string;
      status: QueueStatus;
      /** Required the FIRST time this entryId is mutated while offline, if
       *  it was not itself created offline (i.e. it came from the last
       *  synced board fetch) -- the store has no other way to know what an
       *  entry it never created looked like before the transition. Ignored
       *  once a local record for this id already exists. */
      baseEntry?: QueueEntryWithPet;
    };

interface QueueOfflineStoreState {
  localEntriesById: Record<string, LocalQueueEntry>;
  applyLocalQueueOperation: (input: LocalQueueOperationInput) => LocalQueueEntry;
  markReplaySucceeded: (entryId: string) => void;
  markReplayFailed: (entryId: string) => void;
  clearLocalEntry: (entryId: string) => void;
  reset: () => void;
}

function withStatus(entry: QueueEntryWithPet, status: QueueStatus): QueueEntryWithPet {
  // Preserves everything else on the entry -- check-in time, emergency
  // flag, scheduled metadata (queuePriorityAt/appointmentId), visit reason
  // -- per the plan's explicit instruction; only the status (and the one
  // Phase 3 side-effect WAITING carries, mirrored here for an accurate
  // optimistic render) changes locally. The real, authoritative field
  // updates (treatingVetId, calledAt, position, completedAt) are applied
  // server-side by `queueOfflineReplay.service.ts` on replay -- this is
  // only what the device shows itself in the meantime.
  const updated: QueueEntryWithPet = { ...entry, status };
  if (status === QueueStatus.WAITING) {
    updated.checkedInAt = new Date();
  }
  return updated;
}

export const useQueueOfflineStore = create<QueueOfflineStoreState>((set, get) => ({
  localEntriesById: {},

  applyLocalQueueOperation: (input) => {
    const { localEntriesById } = get();
    let record: LocalQueueEntry;

    if (input.type === 'CHECK_IN') {
      record = {
        entryId: input.entry.id,
        operationId: input.operationId,
        status: input.entry.status as QueueStatus,
        pendingReplayState: SyncVisibilityState.PENDING,
        entry: input.entry,
      };
    } else {
      const existing = localEntriesById[input.entryId];
      const baseEntry = existing?.entry ?? input.baseEntry;
      if (!baseEntry) {
        throw new Error(
          `applyLocalQueueOperation: STATUS_TRANSITION for entry "${input.entryId}" has no existing local record and no baseEntry was supplied.`,
        );
      }
      record = {
        entryId: input.entryId,
        operationId: input.operationId,
        status: input.status,
        pendingReplayState: SyncVisibilityState.PENDING,
        entry: withStatus(baseEntry, input.status),
      };
    }

    set({ localEntriesById: { ...localEntriesById, [record.entryId]: record } });
    return record;
  },

  markReplaySucceeded: (entryId) =>
    set((state) => {
      // A successful replay means the server now holds this entry as its
      // own authoritative record; the next board refetch/invalidation
      // brings it back through normal channels, so the local override is
      // cleared rather than left shadowing (and eventually going stale
      // against) the real copy.
      if (!(entryId in state.localEntriesById)) return state;
      const next = { ...state.localEntriesById };
      delete next[entryId];
      return { localEntriesById: next };
    }),

  markReplayFailed: (entryId) =>
    set((state) => {
      const existing = state.localEntriesById[entryId];
      if (!existing) return state;
      return {
        localEntriesById: {
          ...state.localEntriesById,
          [entryId]: { ...existing, pendingReplayState: SyncVisibilityState.FAILED },
        },
      };
    }),

  clearLocalEntry: (entryId) =>
    set((state) => {
      if (!(entryId in state.localEntriesById)) return state;
      const next = { ...state.localEntriesById };
      delete next[entryId];
      return { localEntriesById: next };
    }),

  reset: () => set({ localEntriesById: {} }),
}));
