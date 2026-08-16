/**
 * WHA-05 — DeliveryStatusService: the single monotonic status funnel
 * (07-RESEARCH § Pattern 9, § Pitfall 14).
 *
 * `apply()` is the ONLY code path in this codebase permitted to mutate
 * `WhatsAppMessage.status`. The Cloud API webhook (`whatsapp.webhook.routes.ts`)
 * and the simulator worker (`workers/simulator.worker.ts`) both call it and
 * nothing else does — a future contributor who adds a second status-mutating
 * code path breaks WHA-05's append-only audit trail and Pitfall 14's
 * monotonic-ordering guarantee. If you are about to write a direct Prisma
 * update against the message table's `status` column anywhere else, stop
 * and route through this service instead.
 *
 * Meta does not guarantee webhook status ordering — `read` can arrive before
 * `delivered` — and Meta redelivers on any non-2xx response. Two invariants
 * make both survivable:
 *
 * 1. **Monotonic rank comparison.** `WA_STATUS_RANK` orders the ladder
 *    QUEUED < SENT < DELIVERED < READ < REPLIED. An incoming status is only
 *    applied to the message row when its rank exceeds the current rank.
 * 2. **FAILED is terminal-by-precedence**, not ranked. Once a message is
 *    FAILED, apply() never mutates it again for any incoming status — the
 *    only way out is a staff Retry, which creates a NEW message row
 *    (Anti-Pattern A7), keeping the failed bubble and its reason intact.
 *
 * Regardless of whether a call advances the message row, `apply()` always
 * appends one `WhatsAppMessageStatusEvent` row — that append-only ledger is
 * what makes WHA-05's "every message flow is logged" literally true, and it
 * is what lets a redelivered or out-of-order webhook be provably a no-op
 * rather than a silent drop.
 */

import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { SOCKET_EVENTS, WA_STATUS_RANK, type WaDeliveryStatus, type WaFailureCode } from '@breeyo/types';
import type { WhatsAppRepository, WaDeliveryStatusDb } from './whatsapp.repository.js';

/** A normalized delivery failure, as produced by `normalizeMetaError` or a `WaSendError`. */
export interface DeliveryStatusFailure {
  code: WaFailureCode;
  providerCode: string | null;
  /** Optional human-readable text. Falls back to the failure code when absent. */
  reason?: string;
}

export interface ApplyStatusResult {
  applied: boolean;
  /** Present only when `applied` is false. */
  reason?: 'UNKNOWN_MESSAGE' | 'NOT_ADVANCED';
  messageId?: string;
  clinicId?: string;
}

/** Ranked statuses only — `FAILED` is deliberately excluded (see class doc comment). */
type RankedStatus = Exclude<WaDeliveryStatus, 'FAILED'>;

function rankOf(status: WaDeliveryStatus): number | null {
  if (status === 'FAILED') return null;
  return WA_STATUS_RANK[status as RankedStatus];
}

const TIMESTAMP_FIELD: Partial<Record<WaDeliveryStatus, 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt'>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  READ: 'readAt',
  FAILED: 'failedAt',
};

/**
 * Fields that must never end up in a stored `rawPayload` (T-07-09-05).
 * Case-insensitive, matched against the JSON key name — not the value —
 * because token-bearing fields can appear at any depth of a Meta payload.
 */
const SECRET_KEY_PATTERN = /authorization|access_token|token/i;

/**
 * Recursively strips token-bearing keys from a provider payload before it is
 * persisted. Meta's `pricing` / `conversation` objects are useful later and
 * contain no secret, so everything else in the payload is preserved as-is.
 */
function scrubRawPayload(rawPayload: unknown): unknown {
  if (rawPayload === null || rawPayload === undefined) return null;

  if (Array.isArray(rawPayload)) {
    return rawPayload.map(scrubRawPayload);
  }

  if (typeof rawPayload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawPayload as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      out[key] = scrubRawPayload(value);
    }
    return out;
  }

  return rawPayload;
}

export class DeliveryStatusService {
  constructor(
    private readonly repository: WhatsAppRepository,
    // The admin `PrismaClient`, matching `WhatsAppRepository`'s own
    // constructor — this service looks up a message by its globally-unique
    // `providerMessageId`, a cross-tenant lookup by definition, before any
    // clinic scope is known.
    private readonly prisma: PrismaClient,
    // Nullable, matching `queue.service.ts:15-19` — keeps this service
    // unit-testable without a real Socket.IO server.
    private readonly io: Server | null = null,
  ) {}

  /**
   * Applies one delivery-status event to the message it belongs to.
   *
   * `providerMessageId` is the lookup key (the `wamid` Meta assigned, or the
   * simulator's synthetic `sim.<id>` equivalent) — NOT the internal
   * `WhatsAppMessage.id`. A caller that has not yet recorded a
   * `providerMessageId` on the row (e.g. a send that failed before any
   * provider ACK) must persist a placeholder id first; see
   * `workers/outbound.worker.ts`.
   */
  async apply(
    providerMessageId: string,
    status: WaDeliveryStatus,
    failure: DeliveryStatusFailure | null,
    occurredAt: Date,
    rawPayload?: unknown,
  ): Promise<ApplyStatusResult> {
    const message = await this.prisma.whatsAppMessage.findFirst({ where: { providerMessageId } });

    if (!message) {
      // A webhook (or a redelivered one) for a message this environment does
      // not know about. Meta retries non-2xx responses indefinitely, so this
      // must be a quiet no-op, never a throw (07-RESEARCH § Pitfall 14).
      return { applied: false, reason: 'UNKNOWN_MESSAGE' };
    }

    const messageId = message.id as string;
    const clinicId = message.clinicId as string;
    const currentStatus = message.status as WaDeliveryStatus;

    // Append-only ledger row on EVERY call — including one that will not
    // advance the message's status. This is what proves a duplicate/
    // out-of-order webhook was received and correctly ignored, rather than
    // silently dropped (WHA-05).
    await this.repository.appendStatusEvent(
      messageId,
      status as WaDeliveryStatusDb,
      failure?.providerCode ?? null,
      scrubRawPayload(rawPayload),
      occurredAt,
    );

    // FAILED is terminal-by-precedence: nothing downgrades or upgrades a
    // message out of FAILED. The only recovery path is a staff Retry, which
    // creates a NEW message row (Anti-Pattern A7) rather than mutating this
    // one, so the failed bubble and its reason stay visible in the thread.
    if (currentStatus === 'FAILED') {
      return { applied: false, reason: 'NOT_ADVANCED', messageId, clinicId };
    }

    // FAILED itself is not in WA_STATUS_RANK (07-RESEARCH § Pattern 9) — it
    // always applies once the message is not already FAILED, regardless of
    // the current rank. Every other status only applies on a strict rank
    // increase, which is what makes a late `SENT` after `DELIVERED` a no-op.
    const currentRank = rankOf(currentStatus);
    const incomingRank = rankOf(status);
    const shouldApply =
      status === 'FAILED' || (incomingRank !== null && currentRank !== null && incomingRank > currentRank);

    if (!shouldApply) {
      return { applied: false, reason: 'NOT_ADVANCED', messageId, clinicId };
    }

    const timestampField = TIMESTAMP_FIELD[status];
    const updateData: Parameters<WhatsAppRepository['updateMessageStatus']>[2] = {
      status: status as WaDeliveryStatusDb,
      ...(timestampField ? { [timestampField]: occurredAt } : {}),
      ...(status === 'FAILED'
        ? {
            failureCode: failure?.code ?? null,
            failureReason: failure?.reason ?? failure?.code ?? 'Delivery failed',
          }
        : {}),
    };

    await this.repository.updateMessageStatus(clinicId, messageId, updateData);

    this.broadcast(clinicId, { messageId, status, occurredAt });

    return { applied: true, messageId, clinicId };
  }

  /** Broadcasts a real status change only — no-ops never reach the socket. */
  private broadcast(
    clinicId: string,
    payload: { messageId: string; status: WaDeliveryStatus; occurredAt: Date },
  ): void {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.WHATSAPP_MESSAGE_STATUS_CHANGED, payload);
    }
  }
}
