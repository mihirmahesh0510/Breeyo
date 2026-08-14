import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
  prisma,
} from '../helpers/factories.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { DeliveryStatusService } from '../../src/modules/whatsapp/delivery-status.service.js';

/**
 * Real-database integration suite (07-09 Task 1) for WHA-05's append-only
 * status ledger. Constructs `DeliveryStatusService` directly against the real
 * `prisma` handle, matching the precedent in `tests/whatsapp/opt-out.test.ts`
 * — HTTP-level coverage is out of scope for this service.
 */

let repository: WhatsAppRepository;
let service: DeliveryStatusService;

beforeAll(() => {
  repository = new WhatsAppRepository(prisma);
  service = new DeliveryStatusService(repository, prisma, null);
});

afterAll(async () => {
  await cleanupTestData();
});

async function setupQueuedMessage(providerMessageId: string) {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const thread = await createTestWhatsAppThread(clinic.id, randomUUID());
  const message = await createTestWhatsAppMessage(clinic.id, thread.id, {
    providerMessageId,
    status: 'QUEUED',
  });
  return { clinic, thread, message };
}

describe('WhatsApp Status Ledger (WHA-05)', () => {
  it('every status change appends a WhatsAppMessageStatusEvent row (WHA-05)', async () => {
    const providerMessageId = `wamid.${randomUUID()}`;
    const { message } = await setupQueuedMessage(providerMessageId);

    await service.apply(providerMessageId, 'SENT', null, new Date());

    const events = await prisma.whatsAppMessageStatusEvent.findMany({
      where: { messageId: message.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('SENT');
  });

  it('after applying SENT, DELIVERED, READ in order, the ledger contains 3 rows ordered by occurredAt for that message', async () => {
    const providerMessageId = `wamid.${randomUUID()}`;
    const { message } = await setupQueuedMessage(providerMessageId);

    const t0 = new Date('2026-08-15T09:00:00Z');
    const t1 = new Date('2026-08-15T09:00:02Z');
    const t2 = new Date('2026-08-15T09:00:05Z');

    await service.apply(providerMessageId, 'SENT', null, t0);
    await service.apply(providerMessageId, 'DELIVERED', null, t1);
    await service.apply(providerMessageId, 'READ', null, t2);

    const events = await prisma.whatsAppMessageStatusEvent.findMany({
      where: { messageId: message.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.status)).toEqual(['SENT', 'DELIVERED', 'READ']);

    const finalMessage = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
    expect(finalMessage?.status).toBe('READ');
  });

  it('after applying DELIVERED then SENT, the message row status is DELIVERED and the ledger still contains 2 rows (the non-advancing event is recorded)', async () => {
    const providerMessageId = `wamid.${randomUUID()}`;
    const { message } = await setupQueuedMessage(providerMessageId);

    await service.apply(providerMessageId, 'DELIVERED', null, new Date('2026-08-15T09:00:00Z'));
    await service.apply(providerMessageId, 'SENT', null, new Date('2026-08-15T09:00:10Z'));

    const finalMessage = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
    expect(finalMessage?.status).toBe('DELIVERED');

    const events = await prisma.whatsAppMessageStatusEvent.findMany({
      where: { messageId: message.id },
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.status).sort()).toEqual(['DELIVERED', 'SENT']);
  });

  it('applying FAILED persists failureCode/failureReason/failedAt, and a later DELIVERED leaves it FAILED', async () => {
    const providerMessageId = `wamid.${randomUUID()}`;
    const { message } = await setupQueuedMessage(providerMessageId);

    await service.apply(
      providerMessageId,
      'FAILED',
      { code: 'NOT_ON_WHATSAPP', providerCode: '131026', reason: 'Recipient is not on WhatsApp' },
      new Date('2026-08-15T09:00:00Z'),
    );

    let finalMessage = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
    expect(finalMessage?.status).toBe('FAILED');
    expect(finalMessage?.failureCode).toBe('NOT_ON_WHATSAPP');
    expect(finalMessage?.failedAt).not.toBeNull();

    await service.apply(providerMessageId, 'DELIVERED', null, new Date('2026-08-15T09:00:10Z'));

    finalMessage = await prisma.whatsAppMessage.findUnique({ where: { id: message.id } });
    expect(finalMessage?.status).toBe('FAILED');
  });

  it('tolerates an unknown providerMessageId without throwing and writes no ledger row', async () => {
    await expect(
      service.apply(`wamid.${randomUUID()}`, 'DELIVERED', null, new Date()),
    ).resolves.toMatchObject({ applied: false, reason: 'UNKNOWN_MESSAGE' });
  });
});
