import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendAuthorizationService } from '../send-authorization.service.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';

function createMockRepo(): {
  getOwnerPreference: ReturnType<typeof vi.fn>;
  getCurrentWhatsAppConsent: ReturnType<typeof vi.fn>;
} {
  return {
    getOwnerPreference: vi.fn(),
    getCurrentWhatsAppConsent: vi.fn(),
  };
}

const CLINIC_ID = 'clinic-1';
const OWNER_ID = 'owner-1';

describe('SendAuthorizationService (D-10/D-11/D-12/D-13)', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: SendAuthorizationService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new SendAuthorizationService(repo as unknown as WhatsAppRepository);
  });

  it('throws 403 OWNER_OPTED_OUT for a REMINDER-category template when remindersOptedOut is true (D-10/D-11)', async () => {
    repo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: true, numberStatus: 'VALID' });
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    await expect(
      service.authorize({ clinicId: CLINIC_ID, ownerId: OWNER_ID, templateKey: 'follow_up_reminder' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'OWNER_OPTED_OUT' });
  });

  it('resolves for invoice_delivery even when remindersOptedOut is true — transactional templates are always attempted (D-10)', async () => {
    repo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: true, numberStatus: 'VALID' });
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'invoice_delivery',
    });

    expect(result.consentWarning).toBeNull();
  });

  it('resolves for booking_confirmation even when remindersOptedOut is true (D-10)', async () => {
    repo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: true, numberStatus: 'VALID' });
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    await expect(
      service.authorize({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        templateKey: 'booking_confirmation',
      }),
    ).resolves.toBeDefined();
  });

  it('resolves for a REMINDER template when there is no preference row at all', async () => {
    repo.getOwnerPreference.mockResolvedValue(null);
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    await expect(
      service.authorize({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        templateKey: 'vaccine_due',
      }),
    ).resolves.toBeDefined();
  });

  it("returns consentWarning 'WHATSAPP_CONSENT_MISSING' when there is no current consent (D-13 warn, never block)", async () => {
    repo.getOwnerPreference.mockResolvedValue(null);
    repo.getCurrentWhatsAppConsent.mockResolvedValue(null);

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'vaccine_due',
    });

    expect(result.consentWarning).toBe('WHATSAPP_CONSENT_MISSING');
  });

  it('returns consentWarning null with a granted, non-withdrawn consent', async () => {
    repo.getOwnerPreference.mockResolvedValue(null);
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1', withdrawnAt: null });

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'vaccine_due',
    });

    expect(result.consentWarning).toBeNull();
  });

  it('returns consentWarning WHATSAPP_CONSENT_MISSING when the only consent record has been withdrawn (D-12)', async () => {
    repo.getOwnerPreference.mockResolvedValue(null);
    // The repository's own query filters out withdrawn rows -- a withdrawn
    // consent means "no current consent", surfaced here as null.
    repo.getCurrentWhatsAppConsent.mockResolvedValue(null);

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'vaccine_due',
    });

    expect(result.consentWarning).toBe('WHATSAPP_CONSENT_MISSING');
  });

  it('returns a numberWarning when the owner preference numberStatus is INVALID', async () => {
    repo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: false, numberStatus: 'INVALID' });
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'vaccine_due',
    });

    expect(result.numberWarning).not.toBeNull();
  });

  it('returns numberWarning null when numberStatus is VALID or absent', async () => {
    repo.getOwnerPreference.mockResolvedValue(null);
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    const result = await service.authorize({
      clinicId: CLINIC_ID,
      ownerId: OWNER_ID,
      templateKey: 'vaccine_due',
    });

    expect(result.numberWarning).toBeNull();
  });

  it("blocks a REMINDER send for pet B when the STOP was recorded at the owner level while messaging about pet A (D-11) — the gate has no petId input at all", async () => {
    repo.getOwnerPreference.mockResolvedValue({ remindersOptedOut: true, numberStatus: 'VALID' });
    repo.getCurrentWhatsAppConsent.mockResolvedValue({ id: 'c1' });

    // authorize() never takes a petId -- the opt-out check is keyed purely on
    // (clinicId, ownerId), so it is structurally impossible for a different
    // pet on the same owner to bypass it.
    await expect(
      service.authorize({ clinicId: CLINIC_ID, ownerId: OWNER_ID, templateKey: 'deworming_due' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'OWNER_OPTED_OUT' });
    expect(repo.getOwnerPreference).toHaveBeenCalledWith(CLINIC_ID, OWNER_ID);
  });

  it('throws TEMPLATE_UNKNOWN for an unrecognized template key before touching the repository', async () => {
    await expect(
      service.authorize({
        clinicId: CLINIC_ID,
        ownerId: OWNER_ID,
        templateKey: 'nope' as never,
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'TEMPLATE_UNKNOWN' });
    expect(repo.getOwnerPreference).not.toHaveBeenCalled();
  });
});
