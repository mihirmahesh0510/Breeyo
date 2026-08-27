import type { Prisma, PrismaClient, QueueEntryStatus } from '@prisma/client';
import type { DbClient } from '../../lib/prisma-rls.js';
import { getTodayIST, istDayBounds } from '../../lib/ist-date.js';
import { ACTIVE_QUEUE_STATUSES, CLOSED_QUEUE_STATUSES } from '@breeyo/types';
import type { CreateEntryParams } from './queue.types.js';

/**
 * `DbClient` (the tenant-scoped or admin `PrismaClient`) -- lets
 * `findTodayActiveEntryForPet`/`createEntry` run inside a caller's own
 * transaction (e.g. `QueueHandoffService`'s per-appointment
 * `prisma.$transaction`) instead of always going through this repository's
 * own `this.prisma` connection.
 *
 * A caller's raw `Prisma.TransactionClient` is cast to `Db` at the boundary
 * (see `createEntryIfNoneActive` and `QueueHandoffService`) rather than
 * unioned into this type: unioning it back in makes every model delegate
 * access below (`queueEntry.findFirst`, `.create`, ...) a comparison between
 * two structurally different generic client shapes, which blows past
 * TypeScript's instantiation-depth guard on a schema this size (TS2321,
 * surfaced as a misleading "not callable" TS2349). The cast is safe: at
 * runtime the transaction client exposes the same model delegate methods
 * either way.
 */
type Db = DbClient;

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
  async findTodayActiveEntryForPet(clinicId: string, petId: string, today: Date, client: Db = this.prisma) {
    return client.queueEntry.findFirst({
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
  async createEntry(data: CreateEntryParams, client: Db = this.prisma) {
    return client.queueEntry.create({
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
   * `QueueService.checkIn` (a walk-in) and `QueueHandoffService`'s sweep
   * handoff pass each need "no active entry for this pet today, so create
   * one" -- calling `findTodayActiveEntryForPet` then `createEntry`
   * separately lets both paths observe "not active yet" before either
   * commits, producing two simultaneous active rows for the same pet. This
   * wraps the check-then-create in one `pg_advisory_xact_lock` (the same
   * mechanism `AppointmentService`'s D-34 vet+slot lock uses), keyed on
   * `(clinicId, petId, day)`, so the two paths serialize against each other
   * regardless of which repository instance/connection either runs on.
   *
   * `client`, when supplied, runs the lock+check+create inside the caller's
   * own transaction (`QueueHandoffService`'s per-appointment transaction) so
   * it commits atomically with that transaction's other writes; omitted, a
   * fresh transaction is opened just for this call (`QueueService.checkIn`,
   * which has no other writes to join).
   */
  async createEntryIfNoneActive(
    clinicId: string,
    petId: string,
    today: Date,
    data: CreateEntryParams,
    client?: Db,
  ): Promise<{
    entry: Awaited<ReturnType<QueueRepository['createEntry']>> | null;
    existingActive: Awaited<ReturnType<QueueRepository['findTodayActiveEntryForPet']>> | null;
  }> {
    const run = async (tx: Db) => {
      const lockKey = `queue-checkin|${clinicId}|${petId}|${today.toISOString().slice(0, 10)}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const existingActive = await this.findTodayActiveEntryForPet(clinicId, petId, today, tx);
      if (existingActive) {
        return { entry: null, existingActive };
      }

      const entry = await this.createEntry(data, tx);
      return { entry, existingActive: null };
    };

    if (client) {
      return run(client);
    }
    // Cast per the established `tx as unknown as never` pattern
    // (`booking.service.ts`) for crossing the tenant-vs-admin transaction
    // typing boundary -- at runtime `this.prisma` may be the `TenantPrismaClient`
    // proxy from `prisma-rls.ts`, whose own `$transaction` trap still fires
    // (and still binds the `app.clinic_id` GUC) regardless of the static type
    // used to access it here.
    return (this.prisma as unknown as PrismaClient).$transaction((tx) => run(tx as unknown as Db));
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
   *
   * When `expectedVersion` is supplied, the write is a single conditional
   * `updateMany` (`WHERE id = ? AND updated_at = ?`) instead of an
   * unconditional `update` -- the version check and the real field changes
   * land in the same statement, so a caller's `expectedVersion` guard can
   * never be satisfied by a write that doesn't actually happen. Returns
   * `null` when the row didn't match (either it no longer has that version,
   * or it no longer exists) -- callers that care which one it was should
   * follow up with `findEntryById`.
   */
  async updateEntry(entryId: string, data: Record<string, unknown>): ReturnType<QueueRepository['updateEntryUnconditionally']>;
  async updateEntry(
    entryId: string,
    data: Record<string, unknown>,
    expectedVersion: number,
  ): Promise<Awaited<ReturnType<QueueRepository['updateEntryUnconditionally']>> | null>;
  async updateEntry(entryId: string, data: Record<string, unknown>, expectedVersion?: number) {
    if (expectedVersion === undefined) {
      return this.updateEntryUnconditionally(entryId, data);
    }

    const claim = await this.prisma.queueEntry.updateMany({
      where: { id: entryId, updatedAt: new Date(expectedVersion) },
      data,
    });

    if (claim.count !== 1) {
      return null;
    }

    return this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: PET_OWNER_INCLUDE,
    });
  }

  /** The plain, unconditional write every pre-Plan-10-05 caller of `updateEntry` still gets -- pulled out only so its return type can be pinned down for `updateEntry`'s overload declarations above. */
  private async updateEntryUnconditionally(entryId: string, data: Record<string, unknown>) {
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
