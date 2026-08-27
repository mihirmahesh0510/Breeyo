import type { PrismaClient, BlockedPeriodReason } from '@prisma/client';
import { istDateOnly, istDayBounds } from '../../lib/ist-date.js';

/**
 * `clinicId`-scoped CRUD for the three availability tables (weekly template,
 * per-date override, blocked period) plus the clinic vet list.
 *
 * PATTERNS § Multi-tenancy: `clinicId` is always the first parameter and is
 * always present in the `where`; there is no DB-level RLS on these tables
 * (plan 08-03 deliberately left them without it), so the explicit filter here
 * is the only tenancy boundary. `fastify.prisma` (a plain `PrismaClient`) is
 * injected here, not the tenant-scoped request handle.
 */
export class AvailabilityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getTemplateForVet(clinicId: string, vetId: string) {
    return this.prisma.vetAvailabilityTemplate.findMany({
      where: { clinicId, vetId },
      orderBy: { weekday: 'asc' },
    });
  }

  async getTemplateDay(clinicId: string, vetId: string, weekday: number) {
    return this.prisma.vetAvailabilityTemplate.findFirst({
      where: { clinicId, vetId, weekday },
    });
  }

  /**
   * Upserts each of the seven weekday rows on the `[clinicId, vetId, weekday]`
   * unique key inside one transaction. Upsert rather than delete-then-insert
   * so a concurrent read never observes a vet with zero configured days.
   */
  async replaceTemplate(
    clinicId: string,
    vetId: string,
    days: Array<{ weekday: number; isClosed: boolean; openMinutes: number | null; closeMinutes: number | null }>,
  ) {
    return this.prisma.$transaction(
      days.map((day) =>
        this.prisma.vetAvailabilityTemplate.upsert({
          where: { clinicId_vetId_weekday: { clinicId, vetId, weekday: day.weekday } },
          create: {
            clinicId,
            vetId,
            weekday: day.weekday,
            isClosed: day.isClosed,
            openMinutes: day.openMinutes,
            closeMinutes: day.closeMinutes,
          },
          update: {
            isClosed: day.isClosed,
            openMinutes: day.openMinutes,
            closeMinutes: day.closeMinutes,
          },
        }),
      ),
    );
  }

  async getOverride(clinicId: string, vetId: string, date: Date) {
    return this.prisma.availabilityOverride.findFirst({
      where: { clinicId, vetId, date: istDateOnly(date) },
    });
  }

  /**
   * Fetches overrides across a date range for the week grid; `vetId` is
   * optional so the calendar can fetch every vet's overrides at once.
   */
  async getOverridesInRange(clinicId: string, from: Date, to: Date, vetId?: string) {
    return this.prisma.availabilityOverride.findMany({
      where: {
        clinicId,
        ...(vetId ? { vetId } : {}),
        date: { gte: istDateOnly(from), lt: istDayBounds(to).end },
      },
      orderBy: { date: 'asc' },
    });
  }

  async upsertOverride(
    clinicId: string,
    vetId: string,
    date: Date,
    data: { isClosed: boolean; openMinutes: number | null; closeMinutes: number | null; reason: string | null },
  ) {
    const day = istDateOnly(date);
    return this.prisma.availabilityOverride.upsert({
      where: { clinicId_vetId_date: { clinicId, vetId, date: day } },
      create: {
        clinicId,
        vetId,
        date: day,
        isClosed: data.isClosed,
        openMinutes: data.openMinutes,
        closeMinutes: data.closeMinutes,
        reason: data.reason,
      },
      update: {
        isClosed: data.isClosed,
        openMinutes: data.openMinutes,
        closeMinutes: data.closeMinutes,
        reason: data.reason,
      },
    });
  }

  async deleteOverride(clinicId: string, vetId: string, date: Date) {
    const result = await this.prisma.availabilityOverride.deleteMany({
      where: { clinicId, vetId, date: istDateOnly(date) },
    });
    return result.count;
  }

  async getBlockedPeriods(clinicId: string, vetId: string, date: Date) {
    return this.prisma.blockedPeriod.findMany({
      where: { clinicId, vetId, date: istDateOnly(date) },
      orderBy: { startMinutes: 'asc' },
    });
  }

  /**
   * Blocked periods across a date range for the calendar surfaces, which
   * render blocked bands across a whole week; `vetId` optional as above.
   */
  async getBlockedPeriodsInRange(clinicId: string, from: Date, to: Date, vetId?: string) {
    return this.prisma.blockedPeriod.findMany({
      where: {
        clinicId,
        ...(vetId ? { vetId } : {}),
        date: { gte: istDateOnly(from), lt: istDayBounds(to).end },
      },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }],
    });
  }

  async createBlockedPeriod(
    clinicId: string,
    data: {
      vetId: string;
      date: Date;
      startMinutes: number;
      endMinutes: number;
      reason: BlockedPeriodReason;
      reasonText: string | null;
      createdById: string;
    },
  ) {
    return this.prisma.blockedPeriod.create({
      data: {
        clinicId,
        vetId: data.vetId,
        date: istDateOnly(data.date),
        startMinutes: data.startMinutes,
        endMinutes: data.endMinutes,
        reason: data.reason,
        reasonText: data.reasonText,
        createdById: data.createdById,
      },
    });
  }

  /**
   * Scoped on both `id` and `clinicId` so a cross-tenant id deletes nothing;
   * returns the delete count so the service can throw 404 on zero.
   */
  async deleteBlockedPeriod(clinicId: string, id: string) {
    const result = await this.prisma.blockedPeriod.deleteMany({
      where: { id, clinicId },
    });
    return result.count;
  }

  /**
   * D-05 overlap validation: does any other blocked period for this vet on
   * this date overlap `[startMinutes, endMinutes)`. `excludeId` lets an
   * update check overlap against every *other* blocked period.
   */
  async findOverlappingBlockedPeriod(
    clinicId: string,
    vetId: string,
    date: Date,
    startMinutes: number,
    endMinutes: number,
    excludeId?: string,
  ) {
    return this.prisma.blockedPeriod.findFirst({
      where: {
        clinicId,
        vetId,
        date: istDateOnly(date),
        startMinutes: { lt: endMinutes },
        endMinutes: { gt: startMinutes },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  /**
   * The clinic's members holding a vet-capable role (i.e. `EDIT_EMR`, seeded
   * onto Admin and Clinician only -- `apps/api/prisma/seed.ts`), `id`-sorted.
   * `vetColorForId` (`packages/ui/src/theme/vetColors.ts`) assigns hues by
   * index into an `id`-sorted list, so mobile and web must receive the same
   * order.
   */
  async listClinicVets(clinicId: string): Promise<Array<{ id: string; name: string }>> {
    const users = await this.prisma.user.findMany({
      where: {
        clinicMemberships: {
          some: {
            clinicId,
            isActive: true,
            roles: {
              some: {
                role: {
                  rolePermissions: {
                    some: { permission: { code: 'EDIT_EMR' } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      select: { id: true, fullName: true },
    });

    return users.map((u) => ({ id: u.id, name: u.fullName }));
  }

  /**
   * D-36: the clinic's currently-active Admin-role member ids -- used by
   * `ClinicVetRosterProvider` to exclude Admins from the on-duty escalation
   * roster even though `listClinicVets` above deliberately includes them
   * (Admin is vet-capable for `EDIT_EMR`/color-assignment purposes, but
   * D-36 rules out an Admin ever being an escalation hand-off target).
   */
  async listAdminUserIds(clinicId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        clinicMemberships: {
          some: {
            clinicId,
            isActive: true,
            roles: { some: { role: { name: 'Admin' } } },
          },
        },
      },
      select: { id: true },
    });

    return admins.map((admin) => admin.id);
  }
}
