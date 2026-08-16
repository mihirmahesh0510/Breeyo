/**
 * WHA-03 / D-06, D-09 — API-side transition guard mirroring the shared
 * `WA_BOOKING_TRANSITIONS` table (`@breeyo/types`). The transition data
 * itself lives in `@breeyo/types` (not duplicated here) so mobile can
 * render valid action cards from the exact same table this guard enforces
 * server-side.
 *
 * Follows the 409 throw shape established by `queue.service.ts` (see e.g.
 * its `ALREADY_IN_QUEUE` throw): `Error & { statusCode: 409, code }`.
 */

import { isValidBookingTransition, type WaBookingState } from '@breeyo/types';

function invalidBookingTransitionError(from: WaBookingState, to: WaBookingState) {
  const error = new Error(
    `Cannot transition WhatsApp booking from ${from} to ${to}`,
  ) as Error & { statusCode: number; code: string };
  error.statusCode = 409;
  error.code = 'INVALID_BOOKING_TRANSITION';
  return error;
}

/** Throws a 409 `INVALID_BOOKING_TRANSITION` on an illegal transition; a no-op otherwise. */
export function assertBookingTransition(from: WaBookingState, to: WaBookingState): void {
  if (!isValidBookingTransition(from, to)) {
    throw invalidBookingTransitionError(from, to);
  }
}
