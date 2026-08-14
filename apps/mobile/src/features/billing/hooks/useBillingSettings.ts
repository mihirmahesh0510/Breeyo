import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClinicBillingSettings, SacCodeCorrectionResult } from '@breeyo/types';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { BILLING_DASHBOARD_QUERY_KEY } from './useBillingDashboard';
import { SERVICE_CATALOG_QUERY_KEY } from './useServiceCatalog';
import {
  canManageBillingSettings,
  type BillingSettingsPayload,
} from '../lib/settings-form';

// --- Response types ---

interface BillingSettingsResponse {
  data: ClinicBillingSettings;
}

interface SacCodeCorrectionResponse {
  data: SacCodeCorrectionResult;
}

interface PermissionsResponse {
  data: { permissions: string[] };
}

/** Clinic-scoped, like every other billing key (T-06-92). */
export const BILLING_SETTINGS_QUERY_KEY = ['billing', 'settings'] as const;

const PERMISSIONS_QUERY_KEY = ['auth', 'permissions'] as const;

/**
 * `GET /api/v1/billing/settings` (D-29).
 *
 * The response type has no secret member of any kind — `ClinicBillingSettings`
 * carries `hasRazorpayKeySecret` / `hasRazorpayWebhookSecret` booleans instead —
 * so there is nothing here for a form to accidentally echo back into an input.
 *
 * `razorpayWebhookToken` *is* in the response, and is a capability: Razorpay
 * sends no tenant identifier, so that token is the routing key for this clinic's
 * webhook. All three settings routes are gated on `MANAGE_CLINIC_SETTINGS`
 * server-side, so only an Admin can reach this at all. It is never logged here
 * and only ever reaches the screen already embedded in `webhookUrl`.
 */
export function useBillingSettings() {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: [...BILLING_SETTINGS_QUERY_KEY, activeClinicId],
    queryFn: () =>
      apiClient<BillingSettingsResponse>('/api/v1/billing/settings', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    select: (response) => response.data,
  });
}

/**
 * `PUT /api/v1/billing/settings`.
 *
 * The body is built by `buildSettingsPayload`, which omits any credential key
 * whose input was left empty. That omission is the entire contract: the service
 * builds its `providedFields` set from the keys present in this body and treats
 * an absent key as unchanged, so sending `''` would overwrite a working
 * credential with nothing (T-06-118).
 *
 * The server calls `invalidateRazorpayCache(clinicId)` before it responds
 * whenever a credential moved, so the cached signing client cannot outlive the
 * secret it was built from (T-06-54). Invalidating the settings key here is the
 * client half of the same idea: the presence booleans and `webhookConfigured`
 * change as a result of this write, so the form must re-read rather than trust
 * what it just sent. The dashboard key goes too because GST and due-day defaults
 * change what subsequent invoices look like.
 */
export function useUpdateBillingSettings() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BillingSettingsPayload) =>
      apiClient<BillingSettingsResponse>('/api/v1/billing/settings', {
        method: 'PUT',
        token: accessToken!,
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...BILLING_SETTINGS_QUERY_KEY, activeClinicId],
      });
      queryClient.invalidateQueries({ queryKey: BILLING_DASHBOARD_QUERY_KEY });
    },
  });
}

/**
 * `POST /api/v1/billing/settings/webhook-token/rotate` (T-06-80, T-06-140).
 *
 * Its own endpoint rather than a flag on save, because the consequence is not a
 * settings change: Razorpay stops delivering to the old URL immediately, and the
 * clinic receives no payment confirmations until the Admin pastes the new URL
 * into their dashboard.
 *
 * Invalidating the settings key on success is what makes the screen safe. The
 * displayed URL is derived from the token; leaving the pre-rotation value on
 * screen would have the Admin paste a URL that is already dead, and the failure
 * would be silent — payments completing at the gateway while invoices stay
 * unpaid.
 */
export function useRotateWebhookToken() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<BillingSettingsResponse>(
        '/api/v1/billing/settings/webhook-token/rotate',
        { method: 'POST', token: accessToken! },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...BILLING_SETTINGS_QUERY_KEY, activeClinicId],
      });
    },
  });
}

/**
 * `POST /api/v1/billing/settings/sac-codes/update` — the opt-in A1 correction.
 *
 * Its own mutation and its own endpoint, never a field on the settings save.
 * The rewrite touches `service_catalog.sac_code`, which is printed on a legal
 * document, and a clinic's accountant may already have set those codes by hand.
 * The decision recorded in A1 is that this happens because an Admin chose it,
 * so it must not be reachable from any handler an Admin invokes for another
 * reason — least of all the Save button.
 *
 * Two keys are invalidated on success. The settings key carries
 * `legacySacCodeCount`, which is what renders the notice; leaving it stale
 * keeps a resolved notice on screen and invites a pointless second tap. The
 * service-catalog key holds the rows that just changed, so any picker still
 * showing them would display the old codes.
 *
 * No body is sent. There is one legacy set and one code it corrects to, both
 * constants in `@breeyo/types`, so there is nothing here for a client to
 * parameterise — and therefore no way for this call to write an arbitrary SAC
 * onto a clinic's catalog.
 */
export function useUpdateSacCodes() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<SacCodeCorrectionResponse>(
        '/api/v1/billing/settings/sac-codes/update',
        { method: 'POST', token: accessToken! },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...BILLING_SETTINGS_QUERY_KEY, activeClinicId],
      });
      queryClient.invalidateQueries({
        queryKey: [...SERVICE_CATALOG_QUERY_KEY, activeClinicId],
      });
    },
  });
}

/**
 * The client half of the `MANAGE_CLINIC_SETTINGS` gate (T-06-119).
 *
 * The mobile auth context stores only `{ id, email, fullName }` — it has never
 * carried roles or permissions — so the permission has to be read from
 * `GET /api/v1/auth/permissions`, which is clinic-scoped by `tenantContext`.
 *
 * This is defence in depth, not the enforcement point: the server rejects a
 * non-Admin regardless. Its purpose is to stop the app presenting a form that
 * can only end in a 403 after the Admin has typed a live secret into it.
 */
export function useBillingSettingsPermission() {
  const { accessToken, activeClinicId } = useAuth();

  const query = useQuery({
    queryKey: [...PERMISSIONS_QUERY_KEY, activeClinicId],
    queryFn: () =>
      apiClient<PermissionsResponse>('/api/v1/auth/permissions', {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 5 * 60_000,
    select: (response) => response.data.permissions,
  });

  return {
    ...query,
    /** False while loading, so a form is never shown before the check resolves. */
    canManageSettings: canManageBillingSettings(query.data),
  };
}
