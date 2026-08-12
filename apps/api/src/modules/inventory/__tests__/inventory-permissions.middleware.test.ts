import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  INVENTORY_PERMISSIONS,
  requireInventoryPermission,
} from '../middleware/inventory-permissions.middleware.js';

// D-41-D-44: inventory permission rules, expressed at this codebase's real
// enforcement layer (permission codes resolved via PermissionService), not
// as a hardcoded role-name lookup — see the middleware file's doc comment
// for why. These tests exercise requireInventoryPermission() against a
// mocked permissionService the same way the rest of the app's role/permission
// matrix is defined and seeded (apps/api/prisma/seed.ts DEFAULT_ROLE_PERMISSIONS).

function createMockReply() {
  const reply: any = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function createMockRequest(userPerms: string[]) {
  return {
    user: { id: 'user-1', activeClinicId: 'clinic-1' },
    server: {
      permissionService: {
        getUserPermissions: vi.fn().mockResolvedValue(userPerms),
      },
    },
  } as any;
}

describe('requireInventoryPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes a permission code for every D-41-D-44 action', () => {
    expect(INVENTORY_PERMISSIONS.viewInventory).toBeTruthy();
    expect(INVENTORY_PERMISSIONS.manageStock).toBeTruthy();
    expect(INVENTORY_PERMISSIONS.dispense).toBeTruthy();
    expect(INVENTORY_PERMISSIONS.setPricesAndParLevels).toBeTruthy();
    expect(INVENTORY_PERMISSIONS.exportData).toBeTruthy();
  });

  describe('viewInventory — admin, clinician, inventory_manager, front_desk', () => {
    it('allows a caller whose permissions include VIEW_INVENTORY', async () => {
      const request = createMockRequest([INVENTORY_PERMISSIONS.viewInventory]);
      const reply = createMockReply();

      await requireInventoryPermission('viewInventory')(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('denies a caller without VIEW_INVENTORY', async () => {
      const request = createMockRequest([]);
      const reply = createMockReply();

      await requireInventoryPermission('viewInventory')(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) }),
      );
    });
  });

  describe('manageStock — admin, inventory_manager, front_desk (not clinician)', () => {
    it('allows a caller with MANAGE_INVENTORY_STOCK', async () => {
      const request = createMockRequest([INVENTORY_PERMISSIONS.manageStock]);
      const reply = createMockReply();

      await requireInventoryPermission('manageStock')(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('denies a caller who only has VIEW_INVENTORY (e.g. clinician)', async () => {
      const request = createMockRequest([INVENTORY_PERMISSIONS.viewInventory]);
      const reply = createMockReply();

      await requireInventoryPermission('manageStock')(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('setPricesAndParLevels — admin, inventory_manager only (D-44)', () => {
    it('allows a caller with MANAGE_INVENTORY_PRICES', async () => {
      const request = createMockRequest([INVENTORY_PERMISSIONS.setPricesAndParLevels]);
      const reply = createMockReply();

      await requireInventoryPermission('setPricesAndParLevels')(request, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('denies a caller who only has MANAGE_INVENTORY_STOCK (e.g. front desk)', async () => {
      const request = createMockRequest([INVENTORY_PERMISSIONS.manageStock]);
      const reply = createMockReply();

      await requireInventoryPermission('setPricesAndParLevels')(request, reply);

      expect(reply.status).toHaveBeenCalledWith(403);
    });
  });

  it('grants access when the required code comes from a user permission override', async () => {
    // Overrides are already folded into PermissionService.getUserPermissions()'s
    // returned list, so this just confirms the middleware trusts that list as-is.
    const request = createMockRequest([INVENTORY_PERMISSIONS.dispense]);
    const reply = createMockReply();

    await requireInventoryPermission('dispense')(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
