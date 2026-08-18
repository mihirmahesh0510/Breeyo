import { z } from 'zod';
import {
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  appointmentStatusUpdateSchema,
  appointmentRangeQuerySchema,
  slotQuerySchema,
  upsertAvailabilityTemplateSchema,
  upsertAvailabilityOverrideSchema,
  createBlockedPeriodSchema,
} from '@breeyo/validators';

/**
 * Mirrors `queue.schema.ts`'s pattern of re-exporting a shared
 * `@breeyo/validators` schema under this module's own `*BodySchema`/
 * `*QuerySchema` naming convention, extending only where an API-only field
 * is needed.
 *
 * None of these schemas declare a `clinicId` field (grep-gated by Task 1's
 * own acceptance criteria) -- `clinicId` is never accepted from a client and
 * always comes from `request.user.activeClinicId` in the controller.
 */

/**
 * D-02: `createAppointmentSchema` (as written by plan 08-01) requires
 * `serviceCatalogId`, but `AppointmentService.createAppointment` explicitly
 * supports omitting it (falling back to `DEFAULT_SERVICE_DURATION_MINUTES`)
 * via its own `createAppointmentSchema.partial({ serviceCatalogId: true })`
 * call site in `appointment.service.ts`. Re-exporting the strict schema
 * as-is here would reject exactly the request the service is built to
 * accept before it ever reaches the service -- widen the same one field the
 * same way, at the HTTP boundary, so the two validation layers agree.
 */
export const createAppointmentBodySchema = createAppointmentSchema.partial({ serviceCatalogId: true });

export { rescheduleAppointmentSchema as rescheduleAppointmentBodySchema };
export { cancelAppointmentSchema as cancelAppointmentBodySchema };
export { appointmentStatusUpdateSchema as appointmentStatusUpdateBodySchema };
export { appointmentRangeQuerySchema };
export { slotQuerySchema };
export { upsertAvailabilityTemplateSchema as upsertAvailabilityTemplateBodySchema };
export { upsertAvailabilityOverrideSchema as upsertAvailabilityOverrideBodySchema };
export { createBlockedPeriodSchema as createBlockedPeriodBodySchema };

/** Params with appointmentId */
export const appointmentParamsSchema = z.object({
  appointmentId: z.string().uuid(),
});

/** Params with blockedPeriodId */
export const blockedPeriodParamsSchema = z.object({
  blockedPeriodId: z.string().uuid(),
});

/** Params with vetId -- the URL-nested vet identity is authoritative over
 * any `vetId` field also present in a PUT body (both `upsertAvailability*`
 * validators require one, since they are also used standalone). */
export const availabilityVetParamsSchema = z.object({
  vetId: z.string().uuid(),
});

/** Query for GET /scheduling/availability/resolved -- `vetId` optional so
 * the calendar can ask for every vet's resolved hours on a date in one call. */
export const availabilityDateQuerySchema = z.object({
  date: z.coerce.date(),
  vetId: z.string().uuid().optional(),
});

/** Query for GET /scheduling/blocked-periods -- a single vet's blocked
 * periods on a single date, matching `AvailabilityRepository.getBlockedPeriods`'s
 * own (clinicId, vetId, date) shape. */
export const blockedPeriodsQuerySchema = z.object({
  vetId: z.string().uuid(),
  date: z.coerce.date(),
});
