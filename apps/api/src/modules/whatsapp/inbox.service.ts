/**
 * WHA-05 / D-04, D-20 — the read model behind the WhatsApp inbox: the thread
 * list with UI-SPEC's six filter chips and five-field search, cursor
 * pagination capped at 50, and the single-thread detail view.
 *
 * `WhatsAppThread` and `WhatsAppMessage` carry only scalar foreign-key
 * columns (`ownerId`, `threadId`) with no Prisma `@relation` declared back to
 * `PetOwner`/`Pet`/`WhatsAppThread` (schema.prisma:1274-1341) — deliberately,
 * matching the "no relation" choice already made for `WhatsAppMessage.contextId`
 * (`whatsapp.repository.ts`'s own header comment, Pitfall 8). That means this
 * service resolves owners, pets, and cross-table search matches through
 * separate parameterized Prisma queries and joins them in application code,
 * rather than through a single `include`/`some` relation filter — every one
 * of those queries is still a plain Prisma builder call, never raw SQL.
 *
 * Search spans five UI-SPEC fields: owner name, owner mobile, pet name,
 * invoice number, and booking reference. A numeric search term is normalized
 * through `toE164` before being compared against `waPhone`/`mobile`, so a
 * bare 10-digit search still matches a `+91`-stored number (Pitfall 9) — the
 * normalization is wrapped in a `try/catch` because most search terms (an
 * owner's name, an invoice number) are not phone numbers at all and must not
 * throw.
 *
 * Cross-tenant thread access is a 404 `THREAD_NOT_FOUND`, never a 403 —
 * confirming a 403 would disclose that the id exists in another clinic
 * (mirrors `vaccination.service.ts`'s 404-on-cross-tenant shape).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  WhatsAppInbox,
  WhatsAppMessageView,
  WhatsAppThreadSummary,
} from '@breeyo/types';
import type { InboxQuery } from '@breeyo/validators';
import { toE164 } from '../../lib/phone.js';

/** A thread's messages, joined with owner/pet context for the detail view. */
export interface WhatsAppThreadDetail extends WhatsAppThreadSummary {
  owner: { id: string; name: string; mobile: string } | null;
  pets: { id: string; name: string; species: string }[];
  messages: WhatsAppMessageView[];
}

function threadNotFoundError() {
  const error = new Error('WhatsApp thread not found') as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = 404;
  error.code = 'THREAD_NOT_FOUND';
  return error;
}

/** Best-effort E.164 normalization: most search terms are not phone numbers
 * at all (an owner's name, an invoice number), so a parse failure just means
 * "this search term is not a phone number" rather than a real error. */
function tryNormalizePhone(search: string): string | null {
  try {
    return toE164(search);
  } catch {
    return null;
  }
}

export class InboxService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * The thread list: UI-SPEC's six filter chips, five-field search, and
   * cursor pagination capped at 50 by `inboxQuerySchema` (DoS mitigation,
   * T-07-12-05).
   */
  async listThreads(clinicId: string, query: InboxQuery): Promise<WhatsAppInbox> {
    const { filter, search, limit, cursor } = query;

    const andConditions: Prisma.WhatsAppThreadWhereInput[] = [{ clinicId }];

    const filterCondition = await this.buildFilterCondition(clinicId, filter);
    if (filterCondition) {
      andConditions.push(filterCondition);
    }

    if (search && search.trim().length > 0) {
      andConditions.push(await this.buildSearchCondition(clinicId, search.trim()));
    }

    const where: Prisma.WhatsAppThreadWhereInput = { AND: andConditions };
    const take = limit + 1;

    const rows = await this.prisma.whatsAppThread.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id as string) : null;

    const ownerNameById = await this.resolveOwnerNames(page.map((t) => t.ownerId as string));

    const threads: WhatsAppThreadSummary[] = page.map((t) => ({
      id: t.id as string,
      clinicId: t.clinicId as string,
      ownerId: t.ownerId as string,
      ownerName: ownerNameById.get(t.ownerId as string) ?? 'Unknown',
      waPhone: t.waPhone as string,
      numberStatus: t.numberStatus as WhatsAppThreadSummary['numberStatus'],
      lastMessageAt: t.lastMessageAt as Date | null,
      lastMessagePreview: t.lastMessagePreview as string | null,
      lastContextType: t.lastContextType as WhatsAppThreadSummary['lastContextType'],
      unreadCount: t.unreadCount as number,
      needsAction: t.needsAction as boolean,
      needsActionReason: t.needsActionReason as string | null,
    }));

    return { threads, nextCursor };
  }

  /**
   * A single thread's detail: owner, pets, and every message in ascending
   * `createdAt` order, with status/failure/context/interactive-option
   * fields intact. Resets `unreadCount` to 0 (marks the thread read) as a
   * side effect, matching the UI-SPEC "opening a thread marks it read"
   * contract.
   */
  async getThread(clinicId: string, threadId: string): Promise<WhatsAppThreadDetail> {
    const thread = await this.prisma.whatsAppThread.findFirst({
      where: { id: threadId, clinicId },
    });
    if (!thread) {
      // Never 403 here (T-07-12-02) — a 403 would disclose that this id
      // exists in some OTHER clinic.
      throw threadNotFoundError();
    }

    const owner = await this.prisma.petOwner.findFirst({
      where: { id: thread.ownerId as string, clinicId },
    });

    const pets = await this.prisma.pet.findMany({
      where: { clinicId, ownerId: thread.ownerId as string },
      select: { id: true, name: true, species: true },
    });

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: { clinicId, threadId },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.whatsAppThread.updateMany({
      where: { id: threadId, clinicId },
      data: { unreadCount: 0 },
    });

    return {
      id: thread.id as string,
      clinicId: thread.clinicId as string,
      ownerId: thread.ownerId as string,
      ownerName: owner?.name ?? 'Unknown',
      waPhone: thread.waPhone as string,
      numberStatus: thread.numberStatus as WhatsAppThreadSummary['numberStatus'],
      lastMessageAt: thread.lastMessageAt as Date | null,
      lastMessagePreview: thread.lastMessagePreview as string | null,
      lastContextType: thread.lastContextType as WhatsAppThreadSummary['lastContextType'],
      unreadCount: 0,
      needsAction: thread.needsAction as boolean,
      needsActionReason: thread.needsActionReason as string | null,
      owner: owner ? { id: owner.id as string, name: owner.name as string, mobile: owner.mobile as string } : null,
      pets: pets.map((p) => ({ id: p.id as string, name: p.name as string, species: p.species as string })),
      messages: messages.map((m) => ({
        id: m.id as string,
        direction: m.direction as WhatsAppMessageView['direction'],
        channel: m.channel as WhatsAppMessageView['channel'],
        templateKey: m.templateKey as WhatsAppMessageView['templateKey'],
        templateCategory: m.templateCategory as WhatsAppMessageView['templateCategory'],
        body: m.body as string,
        status: m.status as WhatsAppMessageView['status'],
        failureCode: m.failureCode as WhatsAppMessageView['failureCode'],
        failureReason: m.failureReason as string | null,
        contextType: m.contextType as WhatsAppMessageView['contextType'],
        contextId: m.contextId as string | null,
        interactiveOptions: m.interactiveOptions as WhatsAppMessageView['interactiveOptions'],
        mediaFilename: m.mediaFilename as string | null,
        staffNote: m.staffNote as string | null,
        sentByUserId: m.sentByUserId as string | null,
        createdAt: m.createdAt as Date,
        sentAt: m.sentAt as Date | null,
        deliveredAt: m.deliveredAt as Date | null,
        readAt: m.readAt as Date | null,
      })),
    };
  }

  // ─── UI-SPEC filter chips ────────────────────────────────────────────────

  private async buildFilterCondition(
    clinicId: string,
    filter: string,
  ): Promise<Prisma.WhatsAppThreadWhereInput | null> {
    if (filter === 'invoices') {
      return { lastContextType: 'INVOICE' };
    }
    if (filter === 'reminders') {
      return { lastContextType: 'REMINDER' };
    }
    if (filter === 'bookings') {
      return { lastContextType: 'BOOKING' };
    }
    if (filter === 'needs_action') {
      return { needsAction: true };
    }
    if (filter === 'failed') {
      const threadIds = await this.findFailedThreadIds(clinicId);
      return { id: { in: threadIds } };
    }
    // 'all': no extra condition.
    return null;
  }

  private async findFailedThreadIds(clinicId: string): Promise<string[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: { clinicId, status: 'FAILED' },
      select: { threadId: true },
      distinct: ['threadId'],
    });
    return rows.map((r) => r.threadId as string);
  }

  // ─── Five-field search ───────────────────────────────────────────────────

  private async buildSearchCondition(
    clinicId: string,
    search: string,
  ): Promise<Prisma.WhatsAppThreadWhereInput> {
    const normalizedPhone = tryNormalizePhone(search);

    const ownerIds = await this.findMatchingOwnerIds(clinicId, search, normalizedPhone);
    const invoiceThreadIds = await this.findThreadIdsByInvoiceNumber(clinicId, search);
    const bookingThreadIds = await this.findThreadIdsByBookingReference(clinicId, search);
    const messageThreadIds = [...new Set([...invoiceThreadIds, ...bookingThreadIds])];

    const waPhoneTerm = normalizedPhone ?? search;

    return {
      OR: [
        { ownerId: { in: ownerIds } },
        { id: { in: messageThreadIds } },
        { waPhone: { contains: waPhoneTerm, mode: 'insensitive' } },
      ],
    };
  }

  /** Owner name + owner mobile + pet name — three of the five UI-SPEC search fields. */
  private async findMatchingOwnerIds(
    clinicId: string,
    search: string,
    normalizedPhone: string | null,
  ): Promise<string[]> {
    const mobileTerm = normalizedPhone ?? search;

    const owners = await this.prisma.petOwner.findMany({
      where: {
        clinicId,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { mobile: { contains: mobileTerm, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });

    const pets = await this.prisma.pet.findMany({
      where: { clinicId, name: { contains: search, mode: 'insensitive' } },
      select: { ownerId: true },
    });

    return [...new Set([...owners.map((o) => o.id as string), ...pets.map((p) => p.ownerId as string)])];
  }

  /** Invoice number: an exact match against the `invoice_number` template
   * variable recorded on an INVOICE-context message (WHA-02's rendered
   * variables JSON), the fourth UI-SPEC search field. */
  private async findThreadIdsByInvoiceNumber(clinicId: string, search: string): Promise<string[]> {
    const rows = await this.prisma.whatsAppMessage.findMany({
      where: {
        clinicId,
        contextType: 'INVOICE',
        renderedVariables: { path: ['invoice_number'], equals: search },
      },
      select: { threadId: true },
    });
    return rows.map((r) => r.threadId as string);
  }

  /** Booking reference: the fifth UI-SPEC search field, matched directly
   * against `WhatsAppBookingRequest.reference`, which carries its own
   * `threadId` column. */
  private async findThreadIdsByBookingReference(clinicId: string, search: string): Promise<string[]> {
    const rows = await this.prisma.whatsAppBookingRequest.findMany({
      where: { clinicId, reference: { contains: search, mode: 'insensitive' } },
      select: { threadId: true },
    });
    return rows.map((r) => r.threadId as string);
  }

  private async resolveOwnerNames(ownerIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ownerIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const owners = await this.prisma.petOwner.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    return new Map(owners.map((o) => [o.id as string, o.name as string]));
  }
}
