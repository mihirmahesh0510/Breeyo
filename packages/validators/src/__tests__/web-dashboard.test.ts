import { describe, it, expect } from 'vitest';
import {
  browserAccessPolicySchema,
  dashboardPanelOrderSchema,
  cockpitResponseSchema,
  staleStateEnvelopeSchema,
} from '../web-dashboard.js';
import {
  DASHBOARD_PANEL_ORDER,
  DEFAULT_BROWSER_ACCESS_BY_ROLE,
  getVisibleModules,
} from '@breeyo/types';

const CLINIC_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const USER_ID = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';

function validPolicy(overrides: Record<string, unknown> = {}) {
  return {
    clinicId: CLINIC_ID,
    roleCode: 'ADMIN',
    browserEnabled: true,
    queueEnabled: true,
    schedulingEnabled: true,
    billingEnabled: true,
    inventoryEnabled: true,
    inventoryWriteEnabled: true,
    usersEnabled: true,
    updatedByUserId: USER_ID,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('browserAccessPolicySchema', () => {
  it('accepts a fully-specified access policy for a valid role', () => {
    const result = browserAccessPolicySchema.safeParse(validPolicy());
    expect(result.success).toBe(true);
  });

  it('rejects an unknown roleCode outside ADMIN | FRONT_DESK | CLINICIAN', () => {
    const result = browserAccessPolicySchema.safeParse(validPolicy({ roleCode: 'SUPERADMIN' }));
    expect(result.success).toBe(false);
  });

  it('rejects a policy missing clinicId', () => {
    const { clinicId, ...rest } = validPolicy();
    const result = browserAccessPolicySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('DEFAULT_BROWSER_ACCESS_BY_ROLE (D-15, D-16, D-19)', () => {
  it('enables browser access for ADMIN by default', () => {
    expect(DEFAULT_BROWSER_ACCESS_BY_ROLE.ADMIN.browserEnabled).toBe(true);
    expect(DEFAULT_BROWSER_ACCESS_BY_ROLE.ADMIN.usersEnabled).toBe(true);
  });

  it('disables browser access for FRONT_DESK until an admin configures it', () => {
    expect(DEFAULT_BROWSER_ACCESS_BY_ROLE.FRONT_DESK.browserEnabled).toBe(false);
  });

  it('denies browser access for CLINICIAN entirely in Phase 9', () => {
    expect(DEFAULT_BROWSER_ACCESS_BY_ROLE.CLINICIAN.browserEnabled).toBe(false);
    expect(DEFAULT_BROWSER_ACCESS_BY_ROLE.CLINICIAN.queueEnabled).toBe(false);
  });
});

describe('getVisibleModules (D-20: hidden, not locked)', () => {
  it('returns only enabled modules for a Front-Desk policy with billing and queue on', () => {
    const policy = validPolicy({
      roleCode: 'FRONT_DESK',
      browserEnabled: true,
      queueEnabled: true,
      billingEnabled: true,
      schedulingEnabled: false,
      inventoryEnabled: true,
      inventoryWriteEnabled: false,
      usersEnabled: false,
    });
    const modules = getVisibleModules(policy as never);
    expect(modules).toContain('QUEUE');
    expect(modules).toContain('BILLING');
    expect(modules).toContain('INVENTORY');
    expect(modules).not.toContain('SCHEDULING');
    expect(modules).not.toContain('USERS');
    expect(modules).not.toContain('INVENTORY_WRITE');
  });

  it('returns an empty module list when browserEnabled is false, regardless of sub-toggles', () => {
    const policy = validPolicy({ roleCode: 'CLINICIAN', browserEnabled: false, queueEnabled: true });
    expect(getVisibleModules(policy as never)).toEqual([]);
  });
});

describe('dashboardPanelOrderSchema (D-06, D-11, D-12, D-13, D-14)', () => {
  it('accepts the locked default panel order', () => {
    const result = dashboardPanelOrderSchema.safeParse({ panelOrder: [...DASHBOARD_PANEL_ORDER] });
    expect(result.success).toBe(true);
  });

  it('accepts a user-reordered permutation of the same panel set', () => {
    const reordered = [...DASHBOARD_PANEL_ORDER].reverse();
    const result = dashboardPanelOrderSchema.safeParse({ panelOrder: reordered });
    expect(result.success).toBe(true);
  });

  it('rejects a panel order that drops a core panel (D-14: cannot remove core panels)', () => {
    const missingAlerts = DASHBOARD_PANEL_ORDER.filter((p) => p !== 'ALERTS');
    const result = dashboardPanelOrderSchema.safeParse({ panelOrder: missingAlerts });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown panel id', () => {
    const result = dashboardPanelOrderSchema.safeParse({
      panelOrder: [...DASHBOARD_PANEL_ORDER, 'ANALYTICS'],
    });
    expect(result.success).toBe(false);
  });
});

describe('cockpitResponseSchema', () => {
  it('accepts a cockpit payload with ordered panels and quick actions', () => {
    const result = cockpitResponseSchema.safeParse({
      panelOrder: [...DASHBOARD_PANEL_ORDER],
      panels: [
        {
          panelId: 'ALERTS',
          title: 'Alerts',
          itemCount: 2,
          quickActions: [{ actionId: 'view-alerts', label: 'View alerts', href: '/alerts' }],
        },
      ],
      generatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe('staleStateEnvelopeSchema (D-40)', () => {
  it('accepts a fresh envelope', () => {
    const result = staleStateEnvelopeSchema.safeParse({
      status: 'fresh',
      serverUpdatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a stale envelope carrying the client-known timestamp', () => {
    const result = staleStateEnvelopeSchema.safeParse({
      status: 'stale',
      serverUpdatedAt: new Date().toISOString(),
      clientKnownUpdatedAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = staleStateEnvelopeSchema.safeParse({
      status: 'unknown',
      serverUpdatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
