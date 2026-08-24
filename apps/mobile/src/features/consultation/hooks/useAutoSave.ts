import { useEffect, useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useConsultationDraftStore } from './useConsultationDraft';
import { saveOfflineConsultationDraft, isNetworkFailure } from '../services/offlineConsultationDraftStore';
import { getOfflineSyncDb } from '../../offline-sync/db/offlineDb';
import type { SaveDraftInput } from '@breeyo/types';

function serializeDraft(state: ReturnType<typeof useConsultationDraftStore.getState>): SaveDraftInput {
  return {
    vitals: state.vitals,
    subjective: state.subjective,
    objective: state.objective,
    assessment: state.assessment,
    plan: state.plan,
    careInstructions: state.careInstructions,
    referral: state.referral,
    rxNotes: state.rxNotes,
    prescriptions: state.prescriptions,
  };
}

/**
 * Same per-installation device id key `useOfflineQueueActions.ts` uses
 * (Plan 10-02) -- reused verbatim, not a second identity, so a single
 * device presents one consistent `deviceId` to every domain's replay
 * ledger (queue's D-34 dedup and this plan's clinical conflict ownership
 * both key off it).
 */
const DEVICE_ID_SECURE_STORE_KEY = 'breeyo-offline-sync-device-id';

function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_SECURE_STORE_KEY);
  if (existing) return existing;
  const generated = generateLocalId();
  await SecureStore.setItemAsync(DEVICE_ID_SECURE_STORE_KEY, generated);
  return generated;
}

export function useAutoSave(consultationId: string) {
  const { accessToken, activeClinicId, user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState(false);
  // Plan 10-03 (D-01, D-05, D-06): distinct from `saveError` -- this means
  // "the server was never reached, but the edit is safely persisted on
  // this device and will replay on reconnect", never a real failure the
  // clinician needs to act on. Kept separate so a genuine server rejection
  // (validation, a lock conflict) never gets the reassuring offline copy.
  const [isOffline, setIsOffline] = useState(false);

  const persistOffline = useCallback(
    async (data: SaveDraftInput) => {
      if (!activeClinicId || !user) return;
      try {
        const db = await getOfflineSyncDb();
        const deviceId = await getOrCreateDeviceId();
        await saveOfflineConsultationDraft(db, {
          consultationId,
          clinicId: activeClinicId,
          deviceId,
          userId: user.id,
          draft: data,
          baseline: useConsultationDraftStore.getState().syncedSnapshot,
        });
      } catch {
        // Best-effort: a failure to persist locally must never throw out of
        // the mutation's own error handling, and must never block the
        // normal 5s online retry below from still being scheduled.
      }
    },
    [consultationId, activeClinicId, user],
  );

  const saveMutation = useMutation({
    mutationFn: (data: SaveDraftInput) =>
      apiClient(`/api/v1/consultations/${consultationId}/draft`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      useConsultationDraftStore.getState().markSaved();
      setSaveError(false);
      setIsOffline(false);
    },
    onError: (error, data) => {
      if (isNetworkFailure(error)) {
        // D-01, D-05: losing connectivity never forces read-only mode --
        // the edit is captured locally (surviving an app restart) and
        // tagged CLINICAL_MEDIUM for reconnect, instead of only living in
        // this session's in-memory zustand state.
        setIsOffline(true);
        setSaveError(false);
        persistOffline(data).catch(() => undefined);
      } else {
        // A real server rejection (e.g. CONSULTATION_LOCKED, validation) --
        // must surface as an actual error, not a reassuring offline state.
        setIsOffline(false);
        setSaveError(true);
      }
      // Retry after 5 seconds either way -- once connectivity returns this
      // resumes the normal online save path.
      retryTimerRef.current = setTimeout(() => {
        const currentState = useConsultationDraftStore.getState();
        if (currentState.isDirty && !currentState.isFinalizing) {
          saveMutation.mutate(serializeDraft(currentState));
        }
      }, 5000);
    },
  });

  // Subscribe to store changes and debounce save at 3 seconds
  useEffect(() => {
    const unsubscribe = useConsultationDraftStore.subscribe((state) => {
      if (!state.isDirty || state.isFinalizing || !consultationId || !accessToken) return;

      // Clear existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Set 3-second debounce
      timerRef.current = setTimeout(() => {
        const currentState = useConsultationDraftStore.getState();
        if (currentState.isDirty && !currentState.isFinalizing) {
          currentState.markSaving();
          saveMutation.mutate(serializeDraft(currentState));
        }
      }, 3000);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [consultationId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force save for finalization coordination
  const forceSave = useCallback(async () => {
    // Cancel pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const state = useConsultationDraftStore.getState();
    state.setFinalizing(true);

    if (state.isDirty) {
      try {
        await apiClient(`/api/v1/consultations/${consultationId}/draft`, {
          method: 'PATCH',
          token: accessToken!,
          body: JSON.stringify(serializeDraft(state)),
        });
        useConsultationDraftStore.getState().markSaved();
        setSaveError(false);
        setIsOffline(false);
      } catch (error) {
        if (isNetworkFailure(error)) {
          // D-01: leaving/ending a consultation while offline must not
          // drop the final edits -- persist them the same way the regular
          // debounced auto-save path does.
          setIsOffline(true);
          setSaveError(false);
          await persistOffline(serializeDraft(state));
        } else {
          setIsOffline(false);
          setSaveError(true);
        }
      }
    }
  }, [consultationId, accessToken, persistOffline]);

  return {
    isSaving: saveMutation.isPending,
    saveError,
    isOffline,
    forceSave,
  };
}
