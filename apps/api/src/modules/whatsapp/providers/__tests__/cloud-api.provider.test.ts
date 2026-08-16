import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudApiProvider, CLOUD_API_CAPABILITIES } from '../cloud-api/cloud-api.provider.js';
import { WaSendError, type WaSendFreeformCommand, type WaSendTemplateCommand } from '../wa-provider.port.js';

/**
 * WHA-04 — Task 3 (07-07-PLAN). Global `fetch` is stubbed in every test —
 * no real network call is ever issued. Confirms the real Cloud API adapter
 * delegates all payload construction / error normalization to the mapper
 * and webhook modules, and never lets a credential reach a thrown error.
 */

const ACCESS_TOKEN = 'test-access-token-should-never-leak';
const APP_SECRET = 'test-app-secret-should-never-leak';

function createProvider(): CloudApiProvider {
  return new CloudApiProvider({
    phoneNumberId: '1234567890',
    accessToken: ACCESS_TOKEN,
    appSecret: APP_SECRET,
    graphVersion: 'v23.0',
  });
}

function createTemplateCommand(overrides: Partial<WaSendTemplateCommand> = {}): WaSendTemplateCommand {
  return {
    to: '+919876543210',
    templateKey: 'vaccine_due',
    languageCode: 'en',
    variables: { owner_name: 'Asha', pet_name: 'Rocky', vaccine_name: 'Rabies', due_date: '15 Aug 2026' },
    idempotencyKey: 'msg-1',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function captureError(fn: () => Promise<unknown>): Promise<WaSendError> {
  try {
    await fn();
  } catch (err) {
    return err as WaSendError;
  }
  throw new Error('Expected fn() to throw');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloudApiProvider.sendTemplate', () => {
  it('issues one fetch to the messages endpoint with POST, Bearer auth and JSON content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        messages: [{ id: 'wamid.1', message_status: 'accepted' }],
        contacts: [{ input: '+919876543210', wa_id: '919876543210' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createProvider().sendTemplate(createTemplateCommand());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns the mapped WaSendResult on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          messages: [{ id: 'wamid.2', message_status: 'accepted' }],
          contacts: [{ input: '+919876543210', wa_id: '919876543210' }],
        }),
      ),
    );

    const result = await createProvider().sendTemplate(createTemplateCommand());

    expect(result).toMatchObject({
      providerMessageId: 'wamid.2',
      acceptedStatus: 'ACCEPTED',
      resolvedWaId: '919876543210',
    });
    expect(result.acceptedAt).toBeInstanceOf(Date);
  });

  it('on a Meta 400 with error.code 132000 throws WaSendError(TEMPLATE_PARAM_MISMATCH, 132000, non-retryable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 132000, message: 'Param mismatch' } }, 400)),
    );

    const error = await captureError(() => createProvider().sendTemplate(createTemplateCommand()));

    expect(error).toBeInstanceOf(WaSendError);
    expect(error.code).toBe('TEMPLATE_PARAM_MISMATCH');
    expect(error.providerCode).toBe('132000');
    expect(error.retryable).toBe(false);
  });

  it('on a Meta 429 with error.code 130429 throws WaSendError(RATE_LIMITED, 130429, retryable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 130429, message: 'Rate limited' } }, 429)),
    );

    const error = await captureError(() => createProvider().sendTemplate(createTemplateCommand()));

    expect(error).toBeInstanceOf(WaSendError);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.providerCode).toBe('130429');
    expect(error.retryable).toBe(true);
  });

  it('on a network rejection throws WaSendError(PROVIDER_UNAVAILABLE, null, retryable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const error = await captureError(() => createProvider().sendTemplate(createTemplateCommand()));

    expect(error).toBeInstanceOf(WaSendError);
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.providerCode).toBeNull();
    expect(error.retryable).toBe(true);
  });

  it('on a 500 from Meta throws WaSendError with retryable true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Internal Server Error' } }, 500)),
    );

    const error = await captureError(() => createProvider().sendTemplate(createTemplateCommand()));

    expect(error).toBeInstanceOf(WaSendError);
    expect(error.retryable).toBe(true);
  });

  it('never includes the access token or app secret in a thrown error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 132000 } }, 400)));

    const error = await captureError(() => createProvider().sendTemplate(createTemplateCommand()));

    expect(error.message).not.toContain(ACCESS_TOKEN);
    expect(error.message).not.toContain(APP_SECRET);
  });
});

describe('CloudApiProvider.sendFreeform', () => {
  it('throws OUTSIDE_SERVICE_WINDOW without issuing a fetch when the window is closed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const cmd: WaSendFreeformCommand = {
      to: '+919876543210',
      text: 'Thanks!',
      serviceWindowExpiresAt: null,
      idempotencyKey: 'msg-2',
    };

    const error = await captureError(() => createProvider().sendFreeform(cmd));

    expect(error).toBeInstanceOf(WaSendError);
    expect(error.code).toBe('OUTSIDE_SERVICE_WINDOW');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues a fetch and returns an ACK when the window is open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.3', message_status: 'accepted' }] })),
    );

    const cmd: WaSendFreeformCommand = {
      to: '+919876543210',
      text: 'Thanks!',
      serviceWindowExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      idempotencyKey: 'msg-3',
    };

    const result = await createProvider().sendFreeform(cmd);
    expect(result.providerMessageId).toBe('wamid.3');
  });
});

describe('CloudApiProvider.uploadMedia', () => {
  it('issues a multipart POST to /media and returns a WaMediaRef whose expiresAt is ~30 days out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'media-id-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const before = Date.now();
    const ref = await createProvider().uploadMedia({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/media');
    expect(ref.providerMediaId).toBe('media-id-1');

    const daysOut = (ref.expiresAt!.getTime() - before) / (1000 * 60 * 60 * 24);
    expect(daysOut).toBeGreaterThan(29);
    expect(daysOut).toBeLessThan(31);
  });

  it('rejects bytes above mediaMaxBytes before issuing any fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const oversized = new Uint8Array(CLOUD_API_CAPABILITIES.mediaMaxBytes + 1);

    await expect(
      createProvider().uploadMedia({ bytes: oversized, filename: 'big.pdf', mimeType: 'application/pdf' }),
    ).rejects.toThrow(WaSendError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CloudApiProvider.verifyWebhook', () => {
  it('delegates to verifyMetaSignature with the configured app secret and the x-hub-signature-256 header', () => {
    const provider = createProvider();
    const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex')}`;

    expect(provider.verifyWebhook({ 'x-hub-signature-256': signature }, rawBody)).toBe(true);
    expect(provider.verifyWebhook({ 'x-hub-signature-256': 'sha256=deadbeef' }, rawBody)).toBe(false);
    expect(provider.verifyWebhook({}, rawBody)).toBe(false);
  });
});

describe('CloudApiProvider.parseInbound', () => {
  it('delegates to parseMetaWebhook (invalid payloads return [], never throw)', () => {
    const provider = createProvider();
    expect(provider.parseInbound({ not: 'valid' })).toEqual([]);
    expect(provider.parseInbound(null)).toEqual([]);
  });
});

describe('CloudApiProvider identity and capabilities', () => {
  it("has id 'cloud-api'", () => {
    expect(createProvider().id).toBe('cloud-api');
  });

  it('declares capabilities identical to CLOUD_API_CAPABILITIES / the simulator', () => {
    expect(createProvider().capabilities).toBe(CLOUD_API_CAPABILITIES);
  });
});
