import { describe, it, expect, afterAll, vi } from 'vitest';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  createTestPet,
  createTestWhatsAppThread,
  prisma,
} from '../helpers/factories.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../../src/modules/whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../../src/modules/whatsapp/whatsapp.service.js';
import { BookingRepository } from '../../src/modules/whatsapp/booking/booking.repository.js';
import { BookingService } from '../../src/modules/whatsapp/booking/booking.service.js';

/**
 * WHA-03 / D-07 — the real-concurrency proof. `apps/api/vitest.config.ts`
 * sets `fileParallelism: false`, so the race under test MUST come from
 * `Promise.all` over two genuine `BookingService.confirmSlot` calls within
 * ONE test against the REAL Postgres unique index
 * (`whatsapp_slot_holds(clinic_id, slot_date, slot_start_minutes)`), not
 * from parallel test files.
 */

afterAll(async () => {
  await cleanupTestData();
});

function buildBookingService() {
  const whatsAppRepo = new WhatsAppRepository(prisma);
  const authz = new SendAuthorizationService(whatsAppRepo);
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const whatsAppService = new WhatsAppService(whatsAppRepo, authz, prisma, queue, null);
  const bookingRepo = new BookingRepository(prisma);
  return new BookingService({ repository: bookingRepo, prisma, whatsAppService });
}

async function setupTwoCompetingBookings() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);

  const ownerA = await createTestPetOwner(clinic.id);
  const petA = await createTestPet(clinic.id, ownerA.id);
  const threadA = await createTestWhatsAppThread(clinic.id, ownerA.id);

  const ownerB = await createTestPetOwner(clinic.id);
  const petB = await createTestPet(clinic.id, ownerB.id);
  const threadB = await createTestWhatsAppThread(clinic.id, ownerB.id);

  const bookingService = buildBookingService();

  const bookingA = await bookingService.startBooking(clinic.id, {
    threadId: threadA.id,
    ownerId: ownerA.id,
    petId: petA.id,
  });
  const bookingB = await bookingService.startBooking(clinic.id, {
    threadId: threadB.id,
    ownerId: ownerB.id,
    petId: petB.id,
  });

  return { clinic, bookingService, bookingA, bookingB };
}

describe('WhatsApp Booking Concurrency (WHA-03)', () => {
  it('two concurrent confirmations for the same slot yield one CONFIRMED and one SLOT_TAKEN (WHA-03, D-07)', async () => {
    const { clinic, bookingService, bookingA, bookingB } = await setupTwoCompetingBookings();

    const slot = { date: new Date('2026-08-20T00:00:00.000Z'), startMinutes: 630, durationMinutes: 30 };

    const [resultA, resultB] = await Promise.all([
      bookingService.confirmSlot(clinic.id, bookingA.id as string, slot),
      bookingService.confirmSlot(clinic.id, bookingB.id as string, slot),
    ]);

    const outcomes = [resultA.outcome, resultB.outcome].sort();
    expect(outcomes).toEqual(['CONFIRMED', 'SLOT_TAKEN']);

    // Exactly one row exists at the contended (clinicId, slotDate,
    // slotStartMinutes) key — the unique index arbitrated the race, not
    // application ordering.
    const holds = await prisma.whatsAppSlotHold.findMany({
      where: { clinicId: clinic.id, slotDate: slot.date, slotStartMinutes: slot.startMinutes },
    });
    expect(holds).toHaveLength(1);

    const confirmedBooking = resultA.outcome === 'CONFIRMED' ? bookingA : bookingB;
    const takenBooking = resultA.outcome === 'CONFIRMED' ? bookingB : bookingA;

    const confirmedRow = await prisma.whatsAppBookingRequest.findUnique({
      where: { id: confirmedBooking.id as string },
    });
    expect(confirmedRow!.state).toBe('CONFIRMED');
    expect(confirmedRow!.confirmedAt).not.toBeNull();

    const takenRow = await prisma.whatsAppBookingRequest.findUnique({
      where: { id: takenBooking.id as string },
    });
    expect(takenRow!.state).toBe('AWAITING_SLOT_CHOICE');

    // The one hold row belongs to whichever booking actually won.
    expect(holds[0].bookingRequestId).toBe(confirmedBooking.id);

    // Never a QueueEntry, race or not.
    const queueEntries = await prisma.queueEntry.findMany({ where: { clinicId: clinic.id } });
    expect(queueEntries).toHaveLength(0);
  });
});
