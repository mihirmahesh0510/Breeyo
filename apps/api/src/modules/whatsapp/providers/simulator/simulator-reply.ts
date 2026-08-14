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
import type { WaButtonSpec, WaInboundEvent } from '../wa-provider.port.js';

export interface SimulatedReplyInput {
  /** The provider message id of the outbound message this reply answers. */
  outboundProviderMessageId: string;
  /** The owner's wa_id (plus-less), mirroring Meta's inbound `from`. */
  from: string;
  templateKey: WaTemplateKey;
  /** The buttons the outbound message offered, if any. */
  buttons: WaButtonSpec[];
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
};

/**
 * Builds the simulator's auto-reply to an outbound message.
 *
 * If the outbound message offered buttons, the reply is a `BUTTON_REPLY`
 * that always picks the positive/first option (D-15): the first button
 * whose id starts with `booking:confirm:`, or — if none does — the first
 * button offered. Otherwise the reply is a short fixed `TEXT`
 * acknowledgement keyed by template.
 */
export function buildSimulatedReply(input: SimulatedReplyInput): WaInboundEvent {
  const providerMessageId = `sim-reply.${input.outboundProviderMessageId}`;

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
    text: TEMPLATE_ACK_TEXT[input.templateKey],
    replyToProviderMessageId: input.outboundProviderMessageId,
    occurredAt: input.occurredAt,
  };
}
