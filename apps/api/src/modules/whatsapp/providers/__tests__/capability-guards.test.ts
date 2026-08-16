import { describe, it, expect } from 'vitest';
import type { WaCapabilities } from '@breeyo/types';
import {
  assertButtonLimits,
  assertListLimits,
  assertBodyLength,
  assertRegisteredTemplate,
  isServiceWindowOpen,
} from '../capability-guards.js';
import { WaSendError } from '../wa-provider.port.js';

// Mirrors SIMULATOR_CAPABILITIES / the real Cloud API limits, kept local so
// this suite exercises the guards as data-driven functions, not against one
// hardcoded provider's capabilities object.
const caps: WaCapabilities = {
  requiresTemplateOutsideServiceWindow: true,
  serviceWindowHours: 24,
  requiresRegisteredTemplates: true,
  maxQuickReplyButtons: 3,
  maxButtonTitleChars: 20,
  maxListRows: 10,
  maxListRowTitleChars: 24,
  maxBodyChars: 1024,
  supportsInteractiveList: true,
  mediaMaxBytes: 104857600,
  mediaRequiresUpload: true,
};

describe('assertButtonLimits', () => {
  it('does not throw for a single valid button', () => {
    expect(() =>
      assertButtonLimits([{ id: 'booking:confirm:x', title: 'Confirm' }], caps),
    ).not.toThrow();
  });

  it('throws WaSendError TEMPLATE_PARAM_MISMATCH, non-retryable, for 4 buttons', () => {
    const buttons = Array.from({ length: 4 }, (_, i) => ({
      id: `booking:confirm:${i}`,
      title: 'Confirm',
    }));

    let error: unknown;
    try {
      assertButtonLimits(buttons, caps);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('TEMPLATE_PARAM_MISMATCH');
    expect((error as WaSendError).retryable).toBe(false);
  });

  it('throws for a 21-character button title', () => {
    const title = 'A'.repeat(21);
    expect(() => assertButtonLimits([{ id: 'x', title }], caps)).toThrow(WaSendError);
  });

  it('throws for a button id longer than 256 characters', () => {
    const id = 'x'.repeat(257);
    expect(() => assertButtonLimits([{ id, title: 'OK' }], caps)).toThrow(WaSendError);
  });

  it('does not throw when no buttons are offered', () => {
    expect(() => assertButtonLimits(undefined, caps)).not.toThrow();
  });
});

describe('assertListLimits', () => {
  it('throws for 11 rows', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `row-${i}`, title: 'Row' }));
    expect(() => assertListLimits(rows, caps)).toThrow(WaSendError);
  });

  it('throws for a 25-character row title', () => {
    const title = 'A'.repeat(25);
    expect(() => assertListLimits([{ id: 'row-1', title }], caps)).toThrow(WaSendError);
  });

  it('does not throw for 10 rows of 24-character titles', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `row-${i}`, title: 'A'.repeat(24) }));
    expect(() => assertListLimits(rows, caps)).not.toThrow();
  });

  it('does not throw when no list is offered', () => {
    expect(() => assertListLimits(undefined, caps)).not.toThrow();
  });
});

describe('assertBodyLength', () => {
  it('throws for 1025 characters against a 1024-character max', () => {
    expect(() => assertBodyLength('A'.repeat(1025), 1024)).toThrow(WaSendError);
  });

  it('does not throw at exactly the max', () => {
    expect(() => assertBodyLength('A'.repeat(1024), 1024)).not.toThrow();
  });
});

describe('assertRegisteredTemplate', () => {
  it('does not throw for a registered template key', () => {
    expect(() => assertRegisteredTemplate('follow_up_reminder')).not.toThrow();
  });

  it('throws WaSendError TEMPLATE_NOT_AVAILABLE for an unregistered key', () => {
    let error: unknown;
    try {
      assertRegisteredTemplate('made_up');
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('TEMPLATE_NOT_AVAILABLE');
  });
});

describe('isServiceWindowOpen', () => {
  it('is false when no inbound message has ever been received (null)', () => {
    expect(isServiceWindowOpen(null)).toBe(false);
  });

  it('is true for an expiry one hour in the future', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(isServiceWindowOpen(future)).toBe(true);
  });

  it('is false for an expiry one minute in the past', () => {
    const past = new Date(Date.now() - 60 * 1000);
    expect(isServiceWindowOpen(past)).toBe(false);
  });
});
