// Phase 9 (D-01..D-45): shared browser-dashboard contracts. This is the one
// canonical contract surface later web-dashboard plans (09-02..09-04) build
// against instead of re-deriving access/panel rules per module.

/** Roles that can be granted browser access at all (D-15, D-16). */
export type BrowserRoleCode = 'ADMIN' | 'FRONT_DESK' | 'CLINICIAN';

/** Per-role, per-module browser capability toggles (D-19, D-21, D-22). */
export type BrowserModuleCode =
  | 'QUEUE'
  | 'SCHEDULING'
  | 'BILLING'
  | 'INVENTORY'
  | 'INVENTORY_WRITE'
  | 'USERS';

/**
 * One row of clinic-scoped, role-scoped browser access configuration.
 * Mirrors `ClinicBrowserAccessPolicy` in `apps/api/prisma/schema.prisma`.
 */
export interface ClinicBrowserAccessPolicy {
  clinicId: string;
  roleCode: BrowserRoleCode;
  browserEnabled: boolean;
  queueEnabled: boolean;
  schedulingEnabled: boolean;
  billingEnabled: boolean;
  inventoryEnabled: boolean;
  inventoryWriteEnabled: boolean;
  usersEnabled: boolean;
  updatedByUserId: string | null;
  updatedAt: string;
}

/** Locked home-screen scroll order (D-06, D-11, D-12, D-13). Never reorder. */
export const DASHBOARD_PANEL_ORDER = [
  'ALERTS',
  'QUEUE',
  'SCHEDULING',
  'BILLING',
  'INVENTORY',
  'USERS',
  'OWNER_EXCEPTIONS',
] as const;

export type DashboardPanelId = (typeof DASHBOARD_PANEL_ORDER)[number];

/** Action-ready snippet for one home panel (D-08: enough detail to decide the next click). */
export interface DashboardPanelSummary {
  panelId: DashboardPanelId;
  title: string;
  itemCount: number;
  quickActions: DashboardQuickAction[];
}

/** One home-surface quick action (D-03). */
export interface DashboardQuickAction {
  actionId: string;
  label: string;
  href: string;
}

/** Inline mini-panel for user-management awareness on home (D-11). */
export interface UserManagementMiniPanelSummary {
  activeUserCount: number;
  pendingInviteCount: number;
  recentlyChangedUsers: Array<{
    userId: string;
    displayName: string;
    changedAt: string;
    changedByUserId: string;
  }>;
}

/**
 * Live-sync freshness wrapper (D-40): overtaken edits surface as `stale` or
 * `conflict` rather than silently applying a write against old state.
 */
export type StaleStateStatus = 'fresh' | 'stale' | 'conflict';

export interface StaleStateEnvelope<T = unknown> {
  status: StaleStateStatus;
  data?: T;
  serverUpdatedAt: string;
  clientKnownUpdatedAt?: string;
}

/**
 * Default per-role access shape (D-15, D-16, D-19): Admin fully enabled,
 * Front Desk disabled until an admin opts in, Clinician denied outright in
 * Phase 9. `clinicId`, `updatedByUserId`, and `updatedAt` are populated by
 * the persistence layer, not by this default.
 */
export const DEFAULT_BROWSER_ACCESS_BY_ROLE: Record<
  BrowserRoleCode,
  Omit<ClinicBrowserAccessPolicy, 'clinicId' | 'updatedByUserId' | 'updatedAt'>
> = {
  ADMIN: {
    roleCode: 'ADMIN',
    browserEnabled: true,
    queueEnabled: true,
    schedulingEnabled: true,
    billingEnabled: true,
    inventoryEnabled: true,
    inventoryWriteEnabled: true,
    usersEnabled: true,
  },
  FRONT_DESK: {
    roleCode: 'FRONT_DESK',
    browserEnabled: false,
    // D-17: once an Admin enables browserEnabled, Front Desk actively
    // manages queue/scheduling/billing. D-18: inventory is visible but
    // view-only (inventoryWriteEnabled stays false). D-21: user management
    // stays Admin-only (usersEnabled stays false).
    queueEnabled: true,
    schedulingEnabled: true,
    billingEnabled: true,
    inventoryEnabled: true,
    inventoryWriteEnabled: false,
    usersEnabled: false,
  },
  CLINICIAN: {
    roleCode: 'CLINICIAN',
    browserEnabled: false,
    queueEnabled: false,
    schedulingEnabled: false,
    billingEnabled: false,
    inventoryEnabled: false,
    inventoryWriteEnabled: false,
    usersEnabled: false,
  },
};

const MODULE_FLAG_BY_CODE: Record<BrowserModuleCode, keyof ClinicBrowserAccessPolicy> = {
  QUEUE: 'queueEnabled',
  SCHEDULING: 'schedulingEnabled',
  BILLING: 'billingEnabled',
  INVENTORY: 'inventoryEnabled',
  INVENTORY_WRITE: 'inventoryWriteEnabled',
  USERS: 'usersEnabled',
};

/**
 * D-20: modules a browser user cannot access are hidden, never shown as
 * locked placeholders. Callers should render exactly this list — there is no
 * separate "locked" variant to fall back to. When `browserEnabled` is false
 * the whole module list is empty regardless of individual sub-toggles.
 */
export function getVisibleModules(policy: ClinicBrowserAccessPolicy): BrowserModuleCode[] {
  if (!policy.browserEnabled) {
    return [];
  }
  return (Object.keys(MODULE_FLAG_BY_CODE) as BrowserModuleCode[]).filter(
    (moduleCode) => policy[MODULE_FLAG_BY_CODE[moduleCode]] === true,
  );
}
