'use client';

// `apps/web` has no React Query today (see 08-14-SUMMARY.md for the full
// rationale). This is a single screen, and Phase 9 owns the broader
// dashboard's data-layer decision -- introducing a caching library here
// would pre-empt that choice for one screen's worth of reads. Instead these
// are plain `useState` + `useEffect` + `AbortController` hooks exposing the
// same `{ data, isLoading, error, refetch }` surface a React Query migration
// would later satisfy, so swapping later is additive, not a rewrite.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, ApiClientError } from './api';
import { useAuth, handleUnauthorized } from './AuthProvider';
import type {
  AppointmentWithDetails,
  ResolvedDayHours,
  SlotOption,
  RecurrenceInterval,
} from '@breeyo/types';

export interface ClinicVet {
  id: string;
  name: string;
}

export interface ResolvedAvailabilityEntry {
  vetId: string;
  hours: ResolvedDayHours | null;
  blockedRanges: Array<{ startMinutes: number; endMinutes: number }>;
}

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

interface AsyncState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: ApiClientError | Error | null;
}

/**
 * Shared fetch-on-deps-change primitive: runs `fetcher` whenever `deps`
 * change (and once on mount when `enabled`), cancels the in-flight request
 * via `AbortController` on unmount/re-run, and bounces a 401 to `/login`
 * through plan 08-06's `handleUnauthorized` rather than showing a stale or
 * empty grid.
 */
function useAsyncResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  enabled: boolean,
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    isLoading: enabled,
    error: null,
  });
  const [refetchToken, setRefetchToken] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ data, isLoading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (handleUnauthorized(error)) return;
        setState({ data: undefined, isLoading: false, error: error as Error });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetchToken, ...deps]);

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  return { ...state, refetch };
}

/**
 * The week grid's primary data source: `GET /api/v1/scheduling/appointments`
 * for the given IST week (`08-11-SUMMARY.md`'s endpoint table). `refetch` is
 * called both by the page's own retry button and by `useScheduleSocket` on a
 * realtime appointment/availability event.
 */
export function useWeekSchedule(anchor: Date, vetId: string | null, weekFrom: Date, weekTo: Date) {
  const { accessToken, activeClinicId } = useAuth();
  const enabled = !!accessToken && !!activeClinicId;

  return useAsyncResource<AppointmentWithDetails[]>(
    async (signal) => {
      const params = new URLSearchParams({
        from: weekFrom.toISOString(),
        to: weekTo.toISOString(),
      });
      if (vetId) {
        params.set('vetId', vetId);
      }
      const response = await apiClient<{ data: AppointmentWithDetails[] }>(
        `/api/v1/scheduling/appointments?${params.toString()}`,
        { token: accessToken!, signal },
      );
      return response.data;
    },
    [accessToken, activeClinicId, weekFrom.getTime(), weekTo.getTime(), vetId ?? 'all'],
    enabled,
  );
}

/**
 * Resolved working hours + blocked ranges for every day in the displayed
 * week, one entry per vet (or per the filtered vet) -- feeds the grid's
 * disabled cells, blocked bands and `computeRowBounds`.
 */
export function useResolvedAvailabilityWeek(days: Date[], vetId: string | null) {
  const { accessToken, activeClinicId } = useAuth();
  const enabled = !!accessToken && !!activeClinicId && days.length > 0;
  const dayKeys = days.map((d) => d.toISOString().slice(0, 10)).join(',');

  return useAsyncResource<ResolvedAvailabilityEntry[][]>(
    async (signal) => {
      const results = await Promise.all(
        days.map(async (day) => {
          const params = new URLSearchParams({ date: day.toISOString().slice(0, 10) });
          if (vetId) {
            params.set('vetId', vetId);
          }
          const response = await apiClient<{ data: ResolvedAvailabilityEntry[] }>(
            `/api/v1/scheduling/availability/resolved?${params.toString()}`,
            { token: accessToken!, signal },
          );
          return response.data;
        }),
      );
      return results;
    },
    [accessToken, activeClinicId, dayKeys, vetId ?? 'all'],
    enabled,
  );
}

/** The clinic's `id`-sorted vet list, for `VetLegend` and the vet-hue assignment. */
export function useClinicVets() {
  const { accessToken, activeClinicId } = useAuth();
  const enabled = !!accessToken && !!activeClinicId;

  return useAsyncResource<ClinicVet[]>(
    async (signal) => {
      const response = await apiClient<{ data: ClinicVet[] }>('/api/v1/scheduling/vets', {
        token: accessToken!,
        signal,
      });
      return response.data;
    },
    [accessToken, activeClinicId],
    enabled,
  );
}

/** The booking drawer's slot grid: only fires once vet, date and service are all chosen. */
export function useOfferableSlots(
  vetId: string | undefined,
  date: Date | undefined,
  serviceCatalogId: string | undefined,
  durationMinutes?: number,
) {
  const { accessToken, activeClinicId } = useAuth();
  const isoDate = date ? date.toISOString().slice(0, 10) : undefined;
  const hasServiceCriteria = !!serviceCatalogId || !!durationMinutes;
  const enabled = !!accessToken && !!activeClinicId && !!vetId && !!isoDate && hasServiceCriteria;

  return useAsyncResource<SlotOption[]>(
    async (signal) => {
      const params = new URLSearchParams({
        vetId: vetId as string,
        date: isoDate as string,
      });
      if (serviceCatalogId) {
        params.set('serviceCatalogId', serviceCatalogId);
      } else if (durationMinutes) {
        params.set('durationMinutes', String(durationMinutes));
      }
      const response = await apiClient<{ data: SlotOption[] }>(
        `/api/v1/scheduling/slots?${params.toString()}`,
        { token: accessToken!, signal },
      );
      return response.data;
    },
    [accessToken, activeClinicId, vetId, isoDate, serviceCatalogId, durationMinutes],
    enabled,
  );
}

/**
 * `POST /api/v1/scheduling/appointments`. Not built as a `useState`
 * pseudo-mutation with the same auto-fetch machinery as the reads above --
 * a submit is a one-shot, caller-triggered call, so this is a plain async
 * function bound to the held token, matching the booking drawer's own
 * imperative submit handler.
 */
export function useCreateAppointment() {
  const { accessToken } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (params: CreateAppointmentParams) => {
      setIsPending(true);
      try {
        return await apiClient<{ data: { appointments: AppointmentWithDetails[]; warnings: BookingWarning[] } }>(
          '/api/v1/scheduling/appointments',
          {
            method: 'POST',
            token: accessToken!,
            body: JSON.stringify(params),
          },
        );
      } catch (error) {
        handleUnauthorized(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [accessToken],
  );

  return { mutate, isPending };
}

export interface RescheduleAppointmentParams {
  appointmentId: string;
  scheduledFor: string;
  vetId?: string;
  allowDoubleBook?: boolean;
}

/**
 * `PATCH /api/v1/scheduling/appointments/:id` -- the appointment drawer's
 * "Move Appointment" action. A single-occurrence reschedule of a series
 * member detaches it server-side automatically (D-31); this hook never
 * sends `applyToSeries`.
 */
export function useRescheduleAppointment() {
  const { accessToken } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (params: RescheduleAppointmentParams) => {
      setIsPending(true);
      try {
        return await apiClient<{ data: { appointment: AppointmentWithDetails; warnings: BookingWarning[] } }>(
          `/api/v1/scheduling/appointments/${params.appointmentId}`,
          {
            method: 'PATCH',
            token: accessToken!,
            body: JSON.stringify({
              scheduledFor: params.scheduledFor,
              vetId: params.vetId,
              allowDoubleBook: params.allowDoubleBook,
            }),
          },
        );
      } catch (error) {
        handleUnauthorized(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [accessToken],
  );

  return { mutate, isPending };
}

export interface CancelAppointmentParams {
  appointmentId: string;
  reason?: string;
  scope?: 'ONE' | 'SERIES';
}

/** `POST /api/v1/scheduling/appointments/:id/cancel`. */
export function useCancelAppointment() {
  const { accessToken } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (params: CancelAppointmentParams) => {
      setIsPending(true);
      try {
        return await apiClient<{ data: { appointment: AppointmentWithDetails } }>(
          `/api/v1/scheduling/appointments/${params.appointmentId}/cancel`,
          {
            method: 'POST',
            token: accessToken!,
            body: JSON.stringify({ reason: params.reason, scope: params.scope }),
          },
        );
      } catch (error) {
        handleUnauthorized(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [accessToken],
  );

  return { mutate, isPending };
}

/** `PATCH /api/v1/scheduling/appointments/:id/status` (CHECKED_IN/COMPLETED/NO_SHOW). */
export function useUpdateAppointmentStatus() {
  const { accessToken } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (appointmentId: string, status: string) => {
      setIsPending(true);
      try {
        return await apiClient<{ data: AppointmentWithDetails }>(
          `/api/v1/scheduling/appointments/${appointmentId}/status`,
          {
            method: 'PATCH',
            token: accessToken!,
            body: JSON.stringify({ status }),
          },
        );
      } catch (error) {
        handleUnauthorized(error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [accessToken],
  );

  return { mutate, isPending };
}
