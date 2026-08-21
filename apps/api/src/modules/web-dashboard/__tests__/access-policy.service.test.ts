// Plan 09-02 Task 1: replaces the 09-01 Wave 0 scaffold (which only exercised
// the pure `@breeyo/types` contracts) with tests against the real,
// Prisma-backed `AccessPolicyService`. D-15 to D-21, D-83.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_BROWSER_ACCESS_BY_ROLE } from '@breeyo/types';
import {
  AccessPolicyService,
  ClinicianBrowserAccessError,
} from '../access-policy.service.js';

const CLINIC_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const ADMIN_USER_ID = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';
const MEMBER_ID = '9b6a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';

function makeDb() {
  return {
    clinicBrowserAccessPolicy: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    clinicMember: {
      findFirst: vi.fn(),
    },
  };
}

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    clinicId: CLINIC_ID,
    roleCode: 'FRONT_DESK',
    browserEnabled: false,
    queueEnabled: false,
    schedulingEnabled: false,
    billingEnabled: false,
    inventoryEnabled: false,
    inventoryWriteEnabled: false,
    usersEnabled: false,
    updatedByUserId: null,
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AccessPolicyService.getPolicy defaults (D-15, D-16, D-19)', () => {
  let db: ReturnType<typeof makeDb>;
  let service: AccessPolicyService;

  beforeEach(() => {
    db = makeDb();
    service = new AccessPolicyService(db as never);
  });

  it('returns the Admin default (fully enabled, inventoryWriteEnabled + usersEnabled true) when no row exists yet', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValue(null);

    const policy = await service.getPolicy(CLINIC_ID, 'ADMIN');

    expect(policy.browserEnabled).toBe(true);
    expect(policy.inventoryWriteEnabled).toBe(true);
    expect(policy.usersEnabled).toBe(true);
  });

  it('returns the Front Desk default (browser disabled until an admin configures it) when no row exists yet', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValue(null);

    const policy = await service.getPolicy(CLINIC_ID, 'FRONT_DESK');

    expect(policy.browserEnabled).toBe(false);
    expect(policy.inventoryWriteEnabled).toBe(false);
    expect(policy.usersEnabled).toBe(false);
  });

  it('returns the Clinician default (browser denied, no exception path) when no row exists yet', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValue(null);

    const policy = await service.getPolicy(CLINIC_ID, 'CLINICIAN');

    expect(policy.browserEnabled).toBe(false);
    expect(policy).toEqual(
      expect.objectContaining(DEFAULT_BROWSER_ACCESS_BY_ROLE.CLINICIAN),
    );
  });

  it('reads a persisted row over the role default once an Admin has changed it', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValue(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, queueEnabled: true, billingEnabled: true }),
    );

    const policy = await service.getPolicy(CLINIC_ID, 'FRONT_DESK');

    expect(policy.browserEnabled).toBe(true);
    expect(policy.queueEnabled).toBe(true);
    expect(policy.billingEnabled).toBe(true);
    expect(policy.schedulingEnabled).toBe(false);
  });
});

describe('AccessPolicyService.updatePolicy (D-19, D-21, D-22)', () => {
  let db: ReturnType<typeof makeDb>;
  let service: AccessPolicyService;

  beforeEach(() => {
    db = makeDb();
    service = new AccessPolicyService(db as never);
  });

  it('upserts keyed only by clinicId + roleCode, never by a per-user id', async () => {
    db.clinicBrowserAccessPolicy.upsert.mockResolvedValue(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, queueEnabled: true, updatedByUserId: ADMIN_USER_ID }),
    );

    await service.updatePolicy(CLINIC_ID, 'FRONT_DESK', { browserEnabled: true, queueEnabled: true }, ADMIN_USER_ID);

    expect(db.clinicBrowserAccessPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clinicId_roleCode: { clinicId: CLINIC_ID, roleCode: 'FRONT_DESK' } },
      }),
    );
  });

  it('rejects any attempt to enable browser access for Clinician (D-15: no exception path in Phase 9)', async () => {
    await expect(
      service.updatePolicy(CLINIC_ID, 'CLINICIAN', { browserEnabled: true }, ADMIN_USER_ID),
    ).rejects.toBeInstanceOf(ClinicianBrowserAccessError);

    expect(db.clinicBrowserAccessPolicy.upsert).not.toHaveBeenCalled();
  });

  it('defaults queue/scheduling/billing/inventory to true (but keeps inventoryWrite/users false) when an Admin enables browser access for Front Desk with no existing policy row (D-17, D-18, D-21)', async () => {
    // No row exists yet -- the create branch of the upsert must fall back to
    // DEFAULT_BROWSER_ACCESS_BY_ROLE.FRONT_DESK for every field the caller
    // didn't explicitly specify. Only `browserEnabled` is specified here.
    db.clinicBrowserAccessPolicy.upsert.mockImplementation(
      async ({ create }: { create: Record<string, unknown> }) => dbRow(create),
    );

    const policy = await service.updatePolicy(
      CLINIC_ID,
      'FRONT_DESK',
      { browserEnabled: true },
      ADMIN_USER_ID,
    );

    expect(policy.browserEnabled).toBe(true);
    expect(policy.queueEnabled).toBe(true);
    expect(policy.schedulingEnabled).toBe(true);
    expect(policy.billingEnabled).toBe(true);
    expect(policy.inventoryEnabled).toBe(true);
    expect(policy.inventoryWriteEnabled).toBe(false);
    expect(policy.usersEnabled).toBe(false);
  });
});

describe('AccessPolicyService role resolution (D-19)', () => {
  let db: ReturnType<typeof makeDb>;
  let service: AccessPolicyService;

  beforeEach(() => {
    db = makeDb();
    service = new AccessPolicyService(db as never);
  });

  it('maps the Admin role name to the ADMIN browser role code', () => {
    expect(service.resolveRoleCode(['Admin'])).toBe('ADMIN');
  });

  it('maps FrontDesk to FRONT_DESK and Clinician to CLINICIAN', () => {
    expect(service.resolveRoleCode(['FrontDesk'])).toBe('FRONT_DESK');
    expect(service.resolveRoleCode(['Clinician'])).toBe('CLINICIAN');
  });

  it('picks the highest-privilege browser role when a member holds several roles', () => {
    expect(service.resolveRoleCode(['Clinician', 'Admin'])).toBe('ADMIN');
    expect(service.resolveRoleCode(['Clinician', 'FrontDesk'])).toBe('FRONT_DESK');
  });

  it('returns null when none of the member roles map to a browser role', () => {
    expect(service.resolveRoleCode(['InventoryManager'])).toBeNull();
  });

  it('getVisibleModulesForUser returns an empty list for a user with no browser-eligible role', async () => {
    db.clinicMember.findFirst.mockResolvedValue({
      id: MEMBER_ID,
      roles: [{ role: { name: 'InventoryManager' } }],
    });

    const modules = await service.getVisibleModulesForUser(CLINIC_ID, ADMIN_USER_ID);

    expect(modules).toEqual([]);
    expect(db.clinicBrowserAccessPolicy.findUnique).not.toHaveBeenCalled();
  });
});

describe('AccessPolicyService mid-session revocation (D-83)', () => {
  let db: ReturnType<typeof makeDb>;
  let service: AccessPolicyService;

  beforeEach(() => {
    db = makeDb();
    service = new AccessPolicyService(db as never);
    db.clinicMember.findFirst.mockResolvedValue({
      id: MEMBER_ID,
      roles: [{ role: { name: 'FrontDesk' } }],
    });
  });

  it('re-queries the database on every call and never serves a cached snapshot', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, usersEnabled: false, billingEnabled: true }),
    );

    await service.getPolicy(CLINIC_ID, 'FRONT_DESK');

    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: false }),
    );

    await service.getPolicy(CLINIC_ID, 'FRONT_DESK');

    expect(db.clinicBrowserAccessPolicy.findUnique).toHaveBeenCalledTimes(2);
  });

  it('denies/hides a module on the very next request after an Admin disables it mid-session, with no re-login required', async () => {
    // Request 1: Front Desk still has billing enabled from an earlier admin change.
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, billingEnabled: true, queueEnabled: true }),
    );
    const firstRequestModules = await service.getVisibleModulesForUser(CLINIC_ID, ADMIN_USER_ID);
    expect(firstRequestModules).toContain('BILLING');

    // Request 2: same still-logged-in user, same session -- an Admin has since
    // toggled billing off. No new login happened between these two calls.
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, billingEnabled: false, queueEnabled: true }),
    );
    const secondRequestModules = await service.getVisibleModulesForUser(CLINIC_ID, ADMIN_USER_ID);

    expect(secondRequestModules).not.toContain('BILLING');
    expect(secondRequestModules).toContain('QUEUE');
  });

  it('hides every module on the very next request after browser access itself is revoked mid-session', async () => {
    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: true, queueEnabled: true, billingEnabled: true }),
    );
    expect(await service.getVisibleModulesForUser(CLINIC_ID, ADMIN_USER_ID)).not.toEqual([]);

    db.clinicBrowserAccessPolicy.findUnique.mockResolvedValueOnce(
      dbRow({ roleCode: 'FRONT_DESK', browserEnabled: false }),
    );
    expect(await service.getVisibleModulesForUser(CLINIC_ID, ADMIN_USER_ID)).toEqual([]);
  });
});
