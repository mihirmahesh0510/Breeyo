import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  verifyMetaSignature,
  handleVerification,
  parseMetaWebhook,
} from '../cloud-api/cloud-api.webhook.js';

/**
 * WHA-04 — Task 2 (07-07-PLAN). `verifyMetaSignature` is the phase's
 * highest-severity security control: HMAC-SHA256 over the RAW body,
 * timing-safe compared, never throwing on malformed input. `parseMetaWebhook`
 * is a pure translator — no DB access, no routing, only normalization into
 * `WaInboundEvent`.
 */

const SECRET = 'test-app-secret';

function sign(rawBody: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

function webhookPayload(entries: Array<{ id?: string; changes: Array<{ field?: string; value: unknown }> }>) {
  return {
    object: 'whatsapp_business_account',
    entry: entries.map((entry, i) => ({
      id: entry.id ?? `waba-${i}`,
      changes: entry.changes.map((c) => ({ field: c.field ?? 'messages', value: c.value })),
    })),
  };
}

describe('verifyMetaSignature', () => {
  const rawBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });

  it('returns true for a correctly computed sha256 signature (interop with createHmac)', () => {
    expect(verifyMetaSignature(rawBody, sign(rawBody), SECRET)).toBe(true);
  });

  it('returns false when the body is mutated by one character', () => {
    const validSignature = sign(rawBody);
    const mutatedBody = rawBody.slice(0, -1) + (rawBody.endsWith('}') ? ']' : '}');
    expect(verifyMetaSignature(mutatedBody, validSignature, SECRET)).toBe(false);
  });

  it('returns false when signed with a different secret', () => {
    expect(verifyMetaSignature(rawBody, sign(rawBody, 'wrong-secret'), SECRET)).toBe(false);
  });

  it('returns false when signatureHeader is undefined', () => {
    expect(verifyMetaSignature(rawBody, undefined, SECRET)).toBe(false);
  });

  it('returns false when the header is missing the sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex');
    expect(verifyMetaSignature(rawBody, hex, SECRET)).toBe(false);
  });

  it('returns false and does not throw for a truncated hex digest', () => {
    const full = sign(rawBody);
    const truncated = full.slice(0, full.length - 10);
    expect(() => verifyMetaSignature(rawBody, truncated, SECRET)).not.toThrow();
    expect(verifyMetaSignature(rawBody, truncated, SECRET)).toBe(false);
  });

  it('returns false and does not throw for non-hex characters in the digest', () => {
    const malformed = 'sha256=zzzznot-hex-at-allzzzz-not-hex-at-all-zzzz';
    expect(() => verifyMetaSignature(rawBody, malformed, SECRET)).not.toThrow();
    expect(verifyMetaSignature(rawBody, malformed, SECRET)).toBe(false);
  });

  it('short-circuits to false on a length mismatch before any timing-safe comparison', () => {
    const shortDigest = `sha256=${'ab'.repeat(4)}`;
    expect(verifyMetaSignature(rawBody, shortDigest, SECRET)).toBe(false);
  });
});

describe('handleVerification', () => {
  it('echoes hub.challenge with status 200 when hub.mode is subscribe and the token matches', () => {
    const result = handleVerification(
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' },
      'tok',
    );
    expect(result).toEqual({ status: 200, body: '12345' });
  });

  it('returns 403 when the verify token is wrong', () => {
    const result = handleVerification(
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '12345' },
      'tok',
    );
    expect(result.status).toBe(403);
  });

  it('returns 403 when hub.mode is not subscribe', () => {
    const result = handleVerification(
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok', 'hub.challenge': '12345' },
      'tok',
    );
    expect(result.status).toBe(403);
  });

  it('returns 403 when there is no challenge', () => {
    const result = handleVerification({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok' }, 'tok');
    expect(result.status).toBe(403);
  });
});

describe('parseMetaWebhook — inbound messages', () => {
  it('normalizes an interactive button_reply into one BUTTON_REPLY event', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.IN1',
                  from: '919876543210',
                  timestamp: '1723700000',
                  type: 'interactive',
                  context: { id: 'wamid.ORIGINAL' },
                  interactive: { type: 'button_reply', button_reply: { id: 'booking:confirm:1', title: 'Confirm' } },
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'BUTTON_REPLY',
      payload: 'booking:confirm:1',
      label: 'Confirm',
      replyToProviderMessageId: 'wamid.ORIGINAL',
    });
  });

  it('normalizes a TEMPLATE quick-reply button object (no interactive field) into the same BUTTON_REPLY shape', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.IN2',
                  from: '919876543210',
                  timestamp: '1723700001',
                  type: 'button',
                  context: { id: 'wamid.TEMPLATE1' },
                  button: { payload: 'STOP', text: 'Stop' },
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'BUTTON_REPLY',
      payload: 'STOP',
      label: 'Stop',
      replyToProviderMessageId: 'wamid.TEMPLATE1',
    });
  });

  it('normalizes a list_reply into one LIST_REPLY event with rowId', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.IN3',
                  from: '919876543210',
                  timestamp: '1723700002',
                  type: 'interactive',
                  interactive: {
                    type: 'list_reply',
                    list_reply: { id: 'slot-3', title: 'Tue 10:30 AM', description: '' },
                  },
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'LIST_REPLY', rowId: 'slot-3', label: 'Tue 10:30 AM' });
  });

  it('normalizes a plain text message into one TEXT event with from in wa_id form', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.IN4',
                  from: '+919876543210',
                  timestamp: '1723700003',
                  type: 'text',
                  text: { body: 'Can I reschedule?' },
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'TEXT', text: 'Can I reschedule?', from: '919876543210' });
  });

  it('normalizes an unhandled message type (sticker) into UNSUPPORTED carrying rawType, not a throw', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                { id: 'wamid.IN5', from: '919876543210', timestamp: '1723700004', type: 'sticker' },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'UNSUPPORTED', rawType: 'sticker' });
  });
});

describe('parseMetaWebhook — statuses', () => {
  it('returns three STATUS events for a statuses array of three entries', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              statuses: [
                { id: 'wamid.S1', status: 'sent', recipient_id: '919876543210', timestamp: '1723700010' },
                { id: 'wamid.S2', status: 'delivered', recipient_id: '919876543210', timestamp: '1723700011' },
                { id: 'wamid.S3', status: 'read', recipient_id: '919876543210', timestamp: '1723700012' },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.kind === 'STATUS')).toBe(true);
    expect(events.map((e) => (e.kind === 'STATUS' ? e.providerMessageId : null))).toEqual([
      'wamid.S1',
      'wamid.S2',
      'wamid.S3',
    ]);
    expect(events.map((e) => (e.kind === 'STATUS' ? e.status : null))).toEqual(['SENT', 'DELIVERED', 'READ']);
  });

  it('normalizes a failed status with errors[0].code 131026 to STATUS FAILED / NOT_ON_WHATSAPP', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: 'wamid.S4',
                  status: 'failed',
                  recipient_id: '919876543210',
                  timestamp: '1723700013',
                  errors: [{ code: 131026, title: 'Undeliverable' }],
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.kind).toBe('STATUS');
    if (event.kind === 'STATUS') {
      expect(event.status).toBe('FAILED');
      expect(event.failure?.code).toBe('NOT_ON_WHATSAPP');
    }
  });
});

describe('parseMetaWebhook — envelope handling', () => {
  it('flattens events from multiple entries and multiple changes', () => {
    const payload = webhookPayload([
      {
        id: 'waba-1',
        changes: [
          { value: { messages: [{ id: 'wamid.M1', from: '919876543210', timestamp: '1723700020', type: 'text', text: { body: 'hi' } }] } },
          { value: { statuses: [{ id: 'wamid.S5', status: 'sent', recipient_id: '919876543210', timestamp: '1723700021' }] } },
        ],
      },
      {
        id: 'waba-2',
        changes: [
          { value: { messages: [{ id: 'wamid.M2', from: '919876543211', timestamp: '1723700022', type: 'text', text: { body: 'hello' } }] } },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(3);
  });

  it('returns an empty array rather than throwing on a structurally invalid payload', () => {
    expect(parseMetaWebhook(null)).toEqual([]);
    expect(parseMetaWebhook(undefined)).toEqual([]);
    expect(parseMetaWebhook('not an object')).toEqual([]);
    expect(parseMetaWebhook({ totally: 'wrong shape' })).toEqual([]);
  });

  it('output events carry no Meta-specific field names', () => {
    const payload = webhookPayload([
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.IN6',
                  from: '919876543210',
                  timestamp: '1723700030',
                  type: 'interactive',
                  interactive: { type: 'button_reply', button_reply: { id: 'BOOK', title: 'Book' } },
                },
              ],
            },
          },
        ],
      },
    ]);

    const events = parseMetaWebhook(payload);
    expect(events).toHaveLength(1);
    const keys = Object.keys(events[0]);
    for (const forbidden of ['wa_id', 'button_reply', 'list_reply', 'wamid', 'interactive', 'message_status']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
