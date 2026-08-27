import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Button, EmptyState, colors } from '@breeyo/ui';
import { usePetProfile, useUpdatePet } from '../hooks/usePatientProfile';
import { PetProfileCard } from '../components/PetProfileCard';
import { VisitTimeline } from '../components/VisitTimeline';
import { EditPetForm } from './EditPetForm';
import { PreventiveCareCard } from '../../history/components/PreventiveCareCard';
import { WeightTrendChart } from '../../history/components/WeightTrendChart';
import { MedicalTimeline } from '../../history/components/MedicalTimeline';
import { navigateToConsultationDetail } from '../../../navigation/consultation-navigator';
// D-25, plan 06-18. A separate import line rather than a widening of any above,
// so adding the billing section removes nothing from this Phase 3 file.
import { PetInvoicesTab } from '../../billing/components/PetInvoicesTab';
// WHA-02, plan 07-16. Another separate, additive import line -- wires the
// one reusable send launcher into this Phase 3 screen without restructuring
// it (Pitfall 8: no invoice-detail screen is built here, that stays Phase 6's).
import { SendTemplateLauncher } from '../../whatsapp/components/SendTemplateLauncher';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { ConsultationSummary, PreventiveCareStatus } from '@breeyo/types';

/**
 * Format a date for quick stats display.
 */
function formatQuickDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * WHA-02, plan 07-16: a small, additive read of the same
 * `GET /api/v1/pets/:petId/preventive-care` endpoint `PreventiveCareCard`
 * already calls (its own fetched state is private to that component and not
 * lifted here) -- this gives the `vaccine_due`/`deworming_due` send
 * launchers below real `due_date`/`vaccine_name` variables instead of a
 * fabricated placeholder, without touching `PreventiveCareCard.tsx` itself.
 */
function usePreventiveCareForReminders(petId: string | undefined) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['pets', petId, 'preventive-care'],
    queryFn: () =>
      apiClient<{ data: PreventiveCareStatus }>(`/api/v1/pets/${petId}/preventive-care`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!petId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}

export function PatientDetailScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isFetching } = usePetProfile(petId ?? '');
  const updatePet = useUpdatePet();
  const [isEditing, setIsEditing] = useState(false);
  const preventiveCareQuery = usePreventiveCareForReminders(petId);

  const handleOwnerPress = useCallback(
    (ownerId: string) => {
      router.push(`/(app)/owner/${ownerId}` as any);
    },
    [router],
  );

  const handleSaveEdit = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!petId) return;
      await updatePet.mutateAsync({ petId, updates });
      setIsEditing(false);
    },
    [petId, updatePet],
  );

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered} testID="patient-detail-loading">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Loading patient...
        </Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Patient not found"
          description="This patient could not be loaded. Please try again."
          actionLabel="Go Back"
          onAction={() => router.back()}
          testID="patient-detail-error"
        />
      </View>
    );
  }

  const { pet, owner, visits } = data;

  // Compute quick stats
  const totalVisits = visits.length;
  const lastVisit = visits.length > 0
    ? [...visits].sort(
        (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
      )[0]
    : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: pet.name,
          headerRight: () =>
            !isEditing ? (
              <Button
                variant="text"
                label="Edit"
                onPress={() => setIsEditing(true)}
                testID="edit-pet-button"
              />
            ) : null,
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        testID="patient-detail-screen"
      >
        {isEditing ? (
          <View style={styles.section}>
            <EditPetForm
              pet={pet}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              isSaving={updatePet.isPending}
            />
          </View>
        ) : (
          <>
            {/* Pet Profile Card */}
            <View style={styles.section}>
              <PetProfileCard
                pet={pet}
                owner={owner}
                onOwnerPress={handleOwnerPress}
                testID="pet-profile-card"
              />
            </View>

            {/* Quick Stats */}
            <View style={styles.quickStats}>
              <View style={styles.statItem}>
                <Text variant="headlineMedium" style={styles.statValue}>
                  {totalVisits}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Total Visits
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text variant="bodyLarge" style={styles.statValue}>
                  {lastVisit ? formatQuickDate(lastVisit.checkedInAt) : 'No visits'}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Last Visit
                </Text>
              </View>
            </View>

            {/* Preventive Care */}
            {petId ? (
              <PreventiveCareCard petId={petId} />
            ) : null}

            {/* Weight History */}
            <View style={styles.section}>
              <WeightTrendChart
                data={visits
                  .filter((v: Record<string, unknown>) => v.weightKg != null)
                  .map((v: Record<string, unknown>) => ({
                    date: new Date(v.checkedInAt as string),
                    weightKg: v.weightKg as number,
                  }))}
              />
            </View>

            {/* Medical Timeline */}
            <View style={styles.section}>
              <Text variant="titleLarge" style={styles.sectionTitle}>
                Visit History
              </Text>
              <MedicalTimeline
                consultations={(visits as unknown as ConsultationSummary[])}
                onViewConsultation={(consultationId) => {
                  navigateToConsultationDetail(router, { consultationId });
                }}
              />
            </View>

            {/* Invoices (D-25) */}
            {petId ? (
              <View style={styles.section}>
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  Invoices
                </Text>
                <PetInvoicesTab petId={petId} petName={pet.name} />
              </View>
            ) : null}

            {/* WhatsApp (WHA-02, plan 07-16): the one reusable send launcher,
                wired here for the three reminder templates this screen has
                real data for. Invoice delivery stays Phase 6's launch
                surface (Pitfall 8) -- see SendTemplateLauncher.tsx's own doc
                comment for the exact props Phase 6 passes. */}
            {petId ? (
              <View style={styles.section}>
                <Text variant="titleLarge" style={styles.sectionTitle}>
                  WhatsApp
                </Text>
                <View style={styles.whatsappLaunchers}>
                  <SendTemplateLauncher
                    templateKey="follow_up_reminder"
                    owner={{ id: owner.id, name: owner.name, mobile: owner.mobile }}
                    pet={{ id: pet.id, name: pet.name }}
                    contextType="REMINDER"
                    prefilledVariables={{
                      owner_name: owner.name,
                      pet_name: pet.name,
                      follow_up_date: formatQuickDate(new Date().toISOString()),
                    }}
                    label="Send Follow-up Reminder"
                  />
                  <SendTemplateLauncher
                    templateKey="vaccine_due"
                    owner={{ id: owner.id, name: owner.name, mobile: owner.mobile }}
                    pet={{ id: pet.id, name: pet.name }}
                    contextType="REMINDER"
                    prefilledVariables={{
                      owner_name: owner.name,
                      pet_name: pet.name,
                      vaccine_name: preventiveCareQuery.data?.vaccinationOverdueItems?.[0] ?? 'Vaccination',
                      due_date: preventiveCareQuery.data?.vaccinationNextDue
                        ? formatQuickDate(String(preventiveCareQuery.data.vaccinationNextDue))
                        : formatQuickDate(new Date().toISOString()),
                    }}
                    label="Send Vaccine Due"
                  />
                  <SendTemplateLauncher
                    templateKey="deworming_due"
                    owner={{ id: owner.id, name: owner.name, mobile: owner.mobile }}
                    pet={{ id: pet.id, name: pet.name }}
                    contextType="REMINDER"
                    prefilledVariables={{
                      owner_name: owner.name,
                      pet_name: pet.name,
                      due_date: preventiveCareQuery.data?.dewormingNextDue
                        ? formatQuickDate(String(preventiveCareQuery.data.dewormingNextDue))
                        : formatQuickDate(new Date().toISOString()),
                    }}
                    label="Send Deworming Due"
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  loadingText: {
    marginTop: 12,
    color: '#49454F',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  whatsappLaunchers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 12,
    color: '#1C1B1F',
  },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#F5F0EB',
    borderRadius: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontWeight: '700',
    color: '#1C1B1F',
  },
  statLabel: {
    color: '#49454F',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#CAC4D0',
    marginHorizontal: 16,
  },
});
