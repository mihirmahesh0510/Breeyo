import React, { useCallback } from 'react';
import { View, ScrollView, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator, Divider } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Card, Button, EmptyState } from '@breeyo/ui';
import type { Pet, Species } from '@breeyo/types';
import { useOwnerDetail } from '../hooks/usePatientProfile';
import { PatientListItem } from '../components/PatientListItem';

/**
 * Format a mobile number for display.
 */
function formatMobile(mobile: string): string {
  const cleaned = mobile.replace(/\s+/g, '');
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    const local = cleaned.slice(3);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return mobile;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text variant="labelSmall" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="bodyLarge">{value}</Text>
    </View>
  );
}

export function OwnerDetailScreen() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const router = useRouter();
  const { data: owner, isLoading, isError, refetch, isFetching } = useOwnerDetail(ownerId ?? '');

  const handleSelectPet = useCallback(
    (petId: string) => {
      router.push(`/(app)/patient/${petId}` as any);
    },
    [router],
  );

  const handleAddPet = useCallback(() => {
    router.push(`/(app)/patient/register?ownerId=${ownerId}` as any);
  }, [router, ownerId]);

  if (isLoading) {
    return (
      <View style={styles.centered} testID="owner-detail-loading">
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Loading owner...
        </Text>
      </View>
    );
  }

  if (isError || !owner) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Owner not found"
          description="This owner could not be loaded. Please try again."
          actionLabel="Go Back"
          onAction={() => router.back()}
          testID="owner-detail-error"
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: owner.name }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
            tintColor="#2E7D32"
          />
        }
        testID="owner-detail-screen"
      >
        {/* Owner Info Card */}
        <View style={styles.section}>
          <Card variant="elevated" testID="owner-info-card">
            <Card.Body>
              <Text variant="headlineMedium" style={styles.ownerName}>
                {owner.name}
              </Text>

              <View style={styles.infoGrid}>
                <InfoField label="MOBILE" value={formatMobile(owner.mobile)} />
                {owner.email && (
                  <InfoField label="EMAIL" value={owner.email} />
                )}
                {owner.altPhone && (
                  <InfoField label="ALT. PHONE" value={formatMobile(owner.altPhone)} />
                )}
                {owner.address && (
                  <InfoField label="ADDRESS" value={owner.address} />
                )}
              </View>
            </Card.Body>
          </Card>
        </View>

        {/* Pets Section */}
        <View style={styles.section}>
          <View style={styles.petsHeader}>
            <Text variant="titleLarge" style={styles.sectionTitle}>
              Pets ({owner.pets.length})
            </Text>
            <Button
              variant="outlined"
              label="Add Pet"
              icon="plus"
              size="small"
              onPress={handleAddPet}
              testID="add-pet-button"
            />
          </View>

          {owner.pets.length === 0 ? (
            <EmptyState
              title="No pets registered"
              description="Add a pet for this owner."
              testID="owner-no-pets"
            />
          ) : (
            <View style={styles.petsList}>
              {owner.pets.map((pet: Pet, index: number) => (
                <React.Fragment key={pet.id}>
                  <PatientListItem
                    petId={pet.id}
                    petName={pet.name}
                    species={pet.species as Species}
                    ownerName={owner.name}
                    onPress={handleSelectPet}
                    testID={`owner-pet-${pet.id}`}
                  />
                  {index < owner.pets.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </View>
          )}
        </View>
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
  ownerName: {
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoField: {
    marginBottom: 4,
  },
  infoLabel: {
    color: '#49454F',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  petsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#1C1B1F',
  },
  petsList: {
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CAC4D0',
    overflow: 'hidden',
  },
});
