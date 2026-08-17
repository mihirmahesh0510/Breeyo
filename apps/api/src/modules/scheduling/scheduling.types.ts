import type {
  UpsertAvailabilityTemplateInput,
  UpsertAvailabilityOverrideInput,
  CreateBlockedPeriodInput,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
  CancelAppointmentInput,
} from '@breeyo/validators';
import type { AppointmentSource } from '@breeyo/types';

/**
 * `interface XParams` convention copied from `queue.types.ts`: each service
 * method takes exactly one typed params object with `clinicId` and `userId`
 * as its first two fields, rather than an inline argument object.
 */

export interface UpsertAvailabilityTemplateParams extends UpsertAvailabilityTemplateInput {
  clinicId: string;
  userId: string;
}

export interface UpsertAvailabilityOverrideParams extends UpsertAvailabilityOverrideInput {
  clinicId: string;
  userId: string;
}

export interface CreateBlockedPeriodParams extends CreateBlockedPeriodInput {
  clinicId: string;
  userId: string;
}

export interface RemoveBlockedPeriodParams {
  clinicId: string;
  userId: string;
  blockedPeriodId: string;
}

export interface ResolveAvailabilityParams {
  clinicId: string;
  userId: string;
  vetId: string;
  date: Date;
}

export interface GetOfferableSlotsParams {
  clinicId: string;
  userId: string;
  vetId: string;
  date: Date;
  durationMinutes: number;
  // Injected by the caller (plan 08-07's AppointmentService) rather than
  // queried here -- this is the architectural seam that keeps
  // AvailabilityService free of any appointment-repository dependency.
  existing: Array<{ startMinutes: number; endMinutes: number }>;
}

/**
 * Plan 08-07: AppointmentService/AppointmentRepository params. `clinicId`
 * and `userId` lead every params object, per the same convention as the
 * availability params above.
 */

export interface CreateAppointmentParams extends CreateAppointmentInput {
  clinicId: string;
  userId: string;
}

export interface RescheduleAppointmentParams extends RescheduleAppointmentInput {
  clinicId: string;
  userId: string;
  appointmentId: string;
}

export interface CancelAppointmentParams extends CancelAppointmentInput {
  clinicId: string;
  userId: string;
  appointmentId: string;
}

export interface UpdateAppointmentStatusParams {
  clinicId: string;
  userId: string;
  appointmentId: string;
}

export interface ListAppointmentsParams {
  clinicId: string;
  userId: string;
  from: Date;
  to: Date;
  vetId?: string;
}

/**
 * `AppointmentRepository.create`/`createMany`'s data shape -- every field
 * `AppointmentService` resolves and snapshots before the row is written
 * (D-02's `durationMinutes` snapshot chief among them).
 */
export interface AppointmentCreateData {
  vetId: string;
  ownerId: string;
  serviceCatalogId: string | null;
  scheduledFor: Date;
  durationMinutes: number;
  notes?: string | null;
  createdById: string;
  source: AppointmentSource;
  recurringSeriesId?: string | null;
  recurrenceIndex?: number | null;
  whatsappBookingRequestId?: string | null;
}

/**
 * D-14/D-34: every non-blocking warning `createAppointment`/`rescheduleAppointment`
 * can return alongside the created/updated appointment(s). Both client
 * surfaces (inline warning strip, info toast) render from this array, so the
 * shape is a contract plan 08-12/08-13 must match exactly.
 */
export type BookingWarning = {
  code: 'DOUBLE_BOOKED' | 'RECURRENCE_TRUNCATED' | 'RECURRENCE_OCCURRENCE_SKIPPED';
  message: string;
  data?: Record<string, unknown>;
};
