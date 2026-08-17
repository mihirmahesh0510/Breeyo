import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { AppointmentStatus } from '@breeyo/types';
import type { AppointmentWithDetails, RecurrenceInterval } from '@breeyo/types';

/**
 * D-14/D-34: mirrors `apps/api/src/modules/scheduling/scheduling.types.ts`'s
 * `BookingWarning` shape exactly (that type lives in the API app, not
 * `@breeyo/types`, so it is re-declared here structurally rather than
 * imported across the app boundary).
 */
export interface BookingWarning {
  code: 'DOUBLE_BOOKED' | 'RECURRENCE_TRUNCATED' | 'RECURRENCE_OCCURRENCE_SKIPPED';
  message: string;
  data?: Record<string, unknown>;
}

export interface CreateAppointmentParams {
  ownerId: string;
  petIds: string[];
  vetId: string;
  serviceCatalogId?: string;
  scheduledFor: string;
  notes?: string;
  allowDoubleBook?: boolean;
  recurrence?: { interval: RecurrenceInterval; occurrences: number };
}

export interface RescheduleAppointmentParams {
  appointmentId: string;
  scheduledFor: string;
  vetId?: string;
  allowDoubleBook?: boolean;
}

export interface CancelAppointmentParams {
  appointmentId: string;
  reason?: string;
  scope?: 'ONE' | 'SERIES';
}

export interface UpdateAppointmentStatusParams {
  appointmentId: string;
  status: AppointmentStatus;
}

const IST_TIME_ZONE = 'Asia/Kolkata';

/** Matches `useSchedule.ts`'s own `istDateKey` -- the same IST day-key every per-day cache entry is keyed on. */
function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

type ScheduleAppointmentsEnvelope = { data: AppointmentWithDetails[] };

/**
 * `useSchedule`'s cache key is `['schedule', activeClinicId, isoDate,
 * vetIdOrAll]` -- a plain date string in the third slot. The other
 * `['schedule', activeClinicId, ...]` queries (`availability`/`slots`/`vets`)
 * name their sub-resource there instead, so this excludes them.
 */
function isAppointmentListKey(key: readonly unknown[]): boolean {
  return (
    key[0] === 'schedule' &&
    typeof key[2] === 'string' &&
    !['availability', 'slots', 'vets'].includes(key[2] as string)
  );
}

interface CacheSnapshot {
  queryKey: readonly unknown[];
  data: ScheduleAppointmentsEnvelope | undefined;
}

function patchAppointmentInCache(
  queryClient: QueryClient,
  activeClinicId: string | null,
  appointmentId: string,
  patch: Partial<AppointmentWithDetails>,
  options?: {
    /**
     * D-31: when a reschedule moves `patch.scheduledFor` to a different IST
     * day than a given per-day cache entry's own key, patching it in place
     * there would leave that day's list showing the appointment at its wrong
     * (new) time until the delayed `invalidateQueries` below fires -- remove
     * it from that day's list instead. The correct day's own list picks it
     * up once that invalidation refetches it; there is no cached "target
     * day" list to append into safely without risking a duplicate.
     */
    removeFromOtherDayLists?: boolean;
  },
): CacheSnapshot[] {
  const matches = queryClient.getQueriesData<ScheduleAppointmentsEnvelope>({
    queryKey: ['schedule', activeClinicId],
  });
  const snapshots: CacheSnapshot[] = [];

  for (const [queryKey, data] of matches) {
    if (!isAppointmentListKey(queryKey)) continue;
    snapshots.push({ queryKey, data });
    if (!data) continue;

    const isoDate = queryKey[2] as string;
    const movingToAnotherDay =
      options?.removeFromOtherDayLists && patch.scheduledFor instanceof Date && istDateKey(patch.scheduledFor) !== isoDate;

    queryClient.setQueryData<ScheduleAppointmentsEnvelope>(queryKey, {
      data: movingToAnotherDay
        ? data.data.filter((appointment) => appointment.id !== appointmentId)
        : data.data.map((appointment) =>
            appointment.id === appointmentId ? { ...appointment, ...patch } : appointment,
          ),
    });
  }

  return snapshots;
}

function restoreSnapshots(queryClient: QueryClient, snapshots: CacheSnapshot[] | undefined) {
  if (!snapshots) return;
  for (const { queryKey, data } of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

/** The 300ms delay avoids a flicker race with the Socket.IO broadcast --
 * carried over verbatim from `useQueueActions.ts`'s own hard-won fix. */
function invalidateScheduleAfterSettle(queryClient: QueryClient, activeClinicId: string | null) {
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
  }, 300);
}

/**
 * POST /api/v1/scheduling/appointments. No optimistic update -- the server
 * assigns the id(s) and may return `warnings` (D-14 double-book, D-22
 * recurrence truncation), which the booking sheet needs verbatim.
 */
export function useCreateAppointment() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateAppointmentParams) =>
      apiClient<{ data: { appointments: AppointmentWithDetails[]; warnings: BookingWarning[] } }>(
        '/api/v1/scheduling/appointments',
        {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(params),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
    },
  });
}

/**
 * PATCH /api/v1/scheduling/appointments/:id. D-31: a single-occurrence
 * reschedule of a series member detaches it server-side automatically --
 * this hook never sends `applyToSeries`, matching the quick sheet's "move
 * one occurrence only" contract.
 */
export function useRescheduleAppointment() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, scheduledFor, vetId, allowDoubleBook }: RescheduleAppointmentParams) =>
      apiClient<{ data: { appointment: AppointmentWithDetails; warnings: BookingWarning[] } }>(
        `/api/v1/scheduling/appointments/${appointmentId}`,
        {
          method: 'PATCH',
          token: accessToken!,
          body: JSON.stringify({ scheduledFor, vetId, allowDoubleBook }),
        },
      ),
    onMutate: async ({ appointmentId, scheduledFor, vetId }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule', activeClinicId] });
      const snapshots = patchAppointmentInCache(
        queryClient,
        activeClinicId,
        appointmentId,
        {
          scheduledFor: new Date(scheduledFor),
          ...(vetId ? { vetId } : {}),
        },
        { removeFromOtherDayLists: true },
      );
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      restoreSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      // Pitfall 3 (from useQueueActions.ts): small delay to avoid flicker
      // with the Socket.IO broadcast.
      invalidateScheduleAfterSettle(queryClient, activeClinicId);
    },
  });
}

/** POST /api/v1/scheduling/appointments/:id/cancel. */
export function useCancelAppointment() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, reason, scope }: CancelAppointmentParams) =>
      apiClient<{ data: { appointment: AppointmentWithDetails } }>(
        `/api/v1/scheduling/appointments/${appointmentId}/cancel`,
        {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify({ reason, scope }),
        },
      ),
    onMutate: async ({ appointmentId }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule', activeClinicId] });
      const snapshots = patchAppointmentInCache(queryClient, activeClinicId, appointmentId, {
        status: AppointmentStatus.CANCELLED,
      });
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      restoreSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      // Pitfall 3 (from useQueueActions.ts): small delay to avoid flicker
      // with the Socket.IO broadcast.
      invalidateScheduleAfterSettle(queryClient, activeClinicId);
    },
  });
}

/** PATCH /api/v1/scheduling/appointments/:id/status (CHECKED_IN/COMPLETED/NO_SHOW). */
export function useUpdateAppointmentStatus() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ appointmentId, status }: UpdateAppointmentStatusParams) =>
      apiClient<{ data: AppointmentWithDetails }>(
        `/api/v1/scheduling/appointments/${appointmentId}/status`,
        {
          method: 'PATCH',
          token: accessToken!,
          body: JSON.stringify({ status }),
        },
      ),
    onMutate: async ({ appointmentId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['schedule', activeClinicId] });
      const snapshots = patchAppointmentInCache(queryClient, activeClinicId, appointmentId, {
        status,
      });
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      restoreSnapshots(queryClient, context?.snapshots);
    },
    onSettled: () => {
      // Pitfall 3 (from useQueueActions.ts): small delay to avoid flicker
      // with the Socket.IO broadcast.
      invalidateScheduleAfterSettle(queryClient, activeClinicId);
    },
  });
}
