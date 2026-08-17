import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import { createAppointmentSchema, rescheduleAppointmentSchema, cancelAppointmentSchema } from '@breeyo/validators';
import {
  AppointmentSource,
  AppointmentStatus,
  BOOKING_HORIZON_DAYS,
  DEFAULT_SERVICE_DURATION_MINUTES,
  RECURRENCE_INTERVAL_DAYS,
  SOCKET_EVENTS,
  formatMinutesRange,
} from '@breeyo/types';
import type { AppointmentWithDetails, RecurrenceInterval, SlotOption } from '@breeyo/types';
import { AppointmentRepository } from './appointment.repository.js';
import { AvailabilityService } from './availability.service.js';
import { PatientRepository } from '../patient/patient.repository.js';
import { assertAppointmentTransition } from './appointment.state.js';
import { AuditEvent, writeAuditLog } from '../../lib/audit-log.js';
import { getTodayIST, addDaysIST, istMinutesOfDay } from '../../lib/ist-date.js';
import type {
  CreateAppointmentParams,
  RescheduleAppointmentParams,
  CancelAppointmentParams,
  UpdateAppointmentStatusParams,
  ListAppointmentsParams,
  BookingWarning,
} from './scheduling.types.js';

/** A plain `PrismaClient` or the interactive-transaction client D-34's advisory lock runs inside. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * `createAppointmentSchema` requires `serviceCatalogId` (a booking almost
 * always names a service), but D-02/the behavior spec explicitly allows it
 * to be omitted, in which case `DEFAULT_SERVICE_DURATION_MINUTES` applies.
 * `.partial({ serviceCatalogId: true })` widens just that one field to
 * optional at this call site, without touching the shared schema file that
 * mobile/web's request bodies are validated against everywhere else.
 */
const createAppointmentServiceSchema = createAppointmentSchema.partial({ serviceCatalogId: true });

function domainError(message: string, statusCode: number, code: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export class AppointmentService {
  /**
   * D-19: staff select the patient via the same owner/pet lookup Phase 3's
   * check-in flow already uses (`PatientRepository.findOwnerById`), not a
   * parallel query. Constructed from the same `prisma` handle already
   * injected below, so `AppointmentService`'s own constructor shape stays
   * exactly the four positional dependencies plans 08-09/08-10/08-11 expect,
   * plus the two optional hooks.
   */
  private readonly patientRepository: PatientRepository;

  constructor(
    private readonly repository: AppointmentRepository,
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaClient,
    private readonly io: Server | null = null,
    /**
     * A general "something about this appointment changed" seam -- NOT
     * single-purpose. Plan 08-10 wires this to cancel/re-upsert the
     * appointment's `WhatsAppReminderTask` rows (RESEARCH Pitfall 6); plan
     * 08-11's wiring ALSO uses this same hook to call the queue module's
     * `removeExpectedEntryForAppointment` (D-28). Failures are logged, never
     * thrown -- a reminder-task or queue-board side effect must never fail
     * the reschedule/cancel itself.
     */
    private readonly onRescheduled?: (appointmentId: string, clinicId: string) => Promise<void>,
    private readonly onCancelled?: (appointmentId: string, clinicId: string) => Promise<void>,
  ) {
    this.patientRepository = new PatientRepository(this.prisma);
  }

  /** RESEARCH Pattern 4: one range read serves both the mobile day agenda and the web week grid. */
  async listAppointments(params: ListAppointmentsParams): Promise<AppointmentWithDetails[]> {
    return this.repository.findInRange(params.clinicId, params.from, params.to, params.vetId);
  }

  /**
   * Plan 08-11: the single-appointment read `GET /scheduling/appointments/:id`
   * needs. Thin passthrough to `repository.findById`, which is already
   * `clinicId`-scoped and returns `null` on a cross-tenant/nonexistent id so
   * the controller can throw a 404, never a 403.
   */
  async getAppointment(clinicId: string, appointmentId: string): Promise<AppointmentWithDetails | null> {
    return this.repository.findById(clinicId, appointmentId);
  }

  /**
   * Composes the appointment-owned `existing` range (this service's own
   * repository query) with `AvailabilityService.getOfferableSlots`, which
   * deliberately has zero appointment-repository dependency of its own
   * (08-05-SUMMARY.md's documented seam).
   */
  async getOfferableSlots(params: {
    clinicId: string;
    userId: string;
    vetId: string;
    date: Date;
    serviceCatalogId?: string;
    durationMinutes?: number;
  }): Promise<SlotOption[]> {
    const durationMinutes = params.serviceCatalogId
      ? await this.resolveServiceDuration(params.clinicId, params.serviceCatalogId)
      : (params.durationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES);

    const existingRows = await this.repository.findForVetOnDate(params.clinicId, params.vetId, params.date);
    const existing = existingRows.map((row) => ({
      startMinutes: istMinutesOfDay(row.scheduledFor),
      endMinutes: istMinutesOfDay(row.scheduledFor) + row.durationMinutes,
    }));

    return this.availability.getOfferableSlots({
      clinicId: params.clinicId,
      userId: params.userId,
      vetId: params.vetId,
      date: params.date,
      durationMinutes,
      existing,
    });
  }

  /**
   * D-02/D-07/D-14/D-19/D-21/D-22/D-34: books one or more linked
   * appointments for one owner's pet(s) against real per-vet availability.
   */
  async createAppointment(
    params: CreateAppointmentParams,
  ): Promise<{ appointments: AppointmentWithDetails[]; warnings: BookingWarning[] }> {
    const parsed = createAppointmentServiceSchema.parse({
      ownerId: params.ownerId,
      petIds: params.petIds,
      vetId: params.vetId,
      serviceCatalogId: params.serviceCatalogId,
      scheduledFor: params.scheduledFor,
      notes: params.notes,
      allowDoubleBook: params.allowDoubleBook,
      recurrence: params.recurrence,
    });

    await this.resolveOwnerAndPets(params.clinicId, parsed.ownerId, parsed.petIds);
    const durationMinutes = await this.resolveServiceDuration(params.clinicId, parsed.serviceCatalogId);

    const occurrenceDates = this.buildOccurrenceDates(parsed.scheduledFor, parsed.recurrence);
    const requestedCount = occurrenceDates.length;
    const warnings: BookingWarning[] = [];
    const survivingDates: Date[] = [];
    let truncatedAtHorizon = false;

    // D-07/D-22: validate timing/availability/blocked-periods for every
    // occurrence up front (double-booking is deliberately NOT checked here
    // -- that happens per-occurrence inside the D-34 transaction below).
    // The first occurrence always throws loudly; occurrences 2..N are
    // skipped and reported rather than aborting a legitimately-bookable
    // series (D-31).
    for (let index = 0; index < occurrenceDates.length; index += 1) {
      const scheduledFor = occurrenceDates[index];
      try {
        await this.validateSlot({
          clinicId: params.clinicId,
          vetId: parsed.vetId,
          scheduledFor,
          durationMinutes,
          allowDoubleBook: parsed.allowDoubleBook,
          skipDoubleBookCheck: true,
        });
        survivingDates.push(scheduledFor);
      } catch (err) {
        if (index === 0) {
          throw err;
        }
        const error = err as Error & { code: string; message: string };
        if (error.code === 'BOOKING_HORIZON_EXCEEDED') {
          // Every later occurrence is further out still, so also beyond the
          // horizon -- stop here rather than repeating the same failure N times.
          truncatedAtHorizon = true;
          break;
        }
        warnings.push({
          code: 'RECURRENCE_OCCURRENCE_SKIPPED',
          message: `The ${scheduledFor.toISOString()} occurrence was skipped: ${error.message}`,
          data: { scheduledFor, reason: error.code },
        });
      }
    }

    if (truncatedAtHorizon) {
      warnings.push({
        code: 'RECURRENCE_TRUNCATED',
        message: `Only ${survivingDates.length} of ${requestedCount} repeats fit within ${BOOKING_HORIZON_DAYS} days. The rest were not created.`,
        data: { created: survivingDates.length, requested: requestedCount },
      });
    }

    const recurringSeriesId = survivingDates.length > 1 ? randomUUID() : null;

    // D-34: the double-booking check-then-create sequence runs inside one
    // `prisma.$transaction`, with a per-(vet, slot) `pg_advisory_xact_lock`
    // acquired FIRST -- this is what serializes two concurrent bookings for
    // the identical vet+slot so the second one is guaranteed to re-observe
    // the just-committed row (or block until it commits) before it can
    // silently race past the SLOT_DOUBLE_BOOKED check. Runs even for a
    // single occurrence, since the lock needs a transaction to attach to and
    // be released from automatically at commit.
    const appointments = await this.prisma.$transaction(async (tx) => {
      const created: AppointmentWithDetails[] = [];

      for (let index = 0; index < survivingDates.length; index += 1) {
        const scheduledFor = survivingDates[index];
        const lockKey = `${parsed.vetId}|${scheduledFor.toISOString()}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const doubleBookWarnings = await this.validateSlot({
          clinicId: params.clinicId,
          vetId: parsed.vetId,
          scheduledFor,
          durationMinutes,
          allowDoubleBook: parsed.allowDoubleBook,
          client: tx,
        });
        warnings.push(...doubleBookWarnings);

        const row = await this.repository.create(
          params.clinicId,
          {
            vetId: parsed.vetId,
            ownerId: parsed.ownerId,
            serviceCatalogId: parsed.serviceCatalogId ?? null,
            scheduledFor,
            durationMinutes,
            notes: parsed.notes ?? null,
            createdById: params.userId,
            // D-12 (plan 08-10): a WhatsApp-confirmed booking passes its own
            // source/originating booking-request id through; every plan
            // 08-07 call site is staff-driven and omits both, defaulting here.
            source: params.source ?? AppointmentSource.STAFF,
            recurringSeriesId,
            recurrenceIndex: recurringSeriesId ? index : null,
            whatsappBookingRequestId: params.whatsappBookingRequestId ?? null,
          },
          parsed.petIds,
          tx,
        );
        created.push(row);
      }

      return created;
    });

    const appointmentIds = appointments.map((appointment) => appointment.id);

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_CREATED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: {
        appointmentIds,
        vetId: parsed.vetId,
        scheduledFor: parsed.scheduledFor,
        petIds: parsed.petIds,
        recurringSeriesId,
      },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_CREATED, {
      appointments,
      createdBy: params.userId,
      timestamp: Date.now(),
    });

    return { appointments, warnings };
  }

  /**
   * The shared validation chain both `createAppointment` and
   * `rescheduleAppointment` call -- extracted once so it is never
   * duplicated between the two paths. Always runs the timing/availability/
   * blocked-period chain (throws on failure); the double-booking check
   * (D-14) can be skipped by the caller (`createAppointment`'s recurrence
   * pre-pass, which only wants to know whether an occurrence is bookable at
   * all, not whether it's double-booked yet) or run against a specific `Db`
   * client (D-34's transaction).
   *
   * `excludeAppointmentId` (D-14 self-conflict fix): `rescheduleAppointment`
   * passes the id of the appointment it is moving, since that appointment's
   * OWN still-current row is among the rows `findForVetOnDate` returns for
   * the vet/date being checked. Without excluding it, a reschedule that
   * keeps (or overlaps) the same time -- e.g. only changing the vet -- would
   * see its own row as a conflict against itself. `createAppointment` has no
   * existing row to exclude, so it never passes this.
   */
  private async validateSlot(params: {
    clinicId: string;
    vetId: string;
    scheduledFor: Date;
    durationMinutes: number;
    allowDoubleBook: boolean;
    skipDoubleBookCheck?: boolean;
    client?: Db;
    excludeAppointmentId?: string;
  }): Promise<BookingWarning[]> {
    const warnings: BookingWarning[] = [];
    const now = new Date();
    if (params.scheduledFor.getTime() < now.getTime()) {
      throw domainError('That time has already passed. Book a future slot.', 400, 'SLOT_IN_PAST');
    }

    const horizonEnd = addDaysIST(getTodayIST(), BOOKING_HORIZON_DAYS);
    if (params.scheduledFor.getTime() >= horizonEnd.getTime()) {
      throw domainError(
        `Appointments can only be booked up to ${BOOKING_HORIZON_DAYS} days ahead. Pick an earlier date.`,
        400,
        'BOOKING_HORIZON_EXCEEDED',
      );
    }

    const hours = await this.availability.resolveAvailabilityForDate({
      clinicId: params.clinicId,
      userId: '',
      vetId: params.vetId,
      date: params.scheduledFor,
    });
    if (!hours) {
      throw domainError('This vet is not working then. Pick another date or another vet.', 400, 'VET_NOT_AVAILABLE');
    }

    const startMinutes = istMinutesOfDay(params.scheduledFor);
    const endMinutes = startMinutes + params.durationMinutes;
    if (startMinutes < hours.openMinutes || endMinutes > hours.closeMinutes) {
      throw domainError('This vet is not working then. Pick another date or another vet.', 400, 'VET_NOT_AVAILABLE');
    }

    const blockedRanges = await this.availability.getBlockedRangesForDate(params.clinicId, params.vetId, params.scheduledFor);
    const blockedHit = blockedRanges.find((range) => startMinutes < range.endMinutes && endMinutes > range.startMinutes);
    if (blockedHit) {
      throw domainError(
        `Blocked from ${formatMinutesRange(blockedHit.startMinutes, blockedHit.endMinutes, params.scheduledFor)}. Pick another time.`,
        400,
        'SLOT_BLOCKED',
      );
    }

    if (params.skipDoubleBookCheck) {
      // Timing/availability/blocked-period checks passed; double-booking
      // status is not yet known (and not relevant to whether an occurrence
      // "survives" the recurrence pre-pass) -- `warnings` is still empty here.
      return warnings;
    }

    // D-14/D-34: never hard-block a double-booking -- warn and proceed when
    // `allowDoubleBook` is set, otherwise reject.
    const existing = await this.repository.findForVetOnDate(params.clinicId, params.vetId, params.scheduledFor, params.client);
    const conflict = existing.find((entry) => {
      if (params.excludeAppointmentId && entry.id === params.excludeAppointmentId) {
        // The appointment being rescheduled is still SCHEDULED under its OLD
        // slot until this same call's `repository.update` runs -- its own
        // still-current row must never count as a conflict against itself.
        return false;
      }
      const entryStart = istMinutesOfDay(entry.scheduledFor);
      const entryEnd = entryStart + entry.durationMinutes;
      return startMinutes < entryEnd && endMinutes > entryStart;
    });

    if (!conflict) {
      return warnings;
    }

    const message = `This vet already has another appointment at ${formatMinutesRange(startMinutes, endMinutes, params.scheduledFor)}. You can still book this slot.`;
    if (!params.allowDoubleBook) {
      throw domainError(message, 409, 'SLOT_DOUBLE_BOOKED');
    }

    warnings.push({ code: 'DOUBLE_BOOKED', message, data: { scheduledFor: params.scheduledFor } });
    return warnings;
  }

  /** D-19: reuse Phase 3's owner/pet lookup path, never a parallel query. */
  private async resolveOwnerAndPets(clinicId: string, ownerId: string, petIds: string[]): Promise<void> {
    const owner = await this.patientRepository.findOwnerById(clinicId, ownerId);
    if (!owner) {
      throw domainError('Owner not found', 404, 'OWNER_NOT_FOUND');
    }

    for (const petId of petIds) {
      const ownedPet = (owner.pets as Array<{ id: string }>).find((pet) => pet.id === petId);
      if (ownedPet) {
        continue;
      }

      // T-08-29: the clinic-tenancy check runs first, so PET_OWNER_MISMATCH
      // is only ever reachable for a pet already proven to exist in the
      // caller's own clinic -- a cross-tenant miss stays a 404 and never
      // discloses that a pet with this id exists anywhere at all.
      const petInClinic = await this.prisma.pet.findFirst({
        where: { id: petId, clinicId },
        select: { id: true },
      });
      if (!petInClinic) {
        throw domainError('Pet not found', 404, 'PET_NOT_FOUND');
      }
      throw domainError('This pet belongs to a different owner.', 400, 'PET_OWNER_MISMATCH');
    }
  }

  /** D-02: resolved once at booking time and snapshotted onto every created row. */
  private async resolveServiceDuration(clinicId: string, serviceCatalogId?: string): Promise<number> {
    if (!serviceCatalogId) {
      return DEFAULT_SERVICE_DURATION_MINUTES;
    }

    const service = await this.prisma.serviceCatalog.findFirst({
      where: { id: serviceCatalogId, clinicId },
      select: { durationMinutes: true },
    });
    if (!service) {
      throw domainError('Service not found', 404, 'SERVICE_NOT_FOUND');
    }

    return service.durationMinutes;
  }

  /** D-22: a bounded, explicit loop -- never a recurrence-rule-language parser. */
  private buildOccurrenceDates(
    scheduledFor: Date,
    recurrence?: { interval: RecurrenceInterval; occurrences: number },
  ): Date[] {
    if (!recurrence) {
      return [scheduledFor];
    }

    const stepDays = RECURRENCE_INTERVAL_DAYS[recurrence.interval];
    const dates: Date[] = [];
    for (let i = 0; i < recurrence.occurrences; i += 1) {
      dates.push(addDaysIST(scheduledFor, stepDays * i));
    }
    return dates;
  }

  /**
   * D-11/D-15/D-20/D-22/D-31: revalidates the new slot through the exact
   * same chain `createAppointment` uses, refuses to move an appointment
   * that is no longer in `SCHEDULED` (a `CHECKED_IN` patient is already in
   * the queue -- moving their appointment out from under them would
   * desynchronise the two, and the terminal states are not movable at
   * all), and resets every sweep marker so no stale reminder fires and no
   * due-appointment pass is skipped (RESEARCH Pitfall 6).
   */
  async rescheduleAppointment(
    params: RescheduleAppointmentParams,
  ): Promise<{ appointment: AppointmentWithDetails; warnings: BookingWarning[] }> {
    const parsed = rescheduleAppointmentSchema.parse({
      scheduledFor: params.scheduledFor,
      vetId: params.vetId,
      allowDoubleBook: params.allowDoubleBook,
      applyToSeries: params.applyToSeries,
    });

    const current = await this.repository.findById(params.clinicId, params.appointmentId);
    if (!current) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    if (current.status !== AppointmentStatus.SCHEDULED) {
      throw domainError(
        'This appointment can no longer be rescheduled.',
        409,
        'APPOINTMENT_NOT_RESCHEDULABLE',
      );
    }

    const newVetId = parsed.vetId ?? current.vetId;

    const warnings = await this.validateSlot({
      clinicId: params.clinicId,
      vetId: newVetId,
      scheduledFor: parsed.scheduledFor,
      durationMinutes: current.durationMinutes,
      allowDoubleBook: parsed.allowDoubleBook,
      excludeAppointmentId: params.appointmentId,
    });

    // D-31: once a single occurrence is deliberately moved off its series'
    // regular cadence, it is no longer a "member" of that series for a
    // later Cancel All or series-wide reschedule -- detach it in the same
    // update call rather than a second write.
    const detachFromSeries = !parsed.applyToSeries && Boolean(current.recurringSeriesId);

    const updateData: Record<string, unknown> = {
      scheduledFor: parsed.scheduledFor,
      vetId: newVetId,
      // RESEARCH Pitfall 6: these three markers are keyed to the OLD
      // scheduledFor. Leaving them set would make the sweep skip the
      // appointment's new due moment (queueEntryCreatedAt stays non-null),
      // leave a no-show flip stuck to the old time (noShowFlippedAt), or let
      // a stale "starting soon" push stand (startingSoonNotifiedAt) -- reset
      // all three on every reschedule.
      queueEntryCreatedAt: null,
      noShowFlippedAt: null,
      startingSoonNotifiedAt: null,
      ...(detachFromSeries ? { recurringSeriesId: null } : {}),
    };

    const updated = await this.repository.update(params.clinicId, params.appointmentId, updateData);
    if (!updated) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    await this.runChangeHook(this.onRescheduled, params.appointmentId, params.clinicId);

    let seriesWarnings: BookingWarning[] = [];
    if (parsed.applyToSeries && current.recurringSeriesId) {
      seriesWarnings = await this.rescheduleSeries(
        params.clinicId,
        current,
        parsed.scheduledFor,
        newVetId,
        parsed.allowDoubleBook,
      );
    }

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_RESCHEDULED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: {
        appointmentId: params.appointmentId,
        oldScheduledFor: current.scheduledFor,
        newScheduledFor: parsed.scheduledFor,
      },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_UPDATED, {
      appointment: updated,
      updatedBy: params.userId,
      timestamp: Date.now(),
    });

    return { appointment: updated, warnings: [...warnings, ...seriesWarnings] };
  }

  /**
   * D-22/D-31: applies the same weekday-and-time delta to every other
   * occurrence in the series whose `scheduledFor` is still in the future,
   * revalidating each and skipping (never aborting) an occurrence that no
   * longer fits, exactly like `createAppointment`'s recurrence pre-pass.
   */
  private async rescheduleSeries(
    clinicId: string,
    anchor: AppointmentWithDetails,
    newScheduledFor: Date,
    vetId: string,
    allowDoubleBook: boolean,
  ): Promise<BookingWarning[]> {
    const deltaMs = newScheduledFor.getTime() - anchor.scheduledFor.getTime();
    const series = await this.repository.findBySeries(clinicId, anchor.recurringSeriesId as string);
    const warnings: BookingWarning[] = [];
    const now = new Date();

    for (const occurrence of series) {
      if (occurrence.id === anchor.id) {
        continue;
      }
      if (occurrence.scheduledFor.getTime() < now.getTime()) {
        continue;
      }

      const newDate = new Date(occurrence.scheduledFor.getTime() + deltaMs);

      try {
        const occurrenceWarnings = await this.validateSlot({
          clinicId,
          vetId,
          scheduledFor: newDate,
          durationMinutes: occurrence.durationMinutes,
          allowDoubleBook,
          // Same self-conflict fix as the anchor reschedule above: this
          // occurrence's own still-current row is among the rows
          // `findForVetOnDate` returns for its vet/date.
          excludeAppointmentId: occurrence.id,
        });
        await this.repository.update(clinicId, occurrence.id, {
          scheduledFor: newDate,
          vetId,
          queueEntryCreatedAt: null,
          noShowFlippedAt: null,
          startingSoonNotifiedAt: null,
        });
        warnings.push(...occurrenceWarnings);
      } catch (err) {
        const error = err as Error & { code: string; message: string };
        warnings.push({
          code: 'RECURRENCE_OCCURRENCE_SKIPPED',
          message: `Series occurrence ${occurrence.id} was not moved: ${error.message}`,
          data: { appointmentId: occurrence.id, reason: error.code },
        });
      }
    }

    return warnings;
  }

  /**
   * D-15/D-20/D-22/D-28/D-31: cancels one appointment, or (with
   * `scope: 'SERIES'`) every other series member that is currently `{
   * status: 'SCHEDULED' }` -- never one already `CHECKED_IN`, `COMPLETED`,
   * `CANCELLED` or `NO_SHOW`, regardless of whether its own date is in the
   * future or past. A "Cancel All" must never silently touch a visit that
   * has already started, finished, or was separately resolved.
   */
  async cancelAppointment(params: CancelAppointmentParams): Promise<{ appointment: AppointmentWithDetails }> {
    const parsed = cancelAppointmentSchema.parse({ reason: params.reason, scope: params.scope });

    const current = await this.repository.findById(params.clinicId, params.appointmentId);
    if (!current) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    assertAppointmentTransition(current.status, AppointmentStatus.CANCELLED);

    const cancelData = {
      status: AppointmentStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: params.userId,
      cancelReason: parsed.reason ?? null,
    };

    const updated = await this.repository.update(params.clinicId, params.appointmentId, cancelData);
    if (!updated) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    await this.runChangeHook(this.onCancelled, params.appointmentId, params.clinicId);

    const cancelledIds = [params.appointmentId];

    if (parsed.scope === 'SERIES' && current.recurringSeriesId) {
      const series = await this.repository.findBySeries(params.clinicId, current.recurringSeriesId);

      for (const occurrence of series) {
        if (occurrence.id === params.appointmentId) {
          continue;
        }

        // D-31: only a member currently `{ status: 'SCHEDULED' }` is
        // affected -- CHECKED_IN/COMPLETED/CANCELLED/NO_SHOW members are
        // left entirely untouched, no matter their date.
        if (occurrence.status !== AppointmentStatus.SCHEDULED) {
          continue;
        }

        await this.repository.update(params.clinicId, occurrence.id, cancelData);
        await this.runChangeHook(this.onCancelled, occurrence.id, params.clinicId);
        cancelledIds.push(occurrence.id);
      }
    }

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_CANCELLED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { appointmentId: params.appointmentId, scope: parsed.scope, cancelledIds },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_CANCELLED, {
      appointmentId: params.appointmentId,
      cancelledIds,
      timestamp: Date.now(),
    });

    return { appointment: updated };
  }

  /**
   * D-20: transitions SCHEDULED -> CHECKED_IN and stamps `checkedInAt`.
   * This method does NOT create or transition any QueueEntry -- plan
   * 08-09's handoff service owns that side and calls this method as part of
   * its own flow, never the other way around.
   */
  async checkInAppointment(params: UpdateAppointmentStatusParams): Promise<AppointmentWithDetails> {
    const current = await this.repository.findById(params.clinicId, params.appointmentId);
    if (!current) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    assertAppointmentTransition(current.status, AppointmentStatus.CHECKED_IN);

    const updated = await this.repository.update(params.clinicId, params.appointmentId, {
      status: AppointmentStatus.CHECKED_IN,
      checkedInAt: new Date(),
    });
    if (!updated) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_CHECKED_IN, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { appointmentId: params.appointmentId },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_UPDATED, {
      appointment: updated,
      updatedBy: params.userId,
      timestamp: Date.now(),
    });

    return updated;
  }

  /** D-20: transitions CHECKED_IN -> COMPLETED and stamps `completedAt`. */
  async completeAppointment(params: UpdateAppointmentStatusParams): Promise<AppointmentWithDetails> {
    const current = await this.repository.findById(params.clinicId, params.appointmentId);
    if (!current) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    assertAppointmentTransition(current.status, AppointmentStatus.COMPLETED);

    const updated = await this.repository.update(params.clinicId, params.appointmentId, {
      status: AppointmentStatus.COMPLETED,
      completedAt: new Date(),
    });
    if (!updated) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_COMPLETED, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { appointmentId: params.appointmentId },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_UPDATED, {
      appointment: updated,
      updatedBy: params.userId,
      timestamp: Date.now(),
    });

    return updated;
  }

  /**
   * D-09/D-20: flips to NO_SHOW via the repository's dedicated marker
   * mutator. Callable both from plan 08-09's sweep (an expired EXPECTED
   * grace window) and from a direct staff action.
   */
  async markNoShow(params: UpdateAppointmentStatusParams): Promise<AppointmentWithDetails> {
    const current = await this.repository.findById(params.clinicId, params.appointmentId);
    if (!current) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    assertAppointmentTransition(current.status, AppointmentStatus.NO_SHOW);

    const updated = await this.repository.markNoShowFlipped(params.clinicId, params.appointmentId, new Date());
    if (!updated) {
      throw domainError('Appointment not found', 404, 'APPOINTMENT_NOT_FOUND');
    }

    await writeAuditLog(this.prisma, AuditEvent.APPOINTMENT_NO_SHOW, {
      userId: params.userId,
      clinicId: params.clinicId,
      metadata: { appointmentId: params.appointmentId },
    });

    this.broadcast(params.clinicId, SOCKET_EVENTS.APPOINTMENT_UPDATED, {
      appointment: updated,
      updatedBy: params.userId,
      timestamp: Date.now(),
    });

    return updated;
  }

  /**
   * Runs an optional change hook without letting its failure fail the
   * lifecycle mutation that triggered it -- a reminder-task or queue-board
   * side effect must never take down a reschedule or cancel.
   */
  private async runChangeHook(
    hook: ((appointmentId: string, clinicId: string) => Promise<void>) | undefined,
    appointmentId: string,
    clinicId: string,
  ): Promise<void> {
    if (!hook) {
      return;
    }
    try {
      await hook(appointmentId, clinicId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AppointmentService change hook failed', err);
    }
  }

  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
