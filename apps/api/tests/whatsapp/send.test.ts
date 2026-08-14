import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestPetOwner,
  prisma,
} from '../helpers/factories.js';
import { WhatsAppRepository } from '../../src/modules/whatsapp/whatsapp.repository.js';
import { SendAuthorizationService } from '../../src/modules/whatsapp/send-authorization.service.js';
import { WhatsAppService } from '../../src/modules/whatsapp/whatsapp.service.js';

/**
 * Real-database integration suite (07-08 Task 3). Per the plan: construct
 * `WhatsAppService` directly against the real `prisma` handle from
 * `tests/helpers/factories.js` and a fake queue object (`{ add: vi.fn() }`)
 * — NOT `buildTestApp()`/HTTP. The route/controller layer (and its
 * `requirePermission('SEND_WHATSAPP')` gate) lands in 07-12/07-13.
 */

let repo: WhatsAppRepository;
let authz: SendAuthorizationService;
let queue: { add: ReturnType<typeof vi.fn> };
let service: WhatsAppService;

beforeAll(() => {
  repo = new WhatsAppRepository(prisma);
  authz = new SendAuthorizationService(repo);
});

beforeEach(() => {
  queue = { add: vi.fn().mockResolvedValue(undefined) };
  service = new WhatsAppService(repo, authz, prisma, queue, null);
});

afterAll(async () => {
  await cleanupTestData();
});

async function setupClinicAndOwner() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const owner = await createTestPetOwner(clinic.id);
  return { user, clinic, owner };
}

describe('WhatsApp Send (WHA-05)', () => {
  it('send persists WhatsAppMessage(status=QUEUED) before any dispatch (WHA-05, Pattern 2)', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const { messageId } = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          follow_up_date: '14 Aug 2026',
        },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    // The row is persisted and QUEUED -- assert this directly against the
    // database, independent of whatever the (fake, no-op) queue does.
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    expect(message).not.toBeNull();
    expect(message?.status).toBe('QUEUED');
    expect(message?.clinicId).toBe(clinic.id);
    expect(message?.templateKey).toBe('follow_up_reminder');
    expect(message?.templateCategory).toBe('REMINDER');
    expect(message?.sentByUserId).toBe(user.id);
    expect(message?.body).toContain(owner.name);
    expect(message?.queuedAt).not.toBeNull();

    // The thread was upserted for this (clinic, waPhone) pair.
    const thread = await prisma.whatsAppThread.findUnique({ where: { id: message!.threadId } });
    expect(thread).not.toBeNull();
    expect(thread?.clinicId).toBe(clinic.id);
    expect(thread?.ownerId).toBe(owner.id);

    // Dispatch happens AFTER persistence, by row id, with a deduplicated jobId.
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe('send');
    expect(data).toEqual({ messageId });
    expect(opts.jobId).toBe(`send:${messageId}`);
  });

  it('sending the same owner+phone twice reuses the same thread rather than creating a duplicate', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const first = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );
    const second = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'vaccine_due',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          vaccine_name: 'Rabies',
          due_date: '20 Aug 2026',
        },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    const firstMessage = await prisma.whatsAppMessage.findUnique({ where: { id: first.messageId } });
    const secondMessage = await prisma.whatsAppMessage.findUnique({
      where: { id: second.messageId },
    });

    expect(firstMessage?.threadId).toBe(secondMessage?.threadId);

    const threads = await prisma.whatsAppThread.findMany({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    expect(threads).toHaveLength(1);
  });

  it('invoice_delivery send stores contextType INVOICE and contextId with no foreign-key error (WHA-02, Pitfall 8)', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();
    const fakeInvoiceId = '99999999-9999-9999-9999-999999999999';

    const { messageId } = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'invoice_delivery',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          invoice_number: 'INV-2026-0001',
          amount: '1,000.00',
          payment_link: 'https://pay.example.com/abc',
        },
        contextType: 'INVOICE',
        contextId: fakeInvoiceId,
      },
      { clinicId: clinic.id, userId: user.id },
    );

    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    expect(message?.contextType).toBe('INVOICE');
    expect(message?.contextId).toBe(fakeInvoiceId);
    expect(message?.body).toContain('Pay now');
  });

  it('D-23: a paid-invoice send (payment_link omitted) renders without a Pay now line', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const { messageId } = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'invoice_delivery',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          invoice_number: 'INV-2026-0002',
          amount: '1,000.00',
          // payment_link omitted -- invoice already paid
        },
        contextType: 'INVOICE',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    expect(message?.body).not.toContain('Pay now');
  });

  it('a missing required variable is a 400 and creates no WhatsAppMessage row', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const before = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });

    await expect(
      service.sendTemplate(
        {
          ownerId: owner.id,
          waPhone: owner.mobile,
          templateKey: 'vaccine_due',
          variables: { owner_name: owner.name }, // missing pet_name, vaccine_name, due_date
          contextType: 'REMINDER',
        },
        { clinicId: clinic.id, userId: user.id },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    const after = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });
    expect(after).toBe(before);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('retryMessage creates a NEW message row and leaves the failed row untouched', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const { messageId } = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    // Simulate a provider-reported failure on the original message.
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { status: 'FAILED', failureCode: 'PROVIDER_UNAVAILABLE', failureReason: 'boom' },
    });

    const { messageId: retryId } = await service.retryMessage(clinic.id, messageId, {
      clinicId: clinic.id,
      userId: user.id,
    });

    expect(retryId).not.toBe(messageId);

    const original = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    const retry = await prisma.whatsAppMessage.findUnique({ where: { id: retryId } });

    expect(original?.status).toBe('FAILED'); // untouched by the retry
    expect(original?.failureCode).toBe('PROVIDER_UNAVAILABLE');
    expect(retry?.status).toBe('QUEUED');
    expect(retry?.retryOfMessageId).toBe(messageId);
  });

  it('retryMessage on a message belonging to another clinic throws 404, not 403', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();
    const { clinic: otherClinic } = await setupClinicAndOwner();

    const { messageId } = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    await expect(
      service.retryMessage(otherClinic.id, messageId, { clinicId: otherClinic.id, userId: user.id }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
