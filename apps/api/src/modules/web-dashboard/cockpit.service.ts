import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { QueueRepository } from '../queue/queue.repository.js';
import type { AccessPolicyService } from './access-policy.service.js';
import type {
  BrowserModuleCode,
  DashboardPanelId,
  DashboardPanelSummary,
  DashboardQuickAction,
} from '@breeyo/types';
import { DASHBOARD_PANEL_ORDER } from '@breeyo/types';

/**
 * Mirrors `cockpitResponseSchema` in `packages/validators/src/web-dashboard.ts`
 * (`@breeyo/types` exports the panel-level pieces but not this wrapper).
 */
export interface CockpitResponse {
  panelOrder: DashboardPanelId[];
  panels: DashboardPanelSummary[];
  generatedAt: string;
}

/** The `Invoice.status` values that represent money still outstanding (mirrors billing/dashboard.service.ts). */
const OUTSTANDING_INVOICE_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'];

function quickAction(actionId: string, label: string, href: string): DashboardQuickAction {
  return { actionId, label, href };
}

/**
 * Aggregates the browser home cockpit -- one action-ready snippet per
 * authorized module, in the exact D-06 scroll order, with exception panels
 * bookending the module panels rather than the other way round.
 *
 * Every panel here answers "how many, and what do I click next" (D-08). None
 * of this reaches for chart-shaped data (no time series, no breakdowns by
 * category) -- that kind of analytics depth belongs to the module's own page
 * (e.g. `InventoryAnalyticsPanel`), not the home cockpit.
 *
 * D-83: `visibleModules` is re-resolved from `AccessPolicyService` on every
 * call (never cached here), so a module an Admin revokes mid-session is
 * absent from the very next cockpit response.
 */
export class CockpitService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessPolicyService: AccessPolicyService,
  ) {}

  async getCockpit(clinicId: string, userId: string): Promise<CockpitResponse> {
    const visibleModules = await this.accessPolicyService.getVisibleModulesForUser(clinicId, userId);
    const has = (moduleCode: BrowserModuleCode) => visibleModules.includes(moduleCode);

    const panels: DashboardPanelSummary[] = [];
    panels.push(await this.buildAlertsPanel(clinicId, visibleModules));

    if (has('QUEUE')) {
      panels.push(await this.buildQueuePanel(clinicId));
    }
    if (has('SCHEDULING')) {
      panels.push(await this.buildSchedulingPanel(clinicId));
    }
    if (has('BILLING')) {
      panels.push(await this.buildBillingPanel(clinicId));
    }
    if (has('INVENTORY')) {
      panels.push(await this.buildInventoryPanel(clinicId, has('INVENTORY_WRITE')));
    }
    if (has('USERS')) {
      panels.push(await this.buildUsersPanel(clinicId));
    }

    panels.push(await this.buildOwnerExceptionsPanel(clinicId));

    const panelOrder = panels.map((panel) => panel.panelId) as DashboardPanelId[];

    return {
      panelOrder,
      panels,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * D-06: alerts/exceptions always render first, regardless of which other
   * modules the caller can see. Its count is a best-effort union over
   * whichever of the underlying modules the caller is actually authorized
   * for -- an unauthorized module never contributes a number here, matching
   * D-20's "hidden, not partially shown" rule.
   */
  private async buildAlertsPanel(
    clinicId: string,
    visibleModules: BrowserModuleCode[],
  ): Promise<DashboardPanelSummary> {
    let itemCount = 0;

    if (visibleModules.includes('QUEUE')) {
      itemCount += await this.db.queueEntry.count({
        where: { clinicId, isEmergency: true, status: { in: ['WAITING', 'IN_CONSULT'] } },
      });
    }
    if (visibleModules.includes('BILLING')) {
      itemCount += await this.db.invoice.count({
        where: { clinicId, status: 'OVERDUE' },
      });
    }
    if (visibleModules.includes('INVENTORY')) {
      itemCount += await this.countLowStockItems(clinicId);
    }

    return {
      panelId: 'ALERTS',
      title: 'Alerts & Exceptions',
      itemCount,
      quickActions: [quickAction('review-alerts', 'Review Alerts', '/dashboard#alerts')],
    };
  }

  private async buildQueuePanel(clinicId: string): Promise<DashboardPanelSummary> {
    const itemCount = await this.db.queueEntry.count({
      where: { clinicId, status: { in: ['WAITING', 'IN_CONSULT'] } },
    });

    return {
      panelId: 'QUEUE',
      title: 'Queue',
      itemCount,
      quickActions: [
        quickAction('queue-check-in', 'Check In Next', '/queue'),
        quickAction('queue-move', 'Move Patient', '/queue'),
      ],
    };
  }

  private async buildSchedulingPanel(clinicId: string): Promise<DashboardPanelSummary> {
    const todayIST = QueueRepository.getTodayIST();
    const tomorrowIST = new Date(todayIST.getTime() + 24 * 60 * 60 * 1000);

    const itemCount = await this.db.appointment.count({
      where: {
        clinicId,
        scheduledFor: { gte: todayIST, lt: tomorrowIST },
        status: { in: ['SCHEDULED', 'CHECKED_IN'] },
      },
    });

    return {
      panelId: 'SCHEDULING',
      title: 'Scheduling',
      itemCount,
      quickActions: [quickAction('scheduling-open-today', "Open Today's Schedule", '/schedule')],
    };
  }

  private async buildBillingPanel(clinicId: string): Promise<DashboardPanelSummary> {
    const itemCount = await this.db.invoice.count({
      where: { clinicId, status: { in: OUTSTANDING_INVOICE_STATUSES } },
    });

    return {
      panelId: 'BILLING',
      title: 'Billing',
      itemCount,
      quickActions: [quickAction('billing-collect', 'Collect Payment', '/billing')],
    };
  }

  /**
   * "Low stock" is `currentStock <= parLevel`, a field-to-field comparison
   * Prisma's query builder cannot express directly -- this is a raw count,
   * same as `billing/dashboard.service.ts`'s aggregate, with the tenant
   * predicate named explicitly even though `this.db` is already the
   * RLS-bound handle (defence in depth, matching that file's convention).
   */
  private async countLowStockItems(clinicId: string): Promise<number> {
    const rows = await this.db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM inventory_items
      WHERE clinic_id = ${clinicId}::uuid
        AND is_active = true
        AND par_level IS NOT NULL
        AND current_stock <= par_level
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private async buildInventoryPanel(
    clinicId: string,
    writeEnabled: boolean,
  ): Promise<DashboardPanelSummary> {
    const itemCount = await this.countLowStockItems(clinicId);

    const quickActions = writeEnabled
      ? [quickAction('inventory-adjust', 'Adjust Stock', '/inventory')]
      : [quickAction('inventory-open', 'Open Inventory', '/inventory')];

    return {
      panelId: 'INVENTORY',
      title: 'Inventory',
      itemCount,
      quickActions,
    };
  }

  /** D-21: this panel only ever renders for a caller whose role has `usersEnabled`. */
  private async buildUsersPanel(clinicId: string): Promise<DashboardPanelSummary> {
    const itemCount = await this.db.clinicMember.count({
      where: { clinicId, isActive: true },
    });

    return {
      panelId: 'USERS',
      title: 'User Management',
      itemCount,
      quickActions: [quickAction('users-review-access', 'Review Access', '/users')],
    };
  }

  /** D-12, D-13: owner-portal and WhatsApp issues surface here as exceptions, never as the primary comms workspace. */
  private async buildOwnerExceptionsPanel(clinicId: string): Promise<DashboardPanelSummary> {
    const itemCount = await this.db.whatsAppMessage.count({
      where: { clinicId, status: 'FAILED' },
    });

    return {
      panelId: 'OWNER_EXCEPTIONS',
      title: 'Owner & WhatsApp Exceptions',
      itemCount,
      quickActions: [quickAction('owner-exceptions-review', 'Review Owner Issues', '/dashboard#owner-exceptions')],
    };
  }
}
