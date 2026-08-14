import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@breeyo/types';
import { QueueRepository } from '../modules/queue/queue.repository.js';

/**
 * Flags overdue invoices once a day, in IST (D-23, BIL-03).
 *
 * ## Why this is a cron and not a computed property
 *
 * `OVERDUE` could be derived on read — `dueDate < today AND balance > 0` is not
 * expensive. It is a stored status because D-24's dashboard filters and sorts
 * on it, because the mobile client caches invoice rows and would otherwise show
 * a stale badge until the next fetch, and because "when did this become
 * overdue" is a question the clinic will eventually ask. A derived value has no
 * answer to that.
 *
 * ## What this job deliberately does NOT do
 *
 * It sends nothing. D-23 is explicit that overdue flagging carries no automated
 * reminder to the owner: the clinic decides who to chase and how, and an
 * automatic SMS to a pet owner about money is a decision the product has not
 * made. The only push is a Socket.IO refresh to the clinic's own staff.
 *
 * Admin client by design: a cron has no request context and this sweep is
 * cross-clinic — every clinic's invoices age on the same IST calendar
 * (D-30 exemption). The per-clinic grouping below is for the push, not for the
 * write.
 */

/** Five past midnight IST, so this never contends with the queue archive. */
const OVERDUE_CRON_EXPRESSION = '5 0 * * *';

/**
 * Flags every invoice past its due date and returns how many changed.
 *
 * Exported separately from {@link scheduleOverdueInvoices} so the suite can
 * exercise the predicate without waiting a day for a schedule to fire.
 *
 * The predicate:
 *
 * - `status IN ('UNPAID', 'PARTIALLY_PAID')` — the two states from which
 *   `OVERDUE` is a legal transition. `PAID` and `VOIDED` are terminal, and
 *   `DRAFT` carries no number and no frozen tax, so it is not yet a record of
 *   account that anything can be due against.
 * - `balancePaise > 0` — an invoice settled by a credit note has a due date in
 *   the past and nothing outstanding. Chasing it would be wrong.
 * - `dueDate < getTodayIST()` — strictly before midnight IST today, so an
 *   invoice due TODAY is not overdue. The same helper the queue uses, rather
 *   than a second definition of "today" that could drift from it.
 */
export async function runOverdueSweep(prisma: PrismaClient, io: Server | null): Promise<number> {
  const today = QueueRepository.getTodayIST();

  const due = await prisma.invoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIALLY_PAID'] },
      balancePaise: { gt: 0 },
      dueDate: { lt: today },
    },
    select: { id: true, clinicId: true },
  });

  if (due.length === 0) return 0;

  const { count } = await prisma.invoice.updateMany({
    where: { id: { in: due.map((invoice) => invoice.id) } },
    data: { status: 'OVERDUE' },
  });

  if (io) {
    // Grouped per clinic and pushed into that clinic's room. A global emit
    // would be simpler and would put one clinic's invoice ids on every socket
    // in the deployment.
    const byClinic = new Map<string, string[]>();
    for (const invoice of due) {
      byClinic.set(invoice.clinicId, [...(byClinic.get(invoice.clinicId) ?? []), invoice.id]);
    }

    for (const [clinicId, invoiceIds] of byClinic) {
      io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.INVOICE_UPDATED, {
        reason: 'overdue-sweep',
        invoiceIds,
      });
    }
  }

  return count;
}

export function scheduleOverdueInvoices(prisma: PrismaClient, io: Server) {
  cron.schedule(
    OVERDUE_CRON_EXPRESSION,
    async () => {
      try {
        const count = await runOverdueSweep(prisma, io);
        console.log(`Overdue sweep: ${count} invoice(s) flagged OVERDUE`);
      } catch (error) {
        // Swallowed, as in midnight-archive.ts: an unhandled rejection inside a
        // scheduled callback takes the process down, and losing the API for the
        // day is far worse than a stale badge until tomorrow.
        console.error('Overdue sweep failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
