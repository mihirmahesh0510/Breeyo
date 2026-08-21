'use client';

// Extracted out of `PortalShell.tsx` (PHASE-09-VERIFY-FIX-PLAN.md finding
// 9.9): `ExpiredLinkState.tsx` rendered its own separate inline help bar
// hardcoded to `href="#"`, which the `clinicPhone` fix (commit 6bb1fa7) never
// reached -- that commit only updated `PortalShell.tsx`'s copy. Pulling the
// bar (and its `tel:`/`wa.me` link-building) into one shared component means
// every screen that renders it -- ready, invalid, and now expired -- goes
// through the exact same logic instead of a second hand-copied version that
// can silently drift out of sync again.
import styles from './PortalHelpBar.module.css';

/** `tel:` accepts the number largely as-is; `wa.me` needs digits only (no `+`, spaces, or punctuation). */
function toWhatsAppDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export interface PortalHelpBarProps {
  clinicPhone?: string;
}

/**
 * D-52, D-79: Call/WhatsApp clinic-contact actions, visible on every
 * ready/expired/invalid screen. `clinicPhone` comes from `Clinic.contactPhone`
 * and produces real `tel:`/`wa.me` links wherever it's known. Safe to show
 * back to the caller specifically because reaching a screen that has it (the
 * `READY` session, or now the `EXPIRED` envelope) already required this
 * exact clinic to have handed this exact owner this exact link (or its
 * expired predecessor) -- see `portal-session.service.ts` and
 * `magic-link.service.ts` for where each state sources it. The `INVALID`
 * screen never has a clinic to point to (T-09-16: no data at all for a
 * tampered/mismatched token) and falls back to the same non-navigating
 * placeholder link it always used -- present and reachable per D-52/D-79's
 * "always visible" requirement, just without a clinic yet.
 */
export function PortalHelpBar({ clinicPhone }: PortalHelpBarProps) {
  return (
    <div className={styles.helpBar} data-testid="portal-help-bar">
      <a
        className={styles.helpAction}
        href={clinicPhone ? `tel:${clinicPhone}` : '#'}
        onClick={clinicPhone ? undefined : (e) => e.preventDefault()}
      >
        📞 Call Clinic
      </a>
      <a
        className={styles.helpAction}
        href={clinicPhone ? `https://wa.me/${toWhatsAppDigits(clinicPhone)}` : '#'}
        onClick={clinicPhone ? undefined : (e) => e.preventDefault()}
        target="_blank"
        rel="noopener noreferrer"
      >
        💬 WhatsApp Clinic
      </a>
    </div>
  );
}
