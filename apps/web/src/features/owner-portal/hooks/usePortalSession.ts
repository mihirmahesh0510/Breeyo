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
}

type SessionEnvelope = { state: 'READY'; data: PortalSessionData } | { state: 'EXPIRED' };

const MAGIC_LINK_CACHE_PREFIX = 'breeyo:owner-portal:magic-link:';

/**
 * D-67: caches `magicLinkId` for a token the FIRST time it resolves `READY`,
 * so a later visit where the SAME token has since expired can still
 * self-serve a reissue.
 *
 * This cache exists because of a real gap between the 09-05 backend and
 * this task: `GET /owner-portal/:token/session`'s `EXPIRED` response is
 * `{ state: 'EXPIRED' }` ONLY -- `ownerPortalSessionSchema`'s `EXPIRED`
 * variant is `.strict()` with no `data` field, by design (T-09-16 -- no
 * scope leakage). But `POST /owner-portal/:token/reissue` REQUIRES
 * `expiredMagicLinkId` in its body and 403s if it does not match the
 * token's own resolved id. There is no API response that ever hands an
 * unauthenticated browser that id for an already-expired link. Caching it
 * from an earlier `READY` visit is the only way this UI can drive that
 * endpoint at all; see `ExpiredLinkState.tsx` and 09-06-SUMMARY.md's
 * "Deviations" section for the full writeup and the case (a link opened for
 * the very first time after it has already expired) where no self-service
 * reissue is possible and the UI must fall back to clinic contact instead.
 */
export function cachePortalMagicLinkId(token: string, magicLinkId: string): void {
  try {
    window.localStorage.setItem(`${MAGIC_LINK_CACHE_PREFIX}${token}`, magicLinkId);
  } catch {
    // Best-effort only (private browsing / storage disabled).
  }
}

export function readCachedPortalMagicLinkId(token: string): string | null {
  try {
    return window.localStorage.getItem(`${MAGIC_LINK_CACHE_PREFIX}${token}`);
  } catch {
    return null;
  }
}

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
          setState('expired');
          return;
        }

        const data = response.data;
        setSession(data);
        cachePortalMagicLinkId(token, data.magicLinkId);

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
  };
}
