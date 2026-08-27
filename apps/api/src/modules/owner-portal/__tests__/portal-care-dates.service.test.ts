// Plan 09-07 Task 1: OWN-07 — upcoming care dates (vaccination due,
// deworming due, next appointment) projected into the owner portal, scoped
// by the same validated magic-link token every other portal service uses.
//
// Deviation flagged in 09-07-SUMMARY.md: the plan's <interfaces> section
// describes `Appointment` as having `petId`, `staffId`, `scheduledAt`, and
// an `AppointmentStatus` of CONFIRMED/EXPECTED/ARRIVED/IN_CONSULT/etc. The
// real Phase 8 schema (apps/api/prisma/schema.prisma) has none of that: pets
// attach via the `AppointmentPet` join table (`pets: { some: { petId } }`),
// the vet relation is `vetId`/`vet.fullName` (not `staffId`/staffName), the
// time column is `scheduledFor` (not `scheduledAt`), and
// `AppointmentStatus` is only SCHEDULED / CHECKED_IN / COMPLETED /
// CANCELLED / NO_SHOW — there is no CONFIRMED or EXPECTED value. This test
// (and the service under test) is written against the real schema:
// "next scheduled appointment" == status SCHEDULED, scheduledFor in the
// future. There is also no `reasonCode`/`reasonLabel` column; `reason` is
// projected from `serviceCatalog.name`, falling back to "Visit" (matching
// the existing web-dashboard schedule UI's `AppointmentBlock.tsx` /
// `AppointmentDrawer.tsx` fallback convention), never from the vet's
// internal `notes` free-text field.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalCareDatesService } from '../portal-care-dates.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_OUT_OF_SCOPE = '55555555-5555-4555-8555-555555555555';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    ...overrides,
  };
}

// WR-9: pet-scope is now a LIVE `pet.findFirst` query by (ownerId, clinicId).
function buildDb(appointment: unknown = null, pet: unknown = { id: PET_1 }) {
  return {
    pet: {
      findFirst: vi.fn().mockResolvedValue(pet),
    },
    appointment: {
      findFirst: vi.fn().mockResolvedValue(appointment),
    },
  };
}

function buildVaccinationRepository(
  vaccinationRecords: unknown[] = [],
  latestDeworming: unknown = null,
) {
  return {
    getVaccinationRecords: vi.fn().mockResolvedValue(vaccinationRecords),
    getLatestDeworming: vi.fn().mockResolvedValue(latestDeworming),
  };
}

describe('PortalCareDatesService — pet-scope enforcement (OWN-06, T-09-20)', () => {
  it('returns null and never queries vaccination, deworming, or appointment data for a petId outside scope', async () => {
    const db = buildDb(null, null);
    const vaccinationRepository = buildVaccinationRepository();
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_OUT_OF_SCOPE);

    expect(result).toBeNull();
    expect(vaccinationRepository.getVaccinationRecords).not.toHaveBeenCalled();
    expect(vaccinationRepository.getLatestDeworming).not.toHaveBeenCalled();
    expect(db.appointment.findFirst).not.toHaveBeenCalled();
  });

  it('treats a pet added to the owner AFTER the link was issued as in scope, with no reissue required (WR-9)', async () => {
    const NEW_PET = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const db = buildDb(null, { id: NEW_PET });
    const vaccinationRepository = buildVaccinationRepository();
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), NEW_PET, NOW);

    expect(result).not.toBeNull();
    expect(db.pet.findFirst).toHaveBeenCalledWith({
      where: { id: NEW_PET, ownerId: OWNER, clinicId: CLINIC },
      select: { id: true },
    });
  });
});

describe('PortalCareDatesService — vaccination projection and nextVaccinationDue status classification', () => {
  it('returns vaccine name and nextVaccinationDue date for an upcoming (>7 days out) vaccination', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([
      { vaccineName: 'Rabies', nextDueDate: new Date('2026-09-20T00:00:00.000Z') },
    ]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([
      { vaccineName: 'Rabies', nextDueDate: '2026-09-20T00:00:00.000Z', status: 'upcoming' },
    ]);
  });

  it('classifies a past nextVaccinationDue as overdue', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([
      { vaccineName: 'Rabies', nextDueDate: new Date('2026-08-01T00:00:00.000Z') },
    ]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([
      { vaccineName: 'Rabies', nextDueDate: '2026-08-01T00:00:00.000Z', status: 'overdue' },
    ]);
  });

  it('classifies a nextVaccinationDue within 7 days as dueSoon', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([
      { vaccineName: 'DHPPi Booster', nextDueDate: new Date('2026-08-24T00:00:00.000Z') },
    ]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([
      { vaccineName: 'DHPPi Booster', nextDueDate: '2026-08-24T00:00:00.000Z', status: 'dueSoon' },
    ]);
  });

  it('returns an empty vaccinations array when the pet has no vaccination records', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([]);
  });

  it('excludes vaccination records with a null nextDueDate and sorts the remainder ascending', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([
      { vaccineName: 'Rabies', nextDueDate: new Date('2026-08-01T00:00:00.000Z') },
      { vaccineName: 'Undated legacy record', nextDueDate: null },
      { vaccineName: 'DHPPi Booster', nextDueDate: new Date('2026-08-24T00:00:00.000Z') },
    ]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([
      { vaccineName: 'Rabies', nextDueDate: '2026-08-01T00:00:00.000Z', status: 'overdue' },
      { vaccineName: 'DHPPi Booster', nextDueDate: '2026-08-24T00:00:00.000Z', status: 'dueSoon' },
    ]);
  });

  it('has both an overdue and an upcoming vaccination in the same mixed result, each with the correct status', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([
      { vaccineName: 'Rabies', nextDueDate: new Date('2026-07-01T00:00:00.000Z') },
      { vaccineName: 'Leptospirosis', nextDueDate: new Date('2026-12-01T00:00:00.000Z') },
    ]);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.vaccinations).toEqual([
      { vaccineName: 'Rabies', nextDueDate: '2026-07-01T00:00:00.000Z', status: 'overdue' },
      { vaccineName: 'Leptospirosis', nextDueDate: '2026-12-01T00:00:00.000Z', status: 'upcoming' },
    ]);
  });
});

describe('PortalCareDatesService — deworming projection', () => {
  it('returns the drug name and next due date from the latest deworming record', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([], {
      drugName: 'Fenbendazole',
      nextDueDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.deworming).toEqual({
      drugName: 'Fenbendazole',
      nextDueDate: '2026-09-01T00:00:00.000Z',
      status: 'upcoming',
    });
  });

  it('returns null deworming when there is no deworming record for the pet', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([], null);
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.deworming).toBeNull();
  });

  it('returns null deworming when the latest deworming record has no next due date', async () => {
    const db = buildDb();
    const vaccinationRepository = buildVaccinationRepository([], {
      drugName: 'Fenbendazole',
      nextDueDate: null,
    });
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.deworming).toBeNull();
  });
});

describe('PortalCareDatesService — next appointment projection', () => {
  it('returns the next SCHEDULED, future appointment with reason and staff name', async () => {
    const db = buildDb({
      scheduledFor: new Date('2026-09-05T04:30:00.000Z'),
      vet: { fullName: 'Dr. Asha Rao' },
      serviceCatalog: { name: 'Annual checkup' },
    });
    const vaccinationRepository = buildVaccinationRepository();
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.nextAppointment).toEqual({
      scheduledAt: '2026-09-05T04:30:00.000Z',
      reason: 'Annual checkup',
      staffName: 'Dr. Asha Rao',
    });

    const args = db.appointment.findFirst.mock.calls[0][0];
    expect(args.where.status).toBe('SCHEDULED');
    expect(args.where.pets).toEqual({ some: { petId: PET_1 } });
    expect(args.orderBy).toEqual({ scheduledFor: 'asc' });
  });

  it('falls back to "Visit" as the reason when the appointment has no service catalog entry', async () => {
    const db = buildDb({
      scheduledFor: new Date('2026-09-05T04:30:00.000Z'),
      vet: { fullName: 'Dr. Asha Rao' },
      serviceCatalog: null,
    });
    const vaccinationRepository = buildVaccinationRepository();
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.nextAppointment?.reason).toBe('Visit');
  });

  it('returns null nextAppointment when there is no future SCHEDULED appointment for the pet', async () => {
    const db = buildDb(null);
    const vaccinationRepository = buildVaccinationRepository();
    const service = new PortalCareDatesService(db as never, new AccessScopeService(), vaccinationRepository as never);

    const result = await service.getCareDates(scope(), PET_1, NOW);

    expect(result?.nextAppointment).toBeNull();
  });
});
