import type { QueueEntryStatus } from '@prisma/client';
import type { DbClient } from '../../lib/prisma-rls.js';

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
   */
  static getTodayIST(date?: Date): Date {
    const now = date ?? new Date();
    // Convert to IST string, then parse back to get midnight IST
    const istString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // istString is "YYYY-MM-DD"
    const [year, month, day] = istString.split('-').map(Number);
    // Create UTC date that represents midnight IST (IST = UTC + 5:30)
    return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
  }

  /**
   * Finds an active queue entry (WAITING or IN_CONSULT) for a pet today.
   */
  async findTodayActiveEntryForPet(clinicId: string, petId: string, today: Date) {
    return this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        petId,
        checkedInAt: { gte: today },
        status: { in: ['WAITING', 'IN_CONSULT'] },
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
  async createEntry(data: {
    clinicId: string;
    petId: string;
    checkedInBy: string;
    status: QueueEntryStatus;
    position: number;
    isEmergency: boolean;
    visitReason?: string;
  }) {
    return this.prisma.queueEntry.create({
      data: {
        clinicId: data.clinicId,
        petId: data.petId,
        checkedInBy: data.checkedInBy,
        status: data.status,
        position: data.position,
        isEmergency: data.isEmergency,
        ...(data.visitReason && { visitReason: data.visitReason }),
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
   * Finds the next WAITING entry: emergency first, then FIFO by check-in time.
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
        { checkedInAt: 'asc' },
      ],
      include: PET_OWNER_INCLUDE,
    });
  }

  /**
   * Returns the queue board: entries grouped by status.
   * - inConsult: currently being seen (no date filter, only non-archived)
   * - waiting: checked in today, ordered by emergency first then FIFO
   * - done: completed today
   */
  async getQueueBoard(clinicId: string, today: Date) {
    const [inConsult, waiting, done] = await Promise.all([
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
        orderBy: [
          { isEmergency: 'desc' },
          { checkedInAt: 'asc' },
        ],
      }),
      this.prisma.queueEntry.findMany({
        where: {
          clinicId,
          status: { in: ['DONE', 'NO_SHOW'] },
          checkedInAt: { gte: today },
          archivedAt: null,
        },
        include: PET_OWNER_INCLUDE,
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    return { inConsult, waiting, done };
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
}
