import type { QueueEntryStatus } from '@prisma/client';
import type { DbClient } from '../../lib/prisma-rls.js';
import { getTodayIST, istDayBounds } from '../../lib/ist-date.js';
import { ACTIVE_QUEUE_STATUSES, CLOSED_QUEUE_STATUSES } from '@breeyo/types';
import type { CreateEntryParams } from './queue.types.js';

const PET_OWNER_INCLUDE = {
  pet: {
    include: {
      owner: true,
    },
  },
} as const;

export class QueueRepository {
  constructor(private readonly prisma: DbClient) {}

  /**
   * Gets start of today in IST (Asia/Kolkata, UTC+5:30).
   *
   * Delegates to the shared `apps/api/src/lib/ist-date.ts` module (WHA-01)
   * rather than duplicating the arithmetic — kept as a static method so the
   * existing `queue.service.ts` call sites keep compiling unchanged.
   */
  static getTodayIST(date?: Date): Date {
    return getTodayIST(date);
  }

  /**
   * Finds an active queue entry (EXPECTED, WAITING or IN_CONSULT) for a pet
   * today. Including EXPECTED is deliberate (D-13): a scheduled patient
   * already has a board entry, so a second walk-in check-in for the same
   * pet is a duplicate -- the correct staff action is to check the existing
   * EXPECTED entry in, not create a second row.
   */
  async findTodayActiveEntryForPet(clinicId: string, petId: string, today: Date) {
    return this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        petId,
        checkedInAt: { gte: today },
        status: { in: ACTIVE_QUEUE_STATUSES as unknown as QueueEntryStatus[] },
        archivedAt: null,
      },
    });
  }

  /**
   * Finds a DONE entry for a pet today (for D-40 re-check-in detection).
   */
  async findTodayDoneEntryForPet(clinicId: string, petId: string, today: Date) {
    return this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        petId,
        checkedInAt: { gte: today },
        status: 'DONE',
        archivedAt: null,
      },
    });
  }

  /**
   * Finds a pet within the calling clinic.
   *
   * D-30 defence in depth: RLS already hides other clinics' pets from the
   * tenant handle, but check-in must fail cleanly rather than surfacing a
   * constraint error, so the explicit clinicId filter stays as layer one.
   */
  async findPetInClinic(clinicId: string, petId: string) {
    return this.prisma.pet.findFirst({
      where: { id: petId, clinicId },
      select: { id: true },
    });
  }

  /**
   * Counts WAITING entries for today (for position assignment).
   */
  async countWaiting(clinicId: string, today: Date): Promise<number> {
    return this.prisma.queueEntry.count({
      where: {
        clinicId,
        status: 'WAITING',
        checkedInAt: { gte: today },
        archivedAt: null,
      },
    });
  }

  /**
   * Creates a new queue entry with pet and owner included in the response.
   */
  async createEntry(data: CreateEntryParams) {
    return this.prisma.queueEntry.create({
      data: {
        clinicId: data.clinicId,
        petId: data.petId,
        checkedInBy: data.checkedInBy,
        status: data.status,
        position: data.position,
        isEmergency: data.isEmergency,
        queuePriorityAt: data.queuePriorityAt ?? new Date(),
        ...(data.visitReason && { visitReason: data.visitReason }),
        ...(data.appointmentId !== undefined && { appointmentId: data.appointmentId }),
      },
      include: PET_OWNER_INCLUDE,
    });
  }

  /**
   * Finds a queue entry by ID.
   */
  async findEntryById(entryId: string) {
    return this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: PET_OWNER_INCLUDE,
    });
  }

  /**
   * Updates a queue entry and returns it with pet/owner data.
   */
  async updateEntry(entryId: string, data: Record<string, unknown>) {
    return this.prisma.queueEntry.update({
      where: { id: entryId },
      data,
      include: PET_OWNER_INCLUDE,
    });
  }

  /**
   * Phase 8 (D-27 trigger 3): the single oldest WAITING entry today, by the
   * same ordering `findNextWaiting`/the board's waiting branch already use --
   * its `queuePriorityAt` is the "longest wait" reference point for the
   * queue-backlog push. A narrow `select` rather than reusing
   * `getQueueBoard` (which would load the whole board) since `checkIn`'s hot
   * path only needs this one timestamp.
   */
  async findOldestWaiting(clinicId: string, today: Date): Promise<{ queuePriorityAt: Date } | null> {
    return this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        status: 'WAITING',
        checkedInAt: { gte: today },
        archivedAt: null,
      },
      orderBy: [
        { isEmergency: 'desc' },
        { queuePriorityAt: 'asc' },
        { checkedInAt: 'asc' },
      ],
      select: { queuePriorityAt: true },
    });
  }

  /**
   * Finds the next WAITING entry: emergency first, then by queue priority
   * time (D-10), then FIFO by check-in time as a tiebreak (D-34).
   */
  async findNextWaiting(clinicId: string, today: Date) {
    return this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        status: 'WAITING',
        checkedInAt: { gte: today },
        archivedAt: null,
      },
      orderBy: [
        { isEmergency: 'desc' },
        { queuePriorityAt: 'asc' },
        { checkedInAt: 'asc' },
      ],
      include: PET_OWNER_INCLUDE,
    });
  }

  /**
   * Returns the queue board: entries grouped by status.
   * - expected: scheduled patients for today who haven't checked in yet (D-08, D-13)
   * - inConsult: currently being seen (no date filter, only non-archived)
   * - waiting: checked in today, ordered by emergency first, then queue
   *   priority time (D-10), then FIFO check-in time as a tiebreak (D-34)
   * - done: completed today
   */
  async getQueueBoard(clinicId: string, today: Date) {
    // D-08/D-13: the EXPECTED group is scoped to the same IST calendar day
    // as the rest of the board, filtered on queuePriorityAt (the slot time)
    // rather than checkedInAt -- an EXPECTED row's checkedInAt is still its
    // sweep-creation instant, not a meaningful "which day" signal.
    const { start, end } = istDayBounds(today);

    const [expected, inConsult, waiting, done] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where: {
          clinicId,
          status: 'EXPECTED',
          queuePriorityAt: { gte: start, lt: end },
          archivedAt: null,
        },
        include: PET_OWNER_INCLUDE,
        orderBy: [
          { isEmergency: 'desc' },
          { queuePriorityAt: 'asc' },
        ],
      }),
      this.prisma.queueEntry.findMany({
        where: {
          clinicId,
          status: 'IN_CONSULT',
          archivedAt: null,
        },
        include: PET_OWNER_INCLUDE,
        orderBy: { checkedInAt: 'asc' },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          clinicId,
          status: 'WAITING',
          checkedInAt: { gte: today },
          archivedAt: null,
        },
        include: PET_OWNER_INCLUDE,
        // D-10: queue priority time (an EXPECTED patient's slot time, or a
        // walk-in's check-in time) is the primary sort key after emergency,
        // so call-next and this board branch can never disagree; D-34:
        // checkedInAt is the tiebreak when two entries share an identical
        // queuePriorityAt (double-booked slots).
        orderBy: [
          { isEmergency: 'desc' },
          { queuePriorityAt: 'asc' },
          { checkedInAt: 'asc' },
        ],
      }),
      this.prisma.queueEntry.findMany({
        where: {
          clinicId,
          status: { in: CLOSED_QUEUE_STATUSES as unknown as QueueEntryStatus[] },
          checkedInAt: { gte: today },
          archivedAt: null,
        },
        include: PET_OWNER_INCLUDE,
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    return { expected, inConsult, waiting, done };
  }

  /**
   * Gets the average consultation duration over the last N days.
   * Returns seconds or null if fewer than 5 data points.
   */
  async getAverageConsultDuration(clinicId: string, days: number): Promise<number | null> {
    const result = await this.prisma.$queryRaw<Array<{ avg_seconds: number | null; count: bigint }>>`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("completed_at" - "called_at"))) as avg_seconds,
        COUNT(*) as count
      FROM queue_entries
      WHERE clinic_id = ${clinicId}::uuid
        AND status = 'DONE'
        AND called_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND completed_at >= NOW() - INTERVAL '${days} days'
    `;

    const row = result[0];
    if (!row || Number(row.count) < 5 || row.avg_seconds == null) {
      return null;
    }

    return Number(row.avg_seconds);
  }

  /**
   * Archives entries from before the given date.
   * Omit clinicId for the global midnight sweep; pass it to scope an
   * authenticated request to a single clinic.
   * D-39: IN_CONSULT entries persist past midnight.
   * D-09: EXPECTED is deliberately NOT in this list. An unresolved EXPECTED
   * entry means the no-show sweep hasn't yet flipped it to NO_SHOW;
   * archiving it here would strand the underlying appointment in
   * SCHEDULED forever with no visible queue trace.
   */
  async archiveEntries(beforeDate: Date, clinicId?: string) {
    return this.prisma.queueEntry.updateMany({
      where: {
        archivedAt: null,
        status: { in: ['WAITING', 'DONE', 'NO_SHOW'] },
        checkedInAt: { lt: beforeDate },
        ...(clinicId && { clinicId }),
      },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * D-28: deletes a stale EXPECTED queue entry for an appointment that was
   * just cancelled or rescheduled, so the board updates immediately instead
   * of waiting for the grace-window sweep to flip it to NO_SHOW. Deliberately
   * scoped to `status: 'EXPECTED'` -- a queue entry that has already
   * progressed to WAITING/IN_CONSULT means the patient physically arrived
   * through some other path, and an appointment-side cancel must never
   * touch that row.
   */
  async deleteExpectedEntryForAppointment(clinicId: string, appointmentId: string): Promise<number> {
    const result = await this.prisma.queueEntry.deleteMany({
      where: {
        clinicId,
        appointmentId,
        status: 'EXPECTED',
      },
    });
    return result.count;
  }
}
