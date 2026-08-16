/**
 * WHA-02/WHA-05 — the single owner of all WhatsApp Prisma access.
 *
 * Constructed with `fastify.prisma` (the admin-role client), exactly like
 * `VaccinationRepository` — NOT `request.db`. Tenant isolation is enforced
 * by an explicit `clinicId` parameter on every method that touches a
 * clinic-scoped table, filtered directly into the `where` clause, rather
 * than by `FORCE ROW LEVEL SECURITY` (07-RESEARCH § Pitfall 5: FORCE RLS
 * against the admin role would return zero rows, since the admin role is
 * exactly the role RLS is designed to bypass).
 *
 * `ConsentRecord` has no `clinicId` column and no unique constraint
 * (schema.prisma:361-374) — its three methods below take only `ownerId`,
 * and "current consent" is a query (latest non-withdrawn row), never an
 * `upsert` (D-12): grant always appends, withdraw always stamps the latest
 * open row.
 *
 * Write methods accept an optional trailing Prisma client (`tx`), defaulting
 * to the constructor's own handle, so a caller (the send service) can
 * compose several of these calls inside one `prisma.$transaction`.
 */

import type { DbClient } from '../../lib/prisma-rls.js';
import { toE164 } from '../../lib/phone.js';

// ─── Local Prisma-enum-shaped string literal types ─────────────────────────
//
// Matches schema.prisma's Wa* enums exactly. Not imported from `@prisma/client`
// to avoid colliding with the differently-shaped domain types of the same
// name in `@breeyo/types` (e.g. that package's `WaContextType` has no `NONE`
// or `PET` member) — this repository speaks the DATABASE's enum vocabulary.

export type WaChannelDb = 'SIMULATOR' | 'CLOUD_API';
export type WaDirectionDb = 'OUTBOUND' | 'INBOUND';
export type WaDeliveryStatusDb = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'REPLIED';
export type WaNumberStatusDb = 'VALID' | 'INVALID';
export type WaContextTypeDb = 'NONE' | 'INVOICE' | 'PET' | 'REMINDER' | 'BOOKING' | 'DOCUMENT';
export type WaDeliveryModeDb = 'NORMAL' | 'DELAYED' | 'FAIL' | 'INVALID_NUMBER';

export interface UpsertThreadInput {
  ownerId: string;
  waPhone: string;
}

export interface TouchThreadInput {
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  lastContextType?: WaContextTypeDb;
}

export interface CreateOutboundMessageInput {
  threadId: string;
  channel: WaChannelDb;
  templateKey?: string | null;
  templateCategory?: string | null;
  body: string;
  renderedVariables?: Record<string, unknown> | null;
  interactiveOptions?: unknown;
  contextType?: WaContextTypeDb;
  contextId?: string | null;
  staffNote?: string | null;
  sentByUserId?: string | null;
  reminderTaskId?: string | null;
  bookingRequestId?: string | null;
  retryOfMessageId?: string | null;
}

export interface CreateInboundMessageInput {
  threadId: string;
  channel: WaChannelDb;
  providerMessageId?: string | null;
  replyToProviderMessageId?: string | null;
  body: string;
  contextType?: WaContextTypeDb;
}

export interface UpdateMessageStatusInput {
  status: WaDeliveryStatusDb;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  failureCode?: string | null;
  failureReason?: string | null;
}

export interface UpsertOwnerPreferenceInput {
  remindersOptedOut: boolean;
  source: 'OWNER_STOP' | 'STAFF';
  numberStatus?: WaNumberStatusDb;
}

export interface GrantConsentInput {
  purposeText: string;
  actorId?: string;
  ipAddress?: string;
}

export interface UpdateClinicConfigInput {
  provider?: WaChannelDb;
  deliveryMode?: WaDeliveryModeDb;
  autoReplyEnabled?: boolean;
  autoReplyDelaySeconds?: number;
  allowFreeformOutsideWindow?: boolean;
  slotDurationMinutes?: number;
  escalationMaxAttempts?: number;
  escalationIntervalDays?: number;
}

export class WhatsAppRepository {
  constructor(private readonly prisma: DbClient) {}

  // ─── Threads ───────────────────────────────────────────────────────────

  async upsertThread(clinicId: string, input: UpsertThreadInput, tx: DbClient = this.prisma) {
    const waPhone = toE164(input.waPhone);

    const existing = await tx.whatsAppThread.findFirst({
      where: { clinicId, waPhone },
    });
    if (existing) {
      return existing;
    }

    try {
      return await tx.whatsAppThread.create({
        data: { clinicId, ownerId: input.ownerId, waPhone },
      });
    } catch (err) {
      // Two concurrent first-sends to the same owner can both miss the
      // findFirst above and race on the `@@unique([clinicId, waPhone])`
      // constraint. Re-read rather than let the second caller 500.
      if (isUniqueConstraintViolation(err)) {
        const raced = await tx.whatsAppThread.findFirst({ where: { clinicId, waPhone } });
        if (raced) return raced;
      }
      throw err;
    }
  }

  async touchThread(
    clinicId: string,
    threadId: string,
    input: TouchThreadInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppThread.updateMany({
      where: { id: threadId, clinicId },
      data: { ...input },
    });
  }

  async flagNeedsAction(
    clinicId: string,
    threadId: string,
    reason: string,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppThread.updateMany({
      where: { id: threadId, clinicId },
      data: { needsAction: true, needsActionReason: reason },
    });
  }

  async clearNeedsAction(clinicId: string, threadId: string, tx: DbClient = this.prisma) {
    return tx.whatsAppThread.updateMany({
      where: { id: threadId, clinicId },
      data: { needsAction: false, needsActionReason: null },
    });
  }

  async findThreadById(clinicId: string, threadId: string) {
    return this.prisma.whatsAppThread.findFirst({ where: { id: threadId, clinicId } });
  }

  async findThreadByPhone(clinicId: string, waPhone: string) {
    return this.prisma.whatsAppThread.findFirst({
      where: { clinicId, waPhone: toE164(waPhone) },
    });
  }

  // ─── Messages ──────────────────────────────────────────────────────────

  async createOutboundMessage(
    clinicId: string,
    input: CreateOutboundMessageInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppMessage.create({
      data: {
        clinicId,
        threadId: input.threadId,
        direction: 'OUTBOUND',
        channel: input.channel,
        templateKey: input.templateKey ?? null,
        templateCategory: input.templateCategory ?? null,
        body: input.body,
        renderedVariables: (input.renderedVariables ?? null) as never,
        interactiveOptions: (input.interactiveOptions ?? null) as never,
        contextType: input.contextType ?? 'NONE',
        contextId: input.contextId ?? null,
        staffNote: input.staffNote ?? null,
        sentByUserId: input.sentByUserId ?? null,
        reminderTaskId: input.reminderTaskId ?? null,
        bookingRequestId: input.bookingRequestId ?? null,
        retryOfMessageId: input.retryOfMessageId ?? null,
        status: 'QUEUED',
        queuedAt: new Date(),
      },
    });
  }

  async createInboundMessage(
    clinicId: string,
    input: CreateInboundMessageInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppMessage.create({
      data: {
        clinicId,
        threadId: input.threadId,
        direction: 'INBOUND',
        channel: input.channel,
        providerMessageId: input.providerMessageId ?? null,
        replyToProviderMessageId: input.replyToProviderMessageId ?? null,
        body: input.body,
        contextType: input.contextType ?? 'NONE',
        status: 'REPLIED',
      },
    });
  }

  async findMessageById(clinicId: string, messageId: string) {
    return this.prisma.whatsAppMessage.findFirst({ where: { id: messageId, clinicId } });
  }

  async updateMessageStatus(
    clinicId: string,
    messageId: string,
    input: UpdateMessageStatusInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppMessage.updateMany({
      where: { id: messageId, clinicId },
      data: { ...input },
    });
  }

  /**
   * Append-only (WHA-05 § Pattern 9). No update path is modelled for
   * `WhatsAppMessageStatusEvent` — the model has no `clinicId` column
   * (schema.prisma:1344-1355), so tenant scoping for this ledger happens one
   * level up, through the `messageId` it is chained from.
   */
  async appendStatusEvent(
    messageId: string,
    status: WaDeliveryStatusDb,
    providerCode: string | null,
    rawPayload: unknown,
    occurredAt: Date,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppMessageStatusEvent.create({
      data: {
        messageId,
        status,
        providerCode,
        rawPayload: (rawPayload ?? null) as never,
        occurredAt,
      },
    });
  }

  // ─── Owner preference (D-10/D-11) ─────────────────────────────────────

  async getOwnerPreference(clinicId: string, ownerId: string) {
    return this.prisma.whatsAppOwnerPreference.findFirst({ where: { clinicId, ownerId } });
  }

  async upsertOwnerPreference(
    clinicId: string,
    ownerId: string,
    input: UpsertOwnerPreferenceInput,
    tx: DbClient = this.prisma,
  ) {
    const optedOutAt = input.remindersOptedOut ? new Date() : null;
    const data = {
      remindersOptedOut: input.remindersOptedOut,
      optedOutAt,
      optedOutSource: input.source,
      ...(input.numberStatus ? { numberStatus: input.numberStatus } : {}),
    };

    // Look up scoped to clinicId FIRST — `ownerId` alone is the unique key
    // on this table, so an update-by-ownerId with no prior clinicId check
    // would let clinic B write onto clinic A's owner row (T-07-08-01).
    const existing = await tx.whatsAppOwnerPreference.findFirst({
      where: { clinicId, ownerId },
    });

    if (existing) {
      return tx.whatsAppOwnerPreference.update({
        where: { ownerId },
        data,
      });
    }

    return tx.whatsAppOwnerPreference.create({
      data: { clinicId, ownerId, ...data, numberStatus: input.numberStatus ?? 'VALID' },
    });
  }

  async markNumberInvalid(
    clinicId: string,
    ownerId: string,
    actorUserId: string,
    tx: DbClient = this.prisma,
  ) {
    const data = {
      numberStatus: 'INVALID' as const,
      markedInvalidAt: new Date(),
      markedInvalidBy: actorUserId,
    };

    const existing = await tx.whatsAppOwnerPreference.findFirst({
      where: { clinicId, ownerId },
    });

    if (existing) {
      return tx.whatsAppOwnerPreference.update({ where: { ownerId }, data });
    }

    return tx.whatsAppOwnerPreference.create({
      data: { clinicId, ownerId, remindersOptedOut: false, ...data },
    });
  }

  // ─── Consent (D-12, D-13) ──────────────────────────────────────────────
  //
  // `ConsentRecord` has no `clinicId` — see the class-level doc comment.

  async getCurrentWhatsAppConsent(ownerId: string) {
    return this.prisma.consentRecord.findFirst({
      where: { ownerId, consentType: 'whatsapp_communication', withdrawnAt: null },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async grantWhatsAppConsent(
    ownerId: string,
    input: GrantConsentInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.consentRecord.create({
      data: {
        ownerId,
        consentType: 'whatsapp_communication',
        purposeText: input.purposeText,
        actorId: input.actorId,
        ipAddress: input.ipAddress,
      },
    });
  }

  async withdrawWhatsAppConsent(ownerId: string, tx: DbClient = this.prisma) {
    const open = await tx.consentRecord.findFirst({
      where: { ownerId, consentType: 'whatsapp_communication', withdrawnAt: null },
      orderBy: { grantedAt: 'desc' },
    });

    if (!open) {
      return null;
    }

    return tx.consentRecord.update({
      where: { id: open.id },
      data: { withdrawnAt: new Date() },
    });
  }

  // ─── Clinic config (D-14, D-16) ────────────────────────────────────────

  async getOrCreateClinicConfig(clinicId: string, tx: DbClient = this.prisma) {
    const existing = await tx.whatsAppClinicConfig.findUnique({ where: { clinicId } });
    if (existing) {
      return existing;
    }
    return tx.whatsAppClinicConfig.create({ data: { clinicId } });
  }

  async updateClinicConfig(
    clinicId: string,
    input: UpdateClinicConfigInput,
    tx: DbClient = this.prisma,
  ) {
    return tx.whatsAppClinicConfig.update({
      where: { clinicId },
      data: { ...input },
    });
  }
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
