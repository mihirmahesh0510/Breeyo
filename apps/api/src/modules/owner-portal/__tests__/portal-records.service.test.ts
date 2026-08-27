// Plan 09-05 Task 1: OWN-01, D-73 to D-77 — read-only diagnosis + prescription
// projection, no clinician-only fields. Mocked `TenantPrismaClient` collaborator
// (`invoice.service.test.ts` style), no real DB.
import { describe, it, expect, vi } from 'vitest';
import { AccessScopeService, type OwnerPortalTokenScope } from '../access-scope.service.js';
import { PortalRecordsService } from '../portal-records.service.js';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const LINK_ID = '33333333-3333-4333-8333-333333333333';
const PET_1 = '44444444-4444-4444-8444-444444444444';
const PET_OUT_OF_SCOPE = '55555555-5555-4555-8555-555555555555';
const VISIT_1 = '66666666-6666-4666-8666-666666666666';
const RX_1 = '77777777-7777-4777-8777-777777777777';

function scope(overrides: Partial<OwnerPortalTokenScope> = {}): OwnerPortalTokenScope {
  return {
    magicLinkId: LINK_ID,
    clinicId: CLINIC,
    ownerId: OWNER,
    defaultTab: 'OVERVIEW',
    deepLinkType: null,
    deepLinkEntityId: null,
    expiresAt: new Date('2026-08-08T00:00:00.000Z'),
    ...overrides,
  };
}

// WR-9: pet-scope is now a LIVE `pet.findFirst` query by (ownerId, clinicId),
// never a frozen allow-list — `buildDb` mocks that query directly.
function buildDb(consultations: unknown[] = [], pet: unknown = { id: PET_1 }) {
  return {
    pet: {
      findFirst: vi.fn().mockResolvedValue(pet),
    },
    consultation: {
      findMany: vi.fn().mockResolvedValue(consultations),
    },
  };
}

describe('PortalRecordsService — pet-scope enforcement (OWN-06, T-09-14)', () => {
  it('refuses to query and returns null for a petId outside the allowed scope', async () => {
    const db = buildDb([], null);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    const result = await service.getRecords(scope(), PET_OUT_OF_SCOPE);

    expect(result).toBeNull();
    expect(db.consultation.findMany).not.toHaveBeenCalled();
  });

  it('treats a pet added to the owner AFTER the link was issued as in scope, with no reissue required (WR-9)', async () => {
    // The frozen-snapshot bug this regression-tests: pre-fix, a pet created
    // after issuance would never appear in `scope.allowedPetIds` for the
    // life of the link. The live query below has no such snapshot to be
    // stale against.
    const NEW_PET = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const db = buildDb([], { id: NEW_PET });
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    const result = await service.getRecords(scope(), NEW_PET);

    expect(result).not.toBeNull();
    expect(db.pet.findFirst).toHaveBeenCalledWith({
      where: { id: NEW_PET, ownerId: OWNER, clinicId: CLINIC },
      select: { id: true },
    });
  });
});

describe('PortalRecordsService — diagnosis + prescription projection (OWN-01, D-73 to D-77)', () => {
  it('queries only finalized consultations for the requested pet', async () => {
    const db = buildDb([]);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    await service.getRecords(scope(), PET_1);

    const args = db.consultation.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ petId: PET_1, status: 'finalized' });
  });

  it('never selects clinician-only SOAP or internal-note fields', async () => {
    const db = buildDb([]);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    await service.getRecords(scope(), PET_1);

    const args = db.consultation.findMany.mock.calls[0][0];
    const select = args.select ?? {};
    for (const forbidden of [
      'subjective',
      'objective',
      'plan',
      'rxNotes',
      'careInstructions',
      'referral',
      'addenda',
    ]) {
      expect(select[forbidden]).toBeFalsy();
    }
  });

  it('maps a visit to diagnosis text, an owner-friendly gloss, and a humanized visit reason', async () => {
    const db = buildDb([
      {
        id: VISIT_1,
        startedAt: new Date('2026-07-01T10:00:00.000Z'),
        assessment: 'Suspected URI, mild fever',
        visitType: 'follow_up',
        prescriptions: [],
      },
    ]);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    const result = await service.getRecords(scope(), PET_1);

    expect(result?.visits).toHaveLength(1);
    const visit = result!.visits[0];
    expect(visit.visitId).toBe(VISIT_1);
    expect(visit.diagnosisText).toBe('Suspected URI, mild fever');
    expect(visit.diagnosisGloss).toMatch(/respiratory/i);
    expect(visit.visitReason).toMatch(/follow up visit/i);
  });

  it('returns null diagnosisGloss when no glossary term is recognized', async () => {
    const db = buildDb([
      {
        id: VISIT_1,
        startedAt: new Date('2026-07-01T10:00:00.000Z'),
        assessment: 'Routine wellness check, no findings',
        visitType: 'general',
        prescriptions: [],
      },
    ]);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    const result = await service.getRecords(scope(), PET_1);

    expect(result?.visits[0].diagnosisGloss).toBeNull();
  });

  it('renders prescriptions as owner-friendly usage cards, never clinician-only instructions', async () => {
    const db = buildDb([
      {
        id: VISIT_1,
        startedAt: new Date('2026-07-01T10:00:00.000Z'),
        assessment: null,
        visitType: 'general',
        prescriptions: [
          {
            id: RX_1,
            drugName: 'Amoxicillin',
            dosage: '250mg',
            route: 'oral',
            frequency: 'twice daily',
            duration: '7 days',
            ownerInstructions: 'Give with food, morning and evening.',
            clinicalInstructions: 'Monitor for GI upset; discontinue if rash.',
          },
        ],
      },
    ]);
    const service = new PortalRecordsService(db as never, new AccessScopeService());

    const result = await service.getRecords(scope(), PET_1);
    const [card] = result!.visits[0].prescriptions;

    expect(card.prescriptionId).toBe(RX_1);
    expect(card.drugName).toBe('Amoxicillin');
    expect(card.usageInstruction).toContain('250mg');
    expect(card.usageInstruction).toContain('oral');
    expect(card.usageInstruction).toContain('twice daily');
    expect(card.usageInstruction).toContain('7 days');
    expect(card.plainLanguageGloss).toBe('Give with food, morning and evening.');
    expect(JSON.stringify(card)).not.toContain('Monitor for GI upset');
  });
});
