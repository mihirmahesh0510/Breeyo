export type VisitType = 'general' | 'surgery' | 'vaccination';
export type ConsultationStatus = 'draft' | 'finalized';
export type VitalRangeStatus = 'normal' | 'slightlyAbnormal' | 'criticallyAbnormal';

export interface VitalsData {
  weightKg: number | null;
  temperatureC: number | null;
  heartRateBpm: number | null;
  respiratoryRate: number | null;
}

export interface SubjectiveData {
  ownerReports: string;
  history: string;
  chips: string[];
}

export interface BodySystemExam {
  system: string;
  status: 'normal' | 'abnormal';
  findings: string[];
  notes: string;
}

export interface ObjectiveData {
  bodySystems: BodySystemExam[];
  notes: string;
}

export interface PlanData {
  actionItems: string[];
  freeText: string;
}

export interface ReferralData {
  specialistType: string;
  reason: string;
  urgency: 'routine' | 'urgent';
}

export interface AddendumEntry {
  id: string;
  text: string;
  addedBy: string;
  addedByName: string;
  addedAt: Date;
}

export interface Consultation {
  id: string;
  clinicId: string;
  petId: string;
  vetId: string;
  queueEntryId: string | null;
  visitType: VisitType;
  status: ConsultationStatus;
  startedAt: Date;
  finalizedAt: Date | null;
  durationMinutes: number | null;
  vitals: VitalsData | null;
  subjective: SubjectiveData | null;
  objective: ObjectiveData | null;
  assessment: string | null;
  plan: PlanData | null;
  careInstructions: string | null;
  referral: ReferralData | null;
  rxNotes: string | null;
  followUpDate: Date | null;
  followUpReason: string | null;
  addenda: AddendumEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsultationDraftState {
  consultationId: string;
  visitType: VisitType;
  expandedSections: string[];
  vitals: VitalsData;
  subjective: SubjectiveData;
  objective: ObjectiveData;
  assessment: string;
  plan: PlanData;
  careInstructions: string;
  referral: ReferralData | null;
  rxNotes: string;
  isDirty: boolean;
  isFinalizing: boolean;
  lastSavedAt: Date | null;
}

export interface ConsultationSummary {
  id: string;
  visitType: VisitType;
  status: ConsultationStatus;
  startedAt: Date;
  finalizedAt: Date | null;
  durationMinutes: number | null;
  assessment: string | null;
  vetId: string;
  vetName: string;
  prescriptionCount: number;
  attachmentCount: number;
}

export interface CreateConsultationInput {
  petId: string;
  queueEntryId?: string;
  visitType: VisitType;
}

export interface SaveDraftInput {
  vitals?: Partial<VitalsData>;
  subjective?: Partial<SubjectiveData>;
  objective?: Partial<ObjectiveData>;
  assessment?: string;
  plan?: Partial<PlanData>;
  careInstructions?: string;
  referral?: ReferralData | null;
  rxNotes?: string;
}

export interface FinalizeInput {
  followUpDate?: string;
  followUpReason?: string;
}

export interface VitalRangeCheck {
  vital: string;
  value: number;
  status: VitalRangeStatus;
  normalMin: number;
  normalMax: number;
  unit: string;
}
