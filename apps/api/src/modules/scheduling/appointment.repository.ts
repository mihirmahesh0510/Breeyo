import type { PrismaClient, Prisma } from '@prisma/client';
import type { AppointmentWithDetails } from '@breeyo/types';
import { istDayBounds } from '../../lib/ist-date.js';
import type { AppointmentCreateData } from './scheduling.types.js';

/**
 * A plain `PrismaClient` or a Prisma interactive-transaction client. D-34
 * requires the appointment create path (both single-occurrence and
 * multi-occurrence/recurrence) to run inside one `prisma.$transaction` in
 * `AppointmentService`, with a `pg_advisory_xact_lock` as the first
 * statement -- so `create`/`createMany`/`findForVetOnDate` accept whichever
 * client the caller is already inside, rather than opening their own nested
 * transaction (a `Prisma.TransactionClient` has no `$transaction` method of
 * its own to nest into).
 */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Reused by every method that returns an `AppointmentWithDetails` shape, so
 * the contract is produced from exactly one place (mirrors
 * `queue.repository.ts`'s `PET_OWNER_INCLUDE`). `serviceCatalog` and
 * `vet.fullName` are the actual Prisma relation/field names (plan 08-03's
 * schema); `mapAppointment` below renames them to the `service`/`vet.name`
 * shape `@breeyo/types#AppointmentWithDetails` declares.
 */
const APPOINTMENT_DETAIL_INCLUDE = {
  pets: { include: { pet: { select: { id: true, name: true, species: true } } } },
  owner: { select: { id: true, name: true, mobile: true } },
  vet: { select: { id: true, fullName: true } },
  serviceCatalog: { select: { id: true, name: true, durationMinutes: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_DETAIL_INCLUDE }>;

function mapAppointment(row: AppointmentRow): AppointmentWithDetails {
  const { serviceCatalog, vet, pets, owner, ...rest } = row;
  return {
    ...rest,
    owner: { id: owner.id, name: owner.name, mobile: owner.mobile },
    vet: { id: vet.id, name: vet.fullName },
    service: serviceCatalog
      ? { id: serviceCatalog.id, name: serviceCatalog.name, durationMinutes: serviceCatalog.durationMinutes }
      : null,
    pets: pets.map((p) => ({
      id: p.id,
      petId: p.petId,
      queueEntryId: p.queueEntryId,
      pet: { id: p.pet.id, name: p.pet.name, species: p.pet.species },
    })),
  } as unknown as AppointmentWithDetails;
}

export class AppointmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * D-21: nested `pets: { create: ... }` so one appointment and its N pet
   * rows are created atomically as part of whatever transaction `client` is
   * (the service's D-34 advisory-lock transaction for a single-occurrence
   * booking, or `this.prisma` for a call site with no transactional need).
   */
  async create(
    clinicId: string,
    data: AppointmentCreateData,
    petIds: string[],
    client: Db = this.prisma,
  ): Promise<AppointmentWithDetails> {
    const row = await client.appointment.create({
      data: {
        clinicId,
        vetId: data.vetId,
        ownerId: data.ownerId,
        serviceCatalogId: data.serviceCatalogId,
        scheduledFor: data.scheduledFor,
        durationMinutes: data.durationMinutes,
        notes: data.notes ?? null,
        createdById: data.createdById,
        source: data.source,
        recurringSeriesId: data.recurringSeriesId ?? null,
        recurrenceIndex: data.recurrenceIndex ?? null,
        whatsappBookingRequestId: data.whatsappBookingRequestId ?? null,
        pets: { create: petIds.map((petId) => ({ clinicId, petId })) },
      },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return mapAppointment(row as AppointmentRow);
  }

  /**
   * D-22: creates every occurrence in a recurring series. The caller
   * (`AppointmentService`, D-34) always passes its own transaction's `tx` as
   * `client` here, so "one `prisma.$transaction`" (a partially created series
   * is impossible) is guaranteed by the caller's outer transaction rather
   * than by this method opening a second, nested one.
   */
  async createMany(
    clinicId: string,
    rows: Array<{ data: AppointmentCreateData; petIds: string[] }>,
    client: Db = this.prisma,
  ): Promise<AppointmentWithDetails[]> {
    const created: AppointmentWithDetails[] = [];
    for (const row of rows) {
      created.push(await this.create(clinicId, row.data, row.petIds, client));
    }
    return created;
  }

  /** Cross-tenant id returns `null` so the service throws 404, never 403. */
  async findById(clinicId: string, appointmentId: string): Promise<AppointmentWithDetails | null> {
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return row ? mapAppointment(row as AppointmentRow) : null;
  }

  /**
   * The single range-read both the mobile day agenda and the web week grid
   * share (RESEARCH Pattern 4) -- do not add separate day/week methods.
   * Cancelled appointments are deliberately NOT filtered out: the web grid
   * renders them at 50% opacity per UI-SPEC rather than hiding them.
   */
  async findInRange(clinicId: string, from: Date, to: Date, vetId?: string): Promise<AppointmentWithDetails[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        scheduledFor: { gte: from, lt: to },
        ...(vetId ? { vetId } : {}),
      },
      orderBy: [{ scheduledFor: 'asc' }],
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return rows.map((row) => mapAppointment(row as AppointmentRow));
  }

  /**
   * The slot-conflict read: only `SCHEDULED`/`CHECKED_IN` appointments
   * occupy their slot -- a cancelled or no-show appointment does not.
   * Accepts the same `Db` client as `create`/`createMany` so the D-34
   * advisory-lock transaction's re-check runs inside that same transaction.
   */
  async findForVetOnDate(
    clinicId: string,
    vetId: string,
    date: Date,
    client: Db = this.prisma,
  ): Promise<Array<{ scheduledFor: Date; durationMinutes: number }>> {
    const { start, end } = istDayBounds(date);
    return client.appointment.findMany({
      where: {
        clinicId,
        vetId,
        scheduledFor: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CHECKED_IN'] },
      },
      select: { scheduledFor: true, durationMinutes: true },
    });
  }

  async findBySeries(clinicId: string, recurringSeriesId: string): Promise<AppointmentWithDetails[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { clinicId, recurringSeriesId },
      orderBy: { recurrenceIndex: 'asc' },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return rows.map((row) => mapAppointment(row as AppointmentRow));
  }

  /**
   * Scoped on both `id` and `clinicId`; returns `null` when zero rows
   * matched so the service throws 404 rather than a cross-tenant 403.
   */
  async update(
    clinicId: string,
    appointmentId: string,
    data: Record<string, unknown>,
  ): Promise<AppointmentWithDetails | null> {
    const result = await this.prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId },
      data,
    });
    if (result.count === 0) {
      return null;
    }
    return this.findById(clinicId, appointmentId);
  }

  // ---------------------------------------------------------------------
  // Worker-only sweep queries (plan 08-09). Deliberately NOT clinicId-scoped
  // -- the sweep is a background worker that acts across every clinic in one
  // pass, not an authenticated per-clinic request (T-08-30). These three
  // methods are reachable only from plan 08-09's sweep; plan 08-11's
  // controller must never call them.
  // ---------------------------------------------------------------------

  /** Pass 1 (SCH-02, D-08): due appointments that haven't yet spawned a queue entry. */
  async findDueForQueueHandoff(now: Date, limit: number) {
    return this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: now },
        queueEntryCreatedAt: null,
      },
      include: { pets: true },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
    });
  }

  /** Pass 2 (D-09): SCHEDULED appointments whose grace window has elapsed. */
  async findExpiredExpected(cutoffBefore: Date, limit: number) {
    return this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: cutoffBefore },
        noShowFlippedAt: null,
      },
      include: { pets: true },
      orderBy: { scheduledFor: 'asc' },
      take: limit,
    });
  }

  /** Pass 3 (D-27 trigger 1): appointments starting soon, not yet push-notified. */
  async findStartingSoon(from: Date, to: Date, limit: number): Promise<AppointmentWithDetails[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { gte: from, lt: to },
        startingSoonNotifiedAt: null,
      },
      include: APPOINTMENT_DETAIL_INCLUDE,
      orderBy: { scheduledFor: 'asc' },
      take: limit,
    });
    return rows.map((row) => mapAppointment(row as AppointmentRow));
  }

  // ---------------------------------------------------------------------
  // Per-marker mutators -- one narrow method per idempotency marker so each
  // sweep pass stamps only its own column; never a single generic "update
  // markers" method, which is how two passes end up clobbering each other's
  // state. `clinicId` is included even though these are only ever called
  // with a row already resolved by a worker-only finder above, so every
  // write in this repository stays scoped on both `id` and `clinicId`.
  // ---------------------------------------------------------------------

  async markQueueEntryCreated(clinicId: string, appointmentId: string, at: Date): Promise<void> {
    await this.prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId },
      data: { queueEntryCreatedAt: at },
    });
  }

  /** Also flips `status` to `NO_SHOW` -- this is the one mutator both the sweep and a staff-driven markNoShow share. */
  async markNoShowFlipped(clinicId: string, appointmentId: string, at: Date): Promise<AppointmentWithDetails | null> {
    await this.prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId },
      data: { status: 'NO_SHOW', noShowFlippedAt: at },
    });
    return this.findById(clinicId, appointmentId);
  }

  async markStartingSoonNotified(clinicId: string, appointmentId: string, at: Date): Promise<void> {
    await this.prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId },
      data: { startingSoonNotifiedAt: at },
    });
  }

  /** Writes `AppointmentPet.queueEntryId` after the handoff creates the queue entry. */
  async setPetQueueEntry(clinicId: string, appointmentPetId: string, queueEntryId: string): Promise<void> {
    await this.prisma.appointmentPet.updateMany({
      where: { id: appointmentPetId, clinicId },
      data: { queueEntryId },
    });
  }

  /** Used by plan 08-05's override flow through the service layer. */
  async countScheduledForVetOnDate(clinicId: string, vetId: string, date: Date): Promise<number> {
    const { start, end } = istDayBounds(date);
    return this.prisma.appointment.count({
      where: { clinicId, vetId, status: 'SCHEDULED', scheduledFor: { gte: start, lt: end } },
    });
  }
}
