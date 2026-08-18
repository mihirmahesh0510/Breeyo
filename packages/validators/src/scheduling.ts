import { z } from 'zod';
import {
  RecurrenceInterval,
  RECURRENCE_MIN_OCCURRENCES,
  RECURRENCE_MAX_OCCURRENCES,
  BlockedPeriodReason,
  AppointmentStatus,
} from '@breeyo/types';

export const recurrenceSchema = z.object({
  interval: z.nativeEnum(RecurrenceInterval),
  occurrences: z.number().int().min(RECURRENCE_MIN_OCCURRENCES).max(RECURRENCE_MAX_OCCURRENCES),
});

export const createAppointmentSchema = z.object({
  ownerId: z.string().uuid(),
  petIds: z.array(z.string().uuid()).min(1).max(6),
  vetId: z.string().uuid(),
  serviceCatalogId: z.string().uuid(),
  scheduledFor: z.coerce.date(),
  notes: z.string().max(500).optional(),
  allowDoubleBook: z.boolean().default(false),
  recurrence: recurrenceSchema.optional(),
});

export const rescheduleAppointmentSchema = z.object({
  scheduledFor: z.coerce.date(),
  vetId: z.string().uuid().optional(),
  allowDoubleBook: z.boolean().default(false),
  applyToSeries: z.boolean().default(false),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(300).optional(),
  scope: z.enum(['ONE', 'SERIES']).default('ONE'),
});

export const appointmentStatusUpdateSchema = z.object({
  status: z.nativeEnum(AppointmentStatus),
});

export const appointmentRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    vetId: z.string().uuid().optional(),
  })
  .refine((data) => data.to >= data.from, {
    message: 'to must not be before from.',
    path: ['to'],
  })
  .refine((data) => data.to.getTime() - data.from.getTime() <= 62 * 24 * 60 * 60 * 1000, {
    message: 'Date range cannot exceed 62 days.',
    path: ['to'],
  });

export const slotQuerySchema = z
  .object({
    vetId: z.string().uuid(),
    date: z.coerce.date(),
    serviceCatalogId: z.string().uuid().optional(),
    durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  })
  .refine((data) => data.serviceCatalogId !== undefined || data.durationMinutes !== undefined, {
    message: 'Provide either serviceCatalogId or durationMinutes.',
    path: ['durationMinutes'],
  });

export const availabilityTemplateDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isClosed: z.boolean(),
    openMinutes: z.number().int().min(0).max(1439).nullable(),
    closeMinutes: z.number().int().min(1).max(1440).nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.isClosed) {
      if (data.openMinutes !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'openMinutes must be null when isClosed is true.', path: ['openMinutes'] });
      }
      if (data.closeMinutes !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'closeMinutes must be null when isClosed is true.', path: ['closeMinutes'] });
      }
    } else {
      if (data.openMinutes === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'openMinutes is required when isClosed is false.', path: ['openMinutes'] });
      }
      if (data.closeMinutes === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'closeMinutes is required when isClosed is false.', path: ['closeMinutes'] });
      }
      if (data.openMinutes !== null && data.closeMinutes !== null && data.closeMinutes <= data.openMinutes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time.', path: ['closeMinutes'] });
      }
    }
  });

export const upsertAvailabilityTemplateSchema = z
  .object({
    vetId: z.string().uuid(),
    days: z.array(availabilityTemplateDaySchema).length(7),
  })
  .refine(
    (data) => {
      const weekdays = new Set(data.days.map((day) => day.weekday));
      return weekdays.size === 7 && [0, 1, 2, 3, 4, 5, 6].every((weekday) => weekdays.has(weekday));
    },
    { message: 'Provide exactly one entry per weekday.', path: ['days'] }
  );

export const upsertAvailabilityOverrideSchema = z
  .object({
    vetId: z.string().uuid(),
    date: z.coerce.date(),
    isClosed: z.boolean().default(true),
    openMinutes: z.number().int().min(0).max(1439).nullable().optional(),
    closeMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    reason: z.string().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isClosed) {
      return;
    }
    if (data.openMinutes == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'openMinutes is required when isClosed is false.', path: ['openMinutes'] });
    }
    if (data.closeMinutes == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'closeMinutes is required when isClosed is false.', path: ['closeMinutes'] });
    }
    if (data.openMinutes != null && data.closeMinutes != null && data.closeMinutes <= data.openMinutes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time.', path: ['closeMinutes'] });
    }
  });

export const createBlockedPeriodSchema = z
  .object({
    vetId: z.string().uuid(),
    date: z.coerce.date(),
    startMinutes: z.number().int().min(0).max(1439),
    endMinutes: z.number().int().min(1).max(1440),
    reason: z.nativeEnum(BlockedPeriodReason),
    reasonText: z.string().min(1).max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.endMinutes <= data.startMinutes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time.', path: ['endMinutes'] });
    }
    if (data.reason === BlockedPeriodReason.OTHER && (!data.reasonText || data.reasonText.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add a short reason.', path: ['reasonText'] });
    }
  });

export const ownerAppointmentActionSchema = z.object({
  action: z.enum(['KEEP', 'MOVE', 'CANCEL']),
  appointmentId: z.string().uuid(),
});

export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type AppointmentStatusUpdateInput = z.infer<typeof appointmentStatusUpdateSchema>;
export type AppointmentRangeQueryInput = z.infer<typeof appointmentRangeQuerySchema>;
export type SlotQueryInput = z.infer<typeof slotQuerySchema>;
export type AvailabilityTemplateDayInput = z.infer<typeof availabilityTemplateDaySchema>;
export type UpsertAvailabilityTemplateInput = z.infer<typeof upsertAvailabilityTemplateSchema>;
export type UpsertAvailabilityOverrideInput = z.infer<typeof upsertAvailabilityOverrideSchema>;
export type CreateBlockedPeriodInput = z.infer<typeof createBlockedPeriodSchema>;
export type OwnerAppointmentActionInput = z.infer<typeof ownerAppointmentActionSchema>;
