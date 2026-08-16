import { describe, it, expect } from 'vitest';
import {
  canAccessWhatsAppScreens,
  canAccessWhatsAppConfig,
} from '../../src/features/whatsapp/utils/whatsapp-access';

/**
 * WHA-05 / D-20: the WhatsApp Inbox/Thread SCREENS are gated to Front Desk +
 * Admin only. This is deliberately narrower than the `SEND_WHATSAPP` action
 * permission (Admin, Clinician, Front Desk), which stays server-enforced and
 * unchanged -- these predicates are a client usability gate, not the
 * enforcement point.
 */
describe('canAccessWhatsAppScreens', () => {
  it('allows Admin', () => {
    expect(canAccessWhatsAppScreens('Admin')).toBe(true);
  });

  it('allows FrontDesk', () => {
    expect(canAccessWhatsAppScreens('FrontDesk')).toBe(true);
  });

  it('refuses Clinician (D-20: the send action stays broader, but the screen does not)', () => {
    expect(canAccessWhatsAppScreens('Clinician')).toBe(false);
  });

  it('refuses InventoryManager', () => {
    expect(canAccessWhatsAppScreens('InventoryManager')).toBe(false);
  });

  it('refuses an absent role', () => {
    expect(canAccessWhatsAppScreens(undefined)).toBe(false);
    expect(canAccessWhatsAppScreens('')).toBe(false);
  });

  it('is case-sensitive and does not substring-match', () => {
    expect(canAccessWhatsAppScreens('admin')).toBe(false);
    expect(canAccessWhatsAppScreens('ADMIN')).toBe(false);
    expect(canAccessWhatsAppScreens('AdminUser')).toBe(false);
    expect(canAccessWhatsAppScreens('FrontDeskLead')).toBe(false);
  });
});

describe('canAccessWhatsAppConfig', () => {
  it('allows only Admin', () => {
    expect(canAccessWhatsAppConfig('Admin')).toBe(true);
  });

  it('refuses FrontDesk', () => {
    expect(canAccessWhatsAppConfig('FrontDesk')).toBe(false);
  });

  it('refuses Clinician and InventoryManager', () => {
    expect(canAccessWhatsAppConfig('Clinician')).toBe(false);
    expect(canAccessWhatsAppConfig('InventoryManager')).toBe(false);
  });

  it('refuses an absent role', () => {
    expect(canAccessWhatsAppConfig(undefined)).toBe(false);
    expect(canAccessWhatsAppConfig('')).toBe(false);
  });

  it('is case-sensitive and does not substring-match', () => {
    expect(canAccessWhatsAppConfig('admin')).toBe(false);
    expect(canAccessWhatsAppConfig('SuperAdmin')).toBe(false);
  });
});
