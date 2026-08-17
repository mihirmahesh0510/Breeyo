import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@breeyo/types';
import { assertAppointmentTransition } from '../appointment.state.js';

describe('assertAppointmentTransition', () => {
  it('permits the happy path: SCHEDULED -> CHECKED_IN and CHECKED_IN -> COMPLETED', () => {
    expect(() => assertAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN)).not.toThrow();
    expect(() => assertAppointmentTransition(AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED)).not.toThrow();
  });

  it('permits cancellation and no-show from SCHEDULED', () => {
    expect(() => assertAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.CANCELLED)).not.toThrow();
    expect(() => assertAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.NO_SHOW)).not.toThrow();
  });

  it('rejects cancelling a checked-in appointment', () => {
    try {
      assertAppointmentTransition(AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED);
      throw new Error('expected assertAppointmentTransition to throw');
    } catch (err) {
      const error = err as Error & { statusCode: number; code: string };
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.message).toContain(AppointmentStatus.CHECKED_IN);
      expect(error.message).toContain(AppointmentStatus.CANCELLED);
    }
  });

  it('rejects every transition out of a terminal state', () => {
    const terminalStates = [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW];
    const allStates = Object.values(AppointmentStatus);

    for (const from of terminalStates) {
      for (const to of allStates) {
        expect(() => assertAppointmentTransition(from, to)).toThrow();
      }
    }
  });

  it('rejects a no-op transition', () => {
    expect(() => assertAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.SCHEDULED)).toThrow();
  });
});
