/**
 * D-14, D-15 — the simulator's deterministic auto-reply generator.
 *
 * A pure function with no pseudo-random number generation and no clock
 * reads beyond the passed-in `occurredAt`: called twice with identical
 * input, it returns identical output. This is what makes pilot-clinic
 * demos feel alive (D-14) without ever introducing an unpredictable outcome
 * (D-15).
 *
 * D-15: for booking action cards the reply always takes the positive/
 * default confirm path, never a staff-driven move or cancellation.
 * D-09: moving or cancelling a confirmed booking is staff-only — those
 * actions are not even inbound-expressible, so this generator has no code
 * path that could produce that kind of payload.
 */

import type { WaTemplateKey } from '@breeyo/types';
import type { WaButtonSpec, WaInboundEvent, WaListRow } from '../wa-provider.port.js';

export interface SimulatedReplyInput {
  /** The provider message id of the outbound message this reply answers. */
  outboundProviderMessageId: string;
  /** The owner's wa_id (plus-less), mirroring Meta's inbound `from`. */
  from: string;
  /**
   * Absent for a freeform send (the booking flow's pet/slot pickers and
   * plain-text fallbacks) — present only for a template send.
   */
  templateKey?: WaTemplateKey;
  /** The buttons the outbound message offered, if any. */
  buttons: WaButtonSpec[];
  /**
   * The rows a freeform interactive-list send offered, if any (the booking
   * flow's pet/slot pickers — a dynamically generated list, never one of
   * the six fixed templates, so it cannot travel via `templateKey`).
   */
  list?: { rows: WaListRow[] };
  occurredAt: Date;
}

/** D-09: only the confirm prefix is ever matched — see file header. */
const BOOKING_CONFIRM_PREFIX = 'booking:confirm:';

/**
 * Short, fixed acknowledgements per template. `invoice_delivery`'s ack is
 * deliberately generic — it must never read as a payment confirmation,
 * since the simulator has no way to know whether the owner actually paid.
 */
const TEMPLATE_ACK_TEXT: Record<WaTemplateKey, string> = {
  invoice_delivery: 'Thanks, got it!',
  payment_reminder: 'Thanks, got it!',
  follow_up_reminder: 'Thanks for the reminder, noted!',
  vaccine_due: 'Thanks for the reminder, noted!',
  deworming_due: 'Thanks for the reminder, noted!',
  booking_confirmation: 'Thanks, noted!',
  // Phase 8 (D-17/D-18): the simulator's deterministic auto-reply for the
  // appointment reminder template. A generic acknowledgement, not KEEP --
  // the simulator's auto-reply worker answers with a plain ack for every
  // template it does not have dedicated D-15 button logic for.
  appointment_reminder: 'Thanks for the reminder, noted!',
};

/**
 * Used only when `templateKey` is absent AND neither a list nor buttons were
 * offered — a plain-text-only freeform send. `SimulatorProvider.sendFreeform`
 * never schedules an auto-reply job for that shape (nothing to choose), so
 * this path should rarely if ever be hit in practice; it exists so this
 * function never crashes on an unexpected input shape.
 */
const GENERIC_ACK_TEXT = 'Thanks, got it!';

/**
 * Builds the simulator's auto-reply to an outbound message.
 *
 * Precedence, all deterministic (D-15 — zero randomness for any offered
 * choice):
 *   1. If the outbound message offered an interactive LIST (the booking
 *      flow's dynamically generated pet/slot pickers — never one of the six
 *      fixed templates), the reply is a `LIST_REPLY` that always picks the
 *      FIRST row offered.
 *   2. Else if it offered buttons, the reply is a `BUTTON_REPLY` that always
 *      picks the positive/first option: the first button whose id starts
 *      with `booking:confirm:`, or — if none does — the first button
 *      offered.
 *   3. Otherwise the reply is a short fixed `TEXT` acknowledgement keyed by
 *      template, or a generic fallback if there is no template key either.
 */
export function buildSimulatedReply(input: SimulatedReplyInput): WaInboundEvent {
  const providerMessageId = `sim-reply.${input.outboundProviderMessageId}`;

  if (input.list && input.list.rows.length > 0) {
    const firstRow = input.list.rows[0];

    return {
      kind: 'LIST_REPLY',
      providerMessageId,
      from: input.from,
      rowId: firstRow.id,
      label: firstRow.title,
      replyToProviderMessageId: input.outboundProviderMessageId,
      occurredAt: input.occurredAt,
    };
  }

  if (input.buttons.length > 0) {
    const positive =
      input.buttons.find((button) => button.id.startsWith(BOOKING_CONFIRM_PREFIX)) ?? input.buttons[0];

    return {
      kind: 'BUTTON_REPLY',
      providerMessageId,
      from: input.from,
      payload: positive.id,
      label: positive.title,
      replyToProviderMessageId: input.outboundProviderMessageId,
      occurredAt: input.occurredAt,
    };
  }

  return {
    kind: 'TEXT',
    providerMessageId,
    from: input.from,
    text: input.templateKey ? TEMPLATE_ACK_TEXT[input.templateKey] : GENERIC_ACK_TEXT,
    replyToProviderMessageId: input.outboundProviderMessageId,
    occurredAt: input.occurredAt,
  };
}
