import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import { NotificationType, NotificationModule } from '@breeyo/types';
import type { NotificationBus } from '../modules/notifications/notification-bus.js';

/** One newly-expired batch, flattened for the notification/log payload. */
export interface NewlyExpiredBatch {
  batchId: string;
  itemId: string;
  itemName: string;
  clinicId: string;
}

/**
 * D-56: finds every StockBatch that has just crossed its expiry threshold
 * (isExpired=false AND expiryDate < NOW()), flips isExpired=true on all of
 * them in one update, and returns the flattened list so a caller can notify.
 *
 * Deliberately excludes batches already flagged isExpired=true -- re-running
 * this daily must not re-notify about the same batch every day (idempotent
 * per run), and must never touch batches that are not yet expired.
 */
export async function markNewlyExpiredBatches(prisma: PrismaClient): Promise<NewlyExpiredBatch[]> {
  const newlyExpired = await prisma.stockBatch.findMany({
    where: {
      isExpired: false,
      expiryDate: { lt: new Date() },
    },
    include: { item: { select: { id: true, name: true, clinicId: true } } },
  });

  if (newlyExpired.length === 0) {
    return [];
  }

  await prisma.stockBatch.updateMany({
    where: { id: { in: newlyExpired.map((batch) => batch.id) } },
    data: { isExpired: true },
  });

  return newlyExpired.map((batch) => ({
    batchId: batch.id,
    itemId: batch.itemId,
    itemName: batch.item.name,
    clinicId: batch.item.clinicId,
  }));
}

/** All active clinic members -- D-41-D-44 grants VIEW_INVENTORY to every
 *  role (Admin/Clinician/FrontDesk/InventoryManager), so "everyone active at
 *  the clinic" and "everyone who can see the Expired tab" are the same set;
 *  no need to resolve per-user permissions for this notification. */
async function getClinicRecipientUserIds(prisma: PrismaClient, clinicId: string): Promise<string[]> {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, isActive: true },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/**
 * D-56: runs the full daily expiry check -- marks newly-expired batches,
 * then (if a NotificationBus is supplied) emits one notification per clinic
 * summarizing which items just expired, reusing the existing BullMQ
 * notifications queue/worker (apps/api/src/modules/notifications/) instead
 * of building a new push mechanism. Notification emission is best-effort:
 * a failure to notify does not roll back the isExpired flags already set,
 * and is logged rather than thrown, so a Redis/queue hiccup never leaves
 * batches un-flagged.
 *
 * Exported separately from scheduleExpiryCron so this is unit-testable
 * without going through node-cron.
 */
export async function runExpiryCheck(
  prisma: PrismaClient,
  notificationBus?: NotificationBus,
): Promise<NewlyExpiredBatch[]> {
  const newlyExpired = await markNewlyExpiredBatches(prisma);

  if (newlyExpired.length === 0) {
    return newlyExpired;
  }

  console.log(`Expiry cron: ${newlyExpired.length} batch(es) newly marked expired`, {
    batchIds: newlyExpired.map((b) => b.batchId),
  });

  if (!notificationBus) {
    return newlyExpired;
  }

  const byClinic = new Map<string, NewlyExpiredBatch[]>();
  for (const batch of newlyExpired) {
    byClinic.set(batch.clinicId, [...(byClinic.get(batch.clinicId) ?? []), batch]);
  }

  for (const [clinicId, batches] of byClinic) {
    try {
      const recipientUserIds = await getClinicRecipientUserIds(prisma, clinicId);
      if (recipientUserIds.length === 0) continue;

      const itemNames = [...new Set(batches.map((b) => b.itemName))];
      const preview = itemNames.slice(0, 5).join(', ') + (itemNames.length > 5 ? ', …' : '');

      await notificationBus.emit({
        type: NotificationType.EXPIRED_STOCK,
        module: NotificationModule.INVENTORY,
        clinicId,
        recipientUserIds,
        title: `${batches.length} batch${batches.length > 1 ? 'es' : ''} expired`,
        body: preview,
        data: {
          batchIds: batches.map((b) => b.batchId),
          itemIds: [...new Set(batches.map((b) => b.itemId))],
        },
      });
    } catch (error) {
      // Best-effort: the isExpired flags are already committed above; a
      // notification failure for one clinic must not affect the others or
      // the (already-successful) database update.
      console.error(`Expiry cron: failed to notify clinic ${clinicId}`, error);
    }
  }

  return newlyExpired;
}

/**
 * D-56: schedules the daily midnight-IST expiry check, following the exact
 * node-cron registration pattern already established by
 * jobs/midnight-archive.ts (the "existing cron pattern" referenced for this
 * job -- despite D-56's literal text saying "BullMQ repeatable job", the
 * actual scheduling mechanism this codebase uses for daily jobs is node-cron;
 * BullMQ here is reserved for queue/worker fan-out, e.g. the notifications
 * queue this job emits into. Matching the established pattern instead of
 * introducing a second scheduling mechanism for one job).
 */
export function scheduleExpiryCron(prisma: PrismaClient, notificationBus?: NotificationBus) {
  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const result = await runExpiryCheck(prisma, notificationBus);
        console.log(`Expiry cron: completed, ${result.length} batch(es) newly expired`);
      } catch (error) {
        console.error('Expiry cron failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
