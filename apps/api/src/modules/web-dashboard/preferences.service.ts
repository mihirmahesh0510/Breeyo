import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { DASHBOARD_PANEL_ORDER, type DashboardPanelId } from '@breeyo/types';

/**
 * D-14: personal home configuration is bounded to *reordering* the fixed
 * panel set -- a user can move panels around, but the row itself is stored
 * (and returned) as a permutation of exactly `DASHBOARD_PANEL_ORDER`, never a
 * subset or superset. The zod boundary
 * (`packages/validators/src/web-dashboard.ts`'s `dashboardPanelOrderSchema`)
 * already enforces this on the way in; this service re-checks it on the way
 * out so a row that somehow predates that validator (or was edited directly)
 * can never surface a broken panel set to the browser.
 */
export class PreferencesService {
  constructor(private readonly db: TenantPrismaClient) {}

  async getPanelOrder(userId: string, clinicId: string): Promise<DashboardPanelId[]> {
    const preference = await this.db.userDashboardPreference.findFirst({
      where: { userId, clinicId },
    });

    const stored = (preference?.panelOrderJson as DashboardPanelId[] | undefined) ?? [];
    if (isValidPanelOrder(stored)) {
      return stored;
    }

    return [...DASHBOARD_PANEL_ORDER];
  }

  async updatePanelOrder(
    userId: string,
    clinicId: string,
    panelOrder: DashboardPanelId[],
  ): Promise<DashboardPanelId[]> {
    if (!isValidPanelOrder(panelOrder)) {
      throw new InvalidPanelOrderError();
    }

    const existing = await this.db.userDashboardPreference.findFirst({
      where: { userId, clinicId },
    });

    if (existing) {
      await this.db.userDashboardPreference.update({
        where: { id: existing.id },
        data: { panelOrderJson: panelOrder },
      });
    } else {
      await this.db.userDashboardPreference.create({
        data: { userId, clinicId, panelOrderJson: panelOrder },
      });
    }

    return panelOrder;
  }
}

export class InvalidPanelOrderError extends Error {
  constructor() {
    super('panelOrder must be a permutation of every core dashboard panel (D-14).');
    this.name = 'InvalidPanelOrderError';
  }
}

function isValidPanelOrder(order: unknown): order is DashboardPanelId[] {
  if (!Array.isArray(order) || order.length !== DASHBOARD_PANEL_ORDER.length) {
    return false;
  }
  const unique = new Set(order);
  if (unique.size !== DASHBOARD_PANEL_ORDER.length) {
    return false;
  }
  return DASHBOARD_PANEL_ORDER.every((panelId) => unique.has(panelId));
}
