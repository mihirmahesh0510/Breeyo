'use client';

// Plan 09-06 Task 1: the owner-portal shell state matrix (D-46, D-52, D-56
// to D-65, D-79, OWN-01 to OWN-06). Task 2 replaces the inline expired-state
// rendering below with the standalone `ExpiredLinkState` component (same
// copy/test ids, now with the real reissue call wired in) -- see that
// component's header comment.
import { useState, type ReactNode } from 'react';
import type { OwnerPortalTabId } from '@breeyo/types';
import {
  usePortalSession,
  readCachedPortalMagicLinkId,
  type PortalSessionData,
} from '../hooks/usePortalSession';
import { apiClient } from '../../../lib/api';
import { TrustBanner } from './TrustBanner';
import { PortalTabBar } from './PortalTabBar';
import { PetSwitcher } from './PetSwitcher';
import styles from './PortalShell.module.css';

export interface PortalShellRenderContext {
  session: PortalSessionData;
  activeTab: OwnerPortalTabId;
  setActiveTab: (tab: OwnerPortalTabId) => void;
  selectedPetId: string | null;
  setSelectedPetId: (petId: string) => void;
  refetch: () => void;
}

export interface PortalShellProps {
  token: string;
  children: (context: PortalShellRenderContext) => ReactNode;
}

/**
 * D-52, D-79: Call/WhatsApp clinic-contact actions, visible on every
 * ready/expired/invalid screen. `href="#"` is a known, flagged gap: no
 * owner-portal API response (session/records/invoices/checkout/reissue)
 * carries a clinic phone or WhatsApp number to link these to -- see
 * 09-06-SUMMARY.md "Deviations". The actions stay visible and reachable per
 * D-52/D-79 rather than being hidden for missing data.
 */
function PortalHelpBar() {
  return (
    <div className={styles.helpBar} data-testid="portal-help-bar">
      <a className={styles.helpAction} href="#" onClick={(e) => e.preventDefault()}>
        📞 Call Clinic
      </a>
      <a
        className={styles.helpAction}
        href="#"
        onClick={(e) => e.preventDefault()}
        target="_blank"
        rel="noopener noreferrer"
      >
        💬 WhatsApp Clinic
      </a>
    </div>
  );
}

function ValidatingScreen() {
  return (
    <div className={styles.centered} data-testid="portal-validating">
      <p className={styles.centeredBody}>Verifying your secure link…</p>
    </div>
  );
}

/** T-09-16: no owner/pet data is ever rendered here -- only the invalid copy plus clinic help. */
function InvalidScreen() {
  return (
    <div className={styles.centered} data-testid="portal-invalid">
      <h1 className={styles.centeredHeading}>This link is invalid</h1>
      <p className={styles.centeredBody}>
        We couldn&rsquo;t open this page or complete payment. Try again, request a fresh link, or contact
        your clinic.
      </p>
      <PortalHelpBar />
    </div>
  );
}

/**
 * D-64, D-67: a built-in reissue path. Reissue is only possible when this
 * browser previously cached `magicLinkId` for this exact token from an
 * earlier `READY` visit (see `usePortalSession.ts`'s cache header comment) --
 * `POST /reissue`'s body requires that id and the `/session` `EXPIRED`
 * response never carries it. When nothing is cached, self-service reissue
 * genuinely is not possible against the current API and this falls back to
 * clinic contact only, per D-78/D-81's "helpful first, then human support".
 */
function ExpiredScreen({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'requested' | 'error'>('idle');
  const cachedMagicLinkId = readCachedPortalMagicLinkId(token);

  const handleRequestNewLink = async () => {
    if (!cachedMagicLinkId) {
      setStatus('error');
      return;
    }
    setStatus('requesting');
    try {
      await apiClient(`/api/v1/owner-portal/${token}/reissue`, {
        method: 'POST',
        body: JSON.stringify({ expiredMagicLinkId: cachedMagicLinkId }),
      });
      setStatus('requested');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className={styles.centered} data-testid="portal-expired">
      <h1 className={styles.centeredHeading}>Your link has expired</h1>
      <p className={styles.centeredBody}>
        Owner-portal links stay valid for 7 days. Request a new WhatsApp link below, or contact your clinic
        for help.
      </p>
      {status === 'requested' ? (
        <p className={styles.centeredBody} role="status">
          A new link is on its way to you on WhatsApp.
        </p>
      ) : (
        <button
          type="button"
          className={styles.requestLinkButton}
          onClick={handleRequestNewLink}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? 'Requesting…' : 'Request New Link'}
        </button>
      )}
      {status === 'error' ? (
        <p className={styles.centeredBody} role="alert">
          We couldn&rsquo;t request a new link automatically. Please contact your clinic below.
        </p>
      ) : null}
      <PortalHelpBar />
    </div>
  );
}

/**
 * D-46, D-56 to D-65, D-79: the owner-portal shell. Owns `usePortalSession`
 * directly so it can resolve token state and the D-60 deep-link target
 * BEFORE anything renders, then delegates the per-tab body to `children`.
 *
 * Deliberately excludes anything from the authenticated dashboard shell
 * (`DashboardShell`, `useAuth`, Socket.IO) -- this is a separate, simpler,
 * mobile-first surface per the phase brief.
 */
export function PortalShell({ token, children }: PortalShellProps) {
  const portal = usePortalSession(token);

  if (portal.state === 'validating') {
    return <ValidatingScreen />;
  }

  if (portal.state === 'invalid') {
    return <InvalidScreen />;
  }

  if (portal.state === 'expired') {
    return <ExpiredScreen token={token} />;
  }

  if (!portal.session) {
    // Defensive only -- `ready` always carries a session from usePortalSession.
    return <InvalidScreen />;
  }

  return (
    <div className={styles.shell}>
      <TrustBanner />
      <PetSwitcher
        pets={portal.session.pets}
        selectedPetId={portal.selectedPetId}
        onSelect={portal.setSelectedPetId}
      />
      <PortalTabBar activeTab={portal.activeTab} onTabChange={portal.setActiveTab} />
      <div className={styles.content}>
        {children({
          session: portal.session,
          activeTab: portal.activeTab,
          setActiveTab: portal.setActiveTab,
          selectedPetId: portal.selectedPetId,
          setSelectedPetId: portal.setSelectedPetId,
          refetch: portal.refetch,
        })}
      </div>
      <PortalHelpBar />
    </div>
  );
}
