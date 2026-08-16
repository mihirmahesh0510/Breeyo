import { describe, it, expect } from 'vitest';
import {
  toMetaTemplatePayload,
  toMetaTextPayload,
  toMetaInteractivePayload,
  fromMetaSendResponse,
  normalizeMetaError,
  META_ERROR_CODE_MAP,
  type MetaTemplateComponent,
} from '../cloud-api/cloud-api.mapper.js';
import { WaSendError, type WaSendTemplateCommand } from '../wa-provider.port.js';

/**
 * WHA-04 — Task 1 (07-07-PLAN). Pure-function tests: no I/O, no fetch,
 * no mocking. Confirms every Meta shape needed for a send lives here and
 * that Meta's error codes normalize to the correct WaFailureCode/retryable
 * pair.
 */

function createTemplateCommand(overrides: Partial<WaSendTemplateCommand> = {}): WaSendTemplateCommand {
  return {
    to: '+919876543210',
    templateKey: 'vaccine_due',
    languageCode: 'en',
    variables: {
      owner_name: 'Asha',
      pet_name: 'Rocky',
      vaccine_name: 'Rabies',
      due_date: '15 Aug 2026',
    },
    idempotencyKey: 'msg-1',
    ...overrides,
  };
}

const TEMPLATE_META = { name: 'vaccine_due_en', languageCode: 'en', metaCategory: 'UTILITY' as const };

describe('toMetaTemplatePayload', () => {
  it('returns the required Cloud API envelope with template name/language set', () => {
    const payload = toMetaTemplatePayload(createTemplateCommand(), TEMPLATE_META);

    expect(payload.messaging_product).toBe('whatsapp');
    expect(payload.recipient_type).toBe('individual');
    expect(payload.to).toBe('+919876543210');
    expect(payload.type).toBe('template');
    expect(payload.template.name).toBe('vaccine_due_en');
    expect(payload.template.language.code).toBe('en');
  });

  it('emits a body component whose parameters are named text parameters matching each variable key', () => {
    const payload = toMetaTemplatePayload(createTemplateCommand(), TEMPLATE_META);
    const bodyComponent = payload.template.components?.find(
      (c: MetaTemplateComponent) => c.type === 'body',
    );

    expect(bodyComponent).toBeDefined();
    const keys = ['owner_name', 'pet_name', 'vaccine_name', 'due_date'];
    for (const param of bodyComponent!.parameters as Array<{ type: string; text?: string; parameter_name?: string }>) {
      expect(param.type).toBe('text');
      expect(typeof param.text).toBe('string');
      expect(keys).toContain(param.parameter_name);
    }
  });

  it('emits a document header component referencing the media id, with no raw URL anywhere', () => {
    const payload = toMetaTemplatePayload(
      createTemplateCommand({
        media: {
          providerMediaId: 'media-abc-123',
          filename: 'invoice.pdf',
          mimeType: 'application/pdf',
          expiresAt: null,
        },
      }),
      TEMPLATE_META,
    );

    const headerComponent = payload.template.components?.find(
      (c: MetaTemplateComponent) => c.type === 'header',
    );
    expect(headerComponent).toBeDefined();

    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('media-abc-123');
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it('throws WaSendError before producing a payload when 4 buttons are offered (assertButtonLimits)', () => {
    const buttons = Array.from({ length: 4 }, (_, i) => ({ id: `booking:confirm:${i}`, title: 'Confirm' }));

    expect(() => toMetaTemplatePayload(createTemplateCommand({ buttons }), TEMPLATE_META)).toThrow(WaSendError);
  });
});

describe('toMetaTextPayload', () => {
  it('returns type text with text.body set and text.preview_url false', () => {
    const payload = toMetaTextPayload('+919876543210', 'Thanks for visiting!');

    expect(payload.messaging_product).toBe('whatsapp');
    expect(payload.type).toBe('text');
    expect(payload.text.body).toBe('Thanks for visiting!');
    expect(payload.text.preview_url).toBe(false);
  });
});

describe('toMetaInteractivePayload', () => {
  it('returns interactive.type list with a single section containing 10 rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `slot-${i}`, title: `Slot ${i}` }));

    const payload = toMetaInteractivePayload({
      to: '+919876543210',
      bodyText: 'Pick a slot',
      list: { buttonText: 'Choose', rows },
    });

    expect(payload.interactive.type).toBe('list');
    if (payload.interactive.type === 'list') {
      expect(payload.interactive.action.sections).toHaveLength(1);
      expect(payload.interactive.action.sections[0].rows).toHaveLength(10);
    }
  });

  it('throws WaSendError for 11 rows', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ id: `slot-${i}`, title: `Slot ${i}` }));

    expect(() =>
      toMetaInteractivePayload({
        to: '+919876543210',
        bodyText: 'Pick a slot',
        list: { buttonText: 'Choose', rows },
      }),
    ).toThrow(WaSendError);
  });

  it('returns interactive.type button with 3 action.buttons entries each of type reply', () => {
    const buttons = [
      { id: 'booking:confirm:1', title: 'Confirm' },
      { id: 'booking:move:1', title: 'Move' },
      { id: 'booking:cancel:1', title: 'Cancel' },
    ];

    const payload = toMetaInteractivePayload({
      to: '+919876543210',
      bodyText: 'Manage your booking',
      buttons,
    });

    expect(payload.interactive.type).toBe('button');
    if (payload.interactive.type === 'button') {
      expect(payload.interactive.action.buttons).toHaveLength(3);
      for (const b of payload.interactive.action.buttons) {
        expect(b.type).toBe('reply');
      }
    }
  });
});

describe('fromMetaSendResponse', () => {
  it('maps an accepted response to ACCEPTED with resolvedWaId and a Date acceptedAt', () => {
    const result = fromMetaSendResponse({
      messages: [{ id: 'wamid.X', message_status: 'accepted' }],
      contacts: [{ input: '+919876543210', wa_id: '919876543210' }],
    });

    expect(result.providerMessageId).toBe('wamid.X');
    expect(result.acceptedStatus).toBe('ACCEPTED');
    expect(result.resolvedWaId).toBe('919876543210');
    expect(result.acceptedAt).toBeInstanceOf(Date);
  });

  it('maps held_for_quality_assessment to HELD_FOR_REVIEW and paused to PAUSED', () => {
    expect(
      fromMetaSendResponse({ messages: [{ id: 'wamid.A', message_status: 'held_for_quality_assessment' }] })
        .acceptedStatus,
    ).toBe('HELD_FOR_REVIEW');

    expect(
      fromMetaSendResponse({ messages: [{ id: 'wamid.B', message_status: 'paused' }] }).acceptedStatus,
    ).toBe('PAUSED');
  });

  it('never returns an acceptedStatus of DELIVERED for any input', () => {
    const result = fromMetaSendResponse({ messages: [{ id: 'wamid.C', message_status: 'accepted' }] });
    expect(result.acceptedStatus).not.toBe('DELIVERED');
  });

  it('throws WaSendError with code UNKNOWN on an empty messages array', () => {
    let error: unknown;
    try {
      fromMetaSendResponse({ messages: [] });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(WaSendError);
    expect((error as WaSendError).code).toBe('UNKNOWN');
  });
});

describe('normalizeMetaError', () => {
  it('maps 131026 to NOT_ON_WHATSAPP, non-retryable', () => {
    expect(normalizeMetaError({ code: 131026 })).toMatchObject({ code: 'NOT_ON_WHATSAPP', retryable: false });
  });

  it('maps 131047 to OUTSIDE_SERVICE_WINDOW, 131049 to SUPPRESSED_BY_META', () => {
    expect(normalizeMetaError({ code: 131047 }).code).toBe('OUTSIDE_SERVICE_WINDOW');
    expect(normalizeMetaError({ code: 131049 }).code).toBe('SUPPRESSED_BY_META');
  });

  it('maps 132000 to TEMPLATE_PARAM_MISMATCH and 132001 to TEMPLATE_NOT_AVAILABLE', () => {
    expect(normalizeMetaError({ code: 132000 }).code).toBe('TEMPLATE_PARAM_MISMATCH');
    expect(normalizeMetaError({ code: 132001 }).code).toBe('TEMPLATE_NOT_AVAILABLE');
  });

  it('maps 4, 80007 and 130429 to RATE_LIMITED with retryable true', () => {
    for (const code of [4, 80007, 130429]) {
      expect(normalizeMetaError({ code })).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    }
  });

  it('falls back to UNKNOWN, non-retryable, for an unmapped code rather than throwing', () => {
    expect(() => normalizeMetaError({ code: 999999 })).not.toThrow();
    expect(normalizeMetaError({ code: 999999 })).toMatchObject({ code: 'UNKNOWN', retryable: false });
  });

  it('preserves the numeric Meta code as providerCode', () => {
    expect(normalizeMetaError({ code: 131026 }).providerCode).toBe('131026');
    expect(normalizeMetaError({ code: 999999 }).providerCode).toBe('999999');
  });
});

describe('META_ERROR_CODE_MAP', () => {
  it('is exported and keys the documented Meta codes to the correct WaFailureCode', () => {
    expect(META_ERROR_CODE_MAP[131026].code).toBe('NOT_ON_WHATSAPP');
    expect(META_ERROR_CODE_MAP[131047].code).toBe('OUTSIDE_SERVICE_WINDOW');
    expect(META_ERROR_CODE_MAP[131049].code).toBe('SUPPRESSED_BY_META');
    expect(META_ERROR_CODE_MAP[132000].code).toBe('TEMPLATE_PARAM_MISMATCH');
    expect(META_ERROR_CODE_MAP[132001].code).toBe('TEMPLATE_NOT_AVAILABLE');
    expect(META_ERROR_CODE_MAP[4].retryable).toBe(true);
    expect(META_ERROR_CODE_MAP[80007].retryable).toBe(true);
    expect(META_ERROR_CODE_MAP[130429].retryable).toBe(true);
  });
});

describe('credential safety', () => {
  it('never places an access token or Authorization header value in mapper output', () => {
    const payload = toMetaTemplatePayload(createTemplateCommand(), TEMPLATE_META);
    const serialized = JSON.stringify(payload).toLowerCase();
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('bearer');
    expect(serialized).not.toContain('accesstoken');
  });
});
