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
 * Real-database integration suite (07-08 Task 3) for D-12/D-13's consent
 * behavior. Constructs `WhatsAppService` directly against the real `prisma`
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

async function setupClinicAndOwner() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  const owner = await createTestPetOwner(clinic.id);
  return { user, clinic, owner };
}

describe('WhatsApp Consent (WHA-02)', () => {
  it('send proceeds with missing consent and writes an audit entry (WHA-02, D-13)', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    // No ConsentRecord exists for this owner at all.
    const existing = await prisma.consentRecord.findFirst({ where: { ownerId: owner.id } });
    expect(existing).toBeNull();

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

    // D-13: missing consent WARNS but never blocks -- the send still happens.
    const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
    expect(message?.status).toBe('QUEUED');

    const auditEntry = await prisma.authAuditLog.findFirst({
      where: { clinicId: clinic.id, event: 'WHATSAPP_SENT_WITHOUT_CONSENT' },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry?.metadata).toMatchObject({
      ownerId: owner.id,
      templateKey: 'follow_up_reminder',
    });
  });

  it('send does NOT write a consent-missing audit entry once consent has been granted', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    await service.grantConsent(
      clinic.id,
      owner.id,
      { purposeText: 'WhatsApp updates about my pet', actorId: user.id },
      { clinicId: clinic.id, userId: user.id },
    );

    const auditCountBefore = await prisma.authAuditLog.count({
      where: { clinicId: clinic.id, event: 'WHATSAPP_SENT_WITHOUT_CONSENT' },
    });

    await service.sendTemplate(
      {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'follow_up_reminder',
        variables: { owner_name: owner.name, pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: clinic.id, userId: user.id },
    );

    const auditCountAfter = await prisma.authAuditLog.count({
      where: { clinicId: clinic.id, event: 'WHATSAPP_SENT_WITHOUT_CONSENT' },
    });
    expect(auditCountAfter).toBe(auditCountBefore);
  });

  it("consent grant appends a ConsentRecord with consentType 'whatsapp_communication' and withdrawal stamps withdrawnAt (WHA-02, D-12)", async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    const granted = await service.grantConsent(
      clinic.id,
      owner.id,
      { purposeText: 'WhatsApp updates about my pet', actorId: user.id },
      { clinicId: clinic.id, userId: user.id },
    );

    expect(granted.consentType).toBe('whatsapp_communication');
    expect(granted.withdrawnAt).toBeNull();

    const grantAudit = await prisma.authAuditLog.findFirst({
      where: { clinicId: clinic.id, event: 'WHATSAPP_CONSENT_GRANTED' },
    });
    expect(grantAudit).not.toBeNull();

    const current = await repo.getCurrentWhatsAppConsent(owner.id);
    expect(current?.id).toBe(granted.id);

    const withdrawn = await service.withdrawConsent(clinic.id, owner.id, {
      clinicId: clinic.id,
      userId: user.id,
    });

    expect(withdrawn?.id).toBe(granted.id);
    expect(withdrawn?.withdrawnAt).not.toBeNull();

    // D-12: withdraw STAMPS the existing row -- it does not create a new one.
    const allRecords = await prisma.consentRecord.findMany({ where: { ownerId: owner.id } });
    expect(allRecords).toHaveLength(1);

    // A withdrawn record is no longer "current" (D-12).
    const currentAfterWithdraw = await repo.getCurrentWhatsAppConsent(owner.id);
    expect(currentAfterWithdraw).toBeNull();

    const withdrawAudit = await prisma.authAuditLog.findFirst({
      where: { clinicId: clinic.id, event: 'WHATSAPP_CONSENT_WITHDRAWN' },
    });
    expect(withdrawAudit).not.toBeNull();
  });

  it('grantConsent always appends a NEW row rather than upserting an existing one (D-12)', async () => {
    const { clinic, owner, user } = await setupClinicAndOwner();

    await service.grantConsent(
      clinic.id,
      owner.id,
      { purposeText: 'first grant' },
      { clinicId: clinic.id, userId: user.id },
    );
    await service.withdrawConsent(clinic.id, owner.id, { clinicId: clinic.id, userId: user.id });
    await service.grantConsent(
      clinic.id,
      owner.id,
      { purposeText: 'second grant, after re-opting-in' },
      { clinicId: clinic.id, userId: user.id },
    );

    const allRecords = await prisma.consentRecord.findMany({
      where: { ownerId: owner.id },
      orderBy: { grantedAt: 'asc' },
    });
    expect(allRecords).toHaveLength(2);
    expect(allRecords[0].withdrawnAt).not.toBeNull();
    expect(allRecords[1].withdrawnAt).toBeNull();

    const current = await repo.getCurrentWhatsAppConsent(owner.id);
    expect(current?.id).toBe(allRecords[1].id);
  });
});
