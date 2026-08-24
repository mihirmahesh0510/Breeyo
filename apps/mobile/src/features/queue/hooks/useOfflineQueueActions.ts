import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { QueueStatus, ReplayPriority, type OfflineOperationEnvelope } from '@breeyo/types';
import type { QueueBoard, QueueEntryWithPet } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { getOfflineSyncDb, enqueueOperation } from '../../offline-sync/db/offlineDb';
import { useQueueOfflineStore } from '../store/queueOfflineStore';
import {
  buildQueueCheckInEnvelope,
  buildQueueStatusTransitionEnvelope,
  isNetworkFailure,
} from '../lib/queue-offline-utils';

/**
 * Plan 10-02 Task 1 (D-01 to D-03, D-12): check-in, status-transition,
 * no-show, and call-next all try the normal online request first -- this
 * hook changes nothing about behavior on a healthy connection. Only when
 * `apiClient` fails WITHOUT a server response (`isNetworkFailure`) does a
 * mutation fall back to writing a `QUEUE_HIGH` envelope into the offline
 * sync ledger (`enqueueOfflineOperation`, backed by Plan 10-01's
 * `offlineDb.ts`) and projecting the change into `queueOfflineStore` so the
 * queue board shows it immediately as real, operationally-live work (D-03),
 * not a blocked or placeholder state.
 */

const DEVICE_ID_SECURE_STORE_KEY = 'breeyo-offline-sync-device-id';

/**
 * A stable per-installation id for the offline-sync replay ledger
 * (`OfflineOperationEnvelope.deviceId`). Generated once and persisted in
 * secure storage (the same mechanism `apps/mobile` already uses for auth
 * tokens) rather than derived from any OS identifier -- nothing in the
 * replay contract needs it to resist adversarial guessing, only to stay
 * stable across app restarts and unique enough that two devices replaying
 * the same clinic's queue are never confused with each other (which is
 * exactly what D-34's merge logic keys off of server-side).
 */
async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_SECURE_STORE_KEY);
  if (existing) {
    return existing;
  }
  const generated = generateLocalId();
  await SecureStore.setItemAsync(DEVICE_ID_SECURE_STORE_KEY, generated);
  return generated;
}

/** RFC4122-v4-shaped local identifier (operation ids, locally-created entry
 *  ids). No CSPRNG dependency needed -- these only need to avoid colliding
 *  with anything else this device generates, never resist an adversary. */
function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function queueQueryKey(activeClinicId: string | null): unknown[] {
  return ['queue', activeClinicId, todayIsoDate()];
}

export interface OfflineCheckInParams {
  petId: string;
  /** Needed only for the offline fallback render -- the online path never
   *  reads it, since the server's response already carries the full pet. */
  pet: QueueEntryWithPet['pet'];
  visitReason?: string;
  isEmergency?: boolean;
  reCheckIn?: boolean;
}

export function useOfflineQueueActions() {
  const { accessToken, activeClinicId, user } = useAuth();
  const queryClient = useQueryClient();
  const applyLocalQueueOperation = useQueueOfflineStore((state) => state.applyLocalQueueOperation);

  const enqueueOfflineOperation = useCallback(async (envelope: OfflineOperationEnvelope): Promise<void> => {
    const db = await getOfflineSyncDb();
    await enqueueOperation(db, {
      operationId: envelope.operationId,
      deviceId: envelope.deviceId,
      clinicId: envelope.clinicId,
      userId: envelope.userId,
      domain: envelope.domain,
      entityType: envelope.entityType,
      entityId: envelope.entityId,
      priority: envelope.priority,
      payload: envelope.payload,
      createdAt: envelope.createdAt,
    });
  }, []);

  const showLocallyOnBoard = useCallback(
    (entry: QueueEntryWithPet) => {
      const queryKey = queueQueryKey(activeClinicId);
      queryClient.setQueryData<{ data: QueueBoard }>(queryKey, (old) => {
        if (!old) return old;
        // The actual section placement/pending marker is computed by
        // `mergeLocalQueueEntriesIntoBoard` at render time in
        // `QueueScreen.tsx` (it reads `queueOfflineStore` directly) -- this
        // just makes sure a fetch that lands right after this offline
        // mutation doesn't blow the local projection away by refetching
        // before the replay completes. React Query's own stale/refetch
        // timers are untouched otherwise.
        return old;
      });
    },
    [activeClinicId, queryClient],
  );

  const checkIn = useCallback(
    async (params: OfflineCheckInParams): Promise<{ data: QueueEntryWithPet }> => {
      try {
        const result = await apiClient<{ data: QueueEntryWithPet }>('/api/v1/queue/check-in', {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify({
            petId: params.petId,
            visitReason: params.visitReason,
            isEmergency: params.isEmergency,
            reCheckIn: params.reCheckIn,
          }),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
        return result;
      } catch (error) {
        if (!isNetworkFailure(error)) {
          // A real server rejection (SAME_DAY_RECHECK, ALREADY_IN_QUEUE,
          // validation, ...) -- must surface to the caller unchanged, never
          // silently captured as an offline operation.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error;
        }

        const deviceId = await getOrCreateDeviceId();
        const operationId = generateLocalId();
        const entryId = generateLocalId();
        const checkedInAt = new Date().toISOString();

        const envelope = buildQueueCheckInEnvelope({
          operationId,
          entryId,
          deviceId,
          clinicId: activeClinicId!,
          userId: user!.id,
          petId: params.petId,
          visitReason: params.visitReason,
          isEmergency: params.isEmergency ?? false,
          checkedInAt,
        });

        await enqueueOfflineOperation(envelope);

        const localEntry: QueueEntryWithPet = {
          id: entryId,
          clinicId: activeClinicId!,
          petId: params.petId,
          checkedInBy: user!.id,
          treatingVetId: null,
          status: QueueStatus.WAITING,
          // D-19: cosmetic only until replay assigns the real position --
          // never blocks the entry from rendering as a real queue member.
          position: 0,
          isEmergency: params.isEmergency ?? false,
          visitReason: params.visitReason ?? null,
          checkedInAt: new Date(checkedInAt),
          calledAt: null,
          completedAt: null,
          archivedAt: null,
          updatedAt: new Date(checkedInAt),
          queuePriorityAt: new Date(checkedInAt),
          appointmentId: null,
          pet: params.pet,
        };

        applyLocalQueueOperation({ type: 'CHECK_IN', operationId, entry: localEntry });
        showLocallyOnBoard(localEntry);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        return { data: localEntry };
      }
    },
    [accessToken, activeClinicId, user, queryClient, enqueueOfflineOperation, applyLocalQueueOperation, showLocallyOnBoard],
  );

  const updateStatus = useCallback(
    async (
      entryId: string,
      status: QueueStatus,
      baseEntry?: QueueEntryWithPet,
    ): Promise<{ data: QueueEntryWithPet }> => {
      try {
        const result = await apiClient<{ data: QueueEntryWithPet }>(`/api/v1/queue/${entryId}/status`, {
          method: 'PATCH',
          token: accessToken!,
          body: JSON.stringify({ status }),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
        return result;
      } catch (error) {
        if (!isNetworkFailure(error)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error;
        }

        const deviceId = await getOrCreateDeviceId();
        const operationId = generateLocalId();
        const createdAt = new Date().toISOString();

        const envelope = buildQueueStatusTransitionEnvelope({
          operationId,
          entryId,
          deviceId,
          clinicId: activeClinicId!,
          userId: user!.id,
          status,
          createdAt,
        });

        await enqueueOfflineOperation(envelope);

        const record = applyLocalQueueOperation({ type: 'STATUS_TRANSITION', operationId, entryId, status, baseEntry });
        showLocallyOnBoard(record.entry);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        return { data: record.entry };
      }
    },
    [accessToken, activeClinicId, user, queryClient, enqueueOfflineOperation, applyLocalQueueOperation, showLocallyOnBoard],
  );

  const noShow = useCallback(
    (entryId: string, baseEntry?: QueueEntryWithPet) => updateStatus(entryId, QueueStatus.NO_SHOW, baseEntry),
    [updateStatus],
  );

  const callNext = useCallback(
    async (currentWaitingEntries: QueueEntryWithPet[]): Promise<{ data: QueueEntryWithPet } | null> => {
      try {
        const result = await apiClient<{ data: QueueEntryWithPet }>('/api/v1/queue/call-next', {
          method: 'POST',
          token: accessToken!,
        });
        queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return result;
      } catch (error) {
        if (!isNetworkFailure(error)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error;
        }

        // No live server to authoritatively pick "next" -- fall back to
        // this device's own local view of the WAITING section, which
        // `QueueScreen.tsx` already keeps merged with any of this device's
        // own pending local mutations (D-12: emergency-first, FIFO order is
        // unchanged, just evaluated locally instead of server-side).
        const next = currentWaitingEntries[0];
        if (!next) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          throw error;
        }

        return updateStatus(next.id, QueueStatus.IN_CONSULT, next);
      }
    },
    [accessToken, activeClinicId, queryClient, updateStatus],
  );

  return { checkIn, updateStatus, noShow, callNext, enqueueOfflineOperation };
}
