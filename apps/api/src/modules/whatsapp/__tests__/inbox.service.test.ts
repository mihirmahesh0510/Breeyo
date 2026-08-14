import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InboxService } from '../inbox.service.js';
import {
  threadParamsSchema,
  messageParamsSchema,
  sendTemplateSchema,
  retryMessageSchema,
} from '../whatsapp.schema.js';
import type { InboxQuery } from '@breeyo/validators';

/**
 * Mock-prisma style mirrors `whatsapp.repository.test.ts`: a plain object
 * exposing only the models this service touches, each method a `vi.fn()`.
 * Assertions inspect the exact `where`/`orderBy`/`select` arguments passed —
 * that is what proves the six UI-SPEC filter chips, the five-field search,
 * and clinic scoping (Task 1 behavior list), without touching a real
 * database (that is Task 3's job, against the real integration suite).
 */
function createMockPrisma() {
  return {
    whatsAppThread: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    whatsAppMessage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    whatsAppBookingRequest: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    petOwner: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    pet: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Never expected to be called (T-07-12-03) — present only so an
    // accidental call surfaces as a spy assertion rather than a crash.
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  } as any;
}

const CLINIC_A = '11111111-1111-1111-1111-111111111111';
const CLINIC_B = '22222222-2222-2222-2222-222222222222';
const THREAD_ID = '44444444-4444-4444-4444-444444444444';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';

function baseQuery(overrides: Partial<InboxQuery> = {}): InboxQuery {
  return { filter: 'all', limit: 25, cursor: undefined, search: undefined, ...overrides };
}

describe('InboxService (WHA-05, D-20)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: InboxService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new InboxService(prisma);
  });

  describe('listThreads — filters', () => {
    it('filter "all" scopes strictly to clinicId and orders by lastMessageAt desc', async () => {
      await service.listThreads(CLINIC_A, baseQuery());

      expect(prisma.whatsAppThread.findMany).toHaveBeenCalledTimes(1);
      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_A }] });
      expect(call.orderBy).toEqual([{ lastMessageAt: 'desc' }, { id: 'desc' }]);
    });

    it('never returns another clinic\'s threads even with no filter applied', async () => {
      await service.listThreads(CLINIC_B, baseQuery());

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_B }] });
    });

    it('filter "invoices" scopes to lastContextType INVOICE', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ filter: 'invoices' }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_A }, { lastContextType: 'INVOICE' }] });
    });

    it('filter "reminders" scopes to lastContextType REMINDER', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ filter: 'reminders' }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_A }, { lastContextType: 'REMINDER' }] });
    });

    it('filter "bookings" scopes to lastContextType BOOKING', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ filter: 'bookings' }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_A }, { lastContextType: 'BOOKING' }] });
    });

    it('filter "needs_action" scopes to needsAction true', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ filter: 'needs_action' }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ AND: [{ clinicId: CLINIC_A }, { needsAction: true }] });
    });

    it('filter "failed" scopes to threads with at least one FAILED message', async () => {
      prisma.whatsAppMessage.findMany.mockResolvedValueOnce([
        { threadId: 'thread-1' },
        { threadId: 'thread-2' },
      ]);

      await service.listThreads(CLINIC_A, baseQuery({ filter: 'failed' }));

      expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, status: 'FAILED' },
        select: { threadId: true },
        distinct: ['threadId'],
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.where).toEqual({
        AND: [{ clinicId: CLINIC_A }, { id: { in: ['thread-1', 'thread-2'] } }],
      });
    });
  });

  describe('listThreads — five-field search', () => {
    it('matches owner name case-insensitively', async () => {
      prisma.petOwner.findMany.mockResolvedValueOnce([{ id: OWNER_ID }]);

      await service.listThreads(CLINIC_A, baseQuery({ search: 'Asha' }));

      expect(prisma.petOwner.findMany).toHaveBeenCalledWith({
        where: {
          clinicId: CLINIC_A,
          OR: [
            { name: { contains: 'Asha', mode: 'insensitive' } },
            { mobile: { contains: 'Asha', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      const searchCondition = call.where.AND[1];
      expect(searchCondition.OR).toContainEqual({ ownerId: { in: [OWNER_ID] } });
    });

    it('matches the owner mobile number even when the stored thread phone is +91-prefixed', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ search: '9876543210' }));

      // A bare 10-digit search normalizes through toE164 before comparing
      // against the stored +91-prefixed mobile/waPhone (Pitfall 9).
      expect(prisma.petOwner.findMany).toHaveBeenCalledWith({
        where: {
          clinicId: CLINIC_A,
          OR: [
            { name: { contains: '9876543210', mode: 'insensitive' } },
            { mobile: { contains: '+919876543210', mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      const searchCondition = call.where.AND[1];
      expect(searchCondition.OR).toContainEqual({
        waPhone: { contains: '+919876543210', mode: 'insensitive' },
      });
    });

    it('matches a pet name belonging to the thread owner', async () => {
      prisma.pet.findMany.mockResolvedValueOnce([{ ownerId: OWNER_ID }]);

      await service.listThreads(CLINIC_A, baseQuery({ search: 'Rocky' }));

      expect(prisma.pet.findMany).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, name: { contains: 'Rocky', mode: 'insensitive' } },
        select: { ownerId: true },
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      const searchCondition = call.where.AND[1];
      expect(searchCondition.OR).toContainEqual({ ownerId: { in: [OWNER_ID] } });
    });

    it('matches a message whose contextType is INVOICE and whose invoice_number variable equals the search term', async () => {
      prisma.whatsAppMessage.findMany.mockResolvedValueOnce([{ threadId: THREAD_ID }]);

      await service.listThreads(CLINIC_A, baseQuery({ search: 'INV-202608-0001' }));

      expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
        where: {
          clinicId: CLINIC_A,
          contextType: 'INVOICE',
          renderedVariables: { path: ['invoice_number'], equals: 'INV-202608-0001' },
        },
        select: { threadId: true },
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      const searchCondition = call.where.AND[1];
      expect(searchCondition.OR).toContainEqual({ id: { in: [THREAD_ID] } });
    });

    it('matches a booking reference', async () => {
      prisma.whatsAppBookingRequest.findMany.mockResolvedValueOnce([{ threadId: THREAD_ID }]);

      await service.listThreads(CLINIC_A, baseQuery({ search: 'BK-202608-AB12' }));

      expect(prisma.whatsAppBookingRequest.findMany).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, reference: { contains: 'BK-202608-AB12', mode: 'insensitive' } },
        select: { threadId: true },
      });

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      const searchCondition = call.where.AND[1];
      expect(searchCondition.OR).toContainEqual({ id: { in: [THREAD_ID] } });
    });

    it('generates no raw SQL — only Prisma builder methods are used', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ search: 'Asha', filter: 'failed' }));

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('listThreads — cursor pagination', () => {
    it('honours the limit cap and returns a nextCursor when more rows exist', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `thread-${i}`,
        clinicId: CLINIC_A,
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        numberStatus: 'VALID',
        lastMessageAt: new Date(),
        lastMessagePreview: 'hi',
        lastContextType: 'NONE',
        unreadCount: 0,
        needsAction: false,
        needsActionReason: null,
      }));
      prisma.whatsAppThread.findMany.mockResolvedValueOnce(rows);

      const result = await service.listThreads(CLINIC_A, baseQuery({ limit: 50 }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.take).toBe(51); // limit + 1, to detect "more exist"
      expect(result.threads).toHaveLength(50);
      expect(result.nextCursor).toBe('thread-49');
    });

    it('returns null nextCursor when no more rows exist', async () => {
      prisma.whatsAppThread.findMany.mockResolvedValueOnce([
        {
          id: 'thread-only',
          clinicId: CLINIC_A,
          ownerId: OWNER_ID,
          waPhone: '+919876543210',
          numberStatus: 'VALID',
          lastMessageAt: new Date(),
          lastMessagePreview: 'hi',
          lastContextType: 'NONE',
          unreadCount: 0,
          needsAction: false,
          needsActionReason: null,
        },
      ]);

      const result = await service.listThreads(CLINIC_A, baseQuery());

      expect(result.nextCursor).toBeNull();
    });

    it('passes cursor through to the Prisma query when supplied', async () => {
      await service.listThreads(CLINIC_A, baseQuery({ cursor: 'thread-9' }));

      const call = prisma.whatsAppThread.findMany.mock.calls[0][0];
      expect(call.cursor).toEqual({ id: 'thread-9' });
      expect(call.skip).toBe(1);
    });
  });

  describe('getThread', () => {
    it('returns the thread with its messages ordered by createdAt ascending', async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValueOnce({
        id: THREAD_ID,
        clinicId: CLINIC_A,
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        numberStatus: 'VALID',
        lastMessageAt: new Date(),
        lastMessagePreview: 'hi',
        lastContextType: 'NONE',
        unreadCount: 3,
        needsAction: false,
        needsActionReason: null,
      });
      prisma.petOwner.findFirst.mockResolvedValueOnce({
        id: OWNER_ID,
        name: 'Asha Rao',
        mobile: '+919876543210',
      });
      prisma.pet.findMany.mockResolvedValueOnce([{ id: 'pet-1', name: 'Rocky', species: 'DOG' }]);
      prisma.whatsAppMessage.findMany.mockResolvedValueOnce([
        {
          id: 'msg-1',
          direction: 'OUTBOUND',
          channel: 'SIMULATOR',
          templateKey: 'follow_up_reminder',
          templateCategory: 'REMINDER',
          body: 'hi',
          status: 'FAILED',
          failureCode: 'PROVIDER_UNAVAILABLE',
          failureReason: 'boom',
          contextType: 'REMINDER',
          contextId: null,
          interactiveOptions: null,
          mediaFilename: null,
          staffNote: null,
          sentByUserId: null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
          sentAt: null,
          deliveredAt: null,
          readAt: null,
        },
      ]);

      const result = await service.getThread(CLINIC_A, THREAD_ID);

      expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
        where: { clinicId: CLINIC_A, threadId: THREAD_ID },
        orderBy: { createdAt: 'asc' },
      });
      expect(result.id).toBe(THREAD_ID);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        id: 'msg-1',
        status: 'FAILED',
        failureCode: 'PROVIDER_UNAVAILABLE',
        failureReason: 'boom',
        contextType: 'REMINDER',
        contextId: null,
        interactiveOptions: null,
      });
    });

    it('throws a 404 with code THREAD_NOT_FOUND for another clinic\'s thread, never 403', async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValueOnce(null);

      await expect(service.getThread(CLINIC_B, THREAD_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: 'THREAD_NOT_FOUND',
      });

      expect(prisma.whatsAppThread.findFirst).toHaveBeenCalledWith({
        where: { id: THREAD_ID, clinicId: CLINIC_B },
      });
    });

    it('marks the thread read by resetting unreadCount to 0', async () => {
      prisma.whatsAppThread.findFirst.mockResolvedValueOnce({
        id: THREAD_ID,
        clinicId: CLINIC_A,
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        numberStatus: 'VALID',
        lastMessageAt: new Date(),
        lastMessagePreview: 'hi',
        lastContextType: 'NONE',
        unreadCount: 5,
        needsAction: false,
        needsActionReason: null,
      });

      const result = await service.getThread(CLINIC_A, THREAD_ID);

      expect(prisma.whatsAppThread.updateMany).toHaveBeenCalledWith({
        where: { id: THREAD_ID, clinicId: CLINIC_A },
        data: { unreadCount: 0 },
      });
      expect(result.unreadCount).toBe(0);
    });
  });
});

describe('whatsapp.schema.ts', () => {
  it('threadParamsSchema validates a uuid threadId', () => {
    expect(threadParamsSchema.safeParse({ threadId: THREAD_ID }).success).toBe(true);
    expect(threadParamsSchema.safeParse({ threadId: 'not-a-uuid' }).success).toBe(false);
  });

  it('messageParamsSchema validates a uuid messageId', () => {
    expect(messageParamsSchema.safeParse({ messageId: THREAD_ID }).success).toBe(true);
    expect(messageParamsSchema.safeParse({ messageId: 'not-a-uuid' }).success).toBe(false);
  });

  it('re-exports the request schemas from @breeyo/validators', () => {
    expect(typeof sendTemplateSchema.safeParse).toBe('function');
    expect(typeof retryMessageSchema.safeParse).toBe('function');
  });
});
