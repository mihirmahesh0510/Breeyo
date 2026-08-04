export type PreventiveCareStatusLevel = 'upToDate' | 'dueSoon' | 'overdue';

export interface VaccinationRecord {
  id: string;
  clinicId: string;
  petId: string;
  consultationId: string | null;
  vaccineName: string;
  batchNumber: string | null;
  manufacturer: string | null;
  expiryDate: Date | null;
  administeredAt: Date;
  administeredBy: string;
  nextDueDate: Date | null;
}

export interface DewormingRecord {
  id: string;
  clinicId: string;
  petId: string;
  consultationId: string | null;
  drugName: string;
  administeredAt: Date;
  administeredBy: string;
  nextDueDate: Date | null;
}

export interface VaccinationInterval {
  vaccineName: string;
  species: string;
  intervalDays: number;
  minAgeDays: number;
  maxAgeDays: number | null;
  isBooster: boolean;
}

export interface PreventiveCareStatus {
  vaccinationStatus: PreventiveCareStatusLevel;
  vaccinationNextDue: Date | null;
  vaccinationOverdueItems: string[];
  dewormingStatus: PreventiveCareStatusLevel;
  dewormingNextDue: Date | null;
}
