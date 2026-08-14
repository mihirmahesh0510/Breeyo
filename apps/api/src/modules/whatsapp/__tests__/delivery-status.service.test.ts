import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SOCKET_EVENTS } from '@breeyo/types';
import { DeliveryStatusService } from '../delivery-status.service.js';

/**
 * WHA-05 — DeliveryStatusService (07-RESEARCH § Pattern 9, § Pitfall 14).
 *
 * `apply()` is the ONLY code path permitted to mutate `WhatsAppMessage.status`.
 * These are unit tests against a mocked repository/prisma/io — the real-database
 * ledger-ordering assertions live in `apps/api/tests/whatsapp/status-ledger.test.ts`.
 */

const CLINIC_ID = 'clinic-1';
const MESSAGE_ID = 'message-1';
const PROVIDER_MESSAGE_ID = 'wamid.TEST1';

function buildMessage(overrides: Partial<{ id: string; clinicId: string; status: string }> = {}) {
  return {
    id: overrides.id ?? MESSAGE_ID,
    clinicId: overrides.clinicId ?? CLINIC_ID,
    status: overrides.status ?? 'QUEUED',
  };
}

function createMockRepository() {
  return {
    appendStatusEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    updateMessageStatus: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

function createMockPrisma(message: unknown) {
  return {
    whatsAppMessage: {
      findFirst: vi.fn().mockResolvedValue(message),
    },
  };
}

function createMockIo() {
  const emit = vi.fn();
  const io = { to: vi.fn().mockReturnValue({ emit }) };
  return { io, emit };
}

describe('DeliveryStatusService.apply (WHA-05, Pattern 9)', () => {
  let repository: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockRepository();
  });

  it("apply('SENT', ...) on a QUEUED message sets status SENT and sentAt", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'QUEUED' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);
    const occurredAt = new Date('2026-08-15T10:00:00Z');

    const result = await service.apply(PROVIDER_MESSAGE_ID, 'SENT', null, occurredAt);

    expect(result.applied).toBe(true);
    expect(repository.updateMessageStatus).toHaveBeenCalledWith(
      CLINIC_ID,
      MESSAGE_ID,
      expect.objectContaining({ status: 'SENT', sentAt: occurredAt }),
    );
  });

  it("apply('DELIVERED') then apply('SENT') leaves the message DELIVERED (monotonic by rank)", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    // First call: SENT -> DELIVERED (advances).
    await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());
    expect(repository.updateMessageStatus).toHaveBeenCalledTimes(1);
    expect(repository.updateMessageStatus).toHaveBeenLastCalledWith(
      CLINIC_ID,
      MESSAGE_ID,
      expect.objectContaining({ status: 'DELIVERED' }),
    );

    // Second call: the row is now DELIVERED; a late SENT must not downgrade it.
    prisma.whatsAppMessage.findFirst.mockResolvedValue(buildMessage({ status: 'DELIVERED' }));
    const result = await service.apply(PROVIDER_MESSAGE_ID, 'SENT', null, new Date());

    expect(result.applied).toBe(false);
    // Still only the one call from the first, advancing apply.
    expect(repository.updateMessageStatus).toHaveBeenCalledTimes(1);
  });

  it("apply('READ') on a DELIVERED message sets status READ and readAt", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'DELIVERED' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);
    const occurredAt = new Date('2026-08-15T10:05:00Z');

    const result = await service.apply(PROVIDER_MESSAGE_ID, 'READ', null, occurredAt);

    expect(result.applied).toBe(true);
    expect(repository.updateMessageStatus).toHaveBeenCalledWith(
      CLINIC_ID,
      MESSAGE_ID,
      expect.objectContaining({ status: 'READ', readAt: occurredAt }),
    );
  });

  it("apply('DELIVERED') after 'READ' leaves the message READ", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'READ' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    const result = await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());

    expect(result.applied).toBe(false);
    expect(repository.updateMessageStatus).not.toHaveBeenCalled();
  });

  it("apply('FAILED', { code: 'NOT_ON_WHATSAPP' }) sets FAILED, failedAt, failureCode and failureReason", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);
    const occurredAt = new Date('2026-08-15T10:10:00Z');

    const result = await service.apply(
      PROVIDER_MESSAGE_ID,
      'FAILED',
      { code: 'NOT_ON_WHATSAPP', providerCode: '131026' },
      occurredAt,
    );

    expect(result.applied).toBe(true);
    expect(repository.updateMessageStatus).toHaveBeenCalledWith(
      CLINIC_ID,
      MESSAGE_ID,
      expect.objectContaining({
        status: 'FAILED',
        failedAt: occurredAt,
        failureCode: 'NOT_ON_WHATSAPP',
      }),
    );
    const call = repository.updateMessageStatus.mock.calls[0][2];
    expect(call.failureReason).toBeTruthy();
  });

  it('apply(DELIVERED) on a FAILED message leaves it FAILED (terminal by precedence)', async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'FAILED' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    const result = await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());

    expect(result.applied).toBe(false);
    expect(repository.updateMessageStatus).not.toHaveBeenCalled();
    // Ledger row still appended even though nothing advanced.
    expect(repository.appendStatusEvent).toHaveBeenCalledTimes(1);
  });

  it("apply('REPLIED') on a DELIVERED message sets status REPLIED (highest rank)", async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'DELIVERED' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    const result = await service.apply(PROVIDER_MESSAGE_ID, 'REPLIED', null, new Date());

    expect(result.applied).toBe(true);
    expect(repository.updateMessageStatus).toHaveBeenCalledWith(
      CLINIC_ID,
      MESSAGE_ID,
      expect.objectContaining({ status: 'REPLIED' }),
    );
  });

  it('appends a WhatsAppMessageStatusEvent row on EVERY call, including calls that do not advance the status', async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'READ' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());

    expect(repository.appendStatusEvent).toHaveBeenCalledTimes(1);
    expect(repository.appendStatusEvent).toHaveBeenCalledWith(
      MESSAGE_ID,
      'DELIVERED',
      null,
      null,
      expect.any(Date),
    );
  });

  it('for an unknown providerMessageId appends no event and throws nothing', async () => {
    const prisma = createMockPrisma(null);
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    const result = await service.apply('wamid.UNKNOWN', 'DELIVERED', null, new Date());

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('UNKNOWN_MESSAGE');
    expect(repository.appendStatusEvent).not.toHaveBeenCalled();
    expect(repository.updateMessageStatus).not.toHaveBeenCalled();
  });

  it('emits WHATSAPP_MESSAGE_STATUS_CHANGED to room clinic:{clinicId} exactly once per applied change, and does not emit on a non-advancing call', async () => {
    const { io, emit } = createMockIo();
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, io as any);

    await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());

    expect(io.to).toHaveBeenCalledWith(`clinic:${CLINIC_ID}`);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.WHATSAPP_MESSAGE_STATUS_CHANGED,
      expect.objectContaining({ messageId: MESSAGE_ID, status: 'DELIVERED' }),
    );

    // Non-advancing call: DELIVERED after DELIVERED.
    vi.clearAllMocks();
    prisma.whatsAppMessage.findFirst.mockResolvedValue(buildMessage({ status: 'DELIVERED' }));
    await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date());
    expect(emit).not.toHaveBeenCalled();
  });

  it('apply with io null performs the update without throwing', async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    await expect(
      service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date()),
    ).resolves.toMatchObject({ applied: true });
  });

  it('is idempotent for an identical duplicate call: the status is unchanged and exactly one additional ledger row exists', async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    await service.apply(PROVIDER_MESSAGE_ID, 'SENT', null, new Date());
    expect(repository.appendStatusEvent).toHaveBeenCalledTimes(1);
    expect(repository.updateMessageStatus).not.toHaveBeenCalled(); // SENT->SENT never advances

    // Duplicate identical call.
    const result = await service.apply(PROVIDER_MESSAGE_ID, 'SENT', null, new Date());

    expect(result.applied).toBe(false);
    expect(repository.appendStatusEvent).toHaveBeenCalledTimes(2); // one additional row
    expect(repository.updateMessageStatus).not.toHaveBeenCalled(); // status still unchanged
  });

  it('scrubs Authorization/access_token fields from the stored raw payload', async () => {
    const prisma = createMockPrisma(buildMessage({ status: 'SENT' }));
    const service = new DeliveryStatusService(repository as any, prisma as any, null);

    await service.apply(PROVIDER_MESSAGE_ID, 'DELIVERED', null, new Date(), {
      access_token: 'secret-token',
      Authorization: 'Bearer secret',
      pricing: { billable: true },
    });

    const storedPayload = repository.appendStatusEvent.mock.calls[0][3];
    expect(JSON.stringify(storedPayload)).not.toContain('secret-token');
    expect(JSON.stringify(storedPayload)).not.toContain('Bearer secret');
    expect(storedPayload).toMatchObject({ pricing: { billable: true } });
  });
});
