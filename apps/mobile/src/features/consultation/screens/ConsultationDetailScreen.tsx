import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import { AddendumSection } from '../components/AddendumSection';
import { ShareOptionsSheet } from '../../pdf/components/ShareOptionsSheet';
import type {
  Consultation,
  VisitType,
  VitalsData,
  SubjectiveData,
  ObjectiveData,
  PlanData,
  ReferralData,
  AddendumEntry,
} from '@breeyo/types';
import { BODY_SYSTEMS } from '@breeyo/types';
import { colors } from '@breeyo/ui';

// ---------- Review Card (read-only, matching ConsultationReviewScreen pattern) ----------

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

// ---------- Helper ----------

function formatDate(dateStr: Date | string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function visitTypeLabel(vt: VisitType): string {
  switch (vt) {
    case 'general':
      return 'General Consultation';
    case 'surgery':
      return 'Surgery';
    case 'vaccination':
      return 'Vaccination';
    default:
      return vt;
  }
}

// ---------- Main Screen ----------

interface ConsultationDetailData extends Consultation {
  vetName?: string;
  petName?: string;
}

export function ConsultationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ consultationId: string }>();
  const { accessToken } = useAuth();

  const [consultation, setConsultation] = useState<ConsultationDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const consultationId = params.consultationId || '';

  const fetchConsultation = useCallback(async () => {
    if (!consultationId || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient<{ data: ConsultationDetailData }>(
        `/api/v1/consultations/${consultationId}`,
        { token: accessToken },
      );
      setConsultation(response.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load consultation';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [consultationId, accessToken]);

  useEffect(() => {
    fetchConsultation();
  }, [fetchConsultation]);

  const handleAddendumAdded = useCallback((entry: AddendumEntry) => {
    setConsultation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        addenda: [...(prev.addenda || []), entry],
      };
    });
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Error state
  if (error || !consultation) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Consultation not found'}</Text>
        <Pressable style={styles.retryButton} onPress={fetchConsultation}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const vitals = consultation.vitals as VitalsData | null;
  const subjective = consultation.subjective as SubjectiveData | null;
  const objective = consultation.objective as ObjectiveData | null;
  const plan = consultation.plan as PlanData | null;
  const referral = consultation.referral as ReferralData | null;

  const hasVitals =
    vitals &&
    (vitals.weightKg !== null ||
      vitals.temperatureC !== null ||
      vitals.heartRateBpm !== null ||
      vitals.respiratoryRate !== null);

  const hasSubjective =
    subjective &&
    ((subjective.ownerReports?.length ?? 0) > 0 ||
      (subjective.history?.length ?? 0) > 0 ||
      (subjective.chips?.length ?? 0) > 0);

  const hasObjective =
    objective &&
    ((objective.bodySystems?.some((s) => s.status === 'abnormal') ?? false) ||
      (objective.notes?.length ?? 0) > 0);

  const hasAssessment = (consultation.assessment?.length ?? 0) > 0;

  const hasPlan =
    plan &&
    ((plan.actionItems?.length ?? 0) > 0 || (plan.freeText?.length ?? 0) > 0);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Finalized Banner */}
        <View style={styles.finalizedBanner}>
          <Text style={styles.finalizedText}>
            Finalized on {formatDate(consultation.finalizedAt)}.{' '}
            Original record cannot be modified.
          </Text>
        </View>

        {/* Visit Info */}
        <View style={styles.visitInfo}>
          <View style={styles.visitInfoRow}>
            <Text style={styles.visitInfoLabel}>Visit Type</Text>
            <Text style={styles.visitInfoValue}>
              {visitTypeLabel(consultation.visitType)}
            </Text>
          </View>
          <View style={styles.visitInfoRow}>
            <Text style={styles.visitInfoLabel}>Date</Text>
            <Text style={styles.visitInfoValue}>
              {formatDate(consultation.startedAt)}
            </Text>
          </View>
          {consultation.vetName ? (
            <View style={styles.visitInfoRow}>
              <Text style={styles.visitInfoLabel}>Veterinarian</Text>
              <Text style={styles.visitInfoValue}>{consultation.vetName}</Text>
            </View>
          ) : null}
          {consultation.durationMinutes ? (
            <View style={styles.visitInfoRow}>
              <Text style={styles.visitInfoLabel}>Duration</Text>
              <Text style={styles.visitInfoValue}>
                {consultation.durationMinutes} min
              </Text>
            </View>
          ) : null}
        </View>

        {/* Vitals */}
        <ReviewCard title="Vitals" isEmpty={!hasVitals}>
          {vitals?.weightKg !== null && vitals?.weightKg !== undefined && (
            <Text style={styles.reviewLine}>Weight: {vitals.weightKg} kg</Text>
          )}
          {vitals?.temperatureC !== null && vitals?.temperatureC !== undefined && (
            <Text style={styles.reviewLine}>
              Temperature: {vitals.temperatureC} {'\u00B0C'}
            </Text>
          )}
          {vitals?.heartRateBpm !== null && vitals?.heartRateBpm !== undefined && (
            <Text style={styles.reviewLine}>
              Heart Rate: {vitals.heartRateBpm} bpm
            </Text>
          )}
          {vitals?.respiratoryRate !== null && vitals?.respiratoryRate !== undefined && (
            <Text style={styles.reviewLine}>
              Respiratory Rate: {vitals.respiratoryRate} breaths/min
            </Text>
          )}
        </ReviewCard>

        {/* Subjective */}
        <ReviewCard title="Subjective" isEmpty={!hasSubjective}>
          {(subjective?.chips?.length ?? 0) > 0 && (
            <View style={styles.chipRow}>
              {subjective!.chips.map((chip) => (
                <View key={chip} style={styles.reviewChip}>
                  <Text style={styles.reviewChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          )}
          {(subjective?.ownerReports?.length ?? 0) > 0 && (
            <Text style={styles.reviewLine}>
              Owner Reports: {subjective!.ownerReports}
            </Text>
          )}
          {(subjective?.history?.length ?? 0) > 0 && (
            <Text style={styles.reviewLine}>
              History: {subjective!.history}
            </Text>
          )}
        </ReviewCard>

        {/* Objective */}
        <ReviewCard title="Objective" isEmpty={!hasObjective}>
          {objective?.bodySystems
            ?.filter((s) => s.status === 'abnormal')
            .map((sys) => {
              const label =
                BODY_SYSTEMS.find((b) => b.id === sys.system)?.label ||
                sys.system;
              return (
                <View key={sys.system} style={styles.systemBlock}>
                  <Text style={styles.systemLabel}>{label}: Abnormal</Text>
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
          {(objective?.notes?.length ?? 0) > 0 && (
            <Text style={styles.reviewLine}>
              Additional Notes: {objective!.notes}
            </Text>
          )}
        </ReviewCard>

        {/* Assessment */}
        <ReviewCard title="Assessment" isEmpty={!hasAssessment}>
          <Text style={styles.reviewLine}>{consultation.assessment}</Text>
        </ReviewCard>

        {/* Plan */}
        <ReviewCard title="Plan" isEmpty={!hasPlan}>
          {(plan?.actionItems?.length ?? 0) > 0 && (
            <View style={styles.chipRow}>
              {plan!.actionItems.map((item) => (
                <View key={item} style={styles.reviewChip}>
                  <Text style={styles.reviewChipText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
          {(plan?.freeText?.length ?? 0) > 0 && (
            <Text style={styles.reviewLine}>{plan!.freeText}</Text>
          )}
        </ReviewCard>

        {/* Care Instructions */}
        <ReviewCard
          title="Care Instructions"
          isEmpty={!consultation.careInstructions}
        >
          <Text style={styles.reviewLine}>{consultation.careInstructions}</Text>
        </ReviewCard>

        {/* Referral */}
        <ReviewCard title="Referral" isEmpty={!referral}>
          {referral && (
            <>
              <Text style={styles.reviewLine}>
                Specialist: {referral.specialistType}
              </Text>
              <Text style={styles.reviewLine}>
                Reason: {referral.reason}
              </Text>
              <Text style={styles.reviewLine}>
                Urgency: {referral.urgency}
              </Text>
            </>
          )}
        </ReviewCard>

        {/* Follow-up */}
        {consultation.followUpDate && (
          <ReviewCard title="Follow-Up" isEmpty={false}>
            <Text style={styles.reviewLine}>
              Date: {formatDate(consultation.followUpDate)}
            </Text>
            {consultation.followUpReason && (
              <Text style={styles.reviewLine}>
                Reason: {consultation.followUpReason}
              </Text>
            )}
          </ReviewCard>
        )}

        {/* Addendum Section */}
        <AddendumSection
          consultationId={consultationId}
          addenda={consultation.addenda || []}
          onAddendumAdded={handleAddendumAdded}
        />

        {/* Share Button */}
        <View style={styles.shareButtonContainer}>
          <Pressable
            style={styles.shareButton}
            onPress={() => setShowShare(true)}
          >
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Share Options Sheet */}
      <ShareOptionsSheet
        visible={showShare}
        consultationId={consultationId}
        visitType={consultation.visitType}
        petId={consultation.petId}
        onClose={() => setShowShare(false)}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
    padding: 32,
  },
  errorText: {
    fontSize: 15,
    color: '#B3261E',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: '#49454F',
  },
  finalizedBanner: {
    backgroundColor: '#E7E0EC',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  finalizedText: {
    fontSize: 13,
    color: '#49454F',
    lineHeight: 18,
  },
  visitInfo: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#F5F0EB',
    borderRadius: 12,
  },
  visitInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  visitInfoLabel: {
    fontSize: 13,
    color: '#49454F',
  },
  visitInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1B1F',
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
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reviewChipText: {
    fontSize: 12,
    color: colors.onPrimaryContainer,
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
  shareButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
  },
  shareButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
