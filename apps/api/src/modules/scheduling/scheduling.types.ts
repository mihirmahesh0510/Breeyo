import type {
  UpsertAvailabilityTemplateInput,
  UpsertAvailabilityOverrideInput,
  CreateBlockedPeriodInput,
} from '@breeyo/validators';

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
