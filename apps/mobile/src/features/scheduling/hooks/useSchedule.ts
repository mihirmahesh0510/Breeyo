import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { AppointmentWithDetails, ResolvedDayHours, SlotOption } from '@breeyo/types';

const IST_TIME_ZONE = 'Asia/Kolkata';

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

/** The selected IST day's [start, nextDayStart) boundary, plus its key. */
function getISTDayRange(date: Date): { from: Date; to: Date; isoDate: string } {
  const isoDate = istDateKey(date);
  const from = new Date(`${isoDate}T00:00:00+05:30`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to, isoDate };
}

export interface ResolvedAvailabilityEntry {
  vetId: string;
  hours: ResolvedDayHours | null;
  blockedRanges: Array<{ startMinutes: number; endMinutes: number }>;
}

export interface ClinicVet {
  id: string;
  name: string;
}

/**
 * D-24: the day agenda's primary data source. Mirrors `useQueue.ts`'s exact
 * shape -- same `staleTime`, `enabled`, `select`, refetch flags -- so the
 * two features behave identically to staff. The clinic-then-date key order
 * matters: `useScheduleSocket` invalidates by the `['schedule',
 * activeClinicId]` prefix on every realtime appointment/availability event.
 */
export function useSchedule(selectedDate: Date, vetId?: string) {
  const { accessToken, activeClinicId } = useAuth();
  const { from, to, isoDate } = getISTDayRange(selectedDate);

  return useQuery({
    queryKey: ['schedule', activeClinicId, isoDate, vetId ?? 'all'],
    queryFn: () => {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (vetId) {
        params.set('vetId', vetId);
      }
      return apiClient<{ data: AppointmentWithDetails[] }>(
        `/api/v1/scheduling/appointments?${params.toString()}`,
        { token: accessToken! },
      );
    },
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    select: (response) => response.data,
  });
}

/**
 * Blocked-period bands + resolved working hours for the agenda's non-working
 * strip. Omitting `vetId` resolves every clinic vet in one call.
 */
export function useResolvedAvailability(selectedDate: Date, vetId?: string | null) {
  const { accessToken, activeClinicId } = useAuth();
  const { isoDate } = getISTDayRange(selectedDate);

  return useQuery({
    queryKey: ['schedule', activeClinicId, 'availability', isoDate, vetId ?? 'all'],
    queryFn: () => {
      const params = new URLSearchParams({ date: isoDate });
      if (vetId) {
        params.set('vetId', vetId);
      }
      return apiClient<{ data: ResolvedAvailabilityEntry[] }>(
        `/api/v1/scheduling/availability/resolved?${params.toString()}`,
        { token: accessToken! },
      );
    },
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    select: (response) => response.data,
  });
}

/**
 * The booking sheet's slot grid. Only fires once vet, date and service are
 * all chosen (D-02: the service catalog drives slot duration).
 */
export function useOfferableSlots(
  vetId: string | undefined,
  date: Date | undefined,
  serviceCatalogId: string | undefined,
) {
  const { accessToken, activeClinicId } = useAuth();
  const isoDate = date ? getISTDayRange(date).isoDate : undefined;

  return useQuery({
    queryKey: ['schedule', activeClinicId, 'slots', vetId, isoDate, serviceCatalogId],
    queryFn: () => {
      const params = new URLSearchParams({
        vetId: vetId as string,
        date: isoDate as string,
        serviceCatalogId: serviceCatalogId as string,
      });
      return apiClient<{ data: SlotOption[] }>(
        `/api/v1/scheduling/slots?${params.toString()}`,
        { token: accessToken! },
      );
    },
    enabled: !!accessToken && !!activeClinicId && !!vetId && !!isoDate && !!serviceCatalogId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

/** The clinic's vet list. Long `staleTime` -- this rarely changes. */
export function useClinicVets() {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: ['schedule', activeClinicId, 'vets'],
    queryFn: () =>
      apiClient<{ data: ClinicVet[] }>('/api/v1/scheduling/vets', { token: accessToken! }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 5 * 60_000,
    select: (response) => response.data,
  });
}
