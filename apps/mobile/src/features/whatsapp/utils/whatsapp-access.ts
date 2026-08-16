import type { RoleName } from '@breeyo/types';

/**
 * WHA-05 / D-20: the WhatsApp Inbox and Thread SCREENS are gated to Front
 * Desk + Admin only -- deliberately narrower than the `SEND_WHATSAPP` action
 * permission (Admin, Clinician, Front Desk, unchanged from D-20/D-22), which
 * stays broader and remains enforced server-side. This module is a client
 * USABILITY gate ("don't show a screen this user can't usefully act on"),
 * never the security boundary -- the API independently enforces
 * `SEND_WHATSAPP` and `MANAGE_CLINIC_SETTINGS` regardless of what this
 * predicate returns, so bypassing the client gate grants nothing.
 *
 * Typed against `RoleName` (not a bare string literal union redeclared here)
 * so a typo or a renamed seeded role is a compile error, not a silent gate
 * that never opens.
 */
const WHATSAPP_SCREEN_ROLES: readonly RoleName[] = ['Admin', 'FrontDesk'];

/** The Config screen (Admin-only, `MANAGE_CLINIC_SETTINGS`) is even narrower. */
const WHATSAPP_CONFIG_ROLES: readonly RoleName[] = ['Admin'];

/**
 * True only for `Admin` and `FrontDesk`. Case-sensitive, exact match against
 * the seeded `RoleName` values -- no substring matching, so `'AdminUser'` or
 * `'admin'` do not accidentally pass. Absence (`undefined`/`''`) denies.
 */
export function canAccessWhatsAppScreens(role?: string): boolean {
  if (!role) return false;
  return (WHATSAPP_SCREEN_ROLES as readonly string[]).includes(role);
}

/**
 * True only for `Admin`. Same case-sensitive, exact-match, absence-denies
 * rules as `canAccessWhatsAppScreens`.
 */
export function canAccessWhatsAppConfig(role?: string): boolean {
  if (!role) return false;
  return (WHATSAPP_CONFIG_ROLES as readonly string[]).includes(role);
}
