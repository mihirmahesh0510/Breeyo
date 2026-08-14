import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestWhatsAppThread,
  createTestWhatsAppMessage,
  createTestWhatsAppBookingRequest,
  prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

/**
 * Creates a fresh user, clinic, Admin membership, and auth token. Every test
 * below creates its own clinic rather than sharing one — since every query
 * this suite exercises is scoped by `clinicId`, a brand-new clinic per test
 * is sufficient isolation without needing a `beforeEach` cleanup (matching
 * `queue-checkin.test.ts`'s own precedent, and `vitest.config.ts`'s
 * `fileParallelism: false`, which this suite otherwise shares a database
 * with serially).
 */
async function setupClinic() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id, 'Admin');
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

function listThreads(token: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return app.inject({
    method: 'GET',
    url: `/api/v1/whatsapp/threads${qs ? `?${qs}` : ''}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function getThread(token: string, threadId: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/whatsapp/threads/${threadId}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('WhatsApp Inbox (WHA-05)', () => {
  describe('tenant scoping', () => {
    it('returns only the calling clinic\'s threads when two clinics each have threads', async () => {
      const { clinic: clinicA, token: tokenA } = await setupClinic();
      const { clinic: clinicB, token: tokenB } = await setupClinic();

      const ownerA = await createTestPetOwner(clinicA.id);
      const ownerB = await createTestPetOwner(clinicB.id);
      const threadA = await createTestWhatsAppThread(clinicA.id, ownerA.id, { lastMessageAt: new Date() });
      const threadB = await createTestWhatsAppThread(clinicB.id, ownerB.id, { lastMessageAt: new Date() });

      const responseA = await listThreads(tokenA);
      expect(responseA.statusCode).toBe(200);
      const idsA = responseA.json().data.threads.map((t: { id: string }) => t.id);
      expect(idsA).toContain(threadA.id);
      expect(idsA).not.toContain(threadB.id);

      // Mirror direction, so a policy that hides everything cannot pass.
      const responseB = await listThreads(tokenB);
      const idsB = responseB.json().data.threads.map((t: { id: string }) => t.id);
      expect(idsB).toContain(threadB.id);
      expect(idsB).not.toContain(threadA.id);
    });
  });

  describe('UI-SPEC filter chips', () => {
    it('each of the six filter chips returns the expected subset', async () => {
      const { clinic, token } = await setupClinic();
      const owner = await createTestPetOwner(clinic.id);

      const threadInvoice = await createTestWhatsAppThread(clinic.id, owner.id, {
        lastContextType: 'INVOICE',
        lastMessageAt: new Date(),
      });
      const threadReminder = await createTestWhatsAppThread(clinic.id, owner.id, {
        lastContextType: 'REMINDER',
        lastMessageAt: new Date(),
      });
      const threadBooking = await createTestWhatsAppThread(clinic.id, owner.id, {
        lastContextType: 'BOOKING',
        lastMessageAt: new Date(),
      });
      const threadFailed = await createTestWhatsAppThread(clinic.id, owner.id, { lastMessageAt: new Date() });
      await createTestWhatsAppMessage(clinic.id, threadFailed.id, { status: 'FAILED' });
      const threadNeedsAction = await createTestWhatsAppThread(clinic.id, owner.id, {
        needsAction: true,
        needsActionReason: 'BOOKING_NO_PETS',
        lastMessageAt: new Date(),
      });

      const all = await listThreads(token, { filter: 'all' });
      expect(all.statusCode).toBe(200);
      const allIds = all.json().data.threads.map((t: { id: string }) => t.id);
      for (const id of [threadInvoice.id, threadReminder.id, threadBooking.id, threadFailed.id, threadNeedsAction.id]) {
        expect(allIds).toContain(id);
      }

      const invoices = await listThreads(token, { filter: 'invoices' });
      expect(invoices.json().data.threads.map((t: { id: string }) => t.id)).toEqual([threadInvoice.id]);

      const reminders = await listThreads(token, { filter: 'reminders' });
      expect(reminders.json().data.threads.map((t: { id: string }) => t.id)).toEqual([threadReminder.id]);

      const bookings = await listThreads(token, { filter: 'bookings' });
      expect(bookings.json().data.threads.map((t: { id: string }) => t.id)).toEqual([threadBooking.id]);

      const failed = await listThreads(token, { filter: 'failed' });
      expect(failed.json().data.threads.map((t: { id: string }) => t.id)).toEqual([threadFailed.id]);

      const needsAction = await listThreads(token, { filter: 'needs_action' });
      expect(needsAction.json().data.threads.map((t: { id: string }) => t.id)).toEqual([threadNeedsAction.id]);
    });
  });

  describe('five-field search', () => {
    it('matches by owner name, bare 10-digit mobile, pet name, invoice number, and booking reference', async () => {
      const { clinic, token } = await setupClinic();

      // Owner name.
      const nameOwner = await createTestPetOwner(clinic.id, { name: 'Asha Rao' });
      const nameThread = await createTestWhatsAppThread(clinic.id, nameOwner.id, { lastMessageAt: new Date() });

      // Bare 10-digit mobile against a +91-stored number (Pitfall 9).
      const mobileOwner = await createTestPetOwner(clinic.id, { mobile: '+919876543210' });
      const mobileThread = await createTestWhatsAppThread(clinic.id, mobileOwner.id, { lastMessageAt: new Date() });

      // Pet name.
      const petOwner = await createTestPetOwner(clinic.id);
      const pet = await createTestPet(clinic.id, petOwner.id, { name: 'Rocky' });
      const petThread = await createTestWhatsAppThread(clinic.id, petOwner.id, { lastMessageAt: new Date() });
      void pet;

      // Invoice number, stored on an INVOICE-context message's rendered variables.
      const invoiceOwner = await createTestPetOwner(clinic.id);
      const invoiceThread = await createTestWhatsAppThread(clinic.id, invoiceOwner.id, { lastMessageAt: new Date() });
      await prisma.whatsAppMessage.create({
        data: {
          clinicId: clinic.id,
          threadId: invoiceThread.id,
          direction: 'OUTBOUND',
          channel: 'SIMULATOR',
          body: 'Your invoice is ready',
          contextType: 'INVOICE',
          renderedVariables: { invoice_number: 'INV-202608-0001' },
          status: 'QUEUED',
        },
      });

      // Booking reference.
      const bookingOwner = await createTestPetOwner(clinic.id);
      const bookingPet = await createTestPet(clinic.id, bookingOwner.id);
      const bookingThread = await createTestWhatsAppThread(clinic.id, bookingOwner.id, { lastMessageAt: new Date() });
      await createTestWhatsAppBookingRequest(clinic.id, bookingThread.id, bookingOwner.id, bookingPet.id, {
        reference: 'BK-202608-AB12',
      });

      const byName = await listThreads(token, { search: 'Asha' });
      expect(byName.json().data.threads.map((t: { id: string }) => t.id)).toContain(nameThread.id);

      const byMobile = await listThreads(token, { search: '9876543210' });
      expect(byMobile.json().data.threads.map((t: { id: string }) => t.id)).toContain(mobileThread.id);

      const byPet = await listThreads(token, { search: 'Rocky' });
      expect(byPet.json().data.threads.map((t: { id: string }) => t.id)).toContain(petThread.id);

      const byInvoice = await listThreads(token, { search: 'INV-202608-0001' });
      expect(byInvoice.json().data.threads.map((t: { id: string }) => t.id)).toContain(invoiceThread.id);

      const byBooking = await listThreads(token, { search: 'BK-202608-AB12' });
      expect(byBooking.json().data.threads.map((t: { id: string }) => t.id)).toContain(bookingThread.id);
    });
  });

  describe('cursor pagination', () => {
    it('respects limit and returns a usable nextCursor that fetches the next page without overlap', async () => {
      const { clinic, token } = await setupClinic();
      const owner = await createTestPetOwner(clinic.id);

      const base = Date.now();
      const t1 = await createTestWhatsAppThread(clinic.id, owner.id, { lastMessageAt: new Date(base - 3000) });
      const t2 = await createTestWhatsAppThread(clinic.id, owner.id, { lastMessageAt: new Date(base - 2000) });
      const t3 = await createTestWhatsAppThread(clinic.id, owner.id, { lastMessageAt: new Date(base - 1000) });

      const page1 = await listThreads(token, { limit: '2' });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json().data;
      expect(body1.threads).toHaveLength(2);
      expect(body1.nextCursor).not.toBeNull();
      // Newest first: t3, then t2.
      expect(body1.threads.map((t: { id: string }) => t.id)).toEqual([t3.id, t2.id]);

      const page2 = await listThreads(token, { limit: '2', cursor: body1.nextCursor });
      expect(page2.statusCode).toBe(200);
      const body2 = page2.json().data;
      expect(body2.threads.map((t: { id: string }) => t.id)).toEqual([t1.id]);
      expect(body2.nextCursor).toBeNull();

      // No overlap between the two pages.
      const page1Ids = new Set(body1.threads.map((t: { id: string }) => t.id));
      const page2Ids = body2.threads.map((t: { id: string }) => t.id);
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
    });
  });

  describe('thread detail', () => {
    it('returns messages in ascending createdAt order and resets unreadCount to 0', async () => {
      const { clinic, token } = await setupClinic();
      const owner = await createTestPetOwner(clinic.id);
      const thread = await createTestWhatsAppThread(clinic.id, owner.id, { lastMessageAt: new Date() });
      await prisma.whatsAppThread.update({ where: { id: thread.id }, data: { unreadCount: 5 } });

      const first = await createTestWhatsAppMessage(clinic.id, thread.id, { body: 'first' });
      const second = await createTestWhatsAppMessage(clinic.id, thread.id, {
        body: 'second',
        status: 'FAILED',
        direction: 'OUTBOUND',
      });

      const response = await getThread(token, thread.id);
      expect(response.statusCode).toBe(200);
      const body = response.json().data;

      expect(body.messages.map((m: { id: string }) => m.id)).toEqual([first.id, second.id]);
      expect(body.messages[1]).toMatchObject({ status: 'FAILED' });
      expect(body.unreadCount).toBe(0);

      const persisted = await prisma.whatsAppThread.findUnique({ where: { id: thread.id } });
      expect(persisted?.unreadCount).toBe(0);
    });

    it('returns 404 with no disclosing body field for another clinic\'s thread', async () => {
      const { token: tokenA } = await setupClinic();
      const { clinic: clinicB } = await setupClinic();
      const ownerB = await createTestPetOwner(clinicB.id, { name: 'Owner B Secret' });
      const threadB = await createTestWhatsAppThread(clinicB.id, ownerB.id, { lastMessageAt: new Date() });

      const response = await getThread(tokenA, threadB.id);

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('THREAD_NOT_FOUND');
      expect(JSON.stringify(body)).not.toContain('Owner B Secret');
    });
  });
});
