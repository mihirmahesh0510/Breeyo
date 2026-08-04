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
import { apiClient } from '../../../lib/api';
import { useConsultationDraftStore } from '../hooks/useConsultationDraft';
import { useAutoSave } from '../hooks/useAutoSave';
import { useConsultationLock } from '../hooks/useConsultationLock';
import { PatientBanner } from '../components/PatientBanner';
import { VisitTypeSelector } from '../components/VisitTypeSelector';
import { DraftIndicator } from '../components/DraftIndicator';
import { ConsultationLockBanner } from '../components/ConsultationLockBanner';
import { VitalsSection } from '../components/VitalsSection';
import { SubjectiveSection } from '../components/SubjectiveSection';
import { ObjectiveSection } from '../components/ObjectiveSection';
import { AssessmentSection } from '../components/AssessmentSection';
import { PlanSection } from '../components/PlanSection';
import { FloatingActionBar } from '../components/FloatingActionBar';
import type { VisitType, Consultation } from '@breeyo/types';

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
        <Text style={accordionStyles.chevron}>{expanded ? '\u25B2' : '\u25BC'}</Text>
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
  prescriptions: 'Prescriptions',
  files: 'Files',
};

// ---------- Main Screen ----------

interface PetInfo {
  name: string;
  species: string;
  age: string;
  weight: string;
}

interface OwnerInfo {
  name: string;
  mobile: string;
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
    age: '',
    weight: '',
  });
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo>({ name: '', mobile: '' });
  const [visitReason, setVisitReason] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNew, setIsNew] = useState(!params.consultationId);
  const [isRecording, setIsRecording] = useState(false);

  // Consultation ID
  const consultationId = store.consultationId || params.consultationId || '';

  // Auto-save
  const { isSaving, saveError, forceSave } = useAutoSave(consultationId);

  // Lock management
  const lockStatus = useConsultationLock(consultationId, user?.id || '');
  const isLocked = lockStatus.locked && lockStatus.vetName !== undefined;

  // Draft status for indicator
  const draftStatus = (() => {
    if (saveError) return 'error' as const;
    if (isSaving) return 'saving' as const;
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
              dateOfBirth: string;
              weight: number | null;
              owner: { name: string; phone: string };
              warnings: string[];
            };
          }>(`/api/v1/patients/${params.petId}`, { token: accessToken });
          const pet = petResponse.data;
          setPetInfo({
            name: pet.name,
            species: pet.species,
            age: pet.dateOfBirth || '',
            weight: pet.weight ? `${pet.weight} kg` : '',
          });
          setOwnerInfo({ name: pet.owner.name, mobile: pet.owner.phone });
          setWarnings(pet.warnings || []);
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
    await forceSave();
    router.push({
      pathname: '/consultation/review',
      params: { consultationId },
    });
  }, [forceSave, consultationId, router]);

  // Floating action bar handlers (placeholders)
  const handleMic = useCallback(() => setIsRecording((prev) => !prev), []);
  const handleRx = useCallback(() => {
    // Prescriptions -- placeholder for Plan 05
  }, []);
  const handleCamera = useCallback(() => {
    // Camera -- placeholder for Plan 06
  }, []);
  const handleTimer = useCallback(() => {
    // Timer -- placeholder
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  const expandedSection = store.expandedSections[0] || null;

  return (
    <View style={styles.container}>
      {/* Patient Banner (sticky) */}
      <PatientBanner
        pet={petInfo}
        owner={ownerInfo}
        visitReason={visitReason}
        warnings={warnings}
      />

      {/* Lock Banner */}
      {isLocked && (
        <ConsultationLockBanner
          vetName={lockStatus.vetName || 'Unknown'}
          isStale={lockStatus.stale}
          onTakeOver={() => {
            // Take over lock -- heartbeat will re-establish
          }}
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
          />
        </AccordionItem>

        {/* 6. Prescriptions (placeholder) */}
        <AccordionItem
          title="Prescriptions"
          expanded={expandedSection === 'prescriptions'}
          onToggle={() => handleToggleSection('prescriptions')}
        >
          <View style={styles.placeholderSection}>
            <Text style={styles.placeholderText}>
              Prescriptions will be available in a future update.
            </Text>
          </View>
        </AccordionItem>

        {/* 7. Files (placeholder) */}
        <AccordionItem
          title="Files"
          expanded={expandedSection === 'files'}
          onToggle={() => handleToggleSection('files')}
        >
          <View style={styles.placeholderSection}>
            <Text style={styles.placeholderText}>
              File attachments will be available in a future update.
            </Text>
          </View>
        </AccordionItem>

        {/* End Consultation Button */}
        <View style={styles.endButtonContainer}>
          <Pressable style={styles.endButton} onPress={handleEndConsultation}>
            <Text style={styles.endButtonText}>End Consultation</Text>
          </Pressable>
        </View>

        {/* Extra padding for floating bar */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Floating Action Bar */}
      {!isLocked && (
        <FloatingActionBar
          onMic={handleMic}
          onRx={handleRx}
          onCamera={handleCamera}
          onTimer={handleTimer}
          isRecording={isRecording}
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
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  endButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 80,
  },
});
