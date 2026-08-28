import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import type { DbClient } from '../../lib/prisma-rls.js';
import { SOCKET_EVENTS, NO_SHOW_GRACE_MINUTES } from '@breeyo/types';
import { getTodayIST } from '../../lib/ist-date.js';
import type { AppointmentRepository } from './appointment.repository.js';
import type { QueueRepository } from '../queue/queue.repository.js';
import type { AppointmentService } from './appointment.service.js';

export interface HandoffPassResult {
  appointmentsProcessed: number;
  entriesCreated: number;
}

export interface NoShowPassResult {
  entriesFlipped: number;
  appointmentsFlipped: number;
}

/**
 * SCH-02, D-08/D-09/D-10/D-11/D-21: the mechanism behind "a scheduled
 * appointment appears in the walk-in queue at its time slot." Both public
 * methods are called directly by `runSchedulingSweep` (plan 08-09 Task 3)
 * with an explicit `now`, never on a live timer of their own -- see that
 * file for the BullMQ `upsertJobScheduler` wiring.
 *
 * Idempotency for both passes is belt-and-braces (RESEARCH Pattern 2, quoting
 * Phase 7's own precedent: "the unique task key makes a duplicate sweep a
 * no-op anyway. Use both"):
 *   - The driving query for each pass filters on its own nullable marker
 *     column (`queueEntryCreatedAt` / `noShowFlippedAt`), so a re-run simply
 *     finds nothing left to do.
 *   - Pass 1 additionally skips any pet that already has an active queue
 *     entry today, so even a crash between creating one pet's entry and
 *     stamping the appointment-level marker cannot double-enter that pet on
 *     the next sweep.
 */
export class QueueHandoffService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly queue: QueueRepository,
    private readonly appointmentService: AppointmentService,
    private readonly prisma: PrismaClient,
    private readonly io: Server | null = null,
  ) {}

  /**
   * Pass 1 (SCH-02, D-08, D-21): one EXPECTED `QueueEntry` per pet on every
   * `SCHEDULED` appointment whose `scheduledFor` has passed and which has
   * not yet produced a queue entry.
   */
  async createExpectedEntriesForDueAppointments(now: Date, limit = 200): Promise<HandoffPassResult> {
    const dueAppointments = await this.appointments.findDueForQueueHandoff(now, limit);
    const today = getTodayIST(now);

    let appointmentsProcessed = 0;
    let entriesCreated = 0;

    for (const appointment of dueAppointments) {
      // WR-4: this try/catch is per-appointment, not per-batch. Without it,
      // one malformed/failing appointment (bad data, constraint violation)
      // throws, unwinds this entire `for` loop, and silently skips every
      // appointment after it in this batch (up to 200, ordered
      // `scheduledFor` asc, unscoped by clinic). Because the offending
      // appointment's marker column (`queueEntryCreatedAt`) never gets
      // stamped, it stays first in line and re-fails on every subsequent
      // 5-minute sweep -- permanently blocking every later appointment,
      // across every clinic, until fixed manually. Catching here and
      // continuing keeps the failure scoped to just this one appointment.
      try {
        const entryIds: string[] = [];

        // D-02: carry the appointment's service name onto the queue card as
        // `visitReason` when one was chosen at booking time.
        let visitReason: string | undefined;
        if (appointment.serviceCatalogId) {
          const service = await this.prisma.serviceCatalog.findUnique({
            where: { id: appointment.serviceCatalogId },
            select: { name: true },
          });
          visitReason = service?.name;
        }

        // One appointment, one transaction -- `tx` is threaded through every
        // write below (the queue-handoff-transaction-noop fix: the previous
        // version of this callback took no `tx` parameter, so its three writes
        // each ran through `this.queue`/`this.appointments`'s own
        // `this.prisma` and auto-committed independently, not atomically as
        // this comment claims). A crash between `createEntryIfNoneActive`
        // succeeding and `markQueueEntryCreated` running now cannot happen
        // without the whole transaction rolling back.
        await this.prisma.$transaction(async (tx) => {
          for (const appointmentPet of appointment.pets) {
            // A pet who walked in (or was otherwise entered) before their
            // appointment slot arrived already has a board entry today --
            // never give them a second one. The active-entry check and the
            // create run under one advisory lock (queue-checkin-handoff-race
            // fix), inside this same `tx`, so a walk-in check-in racing this
            // exact pet/day can't also observe "no active entry" first.
            const { entry, existingActive } = await this.queue.createEntryIfNoneActive(
              appointment.clinicId,
              appointmentPet.petId,
              today,
              {
                clinicId: appointment.clinicId,
                petId: appointmentPet.petId,
                checkedInBy: appointment.createdById,
                status: 'EXPECTED',
                // D-13: an EXPECTED row does not occupy a walk-in position.
                position: 0,
                isEmergency: false,
                visitReason,
                // D-10: this is the ENTIRE mechanism behind scheduled-time queue
                // priority -- the entry's priority is the appointment's SLOT
                // time, never the sweep's run time. Do NOT "fix" this to `now`;
                // that would silently delete D-10/D-11 (see
                // 08-RESEARCH.md § Architecture Patterns Pattern 3).
                queuePriorityAt: appointment.scheduledFor,
                appointmentId: appointment.id,
              },
              // Cast per the established tenant-vs-admin transaction typing
              // boundary (see `queue.repository.ts`'s `Db` type): `tx`'s
              // model delegates are structurally identical to `DbClient`'s at
              // runtime, but unioning the two into `QueueRepository`'s `Db`
              // type would blow past TypeScript's instantiation-depth guard.
              tx as unknown as DbClient,
            );
            if (existingActive || !entry) {
              continue;
            }

            await this.appointments.setPetQueueEntry(appointment.clinicId, appointmentPet.id, entry.id, tx);
            entryIds.push(entry.id);
            entriesCreated += 1;
          }

          // Last statement: stamps the marker that keeps the driving query
          // above from ever re-selecting this appointment.
          await this.appointments.markQueueEntryCreated(appointment.clinicId, appointment.id, now, tx);
        });

        appointmentsProcessed += 1;

        if (entryIds.length > 0) {
          this.broadcast(appointment.clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {
            clinicId: appointment.clinicId,
            appointmentId: appointment.id,
            entryIds,
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Scheduling sweep: handoff pass failed for appointment', {
          appointmentId: appointment.id,
          clinicId: appointment.clinicId,
          error,
        });
        continue;
      }
    }

    return { appointmentsProcessed, entriesCreated };
  }

  /**
   * Pass 2 (D-09): flips an abandoned EXPECTED entry to NO_SHOW after
   * `graceMinutes` have elapsed past the appointment's `scheduledFor`, on
   * both the `QueueEntry` and (conditionally) the `Appointment`.
   */
  async autoFlipExpiredExpected(
    now: Date,
    graceMinutes = NO_SHOW_GRACE_MINUTES,
    limit = 200,
  ): Promise<NoShowPassResult> {
    const cutoff = new Date(now.getTime() - graceMinutes * 60000);
    const expiredAppointments = await this.appointments.findExpiredExpected(cutoff, limit);

    let entriesFlipped = 0;
    let appointmentsFlipped = 0;

    for (const appointment of expiredAppointments) {
      // WR-4: per-appointment isolation, matching
      // `createExpectedEntriesForDueAppointments` above -- a single
      // appointment's failure (e.g. a queue-entry lookup/update throwing)
      // must not unwind this whole loop and skip every later appointment in
      // the batch (up to 200, ordered `scheduledFor` asc). Since this
      // appointment's `noShowFlippedAt` marker never gets stamped when it
      // throws, it would otherwise stay first in line and re-fail on every
      // subsequent sweep, permanently blocking later appointments.
      try {
        const flippedEntryIds: string[] = [];
        let anyAttended = false;

        for (const appointmentPet of appointment.pets) {
          if (!appointmentPet.queueEntryId) {
            continue;
          }

          const entry = await this.queue.findEntryById(appointmentPet.queueEntryId);
          if (!entry) {
            continue;
          }

          if (entry.status === 'EXPECTED') {
            await this.queue.updateEntry(entry.id, { status: 'NO_SHOW', completedAt: now });
            flippedEntryIds.push(entry.id);
          } else {
            // The pet's entry already progressed past EXPECTED (WAITING,
            // IN_CONSULT, or already resolved) -- that pet attended.
            anyAttended = true;
          }
        }

        entriesFlipped += flippedEntryIds.length;

        if (!anyAttended) {
          // D-09: nobody on this appointment ever arrived -- flip the
          // appointment itself via `appointmentService.markNoShow`, which
          // internally calls the repository's `markNoShowFlipped` (status ->
          // NO_SHOW + `noShowFlippedAt` stamp) and broadcasts
          // APPOINTMENT_UPDATED, so neither is repeated below.
          //
          // The sweep has no authenticated actor. `AuthAuditLog.userId` carries
          // no FK constraint (it is a bare UUID column), so attributing the
          // audit trail to the appointment's own `createdById` is the closest
          // analog this schema allows to "no signed-in user."
          await this.appointmentService.markNoShow({
            clinicId: appointment.clinicId,
            appointmentId: appointment.id,
            userId: appointment.createdById,
          });
          appointmentsFlipped += 1;
        } else if (flippedEntryIds.length > 0) {
          // D-09 multi-pet rule (a real product judgement, not an oversight):
          // when at least one pet on this appointment attended, the
          // appointment itself is left in whatever state check-in put it in --
          // only the no-show pet's own queue entry flips. `noShowFlippedAt` is
          // still stamped (with NO status change) purely so this pass does not
          // keep re-selecting the appointment on every future 5-minute sweep.
          await this.appointments.update(appointment.clinicId, appointment.id, { noShowFlippedAt: now });
        }

        if (flippedEntryIds.length > 0) {
          this.broadcast(appointment.clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {
            clinicId: appointment.clinicId,
            appointmentId: appointment.id,
            entryIds: flippedEntryIds,
            timestamp: Date.now(),
          });

          if (anyAttended) {
            // `markNoShow` above already broadcasts APPOINTMENT_UPDATED for the
            // "nobody attended" branch -- only emit it here for the branch
            // where markNoShow was never called, so it fires exactly once.
            this.broadcast(appointment.clinicId, SOCKET_EVENTS.APPOINTMENT_UPDATED, {
              appointmentId: appointment.id,
              timestamp: Date.now(),
            });
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Scheduling sweep: no-show pass failed for appointment', {
          appointmentId: appointment.id,
          clinicId: appointment.clinicId,
          error,
        });
        continue;
      }
    }

    return { entriesFlipped, appointmentsFlipped };
  }

  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
