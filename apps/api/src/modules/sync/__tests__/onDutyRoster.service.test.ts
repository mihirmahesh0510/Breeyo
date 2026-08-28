// Verify-fix 10.6 (D-36 roster resolution): `ClinicVetRosterProvider` must
// genuinely call `AvailabilityRepository.listClinicVets(clinicId)` -- not a
// hand-waved stub of `OnDutyRosterProvider` itself -- and correctly exclude
// the unreachable clinician. This fake matches `AvailabilityRepository`'s
// real public method name/signature/return shape
// (`listClinicVets(clinicId): Promise<Array<{ id, name }>>`,
// `apps/api/src/modules/scheduling/availability.repository.ts`) exactly, so
// `ClinicVetRosterProvider` is exercised the same way it would be against
// the real repository -- only the Postgres call underneath is swapped out.
import { describe, it, expect, vi } from 'vitest';
import { ClinicVetRosterProvider } from '../services/onDutyRoster.service.js';
import type { AvailabilityRepository } from '../../scheduling/availability.repository.js';
import { weekdayIST, istMinutesOfDay } from '../../../lib/ist-date.js';

const CLINIC_ID = 'clinic_1';

/**
 * WR-5: per-vet override of the three availability tables
 * (`VetAvailabilityTemplate`/`AvailabilityOverride`/`BlockedPeriod`) that
 * `ClinicVetRosterProvider` must now consult. Any vet with no entry here
 * defaults to "on duty all day, every day" -- this keeps every pre-existing
 * roster-membership/admin-exclusion test above passing unchanged, since none
 * of them cares about real-time availability.
 */
interface FakeVetSchedule {
  templateDay?: { weekday: number; isClosed: boolean; openMinutes: number | null; closeMinutes: number | null } | null;
  override?: { isClosed: boolean; openMinutes: number | null; closeMinutes: number | null } | null;
  blockedPeriods?: Array<{ startMinutes: number; endMinutes: number }>;
}

function fakeAvailabilityRepository(
  vets: Array<{ id: string; name: string }>,
  adminIds: string[] = [],
  schedules: Record<string, FakeVetSchedule> = {},
) {
  return {
    listClinicVets: vi.fn(async (clinicId: string) => {
      // The real repository's own tenancy boundary (no DB-level RLS on this
      // table): only ever returns rows for the clinic actually asked for.
      if (clinicId !== CLINIC_ID) return [];
      return vets;
    }),
    listAdminUserIds: vi.fn(async (clinicId: string) => {
      if (clinicId !== CLINIC_ID) return [];
      return adminIds;
    }),
    getTemplateDay: vi.fn(async (_clinicId: string, vetId: string, weekday: number) => {
      const entry = schedules[vetId];
      if (entry && 'templateDay' in entry) return entry.templateDay ?? null;
      return { weekday, isClosed: false, openMinutes: 0, closeMinutes: 1440 };
    }),
    getOverride: vi.fn(async (_clinicId: string, vetId: string) => {
      return schedules[vetId]?.override ?? null;
    }),
    getBlockedPeriods: vi.fn(async (_clinicId: string, vetId: string) => {
      return schedules[vetId]?.blockedPeriods ?? [];
    }),
  } as unknown as AvailabilityRepository;
}

describe('ClinicVetRosterProvider.listOtherOnDutyClinicianIds (verify-fix 10.6, D-36)', () => {
  it('calls AvailabilityRepository.listClinicVets(clinicId) and returns every other clinic vet id', async () => {
    const repo = fakeAvailabilityRepository([
      { id: 'vet_a', name: 'Dr A' },
      { id: 'vet_b', name: 'Dr B' },
      { id: 'vet_c', name: 'Dr C' },
    ]);
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_a');

    expect(repo.listClinicVets).toHaveBeenCalledWith(CLINIC_ID);
    expect(result).toEqual(['vet_b', 'vet_c']);
  });

  it('excludes exactly the unreachable clinician, keeping every other id even if the excluded id is not first in the list', async () => {
    const repo = fakeAvailabilityRepository([
      { id: 'vet_a', name: 'Dr A' },
      { id: 'vet_b', name: 'Dr B' },
      { id: 'vet_c', name: 'Dr C' },
    ]);
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_b');

    expect(result).toEqual(['vet_a', 'vet_c']);
  });

  it('returns an empty list (never a fabricated candidate) when the excluded clinician is the only vet in the clinic', async () => {
    const repo = fakeAvailabilityRepository([{ id: 'vet_a', name: 'Dr A' }]);
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_a');

    expect(result).toEqual([]);
  });

  it('never falls back to a hardcoded id (e.g. an Admin) when the repository genuinely has nobody else -- returns empty, D-36 leaves the "no fallback" decision to the caller', async () => {
    const repo = fakeAvailabilityRepository([]);
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_a');

    expect(result).toEqual([]);
  });

  it('is scoped by clinicId -- a different clinic\'s roster never leaks in', async () => {
    const repo = fakeAvailabilityRepository([{ id: 'vet_a', name: 'Dr A' }]);
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds('clinic_other', 'someone_else');

    expect(repo.listClinicVets).toHaveBeenCalledWith('clinic_other');
    expect(result).toEqual([]);
  });

  it('excludes every Admin-role member from the roster, even one who also holds the Clinician role (D-36)', async () => {
    const repo = fakeAvailabilityRepository(
      [
        { id: 'vet_a', name: 'Dr A' },
        { id: 'admin_who_is_also_clinician', name: 'Dr Admin' },
        { id: 'vet_c', name: 'Dr C' },
      ],
      ['admin_who_is_also_clinician'],
    );
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_a');

    expect(repo.listAdminUserIds).toHaveBeenCalledWith(CLINIC_ID);
    expect(result).toEqual(['vet_c']);
  });

  it('returns an empty list (never falls back to Admin) when the only other on-duty vet is an Admin', async () => {
    const repo = fakeAvailabilityRepository(
      [
        { id: 'vet_a', name: 'Dr A' },
        { id: 'admin_only', name: 'Dr Admin' },
      ],
      ['admin_only'],
    );
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'vet_a');

    expect(result).toEqual([]);
  });
});

describe('ClinicVetRosterProvider.listOtherOnDutyClinicianIds -- real availability filtering (WR-5)', () => {
  // A fixed instant, injected as the optional `now` override -- production
  // callers never pass this (they get `new Date()`), but a deterministic
  // roster-vs-availability test cannot depend on whatever instant the test
  // happens to run at. `weekdayIST`/`istMinutesOfDay` (the same helpers
  // `AvailabilityService`/`AvailabilityRepository` use) derive the matching
  // weekday and minutes-of-day from it, exactly as production code would.
  const NOW = new Date('2026-08-19T06:00:00.000Z');
  const NOW_WEEKDAY = weekdayIST(NOW);
  const NOW_MINUTES = istMinutesOfDay(NOW);

  it('excludes a clinician on an active BlockedPeriod right now, keeping a genuinely on-shift clinician', async () => {
    const repo = fakeAvailabilityRepository(
      [
        { id: 'vet_on_shift', name: 'Dr On Shift' },
        { id: 'vet_blocked', name: 'Dr Blocked' },
      ],
      [],
      {
        vet_on_shift: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: false, openMinutes: 0, closeMinutes: 1440 },
          blockedPeriods: [],
        },
        vet_blocked: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: false, openMinutes: 0, closeMinutes: 1440 },
          blockedPeriods: [{ startMinutes: Math.max(NOW_MINUTES - 30, 0), endMinutes: NOW_MINUTES + 30 }],
        },
      },
    );
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'excluded_caller', NOW);

    expect(result).toEqual(['vet_on_shift']);
  });

  it('excludes a clinician whose weekly template has no coverage for the current day/time (e.g. a day off), even with no explicit block', async () => {
    const repo = fakeAvailabilityRepository(
      [
        { id: 'vet_on_shift', name: 'Dr On Shift' },
        { id: 'vet_off_today', name: 'Dr Off Today' },
      ],
      [],
      {
        vet_on_shift: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: false, openMinutes: 0, closeMinutes: 1440 },
        },
        vet_off_today: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: true, openMinutes: null, closeMinutes: null },
        },
      },
    );
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'excluded_caller', NOW);

    expect(result).toEqual(['vet_on_shift']);
  });

  it('excludes a clinician whose per-date override marks them off, even though their weekly template would otherwise cover now', async () => {
    const repo = fakeAvailabilityRepository(
      [
        { id: 'vet_on_shift', name: 'Dr On Shift' },
        { id: 'vet_override_off', name: 'Dr Override Off' },
      ],
      [],
      {
        vet_on_shift: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: false, openMinutes: 0, closeMinutes: 1440 },
        },
        vet_override_off: {
          templateDay: { weekday: NOW_WEEKDAY, isClosed: false, openMinutes: 0, closeMinutes: 1440 },
          override: { isClosed: true, openMinutes: null, closeMinutes: null },
        },
      },
    );
    const provider = new ClinicVetRosterProvider(repo);

    const result = await provider.listOtherOnDutyClinicianIds(CLINIC_ID, 'excluded_caller', NOW);

    expect(result).toEqual(['vet_on_shift']);
  });
});
