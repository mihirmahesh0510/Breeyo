import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  prisma,
} from '../helpers/factories.js';
import { buildRazorpayMock, type RazorpayMock } from '../helpers/razorpay-mock.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { QueueRepository } from '../../src/modules/queue/queue.repository.js';
import { runOverdueSweep } from '../../src/jobs/overdue-invoices.js';
import { runPaymentLinkExpirySweep } from '../../src/jobs/expire-payment-links.js';

/**
 * The two server-side sweeps that make D-11 and D-23 real.
 *
 * ## Why the handlers are called directly
 *
 * `cron.schedule` is tested by node-cron, not by us. What is worth testing is
 * the predicate — which rows a sweep claims and which it leaves alone — and a
 * suite that waited on a real schedule could only assert that at a rate of one
 * assertion per day. So each job exports its handler alongside its
 * `scheduleXxx` wrapper and the wrapper is exercised only by the process.
 *
 * ## Why the IST boundary is computed, never hardcoded
 *
 * `getTodayIST()` is the same function the sweep uses. Deriving the fixtures
 * from it means the "due today" case is genuinely on the boundary in whatever
 * timezone the suite happens to run in — a hardcoded date would pass in CI and
 * quietly stop testing anything the moment the machine's clock moved.
 */

const PLAINTEXT_SECRET = 'jobs_secret_never_on_the_wire';

const holder = vi.hoisted(() => ({ current: null as unknown as RazorpayMock }));

vi.mock('razorpay', () => {
  class MockRazorpay {
    paymentLink = {
      create: (...args: unknown[]) =>
        (holder.current.paymentLink.create as (...a: unknown[]) => unknown)(...args),
      fetch: (...args: unknown[]) =>
        (holder.current.paymentLink.fetch as (...a: unknown[]) => unknown)(...args),
      cancel: (...args: unknown[]) =>
        (holder.current.paymentLink.cancel as (...a: unknown[]) => unknown)(...args),
    };
    payments = {
      refund: (...args: unknown[]) =>
        (holder.current.payments.refund as (...a: unknown[]) => unknown)(...args),
    };
    refunds = {
      fetch: (...args: unknown[]) =>
        (holder.current.refunds.fetch as (...a: unknown[]) => unknown)(...args),
    };
  }

  return { default: MockRazorpay };
});

let clinicId: string;
let userId: string;

beforeAll(async () => {
  await buildTestApp();
});

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

beforeEach(async () => {
  await cleanupTestData();
  holder.current = buildRazorpayMock();

  const owner = await createTestUser({ fullName: 'Sweep Owner' });
  userId = owner.id;

  const clinic = await createTestClinic(owner.id, {
    name: 'Sweep Clinic',
    razorpayKeyId: `rzp_test_${randomUUID().slice(0, 10)}`,
    razorpayKeySecretEnc: encryptSecret(PLAINTEXT_SECRET),
  });
  clinicId = clinic.id;

  await createTestClinicMember(owner.id, clinic.id, 'FrontDesk');
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * An invoice written straight to the table.
 *
 * Deliberately not built through the HTTP finalize flow: what is under test is
 * a predicate over `status`, `balancePaise` and `dueDate`, and driving six
 * status permutations through a route that only ever produces two of them
 * would test the route instead.
 */
async function seedInvoice(overrides: {
  status: string;
  balancePaise?: number;
  dueDate?: Date | null;
  grandTotalPaise?: number;
  amountPaidPaise?: number;
  clinic?: string;
}) {
  const grandTotalPaise = overrides.grandTotalPaise ?? 50000;

  return prisma.invoice.create({
    data: {
      clinicId: overrides.clinic ?? clinicId,
      createdById: userId,
      status: overrides.status,
      source: 'manual',
      invoiceNumber: `INV-202608-${Math.floor(1000 + Math.random() * 8999)}`,
      grandTotalPaise,
      subtotalPaise: grandTotalPaise,
      taxableValuePaise: grandTotalPaise,
      amountPaidPaise: overrides.amountPaidPaise ?? 0,
      balancePaise: overrides.balancePaise ?? grandTotalPaise,
      dueDate: overrides.dueDate === undefined ? new Date(Date.now() - DAY_MS) : overrides.dueDate,
      finalizedAt: new Date(),
    },
  });
}

async function seedPendingLink(
  invoiceId: string,
  overrides: { createdAt?: Date; expiresAt?: Date; amountPaise?: number; clinic?: string } = {},
) {
  const createdAt = overrides.createdAt ?? new Date();

  return prisma.payment.create({
    data: {
      clinicId: overrides.clinic ?? clinicId,
      invoiceId,
      method: 'upi',
      channel: 'razorpay',
      amountPaise: overrides.amountPaise ?? 50000,
      status: 'pending',
      razorpayPaymentLinkId: `plink_test_${randomUUID().slice(0, 8)}`,
      paymentGroupId: randomUUID(),
      createdAt,
      expiresAt: overrides.expiresAt ?? new Date(createdAt.getTime() + 16 * 60_000),
      recordedById: userId,
    },
  });
}

async function seedCapturedCash(invoiceId: string, amountPaise: number) {
  return prisma.payment.create({
    data: {
      clinicId,
      invoiceId,
      method: 'cash',
      channel: 'manual',
      amountPaise,
      status: 'captured',
      paidAt: new Date(),
      recordedById: userId,
    },
  });
}

function recordingIo() {
  const emitted: Array<{ room: string; event: string; data: Record<string, unknown> }> = [];

  const io = {
    to(room: string) {
      return {
        emit(event: string, data: Record<string, unknown>) {
          emitted.push({ room, event, data });
        },
      };
    },
  };

  return { io: io as never, emitted };
}

// ─── D-23: overdue flagging ─────────────────────────────────────────────────

describe('overdue-invoices sweep (D-23)', () => {
  it('flags an UNPAID invoice whose due date is before today IST', async () => {
    const today = QueueRepository.getTodayIST();
    const invoice = await seedInvoice({
      status: 'UNPAID',
      dueDate: new Date(today.getTime() - DAY_MS),
    });

    const count = await runOverdueSweep(prisma, null);
    expect(count).toBe(1);

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reread.status).toBe('OVERDUE');
  });

  it('does NOT flag an invoice due today', async () => {
    const today = QueueRepository.getTodayIST();
    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: today });

    const count = await runOverdueSweep(prisma, null);
    expect(count).toBe(0);

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    // Due today is not yet overdue. Flagging it would tell the front desk to
    // chase an owner on the day the invoice was actually due.
    expect(reread.status).toBe('UNPAID');
  });

  it('flags a PARTIALLY_PAID invoice past its due date', async () => {
    const today = QueueRepository.getTodayIST();
    const invoice = await seedInvoice({
      status: 'PARTIALLY_PAID',
      dueDate: new Date(today.getTime() - DAY_MS),
      amountPaidPaise: 20000,
      balancePaise: 30000,
    });

    await runOverdueSweep(prisma, null);

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reread.status).toBe('OVERDUE');
  });

  it('never touches a PAID, VOIDED or DRAFT invoice', async () => {
    const today = QueueRepository.getTodayIST();
    const past = new Date(today.getTime() - 5 * DAY_MS);

    const paid = await seedInvoice({
      status: 'PAID',
      dueDate: past,
      amountPaidPaise: 50000,
      balancePaise: 0,
    });
    const voided = await seedInvoice({ status: 'VOIDED', dueDate: past });
    const draft = await seedInvoice({ status: 'DRAFT', dueDate: past });

    const count = await runOverdueSweep(prisma, null);
    expect(count).toBe(0);

    for (const invoice of [paid, voided, draft]) {
      const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      expect(reread.status).toBe(invoice.status);
    }
  });

  it('never flags an invoice with nothing outstanding', async () => {
    const today = QueueRepository.getTodayIST();
    const invoice = await seedInvoice({
      status: 'UNPAID',
      dueDate: new Date(today.getTime() - DAY_MS),
      balancePaise: 0,
      amountPaidPaise: 50000,
    });

    const count = await runOverdueSweep(prisma, null);
    expect(count).toBe(0);

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reread.status).toBe('UNPAID');
  });

  it('is idempotent across runs', async () => {
    const today = QueueRepository.getTodayIST();
    await seedInvoice({ status: 'UNPAID', dueDate: new Date(today.getTime() - DAY_MS) });

    expect(await runOverdueSweep(prisma, null)).toBe(1);
    expect(await runOverdueSweep(prisma, null)).toBe(0);
  });

  it('pushes the refresh to each affected clinic room only', async () => {
    const today = QueueRepository.getTodayIST();
    await seedInvoice({ status: 'UNPAID', dueDate: new Date(today.getTime() - DAY_MS) });

    const { io, emitted } = recordingIo();
    await runOverdueSweep(prisma, io);

    expect(emitted.length).toBeGreaterThanOrEqual(1);
    for (const push of emitted) {
      expect(push.room).toBe(`clinic:${clinicId}`);
    }
  });
});

// ─── D-11: payment link expiry ──────────────────────────────────────────────

describe('expire-payment-links sweep (D-11, D-37)', () => {
  it('expires a pending link past the fifteen-minute deadline and reverts the invoice', async () => {
    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: null });
    const pending = await seedPendingLink(invoice.id, {
      createdAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() - 4 * 60_000),
    });

    const count = await runPaymentLinkExpirySweep(prisma, null);
    expect(count).toBe(1);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(payment.status).toBe('expired');

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(reread.status).toBe('UNPAID');
    expect(reread.balancePaise).toBe(50000);

    expect(holder.current.paymentLink.cancel).toHaveBeenCalledWith(pending.razorpayPaymentLinkId);
  });

  it('leaves a pending link whose deadline has not passed alone', async () => {
    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: null });
    const pending = await seedPendingLink(invoice.id);

    const count = await runPaymentLinkExpirySweep(prisma, null);
    expect(count).toBe(0);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    expect(payment.status).toBe('pending');
    expect(holder.current.paymentLink.cancel).not.toHaveBeenCalled();
  });

  it('keeps a captured cash leg and lands on PARTIALLY_PAID, never UNPAID (D-37)', async () => {
    const invoice = await seedInvoice({
      status: 'PARTIALLY_PAID',
      grandTotalPaise: 150000,
      amountPaidPaise: 100000,
      balancePaise: 50000,
      dueDate: null,
    });
    await seedCapturedCash(invoice.id, 100000);
    await seedPendingLink(invoice.id, {
      createdAt: new Date(Date.now() - 20 * 60_000),
      amountPaise: 50000,
    });

    await runPaymentLinkExpirySweep(prisma, null);

    const reread = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    // The cash is in the drawer; the invoice may not claim otherwise.
    expect(reread.status).toBe('PARTIALLY_PAID');
    expect(reread.amountPaidPaise).toBe(100000);

    const cash = await prisma.payment.findFirstOrThrow({
      where: { clinicId, invoiceId: invoice.id, method: 'cash' },
    });
    expect(cash.status).toBe('captured');
  });

  it('still expires locally when the gateway cancel fails', async () => {
    holder.current.paymentLink.cancel = vi.fn(async () => {
      throw { statusCode: 500, error: { description: 'gateway unavailable' } };
    }) as unknown as RazorpayMock['paymentLink']['cancel'];

    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: null });
    const pending = await seedPendingLink(invoice.id, {
      createdAt: new Date(Date.now() - 20 * 60_000),
    });

    const count = await runPaymentLinkExpirySweep(prisma, null);
    expect(count).toBe(1);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pending.id } });
    // D-11 promises the LOCAL expiry. An uncancelled link that is later paid
    // arrives as a webhook and is reconciled there.
    expect(payment.status).toBe('expired');
  });

  it('does not let one clinic gateway failure abort the sweep for another clinic', async () => {
    holder.current.paymentLink.cancel = vi.fn(async () => {
      throw { statusCode: 500, error: { description: 'gateway unavailable' } };
    }) as unknown as RazorpayMock['paymentLink']['cancel'];

    const otherOwner = await createTestUser({ fullName: 'Other Sweep Owner' });
    const otherClinic = await createTestClinic(otherOwner.id, {
      name: 'Other Sweep Clinic',
      razorpayKeyId: `rzp_test_${randomUUID().slice(0, 10)}`,
      razorpayKeySecretEnc: encryptSecret('other_jobs_secret'),
    });
    await createTestClinicMember(otherOwner.id, otherClinic.id, 'FrontDesk');

    const mine = await seedInvoice({ status: 'UNPAID', dueDate: null });
    await seedPendingLink(mine.id, { createdAt: new Date(Date.now() - 20 * 60_000) });

    const theirs = await prisma.invoice.create({
      data: {
        clinicId: otherClinic.id,
        createdById: otherOwner.id,
        status: 'UNPAID',
        source: 'manual',
        invoiceNumber: 'INV-202608-9001',
        grandTotalPaise: 70000,
        subtotalPaise: 70000,
        taxableValuePaise: 70000,
        balancePaise: 70000,
        finalizedAt: new Date(),
      },
    });
    const theirPending = await prisma.payment.create({
      data: {
        clinicId: otherClinic.id,
        invoiceId: theirs.id,
        method: 'upi',
        channel: 'razorpay',
        amountPaise: 70000,
        status: 'pending',
        razorpayPaymentLinkId: `plink_test_${randomUUID().slice(0, 8)}`,
        paymentGroupId: randomUUID(),
        createdAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() - 4 * 60_000),
        recordedById: otherOwner.id,
      },
    });

    const count = await runPaymentLinkExpirySweep(prisma, null);
    expect(count).toBe(2);

    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: theirPending.id } })).status,
    ).toBe('expired');
  });

  it('pushes the update to the affected clinic room only', async () => {
    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: null });
    await seedPendingLink(invoice.id, { createdAt: new Date(Date.now() - 20 * 60_000) });

    const { io, emitted } = recordingIo();
    await runPaymentLinkExpirySweep(prisma, io);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe(`clinic:${clinicId}`);
    expect(emitted[0].event).toBe('invoice:updated');
    expect(emitted[0].data.invoiceId).toBe(invoice.id);
  });

  it('records the expiry in the financial audit trail', async () => {
    const invoice = await seedInvoice({ status: 'UNPAID', dueDate: null });
    await seedPendingLink(invoice.id, { createdAt: new Date(Date.now() - 20 * 60_000) });

    await runPaymentLinkExpirySweep(prisma, null);

    const audit = await prisma.billingAuditLog.findMany({
      where: { clinicId, invoiceId: invoice.id, event: 'PAYMENT_LINK_EXPIRED' },
    });
    expect(audit).toHaveLength(1);
  });
});
