import type {
  Consultation,
  VitalsData,
  SubjectiveData,
  ObjectiveData,
  PlanData,
  ConsultationSummary,
  SaveDraftInput,
} from '@breeyo/types';
import type { PrescriptionItem, DrugEntry } from '@breeyo/types';

// ─── Entity Fixtures ─────────────────────────────────────────────────

export const mockClinic = {
  id: 'clinic_test_1',
  name: 'Test Vet Clinic',
  address: '123 Test Street, Mumbai 400001',
  contactPhone: '+919876543200',
};

export const mockVet = {
  id: 'vet_test_1',
  fullName: 'Dr. Test Vet',
  email: 'dr.test@clinic.com',
  phone: '+919876543201',
  licenseNumber: 'MH-VET-001',
};

export const mockVet2 = {
  id: 'vet_test_2',
  fullName: 'Dr. Second Vet',
  email: 'dr.second@clinic.com',
  phone: '+919876543202',
  licenseNumber: 'MH-VET-002',
};

export const mockOwner = {
  id: 'owner_test_1',
  clinicId: 'clinic_test_1',
  name: 'Rahul Kumar',
  mobile: '9876543210',
  email: 'rahul@example.com',
};

export const mockPet = {
  id: 'pet_test_1',
  clinicId: 'clinic_test_1',
  ownerId: 'owner_test_1',
  name: 'Buddy',
  species: 'DOG' as const,
  breed: 'Labrador Retriever',
  birthYear: 2022,
  birthMonth: 3,
  weight: 25.0,
};

export const mockPetCat = {
  id: 'pet_test_2',
  clinicId: 'clinic_test_1',
  ownerId: 'owner_test_1',
  name: 'Whiskers',
  species: 'CAT' as const,
  breed: 'Persian',
  birthYear: 2023,
  birthMonth: 6,
  weight: 4.5,
};

export const mockQueueEntry = {
  id: 'queue_test_1',
  clinicId: 'clinic_test_1',
  petId: 'pet_test_1',
  status: 'IN_CONSULT',
  position: 1,
  visitReason: 'General checkup',
};

// ─── Clinical Data Fixtures ──────────────────────────────────────────

export const mockVitals: VitalsData = {
  weightKg: 25.5,
  temperatureC: 38.5,
  heartRateBpm: 80,
  respiratoryRate: 20,
};

export const mockVitalsAbnormal: VitalsData = {
  weightKg: 25.5,
  temperatureC: 40.5,
  heartRateBpm: 180,
  respiratoryRate: 45,
};

export const mockSubjective: SubjectiveData = {
  ownerReports: 'Dog has been vomiting since morning, not eating',
  history: 'No prior GI issues. Up to date on vaccinations.',
  chips: ['Vomiting', 'Loss of appetite'],
};

export const mockObjective: ObjectiveData = {
  bodySystems: [
    { system: 'eyes', status: 'normal', findings: [], notes: '' },
    { system: 'ears', status: 'normal', findings: [], notes: '' },
    { system: 'abdomen', status: 'abnormal', findings: ['Pain on palpation'], notes: 'Mild tenderness in epigastric region' },
  ],
  notes: 'Alert and responsive. Mild dehydration noted.',
};

export const mockPlan: PlanData = {
  actionItems: ['Follow-up', 'Lab Retest'],
  freeText: 'Recheck in 3 days. If vomiting persists, run blood panel.',
};

export const mockConsultation: Consultation = {
  id: 'consult_test_1',
  clinicId: 'clinic_test_1',
  petId: 'pet_test_1',
  vetId: 'vet_test_1',
  queueEntryId: 'queue_test_1',
  visitType: 'general',
  status: 'finalized',
  startedAt: new Date('2026-08-01T10:00:00Z'),
  finalizedAt: new Date('2026-08-01T10:30:00Z'),
  durationMinutes: 30,
  vitals: mockVitals,
  subjective: mockSubjective,
  objective: mockObjective,
  assessment: 'Acute gastroenteritis, mild dehydration',
  plan: mockPlan,
  careInstructions: 'Soft food for 3 days. Ensure adequate water intake.',
  referral: null,
  rxNotes: 'Continue probiotics after antibiotic course',
  followUpDate: new Date('2026-08-04T00:00:00Z'),
  followUpReason: 'Recheck GI symptoms',
  addenda: [],
  prescriptions: [],
  createdAt: new Date('2026-08-01T10:00:00Z'),
  updatedAt: new Date('2026-08-01T10:30:00Z'),
};

export const mockConsultationDraft: Consultation = {
  ...mockConsultation,
  id: 'consult_draft_1',
  status: 'draft',
  finalizedAt: null,
  durationMinutes: null,
  followUpDate: null,
  followUpReason: null,
};

export const mockSaveDraftInput: SaveDraftInput = {
  vitals: mockVitals,
  subjective: mockSubjective,
  assessment: 'Suspected gastroenteritis',
};

export const mockConsultationSummary: ConsultationSummary = {
  id: 'consult_test_1',
  visitType: 'general',
  status: 'finalized',
  startedAt: new Date('2026-08-01T10:00:00Z'),
  finalizedAt: new Date('2026-08-01T10:30:00Z'),
  durationMinutes: 30,
  assessment: 'Acute gastroenteritis, mild dehydration',
  vetId: 'vet_test_1',
  vetName: 'Dr. Test Vet',
  prescriptionCount: 2,
  attachmentCount: 0,
};

// ─── Prescription Fixtures ───────────────────────────────────────────

export const mockPrescriptionItem: PrescriptionItem = {
  id: 'rx_test_1',
  drugId: 'drug_test_1',
  drugName: 'Amoxicillin',
  formulationId: 'form_test_1',
  formulation: 'tablet',
  strength: '250mg',
  dosage: '250mg',
  dosageMg: 250,
  route: 'Oral',
  frequency: 'Twice daily',
  duration: '7 days',
  durationDays: 7,
  clinicalInstructions: 'Amoxicillin 250mg PO BID x 7d',
  ownerInstructions: '1 tablet by mouth twice daily for 7 days',
  dispensed: true,
  inventoryItemId: null,
  sortOrder: 0,
};

export const mockDrugEntry: DrugEntry = {
  id: 'drug_test_1',
  name: 'Amoxicillin',
  genericName: 'Amoxicillin',
  category: 'antibiotic',
  isActive: true,
  formulations: [
    {
      id: 'form_test_1',
      drugId: 'drug_test_1',
      form: 'tablet',
      strength: '250mg',
      strengthValue: 250,
      strengthUnit: 'mg',
    },
    {
      id: 'form_test_2',
      drugId: 'drug_test_1',
      form: 'suspension',
      strength: '125mg/5ml',
      strengthValue: 125,
      strengthUnit: 'mg/5ml',
    },
  ],
  dosageRanges: [
    {
      id: 'dose_test_1',
      drugId: 'drug_test_1',
      species: 'DOG',
      minDoseMgPerKg: 10,
      maxDoseMgPerKg: 25,
      isFixedDose: false,
      fixedDoseMin: null,
      fixedDoseMax: null,
      notes: null,
    },
    {
      id: 'dose_test_2',
      drugId: 'drug_test_1',
      species: 'CAT',
      minDoseMgPerKg: 10,
      maxDoseMgPerKg: 25,
      isFixedDose: false,
      fixedDoseMin: null,
      fixedDoseMax: null,
      notes: 'Use with caution in cats with renal issues',
    },
  ],
};
