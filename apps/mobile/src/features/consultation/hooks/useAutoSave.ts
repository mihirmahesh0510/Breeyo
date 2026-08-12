import { useEffect, useCallback, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { useConsultationDraftStore } from './useConsultationDraft';
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

export function useAutoSave(consultationId: string) {
  const { accessToken } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState(false);

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
    },
    onError: () => {
      setSaveError(true);
      // Retry after 5 seconds on error
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
      } catch {
        setSaveError(true);
      }
    }
  }, [consultationId, accessToken]);

  return {
    isSaving: saveMutation.isPending,
    saveError,
    forceSave,
  };
}
