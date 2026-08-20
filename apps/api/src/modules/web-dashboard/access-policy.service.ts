import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import {
  DEFAULT_BROWSER_ACCESS_BY_ROLE,
  getVisibleModules,
  type BrowserModuleCode,
  type BrowserRoleCode,
  type ClinicBrowserAccessPolicy,
} from '@breeyo/types';

/**
 * `Role.name` values as seeded by `apps/api/prisma/seed.ts` -- display
 * strings, not the normalized `BrowserRoleCode` from `@breeyo/types`. This is
 * the one place that bridges the two: everything downstream in this module
 * (and its controllers) talks in `BrowserRoleCode` only.
 */
const ROLE_NAME_TO_BROWSER_ROLE_CODE: Record<string, BrowserRoleCode> = {
  Admin: 'ADMIN',
  FrontDesk: 'FRONT_DESK',
  Clinician: 'CLINICIAN',
};

/**
 * D-19: browser access is per-role, not per-user. When a `ClinicMember` holds
 * more than one role (e.g. Admin + InventoryManager), the highest-privilege
 * browser-eligible role wins rather than the least, so an Admin who also
 * happens to hold a non-browser role never loses browser access by accident.
 */
const ROLE_PRIORITY: BrowserRoleCode[] = ['ADMIN', 'FRONT_DESK', 'CLINICIAN'];

/** D-15: Clinician has no browser-access exception path in Phase 9. */
export class ClinicianBrowserAccessError extends Error {
  constructor(roleCode: BrowserRoleCode) {
    super(`Browser access cannot be enabled for role ${roleCode} in Phase 9 (D-15).`);
    this.name = 'ClinicianBrowserAccessError';
  }
}

type PolicyRow = {
  clinicId: string;
  roleCode: string;
  browserEnabled: boolean;
  queueEnabled: boolean;
  schedulingEnabled: boolean;
  billingEnabled: boolean;
  inventoryEnabled: boolean;
  inventoryWriteEnabled: boolean;
  usersEnabled: boolean;
  updatedByUserId: string | null;
  updatedAt: Date;
};

function toContract(row: PolicyRow): ClinicBrowserAccessPolicy {
  return {
    clinicId: row.clinicId,
    roleCode: row.roleCode as BrowserRoleCode,
    browserEnabled: row.browserEnabled,
    queueEnabled: row.queueEnabled,
    schedulingEnabled: row.schedulingEnabled,
    billingEnabled: row.billingEnabled,
    inventoryEnabled: row.inventoryEnabled,
    inventoryWriteEnabled: row.inventoryWriteEnabled,
    usersEnabled: row.usersEnabled,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type BrowserAccessPolicyUpdate = Partial<
  Omit<ClinicBrowserAccessPolicy, 'clinicId' | 'roleCode' | 'updatedByUserId' | 'updatedAt'>
>;

/**
 * Reads and writes `ClinicBrowserAccessPolicy` rows, keyed only by
 * `(clinicId, roleCode)` -- never by a per-user override (D-19).
 *
 * D-83 is the load-bearing contract here: nothing in this class caches a
 * policy snapshot anywhere (no in-memory map, no Redis key, no JWT claim).
 * `getPolicy` and everything built on it always re-reads the current row, so
 * a policy change an Admin makes takes effect on the very next call from an
 * already-open browser session -- not merely on that user's next login.
 */
export class AccessPolicyService {
  constructor(private readonly db: TenantPrismaClient) {}

  /**
   * D-15 to D-17: falls back to the locked role default when no row has been
   * persisted yet (a clinic that has never touched this role's toggles still
   * gets the correct out-of-the-box behavior).
   */
  async getPolicy(clinicId: string, roleCode: BrowserRoleCode): Promise<ClinicBrowserAccessPolicy> {
    const row = await this.db.clinicBrowserAccessPolicy.findUnique({
      where: { clinicId_roleCode: { clinicId, roleCode } },
    });

    if (!row) {
      return {
        ...DEFAULT_BROWSER_ACCESS_BY_ROLE[roleCode],
        clinicId,
        updatedByUserId: null,
        updatedAt: new Date(0).toISOString(),
      };
    }

    return toContract(row as PolicyRow);
  }

  /** Every role's policy, in `ADMIN, FRONT_DESK, CLINICIAN` order, for the admin management screen. */
  async listPolicies(clinicId: string): Promise<ClinicBrowserAccessPolicy[]> {
    return Promise.all(ROLE_PRIORITY.map((roleCode) => this.getPolicy(clinicId, roleCode)));
  }

  /**
   * D-19: writes only by role code. D-15: Clinician has no exception path in
   * Phase 9, so an attempt to touch its row is rejected outright rather than
   * silently ignored -- a caller must see that the request did not apply.
   */
  async updatePolicy(
    clinicId: string,
    roleCode: BrowserRoleCode,
    updates: BrowserAccessPolicyUpdate,
    updatedByUserId: string,
  ): Promise<ClinicBrowserAccessPolicy> {
    if (roleCode === 'CLINICIAN') {
      throw new ClinicianBrowserAccessError(roleCode);
    }

    const defaults = DEFAULT_BROWSER_ACCESS_BY_ROLE[roleCode];

    const row = await this.db.clinicBrowserAccessPolicy.upsert({
      where: { clinicId_roleCode: { clinicId, roleCode } },
      create: {
        clinicId,
        roleCode,
        browserEnabled: updates.browserEnabled ?? defaults.browserEnabled,
        queueEnabled: updates.queueEnabled ?? defaults.queueEnabled,
        schedulingEnabled: updates.schedulingEnabled ?? defaults.schedulingEnabled,
        billingEnabled: updates.billingEnabled ?? defaults.billingEnabled,
        inventoryEnabled: updates.inventoryEnabled ?? defaults.inventoryEnabled,
        inventoryWriteEnabled: updates.inventoryWriteEnabled ?? defaults.inventoryWriteEnabled,
        usersEnabled: updates.usersEnabled ?? defaults.usersEnabled,
        updatedByUserId,
      },
      update: {
        ...updates,
        updatedByUserId,
      },
    });

    return toContract(row as PolicyRow);
  }

  /**
   * Maps `Role.name` display strings (as seeded/assigned in `apps/api/prisma`)
   * to the normalized `BrowserRoleCode`, picking the highest-privilege
   * browser-eligible role when a member holds several. Returns `null` when
   * none of the member's roles are browser-eligible at all (e.g. a member
   * who only holds `InventoryManager`).
   */
  resolveRoleCode(roleNames: string[]): BrowserRoleCode | null {
    for (const candidate of ROLE_PRIORITY) {
      const matches = roleNames.some(
        (name) => ROLE_NAME_TO_BROWSER_ROLE_CODE[name] === candidate,
      );
      if (matches) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * D-83: resolves the user's current role membership AND re-reads the
   * current policy row on every call -- both halves of this are fresh reads,
   * so a role reassignment or a policy toggle an Admin makes mid-session is
   * enforced the very next time this is called, with no re-login required.
   */
  async getRoleCodeForUser(clinicId: string, userId: string): Promise<BrowserRoleCode | null> {
    const member = await this.db.clinicMember.findFirst({
      where: { clinicId, userId, isActive: true },
      include: { roles: { include: { role: true } } },
    });

    if (!member) {
      return null;
    }

    const roleNames = member.roles.map((memberRole: { role: { name: string } }) => memberRole.role.name);
    return this.resolveRoleCode(roleNames);
  }

  /**
   * D-20: the list a caller should render is exactly this -- there is no
   * separate "locked" variant. A user with no browser-eligible role, or whose
   * role has `browserEnabled: false`, gets an empty list rather than a 500 or
   * a placeholder.
   */
  async getVisibleModulesForUser(clinicId: string, userId: string): Promise<BrowserModuleCode[]> {
    const roleCode = await this.getRoleCodeForUser(clinicId, userId);
    if (!roleCode) {
      return [];
    }

    const policy = await this.getPolicy(clinicId, roleCode);
    return getVisibleModules(policy);
  }
}
