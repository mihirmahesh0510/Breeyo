/**
 * WHA-03 — Prisma access for `WhatsAppBookingRequest` and `WhatsAppSlotHold`,
 * matching the `WhatsAppRepository` shape: every method takes an explicit
 * `clinicId` first parameter, and write methods accept an optional trailing
 * `tx` (defaulting to the constructor's own handle) so `BookingService` can
 * compose several calls inside one `prisma.$transaction` — exactly the
 * mechanism 07-RESEARCH § Code Example 5 / § Pattern 8 requires for the
 * slot-hold-first-then-confirm sequence.
 */

import type { DbClient } from '../../../lib/prisma-rls.js';

export interface CreateBookingRequestInput {
  threadId: string;
  ownerId: string;
  petId: string;
  reference: string;
}

export interface SlotInput {
  date: Date;
  startMinutes: number;
}

export interface ConfirmBookingInput extends SlotInput {
  durationMinutes: number;
}

export class BookingRepository {
  constructor(private readonly prisma: DbClient) {}

  async createBookingRequest(
    clinicId: string,
    input: CreateBookingRequestInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppBookingRequest.create({
      data: {
        clinicId,
        threadId: input.threadId,
        ownerId: input.ownerId,
        petId: input.petId,
        reference: input.reference,
        state: 'AWAITING_SLOT_CHOICE',
      },
    });
  }

  async findBookingRequestById(clinicId: string, bookingId: string) {
    return this.prisma.whatsAppBookingRequest.findFirst({ where: { id: bookingId, clinicId } });
  }

  /**
   * WHA-03 / D-07 (07-RESEARCH § Code Example 5): the unique index on
   * `whatsapp_slot_holds(clinic_id, slot_date, slot_start_minutes)` is the
   * arbiter, not this call — this simply issues the insert that either
   * succeeds or raises P2002 when the caller has already `await`ed it
   * inside `prisma.$transaction`.
   */
  async createSlotHold(
    clinicId: string,
    bookingRequestId: string,
    slot: SlotInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppSlotHold.create({
      data: {
        clinicId,
        slotDate: slot.date,
        slotStartMinutes: slot.startMinutes,
        bookingRequestId,
      },
    });
  }

  async deleteSlotHoldByBookingId(
    clinicId: string,
    bookingRequestId: string,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppSlotHold.deleteMany({ where: { clinicId, bookingRequestId } });
  }

  /**
   * Caller (`BookingService`) has already resolved `clinicId` ownership via
   * `findBookingRequestById` before this runs inside the transaction — the
   * plain `update` by primary key here is safe because that ownership check
   * already happened, matching the same discretion `WhatsAppService.
   * sendTemplate` uses for `createOutboundMessage` inside its own transaction.
   */
  async confirmBooking(
    clinicId: string,
    bookingRequestId: string,
    slot: ConfirmBookingInput,
    tx: DbClient = this.prisma,
  ) {
    void clinicId;
    return tx.whatsAppBookingRequest.update({
      where: { id: bookingRequestId },
      data: {
        state: 'CONFIRMED',
        slotDate: slot.date,
        slotStartMinutes: slot.startMinutes,
        slotDurationMinutes: slot.durationMinutes,
        confirmedAt: new Date(),
      },
    });
  }

  async cancelBooking(
    clinicId: string,
    bookingRequestId: string,
    actorUserId: string,
    reason: string | null,
    tx: DbClient = this.prisma,
  ) {
    void clinicId;
    return tx.whatsAppBookingRequest.update({
      where: { id: bookingRequestId },
      data: {
        state: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
        actedByUserId: actorUserId,
      },
    });
  }

  async markMoved(
    clinicId: string,
    bookingRequestId: string,
    actorUserId: string,
    movedToBookingId: string,
    tx: DbClient = this.prisma,
  ) {
    void clinicId;
    return tx.whatsAppBookingRequest.update({
      where: { id: bookingRequestId },
      data: { state: 'MOVED', movedToBookingId, actedByUserId: actorUserId },
    });
  }

  async expireStale(clinicId: string, olderThan: Date, tx: DbClient = this.prisma) {
    return tx.whatsAppBookingRequest.updateMany({
      where: { clinicId, state: 'AWAITING_SLOT_CHOICE', createdAt: { lt: olderThan } },
      data: { state: 'EXPIRED' },
    });
  }

  /** D-08: the slot service excludes these when generating the next offer. */
  async getBookedSlotMinutes(clinicId: string, fromDate: Date, toDate: Date) {
    return this.prisma.whatsAppSlotHold.findMany({
      where: { clinicId, slotDate: { gte: fromDate, lte: toDate } },
      select: { slotDate: true, slotStartMinutes: true },
    });
  }
}
