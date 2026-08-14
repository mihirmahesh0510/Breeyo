import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBookingInboundHandler } from '../booking-inbound.handler.js';
import { WA_JOB_OPTIONS } from '../../whatsapp-queue.js';

/**
 * Fix for the WHA-03/D-14 dispatch gap: every `createOutboundMessage` call
 * in `booking-inbound.handler.ts` (the pet-picker list, the slot-picker
 * list, and the plain-text fallbacks) must ALSO enqueue a `whatsapp-outbound`
 * job for that message — otherwise the row is persisted QUEUED and never
 * reaches a provider (see `outbound.worker.test.ts` for the worker-side half
 * of this fix). This suite mocks every collaborator and asserts the queue
 * is called once per outbound message created, following the
 * `whatsapp.service.test.ts` mock-collaborator convention.
 */

const CLINIC_ID = 'clinic-1';
const THREAD_ID = 'thread-1';
const OWNER_ID = 'owner-1';
const PHONE = '+919876543210';

function createCtx() {
  return {
    clinicId: CLINIC_ID,
    threadId: THREAD_ID,
    ownerId: OWNER_ID,
    waPhone: PHONE,
    occurredAt: new Date(),
  };
}

function createDeps() {
  const repository = {
    createOutboundMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    touchThread: vi.fn().mockResolvedValue({ count: 1 }),
    flagNeedsAction: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    pet: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
  };
  const slotService = {
    getOfferableSlots: vi.fn().mockResolvedValue({ slots: [], reason: 'NO_WORKING_HOURS' }),
  };
  const bookingService = {
    startBooking: vi.fn(),
    confirmSlot: vi.fn(),
  };
  const outboundQueue = { add: vi.fn().mockResolvedValue(undefined) };

  return { repository, prisma, slotService, bookingService, outboundQueue };
}

describe('createBookingInboundHandler — outbound dispatch (WHA-03/D-14 fix)', () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it('enqueues a whatsapp-outbound job for the plain-text NO_WORKING_HOURS fallback message', async () => {
    const handler = createBookingInboundHandler(deps as any);

    await handler.startBooking(createCtx());

    expect(deps.repository.createOutboundMessage).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
  });

  it('enqueues a whatsapp-outbound job for the FULLY_BOOKED plain-text fallback message', async () => {
    deps.slotService.getOfferableSlots.mockResolvedValue({ slots: [], reason: 'FULLY_BOOKED' });
    deps.prisma.pet.findMany.mockResolvedValue([{ id: 'pet-1', name: 'Rocky', createdAt: new Date() }]);
    const handler = createBookingInboundHandler(deps as any);

    await handler.startBooking(createCtx());

    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
  });

  it('enqueues a whatsapp-outbound job for the zero-pets plain-text fallback message', async () => {
    deps.prisma.pet.findMany.mockResolvedValue([]);
    const handler = createBookingInboundHandler(deps as any);

    await handler.startBooking(createCtx());

    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
  });

  it('enqueues a whatsapp-outbound job for the multi-pet interactive-list picker message', async () => {
    deps.prisma.pet.findMany.mockResolvedValue([
      { id: 'pet-1', name: 'Rocky', createdAt: new Date() },
      { id: 'pet-2', name: 'Milo', createdAt: new Date() },
    ]);
    const handler = createBookingInboundHandler(deps as any);

    await handler.startBooking(createCtx());

    expect(deps.repository.createOutboundMessage).toHaveBeenCalledTimes(1);
    const createCall = deps.repository.createOutboundMessage.mock.calls[0][1];
    expect(createCall.interactiveOptions).toBeDefined();

    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
  });

  it('enqueues a whatsapp-outbound job for the slot-picker interactive-list message (single-pet auto-proceed)', async () => {
    deps.prisma.pet.findMany.mockResolvedValue([{ id: 'pet-1', name: 'Rocky', createdAt: new Date() }]);
    deps.slotService.getOfferableSlots.mockResolvedValue({
      slots: [{ slotDate: new Date('2026-08-20'), slotStartMinutes: 540, slotDurationMinutes: 30, label: '9:00 AM' }],
    });
    deps.bookingService.startBooking.mockResolvedValue({ id: 'booking-1' });
    const handler = createBookingInboundHandler(deps as any);

    await handler.startBooking(createCtx());

    expect(deps.repository.createOutboundMessage).toHaveBeenCalledTimes(1);
    const createCall = deps.repository.createOutboundMessage.mock.calls[0][1];
    expect(createCall.interactiveOptions).toHaveLength(1);

    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(1);
    expect(deps.outboundQueue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
  });

  it('enqueues one job per message when a slot-taken reply triggers both a text reply and a re-offered slot list', async () => {
    deps.prisma.pet.findMany.mockResolvedValue([{ id: 'pet-1', name: 'Rocky', createdAt: new Date() }]);
    deps.repository.createOutboundMessage
      .mockResolvedValueOnce({ id: 'msg-1' })
      .mockResolvedValueOnce({ id: 'msg-2' });
    deps.slotService.getOfferableSlots.mockResolvedValue({
      slots: [{ slotDate: new Date('2026-08-20'), slotStartMinutes: 540, slotDurationMinutes: 30, label: '9:00 AM' }],
    });
    deps.bookingService.confirmSlot.mockResolvedValue({ outcome: 'SLOT_TAKEN' });

    const handler = createBookingInboundHandler(deps as any);
    const rowId = 'booking:slot:11111111-1111-1111-1111-111111111111';
    const meta = JSON.stringify({
      bookingId: 'booking-1',
      slotDate: new Date('2026-08-20').toISOString(),
      slotStartMinutes: 540,
      slotDurationMinutes: 30,
    });

    // findStoredSlotMeta reads recent BOOKING-context messages via prisma
    // directly, not via `repository` — stub the raw query it makes.
    (deps.prisma as any).whatsAppMessage = {
      findMany: vi.fn().mockResolvedValue([{ interactiveOptions: [{ id: rowId, description: meta }] }]),
    };

    await handler.handlePayload(createCtx(), rowId);

    expect(deps.repository.createOutboundMessage).toHaveBeenCalledTimes(2);
    expect(deps.outboundQueue.add).toHaveBeenCalledTimes(2);
    expect(deps.outboundQueue.add).toHaveBeenNthCalledWith(
      1,
      'send',
      { messageId: 'msg-1' },
      { jobId: 'send-msg-1', ...WA_JOB_OPTIONS },
    );
    expect(deps.outboundQueue.add).toHaveBeenNthCalledWith(
      2,
      'send',
      { messageId: 'msg-2' },
      { jobId: 'send-msg-2', ...WA_JOB_OPTIONS },
    );
  });
});
