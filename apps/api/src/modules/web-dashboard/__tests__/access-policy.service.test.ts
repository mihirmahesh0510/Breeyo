// Wave 0 scaffold (09-01-PLAN.md Task 1): exercises the shared browser-access
// contracts from `@breeyo/shared/web-dashboard` that a later plan (09-02)
// wires into an actual Prisma-backed `access-policy.service.ts`. No DB
// access happens here — Task 3 (blocking schema push) has not run yet, so
// anything requiring a generated Prisma client must wait for 09-02.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BROWSER_ACCESS_BY_ROLE,
  getVisibleModules,
  browserAccessPolicySchema,
  type ClinicBrowserAccessPolicy,
} from '@breeyo/shared/web-dashboard';

const CLINIC_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const ADMIN_USER_ID = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';

function policyFor(roleCode: 'ADMIN' | 'FRONT_DESK' | 'CLINICIAN'): ClinicBrowserAccessPolicy {
  return {
    ...DEFAULT_BROWSER_ACCESS_BY_ROLE[roleCode],
    clinicId: CLINIC_ID,
    updatedByUserId: ADMIN_USER_ID,
    updatedAt: new Date().toISOString(),
  };
}

describe('access-policy defaults (D-15, D-16, D-19)', () => {
  it('grants Admin full browser access by default', () => {
    const policy = policyFor('ADMIN');
    expect(browserAccessPolicySchema.safeParse(policy).success).toBe(true);
    expect(policy.browserEnabled).toBe(true);
    expect(policy.usersEnabled).toBe(true);
  });

  it('leaves Front Desk browser access disabled until an admin configures it', () => {
    const policy = policyFor('FRONT_DESK');
    expect(policy.browserEnabled).toBe(false);
  });

  it('denies Clinician browser access entirely in Phase 9', () => {
    const policy = policyFor('CLINICIAN');
    expect(policy.browserEnabled).toBe(false);
    expect(getVisibleModules(policy)).toEqual([]);
  });
});

describe('hidden-module semantics (D-20)', () => {
  it('omits disabled modules from the visible list rather than flagging them locked', () => {
    const policy = policyFor('FRONT_DESK');
    policy.browserEnabled = true;
    policy.queueEnabled = true;
    policy.billingEnabled = true;
    policy.schedulingEnabled = false;
    policy.usersEnabled = false;

    const visible = getVisibleModules(policy);

    expect(visible).toContain('QUEUE');
    expect(visible).toContain('BILLING');
    expect(visible).not.toContain('SCHEDULING');
    expect(visible).not.toContain('USERS');
  });

  it('keeps User Management and inventory-write Admin-only even when Front Desk billing is enabled (D-21, D-22)', () => {
    const policy = policyFor('FRONT_DESK');
    policy.browserEnabled = true;
    policy.billingEnabled = true;
    // Front Desk never gets these two regardless of admin toggles in Phase 9.
    policy.usersEnabled = false;
    policy.inventoryWriteEnabled = false;

    const visible = getVisibleModules(policy);

    expect(visible).not.toContain('USERS');
    expect(visible).not.toContain('INVENTORY_WRITE');
  });
});
