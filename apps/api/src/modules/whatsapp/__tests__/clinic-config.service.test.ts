import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClinicConfigService } from '../clinic-config.service.js';
import type { WhatsAppRepository } from '../whatsapp.repository.js';

/**
 * WHA-05 / D-14, D-16 — unit suite for `ClinicConfigService`, mocking
 * `WhatsAppRepository` (matches `whatsapp.service.test.ts`'s pattern). The
 * bounds asserted here (`autoReplyDelaySeconds` 3-60, `slotDurationMinutes`
 * 10-120) live in `clinicConfigSchema` (`packages/validators/src/whatsapp.ts`)
 * — this suite proves the SERVICE enforces them via that schema, without
 * re-implementing the numeric bounds itself.
 */

const CLINIC_ID = 'clinic-1';

function createMockRepo() {
  return {
    getOrCreateClinicConfig: vi.fn(),
    updateClinicConfig: vi.fn(),
  };
}

describe('ClinicConfigService (D-14, D-16)', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let service: ClinicConfigService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new ClinicConfigService(repo as unknown as WhatsAppRepository);
  });

  it('getConfig(clinicId) delegates to getOrCreateClinicConfig so a clinic that never visited the config screen still gets working defaults', async () => {
    const defaults = {
      clinicId: CLINIC_ID,
      provider: 'SIMULATOR',
      deliveryMode: 'NORMAL',
      autoReplyEnabled: true,
      autoReplyDelaySeconds: 10,
      allowFreeformOutsideWindow: false,
      slotDurationMinutes: 30,
      escalationMaxAttempts: 2,
      escalationIntervalDays: 3,
    };
    repo.getOrCreateClinicConfig.mockResolvedValue(defaults);

    const result = await service.getConfig(CLINIC_ID);

    expect(repo.getOrCreateClinicConfig).toHaveBeenCalledWith(CLINIC_ID);
    expect(result).toEqual(defaults);
  });

  it('updateConfig with autoReplyDelaySeconds 45 succeeds', async () => {
    repo.updateClinicConfig.mockResolvedValue({ autoReplyDelaySeconds: 45 });

    const result = await service.updateConfig(CLINIC_ID, { autoReplyDelaySeconds: 45 });

    expect(repo.updateClinicConfig).toHaveBeenCalledWith(CLINIC_ID, { autoReplyDelaySeconds: 45 });
    expect(result).toEqual({ autoReplyDelaySeconds: 45 });
  });

  it('updateConfig with autoReplyDelaySeconds 600 is rejected by the schema before the repository is ever called (D-14 bound: 3-60)', async () => {
    await expect(service.updateConfig(CLINIC_ID, { autoReplyDelaySeconds: 600 })).rejects.toThrow();
    expect(repo.updateClinicConfig).not.toHaveBeenCalled();
  });

  it('updateConfig with autoReplyDelaySeconds 1 (below the 3s floor) is rejected', async () => {
    await expect(service.updateConfig(CLINIC_ID, { autoReplyDelaySeconds: 1 })).rejects.toThrow();
    expect(repo.updateClinicConfig).not.toHaveBeenCalled();
  });

  it('updateConfig with slotDurationMinutes below the 10-120 bound (D-14) is rejected', async () => {
    await expect(service.updateConfig(CLINIC_ID, { slotDurationMinutes: 5 })).rejects.toThrow();
    expect(repo.updateClinicConfig).not.toHaveBeenCalled();
  });

  it('updateConfig with slotDurationMinutes above the 10-120 bound is rejected', async () => {
    await expect(service.updateConfig(CLINIC_ID, { slotDurationMinutes: 500 })).rejects.toThrow();
    expect(repo.updateClinicConfig).not.toHaveBeenCalled();
  });

  it('updateConfig with deliveryMode INVALID_NUMBER succeeds — a single clinic-wide control, never per-thread (D-16)', async () => {
    repo.updateClinicConfig.mockResolvedValue({ deliveryMode: 'INVALID_NUMBER' });

    const result = await service.updateConfig(CLINIC_ID, { deliveryMode: 'INVALID_NUMBER' });

    expect(repo.updateClinicConfig).toHaveBeenCalledWith(CLINIC_ID, { deliveryMode: 'INVALID_NUMBER' });
    expect(result).toEqual({ deliveryMode: 'INVALID_NUMBER' });
  });

  it('updateConfig with allowFreeformOutsideWindow true succeeds — an explicit opt-in, not applied unless sent', async () => {
    repo.updateClinicConfig.mockResolvedValue({ allowFreeformOutsideWindow: true });

    const result = await service.updateConfig(CLINIC_ID, { allowFreeformOutsideWindow: true });

    expect(repo.updateClinicConfig).toHaveBeenCalledWith(CLINIC_ID, { allowFreeformOutsideWindow: true });
    expect(result).toEqual({ allowFreeformOutsideWindow: true });
  });

  it('updateConfig with an unrecognized deliveryMode is rejected by the schema', async () => {
    await expect(
      service.updateConfig(CLINIC_ID, { deliveryMode: 'NOT_A_REAL_MODE' }),
    ).rejects.toThrow();
    expect(repo.updateClinicConfig).not.toHaveBeenCalled();
  });
});
