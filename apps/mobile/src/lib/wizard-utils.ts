// Utility functions for the setup wizard flow
// Extracted for testability without React Native dependencies

export const WIZARD_STEPS = [
  '/setup-wizard/clinic-profile',
  '/setup-wizard/invite-staff',
  '/setup-wizard/clinic-hours',
] as const;

export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface DayHours {
  isClosed: boolean;
  openTime: string;
  closeTime: string;
}

export type WeekHours = Record<DayOfWeek, DayHours>;

export const AVAILABLE_STAFF_ROLES = ['Clinician', 'FrontDesk', 'InventoryManager'] as const;
export type StaffRole = (typeof AVAILABLE_STAFF_ROLES)[number];

export function getDefaultHours(): WeekHours {
  const hours = {} as WeekHours;
  for (const day of DAYS_OF_WEEK) {
    if (day === 'Sunday') {
      hours[day] = { isClosed: true, openTime: '09:00', closeTime: '18:00' };
    } else {
      hours[day] = { isClosed: false, openTime: '09:00', closeTime: '18:00' };
    }
  }
  return hours;
}

export function formatHoursForApi(hours: WeekHours) {
  return DAYS_OF_WEEK.map((day) => ({
    day,
    isClosed: hours[day].isClosed,
    openTime: hours[day].isClosed ? null : hours[day].openTime,
    closeTime: hours[day].isClosed ? null : hours[day].closeTime,
  }));
}

export function formatPhoneWithPrefix(phone: string): string {
  return phone.startsWith('+91') ? phone : `+91${phone}`;
}

export function getStepIndex(pathname: string): number {
  const index = WIZARD_STEPS.findIndex((step) => pathname === step);
  return index >= 0 ? index : 0;
}

export function isWizardCompleted(wizardCompletedAt: string | null | undefined): boolean {
  return !!wizardCompletedAt;
}
