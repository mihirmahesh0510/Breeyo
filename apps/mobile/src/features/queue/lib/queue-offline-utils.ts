/**
 * RN-free helpers backing `useOfflineQueueActions.ts` and `QueueScreen.tsx`
 * (Plan 10-02 Task 1). Kept out of those two files for the same reason
 * `queue-optimistic.ts`/`queue-board-utils.ts` exist: `apps/mobile` runs
 * vitest in a plain `node` environment with no Metro/Babel transform, so
 * anything importing `react-native`/`expo-haptics` cannot be exercised
 * directly -- the actual decisions (envelope shape, network-vs-server-error
 * classification, and how a pending local mutation renders on the fetched
 * board) live here instead, as plain functions over plain objects.
 */
import { QueueStatus, ReplayPriority, type OfflineOperationEnvelope, type SyncVisibilityState } from '@breeyo/types';
import type { QueueBoard, QueueEntryWithPet } from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';

/**
 * Must match `apps/api/src/modules/queue/services/queueOfflineReplay.service.ts`'s
 * own constants exactly -- these are the wire contract between the two.
 */
export const QUEUE_SYNC_DOMAIN = 'queue';
export const QUEUE_CHECK_IN_ENTITY_TYPE = 'QUEUE_CHECK_IN';
export const QUEUE_STATUS_TRANSITION_ENTITY_TYPE = 'QUEUE_STATUS_TRANSITION';

export interface QueueCheckInPayload {
  petId: string;
  visitReason?: string;
  isEmergency: boolean;
  /** The device's own check-in instant (ISO), not the eventual replay instant. */
  checkedInAt: string;
}

export interface QueueStatusTransitionPayload {
  entryId: string;
  status: QueueStatus;
}

export interface BuildQueueCheckInEnvelopeInput {
  operationId: string;
  /** Locally-generated queue entry id, also used as the envelope's `entityId`. */
  entryId: string;
  deviceId: string;
  clinicId: string;
  userId: string;
  petId: string;
  visitReason?: string;
  isEmergency: boolean;
  checkedInAt: string;
}

/**
 * D-01 to D-03, D-12: every offline check-in enqueues at `QUEUE_HIGH` so it
 * always replays before any other domain's backlog on reconnect.
 */
export function buildQueueCheckInEnvelope(
  input: BuildQueueCheckInEnvelopeInput,
): OfflineOperationEnvelope<QueueCheckInPayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: QUEUE_SYNC_DOMAIN,
    entityType: QUEUE_CHECK_IN_ENTITY_TYPE,
    entityId: input.entryId,
    priority: ReplayPriority.QUEUE_HIGH,
    createdAt: input.checkedInAt,
    payload: {
      petId: input.petId,
      visitReason: input.visitReason,
      isEmergency: input.isEmergency,
      checkedInAt: input.checkedInAt,
    },
  };
}

export interface BuildQueueStatusTransitionEnvelopeInput {
  operationId: string;
  entryId: string;
  deviceId: string;
  clinicId: string;
  userId: string;
  status: QueueStatus;
  createdAt: string;
}

/**
 * Covers status-change, no-show (`status: NO_SHOW`), and call-next
 * (`status: IN_CONSULT` targeting the entry the device's own local
 * projection picked as "next") -- from the replay contract's point of view
 * all three are just "move this entry id to this status."
 */
export function buildQueueStatusTransitionEnvelope(
  input: BuildQueueStatusTransitionEnvelopeInput,
): OfflineOperationEnvelope<QueueStatusTransitionPayload> {
  return {
    deviceId: input.deviceId,
    operationId: input.operationId,
    clinicId: input.clinicId,
    userId: input.userId,
    domain: QUEUE_SYNC_DOMAIN,
    entityType: QUEUE_STATUS_TRANSITION_ENTITY_TYPE,
    entityId: input.entryId,
    priority: ReplayPriority.QUEUE_HIGH,
    createdAt: input.createdAt,
    payload: { entryId: input.entryId, status: input.status },
  };
}

/**
 * D-02: distinguishes "the server was never reached" (go offline, enqueue
 * for later replay) from "the server responded, and rejected the request"
 * (a real error -- e.g. `SAME_DAY_RECHECK`, `INVALID_TRANSITION` -- that
 * must surface to the caller, not be silently swallowed into an offline
 * queue entry). `apiClient` (`apps/mobile/src/lib/api.ts`) only ever throws
 * `ApiClientError` for a request that reached the server and got a
 * response; anything else reaching a caller's catch block (a raw fetch
 * `TypeError`, a JSON parse failure, React Native's own connectivity
 * rejection) means the server was never reached at all.
 */
export function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiClientError);
}

export interface LocalQueueEntry {
  entryId: string;
  operationId: string;
  status: QueueStatus;
  pendingReplayState: SyncVisibilityState;
  entry: QueueEntryWithPet;
}

/** The shape rendered on a queue card once a local mutation is pending replay. */
export type QueueEntryWithPendingState = QueueEntryWithPet & { pendingReplayState?: SyncVisibilityState };

function sectionForStatus(status: QueueStatus): keyof QueueBoard {
  switch (status) {
    case QueueStatus.EXPECTED:
      return 'expected';
    case QueueStatus.WAITING:
      return 'waiting';
    case QueueStatus.IN_CONSULT:
      return 'inConsult';
    case QueueStatus.DONE:
    case QueueStatus.NO_SHOW:
    default:
      return 'done';
  }
}

/**
 * Merges locally-pending queue mutations onto a fetched `QueueBoard` for
 * rendering (D-03, D-19): a locally-created or locally-updated entry
 * appears immediately in the SAME section a synced entry with that status
 * would live in, carrying a quiet `pendingReplayState` marker -- never
 * demoted into a separate "pending" section and never rendered twice (once
 * as the fetched, possibly-stale copy and once as the local one).
 */
export function mergeLocalQueueEntriesIntoBoard(board: QueueBoard, localEntries: LocalQueueEntry[]): QueueBoard {
  if (localEntries.length === 0) {
    return board;
  }

  const localIds = new Set(localEntries.map((local) => local.entryId));
  const withoutOverridden = (list: QueueEntryWithPet[]) => list.filter((entry) => !localIds.has(entry.id));

  const merged: QueueBoard = {
    expected: withoutOverridden(board.expected),
    inConsult: withoutOverridden(board.inConsult),
    waiting: withoutOverridden(board.waiting),
    done: withoutOverridden(board.done),
  };

  for (const local of localEntries) {
    const annotated: QueueEntryWithPendingState = {
      ...local.entry,
      pendingReplayState: local.pendingReplayState,
    };
    merged[sectionForStatus(local.status)].push(annotated);
  }

  return merged;
}

/**
 * Looks up an entry by id across every section of a `QueueBoard`, wherever
 * it currently lives. Used by `useOfflineQueueActions.ts` to find the
 * "before" copy of an entry a status-transition/no-show/call-next targets,
 * so `queueOfflineStore`'s `STATUS_TRANSITION` operation can seed a full
 * local record (`baseEntry`) for an entry that was never itself created
 * offline.
 */
export function findEntryInBoard(board: QueueBoard, entryId: string): QueueEntryWithPet | undefined {
  return (
    board.expected.find((entry) => entry.id === entryId) ??
    board.inConsult.find((entry) => entry.id === entryId) ??
    board.waiting.find((entry) => entry.id === entryId) ??
    board.done.find((entry) => entry.id === entryId)
  );
}
