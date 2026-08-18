import type { PrismaClient, BlockedPeriodReason as PrismaBlockedPeriodReason } from '@prisma/client';
import type { Server } from 'socket.io';
import { upsertAvailabilityTemplateSchema, upsertAvailabilityOverrideSchema } from '@breeyo/validators';
import { BlockedPeriodReason, BOOKING_HORIZON_DAYS, SOCKET_EVENTS } from '@breeyo/types';
import type { ResolvedDayHours, SlotOption } from '@breeyo/types';
import { AvailabilityRepository } from './availability.repository.js';
import { AuditEvent, writeAuditLog } from '../../lib/audit-log.js';
import { getTodayIST, addDaysIST, weekdayIST, istDayBounds, istMinutesOfDay } from '../../lib/ist-date.js';
import { generateSlotsForVetDay, resolveDayHours, subtractBlockedRanges } from './slot.service.js';
import type {
  UpsertAvailabilityTemplateParams,
  UpsertAvailabilityOverrideParams,
  CreateBlockedPeriodParams,
  RemoveBlockedPeriodParams,
  ResolveAvailabilityParams,
  GetOfferableSlotsParams,
} from './scheduling.types.js';

function domainError(message: string, statusCode: number, code: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export class AvailabilityService {
  constructor(
    private readonly repository: AvailabilityRepository,
    private readonly prisma: PrismaClient,
    private readonly io: Server | null = null,
  ) {}

  /**
   * D-01: fetches the weekday template row and any per-date override in
   * parallel and hands both to the pure `resolveDayHours` -- all precedence
   * logic lives there, this method only fetches.
   */
  async resolveAvailabilityForDate(params: ResolveAvailabilityParams): Promise<ResolvedDayHours | null> {
    const weekday = weekdayIST(params.date);

    const [templateDay, override] = await Promise.all([
      this.repository.getTemplateDay(params.clinicId, params.vetId, weekday),
      this.repository.getOverride(params.clinicId, params.vetId, params.date),
    ]);

    return resolveDayHours(templateDay, override);
  }

  /**
   * Plan 08-11: `GET /scheduling/availability/:vetId/template` needs the raw
   * weekly template rows (not the merged/resolved-for-one-day shape
   * `resolveAvailabilityForDate` returns). Thin passthrough to the
   * repository, which is already `clinicId`-scoped.
   */
  async getTemplateForVet(clinicId: string, vetId: string) {
    return this.repository.getTemplateForVet(clinicId, vetId);
  }

  /**
   * Plan 08-11: `GET /scheduling/blocked-periods` needs the full blocked-period
   * rows (id, reason, reasonText, etc.), not the merged minute-range shape
   * `getBlockedRangesForDate` returns for slot generation. Thin passthrough
   * to the repository, which is already `clinicId`-scoped.
   */
  async getBlockedPeriods(clinicId: string, vetId: string, date: Date) {
    return this.repository.getBlockedPeriods(clinicId, vetId, date);
  }

  async getBlockedRangesForDate(
    clinicId: string,
    vetId: string,
    date: Date,
  ): Promise<Array<{ startMinutes: number; endMinutes: number }>> {
    const rows = await this.repository.getBlockedPeriods(clinicId, vetId, date);
    return subtractBlockedRanges(
      rows.map((row) => ({ startMinutes: row.startMinutes, endMinutes: row.endMinutes })),
    );
  }

  /**
   * Composes resolved hours, blocked ranges and the caller-injected
   * already-booked `existing` ranges through the pure slot engine.
   * Deliberately takes `existing` as an argument instead of querying
   * appointments here -- this keeps AvailabilityService free of any
   * appointment-repository dependency; plan 08-07's AppointmentService
   * supplies `existing` from its own repository.
   */
  async getOfferableSlots(params: GetOfferableSlotsParams): Promise<SlotOption[]> {
    const hours = await this.resolveAvailabilityForDate({
      clinicId: params.clinicId,
      userId: params.userId,
      vetId: params.vetId,
      date: params.date,
    });
    const blocked = await this.getBlockedRangesForDate(params.clinicId, params.vetId, params.date);

    return generateSlotsForVetDay(hours, blocked, params.existing, params.durationMinutes);
  }

  /**
   * T-08-17: a `vetId` belonging to another clinic must never be
   * configurable. Cross-tenant miss is a 404 (never 403), so the id's
   * existence is not disclosed.
   */
  private async assertVetInClinic(clinicId: string, vetId: string): Promise<void> {
    const member = await this.prisma.clinicMember.findFirst({
      where: { clinicId, userId: vetId, isActive: true },
      select: { id: true },
    });

    if (!member) {
      throw domainError('Vet not found in this clinic', 404, 'VET_NOT_FOUND');
    }
  }

  async replaceWeeklyTemplate(params: UpsertAvailabilityTemplateParams) {
    const parsed = upsertAvailabilityTemplateSchema.parse({
      vetId: params.vetId,
      days: params.days,
    });

    await this.assertVetInClinic(params.clinicId, parsed.vetId);

    const template = await this.repository.replaceTemplate(params.clinicId, parsed.vetId, parsed.days);

    await writeAuditLog(this.prisma, AuditEvent.AVAILABILITY_UPDATED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { vetId: parsed.vetId, days: parsed.days },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.AVAILABILITY_UPDATED, {
      vetId: parsed.vetId,
      timestamp: Date.now(),
    });

    // D-30: warning-only count of SCHEDULED appointments, within the
    // booking horizon, that now fall outside the just-saved template. Never
    // blocks the write -- a date with its own override is not re-checked
    // here, since a per-date override already takes precedence over the
    // template for that date (D-01).
    const now = new Date();
    const horizonStart = getTodayIST(now);
    const horizonEnd = addDaysIST(horizonStart, BOOKING_HORIZON_DAYS);

    const scheduledRows = await this.prisma.appointment.findMany({
      where: {
        clinicId: params.clinicId,
        vetId: parsed.vetId,
        status: 'SCHEDULED',
        scheduledFor: { gte: horizonStart, lt: horizonEnd },
      },
      select: { scheduledFor: true, durationMinutes: true },
    });

    let affectedAppointmentCount = 0;
    for (const row of scheduledRows) {
      const rowWeekday = weekdayIST(row.scheduledFor);
      const newDay = parsed.days.find((day) => day.weekday === rowWeekday);
      if (!newDay) {
        continue;
      }

      const minutesOfDay = istMinutesOfDay(row.scheduledFor);
      const fallsOutside =
        newDay.isClosed ||
        minutesOfDay < (newDay.openMinutes as number) ||
        minutesOfDay + row.durationMinutes > (newDay.closeMinutes as number);

      if (fallsOutside) {
        affectedAppointmentCount += 1;
      }
    }

    return { template, affectedAppointmentCount };
  }

  async upsertDateOverride(params: UpsertAvailabilityOverrideParams) {
    const parsed = upsertAvailabilityOverrideSchema.parse({
      vetId: params.vetId,
      date: params.date,
      isClosed: params.isClosed,
      openMinutes: params.openMinutes,
      closeMinutes: params.closeMinutes,
      reason: params.reason,
    });

    await this.assertVetInClinic(params.clinicId, parsed.vetId);

    // D-23/UI-SPEC destructive confirmation: marking a day off (or shrinking
    // it) never blocks the write even when SCHEDULED appointments already
    // exist that day -- the client renders the returned count and asks staff
    // to move or cancel them first.
    const override = await this.repository.upsertOverride(params.clinicId, parsed.vetId, parsed.date, {
      isClosed: parsed.isClosed,
      openMinutes: parsed.openMinutes ?? null,
      closeMinutes: parsed.closeMinutes ?? null,
      reason: parsed.reason ?? null,
    });

    await writeAuditLog(this.prisma, AuditEvent.AVAILABILITY_UPDATED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { vetId: parsed.vetId, date: parsed.date, isClosed: parsed.isClosed },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.AVAILABILITY_UPDATED, {
      vetId: parsed.vetId,
      timestamp: Date.now(),
    });

    const { start, end } = istDayBounds(parsed.date);
    const affectedAppointmentCount = await this.prisma.appointment.count({
      where: {
        clinicId: params.clinicId,
        vetId: parsed.vetId,
        status: 'SCHEDULED',
        scheduledFor: { gte: start, lt: end },
      },
    });

    return { override, affectedAppointmentCount };
  }

  async createBlockedPeriod(params: CreateBlockedPeriodParams) {
    if (params.endMinutes <= params.startMinutes) {
      throw domainError('End time must be after start time.', 400, 'INVALID_TIME_RANGE');
    }

    if (
      params.reason === BlockedPeriodReason.OTHER &&
      (!params.reasonText || params.reasonText.trim().length === 0)
    ) {
      throw domainError('Add a short reason.', 400, 'REASON_TEXT_REQUIRED');
    }

    const overlap = await this.repository.findOverlappingBlockedPeriod(
      params.clinicId,
      params.vetId,
      params.date,
      params.startMinutes,
      params.endMinutes,
    );
    if (overlap) {
      throw domainError('This overlaps an existing blocked period. Adjust the times.', 409, 'BLOCKED_PERIOD_OVERLAP');
    }

    const blockedPeriod = await this.repository.createBlockedPeriod(params.clinicId, {
      vetId: params.vetId,
      date: params.date,
      startMinutes: params.startMinutes,
      endMinutes: params.endMinutes,
      reason: params.reason as unknown as PrismaBlockedPeriodReason,
      reasonText: params.reasonText ?? null,
      createdById: params.userId,
    });

    await writeAuditLog(this.prisma, AuditEvent.BLOCKED_PERIOD_ADDED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: {
        vetId: params.vetId,
        date: params.date,
        startMinutes: params.startMinutes,
        endMinutes: params.endMinutes,
        reason: params.reason,
      },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.AVAILABILITY_UPDATED, {
      vetId: params.vetId,
      timestamp: Date.now(),
    });

    // D-30: non-blocking count of SCHEDULED appointments that already fall
    // inside the new blocked window -- this never rejects the create above,
    // it is returned alongside it so the client can warn staff.
    const { start: dayStart, end: dayEnd } = istDayBounds(params.date);
    const dayRows = await this.prisma.appointment.findMany({
      where: {
        clinicId: params.clinicId,
        vetId: params.vetId,
        status: 'SCHEDULED',
        scheduledFor: { gte: dayStart, lt: dayEnd },
      },
      select: { scheduledFor: true, durationMinutes: true },
    });

    const affectedAppointmentCount = dayRows.filter((row) => {
      const minutesOfDay = istMinutesOfDay(row.scheduledFor);
      return minutesOfDay < params.endMinutes && minutesOfDay + row.durationMinutes > params.startMinutes;
    }).length;

    return { blockedPeriod, affectedAppointmentCount };
  }

  async removeBlockedPeriod(params: RemoveBlockedPeriodParams): Promise<void> {
    const deletedCount = await this.repository.deleteBlockedPeriod(params.clinicId, params.blockedPeriodId);

    if (deletedCount === 0) {
      throw domainError('Blocked period not found', 404, 'BLOCKED_PERIOD_NOT_FOUND');
    }

    await writeAuditLog(this.prisma, AuditEvent.BLOCKED_PERIOD_REMOVED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { blockedPeriodId: params.blockedPeriodId },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.AVAILABILITY_UPDATED, {
      blockedPeriodId: params.blockedPeriodId,
      timestamp: Date.now(),
    });
  }

  /** D-23: the id-sorted vet list both surfaces' vet filter and colour assignment depend on. */
  async listVets(clinicId: string) {
    return this.repository.listClinicVets(clinicId);
  }

  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
