import { describe, it, expect } from 'vitest';
import { buildSimulatedReply, type SimulatedReplyInput } from '../simulator/simulator-reply.js';

const OCCURRED_AT = new Date('2026-08-15T09:00:00.000Z');

function createInput(overrides: Partial<SimulatedReplyInput> = {}): SimulatedReplyInput {
  return {
    outboundProviderMessageId: 'sim.msg-1',
    from: '919876543210',
    templateKey: 'follow_up_reminder',
    buttons: [],
    occurredAt: OCCURRED_AT,
    ...overrides,
  };
}

describe('buildSimulatedReply — booking action cards (D-15)', () => {
  it('always picks the positive booking:confirm option when offered, regardless of order', () => {
    const buttons = [
      { id: 'booking:confirm:11111111-1111-1111-1111-111111111111', title: 'Confirm' },
      { id: 'booking:slot:22222222-2222-2222-2222-222222222222', title: 'Pick another' },
    ];

    const event = buildSimulatedReply(createInput({ templateKey: 'booking_confirmation', buttons }));

    expect(event.kind).toBe('BUTTON_REPLY');
    if (event.kind === 'BUTTON_REPLY') {
      expect(event.payload).toBe('booking:confirm:11111111-1111-1111-1111-111111111111');
    }
  });

  it('falls back to the first offered button when none is a booking:confirm', () => {
    const buttons = [{ id: 'booking:slot:33333333-3333-3333-3333-333333333333', title: 'Pick this time' }];

    const event = buildSimulatedReply(createInput({ buttons }));

    expect(event.kind).toBe('BUTTON_REPLY');
    if (event.kind === 'BUTTON_REPLY') {
      expect(event.payload).toBe('booking:slot:33333333-3333-3333-3333-333333333333');
    }
  });
});

describe('buildSimulatedReply — reminder templates', () => {
  it.each(['follow_up_reminder', 'vaccine_due', 'deworming_due'] as const)(
    'returns a short fixed TEXT acknowledgement for %s',
    (templateKey) => {
      const event = buildSimulatedReply(createInput({ templateKey, buttons: [] }));

      expect(event.kind).toBe('TEXT');
      if (event.kind === 'TEXT') {
        expect(event.text.length).toBeGreaterThan(0);
        expect(event.text.length).toBeLessThan(80);
      }
    },
  );
});

describe('buildSimulatedReply — invoice_delivery', () => {
  it('returns a TEXT acknowledgement, not a payment confirmation', () => {
    const event = buildSimulatedReply(createInput({ templateKey: 'invoice_delivery', buttons: [] }));

    expect(event.kind).toBe('TEXT');
    if (event.kind === 'TEXT') {
      expect(event.text.toLowerCase()).not.toContain('paid');
      expect(event.text.toLowerCase()).not.toContain('payment received');
    }
  });
});

describe('buildSimulatedReply — determinism (D-15)', () => {
  it('returns identical output for identical input, with no randomness', () => {
    const input = createInput({
      buttons: [{ id: 'booking:confirm:44444444-4444-4444-4444-444444444444', title: 'Confirm' }],
    });

    const first = buildSimulatedReply(input);
    const second = buildSimulatedReply(input);

    expect(first).toEqual(second);
  });
});

describe('buildSimulatedReply — interactive lists (D-14, D-15)', () => {
  it('always picks the FIRST row of an offered list, deterministically', () => {
    const rows = [
      { id: 'booking:pet:11111111-1111-1111-1111-111111111111', title: 'Bruno' },
      { id: 'booking:pet:22222222-2222-2222-2222-222222222222', title: 'Milo' },
      { id: 'booking:pet:33333333-3333-3333-3333-333333333333', title: 'Rex' },
    ];

    const event = buildSimulatedReply(createInput({ templateKey: undefined, buttons: [], list: { rows } }));

    expect(event.kind).toBe('LIST_REPLY');
    if (event.kind === 'LIST_REPLY') {
      expect(event.rowId).toBe('booking:pet:11111111-1111-1111-1111-111111111111');
      expect(event.label).toBe('Bruno');
      expect(event.replyToProviderMessageId).toBe('sim.msg-1');
    }
  });

  it('returns identical output for identical list input, with no randomness', () => {
    const input = createInput({
      templateKey: undefined,
      buttons: [],
      list: { rows: [{ id: 'booking:slot:1', title: '10:00 AM' }] },
    });

    const first = buildSimulatedReply(input);
    const second = buildSimulatedReply(input);

    expect(first).toEqual(second);
  });

  it('prefers the list over buttons when (hypothetically) both are present', () => {
    const event = buildSimulatedReply(
      createInput({
        templateKey: undefined,
        buttons: [{ id: 'booking:confirm:1', title: 'Confirm' }],
        list: { rows: [{ id: 'booking:pet:1', title: 'Bruno' }] },
      }),
    );

    expect(event.kind).toBe('LIST_REPLY');
  });
});

describe('buildSimulatedReply — fallback safety', () => {
  it('falls back to a generic TEXT acknowledgement when there is no templateKey, list, or buttons', () => {
    const event = buildSimulatedReply(createInput({ templateKey: undefined, buttons: [] }));

    expect(event.kind).toBe('TEXT');
    if (event.kind === 'TEXT') {
      expect(event.text).toBe('Thanks, got it!');
    }
  });
});
