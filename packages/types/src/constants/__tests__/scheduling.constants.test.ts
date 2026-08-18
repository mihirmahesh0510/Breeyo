import { describe, it, expect } from 'vitest';
import {
  AppointmentStatus,
  APPOINTMENT_TRANSITIONS,
  isValidAppointmentTransition,
  APPOINTMENT_STATUS_LABELS,
  WEEKDAY_LABELS,
  weekdayIndexFromLabel,
  hhmmToMinutes,
  minutesToHHMM,
  formatMinutesRange,
  BOOKING_HORIZON_DAYS,
} from '../scheduling.constants.js';

describe('appointment transitions', () => {
  it('allows the documented forward transitions', () => {
    expect(isValidAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN)).toBe(true);
    expect(isValidAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.CANCELLED)).toBe(true);
    expect(isValidAppointmentTransition(AppointmentStatus.SCHEDULED, AppointmentStatus.NO_SHOW)).toBe(true);
    expect(isValidAppointmentTransition(AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED)).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(isValidAppointmentTransition(AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED)).toBe(false);
    expect(isValidAppointmentTransition(AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED)).toBe(false);
    expect(isValidAppointmentTransition(AppointmentStatus.CANCELLED, AppointmentStatus.SCHEDULED)).toBe(false);
    expect(isValidAppointmentTransition(AppointmentStatus.NO_SHOW, AppointmentStatus.CHECKED_IN)).toBe(false);
  });
});

describe('every status has a label', () => {
  it('APPOINTMENT_STATUS_LABELS keys match AppointmentStatus values', () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABELS).sort()).toEqual(Object.values(AppointmentStatus).sort());
  });
});

describe('hhmmToMinutes', () => {
  it('converts well-formed HH:MM strings', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
    expect(hhmmToMinutes('12:30')).toBe(750);
  });

  it('throws on malformed input', () => {
    expect(() => hhmmToMinutes('24:00')).toThrow();
    expect(() => hhmmToMinutes('9:0')).toThrow();
    expect(() => hhmmToMinutes('abc')).toThrow();
  });
});

describe('minutesToHHMM', () => {
  it('converts well-formed minute values', () => {
    expect(minutesToHHMM(540)).toBe('09:00');
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(1439)).toBe('23:59');
    expect(minutesToHHMM(750)).toBe('12:30');
  });

  it('throws on out-of-range input', () => {
    expect(() => minutesToHHMM(-1)).toThrow();
    expect(() => minutesToHHMM(1440)).toThrow();
  });
});

describe('round trip', () => {
  it('hhmmToMinutes(minutesToHHMM(m)) === m for every multiple of 15', () => {
    for (let m = 0; m <= 1425; m += 15) {
      expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m);
    }
  });
});

describe('weekday conversion', () => {
  it('maps labels to the 0=Sunday index convention', () => {
    expect(weekdayIndexFromLabel('Sunday')).toBe(0);
    expect(weekdayIndexFromLabel('Saturday')).toBe(6);
    expect(weekdayIndexFromLabel('Monday')).toBe(1);
  });

  it('exposes WEEKDAY_LABELS anchored at Sunday', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Sunday');
    expect(WEEKDAY_LABELS.length).toBe(7);
  });
});

describe('formatMinutesRange', () => {
  it('renders an en-IN 12-hour range joined by an en dash', () => {
    expect(formatMinutesRange(780, 795)).toBe('1:00 PM – 1:15 PM');
  });
});

describe('BOOKING_HORIZON_DAYS', () => {
  it('is set to the recommended 90-day horizon', () => {
    expect(BOOKING_HORIZON_DAYS).toBe(90);
  });
});
