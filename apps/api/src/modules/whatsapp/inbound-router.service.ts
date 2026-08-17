/**
 * WHA-01/WHA-05 — InboundRouterService: turns a normalized inbound event
 * into a domain action, or into nothing at all (07-RESEARCH § Anti-Pattern
 * A8, D-09).
 *
 * There is deliberately no NLP anywhere in this file. Text is matched
 * against an exact two-keyword allowlist (`STOP`, `BOOK`); button and list
 * payloads are matched against `WA_BUTTON_PAYLOAD_PATTERN`, a structural
 * allowlist that has no entry for the cancel or move booking actions (D-09)
 * — moving or cancelling a confirmed booking is staff-only, via an
 * authenticated API endpoint, and is not even expressible as an inbound
 * payload. Anything outside both allowlists is recorded as a plain inbound
 * message and dispatches to no handler.
 *
 * The booking flow (07-10) and the reminder task service (07-11) land in the
 * NEXT wave, after this plan. `BookingInboundHandler` and
 * `ReminderReplyHandler` are injected interfaces with safe no-op defaults so
 * this file has ZERO import from a `booking/` or `reminders/` directory —
 * those two plans supply the real implementations at route-composition time.
 */

import type { PrismaClient } from '@prisma/client';
import { WA_BUTTON_PAYLOAD_PATTERN } from '@breeyo/types';
import { AuditEvent, writeAuditLog } from '../../lib/audit-log.js';
import { toE164 } from '../../lib/phone.js';
import type { WhatsAppRepository, WaChannelDb } from './whatsapp.repository.js';
import type { DeliveryStatusService } from './delivery-status.service.js';
import type { WaInboundEvent } from './providers/wa-provider.port.js';

/** The 24h customer-service-window duration (07-RESEARCH § Pattern 1 / D-16). */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How far back a bare-text reply (no `replyToProviderMessageId`) may still
 * be attributed to an outstanding reminder. Deliberately generous relative
 * to `WA_ESCALATION.intervalDays` (3 days, 2 attempts): an owner replying to
 * the SECOND escalation attempt several days after the first must still
 * resolve to *a* reminder task, not silently attribute to nothing.
 */
const REMINDER_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Context every injected handler receives — enough to act without a second lookup. */
export interface InboundRouteContext {
  clinicId: string;
  threadId: string;
  ownerId: string;
  waPhone: string;
  occurredAt: Date;
}

export interface ReminderReplyContext extends InboundRouteContext {
  /**
   * The reminder task this reply is attributed to, or `null` when no
   * outstanding reminder could be matched (see the attribution comment on
   * `attributeReminderTask` below) — the handler still runs, because D-03
   * requires every reply to stop escalation, not only replies the router
   * could confidently attribute.
   */
  reminderTaskId: string | null;
}

/** Supplied by plan 07-10. A no-op default keeps this plan wave-independent. */
export interface BookingInboundHandler {
  startBooking(ctx: InboundRouteContext): Promise<void>;
  handlePayload(ctx: InboundRouteContext, payload: string): Promise<void>;
}

/** Supplied by plan 07-11. A no-op default keeps this plan wave-independent. */
export interface ReminderReplyHandler {
  markReplied(ctx: ReminderReplyContext): Promise<void>;
}

/**
 * Supplied by plan 08-10 Task 3. A no-op default keeps this file
 * wave-independent (identical convention to `BookingInboundHandler`/
 * `ReminderReplyHandler` above) — Phase 8's `OwnerActionService` is the real
 * implementation, injected at route-composition time.
 */
export interface AppointmentActionHandler {
  handleAction(ctx: InboundRouteContext, action: 'KEEP' | 'MOVE' | 'CANCEL', appointmentId: string): Promise<void>;
}

const noopBookingHandler: BookingInboundHandler = {
  async startBooking() {
    // No-op default (see file header) — 07-10 supplies the real handler.
  },
  async handlePayload() {
    // No-op default (see file header) — 07-10 supplies the real handler.
  },
};

const noopReminderReplyHandler: ReminderReplyHandler = {
  async markReplied() {
    // No-op default (see file header) — 07-11 supplies the real handler.
  },
};

const noopAppointmentActionHandler: AppointmentActionHandler = {
  async handleAction() {
    // No-op default — plan 08-10 Task 3 supplies the real handler
    // (`OwnerActionService`) at route-composition time (plan 08-11).
  },
};

export interface InboundRouterDeps {
  repository: WhatsAppRepository;
  // The admin `PrismaClient`, matching `WhatsAppRepository`/
  // `DeliveryStatusService` — this router has no request context (it is
  // called from the unauthenticated webhook and from BullMQ workers).
  prisma: PrismaClient;
  deliveryStatusService: DeliveryStatusService;
  bookingHandler?: BookingInboundHandler;
  reminderHandler?: ReminderReplyHandler;
  appointmentActionHandler?: AppointmentActionHandler;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** Only TEXT/BUTTON_REPLY/LIST_REPLY carry a reply-context id; STATUS/UNSUPPORTED do not. */
function replyToProviderMessageIdOf(event: WaInboundEvent): string | null {
  return event.kind === 'TEXT' || event.kind === 'BUTTON_REPLY' || event.kind === 'LIST_REPLY'
    ? event.replyToProviderMessageId
    : null;
}

/** A short preview for the thread list row, mirroring `whatsapp.service.ts`'s 120-char cap. */
function previewOf(event: WaInboundEvent): string {
  switch (event.kind) {
    case 'TEXT':
      return event.text.slice(0, 120);
    case 'BUTTON_REPLY':
    case 'LIST_REPLY':
      return event.label.slice(0, 120);
    case 'UNSUPPORTED':
      return `[Unsupported message: ${event.rawType}]`;
    default:
      return '';
  }
}

/** The stored body for an inbound `WhatsAppMessage` row. */
function bodyOf(event: WaInboundEvent): string {
  switch (event.kind) {
    case 'TEXT':
      return event.text;
    case 'BUTTON_REPLY':
    case 'LIST_REPLY':
      return event.label;
    case 'UNSUPPORTED':
      // A placeholder body, never dropped — WHA-05 requires every flow to be
      // logged, including message types Beta does not otherwise understand.
      return `[Unsupported message type: ${event.rawType}]`;
    default:
      return '';
  }
}

export class InboundRouterService {
  private readonly bookingHandler: BookingInboundHandler;
  private readonly reminderHandler: ReminderReplyHandler;
  private readonly appointmentActionHandler: AppointmentActionHandler;

  constructor(private readonly deps: InboundRouterDeps) {
    this.bookingHandler = deps.bookingHandler ?? noopBookingHandler;
    this.reminderHandler = deps.reminderHandler ?? noopReminderReplyHandler;
    this.appointmentActionHandler = deps.appointmentActionHandler ?? noopAppointmentActionHandler;
  }

  /**
   * `channel` defaults to `CLOUD_API` (the real webhook's only caller shape)
   * — the simulator worker passes `SIMULATOR` explicitly so its own
   * auto-replies are labelled correctly in the thread (D-16's channel-label
   * requirement), even though they are routed through this exact same path.
   */
  async route(
    event: WaInboundEvent,
    clinicId: string,
    channel: WaChannelDb = 'CLOUD_API',
  ): Promise<void> {
    if (event.kind === 'STATUS') {
      await this.deps.deliveryStatusService.apply(
        event.providerMessageId,
        event.status,
        event.failure,
        event.occurredAt,
      );
      return;
    }

    const thread = await this.resolveThread(clinicId, event.from);
    if (!thread) {
      // No registered pet owner for this number in this clinic. Beta's
      // WhatsApp surface only ever talks to already-registered owners, so
      // there is nowhere to attach the message — documented discretion, not
      // an oversight.
      return;
    }

    const message = await this.recordInboundMessage(clinicId, thread.id, event, channel);
    if (!message) {
      // `providerMessageId` collided on the UNIQUE column: Meta (or the
      // simulator) redelivered an event we already processed. Return before
      // touching the thread or calling any handler — Pitfall 14 requires a
      // redelivery to be a complete no-op, not merely a non-duplicated row.
      return;
    }

    await this.bumpThreadActivity(clinicId, thread.id, event);

    const ctx: InboundRouteContext = {
      clinicId,
      threadId: thread.id,
      ownerId: thread.ownerId as string,
      waPhone: thread.waPhone as string,
      occurredAt: event.occurredAt,
    };

    await this.dispatch(event, ctx);

    // D-03: every owner-originated event stops bounded escalation, no matter
    // what it says — a reply is a reply, not a content check.
    const reminderTaskId = await this.attributeReminderTask(
      clinicId,
      thread.id,
      ctx.ownerId,
      event,
    );
    await this.reminderHandler.markReplied({ ...ctx, reminderTaskId });
  }

  /**
   * Resolves the thread for an inbound `from`, matching Meta's plus-less
   * `wa_id` form against the `+`-prefixed key `WhatsAppThread.waPhone` is
   * stored under (Pitfall 9) by normalizing through `toE164` before either
   * lookup. Creates a new thread — looking the owner up by their registered
   * mobile number — when no thread exists yet for this number.
   */
  private async resolveThread(clinicId: string, from: string) {
    const waPhone = toE164(from);

    const existing = await this.deps.repository.findThreadByPhone(clinicId, waPhone);
    if (existing) return existing;

    const owner = await this.deps.prisma.petOwner.findFirst({ where: { clinicId, mobile: waPhone } });
    if (!owner) return null;

    return this.deps.repository.upsertThread(clinicId, { ownerId: owner.id, waPhone });
  }

  private async recordInboundMessage(
    clinicId: string,
    threadId: string,
    event: WaInboundEvent,
    channel: WaChannelDb,
  ) {
    try {
      return await this.deps.repository.createInboundMessage(clinicId, {
        threadId,
        channel,
        providerMessageId: event.providerMessageId,
        replyToProviderMessageId: replyToProviderMessageIdOf(event),
        body: bodyOf(event),
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        return null;
      }
      throw err;
    }
  }

  /** Resets the 24h service window to `occurredAt + 24h` on every owner-originated event (D-16 window model). */
  private async bumpThreadActivity(
    clinicId: string,
    threadId: string,
    event: WaInboundEvent,
  ): Promise<void> {
    await this.deps.prisma.whatsAppThread.updateMany({
      where: { id: threadId, clinicId },
      data: {
        lastMessageAt: event.occurredAt,
        lastMessagePreview: previewOf(event),
        serviceWindowExpiresAt: new Date(event.occurredAt.getTime() + SERVICE_WINDOW_MS),
      },
    });
  }

  private async dispatch(event: WaInboundEvent, ctx: InboundRouteContext): Promise<void> {
    if (event.kind === 'TEXT') {
      const keyword = event.text.trim().toUpperCase();
      if (keyword === 'STOP') {
        await this.optOut(ctx);
      } else if (keyword === 'BOOK') {
        await this.bookingHandler.startBooking(ctx);
      }
      // Anything else is free text: Beta exposes no NLP (Anti-Pattern A8) —
      // it is recorded as a plain inbound message (already done above) and
      // dispatches to nothing.
      return;
    }

    if (event.kind === 'BUTTON_REPLY') {
      await this.dispatchPayload(event.payload, ctx);
      return;
    }

    if (event.kind === 'LIST_REPLY') {
      await this.dispatchPayload(event.rowId, ctx);
      return;
    }

    // UNSUPPORTED: already recorded as an inbound message with a placeholder
    // body; no handler is registered for it.
  }

  private async dispatchPayload(payload: string, ctx: InboundRouteContext): Promise<void> {
    if (!WA_BUTTON_PAYLOAD_PATTERN.test(payload)) {
      // Not in the allowlist. The cancel and move booking actions have no
      // entry in `WA_BUTTON_PAYLOAD_PATTERN` at all (D-09) — a crafted owner
      // reply cannot cancel or move a booking. Anything else (a stale or
      // unregistered payload such as `appointment:keep:*`) is silently
      // dropped rather than interpreted; the event is still recorded as a
      // plain inbound message above.
      return;
    }

    if (payload === 'STOP') {
      await this.optOut(ctx);
      return;
    }

    if (payload === 'BOOK' || payload === 'book:start') {
      await this.bookingHandler.startBooking(ctx);
      return;
    }

    // Phase 8 plan 08-10 Task 3 (D-15, D-16): the owner KEEP/MOVE/CANCEL
    // bridge — `appointment:keep:<uuid>`, `appointment:move:<uuid>` and
    // `appointment:cancel:<uuid>` all dispatch to `OwnerActionService` via
    // the injected `AppointmentActionHandler`, never to `bookingHandler`,
    // which knows nothing about real `Appointment` rows.
    if (payload.startsWith('appointment:keep:')) {
      await this.appointmentActionHandler.handleAction(ctx, 'KEEP', payload.slice('appointment:keep:'.length));
      return;
    }
    if (payload.startsWith('appointment:move:')) {
      await this.appointmentActionHandler.handleAction(ctx, 'MOVE', payload.slice('appointment:move:'.length));
      return;
    }
    if (payload.startsWith('appointment:cancel:')) {
      await this.appointmentActionHandler.handleAction(ctx, 'CANCEL', payload.slice('appointment:cancel:'.length));
      return;
    }

    // Only `booking:confirm:<uuid>` / `booking:slot:<uuid>` remain in the
    // grammar at this point — both are in-flow booking payloads.
    await this.bookingHandler.handlePayload(ctx, payload);
  }

  /** D-10/D-11: a single global per-owner reminder opt-out, audited (T-07-09-05 adjacent compliance trail). */
  private async optOut(ctx: InboundRouteContext): Promise<void> {
    await this.deps.repository.upsertOwnerPreference(ctx.clinicId, ctx.ownerId, {
      remindersOptedOut: true,
      source: 'OWNER_STOP',
    });

    await writeAuditLog(this.deps.prisma, AuditEvent.WHATSAPP_OPT_OUT, {
      clinicId: ctx.clinicId,
      metadata: { ownerId: ctx.ownerId, source: 'OWNER_STOP' },
    });
  }

  /**
   * Attribution order (documented, not an oversight — bare text replies
   * carry no reply-context of their own):
   *
   * 1. `replyToProviderMessageId` resolved to a message row, and that
   *    message's `reminderTaskId` — the precise case, when the owner replied
   *    directly to a specific template send.
   * 2. Otherwise, the most recently attempted `SENT` reminder task for this
   *    owner on this thread, bounded to `REMINDER_ATTRIBUTION_WINDOW_MS` —
   *    the ambiguous case, when the owner sent a bare text reply with no
   *    reply-context at all. This can attribute to the wrong one of several
   *    outstanding reminders; there is no way to do better without NLP,
   *    which Beta does not have (Anti-Pattern A8).
   * 3. `null` when neither resolves — the handler still runs (D-03).
   */
  private async attributeReminderTask(
    clinicId: string,
    threadId: string,
    ownerId: string,
    event: WaInboundEvent,
  ): Promise<string | null> {
    const replyTo = replyToProviderMessageIdOf(event);

    if (replyTo) {
      const original = await this.deps.prisma.whatsAppMessage.findFirst({
        where: { providerMessageId: replyTo },
      });
      if (original?.reminderTaskId) {
        return original.reminderTaskId as string;
      }
    }

    const windowStart = new Date(event.occurredAt.getTime() - REMINDER_ATTRIBUTION_WINDOW_MS);
    const fallback = await this.deps.prisma.whatsAppReminderTask.findFirst({
      where: {
        clinicId,
        ownerId,
        state: 'SENT',
        lastAttemptAt: { gte: windowStart, lte: event.occurredAt },
      },
      orderBy: { lastAttemptAt: 'desc' },
    });

    // `threadId` narrows the fallback conceptually (the reply arrived on
    // this thread) but `WhatsAppReminderTask` has no `threadId` column of
    // its own — `ownerId` is the closest available scope, which is
    // sufficient because a thread is 1:1 with an owner in this schema.
    void threadId;

    return fallback?.id ?? null;
  }
}
