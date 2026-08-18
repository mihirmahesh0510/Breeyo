import { describe, it, expect } from 'vitest';
import {
  AppointmentStatus,
  AppointmentSource,
} from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import {
  groupAppointmentsByTimeOfDay,
  formatSlotRange,
  isPastOnToday,
  splitIndexForNowIndicator,
} from '../agenda-utils';

// IST is a fixed +05:30 offset (no DST) -- literal offset strings anchor
// every fixture to a real IST wall-clock time regardless of host TZ.
function makeAppointment(
  overrides: Partial<AppointmentWithDetails> & { scheduledFor: Date },
): AppointmentWithDetails {
  return {
    id: overrides.id ?? 'appt-1',
    clinicId: 'clinic-1',
    vetId: 'vet-1',
    ownerId: 'owner-1',
    serviceCatalogId: 'service-1',
    status: AppointmentStatus.SCHEDULED,
    source: AppointmentSource.STAFF,
    durationMinutes: overrides.durationMinutes ?? 15,
    recurringSeriesId: null,
    recurrenceIndex: null,
    notes: null,
    createdById: 'user-1',
    whatsappBookingRequestId: null,
    checkedInAt: null,
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00+05:30'),
    updatedAt: new Date('2026-01-01T00:00:00+05:30'),
    pets: [
      {
        id: 'ap-1',
        petId: 'pet-1',
        queueEntryId: null,
        pet: { id: 'pet-1', name: 'Rex', species: 'DOG' },
      },
    ],
    owner: { id: 'owner-1', name: 'Asha', mobile: '9876543210' },
    vet: { id: 'vet-1', name: 'Mehta' },
    service: { id: 'service-1', name: 'Vaccination', durationMinutes: 15 },
    ...overrides,
  };
}

function istTime(hhmm: string, date = '2026-08-18'): Date {
  return new Date(`${date}T${hhmm}:00+05:30`);
}

describe('groupAppointmentsByTimeOfDay', () => {
  it('splits at the right boundaries: 11:59 Morning, 12:00 Afternoon, 16:59 Afternoon, 17:00 Evening', () => {
    const appointments = [
      makeAppointment({ id: 'a', scheduledFor: istTime('11:59') }),
      makeAppointment({ id: 'b', scheduledFor: istTime('12:00') }),
      makeAppointment({ id: 'c', scheduledFor: istTime('16:59') }),
      makeAppointment({ id: 'd', scheduledFor: istTime('17:00') }),
    ];

    const groups = groupAppointmentsByTimeOfDay(appointments);
    const findGroup = (title: string) => groups.find((g) => g.title === title);

    expect(findGroup('Morning')?.data.map((a) => a.id)).toEqual(['a']);
    expect(findGroup('Afternoon')?.data.map((a) => a.id)).toEqual(['b', 'c']);
    expect(findGroup('Evening')?.data.map((a) => a.id)).toEqual(['d']);
  });

  it('omits empty groups entirely', () => {
    const appointments = [
      makeAppointment({ id: 'a', scheduledFor: istTime('13:00') }),
      makeAppointment({ id: 'b', scheduledFor: istTime('14:00') }),
    ];

    const groups = groupAppointmentsByTimeOfDay(appointments);

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('Afternoon');
  });

  it('orders appointments ascending within a group', () => {
    const appointments = [
      makeAppointment({ id: 'late', scheduledFor: istTime('15:30') }),
      makeAppointment({ id: 'early', scheduledFor: istTime('13:00') }),
      makeAppointment({ id: 'mid', scheduledFor: istTime('14:00') }),
    ];

    const groups = groupAppointmentsByTimeOfDay(appointments);

    expect(groups[0].data.map((a) => a.id)).toEqual(['early', 'mid', 'late']);
  });

  it('orders groups Morning, then Afternoon, then Evening regardless of input order', () => {
    const appointments = [
      makeAppointment({ id: 'evening', scheduledFor: istTime('18:00') }),
      makeAppointment({ id: 'morning', scheduledFor: istTime('09:00') }),
      makeAppointment({ id: 'afternoon', scheduledFor: istTime('13:00') }),
    ];

    const groups = groupAppointmentsByTimeOfDay(appointments);

    expect(groups.map((g) => g.title)).toEqual(['Morning', 'Afternoon', 'Evening']);
  });
});

describe('formatSlotRange', () => {
  it('renders the UI-SPEC time format for a 14:30 start with a 15-minute duration', () => {
    expect(formatSlotRange(istTime('14:30'), 15)).toBe('2:30 – 2:45 PM');
  });
});

describe('isPastOnToday', () => {
  it('marks an appointment earlier today as past', () => {
    const now = new Date();
    const earlierToday = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isPastOnToday(earlierToday, now)).toBe(true);
  });

  it('does not mark the same clock time on a future date as past', () => {
    const now = new Date();
    const sameClockTimeTomorrow = new Date(now.getTime() - 60 * 60 * 1000 + 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(isPastOnToday(sameClockTimeTomorrow, tomorrow)).toBe(false);
  });

  it('does not mark any appointment on a past date, even one clearly in the past', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const earlierYesterday = new Date(yesterday.getTime() - 60 * 60 * 1000);
    expect(isPastOnToday(earlierYesterday, yesterday)).toBe(false);
  });
});

describe('splitIndexForNowIndicator', () => {
  it('returns the boundary between the last past and first future appointment', () => {
    const now = istTime('14:00');
    const appointments = [
      makeAppointment({ id: 'past-1', scheduledFor: istTime('09:00') }),
      makeAppointment({ id: 'past-2', scheduledFor: istTime('13:00') }),
      makeAppointment({ id: 'future-1', scheduledFor: istTime('15:00') }),
      makeAppointment({ id: 'future-2', scheduledFor: istTime('16:00') }),
    ];

    expect(splitIndexForNowIndicator(appointments, now, now)).toBe(2);
  });

  it('returns null when the selected date is not today', () => {
    const now = istTime('14:00', '2026-08-18');
    const selectedDate = istTime('00:00', '2026-08-19');
    const appointments = [makeAppointment({ scheduledFor: istTime('09:00', '2026-08-19') })];

    expect(splitIndexForNowIndicator(appointments, selectedDate, now)).toBeNull();
  });
});
