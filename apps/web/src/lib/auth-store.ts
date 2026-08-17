// Session storage wrapper for the web owner portal's auth token.
//
// Decision & tradeoff (D-25 / plan 08-06): the token lives in memory plus
// `sessionStorage`, deliberately NOT an httpOnly cookie, so `apps/web` uses the
// same bearer-token model as `apps/mobile` rather than introducing a second
// auth mechanism into an API that issues bearer tokens for every other client.
// `sessionStorage` -- a tab-scoped store that is cleared on the persistent,
// cross-tab web storage mechanism this deliberately avoids -- bounds token
// exposure to the browser tab's lifetime: closing the tab discards the
// session. The token remains
// readable by any script running on this origin (T-08-22): accepted for a
// staff-only internal tool at Beta scope, bounded by no `dangerouslySetInnerHTML`
// anywhere in `apps/web` and no third-party script tags. Phase 9 owns full
// session management (refresh rotation, expiry timers); this module is
// deliberately minimal.

const STORAGE_KEY = 'breeyo.web.session';

export interface WebSession {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  userName: string;
  activeClinicId: string;
}

export function readSession(): WebSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WebSession;
  } catch {
    return null;
  }
}

export function writeSession(session: WebSession): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
