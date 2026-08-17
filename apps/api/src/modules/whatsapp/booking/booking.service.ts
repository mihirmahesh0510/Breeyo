/**
 * WHA-03 / D-06, D-07, D-08, D-09 — the booking state machine: start, offer
 * slots (handled by `SlotService`), auto-confirm via slot hold, staff-only
 * move/cancel, and expire.
 *
 * `confirmSlot` follows 07-RESEARCH § Code Example 5 EXACTLY: inside
 * `prisma.$transaction`, the `WhatsAppSlotHold` is inserted FIRST, then the
 * booking is flipped to CONFIRMED. Prisma error code P2002 (the unique
 * violation on `whatsapp_slot_holds(clinic_id, slot_date,
 * slot_start_minutes)`) is caught OUTSIDE the transaction and treated as the
 * business outcome `SLOT_TAKEN` — this is the whole point of D-07. There is
 * deliberately NO `findFirst`/`findUnique` availability pre-check anywhere
 * in this file: two concurrent inbound slot-pick events would both pass such
 * a check and both attempt to confirm, which is exactly the race D-07 exists
 * to prevent. The unique index is the arbiter; the catch block is the
 * business path — do not "improve" this into check-then-insert.
 *
 * `cancelBooking` and `moveBooking` require a REAL `actorUserId: string`
 * parameter — not optional, not nullable. That signature IS the structural
 * enforcement of D-09: an inbound WhatsApp event has no authenticated actor,
 * so `booking-inbound.handler.ts` cannot call either method even by
 * accident, and 07-02's `WA_BUTTON_PAYLOAD_PATTERN` plus 07-09's router
 * already refuse `booking:cancel:*`/`booking:move:*` payloads outright.
 *
 * Deliberately no walk-in queue row is ever created here (UI-SPEC: "Check in
 * manually when the owner arrives") — a Phase 7 booking is provisional,
 * not a walk-in check-in.
 */

import { customAlphabet } from 'nanoid';
import type { PrismaClient } from '@prisma/client';
import { AppointmentSource } from '@breeyo/types';
import { getTodayIST, minutesToIstDate } from '../../../lib/ist-date.js';
import { writeAuditLog, AuditEvent } from '../../../lib/audit-log.js';
import { formatSlotLabel } from './slot.service.js';
import { assertBookingTransition } from './booking.state.js';
import type { BookingRepository, SlotInput } from './booking.repository.js';
import type { WhatsAppService } from '../whatsapp.service.js';
import type { AppointmentService } from '../../scheduling/appointment.service.js';
import type { AvailabilityService } from '../../scheduling/availability.service.js';

const referenceSuffix = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 4);

/** BK-YYYYMM-XXXX, mirroring Phase 6's INV-YYYYMM-XXXX invoice-reference convention. */
export function generateReference(now: Date = new Date()): string {
  const ist = getTodayIST(now);
  const yyyymm = `${ist.getUTCFullYear()}${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
  return `BK-${yyyymm}-${referenceSuffix()}`;
}

/** Default window after which an unanswered AWAITING_SLOT_CHOICE booking expires. */
const DEFAULT_EXPIRY_HOURS = 24;

export interface BookingServiceDeps {
  repository: BookingRepository;
  // The admin PrismaClient — matching WhatsAppRepository/WhatsAppService's
  // own constructor typing. Kept as the raw PrismaClient (not the DbClient
  // union) so `$transaction(async (tx) => ...)` below stays unambiguous —
  // see the identical comment in whatsapp.service.ts.
  prisma: PrismaClient;
  whatsAppService: WhatsAppService;
  /**
   * Plan 08-10 Task 3 (D-12): when BOTH `appointmentService` and
   * `availability` are supplied, `confirmSlot` creates a real `Appointment`
   * (checked against real per-vet availability) instead of only flipping
   * this booking's own state — retiring the standalone slot-blocking
   * stopgap for the CONFIRMATION step specifically. Optional so Phase 7's
   * own pre-Phase-8 unit tests (constructed without these) keep exercising
   * the original hold-and-flip-state-only code path unmodified; production
   * wiring (plan 08-11, which is also where `AppointmentService` is first
   * constructed in this codebase) supplies both real instances.
   */
  appointmentService?: Pick<AppointmentService, 'createAppointment' | 'cancelAppointment'>;
  availability?: Pick<AvailabilityService, 'listVets'>;
}

export interface StartBookingInput {
  threadId: string;
  ownerId: string;
  petId: string;
}

export type ConfirmSlotResult =
  | { outcome: 'CONFIRMED'; booking: Awaited<ReturnType<BookingRepository['confirmBooking']>> }
  | { outcome: 'SLOT_TAKEN' }
  // Plan 08-10 (D-12): the real per-vet availability check (only run when
  // `appointmentService`/`availability` are configured) refused the slot —
  // surfaced as a decline reply, never a confirmed booking with no real
  // appointment behind it.
  | { outcome: 'UNAVAILABLE'; reason: string };

export type MoveBookingResult =
  | { outcome: 'CONFIRMED'; booking: Awaited<ReturnType<BookingRepository['confirmBooking']>> }
  | { outcome: 'SLOT_TAKEN' };

function bookingNotFoundError() {
  const error = new Error('WhatsApp booking request not found') as Error & {
    statusCode: number;
    code: string;
  };
  // 404, never 403 — matches vaccination.service.ts's precedent of not
  // disclosing whether a cross-tenant row exists.
  error.statusCode = 404;
  error.code = 'WHATSAPP_BOOKING_NOT_FOUND';
  return error;
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  /** D-06: creates the AWAITING_SLOT_CHOICE row; no staff gate anywhere in this path. */
  async startBooking(clinicId: string, input: StartBookingInput) {
    return this.deps.repository.createBookingRequest(clinicId, {
      threadId: input.threadId,
      ownerId: input.ownerId,
      petId: input.petId,
      reference: generateReference(),
    });
  }

  /**
   * D-06/D-07/D-08 (07-RESEARCH § Code Example 5). Inserts the slot hold
   * FIRST inside a transaction, then flips the booking to CONFIRMED. P2002
   * on the hold insert (another request already took this slot) is the
   * business outcome SLOT_TAKEN — no partial state survives because the
   * whole transaction rolls back.
   *
   * Plan 08-10 (D-12): when `appointmentService`/`availability` are
   * configured, a real `Appointment` is created FIRST — before any Phase 7
   * state changes — through `AppointmentService.createAppointment`, which
   * revalidates timing/availability/blocked-periods/double-booking exactly
   * like a staff booking. `AppointmentService.createAppointment` runs its
   * own `prisma.$transaction` internally (D-34's advisory lock), so it
   * cannot be nested inside this method's OWN transaction below — the two
   * steps run sequentially instead: create the appointment, then (only on
   * success) run the existing hold-then-confirm transaction. A failure at
   * the appointment step leaves no Phase 7 state changed at all (an early,
   * clean decline); a failure at the hold step (a genuine SLOT_TAKEN race)
   * compensates by cancelling the appointment just created.
   */
  async confirmSlot(
    clinicId: string,
    bookingId: string,
    slot: SlotInput & { durationMinutes: number },
  ): Promise<ConfirmSlotResult> {
    const booking = await this.deps.repository.findBookingRequestById(clinicId, bookingId);
    if (!booking) {
      throw bookingNotFoundError();
    }
    assertBookingTransition(booking.state as never, 'CONFIRMED' as never);

    let createdAppointmentId: string | null = null;
    if (this.deps.appointmentService && this.deps.availability) {
      const outcome = await this.createRealAppointmentForBooking(clinicId, bookingId, booking, slot);
      if (outcome.outcome === 'UNAVAILABLE') {
        return outcome;
      }
      createdAppointmentId = outcome.appointmentId;
    }

    try {
      const confirmed = await this.deps.prisma.$transaction(async (tx) => {
        // The unique index — not application logic — arbitrates D-07. No
        // findFirst/findUnique precedes this insert (see file header).
        await this.deps.repository.createSlotHold(
          clinicId,
          bookingId,
          { date: slot.date, startMinutes: slot.startMinutes },
          tx as unknown as never,
        );

        // D-06: auto-confirm, no staff gate.
        return this.deps.repository.confirmBooking(
          clinicId,
          bookingId,
          slot,
          tx as unknown as never,
        );
      });

      // D-12: if Phase 7 shipped `supersededByAppointmentId`, link the
      // booking request to the real appointment it produced — a direct
      // update rather than widening `BookingRepository.confirmBooking`'s
      // typed input, which is out of this task's declared file scope.
      if (createdAppointmentId) {
        await this.deps.prisma.whatsAppBookingRequest.update({
          where: { id: bookingId },
          data: { supersededByAppointmentId: createdAppointmentId },
        });
      }

      await this.sendConfirmationTemplate(clinicId, confirmed);

      return { outcome: 'CONFIRMED', booking: confirmed };
    } catch (err) {
      // P2002 = unique violation => another request took this slot first (D-07).
      if (isPrismaError(err, 'P2002')) {
        // D-12 compensation: the real appointment was already created above
        // (its own availability check passed), but the slot-hold race lost
        // — cancel it rather than leaving an orphaned Appointment behind an
        // AWAITING_SLOT_CHOICE booking.
        if (createdAppointmentId && this.deps.appointmentService) {
          await this.deps.appointmentService.cancelAppointment({
            clinicId,
            userId: booking.actedByUserId as string | null ?? (booking.ownerId as string),
            appointmentId: createdAppointmentId,
            scope: 'ONE',
            reason: 'WhatsApp slot lost the confirmation race',
          } as never);
        }
        return { outcome: 'SLOT_TAKEN' };
      }
      throw err;
    }
  }

  /**
   * D-12: resolves a real vet (Phase 7's booking flow has no vet concept of
   * its own — `AvailabilityService.listVets`, the SAME id-sorted vet list
   * plan 08-05's UI already depends on, supplies the first one) and creates
   * a real `Appointment` via `AppointmentService.createAppointment`,
   * checked against that vet's real availability/horizon/blocked-periods.
   * Any domain error from that check (VET_NOT_AVAILABLE, SLOT_BLOCKED,
   * SLOT_IN_PAST, BOOKING_HORIZON_EXCEEDED, SLOT_DOUBLE_BOOKED) is
   * translated into a decline outcome rather than thrown — the whole point
   * of this method existing separately from the try/catch below, which is
   * reserved for the SLOT_TAKEN race.
   */
  private async createRealAppointmentForBooking(
    clinicId: string,
    bookingId: string,
    booking: { ownerId: unknown; petId: unknown },
    slot: SlotInput & { durationMinutes: number },
  ): Promise<{ outcome: 'CREATED'; appointmentId: string } | { outcome: 'UNAVAILABLE'; reason: string }> {
    const vets = await this.deps.availability!.listVets(clinicId);
    const vet = vets[0];
    if (!vet) {
      return { outcome: 'UNAVAILABLE', reason: 'NO_VET_CONFIGURED' };
    }

    const scheduledFor = minutesToIstDate(slot.date, slot.startMinutes);

    try {
      const result = await this.deps.appointmentService!.createAppointment({
        clinicId,
        // No staff actor exists for an owner-confirmed WhatsApp booking;
        // the resolved vet doubles as the createdById (a real User in the
        // clinic), matching OwnerActionService's identical "no owner User
        // row exists" resolution for cancelAppointment's userId (see
        // owner-action.service.ts).
        userId: vet.id,
        ownerId: booking.ownerId as string,
        petIds: [booking.petId as string],
        vetId: vet.id,
        scheduledFor,
        allowDoubleBook: false,
        source: AppointmentSource.WHATSAPP,
        whatsappBookingRequestId: bookingId,
      } as never);
      const appointment = result.appointments[0];
      return { outcome: 'CREATED', appointmentId: appointment.id };
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'UNKNOWN';
      // A genuine domain decline (VET_NOT_AVAILABLE, SLOT_BLOCKED,
      // SLOT_IN_PAST, BOOKING_HORIZON_EXCEEDED, SLOT_DOUBLE_BOOKED) is
      // expected and self-explanatory from `reason` alone in the caller's
      // reply — but this catch-all also swallows a Zod validation failure or
      // a raw DB/connection error, mapping either into the identical
      // business UNAVAILABLE outcome with no server-side trace at all. Log
      // unconditionally (this file has no logger dependency of its own — see
      // the codebase's established `console.error` convention, e.g.
      // `appointment.service.ts`'s `runChangeHook`) so an infra failure here
      // is still visible even though the owner only ever sees "not available".
      console.error('BookingService.createRealAppointmentForBooking failed', { bookingId, code, err });
      return { outcome: 'UNAVAILABLE', reason: code };
    }
  }

  /** D-09: staff-only. D-25: releases the hold immediately. */
  async cancelBooking(clinicId: string, bookingId: string, actorUserId: string, reason?: string) {
    const booking = await this.deps.repository.findBookingRequestById(clinicId, bookingId);
    if (!booking) {
      throw bookingNotFoundError();
    }
    assertBookingTransition(booking.state as never, 'CANCELLED' as never);

    const cancelled = await this.deps.prisma.$transaction(async (tx) => {
      await this.deps.repository.deleteSlotHoldByBookingId(clinicId, bookingId, tx as unknown as never);
      return this.deps.repository.cancelBooking(
        clinicId,
        bookingId,
        actorUserId,
        reason ?? null,
        tx as unknown as never,
      );
    });

    await writeAuditLog(this.deps.prisma, AuditEvent.WHATSAPP_BOOKING_CANCELLED, {
      userId: actorUserId,
      clinicId,
      metadata: { bookingId, reason: reason ?? null },
    });

    return cancelled;
  }

  /**
   * D-09: staff-only. D-25: releases the old hold and re-acquires atomically.
   * The old booking transitions to a terminal MOVED state; a NEW CONFIRMED
   * row is created rather than mutating the old one further (matches
   * `WA_BOOKING_TRANSITIONS`: MOVED has no outgoing transitions).
   */
  async moveBooking(
    clinicId: string,
    bookingId: string,
    actorUserId: string,
    newSlot: SlotInput & { durationMinutes: number },
  ): Promise<MoveBookingResult> {
    const booking = await this.deps.repository.findBookingRequestById(clinicId, bookingId);
    if (!booking) {
      throw bookingNotFoundError();
    }
    assertBookingTransition(booking.state as never, 'MOVED' as never);

    try {
      const confirmedNew = await this.deps.prisma.$transaction(async (tx) => {
        // Release the old hold first; if the new hold below collides
        // (P2002), the ENTIRE transaction rolls back, so the old hold is
        // never actually lost — D-25's "release and re-acquire" stays
        // atomic rather than a two-step release-then-maybe-fail.
        await this.deps.repository.deleteSlotHoldByBookingId(clinicId, bookingId, tx as unknown as never);

        const newBooking = await this.deps.repository.createBookingRequest(
          clinicId,
          {
            threadId: booking.threadId as string,
            ownerId: booking.ownerId as string,
            petId: booking.petId as string,
            reference: generateReference(),
          },
          tx as unknown as never,
        );

        await this.deps.repository.createSlotHold(
          clinicId,
          newBooking.id as string,
          { date: newSlot.date, startMinutes: newSlot.startMinutes },
          tx as unknown as never,
        );

        const confirmed = await this.deps.repository.confirmBooking(
          clinicId,
          newBooking.id as string,
          newSlot,
          tx as unknown as never,
        );

        await this.deps.repository.markMoved(
          clinicId,
          bookingId,
          actorUserId,
          newBooking.id as string,
          tx as unknown as never,
        );

        return confirmed;
      });

      await writeAuditLog(this.deps.prisma, AuditEvent.WHATSAPP_BOOKING_MOVED, {
        userId: actorUserId,
        clinicId,
        metadata: { bookingId, movedToBookingId: confirmedNew.id },
      });

      await this.sendConfirmationTemplate(clinicId, confirmedNew);

      return { outcome: 'CONFIRMED', booking: confirmedNew };
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        return { outcome: 'SLOT_TAKEN' };
      }
      throw err;
    }
  }

  /** No hold was ever taken for an AWAITING_SLOT_CHOICE booking, so expiry releases nothing. */
  async expireStaleRequests(
    clinicId: string,
    olderThanHours: number = DEFAULT_EXPIRY_HOURS,
    now: Date = new Date(),
  ) {
    const cutoff = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000);
    return this.deps.repository.expireStale(clinicId, cutoff);
  }

  /**
   * Queues the `booking_confirmation` template through the existing
   * persist-then-dispatch path (`WhatsAppService.sendTemplate`) — reusing it
   * rather than a second outbox mechanism. `userId: null` marks this as an
   * automated (non-staff-initiated) send, matching the reminder sweep's
   * shape.
   */
  private async sendConfirmationTemplate(
    clinicId: string,
    booking: { id: string; threadId: string; ownerId: string; petId: string; reference: string; slotDate: Date | null; slotStartMinutes: number | null },
  ): Promise<void> {
    const [thread, owner, pet] = await Promise.all([
      this.deps.prisma.whatsAppThread.findFirst({ where: { id: booking.threadId, clinicId } }),
      this.deps.prisma.petOwner.findFirst({ where: { id: booking.ownerId, clinicId } }),
      this.deps.prisma.pet.findFirst({ where: { id: booking.petId, clinicId } }),
    ]);

    // Defensive: should never happen in practice (every FK is validated at
    // booking-creation time) — but a missing lookup must not crash
    // confirmation itself, which has already committed.
    if (!thread || !owner || !pet || booking.slotDate == null || booking.slotStartMinutes == null) {
      return;
    }

    await this.deps.whatsAppService.sendTemplate(
      {
        ownerId: booking.ownerId,
        waPhone: thread.waPhone as string,
        templateKey: 'booking_confirmation',
        variables: {
          owner_name: owner.name as string,
          pet_name: pet.name as string,
          slot_label: formatSlotLabel(booking.slotDate, booking.slotStartMinutes),
          booking_reference: booking.reference,
        },
        contextType: 'BOOKING',
        contextId: booking.id,
        petId: booking.petId,
      },
      { clinicId, userId: null },
    );
  }
}
