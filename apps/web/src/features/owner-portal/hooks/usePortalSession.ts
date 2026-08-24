'use client';

// Plan 09-06 Task 1: the owner-portal session hook (D-46, D-53, D-56 to
// D-65, OWN-04, OWN-06).
//
// This is deliberately NOT built on `useAuth`/`AuthProvider` -- the owner
// portal is a PUBLIC, unauthenticated surface reached via a raw token in the
// URL path, never a JWT (T-09-13). `apiClient` is called here without a
// `token` option so no `Authorization` header is ever attached.
//
// No Socket.IO here either: D-40's "browser/mobile live-sync" model is a
// JWT-authenticated concept (`useBillingWorkbench.ts`, `useQueueRealtime.ts`
// both hand a `token` to `io(...)`'s `auth` option). The owner portal keeps
// freshness through plain refetch-on-focus/refetch-on-demand (`refetch()`
// below), never a live socket handshake.
import { useCallback, useEffect, useState } from 'react';
import type { OwnerPortalDeepLinkTarget, OwnerPortalPetSummary, OwnerPortalTabId } from '@breeyo/types';
import { apiClient } from '../../../lib/api';

export type PortalShellState = 'validating' | 'ready' | 'expired' | 'invalid';

export interface PortalSessionRestoreState {
  lastTab: OwnerPortalTabId | null;
  lastPetId: string | null;
  lastInvoiceId: string | null;
  lastVisitId: string | null;
  lastCheckoutSessionId: string | null;
  lastReturnState: string | null;
}

/** Mirrors `PortalSessionData` (`apps/api/src/modules/owner-portal/portal-session.service.ts`). */
export interface PortalSessionData {
  magicLinkId: string;
  defaultTab: OwnerPortalTabId;
  ownerName: string;
  pets: OwnerPortalPetSummary[];
  totalDuePaise: number;
  deepLink: OwnerPortalDeepLinkTarget | null;
  restore: PortalSessionRestoreState;
  /** D-52, D-79: the clinic's contact number, for real `tel:`/`wa.me` help-bar links. */
  clinicPhone: string;
}

// Finding 9.9: `EXPIRED` now carries `clinicPhone` the same way the `READY`
// envelope's `data.clinicPhone` does (sourced from `Clinic.contactPhone` in
// `magic-link.service.ts`), so `ExpiredLinkState`'s own help bar can show
// real `tel:`/`wa.me` links instead of the `href="#"` placeholder it fell
// back to because this envelope used to carry no data at all.
type SessionEnvelope =
  | { state: 'READY'; data: PortalSessionData }
  | { state: 'EXPIRED'; clinicPhone?: string };

function resolveDeepLinkTab(deepLink: OwnerPortalDeepLinkTarget | null): OwnerPortalTabId | null {
  if (!deepLink) return null;
  if (deepLink.type === 'INVOICE') return 'INVOICES';
  if (deepLink.type === 'VISIT') return 'RECORDS';
  return 'OVERVIEW';
}

export interface UsePortalSessionResult {
  state: PortalShellState;
  session: PortalSessionData | null;
  activeTab: OwnerPortalTabId;
  setActiveTab: (tab: OwnerPortalTabId) => void;
  selectedPetId: string | null;
  setSelectedPetId: (petId: string) => void;
  deepLinkTarget: OwnerPortalDeepLinkTarget | null;
  refetch: () => void;
  /**
   * D-52, D-79, finding 9.9: populated from the `READY` session's
   * `data.clinicPhone` OR the `EXPIRED` envelope's own `clinicPhone` --
   * whichever state is currently active -- so `PortalShell` can hand the
   * same real clinic number to `ExpiredLinkState`'s help bar that it already
   * hands its own.
   */
  clinicPhone: string | undefined;
}

/**
 * `GET /api/v1/owner-portal/:token/session` (OWN-04, OWN-06).
 *
 * Resolves the token-state matrix (`validating` while in flight, then
 * `ready` / `expired` / `invalid` from the response), the D-60 deep-link
 * target's starting tab, and the D-53 last-viewed pet (falling back to the
 * first pet in scope). A 403 (INVALID, or any other unexpected failure) is
 * collapsed to `invalid` -- the same "never leak which check failed" posture
 * `resolveOwnerPortalSessionState` uses server-side.
 */
export function usePortalSession(token: string): UsePortalSessionResult {
  const [state, setState] = useState<PortalShellState>('validating');
  const [session, setSession] = useState<PortalSessionData | null>(null);
  const [activeTab, setActiveTabState] = useState<OwnerPortalTabId>('OVERVIEW');
  const [selectedPetId, setSelectedPetIdState] = useState<string | null>(null);
  const [refetchIndex, setRefetchIndex] = useState(0);
  const [expiredClinicPhone, setExpiredClinicPhone] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }

    let cancelled = false;
    setState('validating');

    apiClient<SessionEnvelope>(`/api/v1/owner-portal/${token}/session`)
      .then((response) => {
        if (cancelled) return;

        if (response.state === 'EXPIRED') {
          setSession(null);
          setExpiredClinicPhone(response.clinicPhone);
          setState('expired');
          return;
        }

        const data = response.data;
        setSession(data);

        const deepLinkTab = resolveDeepLinkTab(data.deepLink);
        setActiveTabState(deepLinkTab ?? data.restore.lastTab ?? data.defaultTab);

        const restoredPetId = data.restore.lastPetId;
        const restoredPetIsInScope = !!restoredPetId && data.pets.some((pet) => pet.petId === restoredPetId);
        setSelectedPetIdState(restoredPetIsInScope ? restoredPetId! : data.pets[0]?.petId ?? null);

        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setState('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [token, refetchIndex]);

  const setActiveTab = useCallback((tab: OwnerPortalTabId) => setActiveTabState(tab), []);
  const setSelectedPetId = useCallback((petId: string) => setSelectedPetIdState(petId), []);
  const refetch = useCallback(() => setRefetchIndex((n) => n + 1), []);

  return {
    state,
    session,
    activeTab,
    setActiveTab,
    selectedPetId,
    setSelectedPetId,
    deepLinkTarget: session?.deepLink ?? null,
    refetch,
    clinicPhone: session?.clinicPhone ?? expiredClinicPhone,
  };
}
