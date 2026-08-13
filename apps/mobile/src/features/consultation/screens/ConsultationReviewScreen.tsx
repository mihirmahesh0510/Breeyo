import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import { useConsultationDraftStore } from '../hooks/useConsultationDraft';
import { MedicationCard } from '../../prescription/components/MedicationCard';
import { BODY_SYSTEMS } from '@breeyo/types';
import type { ConsultationAttachment } from '@breeyo/types';

// ---------- Review Card ----------

interface ReviewCardProps {
  title: string;
  children: React.ReactNode;
  isEmpty?: boolean;
}

function ReviewCard({ title, children, isEmpty }: ReviewCardProps) {
  return (
    <View style={cardStyles.container}>
      <Text style={cardStyles.title}>{title}</Text>
      {isEmpty ? (
        <Text style={cardStyles.empty}>Not recorded</Text>
      ) : (
        <View style={cardStyles.content}>{children}</View>
      )}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0EC',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 8,
  },
  content: {},
  empty: {
    fontSize: 13,
    color: '#79747E',
    fontStyle: 'italic',
  },
});

// ---------- Follow-Up Bottom Sheet ----------

interface FollowUpSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (followUpDate?: string, followUpReason?: string) => void;
  isSubmitting: boolean;
}

function FollowUpSheet({ visible, onDismiss, onConfirm, isSubmitting }: FollowUpSheetProps) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');

  const handleSave = () => {
    onConfirm(date || undefined, reason || undefined);
  };

  const handleSkip = () => {
    onConfirm(undefined, undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={sheetStyles.overlay}>
        <View style={sheetStyles.sheet}>
          <Text style={sheetStyles.title}>Schedule Follow-Up</Text>

          <Text style={sheetStyles.label}>Follow-up Date</Text>
          <TextInput
            style={sheetStyles.input}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#79747E"
            accessibilityLabel="Follow-up date input"
          />

          <Text style={sheetStyles.label}>Reason</Text>
          <TextInput
            style={[sheetStyles.input, sheetStyles.textArea]}
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for follow-up..."
            placeholderTextColor="#79747E"
            multiline
            textAlignVertical="top"
            accessibilityLabel="Follow-up reason input"
          />

          <View style={sheetStyles.buttonRow}>
            <Pressable
              style={sheetStyles.skipButton}
              onPress={handleSkip}
              disabled={isSubmitting}
            >
              <Text style={sheetStyles.skipText}>Skip</Text>
            </Pressable>
            <Pressable
              style={[sheetStyles.saveButton, isSubmitting && sheetStyles.buttonDisabled]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={sheetStyles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFBF5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
  },
  textArea: {
    minHeight: 60,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  skipText: {
    color: '#49454F',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

// ---------- Review Screen ----------

export function ConsultationReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ consultationId: string }>();
  const { accessToken } = useAuth();
  const store = useConsultationDraftStore();

  const [showFollowUp, setShowFollowUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<ConsultationAttachment[]>([]);

  const consultationId = params.consultationId || store.consultationId;

  // Fetch attachments for the Files summary card (not tracked in the draft store).
  useEffect(() => {
    if (!consultationId || !accessToken) return;
    apiClient<{ data: ConsultationAttachment[] }>(
      `/api/v1/consultations/${consultationId}/attachments`,
      { token: accessToken },
    )
      .then((res) => setAttachments(res.data))
      .catch(() => {
        // Non-fatal -- Files card will just show as empty
      });
  }, [consultationId, accessToken]);

  const handleEdit = useCallback(() => {
    router.back();
  }, [router]);

  const handleFinalize = useCallback(() => {
    setShowFollowUp(true);
  }, []);

  const handleConfirmFinalize = useCallback(
    async (followUpDate?: string, followUpReason?: string) => {
      if (!consultationId || !accessToken) return;
      setIsSubmitting(true);
      try {
        await apiClient(`/api/v1/consultations/${consultationId}/finalize`, {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify({
            followUpDate: followUpDate || undefined,
            followUpReason: followUpReason || undefined,
          }),
        });
        setShowFollowUp(false);
        Alert.alert('Success', 'Consultation finalized', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } catch {
        Alert.alert('Error', 'Failed to finalize consultation. Please try again.');
      }
      setIsSubmitting(false);
    },
    [consultationId, accessToken, router],
  );

  // Helpers
  const hasVitals =
    store.vitals.weightKg !== null ||
    store.vitals.temperatureC !== null ||
    store.vitals.heartRateBpm !== null ||
    store.vitals.respiratoryRate !== null;

  const hasSubjective =
    store.subjective.ownerReports.length > 0 ||
    store.subjective.history.length > 0 ||
    store.subjective.chips.length > 0;

  const hasObjective =
    store.objective.bodySystems.some((s) => s.status === 'abnormal') ||
    store.objective.notes.length > 0;

  const hasAssessment = store.assessment.length > 0;

  const hasPlan = store.plan.actionItems.length > 0 || store.plan.freeText.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.screenTitle}>Consultation Review</Text>
        <Text style={styles.warningText}>
          Once finalized, this record cannot be edited. Addenda can be added later.
        </Text>

        {/* Vitals */}
        <ReviewCard title="Vitals" isEmpty={!hasVitals}>
          {store.vitals.weightKg !== null && (
            <Text style={styles.reviewLine}>Weight: {store.vitals.weightKg} kg</Text>
          )}
          {store.vitals.temperatureC !== null && (
            <Text style={styles.reviewLine}>
              Temperature: {store.vitals.temperatureC} {'\u00B0C'}
            </Text>
          )}
          {store.vitals.heartRateBpm !== null && (
            <Text style={styles.reviewLine}>Heart Rate: {store.vitals.heartRateBpm} bpm</Text>
          )}
          {store.vitals.respiratoryRate !== null && (
            <Text style={styles.reviewLine}>
              Respiratory Rate: {store.vitals.respiratoryRate} breaths/min
            </Text>
          )}
        </ReviewCard>

        {/* Subjective */}
        <ReviewCard title="Subjective" isEmpty={!hasSubjective}>
          {store.subjective.chips.length > 0 && (
            <View style={styles.chipRow}>
              {store.subjective.chips.map((chip) => (
                <View key={chip} style={styles.reviewChip}>
                  <Text style={styles.reviewChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          )}
          {store.subjective.ownerReports.length > 0 && (
            <Text style={styles.reviewLine}>
              Owner Reports: {store.subjective.ownerReports}
            </Text>
          )}
          {store.subjective.history.length > 0 && (
            <Text style={styles.reviewLine}>History: {store.subjective.history}</Text>
          )}
        </ReviewCard>

        {/* Objective */}
        <ReviewCard title="Objective" isEmpty={!hasObjective}>
          {store.objective.bodySystems
            .filter((s) => s.status === 'abnormal')
            .map((sys) => {
              const label =
                BODY_SYSTEMS.find((b) => b.id === sys.system)?.label || sys.system;
              return (
                <View key={sys.system} style={styles.systemBlock}>
                  <Text style={styles.systemLabel}>
                    {label}: Abnormal
                  </Text>
                  {sys.findings.length > 0 && (
                    <Text style={styles.reviewLine}>
                      Findings: {sys.findings.join(', ')}
                    </Text>
                  )}
                  {sys.notes.length > 0 && (
                    <Text style={styles.reviewLine}>Notes: {sys.notes}</Text>
                  )}
                </View>
              );
            })}
          {store.objective.notes.length > 0 && (
            <Text style={styles.reviewLine}>
              Additional Notes: {store.objective.notes}
            </Text>
          )}
        </ReviewCard>

        {/* Assessment */}
        <ReviewCard title="Assessment" isEmpty={!hasAssessment}>
          <Text style={styles.reviewLine}>{store.assessment}</Text>
        </ReviewCard>

        {/* Plan */}
        <ReviewCard title="Plan" isEmpty={!hasPlan}>
          {store.plan.actionItems.length > 0 && (
            <View style={styles.chipRow}>
              {store.plan.actionItems.map((item) => (
                <View key={item} style={styles.reviewChip}>
                  <Text style={styles.reviewChipText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
          {store.plan.freeText.length > 0 && (
            <Text style={styles.reviewLine}>{store.plan.freeText}</Text>
          )}
        </ReviewCard>

        {/* Care Instructions */}
        <ReviewCard
          title="Care Instructions"
          isEmpty={store.careInstructions.length === 0}
        >
          <Text style={styles.reviewLine}>{store.careInstructions}</Text>
        </ReviewCard>

        {/* Referral */}
        <ReviewCard title="Referral" isEmpty={!store.referral}>
          {store.referral && (
            <>
              <Text style={styles.reviewLine}>
                Specialist: {store.referral.specialistType}
              </Text>
              <Text style={styles.reviewLine}>
                Reason: {store.referral.reason}
              </Text>
              <Text style={styles.reviewLine}>
                Urgency: {store.referral.urgency}
              </Text>
            </>
          )}
        </ReviewCard>

        {/* Prescriptions */}
        <ReviewCard title="Prescriptions" isEmpty={store.prescriptions.length === 0}>
          {store.prescriptions.map((rx) => (
            <MedicationCard
              key={`${rx.drugName}-${rx.sortOrder}`}
              item={rx}
              onEdit={() => {}}
              onRemove={() => {}}
              readOnly
            />
          ))}
        </ReviewCard>

        {/* Files */}
        <ReviewCard title="Files" isEmpty={attachments.length === 0}>
          <Text style={styles.reviewLine}>
            {attachments.length} file{attachments.length === 1 ? '' : 's'} attached
          </Text>
          {attachments.map((att) => (
            <Text key={att.id} style={styles.reviewLine}>
              {'•'} {att.fileName}
            </Text>
          ))}
        </ReviewCard>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable style={styles.editButton} onPress={handleEdit}>
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
          <Pressable style={styles.finalizeButton} onPress={handleFinalize}>
            <Text style={styles.finalizeButtonText}>Confirm & Finalize</Text>
          </Pressable>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <FollowUpSheet
        visible={showFollowUp}
        onDismiss={() => setShowFollowUp(false)}
        onConfirm={handleConfirmFinalize}
        isSubmitting={isSubmitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  scrollView: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1B1F',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#E65100',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  reviewLine: {
    fontSize: 14,
    color: '#1C1B1F',
    lineHeight: 20,
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  reviewChip: {
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reviewChipText: {
    fontSize: 12,
    color: '#1B5E20',
    fontWeight: '500',
  },
  systemBlock: {
    marginBottom: 8,
  },
  systemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BA1A1A',
    marginBottom: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2E7D32',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#2E7D32',
    fontSize: 15,
    fontWeight: '600',
  },
  finalizeButton: {
    flex: 2,
    backgroundColor: '#2E7D32',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  finalizeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
