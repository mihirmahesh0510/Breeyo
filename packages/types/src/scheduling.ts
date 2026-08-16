import type { AppointmentStatus, AppointmentSource, BlockedPeriodReason } from './constants/scheduling.constants.js';

export interface VetAvailabilityTemplate {
  id: string;
  clinicId: string;
  vetId: string;
  weekday: number;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
}

export interface AvailabilityOverride {
  id: string;
  clinicId: string;
  vetId: string;
  date: Date;
  isClosed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
  reason: string | null;
}

export interface BlockedPeriod {
  id: string;
  clinicId: string;
  vetId: string;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  reason: BlockedPeriodReason;
  reasonText: string | null;
}

export interface ResolvedDayHours {
  openMinutes: number;
  closeMinutes: number;
}

export type ResolvedDayAvailability = ResolvedDayHours | null;

export interface SlotOption {
  startMinutes: number;
  endMinutes: number;
  isDoubleBooked: boolean;
}

export interface AppointmentPetRef {
  id: string;
  petId: string;
  queueEntryId: string | null;
  pet: {
    id: string;
    name: string;
    species: string;
  };
}

export interface Appointment {
  id: string;
  clinicId: string;
  vetId: string;
  ownerId: string;
  serviceCatalogId: string | null;
  status: AppointmentStatus;
  source: AppointmentSource;
  scheduledFor: Date;
  durationMinutes: number;
  recurringSeriesId: string | null;
  recurrenceIndex: number | null;
  notes: string | null;
  createdById: string;
  whatsappBookingRequestId: string | null;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancelReason: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppointmentWithDetails extends Appointment {
  pets: AppointmentPetRef[];
  owner: {
    id: string;
    name: string;
    mobile: string;
  };
  vet: {
    id: string;
    name: string;
  };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
  } | null;
}

export interface ScheduleRange {
  from: Date;
  to: Date;
  vetId?: string;
}
