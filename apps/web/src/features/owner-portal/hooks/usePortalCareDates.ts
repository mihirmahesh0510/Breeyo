'use client';

// Plan 09-07 Task 2: OWN-07 — upcoming vaccination/deworming due dates and
// next scheduled appointment for the selected pet.
//
// Deviation flagged in 09-07-SUMMARY.md: the plan's action text asks for
// "React Query, using the same React Query configuration patterns as
// usePortalSession". Neither `apps/web/package.json` nor the workspace root
// depends on `@tanstack/react-query` (or any `react-query` package) — every
// existing owner-portal data hook (`usePortalSession.ts`, and the
// `usePetRecords`/`usePetInvoices` hooks inline in
// `apps/web/app/portal/[token]/PortalBody.tsx`) is a plain
// `useState`/`useEffect` + `apiClient` hook, re-fetching on
// token/petId-change via the effect's dependency array. This hook follows
// that same established convention instead of introducing a new data-
// fetching library for one endpoint.
import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api';
import type {
  UpcomingCareAppointment,
  UpcomingCareDeworming,
  UpcomingCareVaccination,
} from '../components/UpcomingCareCard';

/** Mirrors `PortalCareDatesResult` (`apps/api/src/modules/owner-portal/portal-care-dates.service.ts`). */
export interface PortalCareDatesData {
  vaccinations: UpcomingCareVaccination[];
  deworming: UpcomingCareDeworming | null;
  nextAppointment: UpcomingCareAppointment | null;
}

interface CareDatesResponse {
  data: PortalCareDatesData;
}

export interface UsePortalCareDatesResult {
  careDates: PortalCareDatesData | null;
  isLoading: boolean;
}

/**
 * `GET /api/v1/owner-portal/:token/care-dates?petId=:petId` (OWN-07,
 * OWN-06). Re-fetches whenever `token` or `petId` changes (the pet
 * switcher), and — like `usePortalSession`'s own "never leak which check
 * failed" posture — collapses any fetch failure (network error, a 403
 * INVALID scope envelope) to a `null` `careDates` rather than surfacing a
 * raw error, since this card is a nice-to-have addition to the Overview
 * tab, never a gate on the rest of the page rendering.
 */
export function usePortalCareDates(token: string, petId: string | null): UsePortalCareDatesResult {
  const [careDates, setCareDates] = useState<PortalCareDatesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!petId) {
      setCareDates(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    apiClient<CareDatesResponse>(`/api/v1/owner-portal/${token}/care-dates?petId=${petId}`)
      .then((response) => {
        if (!cancelled) setCareDates(response.data);
      })
      .catch(() => {
        if (!cancelled) setCareDates(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, petId]);

  return { careDates, isLoading };
}
