import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditEvent } from '../../../lib/audit-log.js';
import { WhatsAppService } from '../whatsapp.service.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';
import type { SendAuthorizationService } from '../send-authorization.service.js';

vi.mock('../../../lib/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/audit-log.js')>(
    '../../../lib/audit-log.js',
  );
  return {
    ...actual,
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
  };
});

const { writeAuditLog } = await import('../../../lib/audit-log.js');

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';
const THREAD_ID = 'thread-1';
const MESSAGE_ID = 'message-1';

function createMockRepo() {
  return {
    upsertThread: vi.fn(),
    touchThread: vi.fn(),
    createOutboundMessage: vi.fn(),
    findMessageById: vi.fn(),
    grantWhatsAppConsent: vi.fn(),
    withdrawWhatsAppConsent: vi.fn(),
    upsertOwnerPreference: vi.fn(),
  };
}

function createMockAuthz() {
  return {
    authorize: vi.fn(),
  };
}

function createMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    petOwner: { findFirst: vi.fn() },
  };
}

function createMockQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

describe('WhatsAppService.sendTemplate (WHA-02/WHA-05, Pattern 2)', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let authz: ReturnType<typeof createMockAuthz>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let queue: ReturnType<typeof createMockQueue>;
  let service: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    authz = createMockAuthz();
    prisma = createMockPrisma();
    queue = createMockQueue();
    service = new WhatsAppService(
      repo as unknown as WhatsAppRepository,
      authz as unknown as SendAuthorizationService,
      prisma as any,
      queue as any,
      null,
    );

    authz.authorize.mockResolvedValue({ consentWarning: null, numberWarning: null });
    prisma.petOwner.findFirst.mockResolvedValue({ id: OWNER_ID });
    repo.upsertThread.mockResolvedValue({ id: THREAD_ID });
    repo.createOutboundMessage.mockResolvedValue({ id: MESSAGE_ID, body: 'rendered body' });
    repo.touchThread.mockResolvedValue({ count: 1 });
  });

  it('rejects and creates no WhatsAppMessage row when ownerId belongs to another clinic (AC-6)', async () => {
    prisma.petOwner.findFirst.mockResolvedValue(null);

    await expect(
      service.sendTemplate(
        {
          ownerId: OWNER_ID,
          waPhone: '+919876543210',
          templateKey: 'follow_up_reminder',
          variables: { owner_name: 'Asha', pet_name: 'Bruno', follow_up_date: '2026-09-01' },
          contextType: 'REMINDER',
        },
        { clinicId: CLINIC_ID, userId: 'staff-1' },
      ),
    ).rejects.toMatchObject({ code: 'OWNER_NOT_FOUND', statusCode: 404 });

    expect(prisma.petOwner.findFirst).toHaveBeenCalledWith({
      where: { id: OWNER_ID, clinicId: CLINIC_ID },
    });
    expect(authz.authorize).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(repo.createOutboundMessage).not.toHaveBeenCalled();
  });

  it('validates variables against the registry BEFORE any write; a missing variable yields a 400 and creates no WhatsAppMessage row', async () => {
    await expect(
      service.sendTemplate(
        {
          ownerId: OWNER_ID,
          waPhone: '+919876543210',
          templateKey: 'follow_up_reminder',
          variables: { owner_name: 'Asha' }, // missing pet_name, follow_up_date
          contextType: 'REMINDER',
        },
        { clinicId: CLINIC_ID, userId: 'staff-1' },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(repo.createOutboundMessage).not.toHaveBeenCalled();
  });

  it('persists a WhatsAppThread and a WhatsAppMessage(status QUEUED) inside one $transaction and returns { messageId }', async () => {
    const result = await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(result.messageId).toBe(MESSAGE_ID);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(repo.upsertThread).toHaveBeenCalledWith(
      CLINIC_ID,
      { ownerId: OWNER_ID, waPhone: '+919876543210' },
      expect.anything(),
    );
    expect(repo.createOutboundMessage).toHaveBeenCalledTimes(1);
    const createCall = repo.createOutboundMessage.mock.calls[0][1];
    expect(createCall.threadId).toBe(THREAD_ID);
    expect(createCall.body).toContain('Asha');
    expect(createCall.renderedVariables).toMatchObject({ owner_name: 'Asha' });
  });

  it('enqueues exactly one job on the outbound queue after the transaction commits, with jobId send-<messageId>', async () => {
    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe('send');
    expect(data).toEqual({ messageId: MESSAGE_ID });
    expect(opts.jobId).toBe(`send-${MESSAGE_ID}`);
  });

  it('never calls a provider (no provider dependency exists on this service at all)', async () => {
    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect((service as any).resolveProvider).toBeUndefined();
    expect((service as any).provider).toBeUndefined();
  });

  it('writes a WHATSAPP_SENT_WITHOUT_CONSENT audit entry with ownerId and templateKey in metadata when consent is missing (D-13)', async () => {
    authz.authorize.mockResolvedValue({ consentWarning: 'WHATSAPP_CONSENT_MISSING', numberWarning: null });

    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      AuditEvent.WHATSAPP_SENT_WITHOUT_CONSENT,
      expect.objectContaining({
        clinicId: CLINIC_ID,
        metadata: expect.objectContaining({ ownerId: OWNER_ID, templateKey: 'follow_up_reminder' }),
      }),
    );
  });

  it('does not write a consent audit entry when consent is present', async () => {
    authz.authorize.mockResolvedValue({ consentWarning: null, numberWarning: null });

    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('stores contextType and contextId for an invoice send', async () => {
    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'invoice_delivery',
        variables: {
          owner_name: 'Asha',
          pet_name: 'Rocky',
          invoice_number: 'INV-1',
          amount: '500.00',
        },
        contextType: 'INVOICE',
        contextId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    const createCall = repo.createOutboundMessage.mock.calls[0][1];
    expect(createCall.contextType).toBe('INVOICE');
    expect(createCall.contextId).toBe('ffffffff-ffff-ffff-ffff-ffffffffffff');
  });

  it('records sentByUserId for a staff-initiated send and null for an automated send', async () => {
    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );
    expect(repo.createOutboundMessage.mock.calls[0][1].sentByUserId).toBe('staff-1');

    repo.createOutboundMessage.mockClear();
    await service.sendTemplate(
      {
        ownerId: OWNER_ID,
        waPhone: '+919876543210',
        templateKey: 'follow_up_reminder',
        variables: { owner_name: 'Asha', pet_name: 'Rocky', follow_up_date: '14 Aug 2026' },
        contextType: 'REMINDER',
      },
      { clinicId: CLINIC_ID, userId: null },
    );
    expect(repo.createOutboundMessage.mock.calls[0][1].sentByUserId).toBeNull();
  });
});

describe('WhatsAppService.retryMessage (Anti-Pattern A7)', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let authz: ReturnType<typeof createMockAuthz>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let queue: ReturnType<typeof createMockQueue>;
  let service: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    authz = createMockAuthz();
    prisma = createMockPrisma();
    queue = createMockQueue();
    service = new WhatsAppService(
      repo as unknown as WhatsAppRepository,
      authz as unknown as SendAuthorizationService,
      prisma as any,
      queue as any,
      null,
    );
  });

  it('creates a NEW WhatsAppMessage row with retryOfMessageId pointing at the failed one, and does not mutate the failed row', async () => {
    const failed = {
      id: 'failed-1',
      threadId: THREAD_ID,
      channel: 'SIMULATOR',
      templateKey: 'follow_up_reminder',
      templateCategory: 'REMINDER',
      body: 'original body',
      renderedVariables: { owner_name: 'Asha' },
      contextType: 'REMINDER',
      contextId: null,
      staffNote: null,
    };
    repo.findMessageById.mockResolvedValue(failed);
    repo.createOutboundMessage.mockResolvedValue({ id: 'retry-1' });

    const result = await service.retryMessage(CLINIC_ID, 'failed-1', {
      clinicId: CLINIC_ID,
      userId: 'staff-1',
    });

    expect(result.messageId).toBe('retry-1');
    const createCall = repo.createOutboundMessage.mock.calls[0][1];
    expect(createCall.retryOfMessageId).toBe('failed-1');
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'retry-1' },
      expect.objectContaining({ jobId: 'send-retry-1' }),
    );
  });

  it('throws 404 (not 403) for a message belonging to another clinic', async () => {
    repo.findMessageById.mockResolvedValue(null);

    await expect(
      service.retryMessage(CLINIC_ID, 'someone-elses-message', {
        clinicId: CLINIC_ID,
        userId: 'staff-1',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('WhatsAppService consent/preference writes (D-11/D-12)', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let authz: ReturnType<typeof createMockAuthz>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let queue: ReturnType<typeof createMockQueue>;
  let service: WhatsAppService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    authz = createMockAuthz();
    prisma = createMockPrisma();
    queue = createMockQueue();
    service = new WhatsAppService(
      repo as unknown as WhatsAppRepository,
      authz as unknown as SendAuthorizationService,
      prisma as any,
      queue as any,
      null,
    );
  });

  it('grantConsent appends a ConsentRecord and writes a WHATSAPP_CONSENT_GRANTED audit entry', async () => {
    repo.grantWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    await service.grantConsent(
      CLINIC_ID,
      OWNER_ID,
      { purposeText: 'WhatsApp updates' },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(repo.grantWhatsAppConsent).toHaveBeenCalledWith(OWNER_ID, {
      purposeText: 'WhatsApp updates',
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      AuditEvent.WHATSAPP_CONSENT_GRANTED,
      expect.objectContaining({ clinicId: CLINIC_ID }),
    );
  });

  it('withdrawConsent stamps withdrawnAt and writes a WHATSAPP_CONSENT_WITHDRAWN audit entry', async () => {
    repo.withdrawWhatsAppConsent.mockResolvedValue({ id: 'c1', withdrawnAt: new Date() });

    await service.withdrawConsent(CLINIC_ID, OWNER_ID, { clinicId: CLINIC_ID, userId: 'staff-1' });

    expect(repo.withdrawWhatsAppConsent).toHaveBeenCalledWith(OWNER_ID);
    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      AuditEvent.WHATSAPP_CONSENT_WITHDRAWN,
      expect.objectContaining({ clinicId: CLINIC_ID }),
    );
  });

  it('setOwnerPreference(remindersOptedOut true) writes a WHATSAPP_OPT_OUT audit entry (D-11)', async () => {
    repo.upsertOwnerPreference.mockResolvedValue({ remindersOptedOut: true });

    await service.setOwnerPreference(
      CLINIC_ID,
      OWNER_ID,
      { remindersOptedOut: true, source: 'OWNER_STOP' },
      { clinicId: CLINIC_ID, userId: null },
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      prisma,
      AuditEvent.WHATSAPP_OPT_OUT,
      expect.objectContaining({ clinicId: CLINIC_ID }),
    );
  });

  it('does not write an opt-out audit entry when remindersOptedOut is false', async () => {
    repo.upsertOwnerPreference.mockResolvedValue({ remindersOptedOut: false });

    await service.setOwnerPreference(
      CLINIC_ID,
      OWNER_ID,
      { remindersOptedOut: false, source: 'STAFF' },
      { clinicId: CLINIC_ID, userId: 'staff-1' },
    );

    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});
