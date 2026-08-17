import { isValidAppointmentTransition, type AppointmentStatus } from '@breeyo/types';

/**
 * Thin transition guard — the transition table itself lives in
 * `@breeyo/types` (`APPOINTMENT_TRANSITIONS`/`isValidAppointmentTransition`)
 * so mobile and web render from the same source. This module must not
 * redeclare it.
 */
export function assertAppointmentTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!isValidAppointmentTransition(from, to)) {
    const error = new Error(`Cannot transition appointment from ${from} to ${to}`) as Error & {
      statusCode: number;
      code: string;
    };
    error.statusCode = 400;
    error.code = 'INVALID_TRANSITION';
    throw error;
  }
}
