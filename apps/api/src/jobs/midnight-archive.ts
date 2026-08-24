import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS, SCHEDULING_TIMEZONE } from '@breeyo/types';
import { QueueRepository } from '../modules/queue/queue.repository.js';
import { getTodayIST } from '../lib/ist-date.js';
import { adminAsDbClient } from '../lib/prisma-rls.js';

/**
 * Schedules midnight auto-archive of queue entries.
 * D-23: Queue resets at midnight IST.
 * D-39: IN_CONSULT entries persist past midnight.
 *
 * Admin client by design: cron has no request context (D-30 exemption).
 * This job runs on a timer with no HTTP request, so there is no `request.db`
 * and no single `app.clinic_id` to bind — it is cross-clinic by design, since
 * every clinic's queue resets at the same IST midnight.
 * `QueueRepository.archiveEntries(today)` therefore takes no `clinicId`; that
 * is the one intentional unscoped write in the codebase.
 */
export function scheduleMidnightArchive(prisma: PrismaClient, io: Server) {
  cron.schedule(
    '0 0 * * *',
    async () => {
      const today = getTodayIST();

      try {
        const repository = new QueueRepository(adminAsDbClient(prisma));
        const result = await repository.archiveEntries(today);

        console.log(`Midnight archive: ${result.count} entries archived`);

        // Notify all connected clients to refresh their queue
        io.emit(SOCKET_EVENTS.QUEUE_ARCHIVED, { timestamp: Date.now() });
      } catch (error) {
        console.error('Midnight archive failed:', error);
      }
    },
    { timezone: SCHEDULING_TIMEZONE },
  );
}
