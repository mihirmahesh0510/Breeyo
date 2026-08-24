import { create } from 'zustand';
import type {
  ConsultationDraftState,
  VitalsData,
  SubjectiveData,
  ObjectiveData,
  PlanData,
  ReferralData,
  VisitType,
  PrescriptionItem,
  SaveDraftInput,
} from '@breeyo/types';

/**
 * Plan 10-03 Task 1 (D-01, D-05, D-06): the draft state last known to be in
 * sync with the server. `offlineConsultationDraftStore.ts` needs this as
 * the three-way-diff baseline whenever it persists an offline save --
 * without it there is no way to tell "this device changed this field"
 * apart from "this field simply arrived pre-populated from the last load",
 * which is exactly the distinction `clinicalConflict.service.ts` uses
 * server-side to decide what is safe to auto-merge (D-07) versus what must
 * become a reviewed conflict (D-06).
 */
interface ConsultationSyncBaseline {
  syncedSnapshot: SaveDraftInput;
}

interface ConsultationDraftStore extends ConsultationDraftState, ConsultationSyncBaseline {
  // Actions
  setConsultationId: (id: string) => void;
  setVisitType: (type: VisitType) => void;
  toggleSection: (section: string) => void;
  updateVitals: (vitals: Partial<VitalsData>) => void;
  updateSubjective: (data: Partial<SubjectiveData>) => void;
  updateObjective: (data: Partial<ObjectiveData>) => void;
  updateAssessment: (text: string) => void;
  updatePlan: (data: Partial<PlanData>) => void;
  updateCareInstructions: (text: string) => void;
  updateReferral: (data: ReferralData | null) => void;
  updateRxNotes: (text: string) => void;
  updatePrescriptions: (items: PrescriptionItem[]) => void;
  markSaved: () => void;
  markSaving: () => void;
  setFinalizing: (value: boolean) => void;
  loadFromDraft: (data: Record<string, unknown>) => void;
  reset: () => void;
}

const INITIAL_VITALS: VitalsData = {
  weightKg: null,
  temperatureC: null,
  heartRateBpm: null,
  respiratoryRate: null,
};

const INITIAL_SUBJECTIVE: SubjectiveData = {
  ownerReports: '',
  history: '',
  chips: [],
};

const INITIAL_OBJECTIVE: ObjectiveData = {
  bodySystems: [],
  notes: '',
};

const INITIAL_PLAN: PlanData = {
  actionItems: [],
  freeText: '',
};

const INITIAL_STATE: ConsultationDraftState = {
  consultationId: '',
  visitType: 'general',
  expandedSections: [],
  vitals: INITIAL_VITALS,
  subjective: INITIAL_SUBJECTIVE,
  objective: INITIAL_OBJECTIVE,
  assessment: '',
  plan: INITIAL_PLAN,
  careInstructions: '',
  referral: null,
  rxNotes: '',
  prescriptions: [],
  isDirty: false,
  isFinalizing: false,
  lastSavedAt: null,
};

/** Extracts the `SaveDraftInput`-shaped fields from the full draft state --
 *  the same field set `useAutoSave.ts`'s own `serializeDraft` sends to the
 *  server, used here to snapshot "what the server currently has" rather
 *  than the screen-only fields (`consultationId`, `expandedSections`, ...). */
function serializeDraftFields(state: ConsultationDraftState): SaveDraftInput {
  return {
    vitals: state.vitals,
    subjective: state.subjective,
    objective: state.objective,
    assessment: state.assessment,
    plan: state.plan,
    careInstructions: state.careInstructions,
    referral: state.referral,
    rxNotes: state.rxNotes,
    prescriptions: state.prescriptions,
  };
}

const INITIAL_SYNCED_SNAPSHOT: SaveDraftInput = serializeDraftFields(INITIAL_STATE);

export const useConsultationDraftStore = create<ConsultationDraftStore>((set, get) => ({
  ...INITIAL_STATE,
  syncedSnapshot: INITIAL_SYNCED_SNAPSHOT,

  setConsultationId: (id) => set({ consultationId: id }),

  setVisitType: (type) => set({ visitType: type, isDirty: true }),

  toggleSection: (section) =>
    set((state) => {
      // Single-expand behavior: if already expanded, collapse it; otherwise expand only this one
      const isCurrentlyExpanded = state.expandedSections.includes(section);
      return {
        expandedSections: isCurrentlyExpanded ? [] : [section],
      };
    }),

  updateVitals: (vitals) =>
    set((state) => ({
      vitals: { ...state.vitals, ...vitals },
      isDirty: true,
    })),

  updateSubjective: (data) =>
    set((state) => ({
      subjective: { ...state.subjective, ...data },
      isDirty: true,
    })),

  updateObjective: (data) =>
    set((state) => ({
      objective: { ...state.objective, ...data },
      isDirty: true,
    })),

  updateAssessment: (text) =>
    set({ assessment: text, isDirty: true }),

  updatePlan: (data) =>
    set((state) => ({
      plan: { ...state.plan, ...data },
      isDirty: true,
    })),

  updateCareInstructions: (text) =>
    set({ careInstructions: text, isDirty: true }),

  updateReferral: (data) =>
    set({ referral: data, isDirty: true }),

  updateRxNotes: (text) =>
    set({ rxNotes: text, isDirty: true }),

  updatePrescriptions: (items) =>
    set({ prescriptions: items, isDirty: true }),

  markSaved: () =>
    set((state) => ({
      isDirty: false,
      lastSavedAt: new Date(),
      // The server now confirmably has this exact draft -- advance the
      // three-way-diff baseline so the NEXT offline stretch (if any) only
      // reports fields changed after this point, not fields already synced
      // long ago.
      syncedSnapshot: serializeDraftFields(state),
    })),

  markSaving: () => set({}),

  setFinalizing: (value) => set({ isFinalizing: value }),

  loadFromDraft: (data: Record<string, unknown>) => {
    const loaded: ConsultationDraftState = {
      consultationId: (data.id as string) || (data.consultationId as string) || '',
      visitType: (data.visitType as VisitType) || 'general',
      expandedSections: get().expandedSections,
      vitals: (data.vitals as VitalsData) || INITIAL_VITALS,
      subjective: (data.subjective as SubjectiveData) || INITIAL_SUBJECTIVE,
      objective: (data.objective as ObjectiveData) || INITIAL_OBJECTIVE,
      assessment: (data.assessment as string) || '',
      plan: (data.plan as PlanData) || INITIAL_PLAN,
      careInstructions: (data.careInstructions as string) || '',
      referral: (data.referral as ReferralData) || null,
      rxNotes: (data.rxNotes as string) || '',
      prescriptions: (data.prescriptions as PrescriptionItem[]) || [],
      isDirty: false,
      isFinalizing: false,
      lastSavedAt: null,
    };
    set({
      ...loaded,
      // D-01, D-05, D-06: the just-loaded server draft IS the new sync
      // baseline -- this is what a locally-persisted offline edit gets
      // diffed against once `ConsultationScreen.tsx` restores it on top.
      syncedSnapshot: serializeDraftFields(loaded),
    });
  },

  reset: () => set({ ...INITIAL_STATE, syncedSnapshot: INITIAL_SYNCED_SNAPSHOT }),
}));
