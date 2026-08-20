'use client';

// Plan 09-06 Task 2: extracts the expired-link reissue flow out of
// `PortalShell.tsx`'s Task 1 inline version into its own component, adding
// the LIMIT_REACHED (D-82) and no-cached-id fallback handling. `PortalShell`
// now renders this instead of its own inline `ExpiredScreen`.
import { useState } from 'react';
import { apiClient, ApiClientError } from '../../../lib/api';
import { readCachedPortalMagicLinkId } from '../hooks/usePortalSession';
import styles from './ExpiredLinkState.module.css';

export interface ExpiredLinkStateProps {
  token: string;
}

type ReissueStatus = 'idle' | 'requesting' | 'requested' | 'limit-reached' | 'no-cached-id' | 'error';

/**
 * D-64, D-67: expired links get a dedicated screen with a built-in
 * "Request New Link" action, always alongside D-52/D-79's clinic-contact
 * actions.
 *
 * D-82: a 429 from `POST /reissue` (the daily cap) routes the owner to
 * clinic contact instead of retrying self-service, per D-78/D-81.
 *
 * Known gap (see `usePortalSession.ts` and 09-06-SUMMARY.md
 * "Deviations"): `POST /reissue` requires `expiredMagicLinkId`, but the
 * `/session` `EXPIRED` response never carries it (no-data-leak by design).
 * This component can only self-serve a reissue when this browser cached
 * that id from an earlier `READY` visit to this exact token. When nothing
 * is cached -- e.g. a WhatsApp link opened for the very first time after it
 * has already expired -- self-service is not possible against the current
 * API, and this falls back directly to clinic contact rather than issuing
 * a request that cannot succeed.
 */
export function ExpiredLinkState({ token }: ExpiredLinkStateProps) {
  const [status, setStatus] = useState<ReissueStatus>('idle');

  const handleRequestNewLink = async () => {
    const cachedMagicLinkId = readCachedPortalMagicLinkId(token);
    if (!cachedMagicLinkId) {
      setStatus('no-cached-id');
      return;
    }

    setStatus('requesting');
    try {
      await apiClient(`/api/v1/owner-portal/${token}/reissue`, {
        method: 'POST',
        body: JSON.stringify({ expiredMagicLinkId: cachedMagicLinkId }),
      });
      setStatus('requested');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setStatus('limit-reached');
        return;
      }
      setStatus('error');
    }
  };

  const showFallbackToClinic = status === 'limit-reached' || status === 'no-cached-id' || status === 'error';

  return (
    <div className={styles.wrap} data-testid="expired-link-state">
      <h1 className={styles.heading}>Your link has expired</h1>
      <p className={styles.body}>
        Owner-portal links stay valid for 7 days. Request a new WhatsApp link below, or contact your clinic
        for help.
      </p>

      {status === 'requested' ? (
        <p className={styles.body} role="status">
          A new link is on its way to you on WhatsApp.
        </p>
      ) : (
        <button
          type="button"
          className={styles.requestButton}
          onClick={handleRequestNewLink}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' ? 'Requesting…' : 'Request New Link'}
        </button>
      )}

      {showFallbackToClinic ? (
        <p className={styles.body} role="alert">
          {status === 'limit-reached'
            ? 'You’ve reached today’s limit for new links. Please contact your clinic below for help.'
            : 'We couldn’t request a new link automatically. Please contact your clinic below.'}
        </p>
      ) : null}

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
    </div>
  );
}
