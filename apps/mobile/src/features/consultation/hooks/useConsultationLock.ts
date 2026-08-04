import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

interface LockStatus {
  locked: boolean;
  vetName?: string;
  stale?: boolean;
}

export function useConsultationLock(consultationId: string, vetId: string): LockStatus {
  const { accessToken } = useAuth();
  const [lockStatus, setLockStatus] = useState<LockStatus>({ locked: false });
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check lock on mount
  useEffect(() => {
    if (!consultationId || !accessToken) return;

    apiClient<{ data: LockStatus }>(`/api/v1/consultations/${consultationId}/lock`, {
      token: accessToken,
    })
      .then((res) => setLockStatus(res.data))
      .catch(() => {
        // Lock check failed -- assume unlocked
      });
  }, [consultationId, accessToken]);

  // Send heartbeat every 60 seconds (60000ms)
  useEffect(() => {
    if (!consultationId || !accessToken) return;

    // Initial heartbeat
    apiClient(`/api/v1/consultations/${consultationId}/heartbeat`, {
      method: 'POST',
      token: accessToken,
    }).catch(() => {
      // Heartbeat failed -- log warning
    });

    heartbeatIntervalRef.current = setInterval(() => {
      apiClient(`/api/v1/consultations/${consultationId}/heartbeat`, {
        method: 'POST',
        token: accessToken,
      }).catch(() => {
        // Heartbeat failed -- log warning
      });
    }, 60000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [consultationId, accessToken]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (consultationId && accessToken) {
        // Fire-and-forget lock release
        apiClient(`/api/v1/consultations/${consultationId}/lock`, {
          method: 'DELETE',
          token: accessToken,
        }).catch(() => {});
      }
    };
  }, [consultationId, accessToken]);

  // Release on 30-second app background (30000ms)
  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimerRef.current = setTimeout(() => {
          if (consultationId && accessToken) {
            apiClient(`/api/v1/consultations/${consultationId}/lock`, {
              method: 'DELETE',
              token: accessToken,
            }).catch(() => {});
          }
        }, 30000);
      } else if (nextState === 'active') {
        // App came back to foreground -- cancel the release timer
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
        }
        // Re-establish heartbeat
        if (consultationId && accessToken) {
          apiClient(`/api/v1/consultations/${consultationId}/heartbeat`, {
            method: 'POST',
            token: accessToken,
          }).catch(() => {});
        }
      }
    },
    [consultationId, accessToken],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (backgroundTimerRef.current) {
        clearTimeout(backgroundTimerRef.current);
      }
    };
  }, [handleAppStateChange]);

  return lockStatus;
}
