import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type {
  VetAvailabilityTemplate,
  AvailabilityOverride,
  BlockedPeriod,
} from '@breeyo/types';
import type { UpsertAvailabilityTemplateInput, CreateBlockedPeriodInput } from '@breeyo/validators';

// `useClinicVets` already exists in `useSchedule.ts` (plan 08-12, same wave
// as this plan): `GET /api/v1/scheduling/vets`, keyed
// `['schedule', activeClinicId, 'vets']`. Re-exported here so callers of
// this file's hook family don't also need to import from `useSchedule.ts`
// directly, but there is exactly one declaration -- not a duplicate.
export { useClinicVets, type ClinicVet } from './useSchedule';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** D-01/D-04: a single vet's weekly template, 0-7 rows (server may omit unsaved days). */
export function useAvailabilityTemplate(vetId: string | undefined) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: ['availability-template', activeClinicId, vetId],
    queryFn: () =>
      apiClient<{ data: VetAvailabilityTemplate[] }>(
        `/api/v1/scheduling/availability/${vetId}/template`,
        { token: accessToken! },
      ),
    enabled: !!accessToken && !!activeClinicId && !!vetId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

interface SaveTemplateParams {
  vetId: string;
  days: UpsertAvailabilityTemplateInput['days'];
}

/**
 * PUT the whole week at once. Returns `affectedAppointmentCount` (D-30) --
 * the write has already applied server-side by the time this resolves, so
 * the caller decides whether to warn-and-offer-a-resave-revert, never a
 * pre-check.
 */
export function useSaveAvailabilityTemplate() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vetId, days }: SaveTemplateParams) =>
      apiClient<{ data: { template: VetAvailabilityTemplate[]; affectedAppointmentCount: number } }>(
        `/api/v1/scheduling/availability/${vetId}/template`,
        {
          method: 'PUT',
          token: accessToken!,
          body: JSON.stringify({ vetId, days }),
        },
      ),
    onSettled: (_data, _err, variables) => {
      // Pitfall 3 (useQueueActions.ts): small delay avoids a flicker race
      // with the AVAILABILITY_UPDATED socket broadcast invalidating the
      // same keys a moment later.
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['availability-template', activeClinicId, variables?.vetId],
        });
        // Changing hours changes which slots the agenda/booking sheet
        // offer, so the whole schedule prefix must also go stale.
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
      }, 300);
    },
  });
}

interface SaveOverrideParams {
  vetId: string;
  date: Date;
  isClosed: boolean;
  openMinutes?: number | null;
  closeMinutes?: number | null;
  reason?: string;
}

/**
 * PUT a single date's override. Returns `{ override, affectedAppointmentCount }`
 * so the caller can surface UI-SPEC's "n appointments already booked"
 * confirmation (D-01/D-30).
 */
export function useSaveAvailabilityOverride() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveOverrideParams) =>
      apiClient<{ data: { override: AvailabilityOverride; affectedAppointmentCount: number } }>(
        `/api/v1/scheduling/availability/${params.vetId}/override`,
        {
          method: 'PUT',
          token: accessToken!,
          body: JSON.stringify(params),
        },
      ),
    onSettled: (_data, _err, variables) => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
        if (variables) {
          queryClient.invalidateQueries({
            queryKey: ['blocked-periods', activeClinicId, variables.vetId],
          });
        }
      }, 300);
    },
  });
}

/** D-05: the selected date's blocked periods for one vet. */
export function useBlockedPeriods(date: Date, vetId: string | undefined) {
  const { accessToken, activeClinicId } = useAuth();
  const isoDate = formatDate(date);

  return useQuery({
    queryKey: ['blocked-periods', activeClinicId, vetId, isoDate],
    queryFn: () => {
      const params = new URLSearchParams({ date: isoDate, vetId: vetId as string });
      return apiClient<{ data: BlockedPeriod[] }>(
        `/api/v1/scheduling/blocked-periods?${params.toString()}`,
        { token: accessToken! },
      );
    },
    enabled: !!accessToken && !!activeClinicId && !!vetId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}

interface CreateBlockedPeriodParams extends Omit<CreateBlockedPeriodInput, 'date'> {
  date: Date;
}

/**
 * POST a new blocked period. Returns `{ blockedPeriod, affectedAppointmentCount }`
 * (D-05/D-06/D-30). `ApiClientError.code` propagates unchanged so the sheet
 * can branch on `BLOCKED_PERIOD_OVERLAP`.
 */
export function useCreateBlockedPeriod() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateBlockedPeriodParams) =>
      apiClient<{ data: { blockedPeriod: BlockedPeriod; affectedAppointmentCount: number } }>(
        '/api/v1/scheduling/blocked-periods',
        {
          method: 'POST',
          token: accessToken!,
          body: JSON.stringify(params),
        },
      ),
    onSettled: (_data, _err, variables) => {
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: ['blocked-periods', activeClinicId, variables?.vetId],
        });
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
      }, 300);
    },
  });
}

/** Removes a blocked period -- also used to revert the D-30 warning flow. */
export function useDeleteBlockedPeriod() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blockedPeriodId: string) =>
      apiClient<{ data: { deleted: true } }>(
        `/api/v1/scheduling/blocked-periods/${blockedPeriodId}`,
        { method: 'DELETE', token: accessToken! },
      ),
    onSettled: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['blocked-periods', activeClinicId] });
        queryClient.invalidateQueries({ queryKey: ['schedule', activeClinicId] });
      }, 300);
    },
  });
}
