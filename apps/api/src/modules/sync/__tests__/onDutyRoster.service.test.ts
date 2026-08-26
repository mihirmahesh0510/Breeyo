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

const CLINIC_ID = 'clinic_1';

function fakeAvailabilityRepository(vets: Array<{ id: string; name: string }>) {
  return {
    listClinicVets: vi.fn(async (clinicId: string) => {
      // The real repository's own tenancy boundary (no DB-level RLS on this
      // table): only ever returns rows for the clinic actually asked for.
      if (clinicId !== CLINIC_ID) return [];
      return vets;
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
});
