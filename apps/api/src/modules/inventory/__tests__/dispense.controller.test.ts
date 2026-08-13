import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DispenseController, type DispenseServices } from '../dispense.controller.js';
import { mockClinic, mockUser } from './inventory.fixtures.js';

/**
 * D-30 wiring guard (plan 06-20).
 *
 * The inventory module was still on the RLS-bypassing admin client when this
 * plan started — Phase 5 landed it after 06-20's file list was written, so it
 * was covered by neither 06-02 nor 06-20's original scope, and its six RLS
 * policies from 06-00 had nothing reaching them.
 *
 * Every repository method in the module carries an explicit `clinicId` filter,
 * so an HTTP cross-tenant test cannot distinguish the admin client from the
 * tenant handle (verified by running plan 06-20's new HTTP inventory tests
 * against a deliberately admin-wired factory — all three still passed). RLS
 * here is the second layer, not the only one.
 *
 * That makes *wiring* the thing worth asserting: these tests fail if a handler
 * ever goes back to a plugin-scope service built once from the admin client,
 * because the per-request factory would then never be called with `request.db`.
 */
function createMockServices() {
  return {
    fifoDispenseService: { dispense: vi.fn(), returnToStock: vi.fn() },
    stockAdjustmentService: { adjust: vi.fn() },
    stockTakeService: { processStockTake: vi.fn() },
    stockMovementService: { getHistory: vi.fn(), getMovementsForExport: vi.fn() },
    parLevelAlertService: {
      getLowStockItems: vi.fn().mockResolvedValue([]),
      getExpiringSoonItems: vi.fn().mockResolvedValue([]),
      getExpiredItems: vi.fn().mockResolvedValue([]),
      getAlertCounts: vi.fn().mockResolvedValue({}),
    },
    wantListService: { getWantList: vi.fn(), getWantListWhatsAppText: vi.fn() },
  } as unknown as DispenseServices;
}

function createMockReply() {
  const reply: any = {};
  reply.status = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  return reply;
}

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    user: { id: mockUser.id, activeClinicId: mockClinic.id },
    // Distinct marker per request: the assertions below check the handler
    // passed *this* request's handle, not merely some handle.
    db: { __tenantScopedFor: mockClinic.id },
    ...overrides,
  } as any;
}

describe('DispenseController — D-30 per-request wiring', () => {
  let services: DispenseServices;
  let seenHandles: unknown[];
  let controller: DispenseController;

  beforeEach(() => {
    services = createMockServices();
    seenHandles = [];
    controller = new DispenseController((db) => {
      seenHandles.push(db);
      return services;
    });
  });

  const readOnlyHandlers = [
    ['getAlerts', {}],
    ['getWantList', {}],
    ['getWantListText', {}],
  ] as const;

  for (const [handler] of readOnlyHandlers) {
    it(`${handler} builds its services from request.db`, async () => {
      const request = createMockRequest();

      await (controller as any)[handler](request, createMockReply());

      expect(seenHandles).toHaveLength(1);
      expect(seenHandles[0]).toBe(request.db);
    });
  }

  it('resolves a fresh handle per request rather than caching one', async () => {
    const first = createMockRequest({ db: { tenant: 'clinic-1' } });
    const second = createMockRequest({ db: { tenant: 'clinic-2' } });

    await controller.getWantList(first, createMockReply());
    await controller.getWantList(second, createMockReply());

    expect(seenHandles).toEqual([first.db, second.db]);
    expect(seenHandles[0]).not.toBe(seenHandles[1]);
  });

  it('resolves the handle before validating input, so a 400 still went through request.db', async () => {
    // itemParamsSchema is `itemId: z.string().min(1)`, so an empty itemId is
    // rejected. The factory must already have been called by then — that
    // ordering is what makes the conversion uniform across every handler rather
    // than only the happy paths.
    const request = createMockRequest({ params: { itemId: '' } });
    const reply = createMockReply();

    await controller.getMovementHistory(request, reply);

    expect(seenHandles).toEqual([request.db]);
    expect(reply.status).toHaveBeenCalledWith(400);
  });
});
