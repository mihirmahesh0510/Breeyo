'use client';

// Plan 09-06 Task 1/2: the owner-portal shell state matrix (D-46, D-52,
// D-56 to D-65, D-79, OWN-01 to OWN-06). Task 2 moved the expired-state
// rendering into the standalone `ExpiredLinkState` component (same
// copy/test ids as Task 1's inline version, now with LIMIT_REACHED
// fallback handling) -- see that component's header comment.
import type { ReactNode } from 'react';
import type { OwnerPortalTabId } from '@breeyo/types';
import { usePortalSession, type PortalSessionData } from '../hooks/usePortalSession';
import { TrustBanner } from './TrustBanner';
import { PortalTabBar } from './PortalTabBar';
import { PetSwitcher } from './PetSwitcher';
import { ExpiredLinkState } from './ExpiredLinkState';
import { PortalHelpBar } from './PortalHelpBar';
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
    return <ExpiredLinkState token={token} clinicPhone={portal.clinicPhone} />;
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
      <PortalHelpBar clinicPhone={portal.session.clinicPhone} />
    </div>
  );
}
