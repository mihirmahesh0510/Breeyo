import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll, vi } from 'vitest';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  createTestPet,
  prisma,
} from '../helpers/factories.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../../src/modules/whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../../src/modules/whatsapp/whatsapp.service.js';
import { DeliveryStatusService } from '../../src/modules/whatsapp/delivery-status.service.js';
import { InboundRouterService } from '../../src/modules/whatsapp/inbound-router.service.js';
import { BookingRepository } from '../../src/modules/whatsapp/booking/booking.repository.js';
import { BookingService } from '../../src/modules/whatsapp/booking/booking.service.js';
import { SlotService } from '../../src/modules/whatsapp/booking/slot.service.js';
import { createBookingInboundHandler } from '../../src/modules/whatsapp/booking/booking-inbound.handler.js';
import { getTodayIST, addDaysIST } from '../../src/lib/ist-date.js';
import type { WaInboundEvent } from '../../src/modules/whatsapp/providers/wa-provider.port.js';

/**
 * Real-database integration suite (07-10 Task 3). Per the plan and the
 * `send.test.ts` (07-08) precedent: construct every collaborator directly
 * against the real `prisma` handle from `tests/helpers/factories.js` with a
 * fake outbound queue — NOT `buildTestApp()`/HTTP. The route/controller
 * layer lands in a later plan.
 *
 * D-21 (post-07-10-PLAN.md amendment): every booking flow here must resolve
 * a pet BEFORE any slot is ever offered — single-pet auto-proceeds,
 * multi-pet sends a picker with no booking row created yet, zero-pet is a
 * fallback with no booking row.
 */

afterAll(async () => {
  await cleanupTestData();
});

const WIDE_OPEN_DAY_HOURS = { open: '00:00', close: '23:30', closed: false };
const ALL_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function wideOpenWorkingHours(dayHours = WIDE_OPEN_DAY_HOURS) {
  const hours: Record<string, typeof WIDE_OPEN_DAY_HOURS> = {};
  for (const day of ALL_DAYS) hours[day] = dayHours;
  return { hours };
}

async function setWorkingHours(clinicId: string, workingHours: unknown) {
  await prisma.clinic.update({ where: { id: clinicId }, data: { workingHours: workingHours as never } });
}

/** No `workingHours` set (stays the schema's `null` default) — Pitfall 15's null case. */
async function setupClinicOwnerNoHours(petCount = 1) {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const owner = await createTestPetOwner(clinic.id);
  const pets = [];
  for (let i = 0; i < petCount; i++) {
    pets.push(await createTestPet(clinic.id, owner.id, { name: `Pet${i}-${randomUUID().slice(0, 4)}` }));
  }
  return { user, clinic, owner, pets };
}

async function setupClinicOwnerPet(petCount = 1) {
  const setup = await setupClinicOwnerNoHours(petCount);
  await setWorkingHours(setup.clinic.id, wideOpenWorkingHours());
  return setup;
}

function buildHarness() {
  const whatsAppRepo = new WhatsAppRepository(prisma);
  const authz = new SendAuthorizationService(whatsAppRepo);
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const whatsAppService = new WhatsAppService(whatsAppRepo, authz, prisma, queue, null);
  const deliveryStatusService = new DeliveryStatusService(whatsAppRepo, prisma, null);
  const bookingRepo = new BookingRepository(prisma);
  const slotService = new SlotService(prisma);
  const bookingService = new BookingService({ repository: bookingRepo, prisma, whatsAppService });
  const bookingHandler = createBookingInboundHandler({
    prisma,
    repository: whatsAppRepo,
    bookingService,
    slotService,
  });
  const inboundRouter = new InboundRouterService({
    repository: whatsAppRepo,
    prisma,
    deliveryStatusService,
    bookingHandler,
  });

  return { whatsAppRepo, whatsAppService, bookingRepo, slotService, bookingService, bookingHandler, inboundRouter, queue };
}

function textEvent(text: string, from: string): WaInboundEvent {
  return {
    kind: 'TEXT',
    providerMessageId: `wamid.${randomUUID()}`,
    from,
    text,
    replyToProviderMessageId: null,
    occurredAt: new Date(),
  };
}

function listReplyEvent(rowId: string, from: string): WaInboundEvent {
  return {
    kind: 'LIST_REPLY',
    providerMessageId: `wamid.${randomUUID()}`,
    from,
    rowId,
    label: rowId,
    replyToProviderMessageId: null,
    occurredAt: new Date(),
  };
}

function buttonReplyEvent(payload: string, from: string): WaInboundEvent {
  return {
    kind: 'BUTTON_REPLY',
    providerMessageId: `wamid.${randomUUID()}`,
    from,
    payload,
    label: payload,
    replyToProviderMessageId: null,
    occurredAt: new Date(),
  };
}

/**
 * A `@db.Date` column round-trips to UTC midnight of its stored calendar
 * date, while an in-memory `getTodayIST`/`addDaysIST` value is IST-midnight
 * anchored (18:30 UTC on the preceding UTC day) — the two representations
 * share the same UTC calendar-date component for "the same day" but never
 * compare equal via `.getTime()`. Compare by that shared date string instead
 * (mirrors `dateOnlyKey` in `slot.service.ts`).
 */
function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function latestOutboundBookingMessage(clinicId: string, threadId: string) {
  return prisma.whatsAppMessage.findFirst({
    where: { clinicId, threadId, contextType: 'BOOKING', direction: 'OUTBOUND' },
    orderBy: { createdAt: 'desc' },
  });
}

describe('WhatsApp Booking (WHA-03)', () => {
  it(
    'inbound slot pick auto-confirms without staff action and queues booking_confirmation (WHA-03, D-06); ' +
      'the confirmed slot is absent from the next slot-offer list (D-08); no QueueEntry is ever created',
    async () => {
      const { clinic, owner, pets } = await setupClinicOwnerPet(1);
      const { inboundRouter, slotService } = buildHarness();

      // D-21: single-pet owner skips the picker — BOOK goes straight to a slot offer.
      await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);

      const booking = await prisma.whatsAppBookingRequest.findFirst({
        where: { clinicId: clinic.id, ownerId: owner.id },
      });
      expect(booking).not.toBeNull();
      expect(booking!.state).toBe('AWAITING_SLOT_CHOICE');
      expect(booking!.petId).toBe(pets[0].id);
      expect(booking!.reference).toMatch(/^BK-\d{6}-[A-Z0-9]{4}$/);

      const offerMsg = await latestOutboundBookingMessage(clinic.id, booking!.threadId as string);
      expect(offerMsg).not.toBeNull();
      const rows = offerMsg!.interactiveOptions as { id: string; title: string }[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(10);
      for (const row of rows) {
        expect(row.id).toMatch(/^booking:slot:[0-9a-fA-F-]{36}$/);
        expect(row.title.length).toBeLessThanOrEqual(24);
      }

      // Owner picks the first offered slot.
      await inboundRouter.route(listReplyEvent(rows[0].id, owner.mobile), clinic.id);

      const confirmed = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
      expect(confirmed!.state).toBe('CONFIRMED');
      expect(confirmed!.confirmedAt).not.toBeNull();

      // D-06: no staff action anywhere in this flow — the row is confirmed
      // purely from the two inbound events above.
      const confirmationMsg = await prisma.whatsAppMessage.findFirst({
        where: { clinicId: clinic.id, templateKey: 'booking_confirmation', contextId: booking!.id },
      });
      expect(confirmationMsg).not.toBeNull();
      expect(confirmationMsg!.status).toBe('QUEUED');
      expect(confirmationMsg!.body).toContain(confirmed!.reference);

      // Never creates a QueueEntry — staff check the owner in manually.
      const queueEntries = await prisma.queueEntry.findMany({ where: { petId: pets[0].id } });
      expect(queueEntries).toHaveLength(0);

      // D-08: the confirmed slot no longer appears in a fresh offer for that day.
      const nextOffer = await slotService.getOfferableSlots(clinic.id);
      const stillOffered = nextOffer.slots.some(
        (s) =>
          dateOnlyKey(s.slotDate) === dateOnlyKey(confirmed!.slotDate!) &&
          s.slotStartMinutes === confirmed!.slotStartMinutes,
      );
      expect(stillOffered).toBe(false);
    },
  );

  it("handlePayload for a slot that was just taken sends the D-07 'pick another time' reply, re-offers the slot list, and leaves the booking AWAITING_SLOT_CHOICE", async () => {
    const { clinic, owner } = await setupClinicOwnerPet(1);
    const { inboundRouter } = buildHarness();

    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);
    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    const offerMsg = await latestOutboundBookingMessage(clinic.id, booking!.threadId as string);
    const rows = offerMsg!.interactiveOptions as { id: string; description: string }[];
    const firstRow = rows[0];
    const meta = JSON.parse(firstRow.description) as { slotDate: string; slotStartMinutes: number };

    // Simulate a competing booking having already taken this exact slot
    // (WhatsAppSlotHold has no FK to a real booking row — a synthetic id is
    // sufficient to occupy the unique (clinicId, slotDate, slotStartMinutes) key).
    await prisma.whatsAppSlotHold.create({
      data: {
        clinicId: clinic.id,
        slotDate: new Date(meta.slotDate),
        slotStartMinutes: meta.slotStartMinutes,
        bookingRequestId: randomUUID(),
      },
    });

    await inboundRouter.route(listReplyEvent(firstRow.id, owner.mobile), clinic.id);

    const stillAwaiting = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
    expect(stillAwaiting!.state).toBe('AWAITING_SLOT_CHOICE');

    const takenReply = await prisma.whatsAppMessage.findFirst({
      where: {
        clinicId: clinic.id,
        threadId: booking!.threadId as string,
        direction: 'OUTBOUND',
        body: { contains: 'just taken' },
      },
    });
    expect(takenReply).not.toBeNull();

    const reoffer = await latestOutboundBookingMessage(clinic.id, booking!.threadId as string);
    expect(reoffer!.interactiveOptions).not.toBeNull();
    expect((reoffer!.interactiveOptions as unknown[]).length).toBeGreaterThan(0);
  });

  it('D-21: an owner with zero pets on file gets a call-the-clinic fallback, no booking row is created, and the thread is flagged needsAction', async () => {
    const { clinic, owner } = await setupClinicOwnerPet(0);
    const { inboundRouter } = buildHarness();

    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);

    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    expect(booking).toBeNull();

    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
    expect(thread!.needsAction).toBe(true);
    expect(thread!.needsActionReason).toBe('BOOKING_NO_PETS');

    const reply = await prisma.whatsAppMessage.findFirst({
      where: { clinicId: clinic.id, threadId: thread!.id, direction: 'OUTBOUND' },
    });
    expect(reply!.body.toLowerCase()).toContain('pet');
  });

  it(
    'D-21: a multi-pet owner is sent a pet picker with no booking row created yet; choosing a pet resumes into ' +
      'slot offering, with the resulting WhatsAppBookingRequest.petId correctly populated (full flow: pet picker -> ' +
      'pet chosen -> slot picker -> slot chosen -> confirmed)',
    async () => {
      const { clinic, owner, pets } = await setupClinicOwnerPet(2);
      const { inboundRouter } = buildHarness();

      await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);

      let booking = await prisma.whatsAppBookingRequest.findFirst({
        where: { clinicId: clinic.id, ownerId: owner.id },
      });
      expect(booking).toBeNull(); // D-21: no booking row until a pet is chosen

      const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
      const petPickerMsg = await prisma.whatsAppMessage.findFirst({
        where: { clinicId: clinic.id, threadId: thread!.id, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
      });
      const petRows = petPickerMsg!.interactiveOptions as { id: string; title: string }[];
      expect(petRows).toHaveLength(2);
      expect(petRows.every((r) => r.id.startsWith('booking:pet:'))).toBe(true);
      const chosenRow = petRows.find((r) => r.id === `booking:pet:${pets[0].id}`);
      expect(chosenRow).toBeDefined();

      await inboundRouter.route(listReplyEvent(chosenRow!.id, owner.mobile), clinic.id);

      booking = await prisma.whatsAppBookingRequest.findFirst({
        where: { clinicId: clinic.id, ownerId: owner.id },
      });
      expect(booking).not.toBeNull();
      expect(booking!.petId).toBe(pets[0].id);
      expect(booking!.state).toBe('AWAITING_SLOT_CHOICE');

      const slotOfferMsg = await latestOutboundBookingMessage(clinic.id, thread!.id);
      const slotRows = slotOfferMsg!.interactiveOptions as { id: string }[];
      expect(slotRows.length).toBeGreaterThan(0);
      expect(slotRows.every((r) => r.id.startsWith('booking:slot:'))).toBe(true);

      // Complete the flow: pick a slot -> CONFIRMED, with the right pet.
      await inboundRouter.route(listReplyEvent(slotRows[0].id, owner.mobile), clinic.id);

      const confirmed = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
      expect(confirmed!.state).toBe('CONFIRMED');
      expect(confirmed!.petId).toBe(pets[0].id);
    },
  );

  it('Pitfall 15 / D-06: startBooking with NO_WORKING_HOURS sends call-the-clinic guidance, creates no booking, and flags needsAction', async () => {
    const { clinic, owner } = await setupClinicOwnerNoHours(1); // workingHours left null

    const { inboundRouter } = buildHarness();
    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);

    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    expect(booking).toBeNull();

    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
    expect(thread!.needsAction).toBe(true);
    expect(thread!.needsActionReason).toBe('BOOKING_NO_WORKING_HOURS');

    const reply = await prisma.whatsAppMessage.findFirst({
      where: { clinicId: clinic.id, threadId: thread!.id, direction: 'OUTBOUND' },
    });
    expect(reply!.body.toLowerCase()).toContain('call the clinic');
  });

  it('D-06: startBooking with FULLY_BOOKED sends a no-availability reply and flags needsAction', async () => {
    const { clinic, owner } = await setupClinicOwnerNoHours(1);
    const narrowHours = { open: '09:00', close: '09:30', closed: false };
    await setWorkingHours(clinic.id, wideOpenWorkingHours(narrowHours));

    // Hold the clinic's single daily slot across the entire default 14-day
    // horizon (0..14 inclusive = 15 days) so nothing is offerable.
    const fromDate = getTodayIST();
    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
      await prisma.whatsAppSlotHold.create({
        data: {
          clinicId: clinic.id,
          slotDate: addDaysIST(fromDate, dayOffset),
          slotStartMinutes: 540,
          bookingRequestId: randomUUID(),
        },
      });
    }

    const { inboundRouter } = buildHarness();
    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);

    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    expect(booking).toBeNull();

    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });
    expect(thread!.needsAction).toBe(true);
    expect(thread!.needsActionReason).toBe('BOOKING_FULLY_BOOKED');
  });

  it('handlePayload performs no state change for a payload outside the inbound grammar (defense in depth)', async () => {
    const { clinic, owner } = await setupClinicOwnerPet(1);
    const { inboundRouter, bookingHandler } = buildHarness();

    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);
    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    const thread = await prisma.whatsAppThread.findFirst({ where: { clinicId: clinic.id, ownerId: owner.id } });

    const messageCountBefore = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });

    await bookingHandler.handlePayload(
      {
        clinicId: clinic.id,
        threadId: thread!.id,
        ownerId: owner.id,
        waPhone: owner.mobile,
        occurredAt: new Date(),
      },
      'appointment:keep:11111111-1111-1111-1111-111111111111',
    );

    const messageCountAfter = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });
    expect(messageCountAfter).toBe(messageCountBefore);

    const unchanged = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
    expect(unchanged!.state).toBe('AWAITING_SLOT_CHOICE');
  });

  it('D-09: booking:cancel:<uuid> is unreachable — the router rejects it before the handler is ever invoked', async () => {
    const { clinic, owner } = await setupClinicOwnerPet(1);

    const whatsAppRepo = new WhatsAppRepository(prisma);
    const deliveryStatusService = new DeliveryStatusService(whatsAppRepo, prisma, null);
    const fakeHandler = { startBooking: vi.fn(), handlePayload: vi.fn() };
    const inboundRouter = new InboundRouterService({
      repository: whatsAppRepo,
      prisma,
      deliveryStatusService,
      bookingHandler: fakeHandler,
    });

    await inboundRouter.route(
      buttonReplyEvent('booking:cancel:11111111-1111-1111-1111-111111111111', owner.mobile),
      clinic.id,
    );
    await inboundRouter.route(
      buttonReplyEvent('booking:move:11111111-1111-1111-1111-111111111111', owner.mobile),
      clinic.id,
    );

    expect(fakeHandler.handlePayload).not.toHaveBeenCalled();
    expect(fakeHandler.startBooking).not.toHaveBeenCalled();
  });

  it('cancelling a confirmed booking deletes its slot hold, and the slot becomes offerable again (D-25)', async () => {
    const { clinic, owner } = await setupClinicOwnerPet(1);
    const { inboundRouter, slotService, bookingService } = buildHarness();

    await inboundRouter.route(textEvent('BOOK', owner.mobile), clinic.id);
    const booking = await prisma.whatsAppBookingRequest.findFirst({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    const offerMsg = await latestOutboundBookingMessage(clinic.id, booking!.threadId as string);
    const rows = offerMsg!.interactiveOptions as { id: string }[];
    await inboundRouter.route(listReplyEvent(rows[0].id, owner.mobile), clinic.id);

    const confirmed = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
    expect(confirmed!.state).toBe('CONFIRMED');

    const staffUser = await createTestUser();
    await bookingService.cancelBooking(clinic.id, booking!.id, staffUser.id, 'Owner phoned to cancel');

    const cancelled = await prisma.whatsAppBookingRequest.findUnique({ where: { id: booking!.id } });
    expect(cancelled!.state).toBe('CANCELLED');
    expect(cancelled!.cancelReason).toBe('Owner phoned to cancel');

    const holdGone = await prisma.whatsAppSlotHold.findFirst({
      where: {
        clinicId: clinic.id,
        slotDate: confirmed!.slotDate!,
        slotStartMinutes: confirmed!.slotStartMinutes!,
      },
    });
    expect(holdGone).toBeNull();

    const offerAgain = await slotService.getOfferableSlots(clinic.id);
    const slotBack = offerAgain.slots.some(
      (s) =>
        dateOnlyKey(s.slotDate) === dateOnlyKey(confirmed!.slotDate!) &&
        s.slotStartMinutes === confirmed!.slotStartMinutes,
    );
    expect(slotBack).toBe(true);
  });
});
