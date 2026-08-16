/**
 * WHA-02/WHA-05 — the persist-then-dispatch send path (07-RESEARCH § Pattern
 * 2, § Code Example 4).
 *
 * `sendTemplate` never calls a WhatsApp provider. It validates variables
 * against the template registry, runs the authorization gate, writes the
 * `WhatsAppThread` + `WhatsAppMessage(status=QUEUED)` inside ONE
 * `prisma.$transaction`, commits, and only THEN enqueues a job carrying the
 * message id. The row is the source of truth; the job is a nudge. A worker
 * (07-09) is what eventually calls the provider — that is out of scope here,
 * and deliberately so: calling a provider inside the HTTP request would
 * couple request latency to Meta's API and make the `Queued -> Sent ->
 * Delivered` status ladder unimplementable.
 */

import type { Server } from 'socket.io';
import type { PrismaClient } from '@prisma/client';
import { SOCKET_EVENTS, type WaTemplateKey } from '@breeyo/types';
import type { DbClient } from '../../lib/prisma-rls.js';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';
import { getTemplate, type WaTemplateDefinition } from './template-registry.js';
import { WA_JOB_OPTIONS } from './whatsapp-queue.js';
import type { WhatsAppRepository, WaContextTypeDb } from './whatsapp.repository.js';
import { SendAuthorizationService } from './send-authorization.service.js';

/** Minimal shape this service needs from a BullMQ Queue — kept narrow so a
 * `{ add: vi.fn() }` fake satisfies it in tests without a real Redis. */
export interface WaOutboundQueueLike {
  add(name: string, data: unknown, opts?: Record<string, unknown>): Promise<unknown>;
}

export interface WaActor {
  clinicId: string;
  /** null for an automated (non-staff-initiated) send. */
  userId: string | null;
}

/**
 * The domain-level contextType from `SendTemplateInput` (`@breeyo/types`).
 * `GENERAL` has no counterpart in the database's `WaContextType` enum and
 * maps to `NONE`; every other value is identical spelling in both places.
 */
export type WaContextTypeInput = 'REMINDER' | 'INVOICE' | 'BOOKING' | 'GENERAL';

function toDbContextType(contextType: WaContextTypeInput): WaContextTypeDb {
  return contextType === 'GENERAL' ? 'NONE' : contextType;
}

export interface SendTemplateInput {
  ownerId: string;
  waPhone: string;
  templateKey: WaTemplateKey;
  variables: Record<string, string>;
  contextType: WaContextTypeInput;
  contextId?: string;
  petId?: string;
  staffNote?: string;
}

export interface RetryMessageResult {
  messageId: string;
}

export interface GrantConsentInput {
  purposeText: string;
  actorId?: string;
  ipAddress?: string;
}

export interface SetOwnerPreferenceInput {
  remindersOptedOut: boolean;
  source: 'OWNER_STOP' | 'STAFF';
  numberStatus?: 'VALID' | 'INVALID';
}

function messageNotFoundError() {
  const error = new Error('WhatsApp message not found') as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 404;
  error.code = 'WHATSAPP_MESSAGE_NOT_FOUND';
  return error;
}

/**
 * Validates variables against the template's Zod schema, attaching a
 * `statusCode: 400` to the thrown error on mismatch. Duck-typed on
 * `err.name === 'ZodError'` rather than `instanceof z.ZodError` — see the
 * identical comment in `template-registry.ts`'s `renderTemplate` for why a
 * cross-package `instanceof` is unreliable in this monorepo.
 */
function parseTemplateVariables(
  def: WaTemplateDefinition,
  variables: Record<string, string>,
): Record<string, string> {
  try {
    return def.variables.parse(variables);
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      (err as Error & { statusCode?: number; code?: string }).statusCode = 400;
      (err as Error & { statusCode?: number; code?: string }).code = 'TEMPLATE_VARIABLES_INVALID';
    }
    throw err;
  }
}

export class WhatsAppService {
  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly authz: SendAuthorizationService,
    // Typed as the raw admin `PrismaClient`, matching `WhatsAppRepository`'s
    // own constructor (both receive `fastify.prisma`, never `request.db` —
    // see the class-level doc comment on `WhatsAppRepository`). This is also
    // what keeps `$transaction(async (tx) => ...)` below unambiguous: a
    // `DbClient`-typed field (the `TenantPrismaClient | PrismaClient` union)
    // has two incompatible `$transaction` overloads and TypeScript cannot
    // call through a union of incompatible call signatures.
    private readonly prisma: PrismaClient,
    private readonly outboundQueue: WaOutboundQueueLike,
    private readonly io: Server | null = null,
  ) {}

  /**
   * WHA-02/WHA-05 — validate, authorize, persist, THEN enqueue. Returns
   * `{ messageId }` so the controller (07-12) can answer `202` and the
   * mobile UI can show UI-SPEC's `Message queued` toast with an immediate
   * Queued bubble.
   */
  async sendTemplate(input: SendTemplateInput, actor: WaActor): Promise<{ messageId: string }> {
    const def = getTemplate(input.templateKey);

    // Fail fast: a variable mismatch is a 400 HERE, before any write, rather
    // than a Cloud API 132000 failure later (07-RESEARCH § Pattern 3).
    const variables = parseTemplateVariables(def, input.variables);

    // D-10/D-11 hard gate + D-12/D-13 warn-never-block consent check.
    const { consentWarning } = await this.authz.authorize({
      clinicId: actor.clinicId,
      ownerId: input.ownerId,
      templateKey: input.templateKey,
    });

    const dbContextType = toDbContextType(input.contextType);
    const body = def.render(variables);

    const { messageId } = await this.prisma.$transaction(async (tx) => {
      const thread = await this.repo.upsertThread(
        actor.clinicId,
        { ownerId: input.ownerId, waPhone: input.waPhone },
        tx as unknown as DbClient,
      );

      const message = await this.repo.createOutboundMessage(
        actor.clinicId,
        {
          threadId: thread.id,
          channel: 'SIMULATOR',
          templateKey: def.key,
          templateCategory: def.category,
          body,
          renderedVariables: variables,
          contextType: dbContextType,
          contextId: input.contextId ?? null,
          staffNote: input.staffNote ?? null,
          sentByUserId: actor.userId,
        },
        tx as unknown as DbClient,
      );

      await this.repo.touchThread(
        actor.clinicId,
        thread.id,
        {
          lastMessageAt: new Date(),
          lastMessagePreview: body.slice(0, 120),
          lastContextType: dbContextType,
        },
        tx as unknown as DbClient,
      );

      return { messageId: message.id as string };
    });

    // Enqueue AFTER commit — the row is the source of truth, the job is a
    // nudge. jobId is deduplicated on the row id so a retried HTTP request
    // or a requeued job can never double-send (T-07-08-09).
    //
    // Fix (07-12, found via a real HTTP integration test against a real
    // BullMQ queue — every prior test here used a `{ add: vi.fn() }` fake,
    // which never exercised BullMQ's own validation): a `jobId` containing
    // exactly ONE `:` throws `Custom Id cannot contain :`
    // (`bullmq/classes/job.js`'s `validateOptions`, which only allows a
    // colon-bearing id when it splits into exactly three parts, for legacy
    // repeatable-job compatibility). `send:<uuid>` has exactly one colon and
    // has never actually reached a real queue before this plan wired one
    // end-to-end — hyphen keeps the same dedup-on-row-id intent without
    // tripping that check.
    await this.outboundQueue.add(
      'send',
      { messageId },
      { jobId: `send-${messageId}`, ...WA_JOB_OPTIONS },
    );

    // D-13: the send proceeds regardless, but a missing/withdrawn consent
    // must leave an audit trail — this is the compliance record that makes
    // the warn-but-allow trade-off defensible under India's DPDP Act.
    if (consentWarning) {
      await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_SENT_WITHOUT_CONSENT, {
        userId: actor.userId ?? undefined,
        clinicId: actor.clinicId,
        metadata: { ownerId: input.ownerId, templateKey: def.key },
      });
    }

    this.broadcast(actor.clinicId, SOCKET_EVENTS.WHATSAPP_MESSAGE_CREATED, { messageId });

    return { messageId };
  }

  /**
   * Anti-Pattern A7: creates a NEW message row linked by `retryOfMessageId`
   * rather than mutating the failed one, so the failed bubble and its
   * reason stay visible in the thread (UI-SPEC) and the WHA-05 audit trail
   * stays honest.
   */
  async retryMessage(clinicId: string, messageId: string, actor: WaActor): Promise<RetryMessageResult> {
    const failed = await this.repo.findMessageById(clinicId, messageId);
    if (!failed) {
      // 404, never 403 — matches vaccination.service.ts:181-193's precedent
      // of not disclosing whether a cross-tenant row exists.
      throw messageNotFoundError();
    }

    const retry = await this.prisma.$transaction(async (tx) => {
      return this.repo.createOutboundMessage(
        clinicId,
        {
          threadId: failed.threadId,
          channel: failed.channel as never,
          templateKey: failed.templateKey,
          templateCategory: failed.templateCategory,
          body: failed.body,
          renderedVariables: failed.renderedVariables as Record<string, unknown> | null,
          contextType: failed.contextType as WaContextTypeDb,
          contextId: failed.contextId,
          staffNote: failed.staffNote,
          sentByUserId: actor.userId,
          retryOfMessageId: failed.id,
        },
        tx as unknown as DbClient,
      );
    });

    await this.outboundQueue.add(
      'send',
      { messageId: retry.id },
      { jobId: `send-${retry.id}`, ...WA_JOB_OPTIONS },
    );

    return { messageId: retry.id as string };
  }

  /** D-12: grant always appends a new ConsentRecord row. */
  async grantConsent(clinicId: string, ownerId: string, input: GrantConsentInput, actor: WaActor) {
    const record = await this.repo.grantWhatsAppConsent(ownerId, input);
    await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_CONSENT_GRANTED, {
      userId: actor.userId ?? undefined,
      clinicId,
      metadata: { ownerId },
    });
    return record;
  }

  /** D-12: withdraw always stamps the latest open row, never an upsert. */
  async withdrawConsent(clinicId: string, ownerId: string, actor: WaActor) {
    const record = await this.repo.withdrawWhatsAppConsent(ownerId);
    await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_CONSENT_WITHDRAWN, {
      userId: actor.userId ?? undefined,
      clinicId,
      metadata: { ownerId },
    });
    return record;
  }

  /** D-11: a global per-owner reminder opt-out toggle. */
  async setOwnerPreference(
    clinicId: string,
    ownerId: string,
    input: SetOwnerPreferenceInput,
    actor: WaActor,
  ) {
    const result = await this.repo.upsertOwnerPreference(clinicId, ownerId, input);
    if (input.remindersOptedOut) {
      await writeAuditLog(this.prisma, AuditEvent.WHATSAPP_OPT_OUT, {
        userId: actor.userId ?? undefined,
        clinicId,
        metadata: { ownerId, source: input.source },
      });
    }
    return result;
  }

  /** The nullable `io` (matching `queue.service.ts:15-19,218-221`) is what
   * keeps this service unit-testable without a real Socket.IO server. */
  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
