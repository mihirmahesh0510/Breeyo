import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderSourceRepository } from '../reminders/reminder-source.repository.js';

/**
 * WHA-01 / D-01, D-02, Pitfall 3 — mock-prisma style mirrors
 * `emr/__tests__/emr.service.test.ts`: a plain object exposing only the
 * models this repository touches, each method a `vi.fn()`. Assertions
 * inspect the exact `where`/`orderBy` arguments so the latest-record-only
 * semantics are provable without a real database.
 */

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';
const PET_ID = 'pet-1';

function createMockPrisma() {
  return {
    consultation: {
      findMany: vi.fn(),
    },
    vaccinationRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    dewormingRecord: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    whatsAppMessage: {
      findMany: vi.fn(),
    },
  };
}

describe('ReminderSourceRepository.findFollowUpsDue (D-01)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: ReminderSourceRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new ReminderSourceRepository(prisma as any);
  });

  it('returns consultations whose followUpDate falls on one of the given dates, with pet and owner joined', async () => {
    const dates = [new Date('2026-08-13'), new Date('2026-08-14')];
    prisma.consultation.findMany.mockResolvedValue([
      {
        id: 'consult-1',
        clinicId: CLINIC_ID,
        petId: PET_ID,
        followUpDate: new Date('2026-08-14'),
        followUpReason: 'Recheck skin',
        pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
      },
    ]);

    const rows = await repo.findFollowUpsDue(CLINIC_ID, dates);

    expect(prisma.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: CLINIC_ID, followUpDate: { in: dates } }),
        include: expect.objectContaining({
          pet: expect.objectContaining({ include: expect.objectContaining({ owner: true }) }),
        }),
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      sourceType: 'CONSULTATION',
      sourceId: 'consult-1',
      sourceLabel: 'Recheck skin',
      dueDate: new Date('2026-08-14'),
    });
  });

  it('excludes consultations with a null followUpDate', async () => {
    prisma.consultation.findMany.mockResolvedValue([
      {
        id: 'consult-2',
        clinicId: CLINIC_ID,
        petId: PET_ID,
        followUpDate: null,
        followUpReason: null,
        pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
      },
    ]);

    const rows = await repo.findFollowUpsDue(CLINIC_ID, [new Date('2026-08-14')]);

    expect(rows).toHaveLength(0);
  });
});

describe('ReminderSourceRepository.findLatestVaccinationsDue (D-02, Pitfall 3)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: ReminderSourceRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new ReminderSourceRepository(prisma as any);
  });

  it('returns a record only when it is the LATEST VaccinationRecord for that (petId, vaccineName) by administeredAt', async () => {
    const olderRecord = {
      id: 'vacc-old',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      vaccineName: 'Rabies',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    const newerRecord = {
      id: 'vacc-new',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      vaccineName: 'Rabies',
      nextDueDate: new Date('2027-08-10'),
      administeredAt: new Date('2026-08-10'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };

    // Candidate window query returns only the OLDER record (its nextDueDate
    // matches the due window; the newer one's nextDueDate does not).
    prisma.vaccinationRecord.findMany.mockResolvedValue([olderRecord]);
    // But the latest-per-key check finds the NEWER record supersedes it.
    prisma.vaccinationRecord.findFirst.mockResolvedValue(newerRecord);

    const rows = await repo.findLatestVaccinationsDue(CLINIC_ID, [new Date('2026-08-13')]);

    expect(prisma.vaccinationRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: CLINIC_ID, petId: PET_ID, vaccineName: 'Rabies' }),
        orderBy: { administeredAt: 'desc' },
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('returns the record when it is the only (and therefore latest) record for that pet/vaccine', async () => {
    const onlyRecord = {
      id: 'vacc-1',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      vaccineName: 'Rabies',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    prisma.vaccinationRecord.findMany.mockResolvedValue([onlyRecord]);
    prisma.vaccinationRecord.findFirst.mockResolvedValue(onlyRecord);

    const rows = await repo.findLatestVaccinationsDue(CLINIC_ID, [new Date('2026-08-13')]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      petId: PET_ID,
      sourceType: 'VACCINATION_RECORD',
      sourceId: 'vacc-1',
      sourceLabel: 'Rabies',
      dueDate: new Date('2026-08-13'),
    });
  });

  it('distinguishes vaccines: a superseded Rabies record does not suppress a due Leptospirosis record for the same pet', async () => {
    const supersededRabies = {
      id: 'vacc-rabies-old',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      vaccineName: 'Rabies',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    const dueLepto = {
      id: 'vacc-lepto-1',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      vaccineName: 'Leptospirosis',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    prisma.vaccinationRecord.findMany.mockResolvedValue([supersededRabies, dueLepto]);
    prisma.vaccinationRecord.findFirst.mockImplementation(({ where }: any) => {
      if (where.vaccineName === 'Rabies') {
        return Promise.resolve({ ...supersededRabies, id: 'vacc-rabies-new', administeredAt: new Date('2026-08-01') });
      }
      return Promise.resolve(dueLepto);
    });

    const rows = await repo.findLatestVaccinationsDue(CLINIC_ID, [new Date('2026-08-13')]);

    expect(rows).toHaveLength(1);
    expect(rows[0].sourceLabel).toBe('Leptospirosis');
  });
});

describe('ReminderSourceRepository.findLatestDewormingDue (D-02, Pitfall 3)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: ReminderSourceRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new ReminderSourceRepository(prisma as any);
  });

  it('applies the same latest-per-pet rule with no vaccine-name dimension', async () => {
    const olderRecord = {
      id: 'deworm-old',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      drugName: 'Drontal',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    const newerRecord = { ...olderRecord, id: 'deworm-new', administeredAt: new Date('2026-08-01') };

    prisma.dewormingRecord.findMany.mockResolvedValue([olderRecord]);
    prisma.dewormingRecord.findFirst.mockResolvedValue(newerRecord);

    const rows = await repo.findLatestDewormingDue(CLINIC_ID, [new Date('2026-08-13')]);

    expect(prisma.dewormingRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: CLINIC_ID, petId: PET_ID }),
        orderBy: { administeredAt: 'desc' },
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it('returns the record when it is the latest deworming record for the pet', async () => {
    const onlyRecord = {
      id: 'deworm-1',
      clinicId: CLINIC_ID,
      petId: PET_ID,
      drugName: 'Drontal',
      nextDueDate: new Date('2026-08-13'),
      administeredAt: new Date('2025-08-13'),
      pet: { id: PET_ID, ownerId: OWNER_ID, owner: { id: OWNER_ID } },
    };
    prisma.dewormingRecord.findMany.mockResolvedValue([onlyRecord]);
    prisma.dewormingRecord.findFirst.mockResolvedValue(onlyRecord);

    const rows = await repo.findLatestDewormingDue(CLINIC_ID, [new Date('2026-08-13')]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceType: 'DEWORMING_RECORD',
      sourceId: 'deworm-1',
      petId: PET_ID,
      ownerId: OWNER_ID,
    });
  });
});

describe('ReminderSourceRepository clinicId scoping', () => {
  it('every discovery query filters by clinicId', async () => {
    const prisma = createMockPrisma();
    prisma.consultation.findMany.mockResolvedValue([]);
    prisma.vaccinationRecord.findMany.mockResolvedValue([]);
    prisma.dewormingRecord.findMany.mockResolvedValue([]);
    const repo = new ReminderSourceRepository(prisma as any);

    await repo.findFollowUpsDue(CLINIC_ID, [new Date('2026-08-14')]);
    await repo.findLatestVaccinationsDue(CLINIC_ID, [new Date('2026-08-14')]);
    await repo.findLatestDewormingDue(CLINIC_ID, [new Date('2026-08-14')]);

    expect(prisma.consultation.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: CLINIC_ID });
    expect(prisma.vaccinationRecord.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: CLINIC_ID });
    expect(prisma.dewormingRecord.findMany.mock.calls[0][0].where).toMatchObject({ clinicId: CLINIC_ID });
  });
});

describe('ReminderSourceRepository.findStrandedQueuedMessages', () => {
  it('returns WhatsAppMessage rows still QUEUED past the threshold', async () => {
    const prisma = createMockPrisma();
    prisma.whatsAppMessage.findMany.mockResolvedValue([{ id: 'msg-1', status: 'QUEUED' }]);
    const repo = new ReminderSourceRepository(prisma as any);

    const rows = await repo.findStrandedQueuedMessages(CLINIC_ID, 30);

    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: CLINIC_ID, status: 'QUEUED' }),
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it('scopes across all clinics when clinicId is null', async () => {
    const prisma = createMockPrisma();
    prisma.whatsAppMessage.findMany.mockResolvedValue([]);
    const repo = new ReminderSourceRepository(prisma as any);

    await repo.findStrandedQueuedMessages(null, 30);

    const where = prisma.whatsAppMessage.findMany.mock.calls[0][0].where;
    expect(where.clinicId).toBeUndefined();
    expect(where.status).toBe('QUEUED');
  });
});
