import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@breeyo/types';
import { QueueRepository } from '../modules/queue/queue.repository.js';

/**
 * Schedules midnight auto-archive of queue entries.
 * D-23: Queue resets at midnight IST.
 * D-39: IN_CONSULT entries persist past midnight.
 */
export function scheduleMidnightArchive(prisma: PrismaClient, io: Server) {
  cron.schedule(
    '0 0 * * *',
    async () => {
      const today = QueueRepository.getTodayIST();

      try {
        const repository = new QueueRepository(prisma);
        const result = await repository.archiveEntries(today);

        console.log(`Midnight archive: ${result.count} entries archived`);

        // Notify all connected clients to refresh their queue
        io.emit(SOCKET_EVENTS.QUEUE_ARCHIVED, { timestamp: Date.now() });
      } catch (error) {
        console.error('Midnight archive failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
