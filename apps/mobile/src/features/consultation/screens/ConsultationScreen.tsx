import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../providers/AuthProvider';
import { colors } from '@breeyo/ui';
import { apiClient } from '../../../lib/api';
import { useConsultationDraftStore } from '../hooks/useConsultationDraft';
import { useAutoSave } from '../hooks/useAutoSave';
import { useConsultationLock } from '../hooks/useConsultationLock';
import { loadOfflineConsultationDraft } from '../services/offlineConsultationDraftStore';
import { getOfflineSyncDb } from '../../offline-sync/db/offlineDb';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import type { SoapFieldName } from '../hooks/useVoiceTranscription';
import { useFileUpload } from '../../attachment/hooks/useFileUpload';
import { computeAge } from '../../patient/components/PetProfileCard';
import { PatientBanner } from '../components/PatientBanner';
import { VisitTypeSelector } from '../components/VisitTypeSelector';
import { DraftIndicator } from '../components/DraftIndicator';
import { ConsultationLockBanner } from '../components/ConsultationLockBanner';
import { VoiceRecordingOverlay } from '../components/VoiceRecordingOverlay';
import { VitalsSection } from '../components/VitalsSection';
import { SubjectiveSection } from '../components/SubjectiveSection';
import { ObjectiveSection } from '../components/ObjectiveSection';
import { AssessmentSection } from '../components/AssessmentSection';
import { PlanSection } from '../components/PlanSection';
import { CareInstructionsSection } from '../components/CareInstructionsSection';
import { ReferralSection } from '../components/ReferralSection';
import { FloatingActionBar } from '../components/FloatingActionBar';
import { PrescriptionSection } from '../components/PrescriptionSection';
import { FilesSection } from '../components/FilesSection';
import { VaccinationForm } from '../components/VaccinationForm';
import type { VaccinationFormData } from '../components/VaccinationForm';
import { DewormingForm } from '../components/DewormingForm';
import type { DewormingFormData } from '../components/DewormingForm';
import { HistoryBottomSheet } from '../../history/components/HistoryBottomSheet';
import { RepeatRxSheet } from '../../prescription/components/RepeatRxSheet';
import type {
  VisitType,
  Consultation,
  PrescriptionItem,
  AttachmentFileType,
  ConsultationAttachment,
} from '@breeyo/types';

// ---------- Accordion ----------

interface AccordionItemProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionItem({ title, expanded, onToggle, children }: AccordionItemProps) {
  const animatedHeight = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: expanded ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, animatedHeight]);

  return (
    <View style={accordionStyles.container}>
      <Pressable
        style={accordionStyles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Text style={accordionStyles.title}>{title}</Text>
        <Text style={accordionStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded && <View style={accordionStyles.content}>{children}</View>}
    </View>
  );
}

const accordionStyles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0EC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFBF5',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1B1F',
  },
  chevron: {
    fontSize: 12,
    color: '#49454F',
  },
  content: {
    backgroundColor: '#FFFBF5',
  },
});

// ---------- Section Definitions ----------

const SECTION_IDS = [
  'vitals',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'careInstructions',
  'referral',
  'prescriptions',
  'files',
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  vitals: 'Vitals',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  careInstructions: 'Care Instructions',
  referral: 'Referral',
  prescriptions: 'Prescriptions',
  files: 'Files',
};

// ---------- Main Screen ----------

interface PetInfo {
  name: string;
  species: string;
  birthYear: number | null;
  birthMonth: number | null;
  weight: string;
}

interface OwnerInfo {
  name: string;
  mobile: string;
}

/** Estimates a pet's age in days from birth year/month, defaulting to 1 year when unknown. */
function estimatePetAgeDays(birthYear: number | null, birthMonth: number | null): number {
  if (!birthYear) return 365;
  const birthDate = new Date(birthYear, (birthMonth || 1) - 1, 1);
  const days = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 365;
}

export function ConsultationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    consultationId?: string;
    petId?: string;
    queueEntryId?: string;
  }>();
  const { accessToken, user } = useAuth();

  // Store
  const store = useConsultationDraftStore();

  // Pet/owner info (loaded from API or passed via route)
  const [petInfo, setPetInfo] = useState<PetInfo>({
    name: '',
    species: 'dog',
    birthYear: null,
    birthMonth: null,
    weight: '',
  });
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo>({ name: '', mobile: '' });
  const [visitReason, setVisitReason] = useState<string | undefined>();
  // Backend does not currently surface pet warnings on this endpoint; kept as an
  // empty list so PatientBanner's warnings chip row continues to render safely.
  const warnings: string[] = [];
  const [isLoading, setIsLoading] = useState(true);
  const [isNew, setIsNew] = useState(!params.consultationId);

  // Care instructions quick-pick chip selection (not persisted separately --
  // only the free-text note is saved; D-64 defers custom chip persistence).
  const [careInstructionChips, setCareInstructionChips] = useState<string[]>([]);

  // File attachment state
  const { uploadFile } = useFileUpload();
  const [attachments, setAttachments] = useState<Array<{
    attachment: ConsultationAttachment;
    status: 'uploading' | 'uploaded' | 'error';
    progress?: number;
  }>>([]);

  // Vaccination / Deworming form data
  const [vaccinationData, setVaccinationData] = useState<VaccinationFormData | null>(null);
  const [dewormingData, setDewormingData] = useState<DewormingFormData | null>(null);

  // History bottom sheet
  const [showHistory, setShowHistory] = useState(false);

  // Repeat Rx bottom sheet
  const [showRepeatRx, setShowRepeatRx] = useState(false);
  const [repeatRxData, setRepeatRxData] = useState<{
    visitDate: string;
    medications: PrescriptionItem[];
  } | null>(null);

  // Pet age in days (estimated from birth year/month)
  const petAgeDays = estimatePetAgeDays(petInfo.birthYear, petInfo.birthMonth);

  // Consultation ID
  const consultationId = store.consultationId || params.consultationId || '';

  // Auto-save
  const { isSaving, saveError, isOffline, forceSave } = useAutoSave(consultationId);

  // Lock management
  const lockStatus = useConsultationLock(consultationId, user?.id || '');
  const isLocked = lockStatus.locked && lockStatus.vetName !== undefined;

  // Voice transcription (D-51--D-57)
  const handleTranscript = useCallback((text: string, targetField: SoapFieldName) => {
    const s = useConsultationDraftStore.getState();
    const append = (existing: string) => (existing ? `${existing} ${text}` : text);

    switch (targetField) {
      case 'subjective.ownerReports':
        s.updateSubjective({ ownerReports: append(s.subjective.ownerReports) });
        break;
      case 'subjective.history':
        s.updateSubjective({ history: append(s.subjective.history) });
        break;
      case 'objective.notes':
        s.updateObjective({ notes: append(s.objective.notes) });
        break;
      case 'assessment':
        s.updateAssessment(append(s.assessment));
        break;
      case 'plan.freeText':
        s.updatePlan({ freeText: append(s.plan.freeText) });
        break;
      case 'careInstructions':
        s.updateCareInstructions(append(s.careInstructions));
        break;
      case 'rxNotes':
        s.updateRxNotes(append(s.rxNotes));
        break;
      default:
        break;
    }
  }, []);

  const voice = useVoiceTranscription({ onTranscript: handleTranscript });

  // Draft status for indicator. `isOffline` (D-01, D-03, D-19) takes
  // precedence over the plain 'dirty' pulse -- an offline edit is already
  // safely captured on-device, not just unsaved-in-memory.
  const draftStatus = (() => {
    if (saveError) return 'error' as const;
    if (isSaving) return 'saving' as const;
    if (isOffline) return 'offline' as const;
    if (store.isDirty) return 'dirty' as const;
    return 'saved' as const;
  })();

  // Load consultation data
  useEffect(() => {
    async function loadData() {
      if (!accessToken) return;
      try {
        // Load pet info
        if (params.petId) {
          const petResponse = await apiClient<{
            data: {
              name: string;
              species: string;
              birthYear: number | null;
              birthMonth: number | null;
              weight: number | null;
              owner: { name: string; mobile: string };
            };
          }>(`/api/v1/pets/${params.petId}`, { token: accessToken });
          const pet = petResponse.data;
          setPetInfo({
            name: pet.name,
            species: pet.species,
            birthYear: pet.birthYear,
            birthMonth: pet.birthMonth,
            weight: pet.weight ? `${pet.weight} kg` : '',
          });
          setOwnerInfo({ name: pet.owner.name, mobile: pet.owner.mobile });
        }

        // Load or create consultation
        if (params.consultationId) {
          // Load existing draft
          const draftResponse = await apiClient<{ data: Consultation }>(
            `/api/v1/consultations/${params.consultationId}/draft`,
            { token: accessToken },
          );
          store.loadFromDraft(draftResponse.data);
          setIsNew(false);

          // D-01, D-05: if this device has an offline-persisted draft for
          // this exact consultation (edits made during a connectivity drop
          // that survived even an app restart), restore it on top of the
          // just-loaded server draft rather than silently losing it. This
          // marks the restored fields dirty again so `useAutoSave.ts`
          // naturally re-attempts syncing them once online.
          try {
            const offlineDb = await getOfflineSyncDb();
            const offlineDraft = await loadOfflineConsultationDraft(offlineDb, params.consultationId);
            if (offlineDraft) {
              const { draft } = offlineDraft;
              if (draft.vitals) store.updateVitals(draft.vitals);
              if (draft.subjective) store.updateSubjective(draft.subjective);
              if (draft.objective) store.updateObjective(draft.objective);
              if (draft.assessment !== undefined) store.updateAssessment(draft.assessment);
              if (draft.plan) store.updatePlan(draft.plan);
              if (draft.careInstructions !== undefined) store.updateCareInstructions(draft.careInstructions);
              if (draft.referral !== undefined) store.updateReferral(draft.referral ?? null);
              if (draft.rxNotes !== undefined) store.updateRxNotes(draft.rxNotes);
              if (draft.prescriptions !== undefined) store.updatePrescriptions(draft.prescriptions);
            }
          } catch {
            // Best-effort restore -- a missing/corrupt local snapshot must
            // never block loading the server's own copy of the draft.
          }
        } else if (params.petId) {
          // Create new consultation
          const createResponse = await apiClient<{ data: { id: string } }>(
            '/api/v1/consultations',
            {
              method: 'POST',
              token: accessToken,
              body: JSON.stringify({
                petId: params.petId,
                queueEntryId: params.queueEntryId || undefined,
                visitType: 'general',
              }),
            },
          );
          store.setConsultationId(createResponse.data.id);
          store.toggleSection('vitals'); // Auto-expand first section
          setIsNew(true);
        }
      } catch {
        // Error loading -- show basic screen with empty data
      }
      setIsLoading(false);
    }

    loadData();

    return () => {
      store.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.consultationId, params.petId, accessToken]);

  // Handle section toggle (single-expand behavior)
  const handleToggleSection = useCallback(
    (sectionId: string) => {
      store.toggleSection(sectionId);
    },
    [store],
  );

  // Back navigation dialog
  const handleBackNavigation = useCallback(() => {
    Alert.alert(
      'Leave consultation?',
      'Your consultation draft has been auto-saved.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Save & Leave',
          onPress: async () => {
            if (store.isDirty) {
              await forceSave();
            }
            router.back();
          },
        },
        {
          text: 'Delete Draft',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Draft?',
              'Are you sure? This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      if (consultationId && accessToken) {
                        await apiClient(
                          `/api/v1/consultations/${consultationId}/draft`,
                          { method: 'DELETE', token: accessToken },
                        );
                      }
                    } catch {
                      // Continue navigation even if delete fails
                    }
                    router.back();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [store, forceSave, consultationId, accessToken, router]);

  // End consultation -> navigate to review
  const handleEndConsultation = useCallback(async () => {
    if (store.visitType === 'vaccination' && accessToken && params.petId) {
      try {
        if (vaccinationData && vaccinationData.isValid) {
          await apiClient(`/api/v1/pets/${params.petId}/vaccinations`, {
            method: 'POST',
            token: accessToken,
            body: JSON.stringify({
              vaccineName: vaccinationData.vaccineName,
              batchNumber: vaccinationData.batchNumber || undefined,
              manufacturer: vaccinationData.manufacturer || undefined,
              expiryDate: vaccinationData.expiryDate || undefined,
              consultationId,
              nextDueDate: vaccinationData.nextDueDate || undefined,
              petSpecies: petInfo.species,
              petAgeDays,
            }),
          });
        }
        if (dewormingData && dewormingData.isValid) {
          await apiClient(`/api/v1/pets/${params.petId}/deworming`, {
            method: 'POST',
            token: accessToken,
            body: JSON.stringify({
              drugName: dewormingData.drugName,
              consultationId,
              nextDueDate: dewormingData.nextDueDate || undefined,
              petSpecies: petInfo.species,
              petAgeDays,
            }),
          });
        }
      } catch {
        Alert.alert(
          'Error',
          'Failed to save vaccination/deworming record. You can retry from the patient profile.',
        );
      }
    }

    await forceSave();
    router.push({
      pathname: '/consultation/review',
      params: { consultationId },
    });
  }, [
    store.visitType,
    accessToken,
    params.petId,
    vaccinationData,
    dewormingData,
    consultationId,
    petInfo.species,
    petAgeDays,
    forceSave,
    router,
  ]);

  // File upload handler -- wired to the real presigned-URL upload flow
  const handleAddFile = useCallback(
    (
      file: { uri: string; name: string; mimeType: string; size: number },
      fileType: AttachmentFileType,
      description?: string,
    ) => {
      const tempId = `temp-${Date.now()}`;
      const tempAttachment: ConsultationAttachment = {
        id: tempId,
        consultationId,
        fileType,
        fileName: file.name,
        mimeType: file.mimeType,
        fileSizeBytes: file.size,
        s3Key: '',
        s3Url: file.uri,
        thumbnailS3Key: null,
        description: description || null,
        uploadedBy: user?.id || '',
        uploadedAt: new Date(),
      };

      setAttachments((prev) => [
        ...prev,
        { attachment: tempAttachment, status: 'uploading' as const, progress: 0 },
      ]);

      uploadFile(consultationId, file, fileType, description)
        .then((uploaded) => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.attachment.id === tempId
                ? { attachment: uploaded, status: 'uploaded' as const, progress: 100 }
                : a,
            ),
          );
        })
        .catch(() => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.attachment.id === tempId ? { ...a, status: 'error' as const } : a,
            ),
          );
        });
    },
    [consultationId, uploadFile, user?.id],
  );

  // View history handler
  const handleViewHistory = useCallback(() => {
    setShowHistory(true);
  }, []);

  // Repeat Rx: fetch the selected past consultation's prescriptions and open the sheet
  const handleRepeatRx = useCallback(
    async (rxConsultationId: string) => {
      setShowHistory(false);
      if (!accessToken) return;
      try {
        const response = await apiClient<{
          data: { startedAt: string; prescriptions: PrescriptionItem[] };
        }>(`/api/v1/consultations/${rxConsultationId}`, { token: accessToken });
        setRepeatRxData({
          visitDate: response.data.startedAt,
          medications: response.data.prescriptions,
        });
        setShowRepeatRx(true);
      } catch {
        Alert.alert('Error', 'Failed to load past prescription. Please try again.');
      }
    },
    [accessToken],
  );

  const handleRepeatAll = useCallback(
    (medications: PrescriptionItem[], _visitDate: string) => {
      const baseIndex = store.prescriptions.length;
      const repeated = medications.map((med, index) => ({
        ...med,
        id: undefined,
        sortOrder: baseIndex + index,
      }));
      store.updatePrescriptions([...store.prescriptions, ...repeated]);
      setShowRepeatRx(false);
    },
    [store],
  );

  // Lock take-over (D-06/D-72)
  const handleTakeOver = useCallback(async () => {
    if (!consultationId || !accessToken) return;
    try {
      await apiClient(`/api/v1/consultations/${consultationId}/lock`, {
        method: 'POST',
        token: accessToken,
      });
      await lockStatus.refetch();
    } catch {
      Alert.alert('Error', 'Failed to take over this consultation. Please try again.');
    }
  }, [consultationId, accessToken, lockStatus]);

  // Floating action bar handlers
  const handleMic = useCallback(() => {
    if (voice.isRecording) {
      voice.stopRecording();
    } else {
      voice.startRecording();
    }
  }, [voice]);
  const handleRx = useCallback(() => {
    // Open prescriptions section by expanding it
    store.toggleSection('prescriptions');
  }, [store]);
  const handleCamera = useCallback(() => {
    // Open files section
    store.toggleSection('files');
  }, [store]);
  const handleTimer = useCallback(() => {
    // Timer -- placeholder
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const expandedSection = store.expandedSections[0] || null;
  const petAgeDisplay = computeAge(petInfo.birthYear, petInfo.birthMonth) || '';

  return (
    <View style={styles.container}>
      {/* Patient Banner (sticky) */}
      <PatientBanner
        pet={{
          name: petInfo.name,
          species: petInfo.species,
          age: petAgeDisplay,
          weight: petInfo.weight,
        }}
        owner={ownerInfo}
        visitReason={visitReason}
        warnings={warnings}
      />

      {/* Lock Banner */}
      {isLocked && (
        <ConsultationLockBanner
          vetName={lockStatus.vetName || 'Unknown'}
          isStale={lockStatus.stale}
          onTakeOver={handleTakeOver}
        />
      )}

      {/* Visit Type Selector (new consultations only) */}
      {isNew && (
        <VisitTypeSelector
          value={store.visitType}
          onChange={(type: VisitType) => store.setVisitType(type)}
        />
      )}

      {/* Draft Indicator */}
      <DraftIndicator status={draftStatus} lastSavedAt={store.lastSavedAt} />

      {/* Voice Recording Overlay (D-51--D-57) */}
      <VoiceRecordingOverlay
        isRecording={voice.isRecording}
        interimTranscript={voice.interimTranscript}
      />

      {/* Accordion Sections */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 1. Vitals */}
        <AccordionItem
          title={SECTION_LABELS.vitals}
          expanded={expandedSection === 'vitals'}
          onToggle={() => handleToggleSection('vitals')}
        >
          <VitalsSection
            vitals={store.vitals}
            onChange={(vitals) => store.updateVitals(vitals)}
            species={petInfo.species}
          />
        </AccordionItem>

        {/* 2. Subjective */}
        <AccordionItem
          title={SECTION_LABELS.subjective}
          expanded={expandedSection === 'subjective'}
          onToggle={() => handleToggleSection('subjective')}
        >
          <SubjectiveSection
            data={store.subjective}
            onChange={(data) => store.updateSubjective(data)}
            visitType={store.visitType}
            onFieldFocus={voice.setLastFocusedField}
          />
        </AccordionItem>

        {/* 3. Objective */}
        <AccordionItem
          title={SECTION_LABELS.objective}
          expanded={expandedSection === 'objective'}
          onToggle={() => handleToggleSection('objective')}
        >
          <ObjectiveSection
            data={store.objective}
            onChange={(data) => store.updateObjective(data)}
            onFieldFocus={voice.setLastFocusedField}
          />
        </AccordionItem>

        {/* 4. Assessment */}
        <AccordionItem
          title={SECTION_LABELS.assessment}
          expanded={expandedSection === 'assessment'}
          onToggle={() => handleToggleSection('assessment')}
        >
          <AssessmentSection
            value={store.assessment}
            onChange={(text) => store.updateAssessment(text)}
            onFieldFocus={voice.setLastFocusedField}
          />
        </AccordionItem>

        {/* 5. Plan */}
        <AccordionItem
          title={SECTION_LABELS.plan}
          expanded={expandedSection === 'plan'}
          onToggle={() => handleToggleSection('plan')}
        >
          <PlanSection
            data={store.plan}
            onChange={(data) => store.updatePlan(data)}
            visitType={store.visitType}
            onFieldFocus={voice.setLastFocusedField}
          />
        </AccordionItem>

        {/* 5a. Care Instructions (D-50) */}
        <AccordionItem
          title={SECTION_LABELS.careInstructions}
          expanded={expandedSection === 'careInstructions'}
          onToggle={() => handleToggleSection('careInstructions')}
        >
          <CareInstructionsSection
            selectedChips={careInstructionChips}
            freeText={store.careInstructions}
            onChipsChange={setCareInstructionChips}
            onFreeTextChange={(text) => store.updateCareInstructions(text)}
            onFieldFocus={voice.setLastFocusedField}
          />
        </AccordionItem>

        {/* 5b. Referral (D-49) */}
        <AccordionItem
          title={SECTION_LABELS.referral}
          expanded={expandedSection === 'referral'}
          onToggle={() => handleToggleSection('referral')}
        >
          <ReferralSection
            data={store.referral}
            onChange={(data) => store.updateReferral(data)}
          />
        </AccordionItem>

        {/* 5c. Vaccination Form (when visitType is vaccination) */}
        {store.visitType === 'vaccination' && (
          <AccordionItem
            title="Vaccination Details"
            expanded={expandedSection === 'vaccination'}
            onToggle={() => handleToggleSection('vaccination')}
          >
            <VaccinationForm
              species={petInfo.species}
              petAgeDays={petAgeDays}
              onDataChange={setVaccinationData}
            />
          </AccordionItem>
        )}

        {/* 5d. Deworming Form (when visitType is vaccination) */}
        {store.visitType === 'vaccination' && (
          <AccordionItem
            title="Deworming Details"
            expanded={expandedSection === 'deworming'}
            onToggle={() => handleToggleSection('deworming')}
          >
            <DewormingForm
              petAgeDays={petAgeDays}
              onDataChange={setDewormingData}
            />
          </AccordionItem>
        )}

        {/* 6. Prescriptions */}
        <AccordionItem
          title="Prescriptions"
          expanded={expandedSection === 'prescriptions'}
          onToggle={() => handleToggleSection('prescriptions')}
        >
          <PrescriptionSection
            medications={store.prescriptions}
            onMedicationsChange={(items) => store.updatePrescriptions(items)}
            generalNotes={store.rxNotes}
            onGeneralNotesChange={(text) => store.updateRxNotes(text)}
            petWeightKg={store.vitals.weightKg ?? undefined}
            petSpecies={petInfo.species}
          />
        </AccordionItem>

        {/* 7. Files */}
        <AccordionItem
          title="Files"
          expanded={expandedSection === 'files'}
          onToggle={() => handleToggleSection('files')}
        >
          <FilesSection
            attachments={attachments}
            onAddFile={handleAddFile}
            onRetry={(attachmentId) => {
              // Retry upload logic
              setAttachments((prev) =>
                prev.map((a) =>
                  a.attachment.id === attachmentId
                    ? { ...a, status: 'uploading' as const }
                    : a,
                ),
              );
            }}
            onRemove={(attachmentId) => {
              setAttachments((prev) =>
                prev.filter((a) => a.attachment.id !== attachmentId),
              );
            }}
          />
        </AccordionItem>

        {/* View History Button */}
        <View style={styles.historyButtonContainer}>
          <Pressable style={styles.historyButton} onPress={handleViewHistory}>
            <Text style={styles.historyButtonText}>View History</Text>
          </Pressable>
        </View>

        {/* End Consultation Button */}
        <View style={styles.endButtonContainer}>
          <Pressable style={styles.endButton} onPress={handleEndConsultation}>
            <Text style={styles.endButtonText}>End Consultation</Text>
          </Pressable>
        </View>

        {/* Extra padding for floating bar */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* History Bottom Sheet */}
      <HistoryBottomSheet
        visible={showHistory}
        petId={params.petId || ''}
        petName={petInfo.name}
        onClose={() => setShowHistory(false)}
        onRepeatRx={handleRepeatRx}
        onViewConsultation={(viewConsultationId) => {
          setShowHistory(false);
          router.push({
            pathname: '/consultation/detail/[consultationId]',
            params: { consultationId: viewConsultationId },
          });
        }}
      />

      {/* Repeat Rx Bottom Sheet (D-36) */}
      <RepeatRxSheet
        visible={showRepeatRx}
        onDismiss={() => setShowRepeatRx(false)}
        pastPrescription={repeatRxData}
        onRepeatAll={handleRepeatAll}
      />

      {/* Floating Action Bar */}
      {!isLocked && (
        <FloatingActionBar
          onMic={handleMic}
          onRx={handleRx}
          onCamera={handleCamera}
          onTimer={handleTimer}
          isRecording={voice.isRecording}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  placeholderSection: {
    padding: 16,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 13,
    color: '#79747E',
    fontStyle: 'italic',
  },
  endButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  endButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  historyButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  historyButton: {
    borderWidth: 1,
    borderColor: '#49454F',
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  historyButtonText: {
    color: '#49454F',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 80,
  },
});
