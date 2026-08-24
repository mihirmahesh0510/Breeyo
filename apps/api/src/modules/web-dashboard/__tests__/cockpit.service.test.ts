// Plan 09-02 Task 1: the cockpit aggregation service. D-01, D-03, D-06 to
// D-08, D-11 to D-13, D-18, D-20, D-83.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DASHBOARD_PANEL_ORDER, type BrowserModuleCode } from '@breeyo/types';
import { CockpitService } from '../cockpit.service.js';

const CLINIC_ID = '3f1d6a2e-8c4b-4d7a-9e21-5b8f0c3a7d64';
const USER_ID = '7a2c9d1b-4e63-4f80-b5a7-1c9e6d0f2a38';

function makeDb() {
  return {
    queueEntry: { count: vi.fn().mockResolvedValue(0) },
    appointment: { count: vi.fn().mockResolvedValue(0) },
    invoice: { count: vi.fn().mockResolvedValue(0) },
    inventoryItem: { count: vi.fn().mockResolvedValue(0) },
    clinicMember: { count: vi.fn().mockResolvedValue(0) },
    whatsAppMessage: { count: vi.fn().mockResolvedValue(0) },
    $queryRaw: vi.fn().mockResolvedValue([{ count: 0n }]),
  };
}

function makeAccessPolicyService(visibleModules: BrowserModuleCode[]) {
  return { getVisibleModulesForUser: vi.fn().mockResolvedValue(visibleModules) };
}

const ALL_MODULES: BrowserModuleCode[] = [
  'QUEUE',
  'SCHEDULING',
  'BILLING',
  'INVENTORY',
  'INVENTORY_WRITE',
  'USERS',
];

describe('CockpitService.getCockpit ordering (D-06, D-11 to D-13)', () => {
  it('returns every panel in the exact locked scroll order for a fully authorized (Admin) user', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService(ALL_MODULES);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);

    expect(cockpit.panelOrder).toEqual([...DASHBOARD_PANEL_ORDER]);
    expect(cockpit.panels.map((p) => p.panelId)).toEqual([...DASHBOARD_PANEL_ORDER]);
  });

  it('puts ALERTS first regardless of which modules are authorized (D-06 exception-first)', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService(['QUEUE']);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);

    expect(cockpit.panels[0].panelId).toBe('ALERTS');
  });

  it('always includes OWNER_EXCEPTIONS as the last panel, even with no module access (D-12, D-13)', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService([]);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);

    expect(cockpit.panels.map((p) => p.panelId)).toEqual(['ALERTS', 'OWNER_EXCEPTIONS']);
  });
});

describe('CockpitService hidden-module semantics (D-20)', () => {
  it('omits the USERS panel entirely for a Front Desk user without usersEnabled', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService(['QUEUE', 'BILLING', 'SCHEDULING', 'INVENTORY']);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);

    expect(cockpit.panels.map((p) => p.panelId)).not.toContain('USERS');
  });

  it('keeps Front Desk inventory view-only: no write/adjust quick action when INVENTORY_WRITE is not granted (D-18)', async () => {
    const db = makeDb();
    const frontDeskAccess = makeAccessPolicyService(['QUEUE', 'BILLING', 'SCHEDULING', 'INVENTORY']);
    const frontDeskService = new CockpitService(db as never, frontDeskAccess as never);

    const adminAccess = makeAccessPolicyService(ALL_MODULES);
    const adminService = new CockpitService(db as never, adminAccess as never);

    const frontDeskCockpit = await frontDeskService.getCockpit(CLINIC_ID, USER_ID);
    const adminCockpit = await adminService.getCockpit(CLINIC_ID, USER_ID);

    const frontDeskInventoryPanel = frontDeskCockpit.panels.find((p) => p.panelId === 'INVENTORY')!;
    const adminInventoryPanel = adminCockpit.panels.find((p) => p.panelId === 'INVENTORY')!;

    expect(frontDeskInventoryPanel.quickActions.some((a) => /adjust/i.test(a.actionId))).toBe(false);
    expect(adminInventoryPanel.quickActions.some((a) => /adjust/i.test(a.actionId))).toBe(true);
  });
});

describe('CockpitService quick actions (D-03, D-08)', () => {
  it('gives every returned panel at least one quick action', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService(ALL_MODULES);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);

    for (const panel of cockpit.panels) {
      expect(panel.quickActions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives the USERS panel an access-review quick action, Admin-only (D-21)', async () => {
    const db = makeDb();
    const accessPolicyService = makeAccessPolicyService(ALL_MODULES);
    const service = new CockpitService(db as never, accessPolicyService as never);

    const cockpit = await service.getCockpit(CLINIC_ID, USER_ID);
    const usersPanel = cockpit.panels.find((p) => p.panelId === 'USERS')!;

    expect(usersPanel.quickActions.some((a) => /access/i.test(a.label))).toBe(true);
  });
});

describe('CockpitService mid-session revocation (D-83)', () => {
  it('drops a revoked module from the very next cockpit request, with no caching inside the service', async () => {
    const db = makeDb();
    const accessPolicyService = {
      getVisibleModulesForUser: vi
        .fn()
        .mockResolvedValueOnce(['QUEUE', 'BILLING', 'USERS'])
        .mockResolvedValueOnce(['QUEUE', 'BILLING']),
    };
    const service = new CockpitService(db as never, accessPolicyService as never);

    const first = await service.getCockpit(CLINIC_ID, USER_ID);
    expect(first.panels.map((p) => p.panelId)).toContain('USERS');

    const second = await service.getCockpit(CLINIC_ID, USER_ID);
    expect(second.panels.map((p) => p.panelId)).not.toContain('USERS');

    expect(accessPolicyService.getVisibleModulesForUser).toHaveBeenCalledTimes(2);
  });
});
