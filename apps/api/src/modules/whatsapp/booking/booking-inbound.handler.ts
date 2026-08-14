/**
 * WHA-03 — `createBookingInboundHandler`: the `BookingInboundHandler`
 * implementation injected into `InboundRouterService` (07-09).
 *
 * D-21 (amendment locked after 07-10-PLAN.md was written): before ever
 * offering a slot, the owner must be asked which pet the appointment is
 * for.
 *   - Exactly ONE pet on file  -> skip the picker, proceed straight to slot
 *     offering (the common case should not get harder).
 *   - MORE THAN ONE pet        -> send an interactive list of the owner's
 *     pets (`booking:pet:<petId>` rows) and create NO
 *     `WhatsAppBookingRequest` row yet; a later `booking:pet:<petId>` reply
 *     resumes into slot offering for that pet.
 *   - ZERO pets                -> a call-the-clinic fallback, `needsAction`
 *     flagged, no booking row created.
 *
 * D-09: this file never calls `BookingService.cancelBooking` or
 * `.moveBooking` — both require a staff `actorUserId` that no inbound event
 * carries. `WA_BUTTON_PAYLOAD_PATTERN` (07-02, extended for D-21) has no
 * entry for `booking:cancel:*`/`booking:move:*` at all, so
 * `inbound-router.service.ts`'s `dispatchPayload` never even reaches
 * `handlePayload` for those payloads — see
 * `apps/api/tests/whatsapp/booking.test.ts`'s router-level proof.
 *
 * Slot offers never trust the inbound payload to carry a time (Tampering,
 * T-07-10-04): each offered row's `description` carries the exact slot the
 * owner is choosing between, persisted on the outbound message's
 * `interactiveOptions` — `handlePayload` resolves the row id back to that
 * stored slot rather than parsing anything out of the payload itself.
 *
 * Fix (post-07-10, WHA-03/D-14): `createOutboundMessage` alone only
 * persists a QUEUED row — it does not dispatch anything. Every message this
 * file creates (the pet-picker list, the slot-picker list, and the
 * no-working-hours/fully-booked/no-pets/slot-taken plain-text fallbacks)
 * must ALSO enqueue a `whatsapp-outbound` job, exactly like
 * `WhatsAppService.sendTemplate` does (`whatsapp.service.ts`), or the
 * message never reaches a provider and the booking flow silently stalls.
 * `sendText`/`sendList` below both enqueue after creating their message.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { WA_CAPABILITY_LIMITS, type WaListRow } from '@breeyo/types';
import type { BookingInboundHandler, InboundRouteContext } from '../inbound-router.service.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';
import { WA_JOB_OPTIONS } from '../whatsapp-queue.js';
import { BookingService } from './booking.service.js';
import { SlotService, type GeneratedSlot } from './slot.service.js';

export interface BookingInboundHandlerDeps {
  prisma: PrismaClient;
  repository: WhatsAppRepository;
  bookingService: BookingService;
  slotService: SlotService;
  /** Same narrow shape as `WhatsAppService`'s `WaOutboundQueueLike` — a
   * `{ add: vi.fn() }` fake satisfies it in tests without a real Redis. */
  outboundQueue: import('bullmq').Queue;
}

interface StoredSlotMeta {
  bookingId: string;
  slotDate: string; // ISO
  slotStartMinutes: number;
  slotDurationMinutes: number;
}

const PET_PAYLOAD_PREFIX = 'booking:pet:';
const SLOT_PAYLOAD_PREFIX = 'booking:slot:';

const NO_WORKING_HOURS_REPLY =
  "We don't have online booking hours set up yet. Please call the clinic to book a time.";
const FULLY_BOOKED_REPLY =
  "We don't have any open slots in the next couple of weeks. Please call the clinic to book a time.";
const NO_PETS_REPLY =
  "We couldn't find a pet on file for you. Please call the clinic to book a visit.";
const SLOT_TAKEN_REPLY = 'Sorry, that time was just taken. Please pick another time below.';
const PICK_PET_BODY = 'Which pet is this appointment for?';
const PICK_SLOT_BODY = 'Great — pick a time for the appointment:';

export function createBookingInboundHandler(deps: BookingInboundHandlerDeps): BookingInboundHandler {
  /**
   * Enqueues the just-created message for dispatch — the same
   * `jobId: 'send:' + messageId` + `WA_JOB_OPTIONS` shape
   * `WhatsAppService.sendTemplate`/`retryMessage` already use, so
   * `outbound.worker.ts`'s replay-safe `processOutboundJob` picks it up
   * identically regardless of which code path enqueued it.
   */
  async function enqueueOutbound(messageId: string) {
    await deps.outboundQueue.add(
      'send',
      { messageId },
      { jobId: `send:${messageId}`, ...WA_JOB_OPTIONS },
    );
  }

  async function sendText(ctx: InboundRouteContext, body: string) {
    const message = await deps.repository.createOutboundMessage(ctx.clinicId, {
      threadId: ctx.threadId,
      channel: 'SIMULATOR',
      body,
      contextType: 'BOOKING',
    });
    await deps.repository.touchThread(ctx.clinicId, ctx.threadId, {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 120),
      lastContextType: 'BOOKING',
    });
    await enqueueOutbound(message.id as string);
  }

  async function sendList(
    ctx: InboundRouteContext,
    body: string,
    rows: WaListRow[],
    contextId: string | null = null,
  ) {
    const message = await deps.repository.createOutboundMessage(ctx.clinicId, {
      threadId: ctx.threadId,
      channel: 'SIMULATOR',
      body,
      interactiveOptions: rows,
      contextType: 'BOOKING',
      contextId,
    });
    await deps.repository.touchThread(ctx.clinicId, ctx.threadId, {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 120),
      lastContextType: 'BOOKING',
    });
    await enqueueOutbound(message.id as string);
  }

  function buildSlotRows(bookingId: string, slots: GeneratedSlot[]): WaListRow[] {
    return slots.slice(0, WA_CAPABILITY_LIMITS.maxListRows).map((slot) => {
      const meta: StoredSlotMeta = {
        bookingId,
        slotDate: slot.slotDate.toISOString(),
        slotStartMinutes: slot.slotStartMinutes,
        slotDurationMinutes: slot.slotDurationMinutes,
      };
      return {
        id: `${SLOT_PAYLOAD_PREFIX}${randomUUID()}`,
        title: slot.label,
        description: JSON.stringify(meta),
      };
    });
  }

  /** Sends (or re-sends) the slot-offer list for an already-existing AWAITING_SLOT_CHOICE booking. */
  async function offerSlotList(ctx: InboundRouteContext, bookingId: string): Promise<void> {
    const offer = await deps.slotService.getOfferableSlots(ctx.clinicId);

    if (offer.reason === 'NO_WORKING_HOURS') {
      await sendText(ctx, NO_WORKING_HOURS_REPLY);
      await deps.repository.flagNeedsAction(ctx.clinicId, ctx.threadId, 'BOOKING_NO_WORKING_HOURS');
      return;
    }
    if (offer.reason === 'FULLY_BOOKED') {
      await sendText(ctx, FULLY_BOOKED_REPLY);
      await deps.repository.flagNeedsAction(ctx.clinicId, ctx.threadId, 'BOOKING_FULLY_BOOKED');
      return;
    }

    await sendList(ctx, PICK_SLOT_BODY, buildSlotRows(bookingId, offer.slots), bookingId);
  }

  /** Creates the booking row for `petId`, THEN offers slots for it (D-06's slot-offer step). */
  async function startBookingForPet(ctx: InboundRouteContext, petId: string): Promise<void> {
    const offer = await deps.slotService.getOfferableSlots(ctx.clinicId);

    if (offer.reason === 'NO_WORKING_HOURS') {
      await sendText(ctx, NO_WORKING_HOURS_REPLY);
      await deps.repository.flagNeedsAction(ctx.clinicId, ctx.threadId, 'BOOKING_NO_WORKING_HOURS');
      return;
    }
    if (offer.reason === 'FULLY_BOOKED') {
      await sendText(ctx, FULLY_BOOKED_REPLY);
      await deps.repository.flagNeedsAction(ctx.clinicId, ctx.threadId, 'BOOKING_FULLY_BOOKED');
      return;
    }

    const booking = await deps.bookingService.startBooking(ctx.clinicId, {
      threadId: ctx.threadId,
      ownerId: ctx.ownerId,
      petId,
    });

    await sendList(ctx, PICK_SLOT_BODY, buildSlotRows(booking.id as string, offer.slots), booking.id as string);
  }

  /** D-21: resolves which pet this booking is for before any slot is ever offered. */
  async function resolvePetThenStart(ctx: InboundRouteContext): Promise<void> {
    const pets = await deps.prisma.pet.findMany({
      where: { clinicId: ctx.clinicId, ownerId: ctx.ownerId },
      orderBy: { createdAt: 'asc' },
    });

    if (pets.length === 0) {
      await sendText(ctx, NO_PETS_REPLY);
      await deps.repository.flagNeedsAction(ctx.clinicId, ctx.threadId, 'BOOKING_NO_PETS');
      return;
    }

    if (pets.length === 1) {
      await startBookingForPet(ctx, pets[0].id as string);
      return;
    }

    // Multi-pet: send the picker. No WhatsAppBookingRequest row yet.
    const rows: WaListRow[] = pets.slice(0, WA_CAPABILITY_LIMITS.maxListRows).map((pet) => ({
      id: `${PET_PAYLOAD_PREFIX}${pet.id}`,
      title: (pet.name as string).slice(0, WA_CAPABILITY_LIMITS.maxListRowTitleChars),
    }));

    await sendList(ctx, PICK_PET_BODY, rows);
  }

  async function resolveSlotChoice(ctx: InboundRouteContext, rowId: string): Promise<void> {
    const meta = await findStoredSlotMeta(ctx, rowId);
    if (!meta) {
      // A stale or unrecognized row id (e.g. from a superseded offer) —
      // nothing to resolve; do nothing rather than guess at intent.
      return;
    }

    const result = await deps.bookingService.confirmSlot(ctx.clinicId, meta.bookingId, {
      date: new Date(meta.slotDate),
      startMinutes: meta.slotStartMinutes,
      durationMinutes: meta.slotDurationMinutes,
    });

    if (result.outcome === 'SLOT_TAKEN') {
      await sendText(ctx, SLOT_TAKEN_REPLY);
      await offerSlotList(ctx, meta.bookingId);
    }
    // CONFIRMED: BookingService.confirmSlot already queued the
    // booking_confirmation template send — nothing further to do here.
  }

  /**
   * Looks the row id up on recent BOOKING-context outbound messages for
   * this thread — the slot's real data lives in the row's `description`,
   * never in the payload itself (Tampering, T-07-10-04).
   */
  async function findStoredSlotMeta(
    ctx: InboundRouteContext,
    rowId: string,
  ): Promise<StoredSlotMeta | null> {
    const messages = await deps.prisma.whatsAppMessage.findMany({
      where: { clinicId: ctx.clinicId, threadId: ctx.threadId, contextType: 'BOOKING' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    for (const message of messages) {
      const options = (message.interactiveOptions ?? []) as unknown as WaListRow[];
      const row = options.find((option) => option.id === rowId);
      if (row?.description) {
        return JSON.parse(row.description) as StoredSlotMeta;
      }
    }
    return null;
  }

  return {
    async startBooking(ctx: InboundRouteContext): Promise<void> {
      await resolvePetThenStart(ctx);
    },

    async handlePayload(ctx: InboundRouteContext, payload: string): Promise<void> {
      if (payload.startsWith(PET_PAYLOAD_PREFIX)) {
        const petId = payload.slice(PET_PAYLOAD_PREFIX.length);
        // Verify the pet actually belongs to this owner/clinic rather than
        // trusting an arbitrary UUID in the reply (Tampering).
        const pet = await deps.prisma.pet.findFirst({
          where: { id: petId, clinicId: ctx.clinicId, ownerId: ctx.ownerId },
        });
        if (!pet) return;
        await startBookingForPet(ctx, pet.id as string);
        return;
      }

      if (payload.startsWith(SLOT_PAYLOAD_PREFIX)) {
        await resolveSlotChoice(ctx, payload);
        return;
      }

      // Anything else reaching here is not a payload this handler resolves
      // to an action (defense in depth — the router's WA_BUTTON_PAYLOAD_
      // PATTERN gate should already have filtered it out before this call).
    },
  };
}
