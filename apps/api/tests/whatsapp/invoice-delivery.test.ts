import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

/**
 * WHA-02 (07-13 Task 3) — pins the generic `POST /whatsapp/send` contract
 * Phase 6 will call for invoice delivery, without any coupling to Phase 6
 * (no Invoice model exists yet — Pitfall 8). This suite adds NO new
 * production code; every assertion below already holds against the
 * existing `WhatsAppService.sendTemplate` path.
 *
 * One deviation from 07-13-PLAN.md's behavior list, called out explicitly:
 * the plan's "Omitting payment_link returns 400" bullet predates D-23
 * (`.planning/phases/07-whatsapp-communication/07-CONTEXT.md`), which is
 * already locked and already implemented — `invoiceDeliveryVariablesSchema`
 * in `packages/validators/src/whatsapp.ts` deliberately makes `payment_link`
 * OPTIONAL ("a paid invoice omits the CTA line entirely"), and
 * `template-registry.test.ts` already pins that same optionality at the
 * unit level ("invoice_delivery variable schema treats payment_link as
 * optional (D-23)"). Asserting a 400 on omission here would both contradict
 * an already-locked, already-tested decision and require touching
 * `packages/validators/src/whatsapp.ts`, which is outside this plan's
 * `files_modified` list. This suite instead asserts the actual (and
 * consistent) D-23 behavior: omitting `payment_link` still succeeds, with
 * no "Pay now" line in the rendered body.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

async function setupAuthenticatedUser() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, 'FrontDesk');
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

function invoiceDeliveryBody(
  ownerId: string,
  waPhone: string,
  contextId: string,
  variableOverrides: Partial<Record<string, string | undefined>> = {},
) {
  return {
    ownerId,
    waPhone,
    templateKey: 'invoice_delivery',
    contextType: 'INVOICE',
    contextId,
    variables: {
      owner_name: 'Asha Rao',
      pet_name: 'Rocky',
      invoice_number: 'INV-2026-0100',
      amount: '1,250.00',
      payment_link: 'https://pay.example.com/inv100',
      ...variableOverrides,
    },
  };
}

describe('WhatsApp Invoice Delivery (WHA-02)', () => {
  it(
    'sends with contextType INVOICE and an opaque contextId, no FK to a nonexistent Invoice, ' +
      'link-only, templateCategory TRANSACTIONAL, status QUEUED, and a rendered body containing ' +
      'the payment link and invoice number (WHA-02, D-18, Pitfall 8)',
    async () => {
      const { token, clinic } = await setupAuthenticatedUser();
      const owner = await createTestPetOwner(clinic.id);
      // Opaque and unconstrained: no Invoice table exists anywhere in this
      // schema (Pitfall 8) -- a random uuid is sufficient and unchecked.
      const contextId = randomUUID();

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/send',
        headers: { authorization: `Bearer ${token}` },
        payload: invoiceDeliveryBody(owner.id, owner.mobile, contextId),
      });

      expect(response.statusCode).toBe(202);
      const { messageId } = response.json().data;
      expect(messageId).toBeDefined();

      const message = await prisma.whatsAppMessage.findUnique({ where: { id: messageId } });
      expect(message?.contextType).toBe('INVOICE');
      expect(message?.contextId).toBe(contextId);
      expect(message?.templateCategory).toBe('TRANSACTIONAL');
      expect(message?.status).toBe('QUEUED');

      // D-18: Beta invoice delivery is link-only -- no media fields populated.
      expect(message?.mediaProviderId).toBeNull();
      expect(message?.mediaFilename).toBeNull();
      expect(message?.mediaMimeType).toBeNull();

      expect(message?.body).toContain('INV-2026-0100');
      expect(message?.body).toContain('https://pay.example.com/inv100');
    },
  );

  it('omitting invoice_number returns 400 before any WhatsAppMessage row is created', async () => {
    const { token, clinic } = await setupAuthenticatedUser();
    const owner = await createTestPetOwner(clinic.id);
    const countBefore = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: invoiceDeliveryBody(owner.id, owner.mobile, randomUUID(), { invoice_number: undefined }),
    });

    expect(response.statusCode).toBe(400);
    const countAfter = await prisma.whatsAppMessage.count({ where: { clinicId: clinic.id } });
    expect(countAfter).toBe(countBefore);
  });

  it('a payment_link longer than its schema cap (512 chars) returns 400', async () => {
    const { token, clinic } = await setupAuthenticatedUser();
    const owner = await createTestPetOwner(clinic.id);
    const tooLong = `https://pay.example.com/${'x'.repeat(600)}`;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: invoiceDeliveryBody(owner.id, owner.mobile, randomUUID(), { payment_link: tooLong }),
    });

    expect(response.statusCode).toBe(400);
  });

  it(
    'D-23 (already locked, predates this plan): omitting payment_link still succeeds -- a paid invoice ' +
      'has no CTA line, so payment_link is deliberately optional on invoice_delivery, not required',
    async () => {
      const { token, clinic } = await setupAuthenticatedUser();
      const owner = await createTestPetOwner(clinic.id);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/whatsapp/send',
        headers: { authorization: `Bearer ${token}` },
        payload: invoiceDeliveryBody(owner.id, owner.mobile, randomUUID(), { payment_link: undefined }),
      });

      expect(response.statusCode).toBe(202);
      const message = await prisma.whatsAppMessage.findUnique({
        where: { id: response.json().data.messageId },
      });
      expect(message?.body).not.toContain('Pay now');
    },
  );

  it('succeeds for an owner with remindersOptedOut true, because invoice_delivery is transactional (D-10)', async () => {
    const { token, clinic } = await setupAuthenticatedUser();
    const owner = await createTestPetOwner(clinic.id);

    const optOut = await app.inject({
      method: 'PATCH',
      url: `/api/v1/whatsapp/owners/${owner.id}/preference`,
      headers: { authorization: `Bearer ${token}` },
      payload: { remindersOptedOut: true, source: 'STAFF' },
    });
    expect(optOut.statusCode).toBe(200);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: invoiceDeliveryBody(owner.id, owner.mobile, randomUUID()),
    });

    expect(response.statusCode).toBe(202);
  });

  it('payment_reminder succeeds when sent manually by staff and creates no WhatsAppReminderTask row (D-05)', async () => {
    const { token, clinic } = await setupAuthenticatedUser();
    const owner = await createTestPetOwner(clinic.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/whatsapp/send',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey: 'payment_reminder',
        contextType: 'INVOICE',
        contextId: randomUUID(),
        variables: {
          owner_name: 'Asha Rao',
          pet_name: 'Rocky',
          invoice_number: 'INV-2026-0077',
          amount: '900.00',
          due_date: '20 Aug 2026',
          payment_link: 'https://pay.example.com/inv77',
        },
      },
    });

    expect(response.statusCode).toBe(202);

    const taskCount = await prisma.whatsAppReminderTask.count({
      where: { clinicId: clinic.id, ownerId: owner.id },
    });
    expect(taskCount).toBe(0);
  });

  it('the schema declares no relation field named "invoice" on WhatsAppMessage (Pitfall 8)', () => {
    const schemaPath = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url));
    const schemaText = readFileSync(schemaPath, 'utf8');
    const modelMatch = schemaText.match(/model WhatsAppMessage \{[\s\S]*?\n\}/);

    expect(modelMatch).not.toBeNull();
    // `contextId`'s own trailing comment mentions "invoice" in lowercase
    // prose (documenting exactly this absence) -- what must never appear is
    // an actual Prisma relation FIELD typed `Invoice`, i.e. a field
    // declaration naming the capitalized model type, not the word in a
    // comment.
    const fieldLines = modelMatch![0]
      .split('\n')
      .map((line) => line.split('//')[0]); // strip trailing `//` comments before checking
    expect(fieldLines.some((line) => /\bInvoice\b/.test(line))).toBe(false);
  });
});
