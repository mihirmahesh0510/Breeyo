'use client';

// Same `useState` + `useEffect` + `AbortController` shape as
// `src/lib/useSchedule.ts` (see that file's header for the "no React Query
// yet" rationale) -- kept self-contained here rather than exported from
// `useSchedule.ts` because this hook also owns D-83's redirect behavior,
// which is dashboard-specific.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, ApiClientError } from '../../../lib/api';
import { useAuth, handleUnauthorized } from '../../../lib/AuthProvider';
import { DASHBOARD_PANEL_ORDER, type DashboardPanelId, type DashboardPanelSummary } from '@breeyo/types';

/** Mirrors `cockpitResponseSchema` (`packages/validators/src/web-dashboard.ts`) and `apps/api/.../cockpit.service.ts`'s `CockpitResponse`. */
export interface CockpitResponse {
  panelOrder: DashboardPanelId[];
  panels: DashboardPanelSummary[];
  generatedAt: string;
}

interface AsyncState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: ApiClientError | Error | null;
}

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
        setState({ data: undefined, isLoading: false, error: error as Error });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refetchToken, ...deps]);

  const refetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  return { ...state, refetch };
}

/** Route each module panel opens into -- used only to compute the D-83 redirect fallback, not by `AppSidebar` (which reads panel ids directly). */
const MODULE_ROUTE_BY_PANEL_ID: Partial<Record<DashboardPanelId, string>> = {
  QUEUE: '/queue',
  SCHEDULING: '/schedule',
  BILLING: '/billing',
  INVENTORY: '/inventory',
  USERS: '/users',
};

const LOCKED_OUT_ROUTE = '/dashboard/locked-out';

function firstAuthorizedRoute(panels: DashboardPanelSummary[]): string {
  for (const panelId of DASHBOARD_PANEL_ORDER) {
    const route = MODULE_ROUTE_BY_PANEL_ID[panelId];
    if (route && panels.some((panel) => panel.panelId === panelId)) {
      return route;
    }
  }
  return LOCKED_OUT_ROUTE;
}

export interface UseDashboardCockpitOptions {
  /**
   * The module panel the caller is currently viewing (e.g. `'USERS'` on
   * `/users`). Omit on the home page itself, where there is no "current
   * module" to fall out of.
   */
  currentModulePanelId?: DashboardPanelId;
}

/**
 * `GET /api/v1/web-dashboard/cockpit` -- the home cockpit's data source, and
 * the one place D-83's redirect-on-revocation contract is implemented for
 * the browser side:
 *
 *  - A 403 on this call means browser access itself was revoked mid-session
 *    (the API re-checks `ClinicBrowserAccessPolicy` fresh on every request,
 *    per `cockpit.controller.ts`) -- there is no module left to fall back
 *    to, so this redirects straight to the locked-out screen.
 *  - A 200 whose `panels` no longer includes `currentModulePanelId` means
 *    only that one module was revoked -- this redirects to the first module
 *    the caller still has, in `DASHBOARD_PANEL_ORDER`.
 *
 * Both checks re-run on every fetch (mount, dep change, or an explicit
 * `refetch()`), never only once at login -- that is what makes this "the
 * very next request," not "the next time they log in."
 */
export function useDashboardCockpit(options: UseDashboardCockpitOptions = {}) {
  const { currentModulePanelId } = options;
  const { accessToken, activeClinicId } = useAuth();
  const router = useRouter();
  const enabled = !!accessToken && !!activeClinicId;

  const result = useAsyncResource<CockpitResponse>(
    async (signal) => {
      const response = await apiClient<{ data: CockpitResponse }>('/api/v1/web-dashboard/cockpit', {
        token: accessToken!,
        signal,
      });
      return response.data;
    },
    [accessToken, activeClinicId],
    enabled,
  );

  useEffect(() => {
    if (result.error) {
      if (handleUnauthorized(result.error)) {
        return;
      }
      // Redirect-on-403: browser access was revoked entirely.
      if (result.error instanceof ApiClientError && result.error.status === 403) {
        router.replace(LOCKED_OUT_ROUTE);
      }
      return;
    }

    if (currentModulePanelId && result.data) {
      const stillAuthorized = result.data.panels.some((panel) => panel.panelId === currentModulePanelId);
      if (!stillAuthorized) {
        router.replace(firstAuthorizedRoute(result.data.panels));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.error, result.data, currentModulePanelId, router]);

  return result;
}
