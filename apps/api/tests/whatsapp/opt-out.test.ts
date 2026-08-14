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
 * Real-database integration suite (07-08 Task 3) for D-10/D-11's opt-out
 * gate. Constructs `WhatsAppService` directly against the real `prisma`
 * handle and a fake queue, per plan (HTTP-level coverage lands in 07-13).
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

async function setupOptedOutOwner() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const owner = await createTestPetOwner(clinic.id);

  await service.setOwnerPreference(
    clinic.id,
    owner.id,
    { remindersOptedOut: true, source: 'OWNER_STOP' },
    { clinicId: clinic.id, userId: null },
  );

  return { user, clinic, owner };
}

describe('WhatsApp Opt-Out (WHA-02/03)', () => {
  it('invoice_delivery and booking_confirmation send even when remindersOptedOut is true (WHA-02, D-10)', async () => {
    const { clinic, owner, user } = await setupOptedOutOwner();

    const invoiceResult = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'invoice_delivery',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          invoice_number: 'INV-1',
          amount: '500.00',
          payment_link: 'https://pay.example.com/x',
        },
        contextType: 'INVOICE',
      },
      { clinicId: clinic.id, userId: user.id },
    );
    expect(invoiceResult.messageId).toBeDefined();

    const bookingResult = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'booking_confirmation',
        variables: {
          owner_name: owner.name,
          pet_name: 'Rocky',
          slot_label: 'Tomorrow, 10:00 AM',
          booking_reference: 'BK-1',
        },
        contextType: 'BOOKING',
      },
      { clinicId: clinic.id, userId: user.id },
    );
    expect(bookingResult.messageId).toBeDefined();

    const invoiceMessage = await prisma.whatsAppMessage.findUnique({
      where: { id: invoiceResult.messageId },
    });
    const bookingMessage = await prisma.whatsAppMessage.findUnique({
      where: { id: bookingResult.messageId },
    });
    expect(invoiceMessage?.status).toBe('QUEUED');
    expect(bookingMessage?.status).toBe('QUEUED');
  });

  it("reminder-category templates are blocked for all of that owner's pets when remindersOptedOut is true (WHA-02/03, D-10/D-11)", async () => {
    const { clinic, owner, user } = await setupOptedOutOwner();

    // D-11: opt-out is a single global per-owner toggle -- there is no
    // petId anywhere in the authorization gate, so a reminder mentioning
    // ANY pet on this owner must be refused identically.
    await expect(
      service.sendTemplate(
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
          petId: '11111111-1111-1111-1111-111111111111', // "pet A"
        },
        { clinicId: clinic.id, userId: user.id },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'OWNER_OPTED_OUT' });

    await expect(
      service.sendTemplate(
        {
          ownerId: owner.id,
          waPhone: owner.mobile,
          templateKey: 'deworming_due',
          variables: { owner_name: owner.name, pet_name: 'Milo', due_date: '20 Aug 2026' },
          contextType: 'REMINDER',
          petId: '22222222-2222-2222-2222-222222222222', // "pet B" -- a different pet, same owner
        },
        { clinicId: clinic.id, userId: user.id },
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'OWNER_OPTED_OUT' });

    // No message rows were created for either blocked attempt.
    const count = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });
    expect(count).toBe(0);
  });

  it('a REMINDER template is NOT blocked when the owner has no preference row at all', async () => {
    const user = await createTestUser();
    const clinic = await createTestClinic(user.id);
    const owner = await createTestPetOwner(clinic.id);
    // No setOwnerPreference call -- absence of a row means not opted out.

    const result = await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    expect(result.messageId).toBeDefined();
  });
});
