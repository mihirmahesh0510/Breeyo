/**
 * IST-anchored date helpers.
 *
 * WHA-01 / D-01, D-02: the WhatsApp reminder sweep needs IST-anchored date
 * arithmetic without importing `QueueRepository` into the WhatsApp module.
 * This module is the single shared source for that arithmetic — extracted
 * verbatim from `QueueRepository.getTodayIST` (Phase 3), which now delegates
 * back to `getTodayIST` here rather than duplicating the logic.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Gets start of today in IST (Asia/Kolkata, UTC+5:30).
 */
export function getTodayIST(date?: Date): Date {
  const now = date ?? new Date();
  // Convert to IST string, then parse back to get midnight IST
  const istString = now.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  // istString is "YYYY-MM-DD"
  const [year, month, day] = istString.split('-').map(Number);
  // Create UTC date that represents midnight IST (IST = UTC + 5:30)
  return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
}

/**
 * Adds whole days to an existing IST-midnight `Date`.
 *
 * Adds fixed 24h increments directly to the instant rather than re-deriving
 * the date from the local system clock — Asia/Kolkata has no DST, so a
 * constant day length is safe, and re-deriving via `getTodayIST` would
 * reinterpret the shifted instant through whatever machine-local timezone is
 * running the process instead of preserving the IST-midnight anchor.
 */
export function addDaysIST(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
