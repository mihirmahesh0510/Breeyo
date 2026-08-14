import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InboundRouterService } from '../inbound-router.service.js';
import type { WaInboundEvent } from '../providers/wa-provider.port.js';

/**
 * WHA-01/WHA-05 — InboundRouterService (D-03, D-09, D-10, D-11, Anti-Pattern
 * A8). Unit tests against a mocked repository/prisma/delivery-status-service/
 * handlers — no live database.
 */

vi.mock('../../../lib/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/audit-log.js')>(
    '../../../lib/audit-log.js',
  );
  return { ...actual, writeAuditLog: vi.fn().mockResolvedValue(undefined) };
});

const { writeAuditLog, AuditEvent } = await import('../../../lib/audit-log.js');

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';
const THREAD_ID = 'thread-1';
const WA_PHONE = '+919876543210';
const FROM_WA_ID = '919876543210'; // plus-less, matches Meta's inbound `from` (Pitfall 9)
const BOOKING_UUID = '11111111-1111-1111-1111-111111111111';

function textEvent(text: string, overrides: Partial<WaInboundEvent> = {}): WaInboundEvent {
  return {
    kind: 'TEXT',
    providerMessageId: 'wamid.IN1',
    from: FROM_WA_ID,
    text,
    replyToProviderMessageId: null,
    occurredAt: new Date('2026-08-15T10:00:00Z'),
    ...overrides,
  } as WaInboundEvent;
}

function buttonReplyEvent(payload: string, overrides: Partial<WaInboundEvent> = {}): WaInboundEvent {
  return {
    kind: 'BUTTON_REPLY',
    providerMessageId: 'wamid.IN2',
    from: FROM_WA_ID,
    payload,
    label: payload,
    replyToProviderMessageId: null,
    occurredAt: new Date('2026-08-15T10:00:00Z'),
    ...overrides,
  } as WaInboundEvent;
}

function listReplyEvent(rowId: string, overrides: Partial<WaInboundEvent> = {}): WaInboundEvent {
  return {
    kind: 'LIST_REPLY',
    providerMessageId: 'wamid.IN3',
    from: FROM_WA_ID,
    rowId,
    label: rowId,
    replyToProviderMessageId: null,
    occurredAt: new Date('2026-08-15T10:00:00Z'),
    ...overrides,
  } as WaInboundEvent;
}

function statusEvent(overrides: Partial<WaInboundEvent> = {}): WaInboundEvent {
  return {
    kind: 'STATUS',
    providerMessageId: 'wamid.OUT1',
    status: 'DELIVERED',
    failure: null,
    occurredAt: new Date('2026-08-15T10:00:00Z'),
    ...overrides,
  } as WaInboundEvent;
}

function unsupportedEvent(overrides: Partial<WaInboundEvent> = {}): WaInboundEvent {
  return {
    kind: 'UNSUPPORTED',
    providerMessageId: 'wamid.IN4',
    from: FROM_WA_ID,
    rawType: 'sticker',
    occurredAt: new Date('2026-08-15T10:00:00Z'),
    ...overrides,
  } as WaInboundEvent;
}

function createMockRepository() {
  return {
    findThreadByPhone: vi.fn().mockResolvedValue({
      id: THREAD_ID,
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      waPhone: WA_PHONE,
    }),
    upsertThread: vi.fn(),
    createInboundMessage: vi.fn().mockResolvedValue({ id: 'inbound-msg-1' }),
    upsertOwnerPreference: vi.fn().mockResolvedValue({}),
    touchThread: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

function createMockPrisma() {
  return {
    petOwner: { findFirst: vi.fn() },
    whatsAppThread: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    whatsAppMessage: { findFirst: vi.fn().mockResolvedValue(null) },
    whatsAppReminderTask: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

function createMockDeliveryStatusService() {
  return { apply: vi.fn().mockResolvedValue({ applied: true }) };
}

function createMockBookingHandler() {
  return {
    startBooking: vi.fn().mockResolvedValue(undefined),
    handlePayload: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockReminderHandler() {
  return { markReplied: vi.fn().mockResolvedValue(undefined) };
}

function p2002() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

describe('InboundRouterService.route (WHA-01/05, D-03/09/10/11)', () => {
  let repository: ReturnType<typeof createMockRepository>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let deliveryStatusService: ReturnType<typeof createMockDeliveryStatusService>;
  let bookingHandler: ReturnType<typeof createMockBookingHandler>;
  let reminderHandler: ReturnType<typeof createMockReminderHandler>;
  let service: InboundRouterService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
    prisma = createMockPrisma();
    deliveryStatusService = createMockDeliveryStatusService();
    bookingHandler = createMockBookingHandler();
    reminderHandler = createMockReminderHandler();
    service = new InboundRouterService({
      repository: repository as any,
      prisma: prisma as any,
      deliveryStatusService: deliveryStatusService as any,
      bookingHandler: bookingHandler as any,
      reminderHandler: reminderHandler as any,
    });
  });

  it("route(TEXT 'STOP') sets remindersOptedOut true with source OWNER_STOP and writes a WHATSAPP_OPT_OUT audit entry (D-11)", async () => {
    await service.route(textEvent('STOP'), CLINIC_ID);

    expect(repository.upsertOwnerPreference).toHaveBeenCalledWith(CLINIC_ID, OWNER_ID, {
      remindersOptedOut: true,
      source: 'OWNER_STOP',
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      AuditEvent.WHATSAPP_OPT_OUT,
      expect.objectContaining({ clinicId: CLINIC_ID, metadata: expect.objectContaining({ ownerId: OWNER_ID }) }),
    );
  });

  it("route(TEXT 'stop') and route(TEXT '  Stop  ') both opt out (case/whitespace-insensitive)", async () => {
    await service.route(textEvent('stop'), CLINIC_ID);
    expect(repository.upsertOwnerPreference).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    repository.upsertOwnerPreference.mockResolvedValue({});
    await service.route(textEvent('  Stop  '), CLINIC_ID);
    expect(repository.upsertOwnerPreference).toHaveBeenCalledTimes(1);
  });

  it("route(TEXT 'STOP sending these') does NOT opt out — only the bare keyword matches (Anti-Pattern A8)", async () => {
    await service.route(textEvent('STOP sending these'), CLINIC_ID);
    expect(repository.upsertOwnerPreference).not.toHaveBeenCalled();
  });

  it("route(TEXT 'BOOK') delegates to BookingInboundHandler.startBooking", async () => {
    await service.route(textEvent('BOOK'), CLINIC_ID);

    expect(bookingHandler.startBooking).toHaveBeenCalledTimes(1);
    const ctx = bookingHandler.startBooking.mock.calls[0][0];
    expect(ctx).toMatchObject({ clinicId: CLINIC_ID, threadId: THREAD_ID, ownerId: OWNER_ID });
  });

  it("route(BUTTON_REPLY 'booking:confirm:<uuid>') delegates to BookingInboundHandler.handlePayload", async () => {
    const payload = `booking:confirm:${BOOKING_UUID}`;
    await service.route(buttonReplyEvent(payload), CLINIC_ID);

    expect(bookingHandler.handlePayload).toHaveBeenCalledTimes(1);
    expect(bookingHandler.handlePayload.mock.calls[0][1]).toBe(payload);
  });

  it("route(BUTTON_REPLY 'booking:cancel:<uuid>') is rejected — no handler is called, event still recorded as inbound only (D-09)", async () => {
    const payload = `booking:cancel:${BOOKING_UUID}`;
    await service.route(buttonReplyEvent(payload), CLINIC_ID);

    expect(bookingHandler.handlePayload).not.toHaveBeenCalled();
    expect(bookingHandler.startBooking).not.toHaveBeenCalled();
    expect(repository.createInboundMessage).toHaveBeenCalledTimes(1);
  });

  it("route(BUTTON_REPLY 'appointment:keep:<uuid>') is rejected in Beta without throwing", async () => {
    const payload = `appointment:keep:${BOOKING_UUID}`;
    await expect(service.route(buttonReplyEvent(payload), CLINIC_ID)).resolves.toBeUndefined();

    expect(bookingHandler.handlePayload).not.toHaveBeenCalled();
  });

  it("route(LIST_REPLY 'booking:slot:<uuid>') delegates to BookingInboundHandler.handlePayload", async () => {
    const rowId = `booking:slot:${BOOKING_UUID}`;
    await service.route(listReplyEvent(rowId), CLINIC_ID);

    expect(bookingHandler.handlePayload).toHaveBeenCalledTimes(1);
    expect(bookingHandler.handlePayload.mock.calls[0][1]).toBe(rowId);
  });

  it('route(STATUS event) delegates to DeliveryStatusService.apply and creates no inbound message row', async () => {
    const event = statusEvent();
    await service.route(event, CLINIC_ID);

    expect(deliveryStatusService.apply).toHaveBeenCalledWith(
      'wamid.OUT1',
      'DELIVERED',
      null,
      event.kind === 'STATUS' ? event.occurredAt : undefined,
    );
    expect(repository.createInboundMessage).not.toHaveBeenCalled();
    expect(repository.findThreadByPhone).not.toHaveBeenCalled();
  });

  it('route(any owner-originated event) persists an inbound message, sets the 24h service window and touches lastMessageAt/preview', async () => {
    const event = textEvent('Hello there', { occurredAt: new Date('2026-08-15T10:00:00Z') });
    await service.route(event, CLINIC_ID);

    expect(repository.createInboundMessage).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: THREAD_ID, clinicId: CLINIC_ID },
        data: expect.objectContaining({
          serviceWindowExpiresAt: new Date('2026-08-16T10:00:00Z'),
          lastMessageAt: new Date('2026-08-15T10:00:00Z'),
        }),
      }),
    );
  });

  it('route(any owner-originated event) calls ReminderReplyHandler.markReplied so escalation stops (D-03)', async () => {
    await service.route(textEvent('Hello there'), CLINIC_ID);

    expect(reminderHandler.markReplied).toHaveBeenCalledTimes(1);
    const ctx = reminderHandler.markReplied.mock.calls[0][0];
    expect(ctx).toMatchObject({ clinicId: CLINIC_ID, threadId: THREAD_ID, ownerId: OWNER_ID });
  });

  it('attributes to the reminder task on the message matched by replyToProviderMessageId', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ reminderTaskId: 'task-1' });

    const event = textEvent('Thanks!', { replyToProviderMessageId: 'wamid.OUT-ORIGINAL' } as never);
    await service.route(event, CLINIC_ID);

    expect(prisma.whatsAppMessage.findFirst).toHaveBeenCalledWith({
      where: { providerMessageId: 'wamid.OUT-ORIGINAL' },
    });
    const ctx = reminderHandler.markReplied.mock.calls[0][0];
    expect(ctx.reminderTaskId).toBe('task-1');
  });

  it('falls back to the most recent SENT reminder task on the thread within the attribution window when replyToProviderMessageId is absent', async () => {
    prisma.whatsAppReminderTask.findFirst.mockResolvedValue({ id: 'task-fallback' });

    await service.route(textEvent('Thanks!'), CLINIC_ID);

    expect(prisma.whatsAppReminderTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: CLINIC_ID, ownerId: OWNER_ID, state: 'SENT' }),
      }),
    );
    const ctx = reminderHandler.markReplied.mock.calls[0][0];
    expect(ctx.reminderTaskId).toBe('task-fallback');
  });

  it('creates a thread keyed on the normalized +E.164 number when a plus-less wa_id matches no existing thread (Pitfall 9)', async () => {
    repository.findThreadByPhone.mockResolvedValue(null);
    prisma.petOwner.findFirst.mockResolvedValue({ id: OWNER_ID });
    repository.upsertThread.mockResolvedValue({
      id: THREAD_ID,
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      waPhone: WA_PHONE,
    });

    await service.route(textEvent('Hi'), CLINIC_ID);

    expect(prisma.petOwner.findFirst).toHaveBeenCalledWith({
      where: { clinicId: CLINIC_ID, mobile: WA_PHONE },
    });
    expect(repository.upsertThread).toHaveBeenCalledWith(CLINIC_ID, {
      ownerId: OWNER_ID,
      waPhone: WA_PHONE,
    });
  });

  it('route(a second event with the same providerMessageId) creates no second inbound message and calls no handler twice (Pitfall 14)', async () => {
    repository.createInboundMessage.mockRejectedValueOnce(p2002());

    await expect(service.route(textEvent('BOOK'), CLINIC_ID)).resolves.toBeUndefined();

    expect(bookingHandler.startBooking).not.toHaveBeenCalled();
    expect(reminderHandler.markReplied).not.toHaveBeenCalled();
    expect(prisma.whatsAppThread.updateMany).not.toHaveBeenCalled();
  });

  it('route(UNSUPPORTED event) records an inbound message with a placeholder body and calls no handler', async () => {
    await service.route(unsupportedEvent(), CLINIC_ID);

    expect(repository.createInboundMessage).toHaveBeenCalledTimes(1);
    const body = repository.createInboundMessage.mock.calls[0][1].body;
    expect(body).toContain('sticker');
    expect(bookingHandler.startBooking).not.toHaveBeenCalled();
    expect(bookingHandler.handlePayload).not.toHaveBeenCalled();
  });

  it('completes without throwing when the default no-op handlers are used (booking/reminder implementations absent)', async () => {
    const bare = new InboundRouterService({
      repository: repository as any,
      prisma: prisma as any,
      deliveryStatusService: deliveryStatusService as any,
    });

    await expect(bare.route(textEvent('BOOK'), CLINIC_ID)).resolves.toBeUndefined();
    await expect(
      bare.route(buttonReplyEvent(`booking:confirm:${BOOKING_UUID}`), CLINIC_ID),
    ).resolves.toBeUndefined();
  });
});
