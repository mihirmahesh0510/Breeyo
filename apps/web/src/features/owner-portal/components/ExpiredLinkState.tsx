'use client';

// Plan 09-06 Task 2: extracts the expired-link reissue flow out of
// `PortalShell.tsx`'s Task 1 inline version into its own component, adding
// the LIMIT_REACHED (D-82) fallback handling. `PortalShell` now renders this
// instead of its own inline `ExpiredScreen`.
import { useState } from 'react';
import { apiClient, ApiClientError } from '../../../lib/api';
import { PortalHelpBar } from './PortalHelpBar';
import styles from './ExpiredLinkState.module.css';

export interface ExpiredLinkStateProps {
  token: string;
  /**
   * D-52, D-79, finding 9.9: sourced by `PortalShell` from the `EXPIRED`
   * session envelope's own `clinicPhone` (widened alongside the `READY`
   * path's `data.clinicPhone` -- see `magic-link.service.ts`), so this
   * screen's help bar gets real `tel:`/`wa.me` links instead of the
   * `href="#"` placeholder it used before this field existed.
   */
  clinicPhone?: string;
}

type ReissueStatus = 'idle' | 'requesting' | 'requested' | 'limit-reached' | 'error';

/**
 * D-64, D-67: expired links get a dedicated screen with a built-in
 * "Request New Link" action, always alongside D-52/D-79's clinic-contact
 * actions.
 *
 * D-82: a 429 from `POST /reissue` (the daily cap) routes the owner to
 * clinic contact instead of retrying self-service, per D-78/D-81.
 *
 * `POST /reissue` takes no body — the raw `:token` in the URL is already
 * hash-validated server-side and is sufficient on its own to identify which
 * expired link to reissue, exactly like every other portal route. (An
 * earlier version of this component needed a `magicLinkId` cached in
 * localStorage from an earlier `READY` visit, because the backend used to
 * require a client-supplied id the EXPIRED response never carried — fixed
 * at the API layer, not worked around here, since it made self-service
 * reissue impossible for a link opened for the very first time after it
 * had already expired.)
 */
export function ExpiredLinkState({ token, clinicPhone }: ExpiredLinkStateProps) {
  const [status, setStatus] = useState<ReissueStatus>('idle');

  const handleRequestNewLink = async () => {
    setStatus('requesting');
    try {
      await apiClient(`/api/v1/owner-portal/${token}/reissue`, { method: 'POST' });
      setStatus('requested');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setStatus('limit-reached');
        return;
      }
      setStatus('error');
    }
  };

  const showFallbackToClinic = status === 'limit-reached' || status === 'error';

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

      <PortalHelpBar clinicPhone={clinicPhone} />
    </div>
  );
}
