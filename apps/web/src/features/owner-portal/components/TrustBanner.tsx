'use client';

import styles from './TrustBanner.module.css';

/**
 * D-56, D-65, D-68, OWN-04: always-visible trust explanation for the
 * no-login magic-link model, in plain language rather than a technical
 * security console -- a light-reassurance banner, not a separate intro
 * gate. Rendered by `PortalShell` on every `ready` screen.
 */
export function TrustBanner() {
  return (
    <div className={styles.banner} role="note" data-testid="trust-banner">
      <span className={styles.icon} aria-hidden="true">
        🔒
      </span>
      <p className={styles.text}>
        This is a secure clinic link, valid for 7 days. No login is required — only people with this exact
        link can see your pet&rsquo;s records and invoices.
      </p>
    </div>
  );
}
